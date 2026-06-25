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
use jni::sys::jstring;
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
