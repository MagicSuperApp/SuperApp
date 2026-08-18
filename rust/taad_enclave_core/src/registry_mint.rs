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
/// Trần số khoá của một authority MultiSig — đối xứng `expect list.length(pkhs)
/// <= 16` ở `LAMP/Genesis/onchain/lib/magiclamp/genesis/registry.ak:98`.
const MAX_MULTISIG_PKHS: usize = 16;

const REGISTRY_EX_UNITS_MEM: u64 = 2_000_000;
/// Conservative static ExUnits (cpu steps) for registry ops.
const REGISTRY_EX_UNITS_STEPS: u64 = 700_000_000;

/// Thread-NFT (SupplyState) asset name = "SUPPLY" (#"535550504c59"), khớp
/// `constants.supply_name` on-chain (LAMP `magiclamp/genesis/constants.ak`).
const SUPPLY_NAME: &[u8] = b"SUPPLY";

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
            // Đối xứng `registry.ak:98` — on-chain `expect list.length(pkhs) <= 16`
            // (chặn ExUnit DoS). Không chặn ở đây thì caller dựng được tx trông hợp
            // lệ, submit mới hỏng phase-2 và mất collateral.
            if pkhs.len() > MAX_MULTISIG_PKHS {
                return Err(format!(
                    "multisig 'pkhs' tối đa {} khoá (đối xứng registry.ak:98), nhận {}",
                    MAX_MULTISIG_PKHS,
                    pkhs.len()
                ));
            }
            let threshold = a
                .threshold
                .ok_or_else(|| "authorization kind 'multisig' requires field 'threshold'".to_string())?;
            // On-chain so threshold với danh sách ĐÃ DEDUPE (`list.unique` rồi
            // `threshold <= list.length(uniq)`). So với `pkhs.len()` thô thì
            // `[k1,k1,k1] threshold 3` lọt ở đây nhưng chết trên chuỗi.
            let mut uniq: Vec<&String> = Vec::with_capacity(pkhs.len());
            for p in pkhs.iter() {
                if !uniq.iter().any(|u| u.eq_ignore_ascii_case(p)) {
                    uniq.push(p);
                }
            }
            if threshold == 0 || threshold as usize > uniq.len() {
                return Err(format!(
                    "multisig threshold phải 1..=N với N = số pkh KHÁC NHAU (N={}, tổng {}), nhận {}",
                    uniq.len(),
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
// Hợp đồng CBOR khớp CỔNG on-chain THẬT đội LAMP đã cấp
// (`LAMP/Genesis/onchain/lib/magiclamp/genesis/types.ak` + `supply_state.ak`,
// đối chiếu offchain `datum.ts`). ĐÂY là schema canonical — KHÔNG dùng schema
// cũ 3-field (minted_total/lamp_policy/lamp_asset_name) vốn KHÔNG khớp cổng thật:
//
//   SupplyState (types.ak §9)  = Constr 0 [ dist_minted: Int, reserve_minted: Int,
//                                           dist_cap: Int, reserve_cap: Int ]
//   TLampMintRedeemer          = DistributionVest = Constr 0 [] · ReserveDraw = Constr 1 []
//   ThreadNftRedeemer.MintGenesis  = Constr 0 []   (genesis mint thread NFT)
//   SupplyStateRedeemer.Advance    = Constr 0 []   (spend SupplyState)
//
// TRANSITION (lamp_mint §Luật 5): tx mint Δ LAMP theo 1 route:
//   DistributionVest → dist_minted' = dist_minted + Δ, reserve_minted' == reserve_minted
//   ReserveDraw      → reserve_minted' = reserve_minted + Δ, dist_minted' == dist_minted
// dist_cap/reserve_cap BẤT BIẾN qua transition (Luật 4) và PHẢI == cap bake vào policy
// (lamp_mint §D7-#1). Cap tổng 36 tỷ LAMP × 10^6 oil = dist_cap + reserve_cap (§D7-#2).

/// Route mint LAMP — khóa quota (khớp `TLampMintRedeemer` types.ak §19).
/// DistributionVest = đường Capped-Drop (đổ vào KHO); ReserveDraw = đường DAO (gate meter NFT).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MintRoute {
    DistributionVest,
    ReserveDraw,
}

impl MintRoute {
    /// Parse từ JSON string caller truyền ("distribution" | "reserve").
    fn parse(s: &str) -> Result<MintRoute, String> {
        match s {
            "distribution" | "DistributionVest" => Ok(MintRoute::DistributionVest),
            "reserve" | "ReserveDraw" => Ok(MintRoute::ReserveDraw),
            other => Err(format!(
                "mint route '{}' không hợp lệ (dùng 'distribution' | 'reserve')",
                other
            )),
        }
    }
    /// Constr index khớp types.ak: DistributionVest=0, ReserveDraw=1.
    fn constr_index(self) -> u64 {
        match self {
            MintRoute::DistributionVest => 0,
            MintRoute::ReserveDraw => 1,
        }
    }
}

/// Encode `SupplyState{dist_minted, reserve_minted, dist_cap, reserve_cap}` (Constr 0).
/// 4 field Int (oil), thứ tự KHỚP types.ak §9. u128 cho phép giá trị vượt u64
/// (cap tổng 36e15 oil < u64::MAX nhưng để u128 an toàn với biên số học).
pub(crate) fn encode_supply_state_datum(
    dist_minted: u128,
    reserve_minted: u128,
    dist_cap: u128,
    reserve_cap: u128,
) -> Result<PlutusData, String> {
    let mk_int = |v: u128, name: &str| -> Result<PlutusData, String> {
        let i = csl::BigInt::from_str(&v.to_string())
            .map_err(|_| format!("{} BigInt::from_str failed (unreachable)", name))?;
        Ok(PlutusData::new_integer(&i))
    };

    let mut fields = PlutusList::new();
    // 0: dist_minted (Int).
    fields.add(&mk_int(dist_minted, "dist_minted")?);
    // 1: reserve_minted (Int).
    fields.add(&mk_int(reserve_minted, "reserve_minted")?);
    // 2: dist_cap (Int) — bất biến.
    fields.add(&mk_int(dist_cap, "dist_cap")?);
    // 3: reserve_cap (Int) — bất biến.
    fields.add(&mk_int(reserve_cap, "reserve_cap")?);

    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    )))
}

/// Thread-NFT genesis mint redeemer (`ThreadNftRedeemer::MintGenesis`) — Constr 0 [].
fn thread_nft_mint_redeemer_data() -> PlutusData {
    PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))
}

/// SupplyState spend redeemer (`SupplyStateRedeemer::Advance`) — Constr 0 [].
pub(crate) fn supply_state_spend_redeemer_data() -> PlutusData {
    PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))
}

// ─── DECODE — RegistryDatum + SupplyState từ raw inline datum hex ──────────
//
// Dart/Flutter (mint_lamp_screen.dart) KHÔNG có thư viện decode CBOR/Plutus-Data
// (không như Lucid/TS phía LAMP) — Blockfrost trả `inline_datum` dạng CBOR-hex
// nguyên bản, và Rust là điểm decode DUY NHẤT. Đây là counterpart của
// `encode_registry_datum`/`encode_supply_state_datum` ở trên — mirror byte-perfect
// NGƯỢC LẠI, cùng schema (registry.ak / types.ak). `mint_lamp::build_mint_lamp_via_did`
// dùng để đọc authority TỪ RegistryDatum + state hiện tại TỪ SupplyState, thay vì tin
// caller tự khai báo (caller không decode được để mà khai đúng).

/// Authority đã decode (khớp `Authority` registry.ak / `AuthorizationJson` ở trên).
#[derive(Debug)]
pub(crate) enum DecodedAuthority {
    SinglePkh(Vec<u8>),
    MultiSig { pkhs: Vec<Vec<u8>>, threshold: u64 },
    Revoked,
}

