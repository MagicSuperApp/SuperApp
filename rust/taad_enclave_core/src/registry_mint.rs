// ================================================================
// PhoenixKey — Mint-Authority Registry (do DID quản) — offchain builders
//
// Một "Registry" là một UTxO ở địa chỉ validator registry, mang đúng MỘT
// Registry-NFT (policy ≡ registry script hash, name = blake2b_256(governing_did))
// và một inline `RegistryDatum` liệt kê bảng AUTHORIZATION: với mỗi `action_tag`,
// ai (pkh đơn / multisig M-of-N) được phép mint token mang tag đó. Registry do
// controller của `governing_did` (DID Org/Service) quản trị: mọi cập nhật bảng
// authorization phải có CHỮ KÝ controller, chứng minh bằng REFERENCE input là DID
// anchor (TAAD NFT) của chính governing_did.
//
// BA builder trong file này (khớp ĐÚNG validator Aiken đang xây song song):
//   1. build_deploy_mint_registry  — MINT Registry-NFT one-shot (bound vào một
//      genesis OutputReference) + khoá RegistryDatum ở addr script. Controller
//      của governing_did ký để chứng minh chủ ý khởi tạo.
//   2. build_update_mint_registry  — SPEND Registry UTxO, đặt DID anchor làm
//      REFERENCE input, controller ký (add_required_signer), continuing output
//      giữ Registry-NFT + datum entries MỚI.
//   3. build_mint_via_registry     — MINT token qua token policy
//      `did_token_mint(...)`: Registry UTxO làm REFERENCE input; authorization của
//      action_tag thoả (SinglePkh→1 sig; MultiSig→M-of-N sig) + đúng asset-name.
//
// ENCODING (điểm khớp sống-còn với Aiken — positional CBOR, constr index chuẩn):
//   RegistryDatum = Constr 0 [ governing_did: Bytes(UTF-8), entries: List<Entry> ]
//   Entry         = Constr 0 [ action_tag: Bytes, authorization: Authorization ]
//   Authorization:
//     SinglePkh(pkh)            = Constr 0 [ Bytes(28) ]
//     MultiSig{pkhs,threshold}  = Constr 1 [ List<Bytes(28)>, Int ]
//     Revoked                   = Constr 2 [ ]
//   Registry-NFT: policy ≡ registry script hash; name = blake2b_256(governing_did).
//
// SCOPE / phần CALLER (super-app) vẫn nắm: fetch UTxO (registry/anchor/wallet),
// protocol params, evaluate-then-patch ExUnits trước submit, và submit. Collateral
// PURE-ADA (như mint_lamp đã vá audit R2). KHÔNG log/persist secret ở tầng này.
// ================================================================

use cardano_serialization_lib as csl;
use cardano_serialization_lib::{
    Address, AssetName, BigNum, ConstrPlutusData, Int, MultiAsset, PlutusData, PlutusList,
    ScriptHash, Transaction, TransactionHash, TransactionInput, TransactionOutputBuilder,
    TransactionWitnessSet, Value, Vkeywitnesses,
};
use serde::Deserialize;
use serde_json::Value as JsonValue;
use zeroize::Zeroizing;

use crate::taad_did::{
    build_tx_builder, derive_taad_script_address, derive_wallet, extract_coins_per_utxo_size,
    pick_largest_utxo, Blake2b256, UtxoAsset, UtxoInput,
};
use blake2::Digest;

/// Conservative static ExUnits (mem) for registry ops — small all-conjunction
/// predicates. Submit paths MUST evaluate-then-patch.
const REGISTRY_EX_UNITS_MEM: u64 = 2_000_000;
/// Conservative static ExUnits (cpu steps) for registry ops.
const REGISTRY_EX_UNITS_STEPS: u64 = 700_000_000;

// ─── Authorization / Entry — JSON shapes the caller passes in ──────
//
// `initial_entries_json` / `new_entries_json` is a JSON array of EntryJson.
// EntryJson.authorization kind is tagged: "single" | "multisig" | "revoked".

/// One authorization spec as supplied by the caller (JSON). The `kind` discriminates
/// which `Authorization` constructor to encode. We accept hex pkhs (28 bytes each).
#[derive(Deserialize, Debug, Clone)]
struct AuthorizationJson {
    /// "single" | "multisig" | "revoked".
    kind: String,
    /// SinglePkh: the single controller pkh (28-byte hex). Required for "single".
    #[serde(default)]
    pkh: Option<String>,
    /// MultiSig: the list of authorised pkhs (each 28-byte hex). Required for "multisig".
    #[serde(default)]
    pkhs: Option<Vec<String>>,
    /// MultiSig: the M threshold (1..=N). Required for "multisig".
    #[serde(default)]
    threshold: Option<u64>,
}

/// One registry entry as supplied by the caller (JSON): an action_tag (hex bytes)
/// → authorization binding.
#[derive(Deserialize, Debug, Clone)]
struct EntryJson {
    /// action_tag bytes, hex-encoded (arbitrary length; identifies the token class).
    action_tag_hex: String,
    authorization: AuthorizationJson,
}

/// Parse one 28-byte pkh from hex.
fn parse_pkh(hex_str: &str) -> Result<Vec<u8>, String> {
    let b = hex::decode(hex_str).map_err(|e| format!("pkh not valid hex: {}", e))?;
    if b.len() != 28 {
        return Err(format!("pkh must decode to 28 bytes (VerificationKeyHash), got {}", b.len()));
    }
    Ok(b)
}

// ─── ENCODERS — the byte-for-byte interface contract with Aiken ────

/// Encode an [`AuthorizationJson`] into the on-chain `Authorization` PlutusData.
///
/// SinglePkh(pkh)           = Constr 0 [ Bytes(28) ]
/// MultiSig{pkhs,threshold} = Constr 1 [ List<Bytes(28)>, Int ]
/// Revoked                  = Constr 2 [ ]
///
/// Returns the encoded data AND the flat list of pkhs that must sign for THIS
/// authorization to be satisfied (empty for Revoked) — used by the mint builder to
/// add the right required signers. `threshold` is also returned so the mint
/// builder can validate it has enough signing keys (M-of-N) before building a
/// tx the validator would reject.
fn encode_authorization(a: &AuthorizationJson) -> Result<(PlutusData, Vec<Vec<u8>>, u64), String> {
    match a.kind.as_str() {
        "single" => {
            let pkh = a
                .pkh
                .as_deref()
                .ok_or_else(|| "authorization kind 'single' requires field 'pkh'".to_string())?;
            let pkh_bytes = parse_pkh(pkh)?;
            let mut fields = PlutusList::new();
            fields.add(&PlutusData::new_bytes(pkh_bytes.clone()));
            let data = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
                &BigNum::from(0u64),
                &fields,
            ));
            Ok((data, vec![pkh_bytes], 1))
        }
        "multisig" => {
            let pkhs = a
                .pkhs
                .as_ref()
                .ok_or_else(|| "authorization kind 'multisig' requires field 'pkhs'".to_string())?;
            if pkhs.is_empty() {
                return Err("multisig 'pkhs' must be non-empty".into());
            }
            let threshold = a
                .threshold
                .ok_or_else(|| "authorization kind 'multisig' requires field 'threshold'".to_string())?;
            if threshold == 0 || threshold as usize > pkhs.len() {
                return Err(format!(
                    "multisig threshold must be 1..=N (N={}), got {}",
                    pkhs.len(),
                    threshold
                ));
            }
            let mut pkh_list = PlutusList::new();
            let mut parsed: Vec<Vec<u8>> = Vec::with_capacity(pkhs.len());
            for p in pkhs {
                let b = parse_pkh(p)?;
                pkh_list.add(&PlutusData::new_bytes(b.clone()));
                parsed.push(b);
            }
            let mut fields = PlutusList::new();
            fields.add(&PlutusData::new_list(&pkh_list));
            // Int field: CSL 13 BigInt has no From<u64>; build via from_str like
            // the existing taad_did encoders (single source-of-truth style).
            let thr_int = csl::BigInt::from_str(&threshold.to_string())
                .map_err(|_| "multisig threshold BigInt::from_str failed (unreachable)".to_string())?;
            fields.add(&PlutusData::new_integer(&thr_int));
            let data = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
                &BigNum::from(1u64),
                &fields,
            ));
            Ok((data, parsed, threshold))
        }
        "revoked" => {
            let data = PlutusData::new_empty_constr_plutus_data(&BigNum::from(2u64));
            Ok((data, Vec::new(), 0))
        }
        other => Err(format!(
            "unknown authorization kind '{}' (expected single|multisig|revoked)",
            other
        )),
    }
}

/// Encode the full `RegistryDatum`:
///   Constr 0 [ governing_did: Bytes(UTF-8), entries: List<Entry> ]
/// where Entry = Constr 0 [ action_tag: Bytes, authorization: Authorization ].
fn encode_registry_datum(governing_did: &str, entries: &[EntryJson]) -> Result<PlutusData, String> {
    let mut entry_list = PlutusList::new();
    for e in entries {
        let tag_bytes = hex::decode(&e.action_tag_hex)
            .map_err(|err| format!("entry action_tag_hex not valid hex: {}", err))?;
        let (authz_data, _, _) = encode_authorization(&e.authorization)?;
        let mut entry_fields = PlutusList::new();
        entry_fields.add(&PlutusData::new_bytes(tag_bytes));
        entry_fields.add(&authz_data);
        let entry_data = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
            &BigNum::from(0u64),
            &entry_fields,
        ));
        entry_list.add(&entry_data);
    }

    let mut fields = PlutusList::new();
    // 0: governing_did (UTF-8 bytes of the did string).
    fields.add(&PlutusData::new_bytes(governing_did.as_bytes().to_vec()));
    // 1: entries (List<Entry>).
    fields.add(&PlutusData::new_list(&entry_list));

    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    )))
}

// ─── SupplyState (cap LAMP) — datum + redeemer encoders ────────────
//
// Hợp đồng CBOR khớp `magiclamp/tokenomics/supply.ak`:
//   SupplyStateDatum   = Constr 0 [ minted_total: Int,
//                                    lamp_policy: Bytes(28),
//                                    lamp_asset_name: Bytes ]
//   SupplyStateNft     = MintSupplyState  → enum 1 biến thể → Constr 0 [] (genesis mint redeemer)
//   SupplyStateRedeemer = CountMint       → enum 1 biến thể → Constr 0 [] (spend redeemer)
// Thứ tự field datum: minted_total, lamp_policy, lamp_asset_name (2 field token-được-đếm
// chèn CUỐI — xem header supply.ak về phá-vòng-phụ-thuộc-hash).

/// Encode `SupplyStateDatum{minted_total, lamp_policy, lamp_asset_name}` (Constr 0).
/// `lamp_policy_hex` = 28-byte policy-id hex (= did_token_mint hash); `lamp_asset_name`
/// = raw asset-name bytes (AssetName, ≤32 byte). `minted_total` raw-unit oil.
fn encode_supply_state_datum(
    minted_total: u64,
    lamp_policy_hex: &str,
    lamp_asset_name: &AssetName,
) -> Result<PlutusData, String> {
    let policy_bytes = hex::decode(lamp_policy_hex)
        .map_err(|e| format!("lamp_policy not valid hex: {}", e))?;
    if policy_bytes.len() != 28 {
        return Err(format!(
            "lamp_policy must decode to 28 bytes (PolicyId), got {}",
            policy_bytes.len()
        ));
    }
    let total_int = csl::BigInt::from_str(&minted_total.to_string())
        .map_err(|_| "minted_total BigInt::from_str failed (unreachable)".to_string())?;

    let mut fields = PlutusList::new();
    // 0: minted_total (Int).
    fields.add(&PlutusData::new_integer(&total_int));
    // 1: lamp_policy (Bytes 28).
    fields.add(&PlutusData::new_bytes(policy_bytes));
    // 2: lamp_asset_name (Bytes) — raw name bytes (AssetName::name() strips the
    // CBOR wrapper, giving the on-chain asset-name bytes the validator compares).
    fields.add(&PlutusData::new_bytes(lamp_asset_name.name()));

    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    )))
}

