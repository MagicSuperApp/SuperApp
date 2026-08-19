// ================================================================
// PhoenixKey — Mint LAMP theo cổng on-chain THẬT (bản B canonical, cap-36B
// OrgDID lazy-mint, chốt 2026-07-06 — xem LAMP/SPEC/lamp-mint-core-adapter.md).
//
// THAY mô hình bản A (v1) trước đây ở file này: KHÔNG còn đọc controller_pkh từ
// TAAD anchor ref-input làm WHO-gate. `lamp_mint` v2 (registry.ak, token-mint v2)
// đọc bảng Registry (token_tag → Authority) do OrgDID quản — anchor ref-input CHỈ
// còn dùng ở tầng registry_write (`registry_mint::build_update_mint_registry`,
// KHÔNG thuộc builder này). Builder ở ĐÂY đọc authority TRỰC TIẾP từ RegistryDatum
// (decode raw inline_datum_hex — Dart/Flutter không có thư viện CBOR/Plutus-Data
// nên Rust là điểm decode DUY NHẤT, xem `registry_mint::decode_registry_datum`).
//
// BA VALIDATOR GHÉP TRONG 1 TX (spec adapter §0):
//   • `lamp_mint`    (mint, redeemer DistributionVest) — gate AI (Registry) +
//                     tên token + route + A-DEST (rót Δ LAMP vào KHO).
//   • `supply_state` (spend, redeemer Advance)         — gate BAO NHIÊU (cap).
//   • `registry`     (reference input, KHÔNG spend)     — bảng token_tag→Authority.
//
// CÔNG THỨC TX (spec adapter §4), route DistributionVest (route DUY NHẤT builder
// này hỗ trợ — ReserveDraw permissionless/DAO, không đi qua chữ ký OrgDID):
//   Inputs (spend):        SupplyState UTxO (SUPPLY NFT, redeemer Advance) + ví.
//   Reference inputs:      Registry NFT UTxO (đọc authority) + KHO NFT UTxO (đọc
//                          kho_hash ĐỘNG — A-DEST, KHÔNG bake hash tĩnh).
//   Mint:                  +Δ (lamp_policy, token_name) — redeemer DistributionVest.
//   Outputs:                SupplyState continuing (SUPPLY NFT + minADA, datum
//                          {dist_minted+Δ, reserve_minted, dist_cap, reserve_cap}
//                          — 3 field sau GIỮ NGUYÊN) + KHO nhận ≥Δ LAMP (A-DEST,
//                          KHÔNG ra ví).
//   Required signers:      authority của registry entry `token_tag` (SinglePkh →
//                          1 pkh; MultiSig → đủ m pkh do caller cung cấp KEK).
//
// ĐƠN VỊ: amount = oil (1 LAMP = 10^6 base). Builder KHÔNG nhân đổi — caller
// (super-app) truyền Δ ở base unit, giống mọi field oil khác (spec adapter §7).
//
// SCOPE / phần CALLER (super-app team) vẫn nắm: fetch UTxO (registry/supply_state/
// kho/ví) + protocol params qua ChainDataService, evaluate-then-patch ExUnits
// trước submit (ExUnits ở đây là ước lượng TĨNH bảo thủ), và submit + neo CID.
// ================================================================

use cardano_serialization_lib as csl;
use cardano_serialization_lib::{
    Address, AssetName, BigNum, Int, MultiAsset, PlutusData, Transaction, TransactionHash,
    TransactionInput, TransactionOutputBuilder, TransactionWitnessSet, Value, Vkeywitnesses,
};
use serde::Deserialize;
use serde_json::Value as JsonValue;
use zeroize::Zeroizing;

use crate::registry_mint::{
    decode_registry_datum, decode_supply_state_datum, derive_controller, encode_supply_state_datum,
    find_registry_authority, rebuild_value, supply_state_spend_redeemer_data, DecodedAuthority,
};
use crate::taad_did::{
    build_tx_builder, derive_taad_script_address, derive_wallet, extract_coins_per_utxo_size,
    pick_largest_utxo, Blake2b256, UtxoAsset, UtxoInput,
};
use blake2::Digest;

/// Conservative static ExUnits for the LAMP mint (mem units). The combined gate
/// (registry lookup + SupplyState transition + A-DEST qty_to_script fold) is a
/// small bounded predicate, so real usage is well under this. Submit paths MUST
/// evaluate-then-patch (Blockfrost `/utils/txs/evaluate` or ogmios EvaluateTx).
const LAMP_MINT_EX_UNITS_MEM: u64 = 3_000_000;
/// Conservative static ExUnits for the LAMP mint (cpu steps).
const LAMP_MINT_EX_UNITS_STEPS: u64 = 1_000_000_000;
/// Conservative static ExUnits for the SupplyState spend (Advance) — small,
/// no branching beyond "is there a mint".
const SUPPLY_STATE_EX_UNITS_MEM: u64 = 1_000_000;
const SUPPLY_STATE_EX_UNITS_STEPS: u64 = 400_000_000;

/// The Registry UTxO — a REFERENCE input (read, never spent). Unlike the generic
/// `registry_mint::RefUtxo`, this ALSO carries `inline_datum_hex` — the builder
/// decodes it locally to read authority for `token_tag` (item §8 adapter: "builder
/// mint đọc authority TỪ RegistryDatum", not trust a caller-supplied blind claim).
#[derive(Deserialize, Debug, Clone)]
struct RegistryRefUtxo {
    tx_hash: String,
    index: u32,
    /// The registry UTxO's inline `RegistryDatum` (Blockfrost `inline_datum`,
    /// CBOR-hex, passed through unmodified). REQUIRED — without it the builder
    /// cannot resolve authority and must refuse to build an unsignable tx.
    inline_datum_hex: String,
}

/// The SupplyState UTxO — SPENT (redeemer `Advance`). Carries the SUPPLY NFT +
/// its CURRENT inline `SupplyState` datum, decoded locally (same reasoning as the
/// registry: Dart cannot decode CBOR/Plutus-Data, so the builder reads dist_minted/
/// reserve_minted/dist_cap/reserve_cap straight from the chain-fetched datum hex
/// instead of trusting a caller-supplied plain-int claim).
#[derive(Deserialize, Debug, Clone)]
struct SupplyStateRefUtxo {
    tx_hash: String,
    index: u32,
    amount_lovelace: u64,
    /// All multi-asset entries currently on the UTxO (must include the SUPPLY
    /// NFT under `thread_nft_policy`). Preserved verbatim on the continuing output
    /// (value preservation — lamp_mint §Luật 1/D8-#1 neo bằng NFT, không hash).
    #[serde(default)]
    assets: Vec<UtxoAsset>,
    /// Current inline `SupplyState` datum (Blockfrost `inline_datum`, CBOR-hex).
    inline_datum_hex: String,
}

