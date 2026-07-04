//! Lõi FFI cho chat_mls — logic dùng chung bởi C-ABI (iOS, dưới đây) và JNI (Android,
//! [`crate::android_jni`]). Mỗi thao tác có một hàm `core_*` trả `String` (JSON), để cả
//! hai cầu chỉ còn việc chuyển đổi chuỗi.
//!
//! Danh tính STATEFUL → handle `u64` (con trỏ `MlsIdentity`), tạo bằng [`chat_mls_new`],
//! huỷ bằng [`chat_mls_free`]. Mọi hàm JSON: `{"ok":true,...}` hoặc `{"ok":false,"error":..}`.

use std::ffi::{c_char, CStr, CString};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::json;

use crate::merkle;
use crate::message_layer::{self, PlainContent};
use crate::mls::{GroupState, MlsIdentity};

// ═══ CORE (dùng chung C-ABI + JNI) ════════════════════════════════

pub(crate) fn core_new(stake_address: &str) -> Option<Box<MlsIdentity>> {
    MlsIdentity::new(stake_address).ok().map(Box::new)
}

pub(crate) fn core_import_state(state_b64: &str) -> Option<Box<MlsIdentity>> {
    let bytes = B64.decode(state_b64).ok()?;
    MlsIdentity::import_state(&bytes).ok().map(Box::new)
}

pub(crate) fn core_export_state(id: &MlsIdentity) -> String {
    match id.export_state() {
        Ok(b) => ok(json!({ "state": B64.encode(b) })),
        Err(e) => fail(e),
    }
}

pub(crate) fn core_generate_key_package(id: &MlsIdentity) -> String {
    match id.generate_key_package() {
        Ok(kp) => ok(json!({ "keyPackage": kp })),
        Err(e) => fail(e),
    }
}

pub(crate) fn core_create_group(id: &mut MlsIdentity, conv: &str, members_json: &str) -> String {
    let members: Vec<String> = if members_json.is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(members_json).unwrap_or_default()
    };
    match id.create_group(conv, &members) {
        Ok(st) => ok(group_state_json(&st)),
        Err(e) => fail(e),
    }
}

pub(crate) fn core_join_from_welcome(id: &mut MlsIdentity, welcome_b64: &str) -> String {
    match id.join_from_welcome(welcome_b64) {
        Ok(st) => ok(group_state_json(&st)),
        Err(e) => fail(e),
    }
}

pub(crate) fn core_process_commit(id: &mut MlsIdentity, conv: &str, commit_b64: &str) -> String {
    match id.process_commit(conv, commit_b64) {
        Ok(st) => ok(group_state_json(&st)),
        Err(e) => fail(e),
    }
}

/// Mã hoá tin (tầng 2). Tự sinh salt + messageId. Trả `{ok, body, epoch, messageId, salt}`.
pub(crate) fn core_encrypt(id: &MlsIdentity, conv: &str, plaintext: &str) -> String {
    let epoch = match id.current_epoch(conv) { Some(e) => e, None => return fail("chưa mở nhóm") };
    let es_hex = match id.epoch_secret_hex(conv) { Some(s) => s, None => return fail("thiếu epoch_secret") };
    let es = match hex::decode(&es_hex) { Ok(b) => b, Err(e) => return fail(e) };

    let salt = random_salt_hex();
    let plain = PlainContent { salt: salt.clone(), nonce: String::new(), plaintext: plaintext.to_string() };
    match message_layer::encrypt_new(&es, epoch, &plain) {
        Ok(body) => match message_layer::encode_body_b64(&body) {
            Ok(body_b64) => ok(json!({
                "body": body_b64, "epoch": body.epoch, "messageId": body.message_id, "salt": salt
            })),
            Err(e) => fail(e),
        },
        Err(e) => fail(e),
    }
}

/// Giải mã tin: `body_b64` = `encryptedContent.body` từ WS. Dùng epoch_secret đúng epoch trong body.
pub(crate) fn core_decrypt(id: &MlsIdentity, conv: &str, body_b64: &str) -> String {
    let body = match message_layer::decode_body_b64(body_b64) { Ok(b) => b, Err(e) => return fail(e) };
    let es_hex = match id.epoch_secret_for(conv, body.epoch) {
        Some(s) => s,
        None => return fail(format!("thiếu epoch_secret cho epoch {}", body.epoch)),
    };
    let es = match hex::decode(&es_hex) { Ok(b) => b, Err(e) => return fail(e) };
    match message_layer::decrypt(&es, &body) {
        Ok(pc) => ok(json!({ "plaintext": pc.plaintext, "salt": pc.salt, "epoch": body.epoch })),
        Err(e) => fail(e),
    }
}

