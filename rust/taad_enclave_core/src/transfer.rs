// ================================================================
// PhoenixKey — Wallet Transfer TX builder (ADA + LAMP)
//
// Build + sign a real Cardano spending transaction in rust_core. Replaces the
// Dart `cardano_tx_builder` / `buildAndSignLampTransfer` stub.
//
// Spec: testnet-plan/TRANSFER-TX-SPEC-2026-06-05.md
//
// Model (eUTXO): a spend tx selects a set of wallet UTxO `inputs` →
// `outputs` (recipient + change back to the wallet) + `fee`.
//   - sender address  = CIP-1852 address at `account = walletRotationIndex`
//     (QĐ-B mô hình ví) — must match the wallet that holds the funds.
//   - signing key      = payment skey derived from the wallet seed at the SAME
//     account (cardano::derive_payment_xprv_account).
//
// Invariants (CSL enforces, this module wires correctly — §2 of the spec):
//   - Value conservation (ADA):  Σ inputs.coin = Σ outputs.coin + fee.
//   - Native-asset conservation: Σ inputs.LAMP ≥ Σ outputs.LAMP; surplus
//     returns to change. No mint → assets are never created/destroyed.
//   - Linear fee: fee = min_fee_a + min_fee_b × size(tx) (LinearFee from params).
//   - Min-UTxO: every output (incl. change) ≥ min_ada(o).
//   - Coin selection CIP-2: LargestFirst (ADA-only) / LargestFirstMultiAsset
//     (when the recipient output carries LAMP — plain LargestFirst rejects
//     multiasset outputs in CSL).
//   - Witness: vkey witness = Ed25519_sign(payment_skey_account,
//     BLAKE2b-256(tx_body)). CSL 13 hides `hash_transaction`, so we BLAKE2b the
//     body bytes ourselves — identical to taad_did.rs.
//
// Design decisions (4 trục — mandate user):
//   * Định hướng dài hạn: same FFI shape any Cardano team can drive; no
//     PhoenixKey-specific coupling. Reuses taad_did::build_tx_builder so the
//     fee/param parsing stays single-sourced.
//   * First-principles: a transfer is "inputs cover (recipient + change + fee)
//     under value conservation"; we let CSL's CIP-2 selector + add_change do
//     exactly that rather than hand-rolling selection.
//   * Tối ưu (eUTXO/ExUnit/phí): LargestFirst minimises input count → fewer
//     witnesses → smaller tx → lower fee; add_change_if_needed folds dust
//     change into the fee instead of emitting a sub-min-ada output.
//   * User + bền vững: insufficient funds returns "" (never a malformed tx that
//     would burn fee on a guaranteed-to-fail submit); the seed never crosses
//     the FFI boundary as anything but the input arg and is scrubbed on drop.

use crate::cardano;
use crate::taad_did::build_tx_builder;
use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use cardano_serialization_lib as csl;
use cardano_serialization_lib::{
    Address, AssetName, BigNum, CoinSelectionStrategyCIP2, DataCost, MultiAsset, ScriptHash,
    Transaction, TransactionHash, TransactionInput, TransactionOutput, TransactionOutputBuilder,
    TransactionUnspentOutput, TransactionUnspentOutputs, TransactionWitnessSet, Value,
    Vkeywitnesses,
};
use serde::{Deserialize, Deserializer};
use serde_json::Value as JsonValue;

type Blake2b256 = Blake2b<U32>;

/// Deserialize a u64 quantity that the caller MAY send as a JSON string OR a
/// JSON number. Cardano native-asset / lovelace quantities can reach 2^64−1
/// (e.g. a max-supply token), which OVERFLOWS a JSON f64/i64 and a Dart `int`
/// (53-bit / 63-bit). The data provider (Blockfrost) already returns quantities
/// as decimal strings; the Dart bridge now forwards them as strings unchanged.
///
/// Accepting both shapes keeps the FFI contract tolerant: a string is parsed in
/// full u64 precision; a JSON number is read via `as_u64` (only valid when it
/// fits u64). Anything else — negative, non-numeric, or > 2^64−1 — is a hard
/// deserialize error, so `build_signed_transfer` returns "" (never a malformed
/// tx). This is the seam that stops a junk-quantity token from bricking spend.
fn de_u64_str<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::Error;
    let v = JsonValue::deserialize(deserializer)?;
    match v {
        JsonValue::String(s) => s
            .parse::<u64>()
            .map_err(|_| D::Error::custom("quantity string is not a valid u64")),
        JsonValue::Number(n) => n
            .as_u64()
            .ok_or_else(|| D::Error::custom("quantity number does not fit u64")),
        _ => Err(D::Error::custom("quantity must be a u64 string or number")),
    }
}

/// One UTxO of the sending wallet, as serialized by the caller from a data
/// provider (Blockfrost `GET /addresses/{addr}/utxos`, later LampNet Daemon).
#[derive(Deserialize, Debug, Clone)]
struct TransferUtxo {
    tx_hash: String,
    index: u32,
    /// Lovelace held by this UTxO. Accepted as a JSON string (full u64 range) or
    /// number — see `de_u64_str`. A UTxO can hold up to the total ADA supply,
    /// well within u64 but past Dart `int`, so the bridge sends it as a string.
    #[serde(deserialize_with = "de_u64_str")]
    lovelace: u64,
    #[serde(default)]
    assets: Vec<TransferAsset>,
}

#[derive(Deserialize, Debug, Clone)]
struct TransferAsset {
    policy: String,
    /// Asset name as hex (may be empty for a nameless asset).
    name: String,
    /// Asset quantity. Accepted as a JSON string (full u64 range, up to 2^64−1)
    /// or number — see `de_u64_str`. A token can mint up to 2^64−1 units, which
    /// overflows a JSON f64 and a Dart `int`; parsing the string keeps every
    /// quantity representable so a max-supply token cannot brick coin selection.
    #[serde(deserialize_with = "de_u64_str")]
    quantity: u64,
}