/// The KHO UTxO — a REFERENCE input (read, never spent) carrying the KHO NFT.
/// `lamp_mint` reads `kho_hash` DYNAMICALLY from whichever output currently holds
/// this NFT (`util.script_hash_of_holder`) — it is NOT baked as a policy param, so
/// the caller must resolve the CURRENT holder off-chain and pass its address here.
/// The A-DEST output is built at this EXACT address (any address sharing its
/// payment credential also satisfies `qty_to_script`, but reusing the address
/// itself is the simplest correct choice).
///
/// # Caller contract (super-app / Dart) — ATOMICITY
/// Rust has no chain access, so it CANNOT verify that `address` is really the
/// address currently sitting at outpoint `tx_hash:index` — that binding is only
/// as good as how the caller assembled this struct. `address` and `tx_hash`/
/// `index` MUST come from the SAME UTxO-query response (e.g. one Blockfrost
/// `/addresses/{addr}/utxos` or `/txs/{hash}/utxos` call), never stitched
/// together from two separate fetches/caches taken at different times. If the
/// KHO NFT has since moved (or the two fields are read from stale/mismatched
/// sources), the reference input resolves to a DIFFERENT on-chain UTxO than the
/// one `address` describes, `lamp_mint`'s `qty_to_script` check targets the
/// wrong output, and the tx is rejected on submit (fee/collateral lost, no
/// LAMP moved). Builder-side: see the script-address assert below (§2b), which
/// catches the most common failure mode (a plain wallet address pasted in by
/// mistake — PoC finding 2) but CANNOT catch a stale-but-still-script address.
#[derive(Deserialize, Debug, Clone)]
struct KhoRefUtxo {
    tx_hash: String,
    index: u32,
    /// Bech32 address CURRENTLY holding the KHO NFT — the A-DEST output target.
    /// MUST be fetched atomically with `tx_hash`/`index` — see struct doc.
    address: String,
}

/// The LAMP mint instruction: asset name (as baked into the deployed `lamp_mint`
/// policy — "tLAMP" testnet / "LAMP" mainnet) + how much to mint (Δ, oil/base
/// unit, > 0). No `recipient_address` — bản B is A-DEST-only, the mint ALWAYS
/// lands at the KHO (never a wallet); see spec adapter §4/§1-4.
#[derive(Deserialize, Debug, Clone)]
struct MintInstruction {
    /// LAMP asset name in hex, as baked into `lamp_policy_cbor_hex`'s `token_name`
    /// param. May be empty for a no-name asset (not the LAMP case in practice).
    #[serde(default)]
    token_name_hex: String,
    /// Δ LAMP to mint, oil/base unit (1 LAMP = 10^6 oil). Must be > 0.
    amount: u64,
}

/// Choose the wallet UTxO that funds the fee/min-ada, distinct from the
/// SupplyState outpoint (`ss_tx_hash:ss_index`), and the `Value` to declare
/// for it on the tx input.
///
/// Prefers the largest PURE-ADA UTxO (`assets.is_empty()`) — same rule as
/// collateral selection (§6 in the caller). `pick_largest_utxo` alone picks by
/// lovelace across the WHOLE wallet with no regard for whether the winner also
/// carries a native asset; if it does and the caller declares the input
/// `Value` as pure lovelace (the pre-fix behavior), that asset silently drops
/// out of the tx's value balance — the node rejects phase-1
/// (`ValueNotConservedUTxO`) on submit, AFTER the builder already returned a
/// "signed tx" to the caller. Falls back to the overall-largest UTxO ONLY when
/// no pure-ADA UTxO exists, and in that case declares its FULL value (lovelace
/// plus assets) via `rebuild_value` — `add_change_if_needed` then automatically
/// routes any foreign asset back to the wallet's own change output, so it is
/// never lost. Chose this fallback over hard-erroring because `rebuild_value`
/// plus the caller's existing change-output path already handle it safely;
/// erroring out would needlessly refuse a wallet that simply doesn't happen to
/// hold a spare pure-ADA UTxO (note collateral selection downstream still
/// independently requires ≥1 pure-ADA UTxO, so a wallet with NONE at all will
/// still be refused overall — just with a clear collateral-specific reason
/// instead of a silently-broken tx).
fn pick_fee_utxo<'a>(
    utxos: &'a [UtxoInput],
    ss_tx_hash: &str,
    ss_index: u32,
) -> Result<(&'a UtxoInput, Value), String> {
    let is_supply_state_utxo = |u: &UtxoInput| u.tx_hash == ss_tx_hash && u.index == ss_index;
    let pure_ada_pick = utxos
        .iter()
        .filter(|u| u.assets.is_empty() && !is_supply_state_utxo(u))
        .max_by_key(|u| u.amount_lovelace);
    match pure_ada_pick {
        Some(u) => Ok((u, Value::new(&BigNum::from(u.amount_lovelace)))),
        None => {
            let fallback = pick_largest_utxo(utxos).map_err(|e| e.to_string())?;
            if is_supply_state_utxo(fallback) {
                return Err("utxos_json fee UTxO must be distinct from the SupplyState UTxO".into());
            }
            let v = rebuild_value(fallback.amount_lovelace, &fallback.assets)?;
            Ok((fallback, v))
        }
    }
}

