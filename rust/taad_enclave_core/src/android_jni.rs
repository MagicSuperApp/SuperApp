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
//   external fun nativeBuildCreateChildTaadUtxoTx(...14 args): String? (null = lỗi)
//   external fun nativeBuildMintLampViaDid(...13 args): String?        (null = lỗi)
//
// Tái dùng crate::crypto (KEK/BIP39) — KHÔNG đi qua C FFI, gọi Rust trực tiếp.
// Hai hàm OrgDID/mint dưới cũng gọi thẳng `crate::taad_did` / `crate::mint_lamp`
// (KHÔNG qua c_char) — cùng nguyên tắc: JNI shim chỉ marshal String<->jstring,
// logic nghiệp vụ chỉ có DUY NHẤT 1 bản trong module Rust tương ứng.
// ================================================================
#![cfg(target_os = "android")]

use jni::objects::{JClass, JString};
use jni::sys::{jlong, jstring};
use jni::JNIEnv;

/// Trả jstring rỗng/null an toàn khi lỗi.
fn null_jstring() -> jstring {
    std::ptr::null_mut()
}

/// Đọc 1 tham số JString bắt buộc; trả None nếu JNI lỗi (caller trả null_jstring()).
fn get_str<'local>(env: &mut JNIEnv<'local>, s: &JString<'local>) -> Option<String> {
    env.get_string(s).ok().map(|s| s.into())
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

/// Tạo CHILD DID (OrgDID) qua cổng `GenesisChild`. Khớp 1:1
/// `taad_did::build_create_child_taad_utxo_tx` (xem lib.rs::taad_build_create_child_taad_utxo_tx
/// để biết ý nghĩa từng tham số — Kotlin truyền theo ĐÚNG thứ tự này).
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeBuildCreateChildTaadUtxoTx<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    child_did: JString<'local>,
    owner_did: JString<'local>,
    entity_type: jni::sys::jint,
    hw_pub_hex: JString<'local>,
    child_taad_pub_hex: JString<'local>,
    owner_master_kek_hex: JString<'local>,
    wallet_seed_hex: JString<'local>,
    network: jni::sys::jint,
    taad_script_cbor_hex: JString<'local>,
    policy_id_hex: JString<'local>,
    owner_utxo_json: JString<'local>,
    utxo_inputs_json: JString<'local>,
    protocol_params_json: JString<'local>,
    current_slot: jlong,
) -> jstring {
    let child = match get_str(&mut env, &child_did) { Some(s) => s, None => return null_jstring() };
    let owner = match get_str(&mut env, &owner_did) { Some(s) => s, None => return null_jstring() };
    let hw = match get_str(&mut env, &hw_pub_hex) { Some(s) => s, None => return null_jstring() };
    let child_taad = match get_str(&mut env, &child_taad_pub_hex) { Some(s) => s, None => return null_jstring() };
    let owner_kek = match get_str(&mut env, &owner_master_kek_hex) { Some(s) => s, None => return null_jstring() };
    let seed = match get_str(&mut env, &wallet_seed_hex) { Some(s) => s, None => return null_jstring() };
    let script_cbor = match get_str(&mut env, &taad_script_cbor_hex) { Some(s) => s, None => return null_jstring() };
    let policy = match get_str(&mut env, &policy_id_hex) { Some(s) => s, None => return null_jstring() };
    let owner_utxo = match get_str(&mut env, &owner_utxo_json) { Some(s) => s, None => return null_jstring() };
    let utxos = match get_str(&mut env, &utxo_inputs_json) { Some(s) => s, None => return null_jstring() };
    let params = match get_str(&mut env, &protocol_params_json) { Some(s) => s, None => return null_jstring() };

    let result = crate::taad_did::build_create_child_taad_utxo_tx(
        &child, &owner, entity_type as u8, &hw, &child_taad, &owner_kek, &seed,
        network as u8, &script_cbor, &policy, &owner_utxo, &utxos, &params, current_slot as u64,
    );
    match result {
        Ok(tx_hex) => match env.new_string(tx_hex) {
            Ok(s) => s.into_raw(),
            Err(_) => null_jstring(),
        },
        Err(_) => null_jstring(),
    }
}

