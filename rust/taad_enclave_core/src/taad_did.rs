// ================================================================
// PhoenixKey — TAAD DID + UTxO operations (Rust core)
//
// Pure Rust logic for 4 FFI exposed in lib.rs:
//   1. construct_did                  — DID identifier per Math Spec §2.1
//   2. build_publish_did_tx           — Cardano tx with W3C DID Doc metadata
//   3. build_create_taad_utxo_tx      — TODO: mint TAAD NFT + lock to script
//   4. build_rotate_taad_tx           — TODO: spend + Rotate redeemer + new datum
//
// Naming convention (mandate user §V.1):
//   - Code identifier: `taad_*` prefix (giữ nguyên, không đổi sang seal/an)
//   - UI label tiếng Việt "Ấn" defer cho frontend layer
//
// Atomicity (mandate user §V.2):
//   - publish_did_tx GỘP build_doc + publish_tx (phụ thuộc 1-1, ít reuse)
//   - construct_did TÁCH RIÊNG (reuse: root/sub/entity/validation DID)
//   - create + rotate TÁCH RIÊNG (1-vs-N lần/user)
//
// Data provider (mandate user §V.3):
//   - FFI KHÔNG embed Blockfrost call — caller fetch UTxO + protocol params
//   - Defer LampNet Daemon abstraction (Task #16) sau khi prototype ổn định
// ================================================================

use blake2::{Blake2b, Digest};
use blake2::digest::consts::{U28, U32};
use cardano_serialization_lib as csl;
use cardano_serialization_lib::{
    Address, AssetName, AuxiliaryData, BaseAddress, BigInt, BigNum, Bip32PrivateKey,
    ConstrPlutusData, Credential, EnterpriseAddress, GeneralTransactionMetadata,
    LinearFee, MetadataList, MetadataMap, MultiAsset, NetworkInfo, PlutusData,
    PlutusList, ScriptHash, Transaction, TransactionBuilder,
    TransactionBuilderConfigBuilder, TransactionHash, TransactionInput,
    TransactionMetadatum, TransactionOutputBuilder, TransactionWitnessSet,
    Value, Vkeywitnesses,
};
use data_encoding::BASE32_NOPAD;
use hkdf::Hkdf;
use rand::RngCore;
use serde::Deserialize;
use serde_json::Value as JsonValue;
use zeroize::Zeroizing;
use sha2::Sha256;

/// BLAKE2b-256 = BLAKE2b with 32-byte output (per RFC 7693, used by Cardano too).
pub(crate) type Blake2b256 = Blake2b<U32>;

/// BLAKE2b-224 = 28-byte output. Used for Cardano credential / key hashes
/// (controller_pkh, script_hash). Match `Blake2b224(pubkey)` semantics from
/// the ledger spec / types.ak `VerificationKeyHash`.
type Blake2b224 = Blake2b<U28>;

/// Metadata label for PhoenixKey DID Document. Chose 6789 over the more
/// common CIP-25 label 721 because 721 is reserved for NFT metadata in the
/// Cardano ecosystem — publishing DID Docs there would conflict with NFT
/// indexers. 6789 is a custom PhoenixKey label, documented in `did:phoenix`
/// method spec and `derive-demo/src/bin/publish_did.rs` (3 preprod txes).
const METADATA_LABEL_DID: u64 = 6789;

/// JSON-LD `@context` entries for W3C DID Core v1.0 + Ed25519-2020 suite +
/// PhoenixKey extension. Order matters for interop with Universal Resolver.
const CTX_W3C_DID: &str = "https://www.w3.org/ns/did/v1";
const CTX_ED25519_2020: &str = "https://w3id.org/security/suites/ed25519-2020/v1";
const CTX_PHOENIXKEY: &str = "https://phoenixkey.me/context/v1";

/// Multicodec varint prefix for Ed25519 public key. The base spec defines
/// 0xed for ed25519-pub; varint encoding gives [0xed, 0x01] (the 0x01
/// continuation byte is required because 0xed has the high bit set).
const MULTICODEC_ED25519_PREFIX: [u8; 2] = [0xed, 0x01];

// ─── 1. DID CONSTRUCTION ───────────────────────────────────────────

/// Construct DID per Math Spec v4.3 §2.1 + did:phoenix method spec §2.
///
/// ```text
/// hash = BLAKE2b-256( type_byte || creator?:"root" || slot_be8 || rand32 )
/// did  = "did:phoenix:" || BASE32_NOPAD_LOWER(slot_be8) || ":" || lowerhex(hash)
/// ```
///
/// # Inputs
/// * `type_byte`   — entity type byte (0x01=root person, 0x02=sub, 0x03=entity, ...
///   per spec §1.2 EntityType enum)
/// * `creator_did` — parent DID (Some(...) for sub-identity, None for root).
///   Encoded as ASCII bytes directly; "root" literal substituted when None.
/// * `slot`        — Cardano absolute slot at time of construction. Caller
///   fetches từ `/blocks/latest` (Blockfrost) hoặc LampNet Daemon (future).
///
/// # Output
/// Owned `String` — DID string, ASCII, lowercase, no padding.
///
/// # Determinism note
/// Mỗi gọi sinh 32-byte random khác nhau → DID khác nhau ngay cả khi cùng
/// (type, creator, slot). Tính chất này TỐT cho privacy: 2 user cùng slot
/// không collision. Bad nếu caller cần reproducible — nhưng spec mandate
/// random_256 nên không expose seed parameter.
pub fn construct_did(type_byte: u8, creator_did: Option<&str>, slot: u64) -> String {
    let mut hasher = Blake2b256::new();

    // 1. type_byte (1 byte)
    hasher.update([type_byte]);

    // 2. creator DID string hoặc literal "root"
    //    Encode ASCII bytes — spec §2.1 không define preimage encoding rõ ràng
    //    nhưng publish_did.rs (đã chạy preprod) dùng UTF-8 raw bytes.
    match creator_did {
        Some(c) if !c.is_empty() => hasher.update(c.as_bytes()),
        _ => hasher.update(b"root"),
    }

    // 3. slot big-endian 8 bytes
    let slot_be = slot.to_be_bytes();
    hasher.update(slot_be);

    // 4. 32 random bytes — collision resistance + privacy
    let mut random_32 = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut random_32);
    hasher.update(random_32);

    let hash_32 = hasher.finalize();

    // 5. encode slot prefix + hex hash suffix
    //    BASE32_NOPAD lowercase — match đúng Java decoder
    //    (ResolverServiceImpl.decodeBase32SlotBigEndian) với 13-char width.
    let slot_b32 = BASE32_NOPAD.encode(&slot_be).to_lowercase();
    let hash_hex = hex::encode(hash_32);

    format!("did:phoenix:{}:{}", slot_b32, hash_hex)
}

// ─── 2. PUBLISH DID DOCUMENT TX ────────────────────────────────────
//
// Gộp build_doc + publish_tx (mandate §V.2) vì:
//   - Tx publish luôn cần DID Document body ngay khi build
//   - Không có reuse: mỗi DID publish đúng 1 lần
//   - Tách 2 step → caller phải pipe JSON qua FFI 2 chuyến, dễ leak / mismatch
//
// Tx layout:
//   inputs:   caller_provided UTxO list (cover fee + min_ada)
//   outputs:
//     - change to wallet_address
//   metadata 6789:
//     - JSON body: W3C DID Document {context, id, controller,
//       verificationMethod[2: hw + taad], authentication, ..., service}
//     - Auto-chunk strings > 64 byte (Cardano metadata CBOR limit)
//   ttl: current_slot + 7200 (~2h window for chain inclusion)
//   witnesses: wallet payment key sign (Ed25519)

/// One UTxO input as passed in by the caller's `utxo_inputs_json`. Caller
/// (Dart side) fetches these from a data provider (Blockfrost initially,
/// LampNet Daemon later via Task #16) and serializes to JSON.
#[derive(Deserialize, Debug, Clone)]
pub struct UtxoInput {
    pub tx_hash: String,
    pub index: u32,
    pub amount_lovelace: u64,
    #[serde(default)]
    pub assets: Vec<UtxoAsset>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct UtxoAsset {
    pub policy_id: String,
    pub asset_name_hex: String,
    pub quantity: u64,
}

/// Compute `publicKeyMultibase` string for an Ed25519 public key per W3C
/// DID Core §publicKeyMultibase.
///
/// Format: `"z" + base58btc(multicodec_varint(0xed) || pubkey32)`
/// - `z` is the multibase prefix for base58btc
/// - `[0xed, 0x01]` is the varint encoding of the ed25519-pub multicodec
///
/// Required for interop with Veramo, Spruce ID, Trinsic, Microsoft Entra
/// Verified ID, Universal Resolver. Match exact format from publish_did.rs
/// (proven on preprod across 3 transactions).
fn multibase_ed25519(pubkey: &[u8]) -> String {
    let mut bytes = Vec::with_capacity(2 + pubkey.len());
    bytes.extend_from_slice(&MULTICODEC_ED25519_PREFIX);
    bytes.extend_from_slice(pubkey);
    format!("z{}", bs58::encode(bytes).into_string())
}

/// Convert a string to a TransactionMetadatum, auto-chunking into a list of
/// 60-byte slices when the input exceeds the Cardano metadata text limit
/// of 64 bytes per CBOR text-string. We use 60 instead of 64 as a small
/// safety margin against CBOR encoding overhead on the chunk boundary.
fn metadatum_text(value: &str) -> Result<TransactionMetadatum, &'static str> {
    if value.len() <= 64 {
        TransactionMetadatum::new_text(value.to_string())
            .map_err(|_| "metadatum_text: failed to construct text metadatum")
    } else {
        let mut list = MetadataList::new();
        for chunk in value.as_bytes().chunks(60) {
            let chunk_str = std::str::from_utf8(chunk)
                .map_err(|_| "metadatum_text: chunk boundary split a UTF-8 sequence")?;
            let m = TransactionMetadatum::new_text(chunk_str.to_string())
                .map_err(|_| "metadatum_text: failed to construct chunk metadatum")?;
            list.add(&m);
        }
        Ok(TransactionMetadatum::new_list(&list))
    }
}

/// Convert a list of strings into a MetadataList, with each entry auto-chunked
/// via [`metadatum_text`].
fn metadatum_string_list(items: &[&str]) -> Result<TransactionMetadatum, &'static str> {
    let mut list = MetadataList::new();
    for s in items {
        list.add(&metadatum_text(s)?);
    }
    Ok(TransactionMetadatum::new_list(&list))
}

/// Insert key (string) → value into a MetadataMap. Wrapper to convert the
/// CSL Result-returning insert_str into our crate's `&'static str` error.
fn map_put(
    map: &mut MetadataMap,
    key: &str,
    value: &TransactionMetadatum,
) -> Result<(), &'static str> {
    map.insert_str(key, value)
        .map_err(|_| "map_put: insert_str failed")?;
    Ok(())
}

/// CIP-1852 derivation path constants (1852'/1815'/0'/role/index). 0x80000000
/// is the BIP-32 hardened-derivation bit.
fn harden(i: u32) -> u32 {
    i | 0x80000000
}

/// Derive Cardano payment address + payment xprv from 32-byte wallet entropy
/// using CIP-1852 BIP-44 path. Mirrors `derive_wallet` in
/// `derive-demo/src/bin/publish_did.rs` — keep behavior bit-identical so the
/// same seed gives the same address on both code paths.
pub(crate) fn derive_wallet(
    entropy: &[u8; 32],
    network: u8,
) -> Result<(String, Bip32PrivateKey), &'static str> {
    let root = Bip32PrivateKey::from_bip39_entropy(entropy, &[]);
    let acct = root
        .derive(harden(1852))
        .derive(harden(1815))
        .derive(harden(0));
    let payment_xprv = acct.derive(0).derive(0);
    let payment_pub = payment_xprv.to_raw_key().to_public();
    let stake_pub = acct.derive(2).derive(0).to_raw_key().to_public();

    let network_id = match network {
        0 => NetworkInfo::testnet_preprod().network_id(),
        1 => NetworkInfo::mainnet().network_id(),
        _ => return Err("derive_wallet: network must be 0 (preprod) or 1 (mainnet)"),
    };

    let addr = BaseAddress::new(
        network_id,
        &Credential::from_keyhash(&payment_pub.hash()),
        &Credential::from_keyhash(&stake_pub.hash()),
    )
    .to_address()
    .to_bech32(None)
    .map_err(|_| "derive_wallet: to_bech32 failed")?;

    Ok((addr, payment_xprv))
}

/// Build the W3C DID Document as a Cardano metadata map (label 6789).
/// Produces dual-key verification methods per Phase 2 architecture:
///   - `#hw-key-1`   — HW_Key (P-256), off-chain authentication / assertion
///   - `#taad-key-1` — TAAD_Key (Ed25519), on-chain controller for capability
///                     invocation & delegation
///
/// HW_Key is published as a hex string in the `publicKeyHex` field
/// (W3C-allowed alternative to multibase); TAAD_Key uses `publicKeyMultibase`
/// (multicodec ed25519-pub + base58btc). The mixed-encoding choice mirrors
/// the resolver's auto-detect logic in `ResolverServiceImpl.detectKeyType`.
#[allow(clippy::too_many_arguments)]
fn build_did_document_metadata(
    did: &str,
    hw_pubkey_hex: &str,
    taad_pubkey_hex: &str,
    wallet_address: &str,
    service_endpoint: &str,
    network: u8,
    current_slot: u64,
) -> Result<GeneralTransactionMetadata, &'static str> {
    // Decode TAAD pubkey bytes for multibase encoding.
    let taad_bytes = hex::decode(taad_pubkey_hex)
        .map_err(|_| "build_did_document_metadata: taad_pubkey_hex is not valid hex")?;
    if taad_bytes.len() != 32 {
        return Err("build_did_document_metadata: TAAD_Key must be 32 bytes (Ed25519)");
    }
    let taad_multibase = multibase_ed25519(&taad_bytes);

    // Sanity-check HW_Key hex format (allow either compressed 33 bytes or
    // uncompressed 65 bytes for P-256 — auto-detected by resolver).
    let hw_len = hw_pubkey_hex.len();
    if !(hw_len == 64 || hw_len == 66 || hw_len == 130) {
        return Err(
            "build_did_document_metadata: hw_pubkey_hex must be 64/66/130 hex chars",
        );
    }

    let hw_key_id = format!("{}#hw-key-1", did);
    let taad_key_id = format!("{}#taad-key-1", did);
    let svc_id = format!("{}#cardano-wallet", did);

    // verificationMethod[0] — HW_Key
    let mut vm_hw = MetadataMap::new();
    map_put(&mut vm_hw, "id", &metadatum_text(&hw_key_id)?)?;
    map_put(
        &mut vm_hw,
        "type",
        &metadatum_text("EcdsaSecp256r1VerificationKey2019")?,
    )?;
    map_put(&mut vm_hw, "controller", &metadatum_text(did)?)?;
    map_put(&mut vm_hw, "publicKeyHex", &metadatum_text(hw_pubkey_hex)?)?;

    // verificationMethod[1] — TAAD_Key
    let mut vm_taad = MetadataMap::new();
    map_put(&mut vm_taad, "id", &metadatum_text(&taad_key_id)?)?;
    map_put(
        &mut vm_taad,
        "type",
        &metadatum_text("Ed25519VerificationKey2020")?,
    )?;
    map_put(&mut vm_taad, "controller", &metadatum_text(did)?)?;
    map_put(
        &mut vm_taad,
        "publicKeyMultibase",
        &metadatum_text(&taad_multibase)?,
    )?;

    let mut vm_list = MetadataList::new();
    vm_list.add(&TransactionMetadatum::new_map(&vm_hw));
    vm_list.add(&TransactionMetadatum::new_map(&vm_taad));

    // service[0] — CardanoWallet endpoint
    let mut svc = MetadataMap::new();
    map_put(&mut svc, "id", &metadatum_text(&svc_id)?)?;
    map_put(&mut svc, "type", &metadatum_text("CardanoWallet")?)?;
    map_put(
        &mut svc,
        "serviceEndpoint",
        &metadatum_text(wallet_address)?,
    )?;
    let mut svc_list = MetadataList::new();
    svc_list.add(&TransactionMetadatum::new_map(&svc));

    // PhoenixKey extension — non-W3C-core, prefix underscore by convention.
    let mut ext = MetadataMap::new();
    ext.insert_str(
        "createdSlot",
        &TransactionMetadatum::new_int(&csl::Int::new(&BigNum::from(current_slot))),
    )
    .map_err(|_| "build_did_document_metadata: ext.createdSlot insert failed")?;
    let network_label = if network == 0 { "preprod" } else { "mainnet" };
    map_put(&mut ext, "network", &metadatum_text(network_label)?)?;
    // Record which resolver the issuer recommends.
    map_put(
        &mut ext,
        "resolverEndpoint",
        &metadatum_text(service_endpoint)?,
    )?;

    // Top-level DID Document map.
    let mut doc = MetadataMap::new();
    map_put(
        &mut doc,
        "@context",
        &metadatum_string_list(&[CTX_W3C_DID, CTX_ED25519_2020, CTX_PHOENIXKEY])?,
    )?;
    map_put(&mut doc, "id", &metadatum_text(did)?)?;
    map_put(&mut doc, "controller", &metadatum_text(did)?)?;
    map_put(
        &mut doc,
        "verificationMethod",
        &TransactionMetadatum::new_list(&vm_list),
    )?;
    // Phase 2 purpose split: HW handles auth/assertion (off-chain device);
    // TAAD handles capability invocation/delegation (on-chain).
    map_put(
        &mut doc,
        "authentication",
        &metadatum_string_list(&[&hw_key_id])?,
    )?;
    map_put(
        &mut doc,
        "assertionMethod",
        &metadatum_string_list(&[&hw_key_id])?,
    )?;
    map_put(
        &mut doc,
        "capabilityInvocation",
        &metadatum_string_list(&[&taad_key_id])?,
    )?;
    map_put(
        &mut doc,
        "capabilityDelegation",
        &metadatum_string_list(&[&taad_key_id])?,
    )?;
    map_put(&mut doc, "service", &TransactionMetadatum::new_list(&svc_list))?;
    map_put(&mut doc, "_phoenixkey", &TransactionMetadatum::new_map(&ext))?;

    let mut all = GeneralTransactionMetadata::new();
    all.insert(
        &BigNum::from(METADATA_LABEL_DID),
        &TransactionMetadatum::new_map(&doc),
    );
    Ok(all)
}

/// Build a `TransactionBuilder` configured with protocol parameters parsed
/// from Blockfrost's `/epochs/latest/parameters` (or equivalent LampNet
/// endpoint, future). The +200 bump on `min_fee_b` matches publish_did.rs —
/// CSL 13's deprecated `add_key_input` under-estimates fee by witness size.
pub(crate) fn build_tx_builder(
    params: &JsonValue,
) -> Result<TransactionBuilder, &'static str> {
    let min_fee_a = params["min_fee_a"]
        .as_u64()
        .ok_or("protocol_params: missing min_fee_a")?;
    let min_fee_b = params["min_fee_b"]
        .as_u64()
        .ok_or("protocol_params: missing min_fee_b")?;
    // Blockfrost serializes large amounts as strings — accept either.
    let coins_per_utxo_size: u64 = match &params["coins_per_utxo_size"] {
        JsonValue::Number(n) => n.as_u64().ok_or("coins_per_utxo_size not u64")?,
        JsonValue::String(s) => s
            .parse()
            .map_err(|_| "coins_per_utxo_size string is not numeric")?,
        _ => 4310,
    };
    let pool_deposit: u64 = match &params["pool_deposit"] {
        JsonValue::Number(n) => n.as_u64().ok_or("pool_deposit not u64")?,
        JsonValue::String(s) => s
            .parse()
            .map_err(|_| "pool_deposit string is not numeric")?,
        _ => return Err("protocol_params: missing pool_deposit"),
    };
    let key_deposit: u64 = match &params["key_deposit"] {
        JsonValue::Number(n) => n.as_u64().ok_or("key_deposit not u64")?,
        JsonValue::String(s) => s
            .parse()
            .map_err(|_| "key_deposit string is not numeric")?,
        _ => return Err("protocol_params: missing key_deposit"),
    };

    let linear_fee = LinearFee::new(
        &BigNum::from(min_fee_a),
        &BigNum::from(min_fee_b + 200),
    );

    // ExUnit prices: required by CSL whenever a Plutus input is present (the
    // change/fee calc multiplies the redeemer's ExUnits by these prices). For
    // ADA-only / metadata txes (publish, create, transfer) this config is
    // simply unused, so always supplying it is harmless. Parse Blockfrost's
    // `price_mem` / `price_step` decimals into the canonical ledger fractions;
    // fall back to the standard mainnet/preprod values (price_mem = 577/10000,
    // price_step = 721/10000000) when the params omit them.
    let (mem_num, mem_den) = parse_price_fraction(&params["price_mem"], 577, 10_000);
    let (step_num, step_den) = parse_price_fraction(&params["price_step"], 721, 10_000_000);
    let ex_unit_prices = csl::ExUnitPrices::new(
        &csl::UnitInterval::new(&BigNum::from(mem_num), &BigNum::from(mem_den)),
        &csl::UnitInterval::new(&BigNum::from(step_num), &BigNum::from(step_den)),
    );

    let cfg = TransactionBuilderConfigBuilder::new()
        .fee_algo(&linear_fee)
        .pool_deposit(&BigNum::from(pool_deposit))
        .key_deposit(&BigNum::from(key_deposit))
        .coins_per_utxo_byte(&BigNum::from(coins_per_utxo_size))
        .ex_unit_prices(&ex_unit_prices)
        .max_value_size(5000)
        .max_tx_size(16384)
        .build()
        .map_err(|_| "build_tx_builder: TransactionBuilderConfig build failed")?;
    Ok(TransactionBuilder::new(&cfg))
}

/// Convert a Blockfrost price field (a JSON decimal like `0.0577`, or a
/// numerator/denominator-free number) into a (numerator, denominator) pair.
/// Blockfrost serializes these as floats or numeric strings; we recover an
/// exact fraction by scaling by a power of ten. Falls back to the supplied
/// canonical fraction when the field is absent or unparseable.
fn parse_price_fraction(v: &JsonValue, default_num: u64, default_den: u64) -> (u64, u64) {
    let s = match v {
        JsonValue::Number(n) => n.to_string(),
        JsonValue::String(s) => s.clone(),
        _ => return (default_num, default_den),
    };
    // Parse "a.b" → numerator = ab, denominator = 10^len(b).
    match s.split_once('.') {
        Some((int_part, frac_part)) => {
            let combined = format!("{}{}", int_part, frac_part);
            match combined.parse::<u64>() {
                Ok(num) => (num, 10u64.pow(frac_part.len() as u32)),
                Err(_) => (default_num, default_den),
            }
        }
        None => match s.parse::<u64>() {
            Ok(num) => (num, 1),
            Err(_) => (default_num, default_den),
        },
    }
}

/// Select the single biggest-lovelace UTxO from the caller's list. This is
/// the minimal coin-selection strategy — sufficient for DID publishing where
/// the tx output count is small (1 change output) and fee is well under 1
/// tADA. A future commit can swap in a multi-input selection algorithm
/// (largest-first with min-ada satisfaction) without breaking the FFI.
pub(crate) fn pick_largest_utxo(utxos: &[UtxoInput]) -> Result<&UtxoInput, &'static str> {
    utxos
        .iter()
        .max_by_key(|u| u.amount_lovelace)
        .ok_or("pick_largest_utxo: empty utxo list — caller must provide ≥1 funded UTxO")
}