/// Build + sign a bản-B LAMP mint tx (DistributionVest route), authorized by the
/// Registry (token-mint v2). Returns hex-encoded signed tx CBOR, or an error
/// string. Submit the CBOR via the caller's data provider (evaluate-then-patch
/// ExUnits first).
///
/// # Inputs
/// * `authority_keks_json`      — JSON array of 32-byte Master_KEK hex, one per
///   signing authority key: exactly 1 for a `SinglePkh` registry entry, ≥ the
///   entry's `threshold` for `MultiSig` (each KEK derives an Ed25519 key via
///   `sign::derive_taad_seed`, the SAME single-source-of-truth genesis/rotate/mint
///   use). The builder VALIDATES every derived pkh against the entry decoded from
///   `registry_utxo_json` BEFORE building the tx (fail-fast — never emits a tx the
///   on-chain `registry.validate_mint` would reject for a signer mismatch).
/// * `registry_utxo_json`       — JSON [`RegistryRefUtxo`] (the Registry UTxO,
///   with its inline `RegistryDatum`). Set as a REFERENCE INPUT (read, not spent).
/// * `token_tag_hex`            — the registry entry `token_tag` to look up (hex
///   bytes — a deploy-time param baked into `lamp_mint`, e.g. `#"4c414d50746167"`).
/// * `supply_state_utxo_json`   — JSON [`SupplyStateRefUtxo`] (the SupplyState
///   UTxO, with its CURRENT inline `SupplyState` datum). SPENT (redeemer Advance).
/// * `supply_state_script_cbor` — compiled Plutus V3 `supply_state` script (CBOR
///   hex). Its hash = the address the SupplyState UTxO lives at (spend witness +
///   continuing output target — the on-chain gate requires `s_out.address ==
///   s_in.address`, and this validator's own script address IS that address).
/// * `kho_utxo_json`            — JSON [`KhoRefUtxo`] (the KHO UTxO, carrying the
///   KHO NFT). Set as a REFERENCE INPUT (read, not spent) — `lamp_mint` reads the
///   A-DEST hash from whichever output currently holds this NFT.
/// * `lamp_policy_cbor_hex`     — compiled Plutus V3 `lamp_mint` script (CBOR
///   hex). Its hash = the LAMP policy id (the mint witness script).
/// * `mint_json`                — JSON [`MintInstruction`] (`token_name_hex`, `amount`).
/// * `utxos_json`                — JSON array of [`UtxoInput`] for the WALLET
///   (funds fee + min-ada + collateral; collateral MUST be pure-ADA).
/// * `protocol_params_json`     — Blockfrost `/epochs/latest/parameters` JSON.
/// * `wallet_seed_hex`          — 32-byte CIP-1852 entropy (64 hex) for the
///   payment key that funds the tx + receives change.
/// * `network`                  — 0 = testnet (preprod/preview), 1 = mainnet.
/// * `current_slot`             — Cardano tip slot (TTL = `current_slot + 7200`).
#[allow(clippy::too_many_arguments)]
pub fn build_mint_lamp_via_did(
    authority_keks_json: &str,
    registry_utxo_json: &str,
    token_tag_hex: &str,
    supply_state_utxo_json: &str,
    supply_state_script_cbor: &str,
    kho_utxo_json: &str,
    lamp_policy_cbor_hex: &str,
    mint_json: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    wallet_seed_hex: &str,
    network: u8,
    current_slot: u64,
) -> Result<String, String> {
    // ─── 1. Parse + validate straightforward inputs ────────────────
    let mint: MintInstruction = serde_json::from_str(mint_json)
        .map_err(|e| format!("mint_json invalid: {}", e))?;
    if mint.amount == 0 {
        return Err("mint_json.amount must be > 0 (nothing to mint)".into());
    }
    let token_name = if mint.token_name_hex.is_empty() {
        AssetName::new(Vec::new())
            .map_err(|_| "empty token_name failed (unreachable)".to_string())?
    } else {
        let name_bytes = hex::decode(&mint.token_name_hex)
            .map_err(|e| format!("mint_json.token_name_hex not hex: {}", e))?;
        AssetName::new(name_bytes)
            .map_err(|_| "mint_json.token_name_hex too long (>32 bytes)".to_string())?
    };

    let token_tag =
        hex::decode(token_tag_hex).map_err(|e| format!("token_tag_hex not valid hex: {}", e))?;

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex is not valid hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to 32 bytes".into());
    }
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxos_json)
        .map_err(|e| format!("utxos_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — provide ≥1 funded wallet UTxO (fee + collateral)".into());
    }

    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|e| format!("protocol_params_json invalid: {}", e))?;

    let registry: RegistryRefUtxo = serde_json::from_str(registry_utxo_json)
        .map_err(|e| format!("registry_utxo_json invalid: {}", e))?;
    if registry.inline_datum_hex.trim().is_empty() {
        return Err("registry_utxo_json.inline_datum_hex is empty — cannot resolve authority \
                     (registry UTxO must carry its inline RegistryDatum)"
            .into());
    }

    let supply_state: SupplyStateRefUtxo = serde_json::from_str(supply_state_utxo_json)
        .map_err(|e| format!("supply_state_utxo_json invalid: {}", e))?;
    if supply_state.amount_lovelace == 0 {
        return Err("supply_state_utxo_json.amount_lovelace must be > 0".into());
    }
    if supply_state.inline_datum_hex.trim().is_empty() {
        return Err(
            "supply_state_utxo_json.inline_datum_hex is empty — cannot resolve current \
             dist_minted/reserve_minted/caps (SupplyState UTxO must carry its inline datum)"
                .into(),
        );
    }

    let kho: KhoRefUtxo = serde_json::from_str(kho_utxo_json)
        .map_err(|e| format!("kho_utxo_json invalid: {}", e))?;
    if kho.address.trim().is_empty() {
        return Err("kho_utxo_json.address must not be empty (A-DEST target)".into());
    }
    let kho_addr_obj = Address::from_bech32(&kho.address)
        .map_err(|_| "kho_utxo_json.address is not a valid bech32 address".to_string())?;
    // §2b — KHO theo thiết kế LUÔN ở địa chỉ SCRIPT (A-DEST validator ép payment
    // credential = script hash trong `qty_to_script`, xem taad_logic.ak). Rust
    // không có chain access để verify `address` khớp `tx_hash:index` (xem doc-
    // comment `KhoRefUtxo` — caller phải fetch atomic), nhưng CÓ THỂ verify rẻ
    // rằng địa chỉ truyền vào ít nhất ĐÚNG LOẠI script — bắt đúng PoC finding 2
    // (truyền nhầm địa chỉ ví payment-key thường làm mint LAMP "thành công" ở
    // Rust nhưng gãy on-chain / rót nhầm LAMP ra ngoài kho).
    let kho_payment_cred = kho_addr_obj.payment_cred().ok_or_else(|| {
        "kho_utxo_json.address has no payment credential (Byron/malformed address \
         not supported for KHO — must be a script address)"
            .to_string()
    })?;
    if !kho_payment_cred.has_script_hash() {
        return Err(
            "kho_utxo_json.address is a payment-KEY address, not a SCRIPT address — \
             KHO (A-DEST) phải luôn ở địa chỉ script; truyền nhầm địa chỉ ví thường sẽ \
             mint LAMP ra ngoài kho theo thiết kế (kiểm tra lại nguồn fetch địa chỉ kho)"
                .to_string(),
        );
    }

    // ─── 2. WHO — decode RegistryDatum, resolve + validate authority ─
    // Read authority DIRECTLY from the registry's on-chain datum (item §8 adapter:
    // NOT the bản-A model of a caller-asserted controller_pkh). Fail-closed exactly-1
    // entry match (registry.ak read-side defense — no first-match on a duplicate tag).
    let registry_datum = decode_registry_datum(&registry.inline_datum_hex)?;
    let authority = find_registry_authority(&registry_datum, &token_tag)?;

    let auth_keks: Vec<String> = serde_json::from_str(authority_keks_json)
        .map_err(|e| format!("authority_keks_json invalid (expected JSON array of hex): {}", e))?;
    if auth_keks.is_empty() {
        return Err("authority_keks_json must contain ≥1 controller KEK".into());
    }
    let mut auth_keys: Vec<(csl::PrivateKey, csl::Ed25519KeyHash)> = Vec::with_capacity(auth_keks.len());
    for kek in &auth_keks {
        auth_keys.push(derive_controller(kek)?);
    }

    // Validate the SUPPLIED authority keys actually satisfy the DECODED entry —
    // fail fast in Rust rather than build a tx `registry.validate_mint` would
    // reject on-chain (wastes no fee, gives the caller a clear Vietnamese reason).
    match authority {
        DecodedAuthority::SinglePkh(expected_pkh) => {
            if auth_keys.len() != 1 {
                return Err(format!(
                    "registry entry cho token_tag {} là SinglePkh — cần ĐÚNG 1 authority KEK, nhận {}",
                    hex::encode(&token_tag),
                    auth_keys.len()
                ));
            }
            let (_, pkh) = &auth_keys[0];
            if pkh.to_bytes() != *expected_pkh {
                return Err(format!(
                    "authority KEK không khớp SinglePkh trong registry (pkh derive = {}, registry pkh = {})",
                    hex::encode(pkh.to_bytes()),
                    hex::encode(expected_pkh)
                ));
            }
        }
        DecodedAuthority::MultiSig { pkhs, threshold } => {
            // Dedupe pkhs (mirror on-chain `list.unique` — audit MED 19/6 defense
            // against a datum with a repeated pkh phình threshold ảo).
            let mut uniq: Vec<Vec<u8>> = Vec::new();
            for p in pkhs {
                if !uniq.contains(p) {
                    uniq.push(p.clone());
                }
            }
            if *threshold == 0 || *threshold as usize > uniq.len() {
                return Err(format!(
                    "registry MultiSig entry độc: threshold {} ngoài phạm vi [1,{}] (N khoá duy nhất)",
                    threshold,
                    uniq.len()
                ));
            }
            // Every supplied KEK must derive to a pkh IN the entry (reject stray
            // keys — keeps required_signers a clean 1:1 with the registry entry).
            let mut matched_unique: Vec<Vec<u8>> = Vec::new();
            for (_, pkh) in &auth_keys {
                let pkh_bytes = pkh.to_bytes();
                if !uniq.contains(&pkh_bytes) {
                    return Err(format!(
                        "authority KEK (pkh {}) không có trong MultiSig registry entry (token_tag {})",
                        hex::encode(&pkh_bytes),
                        hex::encode(&token_tag)
                    ));
                }
                if !matched_unique.contains(&pkh_bytes) {
                    matched_unique.push(pkh_bytes);
                }
            }
            if (matched_unique.len() as u64) < *threshold {
                return Err(format!(
                    "MultiSig chưa đủ chữ ký: cần threshold {} khoá duy nhất, chỉ có {} KEK hợp lệ được truyền",
                    threshold,
                    matched_unique.len()
                ));
            }
        }
        DecodedAuthority::Revoked => {
            return Err(format!(
                "registry entry cho token_tag {} đã bị Revoked — mint bị từ chối",
                hex::encode(&token_tag)
            ));
        }
    }

    // ─── 3. HOW MUCH — decode current SupplyState, bump dist_minted, ─
    //         fail-fast cap check BEFORE building an unsubmittable tx ─
    let ss_state = decode_supply_state_datum(&supply_state.inline_datum_hex)?;
    let delta = mint.amount as u128;
    let dist_new = ss_state
        .dist_minted
        .checked_add(delta)
        .ok_or_else(|| "dist_minted + Δ tràn u128 (không thể)".to_string())?;
    if dist_new > ss_state.dist_cap {
        return Err(format!(
            "DistributionVest vượt cap: dist_minted' = {} > dist_cap = {} (oil)",
            dist_new, ss_state.dist_cap
        ));
    }
    let total_cap = ss_state
        .dist_cap
        .checked_add(ss_state.reserve_cap)
        .ok_or_else(|| "dist_cap + reserve_cap tràn u128 (không thể)".to_string())?;
    if dist_new + ss_state.reserve_minted > total_cap {
        return Err(format!(
            "vượt trần tổng: dist_minted' + reserve_minted = {} > {} (36 tỷ LAMP oil)",
            dist_new + ss_state.reserve_minted,
            total_cap
        ));
    }
    // Caps BẤT BIẾN qua transition (§Luật 4) — tái tạo y nguyên, chỉ bump dist_minted.
    let new_supply_datum = encode_supply_state_datum(
        dist_new,
        ss_state.reserve_minted,
        ss_state.dist_cap,
        ss_state.reserve_cap,
    )?;

    // ─── 4. Wallet + tx builder ─────────────────────────────────────
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network).map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;

    // ─── 5. SupplyState SPEND input (redeemer Advance) + fee input ─
    let ss_script = csl::PlutusScript::from_hex_with_version(
        supply_state_script_cbor,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "supply_state_script_cbor is not valid Plutus V3 script CBOR hex".to_string())?;
    let (ss_script_addr, _ss_hash) =
        derive_taad_script_address(supply_state_script_cbor, network).map_err(|e| e.to_string())?;

    let ss_ex_units = csl::ExUnits::new(
        &BigNum::from(SUPPLY_STATE_EX_UNITS_MEM),
        &BigNum::from(SUPPLY_STATE_EX_UNITS_STEPS),
    );
    let ss_spend_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_spend(),
        &BigNum::zero(),
        &supply_state_spend_redeemer_data(),
        &ss_ex_units,
    );
    // Inline-datum spend → witness MUST NOT re-supply the datum (ledger resolves
    // it from the input UTxO itself).
    let ss_witness = csl::PlutusWitness::new_without_datum(&ss_script, &ss_spend_redeemer);
    let ss_input = TransactionInput::new(
        &TransactionHash::from_hex(&supply_state.tx_hash)
            .map_err(|_| "supply_state_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        supply_state.index,
    );
    let ss_continuing_value = rebuild_value(supply_state.amount_lovelace, &supply_state.assets)?;

    // Fee/funding input, distinct from the SupplyState UTxO — selection +
    // asset-preserving accounting factored into `pick_fee_utxo` (see its doc
    // comment for the full rationale + why this matters for real submits).
    let (picked, fee_input_value) =
        pick_fee_utxo(&utxos, &supply_state.tx_hash, supply_state.index)?;
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&picked.tx_hash)
            .map_err(|_| "utxos_json tx_hash not valid 32-byte hex".to_string())?,
        picked.index,
    );

    let mut inputs = csl::TxInputsBuilder::new();
    inputs.add_plutus_script_input(&ss_witness, &ss_input, &ss_continuing_value);
    inputs
        .add_regular_input(&wallet_addr_obj, &fee_input, &fee_input_value)
        .map_err(|e| format!("add_regular_input (fee utxo): {:?}", e))?;
    tb.set_inputs(&inputs);

    // ─── 6. Collateral — pure-ADA only (Plutus mint requires it) ────
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

    // ─── 7. Reference inputs: Registry NFT + KHO NFT (READ, not spent) ─
    let registry_input = TransactionInput::new(
        &TransactionHash::from_hex(&registry.tx_hash)
            .map_err(|_| "registry_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        registry.index,
    );
    tb.add_reference_input(&registry_input);

    let kho_input = TransactionInput::new(
        &TransactionHash::from_hex(&kho.tx_hash)
            .map_err(|_| "kho_utxo_json.tx_hash not valid 32-byte hex".to_string())?,
        kho.index,
    );
    tb.add_reference_input(&kho_input);

    // ─── 8. Mint witness: +Δ LAMP, redeemer DistributionVest (Constr 0) ─
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

    // DistributionVest = Constr 0 [] (types.ak §19 `TLampMintRedeemer`). This
    // builder ONLY ever mints via DistributionVest — ReserveDraw is the
    // permissionless DAO/meter-gated path, not authorized by an OrgDID signature.
    let mint_redeemer_data = PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64));
    let mint_ex_units = csl::ExUnits::new(
        &BigNum::from(LAMP_MINT_EX_UNITS_MEM),
        &BigNum::from(LAMP_MINT_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &mint_redeemer_data,
        &mint_ex_units,
    );
    let mint_witness = csl::MintWitness::new_plutus_script(&lamp_script_source, &mint_redeemer);

    let mut mint_builder = csl::MintBuilder::new();
    mint_builder
        .add_asset(&mint_witness, &token_name, &Int::new(&BigNum::from(mint.amount)))
        .map_err(|e| format!("mint_builder.add_asset: {:?}", e))?;
    tb.set_mint_builder(&mint_builder);

    // ─── 9. A-DEST output: Δ LAMP → KHO script address (NEVER a wallet) ─
    let mut lamp_ma = MultiAsset::new();
    lamp_ma.set_asset(&lamp_policy_id, &token_name, &BigNum::from(mint.amount));
    let kho_output = TransactionOutputBuilder::new()
        .with_address(&kho_addr_obj)
        .next()
        .map_err(|e| format!("KHO output builder.next: {:?}", e))?
        .with_asset_and_min_required_coin_by_utxo_cost(
            &lamp_ma,
            &csl::DataCost::new_coins_per_byte(&BigNum::from(extract_coins_per_utxo_size(&params)?)),
        )
        .map_err(|e| format!("KHO output min-ada calc: {:?}", e))?
        .build()
        .map_err(|e| format!("KHO output build: {:?}", e))?;
    tb.add_output(&kho_output)
        .map_err(|e| format!("add_output (KHO) failed: {:?}", e))?;

    // ─── 10. SupplyState continuing output: same script addr, NFT + minADA ─
    //          preserved, datum bumped (dist_minted' = dist_minted + Δ) ──────
    let ss_continuing_output = TransactionOutputBuilder::new()
        .with_address(&ss_script_addr)
        .with_plutus_data(&new_supply_datum)
        .next()
        .map_err(|e| format!("SupplyState continuing output builder.next: {:?}", e))?
        .with_value(&ss_continuing_value)
        .build()
        .map_err(|e| format!("SupplyState continuing output build: {:?}", e))?;
    tb.add_output(&ss_continuing_output)
        .map_err(|e| format!("add_output (SupplyState continuing) failed: {:?}", e))?;

    // ─── 11. Required signers = authority pkh(s) (validated in step 2) ─
    for (_, keyhash) in &auth_keys {
        tb.add_required_signer(keyhash);
    }
    tb.set_ttl_bignum(&BigNum::from(current_slot + 7200));

    // ─── 12. Bind cost model + redeemers to body BEFORE change ─────
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;

    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 13. build_tx (folds both Plutus scripts + both redeemers) + sign ─
    // 2 script witnesses: lamp_mint (mint) + supply_state (spend) — both folded
    // by build_tx from the mint builder + the plutus-script spend input above.
    let tx = tb.build_tx().map_err(|e| format!("build_tx: {:?}", e))?;

    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
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
//
// Fixtures build MOCK registry/SupplyState inline datums directly via csl
// PlutusData (mirrors registry.ak/types.ak schema byte-for-byte, same encoding
// `registry_mint::encode_registry_datum`/`encode_supply_state_datum` use) so the
// DECODE path under test (`decode_registry_datum`/`decode_supply_state_datum`,
// called from THIS builder) is exercised against realistic chain data, not a
// pre-decoded shortcut. lamp_mint/supply_state/thread_nft are stand-in minimal
// Plutus V3 scripts (same fixture style as `registry_mint.rs`/`taad_did.rs`).

#[cfg(test)]
mod tests {
    use super::*;
    use cardano_serialization_lib::{ConstrPlutusData, PlutusList};

    const MOCK_LAMP_POLICY_CBOR: &str = "4e4d01000033222220051200120011";
    const MOCK_SUPPLY_STATE_SCRIPT: &str = "4e4d0100003322222005120012bbff";
    /// Distinct from `MOCK_SUPPLY_STATE_SCRIPT` — the KHO address MUST differ from
    /// the SupplyState continuing-output address, otherwise both outputs collide
    /// at the same address and shape assertions can't tell them apart.
    const MOCK_KHO_SCRIPT: &str = "4e4d0100003322222005120012ddff";

    const DIST_CAP: u128 = 26_370_000_000_000_000;
    const RESERVE_CAP: u128 = 9_630_000_000_000_000;

    #[allow(dead_code)]
    fn pkh_a() -> String { "aa".repeat(28) }
    fn pkh_b() -> String { "bb".repeat(28) }
    fn pkh_c() -> String { "cc".repeat(28) }

    fn mock_params() -> &'static str {
        r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#
    }

    /// Two funded, asset-free wallet UTxOs (fee-distinct-from-SupplyState + collateral).
    fn mock_wallet_utxos() -> &'static str {
        r#"[
            {"tx_hash": "5555555555555555555555555555555555555555555555555555555555555555",
             "index": 1, "amount_lovelace": 10000000},
            {"tx_hash": "6666666666666666666666666666666666666666666666666666666666666666",
             "index": 0, "amount_lovelace": 8000000}
        ]"#
    }

    // ─── mock datum builders (raw PlutusData, mirrors registry.ak/types.ak) ─

    fn plutus_data_hex(pd: &PlutusData) -> String {
        hex::encode(pd.to_bytes())
    }

    fn encode_single_pkh(pkh_hex: &str) -> PlutusData {
        let mut fields = PlutusList::new();
        fields.add(&PlutusData::new_bytes(hex::decode(pkh_hex).unwrap()));
        PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(0u64), &fields))
    }

    fn encode_multisig(pkhs_hex: &[String], threshold: u64) -> PlutusData {
        let mut list = PlutusList::new();
        for p in pkhs_hex {
            list.add(&PlutusData::new_bytes(hex::decode(p).unwrap()));
        }
        let mut fields = PlutusList::new();
        fields.add(&PlutusData::new_list(&list));
        fields.add(&PlutusData::new_integer(&csl::BigInt::from_str(&threshold.to_string()).unwrap()));
        PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(1u64), &fields))
    }

    fn encode_revoked() -> PlutusData {
        PlutusData::new_empty_constr_plutus_data(&BigNum::from(2u64))
    }

    /// RegistryDatum = Constr 0 [governing_did, [Entry{token_tag, authority}]].
    fn mock_registry_datum_hex(token_tag: &[u8], authority: PlutusData) -> String {
        let mut entry_fields = PlutusList::new();
        entry_fields.add(&PlutusData::new_bytes(token_tag.to_vec()));
        entry_fields.add(&authority);
        let entry = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(0u64), &entry_fields));
        let mut entries = PlutusList::new();
        entries.add(&entry);

        let mut fields = PlutusList::new();
        fields.add(&PlutusData::new_bytes(b"did:phoenix:org:greensun".to_vec()));
        fields.add(&PlutusData::new_list(&entries));
        let datum = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(0u64), &fields));
        plutus_data_hex(&datum)
    }

    /// SupplyState = Constr 0 [dist_minted, reserve_minted, dist_cap, reserve_cap].
    fn mock_supply_state_datum_hex(dist_minted: u128, reserve_minted: u128, dist_cap: u128, reserve_cap: u128) -> String {
        let mk = |v: u128| PlutusData::new_integer(&csl::BigInt::from_str(&v.to_string()).unwrap());
        let mut fields = PlutusList::new();
        fields.add(&mk(dist_minted));
        fields.add(&mk(reserve_minted));
        fields.add(&mk(dist_cap));
        fields.add(&mk(reserve_cap));
        let datum = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(0u64), &fields));
        plutus_data_hex(&datum)
    }

    fn mock_registry_json(inline_datum_hex: &str) -> String {
        format!(
            r#"{{"tx_hash":"3333333333333333333333333333333333333333333333333333333333333333",
                 "index":0,"inline_datum_hex":"{}"}}"#,
            inline_datum_hex
        )
    }

    fn mock_supply_state_json(inline_datum_hex: &str) -> String {
        let thread_policy = "aa".repeat(28);
        format!(
            r#"{{"tx_hash":"4444444444444444444444444444444444444444444444444444444444444444",
                 "index":0,"amount_lovelace":2000000,
                 "assets":[{{"policy_id":"{thread_policy}","asset_name_hex":"535550504c59","quantity":1}}],
                 "inline_datum_hex":"{inline_datum_hex}"}}"#
        )
    }

    fn mock_kho_json() -> String {
        // Script address (payment cred only) on testnet — any well-formed bech32
        // script address the wallet derive helper's network accepts.
        let kho_addr = derive_taad_script_address(MOCK_KHO_SCRIPT, 0).unwrap().0;
        format!(
            r#"{{"tx_hash":"6767676767676767676767676767676767676767676767676767676767676767",
                 "index":0,"address":"{}"}}"#,
            kho_addr.to_bech32(None).unwrap()
        )
    }

    fn base_mint_json(amount: u64) -> String {
        format!(r#"{{"token_name_hex":"{}","amount":{}}}"#, hex::encode(b"tLAMP"), amount)
    }

    const TOKEN_TAG: &[u8] = b"LAMPtag";

    fn build_ok(
        auth_keks: &str,
        registry_json: &str,
        supply_state_json: &str,
        mint_json: &str,
    ) -> Result<String, String> {
        build_mint_lamp_via_did(
            auth_keks,
            registry_json,
            &hex::encode(TOKEN_TAG),
            supply_state_json,
            MOCK_SUPPLY_STATE_SCRIPT,
            &mock_kho_json(),
            MOCK_LAMP_POLICY_CBOR,
            mint_json,
            mock_wallet_utxos(),
            mock_params(),
            &"34".repeat(32),
            0,
            2000,
        )
    }

    /// (i)+(ii)+(iii)+(iv)+(v): happy path — decode the signed tx CBOR back and
    /// assert every shape the on-chain gate depends on.
    #[test]
    fn mint_lamp_single_authority_happy_path_full_shape() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(
            TOKEN_TAG,
            encode_single_pkh(&hex::encode(auth_pkh.to_bytes())),
        ));
        let old_dist: u128 = 1_000_000;
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(old_dist, 0, DIST_CAP, RESERVE_CAP));
        let amount: u64 = 5_000_000;

        let tx_hex = build_ok(
            &format!(r#"["{}"]"#, auth_kek),
            &registry_json,
            &ss_json,
            &base_mint_json(amount),
        )
        .expect("single-authority DistributionVest mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).expect("valid tx CBOR");
        let body = tx.body();
        let wit = tx.witness_set();

        // (i) SupplyState SPENT (not referenced) + continuing output at the same
        // script addr keeps the thread NFT, dist_minted' = old + Δ, others untouched.
        let spend_inputs = body.inputs();
        let mut ss_spent = false;
        for i in 0..spend_inputs.len() {
            if hex::encode(spend_inputs.get(i).transaction_id().to_bytes())
                == "4444444444444444444444444444444444444444444444444444444444444444"
            { ss_spent = true; }
        }
        assert!(ss_spent, "SupplyState UTxO must be a spend input");

        let (ss_addr, _) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let outs = body.outputs();
        let mut found_continuing = false;
        let mut found_kho = false;
        let thread_policy_hex = "aa".repeat(28);
        let thread_policy = csl::ScriptHash::from_bytes(hex::decode(&thread_policy_hex).unwrap()).unwrap();
        let supply_name = AssetName::new(b"SUPPLY".to_vec()).unwrap();
        let lamp_script = csl::PlutusScript::from_hex_with_version(MOCK_LAMP_POLICY_CBOR, &csl::Language::new_plutus_v3()).unwrap();
        let lamp_policy_id = lamp_script.hash();
        let tlamp_name = AssetName::new(b"tLAMP".to_vec()).unwrap();

        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() == ss_addr.to_bech32(None).unwrap() {
                let has_nft = o.amount().multiasset()
                    .and_then(|ma| ma.get(&thread_policy))
                    .and_then(|a| a.get(&supply_name))
                    .map(|q| q == BigNum::from(1u64)).unwrap_or(false);
                assert!(has_nft, "continuing SupplyState output must keep the thread/SUPPLY NFT");
                let pd = o.plutus_data().expect("inline datum on continuing output");
                let constr = pd.as_constr_plutus_data().unwrap();
                assert_eq!(constr.data().len(), 4, "continuing datum is 4-field SupplyState");
                assert_eq!(constr.data().get(0).as_integer().unwrap(), csl::BigInt::from_str(&(old_dist + amount as u128).to_string()).unwrap(), "dist_minted' = old + Δ");
                assert_eq!(constr.data().get(1).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "reserve_minted untouched");
                assert_eq!(constr.data().get(2).as_integer().unwrap(), csl::BigInt::from_str(&DIST_CAP.to_string()).unwrap(), "dist_cap preserved");
                assert_eq!(constr.data().get(3).as_integer().unwrap(), csl::BigInt::from_str(&RESERVE_CAP.to_string()).unwrap(), "reserve_cap preserved");
                found_continuing = true;
            }
            // (iii) A-DEST: KHO output carries ≥ Δ LAMP under the LAMP policy.
            if let Some(ma) = o.amount().multiasset() {
                if let Some(assets) = ma.get(&lamp_policy_id) {
                    if let Some(qty) = assets.get(&tlamp_name) {
                        if qty >= BigNum::from(amount) {
                            found_kho = true;
                        }
                    }
                }
            }
        }
        assert!(found_continuing, "continuing SupplyState output must exist");
        assert!(found_kho, "KHO output must carry ≥ Δ LAMP (A-DEST)");

        // (ii) exactly 2 reference inputs (registry + kho), neither spent.
        let ref_inputs = body.reference_inputs().expect("reference inputs set");
        assert_eq!(ref_inputs.len(), 2, "exactly 2 reference inputs: registry + kho");
        let ref_hashes: Vec<String> = (0..ref_inputs.len()).map(|i| hex::encode(ref_inputs.get(i).transaction_id().to_bytes())).collect();
        assert!(ref_hashes.contains(&"3333333333333333333333333333333333333333333333333333333333333333".to_string()), "registry is a reference input");
        assert!(ref_hashes.contains(&"6767676767676767676767676767676767676767676767676767676767676767".to_string()), "kho is a reference input");
        for i in 0..spend_inputs.len() {
            let h = hex::encode(spend_inputs.get(i).transaction_id().to_bytes());
            assert_ne!(h, "3333333333333333333333333333333333333333333333333333333333333333", "registry must be READ, never SPENT");
            assert_ne!(h, "6767676767676767676767676767676767676767676767676767676767676767", "kho must be READ, never SPENT");
        }

        // (iv) mint = exactly Δ under the LAMP policy, single asset name, redeemer DistributionVest.
        let mint = body.mint().expect("mint set");
        let mints_assets = mint.get(&lamp_policy_id).expect("mint entry for LAMP policy");
        assert_eq!(mints_assets.len(), 1, "exactly 1 asset name minted");
        let mut total: i128 = 0;
        for i in 0..mints_assets.len() {
            let ma = mints_assets.get(i).unwrap();
            if let Some(v) = ma.get(&tlamp_name) { total += v.as_i32_or_fail().unwrap() as i128; }
        }
        assert_eq!(total, amount as i128, "minted exactly Δ LAMP");

        let redeemers = wit.redeemers().expect("redeemers present");
        let mut has_spend = false;
        let mut mint_alt: Option<BigNum> = None;
        for i in 0..redeemers.len() {
            let r = redeemers.get(i);
            if r.tag() == csl::RedeemerTag::new_spend() { has_spend = true; }
            if r.tag() == csl::RedeemerTag::new_mint() { mint_alt = Some(r.data().as_constr_plutus_data().unwrap().alternative()); }
        }
        assert!(has_spend, "SupplyState spend (Advance) redeemer present");
        assert_eq!(mint_alt.unwrap(), BigNum::from(0u64), "mint redeemer = DistributionVest (Constr 0)");

        // 2 script witnesses: lamp_mint (mint) + supply_state (spend).
        assert_eq!(wit.plutus_scripts().unwrap().len(), 2, "2 Plutus script witnesses (lamp_mint + supply_state)");

        // (v) required signer == authority pkh (SinglePkh).
        let req = body.required_signers().expect("required signers set");
        assert_eq!(req.len(), 1, "SinglePkh → exactly 1 required signer");
        assert_eq!(req.get(0).to_bytes(), auth_pkh.to_bytes());

        assert!(body.script_data_hash().is_some(), "script_data_hash must be set for a Plutus tx");
    }

    /// MultiSig authority: 2-of-2 supplied → 2 required signers, both derived pkhs
    /// present in the registry entry.
    #[test]
    fn mint_lamp_multisig_authority_two_required_signers() {
        let kek1 = "7a".repeat(32);
        let kek2 = "5c".repeat(32);
        let (_, pkh1) = derive_controller(&kek1).unwrap();
        let (_, pkh2) = derive_controller(&kek2).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(
            TOKEN_TAG,
            encode_multisig(&[hex::encode(pkh1.to_bytes()), hex::encode(pkh2.to_bytes())], 2),
        ));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));

        let tx_hex = build_ok(
            &format!(r#"["{}","{}"]"#, kek1, kek2),
            &registry_json,
            &ss_json,
            &base_mint_json(1_000),
        )
        .expect("2-of-2 MultiSig mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let body = tx.body();
        let req = body.required_signers().expect("required signers set");
        assert_eq!(req.len(), 2, "MultiSig (2 keys) → 2 required signers");
        let req_set: Vec<Vec<u8>> = (0..req.len()).map(|i| req.get(i).to_bytes()).collect();
        assert!(req_set.contains(&pkh1.to_bytes()));
        assert!(req_set.contains(&pkh2.to_bytes()));
        assert_eq!(tx.witness_set().vkeys().unwrap().len(), 3, "wallet + 2 authority signatures");
    }

    /// MultiSig with an EXTRA unrelated KEK not in the registry entry is rejected
    /// (keeps required_signers a clean 1:1 with the entry — fail fast).
    #[test]
    fn mint_lamp_multisig_rejects_stray_authority_key() {
        let kek1 = "7a".repeat(32);
        let kek2 = "5c".repeat(32);
        let stray = "11".repeat(32);
        let (_, pkh1) = derive_controller(&kek1).unwrap();
        let (_, pkh2) = derive_controller(&kek2).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(
            TOKEN_TAG,
            encode_multisig(&[hex::encode(pkh1.to_bytes()), hex::encode(pkh2.to_bytes())], 2),
        ));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));

        let err = build_ok(
            &format!(r#"["{}","{}","{}"]"#, kek1, kek2, stray),
            &registry_json,
            &ss_json,
            &base_mint_json(1_000),
        )
        .expect_err("a stray key not in the MultiSig entry must be rejected");
        assert!(err.contains("không có trong MultiSig"), "got: {err}");
    }

    // ── (vi) rejection vectors ──────────────────────────────────────

    #[test]
    fn mint_lamp_rejects_zero_amount() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(TOKEN_TAG, encode_single_pkh(&hex::encode(auth_pkh.to_bytes()))));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));
        let err = build_ok(&format!(r#"["{}"]"#, auth_kek), &registry_json, &ss_json, &base_mint_json(0))
            .expect_err("Δ = 0 must be rejected");
        assert!(err.contains("amount must be > 0"), "got: {err}");
    }

    #[test]
    fn mint_lamp_rejects_missing_supply_state_utxo() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(TOKEN_TAG, encode_single_pkh(&hex::encode(auth_pkh.to_bytes()))));
        // Empty supply_state_utxo_json → not valid JSON for SupplyStateRefUtxo.
        let err = build_ok(&format!(r#"["{}"]"#, auth_kek), &registry_json, "", &base_mint_json(1_000))
            .expect_err("missing SupplyState UTxO must be rejected");
        assert!(err.contains("supply_state_utxo_json"), "got: {err}");
    }

    #[test]
    fn mint_lamp_rejects_revoked_registry_entry() {
        let auth_kek = "7a".repeat(32);
        let registry_json = mock_registry_json(&mock_registry_datum_hex(TOKEN_TAG, encode_revoked()));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));
        let err = build_ok(&format!(r#"["{}"]"#, auth_kek), &registry_json, &ss_json, &base_mint_json(1_000))
            .expect_err("Revoked entry must be rejected");
        assert!(err.contains("Revoked"), "got: {err}");
    }

    #[test]
    fn mint_lamp_rejects_over_dist_cap() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(TOKEN_TAG, encode_single_pkh(&hex::encode(auth_pkh.to_bytes()))));
        let old_dist = DIST_CAP - 10;
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(old_dist, 0, DIST_CAP, RESERVE_CAP));
        let err = build_ok(&format!(r#"["{}"]"#, auth_kek), &registry_json, &ss_json, &base_mint_json(100))
            .expect_err("Δ over dist_cap must be rejected");
        assert!(err.contains("vượt cap"), "got: {err}");
    }

    #[test]
    fn mint_lamp_rejects_missing_kho() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(TOKEN_TAG, encode_single_pkh(&hex::encode(auth_pkh.to_bytes()))));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));
        let err = build_mint_lamp_via_did(
            &format!(r#"["{}"]"#, auth_kek),
            &registry_json,
            &hex::encode(TOKEN_TAG),
            &ss_json,
            MOCK_SUPPLY_STATE_SCRIPT,
            "", // missing kho_utxo_json
            MOCK_LAMP_POLICY_CBOR,
            &base_mint_json(1_000),
            mock_wallet_utxos(),
            mock_params(),
            &"34".repeat(32),
            0,
            2000,
        )
        .expect_err("missing KHO UTxO must be rejected");
        assert!(err.contains("kho_utxo_json"), "got: {err}");
    }

    #[test]
    fn mint_lamp_rejects_stranger_signer_for_single_pkh() {
        let auth_kek = "7a".repeat(32); // does NOT match the registry pkh below
        let registry_json = mock_registry_json(&mock_registry_datum_hex(TOKEN_TAG, encode_single_pkh(&pkh_c())));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));
        let err = build_ok(&format!(r#"["{}"]"#, auth_kek), &registry_json, &ss_json, &base_mint_json(1_000))
            .expect_err("a KEK not matching the SinglePkh entry must be rejected");
        assert!(err.contains("không khớp SinglePkh"), "got: {err}");
    }

    #[test]
    fn mint_lamp_rejects_unknown_token_tag() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        // Entry exists but for a DIFFERENT tag than the one this builder looks up.
        let registry_json = mock_registry_json(&mock_registry_datum_hex(b"OTHERtag", encode_single_pkh(&hex::encode(auth_pkh.to_bytes()))));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));
        let err = build_ok(&format!(r#"["{}"]"#, auth_kek), &registry_json, &ss_json, &base_mint_json(1_000))
            .expect_err("unknown token_tag must be rejected");
        assert!(err.contains("không tìm thấy"), "got: {err}");
    }

    // Silence unused-fn warnings for fixture helpers not exercised by every test.
    #[test]
    fn _pkh_b_fixture_is_usable() {
        assert_eq!(hex::decode(pkh_b()).unwrap().len(), 28);
    }

    // ── Vá 1 — fee UTxO chọn phải lọc pure-ADA / bảo toàn asset ────────

    /// Wallet has TWO UTxOs: the lovelace-largest one carries a foreign
    /// (non-LAMP) native asset, and a smaller one is pure-ADA. Before the fix,
    /// `pick_largest_utxo` would grab the asset-carrying UTxO for the fee input
    /// and declare it as pure lovelace — dropping the foreign asset from the
    /// tx's value balance (silent `ValueNotConservedUTxO` on real submit). After
    /// the fix, the builder must prefer the pure-ADA UTxO instead, so the
    /// asset-carrying UTxO is never touched at all (its asset stays exactly
    /// where it was — the strongest form of "not lost").
    #[test]
    fn mint_lamp_fee_selection_prefers_pure_ada_over_larger_asset_utxo() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(
            TOKEN_TAG,
            encode_single_pkh(&hex::encode(auth_pkh.to_bytes())),
        ));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));

        let foreign_policy = "dd".repeat(28);
        let asset_utxo_hash = "7777777777777777777777777777777777777777777777777777777777777777";
        let pure_ada_utxo_hash = "5555555555555555555555555555555555555555555555555555555555555555";
        let utxos_json = format!(
            r#"[
                {{"tx_hash":"{asset_utxo_hash}","index":0,"amount_lovelace":50000000,
                  "assets":[{{"policy_id":"{foreign_policy}","asset_name_hex":"4d59535445525259","quantity":1}}]}},
                {{"tx_hash":"{pure_ada_utxo_hash}","index":1,"amount_lovelace":10000000}}
            ]"#
        );

        let tx_hex = build_mint_lamp_via_did(
            &format!(r#"["{}"]"#, auth_kek),
            &registry_json,
            &hex::encode(TOKEN_TAG),
            &ss_json,
            MOCK_SUPPLY_STATE_SCRIPT,
            &mock_kho_json(),
            MOCK_LAMP_POLICY_CBOR,
            &base_mint_json(1_000),
            &utxos_json,
            mock_params(),
            &"34".repeat(32),
            0,
            2000,
        )
        .expect("must build even though the largest UTxO carries a foreign asset");

        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let body = tx.body();
        let inputs = body.inputs();
        let input_hashes: Vec<String> = (0..inputs.len())
            .map(|i| hex::encode(inputs.get(i).transaction_id().to_bytes()))
            .collect();
        assert!(
            input_hashes.contains(&pure_ada_utxo_hash.to_string()),
            "must spend the pure-ADA UTxO as the fee input, got: {input_hashes:?}"
        );
        assert!(
            !input_hashes.contains(&asset_utxo_hash.to_string()),
            "must NOT touch the asset-carrying UTxO — its foreign asset stays \
             untouched in the wallet rather than risk being dropped, got: {input_hashes:?}"
        );
    }

    /// Unit-level coverage of the fallback branch directly (bypassing the full
    /// builder — collateral selection independently AND unconditionally
    /// requires ≥1 pure-ADA UTxO in the same wallet list, so a wallet with ZERO
    /// pure-ADA UTxOs anywhere can never reach a successfully-built tx no
    /// matter what fee accounting does; that's an orthogonal, correct refusal
    /// at the collateral step, not something this fix changes or should hide).
    /// This test instead proves `pick_fee_utxo` itself — the unit actually
    /// touched by the fix — is asset-preserving: when NO pure-ADA UTxO exists,
    /// it must fall back to the overall-largest UTxO and declare its Value
    /// WITH the foreign asset attached (not dropped), so any caller of this
    /// helper (now or in a future collateral-relaxation) is safe by construction.
    #[test]
    fn pick_fee_utxo_fallback_preserves_foreign_asset_when_no_pure_ada_exists() {
        let foreign_policy = "ee".repeat(28);
        let foreign_policy_hash = csl::ScriptHash::from_bytes(hex::decode(&foreign_policy).unwrap()).unwrap();
        let foreign_name_hex = "4d59535445525259";
        let foreign_name = AssetName::new(hex::decode(foreign_name_hex).unwrap()).unwrap();

        let utxos: Vec<UtxoInput> = serde_json::from_str(&format!(
            r#"[
                {{"tx_hash":"8888888888888888888888888888888888888888888888888888888888888888","index":0,
                  "amount_lovelace":50000000,
                  "assets":[{{"policy_id":"{foreign_policy}","asset_name_hex":"{foreign_name_hex}","quantity":7}}]}}
            ]"#
        ))
        .unwrap();

        let (picked, value) = pick_fee_utxo(
            &utxos,
            "4444444444444444444444444444444444444444444444444444444444444444",
            0,
        )
        .expect("fallback must still succeed with no pure-ADA UTxO in the wallet");

        assert_eq!(picked.tx_hash, "8888888888888888888888888888888888888888888888888888888888888888");
        assert_eq!(value.coin(), BigNum::from(50_000_000u64), "lovelace preserved");
        let qty = value
            .multiasset()
            .and_then(|ma| ma.get(&foreign_policy_hash))
            .and_then(|a| a.get(&foreign_name))
            .expect("the foreign asset must be present in the declared fee-input Value, not dropped");
        assert_eq!(qty, BigNum::from(7u64), "foreign asset quantity fully preserved");
    }

    // ── Vá 2 — Kho address phải là SCRIPT address ───────────────────────

    /// A caller that mistakenly passes a normal payment-key wallet address as
    /// `kho_utxo_json.address` (PoC finding 2) must be rejected in Rust,
    /// BEFORE a tx is ever built — not silently accepted and let the on-chain
    /// `qty_to_script` gate (or worse, an actual fund loss) be the first place
    /// the mistake shows up.
    #[test]
    fn mint_lamp_rejects_payment_key_address_as_kho() {
        let auth_kek = "7a".repeat(32);
        let (_, auth_pkh) = derive_controller(&auth_kek).unwrap();
        let registry_json = mock_registry_json(&mock_registry_datum_hex(
            TOKEN_TAG,
            encode_single_pkh(&hex::encode(auth_pkh.to_bytes())),
        ));
        let ss_json = mock_supply_state_json(&mock_supply_state_datum_hex(0, 0, DIST_CAP, RESERVE_CAP));

        // A plain payment-key wallet address (same derivation the builder itself
        // uses for the funding wallet) — NOT a script address.
        let (wallet_addr, _) = derive_wallet(&[0x11u8; 32], 0).unwrap();
        let bad_kho_json = format!(
            r#"{{"tx_hash":"6767676767676767676767676767676767676767676767676767676767676767",
                 "index":0,"address":"{}"}}"#,
            wallet_addr
        );

        let err = build_mint_lamp_via_did(
            &format!(r#"["{}"]"#, auth_kek),
            &registry_json,
            &hex::encode(TOKEN_TAG),
            &ss_json,
            MOCK_SUPPLY_STATE_SCRIPT,
            &bad_kho_json,
            MOCK_LAMP_POLICY_CBOR,
            &base_mint_json(1_000),
            mock_wallet_utxos(),
            mock_params(),
            &"34".repeat(32),
            0,
            2000,
        )
        .expect_err("a payment-key address for kho_utxo_json.address must be rejected");
        assert!(
            err.contains("SCRIPT") || err.contains("payment-KEY"),
            "got: {err}"
        );
    }
}
