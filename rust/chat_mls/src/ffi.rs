//! Lõi FFI cho chat_mls — logic dùng chung bởi C-ABI (iOS, dưới đây) và JNI (Android,
//! [`crate::android_jni`]). Mỗi thao tác có một hàm `core_*` trả `String` (JSON), để cả
//! hai cầu chỉ còn việc chuyển đổi chuỗi.
//!
//! Danh tính STATEFUL → handle `u64` (con trỏ `MlsIdentity`), tạo bằng [`chat_mls_new`],
//! huỷ bằng [`chat_mls_free`]. Mọi hàm JSON: `{"ok":true,...}` hoặc `{"ok":false,"error":..}`.

use std::ffi::{c_char, CStr, CString};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::json;

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