pub(crate) struct DecodedRegistryEntry {
    pub(crate) token_tag: Vec<u8>,
    pub(crate) authority: DecodedAuthority,
}

pub(crate) struct DecodedRegistryDatum {
    #[allow(dead_code)]
    pub(crate) governing_did: String,
    pub(crate) entries: Vec<DecodedRegistryEntry>,
}

/// Decode `RegistryDatum = Constr 0 [governing_did: Bytes, entries: List<Entry>]`,
/// `Entry = Constr 0 [token_tag: Bytes, authority: Authority]` từ inline datum hex
/// thô (Blockfrost `inline_datum`). Mirror byte-perfect `encode_registry_datum` +
/// `registry.ak` (LAMP onchain) — lệch field/constr ở đây = gate SAI ở caller.
pub(crate) fn decode_registry_datum(inline_datum_hex: &str) -> Result<DecodedRegistryDatum, String> {
    let datum = PlutusData::from_hex(inline_datum_hex)
        .map_err(|e| format!("registry inline_datum_hex không phải Plutus Data hex hợp lệ: {:?}", e))?;
    let constr = datum
        .as_constr_plutus_data()
        .ok_or_else(|| "RegistryDatum không phải ConstrPlutusData".to_string())?;
    if constr.alternative() != BigNum::from(0u64) {
        return Err("RegistryDatum constructor index phải = 0".into());
    }
    let fields = constr.data();
    if fields.len() != 2 {
        return Err(format!("RegistryDatum phải có 2 field, nhận {}", fields.len()));
    }
    let did_bytes = fields
        .get(0)
        .as_bytes()
        .ok_or_else(|| "RegistryDatum.governing_did không phải ByteArray".to_string())?;
    let governing_did = String::from_utf8(did_bytes)
        .map_err(|_| "RegistryDatum.governing_did không phải UTF-8 hợp lệ".to_string())?;

    let entry_list = fields
        .get(1)
        .as_list()
        .ok_or_else(|| "RegistryDatum.entries không phải List".to_string())?;
    let mut entries = Vec::with_capacity(entry_list.len());
    for i in 0..entry_list.len() {
        let e_constr = entry_list
            .get(i)
            .as_constr_plutus_data()
            .ok_or_else(|| "RegistryEntry không phải ConstrPlutusData".to_string())?;
        if e_constr.alternative() != BigNum::from(0u64) {
            return Err("RegistryEntry constructor index phải = 0".into());
        }
        let e_fields = e_constr.data();
        if e_fields.len() != 2 {
            return Err(format!("RegistryEntry phải có 2 field, nhận {}", e_fields.len()));
        }
        let token_tag = e_fields
            .get(0)
            .as_bytes()
            .ok_or_else(|| "RegistryEntry.token_tag không phải ByteArray".to_string())?;
        let auth_constr = e_fields
            .get(1)
            .as_constr_plutus_data()
            .ok_or_else(|| "RegistryEntry.authority không phải ConstrPlutusData".to_string())?;
        let alt = auth_constr.alternative();
        let authority = if alt == BigNum::from(0u64) {
            let a_fields = auth_constr.data();
            if a_fields.len() != 1 {
                return Err("SinglePkh phải có đúng 1 field".into());
            }
            let pkh = a_fields
                .get(0)
                .as_bytes()
                .ok_or_else(|| "SinglePkh.pkh không phải ByteArray".to_string())?;
            if pkh.len() != 28 {
                return Err(format!("SinglePkh.pkh phải 28 byte, nhận {}", pkh.len()));
            }
            DecodedAuthority::SinglePkh(pkh)
        } else if alt == BigNum::from(1u64) {
            let a_fields = auth_constr.data();
            if a_fields.len() != 2 {
                return Err("MultiSig phải có đúng 2 field".into());
            }
            let pkh_list = a_fields
                .get(0)
                .as_list()
                .ok_or_else(|| "MultiSig.pkhs không phải List".to_string())?;
            let mut pkhs = Vec::with_capacity(pkh_list.len());
            for j in 0..pkh_list.len() {
                let p = pkh_list
                    .get(j)
                    .as_bytes()
                    .ok_or_else(|| "MultiSig pkh entry không phải ByteArray".to_string())?;
                if p.len() != 28 {
                    return Err(format!("MultiSig pkh entry phải 28 byte, nhận {}", p.len()));
                }
                pkhs.push(p);
            }
            let thr_int = a_fields
                .get(1)
                .as_integer()
                .ok_or_else(|| "MultiSig.threshold không phải Int".to_string())?;
            let threshold: u64 = thr_int
                .to_str()
                .parse()
                .map_err(|_| "MultiSig.threshold ngoài phạm vi u64".to_string())?;
            DecodedAuthority::MultiSig { pkhs, threshold }
        } else if alt == BigNum::from(2u64) {
            DecodedAuthority::Revoked
        } else {
            return Err(format!("Authority constructor index lạ: {}", alt.to_str()));
        };
        entries.push(DecodedRegistryEntry { token_tag, authority });
    }
    Ok(DecodedRegistryDatum { governing_did, entries })
}

/// Tra ĐÚNG-1 entry theo `token_tag` (fail-closed, KHÔNG first-match) — khớp
/// canonical read-side defense `registry.ak::validate_mint` (0 entry = chưa cấp
/// quyền; ≥2 entry trùng tag = datum mơ hồ/độc → từ chối).
pub(crate) fn find_registry_authority<'a>(
    datum: &'a DecodedRegistryDatum,
    token_tag: &[u8],
) -> Result<&'a DecodedAuthority, String> {
    let matches: Vec<&DecodedRegistryEntry> =
        datum.entries.iter().filter(|e| e.token_tag == token_tag).collect();
    match matches.as_slice() {
        [entry] => Ok(&entry.authority),
        [] => Err(format!(
            "registry: không tìm thấy entry cho token_tag {} (chưa cấp quyền mint)",
            hex::encode(token_tag)
        )),
        _ => Err(format!(
            "registry: {} entry TRÙNG token_tag {} trong datum (mơ hồ — từ chối, không first-match)",
            matches.len(),
            hex::encode(token_tag)
        )),
    }
}

/// SupplyState đã decode (khớp `SupplyState` types.ak §9 — 4 field).
#[derive(Debug)]
pub(crate) struct DecodedSupplyState {
    pub(crate) dist_minted: u128,
    pub(crate) reserve_minted: u128,
    pub(crate) dist_cap: u128,
    pub(crate) reserve_cap: u128,
}