/// Build + sign a wallet transfer tx. Returns hex-encoded signed tx CBOR, or an
/// empty string on any error (insufficient UTxO / min-ada / parse / invalid
/// input). Returning "" rather than a partial tx matches the spec contract: the
/// Dart caller treats "" as "could not build — do not submit".
///
/// # Args (mirror the FFI in §3 of the spec)
/// * `seed_hex`            — 64-char hex wallet seed (from Master_KEK).
/// * `account`             — CIP-1852 account index = walletRotationIndex.
/// * `to_address`          — bech32 recipient.
/// * `amount_lovelace`     — ADA to send (lovelace). When sending LAMP this is
///   the ADA floor of the recipient output; the actual coin is
///   max(amount_lovelace, min_ada_required).
/// * `lamp_amount`         — 0 = ADA-only; >0 = also send this many LAMP units.
/// * `lamp_policy_hex`     — 28-byte policy id hex (empty when lamp_amount == 0).
/// * `lamp_asset_name_hex` — LAMP asset name hex (may be empty).
/// * `utxos_json`          — JSON array of the wallet's UTxO (see `TransferUtxo`).
/// * `protocol_params_json`— Blockfrost `/epochs/latest/parameters`.
/// * `network`             — 0 = testnet/preprod, 1 = mainnet.
#[allow(clippy::too_many_arguments)]
pub fn build_signed_transfer(
    seed_hex: &str,
    account: u32,
    to_address: &str,
    amount_lovelace: u64,
    lamp_amount: u64,
    lamp_policy_hex: &str,
    lamp_asset_name_hex: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> String {
    build_signed_transfer_inner(
        seed_hex,
        account,
        to_address,
        amount_lovelace,
        lamp_amount,
        lamp_policy_hex,
        lamp_asset_name_hex,
        utxos_json,
        protocol_params_json,
        network,
    )
    .unwrap_or_default()
}

#[allow(clippy::too_many_arguments)]
fn build_signed_transfer_inner(
    seed_hex: &str,
    account: u32,
    to_address: &str,
    amount_lovelace: u64,
    lamp_amount: u64,
    lamp_policy_hex: &str,
    lamp_asset_name_hex: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> Result<String, &'static str> {
    // ─── 1. Parse inputs ──────────────────────────────────────────
    let utxos: Vec<TransferUtxo> = serde_json::from_str(utxos_json)
        .map_err(|_| "utxos_json is not a valid JSON array")?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — no funds to spend");
    }

    let params: JsonValue = serde_json::from_str(protocol_params_json)
        .map_err(|_| "protocol_params_json is not valid JSON")?;

    let to_addr = Address::from_bech32(to_address)
        .map_err(|_| "to_address is not a valid bech32 address")?;

    // Network guard: the recipient address MUST belong to the same network
    // (`network`: 0 = testnet/preprod, 1 = mainnet) we're building for. A
    // mainnet address with network=0 (or vice-versa) builds a tx the node
    // rejects outright — and on the wrong network there is no recovering the
    // funds if it somehow landed. Address::network_id() returns the address'
    // network byte; mismatch → "" (never build a doomed/misdirected tx).
    let addr_network = to_addr
        .network_id()
        .map_err(|_| "to_address has no network id (byron/unsupported address)")?;
    if addr_network != network {
        return Err("to_address network does not match the target network");
    }

    let coins_per_utxo_byte = extract_coins_per_utxo_byte(&params);

    // ─── 2. Derive sender key + address at this account ────────────
    // The signing key and the change address both move with `account`, so the
    // wallet that funds the tx is exactly the one whose key signs it.
    let payment_xprv = cardano::derive_payment_xprv_account(seed_hex, account)
        .ok_or("seed_hex invalid (must be 32-byte hex)")?;
    let payment_pubkey = payment_xprv.to_raw_key().to_public();
    let payment_pubkey_hash = payment_pubkey.hash();

    let sender_addr_bech32 = cardano::derive_address_account(seed_hex.to_string(), account, network);
    if sender_addr_bech32.is_empty() {
        return Err("could not derive sender address");
    }
    let sender_addr = Address::from_bech32(&sender_addr_bech32)
        .map_err(|_| "derived sender address is not valid bech32 (unreachable)")?;

    // ─── 3. Builder ───────────────────────────────────────────────
    let mut tb = build_tx_builder(&params)?;

    // ─── 4. Recipient output ──────────────────────────────────────
    let recipient_output = build_recipient_output(
        &to_addr,
        amount_lovelace,
        lamp_amount,
        lamp_policy_hex,
        lamp_asset_name_hex,
        coins_per_utxo_byte,
    )?;
    tb.add_output(&recipient_output)
        .map_err(|_| "add_output failed (recipient value below min-ada?)")?;

    // ─── 5. Coin selection (CIP-2) ────────────────────────────────
    // LargestFirst rejects multiasset outputs; switch to its multiasset variant
    // when the recipient output carries LAMP so the selector also covers the
    // asset, not just lovelace. Fewer, biggest inputs first = small tx + low fee.
    let available = build_unspent_outputs(&utxos, &sender_addr)?;
    let strategy = if lamp_amount > 0 {
        CoinSelectionStrategyCIP2::LargestFirstMultiAsset
    } else {
        CoinSelectionStrategyCIP2::LargestFirst
    };
    tb.add_inputs_from(&available, strategy)
        .map_err(|_| "coin selection failed — insufficient UTxO to cover amount + fee")?;

    // ─── 6. Change back to sender ─────────────────────────────────
    // add_change_if_needed enforces value conservation (Σin = Σout + fee) and
    // min-ada on the change output; if change would be dust it folds it into
    // the fee instead of emitting a sub-min-ada output. Failure here = the
    // selected inputs cannot cover fee → insufficient funds.
    tb.add_change_if_needed(&sender_addr)
        .map_err(|_| "add_change_if_needed failed — insufficient input for fee + min-ada change")?;

    // ─── 7. Build body, hash, sign ────────────────────────────────
    let tx_body = tb
        .build()
        .map_err(|_| "TransactionBuilder.build failed (coin selection / min fee)")?;

    // CSL 13 doesn't expose `hash_transaction` publicly → BLAKE2b-256 the body
    // bytes ourselves, matching the ledger tx_id derivation (same as taad_did).
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

    // Guard against any future change that derives the witness off a different
    // key than the input credential: the vkey hash must match the input's
    // payment credential, else the tx fails phase-1 validation on submit.
    debug_assert_eq!(
        vkey_witness.vkey().public_key().hash().to_bytes(),
        payment_pubkey_hash.to_bytes(),
        "witness vkey must hash to the sender payment credential"
    );

    let tx = Transaction::new(&tx_body, &witnesses, None);
    Ok(hex::encode(tx.to_bytes()))
}