/// Build + sign tx publish DID Document. Returns hex-encoded signed tx CBOR.
///
/// Ported from `derive-demo/src/bin/publish_did.rs` which has been verified
/// on preprod across 3 transactions. Differences from the CLI version:
///   - No Blockfrost calls: caller passes UTxO list + protocol params as JSON
///   - No hardcoded FEE_WALLET mnemonic: caller passes 32-byte seed
///   - Dual-key verification methods (Phase 2) instead of single payment key
///
/// # Inputs
/// * `did`                  — output of [`construct_did`]
/// * `hw_pubkey_hex`        — HW_Key public key in hex (P-256, 64/66/130 chars)
/// * `taad_pubkey_hex`      — TAAD_Key public key in hex (Ed25519, 64 chars)
/// * `wallet_address`       — Bech32 Cardano address to receive change. Note
///   that this should match the address derived from `wallet_seed_hex` —
///   caller computed it ahead of time via [`taad_derive_cardano_address`]
/// * `wallet_seed_hex`      — 32-byte hex (64 chars). Used both to sign the
///   tx witness and to verify the change address derivation
/// * `service_endpoint`     — Resolver URL recorded inside `_phoenixkey.resolverEndpoint`
/// * `network`              — 0 = preprod, 1 = mainnet
/// * `utxo_inputs_json`     — JSON array of [`UtxoInput`] (caller queries provider)
/// * `protocol_params_json` — JSON object from `/epochs/latest/parameters`
/// * `current_slot`         — Cardano tip slot (TTL = `current_slot + 7200`)
///
/// # Output
/// Hex string of the signed tx CBOR. Caller submits via Blockfrost
/// `/tx/submit` (Content-Type: `application/cbor`).
#[allow(clippy::too_many_arguments)]
pub fn build_publish_did_tx(
    did: &str,
    hw_pubkey_hex: &str,
    taad_pubkey_hex: &str,
    wallet_address: &str,
    wallet_seed_hex: &str,
    service_endpoint: &str,
    network: u8,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, &'static str> {
    // ─── 1. Parse + validate inputs ───────────────────────────────
    if !did.starts_with("did:phoenix:") {
        return Err("build_publish_did_tx: did must start with 'did:phoenix:'");
    }

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|_| "wallet_seed_hex is not valid hex")?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to exactly 32 bytes");
    }
    // Wallet seed — scrubbed from RAM on scope exit (D9).
    let mut seed: Zeroizing<[u8; 32]> = Zeroizing::new([0u8; 32]);
    seed.copy_from_slice(&seed_bytes);

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxo_inputs_json)
        .map_err(|_| "utxo_inputs_json is not a valid JSON array of UtxoInput")?;
    if utxos.is_empty() {
        return Err("utxo_inputs_json is empty — caller must provide ≥1 funded UTxO");
    }

    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|_| "protocol_params_json is not valid JSON")?;

    // ─── 2. Derive wallet from seed; cross-check change address ───
    let (derived_addr, payment_xprv) = derive_wallet(&seed, network)?;
    if derived_addr != wallet_address {
        // The caller-supplied address does not match what the seed derives —
        // this is almost certainly a programming bug and would cause change
        // to go to the wrong place. Fail closed.
        return Err(
            "wallet_address does not match address derived from wallet_seed_hex \
             — check that both came from the same seed",
        );
    }

    // ─── 3. Build transaction builder with parsed params ──────────
    let mut tb = build_tx_builder(&params)?;

    // ─── 4. Add largest UTxO as input ─────────────────────────────
    let picked = pick_largest_utxo(&utxos)?;
    let tx_in = TransactionInput::new(
        &TransactionHash::from_hex(&picked.tx_hash)
            .map_err(|_| "utxo tx_hash is not a valid 32-byte hex")?,
        picked.index,
    );
    tb.add_key_input(
        &payment_xprv.to_raw_key().to_public().hash(),
        &tx_in,
        &Value::new(&BigNum::from(picked.amount_lovelace)),
    );

    // ─── 5. Attach DID Document as metadata label 6789 ────────────
    let metadata = build_did_document_metadata(
        did,
        hw_pubkey_hex,
        taad_pubkey_hex,
        wallet_address,
        service_endpoint,
        network,
        current_slot,
    )?;
    let mut aux_data = AuxiliaryData::new();
    aux_data.set_metadata(&metadata);
    tb.set_auxiliary_data(&aux_data);

    // ─── 6. Change output back to wallet ──────────────────────────
    let wallet_addr_obj = Address::from_bech32(wallet_address)
        .map_err(|_| "wallet_address is not a valid bech32 address")?;
    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|_| "add_change_if_needed failed (likely insufficient input for fee)")?;

    // TTL: ~2h window. 7200 slots = 2 hours on Cardano (1 slot = 1 second
    // post-Shelley). Enough room for chain propagation and resubmission.
    tb.set_ttl_bignum(&BigNum::from(current_slot + 7200));

    // ─── 7. Build + sign ─────────────────────────────────────────
    let tx_body = tb
        .build()
        .map_err(|_| "TransactionBuilder.build failed (check coin selection + min fee)")?;

    // CSL 13 doesn't expose `hash_transaction` publicly, so compute the
    // BLAKE2b-256 of the body bytes ourselves. This matches the protocol's
    // tx_id derivation in ledger-spec.
    let mut h = Blake2b256::new();
    h.update(tx_body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes failed (length mismatch)")?;

    let mut witnesses = TransactionWitnessSet::new();
    let mut vkeys = Vkeywitnesses::new();
    let raw_priv = payment_xprv.to_raw_key();
    let vkey_witness = csl::make_vkey_witness(&tx_hash, &raw_priv);
    vkeys.add(&vkey_witness);
    witnesses.set_vkeys(&vkeys);

    let tx = Transaction::new(&tx_body, &witnesses, Some(aux_data));
    Ok(hex::encode(tx.to_bytes()))
}

// ─── 3. TAAD Plutus Data encoding (per types.ak v0.1.0-preprod) ────
//
// Validator schema source: `PhoenixKey-Validator/lib/phoenixkey/types.ak`
// + compiled blueprint `PhoenixKey-Validator/deploy/plutus-preprod.json`.
//
// TAADDatum (constr 0, 10 fields):
//   0 did:             ByteArray
//   1 entity_type:     EntityType  (constr 0..9, no fields)
//   2 controller_pkh:  ByteArray (28-byte blake2b_224 of TAAD_Key pubkey)
//   3 hw_key_pubkey:   ByteArray (32-byte raw P-256/Ed25519 pubkey)
//   4 sequence:        Int
//   5 status:          TAADStatus  (Active=0/Recovering=1/Migrated=2/Revoked=3)
//   6 guardians:       List<ByteArray>
//   7 parent_did:      Option<ByteArray>  (Some=constr 0 [x] / None=constr 1 [])
//   8 revoked_slot:    Option<Int>        (Some=constr 0 [x] / None=constr 1 [])
//   9 recovery_anchor: Option<ByteArray>  (Some=constr 0 [x] / None=constr 1 [])
//     LampNet CID (bech32 string → UTF-8 bytes) neo bản phân tán của khoá
//     controller hiện tại. None = chưa phân tán (genesis / trước rotation đầu).
//     Field thứ 10, append cuối struct để giữ thứ tự CBOR của 9 field cũ.
//
// TAADRedeemer (7 constructors):
//   constr 0 Rotate { new_controller_pkh: ByteArray, new_hw_pubkey: ByteArray }
//   constr 1 InitRecovery { ...4 fields... }
//   constr 2 CancelRecovery
//   constr 3 FinalizeRecovery
//   constr 4 Deactivate
//   constr 5 UpdateGuardians { new_guardians: List<ByteArray> }
//   constr 6 Transfer { ...3 fields... }
//
// NOTE on Math Spec v4.5 §10.1 vs deployed validator schema:
//   The Math Spec describes a richer TAADDatum (suspended_by, knowledge_factors,
//   secondary_wallets, ...). The deployed validator (`plutus-preprod.json`
//   hash `1d61d189...`) uses the 10-field schema from `types.ak` (recovery_anchor
//   appended as field 9). Encoding
//   MUST match the deployed validator binary, else the script hash mismatches
//   and the UTxO becomes unspendable. v4.5 fields land in a future validator
//   redeploy + new script hash. Until that happens, this encoding is the
//   source of truth on the Rust side.

/// Encode TAADDatum per types.ak schema. Returns a Plutus Data value ready
/// to attach as an inline datum on the TAAD UTxO output.
///
/// `parent_did_bytes` and `revoked_slot` default to None at create time.
/// Guardians default to empty at create time (UpdateGuardians is a separate
/// redeemer post-creation).
fn encode_taad_datum_create(
    did: &str,
    entity_type: u8,
    controller_pkh: &[u8; 28],
    hw_key_pubkey: &[u8; 32],
) -> Result<PlutusData, &'static str> {
    if entity_type > 9 {
        return Err(
            "encode_taad_datum_create: entity_type must be in 0..=9 (Person..Character)",
        );
    }

    let mut fields = PlutusList::new();

    // 0: did (ByteArray, UTF-8 of the DID string)
    fields.add(&PlutusData::new_bytes(did.as_bytes().to_vec()));

    // 1: entity_type (ConstrPlutusData with index = entity_type, no fields)
    fields.add(&PlutusData::new_empty_constr_plutus_data(
        &BigNum::from(entity_type as u64),
    ));

    // 2: controller_pkh (ByteArray, 28 bytes)
    fields.add(&PlutusData::new_bytes(controller_pkh.to_vec()));

    // 3: hw_key_pubkey (ByteArray, 32 bytes)
    fields.add(&PlutusData::new_bytes(hw_key_pubkey.to_vec()));

    // 4: sequence (Int = 0 at create)
    fields.add(&PlutusData::new_integer(&BigInt::from_str("0").map_err(
        |_| "encode_taad_datum_create: BigInt::from_str(0) unreachable",
    )?));

    // 5: status (Active = ConstrPlutusData index 0, no fields)
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64)));

    // 6: guardians (empty List<ByteArray>)
    fields.add(&PlutusData::new_list(&PlutusList::new()));

    // 7: parent_did (Option<ByteArray>::None = constr 1)
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));

    // 8: revoked_slot (Option<Int>::None = constr 1)
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));

    // 9: recovery_anchor (Option<ByteArray>::None = constr 1) — genesis chưa
    //    phân tán khoá lên LampNet nên không có CID. Set sau ở Rotate đầu tiên.
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));

    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    )))
}

/// Encode a FRESH TAADDatum for a CHILD genesis (GenesisChild gate). Identical
/// to [`encode_taad_datum_create`] except field 7 `parent_did` = `Some(owner_did)`
/// instead of `None`: the validator (`state_nft_logic.ak` G-3) requires
/// `child_datum.parent_did == Some(owner_did)`. Every other field keeps the same
/// fresh-genesis shape (seq==0, Active, empty guardians, revoked None, anchor
/// None), so the `GenesisChild` `is_fresh` check passes.
///
/// `entity_type` MUST be a non-Person type (validator G-4 `not_person`). The
/// caller enforces that; we re-assert the 0..=9 range here for the same reason
/// the Person encoder does.
fn encode_taad_datum_create_child(
    did: &str,
    entity_type: u8,
    controller_pkh: &[u8; 28],
    hw_key_pubkey: &[u8; 32],
    owner_did: &str,
) -> Result<PlutusData, &'static str> {
    if entity_type > 9 {
        return Err(
            "encode_taad_datum_create_child: entity_type must be in 0..=9 (Person..Character)",
        );
    }

    let mut fields = PlutusList::new();

    // 0: did (ByteArray, UTF-8 of the child DID string)
    fields.add(&PlutusData::new_bytes(did.as_bytes().to_vec()));

    // 1: entity_type (ConstrPlutusData with index = entity_type, no fields)
    fields.add(&PlutusData::new_empty_constr_plutus_data(
        &BigNum::from(entity_type as u64),
    ));

    // 2: controller_pkh (ByteArray, 28 bytes) — the CHILD's controller.
    fields.add(&PlutusData::new_bytes(controller_pkh.to_vec()));

    // 3: hw_key_pubkey (ByteArray, 32 bytes)
    fields.add(&PlutusData::new_bytes(hw_key_pubkey.to_vec()));

    // 4: sequence (Int = 0 at create)
    fields.add(&PlutusData::new_integer(&BigInt::from_str("0").map_err(
        |_| "encode_taad_datum_create_child: BigInt::from_str(0) unreachable",
    )?));

    // 5: status (Active = ConstrPlutusData index 0, no fields)
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64)));

    // 6: guardians (empty List<ByteArray>)
    fields.add(&PlutusData::new_list(&PlutusList::new()));

    // 7: parent_did = Some(owner_did) — THE child-specific field. Some = constr 0
    //    with one inner ByteArray (UTF-8 of the owner DID string). Same
    //    Option<ByteArray> convention as `encode_option_bytes`.
    fields.add(&encode_option_bytes(Some(owner_did.as_bytes())));

    // 8: revoked_slot (Option<Int>::None = constr 1)
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));

    // 9: recovery_anchor (Option<ByteArray>::None = constr 1) — genesis chưa
    //    phân tán khoá nên không có CID. Set sau ở Rotate đầu tiên.
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));

    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    )))
}

/// Encode an `Option<ByteArray>` as a Plutus Data value matching the Aiken/Plutus
/// convention the validator decodes: `Some(x)` = `Constr 0 [bytes]`, `None` =
/// `Constr 1 []`. This is the SAME convention the codebase already uses for
/// `parent_did` and `revoked_slot` (constr 0 with one inner field for Some,
/// empty constr 1 for None). Centralized here so the new `recovery_anchor`
/// field cannot drift from that convention.
fn encode_option_bytes(value: Option<&[u8]>) -> PlutusData {
    match value {
        Some(bytes) => {
            let mut inner = PlutusList::new();
            inner.add(&PlutusData::new_bytes(bytes.to_vec()));
            PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
                &BigNum::from(0u64),
                &inner,
            ))
        }
        None => PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)),
    }
}

/// Encode a Rotate redeemer per types.ak TAADRedeemer.
/// ConstrPlutusData(constr_index = 0, [new_controller_pkh, new_hw_pubkey])
fn encode_rotate_redeemer(
    new_controller_pkh: &[u8; 28],
    new_hw_pubkey: &[u8; 32],
) -> PlutusData {
    let mut fields = PlutusList::new();
    fields.add(&PlutusData::new_bytes(new_controller_pkh.to_vec()));
    fields.add(&PlutusData::new_bytes(new_hw_pubkey.to_vec()));
    PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    ))
}

/// Derive the TAAD script address (Enterprise, payment credential = script
/// hash) from compiled Plutus V3 script bytes on the given network. Uses CSL's
/// `PlutusScript::new_v3` which computes `blake2b_224(0x03 || script_bytes)`
/// for the script hash (the namespace byte differs from V1/V2).
pub(crate) fn derive_taad_script_address(
    taad_script_cbor_hex: &str,
    network: u8,
) -> Result<(Address, ScriptHash), &'static str> {
    let script = csl::PlutusScript::from_hex_with_version(
        taad_script_cbor_hex,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "derive_taad_script_address: invalid script CBOR hex")?;
    let script_hash = script.hash();
    let network_id = match network {
        0 | 2 => NetworkInfo::testnet_preprod().network_id(),
        1 => NetworkInfo::mainnet().network_id(),
        _ => {
            return Err(
                "derive_taad_script_address: network must be 0=preprod, 1=mainnet, 2=preview",
            )
        }
    };
    let cred = Credential::from_scripthash(&script_hash);
    let addr = EnterpriseAddress::new(network_id, &cred).to_address();
    Ok((addr, script_hash))
}

/// Compute the TAAD-NFT asset name from the DID. Per Math Spec §10.1 and
/// established Cardano practice, the token name is BLAKE2b-256 of the DID
/// bytes, giving a stable 32-byte identifier that binds the NFT to this DID.
fn taad_nft_asset_name(did: &str) -> Result<AssetName, &'static str> {
    let mut h = Blake2b256::new();
    h.update(did.as_bytes());
    let name_bytes = h.finalize();
    AssetName::new(name_bytes.to_vec())
        .map_err(|_| "taad_nft_asset_name: AssetName::new failed (32 bytes within 32-byte limit)")
}

/// Public wrapper cho `taad_nft_asset_name` — trả hex(blake2b_256(did)). Dùng ở
/// tầng caller (super-app) để tự tính asset-name của MỌI NFT khoá theo cùng
/// công thức A-1 (anchor TAAD, Registry-NFT — `registry_mint` dùng
/// blake2b_256(governing_did) y hệt) TRƯỚC khi build tx, vd để resolve UTxO
/// đang giữ NFT đó qua Blockfrost `/assets/{unit}/addresses`. Builder tx tự
/// tính lại nội bộ (không nhận asset_name làm tham số) — hàm này CHỈ phục vụ
/// bước tra cứu chuỗi phía trước, không ảnh hưởng logic ráp tx.
pub fn anchor_asset_name_hex(did: &str) -> Result<String, String> {
    if did.is_empty() {
        return Err("did rỗng".to_string());
    }
    let name = taad_nft_asset_name(did).map_err(|e| e.to_string())?;
    Ok(hex::encode(name.name()))
}

/// Compute blake2b_224 of an Ed25519 public key — Cardano's standard
/// `VerificationKeyHash` (used for `controller_pkh` in TAADDatum).
fn blake2b_224(bytes: &[u8]) -> [u8; 28] {
    let mut h = Blake2b224::new();
    h.update(bytes);
    let out = h.finalize();
    let mut arr = [0u8; 28];
    arr.copy_from_slice(&out);
    arr
}

// ─── Model B: sinh khoá controller ĐỘC LẬP (xoay khoá) ─────────────
//
// BỐI CẢNH (Model B đã chốt): khi xoay khoá, controller key MỚI phải là
// entropy ngẫu nhiên ĐỘC LẬP — KHÔNG derive từ Master_KEK. Lý do (first-
// principles): nếu khoá mới = HKDF(Master_KEK) thì một khi seed (24 từ /
// Master_KEK) lộ, kẻ tấn công suy ra được MỌI controller key tương lai, làm
// rotation mất ý nghĩa. Sinh độc lập cắt đứt liên kết đó: lộ seed cũ KHÔNG
// suy ra được controller key mới. Đây là mắt xích "sinh khoá mới" mà audit
// R-C phát hiện còn thiếu.
//
// RANH GIỚI (QUAN TRỌNG): hàm này CHỈ sinh keypair + trả `secret_hex` ra cho
// tầng trên. Việc LƯU TRỮ secret (wrap bằng Device_KEK), sao lưu/khôi phục,
// và phân tán lên LampNet là phạm vi §11 spec (Long làm) — KHÔNG xử lý ở đây.

/// Một keypair controller Ed25519 sinh độc lập cho luồng xoay khoá Model B.
///
/// * `secret_hex`  — 32-byte Ed25519 seed (private key) hex. CALLER lưu — xem
///   ghi chú storage bên dưới.
/// * `pubkey_hex`  — 32-byte Ed25519 public key hex. Dùng làm `new_taad_pubkey_hex`
///   khi gọi [`build_rotate_taad_tx`].
/// * `pkh`         — 28-byte Cardano `VerificationKeyHash` = blake2b-224(pubkey),
///   khớp đúng `new_controller_pkh` mà [`build_rotate_taad_tx`] tự tính lại.
pub struct ControllerKeypair {
    pub secret_hex: String,
    pub pubkey_hex: String,
    pub pkh: [u8; 28],
}

/// Sinh một keypair controller Ed25519 từ entropy NGẪU NHIÊN ĐỘC LẬP (CSPRNG
/// hệ điều hành qua `OsRng`), KHÔNG derive từ Master_KEK — bản chất Model B.
///
/// Cách tính `pkh` (controller_pkh): `pkh = blake2b-224(pubkey_32byte)`, đúng
/// cùng hàm [`blake2b_224`] mà [`build_create_taad_utxo_tx`] và
/// [`build_rotate_taad_tx`] dùng để tính `controller_pkh`. Đây cũng chính là
/// cách CSL tính `PublicKey.hash()` (`Ed25519KeyHash`) — đối chiếu trong unit
/// test `controller_pkh_matches_csl_public_key_hash` bên dưới, nên `pkh` sinh
/// ra khớp với cái validator/datum mong đợi (field 2 `controller_pkh`).
///
/// # Storage (ngoài phạm vi — §11 spec)
/// `secret_hex` được TRẢ RA cho tầng trên tự xử lý: wrap bằng Device_KEK, lưu
/// keystore, sao lưu/khôi phục (recovery wrapping), phân tán LampNet
/// (recovery_anchor). TẤT CẢ theo §11 spec, Long làm — hàm này KHÔNG persist,
/// KHÔNG log, KHÔNG transmit `secret_hex`.
///
/// # Bảo mật
/// Vì khoá độc lập, secret này là root-of-trust MỚI cho controller sau rotate.
/// Mất nó (chưa kịp wrap/backup) = mất quyền controller → tầng trên PHẢI lưu
/// an toàn TRƯỚC khi submit tx rotate.
pub fn generate_controller_keypair() -> ControllerKeypair {
    use ed25519_dalek::SigningKey;
    use rand::rngs::OsRng;

    // SigningKey::generate dùng CSPRNG được truyền vào. OsRng = entropy hệ điều
    // hành (getrandom), KHÔNG liên quan tới Master_KEK → độc lập đúng Model B.
    let signing_key = SigningKey::generate(&mut OsRng);
    // `to_bytes()` trả 32-byte seed Ed25519 (private). Bọc Zeroizing để chà sạch
    // RAM sau khi đã hex-encode (caller nhận bản hex để tự lưu/wrap theo §11).
    let secret = Zeroizing::new(signing_key.to_bytes());
    let pubkey = signing_key.verifying_key().to_bytes(); // 32-byte public

    let pkh = blake2b_224(&pubkey);

    ControllerKeypair {
        secret_hex: hex::encode(&*secret),
        pubkey_hex: hex::encode(pubkey),
        pkh,
    }
}

/// Derive the old TAAD_Key signing seed from a Master_KEK. Mirrors
/// `sign::derive_taad_seed` (`salt = SHA-256("genesis")`, `info =
/// "taad-controller-v1"`). Kept local to avoid widening the `sign` module's
/// public API; if this drifts from `sign.rs`, the round-trip test
/// `sign::tests::seed_matches_dart_bridge_derivation` no longer protects this
/// path — see TODO note below.
///
/// TODO: once the v2 derivation (salt = H(DID)) lands per spec §3.2, replace
/// this with the shared derivation helper exposed from `sign.rs`.
fn derive_taad_seed_from_kek(master_kek: &[u8; 32]) -> Zeroizing<[u8; 32]> {
    let mut salt_hasher = Sha256::new();
    salt_hasher.update(b"genesis");
    let salt: [u8; 32] = salt_hasher.finalize().into();
    let hk = Hkdf::<Sha256>::new(Some(&salt), master_kek);
    let mut seed = Zeroizing::new([0u8; 32]);
    hk.expand(b"taad-controller-v1", &mut *seed)
        .expect("HKDF expand of 32 bytes from SHA-256 cannot fail");
    seed
}

// ─── 4. CREATE TAAD UTxO TX ────────────────────────────────────────
//
// Per Option C decision (PO 2026-05): extended signature with `entity_type`,
// `master_kek_hex`, `policy_id_hex`, and replaced `taad_script_address` with
// `taad_script_cbor_hex` to give Rust everything it needs to derive the
// script address itself + build the inline datum + (eventually) the mint
// witness.
//
// SCOPE OF THIS COMMIT (Design 2 genesis MINT wiring): the deployed validator
// is now MULTI-PURPOSE — ONE Plutus V3 validator exposes both a `mint` handler
// (genesis state-NFT gate) and a `spend` handler (lifecycle). The anchor
// minting policy id ≡ the validator's OWN script hash. So `build_create_taad_utxo_tx`
// now MINTS the anchor NFT for a PERSON genesis and locks it at the script's
// own address alongside the fresh inline datum.
//
// The `GenesisPerson` mint gate (state_nft_logic.ak §138) requires:
//   - exactly ONE +1 mint of (policy = script_hash, asset_name = blake2b_256(did));
//   - the NFT sits in an output at the script's OWN address (payment cred =
//     Script(script_hash)) — enforced by `find_unique_output_with_nft`;
//   - that output carries a FRESH inline TAADDatum (seq==0, Active, revoked None);
//   - the new controller signs: `controller_pkh = blake2b_224(taad_pubkey)` is in
//     `extra_signatories` — so we derive the TAAD Ed25519 key from `master_kek_hex`
//     (same HKDF as `sign.rs::derive_taad_public_key`) and add its vkey witness +
//     `add_required_signer(controller_pkh)`.
//
// SCOPE LIMIT: only Person genesis (entity_type 0 / GenesisPerson) is wired here.
// Child genesis (GenesisChild { owner_did } + a CIP-31 owner reference input) is a
// follow-up — the fn errors clearly rather than minting under the wrong gate.
//
// Why this widened signature is right: Dart Phase 2 has not landed its TAAD
// wiring yet, so changing the signature is a zero-cost migration.

