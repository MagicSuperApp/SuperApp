// ================================================================
// PhoenixKey — DID-authorized LAMP mint (Rust core)
//
// Build + sign a Cardano tx that MINTS LAMP under the LAMP minting policy,
// authorized by the OrgDID controller key, where the authorization is read
// DYNAMICALLY by the policy from a TAAD anchor UTxO passed as a REFERENCE
// INPUT (CIP-31). The anchor is NOT spent — it stays put as the OrgDID state.
//
// INTERFACE CONTRACT (shared with the LAMP minting policy + the Design-2
// validator — this code MUST honour it byte-for-byte):
//   - The OrgDID has a TAAD anchor UTxO at the Design-2 validator address,
//     holding the State-NFT (policy = validator hash, asset_name = derived
//     from the DID) with an inline `TAADDatum` whose field index 2 is
//     `controller_pkh` (28-byte blake2b_224 of the controller Ed25519 pubkey).
//   - The LAMP minting policy is PARAMETERISED by (anchor_nft_policy,
//     anchor_nft_name). A mint is valid IFF the tx:
//       (a) carries a REFERENCE INPUT holding that exact anchor NFT, AND
//       (b) is signed by `controller_pkh` (present in `extra_signatories`), AND
//       (c) the anchor datum `status == Active`.
//   - The controller key is Ed25519, derived from Master_KEK via
//     `sign::derive_taad_seed` (the SAME single-source-of-truth helper that
//     genesis/rotate use). The fingerprint gate happens in the app layer that
//     unlocks Master_KEK — Rust only receives `master_kek_hex`.
//
// WHY a reference input (first-principles): the anchor encodes a CAPABILITY
// ("this OrgDID may mint LAMP"). Spending it would consume the OrgDID state on
// every mint and force a re-lock; reading it as a reference input lets an
// unbounded number of mints reuse the same on-chain authorization without
// touching it. This is exactly the eUTXO "reference input = read-only oracle"
// pattern (CIP-31), and it keeps each mint a small, cheap, idempotent tx.
//
// SCOPE / WHAT THE CALLER (super-app team) STILL OWNS:
//   - Fetching the anchor UTxO (tx_hash/index/value/datum) + wallet UTxOs +
//     protocol params from a data provider (Blockfrost / LampNet daemon).
//   - The LAMP mint redeemer SHAPE: this builder uses an empty-constr (constr 0,
//     no fields) redeemer as the conventional "Mint" action. If the deployed
//     LAMP policy expects a different redeemer, the caller-facing contract is
//     the `lamp_mint_redeemer` constant below — change it in ONE place.
//   - ExUnits: a conservative static estimate is attached. The submit path MUST
//     evaluate-then-patch (Blockfrost `/utils/txs/evaluate` or ogmios EvaluateTx)
//     before submit — the network rejects a tx whose declared ExUnits are below
//     the real cost. See `LAMP_MINT_EX_UNITS_*`.
//   - Submission + any CID/anchoring side effects.
// ================================================================

use cardano_serialization_lib as csl;
use cardano_serialization_lib::{
    Address, AssetName, BigNum, Int, MultiAsset, Transaction, TransactionHash,
    TransactionInput, TransactionOutputBuilder, TransactionWitnessSet, Value, Vkeywitnesses,
};
use blake2::Digest;
use serde::Deserialize;
use serde_json::Value as JsonValue;
use zeroize::Zeroizing;

use crate::taad_did::{
    build_tx_builder, derive_wallet, extract_coins_per_utxo_size, pick_largest_utxo, UtxoAsset,
    UtxoInput,
};

/// Conservative static ExUnits for the LAMP mint (mem units). The policy is a
/// small all-conjunction check over one reference input + one required signer,
/// so real usage is well under this. Submit paths MUST evaluate-then-patch.
const LAMP_MINT_EX_UNITS_MEM: u64 = 2_000_000;
/// Conservative static ExUnits for the LAMP mint (cpu steps).
const LAMP_MINT_EX_UNITS_STEPS: u64 = 700_000_000;

