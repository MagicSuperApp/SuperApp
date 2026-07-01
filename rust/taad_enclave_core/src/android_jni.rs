// ================================================================
// Android JNI shim cho taad_enclave_core (PhoenixKey Enclave).
//
// iOS gọi C ABI trực tiếp (dart:ffi-style, xem lib.rs). Android (Kotlin) cần
// symbol theo quy ước JNI `Java_<pkg>_<Class>_<method>` → file này bọc các hàm
// crypto thuần Rust thành export JNI. Chỉ build khi target_os = "android".
//
// Class Kotlin: com.aladincontract.company.TaadEnclaveModule
//   external fun nativeGenerateMasterKek(): String
//   external fun nativeMasterKekToMnemonic(kekHex: String): String?   (null = lỗi)
//   external fun nativeMnemonicToMasterKek(words: String): String?    (null = lỗi)
//
// Tái dùng crate::crypto (KEK/BIP39) — KHÔNG đi qua C FFI, gọi Rust trực tiếp.
// ================================================================
#![cfg(target_os = "android")]

use jni::objects::{JClass, JString};
use jni::sys::{jint, jstring};
use jni::JNIEnv;

/// Trả jstring rỗng/null an toàn khi lỗi.
fn null_jstring() -> jstring {
    std::ptr::null_mut()
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeGenerateMasterKek<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let kek = crate::crypto::generate_master_kek();
    match env.new_string(kek) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeMasterKekToMnemonic<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
) -> jstring {
    let kek: String = match env.get_string(&kek_hex) {
        Ok(s) => s.into(),
        Err(_) => return null_jstring(),
    };
    let phrase = crate::crypto::master_kek_to_mnemonic(kek);
    if phrase.is_empty() {
        return null_jstring();
    }
    match env.new_string(phrase) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeMnemonicToMasterKek<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    words: JString<'local>,
) -> jstring {
    let words: String = match env.get_string(&words) {
        Ok(s) => s.into(),
        Err(_) => return null_jstring(),
    };
    let kek = crate::crypto::mnemonic_to_master_kek(words);
    if kek.is_empty() {
        return null_jstring();
    }
    match env.new_string(kek) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}

// ─── Mobile derive (composed) + wrapping primitives ──────────────────────────
// Cùng pattern: lấy chuỗi UTF-8 từ JString, gọi crate, trả jstring (null nếu rỗng).

#[inline]
fn jstr<'l>(env: &mut JNIEnv<'l>, s: &JString<'l>) -> Option<String> {
    env.get_string(s).ok().map(|v| v.into())
}

#[inline]
fn ret<'l>(env: &JNIEnv<'l>, out: String) -> jstring {
    if out.is_empty() {
        return null_jstring();
    }
    match env.new_string(out) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveTaadPubkey<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::derive_taad_pubkey(kek))
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveWalletSeed<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::derive_wallet_seed(kek))
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveWalletAddress<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
    account: jint,
    network: jint,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::derive_wallet_address(kek, account as u32, network as u8))
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeGenerateSalt<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    ret(&env, crate::crypto::generate_salt())
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativePbkdf2Derive<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    pin: JString<'local>,
    salt_hex: JString<'local>,
) -> jstring {
    let pin = match jstr(&mut env, &pin) { Some(s) => s, None => return null_jstring() };
    let salt = match jstr(&mut env, &salt_hex) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::crypto::pbkdf2_derive(pin, salt))
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeAesGcmEncrypt<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    key_hex: JString<'local>,
    plaintext_hex: JString<'local>,
) -> jstring {
    let key = match jstr(&mut env, &key_hex) { Some(s) => s, None => return null_jstring() };
    let pt = match jstr(&mut env, &plaintext_hex) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::crypto::aes_gcm_encrypt(key, pt))
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeAesGcmDecrypt<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    key_hex: JString<'local>,
    encrypted_json: JString<'local>,
) -> jstring {
    let key = match jstr(&mut env, &key_hex) { Some(s) => s, None => return null_jstring() };
    let json = match jstr(&mut env, &encrypted_json) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::crypto::aes_gcm_decrypt(key, json))
}