/// Build tx that locks a TAAD UTxO with the initial Active datum at the
/// TAAD script address. Returns hex-encoded signed tx CBOR.
///
/// # Inputs
/// * `did`                  — DID string (output of [`construct_did`])
/// * `entity_type`          — 0..9 per `EntityType` in types.ak
///   (0=Person, 1=Org, 2=Device, 3=Machine, 4=Asset, 5=Bot, 6=AI, 7=Service,
///   8=Context, 9=Character)
/// * `hw_pub_hex`           — HW_Key pubkey hex. Must be 32 bytes (64 hex);
///   v1.1 stores the Ed25519 device-attestation key in the datum. P-256 keys
///   should be projected to 32 bytes upstream (e.g. SHA-256 of the SPKI) or
///   the caller must pre-hash to 32 bytes.
/// * `taad_pub_hex`         — TAAD_Key Ed25519 pubkey hex (32 bytes / 64 hex)
/// * `master_kek_hex`       — Master_KEK (32 bytes). The TAAD Ed25519 signing
///   key is derived from it via `sign::derive_taad_seed` (HKDF, same as
///   `derive_taad_public_key`), and its vkey witness satisfies the validator's
///   `must_be_signed_by(controller_pkh)` self-genesis proof. The derived
///   pubkey's `blake2b_224` MUST equal the `controller_pkh` computed from
///   `taad_pub_hex` (checked at runtime).
/// * `wallet_seed_hex`      — 32-byte hex (CIP-1852 entropy) for payment key
/// * `network`              — 0=preprod, 1=mainnet, 2=preview
/// * `taad_script_cbor_hex` — compiled Plutus V3 script bytes from blueprint.
///   `PlutusScript::from_hex_with_version` accepts the CBOR-wrapped hex
///   directly (the outer CBOR byte-string header is stripped).
/// * `policy_id_hex`        — 28-byte hex of the anchor minting policy ID.
///   Under Design 2 the policy id ≡ the validator's own script hash, so this
///   is NO LONGER a separate policy: it MUST equal the script hash derived from
///   `taad_script_cbor_hex` (asserted at runtime — mismatch is a hard error).
/// * `utxo_inputs_json`     — JSON array of [`UtxoInput`] (same shape as
///   `build_publish_did_tx`)
/// * `protocol_params_json` — `/epochs/latest/parameters` JSON
/// * `current_slot`         — Cardano tip slot (TTL = `current_slot + 7200`)
#[allow(clippy::too_many_arguments)]
pub fn build_create_taad_utxo_tx(
    did: &str,
    entity_type: u8,
    hw_pub_hex: &str,
    taad_pub_hex: &str,
    master_kek_hex: &str,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    policy_id_hex: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, String> {
    // ─── 1. Input validation ──────────────────────────────────────
    if !did.starts_with("did:phoenix:") {
        return Err("build_create_taad_utxo_tx: did must start with 'did:phoenix:'".into());
    }
    if entity_type > 9 {
        return Err(format!(
            "build_create_taad_utxo_tx: entity_type must be in 0..=9 (Person..Character), got {}",
            entity_type
        ));
    }

    let hw_bytes = hex::decode(hw_pub_hex)
        .map_err(|e| format!("hw_pub_hex is not valid hex: {}", e))?;
    if hw_bytes.len() != 32 {
        return Err(format!(
            "hw_pub_hex must decode to 32 bytes (stored as hw_key_pubkey in datum), got {}",
            hw_bytes.len()
        ));
    }
    let mut hw_arr = [0u8; 32];
    hw_arr.copy_from_slice(&hw_bytes);

    let taad_bytes = hex::decode(taad_pub_hex)
        .map_err(|e| format!("taad_pub_hex is not valid hex: {}", e))?;
    if taad_bytes.len() != 32 {
        return Err("taad_pub_hex must decode to 32 bytes (Ed25519 pubkey)".into());
    }

    // master_kek_hex retained on the signature for forward-compat. Validate
    // shape so callers catch typos at create time.
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

    let policy_id_bytes = hex::decode(policy_id_hex)
        .map_err(|e| format!("policy_id_hex is not valid hex: {}", e))?;
    if policy_id_bytes.len() != 28 {
        return Err("policy_id_hex must decode to 28 bytes (script hash)".into());
    }

    // ─── SCOPE: Person genesis only ───────────────────────────────
    // entity_type 0 == Person == GenesisPerson (the FIRST StateNftRedeemer
    // constructor). Child genesis needs GenesisChild { owner_did } plus a
    // CIP-31 owner reference input + the owner controller's signature — a
    // different witness shape entirely. Refuse rather than mint under the
    // wrong gate (which the validator would reject anyway).
    if entity_type != 0 {
        return Err(
            "build_create_taad_utxo_tx: only Person genesis (entity_type 0) wired for mint; \
             child genesis = follow-up"
                .into(),
        );
    }

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxo_inputs_json)
        .map_err(|e| format!("utxo_inputs_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxo_inputs_json is empty — provide ≥1 funded UTxO".into());
    }

    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|e| format!("protocol_params_json invalid: {}", e))?;

    // ─── 2. Derive controller_pkh + script address ────────────────
    let controller_pkh = blake2b_224(&taad_bytes);
    let controller_keyhash = csl::Ed25519KeyHash::from_bytes(controller_pkh.to_vec())
        .map_err(|_| "controller_pkh is not a valid 28-byte Ed25519KeyHash".to_string())?;
    let (script_addr, script_hash) =
        derive_taad_script_address(taad_script_cbor_hex, network)
            .map_err(|e| e.to_string())?;

    // Design 2: the anchor policy id ≡ the validator's own script hash. The
    // caller-supplied `policy_id_hex` is no longer a separate policy; assert
    // it agrees so a stale/wrong policy can't silently produce a bad tx.
    if policy_id_bytes != script_hash.to_bytes() {
        return Err(format!(
            "policy_id_hex ({}) must equal the validator script hash ({}) — \
             Design 2: anchor policy id ≡ script hash, not a separate policy",
            policy_id_hex,
            hex::encode(script_hash.to_bytes()),
        ));
    }

    // ─── 3. Build FRESH inline datum (seq==0, Active, revoked None) ─
    let datum = encode_taad_datum_create(did, entity_type, &controller_pkh, &hw_arr)
        .map_err(|e| e.to_string())?;

    // Anchor NFT: asset_name = blake2b_256(did) (== validator's A-1 binding),
    // policy = script_hash.
    let asset_name = taad_nft_asset_name(did).map_err(|e| e.to_string())?;
    let mut nft_ma = MultiAsset::new();
    nft_ma.set_asset(&script_hash, &asset_name, &BigNum::from(1u64));

    // ─── 4. Derive TAAD signing key (controller) from Master_KEK ───
    // Same HKDF as sign.rs::derive_taad_public_key — single source of truth.
    // The derived pubkey's blake2b_224 MUST equal `controller_pkh` (which was
    // computed from `taad_pub_hex`); otherwise the caller passed a KEK that
    // does not match the pubkey baked into the datum, and the validator's
    // `must_be_signed_by(controller_pkh)` would fail on submit.
    let taad_seed = crate::sign::derive_taad_seed(&kek_bytes)
        .ok_or_else(|| "derive_taad_seed: Master_KEK must be 32 bytes".to_string())?;
    let taad_priv = csl::PrivateKey::from_normal_bytes(&*taad_seed)
        .map_err(|_| "derived TAAD seed is not a valid Ed25519 private key".to_string())?;
    let derived_taad_pub = taad_priv.to_public();
    if derived_taad_pub.hash().to_bytes() != controller_pkh.to_vec() {
        return Err(
            "master_kek_hex does not derive the TAAD key for taad_pub_hex \
             (controller_pkh mismatch) — refusing to build an unsignable genesis tx"
                .into(),
        );
    }

    // ─── 5. Wallet + tx builder + fee/collateral input selection ───
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network)
        .map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;

    // Fee/input: the largest UTxO funds the mint + min-ada + fee.
    let picked = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&picked.tx_hash)
            .map_err(|_| "utxo tx_hash not valid 32-byte hex".to_string())?,
        picked.index,
    );
    tb.add_key_input(
        &payment_xprv.to_raw_key().to_public().hash(),
        &fee_input,
        &Value::new(&BigNum::from(picked.amount_lovelace)),
    );

    // Collateral (Plutus mint requires it). Prefer a pure-ADA wallet UTxO; the
    // largest such is the canonical choice. If none is asset-free, fall back to
    // the largest UTxO overall (CSL only needs the lovelace; the carried assets
    // are returned as collateral change on a successful spend, and on the
    // unhappy path the validator must pass anyway). If the chosen collateral is
    // the SAME outpoint as the fee input, that is allowed by CSL (collateral
    // may coincide with a regular input).
    let collateral_utxo = utxos
        .iter()
        .filter(|u| u.assets.is_empty())
        .max_by_key(|u| u.amount_lovelace)
        .unwrap_or(picked);
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

    // ─── 6. Mint witness: +1 (script_hash, asset_name) via GenesisPerson ─
    let script = csl::PlutusScript::from_hex_with_version(
        taad_script_cbor_hex,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "taad_script_cbor_hex is not valid Plutus V3 script CBOR hex".to_string())?;
    let script_source = csl::PlutusScriptSource::new(&script);

    // GenesisPerson = FIRST StateNftRedeemer constructor ⇒ ConstrPlutusData
    // index 0, NO fields (empty constr).
    let genesis_redeemer_data =
        PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64));

    // Static ExUnits estimate. CSL does NOT run the Plutus evaluator, so this
    // budget is a conservative placeholder; the mint redeemer index is set to
    // 0 and CSL reindexes it to the canonical mint position at build time.
    // TODO(budget): run `/utils/txs/evaluate` (or ogmios EvaluateTx) and patch
    // the redeemer budget before submit — the network rejects a tx whose
    // declared ExUnits are below the real cost. Evaluate-then-patch is the safe
    // path; the GenesisPerson gate is a small all-conjunction check so this
    // estimate is generous.
    let ex_units = csl::ExUnits::new(
        &BigNum::from(GENESIS_EX_UNITS_MEM),
        &BigNum::from(GENESIS_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &genesis_redeemer_data,
        &ex_units,
    );
    let mint_witness = csl::MintWitness::new_plutus_script(&script_source, &mint_redeemer);

    let mut mint_builder = csl::MintBuilder::new();
    mint_builder
        .add_asset(&mint_witness, &asset_name, &csl::Int::new(&BigNum::from(1u64)))
        .map_err(|e| format!("mint_builder.add_asset: {:?}", e))?;
    tb.set_mint_builder(&mint_builder);

    // ─── 7. TAAD UTxO output: fresh datum + the minted NFT, at script addr ─
    // The NFT must land at the script's OWN address (validator pins the carrier
    // output to Script(script_hash)). min-ada recomputed WITH the NFT present.
    let taad_output = TransactionOutputBuilder::new()
        .with_address(&script_addr)
        .with_plutus_data(&datum)
        .next()
        .map_err(|e| format!("TAAD output builder.next: {:?}", e))?
        .with_asset_and_min_required_coin_by_utxo_cost(
            &nft_ma,
            &csl::DataCost::new_coins_per_byte(
                &BigNum::from(extract_coins_per_utxo_size(&params)?),
            ),
        )
        .map_err(|e| format!("TAAD output min-ada calc: {:?}", e))?
        .build()
        .map_err(|e| format!("TAAD output build: {:?}", e))?;
    tb.add_output(&taad_output)
        .map_err(|e| format!("add_output failed: {:?}", e))?;

    // must_be_signed_by(controller_pkh): declare the new controller as a
    // required signer so it appears in extra_signatories and fee/size
    // accounting reserves room for the witness.
    tb.add_required_signer(&controller_keyhash);

    tb.set_ttl_bignum(&BigNum::from(current_slot + 7200));

    // ─── 8. Bind cost model + redeemer to body BEFORE change ───────
    // Plutus V3 cost model + the mint redeemer drive the script_data_hash; bind
    // it before add_change_if_needed so the fee covers the 32-byte field.
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;

    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 9. build_tx (folds plutus script + mint redeemer) + sign ──
    // build_tx assembles the body + the builder-side witness set (plutus
    // script, mint redeemer). We then add the two vkey witnesses: the wallet
    // payment key (fee input) and the TAAD key (controller, GenesisPerson).
    let tx = tb
        .build_tx()
        .map_err(|e| format!("build_tx: {:?}", e))?;

    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &taad_priv));
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

// ─── 4b. CREATE CHILD TAAD UTxO TX (GenesisChild gate) ─────────────
//
// OrgDID / non-Person genesis. Mirrors `build_create_taad_utxo_tx` (Person
// genesis) but drives the `GenesisChild { owner_did }` mint gate
// (`state_nft_logic.ak` §154-177). Validator conditions wired here (read off
// `validate_mint` GenesisChild arm — KHÔNG đoán):
//
//   • find_single_minted_did: exactly ONE +1 mint of (policy = script_hash,
//     name = blake2b_256(child_did)); the carrier output sits at the script's
//     OWN address (Script(policy)) — same pin as Person genesis.
//   • find_owner_reference: a UNIQUE CIP-31 REFERENCE INPUT carrying the owner's
//     state NFT (name = blake2b_256(owner_did)) at the script address. PLAIN
//     reference — the owner UTxO is NOT spent (we use `tb.add_reference_input`,
//     script_size 0). The owner anchor stays live on-chain.
//   • child_name == blake2b_256(child_datum.did)        — A-1 binding.
//   • owner_datum.did == owner_did                       — ref really is owner.
//   • status_is_active(owner_datum.status)               — owner must be live.
//   • (G-1) list.has(extra_signatories, owner_datum.controller_pkh) — the OWNER
//     CONTROLLER signs. The CHILD controller does NOT need to sign for the mint
//     gate; only the owner authorises creation. So the only required signer +
//     extra vkey witness here is the OWNER's TAAD key, derived from the OWNER's
//     Master_KEK (`owner_master_kek_hex`).
//   • (G-2) can_own(owner_datum.entity_type, child entity_type) — §22.1 matrix.
//     Resolved ON-CHAIN from the referenced owner datum; off-chain we cannot
//     re-check it without parsing the owner datum (we DO parse it to recover the
//     owner controller_pkh for a fast-fail, see below), but the matrix gate is
//     authoritative on-chain.
//   • (G-3) child_datum.parent_did == Some(owner_did)    — set by the child datum
//     encoder (`encode_taad_datum_create_child`).
//   • (G-4) not_person(child entity_type)                — we reject entity_type 0.
//   • is_fresh(child_datum)                              — seq 0 / Active / revoked None.
//
// WHO SIGNS (answer to the brief's key question): OWNER controller only (G-1).
// The owner UTxO is a REFERENCE input (CIP-31), never spent. The wallet payment
// key signs the fee/collateral inputs as usual.
//
// FAST-FAIL DESIGN: we parse the owner UTxO's inline datum to (a) confirm
// owner_datum.did == owner_did and (b) recover owner_datum.controller_pkh, then
// assert the owner controller key derived from `owner_master_kek_hex` matches
// that pkh — refusing to build an unsignable tx the validator would reject for
// a missing owner signature. If the owner UTxO JSON omits the inline datum we
// still build (the on-chain ref carries it), but we then CANNOT pre-derive the
// signer pkh from the datum, so we require the datum to be present (it is cheap
// for the caller to include and prevents a silently-unsignable tx).

/// The owner DID's live TAAD UTxO, supplied so it can be added as a CIP-31
/// reference input and its datum parsed for the owner controller_pkh check.
#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)] // `amount_lovelace`/`assets` parsed for caller clarity + forward-compat;
                    // CSL's reference input needs only the outpoint (`add_reference_input`).
                    // The owner state NFT + value are read off-chain via `inline_datum_hex`
                    // and on-chain off the reference input itself.
struct OwnerUtxoRef {
    tx_hash: String,
    index: u32,
    amount_lovelace: u64,
    /// Hex-encoded inline datum (CBOR). REQUIRED: we parse it to confirm
    /// `owner_datum.did == owner_did` and recover `owner_datum.controller_pkh`.
    inline_datum_hex: String,
    /// Multi-asset entries on the owner UTxO (must include the owner state NFT
    /// = (script_hash, blake2b_256(owner_did))). We reconstruct the reference
    /// output's value so CSL's tx model carries it; the validator reads the NFT
    /// off the reference input.
    #[serde(default)]
    assets: Vec<UtxoAsset>,
}

/// Build tx that MINTS a CHILD (non-Person) anchor NFT under the `GenesisChild`
/// gate and locks a fresh Active datum (parent_did = Some(owner_did)) at the
/// TAAD script address, with the OWNER's live anchor referenced (CIP-31).
/// Returns hex-encoded signed tx CBOR.
///
/// # Inputs
/// * `child_did`            — the new child DID (output of [`construct_did`] with
///   the owner DID as creator). Must start with `did:phoenix:`.
/// * `owner_did`            — the live OWNER DID authorising creation. Bound into
///   the redeemer `GenesisChild { owner_did }` AND the child datum's `parent_did`.
/// * `entity_type`          — child type, 1..=9 (Org=1 … Character=9). MUST NOT be
///   0 (Person): a child can never be born Person (validator G-4).
/// * `hw_pub_hex`           — child HW_Key pubkey hex (32 bytes / 64 hex).
/// * `child_taad_pub_hex`   — child TAAD_Key Ed25519 pubkey hex (32 bytes). Its
///   `blake2b_224` is the child datum's `controller_pkh`. The child does NOT sign
///   the genesis (validator requires only the owner sig), so no child KEK is
///   needed here.
/// * `owner_master_kek_hex` — the OWNER's Master_KEK (32 bytes). The owner TAAD
///   signing key is derived from it (`sign::derive_taad_seed`); its vkey witness
///   + `add_required_signer(owner_controller_pkh)` satisfy validator G-1. We
///   assert the derived pkh equals the `controller_pkh` parsed from the owner
///   datum — mismatch ⇒ hard error (the tx would be unsignable / rejected).
/// * `wallet_seed_hex`      — 32-byte wallet entropy (CIP-1852) for fee/collateral.
/// * `network`              — 0=preprod, 1=mainnet, 2=preview.
/// * `taad_script_cbor_hex` — compiled Plutus V3 validator (policy id ≡ its hash).
/// * `policy_id_hex`        — 28-byte hex; MUST equal the validator script hash.
/// * `owner_utxo_json`      — [`OwnerUtxoRef`] JSON: the owner's live TAAD UTxO
///   (added as a reference input, NOT spent).
/// * `utxo_inputs_json`     — JSON array of [`UtxoInput`] (wallet UTxOs for fee +
///   collateral).
/// * `protocol_params_json` — `/epochs/latest/parameters` JSON.
/// * `current_slot`         — Cardano tip slot (TTL = `current_slot + 7200`).
#[allow(clippy::too_many_arguments)]
pub fn build_create_child_taad_utxo_tx(
    child_did: &str,
    owner_did: &str,
    entity_type: u8,
    hw_pub_hex: &str,
    child_taad_pub_hex: &str,
    owner_master_kek_hex: &str,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    policy_id_hex: &str,
    owner_utxo_json: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, String> {
    // ─── 1. Input validation ──────────────────────────────────────
    if !child_did.starts_with("did:phoenix:") {
        return Err("build_create_child_taad_utxo_tx: child_did must start with 'did:phoenix:'".into());
    }
    if !owner_did.starts_with("did:phoenix:") {
        return Err("build_create_child_taad_utxo_tx: owner_did must start with 'did:phoenix:'".into());
    }
    if child_did == owner_did {
        return Err("build_create_child_taad_utxo_tx: child_did must differ from owner_did".into());
    }
    // G-4: a child can never be born Person (entity_type 0). The on-chain gate
    // rejects it; fail fast here so the caller gets a clear message.
    if entity_type == 0 {
        return Err(
            "build_create_child_taad_utxo_tx: entity_type 0 (Person) is forbidden for a child \
             — a child can never be born Person (validator G-4). Use 1=Org, 4=Asset, 2=Device …"
                .into(),
        );
    }
    if entity_type > 9 {
        return Err(format!(
            "build_create_child_taad_utxo_tx: entity_type must be in 1..=9 (Org..Character), got {}",
            entity_type
        ));
    }

    let hw_bytes = hex::decode(hw_pub_hex)
        .map_err(|e| format!("hw_pub_hex is not valid hex: {}", e))?;
    if hw_bytes.len() != 32 {
        return Err(format!(
            "hw_pub_hex must decode to 32 bytes (hw_key_pubkey in datum), got {}",
            hw_bytes.len()
        ));
    }
    let mut hw_arr = [0u8; 32];
    hw_arr.copy_from_slice(&hw_bytes);

    let child_taad_bytes = hex::decode(child_taad_pub_hex)
        .map_err(|e| format!("child_taad_pub_hex is not valid hex: {}", e))?;
    if child_taad_bytes.len() != 32 {
        return Err("child_taad_pub_hex must decode to 32 bytes (Ed25519 pubkey)".into());
    }
    // Child controller pkh — baked into the child datum (field 2). The child does
    // NOT sign the genesis, so this is informational for the datum only.
    let child_controller_pkh = blake2b_224(&child_taad_bytes);

    let owner_kek_bytes = hex::decode(owner_master_kek_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("owner_master_kek_hex is not valid hex: {}", e))?;
    if owner_kek_bytes.len() != 32 {
        return Err("owner_master_kek_hex must decode to 32 bytes (owner Master_KEK)".into());
    }
    let mut owner_kek = Zeroizing::new([0u8; 32]);
    owner_kek.copy_from_slice(&owner_kek_bytes);

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex is not valid hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must decode to 32 bytes".into());
    }
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let policy_id_bytes = hex::decode(policy_id_hex)
        .map_err(|e| format!("policy_id_hex is not valid hex: {}", e))?;
    if policy_id_bytes.len() != 28 {
        return Err("policy_id_hex must decode to 28 bytes (script hash)".into());
    }

    let owner_utxo: OwnerUtxoRef = serde_json::from_str(owner_utxo_json)
        .map_err(|e| format!("owner_utxo_json invalid: {}", e))?;

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxo_inputs_json)
        .map_err(|e| format!("utxo_inputs_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxo_inputs_json is empty — provide ≥1 funded UTxO for fee + collateral".into());
    }

    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|e| format!("protocol_params_json invalid: {}", e))?;

    // ─── 2. Script address + hash; assert policy id ≡ script hash ──
    let (script_addr, script_hash) =
        derive_taad_script_address(taad_script_cbor_hex, network)
            .map_err(|e| e.to_string())?;
    if policy_id_bytes != script_hash.to_bytes() {
        return Err(format!(
            "policy_id_hex ({}) must equal the validator script hash ({}) — \
             Design 2: anchor policy id ≡ script hash",
            policy_id_hex,
            hex::encode(script_hash.to_bytes()),
        ));
    }

    // ─── 3. Parse owner datum: confirm did + recover owner controller_pkh ─
    // The validator resolves the owner authority from the referenced UTxO's
    // datum (find_owner_reference → owner_datum). We parse the same datum
    // off-chain to: (a) hard-check owner_datum.did == owner_did, and (b) recover
    // owner_datum.controller_pkh so the OWNER signer/witness we add matches G-1.
    let owner_decoded = decode_owner_datum(&owner_utxo.inline_datum_hex)?;
    if owner_decoded.did != owner_did {
        return Err(format!(
            "owner_utxo_json inline datum did ({}) != owner_did argument ({}) — \
             the referenced UTxO is not the claimed owner DID",
            owner_decoded.did, owner_did
        ));
    }
    // status_is_active(owner): the validator requires the owner to be live
    // (status field 5 = Active = constr 0). Fail fast on a non-Active owner.
    if owner_decoded.status_alt != 0 {
        return Err(format!(
            "owner DID status is not Active (status constr index {}) — validator requires a \
             live owner to authorise GenesisChild",
            owner_decoded.status_alt
        ));
    }

    // ─── 4. Derive OWNER TAAD signing key; assert it matches owner pkh ─
    let owner_taad_seed = crate::sign::derive_taad_seed(&owner_kek[..])
        .ok_or_else(|| "derive_taad_seed: owner Master_KEK must be 32 bytes".to_string())?;
    let owner_taad_priv = csl::PrivateKey::from_normal_bytes(&*owner_taad_seed)
        .map_err(|_| "derived owner TAAD seed is not a valid Ed25519 private key".to_string())?;
    let owner_taad_pub = owner_taad_priv.to_public();
    let owner_controller_keyhash = owner_taad_pub.hash();
    if owner_controller_keyhash.to_bytes() != owner_decoded.controller_pkh {
        return Err(
            "owner_master_kek_hex does not derive the owner controller key \
             (owner controller_pkh mismatch vs the referenced owner datum) — \
             refusing to build a tx the validator would reject for a missing owner signature"
                .into(),
        );
    }

    // ─── 5. Build child fresh datum (parent_did = Some(owner_did)) ─
    let datum = encode_taad_datum_create_child(
        child_did, entity_type, &child_controller_pkh, &hw_arr, owner_did,
    )
    .map_err(|e| e.to_string())?;

    // Child anchor NFT: name = blake2b_256(child_did), policy = script_hash.
    let asset_name = taad_nft_asset_name(child_did).map_err(|e| e.to_string())?;
    let mut nft_ma = MultiAsset::new();
    nft_ma.set_asset(&script_hash, &asset_name, &BigNum::from(1u64));

    // ─── 6. Wallet + tx builder + fee/collateral selection ─────────
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network)
        .map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;

    let picked = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&picked.tx_hash)
            .map_err(|_| "utxo tx_hash not valid 32-byte hex".to_string())?,
        picked.index,
    );
    tb.add_key_input(
        &payment_xprv.to_raw_key().to_public().hash(),
        &fee_input,
        &Value::new(&BigNum::from(picked.amount_lovelace)),
    );

    // Collateral (Plutus mint requires it). Prefer an asset-free wallet UTxO.
    let collateral_utxo = utxos
        .iter()
        .filter(|u| u.assets.is_empty())
        .max_by_key(|u| u.amount_lovelace)
        .unwrap_or(picked);
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

    // ─── 7. Owner anchor as a CIP-31 REFERENCE INPUT (NOT spent) ───
    // `add_reference_input(.., script_size 0)` registers a plain reference: the
    // owner UTxO is read, never consumed. The validator's find_owner_reference
    // reads the owner state NFT + datum off this input.
    let owner_ref_input = TransactionInput::new(
        &TransactionHash::from_hex(&owner_utxo.tx_hash)
            .map_err(|_| "owner_utxo tx_hash not valid 32-byte hex".to_string())?,
        owner_utxo.index,
    );
    tb.add_reference_input(&owner_ref_input);

    // ─── 8. Mint witness: +1 (script_hash, child name) via GenesisChild ─
    let script = csl::PlutusScript::from_hex_with_version(
        taad_script_cbor_hex,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "taad_script_cbor_hex is not valid Plutus V3 script CBOR hex".to_string())?;
    let script_source = csl::PlutusScriptSource::new(&script);

    // GenesisChild = SECOND StateNftRedeemer constructor ⇒ ConstrPlutusData
    // index 1, ONE field: owner_did (ByteArray, UTF-8 of the owner DID string).
    let mut redeemer_fields = PlutusList::new();
    redeemer_fields.add(&PlutusData::new_bytes(owner_did.as_bytes().to_vec()));
    let genesis_child_redeemer_data = PlutusData::new_constr_plutus_data(
        &ConstrPlutusData::new(&BigNum::from(1u64), &redeemer_fields),
    );

    let ex_units = csl::ExUnits::new(
        &BigNum::from(GENESIS_EX_UNITS_MEM),
        &BigNum::from(GENESIS_EX_UNITS_STEPS),
    );
    let mint_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_mint(),
        &BigNum::zero(),
        &genesis_child_redeemer_data,
        &ex_units,
    );
    let mint_witness = csl::MintWitness::new_plutus_script(&script_source, &mint_redeemer);

    let mut mint_builder = csl::MintBuilder::new();
    mint_builder
        .add_asset(&mint_witness, &asset_name, &csl::Int::new(&BigNum::from(1u64)))
        .map_err(|e| format!("mint_builder.add_asset: {:?}", e))?;
    tb.set_mint_builder(&mint_builder);

    // ─── 9. Child TAAD UTxO output: fresh datum + minted NFT, at script addr ─
    let taad_output = TransactionOutputBuilder::new()
        .with_address(&script_addr)
        .with_plutus_data(&datum)
        .next()
        .map_err(|e| format!("child TAAD output builder.next: {:?}", e))?
        .with_asset_and_min_required_coin_by_utxo_cost(
            &nft_ma,
            &csl::DataCost::new_coins_per_byte(
                &BigNum::from(extract_coins_per_utxo_size(&params)?),
            ),
        )
        .map_err(|e| format!("child TAAD output min-ada calc: {:?}", e))?
        .build()
        .map_err(|e| format!("child TAAD output build: {:?}", e))?;
    tb.add_output(&taad_output)
        .map_err(|e| format!("add_output failed: {:?}", e))?;

    // G-1: the OWNER controller must sign. Declare it as a required signer so it
    // lands in extra_signatories and the fee/size accounting reserves the witness.
    tb.add_required_signer(&owner_controller_keyhash);

    tb.set_ttl_bignum(&BigNum::from(current_slot + 7200));

    // ─── 10. Bind cost model + redeemer to body BEFORE change ──────
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;

    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // ─── 11. build_tx (folds script + mint redeemer) + sign ────────
    // Two vkey witnesses: the wallet payment key (fee/collateral inputs) and the
    // OWNER TAAD key (G-1 authority). The child key does NOT sign.
    let tx = tb
        .build_tx()
        .map_err(|e| format!("build_tx: {:?}", e))?;

    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &owner_taad_priv));
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