/// The TAAD anchor UTxO that authorizes the mint, passed by the caller. It is
/// used ONLY as a reference input (read, never spent). The anchor NFT carried
/// here is what the LAMP policy reads to confirm the OrgDID's mint capability.
#[derive(Deserialize, Debug, Clone)]
struct AnchorRefUtxo {
    /// The anchor UTxO outpoint (the OrgDID's TAAD state UTxO at the validator).
    tx_hash: String,
    index: u32,
    /// Lovelace locked in the anchor UTxO. Validated > 0 as a sanity check; the
    /// reference input is added by OUTPOINT only (CSL `add_reference_input`
    /// resolves the value from the node at submit), so it never moves.
    amount_lovelace: u64,
    /// All multi-assets on the anchor UTxO, including the State-NFT. Parsed for
    /// forward-compat + caller symmetry; the reference input is added by
    /// outpoint, so this is not consumed when building the body. The asset-name
    /// binding it expresses (anchor NFT) is read on-chain by the LAMP policy.
    #[serde(default)]
    #[allow(dead_code)]
    assets: Vec<UtxoAsset>,
}

/// The LAMP mint instruction: which asset under the LAMP policy to mint, and
/// how many. `recipient_address` (optional) is where the freshly minted LAMP
/// lands; defaults to the controller's own wallet (change) address when empty.
#[derive(Deserialize, Debug, Clone)]
struct MintInstruction {
    /// LAMP asset name in hex (may be empty for a no-name asset). The LAMP
    /// policy id is derived from `lamp_policy_cbor_hex`, NOT taken from here.
    #[serde(default)]
    asset_name_hex: String,
    /// How many LAMP units to mint (> 0).
    amount: u64,
    /// Optional bech32 recipient for the minted LAMP. Empty / absent → send to
    /// the controller's own wallet address (so the mint is self-custodial).
    #[serde(default)]
    recipient_address: Option<String>,
}