/// Ký (witness) một tx CBOR ĐÃ DỰNG SẴN — vd BE GetLAMP trả unsigned tx, client thêm
/// vkey witness của payment key rồi BE submit. Thêm vào witness-set CÓ SẴN (giữ witness
/// BE có thể đã kèm), KHÔNG đụng body/auxiliary_data. Trả CBOR hex đã ký, "" nếu lỗi.
///
/// `account` = CIP-1852 account của payment key ký (thường 0 = ví cố định).
/// `_network` giữ cho đồng bộ signature với các FFI khác (không dùng trong witness).
pub fn witness_unsigned_tx(
    seed_hex: &str,
    account: u32,
    unsigned_tx_cbor_hex: &str,
    _network: u8,
) -> String {
    witness_unsigned_tx_inner(seed_hex, account, unsigned_tx_cbor_hex).unwrap_or_default()
}

fn witness_unsigned_tx_inner(
    seed_hex: &str,
    account: u32,
    unsigned_tx_cbor_hex: &str,
) -> Result<String, &'static str> {
    let tx_bytes = hex::decode(unsigned_tx_cbor_hex.trim())
        .map_err(|_| "unsigned_tx_cbor is not valid hex")?;
    let tx = Transaction::from_bytes(tx_bytes)
        .map_err(|_| "unsigned_tx_cbor is not a valid Cardano transaction")?;

    let tx_body = tx.body();

    // Hash body (BLAKE2b-256) — CÙNG cách build_signed_transfer_inner (CSL 13 ẩn hash_transaction).
    let mut h = Blake2b256::new();
    h.update(tx_body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes failed (length mismatch)")?;

    // Payment key của account → vkey witness.
    let payment_xprv = cardano::derive_payment_xprv_account(seed_hex, account)
        .ok_or("seed_hex invalid (must be 32-byte hex)")?;
    let raw_priv = payment_xprv.to_raw_key();
    let vkey_witness = csl::make_vkey_witness(&tx_hash, &raw_priv);

    // Gộp vào witness-set CÓ SẴN (BE có thể đã kèm witness khác — không ghi đè).
    let mut witnesses = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);
    vkeys.add(&vkey_witness);
    witnesses.set_vkeys(&vkeys);

    let signed = Transaction::new(&tx_body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

/// Ký (witness) một tx CBOR ĐÃ DỰNG SẴN bằng KHOÁ Ed25519 THÔ — TAAD_Key và/hoặc
/// DeviceKey — thay vì khoá thanh toán CIP-1852.
///
/// VÌ SAO CẦN HÀM RIÊNG: `witness_unsigned_tx` ở trên ký bằng khoá thanh toán
/// (xprv mở rộng, dẫn xuất CIP-1852). Hai khoá dưới đây KHÁC hẳn:
///   · TAAD_Key  — Ed25519 32-byte seed, HKDF từ Master_KEK (`sign::derive_taad_seed`),
///                 băm blake2b-224 của pubkey chính là `controller_pkh` trong datum.
///   · DeviceKey — Ed25519 32-byte seed NGẪU NHIÊN mỗi máy (`sign::device_key_optin`),
///                 caller giữ trong secureStore; băm pubkey là `device_pkh`.
/// Cả hai đều là Ed25519 THƯỜNG (không mở rộng) nên phải đi qua
/// `PrivateKey::from_normal_bytes`, không qua `Bip32PrivateKey::to_raw_key`.
///
/// GỘP, KHÔNG GHI ĐÈ: witness được thêm vào witness-set CÓ SẴN, nên gọi được nối
/// tiếp sau `witness_unsigned_tx` (khoá thanh toán) khi một tx đòi cả ba chữ ký.
/// Thứ tự gọi không quan trọng — `Vkeywitnesses` là tập, và mọi witness đều ký
/// trên cùng một `blake2b-256(tx_body)`.
///
/// Tham số rỗng = BỎ QUA khoá đó. Cả hai rỗng = lỗi (không thêm gì thì caller
/// đang gọi nhầm hàm, trả tx nguyên vẹn sẽ giấu lỗi đó tới tận lúc submit).
///
/// Trả CBOR hex đã ký, "" nếu lỗi. KHÔNG đụng body/auxiliary_data.
///
/// CHƯA CÓ FFI — cố ý. Bắc cầu ra TS bây giờ là mở một đường mà bấm vào chắc chắn
/// hỏng: `GET /wakeme/pot` trên máy chủ thật trả `501 "pot deploy trên Preprod
/// chưa có — chờ dependency ngoài"` (đo 2026-08-18). Hàm này là mảnh phía mình,
/// đã có bài kiểm khoá, để khi máy chủ mở thì chỉ còn việc bắc cầu.
#[allow(dead_code)]
pub fn witness_unsigned_tx_ed25519(
    unsigned_tx_cbor_hex: &str,
    taad_master_kek_hex: &str,
    device_secret_hex: &str,
) -> String {
    witness_unsigned_tx_ed25519_inner(unsigned_tx_cbor_hex, taad_master_kek_hex, device_secret_hex)
        .unwrap_or_default()
}

#[allow(dead_code)]
fn witness_unsigned_tx_ed25519_inner(
    unsigned_tx_cbor_hex: &str,
    taad_master_kek_hex: &str,
    device_secret_hex: &str,
) -> Result<String, &'static str> {
    let kek_hex = taad_master_kek_hex.trim();
    let dev_hex = device_secret_hex.trim();
    if kek_hex.is_empty() && dev_hex.is_empty() {
        return Err("cần ít nhất một trong hai: taad_master_kek_hex hoặc device_secret_hex");
    }

    let tx_bytes = hex::decode(unsigned_tx_cbor_hex.trim())
        .map_err(|_| "unsigned_tx_cbor is not valid hex")?;
    let tx = Transaction::from_bytes(tx_bytes)
        .map_err(|_| "unsigned_tx_cbor is not a valid Cardano transaction")?;
    let tx_body = tx.body();

    // Hash body (BLAKE2b-256) — CSL 13 ẩn hash_transaction, làm tay như các chỗ khác.
    let mut h = Blake2b256::new();
    h.update(tx_body.to_bytes());
    let tx_hash = TransactionHash::from_bytes(h.finalize().to_vec())
        .map_err(|_| "TransactionHash::from_bytes failed (length mismatch)")?;

    let mut witnesses = tx.witness_set();
    let mut vkeys = witnesses.vkeys().unwrap_or_else(Vkeywitnesses::new);

    if !kek_hex.is_empty() {
        let kek = hex::decode(kek_hex).map_err(|_| "taad_master_kek_hex is not valid hex")?;
        let seed = crate::sign::derive_taad_seed(&kek)
            .ok_or("taad_master_kek_hex must decode to exactly 32 bytes")?;
        let priv_key = csl::PrivateKey::from_normal_bytes(&*seed)
            .map_err(|_| "derived TAAD seed is not a valid Ed25519 private key")?;
        vkeys.add(&csl::make_vkey_witness(&tx_hash, &priv_key));
    }

    if !dev_hex.is_empty() {
        let dev = hex::decode(dev_hex).map_err(|_| "device_secret_hex is not valid hex")?;
        if dev.len() != 32 {
            return Err("device_secret_hex must decode to exactly 32 bytes (Ed25519 seed)");
        }
        let priv_key = csl::PrivateKey::from_normal_bytes(&dev)
            .map_err(|_| "device_secret_hex is not a valid Ed25519 private key")?;
        vkeys.add(&csl::make_vkey_witness(&tx_hash, &priv_key));
    }

    witnesses.set_vkeys(&vkeys);
    let signed = Transaction::new(&tx_body, &witnesses, tx.auxiliary_data());
    Ok(hex::encode(signed.to_bytes()))
}