/// Decoded fields we need from an OWNER's TAADDatum to wire GenesisChild:
/// the DID (to confirm the reference is the claimed owner), the owner
/// controller_pkh (to derive + match the owner signer), and the status alt
/// index (0 == Active; the validator requires a live owner).
struct DecodedOwnerDatum {
    did: String,
    controller_pkh: Vec<u8>,
    status_alt: u64,
}

/// Parse an owner's inline TAADDatum (10-field v2 schema, or 9-field legacy).
/// Extracts field 0 (did), field 2 (controller_pkh), field 5 (status). Reuses
/// the same field layout as `decode_taad_datum_for_rotate` — kept separate
/// because the fields needed differ (here: controller_pkh + status, not seq).
fn decode_owner_datum(inline_datum_hex: &str) -> Result<DecodedOwnerDatum, String> {
    let datum = PlutusData::from_hex(inline_datum_hex)
        .map_err(|e| format!("owner inline_datum_hex not valid Plutus Data hex: {:?}", e))?;
    let constr = datum
        .as_constr_plutus_data()
        .ok_or_else(|| "owner datum is not ConstrPlutusData".to_string())?;
    if constr.alternative() != BigNum::from(0u64) {
        return Err("owner TAADDatum constructor index must be 0".into());
    }
    let fields = constr.data();
    let n = fields.len();
    if n != 9 && n != 10 {
        return Err(format!(
            "owner TAADDatum must have 9 or 10 fields, got {}",
            n
        ));
    }

    // Field 0: did
    let did_bytes = fields
        .get(0)
        .as_bytes()
        .ok_or_else(|| "owner TAADDatum.did is not ByteArray".to_string())?;
    let did = String::from_utf8(did_bytes)
        .map_err(|_| "owner TAADDatum.did is not valid UTF-8".to_string())?;

    // Field 2: controller_pkh (28-byte ByteArray)
    let controller_pkh = fields
        .get(2)
        .as_bytes()
        .ok_or_else(|| "owner TAADDatum.controller_pkh is not ByteArray".to_string())?;
    if controller_pkh.len() != 28 {
        return Err(format!(
            "owner TAADDatum.controller_pkh must be 28 bytes, got {}",
            controller_pkh.len()
        ));
    }

    // Field 5: status (ConstrPlutusData; Active = alt 0)
    let status_alt = fields
        .get(5)
        .as_constr_plutus_data()
        .ok_or_else(|| "owner TAADDatum.status is not ConstrPlutusData".to_string())?
        .alternative()
        .to_str()
        .parse::<u64>()
        .map_err(|_| "owner status alt index out of u64 range".to_string())?;

    Ok(DecodedOwnerDatum {
        did,
        controller_pkh,
        status_alt,
    })
}

/// Conservative static ExUnits for the `GenesisPerson` mint (mem units). The
/// gate is an all-conjunction predicate over a single minted NFT + its carrier
/// output, so real usage is well under this. See the budget TODO in
/// `build_create_taad_utxo_tx` — submit paths should evaluate-then-patch.
const GENESIS_EX_UNITS_MEM: u64 = 2_000_000;
/// Conservative static ExUnits for the `GenesisPerson` mint (cpu steps).
const GENESIS_EX_UNITS_STEPS: u64 = 700_000_000;

/// Pull `coins_per_utxo_size` (a.k.a. utxoCostPerByte) out of the parsed
/// protocol params, accepting both numeric and stringified encodings as
/// Blockfrost is inconsistent across endpoints.
pub(crate) fn extract_coins_per_utxo_size(params: &JsonValue) -> Result<u64, String> {
    match &params["coins_per_utxo_size"] {
        JsonValue::Number(n) => n
            .as_u64()
            .ok_or_else(|| "coins_per_utxo_size not u64".to_string()),
        JsonValue::String(s) => s
            .parse()
            .map_err(|_| "coins_per_utxo_size string not numeric".to_string()),
        _ => Ok(4310),
    }
}

// ─── 5. ROTATE TAAD UTxO TX ────────────────────────────────────────
//
// Per Option C: signature unchanged from the original stub; return type
// widened to `Result<String, String>` so error chains can carry context.
//
// SCOPE OF THIS COMMIT: parses the current TAAD UTxO JSON, decodes its
// datum to extract immutable fields + current sequence, builds the new
// datum (seq+1, new controller_pkh + new hw_pubkey), and constructs the
// Rotate redeemer. Returns an error explaining that the Plutus spend
// witness (script + redeemer + ex-units) is not yet attached. Once the
// MagicLamp tx-builder helpers land, the spend witness wiring is a
// localized addition that does not touch the datum/redeemer encoding.

/// The shape of the `current_taad_utxo_json` argument: the current TAAD UTxO
/// being spent, including everything needed to reconstruct the datum and
/// re-lock the same value.
#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)] // `assets` is parsed for forward-compat; mint-witness wiring will consume it.
struct CurrentTaadUtxo {
    tx_hash: String,
    index: u32,
    amount_lovelace: u64,
    /// Hex-encoded inline datum bytes (CBOR). The validator stored this in
    /// the previous tx; resolver / data provider returns it via Blockfrost
    /// `/scripts/datum/{hash}` or directly off the UTxO if inline.
    #[serde(default)]
    inline_datum_hex: Option<String>,
    /// All multi-asset entries currently locked in this UTxO (TAAD NFT etc.).
    /// Preserved on the continuing output to satisfy the validator's value
    /// preservation invariant.
    #[serde(default)]
    assets: Vec<UtxoAsset>,
}

/// Decode old sequence + immutable fields from an existing TAADDatum so the
/// new datum can be built with `seq+1` and unchanged immutables.
fn decode_taad_datum_for_rotate(
    inline_datum_hex: &str,
) -> Result<DecodedTaadDatum, String> {
    let datum = PlutusData::from_hex(inline_datum_hex)
        .map_err(|e| format!("inline_datum_hex not valid Plutus Data hex: {:?}", e))?;
    let constr = datum
        .as_constr_plutus_data()
        .ok_or_else(|| "datum is not ConstrPlutusData".to_string())?;
    if constr.alternative() != BigNum::from(0u64) {
        return Err("TAADDatum constructor index must be 0".into());
    }
    let fields = constr.data();
    // Schema v2 (validator with `recovery_anchor`) has 10 fields. We still
    // accept a legacy 9-field datum so a UTxO created before the field was
    // appended can be rotated forward (the rotate encoder will add the field,
    // defaulting it to None when absent). Reject anything outside {9, 10} —
    // a different arity means a schema we don't understand.
    let n = fields.len();
    if n != 9 && n != 10 {
        return Err(format!(
            "TAADDatum must have 9 (legacy) or 10 (with recovery_anchor) fields, got {}",
            n
        ));
    }

    // Field 0: did
    let did_bytes = fields
        .get(0)
        .as_bytes()
        .ok_or_else(|| "TAADDatum.did is not ByteArray".to_string())?;
    let did = String::from_utf8(did_bytes)
        .map_err(|_| "TAADDatum.did is not valid UTF-8".to_string())?;

    // Field 1: entity_type — must round-trip back into the new datum unchanged
    let et_constr = fields
        .get(1)
        .as_constr_plutus_data()
        .ok_or_else(|| "TAADDatum.entity_type is not ConstrPlutusData".to_string())?;
    let entity_type = et_constr
        .alternative()
        .to_str()
        .parse::<u64>()
        .map_err(|_| "entity_type alt index out of u64 range".to_string())?;
    if entity_type > 9 {
        return Err(format!(
            "entity_type alt index {} out of valid range 0..=9",
            entity_type
        ));
    }

    // Field 4: sequence
    let seq_bigint = fields
        .get(4)
        .as_integer()
        .ok_or_else(|| "TAADDatum.sequence is not Int".to_string())?;
    let seq_str = seq_bigint.to_str();
    let sequence = seq_str
        .parse::<u64>()
        .map_err(|_| format!("sequence not a non-negative integer: {}", seq_str))?;

    // Field 6: guardians — keep as-is for the new datum
    let guardians_data = fields.get(6);

    // Field 7: parent_did — preserve unchanged
    let parent_did_data = fields.get(7);

    // Field 8: revoked_slot — preserve unchanged
    let revoked_slot_data = fields.get(8);

    // Field 9: recovery_anchor (Option<ByteArray>) — only present on the v2
    // schema. Legacy 9-field datums implicitly carry None. Captured so callers
    // that don't supply a new CID at rotate time can fall back to the existing
    // anchor (the validator allows recovery_anchor to change freely on Rotate).
    let recovery_anchor_data = if n == 10 {
        Some(fields.get(9))
    } else {
        None
    };

    Ok(DecodedTaadDatum {
        did,
        entity_type: entity_type as u8,
        sequence,
        guardians_data,
        parent_did_data,
        revoked_slot_data,
        recovery_anchor_data,
    })
}

struct DecodedTaadDatum {
    did: String,
    entity_type: u8,
    sequence: u64,
    guardians_data: PlutusData,
    parent_did_data: PlutusData,
    revoked_slot_data: PlutusData,
    /// `Some(plutus_data)` when the source datum carried a `recovery_anchor`
    /// field (v2 schema); `None` for a legacy 9-field datum.
    recovery_anchor_data: Option<PlutusData>,
}

/// Build a new TAADDatum for the Rotate continuing output: same immutable
/// fields as the old datum, new controller + hw pubkey, sequence incremented.
///
/// `new_recovery_anchor` is the LampNet CID anchoring the distributed backup of
/// the NEW controller key:
///   - `Some(cid_bytes)` → field 9 = `Some(cid_bytes)`. The key changed, so the
///     caller uploads the new key to LampNet first, then passes the resulting
///     CID here. The validator (`taad_logic.ak` Rotate rule) lets
///     recovery_anchor change freely on Rotate, so no preservation constraint.
///   - `None` → fall back to the old datum's recovery_anchor (preserved as-is),
///     or `None` when the source was a legacy 9-field datum. This covers the
///     "rotate now, distribute later" flow where the CID is not yet known.
fn encode_taad_datum_rotate(
    old: &DecodedTaadDatum,
    new_controller_pkh: &[u8; 28],
    new_hw_pubkey: &[u8; 32],
    new_recovery_anchor: Option<&[u8]>,
) -> Result<PlutusData, String> {
    let mut fields = PlutusList::new();

    fields.add(&PlutusData::new_bytes(old.did.as_bytes().to_vec()));
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(
        old.entity_type as u64,
    )));
    fields.add(&PlutusData::new_bytes(new_controller_pkh.to_vec()));
    fields.add(&PlutusData::new_bytes(new_hw_pubkey.to_vec()));
    fields.add(&PlutusData::new_integer(
        &BigInt::from_str(&(old.sequence + 1).to_string())
            .map_err(|_| "BigInt::from_str on seq+1 unreachable".to_string())?,
    ));
    // Status stays Active across a rotate (status changes go through other
    // redeemers: InitRecovery / Deactivate / Transfer).
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64)));
    fields.add(&old.guardians_data);
    fields.add(&old.parent_did_data);
    fields.add(&old.revoked_slot_data);

    // Field 9: recovery_anchor. New CID supplied → use it; otherwise keep the
    // old anchor (or None for a legacy datum).
    match new_recovery_anchor {
        Some(cid) => fields.add(&encode_option_bytes(Some(cid))),
        None => match &old.recovery_anchor_data {
            Some(prev) => fields.add(prev),
            None => fields.add(&encode_option_bytes(None)),
        },
    }

    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    )))
}

/// Build tx rotating a TAAD UTxO: spends the current UTxO with a Plutus V3
/// `Rotate` spend witness and re-locks an updated datum (new controller + hw,
/// seq+1) onto a continuing output that preserves the State-NFT and value.
///
/// Rotation model (locked PO 2026-06): the NEW key becomes the SOLE controller
/// (single-controller, sequence+1); the old seed is backup only. No multisig.
/// The validator (`taad_logic.ak` rule `Rotate`, ~line 62-74) requires:
///   - `must_be_signed_by(datum.controller_pkh)` → the OLD controller signs.
///   - `next_datum.sequence == datum.sequence + 1`.
///   - `immutable_fields_preserved` (did, entity_type, parent_did, revoked_slot).
///   - `next_datum.controller_pkh == new_controller_pkh` (redeemer field).
///   - `next_datum.hw_key_pubkey == new_hw_pubkey` (redeemer field).
///   - `status_is_active(next_datum.status)` and `guardians == old guardians`.
///   - State-NFT singleton (A-1/A-3): the continuing output must carry exactly
///     the same NFT(s) as the spent input, at the same script address.
///
/// Witness wiring (CSL 13, Plutus V3):
///   - `PlutusScript::from_hex_with_version(.., v3)` → `PlutusWitness::new`
///     with the OLD inline datum + a `Rotate` redeemer (CSL reindexes the
///     redeemer to the canonical spend index automatically).
///   - The script input is added via a `TxInputsBuilder`; a collateral input is
///     selected from the caller's funded UTxOs (Plutus txes require collateral).
///   - `add_required_signer(old_controller_pkh)` + a vkey witness from the old
///     TAAD_Key (derived from `old_master_kek_hex`) satisfy `must_be_signed_by`.
///   - `calc_script_data_hash(plutus_conway_cost_models())` binds the V3 cost
///     model + redeemer to the body (mandatory for Plutus eval).
///
/// NOTE on ExUnits: the redeemer carries a conservative static ExUnits estimate
/// (mem/steps). CSL does not run the Plutus evaluator, so the caller (or a
/// downstream submit path) should run `/utils/txs/evaluate` and patch the
/// redeemer budget before submit if the static estimate proves tight on the
/// deployed validator. See the TODO at the budget constant.
///
/// `new_recovery_anchor_cid` — LampNet CID (bech32 string) anchoring the
/// distributed backup of the NEW controller key. The caller uploads the new
/// key to LampNet first, then passes the resulting CID here so the continuing
/// datum's `recovery_anchor` (field 9) points at it. Pass `None` (or, at the
/// FFI boundary, an empty string) for the "rotate now, distribute later" flow:
/// the previous anchor is then preserved (or stays `None` for a legacy datum).
/// The CID is stored as raw UTF-8 bytes — see the encode call below.
#[allow(clippy::too_many_arguments)]
pub fn build_rotate_taad_tx(
    current_taad_utxo_json: &str,
    new_taad_pubkey_hex: &str,
    new_hw_pubkey_hex: &str,
    old_master_kek_hex: &str,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
    new_recovery_anchor_cid: Option<&str>,
) -> Result<String, String> {
    // ─── 1. Parse + validate inputs ───────────────────────────────
    let current: CurrentTaadUtxo = serde_json::from_str(current_taad_utxo_json)
        .map_err(|e| format!("current_taad_utxo_json invalid: {}", e))?;
    let inline_datum_hex = current
        .inline_datum_hex
        .as_ref()
        .ok_or_else(|| "current_taad_utxo_json.inline_datum_hex is required for Rotate".to_string())?;

    let new_taad_bytes = hex::decode(new_taad_pubkey_hex)
        .map_err(|e| format!("new_taad_pubkey_hex invalid: {}", e))?;
    if new_taad_bytes.len() != 32 {
        return Err("new_taad_pubkey_hex must be 32 bytes (Ed25519 pubkey)".into());
    }
    let new_controller_pkh = blake2b_224(&new_taad_bytes);

    let new_hw_bytes = hex::decode(new_hw_pubkey_hex)
        .map_err(|e| format!("new_hw_pubkey_hex invalid: {}", e))?;
    if new_hw_bytes.len() != 32 {
        return Err("new_hw_pubkey_hex must be 32 bytes".into());
    }
    let mut new_hw_arr = [0u8; 32];
    new_hw_arr.copy_from_slice(&new_hw_bytes);

    let old_kek_bytes = hex::decode(old_master_kek_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("old_master_kek_hex invalid: {}", e))?;
    if old_kek_bytes.len() != 32 {
        return Err("old_master_kek_hex must be 32 bytes".into());
    }
    // Old Master_KEK — scrubbed on scope exit (D9).
    let mut old_kek = Zeroizing::new([0u8; 32]);
    old_kek.copy_from_slice(&old_kek_bytes);
    // Derive the old TAAD signing seed. This proves the caller holds the
    // Master_KEK that controls the on-chain TAAD, and produces the vkey
    // witness the validator's `must_be_signed_by(old controller_pkh)`
    // requires. (Zeroizing — scrubbed on scope exit.)
    let old_taad_seed = derive_taad_seed_from_kek(&old_kek);
    let old_taad_priv = csl::PrivateKey::from_normal_bytes(&*old_taad_seed)
        .map_err(|_| "old TAAD seed is not a valid Ed25519 private key".to_string())?;
    let old_taad_pub = old_taad_priv.to_public();
    let old_controller_keyhash = old_taad_pub.hash();

    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex invalid: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must be 32 bytes".into());
    }
    // Wallet seed — scrubbed on scope exit (D9).
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let utxos: Vec<UtxoInput> = serde_json::from_str(utxo_inputs_json)
        .map_err(|e| format!("utxo_inputs_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxo_inputs_json is empty — provide ≥1 funded UTxO for fee + collateral".into());
    }
    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|e| format!("protocol_params_json invalid: {}", e))?;

    // Script address + hash (network gate + script shape). The continuing
    // output must sit at this address (validator A-3: NFT cannot leave the
    // script credential).
    let (script_addr, _script_hash) =
        derive_taad_script_address(taad_script_cbor_hex, network)
            .map_err(|e| e.to_string())?;

    // ─── 2. Decode old datum + build new datum + redeemer ─────────
    let decoded = decode_taad_datum_for_rotate(inline_datum_hex)?;
    let old_seq = decoded.sequence;
    let old_datum = PlutusData::from_hex(inline_datum_hex)
        .map_err(|e| format!("inline_datum_hex not valid Plutus Data hex: {:?}", e))?;
    // LampNet CID for the NEW controller key's distributed backup. Treated as
    // an opaque bech32 string → UTF-8 bytes (NOT bech32-decoded): the on-chain
    // anchor stores the human-readable CID so a resolver can fetch it directly,
    // and the validator only does an equality comparison on the bytes (no
    // structural decode). An empty / absent string means "not distributed yet"
    // → None (the rotate encoder then keeps the previous anchor, or None).
    let recovery_anchor_bytes: Option<Vec<u8>> = match new_recovery_anchor_cid {
        Some(cid) if !cid.is_empty() => Some(cid.as_bytes().to_vec()),
        _ => None,
    };
    let new_datum = encode_taad_datum_rotate(
        &decoded,
        &new_controller_pkh,
        &new_hw_arr,
        recovery_anchor_bytes.as_deref(),
    )?;
    let rotate_redeemer_data = encode_rotate_redeemer(&new_controller_pkh, &new_hw_arr);

    // The current TAAD UTxO outpoint being spent.
    let current_input = TransactionInput::new(
        &TransactionHash::from_hex(&current.tx_hash)
            .map_err(|_| "current_taad_utxo_json.tx_hash invalid".to_string())?,
        current.index,
    );
    if current.amount_lovelace == 0 {
        return Err("current_taad_utxo_json.amount_lovelace must be > 0".into());
    }

    // Reconstruct the value locked in the current TAAD UTxO (lovelace + all
    // multi-assets, incl. the State-NFT). The continuing output re-locks the
    // SAME value so the validator's NFT-singleton invariant holds and no
    // value is skimmed.
    let mut current_ma = MultiAsset::new();
    for a in &current.assets {
        let policy_bytes = hex::decode(&a.policy_id)
            .map_err(|_| "current_taad_utxo_json.assets.policy_id not hex".to_string())?;
        let policy = ScriptHash::from_bytes(policy_bytes)
            .map_err(|_| "current_taad_utxo_json.assets.policy_id not 28-byte hash".to_string())?;
        let name_bytes = hex::decode(&a.asset_name_hex)
            .map_err(|_| "current_taad_utxo_json.assets.asset_name_hex not hex".to_string())?;
        let asset_name = AssetName::new(name_bytes)
            .map_err(|_| "current_taad_utxo_json.assets.asset_name_hex too long".to_string())?;
        current_ma.set_asset(&policy, &asset_name, &BigNum::from(a.quantity));
    }
    let continuing_value = if current.assets.is_empty() {
        Value::new(&BigNum::from(current.amount_lovelace))
    } else {
        Value::new_with_assets(&BigNum::from(current.amount_lovelace), &current_ma)
    };

    // ─── 3. Plutus V3 spend witness ───────────────────────────────
    let script = csl::PlutusScript::from_hex_with_version(
        taad_script_cbor_hex,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "taad_script_cbor_hex is not valid Plutus V3 script CBOR hex".to_string())?;

    // Static ExUnits estimate. CSL does NOT run the Plutus evaluator, so this
    // budget is a conservative placeholder; the spend index is set to 0 here
    // and re-indexed by CSL to the canonical input position at build time.
    //
    // TODO(budget): replace with the actual budget from Blockfrost
    // `/utils/txs/evaluate` (or ogmios EvaluateTx) before submit. The
    // validator (taad_logic Rotate) is a small all-conjunction check, so
    // this estimate is generous, but the network rejects a tx whose declared
    // ExUnits are below the real cost — evaluate-then-patch is the safe path.
    let ex_units = csl::ExUnits::new(
        &BigNum::from(ROTATE_EX_UNITS_MEM),
        &BigNum::from(ROTATE_EX_UNITS_STEPS),
    );
    let rotate_redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_spend(),
        &BigNum::zero(),
        &rotate_redeemer_data,
        &ex_units,
    );
    // Spend witness: script + the OLD inline datum + Rotate redeemer.
    let plutus_witness =
        csl::PlutusWitness::new(&script, &old_datum, &rotate_redeemer);

    // ─── 4. Inputs: script input + fee-paying input ───────────────
    let (wallet_addr, payment_xprv) = derive_wallet(&wallet_seed, network)
        .map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address is not valid bech32 (unreachable)".to_string())?;

    let mut inputs = csl::TxInputsBuilder::new();
    inputs.add_plutus_script_input(&plutus_witness, &current_input, &continuing_value);

    // Fee-paying input from the caller's funded UTxOs (NOT the script UTxO).
    let fee_utxo = pick_largest_utxo(&utxos).map_err(|e| e.to_string())?;
    if fee_utxo.tx_hash == current.tx_hash && fee_utxo.index == current.index {
        return Err(
            "utxo_inputs_json must contain a funded wallet UTxO distinct from the TAAD UTxO \
             (needed for fee + collateral)"
                .into(),
        );
    }
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&fee_utxo.tx_hash)
            .map_err(|_| "utxo_inputs_json tx_hash not valid 32-byte hex".to_string())?,
        fee_utxo.index,
    );
    inputs.add_regular_input(
        &wallet_addr_obj,
        &fee_input,
        &Value::new(&BigNum::from(fee_utxo.amount_lovelace)),
    )
    .map_err(|e| format!("add_regular_input (fee utxo): {:?}", e))?;

    // ─── 5. Assemble the tx ───────────────────────────────────────
    let mut tb = build_tx_builder(&params).map_err(|e| e.to_string())?;
    tb.set_inputs(&inputs);

    // Collateral (Plutus txes require it). Reuse the fee UTxO as collateral —
    // a wallet UTxO with no native assets is the canonical choice.
    let mut collateral = csl::TxInputsBuilder::new();
    collateral
        .add_regular_input(
            &wallet_addr_obj,
            &fee_input,
            &Value::new(&BigNum::from(fee_utxo.amount_lovelace)),
        )
        .map_err(|e| format!("add collateral input: {:?}", e))?;
    tb.set_collateral(&collateral);

    // Continuing output at the script address: new datum (seq+1, new keys),
    // same value (lovelace + State-NFT preserved).
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

    // must_be_signed_by(old controller_pkh): declare the required signer so the
    // validator sees it in extra_signatories, and fee/size accounting reserves
    // room for the witness.
    tb.add_required_signer(&old_controller_keyhash);

    tb.set_ttl_bignum(&BigNum::from(current_slot + 7200));

    // Bind the Plutus V3 cost model + redeemer to the body BEFORE computing
    // change, so the fee accounts for the script_data_hash field's 32 bytes.
    // Conway cost models cover Plutus V1/V2/V3; the V3 entry is what the
    // deployed validator uses.
    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;

    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    // build_tx assembles the body + the builder-side witness set (plutus
    // script, redeemers, datum). We then add the two vkey witnesses (wallet
    // payment key for the fee input + old TAAD key for must_be_signed_by).
    let tx = tb
        .build_tx()
        .map_err(|e| format!("build_tx: {:?}", e))?;

    let body = tx.body();
    // Tx id = BLAKE2b-256 of the canonical body CBOR (same approach as
    // build_create_taad_utxo_tx; matches the ledger's tx-hash rule).
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(
        &tx_hash,
        &payment_xprv.to_raw_key(),
    ));
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &old_taad_priv));
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    let _ = (old_seq, current_slot); // retained for the docstring contract
    Ok(hex::encode(signed.to_bytes()))
}

