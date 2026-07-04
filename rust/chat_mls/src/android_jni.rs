// ================================================================
// Android JNI shim cho chat_mls.
//
// iOS gọi C-ABI trực tiếp (ffi.rs). Android (Kotlin) cần symbol JNI
// `Java_<pkg>_<Class>_<method>` → file này bọc lõi `crate::ffi::core_*`.
// Chỉ build khi target_os = "android".
//
// Class Kotlin: com.aladincontract.company.ChatMlsModule
//   external fun nativeNew(stakeAddress: String): Long            // handle, 0 = lỗi
//   external fun nativeImportState(stateB64: String): Long        // handle, 0 = lỗi
//   external fun nativeFree(handle: Long)
//   external fun nativeExportState(handle: Long): String          // JSON
//   external fun nativeGenerateKeyPackage(handle: Long): String
//   external fun nativeCreateGroup(handle: Long, conv: String, membersJson: String): String
//   external fun nativeJoinFromWelcome(handle: Long, welcomeB64: String): String
//   external fun nativeProcessCommit(handle: Long, conv: String, commitB64: String): String
//   external fun nativeEncrypt(handle: Long, conv: String, plaintext: String): String
//   external fun nativeDecrypt(handle: Long, conv: String, bodyB64: String): String
// Tất cả hàm String trả JSON {"ok":bool, ...} (giống C-ABI).
// ================================================================
#![cfg(target_os = "android")]

use jni::objects::{JClass, JString};
use jni::sys::{jlong, jstring};
use jni::JNIEnv;

use crate::ffi;
use crate::mls::MlsIdentity;

fn null_jstring() -> jstring {
    std::ptr::null_mut()
}

/// Đọc JString → String, "" nếu lỗi.
fn jstr(env: &mut JNIEnv, s: &JString) -> String {
    env.get_string(s).map(|x| x.into()).unwrap_or_default()
}

/// String (JSON) → jstring.
fn out(env: &JNIEnv, s: String) -> jstring {
    env.new_string(s).map(|x| x.into_raw()).unwrap_or_else(|_| null_jstring())
}

/// jlong handle → &mut MlsIdentity (None nếu 0).
unsafe fn ident<'a>(handle: jlong) -> Option<&'a mut MlsIdentity> {
    if handle == 0 { None } else { Some(&mut *(handle as *mut MlsIdentity)) }
}

fn err_json() -> String {
    r#"{"ok":false,"error":"handle rỗng"}"#.to_string()
}

// ─── vòng đời ─────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeNew<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    stake_address: JString<'l>,
) -> jlong {
    let addr = jstr(&mut env, &stake_address);
    match ffi::core_new(&addr) {
        Some(b) => Box::into_raw(b) as jlong,
        None => 0,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeImportState<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    state_b64: JString<'l>,
) -> jlong {
    let s = jstr(&mut env, &state_b64);
    match ffi::core_import_state(&s) {
        Some(b) => Box::into_raw(b) as jlong,
        None => 0,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeFree<'l>(
    _env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
) {
    if handle != 0 {
        unsafe { drop(Box::from_raw(handle as *mut MlsIdentity)) };
    }
}

// ─── thao tác (đều gọi crate::ffi::core_*) ────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeExportState<'l>(
    env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
) -> jstring {
    let json = match unsafe { ident(handle) } { Some(id) => ffi::core_export_state(id), None => err_json() };
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeGenerateKeyPackage<'l>(
    env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
) -> jstring {
    let json = match unsafe { ident(handle) } { Some(id) => ffi::core_generate_key_package(id), None => err_json() };
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeCreateGroup<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
    conv: JString<'l>,
    members_json: JString<'l>,
) -> jstring {
    let conv = jstr(&mut env, &conv);
    let members = jstr(&mut env, &members_json);
    let json = match unsafe { ident(handle) } { Some(id) => ffi::core_create_group(id, &conv, &members), None => err_json() };
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeJoinFromWelcome<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
    welcome_b64: JString<'l>,
) -> jstring {
    let w = jstr(&mut env, &welcome_b64);
    let json = match unsafe { ident(handle) } { Some(id) => ffi::core_join_from_welcome(id, &w), None => err_json() };
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeProcessCommit<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
    conv: JString<'l>,
    commit_b64: JString<'l>,
) -> jstring {
    let conv = jstr(&mut env, &conv);
    let commit = jstr(&mut env, &commit_b64);
    let json = match unsafe { ident(handle) } { Some(id) => ffi::core_process_commit(id, &conv, &commit), None => err_json() };
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeEncrypt<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
    conv: JString<'l>,
    plaintext: JString<'l>,
) -> jstring {
    let conv = jstr(&mut env, &conv);
    let text = jstr(&mut env, &plaintext);
    let json = match unsafe { ident(handle) } { Some(id) => ffi::core_encrypt(id, &conv, &text), None => err_json() };
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeDecrypt<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    handle: jlong,
    conv: JString<'l>,
    body_b64: JString<'l>,
) -> jstring {
    let conv = jstr(&mut env, &conv);
    let body = jstr(&mut env, &body_b64);
    let json = match unsafe { ident(handle) } { Some(id) => ffi::core_decrypt(id, &conv, &body), None => err_json() };
    out(&env, json)
}

// ─── Merkle (stateless — không handle) ────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeCreateMerkleLeaf<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    conv: JString<'l>,
    sender_id: JString<'l>,
    timestamp_ms: JString<'l>,
    plaintext: JString<'l>,
    salt_hex: JString<'l>,
    session_seed_hex: JString<'l>,
    delegation_cert: JString<'l>,
    wallet_cose_key: JString<'l>,
) -> jstring {
    let conv = jstr(&mut env, &conv);
    let sender = jstr(&mut env, &sender_id);
    let ts = jstr(&mut env, &timestamp_ms);
    let pt = jstr(&mut env, &plaintext);
    let salt = jstr(&mut env, &salt_hex);
    let seed = jstr(&mut env, &session_seed_hex);
    let cert = jstr(&mut env, &delegation_cert);
    let cose = jstr(&mut env, &wallet_cose_key);
    let json = ffi::core_create_merkle_leaf(&conv, &sender, &ts, &pt, &salt, &seed, &cert, &cose);
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeVerifyMerkleLeaf<'l>(
    mut env: JNIEnv<'l>,
    _c: JClass<'l>,
    leaf_json: JString<'l>,
    conv: JString<'l>,
    sender_id: JString<'l>,
    timestamp_ms: JString<'l>,
    plaintext: JString<'l>,
    salt_hex: JString<'l>,
) -> jstring {
    let leaf = jstr(&mut env, &leaf_json);
    let conv = jstr(&mut env, &conv);
    let sender = jstr(&mut env, &sender_id);
    let ts = jstr(&mut env, &timestamp_ms);
    let pt = jstr(&mut env, &plaintext);
    let salt = jstr(&mut env, &salt_hex);
    let json = ffi::core_verify_merkle_leaf(&leaf, &conv, &sender, &ts, &pt, &salt);
    out(&env, json)
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_ChatMlsModule_nativeNewSessionEd25519<'l>(
    env: JNIEnv<'l>,
    _c: JClass<'l>,
) -> jstring {
    out(&env, ffi::core_new_session_ed25519())
}