// ─── Merkle tầng 3 (stateless — không cần handle) ─────────────────

/// Tạo Merkle leaf (DIRECT/JOB_NEGOTIATION). `session_seed_hex` = 32-byte Ed25519 seed
/// của session key; `delegation_cert` + `wallet_cose_key` (base64) là COSE từ ví (CIP-30),
/// mang theo dạng opaque. `timestamp_ms` là chuỗi số. Trả `{ok, merkleLeaf}`.
#[allow(clippy::too_many_arguments)]
pub(crate) fn core_create_merkle_leaf(
    conversation_id: &str,
    sender_id: &str,
    timestamp_ms: &str,
    plaintext: &str,
    salt_hex: &str,
    session_seed_hex: &str,
    delegation_cert: &str,
    wallet_cose_key: &str,
) -> String {
    let ts: u128 = match timestamp_ms.parse() { Ok(t) => t, Err(_) => return fail("timestamp_ms không hợp lệ") };
    let seed: [u8; 32] = match hex::decode(session_seed_hex).ok().and_then(|b| b.try_into().ok()) {
        Some(s) => s,
        None => return fail("session_seed_hex phải 32 byte hex"),
    };
    let sk = ed25519_dalek::SigningKey::from_bytes(&seed);
    match merkle::create_merkle_leaf(
        conversation_id, sender_id, ts, plaintext, salt_hex, &sk, delegation_cert, wallet_cose_key,
    ) {
        Ok(leaf) => match serde_json::to_value(&leaf) {
            Ok(v) => ok(json!({ "merkleLeaf": v })),
            Err(e) => fail(e),
        },
        Err(e) => fail(e),
    }
}

/// Verify Merkle leaf: tính lại ptCommit/leafHash + verify chữ ký session. Trả `{ok, valid}`.
pub(crate) fn core_verify_merkle_leaf(
    leaf_json: &str,
    conversation_id: &str,
    sender_id: &str,
    timestamp_ms: &str,
    plaintext: &str,
    salt_hex: &str,
) -> String {
    let ts: u128 = match timestamp_ms.parse() { Ok(t) => t, Err(_) => return fail("timestamp_ms không hợp lệ") };
    let leaf: merkle::MerkleLeaf = match serde_json::from_str(leaf_json) { Ok(l) => l, Err(e) => return fail(e) };
    match merkle::verify_merkle_leaf(&leaf, conversation_id, sender_id, ts, plaintext, salt_hex) {
        Ok(valid) => ok(json!({ "valid": valid })),
        Err(e) => fail(e),
    }
}

/// Sinh cặp khoá **Ed25519 session** mới (cho uỷ nhiệm Merkle tier-3). Trả
/// `{ok, seedHex(32B), publicKeyHex(32B)}`. `seedHex` đưa lại `create_merkle_leaf`
/// để ký leaf; `publicKeyHex` là khoá công khai session mà khoá DID (P-256) ký uỷ
/// nhiệm ở tầng JS (`delegationCert`). Stateless — không giữ trạng thái native.
pub(crate) fn core_new_session_ed25519() -> String {
    let mut seed = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut seed);
    let sk = ed25519_dalek::SigningKey::from_bytes(&seed);
    let pub_hex = hex::encode(sk.verifying_key().to_bytes());
    ok(json!({ "seedHex": hex::encode(seed), "publicKeyHex": pub_hex }))
}

// ─── helper JSON / salt ───────────────────────────────────────────

fn group_state_json(st: &GroupState) -> serde_json::Value {
    json!({ "epoch": st.epoch, "epochSecret": st.epoch_secret_hex, "welcome": st.welcome_b64, "commit": st.commit_b64 })
}

fn ok(value: serde_json::Value) -> String {
    let mut obj = serde_json::Map::new();
    obj.insert("ok".into(), json!(true));
    if let serde_json::Value::Object(m) = value {
        obj.extend(m);
    }
    serde_json::Value::Object(obj).to_string()
}