/// SupplyState mint redeemer (`SupplyStateNft::MintSupplyState`) — enum 1 biến thể
/// → empty Constr 0. (genesis NFT mint)
fn supply_state_mint_redeemer_data() -> PlutusData {
    PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))
}

/// SupplyState spend redeemer (`SupplyStateRedeemer::CountMint`) — enum 1 biến thể
/// → empty Constr 0. (đếm mint qua bộ đếm)
fn supply_state_spend_redeemer_data() -> PlutusData {
    PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))
}

/// Registry-NFT asset name = blake2b_256(governing_did) (same A-1 binding the
/// TAAD anchor NFT uses for a DID).
fn registry_nft_asset_name(governing_did: &str) -> Result<AssetName, String> {
    let mut h = Blake2b256::new();
    h.update(governing_did.as_bytes());
    let name_bytes = h.finalize();
    AssetName::new(name_bytes.to_vec())
        .map_err(|_| "registry_nft_asset_name: AssetName::new failed (unreachable, 32 bytes)".into())
}

/// Derive the controller signing key (Ed25519) from a controller Master_KEK via
/// the SAME single-source-of-truth helper genesis/rotate/mint use. Returns the
/// private key + its 28-byte keyhash (controller_pkh).
fn derive_controller(
    controller_kek_hex: &str,
) -> Result<(csl::PrivateKey, csl::Ed25519KeyHash), String> {
    let kek_bytes = hex::decode(controller_kek_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("controller_kek is not valid hex: {}", e))?;
    if kek_bytes.len() != 32 {
        return Err("controller_kek must decode to 32 bytes (Master_KEK)".into());
    }
    let seed = crate::sign::derive_taad_seed(&kek_bytes)
        .ok_or_else(|| "derive_taad_seed: controller Master_KEK must be 32 bytes".to_string())?;
    let priv_key = csl::PrivateKey::from_normal_bytes(&*seed)
        .map_err(|_| "derived controller seed is not a valid Ed25519 private key".to_string())?;
    let keyhash = priv_key.to_public().hash();
    Ok((priv_key, keyhash))
}

// ─── Shared UTxO-ref shapes ────────────────────────────────────────

/// A script UTxO to be REFERENCED (read, never spent) — the DID anchor or the
/// registry. Only the outpoint is needed for `add_reference_input`; the assets
/// are parsed for caller symmetry + forward-compat.
#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
struct RefUtxo {
    tx_hash: String,
    index: u32,
    #[serde(default)]
    amount_lovelace: u64,
    #[serde(default)]
    assets: Vec<UtxoAsset>,
}

/// The registry UTxO being SPENT (update path): outpoint + value (lovelace +
/// the Registry-NFT) so the continuing output preserves it. `inline_datum_hex`
/// is optional (the new datum is rebuilt from `new_entries_json`, not the old).
#[derive(Deserialize, Debug, Clone)]
struct RegistrySpendUtxo {
    tx_hash: String,
    index: u32,
    amount_lovelace: u64,
    /// All multi-asset entries currently in the registry UTxO (must include the
    /// Registry-NFT). Preserved on the continuing output (value preservation).
    #[serde(default)]
    assets: Vec<UtxoAsset>,
}

/// The genesis UTxO that the one-shot Registry-NFT policy is bound to. It MUST
/// be SPENT in the deploy tx so the policy's one-shot check (output ref consumed)
/// passes — guaranteeing the Registry-NFT can be minted exactly once.
#[derive(Deserialize, Debug, Clone)]
struct GenesisUtxo {
    tx_hash: String,
    index: u32,
    amount_lovelace: u64,
    #[serde(default)]
    assets: Vec<UtxoAsset>,
}

/// The SupplyState UTxO being SPENT (cap path of `build_mint_via_registry`):
/// outpoint + value (lovelace + the SupplyState NFT) + the OLD inline datum so
/// the builder can read `minted_total` and recompute `minted_total'`. The
/// continuing output preserves the same value (NFT) at the supply_state script
/// address with the bumped datum.
#[derive(Deserialize, Debug, Clone)]
struct SupplyStateSpendUtxo {
    tx_hash: String,
    index: u32,
    amount_lovelace: u64,
    /// All multi-asset entries currently in the SupplyState UTxO (must include the
    /// SupplyState NFT). Preserved on the continuing output (value preservation).
    #[serde(default)]
    assets: Vec<UtxoAsset>,
    /// SupplyState NFT policy-id hex (= supply_state script hash). Identifies the
    /// NFT within `assets` so the builder can rebuild the canonical continuing value.
    supply_state_nft_policy_hex: String,
    /// SupplyState NFT asset-name hex (e.g. hex of "LAMP-SUPPLY").
    supply_state_nft_name_hex: String,
    /// Current `minted_total` (raw-unit oil) read from the OLD inline datum.
    minted_total: u64,
    /// Token-được-đếm policy-id hex baked into the datum (= did_token_mint hash).
    /// Preserved UNCHANGED on the continuing datum (validator s8).
    lamp_policy_hex: String,
    /// Token-được-đếm asset-name hex baked into the datum. Preserved unchanged.
    #[serde(default)]
    lamp_asset_name_hex: String,
}

/// The mint instruction for `build_mint_via_registry`.
#[derive(Deserialize, Debug, Clone)]
struct TokenMintInstruction {
    /// Token asset name in hex (may be empty for a no-name asset). Must match the
    /// `token_asset_name` baked into the token policy params on-chain.
    #[serde(default)]
    asset_name_hex: String,
    amount: u64,
    #[serde(default)]
    recipient: Option<String>,
}

/// Reconstruct a `Value` (lovelace + multi-asset) from amount + parsed assets.
fn rebuild_value(amount_lovelace: u64, assets: &[UtxoAsset]) -> Result<Value, String> {
    if assets.is_empty() {
        return Ok(Value::new(&BigNum::from(amount_lovelace)));
    }
    let mut ma = MultiAsset::new();
    for a in assets {
        let policy_bytes = hex::decode(&a.policy_id)
            .map_err(|_| "asset policy_id not hex".to_string())?;
        let policy = ScriptHash::from_bytes(policy_bytes)
            .map_err(|_| "asset policy_id not 28-byte hash".to_string())?;
        let name_bytes = hex::decode(&a.asset_name_hex)
            .map_err(|_| "asset asset_name_hex not hex".to_string())?;
        let name = AssetName::new(name_bytes)
            .map_err(|_| "asset asset_name_hex too long (>32 bytes)".to_string())?;
        ma.set_asset(&policy, &name, &BigNum::from(a.quantity));
    }
    Ok(Value::new_with_assets(&BigNum::from(amount_lovelace), &ma))
}

// ═══════════════════════════════════════════════════════════════════
// 1. DEPLOY — mint Registry-NFT (one-shot) + lock RegistryDatum
// ═══════════════════════════════════════════════════════════════════