/// Decode `SupplyState = Constr 0 [dist_minted, reserve_minted, dist_cap, reserve_cap]`
/// từ inline datum hex thô. Mirror byte-perfect `encode_supply_state_datum` ở trên.
pub(crate) fn decode_supply_state_datum(inline_datum_hex: &str) -> Result<DecodedSupplyState, String> {
    let datum = PlutusData::from_hex(inline_datum_hex)
        .map_err(|e| format!("SupplyState inline_datum_hex không phải Plutus Data hex hợp lệ: {:?}", e))?;
    let constr = datum
        .as_constr_plutus_data()
        .ok_or_else(|| "SupplyState datum không phải ConstrPlutusData".to_string())?;
    if constr.alternative() != BigNum::from(0u64) {
        return Err("SupplyState constructor index phải = 0".into());
    }
    let fields = constr.data();
    if fields.len() != 4 {
        return Err(format!("SupplyState phải có 4 field, nhận {}", fields.len()));
    }
    let get_u128 = |i: usize, name: &str| -> Result<u128, String> {
        let bi = fields
            .get(i)
            .as_integer()
            .ok_or_else(|| format!("SupplyState.{} không phải Int", name))?;
        // `to_str()` render dạng thập phân có dấu ("-123"/"123") — u128::parse tự
        // reject dấu trừ, nên chỉ cần bắt lỗi parse (đủ để chặn âm + tràn).
        bi.to_str()
            .parse::<u128>()
            .map_err(|_| format!("SupplyState.{} âm hoặc ngoài phạm vi u128", name))
    };
    Ok(DecodedSupplyState {
        dist_minted: get_u128(0, "dist_minted")?,
        reserve_minted: get_u128(1, "reserve_minted")?,
        dist_cap: get_u128(2, "dist_cap")?,
        reserve_cap: get_u128(3, "reserve_cap")?,
    })
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
pub(crate) fn derive_controller(
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
/// outpoint + value (lovelace + the thread NFT "SUPPLY") + the OLD 4-field inline
/// datum (`dist_minted, reserve_minted, dist_cap, reserve_cap`) so the builder can
/// bump the right quota by Δ per route and re-emit caps unchanged. The continuing
/// output preserves the same value (thread NFT) at the supply_state script address.
#[derive(Deserialize, Debug, Clone)]
struct SupplyStateSpendUtxo {
    tx_hash: String,
    index: u32,
    amount_lovelace: u64,
    /// All multi-asset entries currently in the SupplyState UTxO (must include the
    /// thread NFT `(thread_nft_policy, "SUPPLY")`). Preserved on the continuing output.
    #[serde(default)]
    assets: Vec<UtxoAsset>,
    /// Thread-NFT policy-id hex (= thread_nft script hash). Ghim NFT thật trong
    /// `assets` (khớp lamp_mint §Luật 1: đúng 1 input mang thread NFT).
    #[serde(default)]
    #[allow(dead_code)]
    supply_state_nft_policy_hex: String,
    /// Thread-NFT asset-name hex — luôn là "SUPPLY" (#"535550504c59"), khớp
    /// `constants.supply_name`. Parse cho caller symmetry.
    #[serde(default)]
    #[allow(dead_code)]
    supply_state_nft_name_hex: String,
    /// `dist_minted` HIỆN TẠI (oil) đọc từ inline datum CŨ.
    dist_minted: u128,
    /// `reserve_minted` HIỆN TẠI (oil) đọc từ inline datum CŨ.
    #[serde(default)]
    reserve_minted: u128,
    /// `dist_cap` (oil) trong datum CŨ — bất biến, tái tạo y nguyên trên continuing datum.
    dist_cap: u128,
    /// `reserve_cap` (oil) trong datum CŨ — bất biến, tái tạo y nguyên.
    reserve_cap: u128,
}

/// The mint instruction for `build_mint_via_registry`.
#[derive(Deserialize, Debug, Clone)]
struct TokenMintInstruction {
    /// Token asset name in hex (may be empty for a no-name asset). Must match the
    /// `token_asset_name` baked into the token policy params on-chain. For LAMP this
    /// is `token_name` — "tLAMP" (#"744c414d50") testnet / "LAMP" (#"4c414d50") mainnet.
    #[serde(default)]
    asset_name_hex: String,
    amount: u64,
    #[serde(default)]
    recipient: Option<String>,
    /// Route mint LAMP khi token CÓ cap (SupplyState): "distribution" (DistributionVest,
    /// mặc định) hoặc "reserve" (ReserveDraw). Lái CẢ redeemer mint (`TLampMintRedeemer`
    /// Constr 0/1) LẪN quota bump trên SupplyState datum. Bỏ qua khi token KHÔNG cap.
    #[serde(default)]
    route: Option<String>,
}

/// Reconstruct a `Value` (lovelace + multi-asset) from amount + parsed assets.
pub(crate) fn rebuild_value(amount_lovelace: u64, assets: &[UtxoAsset]) -> Result<Value, String> {
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

/// Build + sign the SupplyState genesis tx. MINTS the thread NFT (one-shot, bound to
/// `genesis_utxo`, asset name = "SUPPLY") under the `thread_nft` policy and locks a
/// fresh `SupplyState{dist_minted:0, reserve_minted:0, dist_cap, reserve_cap}` at the
/// supply_state script address.
///
/// On-chain (`thread_nft.ak`): the genesis UTxO MUST be SPENT (one-shot), exactly +1
/// NFT of asset-name `constants.supply_name` ("SUPPLY", #"535550504c59") is minted
/// under own_policy, qty==1 (no burn, no extra name). The mint redeemer is
/// `ThreadNftRedeemer::MintGenesis` (empty Constr 0). `thread_nft` does NOT pin the
/// output datum (it dropped datum-pinning to break the hash cycle) — safety comes from
/// the one-shot NFT + `lamp_mint`'s §D7-#1 (cap == policy-baked cap); so the genesis
/// datum MUST carry the caps that were baked into the deployed `lamp_mint`.
///
/// DEPLOY ORDER (xem `supply_state.ak`/`lamp_mint.ak` headers): thread_nft (param
/// genesis_ref) → thread_nft_policy; lamp_mint (param thread_nft_policy + caps + …) →
/// lamp_policy; supply_state (param lamp_policy + thread_nft_policy + token_name).
/// Tuyến tính, KHÔNG vòng. Genesis tx dùng `thread_nft` policy CBOR để mint NFT, khoá
/// datum tại địa chỉ `supply_state` script.
///
/// # Inputs
/// * `genesis_utxo_json`       — JSON [`GenesisUtxo`]: outpoint the one-shot thread_nft
///   policy is bound to. SPENT in this tx.
/// * `thread_nft_policy_cbor`  — compiled Plutus V3 `thread_nft` script (CBOR hex).
///   Its hash = the thread-NFT policy id. Mint +1 ("SUPPLY", qty 1) under it.
/// * `dist_cap` / `reserve_cap`— caps (oil) baked into the deployed `lamp_mint`
///   (LAMP: 26_370_000_000_000_000 / 9_630_000_000_000_000). Written into the genesis
///   datum, immutable thereafter (lamp_mint §Luật 4 + §D7-#1).
/// * `supply_state_script_cbor`— compiled Plutus V3 `supply_state` script (CBOR hex).
///   Its hash = the supply_state script ADDRESS where the SupplyState UTxO is locked.
/// * `utxos_json`              — JSON array of [`UtxoInput`] for the WALLET (fee +
///   collateral; collateral must be pure-ADA).
/// * `params_json`             — protocol params JSON.
/// * `wallet_seed_hex`         — 32-byte CIP-1852 entropy for fee/change.
/// * `network` / `slot`        — as deploy.
#[allow(clippy::too_many_arguments)]
pub fn build_genesis_supply_state(
    genesis_utxo_json: &str,
    thread_nft_policy_cbor: &str,
    dist_cap: u128,
    reserve_cap: u128,
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

    // Thread NFT asset name = constants.supply_name ("SUPPLY", #"535550504c59").
    let state_name = AssetName::new(SUPPLY_NAME.to_vec())
        .map_err(|_| "supply_name AssetName::new failed (unreachable)".to_string())?;

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxos_json)
        .map_err(|e| format!("utxos_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — provide ≥1 funded wallet UTxO (fee + collateral)".into());
    }

    let params: JsonValue = serde_json::from_str(params_json)
        .map_err(|e| format!("params_json invalid: {}", e))?;

    // ─── 2. supply_state script addr (nơi khoá SupplyState); thread NFT policy ─
    // NFT được mint dưới thread_nft policy; datum khoá tại supply_state script ADDRESS.
    let (script_addr, _ss_hash) =
        derive_taad_script_address(supply_state_script_cbor, network).map_err(|e| e.to_string())?;
    let (_thread_addr, thread_policy_hash) =
        derive_taad_script_address(thread_nft_policy_cbor, network).map_err(|e| e.to_string())?;
    let mut nft_ma = MultiAsset::new();
    nft_ma.set_asset(&thread_policy_hash, &state_name, &BigNum::from(1u64));

    // ─── 3. Fresh SupplyState{0, 0, dist_cap, reserve_cap} ─────────────
    let datum = encode_supply_state_datum(0, 0, dist_cap, reserve_cap)?;

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

    // ─── 7. Mint witness: +1 thread NFT ("SUPPLY") under the thread_nft policy ─
    if hex::decode(thread_nft_policy_cbor).is_err() {
        return Err("thread_nft_policy_cbor is not valid Plutus V3 script CBOR hex (bad hex)".into());
    }
    let script = csl::PlutusScript::from_hex_with_version(
        thread_nft_policy_cbor,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "thread_nft_policy_cbor is not valid Plutus V3 script CBOR hex".to_string())?;
    let script_source = csl::PlutusScriptSource::new(&script);

    // Genesis mint redeemer = ThreadNftRedeemer::MintGenesis (empty Constr 0).
    let ex_units = csl::ExUnits::new(
        &BigNum::from(REGISTRY_EX_UNITS_MEM),
        &BigNum::from(REGISTRY_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &thread_nft_mint_redeemer_data(),
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
/// ─── CAP (token opt-in supply state) — LAMP ───────────────────────
/// For a CAPPED token (LAMP), the on-chain `lamp_mint` policy REQUIRES exactly 1
/// input + 1 output carrying the thread NFT ("SUPPLY"), and `supply_state.spend`
/// requires Δ>0 mint. The transition (quota/cap/monotonic) is enforced by `lamp_mint`
/// §Luật 5/7. Pass:
/// * `mint_json.route`        — "distribution" (DistributionVest, default) | "reserve"
///   (ReserveDraw). Drives BOTH the LAMP mint redeemer (`TLampMintRedeemer` Constr
///   0/1) AND which quota field is bumped by Δ.
/// * `supply_state_utxo_json` — JSON [`SupplyStateSpendUtxo`]: the SupplyState UTxO
///   to SPEND (outpoint + value incl. the thread NFT + old 4-field state
///   `dist_minted, reserve_minted, dist_cap, reserve_cap`). Pass `""` (empty) for an
///   UNCAPPED token — the old reference-only path is kept unchanged.
/// * `supply_state_script_cbor` — compiled Plutus V3 supply_state script (CBOR hex);
///   ignored when `supply_state_utxo_json` is empty.
///
/// When capped, the builder: SPENDS the SupplyState UTxO (spend redeemer `Advance` =
/// empty Constr 0), re-creates a continuing output at the supply_state script address
/// with the route-bumped quota (`dist_minted'` or `reserve_minted'` += Δ) and the caps
/// PRESERVED unchanged (§Luật 4), and adds the supply_state PlutusScript spend witness.
/// The builder ENFORCES the cap fail-fast (rejects Δ that overflows dist/reserve/total
/// cap) so it never emits a tx the validator would reject. The registry stays a
/// REFERENCE input; authority signers + the LAMP mint witness are unchanged.
///
/// ⚠ BLOCKER LIÊN-REPO (DistributionVest A-DEST + ReserveDraw meter): `lamp_mint`
/// §Luật 8 còn đòi (DistributionVest) 1 kho ref-input + toàn bộ Δ rót về kho, và
/// (ReserveDraw) 1 input mang meter NFT. Builder Lucid LAMP (`mintBuilder.ts`) cũng
/// CHƯA wire các ràng buộc này (để integration phase) và LAMP chưa cấp địa chỉ/policy
/// kho + meter NFT. Phần đó là follow-up khi LAMP cấp deploy artifacts — xem báo cáo.
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
        // supply_state script addr (= thread NFT được giữ ở đây). Continuing output
        // re-lock CÙNG value (thread NFT preserved) với quota bump theo route.
        let (ss_script_addr, _ss_hash) =
            derive_taad_script_address(supply_state_script_cbor, network).map_err(|e| e.to_string())?;

        // ── Compose SupplyState theo route (khớp lamp_mint §Luật 5 + §Luật 7) ──
        // DistributionVest → dist_minted' = dist_minted + Δ (reserve KHÔNG đổi).
        // ReserveDraw      → reserve_minted' = reserve_minted + Δ (dist KHÔNG đổi).
        // Builder TỰ ép cap TRƯỚC khi dựng tx (fail-fast, tránh tốn phí cho tx sẽ bị
        // validator reject). cap tổng = dist_cap + reserve_cap (§D7-#2, 36e15 oil LAMP).
        let route = MintRoute::parse(mint.route.as_deref().unwrap_or("distribution"))?;
        let delta = mint.amount as u128;
        let (dist_new, reserve_new) = match route {
            MintRoute::DistributionVest => {
                let d = ss
                    .dist_minted
                    .checked_add(delta)
                    .ok_or_else(|| "dist_minted + Δ tràn u128 (không thể)".to_string())?;
                if d > ss.dist_cap {
                    return Err(format!(
                        "DistributionVest vượt cap: dist_minted' = {} > dist_cap = {} (oil)",
                        d, ss.dist_cap
                    ));
                }
                (d, ss.reserve_minted)
            }
            MintRoute::ReserveDraw => {
                let r = ss
                    .reserve_minted
                    .checked_add(delta)
                    .ok_or_else(|| "reserve_minted + Δ tràn u128 (không thể)".to_string())?;
                if r > ss.reserve_cap {
                    return Err(format!(
                        "ReserveDraw vượt cap: reserve_minted' = {} > reserve_cap = {} (oil)",
                        r, ss.reserve_cap
                    ));
                }
                (ss.dist_minted, r)
            }
        };
        // Trần tổng tuyệt đối (§D7-#2): tổng phát hành lịch sử ≤ dist_cap + reserve_cap.
        let total_cap = ss
            .dist_cap
            .checked_add(ss.reserve_cap)
            .ok_or_else(|| "dist_cap + reserve_cap tràn u128 (không thể)".to_string())?;
        if dist_new + reserve_new > total_cap {
            return Err(format!(
                "vượt trần tổng: dist_minted' + reserve_minted' = {} > {} (36 tỷ LAMP oil)",
                dist_new + reserve_new,
                total_cap
            ));
        }
        // Caps BẤT BIẾN qua transition (§Luật 4): tái tạo y nguyên dist_cap/reserve_cap.
        let new_datum =
            encode_supply_state_datum(dist_new, reserve_new, ss.dist_cap, ss.reserve_cap)?;
        let continuing_value = rebuild_value(ss.amount_lovelace, &ss.assets)?;

        // Plutus V3 spend witness cho supply_state script (redeemer `Advance` = Constr 0).
        // Inline-datum spend → witness MUST NOT re-supply the datum.
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

    // Mint redeemer SHAPE:
    //   • Token CÓ cap (SupplyState) = `TLampMintRedeemer` theo route (types.ak §19):
    //     DistributionVest = Constr 0 [], ReserveDraw = Constr 1 []. Redeemer PHẢI
    //     KHỚP quota bump ở SupplyState datum (lamp_mint §Luật 5 đọc cùng redeemer `r`).
    //   • Token KHÔNG cap = empty constr (index 0) = "Mint" quy ước (đường registry cũ).
    let mint_redeemer_data = if let Some(ss) = &supply_state {
        let route = MintRoute::parse(mint.route.as_deref().unwrap_or("distribution"))?;
        // Bảo hiểm: cap trên datum CŨ phải khớp cap route đang dùng (bắt lỗi caller
        // truyền cap=0 cho route đang bump — datum sẽ vượt cap ngay). Nhẹ, không tốn.
        let _ = ss; // ss dùng lại ở khối compose phía trên; ở đây chỉ cần route.
        PlutusData::new_empty_constr_plutus_data(&BigNum::from(route.constr_index()))
    } else {
        PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))
    };
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
    // Re-lock the thread NFT ("SUPPLY") + route-bumped datum at the supply_state script
    // addr so `lamp_mint` §Luật 1 sees exactly 1 continuing thread-NFT output, with the
    // route quota bumped by Δ (§Luật 5) and caps preserved (§Luật 4).
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
        assert!(encode_authorization(&too_big).unwrap_err().contains("threshold phải 1..=N"));
        let zero = AuthorizationJson {
            kind: "multisig".into(), pkh: None,
            pkhs: Some(vec![pkh_a()]), threshold: Some(0),
        };
        assert!(encode_authorization(&zero).unwrap_err().contains("threshold phải 1..=N"));
    }

    /// Đối xứng `registry.ak:98` — quá 16 khoá thì on-chain `expect` fail, nên
    /// bộ dựng phải chặn TRƯỚC khi phát ra tx (nếu không caller mất collateral).
    #[test]
    fn encode_authorization_multisig_rejects_qua_16_khoa() {
        let pkhs: Vec<String> = (0u8..17).map(|i| hex::encode([i; 28])).collect();
        let qua_tran = AuthorizationJson {
            kind: "multisig".into(), pkh: None,
            pkhs: Some(pkhs), threshold: Some(2),
        };
        let e = encode_authorization(&qua_tran).unwrap_err();
        assert!(e.contains("tối đa 16 khoá"), "nhận: {}", e);

        // Đúng 16 thì phải qua — biên là ĐƯỢC PHÉP, khớp `<= 16`.
        let vua_du: Vec<String> = (0u8..16).map(|i| hex::encode([i; 28])).collect();
        let biên = AuthorizationJson {
            kind: "multisig".into(), pkh: None,
            pkhs: Some(vua_du), threshold: Some(16),
        };
        assert!(encode_authorization(&biên).is_ok());
    }

    /// On-chain so threshold với danh sách ĐÃ dedupe (`list.unique`). Danh sách
    /// trùng lặp phải bị chặn ở đây, không được để lọt xuống chuỗi.
    #[test]
    fn encode_authorization_multisig_dedupe_truoc_khi_so_threshold() {
        // [k1, k1, k1] threshold 3: thô N=3 nên luật cũ cho qua, nhưng uniq N=1
        // ⇒ on-chain `threshold <= list.length(uniq)` fail.
        let trung = AuthorizationJson {
            kind: "multisig".into(), pkh: None,
            pkhs: Some(vec![pkh_a(), pkh_a(), pkh_a()]), threshold: Some(3),
        };
        let e = encode_authorization(&trung).unwrap_err();
        assert!(e.contains("pkh KHÁC NHAU"), "nhận: {}", e);

        // Cùng danh sách trùng nhưng threshold 1 thì hợp lệ cả hai phía.
        let ok = AuthorizationJson {
            kind: "multisig".into(), pkh: None,
            pkhs: Some(vec![pkh_a(), pkh_a()]), threshold: Some(1),
        };
        assert!(encode_authorization(&ok).is_ok());
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

    // ─── SUPPLY STATE — encode + genesis + capped mint (khớp CỔNG on-chain thật) ─
    //
    // Schema canonical = LAMP `magiclamp/genesis/types.ak`:
    //   SupplyState = Constr 0 [dist_minted, reserve_minted, dist_cap, reserve_cap]
    // Route redeemer = TLampMintRedeemer: DistributionVest=0, ReserveDraw=1.
    // Genesis NFT = thread_nft policy, name "SUPPLY" (#"535550504c59").

    /// A distinct minimal V3 script standing in as the supply_state validator (script
    /// ADDRESS holding SupplyState); its hash differs from token/registry/thread.
    const MOCK_SUPPLY_STATE_SCRIPT: &str = "4e4d0100003322222005120012bbff";
    /// A distinct minimal V3 script standing in as the thread_nft policy (mints SUPPLY).
    const MOCK_THREAD_NFT_SCRIPT: &str = "4e4d0100003322222005120012ccff";

    /// Caps LAMP (oil) khớp `constants.ak`: dist 26,37 tỷ · reserve 9,63 tỷ · tổng 36 tỷ.
    const DIST_CAP: u128 = 26_370_000_000_000_000;
    const RESERVE_CAP: u128 = 9_630_000_000_000_000;

    /// SupplyState = Constr 0 [Int dist_minted, Int reserve_minted, Int dist_cap,
    /// Int reserve_cap] — decode + assert 4-field positional layout (contract w/ types.ak).
    #[test]
    fn encode_supply_state_datum_layout() {
        let data = encode_supply_state_datum(0, 0, DIST_CAP, RESERVE_CAP).unwrap();

        let constr = data.as_constr_plutus_data().expect("datum is constr");
        assert_eq!(constr.alternative(), BigNum::from(0u64), "SupplyState = constr 0");
        assert_eq!(constr.data().len(), 4, "4 fields: [dist_minted, reserve_minted, dist_cap, reserve_cap]");

        assert_eq!(constr.data().get(0).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "dist_minted = 0 genesis");
        assert_eq!(constr.data().get(1).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "reserve_minted = 0 genesis");
        assert_eq!(constr.data().get(2).as_integer().unwrap(), csl::BigInt::from_str(&DIST_CAP.to_string()).unwrap(), "dist_cap");
        assert_eq!(constr.data().get(3).as_integer().unwrap(), csl::BigInt::from_str(&RESERVE_CAP.to_string()).unwrap(), "reserve_cap");
    }

    /// GOLDEN CBOR: đối chiếu byte-perfect Plutus `Data` encode của SupplyState
    /// {1_000_000, 0, dist_cap, reserve_cap}. Constr 0 tag = 121 (0xd879); mảng field
    /// dùng INDEFINITE-length (0x9f … 0xff) — dạng CHUẨN Plutus (CSL + Lucid
    /// `@lucid-evolution` Data.to đều xuất indefinite; Aiken `Data` decoder chấp nhận
    /// cả definite/indefinite). Drift constr-index/field-order/số-field → byte lệch → bắt.
    #[test]
    fn supply_state_datum_golden_cbor() {
        let data = encode_supply_state_datum(1_000_000, 0, DIST_CAP, RESERVE_CAP).unwrap();
        let got = hex::encode(data.to_bytes());
        // d879 = tag 121 (Constr 0); 9f = array(indefinite);
        //   1a000f4240 = 1_000_000 (dist_minted); 00 = 0 (reserve_minted);
        //   1b005daf6012ba2000 = 26_370_000_000_000_000 (dist_cap);
        //   1b0022366f192fe000 =  9_630_000_000_000_000 (reserve_cap); ff = break.
        let expected = "d8799f1a000f4240001b005daf6012ba20001b0022366f192fe000ff";
        assert_eq!(got, expected, "SupplyState CBOR must match Plutus golden vector");
        // Field hex round-trips to the exact caps (guards the literal itself).
        assert_eq!(0x005daf6012ba2000u64 as u128, DIST_CAP);
        assert_eq!(0x0022366f192fe000u64 as u128, RESERVE_CAP);
    }

    /// Route redeemer constr index KHỚP types.ak: DistributionVest=0, ReserveDraw=1.
    #[test]
    fn mint_route_constr_indices_match_types_ak() {
        assert_eq!(MintRoute::parse("distribution").unwrap().constr_index(), 0);
        assert_eq!(MintRoute::parse("DistributionVest").unwrap().constr_index(), 0);
        assert_eq!(MintRoute::parse("reserve").unwrap().constr_index(), 1);
        assert_eq!(MintRoute::parse("ReserveDraw").unwrap().constr_index(), 1);
        assert!(MintRoute::parse("garbage").is_err(), "unknown route rejected");
    }

    /// Non-zero dist_minted encodes the right Int (continuing datum after DistributionVest).
    #[test]
    fn encode_supply_state_datum_nonzero_dist() {
        let data = encode_supply_state_datum(6_000_000, 0, DIST_CAP, RESERVE_CAP).unwrap();
        let constr = data.as_constr_plutus_data().unwrap();
        assert_eq!(constr.data().get(0).as_integer().unwrap(), csl::BigInt::from_str("6000000").unwrap());
        assert_eq!(constr.data().get(1).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "reserve untouched");
    }

    /// Genesis: thread NFT ("SUPPLY") minted under the thread_nft policy (= its hash),
    /// genesis UTxO SPENT (one-shot), output at supply_state script addr carries an
    /// inline SupplyState datum {0,0,dist_cap,reserve_cap}.
    #[test]
    fn genesis_supply_state_mints_thread_nft_state_zero() {
        let wallet_seed = "34".repeat(32);

        let tx_hex = build_genesis_supply_state(
            mock_genesis_utxo(), MOCK_THREAD_NFT_SCRIPT, DIST_CAP, RESERVE_CAP,
            MOCK_SUPPLY_STATE_SCRIPT, mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("genesis supply_state must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).expect("valid tx CBOR");
        let body = tx.body();
        let wit = tx.witness_set();

        // Thread NFT minted under the thread_nft policy = its hash, name "SUPPLY", qty 1.
        let thread_script = csl::PlutusScript::from_hex_with_version(MOCK_THREAD_NFT_SCRIPT, &csl::Language::new_plutus_v3()).unwrap();
        let thread_policy = thread_script.hash();
        let supply_name = AssetName::new(b"SUPPLY".to_vec()).unwrap();
        let mint = body.mint().expect("mint set");
        let mints_assets = mint.get(&thread_policy).expect("mint entry for thread policy");
        let mut total: i128 = 0;
        for i in 0..mints_assets.len() {
            if let Some(v) = mints_assets.get(i).unwrap().get(&supply_name) {
                total += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(total, 1, "exactly +1 thread NFT with name SUPPLY");

        // Genesis UTxO SPENT (one-shot binding).
        let inputs = body.inputs();
        let mut genesis_spent = false;
        for i in 0..inputs.len() {
            if hex::encode(inputs.get(i).transaction_id().to_bytes())
                == "7777777777777777777777777777777777777777777777777777777777777777"
            { genesis_spent = true; }
        }
        assert!(genesis_spent, "genesis UTxO must be consumed (one-shot)");

        // Output at the supply_state script addr carries the NFT + inline datum {0,0,caps}.
        let (script_addr, _) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let outs = body.outputs();
        let mut found = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() != script_addr.to_bech32(None).unwrap() { continue; }
            let has_nft = o.amount().multiasset()
                .and_then(|ma| ma.get(&thread_policy))
                .and_then(|a| a.get(&supply_name))
                .map(|q| q == BigNum::from(1u64)).unwrap_or(false);
            if !has_nft { continue; }
            let pd = o.plutus_data().expect("inline datum present");
            let constr = pd.as_constr_plutus_data().expect("datum is constr");
            assert_eq!(constr.alternative(), BigNum::from(0u64));
            assert_eq!(constr.data().len(), 4, "4-field SupplyState");
            assert_eq!(constr.data().get(0).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "dist_minted = 0");
            assert_eq!(constr.data().get(1).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "reserve_minted = 0");
            assert_eq!(constr.data().get(2).as_integer().unwrap(), csl::BigInt::from_str(&DIST_CAP.to_string()).unwrap(), "dist_cap baked");
            found = true;
        }
        assert!(found, "SupplyState output at script addr with NFT + datum{{0,0,caps}} must exist");

        // Plutus mint witness + script_data_hash present; wallet vkey signs.
        assert_eq!(wit.plutus_scripts().unwrap().len(), 1);
        assert!(body.script_data_hash().is_some());
        assert_eq!(wit.vkeys().unwrap().len(), 1, "wallet signature");
    }

    /// Build a SupplyState spend-UTxO JSON: outpoint + value (thread NFT) + 4-field old state.
    fn mock_supply_state_spend_utxo(dist_minted: u128, reserve_minted: u128) -> String {
        let thread_script = csl::PlutusScript::from_hex_with_version(MOCK_THREAD_NFT_SCRIPT, &csl::Language::new_plutus_v3()).unwrap();
        let thread_policy_hex = hex::encode(thread_script.hash().to_bytes());
        let supply_name_hex = hex::encode(b"SUPPLY");
        format!(
            r#"{{"tx_hash":"4444444444444444444444444444444444444444444444444444444444444444",
                 "index":0,"amount_lovelace":2000000,
                 "assets":[{{"policy_id":"{thread_policy_hex}","asset_name_hex":"{supply_name_hex}","quantity":1}}],
                 "supply_state_nft_policy_hex":"{thread_policy_hex}",
                 "supply_state_nft_name_hex":"{supply_name_hex}",
                 "dist_minted":{dist_minted},
                 "reserve_minted":{reserve_minted},
                 "dist_cap":{DIST_CAP},
                 "reserve_cap":{RESERVE_CAP}}}"#
        )
    }

    /// Capped mint (DistributionVest): SupplyState SPENT (not referenced), continuing
    /// output bumps dist_minted by Δ (reserve untouched), caps preserved, registry stays
    /// a reference input, mint redeemer = DistributionVest (Constr 0), token minted = Δ.
    #[test]
    fn mint_via_registry_capped_distribution_bumps_dist_minted() {
        let auth_kek = "7a".repeat(32);
        let wallet_seed = "34".repeat(32);
        let keks = format!(r#"["{}"]"#, auth_kek);
        let amount: u128 = 5_000_000;
        let mint_json = format!(
            r#"{{"asset_name_hex":"{}","amount":{},"route":"distribution"}}"#,
            hex::encode(b"tLAMP"), amount
        );
        let old_dist: u128 = 1_000_000;
        let ss_json = mock_supply_state_spend_utxo(old_dist, 0);

        let tx_hex = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            &ss_json, MOCK_SUPPLY_STATE_SCRIPT,
            mock_wallet_utxos(), mock_params(), &wallet_seed, 0, 2000,
        )
        .expect("capped distribution mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let body = tx.body();
        let wit = tx.witness_set();

        // Registry is a REFERENCE input; SupplyState is a SPEND input (not referenced).
        let ref_inputs = body.reference_inputs().expect("reference inputs set");
        let mut registry_ref = false;
        for i in 0..ref_inputs.len() {
            let h = hex::encode(ref_inputs.get(i).transaction_id().to_bytes());
            assert_ne!(h, "4444444444444444444444444444444444444444444444444444444444444444", "SupplyState must be SPENT, never referenced");
            if h == "3333333333333333333333333333333333333333333333333333333333333333" { registry_ref = true; }
        }
        assert!(registry_ref, "registry must be a reference input");
        let spend_inputs = body.inputs();
        let mut ss_spent = false;
        for i in 0..spend_inputs.len() {
            if hex::encode(spend_inputs.get(i).transaction_id().to_bytes())
                == "4444444444444444444444444444444444444444444444444444444444444444"
            { ss_spent = true; }
        }
        assert!(ss_spent, "SupplyState UTxO must be a spend input");

        // Both a spend (Advance) and a mint (DistributionVest) redeemer present.
        let redeemers = wit.redeemers().expect("redeemers present");
        let mut has_spend = false;
        let mut mint_redeemer_data: Option<PlutusData> = None;
        for i in 0..redeemers.len() {
            let r = redeemers.get(i);
            if r.tag() == csl::RedeemerTag::new_spend() { has_spend = true; }
            if r.tag() == csl::RedeemerTag::new_mint() { mint_redeemer_data = Some(r.data()); }
        }
        assert!(has_spend, "supply_state spend (Advance) redeemer present");
        let mrd = mint_redeemer_data.expect("mint redeemer present");
        assert_eq!(mrd.as_constr_plutus_data().unwrap().alternative(), BigNum::from(0u64), "mint redeemer = DistributionVest (Constr 0)");

        // Token minted = Δ under the token policy.
        let token_script = csl::PlutusScript::from_hex_with_version(MOCK_TOKEN_POLICY, &csl::Language::new_plutus_v3()).unwrap();
        let token_policy = token_script.hash();
        let tlamp_name = AssetName::new(b"tLAMP".to_vec()).unwrap();
        let mint = body.mint().expect("mint set");
        let mints_assets = mint.get(&token_policy).expect("mint entry for token policy");
        let mut minted: i128 = 0;
        for i in 0..mints_assets.len() {
            if let Some(v) = mints_assets.get(i).unwrap().get(&tlamp_name) {
                minted += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(minted, amount as i128, "minted exactly Δ tLAMP");

        // Continuing SupplyState output: thread NFT preserved, dist_minted' = old + Δ,
        // reserve untouched, caps preserved.
        let (ss_addr, _) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let thread_script = csl::PlutusScript::from_hex_with_version(MOCK_THREAD_NFT_SCRIPT, &csl::Language::new_plutus_v3()).unwrap();
        let thread_policy = thread_script.hash();
        let supply_name = AssetName::new(b"SUPPLY".to_vec()).unwrap();
        let outs = body.outputs();
        let mut found_continuing = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() != ss_addr.to_bech32(None).unwrap() { continue; }
            // The thread NFT ("SUPPLY") MUST be preserved on the continuing output
            // (lamp_mint §Luật 1 output_holding_nft; value preservation via rebuild_value).
            let has_nft = o.amount().multiasset()
                .and_then(|ma| ma.get(&thread_policy))
                .and_then(|a| a.get(&supply_name))
                .map(|q| q == BigNum::from(1u64)).unwrap_or(false);
            assert!(has_nft, "continuing SupplyState output must keep the thread NFT");
            let pd = o.plutus_data().expect("inline datum on continuing output");
            let constr = pd.as_constr_plutus_data().unwrap();
            assert_eq!(constr.data().len(), 4, "continuing datum is 4-field SupplyState");
            assert_eq!(
                constr.data().get(0).as_integer().unwrap(),
                csl::BigInt::from_str(&(old_dist + amount).to_string()).unwrap(),
                "dist_minted' = old_dist + Δ"
            );
            assert_eq!(constr.data().get(1).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "reserve_minted untouched");
            assert_eq!(constr.data().get(2).as_integer().unwrap(), csl::BigInt::from_str(&DIST_CAP.to_string()).unwrap(), "dist_cap preserved (Luật 4)");
            assert_eq!(constr.data().get(3).as_integer().unwrap(), csl::BigInt::from_str(&RESERVE_CAP.to_string()).unwrap(), "reserve_cap preserved");
            found_continuing = true;
        }
        assert!(found_continuing, "continuing SupplyState output with bumped datum must exist");

        // Authority required signer present.
        let (_, auth_keyhash) = derive_controller(&auth_kek).unwrap();
        let req = body.required_signers().expect("required signers set");
        assert!((0..req.len()).any(|i| req.get(i).to_bytes() == auth_keyhash.to_bytes()), "authority is a required signer");
    }

    /// Capped mint (ReserveDraw): bumps reserve_minted by Δ (dist untouched), mint
    /// redeemer = ReserveDraw (Constr 1).
    #[test]
    fn mint_via_registry_capped_reserve_bumps_reserve_minted() {
        let keks = format!(r#"["{}"]"#, "7a".repeat(32));
        let amount: u128 = 3_000_000;
        let mint_json = format!(
            r#"{{"asset_name_hex":"{}","amount":{},"route":"reserve"}}"#,
            hex::encode(b"tLAMP"), amount
        );
        let ss_json = mock_supply_state_spend_utxo(0, 500_000);

        let tx_hex = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            &ss_json, MOCK_SUPPLY_STATE_SCRIPT,
            mock_wallet_utxos(), mock_params(), &"34".repeat(32), 0, 2000,
        )
        .expect("capped reserve mint must build a signed tx");

        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let body = tx.body();
        let wit = tx.witness_set();

        // Mint redeemer = ReserveDraw (Constr 1).
        let redeemers = wit.redeemers().expect("redeemers present");
        let mut mint_idx: Option<BigNum> = None;
        for i in 0..redeemers.len() {
            let r = redeemers.get(i);
            if r.tag() == csl::RedeemerTag::new_mint() { mint_idx = Some(r.data().as_constr_plutus_data().unwrap().alternative()); }
        }
        assert_eq!(mint_idx.unwrap(), BigNum::from(1u64), "mint redeemer = ReserveDraw (Constr 1)");

        // Continuing datum: reserve_minted' = 500_000 + Δ, dist untouched.
        let (ss_addr, _) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let outs = body.outputs();
        let mut found = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() != ss_addr.to_bech32(None).unwrap() { continue; }
            let pd = match o.plutus_data() { Some(p) => p, None => continue };
            let constr = pd.as_constr_plutus_data().unwrap();
            if constr.data().len() != 4 { continue; }
            assert_eq!(constr.data().get(0).as_integer().unwrap(), csl::BigInt::from_str("0").unwrap(), "dist untouched");
            assert_eq!(
                constr.data().get(1).as_integer().unwrap(),
                csl::BigInt::from_str(&(500_000u128 + amount).to_string()).unwrap(),
                "reserve_minted' = 500k + Δ"
            );
            found = true;
        }
        assert!(found, "continuing SupplyState with bumped reserve must exist");
    }

    /// Δ pushing dist_minted over dist_cap is REJECTED by the builder (fail-fast before fees).
    #[test]
    fn mint_via_registry_capped_rejects_over_dist_cap() {
        let keks = format!(r#"["{}"]"#, "7a".repeat(32));
        // old dist_minted just below cap; Δ tips it over.
        let old_dist = DIST_CAP - 10;
        let mint_json = format!(
            r#"{{"asset_name_hex":"{}","amount":{},"route":"distribution"}}"#,
            hex::encode(b"tLAMP"), 100u64
        );
        let ss_json = mock_supply_state_spend_utxo(old_dist, 0);

        let err = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            &ss_json, MOCK_SUPPLY_STATE_SCRIPT,
            mock_wallet_utxos(), mock_params(), &"34".repeat(32), 0, 2000,
        )
        .expect_err("Δ over dist_cap must be rejected");
        assert!(err.contains("vượt cap"), "got: {err}");
    }

    /// Δ pushing reserve_minted over reserve_cap is REJECTED.
    #[test]
    fn mint_via_registry_capped_rejects_over_reserve_cap() {
        let keks = format!(r#"["{}"]"#, "7a".repeat(32));
        let old_reserve = RESERVE_CAP - 5;
        let mint_json = format!(
            r#"{{"asset_name_hex":"{}","amount":{},"route":"reserve"}}"#,
            hex::encode(b"tLAMP"), 100u64
        );
        let ss_json = mock_supply_state_spend_utxo(0, old_reserve);

        let err = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            &ss_json, MOCK_SUPPLY_STATE_SCRIPT,
            mock_wallet_utxos(), mock_params(), &"34".repeat(32), 0, 2000,
        )
        .expect_err("Δ over reserve_cap must be rejected");
        assert!(err.contains("vượt cap"), "got: {err}");
    }

    /// Δ exactly hitting the cap (boundary) is ACCEPTED.
    #[test]
    fn mint_via_registry_capped_accepts_exact_cap_boundary() {
        let keks = format!(r#"["{}"]"#, "7a".repeat(32));
        let old_dist = DIST_CAP - 100;
        let mint_json = format!(
            r#"{{"asset_name_hex":"{}","amount":{},"route":"distribution"}}"#,
            hex::encode(b"tLAMP"), 100u64
        );
        let ss_json = mock_supply_state_spend_utxo(old_dist, 0);

        let tx_hex = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            &ss_json, MOCK_SUPPLY_STATE_SCRIPT,
            mock_wallet_utxos(), mock_params(), &"34".repeat(32), 0, 2000,
        )
        .expect("Δ hitting cap exactly must be accepted (dist_minted' == dist_cap)");
        let tx = Transaction::from_hex(&tx_hex).unwrap();
        let (ss_addr, _) = derive_taad_script_address(MOCK_SUPPLY_STATE_SCRIPT, 0).unwrap();
        let outs = tx.body().outputs();
        let mut ok = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() != ss_addr.to_bech32(None).unwrap() { continue; }
            let pd = match o.plutus_data() { Some(p) => p, None => continue };
            let constr = pd.as_constr_plutus_data().unwrap();
            if constr.data().len() != 4 { continue; }
            assert_eq!(constr.data().get(0).as_integer().unwrap(), csl::BigInt::from_str(&DIST_CAP.to_string()).unwrap(), "dist_minted' == dist_cap at boundary");
            ok = true;
        }
        assert!(ok, "boundary continuing datum present");
    }

    /// qty == 0 rejected even on the capped path (nothing to mint).
    #[test]
    fn mint_via_registry_capped_rejects_zero_amount() {
        let keks = format!(r#"["{}"]"#, "7a".repeat(32));
        let mint_json = format!(r#"{{"asset_name_hex":"{}","amount":0,"route":"distribution"}}"#, hex::encode(b"tLAMP"));
        let ss_json = mock_supply_state_spend_utxo(0, 0);
        let err = build_mint_via_registry(
            &keks, mock_registry_ref_utxo(), MOCK_TOKEN_POLICY, &mint_json,
            &ss_json, MOCK_SUPPLY_STATE_SCRIPT,
            mock_wallet_utxos(), mock_params(), &"34".repeat(32), 0, 2000,
        )
        .expect_err("zero amount must be rejected");
        assert!(err.contains("amount must be > 0"), "got: {err}");
    }

    // ─── DECODE round-trip — guards encode/decode symmetry ─────────────
    // `mint_lamp::build_mint_lamp_via_did` decodes RAW inline_datum_hex fetched
    // from chain (Dart has no CBOR/Plutus-Data decoder). These prove the decoder
    // is the exact inverse of the encoder used to WRITE the datum on-chain — any
    // drift here means the LAMP builder would misread real chain data.

    #[test]
    fn decode_registry_datum_round_trips_single_and_multisig() {
        let entries = vec![
            EntryJson {
                action_tag_hex: hex::encode(b"LAMPtag"),
                authorization: AuthorizationJson { kind: "single".into(), pkh: Some(pkh_a()), pkhs: None, threshold: None },
            },
            EntryJson {
                action_tag_hex: hex::encode(b"PARTNER"),
                authorization: AuthorizationJson { kind: "multisig".into(), pkh: None, pkhs: Some(vec![pkh_a(), pkh_b()]), threshold: Some(2) },
            },
            EntryJson {
                action_tag_hex: hex::encode(b"OLD"),
                authorization: AuthorizationJson { kind: "revoked".into(), pkh: None, pkhs: None, threshold: None },
            },
        ];
        let encoded = encode_registry_datum(GOVERNING_DID, &entries).unwrap();
        let hex_str = hex::encode(encoded.to_bytes());

        let decoded = decode_registry_datum(&hex_str).unwrap();
        assert_eq!(decoded.governing_did, GOVERNING_DID);
        assert_eq!(decoded.entries.len(), 3);

        assert_eq!(decoded.entries[0].token_tag, b"LAMPtag".to_vec());
        match &decoded.entries[0].authority {
            DecodedAuthority::SinglePkh(pkh) => assert_eq!(*pkh, hex::decode(pkh_a()).unwrap()),
            _ => panic!("entry 0 must decode as SinglePkh"),
        }

        assert_eq!(decoded.entries[1].token_tag, b"PARTNER".to_vec());
        match &decoded.entries[1].authority {
            DecodedAuthority::MultiSig { pkhs, threshold } => {
                assert_eq!(*threshold, 2);
                assert_eq!(pkhs.len(), 2);
                assert_eq!(pkhs[0], hex::decode(pkh_a()).unwrap());
                assert_eq!(pkhs[1], hex::decode(pkh_b()).unwrap());
            }
            _ => panic!("entry 1 must decode as MultiSig"),
        }

        assert_eq!(decoded.entries[2].token_tag, b"OLD".to_vec());
        assert!(matches!(decoded.entries[2].authority, DecodedAuthority::Revoked));
    }

    #[test]
    fn find_registry_authority_exact_one_match_ok_zero_or_dup_reject() {
        let entries = vec![EntryJson {
            action_tag_hex: hex::encode(b"LAMPtag"),
            authorization: AuthorizationJson { kind: "single".into(), pkh: Some(pkh_a()), pkhs: None, threshold: None },
        }];
        let hex_str = hex::encode(encode_registry_datum(GOVERNING_DID, &entries).unwrap().to_bytes());
        let decoded = decode_registry_datum(&hex_str).unwrap();

        // Found.
        assert!(find_registry_authority(&decoded, b"LAMPtag").is_ok());
        // Not found → Err (0 entries match).
        let err = find_registry_authority(&decoded, b"WRONG").unwrap_err();
        assert!(err.contains("không tìm thấy"), "got: {err}");

        // Duplicate tag in datum → fail-closed (no first-match).
        let dup_entries = vec![
            EntryJson { action_tag_hex: hex::encode(b"LAMPtag"), authorization: AuthorizationJson { kind: "single".into(), pkh: Some(pkh_a()), pkhs: None, threshold: None } },
            EntryJson { action_tag_hex: hex::encode(b"LAMPtag"), authorization: AuthorizationJson { kind: "single".into(), pkh: Some(pkh_b()), pkhs: None, threshold: None } },
        ];
        let dup_hex = hex::encode(encode_registry_datum(GOVERNING_DID, &dup_entries).unwrap().to_bytes());
        let dup_decoded = decode_registry_datum(&dup_hex).unwrap();
        let dup_err = find_registry_authority(&dup_decoded, b"LAMPtag").unwrap_err();
        assert!(dup_err.contains("TRÙNG"), "got: {dup_err}");
    }

    #[test]
    fn decode_supply_state_datum_round_trips() {
        let encoded = encode_supply_state_datum(DIST_CAP - 100, 42, DIST_CAP, RESERVE_CAP).unwrap();
        let hex_str = hex::encode(encoded.to_bytes());
        let decoded = decode_supply_state_datum(&hex_str).unwrap();
        assert_eq!(decoded.dist_minted, DIST_CAP - 100);
        assert_eq!(decoded.reserve_minted, 42);
        assert_eq!(decoded.dist_cap, DIST_CAP);
        assert_eq!(decoded.reserve_cap, RESERVE_CAP);
    }

    #[test]
    fn decode_supply_state_datum_rejects_wrong_field_count() {
        // 3-field datum (old schema drift) must be rejected, not silently misread.
        let mut fields = PlutusList::new();
        fields.add(&PlutusData::new_integer(&csl::BigInt::from_str("1").unwrap()));
        fields.add(&PlutusData::new_integer(&csl::BigInt::from_str("2").unwrap()));
        fields.add(&PlutusData::new_integer(&csl::BigInt::from_str("3").unwrap()));
        let bad = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(0u64), &fields));
        let err = decode_supply_state_datum(&hex::encode(bad.to_bytes())).unwrap_err();
        assert!(err.contains("4 field"), "got: {err}");
    }
}