/// Build the recipient `TransactionOutput`.
/// - ADA-only: coin = `amount_lovelace`.
/// - With LAMP: Value = (LAMP multiasset) + at-least-min-ada coin. We seed the
///   coin at `amount_lovelace` then bump to min-ada if the caller under-funded
///   it, so a UTxO carrying a native asset always satisfies the ledger's
///   min-UTxO rule.
fn build_recipient_output(
    to_addr: &Address,
    amount_lovelace: u64,
    lamp_amount: u64,
    lamp_policy_hex: &str,
    lamp_asset_name_hex: &str,
    coins_per_utxo_byte: u64,
) -> Result<TransactionOutput, &'static str> {
    if lamp_amount == 0 {
        // Pure ADA output. with_coin enforces nothing about min-ada here, but
        // the recipient coin equals the user's chosen amount; if it were below
        // min-ada the subsequent build() would error — surfaced as "".
        return TransactionOutputBuilder::new()
            .with_address(to_addr)
            .next()
            .map_err(|_| "recipient output builder.next failed")?
            .with_coin(&BigNum::from(amount_lovelace))
            .build()
            .map_err(|_| "recipient ADA output build failed");
    }

    // LAMP output: assemble the multiasset, then pick coin = max(amount, min).
    let policy_bytes = hex::decode(lamp_policy_hex)
        .map_err(|_| "lamp_policy_hex is not valid hex")?;
    if policy_bytes.len() != 28 {
        return Err("lamp_policy_hex must decode to 28 bytes (policy id)");
    }
    let policy = ScriptHash::from_bytes(policy_bytes)
        .map_err(|_| "lamp_policy_hex is not a valid script hash")?;

    let name_bytes = hex::decode(lamp_asset_name_hex)
        .map_err(|_| "lamp_asset_name_hex is not valid hex")?;
    let asset_name =
        AssetName::new(name_bytes).map_err(|_| "lamp_asset_name_hex exceeds 32-byte limit")?;

    let mut ma = MultiAsset::new();
    ma.set_asset(&policy, &asset_name, &BigNum::from(lamp_amount));

    // Min-ada required to carry this asset bundle at the recipient address.
    let data_cost = DataCost::new_coins_per_byte(&BigNum::from(coins_per_utxo_byte));
    let min_ada_output = TransactionOutputBuilder::new()
        .with_address(to_addr)
        .next()
        .map_err(|_| "recipient (lamp) output builder.next failed")?
        .with_asset_and_min_required_coin_by_utxo_cost(&ma, &data_cost)
        .map_err(|_| "recipient min-ada calc failed")?
        .build()
        .map_err(|_| "recipient (lamp) min-ada output build failed")?;
    let min_required = min_ada_output.amount().coin();

    let coin = if BigNum::from(amount_lovelace).compare(&min_required) > 0 {
        BigNum::from(amount_lovelace)
    } else {
        min_required
    };

    TransactionOutputBuilder::new()
        .with_address(to_addr)
        .next()
        .map_err(|_| "recipient (lamp) output builder.next failed")?
        .with_coin_and_asset(&coin, &ma)
        .build()
        .map_err(|_| "recipient (lamp) output build failed")
}