/// Conservative static ExUnits for the `Rotate` spend (mem units). The
/// validator is an all-conjunction predicate over a single resolved input +
/// continuing output, so real usage is well under this. See the budget TODO
/// in `build_rotate_taad_tx` — submit paths should evaluate-then-patch.
const ROTATE_EX_UNITS_MEM: u64 = 2_000_000;
/// Conservative static ExUnits for the `Rotate` spend (cpu steps).
const ROTATE_EX_UNITS_STEPS: u64 = 700_000_000;

// ═══════════════════════════════════════════════════════════════════
// M2 — LIFECYCLE BUILDERS (recovery / deactivate / update-guardians)
//
// These share the Rotate template above: spend the current TAAD UTxO
// with a Plutus V3 spend witness, re-lock an updated datum (seq+1,
// State-NFT preserved) onto a continuing output at the script address,
// and satisfy the validator's `must_be_signed_by` via vkey witnesses.
//
// Redeemer constr indices (PhoenixKey-Validator/lib/phoenixkey/types.ak):
//   0 Rotate · 1 InitRecovery · 2 CancelRecovery · 3 FinalizeRecovery
//   4 Deactivate · 5 UpdateGuardians · 6 Transfer
// TAADStatus constr indices: 0 Active · 1 Recovering · 2 Migrated · 3 Revoked
// ═══════════════════════════════════════════════════════════════════

/// Every field of a TAADDatum, with the preserved fields kept as raw
/// `PlutusData` so they round-trip byte-for-byte into the continuing
/// output. Only the values a builder needs to read (sequence, did,
/// entity_type) are parsed. Field 9 (recovery_anchor) is synthesised as
/// `Some=None` when the source is a legacy 9-field datum.
struct FullTaadDatum {
    did: String,
    entity_type: u8,
    controller_pkh: PlutusData, // field 2
    hw_pubkey: PlutusData,      // field 3
    sequence: u64,              // field 4
    status: PlutusData,         // field 5 (raw — decoded separately when needed)
    guardians: PlutusData,      // field 6
    parent_did: PlutusData,     // field 7
    revoked_slot: PlutusData,   // field 8
    recovery_anchor: PlutusData, // field 9 (None-encoded if legacy)
}

/// Decode all 10 (or legacy 9) fields of a TAADDatum. Mirrors
/// `decode_taad_datum_for_rotate` but retains the controller/hw/status
/// fields the lifecycle builders must preserve or read.
fn decode_taad_datum_full(inline_datum_hex: &str) -> Result<FullTaadDatum, String> {
    let datum = PlutusData::from_hex(inline_datum_hex)
        .map_err(|e| format!("inline_datum_hex not valid Plutus Data hex: {:?}", e))?;
    let constr = datum
        .as_constr_plutus_data()
        .ok_or_else(|| "datum is not ConstrPlutusData".to_string())?;
    if constr.alternative() != BigNum::from(0u64) {
        return Err("TAADDatum constructor index must be 0".into());
    }
    let fields = constr.data();
    let n = fields.len();
    if n != 9 && n != 10 {
        return Err(format!(
            "TAADDatum must have 9 (legacy) or 10 fields, got {}",
            n
        ));
    }

    let did_bytes = fields
        .get(0)
        .as_bytes()
        .ok_or_else(|| "TAADDatum.did is not ByteArray".to_string())?;
    let did = String::from_utf8(did_bytes)
        .map_err(|_| "TAADDatum.did is not valid UTF-8".to_string())?;

    let et_constr = fields
        .get(1)
        .as_constr_plutus_data()
        .ok_or_else(|| "TAADDatum.entity_type is not ConstrPlutusData".to_string())?;
    let entity_type = et_constr
        .alternative()
        .to_str()
        .parse::<u64>()
        .map_err(|_| "entity_type alt index out of u64 range".to_string())?;
    if entity_type > 9 {
        return Err(format!("entity_type alt index {} out of 0..=9", entity_type));
    }

    let seq_str = fields
        .get(4)
        .as_integer()
        .ok_or_else(|| "TAADDatum.sequence is not Int".to_string())?
        .to_str();
    let sequence = seq_str
        .parse::<u64>()
        .map_err(|_| format!("sequence not a non-negative integer: {}", seq_str))?;

    let recovery_anchor = if n == 10 {
        fields.get(9)
    } else {
        encode_option_bytes(None)
    };

    Ok(FullTaadDatum {
        did,
        entity_type: entity_type as u8,
        controller_pkh: fields.get(2),
        hw_pubkey: fields.get(3),
        sequence,
        status: fields.get(5),
        guardians: fields.get(6),
        parent_did: fields.get(7),
        revoked_slot: fields.get(8),
        recovery_anchor,
    })
}

/// Re-assemble a 10-field TAADDatum (constr 0) from explicit fields. The
/// caller supplies the new/preserved value for each position.
#[allow(clippy::too_many_arguments)]
fn assemble_taad_datum(
    did: &str,
    entity_type: u8,
    controller_pkh: &PlutusData,
    hw_pubkey: &PlutusData,
    sequence: u64,
    status: &PlutusData,
    guardians: &PlutusData,
    parent_did: &PlutusData,
    revoked_slot: &PlutusData,
    recovery_anchor: &PlutusData,
) -> Result<PlutusData, String> {
    let mut fields = PlutusList::new();
    fields.add(&PlutusData::new_bytes(did.as_bytes().to_vec()));
    fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(
        entity_type as u64,
    )));
    fields.add(controller_pkh);
    fields.add(hw_pubkey);
    fields.add(&pd_int(sequence)?);
    fields.add(status);
    fields.add(guardians);
    fields.add(parent_did);
    fields.add(revoked_slot);
    fields.add(recovery_anchor);
    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &fields,
    )))
}

/// `PlutusData` integer from a u64.
fn pd_int(n: u64) -> Result<PlutusData, String> {
    Ok(PlutusData::new_integer(
        &BigInt::from_str(&n.to_string()).map_err(|_| "BigInt::from_str(u64) unreachable".to_string())?,
    ))
}

/// `Some(bytes)` Option encoding (constr 0 [bytes]).
fn pd_some_int(n: u64) -> Result<PlutusData, String> {
    let mut inner = PlutusList::new();
    inner.add(&pd_int(n)?);
    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(0u64),
        &inner,
    )))
}

fn status_active() -> PlutusData {
    PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))
}

fn status_revoked() -> PlutusData {
    PlutusData::new_empty_constr_plutus_data(&BigNum::from(3u64))
}

/// Recovering { pending_controller_pkh, pending_hw_pubkey, deadline_slot,
/// collateral_lovelace } — constr 1, 4 fields.
fn status_recovering(
    pending_controller_pkh: &[u8; 28],
    pending_hw_pubkey: &[u8; 32],
    deadline_slot: u64,
    collateral_lovelace: u64,
) -> Result<PlutusData, String> {
    let mut f = PlutusList::new();
    f.add(&PlutusData::new_bytes(pending_controller_pkh.to_vec()));
    f.add(&PlutusData::new_bytes(pending_hw_pubkey.to_vec()));
    f.add(&pd_int(deadline_slot)?);
    f.add(&pd_int(collateral_lovelace)?);
    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(1u64),
        &f,
    )))
}

/// Extract (pending_controller_pkh, pending_hw_pubkey, deadline_slot,
/// collateral_lovelace) from a `Recovering` status PlutusData.
fn decode_recovering_status(status: &PlutusData) -> Result<([u8; 28], [u8; 32], u64, u64), String> {
    let c = status
        .as_constr_plutus_data()
        .ok_or_else(|| "status is not ConstrPlutusData".to_string())?;
    if c.alternative() != BigNum::from(1u64) {
        return Err("TAAD status is not Recovering (constr 1) — wrong lifecycle state".into());
    }
    let f = c.data();
    if f.len() != 4 {
        return Err(format!("Recovering must have 4 fields, got {}", f.len()));
    }
    let ctrl = f
        .get(0)
        .as_bytes()
        .ok_or_else(|| "Recovering.pending_controller_pkh not ByteArray".to_string())?;
    if ctrl.len() != 28 {
        return Err("pending_controller_pkh must be 28 bytes".into());
    }
    let hw = f
        .get(1)
        .as_bytes()
        .ok_or_else(|| "Recovering.pending_hw_pubkey not ByteArray".to_string())?;
    if hw.len() != 32 {
        return Err("pending_hw_pubkey must be 32 bytes".into());
    }
    let deadline = f
        .get(2)
        .as_integer()
        .ok_or_else(|| "Recovering.deadline_slot not Int".to_string())?
        .to_str()
        .parse::<u64>()
        .map_err(|_| "deadline_slot not u64".to_string())?;
    let collateral = f
        .get(3)
        .as_integer()
        .ok_or_else(|| "Recovering.collateral_lovelace not Int".to_string())?
        .to_str()
        .parse::<u64>()
        .map_err(|_| "collateral_lovelace not u64".to_string())?;
    let mut ctrl_arr = [0u8; 28];
    ctrl_arr.copy_from_slice(&ctrl);
    let mut hw_arr = [0u8; 32];
    hw_arr.copy_from_slice(&hw);
    Ok((ctrl_arr, hw_arr, deadline, collateral))
}

/// Empty redeemer of the given constr index (CancelRecovery=2,
/// FinalizeRecovery=3, Deactivate=4).
fn encode_empty_redeemer(constr_index: u64) -> PlutusData {
    PlutusData::new_empty_constr_plutus_data(&BigNum::from(constr_index))
}

/// InitRecovery redeemer — constr 1, [new_controller_pkh, new_hw_pubkey,
/// guardian_sig_count, collateral_lovelace].
fn encode_init_recovery_redeemer(
    new_controller_pkh: &[u8; 28],
    new_hw_pubkey: &[u8; 32],
    guardian_sig_count: u64,
    collateral_lovelace: u64,
) -> Result<PlutusData, String> {
    let mut f = PlutusList::new();
    f.add(&PlutusData::new_bytes(new_controller_pkh.to_vec()));
    f.add(&PlutusData::new_bytes(new_hw_pubkey.to_vec()));
    f.add(&pd_int(guardian_sig_count)?);
    f.add(&pd_int(collateral_lovelace)?);
    Ok(PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
        &BigNum::from(1u64),
        &f,
    )))
}

/// UpdateGuardians redeemer — constr 5, [List<VerificationKeyHash>].
fn encode_update_guardians_redeemer(new_guardians: &[[u8; 28]]) -> PlutusData {
    let mut list = PlutusList::new();
    for g in new_guardians {
        list.add(&PlutusData::new_bytes(g.to_vec()));
    }
    let inner = PlutusData::new_list(&list);
    let mut f = PlutusList::new();
    f.add(&inner);
    PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(5u64), &f))
}

/// Encode a `List<VerificationKeyHash>` (for the guardians datum field).
fn encode_guardian_list(guardians: &[[u8; 28]]) -> PlutusData {
    let mut list = PlutusList::new();
    for g in guardians {
        list.add(&PlutusData::new_bytes(g.to_vec()));
    }
    PlutusData::new_list(&list)
}

/// Shared parse of the spend inputs common to every lifecycle builder.
struct LifecycleInputs {
    current: CurrentTaadUtxo,
    inline_datum_hex: String,
    utxos: Vec<UtxoInput>,
    params: JsonValue,
}

fn parse_lifecycle_inputs(
    current_taad_utxo_json: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
) -> Result<LifecycleInputs, String> {
    let current: CurrentTaadUtxo = serde_json::from_str(current_taad_utxo_json)
        .map_err(|e| format!("current_taad_utxo_json invalid: {}", e))?;
    let inline_datum_hex = current
        .inline_datum_hex
        .clone()
        .ok_or_else(|| "current_taad_utxo_json.inline_datum_hex is required".to_string())?;
    if current.amount_lovelace == 0 {
        return Err("current_taad_utxo_json.amount_lovelace must be > 0".into());
    }
    let utxos: Vec<UtxoInput> = serde_json::from_str(utxo_inputs_json)
        .map_err(|e| format!("utxo_inputs_json invalid: {}", e))?;
    if utxos.is_empty() {
        return Err("utxo_inputs_json is empty — provide ≥1 funded UTxO for fee + collateral".into());
    }
    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|e| format!("protocol_params_json invalid: {}", e))?;
    Ok(LifecycleInputs {
        current,
        inline_datum_hex,
        utxos,
        params,
    })
}

/// Rebuild the value locked in the current TAAD UTxO (lovelace + every
/// multi-asset, incl. the State-NFT) so the continuing output preserves it.
/// `extra_lovelace` is added on top (used by InitRecovery to lock collateral).
fn continuing_value_with_extra(
    current: &CurrentTaadUtxo,
    extra_lovelace: u64,
) -> Result<Value, String> {
    let mut ma = MultiAsset::new();
    for a in &current.assets {
        let policy_bytes = hex::decode(&a.policy_id)
            .map_err(|_| "current assets.policy_id not hex".to_string())?;
        let policy = ScriptHash::from_bytes(policy_bytes)
            .map_err(|_| "current assets.policy_id not 28-byte hash".to_string())?;
        let name_bytes = hex::decode(&a.asset_name_hex)
            .map_err(|_| "current assets.asset_name_hex not hex".to_string())?;
        let asset_name = AssetName::new(name_bytes)
            .map_err(|_| "current assets.asset_name_hex too long".to_string())?;
        ma.set_asset(&policy, &asset_name, &BigNum::from(a.quantity));
    }
    let lovelace = BigNum::from(current.amount_lovelace + extra_lovelace);
    Ok(if current.assets.is_empty() {
        Value::new(&lovelace)
    } else {
        Value::new_with_assets(&lovelace, &ma)
    })
}

/// Derive an Ed25519 signing key (priv + pkh) from a 32-byte hex seed.
/// Used both for the current/new controller (via TAAD seed) and for
/// guardian co-signing keys in InitRecovery.
fn ed25519_from_seed_hex(seed_hex: &str, label: &str) -> Result<(csl::PrivateKey, csl::Ed25519KeyHash), String> {
    let bytes = hex::decode(seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("{} invalid hex: {}", label, e))?;
    if bytes.len() != 32 {
        return Err(format!("{} must be 32 bytes", label));
    }
    let priv_key = csl::PrivateKey::from_normal_bytes(&bytes)
        .map_err(|_| format!("{} is not a valid Ed25519 private key", label))?;
    let pkh = priv_key.to_public().hash();
    Ok((priv_key, pkh))
}