/// Build + sign the registry deploy tx. MINTS the Registry-NFT (one-shot, bound
/// to `genesis_utxo`) under the registry script policy and locks a fresh
/// `RegistryDatum{governing_did, entries}` at the registry script address.
///
/// WHO SIGNS: the controller of `governing_did` (derived from `controller_kek`).
/// The genesis UTxO is SPENT (consumed) to satisfy the one-shot policy. The
/// controller signature proves intent to create the registry for this DID. If
/// the deployed registry policy does not require a controller signature for the
/// genesis arm, the extra signer is harmless (it is the wallet's own intent).
///
/// # Inputs
/// * `controller_kek`        — 32-byte Master_KEK (64 hex) of governing_did's
///   controller; the Ed25519 signing key is derived via `sign::derive_taad_seed`.
/// * `governing_did`         — the DID this registry is governed by (UTF-8). Baked
///   into the datum field 0 AND drives the Registry-NFT name (blake2b_256(did)).
/// * `genesis_utxo_json`     — JSON [`GenesisUtxo`]: the outpoint the one-shot
///   policy is bound to. SPENT in this tx.
/// * `initial_entries_json`  — JSON array of [`EntryJson`] (may be `[]` for an
///   empty initial authority table).
/// * `registry_script_cbor`  — compiled Plutus V3 registry script (CBOR hex). Its
///   hash = the registry script address AND the Registry-NFT policy id.
/// * `utxos_json`            — JSON array of [`UtxoInput`] for the WALLET (fee +
///   collateral; collateral must be pure-ADA).
/// * `params_json`           — Blockfrost `/epochs/latest/parameters` JSON.
/// * `wallet_seed_hex`       — 32-byte CIP-1852 entropy for fee/change.
/// * `network`               — 0=preprod, 1=mainnet, 2=preview.
/// * `slot`                  — tip slot (TTL = slot + 7200).
#[allow(clippy::too_many_arguments)]
pub fn build_deploy_mint_registry(
    controller_kek: &str,
    governing_did: &str,
    genesis_utxo_json: &str,
    initial_entries_json: &str,
    registry_script_cbor: &str,
    utxos_json: &str,
    params_json: &str,
    wallet_seed_hex: &str,
    network: u8,
    slot: u64,
) -> Result<String, String> {
    // ─── 1. Parse + validate ──────────────────────────────────────
    if governing_did.is_empty() {
        return Err("governing_did must not be empty".into());
    }
    let (controller_priv, controller_keyhash) = derive_controller(controller_kek)?;

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex is not valid hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to 32 bytes".into());
    }
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let genesis: GenesisUtxo = serde_json::from_str(genesis_utxo_json)
        .map_err(|e| format!("genesis_utxo_json invalid: {}", e))?;
    if genesis.amount_lovelace == 0 {
        return Err("genesis_utxo_json.amount_lovelace must be > 0".into());
    }

    let entries: Vec<EntryJson> = serde_json::from_str(initial_entries_json)
        .map_err(|e| format!("initial_entries_json invalid: {}", e))?;

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxos_json)
        .map_err(|e| format!("utxos_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — provide ≥1 funded wallet UTxO (fee + collateral)".into());
    }

    let params: JsonValue = serde_json::from_str(params_json)
        .map_err(|e| format!("params_json invalid: {}", e))?;

    // ─── 2. Registry script addr + hash; Registry-NFT name/policy ──
    let (script_addr, script_hash) =
        derive_taad_script_address(registry_script_cbor, network).map_err(|e| e.to_string())?;
    let asset_name = registry_nft_asset_name(governing_did)?;
    let mut nft_ma = MultiAsset::new();
    nft_ma.set_asset(&script_hash, &asset_name, &BigNum::from(1u64));

    // ─── 3. Fresh RegistryDatum ────────────────────────────────────
    let datum = encode_registry_datum(governing_did, &entries)?;

    // ─── 4. Wallet + builder ───────────────────────────────────────
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network).map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;

    // ─── 5. Inputs: genesis UTxO (SPENT, one-shot) + fee UTxO ──────
    // The genesis outpoint MUST be consumed so the one-shot policy fires once.
    let genesis_input = TransactionInput::new(
        &TransactionHash::from_hex(&genesis.tx_hash)
            .map_err(|_| "genesis_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        genesis.index,
    );
    tb.add_key_input(
        &payment_xprv.to_raw_key().to_public().hash(),
        &genesis_input,
        &rebuild_value(genesis.amount_lovelace, &genesis.assets)?,
    );

    // Fee/funding input: largest wallet UTxO distinct from genesis (if any).
    let fee_utxo = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    let fee_is_genesis = fee_utxo.tx_hash == genesis.tx_hash && fee_utxo.index == genesis.index;
    if !fee_is_genesis {
        let fee_input = TransactionInput::new(
            &TransactionHash::from_hex(&fee_utxo.tx_hash)
                .map_err(|_| "utxos_json tx_hash not valid 32-byte hex".to_string())?,
            fee_utxo.index,
        );
        tb.add_key_input(
            &payment_xprv.to_raw_key().to_public().hash(),
            &fee_input,
            &Value::new(&BigNum::from(fee_utxo.amount_lovelace)),
        );
    }

    // ─── 6. Collateral (Plutus mint) — pure-ADA only (audit R2) ────
    let collateral_utxo = utxos
        .iter()
        .filter(|u| u.assets.is_empty())
        .max_by_key(|u| u.amount_lovelace)
        .ok_or_else(|| {
            "no pure-ADA UTxO available for collateral — Plutus collateral must contain only ADA; \
             fund the wallet with an ADA-only UTxO"
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

    // ─── 7. Mint witness: +1 Registry-NFT under the registry policy ─
    if hex::decode(registry_script_cbor).is_err() {
        return Err("registry_script_cbor is not valid Plutus V3 script CBOR hex (bad hex)".into());
    }
    let script = csl::PlutusScript::from_hex_with_version(
        registry_script_cbor,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "registry_script_cbor is not valid Plutus V3 script CBOR hex".to_string())?;
    let script_source = csl::PlutusScriptSource::new(&script);

    // Deploy/genesis redeemer SHAPE = interface contract: empty constr (index 0,
    // no fields) = the conventional "Deploy" mint action. Change ONLY here if the
    // deployed policy expects a richer redeemer.
    let deploy_redeemer_data = PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64));
    let ex_units = csl::ExUnits::new(
        &BigNum::from(REGISTRY_EX_UNITS_MEM),
        &BigNum::from(REGISTRY_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &deploy_redeemer_data,
        &ex_units,
    );
    let mint_witness = csl::MintWitness::new_plutus_script(&script_source, &mint_redeemer);

    let mut mint_builder = csl::MintBuilder::new();
    mint_builder
        .add_asset(&mint_witness, &asset_name, &Int::new(&BigNum::from(1u64)))
        .map_err(|e| format!("mint_builder.add_asset: {:?}", e))?;
    tb.set_mint_builder(&mint_builder);

    // ─── 8. Output: Registry-NFT + datum at the registry script addr ─
    let registry_output = TransactionOutputBuilder::new()
        .with_address(&script_addr)
        .with_plutus_data(&datum)
        .next()
        .map_err(|e| format!("registry output builder.next: {:?}", e))?
        .with_asset_and_min_required_coin_by_utxo_cost(
            &nft_ma,
            &csl::DataCost::new_coins_per_byte(&BigNum::from(extract_coins_per_utxo_size(&params)?)),
        )
        .map_err(|e| format!("registry output min-ada calc: {:?}", e))?
        .build()
        .map_err(|e| format!("registry output build: {:?}", e))?;
    tb.add_output(&registry_output)
        .map_err(|e| format!("add_output failed: {:?}", e))?;

    // ─── 9. Controller signs (intent) ──────────────────────────────
    tb.add_required_signer(&controller_keyhash);
    tb.set_ttl_bignum(&BigNum::from(slot + 7200));

    // ─── 10. Bind cost model + redeemer, then change ───────────────
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;
    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 11. build + sign (wallet payment key + controller key) ────
    let tx = tb.build_tx().map_err(|e| format!("build_tx: {:?}", e))?;
    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash = TransactionHash::from_bytes(h.finalize().to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses: TransactionWitnessSet = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &controller_priv));
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

// ═══════════════════════════════════════════════════════════════════
// 2. UPDATE — spend registry, controller-signed (DID anchor reference)
// ═══════════════════════════════════════════════════════════════════

/// Build + sign the registry update tx. SPENDS the registry UTxO (Update
/// redeemer), sets the governing_did's DID anchor as a CIP-31 REFERENCE input,
/// declares the controller (derived from `controller_kek`) as a required signer,
/// and re-locks a continuing output at the registry script address carrying the
/// SAME value (Registry-NFT preserved) with a NEW `RegistryDatum` built from
/// `new_entries_json`.
///
/// WHO SIGNS (per validator): the controller of governing_did. The validator
/// checks `controller_pkh` (DID anchor datum field 2) ∈ extra_signatories AND
/// the DID anchor is present as a reference input. The DID anchor is NOT spent.
///
/// # Inputs
/// * `controller_kek`        — 32-byte Master_KEK of the governing_did controller.
/// * `registry_utxo_json`    — JSON [`RegistrySpendUtxo`]: the registry UTxO to
///   spend (outpoint + value incl. the Registry-NFT, preserved on the output).
/// * `did_anchor_utxo_json`  — JSON [`RefUtxo`]: the DID anchor UTxO (TAAD NFT).
///   Added as a reference input (read, not spent).
/// * `new_entries_json`      — JSON array of [`EntryJson`]: the FULL new authority
///   table (replaces the old; the validator enforces the rebuild rules).
/// * `registry_script_cbor`  — compiled Plutus V3 registry script (CBOR hex).
/// * `utxos_json`            — JSON array of [`UtxoInput`] for the wallet (fee +
///   collateral; collateral pure-ADA). MUST contain a UTxO distinct from registry.
/// * `params_json`           — protocol params JSON.
/// * `wallet_seed_hex`       — 32-byte CIP-1852 entropy.
/// * `network` / `slot`      — as deploy.
///
/// NOTE on `governing_did`: it is an explicit argument so the NEW datum re-encodes
/// it UNCHANGED (field 0). The validator asserts the continuing datum preserves
/// governing_did and that it matches the DID whose anchor is referenced — passing
/// it here keeps the rebuilt datum byte-identical on that field. The caller MUST
/// pass the SAME governing_did the registry was deployed with.
#[allow(clippy::too_many_arguments)]
pub fn build_update_mint_registry(
    controller_kek: &str,
    governing_did: &str,
    registry_utxo_json: &str,
    did_anchor_utxo_json: &str,
    new_entries_json: &str,
    registry_script_cbor: &str,
    utxos_json: &str,
    params_json: &str,
    wallet_seed_hex: &str,
    network: u8,
    slot: u64,
) -> Result<String, String> {
    // ─── 1. Parse + validate ──────────────────────────────────────
    if governing_did.is_empty() {
        return Err("governing_did must not be empty".into());
    }
    let (controller_priv, controller_keyhash) = derive_controller(controller_kek)?;

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex is not valid hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to 32 bytes".into());
    }
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let registry: RegistrySpendUtxo = serde_json::from_str(registry_utxo_json)
        .map_err(|e| format!("registry_utxo_json invalid: {}", e))?;
    if registry.amount_lovelace == 0 {
        return Err("registry_utxo_json.amount_lovelace must be > 0".into());
    }

    let anchor: RefUtxo = serde_json::from_str(did_anchor_utxo_json)
        .map_err(|e| format!("did_anchor_utxo_json invalid: {}", e))?;

    let entries: Vec<EntryJson> = serde_json::from_str(new_entries_json)
        .map_err(|e| format!("new_entries_json invalid: {}", e))?;

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxos_json)
        .map_err(|e| format!("utxos_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — provide ≥1 funded wallet UTxO distinct from registry".into());
    }

    let params: JsonValue = serde_json::from_str(params_json)
        .map_err(|e| format!("params_json invalid: {}", e))?;

    // ─── 2. Script addr + new datum + preserved value ──────────────
    let (script_addr, _script_hash) =
        derive_taad_script_address(registry_script_cbor, network).map_err(|e| e.to_string())?;
    let new_datum = encode_registry_datum(governing_did, &entries)?;
    let continuing_value = rebuild_value(registry.amount_lovelace, &registry.assets)?;

    // ─── 3. Plutus V3 spend witness (Update redeemer) ──────────────
    let script = csl::PlutusScript::from_hex_with_version(
        registry_script_cbor,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "registry_script_cbor is not valid Plutus V3 script CBOR hex".to_string())?;

    // Update redeemer SHAPE = empty constr (index 0). Change ONLY here if the
    // deployed validator expects a richer Update redeemer.
    let update_redeemer_data = PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64));
    let ex_units = csl::ExUnits::new(
        &BigNum::from(REGISTRY_EX_UNITS_MEM),
        &BigNum::from(REGISTRY_EX_UNITS_STEPS),
    );
    let spend_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_spend(),
        &BigNum::zero(),
        &update_redeemer_data,
        &ex_units,
    );
    // The registry UTxO carries its datum INLINE on-chain. For an inline-datum
    // spend, the witness must NOT re-supply the datum (the ledger resolves it from
    // the input), so we use `new_without_datum`. Re-attaching the OLD datum here
    // would double-encode it; rebuilding it from old entries is unnecessary. The
    // NEW datum is set on the continuing OUTPUT below, not on the spend witness.
    let plutus_witness = csl::PlutusWitness::new_without_datum(&script, &spend_redeemer);

    let current_input = TransactionInput::new(
        &TransactionHash::from_hex(&registry.tx_hash)
            .map_err(|_| "registry_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        registry.index,
    );

    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network).map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut inputs = csl::TxInputsBuilder::new();
    inputs.add_plutus_script_input(&plutus_witness, &current_input, &continuing_value);

    // Fee-paying input distinct from the registry UTxO.
    let fee_utxo = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    if fee_utxo.tx_hash == registry.tx_hash && fee_utxo.index == registry.index {
        return Err(
            "utxos_json must contain a funded wallet UTxO distinct from the registry UTxO \
             (needed for fee + collateral)"
                .into(),
        );
    }
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&fee_utxo.tx_hash)
            .map_err(|_| "utxos_json tx_hash not valid 32-byte hex".to_string())?,
        fee_utxo.index,
    );
    inputs
        .add_regular_input(
            &wallet_addr_obj,
            &fee_input,
            &Value::new(&BigNum::from(fee_utxo.amount_lovelace)),
        )
        .map_err(|e| format!("add_regular_input (fee utxo): {:?}", e))?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;
    tb.set_inputs(&inputs);

    // ─── 4. DID anchor as REFERENCE input (read, not spent) ────────
    let anchor_input = TransactionInput::new(
        &TransactionHash::from_hex(&anchor.tx_hash)
            .map_err(|_| "did_anchor_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        anchor.index,
    );
    tb.add_reference_input(&anchor_input);

    // ─── 5. Collateral — pure-ADA only ─────────────────────────────
    let collateral_utxo = utxos
        .iter()
        .filter(|u| u.assets.is_empty())
        .max_by_key(|u| u.amount_lovelace)
        .ok_or_else(|| {
            "no pure-ADA UTxO available for collateral — Plutus collateral must contain only ADA"
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

    // ─── 6. Continuing output: new datum + same value at script addr ─
    let continuing_output = TransactionOutputBuilder::new()
        .with_address(&script_addr)
        .with_plutus_data(&new_datum)
        .next()
        .map_err(|e| format!("continuing output builder.next: {:?}", e))?
        .with_value(&continuing_value)
        .build()
        .map_err(|e| format!("continuing output build: {:?}", e))?;
    tb.add_output(&continuing_output)
        .map_err(|e| format!("add continuing output: {:?}", e))?;

    // ─── 7. Controller required signer ─────────────────────────────
    tb.add_required_signer(&controller_keyhash);
    tb.set_ttl_bignum(&BigNum::from(slot + 7200));

    // ─── 8. Bind cost model + redeemer, then change ────────────────
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;
    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 9. build + sign (wallet payment key + controller key) ─────
    let tx = tb.build_tx().map_err(|e| format!("build_tx: {:?}", e))?;
    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash = TransactionHash::from_bytes(h.finalize().to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &controller_priv));
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

// ═══════════════════════════════════════════════════════════════════
// 2b. GENESIS SUPPLY STATE — mint SupplyState NFT one-shot + lock datum
// ═══════════════════════════════════════════════════════════════════

/// Build + sign the SupplyState genesis tx. MINTS the SupplyState NFT (one-shot,
/// bound to `genesis_utxo`) under the supply_state script policy and locks a fresh
/// `SupplyStateDatum{minted_total:0, lamp_policy, lamp_asset_name}` at the
/// supply_state script address.
///
/// On-chain (`supply.validate_genesis`): the genesis UTxO MUST be SPENT (one-shot),
/// exactly +1 NFT of `state_name` is minted under own_policy, that NFT lands at
/// ONE output at Script(own_policy), and that output's inline datum has
/// `minted_total == 0`. The mint redeemer is `SupplyStateNft::MintSupplyState`
/// (empty Constr 0).
///
/// DEPLOY ORDER (xem supply_state.ak header): supply_state hash KHÔNG phụ thuộc
/// lamp_policy → tính trước; did_token_mint hash param theo supply_state hash →
/// tính sau; rồi genesis với `lamp_policy_hex = did_token_mint hash`. Caller PHẢI
/// truyền `lamp_policy_hex` = hash của did_token_mint (token-có-cap) đã tính ở
/// bước 2, KHÔNG phải hash của supply_state script.
///
/// # Inputs
/// * `genesis_utxo_json`       — JSON [`GenesisUtxo`]: the outpoint the one-shot
///   policy is bound to. SPENT in this tx.
/// * `state_name_hex`          — SupplyState NFT asset-name bytes hex (e.g. hex of
///   "LAMP-SUPPLY"); must equal the `state_name` baked into the supply_state script.
/// * `lamp_policy_hex`         — 28-byte policy-id hex of the COUNTED token
///   (= did_token_mint hash). Baked into the genesis datum, immutable thereafter.
/// * `lamp_asset_name_hex`     — counted-token asset-name bytes hex (may be empty).
/// * `supply_state_script_cbor`— compiled Plutus V3 supply_state script (CBOR hex).
///   Its hash = the supply_state script address AND the SupplyState NFT policy id.
/// * `utxos_json`              — JSON array of [`UtxoInput`] for the WALLET (fee +
///   collateral; collateral must be pure-ADA).
/// * `params_json`             — protocol params JSON.
/// * `wallet_seed_hex`         — 32-byte CIP-1852 entropy for fee/change.
/// * `network` / `slot`        — as deploy.
#[allow(clippy::too_many_arguments)]
pub fn build_genesis_supply_state(
    genesis_utxo_json: &str,
    state_name_hex: &str,
    lamp_policy_hex: &str,
    lamp_asset_name_hex: &str,
    supply_state_script_cbor: &str,
    utxos_json: &str,
    params_json: &str,
    wallet_seed_hex: &str,
    network: u8,
    slot: u64,
) -> Result<String, String> {
    // ─── 1. Parse + validate ──────────────────────────────────────
    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex is not valid hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to 32 bytes".into());
    }
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let genesis: GenesisUtxo = serde_json::from_str(genesis_utxo_json)
        .map_err(|e| format!("genesis_utxo_json invalid: {}", e))?;
    if genesis.amount_lovelace == 0 {
        return Err("genesis_utxo_json.amount_lovelace must be > 0".into());
    }

    let state_name_bytes = hex::decode(state_name_hex)
        .map_err(|e| format!("state_name_hex not valid hex: {}", e))?;
    let state_name = AssetName::new(state_name_bytes)
        .map_err(|_| "state_name_hex too long (>32 bytes)".to_string())?;

    let lamp_asset_name = if lamp_asset_name_hex.is_empty() {
        AssetName::new(Vec::new()).map_err(|_| "empty lamp asset name failed (unreachable)".to_string())?
    } else {
        let b = hex::decode(lamp_asset_name_hex)
            .map_err(|e| format!("lamp_asset_name_hex not valid hex: {}", e))?;
        AssetName::new(b).map_err(|_| "lamp_asset_name_hex too long (>32 bytes)".to_string())?
    };

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxos_json)
        .map_err(|e| format!("utxos_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — provide ≥1 funded wallet UTxO (fee + collateral)".into());
    }

    let params: JsonValue = serde_json::from_str(params_json)
        .map_err(|e| format!("params_json invalid: {}", e))?;

    // ─── 2. supply_state script addr + hash; SupplyState NFT name/policy ─
    let (script_addr, script_hash) =
        derive_taad_script_address(supply_state_script_cbor, network).map_err(|e| e.to_string())?;
    let mut nft_ma = MultiAsset::new();
    nft_ma.set_asset(&script_hash, &state_name, &BigNum::from(1u64));

    // ─── 3. Fresh SupplyStateDatum{minted_total:0, lamp_policy, lamp_name} ─
    let datum = encode_supply_state_datum(0, lamp_policy_hex, &lamp_asset_name)?;

    // ─── 4. Wallet + builder ───────────────────────────────────────
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network).map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;

    // ─── 5. Inputs: genesis UTxO (SPENT, one-shot) + fee UTxO ──────
    let genesis_input = TransactionInput::new(
        &TransactionHash::from_hex(&genesis.tx_hash)
            .map_err(|_| "genesis_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        genesis.index,
    );
    tb.add_key_input(
        &payment_xprv.to_raw_key().to_public().hash(),
        &genesis_input,
        &rebuild_value(genesis.amount_lovelace, &genesis.assets)?,
    );

    let fee_utxo = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    let fee_is_genesis = fee_utxo.tx_hash == genesis.tx_hash && fee_utxo.index == genesis.index;
    if !fee_is_genesis {
        let fee_input = TransactionInput::new(
            &TransactionHash::from_hex(&fee_utxo.tx_hash)
                .map_err(|_| "utxos_json tx_hash not valid 32-byte hex".to_string())?,
            fee_utxo.index,
        );
        tb.add_key_input(
            &payment_xprv.to_raw_key().to_public().hash(),
            &fee_input,
            &Value::new(&BigNum::from(fee_utxo.amount_lovelace)),
        );
    }

    // ─── 6. Collateral (Plutus mint) — pure-ADA only (audit R2) ────
    let collateral_utxo = utxos
        .iter()
        .filter(|u| u.assets.is_empty())
        .max_by_key(|u| u.amount_lovelace)
        .ok_or_else(|| {
            "no pure-ADA UTxO available for collateral — Plutus collateral must contain only ADA"
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

    // ─── 7. Mint witness: +1 SupplyState NFT under the supply_state policy ─
    if hex::decode(supply_state_script_cbor).is_err() {
        return Err("supply_state_script_cbor is not valid Plutus V3 script CBOR hex (bad hex)".into());
    }
    let script = csl::PlutusScript::from_hex_with_version(
        supply_state_script_cbor,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "supply_state_script_cbor is not valid Plutus V3 script CBOR hex".to_string())?;
    let script_source = csl::PlutusScriptSource::new(&script);

    // Genesis mint redeemer = SupplyStateNft::MintSupplyState (empty Constr 0).
    let ex_units = csl::ExUnits::new(
        &BigNum::from(REGISTRY_EX_UNITS_MEM),
        &BigNum::from(REGISTRY_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &supply_state_mint_redeemer_data(),
        &ex_units,
    );
    let mint_witness = csl::MintWitness::new_plutus_script(&script_source, &mint_redeemer);

    let mut mint_builder = csl::MintBuilder::new();
    mint_builder
        .add_asset(&mint_witness, &state_name, &Int::new(&BigNum::from(1u64)))
        .map_err(|e| format!("mint_builder.add_asset: {:?}", e))?;
    tb.set_mint_builder(&mint_builder);

    // ─── 8. Output: SupplyState NFT + inline datum at supply_state addr ─
    let state_output = TransactionOutputBuilder::new()
        .with_address(&script_addr)
        .with_plutus_data(&datum)
        .next()
        .map_err(|e| format!("supply_state output builder.next: {:?}", e))?
        .with_asset_and_min_required_coin_by_utxo_cost(
            &nft_ma,
            &csl::DataCost::new_coins_per_byte(&BigNum::from(extract_coins_per_utxo_size(&params)?)),
        )
        .map_err(|e| format!("supply_state output min-ada calc: {:?}", e))?
        .build()
        .map_err(|e| format!("supply_state output build: {:?}", e))?;
    tb.add_output(&state_output)
        .map_err(|e| format!("add_output failed: {:?}", e))?;

    // ─── 9. TTL, cost model, change ────────────────────────────────
    tb.set_ttl_bignum(&BigNum::from(slot + 7200));
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;
    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 10. build + sign (wallet payment key) ─────────────────────
    let tx = tb.build_tx().map_err(|e| format!("build_tx: {:?}", e))?;
    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash = TransactionHash::from_bytes(h.finalize().to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses: TransactionWitnessSet = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

// ═══════════════════════════════════════════════════════════════════
// 3. MINT VIA REGISTRY — token policy reads registry (reference input)
// ═══════════════════════════════════════════════════════════════════

/// Build + sign a token mint tx authorised by the registry. The token mint
/// policy `did_token_mint(registry_nft_policy, registry_nft_name, action_tag,
/// token_asset_name)` validates a mint IFF: the tx carries the registry UTxO as
/// a CIP-31 REFERENCE input (so the policy reads the authorization for `action_tag`),
/// the authorization is satisfied (SinglePkh → 1 sig; MultiSig → M-of-N sigs), and
/// the minted asset name matches. This builder adds the registry as a reference
/// input, declares each authorization key as a required signer, mints the token, and
/// signs with every supplied authorization key (single or multisig).
///
/// # Inputs
/// * `authority_keks_json`   — JSON array of 32-byte Master_KEK hex strings, one
///   per signing authority key (1 for SinglePkh; M..=N for MultiSig). Each derives
///   an Ed25519 controller key via `sign::derive_taad_seed`; its keyhash is added
///   as a required signer AND it signs the tx.
/// * `registry_utxo_json`    — JSON [`RefUtxo`]: the registry UTxO (reference input).
/// * `token_policy_cbor`     — compiled Plutus V3 token mint policy (CBOR hex). Its
///   hash = the token policy id. (Already parameterised on-chain with the registry
///   NFT policy/name + action_tag + asset_name.)
/// * `mint_json`             — JSON [`TokenMintInstruction`] (asset_name_hex, amount,
///   optional recipient).
/// * `utxos_json`            — JSON array of [`UtxoInput`] for the wallet (fee +
///   collateral; collateral pure-ADA).
/// * `params_json`           — protocol params JSON.
/// * `wallet_seed_hex`       — 32-byte CIP-1852 entropy for fee/change.
/// * `network` / `slot`      — as deploy.
///
/// ─── CAP (token opt-in supply state) ──────────────────────────────
/// For a CAPPED token (the on-chain `did_token_mint` baked with
/// `require_supply_state = True`, like LAMP), the mint policy REQUIRES exactly 1
/// input carrying the SupplyState NFT, which triggers `supply_state.spend` to count
/// `minted_total' = minted_total + qty(mint) ≤ cap`. Pass:
/// * `supply_state_utxo_json` — JSON [`SupplyStateSpendUtxo`]: the SupplyState UTxO
///   to SPEND (outpoint + value incl. the SupplyState NFT + old `minted_total` +
///   `lamp_policy`/`lamp_asset_name` from the old inline datum). Pass `""` (empty)
///   for an UNCAPPED token — the old reference-only path is kept unchanged.
/// * `supply_state_script_cbor` — compiled Plutus V3 supply_state script (CBOR hex);
///   ignored when `supply_state_utxo_json` is empty.
///
/// When capped, the builder: SPENDS the SupplyState UTxO (spend redeemer
/// `CountMint` = empty Constr 0), re-creates a continuing output at the
/// supply_state script address with `minted_total' = minted_total + amount` and the
/// SAME `lamp_policy`/`lamp_asset_name` (validator s8), and adds the supply_state
/// PlutusScript spend witness. The registry stays a REFERENCE input; authority
/// signers + the did_token_mint mint witness are unchanged.
#[allow(clippy::too_many_arguments)]
pub fn build_mint_via_registry(
    authority_keks_json: &str,
    registry_utxo_json: &str,
    token_policy_cbor: &str,
    mint_json: &str,
    supply_state_utxo_json: &str,
    supply_state_script_cbor: &str,
    utxos_json: &str,
    params_json: &str,
    wallet_seed_hex: &str,
    network: u8,
    slot: u64,
) -> Result<String, String> {
    // ─── 1. Parse + validate ──────────────────────────────────────
    let auth_keks: Vec<String> = serde_json::from_str(authority_keks_json)
        .map_err(|e| format!("authority_keks_json invalid (expected JSON array of hex): {}", e))?;
    if auth_keks.is_empty() {
        return Err("authority_keks_json must contain ≥1 controller KEK (SinglePkh) or M (MultiSig)".into());
    }
    // Derive each authority signing key + keyhash (single source of truth helper).
    let mut auth_keys: Vec<(csl::PrivateKey, csl::Ed25519KeyHash)> = Vec::with_capacity(auth_keks.len());
    for kek in &auth_keks {
        auth_keys.push(derive_controller(kek)?);
    }

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex is not valid hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to 32 bytes".into());
    }
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let registry: RefUtxo = serde_json::from_str(registry_utxo_json)
        .map_err(|e| format!("registry_utxo_json invalid: {}", e))?;

    let mint: TokenMintInstruction = serde_json::from_str(mint_json)
        .map_err(|e| format!("mint_json invalid: {}", e))?;
    if mint.amount == 0 {
        return Err("mint_json.amount must be > 0 (nothing to mint)".into());
    }
    let token_asset_name = if mint.asset_name_hex.is_empty() {
        AssetName::new(Vec::new()).map_err(|_| "empty token asset name failed (unreachable)".to_string())?
    } else {
        let name_bytes = hex::decode(&mint.asset_name_hex)
            .map_err(|e| format!("mint_json.asset_name_hex not hex: {}", e))?;
        AssetName::new(name_bytes).map_err(|_| "mint_json.asset_name_hex too long (>32 bytes)".to_string())?
    };

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxos_json)
        .map_err(|e| format!("utxos_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — provide ≥1 funded wallet UTxO (fee + collateral)".into());
    }

    let params: JsonValue = serde_json::from_str(params_json)
        .map_err(|e| format!("params_json invalid: {}", e))?;

    // CAP opt-in: empty supply_state_utxo_json → uncapped (keep the old path).
    let supply_state: Option<SupplyStateSpendUtxo> = if supply_state_utxo_json.trim().is_empty() {
        None
    } else {
        Some(
            serde_json::from_str(supply_state_utxo_json)
                .map_err(|e| format!("supply_state_utxo_json invalid: {}", e))?,
        )
    };

    // ─── 2. Wallet + builder ───────────────────────────────────────
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network).map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;

    // ─── 3. Inputs: fee/funding (+ SupplyState SPEND if capped) ────
    let picked = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&picked.tx_hash)
            .map_err(|_| "utxos_json tx_hash not valid 32-byte hex".to_string())?,
        picked.index,
    );

    // SupplyState continuing output (script addr + bumped datum + same value) is
    // staged here so it can be added after the mint amount is known.
    let supply_state_continuing: Option<csl::TransactionOutput> = if let Some(ss) = &supply_state {
        if ss.amount_lovelace == 0 {
            return Err("supply_state_utxo_json.amount_lovelace must be > 0".into());
        }
        if picked.tx_hash == ss.tx_hash && picked.index == ss.index {
            return Err(
                "utxos_json fee UTxO must be distinct from the SupplyState UTxO".into(),
            );
        }
        // supply_state script addr (= NFT policy id). The continuing output re-locks
        // the SAME value (NFT preserved) with minted_total' = minted_total + amount.
        let (ss_script_addr, _ss_hash) =
            derive_taad_script_address(supply_state_script_cbor, network).map_err(|e| e.to_string())?;
        let minted_total_new = ss
            .minted_total
            .checked_add(mint.amount)
            .ok_or_else(|| "minted_total + amount overflows u64 (impossible cap)".to_string())?;
        let lamp_asset_name = if ss.lamp_asset_name_hex.is_empty() {
            AssetName::new(Vec::new()).map_err(|_| "empty lamp asset name failed (unreachable)".to_string())?
        } else {
            let b = hex::decode(&ss.lamp_asset_name_hex)
                .map_err(|e| format!("supply_state lamp_asset_name_hex not valid hex: {}", e))?;
            AssetName::new(b).map_err(|_| "supply_state lamp_asset_name_hex too long (>32 bytes)".to_string())?
        };
        let new_datum =
            encode_supply_state_datum(minted_total_new, &ss.lamp_policy_hex, &lamp_asset_name)?;
        let continuing_value = rebuild_value(ss.amount_lovelace, &ss.assets)?;

        // Plutus V3 spend witness for the supply_state script (CountMint redeemer,
        // empty Constr 0). Inline-datum spend → witness MUST NOT re-supply the datum.
        let ss_script = csl::PlutusScript::from_hex_with_version(
            supply_state_script_cbor,
            &csl::Language::new_plutus_v3(),
        )
        .map_err(|_| "supply_state_script_cbor is not valid Plutus V3 script CBOR hex".to_string())?;
        let ex_units = csl::ExUnits::new(
            &BigNum::from(REGISTRY_EX_UNITS_MEM),
            &BigNum::from(REGISTRY_EX_UNITS_STEPS),
        );
        let ss_spend_redeemer = csl::Redeemer::new(
            &csl::RedeemerTag::new_spend(),
            &BigNum::zero(),
            &supply_state_spend_redeemer_data(),
            &ex_units,
        );
        let ss_witness = csl::PlutusWitness::new_without_datum(&ss_script, &ss_spend_redeemer);
        let ss_input = TransactionInput::new(
            &TransactionHash::from_hex(&ss.tx_hash)
                .map_err(|_| "supply_state_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
            ss.index,
        );

        // Build inputs explicitly (TxInputsBuilder) so we can mix the plutus spend
        // input with the regular fee key input, then attach to the tx builder.
        let mut inputs = csl::TxInputsBuilder::new();
        inputs.add_plutus_script_input(&ss_witness, &ss_input, &continuing_value);
        inputs
            .add_regular_input(
                &wallet_addr_obj,
                &fee_input,
                &Value::new(&BigNum::from(picked.amount_lovelace)),
            )
            .map_err(|e| format!("add_regular_input (fee utxo): {:?}", e))?;
        tb.set_inputs(&inputs);

        let continuing_output = TransactionOutputBuilder::new()
            .with_address(&ss_script_addr)
            .with_plutus_data(&new_datum)
            .next()
            .map_err(|e| format!("supply_state continuing output builder.next: {:?}", e))?
            .with_value(&continuing_value)
            .build()
            .map_err(|e| format!("supply_state continuing output build: {:?}", e))?;
        Some(continuing_output)
    } else {
        // Uncapped: keep the original key-input fee path.
        tb.add_key_input(
            &payment_xprv.to_raw_key().to_public().hash(),
            &fee_input,
            &Value::new(&BigNum::from(picked.amount_lovelace)),
        );
        None
    };

    // ─── 4. Collateral — pure-ADA only ─────────────────────────────
    let collateral_utxo = utxos
        .iter()
        .filter(|u| u.assets.is_empty())
        .max_by_key(|u| u.amount_lovelace)
        .ok_or_else(|| {
            "no pure-ADA UTxO available for collateral — Plutus collateral must contain only ADA"
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

    // ─── 5. Registry as REFERENCE input (read, not spent) ──────────
    let registry_input = TransactionInput::new(
        &TransactionHash::from_hex(&registry.tx_hash)
            .map_err(|_| "registry_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        registry.index,
    );
    tb.add_reference_input(&registry_input);

    // ─── 6. Mint witness: +amount token under the token policy ─────
    if hex::decode(token_policy_cbor).is_err() {
        return Err("token_policy_cbor is not valid Plutus V3 script CBOR hex (bad hex)".into());
    }
    let token_script = csl::PlutusScript::from_hex_with_version(
        token_policy_cbor,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "token_policy_cbor is not valid Plutus V3 script CBOR hex".to_string())?;
    let token_policy_id = token_script.hash();
    let token_script_source = csl::PlutusScriptSource::new(&token_script);

    // Mint redeemer SHAPE = empty constr (index 0) = conventional "Mint" action.
    let mint_redeemer_data = PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64));
    let ex_units = csl::ExUnits::new(
        &BigNum::from(REGISTRY_EX_UNITS_MEM),
        &BigNum::from(REGISTRY_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &mint_redeemer_data,
        &ex_units,
    );
    let token_mint_witness = csl::MintWitness::new_plutus_script(&token_script_source, &mint_redeemer);

    let mut mint_builder = csl::MintBuilder::new();
    mint_builder
        .add_asset(&token_mint_witness, &token_asset_name, &Int::new(&BigNum::from(mint.amount)))
        .map_err(|e| format!("mint_builder.add_asset: {:?}", e))?;
    tb.set_mint_builder(&mint_builder);

    // ─── 7. Output: minted token to recipient (or self) ───────────
    let mut token_ma = MultiAsset::new();
    token_ma.set_asset(&token_policy_id, &token_asset_name, &BigNum::from(mint.amount));
    let recipient_addr_obj = match mint.recipient.as_deref() {
        Some(a) if !a.is_empty() => Address::from_bech32(a)
            .map_err(|_| "mint_json.recipient is not a valid bech32 address".to_string())?,
        _ => wallet_addr_obj.clone(),
    };
    let token_output = TransactionOutputBuilder::new()
        .with_address(&recipient_addr_obj)
        .next()
        .map_err(|e| format!("token output builder.next: {:?}", e))?
        .with_asset_and_min_required_coin_by_utxo_cost(
            &token_ma,
            &csl::DataCost::new_coins_per_byte(&BigNum::from(extract_coins_per_utxo_size(&params)?)),
        )
        .map_err(|e| format!("token output min-ada calc: {:?}", e))?
        .build()
        .map_err(|e| format!("token output build: {:?}", e))?;
    tb.add_output(&token_output)
        .map_err(|e| format!("add_output failed: {:?}", e))?;

    // ─── 7b. SupplyState continuing output (capped path only) ──────
    // Re-lock the SupplyState NFT + bumped datum at the supply_state script addr so
    // `supply_state.spend` sees exactly 1 continuing NFT output (s3) with
    // minted_total' = minted_total + amount (s6).
    if let Some(continuing) = supply_state_continuing {
        tb.add_output(&continuing)
            .map_err(|e| format!("add supply_state continuing output: {:?}", e))?;
    }

    // ─── 8. Required signers = every authority key ─────────────────
    for (_, keyhash) in &auth_keys {
        tb.add_required_signer(keyhash);
    }
    tb.set_ttl_bignum(&BigNum::from(slot + 7200));

    // ─── 9. Bind cost model + redeemer, then change ────────────────
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;
    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 10. build + sign (wallet payment key + every authority key) ─
    let tx = tb.build_tx().map_err(|e| format!("build_tx: {:?}", e))?;
    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash = TransactionHash::from_bytes(h.finalize().to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses: TransactionWitnessSet = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    for (priv_key, _) in &auth_keys {
        vkeys.add(&csl::make_vkey_witness(&tx_hash, priv_key));
    }
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

// ─── TESTS ─────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal valid Plutus V3 script (CBOR byte-string wrapper), same fixture
    /// the create/rotate/mint tests use — known parseable by CSL.
    const MOCK_REGISTRY_SCRIPT: &str = "4e4d01000033222220051200120011";
    /// A second distinct minimal V3 script as the TOKEN policy (distinct hash).
    const MOCK_TOKEN_POLICY: &str = "4e4d010000332222200512001200ff";
    /// A third distinct minimal V3 script standing in as the DID anchor (TAAD)
    /// validator, so the anchor NFT policy differs from the registry policy.
    const MOCK_ANCHOR_SCRIPT: &str = "4e4d0100003322222005120012aaff";

    const GOVERNING_DID: &str = "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000";

    fn mock_params() -> &'static str {
        r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#
    }

    /// Two funded, asset-free wallet UTxOs (fee + collateral + genesis spend).
    fn mock_wallet_utxos() -> &'static str {
        r#"[
            {"tx_hash": "5555555555555555555555555555555555555555555555555555555555555555",
             "index": 1, "amount_lovelace": 10000000},
            {"tx_hash": "6666666666666666666666666666666666666666666666666666666666666666",
             "index": 0, "amount_lovelace": 8000000}
        ]"#
    }

    fn mock_genesis_utxo() -> &'static str {
        r#"{"tx_hash": "7777777777777777777777777777777777777777777777777777777777777777",
            "index": 0, "amount_lovelace": 5000000}"#
    }

    /// pkh fixtures (28 bytes each).
    fn pkh_a() -> String { "aa".repeat(28) }
    fn pkh_b() -> String { "bb".repeat(28) }
    fn pkh_c() -> String { "cc".repeat(28) }

    // ─── ENCODING: byte-for-byte contract with Aiken ───────────────

    /// SinglePkh = Constr 0 [Bytes(28)] — decode the encoded data back and assert
    /// the constr index + the single 28-byte field.
    #[test]
    fn encode_authorization_single_layout() {
        let a = AuthorizationJson { kind: "single".into(), pkh: Some(pkh_a()), pkhs: None, threshold: None };
        let (data, signers, threshold) = encode_authorization(&a).unwrap();
        assert_eq!(signers.len(), 1);
        assert_eq!(threshold, 1);
        let constr = data.as_constr_plutus_data().expect("authorization is constr");
        assert_eq!(constr.alternative(), BigNum::from(0u64), "SinglePkh = constr 0");
        assert_eq!(constr.data().len(), 1, "SinglePkh has exactly 1 field");
        let pkh_field = constr.data().get(0).as_bytes().expect("field 0 is bytes");
        assert_eq!(pkh_field, hex::decode(pkh_a()).unwrap(), "field 0 = the pkh bytes");
        assert_eq!(pkh_field.len(), 28);
    }

    /// MultiSig = Constr 1 [List<Bytes(28)>, Int] — decode + assert.
    #[test]
    fn encode_authorization_multisig_layout() {
        let a = AuthorizationJson {
            kind: "multisig".into(),
            pkh: None,
            pkhs: Some(vec![pkh_a(), pkh_b(), pkh_c()]),
            threshold: Some(2),
        };
        let (data, signers, threshold) = encode_authorization(&a).unwrap();
        assert_eq!(signers.len(), 3, "all 3 pkhs returned");
        assert_eq!(threshold, 2);
        let constr = data.as_constr_plutus_data().expect("authorization is constr");
        assert_eq!(constr.alternative(), BigNum::from(1u64), "MultiSig = constr 1");
        assert_eq!(constr.data().len(), 2, "MultiSig has 2 fields: [pkhs, threshold]");
        // Field 0: List of 3 byte arrays (28 bytes each).
        let list = constr.data().get(0).as_list().expect("field 0 is a list");
        assert_eq!(list.len(), 3);
        for i in 0..list.len() {
            assert_eq!(list.get(i).as_bytes().unwrap().len(), 28);
        }
        // Field 1: Int = threshold.
        let thr = constr.data().get(1).as_integer().expect("field 1 is int");
        assert_eq!(thr, csl::BigInt::from_str("2").unwrap());
    }

    /// Revoked = Constr 2 [] — empty constr, index 2.
    #[test]
    fn encode_authorization_revoked_layout() {
        let a = AuthorizationJson { kind: "revoked".into(), pkh: None, pkhs: None, threshold: None };
        let (data, signers, threshold) = encode_authorization(&a).unwrap();
        assert!(signers.is_empty(), "Revoked has no signers");
        assert_eq!(threshold, 0);
        let constr = data.as_constr_plutus_data().expect("authorization is constr");
        assert_eq!(constr.alternative(), BigNum::from(2u64), "Revoked = constr 2");
        assert_eq!(constr.data().len(), 0, "Revoked has no fields");
    }

    /// RegistryDatum = Constr 0 [governing_did: Bytes, entries: List<Entry>];
    /// Entry = Constr 0 [action_tag: Bytes, authorization: Authorization]. Decode the full
    /// datum and assert every positional field + nested constr index.
    #[test]
    fn encode_registry_datum_full_layout() {
        let entries = vec![
            EntryJson {
                action_tag_hex: hex::encode(b"BADGE"),
                authorization: AuthorizationJson { kind: "single".into(), pkh: Some(pkh_a()), pkhs: None, threshold: None },
            },
            EntryJson {
                action_tag_hex: hex::encode(b"VOUCH"),
                authorization: AuthorizationJson { kind: "multisig".into(), pkh: None, pkhs: Some(vec![pkh_a(), pkh_b()]), threshold: Some(2) },
            },
        ];
        let datum = encode_registry_datum(GOVERNING_DID, &entries).unwrap();

        // Top: Constr 0, 2 fields.
        let constr = datum.as_constr_plutus_data().expect("datum is constr");
        assert_eq!(constr.alternative(), BigNum::from(0u64), "RegistryDatum = constr 0");
        assert_eq!(constr.data().len(), 2, "RegistryDatum has 2 fields");

        // Field 0: governing_did UTF-8 bytes.
        let did_bytes = constr.data().get(0).as_bytes().expect("field 0 is bytes");
        assert_eq!(did_bytes, GOVERNING_DID.as_bytes(), "field 0 = governing_did UTF-8");

        // Field 1: List<Entry> of length 2.
        let entry_list = constr.data().get(1).as_list().expect("field 1 is list");
        assert_eq!(entry_list.len(), 2, "two entries");

        // Entry 0: Constr 0 [action_tag=BADGE, SinglePkh].
        let e0 = entry_list.get(0).as_constr_plutus_data().expect("entry is constr");
        assert_eq!(e0.alternative(), BigNum::from(0u64), "Entry = constr 0");
        assert_eq!(e0.data().len(), 2, "Entry has 2 fields");
        assert_eq!(e0.data().get(0).as_bytes().unwrap(), b"BADGE".to_vec());
        let e0_authz = e0.data().get(1).as_constr_plutus_data().unwrap();
        assert_eq!(e0_authz.alternative(), BigNum::from(0u64), "entry 0 authorization = SinglePkh (constr 0)");

        // Entry 1: action_tag=VOUCH, MultiSig (constr 1).
        let e1 = entry_list.get(1).as_constr_plutus_data().unwrap();
        assert_eq!(e1.data().get(0).as_bytes().unwrap(), b"VOUCH".to_vec());
        let e1_authz = e1.data().get(1).as_constr_plutus_data().unwrap();
        assert_eq!(e1_authz.alternative(), BigNum::from(1u64), "entry 1 authorization = MultiSig (constr 1)");
    }

    /// Round-trip: re-encode the SAME datum twice → identical canonical CBOR.
    /// Guards against any non-determinism in the encoder (drift catcher).
    #[test]
    fn encode_registry_datum_is_deterministic() {
        let entries = vec![EntryJson {
            action_tag_hex: hex::encode(b"X"),
            authorization: AuthorizationJson { kind: "single".into(), pkh: Some(pkh_a()), pkhs: None, threshold: None },
        }];
        let a = encode_registry_datum(GOVERNING_DID, &entries).unwrap();
        let b = encode_registry_datum(GOVERNING_DID, &entries).unwrap();
        assert_eq!(a.to_bytes(), b.to_bytes(), "same input → identical CBOR bytes");
    }

    /// MultiSig threshold validation: 0 or > N is rejected.
    #[test]
    fn encode_authorization_multisig_rejects_bad_threshold() {
        let too_big = AuthorizationJson {
            kind: "multisig".into(), pkh: None,
            pkhs: Some(vec![pkh_a(), pkh_b()]), threshold: Some(3),
        };
        assert!(encode_authorization(&too_big).unwrap_err().contains("threshold must be"));
        let zero = AuthorizationJson {
            kind: "multisig".into(), pkh: None,
            pkhs: Some(vec![pkh_a()]), threshold: Some(0),
        };
        assert!(encode_authorization(&zero).unwrap_err().contains("threshold must be"));
    }

    // ─── DEPLOY ────────────────────────────────────────────────────

    /// Deploy builds a signed tx: Registry-NFT minted under the registry policy
    /// with name = blake2b_256(governing_did), datum at script addr, genesis UTxO
    /// SPENT (one-shot), controller required signer + signature.
    #[test]
    fn deploy_mints_registry_nft_one_shot() {
        let controller_kek = "7a".repeat(32);
        let wallet_seed = "34".repeat(32);
        let entries = format!(
            r#"[{{"action_tag_hex":"{}","authorization":{{"kind":"single","pkh":"{}"}}}}]"#,
            hex::encode(b"BADGE"), pkh_a()
        );

        let tx_hex = build_deploy_mint_registry(
            &controller_kek, GOVERNING_DID, mock_genesis_utxo(), &entries,
            MOCK_REGISTRY_SCRIPT, mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("deploy must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).expect("valid tx CBOR");
        let body = tx.body();
        let wit = tx.witness_set();

        // Registry-NFT minted under the registry policy = script hash, name = blake2b_256(did).
        let script = csl::PlutusScript::from_hex_with_version(MOCK_REGISTRY_SCRIPT, &csl::Language::new_plutus_v3()).unwrap();
        let policy_id = script.hash();
        let expected_name = registry_nft_asset_name(GOVERNING_DID).unwrap();
        let mint = body.mint().expect("mint set");
        let mints_assets = mint.get(&policy_id).expect("mint entry for registry policy");
        let mut total: i128 = 0;
        for i in 0..mints_assets.len() {
            if let Some(v) = mints_assets.get(i).unwrap().get(&expected_name) {
                total += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(total, 1, "exactly +1 Registry-NFT with the did-derived name");

        // Genesis UTxO must be SPENT (one-shot binding).
        let inputs = body.inputs();
        let mut genesis_spent = false;
        for i in 0..inputs.len() {
            if hex::encode(inputs.get(i).transaction_id().to_bytes())
                == "7777777777777777777777777777777777777777777777777777777777777777"
            {
                genesis_spent = true;
            }
        }
        assert!(genesis_spent, "genesis UTxO must be consumed (one-shot)");

        // Controller required signer + 2 vkeys (wallet + controller).
        let (_, controller_keyhash) = derive_controller(&controller_kek).unwrap();
        let req = body.required_signers().expect("required signers set");
        assert_eq!(req.len(), 1);
        assert_eq!(req.get(0).to_bytes(), controller_keyhash.to_bytes(), "controller is the required signer");
        assert_eq!(wit.vkeys().unwrap().len(), 2, "wallet + controller signatures");

        // Plutus witness + script_data_hash present.
        assert_eq!(wit.plutus_scripts().unwrap().len(), 1);
        assert!(body.script_data_hash().is_some());
    }

    // ─── UPDATE ────────────────────────────────────────────────────

    fn mock_registry_spend_utxo() -> String {
        // Registry UTxO carries the Registry-NFT (policy = registry script hash).
        let (_addr, script_hash) = derive_taad_script_address(MOCK_REGISTRY_SCRIPT, 0).unwrap();
        let policy_hex = hex::encode(script_hash.to_bytes());
        // Registry-NFT raw asset name = blake2b_256(governing_did) (NOT the CBOR-
        // wrapped AssetName::to_bytes).
        let mut h = Blake2b256::new();
        h.update(GOVERNING_DID.as_bytes());
        let raw_name = hex::encode(h.finalize());
        format!(
            r#"{{"tx_hash":"1111111111111111111111111111111111111111111111111111111111111111",
                 "index":0,"amount_lovelace":2000000,
                 "assets":[{{"policy_id":"{}","asset_name_hex":"{}","quantity":1}}]}}"#,
            policy_hex, raw_name
        )
    }

    fn mock_did_anchor_utxo() -> String {
        // DID anchor NFT under the (distinct) anchor validator policy.
        let (_addr, anchor_hash) = derive_taad_script_address(MOCK_ANCHOR_SCRIPT, 0).unwrap();
        let policy_hex = hex::encode(anchor_hash.to_bytes());
        let mut h = Blake2b256::new();
        h.update(GOVERNING_DID.as_bytes());
        let raw_name = hex::encode(h.finalize());
        format!(
            r#"{{"tx_hash":"2222222222222222222222222222222222222222222222222222222222222222",
                 "index":0,"amount_lovelace":2000000,
                 "assets":[{{"policy_id":"{}","asset_name_hex":"{}","quantity":1}}]}}"#,
            policy_hex, raw_name
        )
    }

    /// Update spends the registry, references the DID anchor (not spent),
    /// controller required signer, continuing output keeps the Registry-NFT + new datum.
    #[test]
    fn update_spends_registry_references_anchor_controller_signs() {
        let controller_kek = "7a".repeat(32);
        let wallet_seed = "34".repeat(32);
        let new_entries = format!(
            r#"[{{"action_tag_hex":"{}","authorization":{{"kind":"multisig","pkhs":["{}","{}"],"threshold":2}}}}]"#,
            hex::encode(b"BADGE"), pkh_a(), pkh_b()
        );

        let tx_hex = build_update_mint_registry(
            &controller_kek, GOVERNING_DID, &mock_registry_spend_utxo(), &mock_did_anchor_utxo(),
            &new_entries, MOCK_REGISTRY_SCRIPT, mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("update must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).expect("valid tx CBOR");
        let body = tx.body();
        let wit = tx.witness_set();

        // DID anchor is a REFERENCE input, NOT a spend input.
        let ref_inputs = body.reference_inputs().expect("reference inputs set");
        let mut anchor_referenced = false;
        for i in 0..ref_inputs.len() {
            if hex::encode(ref_inputs.get(i).transaction_id().to_bytes())
                == "2222222222222222222222222222222222222222222222222222222222222222"
            { anchor_referenced = true; }
        }
        assert!(anchor_referenced, "DID anchor must be a reference input");
        let spend_inputs = body.inputs();
        for i in 0..spend_inputs.len() {
            assert_ne!(
                hex::encode(spend_inputs.get(i).transaction_id().to_bytes()),
                "2222222222222222222222222222222222222222222222222222222222222222",
                "DID anchor must be READ, never SPENT"
            );
        }

        // Registry UTxO IS a spend input.
        let mut registry_spent = false;
        for i in 0..spend_inputs.len() {
            if hex::encode(spend_inputs.get(i).transaction_id().to_bytes())
                == "1111111111111111111111111111111111111111111111111111111111111111"
            { registry_spent = true; }
        }
        assert!(registry_spent, "registry UTxO must be spent");

        // Controller required signer.
        let (_, controller_keyhash) = derive_controller(&controller_kek).unwrap();
        let req = body.required_signers().expect("required signers set");
        assert_eq!(req.len(), 1);
        assert_eq!(req.get(0).to_bytes(), controller_keyhash.to_bytes());

        // Spend redeemer present + script_data_hash + continuing output keeps the NFT.
        let redeemers = wit.redeemers().expect("redeemers present");
        let mut has_spend = false;
        for i in 0..redeemers.len() {
            if redeemers.get(i).tag() == csl::RedeemerTag::new_spend() { has_spend = true; }
        }
        assert!(has_spend, "an Update spend redeemer is present");
        assert!(body.script_data_hash().is_some());

        // Continuing output: the Registry-NFT is preserved at some output.
        let (_addr, script_hash) = derive_taad_script_address(MOCK_REGISTRY_SCRIPT, 0).unwrap();
        let expected_name = registry_nft_asset_name(GOVERNING_DID).unwrap();
        let outs = body.outputs();
        let mut nft_preserved = false;
        for i in 0..outs.len() {
            if let Some(ma) = outs.get(i).amount().multiasset() {
                if let Some(assets) = ma.get(&script_hash) {
                    if assets.get(&expected_name).map(|q| q == BigNum::from(1u64)).unwrap_or(false) {
                        nft_preserved = true;
                    }
                }
            }
        }
        assert!(nft_preserved, "continuing output must keep the Registry-NFT");
    }

    // ─── MINT VIA REGISTRY ─────────────────────────────────────────

    fn mock_registry_ref_utxo() -> &'static str {
        r#"{"tx_hash":"3333333333333333333333333333333333333333333333333333333333333333",
            "index":0,"amount_lovelace":2000000}"#
    }

    /// SinglePkh authority: one KEK → registry reference + 1 required signer +
    /// correct minted asset.
    #[test]
    fn mint_via_registry_single_authority() {
        let auth_kek = "7a".repeat(32);
        let wallet_seed = "34".repeat(32);
        let keks = format!(r#"["{}"]"#, auth_kek);
        let mint_json = format!(r#"{{"asset_name_hex":"{}","amount":500}}"#, hex::encode(b"BADGE"));

        let tx_hex = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            "", "", // uncapped: no supply_state
            mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("single-authority mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let body = tx.body();
        let wit = tx.witness_set();

        // Registry is a reference input.
        let ref_inputs = body.reference_inputs().expect("reference inputs set");
        assert_eq!(ref_inputs.len(), 1);
        assert_eq!(
            hex::encode(ref_inputs.get(0).transaction_id().to_bytes()),
            "3333333333333333333333333333333333333333333333333333333333333333"
        );

        // Exactly 1 required signer = the single authority.
        let (_, auth_keyhash) = derive_controller(&auth_kek).unwrap();
        let req = body.required_signers().expect("required signers set");
        assert_eq!(req.len(), 1, "SinglePkh → exactly 1 required signer");
        assert_eq!(req.get(0).to_bytes(), auth_keyhash.to_bytes());

        // 2 vkeys: wallet + 1 authority.
        assert_eq!(wit.vkeys().unwrap().len(), 2);

        // Minted asset = 500 token under the token policy with the right name.
        let token_script = csl::PlutusScript::from_hex_with_version(MOCK_TOKEN_POLICY, &csl::Language::new_plutus_v3()).unwrap();
        let token_policy = token_script.hash();
        let expected_name = AssetName::new(b"BADGE".to_vec()).unwrap();
        let mint = body.mint().expect("mint set");
        let mints_assets = mint.get(&token_policy).expect("mint entry for token policy");
        let mut total: i128 = 0;
        for i in 0..mints_assets.len() {
            if let Some(v) = mints_assets.get(i).unwrap().get(&expected_name) {
                total += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(total, 500, "exactly +500 token minted under the policy");
    }

    /// MultiSig authority: 2 KEKs → 2 distinct required signers + 3 vkeys
    /// (wallet + 2 authorities).
    #[test]
    fn mint_via_registry_multisig_two_required_signers() {
        let kek1 = "7a".repeat(32);
        let kek2 = "5c".repeat(32);
        let wallet_seed = "34".repeat(32);
        let keks = format!(r#"["{}","{}"]"#, kek1, kek2);
        let mint_json = format!(r#"{{"asset_name_hex":"{}","amount":1}}"#, hex::encode(b"VOUCH"));

        let tx_hex = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            "", "", // uncapped: no supply_state
            mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("multisig mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let body = tx.body();
        let wit = tx.witness_set();

        let req = body.required_signers().expect("required signers set");
        assert_eq!(req.len(), 2, "MultiSig (2 keys) → 2 required signers");
        let (_, kh1) = derive_controller(&kek1).unwrap();
        let (_, kh2) = derive_controller(&kek2).unwrap();
        let req_set: Vec<Vec<u8>> = (0..req.len()).map(|i| req.get(i).to_bytes()).collect();
        assert!(req_set.contains(&kh1.to_bytes()), "authority 1 in required signers");
        assert!(req_set.contains(&kh2.to_bytes()), "authority 2 in required signers");

        // 3 vkeys: wallet + 2 authorities.
        assert_eq!(wit.vkeys().unwrap().len(), 3, "wallet + 2 authority signatures");
    }

    /// Empty authority KEK list is rejected.
    #[test]
    fn mint_via_registry_rejects_empty_authority() {
        let err = build_mint_via_registry(
            "[]", mock_registry_ref_utxo(), MOCK_TOKEN_POLICY,
            r#"{"asset_name_hex":"4241444745","amount":1}"#,
            "", "",
            mock_wallet_utxos(), mock_params(), &"34".repeat(32), 0, 2000,
        )
        .expect_err("empty authority must be rejected");
        assert!(err.contains("≥1 controller KEK"), "got: {err}");
    }

    /// amount == 0 is rejected.
    #[test]
    fn mint_via_registry_rejects_zero_amount() {
        let err = build_mint_via_registry(
            &format!(r#"["{}"]"#, "7a".repeat(32)), mock_registry_ref_utxo(), MOCK_TOKEN_POLICY,
            r#"{"asset_name_hex":"4241444745","amount":0}"#,
            "", "",
            mock_wallet_utxos(), mock_params(), &"34".repeat(32), 0, 2000,
        )
        .expect_err("zero amount must be rejected");
        assert!(err.contains("amount must be > 0"), "got: {err}");
    }

    // ─── SUPPLY STATE — encode + genesis + capped mint ─────────────

    /// A fourth distinct minimal V3 script standing in as the supply_state
    /// validator, so its hash (= SupplyState NFT policy) differs from token/registry.
    const MOCK_SUPPLY_STATE_SCRIPT: &str = "4e4d0100003322222005120012bbff";

    /// SupplyStateDatum = Constr 0 [Int minted_total, Bytes(28) lamp_policy,
    /// Bytes lamp_asset_name] — decode + assert positional layout (contract w/ supply.ak).
    #[test]
    fn encode_supply_state_datum_layout() {
        let lamp_policy = "ab".repeat(28); // 28-byte policy hex
        let lamp_name = AssetName::new(b"LAMP".to_vec()).unwrap();
        let data = encode_supply_state_datum(0, &lamp_policy, &lamp_name).unwrap();

        let constr = data.as_constr_plutus_data().expect("datum is constr");
        assert_eq!(constr.alternative(), BigNum::from(0u64), "SupplyStateDatum = constr 0");
        assert_eq!(constr.data().len(), 3, "3 fields: [minted_total, lamp_policy, lamp_asset_name]");

        // Field 0: minted_total Int == 0.
        let total = constr.data().get(0).as_integer().expect("field 0 is int");
        assert_eq!(total, csl::BigInt::from_str("0").unwrap(), "minted_total = 0 at genesis");
        // Field 1: lamp_policy Bytes(28).
        let pol = constr.data().get(1).as_bytes().expect("field 1 is bytes");
        assert_eq!(pol, hex::decode(&lamp_policy).unwrap());
        assert_eq!(pol.len(), 28, "lamp_policy is a 28-byte PolicyId");
        // Field 2: lamp_asset_name raw bytes == "LAMP".
        let name = constr.data().get(2).as_bytes().expect("field 2 is bytes");
        assert_eq!(name, b"LAMP".to_vec(), "lamp_asset_name = raw asset-name bytes");
    }

    /// Non-zero minted_total encodes the right Int (used by the spend continuing datum).
    #[test]
    fn encode_supply_state_datum_nonzero_total() {
        let lamp_policy = "cd".repeat(28);
        let lamp_name = AssetName::new(b"LAMP".to_vec()).unwrap();
        let data = encode_supply_state_datum(6_000_000, &lamp_policy, &lamp_name).unwrap();
        let constr = data.as_constr_plutus_data().unwrap();
        assert_eq!(
            constr.data().get(0).as_integer().unwrap(),
            csl::BigInt::from_str("6000000").unwrap()
        );
    }

    /// Bad lamp_policy length is rejected.
    #[test]
    fn encode_supply_state_datum_rejects_bad_policy() {
        let lamp_name = AssetName::new(b"LAMP".to_vec()).unwrap();
        let err = encode_supply_state_datum(0, &"ab".repeat(20), &lamp_name).unwrap_err();
        assert!(err.contains("28 bytes"), "got: {err}");
    }

    /// Genesis supply_state: SupplyState NFT minted under the supply_state policy
    /// (= script hash) with name = state_name, genesis UTxO SPENT (one-shot), output
    /// at script addr carries an inline datum with minted_total == 0.
    #[test]
    fn genesis_supply_state_mints_nft_total_zero() {
        let wallet_seed = "34".repeat(32);
        let state_name_hex = hex::encode(b"LAMP-SUPPLY");
        let lamp_policy = "ab".repeat(28);
        let lamp_name_hex = hex::encode(b"LAMP");

        let tx_hex = build_genesis_supply_state(
            mock_genesis_utxo(), &state_name_hex, &lamp_policy, &lamp_name_hex,
            MOCK_SUPPLY_STATE_SCRIPT, mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("genesis supply_state must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).expect("valid tx CBOR");
        let body = tx.body();
        let wit = tx.witness_set();

        // SupplyState NFT minted under the supply_state policy = script hash, name = state_name.
        let script = csl::PlutusScript::from_hex_with_version(MOCK_SUPPLY_STATE_SCRIPT, &csl::Language::new_plutus_v3()).unwrap();
        let policy_id = script.hash();
        let expected_name = AssetName::new(b"LAMP-SUPPLY".to_vec()).unwrap();
        let mint = body.mint().expect("mint set");
        let mints_assets = mint.get(&policy_id).expect("mint entry for supply_state policy");
        let mut total: i128 = 0;
        for i in 0..mints_assets.len() {
            if let Some(v) = mints_assets.get(i).unwrap().get(&expected_name) {
                total += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(total, 1, "exactly +1 SupplyState NFT with state_name");

        // Genesis UTxO must be SPENT (one-shot binding).
        let inputs = body.inputs();
        let mut genesis_spent = false;
        for i in 0..inputs.len() {
            if hex::encode(inputs.get(i).transaction_id().to_bytes())
                == "7777777777777777777777777777777777777777777777777777777777777777"
            { genesis_spent = true; }
        }
        assert!(genesis_spent, "genesis UTxO must be consumed (one-shot)");

        // Output at the supply_state script addr carries the NFT + inline datum minted_total=0.
        let (script_addr, _) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let outs = body.outputs();
        let mut found = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() != script_addr.to_bech32(None).unwrap() { continue; }
            let has_nft = o.amount().multiasset()
                .and_then(|ma| ma.get(&policy_id))
                .and_then(|a| a.get(&expected_name))
                .map(|q| q == BigNum::from(1u64)).unwrap_or(false);
            if !has_nft { continue; }
            let pd = o.plutus_data().expect("inline datum present");
            let constr = pd.as_constr_plutus_data().expect("datum is constr");
            assert_eq!(constr.alternative(), BigNum::from(0u64));
            assert_eq!(constr.data().get(0).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "minted_total = 0");
            // lamp_policy preserved.
            assert_eq!(constr.data().get(1).as_bytes().unwrap(), hex::decode(&lamp_policy).unwrap());
            found = true;
        }
        assert!(found, "SupplyState output at script addr with NFT + datum(total=0) must exist");

        // Plutus mint witness + script_data_hash present; wallet vkey signs.
        assert_eq!(wit.plutus_scripts().unwrap().len(), 1);
        assert!(body.script_data_hash().is_some());
        assert_eq!(wit.vkeys().unwrap().len(), 1, "wallet signature");
    }

    /// Build a SupplyState spend-UTxO JSON: outpoint + value (NFT) + old datum fields.
    fn mock_supply_state_spend_utxo(minted_total: u64) -> String {
        let (_addr, ss_hash) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let ss_policy_hex = hex::encode(ss_hash.to_bytes());
        let ss_name_hex = hex::encode(b"LAMP-SUPPLY");
        // The counted token = the MOCK_TOKEN_POLICY (= did_token_mint stand-in), name "LAMP".
        let token_script = csl::PlutusScript::from_hex_with_version(MOCK_TOKEN_POLICY, &csl::Language::new_plutus_v3()).unwrap();
        let lamp_policy_hex = hex::encode(token_script.hash().to_bytes());
        let lamp_name_hex = hex::encode(b"LAMP");
        format!(
            r#"{{"tx_hash":"4444444444444444444444444444444444444444444444444444444444444444",
                 "index":0,"amount_lovelace":2000000,
                 "assets":[{{"policy_id":"{ss_policy_hex}","asset_name_hex":"{ss_name_hex}","quantity":1}}],
                 "supply_state_nft_policy_hex":"{ss_policy_hex}",
                 "supply_state_nft_name_hex":"{ss_name_hex}",
                 "minted_total":{minted_total},
                 "lamp_policy_hex":"{lamp_policy_hex}",
                 "lamp_asset_name_hex":"{lamp_name_hex}"}}"#
        )
    }

    /// Capped mint: SupplyState is SPENT (not referenced), continuing output bumps
    /// minted_total by the mint amount, registry stays a reference input, the token
    /// mint witness + authority signer are present, and the lamp_policy is preserved.
    #[test]
    fn mint_via_registry_capped_spends_supply_state_and_bumps_total() {
        let auth_kek = "7a".repeat(32);
        let wallet_seed = "34".repeat(32);
        let keks = format!(r#"["{}"]"#, auth_kek);
        let amount: u64 = 5_000_000;
        let mint_json = format!(r#"{{"asset_name_hex":"{}","amount":{}}}"#, hex::encode(b"LAMP"), amount);
        let old_total: u64 = 1_000_000;
        let ss_json = mock_supply_state_spend_utxo(old_total);

        let tx_hex = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            &ss_json, MOCK_SUPPLY_STATE_SCRIPT,
            mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("capped mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let body = tx.body();
        let wit = tx.witness_set();

        // Registry is a REFERENCE input; SupplyState is NOT referenced.
        let ref_inputs = body.reference_inputs().expect("reference inputs set");
        let mut registry_ref = false;
        for i in 0..ref_inputs.len() {
            let h = hex::encode(ref_inputs.get(i).transaction_id().to_bytes());
            assert_ne!(h, "4444444444444444444444444444444444444444444444444444444444444444",
                "SupplyState must be SPENT, never referenced");
            if h == "3333333333333333333333333333333333333333333333333333333333333333" { registry_ref = true; }
        }
        assert!(registry_ref, "registry must be a reference input");

        // SupplyState UTxO is a SPEND input.
        let spend_inputs = body.inputs();
        let mut ss_spent = false;
        for i in 0..spend_inputs.len() {
            if hex::encode(spend_inputs.get(i).transaction_id().to_bytes())
                == "4444444444444444444444444444444444444444444444444444444444444444"
            { ss_spent = true; }
        }
        assert!(ss_spent, "SupplyState UTxO must be a spend input");

        // A spend redeemer is present (the CountMint for supply_state).
        let redeemers = wit.redeemers().expect("redeemers present");
        let mut has_spend = false;
        let mut has_mint = false;
        for i in 0..redeemers.len() {
            match redeemers.get(i).tag() {
                t if t == csl::RedeemerTag::new_spend() => has_spend = true,
                t if t == csl::RedeemerTag::new_mint() => has_mint = true,
                _ => {}
            }
        }
        assert!(has_spend, "supply_state spend (CountMint) redeemer present");
        assert!(has_mint, "did_token_mint mint redeemer present");

        // Token minted = amount under the token policy.
        let token_script = csl::PlutusScript::from_hex_with_version(MOCK_TOKEN_POLICY, &csl::Language::new_plutus_v3()).unwrap();
        let token_policy = token_script.hash();
        let lamp_name = AssetName::new(b"LAMP".to_vec()).unwrap();
        let mint = body.mint().expect("mint set");
        let mints_assets = mint.get(&token_policy).expect("mint entry for token policy");
        let mut minted: i128 = 0;
        for i in 0..mints_assets.len() {
            if let Some(v) = mints_assets.get(i).unwrap().get(&lamp_name) {
                minted += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(minted, amount as i128, "minted exactly `amount` LAMP");

        // Continuing SupplyState output at the supply_state script addr: NFT preserved,
        // datum minted_total' = old_total + amount, lamp_policy preserved.
        let (ss_addr, ss_hash) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let ss_name = AssetName::new(b"LAMP-SUPPLY".to_vec()).unwrap();
        let outs = body.outputs();
        let mut found_continuing = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() != ss_addr.to_bech32(None).unwrap() { continue; }
            let has_nft = o.amount().multiasset()
                .and_then(|ma| ma.get(&ss_hash))
                .and_then(|a| a.get(&ss_name))
                .map(|q| q == BigNum::from(1u64)).unwrap_or(false);
            if !has_nft { continue; }
            let pd = o.plutus_data().expect("inline datum present on continuing output");
            let constr = pd.as_constr_plutus_data().unwrap();
            assert_eq!(
                constr.data().get(0).as_integer().unwrap(),
                csl::BigInt::from_str(&(old_total + amount).to_string()).unwrap(),
                "minted_total' = old_total + amount"
            );
            let lamp_policy_hex = hex::encode(token_policy.to_bytes());
            assert_eq!(
                constr.data().get(1).as_bytes().unwrap(),
                hex::decode(&lamp_policy_hex).unwrap(),
                "lamp_policy preserved (s8)"
            );
            assert_eq!(constr.data().get(2).as_bytes().unwrap(), b"LAMP".to_vec(), "lamp_asset_name preserved (s8)");
            found_continuing = true;
        }
        assert!(found_continuing, "continuing SupplyState output with bumped datum must exist");

        // Authority required signer present.
        let (_, auth_keyhash) = derive_controller(&auth_kek).unwrap();
        let req = body.required_signers().expect("required signers set");
        assert!((0..req.len()).any(|i| req.get(i).to_bytes() == auth_keyhash.to_bytes()),
            "authority is a required signer");
    }
}