/// Convert the caller's UTxO list into CSL `TransactionUnspentOutputs` at the
/// sender address (the address is needed so the selector can re-attach the
/// right input credential).
fn build_unspent_outputs(
    utxos: &[TransferUtxo],
    sender_addr: &Address,
) -> Result<TransactionUnspentOutputs, &'static str> {
    let mut outs = TransactionUnspentOutputs::new();
    for u in utxos {
        let tx_in = TransactionInput::new(
            &TransactionHash::from_hex(&u.tx_hash)
                .map_err(|_| "utxo tx_hash is not valid 32-byte hex")?,
            u.index,
        );

        let value = if u.assets.is_empty() {
            Value::new(&BigNum::from(u.lovelace))
        } else {
            let mut ma = MultiAsset::new();
            for a in &u.assets {
                let policy_bytes = hex::decode(&a.policy)
                    .map_err(|_| "utxo asset policy is not valid hex")?;
                if policy_bytes.len() != 28 {
                    return Err("utxo asset policy must decode to 28 bytes");
                }
                let policy = ScriptHash::from_bytes(policy_bytes)
                    .map_err(|_| "utxo asset policy is not a valid script hash")?;
                let name_bytes = hex::decode(&a.name)
                    .map_err(|_| "utxo asset name is not valid hex")?;
                let asset_name = AssetName::new(name_bytes)
                    .map_err(|_| "utxo asset name exceeds 32-byte limit")?;
                ma.set_asset(&policy, &asset_name, &BigNum::from(a.quantity));
            }
            Value::new_with_assets(&BigNum::from(u.lovelace), &ma)
        };

        let output = TransactionOutput::new(sender_addr, &value);
        outs.add(&TransactionUnspentOutput::new(&tx_in, &output));
    }
    Ok(outs)
}