/// Build + sign a DID-authorized LAMP mint tx. Returns hex-encoded signed tx
/// CBOR, or an error string. Submit the CBOR via the caller's data provider.
///
/// # Inputs
/// * `master_kek_hex`       — 32-byte Master_KEK (64 hex). The controller
///   Ed25519 signing key is derived from it via `sign::derive_taad_seed`
///   (single source of truth shared with genesis/rotate); its `blake2b_224`
///   is added as `add_required_signer(controller_pkh)` AND as a vkey witness,
///   satisfying the LAMP policy's `must_be_signed_by(controller_pkh)`.
/// * `anchor_utxo_json`     — JSON [`AnchorRefUtxo`] of the OrgDID's TAAD anchor
///   UTxO. Set as a REFERENCE INPUT (read-only). NOT spent.
/// * `lamp_policy_cbor_hex` — compiled Plutus V3 LAMP minting-policy script
///   (CBOR-wrapped hex from the blueprint). Its hash = the LAMP policy id.
/// * `mint_json`            — JSON [`MintInstruction`] (asset_name_hex, amount,
///   optional recipient_address).
/// * `utxos_json`           — JSON array of [`UtxoInput`] for the WALLET (funds
///   fee + min-ada + collateral). Same shape as the other taad builders.
/// * `protocol_params_json` — Blockfrost `/epochs/latest/parameters` JSON.
/// * `wallet_seed_hex`      — 32-byte CIP-1852 entropy (64 hex) for the payment
///   key that funds the tx + receives change. NOTE: this is the wallet seed, a
///   separate input from `master_kek_hex` (the controller authorization key).
/// * `network`              — 0 = testnet (preprod/preview), 1 = mainnet.
/// * `current_slot`         — Cardano tip slot (TTL = `current_slot + 7200`).
#[allow(clippy::too_many_arguments)]
pub fn build_mint_lamp_via_did(
    master_kek_hex: &str,
    anchor_utxo_json: &str,
    lamp_policy_cbor_hex: &str,
    mint_json: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    wallet_seed_hex: &str,
    network: u8,
    current_slot: u64,
) -> Result<String, String> {
    // ─── 1. Parse + validate inputs ───────────────────────────────
    let kek_bytes = hex::decode(master_kek_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("master_kek_hex is not valid hex: {}", e))?;
    if kek_bytes.len() != 32 {
        return Err("master_kek_hex must decode to 32 bytes (Master_KEK)".into());
    }

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex is not valid hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to 32 bytes".into());
    }
    // Wallet seed — scrubbed on scope exit (D9).
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let anchor: AnchorRefUtxo = serde_json::from_str(anchor_utxo_json)
        .map_err(|e| format!("anchor_utxo_json invalid: {}", e))?;
    if anchor.amount_lovelace == 0 {
        return Err("anchor_utxo_json.amount_lovelace must be > 0".into());
    }

    let mint: MintInstruction = serde_json::from_str(mint_json)
        .map_err(|e| format!("mint_json invalid: {}", e))?;
    if mint.amount == 0 {
        return Err("mint_json.amount must be > 0 (nothing to mint)".into());
    }
    let lamp_asset_name = if mint.asset_name_hex.is_empty() {
        AssetName::new(Vec::new())
            .map_err(|_| "empty LAMP asset name failed (unreachable)".to_string())?
    } else {
        let name_bytes = hex::decode(&mint.asset_name_hex)
            .map_err(|e| format!("mint_json.asset_name_hex not hex: {}", e))?;
        AssetName::new(name_bytes)
            .map_err(|_| "mint_json.asset_name_hex too long (>32 bytes)".to_string())?
    };

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxos_json)
        .map_err(|e| format!("utxos_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — provide ≥1 funded wallet UTxO (fee + collateral)".into());
    }

    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|e| format!("protocol_params_json invalid: {}", e))?;

    // ─── 2. Derive controller (authorization) key from Master_KEK ──
    // Same HKDF as genesis/rotate (`sign::derive_taad_seed`) — single source of
    // truth, so the controller_pkh this mint signs with matches the one baked
    // into the OrgDID's anchor datum (field 2). The LAMP policy reads that
    // controller_pkh from the reference-input datum and requires its signature.
    let taad_seed = crate::sign::derive_taad_seed(&kek_bytes)
        .ok_or_else(|| "derive_taad_seed: Master_KEK must be 32 bytes".to_string())?;
    let controller_priv = csl::PrivateKey::from_normal_bytes(&*taad_seed)
        .map_err(|_| "derived controller seed is not a valid Ed25519 private key".to_string())?;
    let controller_pub = controller_priv.to_public();
    let controller_keyhash = controller_pub.hash();

    // ─── 3. Wallet (funds fee + change + collateral) ──────────────
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network)
        .map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;

    // ─── 4. Fee/funding input (largest wallet UTxO) ───────────────
    let picked = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&picked.tx_hash)
            .map_err(|_| "utxos_json tx_hash not valid 32-byte hex".to_string())?,
        picked.index,
    );
    tb.add_key_input(
        &payment_xprv.to_raw_key().to_public().hash(),
        &fee_input,
        &Value::new(&BigNum::from(picked.amount_lovelace)),
    );

    // ─── 5. Collateral (Plutus mint requires it) ──────────────────
    // Prefer a pure-ADA wallet UTxO; fall back to the largest overall. May
    // coincide with the fee input (CSL allows that).
    // Collateral MUST be pure-ADA (no native assets) — a Plutus collateral input
    // carrying tokens is invalid without a collateral_return, and would risk the
    // tokens on script failure. Error out rather than silently falling back to an
    // asset-bearing UTxO (audit R2). Caller must fund an ADA-only UTxO.
    let collateral_utxo = utxos
        .iter()
        .filter(|u| u.assets.is_empty())
        .max_by_key(|u| u.amount_lovelace)
        .ok_or_else(|| {
            "no pure-ADA UTxO available for collateral — Plutus collateral must \
             contain only ADA (no native assets); fund the wallet with an ADA-only UTxO"
                .to_string()
        })?;
    let collateral_input = TransactionInput::new(
        &TransactionHash::from_hex(&collateral_utxo.tx_hash)
            .map_err(|_| "collateral utxo tx_hash not valid 32-byte hex".to_string())?,
        collateral_utxo.index,
    );
    let mut collateral = csl::TxInputsBuilder::new();
    collateral
        .add_regular_input(
            &wallet_addr_obj,
            &collateral_input,
            &Value::new(&BigNum::from(collateral_utxo.amount_lovelace)),
        )
        .map_err(|e| format!("add collateral input: {:?}", e))?;
    tb.set_collateral(&collateral);

    // ─── 6. Reference input: the OrgDID anchor UTxO (READ, not spent) ─
    // CIP-31. The LAMP policy resolves this reference input, reads the State-NFT
    // + the inline TAADDatum (controller_pkh @ field 2, status @ field 5), and
    // authorizes the mint. We do NOT add it as a spend input — the anchor stays
    // exactly where it is.
    let anchor_input = TransactionInput::new(
        &TransactionHash::from_hex(&anchor.tx_hash)
            .map_err(|_| "anchor_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        anchor.index,
    );
    tb.add_reference_input(&anchor_input);

    // ─── 7. Mint witness: +amount LAMP under the LAMP policy ───────
    // Pre-validate the hex: CSL 13's `from_hex_with_version` PANICS (not Err) on
    // invalid hex chars, so reject non-hex up front to keep the FFI null-safe.
    if hex::decode(lamp_policy_cbor_hex).is_err() {
        return Err("lamp_policy_cbor_hex is not valid Plutus V3 script CBOR hex (bad hex)".to_string());
    }
    let lamp_script = csl::PlutusScript::from_hex_with_version(
        lamp_policy_cbor_hex,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "lamp_policy_cbor_hex is not valid Plutus V3 script CBOR hex".to_string())?;
    let lamp_policy_id = lamp_script.hash();
    let lamp_script_source = csl::PlutusScriptSource::new(&lamp_script);

    // LAMP mint redeemer SHAPE = interface contract with the LAMP policy.
    // Convention: "Mint" action = empty constr (index 0, no fields). If the
    // deployed policy expects a richer redeemer, change ONLY this line.
    let lamp_mint_redeemer_data =
        csl::PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64));

    let ex_units = csl::ExUnits::new(
        &BigNum::from(LAMP_MINT_EX_UNITS_MEM),
        &BigNum::from(LAMP_MINT_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &lamp_mint_redeemer_data,
        &ex_units,
    );
    let mint_witness = csl::MintWitness::new_plutus_script(&lamp_script_source, &mint_redeemer);

    let mut mint_builder = csl::MintBuilder::new();
    mint_builder
        .add_asset(
            &mint_witness,
            &lamp_asset_name,
            &Int::new(&BigNum::from(mint.amount)),
        )
        .map_err(|e| format!("mint_builder.add_asset: {:?}", e))?;
    tb.set_mint_builder(&mint_builder);

    // ─── 8. Output: the minted LAMP to the recipient (or self) ─────
    // min-ada recomputed WITH the LAMP asset present.
    let mut lamp_ma = MultiAsset::new();
    lamp_ma.set_asset(&lamp_policy_id, &lamp_asset_name, &BigNum::from(mint.amount));

    let recipient_addr_obj = match mint.recipient_address.as_deref() {
        Some(a) if !a.is_empty() => Address::from_bech32(a)
            .map_err(|_| "mint_json.recipient_address is not a valid bech32 address".to_string())?,
        _ => wallet_addr_obj.clone(), // self-custodial default
    };

    let lamp_output = TransactionOutputBuilder::new()
        .with_address(&recipient_addr_obj)
        .next()
        .map_err(|e| format!("LAMP output builder.next: {:?}", e))?
        .with_asset_and_min_required_coin_by_utxo_cost(
            &lamp_ma,
            &csl::DataCost::new_coins_per_byte(&BigNum::from(extract_coins_per_utxo_size(&params)?)),
        )
        .map_err(|e| format!("LAMP output min-ada calc: {:?}", e))?
        .build()
        .map_err(|e| format!("LAMP output build: {:?}", e))?;
    tb.add_output(&lamp_output)
        .map_err(|e| format!("add_output failed: {:?}", e))?;

    // ─── 9. must_be_signed_by(controller_pkh) ─────────────────────
    // Declare the controller as a required signer so it lands in
    // extra_signatories AND fee/size accounting reserves room for the witness.
    tb.add_required_signer(&controller_keyhash);

    tb.set_ttl_bignum(&BigNum::from(current_slot + 7200));

    // ─── 10. Bind cost model + redeemer to body BEFORE change ──────
    // The Plutus V3 cost model + the mint redeemer drive the script_data_hash;
    // bind it before add_change_if_needed so the fee covers that 32-byte field.
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;

    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 11. build_tx (folds plutus script + mint redeemer) + sign ─
    // build_tx assembles the body + the builder-side witness set (LAMP script,
    // mint redeemer). We then add the two vkey witnesses: the wallet payment
    // key (fee input) and the controller key (must_be_signed_by authorization).
    let tx = tb.build_tx().map_err(|e| format!("build_tx: {:?}", e))?;

    let body = tx.body();
    // Tx id = BLAKE2b-256 of the canonical body CBOR (same rule as the other
    // taad builders; matches the ledger's tx-hash derivation).
    let mut h = crate::taad_did::Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses: TransactionWitnessSet = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &controller_priv));
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