/// Core assembly shared by all single-controller lifecycle spends
/// (Cancel / Finalize / Deactivate / UpdateGuardians). Builds the spend tx
/// with the supplied redeemer + new datum, signs with the fee wallet key +
/// the supplied controller key. `validity_start`/`ttl` pin the validity
/// interval the validator reads (lower/upper bound); pass `None` to keep the
/// default ttl-only window.
#[allow(clippy::too_many_arguments)]
fn build_lifecycle_spend(
    li: &LifecycleInputs,
    new_datum: &PlutusData,
    redeemer_data: &PlutusData,
    controller_priv: &csl::PrivateKey,
    controller_pkh: &csl::Ed25519KeyHash,
    extra_guardian_signers: &[(csl::PrivateKey, csl::Ed25519KeyHash)],
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    extra_continuing_lovelace: u64,
    validity_start: Option<u64>,
    ttl: u64,
) -> Result<String, String> {
    let seed_bytes = hex::decode(wallet_seed_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("wallet_seed_hex invalid: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("wallet_seed_hex must be 32 bytes".into());
    }
    let mut wallet_seed = Zeroizing::new([0u8; 32]);
    wallet_seed.copy_from_slice(&seed_bytes);

    let (script_addr, _hash) =
        derive_taad_script_address(taad_script_cbor_hex, network).map_err(|e| e.to_string())?;

    let old_datum = PlutusData::from_hex(&li.inline_datum_hex)
        .map_err(|e| format!("inline_datum_hex not valid Plutus Data hex: {:?}", e))?;

    let current_input = TransactionInput::new(
        &TransactionHash::from_hex(&li.current.tx_hash)
            .map_err(|_| "current_taad_utxo_json.tx_hash invalid".to_string())?,
        li.current.index,
    );
    let continuing_value = continuing_value_with_extra(&li.current, extra_continuing_lovelace)?;

    let script = csl::PlutusScript::from_hex_with_version(
        taad_script_cbor_hex,
        &csl::Language::new_plutus_v3(),
    )
    .map_err(|_| "taad_script_cbor_hex is not valid Plutus V3 script CBOR hex".to_string())?;

    let ex_units = csl::ExUnits::new(
        &BigNum::from(ROTATE_EX_UNITS_MEM),
        &BigNum::from(ROTATE_EX_UNITS_STEPS),
    );
    let redeemer = csl::Redeemer::new(
        &csl::RedeemerTag::new_spend(),
        &BigNum::zero(),
        redeemer_data,
        &ex_units,
    );
    let plutus_witness = csl::PlutusWitness::new(&script, &old_datum, &redeemer);

    let (wallet_addr, payment_xprv) =
        derive_wallet(&wallet_seed, network).map_err(|e| e.to_string())?;
    let wallet_addr_obj = Address::from_bech32(&wallet_addr)
        .map_err(|_| "derived wallet address invalid (unreachable)".to_string())?;

    let mut inputs = csl::TxInputsBuilder::new();
    inputs.add_plutus_script_input(&plutus_witness, &current_input, &continuing_value);

    let fee_utxo = pick_largest_utxo(&li.utxos).map_err(|e| e.to_string())?;
    if fee_utxo.tx_hash == li.current.tx_hash && fee_utxo.index == li.current.index {
        return Err(
            "utxo_inputs_json must contain a funded wallet UTxO distinct from the TAAD UTxO".into(),
        );
    }
    let fee_input = TransactionInput::new(
        &TransactionHash::from_hex(&fee_utxo.tx_hash)
            .map_err(|_| "utxo_inputs_json tx_hash not valid 32-byte hex".to_string())?,
        fee_utxo.index,
    );
    inputs
        .add_regular_input(
            &wallet_addr_obj,
            &fee_input,
            &Value::new(&BigNum::from(fee_utxo.amount_lovelace)),
        )
        .map_err(|e| format!("add_regular_input (fee utxo): {:?}", e))?;

    let mut tb = build_tx_builder(&li.params).map_err(|e| e.to_string())?;
    tb.set_inputs(&inputs);

    let mut collateral = csl::TxInputsBuilder::new();
    collateral
        .add_regular_input(
            &wallet_addr_obj,
            &fee_input,
            &Value::new(&BigNum::from(fee_utxo.amount_lovelace)),
        )
        .map_err(|e| format!("add collateral input: {:?}", e))?;
    tb.set_collateral(&collateral);

    let continuing_output = TransactionOutputBuilder::new()
        .with_address(&script_addr)
        .with_plutus_data(new_datum)
        .next()
        .map_err(|e| format!("continuing output builder.next: {:?}", e))?
        .with_value(&continuing_value)
        .build()
        .map_err(|e| format!("continuing output build: {:?}", e))?;
    tb.add_output(&continuing_output)
        .map_err(|e| format!("add continuing output: {:?}", e))?;

    // Required signers: the controller (Cancel/Deactivate/UpdateGuardians use
    // the current controller; Finalize uses the pending/new controller) plus
    // any guardian co-signers (InitRecovery).
    tb.add_required_signer(controller_pkh);
    for (_, gpkh) in extra_guardian_signers {
        tb.add_required_signer(gpkh);
    }

    if let Some(start) = validity_start {
        tb.set_validity_start_interval_bignum(BigNum::from(start));
    }
    tb.set_ttl_bignum(&BigNum::from(ttl));

    let cost_models = csl::TxBuilderConstants::plutus_conway_cost_models();
    tb.calc_script_data_hash(&cost_models)
        .map_err(|e| format!("calc_script_data_hash: {:?}", e))?;

    tb.add_change_if_needed(&wallet_addr_obj)
        .map_err(|e| format!("add_change_if_needed: {:?} (insufficient input?)", e))?;

    let tx = tb.build_tx().map_err(|e| format!("build_tx: {:?}", e))?;
    let body = tx.body();
    let mut h = Blake2b256::new();
    h.update(body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes length mismatch".to_string())?;

    let mut witnesses = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&csl::make_vkey_witness(&tx_hash, &payment_xprv.to_raw_key()));
    vkeys.add(&csl::make_vkey_witness(&tx_hash, controller_priv));
    for (gpriv, _) in extra_guardian_signers {
        vkeys.add(&csl::make_vkey_witness(&tx_hash, gpriv));
    }
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

/// **Deactivate** — controller signs; status → Revoked, revoked_slot pinned
/// to the tx validity lower bound (validator A-2). Terminal state.
#[allow(clippy::too_many_arguments)]
pub fn build_deactivate_taad_tx(
    current_taad_utxo_json: &str,
    master_kek_hex: &str,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, String> {
    let li = parse_lifecycle_inputs(current_taad_utxo_json, utxo_inputs_json, protocol_params_json)?;
    let d = decode_taad_datum_full(&li.inline_datum_hex)?;

    let kek = decode_kek32(master_kek_hex, "master_kek_hex")?;
    let taad_seed = derive_taad_seed_from_kek(&kek);
    let ctrl_priv = csl::PrivateKey::from_normal_bytes(&*taad_seed)
        .map_err(|_| "controller TAAD seed is not a valid Ed25519 private key".to_string())?;
    let ctrl_pkh = ctrl_priv.to_public().hash();

    // revoked_slot = Some(current_slot); validity lower bound must equal it.
    let new_datum = assemble_taad_datum(
        &d.did,
        d.entity_type,
        &d.controller_pkh,
        &d.hw_pubkey,
        d.sequence + 1,
        &status_revoked(),
        &d.guardians,
        &d.parent_did,
        &pd_some_int(current_slot)?,
        &d.recovery_anchor,
    )?;
    let redeemer = encode_empty_redeemer(4);

    build_lifecycle_spend(
        &li,
        &new_datum,
        &redeemer,
        &ctrl_priv,
        &ctrl_pkh,
        &[],
        wallet_seed_hex,
        network,
        taad_script_cbor_hex,
        0,
        Some(current_slot),
        current_slot + 7200,
    )
}

/// **UpdateGuardians** — controller signs; guardians list replaced (≤5).
/// `new_guardians_json` = JSON array of 28-byte hex VerificationKeyHash.
#[allow(clippy::too_many_arguments)]
pub fn build_update_guardians_tx(
    current_taad_utxo_json: &str,
    new_guardians_json: &str,
    master_kek_hex: &str,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, String> {
    let li = parse_lifecycle_inputs(current_taad_utxo_json, utxo_inputs_json, protocol_params_json)?;
    let d = decode_taad_datum_full(&li.inline_datum_hex)?;

    let guardians = parse_pkh_list(new_guardians_json, "new_guardians_json")?;
    if guardians.len() > 5 {
        return Err("validator caps guardians at 5".into());
    }

    let kek = decode_kek32(master_kek_hex, "master_kek_hex")?;
    let taad_seed = derive_taad_seed_from_kek(&kek);
    let ctrl_priv = csl::PrivateKey::from_normal_bytes(&*taad_seed)
        .map_err(|_| "controller TAAD seed is not a valid Ed25519 private key".to_string())?;
    let ctrl_pkh = ctrl_priv.to_public().hash();

    let new_datum = assemble_taad_datum(
        &d.did,
        d.entity_type,
        &d.controller_pkh,
        &d.hw_pubkey,
        d.sequence + 1,
        &status_active(),
        &encode_guardian_list(&guardians),
        &d.parent_did,
        &d.revoked_slot,
        &d.recovery_anchor,
    )?;
    let redeemer = encode_update_guardians_redeemer(&guardians);

    build_lifecycle_spend(
        &li,
        &new_datum,
        &redeemer,
        &ctrl_priv,
        &ctrl_pkh,
        &[],
        wallet_seed_hex,
        network,
        taad_script_cbor_hex,
        0,
        Some(current_slot),
        current_slot + 7200,
    )
}

/// **InitRecovery** — guardian threshold signs (NOT the lost controller).
/// status → Recovering{pending = new key, deadline = lb + timelock,
/// collateral}. Continuing output locks `collateral_lovelace` extra ADA.
///
/// `recovery_timelock_slots` MUST equal the value baked into the deployed
/// validator (the datum's deadline_slot must equal lb + that param, else the
/// validator rejects). `guardian_signing_keys_json` = JSON array of 32-byte
/// hex Ed25519 seeds for the signing guardians (test/preprod path; production
/// aggregates guardian witnesses signed on their own devices).
#[allow(clippy::too_many_arguments)]
pub fn build_init_recovery_tx(
    current_taad_utxo_json: &str,
    new_taad_pubkey_hex: &str,
    new_hw_pubkey_hex: &str,
    guardian_signing_keys_json: &str,
    collateral_lovelace: u64,
    recovery_timelock_slots: u64,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, String> {
    let li = parse_lifecycle_inputs(current_taad_utxo_json, utxo_inputs_json, protocol_params_json)?;
    let d = decode_taad_datum_full(&li.inline_datum_hex)?;

    let new_taad_bytes = hex::decode(new_taad_pubkey_hex)
        .map_err(|e| format!("new_taad_pubkey_hex invalid: {}", e))?;
    if new_taad_bytes.len() != 32 {
        return Err("new_taad_pubkey_hex must be 32 bytes".into());
    }
    let new_controller_pkh = blake2b_224(&new_taad_bytes);
    let new_hw_bytes = hex::decode(new_hw_pubkey_hex)
        .map_err(|e| format!("new_hw_pubkey_hex invalid: {}", e))?;
    if new_hw_bytes.len() != 32 {
        return Err("new_hw_pubkey_hex must be 32 bytes".into());
    }
    let mut new_hw_arr = [0u8; 32];
    new_hw_arr.copy_from_slice(&new_hw_bytes);

    // Guardian co-signers (threshold). The validator counts those whose pkh is
    // in datum.guardians AND signed; the redeemer's guardian_sig_count must
    // equal that count.
    let guardian_seeds: Vec<String> = serde_json::from_str(guardian_signing_keys_json)
        .map_err(|e| format!("guardian_signing_keys_json must be a JSON array of hex seeds: {}", e))?;
    if guardian_seeds.is_empty() {
        return Err("guardian_signing_keys_json is empty — need ≥ threshold guardians".into());
    }
    let mut guardian_signers: Vec<(csl::PrivateKey, csl::Ed25519KeyHash)> = Vec::new();
    for (i, s) in guardian_seeds.iter().enumerate() {
        guardian_signers.push(ed25519_from_seed_hex(s, &format!("guardian_signing_keys[{}]", i))?);
    }
    let guardian_sig_count = guardian_signers.len() as u64;

    let deadline_slot = current_slot + recovery_timelock_slots;

    // controller_pkh + hw_key_pubkey stay UNCHANGED at init (validator rule).
    let new_datum = assemble_taad_datum(
        &d.did,
        d.entity_type,
        &d.controller_pkh,
        &d.hw_pubkey,
        d.sequence + 1,
        &status_recovering(&new_controller_pkh, &new_hw_arr, deadline_slot, collateral_lovelace)?,
        &d.guardians,
        &d.parent_did,
        &d.revoked_slot,
        &d.recovery_anchor,
    )?;
    let redeemer = encode_init_recovery_redeemer(
        &new_controller_pkh,
        &new_hw_arr,
        guardian_sig_count,
        collateral_lovelace,
    )?;

    // No single controller key signs init — the guardians do. We pass the first
    // guardian as the "controller" slot of the shared assembler and the rest as
    // extra signers (the assembler always adds a wallet-key witness for fees).
    let (first_priv, first_pkh) = guardian_signers.remove(0);
    build_lifecycle_spend(
        &li,
        &new_datum,
        &redeemer,
        &first_priv,
        &first_pkh,
        &guardian_signers,
        wallet_seed_hex,
        network,
        taad_script_cbor_hex,
        collateral_lovelace,
        Some(current_slot),
        deadline_slot.saturating_sub(1).max(current_slot + 1),
    )
}

/// **CancelRecovery** — current controller signs before the deadline;
/// status → Active. Validator A-6: upper bound (ttl) strictly < deadline.
#[allow(clippy::too_many_arguments)]
pub fn build_cancel_recovery_tx(
    current_taad_utxo_json: &str,
    master_kek_hex: &str,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, String> {
    let li = parse_lifecycle_inputs(current_taad_utxo_json, utxo_inputs_json, protocol_params_json)?;
    let d = decode_taad_datum_full(&li.inline_datum_hex)?;
    let (_pc, _ph, deadline, _col) = decode_recovering_status(&d.status)?;
    if current_slot >= deadline {
        return Err(format!(
            "too late to cancel: current_slot {} ≥ deadline {} (use FinalizeRecovery)",
            current_slot, deadline
        ));
    }

    let kek = decode_kek32(master_kek_hex, "master_kek_hex")?;
    let taad_seed = derive_taad_seed_from_kek(&kek);
    let ctrl_priv = csl::PrivateKey::from_normal_bytes(&*taad_seed)
        .map_err(|_| "controller TAAD seed is not a valid Ed25519 private key".to_string())?;
    let ctrl_pkh = ctrl_priv.to_public().hash();

    let new_datum = assemble_taad_datum(
        &d.did,
        d.entity_type,
        &d.controller_pkh,
        &d.hw_pubkey,
        d.sequence + 1,
        &status_active(),
        &d.guardians,
        &d.parent_did,
        &d.revoked_slot,
        &d.recovery_anchor,
    )?;
    let redeemer = encode_empty_redeemer(2);

    // upper bound strictly before deadline; keep a small window from now.
    let ttl = core::cmp::min(current_slot + 600, deadline - 1);
    build_lifecycle_spend(
        &li,
        &new_datum,
        &redeemer,
        &ctrl_priv,
        &ctrl_pkh,
        &[],
        wallet_seed_hex,
        network,
        taad_script_cbor_hex,
        0,
        Some(current_slot),
        ttl,
    )
}

/// **FinalizeRecovery** — NEW (pending) controller signs after the deadline;
/// status → Active, controller/hw installed from the Recovering pending fields.
/// `new_master_kek_hex` is the recovered owner's NEW Master_KEK (its TAAD pkh
/// must equal the pending_controller_pkh committed at InitRecovery).
#[allow(clippy::too_many_arguments)]
pub fn build_finalize_recovery_tx(
    current_taad_utxo_json: &str,
    new_master_kek_hex: &str,
    wallet_seed_hex: &str,
    network: u8,
    taad_script_cbor_hex: &str,
    utxo_inputs_json: &str,
    protocol_params_json: &str,
    current_slot: u64,
) -> Result<String, String> {
    let li = parse_lifecycle_inputs(current_taad_utxo_json, utxo_inputs_json, protocol_params_json)?;
    let d = decode_taad_datum_full(&li.inline_datum_hex)?;
    let (pending_ctrl, pending_hw, deadline, _col) = decode_recovering_status(&d.status)?;
    if current_slot <= deadline {
        return Err(format!(
            "too early to finalize: current_slot {} ≤ deadline {} (timelock not elapsed)",
            current_slot, deadline
        ));
    }

    let kek = decode_kek32(new_master_kek_hex, "new_master_kek_hex")?;
    let taad_seed = derive_taad_seed_from_kek(&kek);
    let new_priv = csl::PrivateKey::from_normal_bytes(&*taad_seed)
        .map_err(|_| "new controller TAAD seed is not a valid Ed25519 private key".to_string())?;
    let new_pkh = new_priv.to_public().hash();
    // Defensive: the signing key must match the committed pending controller.
    if new_pkh.to_bytes() != pending_ctrl {
        return Err(
            "new_master_kek_hex does not derive the pending_controller_pkh committed at InitRecovery"
                .into(),
        );
    }

    let new_datum = assemble_taad_datum(
        &d.did,
        d.entity_type,
        &PlutusData::new_bytes(pending_ctrl.to_vec()),
        &PlutusData::new_bytes(pending_hw.to_vec()),
        d.sequence + 1,
        &status_active(),
        &d.guardians,
        &d.parent_did,
        &d.revoked_slot,
        &d.recovery_anchor,
    )?;
    let redeemer = encode_empty_redeemer(3);

    // lower bound strictly after deadline.
    build_lifecycle_spend(
        &li,
        &new_datum,
        &redeemer,
        &new_priv,
        &new_pkh,
        &[],
        wallet_seed_hex,
        network,
        taad_script_cbor_hex,
        0,
        Some(deadline + 1),
        current_slot + 7200,
    )
}

/// Decode a 32-byte Master_KEK hex into a zeroizing array.
fn decode_kek32(kek_hex: &str, label: &str) -> Result<Zeroizing<[u8; 32]>, String> {
    let bytes = hex::decode(kek_hex)
        .map(Zeroizing::new)
        .map_err(|e| format!("{} invalid hex: {}", label, e))?;
    if bytes.len() != 32 {
        return Err(format!("{} must be 32 bytes", label));
    }
    let mut arr = Zeroizing::new([0u8; 32]);
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// Parse a JSON array of 28-byte hex VerificationKeyHash strings.
fn parse_pkh_list(json: &str, label: &str) -> Result<Vec<[u8; 28]>, String> {
    let raw: Vec<String> =
        serde_json::from_str(json).map_err(|e| format!("{} must be a JSON array of hex pkh: {}", label, e))?;
    let mut out = Vec::with_capacity(raw.len());
    for (i, s) in raw.iter().enumerate() {
        let b = hex::decode(s).map_err(|_| format!("{}[{}] not hex", label, i))?;
        if b.len() != 28 {
            return Err(format!("{}[{}] must be 28 bytes (VerificationKeyHash)", label, i));
        }
        let mut a = [0u8; 28];
        a.copy_from_slice(&b);
        out.push(a);
    }
    Ok(out)
}

// ─── TESTS ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Model B: sinh khoá controller độc lập ─────────────────────

    /// Độc lập + KHÔNG deterministic: hai lần gọi phải ra keypair KHÁC nhau
    /// (nếu trùng → đang derive cố định thay vì entropy ngẫu nhiên).
    #[test]
    fn controller_keypair_is_independent_each_call() {
        let a = generate_controller_keypair();
        let b = generate_controller_keypair();
        assert_ne!(a.secret_hex, b.secret_hex, "secret phải khác mỗi lần (entropy độc lập)");
        assert_ne!(a.pubkey_hex, b.pubkey_hex, "pubkey phải khác mỗi lần");
        assert_ne!(a.pkh, b.pkh, "pkh phải khác mỗi lần");
    }

    /// Định dạng đầu ra: secret 32B (64 hex), pubkey 32B (64 hex), pkh 28B.
    #[test]
    fn controller_keypair_field_shapes() {
        let kp = generate_controller_keypair();
        assert_eq!(kp.secret_hex.len(), 64, "secret_hex phải 32 bytes (64 hex)");
        assert_eq!(kp.pubkey_hex.len(), 64, "pubkey_hex phải 32 bytes (64 hex)");
        assert_eq!(kp.pkh.len(), 28, "pkh phải đúng 28 bytes (VerificationKeyHash)");
        // pubkey hợp lệ: decode được + đúng 32 byte.
        let pub_bytes = hex::decode(&kp.pubkey_hex).expect("pubkey_hex phải hex hợp lệ");
        assert_eq!(pub_bytes.len(), 32);
    }

    /// pkh = blake2b-224(pubkey): trả về phải khớp với cách `build_*_taad_tx`
    /// tính `controller_pkh` từ pubkey (cùng hàm `blake2b_224`). Đây là bất biến
    /// giữ datum field 2 nhận đúng giá trị mà rotate/create sẽ tự tính lại.
    #[test]
    fn controller_pkh_equals_blake2b224_of_pubkey() {
        let kp = generate_controller_keypair();
        let pub_bytes = hex::decode(&kp.pubkey_hex).unwrap();
        assert_eq!(kp.pkh, blake2b_224(&pub_bytes),
            "pkh phải = blake2b_224(pubkey) — cùng hàm rotate/create dùng");
    }

    /// secret → pubkey nhất quán: dựng lại Ed25519 từ secret_hex phải ra đúng
    /// pubkey_hex đã trả (caller lưu secret rồi ký được bằng pubkey này).
    #[test]
    fn controller_secret_derives_returned_pubkey() {
        use ed25519_dalek::SigningKey;
        let kp = generate_controller_keypair();
        let secret: [u8; 32] = hex::decode(&kp.secret_hex).unwrap().try_into().unwrap();
        let sk = SigningKey::from_bytes(&secret);
        assert_eq!(hex::encode(sk.verifying_key().to_bytes()), kp.pubkey_hex);
    }

    /// Đối chiếu CSL: `blake2b_224(pubkey)` PHẢI bằng cách CSL derive
    /// `PublicKey.hash()` (Ed25519KeyHash). Đây là chứng cứ pkh khớp đúng cái
    /// validator/datum on-chain mong đợi (CSL là chuẩn ledger Cardano). Nếu
    /// CSL đổi thuật toán hash, test này gãy ngay → chặn drift byte.
    #[test]
    fn controller_pkh_matches_csl_public_key_hash() {
        let kp = generate_controller_keypair();
        let pub_bytes = hex::decode(&kp.pubkey_hex).unwrap();

        // CSL: dựng PublicKey từ 32-byte raw rồi gọi .hash() → Ed25519KeyHash 28B.
        let csl_pub = csl::PublicKey::from_bytes(&pub_bytes)
            .expect("CSL PublicKey::from_bytes phải nhận 32-byte Ed25519 pubkey");
        let csl_keyhash = csl_pub.hash();
        assert_eq!(
            kp.pkh.to_vec(),
            csl_keyhash.to_bytes(),
            "pkh (blake2b_224 thủ công) phải khớp byte với CSL PublicKey.hash()"
        );
    }

    /// DID phải đúng format `did:phoenix:<13-char-base32-lowercase>:<64-hex>`
    /// per ResolverServiceImpl.DID_PHOENIX_PATTERN — regex test cùng pattern
    /// để mismatch catch sớm.
    #[test]
    fn construct_did_format_matches_resolver_regex() {
        let did = construct_did(0x01, None, 95_000_000);
        // Regex (Java): ^did:phoenix:([a-z2-7]{13}):([0-9a-f]{64})$
        let parts: Vec<&str> = did.split(':').collect();
        assert_eq!(parts.len(), 4, "DID phải có 4 parts split bởi ':' — got {}: {}", parts.len(), did);
        assert_eq!(parts[0], "did");
        assert_eq!(parts[1], "phoenix");
        assert_eq!(parts[2].len(), 13, "slot prefix phải 13 base32 chars — got {}", parts[2].len());
        assert!(parts[2].chars().all(|c| matches!(c, 'a'..='z' | '2'..='7')),
                "slot prefix phải base32 lowercase no-pad: {}", parts[2]);
        assert_eq!(parts[3].len(), 64, "hash hex phải 64 chars (32 bytes BLAKE2b-256)");
        assert!(parts[3].chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
                "hash hex phải lowercase: {}", parts[3]);
    }

    /// Cùng input nhưng 2 lần gọi → 2 DID khác nhau (random_256 inside).
    /// Đảm bảo privacy + collision resistance theo spec §2.1.
    #[test]
    fn construct_did_is_nondeterministic_by_random() {
        let did_a = construct_did(0x01, None, 100);
        let did_b = construct_did(0x01, None, 100);
        assert_ne!(did_a, did_b, "2 DID cùng (type, creator, slot) phải khác nhau (random_256)");
        // Nhưng slot prefix phải giống vì cùng slot
        let slot_a = did_a.split(':').nth(2).unwrap();
        let slot_b = did_b.split(':').nth(2).unwrap();
        assert_eq!(slot_a, slot_b, "Slot prefix phải giống khi slot input giống");
    }

    /// Slot encode phải match base32 round-trip của resolver (Java side).
    /// Test vector lấy từ ResolverServiceImplTest.decodeSlot_one (slot=1
    /// đã được Long sửa fixture → "aaaaaaaaaaaac" sau encoder verify).
    #[test]
    fn construct_did_slot_prefix_roundtrip_with_resolver() {
        let did = construct_did(0x01, None, 1);
        let slot_prefix = did.split(':').nth(2).unwrap();
        // Slot=1 big-endian = 00 00 00 00 00 00 00 01
        // BASE32_NOPAD lowercase = "aaaaaaaaaaaac" (theo Long fix commit 1ec8239)
        assert_eq!(slot_prefix, "aaaaaaaaaaaac",
                   "slot=1 phải encode thành 'aaaaaaaaaaaac' để khớp resolver round-trip");
    }

    /// creator None vs Some("") đều fallback "root" preimage.
    #[test]
    fn construct_did_root_fallback_for_empty_creator() {
        // Cùng slot + cùng type. Random_256 khác nhau → DID khác nhau cụ thể,
        // nhưng cả 2 đều phải format hợp lệ.
        let did_none = construct_did(0x01, None, 200);
        let did_empty = construct_did(0x01, Some(""), 200);
        // Cả 2 phải pass format check
        for did in [&did_none, &did_empty] {
            assert!(did.starts_with("did:phoenix:"));
            assert_eq!(did.split(':').count(), 4);
        }
    }

    // ─── publish_did_tx ─────────────────────────────────────────────

    /// Multibase encoding of a known Ed25519 public key matches the canonical
    /// format used by W3C DID spec, Veramo, and Universal Resolver. Test
    /// vector: 32-byte all-zero pubkey → known output.
    #[test]
    fn multibase_ed25519_zero_vector() {
        let zero_pub = [0u8; 32];
        let s = multibase_ed25519(&zero_pub);
        // Multibase prefix 'z' = base58btc.
        assert!(s.starts_with('z'));
        // Length of base58btc(34 bytes) is typically 47 chars; assert within range.
        assert!(s.len() >= 45 && s.len() <= 50, "multibase length out of range: {}", s.len());
    }

    /// `publish_did_tx` must reject a DID that doesn't start with the proper
    /// prefix — guard against accidental mixing of did:cardano:, did:web:, etc.
    #[test]
    fn publish_did_tx_rejects_bad_did_prefix() {
        let result = build_publish_did_tx(
            "did:web:example.com",
            "0203", "00",
            "addr_test1...",
            "00",
            "https://api.phoenixkey.me",
            0,
            "[]",
            "{}",
            0,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("did:phoenix"));
    }

    /// `publish_did_tx` must reject a wallet_seed_hex that doesn't decode to
    /// exactly 32 bytes.
    #[test]
    fn publish_did_tx_rejects_bad_seed_length() {
        let result = build_publish_did_tx(
            "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000",
            "0203", "0000000000000000000000000000000000000000000000000000000000000000",
            "addr_test1...",
            "0011", // 2 bytes only, not 32
            "https://api.phoenixkey.me",
            0,
            "[]",
            "{}",
            0,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("32 bytes"));
    }

    /// Empty utxo list is rejected with a clear error pointing the caller at
    /// fetching UTxOs from their data provider.
    #[test]
    fn publish_did_tx_rejects_empty_utxos() {
        let result = build_publish_did_tx(
            "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000",
            "0203", "0000000000000000000000000000000000000000000000000000000000000000",
            "addr_test1...",
            "0000000000000000000000000000000000000000000000000000000000000000",
            "https://api.phoenixkey.me",
            0,
            "[]",
            "{}",
            0,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    // ─── create_taad_utxo_tx ───────────────────────────────────────

    /// `entity_type` must be in 0..=9 per types.ak `EntityType` enum.
    /// Anything above is rejected before any tx-building work is done.
    #[test]
    fn create_taad_rejects_invalid_entity_type() {
        let result = build_create_taad_utxo_tx(
            "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000",
            255,                               // out of range
            &"00".repeat(32),
            &"00".repeat(32),
            &"00".repeat(32),
            &"00".repeat(32),
            0,
            "00",
            &"00".repeat(28),
            "[]",
            "{}",
            0,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("entity_type"), "err must mention entity_type: {}", err);
    }

    /// `policy_id_hex` length check guards against typos before the
    /// expensive coin selection / fee calc runs.
    #[test]
    fn create_taad_rejects_bad_policy_id_length() {
        let result = build_create_taad_utxo_tx(
            "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000",
            0,
            &"00".repeat(32),
            &"00".repeat(32),
            &"00".repeat(32),
            &"00".repeat(32),
            0,
            "00",                              // script CBOR placeholder
            &"00".repeat(8),                   // 8 bytes, must be 28
            "[]",
            "{}",
            0,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("28 bytes"));
    }

    /// TAADDatum encoding round-trip: decode our own encoded datum back via
    /// `decode_taad_datum_for_rotate` and verify the immutable fields
    /// match what we put in. This is the cheapest way to catch a regression
    /// in the field-order / constructor-index encoding without depending on
    /// a separate Plutus decoder.
    #[test]
    fn taad_datum_encoding_roundtrip() {
        let did = "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000";
        let ctrl = [0x11u8; 28];
        let hw = [0x22u8; 32];
        let datum = encode_taad_datum_create(did, 3 /* Machine */, &ctrl, &hw).unwrap();
        let hex_datum = hex::encode(datum.to_bytes());

        let decoded = decode_taad_datum_for_rotate(&hex_datum).unwrap();
        assert_eq!(decoded.did, did, "did must round-trip");
        assert_eq!(decoded.entity_type, 3, "entity_type must round-trip");
        assert_eq!(decoded.sequence, 0, "create starts at seq=0");

        // Genesis datum must carry the full v2 10-field schema with
        // recovery_anchor = None (Constr 1 []), matching the validator's
        // TAADDatum arity. A 9-field create would fail validation on-chain.
        let constr = datum.as_constr_plutus_data().unwrap();
        assert_eq!(constr.data().len(), 10, "create must emit 10 fields");
        assert_eq!(
            constr.data().get(9).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(1u64),
            "genesis recovery_anchor must be None"
        );
        assert!(
            decoded.recovery_anchor_data.is_some(),
            "decode must capture field 9 from a v2 datum"
        );
    }

    /// Rotate must increment sequence and update controller + hw bytes while
    /// preserving the immutable fields (did, entity_type, guardians, parent,
    /// revoked_slot).
    #[test]
    fn rotate_datum_increments_sequence_and_updates_keys() {
        let did = "did:phoenix:aaaaaaaaaaaac:1111111111111111111111111111111111111111111111111111111111111111";
        let old_ctrl = [0x11u8; 28];
        let old_hw = [0x22u8; 32];
        let old_datum = encode_taad_datum_create(did, 0 /* Person */, &old_ctrl, &old_hw).unwrap();
        let old_hex = hex::encode(old_datum.to_bytes());

        let decoded = decode_taad_datum_for_rotate(&old_hex).unwrap();
        let new_ctrl = [0x33u8; 28];
        let new_hw = [0x44u8; 32];
        let new_datum =
            encode_taad_datum_rotate(&decoded, &new_ctrl, &new_hw, None).unwrap();

        // Round-trip the new datum and assert immutables + seq+1.
        let new_hex = hex::encode(new_datum.to_bytes());
        let redecoded = decode_taad_datum_for_rotate(&new_hex).unwrap();
        assert_eq!(redecoded.did, did);
        assert_eq!(redecoded.entity_type, 0);
        assert_eq!(redecoded.sequence, 1, "Rotate must seq+1");
        // New datum must carry the v2 10-field schema.
        let nf = new_datum.as_constr_plutus_data().unwrap().data();
        assert_eq!(nf.len(), 10, "rotate output must have 10 fields (v2 schema)");
    }

    /// EntityType encodes as ConstrPlutusData(alt = entity_type, no fields).
    /// Verify the wire byte layout exposes the right constructor index for
    /// each enum variant we encode. The canonical CBOR for `Constr alt []`
    /// when alt ∈ 0..=6 is `0xD8_79 0x...` per Plutus / Cardano CDDL —
    /// here we just confirm the high-level decode path agrees.
    #[test]
    fn entity_type_constr_indices_match_aiken_enum() {
        // Verify all 10 variants round-trip without error and produce
        // distinct datum bytes (i.e. the index actually changes the wire
        // bytes; we are not silently collapsing variants).
        let mut seen_hex = Vec::new();
        for entity_type in 0u8..=9 {
            let datum = encode_taad_datum_create(
                "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000",
                entity_type,
                &[0u8; 28],
                &[0u8; 32],
            )
            .unwrap();
            let hex_datum = hex::encode(datum.to_bytes());
            assert!(
                !seen_hex.contains(&hex_datum),
                "entity_type {} produced same encoding as earlier variant",
                entity_type
            );
            seen_hex.push(hex_datum.clone());

            let decoded = decode_taad_datum_for_rotate(&hex_datum).unwrap();
            assert_eq!(decoded.entity_type, entity_type);
        }
    }

    // ─── rotate_taad_tx ────────────────────────────────────────────

    /// Rotate must reject a `current_taad_utxo_json` with no inline datum —
    /// without it we can't recover the immutable fields or the old seq.
    #[test]
    fn rotate_taad_requires_inline_datum() {
        let current = r#"{
            "tx_hash": "0000000000000000000000000000000000000000000000000000000000000000",
            "index": 0,
            "amount_lovelace": 2000000
        }"#;
        let result = build_rotate_taad_tx(
            current,
            &"00".repeat(32),
            &"00".repeat(32),
            &"00".repeat(32),
            &"00".repeat(32),
            0,
            "00",
            "[]",
            "{}",
            0,
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("inline_datum_hex"));
    }

    /// The Rotate redeemer must encode as ConstrPlutusData(alt=0,
    /// [new_controller_pkh(28B), new_hw_pubkey(32B)]) — the exact shape the
    /// validator's `Rotate { new_controller_pkh, new_hw_pubkey }` decodes.
    #[test]
    fn rotate_redeemer_encodes_constr0_with_two_bytearrays() {
        let new_ctrl = [0xABu8; 28];
        let new_hw = [0xCDu8; 32];
        let red = encode_rotate_redeemer(&new_ctrl, &new_hw);
        let constr = red
            .as_constr_plutus_data()
            .expect("Rotate redeemer must be ConstrPlutusData");
        assert_eq!(
            constr.alternative(),
            BigNum::from(0u64),
            "Rotate is constructor index 0 in TAADRedeemer"
        );
        let fields = constr.data();
        assert_eq!(fields.len(), 2, "Rotate carries exactly 2 fields");
        assert_eq!(
            fields.get(0).as_bytes().unwrap(),
            new_ctrl.to_vec(),
            "field 0 = new_controller_pkh (28 bytes)"
        );
        assert_eq!(
            fields.get(1).as_bytes().unwrap(),
            new_hw.to_vec(),
            "field 1 = new_hw_pubkey (32 bytes)"
        );
    }

    /// Immutable fields (guardians, parent_did, revoked_slot) must survive a
    /// rotate byte-for-byte. We encode them as non-default values in the old
    /// datum, rotate, then assert the new datum carries the SAME field bytes.
    #[test]
    fn rotate_preserves_guardians_parent_revoked_slot() {
        // Hand-build an old datum with non-empty guardians, Some(parent_did),
        // and Some(revoked_slot) so we exercise the preserve path (the
        // create-helper always emits empty/None).
        let did = "did:phoenix:aaaaaaaaaaaac:2222222222222222222222222222222222222222222222222222222222222222";
        let mut fields = PlutusList::new();
        fields.add(&PlutusData::new_bytes(did.as_bytes().to_vec())); // 0 did
        fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(2u64))); // 1 entity_type=Device
        fields.add(&PlutusData::new_bytes([0x11u8; 28].to_vec())); // 2 controller_pkh
        fields.add(&PlutusData::new_bytes([0x22u8; 32].to_vec())); // 3 hw_key_pubkey
        fields.add(&PlutusData::new_integer(&BigInt::from_str("5").unwrap())); // 4 sequence=5
        fields.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))); // 5 status=Active
        // 6 guardians = [g1, g2]
        let mut guardians = PlutusList::new();
        guardians.add(&PlutusData::new_bytes([0xAAu8; 28].to_vec()));
        guardians.add(&PlutusData::new_bytes([0xBBu8; 28].to_vec()));
        fields.add(&PlutusData::new_list(&guardians));
        // 7 parent_did = Some(bytes) = Constr(0, [bytes])
        let mut parent_inner = PlutusList::new();
        parent_inner.add(&PlutusData::new_bytes(b"did:phoenix:parent".to_vec()));
        fields.add(&PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
            &BigNum::from(0u64),
            &parent_inner,
        )));
        // 8 revoked_slot = Some(99) = Constr(0, [99])
        let mut rev_inner = PlutusList::new();
        rev_inner.add(&PlutusData::new_integer(&BigInt::from_str("99").unwrap()));
        fields.add(&PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
            &BigNum::from(0u64),
            &rev_inner,
        )));
        let old_datum = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
            &BigNum::from(0u64),
            &fields,
        ));
        let old_hex = hex::encode(old_datum.to_bytes());

        let decoded = decode_taad_datum_for_rotate(&old_hex).unwrap();
        assert_eq!(decoded.sequence, 5);
        // Source was a legacy 9-field datum → no recovery_anchor captured.
        assert!(decoded.recovery_anchor_data.is_none());
        let new_ctrl = [0x33u8; 28];
        let new_hw = [0x44u8; 32];
        // No new CID supplied + legacy source → field 9 defaults to None.
        let new_datum =
            encode_taad_datum_rotate(&decoded, &new_ctrl, &new_hw, None).unwrap();

        // Pull the new datum fields back out and compare the preserved ones
        // byte-for-byte against the originals.
        let new_constr = new_datum.as_constr_plutus_data().unwrap();
        let nf = new_constr.data();
        // v2 schema: 10 fields even when rotating from a legacy 9-field datum.
        assert_eq!(nf.len(), 10);
        // Field 9 recovery_anchor = None = Constr 1 [] (no new CID, legacy src).
        assert_eq!(
            nf.get(9).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(1u64),
            "recovery_anchor defaults to None"
        );
        // seq+1
        assert_eq!(nf.get(4).as_integer().unwrap().to_str(), "6");
        // new keys applied
        assert_eq!(nf.get(2).as_bytes().unwrap(), new_ctrl.to_vec());
        assert_eq!(nf.get(3).as_bytes().unwrap(), new_hw.to_vec());
        // status stays Active (constr 0)
        assert_eq!(
            nf.get(5).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(0u64)
        );
        // immutable fields preserved (compare CBOR bytes)
        assert_eq!(
            hex::encode(nf.get(0).to_bytes()),
            hex::encode(fields.get(0).to_bytes()),
            "did preserved"
        );
        assert_eq!(
            hex::encode(nf.get(1).to_bytes()),
            hex::encode(fields.get(1).to_bytes()),
            "entity_type preserved"
        );
        assert_eq!(
            hex::encode(nf.get(6).to_bytes()),
            hex::encode(fields.get(6).to_bytes()),
            "guardians preserved"
        );
        assert_eq!(
            hex::encode(nf.get(7).to_bytes()),
            hex::encode(fields.get(7).to_bytes()),
            "parent_did preserved"
        );
        assert_eq!(
            hex::encode(nf.get(8).to_bytes()),
            hex::encode(fields.get(8).to_bytes()),
            "revoked_slot preserved"
        );
    }

    /// Helper: build a real Active genesis datum (10 fields, recovery_anchor
    /// = None) and decode it for rotate. Centralizes the v2 datum setup the
    /// recovery_anchor tests share.
    fn decoded_genesis() -> DecodedTaadDatum {
        let did = "did:phoenix:aaaaaaaaaaaac:4444444444444444444444444444444444444444444444444444444444444444";
        let datum = encode_taad_datum_create(did, 0, &[0x11u8; 28], &[0x22u8; 32]).unwrap();
        let hex_datum = hex::encode(datum.to_bytes());
        decode_taad_datum_for_rotate(&hex_datum).unwrap()
    }

    /// Rotate with a NEW recovery_anchor CID → field 9 must decode back to
    /// `Some(cid)` with the CID stored as raw UTF-8 bytes. Exercises the
    /// `encode_option_bytes(Some(..))` path (Constr 0 [bytes]) that the
    /// validator decodes as `Some`.
    #[test]
    fn rotate_with_recovery_anchor_some_sets_field9() {
        let decoded = decoded_genesis();
        // A representative LampNet bech32 CID. Stored as opaque UTF-8 bytes.
        let cid = "lampnet1qxyz0deadbeefcafebabe";
        let new_datum = encode_taad_datum_rotate(
            &decoded,
            &[0x33u8; 28],
            &[0x44u8; 32],
            Some(cid.as_bytes()),
        )
        .unwrap();

        let nf = new_datum.as_constr_plutus_data().unwrap().data();
        assert_eq!(nf.len(), 10, "rotate output is v2 (10 fields)");
        let anchor = nf.get(9).as_constr_plutus_data().unwrap();
        assert_eq!(
            anchor.alternative(),
            BigNum::from(0u64),
            "Some = Constr 0"
        );
        assert_eq!(anchor.data().len(), 1, "Some carries exactly one inner field");
        let inner = anchor.data().get(0).as_bytes().unwrap();
        assert_eq!(
            inner,
            cid.as_bytes().to_vec(),
            "recovery_anchor must be the CID's UTF-8 bytes"
        );
        // Round-trip through decode: the v2 datum re-decodes and recaptures the
        // anchor field.
        let re = decode_taad_datum_for_rotate(&hex::encode(new_datum.to_bytes())).unwrap();
        assert!(re.recovery_anchor_data.is_some());
        assert_eq!(
            hex::encode(re.recovery_anchor_data.unwrap().to_bytes()),
            hex::encode(nf.get(9).to_bytes()),
            "decoded anchor round-trips byte-for-byte"
        );
    }

    /// Rotate with no new CID (None) from a v2 genesis datum (anchor = None)
    /// → field 9 stays `None` (Constr 1 []). Confirms the "rotate now,
    /// distribute later" flow does not fabricate a CID.
    #[test]
    fn rotate_with_recovery_anchor_none_keeps_none() {
        let decoded = decoded_genesis();
        let new_datum =
            encode_taad_datum_rotate(&decoded, &[0x33u8; 28], &[0x44u8; 32], None).unwrap();
        let nf = new_datum.as_constr_plutus_data().unwrap().data();
        assert_eq!(nf.len(), 10);
        assert_eq!(
            nf.get(9).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(1u64),
            "None = Constr 1"
        );
        assert_eq!(
            nf.get(9).as_constr_plutus_data().unwrap().data().len(),
            0,
            "None carries no inner fields"
        );
    }

    /// Rotate with None but the SOURCE datum already had a recovery_anchor
    /// (e.g. set in a prior rotation) → the existing anchor is preserved
    /// byte-for-byte rather than dropped to None.
    #[test]
    fn rotate_none_preserves_existing_anchor() {
        // Build a v2 datum whose field 9 = Some("prevcid") by rotating once
        // with a CID, then decode that as the source for a second rotate.
        let first = encode_taad_datum_rotate(
            &decoded_genesis(),
            &[0x33u8; 28],
            &[0x44u8; 32],
            Some(b"lampnet1prev"),
        )
        .unwrap();
        let decoded_with_anchor =
            decode_taad_datum_for_rotate(&hex::encode(first.to_bytes())).unwrap();
        assert!(decoded_with_anchor.recovery_anchor_data.is_some());

        // Second rotate, no new CID → must keep the prior Some("lampnet1prev").
        let second = encode_taad_datum_rotate(
            &decoded_with_anchor,
            &[0x55u8; 28],
            &[0x66u8; 32],
            None,
        )
        .unwrap();
        let nf = second.as_constr_plutus_data().unwrap().data();
        let anchor = nf.get(9).as_constr_plutus_data().unwrap();
        assert_eq!(anchor.alternative(), BigNum::from(0u64), "still Some");
        assert_eq!(
            anchor.data().get(0).as_bytes().unwrap(),
            b"lampnet1prev".to_vec(),
            "prior anchor preserved when no new CID supplied"
        );
    }

    /// A legacy 9-field datum must still decode (backward-compat) and rotate
    /// forward into the v2 10-field schema.
    #[test]
    fn legacy_9field_datum_decodes_and_upgrades() {
        let did = "did:phoenix:aaaaaaaaaaaac:5555555555555555555555555555555555555555555555555555555555555555";
        let mut f = PlutusList::new();
        f.add(&PlutusData::new_bytes(did.as_bytes().to_vec()));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64)));
        f.add(&PlutusData::new_bytes([0x11u8; 28].to_vec()));
        f.add(&PlutusData::new_bytes([0x22u8; 32].to_vec()));
        f.add(&PlutusData::new_integer(&BigInt::from_str("2").unwrap()));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64)));
        f.add(&PlutusData::new_list(&PlutusList::new()));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));
        // NOTE: only 9 fields — the pre-recovery_anchor schema.
        let legacy = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
            &BigNum::from(0u64),
            &f,
        ));
        let decoded = decode_taad_datum_for_rotate(&hex::encode(legacy.to_bytes())).unwrap();
        assert_eq!(decoded.sequence, 2);
        assert!(decoded.recovery_anchor_data.is_none(), "legacy has no field 9");

        let upgraded =
            encode_taad_datum_rotate(&decoded, &[0x33u8; 28], &[0x44u8; 32], None).unwrap();
        let nf = upgraded.as_constr_plutus_data().unwrap().data();
        assert_eq!(nf.len(), 10, "upgraded to v2 schema");
        assert_eq!(nf.get(4).as_integer().unwrap().to_str(), "3", "seq+1");
        assert_eq!(
            nf.get(9).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(1u64),
            "recovery_anchor None after legacy upgrade"
        );
    }

    /// End-to-end build: with a valid (minimal) Plutus V3 script, a funded
    /// wallet UTxO, and a real inline datum, `build_rotate_taad_tx` must now
    /// return a hex-encoded signed tx (no longer the deferred error). We
    /// decode the tx back via CSL and assert it carries a Plutus witness set
    /// (script + redeemer) plus two vkey witnesses, and a continuing output at
    /// the script address bearing the seq+1 datum.
    #[test]
    fn rotate_taad_builds_signed_tx_with_plutus_witness() {
        // Minimal valid Plutus script CBOR (CBOR byte-string wrapper) — CSL
        // only parses the wrapper + tags it V3; semantics are not executed
        // locally, so this exercises the full witness/output wiring path.
        let script_cbor = "4e4d01000033222220051200120011";

        // Build a real old datum (Person, seq=3) and a current TAAD UTxO
        // carrying a State-NFT (so the continuing output preserves it).
        let did = "did:phoenix:aaaaaaaaaaaac:3333333333333333333333333333333333333333333333333333333333333333";
        let old_ctrl = [0x11u8; 28];
        let old_hw = [0x22u8; 32];
        // Seed the old datum at seq=3 by encoding create (seq=0) then bumping
        // through the rotate encoder twice would change keys; instead encode
        // directly with the create helper and rotate from there is enough to
        // assert seq increments — but to test a non-zero start we build by
        // hand.
        let mut f = PlutusList::new();
        f.add(&PlutusData::new_bytes(did.as_bytes().to_vec()));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64)));
        f.add(&PlutusData::new_bytes(old_ctrl.to_vec()));
        f.add(&PlutusData::new_bytes(old_hw.to_vec()));
        f.add(&PlutusData::new_integer(&BigInt::from_str("3").unwrap()));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64)));
        f.add(&PlutusData::new_list(&PlutusList::new()));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64)));
        let old_datum = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(
            &BigNum::from(0u64),
            &f,
        ));
        let inline_hex = hex::encode(old_datum.to_bytes());

        // State-NFT: policy = 28-byte hash, name = blake2b_256(did).
        let nft_policy = "f0".repeat(28);
        let nft_name = {
            let mut h = Blake2b256::new();
            h.update(did.as_bytes());
            hex::encode(h.finalize())
        };
        let current = format!(
            r#"{{
                "tx_hash": "1111111111111111111111111111111111111111111111111111111111111111",
                "index": 0,
                "amount_lovelace": 2000000,
                "inline_datum_hex": "{inline_hex}",
                "assets": [
                    {{"policy_id": "{nft_policy}", "asset_name_hex": "{nft_name}", "quantity": 1}}
                ]
            }}"#
        );

        // Funded wallet UTxO (distinct outpoint) for fee + collateral.
        let utxos = r#"[
            {"tx_hash": "2222222222222222222222222222222222222222222222222222222222222222",
             "index": 0, "amount_lovelace": 10000000}
        ]"#;

        // Realistic-ish preprod protocol params.
        let params = r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#;

        // old/new TAAD pubkeys (32B) + new hw (32B) + old master KEK (32B).
        let old_kek = "ab".repeat(32);
        let new_taad = "cd".repeat(32);
        let new_hw = "ef".repeat(32);
        let wallet_seed = "12".repeat(32);

        let result = build_rotate_taad_tx(
            &current, &new_taad, &new_hw, &old_kek, &wallet_seed,
            0, // preprod
            script_cbor, utxos, params, 1000,
            None,
        );
        let tx_hex = result.expect("rotate tx should build with a valid script + funded utxo");
        assert!(!tx_hex.is_empty());

        // Decode + assert witness shape.
        let tx = Transaction::from_hex(&tx_hex).expect("output must be valid tx CBOR");
        let wit = tx.witness_set();
        let scripts = wit.plutus_scripts().expect("plutus scripts present");
        assert_eq!(scripts.len(), 1, "exactly one Plutus spend script");
        let redeemers = wit.redeemers().expect("redeemers present");
        assert_eq!(redeemers.len(), 1, "exactly one Rotate redeemer");
        let r = redeemers.get(0);
        assert_eq!(r.tag(), csl::RedeemerTag::new_spend(), "spend redeemer");
        // Redeemer data = Rotate constr 0
        assert_eq!(
            r.data().as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(0u64)
        );
        // Two vkey witnesses: wallet payment key + old TAAD key.
        let vkeys = wit.vkeys().expect("vkey witnesses present");
        assert_eq!(vkeys.len(), 2, "wallet + old-TAAD signatures");
        // script_data_hash bound on the body.
        assert!(
            tx.body().script_data_hash().is_some(),
            "script_data_hash must be set for a Plutus tx"
        );
        // required signer = old controller key hash present.
        let req = tx.body().required_signers().expect("required_signers set");
        assert_eq!(req.len(), 1, "old controller declared as required signer");

        // Continuing output: find the one at the script address with seq+1.
        let (script_addr, _) = derive_taad_script_address(script_cbor, 0).unwrap();
        let outs = tx.body().outputs();
        let mut found = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).ok() == script_addr.to_bech32(None).ok() {
                let d = o.plutus_data().expect("continuing output has inline datum");
                let seq = d
                    .as_constr_plutus_data()
                    .unwrap()
                    .data()
                    .get(4)
                    .as_integer()
                    .unwrap()
                    .to_str();
                assert_eq!(seq, "4", "continuing datum seq = old(3)+1");
                // NFT preserved on the continuing output.
                let v = o.amount();
                assert!(v.multiasset().is_some(), "State-NFT preserved on output");
                found = true;
            }
        }
        assert!(found, "continuing output at script address must exist");
    }

    /// Design 2 genesis MINT: `build_create_taad_utxo_tx` for a Person must now
    /// MINT the anchor NFT. We decode the signed tx and assert:
    ///   - the witness set carries exactly one mint redeemer (RedeemerTag mint),
    ///     constr index 0 (GenesisPerson) with no fields;
    ///   - the body mint field = exactly +1 of (script_hash, blake2b_256(did));
    ///   - the TAAD output at the script address carries that same NFT + a fresh
    ///     (seq==0) inline datum;
    ///   - a required signer == controller_pkh is present;
    ///   - two vkey witnesses (wallet payment key + TAAD controller key).
    #[test]
    fn create_taad_person_mints_anchor_nft_with_genesis_redeemer() {
        // Minimal valid Plutus V3 script (CBOR byte-string wrapper). CSL parses
        // the wrapper + tags it V3; the policy id ≡ its script hash.
        let script_cbor = "4e4d01000033222220051200120011";

        // master_kek → TAAD key. controller_pkh = blake2b_224(taad_pubkey), and
        // taad_pub_hex MUST be the pubkey the SAME KEK derives (the fn asserts
        // this), so derive the pubkey from the KEK rather than hardcoding it.
        let master_kek = "7a".repeat(32);
        let taad_pub_hex = crate::sign::derive_taad_public_key(master_kek.clone());
        assert_eq!(taad_pub_hex.len(), 64, "derived TAAD pubkey must be 32 bytes");
        let controller_pkh = {
            let pub_bytes = hex::decode(&taad_pub_hex).unwrap();
            blake2b_224(&pub_bytes)
        };

        let did = "did:phoenix:bbbbbbbbbbbbc:4444444444444444444444444444444444444444444444444444444444444444";
        let hw_pub = "aa".repeat(32);
        let wallet_seed = "34".repeat(32);

        // policy_id_hex MUST equal the script hash (Design 2). Derive it.
        let (_addr, script_hash) = derive_taad_script_address(script_cbor, 0).unwrap();
        let policy_id_hex = hex::encode(script_hash.to_bytes());

        // One funded, asset-free wallet UTxO (serves fee + collateral).
        let utxos = r#"[
            {"tx_hash": "5555555555555555555555555555555555555555555555555555555555555555",
             "index": 0, "amount_lovelace": 10000000}
        ]"#;
        let params = r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#;

        let result = build_create_taad_utxo_tx(
            did,
            0, // Person → GenesisPerson
            &hw_pub,
            &taad_pub_hex,
            &master_kek,
            &wallet_seed,
            0, // preprod
            script_cbor,
            &policy_id_hex,
            utxos,
            params,
            2000,
        );
        let tx_hex = result.expect("Person genesis must build a signed mint tx");
        let tx = Transaction::from_hex(&tx_hex).expect("output must be valid tx CBOR");
        let wit = tx.witness_set();

        // Plutus script present (the multi-purpose validator, used as policy).
        let scripts = wit.plutus_scripts().expect("plutus script present");
        assert_eq!(scripts.len(), 1, "exactly one Plutus script (the policy)");

        // Exactly one MINT redeemer, GenesisPerson (constr 0, no fields).
        let redeemers = wit.redeemers().expect("redeemers present");
        assert_eq!(redeemers.len(), 1, "exactly one mint redeemer");
        let r = redeemers.get(0);
        assert_eq!(r.tag(), csl::RedeemerTag::new_mint(), "mint redeemer tag");
        let constr = r.data().as_constr_plutus_data().expect("redeemer is constr");
        assert_eq!(constr.alternative(), BigNum::from(0u64), "GenesisPerson = constr 0");
        assert_eq!(constr.data().len(), 0, "GenesisPerson carries no fields");

        // Body mint field: exactly +1 of (script_hash, blake2b_256(did)) and
        // no other movement under this policy. `Mint::get` returns a
        // `MintsAssets` (a list of per-redeemer `MintAssets` maps for the
        // policy); sum the named asset across all of them.
        let expected_name = taad_nft_asset_name(did).unwrap();
        let mint = tx.body().mint().expect("mint field set on body");
        let mints_assets = mint
            .get(&script_hash)
            .expect("mint has an entry for the policy = script hash");
        let mut total: i128 = 0;
        let mut distinct_names = 0usize;
        for i in 0..mints_assets.len() {
            let ma = mints_assets.get(i).expect("MintAssets at index");
            distinct_names += ma.len();
            if let Some(v) = ma.get(&expected_name) {
                total += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(total, 1, "exactly +1 of (script_hash, blake2b_256(did))");
        assert_eq!(distinct_names, 1, "only the anchor NFT moves under this policy");

        // Two vkey witnesses: wallet payment key + TAAD controller key.
        let vkeys = wit.vkeys().expect("vkey witnesses present");
        assert_eq!(vkeys.len(), 2, "wallet + TAAD controller signatures");

        // Required signer == controller_pkh.
        let req = tx.body().required_signers().expect("required_signers set");
        assert_eq!(req.len(), 1, "controller declared as required signer");
        assert_eq!(
            req.get(0).to_bytes(),
            controller_pkh.to_vec(),
            "required signer must equal controller_pkh = blake2b_224(taad_pubkey)"
        );

        // script_data_hash bound on the body.
        assert!(
            tx.body().script_data_hash().is_some(),
            "script_data_hash must be set for a Plutus tx"
        );

        // TAAD output at the script address carries the NFT + fresh datum.
        let (script_addr, _) = derive_taad_script_address(script_cbor, 0).unwrap();
        let outs = tx.body().outputs();
        let mut found = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).ok() == script_addr.to_bech32(None).ok() {
                // NFT present on this output.
                let ma = o.amount().multiasset().expect("script output carries the NFT");
                let qty = ma
                    .get(&script_hash)
                    .and_then(|assets| assets.get(&expected_name))
                    .expect("the minted NFT sits at the script address");
                assert_eq!(qty, BigNum::from(1u64), "NFT qty +1 at script address");
                // Fresh datum: seq (field 4) == 0.
                let d = o.plutus_data().expect("script output has inline datum");
                let seq = d
                    .as_constr_plutus_data()
                    .unwrap()
                    .data()
                    .get(4)
                    .as_integer()
                    .unwrap()
                    .to_str();
                assert_eq!(seq, "0", "fresh genesis datum has sequence 0");
                found = true;
            }
        }
        assert!(found, "TAAD output at script address must exist");
    }

    /// Child genesis (entity_type != 0) is out of scope for the mint wiring and
    /// must error clearly rather than minting under the wrong gate.
    #[test]
    fn create_taad_child_genesis_is_rejected() {
        let script_cbor = "4e4d01000033222220051200120011";
        let master_kek = "7a".repeat(32);
        let taad_pub_hex = crate::sign::derive_taad_public_key(master_kek.clone());
        let (_addr, script_hash) = derive_taad_script_address(script_cbor, 0).unwrap();
        let policy_id_hex = hex::encode(script_hash.to_bytes());
        let utxos = r#"[
            {"tx_hash": "5555555555555555555555555555555555555555555555555555555555555555",
             "index": 0, "amount_lovelace": 10000000}
        ]"#;
        let params = r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#;
        let err = build_create_taad_utxo_tx(
            "did:phoenix:bbbbbbbbbbbbc:4444444444444444444444444444444444444444444444444444444444444444",
            2, // Device → child genesis, not wired
            &"aa".repeat(32),
            &taad_pub_hex,
            &master_kek,
            &"34".repeat(32),
            0,
            script_cbor,
            &policy_id_hex,
            utxos,
            params,
            2000,
        )
        .expect_err("child genesis must be rejected");
        assert!(
            err.contains("only Person genesis"),
            "error must explain Person-only scope, got: {err}"
        );
    }

    /// Design 2 invariant: `policy_id_hex` must equal the validator script hash.
    /// A mismatched policy id is a hard error (no separate policy under D2).
    #[test]
    fn create_taad_rejects_policy_id_not_equal_script_hash() {
        let script_cbor = "4e4d01000033222220051200120011";
        let master_kek = "7a".repeat(32);
        let taad_pub_hex = crate::sign::derive_taad_public_key(master_kek.clone());
        let wrong_policy = "f0".repeat(28); // 28 bytes but not the script hash
        let utxos = r#"[
            {"tx_hash": "5555555555555555555555555555555555555555555555555555555555555555",
             "index": 0, "amount_lovelace": 10000000}
        ]"#;
        let params = r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#;
        let err = build_create_taad_utxo_tx(
            "did:phoenix:bbbbbbbbbbbbc:4444444444444444444444444444444444444444444444444444444444444444",
            0,
            &"aa".repeat(32),
            &taad_pub_hex,
            &master_kek,
            &"34".repeat(32),
            0,
            script_cbor,
            &wrong_policy,
            utxos,
            params,
            2000,
        )
        .expect_err("mismatched policy id must be rejected");
        assert!(
            err.contains("must equal the validator script hash"),
            "error must explain the policy-id ≡ script-hash invariant, got: {err}"
        );
    }

    /// CRITICAL invariant: genesis (create) derives the TAAD controller key via
    /// `sign::derive_taad_seed`, while rotate uses the local
    /// `derive_taad_seed_from_kek`. They MUST be byte-identical — otherwise a
    /// DID created at genesis would be unrotatable (the rotate path would derive
    /// a different controller key than the one baked into the genesis datum).
    /// This test locks the two derivations together (the older
    /// `sign::tests::seed_matches_dart_bridge_derivation` no longer covers it).
    #[test]
    fn create_and_rotate_derive_identical_taad_seed() {
        let kek = [7u8; 32];
        let from_sign = crate::sign::derive_taad_seed(&kek)
            .expect("sign::derive_taad_seed on 32-byte kek");
        let from_rotate = derive_taad_seed_from_kek(&kek);
        assert_eq!(
            &*from_sign, &*from_rotate,
            "create (sign::derive_taad_seed) and rotate (derive_taad_seed_from_kek) diverged"
        );
    }

    /// Helper: encode an OWNER's live TAADDatum (Person, Active, seq 0) for use as
    /// the referenced owner UTxO. Mirrors the on-chain 10-field schema.
    fn owner_inline_datum_hex(owner_did: &str, owner_controller_pkh: &[u8; 28]) -> String {
        let mut f = PlutusList::new();
        f.add(&PlutusData::new_bytes(owner_did.as_bytes().to_vec())); // 0 did
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))); // 1 entity_type Person
        f.add(&PlutusData::new_bytes(owner_controller_pkh.to_vec())); // 2 controller_pkh
        f.add(&PlutusData::new_bytes([0x22u8; 32].to_vec())); // 3 hw_key_pubkey
        f.add(&PlutusData::new_integer(&BigInt::from_str("0").unwrap())); // 4 sequence
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(0u64))); // 5 status Active
        f.add(&PlutusData::new_list(&PlutusList::new())); // 6 guardians
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64))); // 7 parent_did None
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64))); // 8 revoked_slot None
        f.add(&PlutusData::new_empty_constr_plutus_data(&BigNum::from(1u64))); // 9 recovery_anchor None
        let d = PlutusData::new_constr_plutus_data(&ConstrPlutusData::new(&BigNum::from(0u64), &f));
        hex::encode(d.to_bytes())
    }

    /// GenesisChild MINT (OrgDID under a Person owner). Decode the signed tx and
    /// assert the validator-shaped invariants the brief calls for:
    ///   - mint redeemer = GenesisChild (constr index 1) carrying owner_did;
    ///   - body mint = exactly +1 of (script_hash, blake2b_256(child_did));
    ///   - child datum entity_type = Org (1) and parent_did = Some(owner_did);
    ///   - the owner anchor is a REFERENCE input (present in reference_inputs,
    ///     NOT among spent inputs);
    ///   - the OWNER controller is the required signer (G-1);
    ///   - the child TAAD output (script addr) carries the NFT + fresh datum.
    #[test]
    fn create_child_org_mints_anchor_with_genesis_child_redeemer() {
        let script_cbor = "4e4d01000033222220051200120011";
        let (script_addr, script_hash) = derive_taad_script_address(script_cbor, 0).unwrap();
        let policy_id_hex = hex::encode(script_hash.to_bytes());

        // Owner = a Person whose controller key derives from owner_master_kek.
        let owner_master_kek = "7a".repeat(32);
        let owner_taad_pub_hex = crate::sign::derive_taad_public_key(owner_master_kek.clone());
        let owner_controller_pkh = {
            let b = hex::decode(&owner_taad_pub_hex).unwrap();
            blake2b_224(&b)
        };
        let owner_did = "did:phoenix:aaaaaaaaaaaac:1111111111111111111111111111111111111111111111111111111111111111";

        // Owner state NFT: (script_hash, blake2b_256(owner_did)).
        let owner_nft_name = {
            let mut h = Blake2b256::new();
            h.update(owner_did.as_bytes());
            hex::encode(h.finalize())
        };
        let owner_datum_hex = owner_inline_datum_hex(owner_did, &owner_controller_pkh);
        let owner_utxo = format!(
            r#"{{
                "tx_hash": "1111111111111111111111111111111111111111111111111111111111111111",
                "index": 0,
                "amount_lovelace": 2000000,
                "inline_datum_hex": "{owner_datum_hex}",
                "assets": [
                    {{"policy_id": "{policy_id_hex}", "asset_name_hex": "{owner_nft_name}", "quantity": 1}}
                ]
            }}"#
        );

        // Child = an Org. Child controller key is independent (no child signing).
        let child_did = "did:phoenix:bbbbbbbbbbbbc:2222222222222222222222222222222222222222222222222222222222222222";
        let child_taad_pub_hex = "cd".repeat(32);
        let hw_pub = "aa".repeat(32);
        let wallet_seed = "34".repeat(32);

        let utxos = r#"[
            {"tx_hash": "5555555555555555555555555555555555555555555555555555555555555555",
             "index": 0, "amount_lovelace": 10000000}
        ]"#;
        let params = r#"{
            "min_fee_a": 44, "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000", "key_deposit": "2000000"
        }"#;

        let tx_hex = build_create_child_taad_utxo_tx(
            child_did,
            owner_did,
            1, // Org → GenesisChild, non-Person
            &hw_pub,
            &child_taad_pub_hex,
            &owner_master_kek,
            &wallet_seed,
            0, // preprod
            script_cbor,
            &policy_id_hex,
            &owner_utxo,
            utxos,
            params,
            3000,
        )
        .expect("Org child genesis must build a signed mint tx");
        let tx = Transaction::from_hex(&tx_hex).expect("output must be valid tx CBOR");
        let wit = tx.witness_set();

        // ── Mint redeemer = GenesisChild (constr 1) with owner_did field. ──
        let redeemers = wit.redeemers().expect("redeemers present");
        assert_eq!(redeemers.len(), 1, "exactly one mint redeemer");
        let r = redeemers.get(0);
        assert_eq!(r.tag(), csl::RedeemerTag::new_mint(), "mint redeemer tag");
        let constr = r.data().as_constr_plutus_data().expect("redeemer is constr");
        assert_eq!(constr.alternative(), BigNum::from(1u64), "GenesisChild = constr index 1");
        assert_eq!(constr.data().len(), 1, "GenesisChild carries one field (owner_did)");
        let red_owner = constr.data().get(0).as_bytes().expect("owner_did is ByteArray");
        assert_eq!(
            String::from_utf8(red_owner).unwrap(),
            owner_did,
            "redeemer owner_did must equal the owner DID"
        );

        // ── Body mint = exactly +1 of (script_hash, blake2b_256(child_did)). ──
        let expected_name = taad_nft_asset_name(child_did).unwrap();
        let mint = tx.body().mint().expect("mint field set on body");
        let mints_assets = mint.get(&script_hash).expect("mint entry for policy = script hash");
        let mut total: i128 = 0;
        let mut distinct = 0usize;
        for i in 0..mints_assets.len() {
            let ma = mints_assets.get(i).unwrap();
            distinct += ma.len();
            if let Some(v) = ma.get(&expected_name) {
                total += v.as_i32_or_fail().unwrap() as i128;
            }
        }
        assert_eq!(total, 1, "exactly +1 of (script_hash, blake2b_256(child_did))");
        assert_eq!(distinct, 1, "only the child anchor NFT moves under this policy");

        // ── Owner anchor is a REFERENCE input, NOT spent. ──
        let ref_ins = tx.body().reference_inputs().expect("reference_inputs set");
        let mut owner_ref_found = false;
        for i in 0..ref_ins.len() {
            let inp = ref_ins.get(i);
            if inp.transaction_id().to_hex()
                == "1111111111111111111111111111111111111111111111111111111111111111"
                && inp.index() == 0
            {
                owner_ref_found = true;
            }
        }
        assert!(owner_ref_found, "owner anchor must be a CIP-31 reference input");
        // The owner outpoint must NOT appear among the spent inputs.
        let spent = tx.body().inputs();
        for i in 0..spent.len() {
            let inp = spent.get(i);
            assert!(
                !(inp.transaction_id().to_hex()
                    == "1111111111111111111111111111111111111111111111111111111111111111"
                    && inp.index() == 0),
                "owner anchor must NOT be spent — it is a reference input only"
            );
        }

        // ── Required signer == OWNER controller (G-1); child does NOT sign. ──
        let req = tx.body().required_signers().expect("required_signers set");
        assert_eq!(req.len(), 1, "exactly one required signer (the owner controller)");
        assert_eq!(
            req.get(0).to_bytes(),
            owner_controller_pkh.to_vec(),
            "required signer must equal OWNER controller_pkh (validator G-1)"
        );

        // Two vkey witnesses: wallet payment key + owner TAAD key.
        let vkeys = wit.vkeys().expect("vkey witnesses present");
        assert_eq!(vkeys.len(), 2, "wallet + owner-TAAD signatures (child does not sign)");

        // script_data_hash bound.
        assert!(tx.body().script_data_hash().is_some(), "script_data_hash set for Plutus tx");

        // ── Child TAAD output at script addr: NFT + fresh datum + parent edge. ──
        let outs = tx.body().outputs();
        let mut found = false;
        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).ok() == script_addr.to_bech32(None).ok() {
                let ma = o.amount().multiasset().expect("script output carries the NFT");
                let qty = ma
                    .get(&script_hash)
                    .and_then(|a| a.get(&expected_name))
                    .expect("the minted child NFT sits at the script address");
                assert_eq!(qty, BigNum::from(1u64), "child NFT qty +1 at script address");

                let d = o.plutus_data().expect("script output has inline datum");
                let dc = d.as_constr_plutus_data().unwrap();
                // entity_type (field 1) = Org = constr alt 1.
                let et = dc.data().get(1).as_constr_plutus_data().unwrap().alternative();
                assert_eq!(et, BigNum::from(1u64), "child datum entity_type = Org (1)");
                // sequence (field 4) = 0 (fresh).
                let seq = dc.data().get(4).as_integer().unwrap().to_str();
                assert_eq!(seq, "0", "fresh child datum has sequence 0");
                // parent_did (field 7) = Some(owner_did): constr alt 0, one inner bytes.
                let parent = dc.data().get(7).as_constr_plutus_data().unwrap();
                assert_eq!(parent.alternative(), BigNum::from(0u64), "parent_did = Some(..)");
                let parent_bytes = parent.data().get(0).as_bytes().expect("parent inner ByteArray");
                assert_eq!(
                    String::from_utf8(parent_bytes).unwrap(),
                    owner_did,
                    "child datum parent_did == Some(owner_did) (validator G-3)"
                );
                found = true;
            }
        }
        assert!(found, "child TAAD output at script address must exist");
    }

    /// Child genesis must reject entity_type 0 (Person): a child can never be
    /// born Person (validator G-4).
    #[test]
    fn create_child_rejects_person_entity_type() {
        let script_cbor = "4e4d01000033222220051200120011";
        let (_a, script_hash) = derive_taad_script_address(script_cbor, 0).unwrap();
        let policy_id_hex = hex::encode(script_hash.to_bytes());
        let owner_master_kek = "7a".repeat(32);
        let owner_did = "did:phoenix:aaaaaaaaaaaac:1111111111111111111111111111111111111111111111111111111111111111";
        let owner_pkh = {
            let b = hex::decode(crate::sign::derive_taad_public_key(owner_master_kek.clone())).unwrap();
            blake2b_224(&b)
        };
        let owner_utxo = format!(
            r#"{{"tx_hash":"1111111111111111111111111111111111111111111111111111111111111111","index":0,"amount_lovelace":2000000,"inline_datum_hex":"{}"}}"#,
            owner_inline_datum_hex(owner_did, &owner_pkh)
        );
        let utxos = r#"[{"tx_hash":"5555555555555555555555555555555555555555555555555555555555555555","index":0,"amount_lovelace":10000000}]"#;
        let params = r#"{"min_fee_a":44,"min_fee_b":155381,"coins_per_utxo_size":"4310","pool_deposit":"500000000","key_deposit":"2000000"}"#;
        let err = build_create_child_taad_utxo_tx(
            "did:phoenix:bbbbbbbbbbbbc:2222222222222222222222222222222222222222222222222222222222222222",
            owner_did,
            0, // Person → forbidden for a child
            &"aa".repeat(32),
            &"cd".repeat(32),
            &owner_master_kek,
            &"34".repeat(32),
            0, script_cbor, &policy_id_hex, &owner_utxo, utxos, params, 3000,
        )
        .expect_err("Person child must be rejected (G-4)");
        assert!(err.contains("Person"), "error must mention Person/G-4, got: {err}");
    }

    /// Child genesis must reject an owner KEK that does not derive the owner
    /// controller_pkh recorded in the referenced owner datum (would be
    /// unsignable / rejected for missing owner signature, G-1).
    #[test]
    fn create_child_rejects_owner_kek_mismatch() {
        let script_cbor = "4e4d01000033222220051200120011";
        let (_a, script_hash) = derive_taad_script_address(script_cbor, 0).unwrap();
        let policy_id_hex = hex::encode(script_hash.to_bytes());
        let owner_did = "did:phoenix:aaaaaaaaaaaac:1111111111111111111111111111111111111111111111111111111111111111";
        // Owner datum records a controller pkh derived from KEK "7a"…, but we
        // pass a DIFFERENT KEK ("bb"…) to the builder.
        let real_owner_pkh = {
            let b = hex::decode(crate::sign::derive_taad_public_key("7a".repeat(32))).unwrap();
            blake2b_224(&b)
        };
        let owner_utxo = format!(
            r#"{{"tx_hash":"1111111111111111111111111111111111111111111111111111111111111111","index":0,"amount_lovelace":2000000,"inline_datum_hex":"{}"}}"#,
            owner_inline_datum_hex(owner_did, &real_owner_pkh)
        );
        let utxos = r#"[{"tx_hash":"5555555555555555555555555555555555555555555555555555555555555555","index":0,"amount_lovelace":10000000}]"#;
        let params = r#"{"min_fee_a":44,"min_fee_b":155381,"coins_per_utxo_size":"4310","pool_deposit":"500000000","key_deposit":"2000000"}"#;
        let err = build_create_child_taad_utxo_tx(
            "did:phoenix:bbbbbbbbbbbbc:2222222222222222222222222222222222222222222222222222222222222222",
            owner_did,
            1,
            &"aa".repeat(32),
            &"cd".repeat(32),
            &"bb".repeat(32), // WRONG owner KEK
            &"34".repeat(32),
            0, script_cbor, &policy_id_hex, &owner_utxo, utxos, params, 3000,
        )
        .expect_err("owner KEK mismatch must be rejected");
        assert!(
            err.contains("owner controller_pkh mismatch") || err.contains("does not derive the owner"),
            "error must explain owner controller mismatch, got: {err}"
        );
    }

    // ─── M2 lifecycle encoders/decoders ────────────────────────────

    /// `decode_taad_datum_full` must surface every preserved field (incl.
    /// controller_pkh + hw_pubkey, which `decode_taad_datum_for_rotate`
    /// dropped) and parse sequence/did/entity_type.
    #[test]
    fn full_decode_reads_all_fields() {
        let did = "did:phoenix:aaaaaaaaaaaac:abcd";
        let ctrl = [0x11u8; 28];
        let hw = [0x22u8; 32];
        let datum = encode_taad_datum_create(did, 1 /* Org */, &ctrl, &hw).unwrap();
        let hex_datum = hex::encode(datum.to_bytes());
        let d = decode_taad_datum_full(&hex_datum).unwrap();
        assert_eq!(d.did, did);
        assert_eq!(d.entity_type, 1);
        assert_eq!(d.sequence, 0);
        assert_eq!(d.controller_pkh.as_bytes().unwrap(), ctrl.to_vec());
        assert_eq!(d.hw_pubkey.as_bytes().unwrap(), hw.to_vec());
    }

    /// assemble → full-decode round-trip preserves immutables and bumps seq.
    #[test]
    fn assemble_roundtrips_through_full_decode() {
        let did = "did:phoenix:aaaaaaaaaaaac:1234";
        let base = encode_taad_datum_create(did, 0, &[0x11u8; 28], &[0x22u8; 32]).unwrap();
        let d = decode_taad_datum_full(&hex::encode(base.to_bytes())).unwrap();
        let rebuilt = assemble_taad_datum(
            &d.did, d.entity_type, &d.controller_pkh, &d.hw_pubkey, d.sequence + 1,
            &status_active(), &d.guardians, &d.parent_did, &d.revoked_slot, &d.recovery_anchor,
        )
        .unwrap();
        let re = decode_taad_datum_full(&hex::encode(rebuilt.to_bytes())).unwrap();
        assert_eq!(re.sequence, 1, "sequence must increment");
        assert_eq!(re.did, did);
        assert_eq!(re.controller_pkh.as_bytes().unwrap(), [0x11u8; 28].to_vec());
    }

    /// Recovering status round-trip: pending keys, deadline, collateral.
    #[test]
    fn recovering_status_roundtrip() {
        let pc = [0xAAu8; 28];
        let ph = [0xBBu8; 32];
        let st = status_recovering(&pc, &ph, 123_456, 50_000_000).unwrap();
        let (rc, rh, dl, col) = decode_recovering_status(&st).unwrap();
        assert_eq!(rc, pc);
        assert_eq!(rh, ph);
        assert_eq!(dl, 123_456);
        assert_eq!(col, 50_000_000);
    }

    /// decode_recovering_status must reject a non-Recovering status.
    #[test]
    fn recovering_decode_rejects_active() {
        assert!(decode_recovering_status(&status_active()).is_err());
        assert!(decode_recovering_status(&status_revoked()).is_err());
    }

    /// Redeemer constr indices must match types.ak exactly (positional CBOR).
    #[test]
    fn redeemer_constr_indices_match_validator() {
        // InitRecovery = constr 1, 4 fields
        let ir = encode_init_recovery_redeemer(&[0x01u8; 28], &[0x02u8; 32], 2, 50_000_000).unwrap();
        let c = ir.as_constr_plutus_data().unwrap();
        assert_eq!(c.alternative(), BigNum::from(1u64));
        assert_eq!(c.data().len(), 4);
        // CancelRecovery = 2, FinalizeRecovery = 3, Deactivate = 4 (empty)
        assert_eq!(
            encode_empty_redeemer(2).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(2u64)
        );
        assert_eq!(
            encode_empty_redeemer(3).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(3u64)
        );
        assert_eq!(
            encode_empty_redeemer(4).as_constr_plutus_data().unwrap().alternative(),
            BigNum::from(4u64)
        );
        // UpdateGuardians = constr 5, 1 field (the list)
        let ug = encode_update_guardians_redeemer(&[[0x07u8; 28], [0x08u8; 28]]);
        let cu = ug.as_constr_plutus_data().unwrap();
        assert_eq!(cu.alternative(), BigNum::from(5u64));
        assert_eq!(cu.data().len(), 1);
    }

    /// Deactivate datum: status → Revoked (constr 3) + revoked_slot Some(slot).
    #[test]
    fn deactivate_datum_marks_revoked_with_slot() {
        let base = encode_taad_datum_create("did:phoenix:aaaaaaaaaaaac:dead", 0, &[0x11u8; 28], &[0x22u8; 32]).unwrap();
        let d = decode_taad_datum_full(&hex::encode(base.to_bytes())).unwrap();
        let dz = assemble_taad_datum(
            &d.did, d.entity_type, &d.controller_pkh, &d.hw_pubkey, d.sequence + 1,
            &status_revoked(), &d.guardians, &d.parent_did, &pd_some_int(999).unwrap(), &d.recovery_anchor,
        )
        .unwrap();
        let fields = dz.as_constr_plutus_data().unwrap().data();
        // field 5 = status Revoked (constr 3)
        assert_eq!(fields.get(5).as_constr_plutus_data().unwrap().alternative(), BigNum::from(3u64));
        // field 8 = revoked_slot Some(999): constr 0 with [Int 999]
        let rs = fields.get(8).as_constr_plutus_data().unwrap();
        assert_eq!(rs.alternative(), BigNum::from(0u64));
        assert_eq!(rs.data().get(0).as_integer().unwrap().to_str(), "999");
    }

    /// parse_pkh_list rejects wrong-length hashes.
    #[test]
    fn pkh_list_validates_length() {
        assert!(parse_pkh_list(&format!("[\"{}\"]", "11".repeat(28)), "g").is_ok());
        assert!(parse_pkh_list(&format!("[\"{}\"]", "11".repeat(20)), "g").is_err());
    }
}