/// Pull `coins_per_utxo_size` (utxoCostPerByte) from params, accepting numeric
/// or stringified encodings (Blockfrost is inconsistent). Defaults to the
/// preprod value 4310 if absent.
fn extract_coins_per_utxo_byte(params: &JsonValue) -> u64 {
    match &params["coins_per_utxo_size"] {
        JsonValue::Number(n) => n.as_u64().unwrap_or(4310),
        JsonValue::String(s) => s.parse().unwrap_or(4310),
        _ => 4310,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fixed 32-byte wallet seed (deterministic across runs).
    const SEED: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    const ACCOUNT: u32 = 0;

    // A recipient address derived from a *different* seed/account so it never
    // collides with the sender (change) address.
    fn recipient_addr() -> String {
        cardano::derive_address_account(
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".to_string(),
            7,
            0,
        )
    }

    // Real preprod protocol parameters (min_fee_a=44, min_fee_b=155381,
    // coins_per_utxo_size=4310). Note build_tx_builder bumps min_fee_b by +200.
    fn preprod_params() -> String {
        r#"{
            "min_fee_a": 44,
            "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000",
            "key_deposit": "2000000",
            "max_tx_size": 16384,
            "max_val_size": "5000"
        }"#
        .to_string()
    }

    // LAMP test policy + name.
    const LAMP_POLICY: &str = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c";
    const LAMP_NAME: &str = "4c414d50"; // "LAMP" in hex

    // Lovelace + quantity are emitted as JSON STRINGS — the shape the Dart
    // bridge now sends (full u64 range, no Dart `int` overflow). The serde
    // `de_u64_str` deserializer parses them back to u64.
    fn utxos_ada(lovelace: u64) -> String {
        format!(
            r#"[{{"tx_hash":"{}","index":0,"lovelace":"{}"}}]"#,
            "11".repeat(32),
            lovelace
        )
    }

    fn utxos_lamp(lovelace: u64, lamp_qty: u64) -> String {
        format!(
            r#"[{{"tx_hash":"{}","index":0,"lovelace":"{}","assets":[{{"policy":"{}","name":"{}","quantity":"{}"}}]}}]"#,
            "22".repeat(32),
            lovelace,
            LAMP_POLICY,
            LAMP_NAME,
            lamp_qty
        )
    }

    /// Parse a signed tx hex back into a Transaction (round-trips the CBOR).
    fn parse_tx(hex_str: &str) -> Transaction {
        let bytes = hex::decode(hex_str).expect("signed tx must be valid hex");
        Transaction::from_bytes(bytes).expect("signed tx must decode to a Transaction")
    }

    fn sum_input_lovelace(utxos_json: &str) -> u64 {
        let v: Vec<TransferUtxo> = serde_json::from_str(utxos_json).unwrap();
        v.iter().map(|u| u.lovelace).sum()
    }

    fn build_ada(amount: u64, utxos: &str) -> String {
        build_signed_transfer(
            SEED, ACCOUNT, &recipient_addr(), amount, 0, "", "",
            utxos, &preprod_params(), 0,
        )
    }

    // ── Test 1: ADA transfer conserves value ──────────────────────
    #[test]
    fn transfer_ada_conserves_value() {
        let utxos = utxos_ada(10_000_000); // 10 tADA
        let amount = 3_000_000u64;
        let hex_tx = build_ada(amount, &utxos);
        assert!(!hex_tx.is_empty(), "ADA transfer must build");

        let tx = parse_tx(&hex_tx);
        let body = tx.body();

        // ≥1 input.
        assert!(body.inputs().len() >= 1, "tx must have at least one input");

        // Σout + fee = Σin (value conservation).
        let fee: u64 = body.fee().to_str().parse().unwrap();
        let mut out_total = 0u64;
        let mut found_recipient = false;
        let outs = body.outputs();
        for i in 0..outs.len() {
            let o = outs.get(i);
            let coin: u64 = o.amount().coin().to_str().parse().unwrap();
            out_total += coin;
            if o.amount().coin() == BigNum::from(amount) {
                found_recipient = true;
            }
        }
        let in_total = sum_input_lovelace(&utxos);
        assert_eq!(
            in_total,
            out_total + fee,
            "Σinputs must equal Σoutputs + fee"
        );
        assert!(
            found_recipient,
            "an output must equal the recipient amount {}",
            amount
        );

        // Change must go to the sender address.
        let sender = cardano::derive_address_account(SEED.to_string(), ACCOUNT, 0);
        let mut change_to_sender = false;
        for i in 0..outs.len() {
            if outs.get(i).address().to_bech32(None).unwrap() == sender {
                change_to_sender = true;
            }
        }
        assert!(change_to_sender, "change must return to the sender address");
    }

    // ── Test 2: fee is positive and matches linear min_fee ────────
    #[test]
    fn transfer_ada_fee_positive_and_linear() {
        let utxos = utxos_ada(10_000_000);
        let hex_tx = build_ada(3_000_000, &utxos);
        assert!(!hex_tx.is_empty());
        let tx = parse_tx(&hex_tx);
        let fee: u64 = tx.body().fee().to_str().parse().unwrap();
        assert!(fee > 0, "fee must be positive");

        // Linear lower bound: fee ≥ min_fee_a × size + min_fee_b. With the +200
        // bump build_tx_builder applies, the actual fee is computed by CSL from
        // the serialized size; recompute and require fee ≥ a×size + b.
        let size = tx.to_bytes().len() as u64;
        let a = 44u64;
        let b = 155381u64 + 200; // build_tx_builder bump
        let linear_floor = a.saturating_mul(size) + b;
        // CSL sets fee to at least the linear min for the final tx size.
        assert!(
            fee >= a.saturating_mul(size),
            "fee {} must be ≥ min_fee_a × size {} (= {})",
            fee,
            size,
            a.saturating_mul(size)
        );
        // And not absurdly above the linear estimate for this tiny tx.
        assert!(
            fee <= linear_floor + 50_000,
            "fee {} should track the linear estimate {} for a small tx",
            fee,
            linear_floor
        );
    }

    // ── Test 3: insufficient funds → empty string ─────────────────
    #[test]
    fn transfer_insufficient_funds_returns_empty() {
        // Want to send 3 tADA but the only UTxO holds 1 tADA — cannot cover
        // amount + fee.
        let utxos = utxos_ada(1_000_000);
        let hex_tx = build_ada(3_000_000, &utxos);
        assert!(
            hex_tx.is_empty(),
            "insufficient funds must return empty, got: {}",
            hex_tx
        );

        // Empty UTxO list also → empty.
        let empty = build_ada(1_000_000, "[]");
        assert!(empty.is_empty(), "empty UTxO list must return empty");
    }

    // ── Test 4: LAMP asset appears in the recipient output ────────
    #[test]
    fn transfer_lamp_asset_in_output() {
        // UTxO holds 10 tADA + 1000 LAMP. Send 400 LAMP.
        let utxos = utxos_lamp(10_000_000, 1000);
        let hex_tx = build_signed_transfer(
            SEED, ACCOUNT, &recipient_addr(),
            2_000_000, // ADA floor for the recipient
            400, LAMP_POLICY, LAMP_NAME,
            &utxos, &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty(), "LAMP transfer must build");
        let tx = parse_tx(&hex_tx);
        let body = tx.body();
        let outs = body.outputs();

        let policy = ScriptHash::from_bytes(hex::decode(LAMP_POLICY).unwrap()).unwrap();
        let name = AssetName::new(hex::decode(LAMP_NAME).unwrap()).unwrap();
        let recipient = recipient_addr();
        let sender = cardano::derive_address_account(SEED.to_string(), ACCOUNT, 0);

        let mut recipient_lamp = 0u64;
        let mut change_lamp = 0u64;
        let mut recipient_ada = 0u64;
        for i in 0..outs.len() {
            let o = outs.get(i);
            let addr = o.address().to_bech32(None).unwrap();
            if let Some(ma) = o.amount().multiasset() {
                let q: u64 = ma.get_asset(&policy, &name).to_str().parse().unwrap();
                if addr == recipient {
                    recipient_lamp += q;
                    recipient_ada = o.amount().coin().to_str().parse().unwrap();
                } else if addr == sender {
                    change_lamp += q;
                }
            }
        }
        assert_eq!(recipient_lamp, 400, "recipient output must hold 400 LAMP");
        assert_eq!(
            change_lamp, 600,
            "change must return the 600 LAMP surplus (no mint/burn)"
        );
        // ADA floor: caller asked for 2 tADA, which exceeds the min-ada needed
        // to carry one asset, so the recipient coin must equal the request.
        assert_eq!(
            recipient_ada, 2_000_000,
            "recipient ADA must equal the requested 2 tADA (above min-ada floor)"
        );
    }

    // ── Test 5: change output meets min-ada ───────────────────────
    #[test]
    fn transfer_change_meets_min_ada() {
        let utxos = utxos_ada(10_000_000);
        let amount = 3_000_000u64;
        let hex_tx = build_ada(amount, &utxos);
        assert!(!hex_tx.is_empty());
        let tx = parse_tx(&hex_tx);
        let body = tx.body();
        let outs = body.outputs();

        let sender = cardano::derive_address_account(SEED.to_string(), ACCOUNT, 0);
        let data_cost = DataCost::new_coins_per_byte(&BigNum::from(4310u64));

        for i in 0..outs.len() {
            let o = outs.get(i);
            if o.address().to_bech32(None).unwrap() == sender {
                let min_ada = csl::min_ada_for_output(&o, &data_cost).unwrap();
                assert!(
                    o.amount().coin().compare(&min_ada) >= 0,
                    "change output {} must be ≥ min-ada {}",
                    o.amount().coin().to_str(),
                    min_ada.to_str()
                );
            }
        }
    }

    // ── Test 6: witness set has exactly one vkey of the payment key ─
    #[test]
    fn transfer_witness_present_and_valid_vkey() {
        let utxos = utxos_ada(10_000_000);
        let hex_tx = build_ada(3_000_000, &utxos);
        assert!(!hex_tx.is_empty());
        let tx = parse_tx(&hex_tx);

        let vkeys = tx
            .witness_set()
            .vkeys()
            .expect("witness set must carry vkey witnesses");
        assert_eq!(vkeys.len(), 1, "exactly one vkey witness expected");

        // The witness vkey must hash to the sender's payment credential.
        let expected_hash = cardano::derive_payment_xprv_account(SEED, ACCOUNT)
            .unwrap()
            .to_raw_key()
            .to_public()
            .hash();
        let got_hash = vkeys.get(0).vkey().public_key().hash();
        assert_eq!(
            got_hash.to_bytes(),
            expected_hash.to_bytes(),
            "witness vkey must be the payment key of this account"
        );
    }

    // ── Ký bằng khoá Ed25519 THÔ (TAAD_Key / DeviceKey) ───────────
    //
    // WakeMe đòi hai chữ ký KHÔNG phải khoá thanh toán: `controller_pkh` (băm
    // TAAD_Key) và `device_pkh`. Bộ bài dưới đây khoá đúng ba điều: witness cũ
    // KHÔNG bị mất, khoá đúng là khoá suy ra được, và tham số rỗng thì bỏ qua
    // chứ không âm thầm trả về tx nguyên vẹn.

    const KEK: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    const DEV: &str = "1122334455667788991122334455667788112233445566778899112233445566";

    #[test]
    fn ed25519_witness_them_du_hai_khoa_va_giu_witness_cu() {
        let hex_tx = build_ada(3_000_000, &utxos_ada(10_000_000));
        assert_eq!(parse_tx(&hex_tx).witness_set().vkeys().unwrap().len(), 1);

        let out = witness_unsigned_tx_ed25519(&hex_tx, KEK, DEV);
        assert!(!out.is_empty(), "phải ký được");
        let vkeys = parse_tx(&out).witness_set().vkeys().unwrap();
        assert_eq!(vkeys.len(), 3, "1 khoá thanh toán cũ + TAAD + Device");
    }

    #[test]
    fn ed25519_witness_dung_khoa_taad_suy_tu_kek() {
        let hex_tx = build_ada(3_000_000, &utxos_ada(10_000_000));
        let out = witness_unsigned_tx_ed25519(&hex_tx, KEK, "");
        let vkeys = parse_tx(&out).witness_set().vkeys().unwrap();
        assert_eq!(vkeys.len(), 2, "chỉ thêm ĐÚNG một witness khi bỏ trống device");

        // Khoá thêm vào phải băm ra đúng controller_pkh mà validator đòi.
        let seed = crate::sign::derive_taad_seed(&hex::decode(KEK).unwrap()).unwrap();
        let want = csl::PrivateKey::from_normal_bytes(&*seed)
            .unwrap()
            .to_public()
            .hash()
            .to_bytes();
        let found = (0..vkeys.len())
            .any(|i| vkeys.get(i).vkey().public_key().hash().to_bytes() == want);
        assert!(found, "phải có witness của TAAD_Key suy từ Master_KEK");
    }

    #[test]
    fn ed25519_witness_chu_ky_kiem_lai_duoc_tren_hash_than_tx() {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};

        let hex_tx = build_ada(3_000_000, &utxos_ada(10_000_000));
        let out = witness_unsigned_tx_ed25519(&hex_tx, "", DEV);
        let tx = parse_tx(&out);

        let mut h = Blake2b256::new();
        h.update(tx.body().to_bytes());
        let body_hash = h.finalize().to_vec();

        let dev_seed: [u8; 32] = hex::decode(DEV).unwrap().try_into().unwrap();
        let want = csl::PrivateKey::from_normal_bytes(&dev_seed)
            .unwrap()
            .to_public();

        let vkeys = tx.witness_set().vkeys().unwrap();
        let w = (0..vkeys.len())
            .map(|i| vkeys.get(i))
            .find(|w| w.vkey().public_key().as_bytes() == want.as_bytes())
            .expect("phải có witness của DeviceKey");

        // Chữ ký phải kiểm được trên blake2b-256(tx_body) — nếu băm sai chỗ thì
        // tx vẫn dựng ra được, vẫn nộp được, và chỉ chết ở chuỗi.
        let vk = VerifyingKey::from_bytes(&want.as_bytes().try_into().unwrap()).unwrap();
        let sig_bytes: [u8; 64] = w.signature().to_bytes().try_into().unwrap();
        vk.verify(&body_hash, &Signature::from_bytes(&sig_bytes))
            .expect("chữ ký DeviceKey phải kiểm lại được trên hash thân tx");
    }

    #[test]
    fn ed25519_witness_hai_tham_so_rong_thi_bao_loi_chu_khong_tra_tx_nguyen() {
        let hex_tx = build_ada(3_000_000, &utxos_ada(10_000_000));
        assert!(
            witness_unsigned_tx_ed25519(&hex_tx, "", "").is_empty(),
            "không thêm khoá nào mà vẫn trả tx thì caller tưởng đã ký"
        );
    }

    #[test]
    fn ed25519_witness_bac_kek_va_device_sai_do_dai() {
        let hex_tx = build_ada(3_000_000, &utxos_ada(10_000_000));
        assert!(witness_unsigned_tx_ed25519(&hex_tx, "ab", "").is_empty(), "KEK 1 byte");
        assert!(witness_unsigned_tx_ed25519(&hex_tx, "", "ab").is_empty(), "device 1 byte");
        assert!(witness_unsigned_tx_ed25519("zz", KEK, DEV).is_empty(), "cbor không phải hex");
    }

    // ── Test 7: signed CBOR re-parses as a Transaction ────────────
    #[test]
    fn signed_tx_parses_as_transaction() {
        let utxos = utxos_ada(10_000_000);
        let hex_tx = build_ada(3_000_000, &utxos);
        assert!(!hex_tx.is_empty());

        // Round-trip: hex → bytes → Transaction → bytes → hex (stable).
        let tx = parse_tx(&hex_tx);
        let reser = hex::encode(tx.to_bytes());
        let tx2 = parse_tx(&reser);
        assert_eq!(
            tx.body().inputs().len(),
            tx2.body().inputs().len(),
            "re-parsed tx must have the same input count"
        );
        assert!(
            tx2.witness_set().vkeys().is_some(),
            "re-parsed tx must keep its witness"
        );
    }

    // ── Test 8: max-u64 asset quantity (2^64−1) parses + builds ───
    // P1 seam: a junk/max-supply token quantity must NOT panic, overflow, or
    // brick spend. The UTxO carries 10 tADA + 2^64−1 LAMP; we send 1 LAMP and
    // expect a valid tx whose change keeps (2^64−1 − 1) LAMP (no mint/burn).
    #[test]
    fn transfer_max_u64_asset_quantity_parses_and_builds() {
        const MAX_U64: u64 = u64::MAX; // 18446744073709551615 = 2^64 − 1
        // Sanity: the string we feed serde is exactly 2^64−1.
        assert_eq!(MAX_U64.to_string(), "18446744073709551615");

        let utxos = utxos_lamp(10_000_000, MAX_U64);
        // Round-trip the deserializer in isolation first (no overflow/panic).
        let parsed: Vec<TransferUtxo> = serde_json::from_str(&utxos)
            .expect("max-u64 quantity must deserialize");
        assert_eq!(parsed[0].assets[0].quantity, MAX_U64);
        assert_eq!(parsed[0].lovelace, 10_000_000);

        // Full build: send 1 LAMP, recipient gets a 2 tADA floor.
        let hex_tx = build_signed_transfer(
            SEED, ACCOUNT, &recipient_addr(),
            2_000_000, 1, LAMP_POLICY, LAMP_NAME,
            &utxos, &preprod_params(), 0,
        );
        assert!(
            !hex_tx.is_empty(),
            "transfer of a UTxO holding 2^64−1 LAMP must still build"
        );

        let tx = parse_tx(&hex_tx);
        let outs = tx.body().outputs();
        let policy = ScriptHash::from_bytes(hex::decode(LAMP_POLICY).unwrap()).unwrap();
        let name = AssetName::new(hex::decode(LAMP_NAME).unwrap()).unwrap();
        let recipient = recipient_addr();
        let sender = cardano::derive_address_account(SEED.to_string(), ACCOUNT, 0);

        let mut recipient_lamp = 0u64;
        let mut change_lamp = 0u64;
        for i in 0..outs.len() {
            let o = outs.get(i);
            let addr = o.address().to_bech32(None).unwrap();
            if let Some(ma) = o.amount().multiasset() {
                let q: u64 = ma.get_asset(&policy, &name).to_str().parse().unwrap();
                if addr == recipient {
                    recipient_lamp += q;
                } else if addr == sender {
                    change_lamp += q;
                }
            }
        }
        assert_eq!(recipient_lamp, 1, "recipient must hold exactly 1 LAMP");
        assert_eq!(
            change_lamp,
            MAX_U64 - 1,
            "change must keep 2^64−1 − 1 LAMP (no mint/burn, no overflow)"
        );
    }

    // ── Test 9: numeric (non-string) quantity still tolerated ─────
    // The deserializer accepts a JSON number as well as a string, so an older
    // caller or a different data provider that emits numbers does not break.
    #[test]
    fn transfer_numeric_quantity_still_parses() {
        let utxos = format!(
            r#"[{{"tx_hash":"{}","index":0,"lovelace":10000000,"assets":[{{"policy":"{}","name":"{}","quantity":1000}}]}}]"#,
            "33".repeat(32),
            LAMP_POLICY,
            LAMP_NAME,
        );
        let parsed: Vec<TransferUtxo> =
            serde_json::from_str(&utxos).expect("numeric quantity must still parse");
        assert_eq!(parsed[0].lovelace, 10_000_000);
        assert_eq!(parsed[0].assets[0].quantity, 1000);
    }

    // ── Test 10: ADA-only recipient below min-ada → "" ────────────
    // A pure-ADA output under the ledger's ~1 ADA min-UTxO cannot be carried;
    // CSL build() rejects it and we surface "" (never a doomed tx). This locks
    // the safe behaviour the Dart layer's error message now explains.
    #[test]
    fn transfer_below_min_ada_recipient_returns_empty() {
        // 100_000 lovelace = 0.1 ADA, well under the ~1 ADA min for a base addr.
        let utxos = utxos_ada(10_000_000);
        let hex_tx = build_ada(100_000, &utxos);
        assert!(
            hex_tx.is_empty(),
            "ADA-only recipient below min-ada must return empty, got: {}",
            hex_tx
        );
    }

    // ── Test 11: zero amount → "" ─────────────────────────────────
    // amount_lovelace == 0 for an ADA-only send is degenerate (a zero-value
    // output is below min-ada). Must return "" rather than build a junk tx.
    #[test]
    fn transfer_zero_amount_returns_empty() {
        let utxos = utxos_ada(10_000_000);
        let hex_tx = build_ada(0, &utxos);
        assert!(
            hex_tx.is_empty(),
            "zero-amount ADA recipient must return empty, got: {}",
            hex_tx
        );
    }

    // ── Test 12: recipient on the wrong network → "" ──────────────
    // A recipient address minted for mainnet (network_id 1) handed to a build
    // targeting testnet (network=0) must be refused BEFORE any tx is assembled,
    // so we never produce a tx the node would reject or that could misdirect
    // funds across networks.
    #[test]
    fn transfer_wrong_network_address_returns_empty() {
        // Derive a recipient address on MAINNET (network=1) from a fixed seed,
        // then try to spend to it while building for TESTNET (network=0).
        let mainnet_recipient = cardano::derive_address_account(
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".to_string(),
            7,
            1, // mainnet
        );
        assert!(
            !mainnet_recipient.is_empty(),
            "fixture: mainnet recipient address must derive"
        );

        let utxos = utxos_ada(10_000_000);
        let hex_tx = build_signed_transfer(
            SEED, ACCOUNT, &mainnet_recipient,
            3_000_000, 0, "", "",
            &utxos, &preprod_params(),
            0, // building for TESTNET — mismatch with the mainnet address
        );
        assert!(
            hex_tx.is_empty(),
            "mainnet recipient with network=0 must return empty, got: {}",
            hex_tx
        );

        // Control: the SAME address with network=1 (matching) builds fine,
        // proving the guard rejects on mismatch, not on the address itself.
        let ok = build_signed_transfer(
            SEED, ACCOUNT, &mainnet_recipient,
            3_000_000, 0, "", "",
            &utxos, &preprod_params(),
            1, // matching network
        );
        assert!(
            !ok.is_empty(),
            "matching-network recipient must build (guard must not over-reject)"
        );
    }
}