// ─── TESTS ─────────────────────────────────────────────────────────
//
// Mock fixtures: the LAMP policy + the OrgDID anchor are not yet deployed, so
// the tests use a MINIMAL valid Plutus V3 script as a stand-in LAMP policy, a
// mock anchor UTxO, and mock wallet UTxOs. The assertions check the TX SHAPE
// the LAMP policy + Design-2 validator depend on (reference input present,
// required signer = controller, mint present, plutus witness present) — not the
// on-chain validation result (which needs the real deployed policy).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::taad_did::derive_taad_script_address;

    /// Minimal valid Plutus V3 script (CBOR byte-string wrapper). CSL parses the
    /// wrapper + tags it V3; the LAMP policy id ≡ its script hash. Same fixture
    /// the existing create/rotate tests use, so it is known-parseable by CSL.
    const MOCK_LAMP_POLICY_CBOR: &str = "4e4d01000033222220051200120011";

    /// A second minimal V3 script used as the (distinct) DESIGN-2 validator, so
    /// the anchor NFT's policy id differs from the LAMP policy id — matching the
    /// real layout (anchor NFT policy = validator hash ≠ LAMP policy).
    const MOCK_VALIDATOR_CBOR: &str = "4e4d010000332222200512001200ff";

    fn mock_params() -> &'static str {
        r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#
    }

    /// Build a mock anchor UTxO JSON carrying the State-NFT (policy = the mock
    /// validator hash, asset_name = some derived bytes). amount/index are mock.
    fn mock_anchor_json() -> String {
        let (_addr, validator_hash) =
            derive_taad_script_address(MOCK_VALIDATOR_CBOR, 0).unwrap();
        let policy_hex = hex::encode(validator_hash.to_bytes());
        // asset_name = a 32-byte mock "derived from DID" value.
        let asset_name_hex = "ab".repeat(32);
        format!(
            r#"{{
                "tx_hash": "1111111111111111111111111111111111111111111111111111111111111111",
                "index": 0,
                "amount_lovelace": 2000000,
                "assets": [
                    {{"policy_id": "{}", "asset_name_hex": "{}", "quantity": 1}}
                ]
            }}"#,
            policy_hex, asset_name_hex
        )
    }

    /// One funded, asset-free wallet UTxO (serves fee + collateral).
    fn mock_wallet_utxos() -> &'static str {
        r#"[
            {"tx_hash": "5555555555555555555555555555555555555555555555555555555555555555",
             "index": 1, "amount_lovelace": 10000000}
        ]"#
    }

    /// Happy path: build a DID-authorized LAMP mint and assert the tx SHAPE the
    /// LAMP policy + Design-2 validator depend on.
    #[test]
    fn mint_lamp_via_did_builds_signed_tx_with_ref_input_and_required_signer() {
        let master_kek = "7a".repeat(32);
        let wallet_seed = "34".repeat(32);
        let mint_json = r#"{"asset_name_hex": "4c414d50", "amount": 1000000}"#; // "LAMP" + 1e6

        let tx_hex = build_mint_lamp_via_did(
            &master_kek,
            &mock_anchor_json(),
            MOCK_LAMP_POLICY_CBOR,
            mint_json,
            mock_wallet_utxos(),
            mock_params(),
            &wallet_seed,
            0, // preprod
            2000,
        )
        .expect("DID-authorized LAMP mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).expect("output must be valid tx CBOR");
        let body = tx.body();
        let wit = tx.witness_set();

        // (a) REFERENCE INPUT present = the OrgDID anchor, and it is NOT spent
        // (it must not appear among the regular spend inputs).
        let ref_inputs = body
            .reference_inputs()
            .expect("reference_inputs must be set (the OrgDID anchor)");
        assert_eq!(ref_inputs.len(), 1, "exactly one reference input (the anchor)");
        let ref_in = ref_inputs.get(0);
        assert_eq!(
            hex::encode(ref_in.transaction_id().to_bytes()),
            "1111111111111111111111111111111111111111111111111111111111111111",
            "reference input must be the anchor outpoint"
        );
        // Anchor must NOT be among the spend inputs.
        let spend_inputs = body.inputs();
        for i in 0..spend_inputs.len() {
            assert_ne!(
                hex::encode(spend_inputs.get(i).transaction_id().to_bytes()),
                "1111111111111111111111111111111111111111111111111111111111111111",
                "anchor must be READ (reference), never SPENT"
            );
        }

        // (b) MINT present: +1e6 LAMP under the LAMP policy (= lamp script hash).
        let lamp_script = csl::PlutusScript::from_hex_with_version(
            MOCK_LAMP_POLICY_CBOR,
            &csl::Language::new_plutus_v3(),
        )
        .unwrap();
        let lamp_policy_id = lamp_script.hash();
        let mint = body.mint().expect("mint field set on body");
        let mints_assets = mint
            .get(&lamp_policy_id)
            .expect("mint has an entry for the LAMP policy");
        let expected_name = AssetName::new(hex::decode("4c414d50").unwrap()).unwrap();
        let mut total: i128 = 0;
        for i in 0..mints_assets.len() {
            let ma = mints_assets.get(i).unwrap();
            if let Some(v) = ma.get(&expected_name) {
                total += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(total, 1_000_000, "exactly +1e6 LAMP minted under the policy");

        // (c) Plutus mint witness present.
        let scripts = wit.plutus_scripts().expect("plutus script present");
        assert_eq!(scripts.len(), 1, "exactly one Plutus script (the LAMP policy)");
        let redeemers = wit.redeemers().expect("redeemers present");
        assert_eq!(redeemers.len(), 1, "exactly one mint redeemer");
        assert_eq!(
            redeemers.get(0).tag(),
            csl::RedeemerTag::new_mint(),
            "the redeemer is a MINT redeemer"
        );

        // (d) REQUIRED SIGNER == controller_pkh (= blake2b_224(controller pubkey)
        // derived from Master_KEK via the SAME helper genesis/rotate use).
        let taad_seed = crate::sign::derive_taad_seed(
            &hex::decode(&master_kek).unwrap(),
        )
        .unwrap();
        let controller_pkh = csl::PrivateKey::from_normal_bytes(&*taad_seed)
            .unwrap()
            .to_public()
            .hash();
        let req = body.required_signers().expect("required_signers set");
        assert_eq!(req.len(), 1, "controller declared as required signer");
        assert_eq!(
            req.get(0).to_bytes(),
            controller_pkh.to_bytes(),
            "required signer must equal controller_pkh derived from Master_KEK"
        );

        // (e) Two vkey witnesses: wallet payment key + controller key.
        let vkeys = wit.vkeys().expect("vkey witnesses present");
        assert_eq!(vkeys.len(), 2, "wallet + controller signatures");

        // (f) script_data_hash bound (mandatory for a Plutus tx).
        assert!(
            body.script_data_hash().is_some(),
            "script_data_hash must be set for a Plutus tx"
        );
    }

    /// amount == 0 is rejected (nothing to mint).
    #[test]
    fn mint_lamp_rejects_zero_amount() {
        let err = build_mint_lamp_via_did(
            &"7a".repeat(32),
            &mock_anchor_json(),
            MOCK_LAMP_POLICY_CBOR,
            r#"{"asset_name_hex": "4c414d50", "amount": 0}"#,
            mock_wallet_utxos(),
            mock_params(),
            &"34".repeat(32),
            0,
            2000,
        )
        .expect_err("zero amount must be rejected");
        assert!(err.contains("amount must be > 0"), "got: {err}");
    }

    /// A bad LAMP policy CBOR is a hard error (cannot derive a policy id).
    #[test]
    fn mint_lamp_rejects_bad_policy_cbor() {
        let err = build_mint_lamp_via_did(
            &"7a".repeat(32),
            &mock_anchor_json(),
            "zznothex",
            r#"{"asset_name_hex": "4c414d50", "amount": 1000}"#,
            mock_wallet_utxos(),
            mock_params(),
            &"34".repeat(32),
            0,
            2000,
        )
        .expect_err("bad policy cbor must be rejected");
        assert!(err.contains("Plutus V3 script CBOR"), "got: {err}");
    }

    /// An empty wallet UTxO list is rejected (no fee / collateral).
    #[test]
    fn mint_lamp_rejects_empty_wallet_utxos() {
        let err = build_mint_lamp_via_did(
            &"7a".repeat(32),
            &mock_anchor_json(),
            MOCK_LAMP_POLICY_CBOR,
            r#"{"asset_name_hex": "4c414d50", "amount": 1000}"#,
            "[]",
            mock_params(),
            &"34".repeat(32),
            0,
            2000,
        )
        .expect_err("empty wallet utxos must be rejected");
        assert!(err.contains("utxos_json is empty"), "got: {err}");
    }
}