fn fail(msg: impl std::fmt::Display) -> String {
    json!({ "ok": false, "error": msg.to_string() }).to_string()
}

fn random_salt_hex() -> String {
    let mut b = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut b);
    hex::encode(b)
}

// ═══ C-ABI (iOS) ══════════════════════════════════════════════════

/// Free chuỗi do thư viện trả về.
#[no_mangle]
pub unsafe extern "C" fn chat_mls_free_string(s: *mut c_char) {
    if !s.is_null() {
        drop(CString::from_raw(s));
    }
}

/// Huỷ handle danh tính.
#[no_mangle]
pub unsafe extern "C" fn chat_mls_free(handle: u64) {
    if handle != 0 {
        drop(Box::from_raw(handle as *mut MlsIdentity));
    }
}

unsafe fn c_str(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() { None } else { CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string()) }
}

fn to_c(s: String) -> *mut c_char {
    CString::new(s).map(|c| c.into_raw()).unwrap_or(std::ptr::null_mut())
}

unsafe fn ident<'a>(handle: u64) -> Option<&'a mut MlsIdentity> {
    if handle == 0 { None } else { Some(&mut *(handle as *mut MlsIdentity)) }
}

fn err_json() -> *mut c_char {
    to_c(fail("handle rỗng hoặc tham số null"))
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_new(stake_address: *const c_char) -> u64 {
    match c_str(stake_address).and_then(|a| core_new(&a)) {
        Some(b) => Box::into_raw(b) as u64,
        None => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_import_state(state_b64: *const c_char) -> u64 {
    match c_str(state_b64).and_then(|s| core_import_state(&s)) {
        Some(b) => Box::into_raw(b) as u64,
        None => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_export_state(handle: u64) -> *mut c_char {
    match ident(handle) { Some(id) => to_c(core_export_state(id)), None => err_json() }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_generate_key_package(handle: u64) -> *mut c_char {
    match ident(handle) { Some(id) => to_c(core_generate_key_package(id)), None => err_json() }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_create_group(
    handle: u64,
    conversation_id: *const c_char,
    member_key_packages_json: *const c_char,
) -> *mut c_char {
    match (ident(handle), c_str(conversation_id)) {
        (Some(id), Some(conv)) => {
            let members = c_str(member_key_packages_json).unwrap_or_default();
            to_c(core_create_group(id, &conv, &members))
        }
        _ => err_json(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_join_from_welcome(handle: u64, welcome_b64: *const c_char) -> *mut c_char {
    match (ident(handle), c_str(welcome_b64)) {
        (Some(id), Some(w)) => to_c(core_join_from_welcome(id, &w)),
        _ => err_json(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_process_commit(
    handle: u64,
    conversation_id: *const c_char,
    commit_b64: *const c_char,
) -> *mut c_char {
    match (ident(handle), c_str(conversation_id), c_str(commit_b64)) {
        (Some(id), Some(conv), Some(c)) => to_c(core_process_commit(id, &conv, &c)),
        _ => err_json(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_encrypt(
    handle: u64,
    conversation_id: *const c_char,
    plaintext: *const c_char,
) -> *mut c_char {
    match (ident(handle), c_str(conversation_id), c_str(plaintext)) {
        (Some(id), Some(conv), Some(t)) => to_c(core_encrypt(id, &conv, &t)),
        _ => err_json(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_decrypt(
    handle: u64,
    conversation_id: *const c_char,
    body_b64: *const c_char,
) -> *mut c_char {
    match (ident(handle), c_str(conversation_id), c_str(body_b64)) {
        (Some(id), Some(conv), Some(b)) => to_c(core_decrypt(id, &conv, &b)),
        _ => err_json(),
    }
}

// ─── Merkle (stateless — không handle) ────────────────────────────

#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn chat_mls_create_merkle_leaf(
    conversation_id: *const c_char,
    sender_id: *const c_char,
    timestamp_ms: *const c_char,
    plaintext: *const c_char,
    salt_hex: *const c_char,
    session_seed_hex: *const c_char,
    delegation_cert: *const c_char,
    wallet_cose_key: *const c_char,
) -> *mut c_char {
    match (
        c_str(conversation_id), c_str(sender_id), c_str(timestamp_ms), c_str(plaintext),
        c_str(salt_hex), c_str(session_seed_hex), c_str(delegation_cert), c_str(wallet_cose_key),
    ) {
        (Some(conv), Some(sender), Some(ts), Some(pt), Some(salt), Some(seed), Some(cert), Some(cose)) =>
            to_c(core_create_merkle_leaf(&conv, &sender, &ts, &pt, &salt, &seed, &cert, &cose)),
        _ => err_json(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn chat_mls_verify_merkle_leaf(
    leaf_json: *const c_char,
    conversation_id: *const c_char,
    sender_id: *const c_char,
    timestamp_ms: *const c_char,
    plaintext: *const c_char,
    salt_hex: *const c_char,
) -> *mut c_char {
    match (
        c_str(leaf_json), c_str(conversation_id), c_str(sender_id),
        c_str(timestamp_ms), c_str(plaintext), c_str(salt_hex),
    ) {
        (Some(leaf), Some(conv), Some(sender), Some(ts), Some(pt), Some(salt)) =>
            to_c(core_verify_merkle_leaf(&leaf, &conv, &sender, &ts, &pt, &salt)),
        _ => err_json(),
    }
}

/// Sinh cặp khoá Ed25519 session mới. Trả `{ok, seedHex, publicKeyHex}`.
#[no_mangle]
pub extern "C" fn chat_mls_new_session_ed25519() -> *mut c_char {
    to_c(core_new_session_ed25519())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Golden vector (khớp merkle.rs tests): tạo leaf rồi verify → valid.
    #[test]
    fn merkle_ffi_create_then_verify() {
        let seed_hex = "11".repeat(32);
        let salt = "ab".repeat(32);
        let created = core_create_merkle_leaf(
            "conv-direct-0001", "stake1uxyztestsenderaddress", "1700000000000",
            "xin chào 🌱", &salt, &seed_hex, "cert-b64", "cose-b64",
        );
        let v: serde_json::Value = serde_json::from_str(&created).unwrap();
        assert_eq!(v["ok"], true, "create_merkle_leaf lỗi: {created}");
        let leaf_json = v["merkleLeaf"].to_string();

        let verified = core_verify_merkle_leaf(
            &leaf_json, "conv-direct-0001", "stake1uxyztestsenderaddress",
            "1700000000000", "xin chào 🌱", &salt,
        );
        let vv: serde_json::Value = serde_json::from_str(&verified).unwrap();
        assert_eq!(vv["ok"], true);
        assert_eq!(vv["valid"], true, "verify phải PASS: {verified}");

        // Sai plaintext → valid=false
        let bad = core_verify_merkle_leaf(
            &leaf_json, "conv-direct-0001", "stake1uxyztestsenderaddress",
            "1700000000000", "sai", &salt,
        );
        assert_eq!(serde_json::from_str::<serde_json::Value>(&bad).unwrap()["valid"], false);
    }

    // Sinh khoá session rồi dùng chính seed đó tạo leaf → signerPublicKey khớp publicKeyHex.
    #[test]
    fn new_session_key_then_sign_leaf() {
        let gen: serde_json::Value =
            serde_json::from_str(&core_new_session_ed25519()).unwrap();
        assert_eq!(gen["ok"], true);
        let seed_hex = gen["seedHex"].as_str().unwrap();
        let pub_hex = gen["publicKeyHex"].as_str().unwrap();
        assert_eq!(seed_hex.len(), 64, "seed 32 byte hex");
        assert_eq!(pub_hex.len(), 64, "pub 32 byte hex");

        let salt = "cd".repeat(32);
        let created = core_create_merkle_leaf(
            "conv-direct-0002", "did:phoenix:aaaaaaaaaaaaa:{}", "1700000000001",
            "hello session", &salt, seed_hex, "cert", "cose",
        );
        let v: serde_json::Value = serde_json::from_str(&created).unwrap();
        assert_eq!(v["ok"], true, "create lỗi: {created}");
        assert_eq!(
            v["merkleLeaf"]["signerPublicKey"].as_str().unwrap(),
            pub_hex,
            "signerPublicKey của leaf phải == publicKeyHex sinh ra",
        );
    }
}