/// Ký tx MINT LAMP (bản B — Registry-gate + SupplyState + A-DEST kho). Khớp 1:1
/// `mint_lamp::build_mint_lamp_via_did` (xem lib.rs::taad_build_mint_lamp_via_did
/// để biết ý nghĩa từng tham số — Kotlin truyền theo ĐÚNG thứ tự này).
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeBuildMintLampViaDid<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    authority_keks_json: JString<'local>,
    registry_utxo_json: JString<'local>,
    token_tag_hex: JString<'local>,
    supply_state_utxo_json: JString<'local>,
    supply_state_script_cbor: JString<'local>,
    kho_utxo_json: JString<'local>,
    lamp_policy_cbor_hex: JString<'local>,
    mint_json: JString<'local>,
    utxos_json: JString<'local>,
    protocol_params_json: JString<'local>,
    wallet_seed_hex: JString<'local>,
    network: jni::sys::jint,
    current_slot: jlong,
) -> jstring {
    let auth_keks = match get_str(&mut env, &authority_keks_json) { Some(s) => s, None => return null_jstring() };
    let registry = match get_str(&mut env, &registry_utxo_json) { Some(s) => s, None => return null_jstring() };
    let token_tag = match get_str(&mut env, &token_tag_hex) { Some(s) => s, None => return null_jstring() };
    let supply_state = match get_str(&mut env, &supply_state_utxo_json) { Some(s) => s, None => return null_jstring() };
    let ss_script = match get_str(&mut env, &supply_state_script_cbor) { Some(s) => s, None => return null_jstring() };
    let kho = match get_str(&mut env, &kho_utxo_json) { Some(s) => s, None => return null_jstring() };
    let policy = match get_str(&mut env, &lamp_policy_cbor_hex) { Some(s) => s, None => return null_jstring() };
    let mint = match get_str(&mut env, &mint_json) { Some(s) => s, None => return null_jstring() };
    let utxos = match get_str(&mut env, &utxos_json) { Some(s) => s, None => return null_jstring() };
    let params = match get_str(&mut env, &protocol_params_json) { Some(s) => s, None => return null_jstring() };
    let seed = match get_str(&mut env, &wallet_seed_hex) { Some(s) => s, None => return null_jstring() };

    let result = crate::mint_lamp::build_mint_lamp_via_did(
        &auth_keks, &registry, &token_tag, &supply_state, &ss_script, &kho, &policy, &mint,
        &utxos, &params, &seed, network as u8, current_slot as u64,
    );
    match result {
        Ok(tx_hex) => match env.new_string(tx_hex) {
            Ok(s) => s.into_raw(),
            Err(_) => null_jstring(),
        },
        Err(_) => null_jstring(),
    }
}

// ─── Helpers OrgDID + mint LAMP (khớp lib.rs::taad_construct_did /
// taad_anchor_asset_name / taad_derive_taad_public_key / taad_derive_wallet_seed /
// taad_derive_cardano_address — cùng công thức, gọi thẳng module Rust). ────

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeConstructDid<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    type_byte: jni::sys::jint,
    creator_did: JString<'local>,
    slot: jlong,
) -> jstring {
    // creator_did có thể rỗng (root identity) — chuỗi rỗng ⇒ None, khớp
    // c_str_to_string(NULL) phía C-ABI (creator rỗng = root).
    let creator = get_str(&mut env, &creator_did).unwrap_or_default();
    let creator_opt = if creator.is_empty() { None } else { Some(creator.as_str()) };
    let did = crate::taad_did::construct_did(type_byte as u8, creator_opt, slot as u64);
    match env.new_string(did) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeAnchorAssetName<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    did: JString<'local>,
) -> jstring {
    let did_s = match get_str(&mut env, &did) { Some(s) => s, None => return null_jstring() };
    match crate::taad_did::anchor_asset_name_hex(&did_s) {
        Ok(hex) => match env.new_string(hex) {
            Ok(s) => s.into_raw(),
            Err(_) => null_jstring(),
        },
        Err(_) => null_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveTaadPublicKey<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    master_kek_hex: JString<'local>,
) -> jstring {
    let kek = match get_str(&mut env, &master_kek_hex) { Some(s) => s, None => return null_jstring() };
    let pubkey = crate::sign::derive_taad_public_key(kek);
    if pubkey.is_empty() {
        return null_jstring();
    }
    match env.new_string(pubkey) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveWalletSeed<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    master_kek_hex: JString<'local>,
) -> jstring {
    let kek = match get_str(&mut env, &master_kek_hex) { Some(s) => s, None => return null_jstring() };
    let seed = crate::crypto::hkdf_derive(kek, "wallet-v1".to_string(), String::new(), 32);
    if seed.is_empty() {
        return null_jstring();
    }
    match env.new_string(seed) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveCardanoAddress<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    wallet_seed_hex: JString<'local>,
    network: jni::sys::jint,
) -> jstring {
    let seed = match get_str(&mut env, &wallet_seed_hex) { Some(s) => s, None => return null_jstring() };
    let addr = crate::cardano::derive_address(seed, network as u8);
    if addr.is_empty() {
        return null_jstring();
    }
    match env.new_string(addr) {
        Ok(s) => s.into_raw(),
        Err(_) => null_jstring(),
    }
}
