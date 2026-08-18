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
use jni::sys::{jint, jlong, jstring};
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

// Ký Ed25519 bằng TAAD_Key (từ Master_KEK) — cho recover-device (ký challenge).
// iOS đã có C-ABI taad_sign_ed25519; đây là mắt xích JNI còn thiếu cho Android.
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeSignEd25519<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    master_kek_hex: JString<'local>,
    message: JString<'local>,
) -> jstring {
    let kek = match jstr(&mut env, &master_kek_hex) { Some(s) => s, None => return null_jstring() };
    let msg = match jstr(&mut env, &message) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::sign::sign_ed25519(kek, msg))
}

/// 2FA DeviceKey opt-in. Kotlin: nativeDeviceKeyOptin(userDid, nonce): String? (JSON).
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeviceKeyOptin<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    user_did: JString<'local>,
    nonce: JString<'local>,
) -> jstring {
    let did = match jstr(&mut env, &user_did) { Some(s) => s, None => return null_jstring() };
    let n = match jstr(&mut env, &nonce) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::sign::device_key_optin(did, n))
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

/// Địa-chỉ STAKE (reward) — cùng CIP-1852 với ví, nhánh role 2.
/// Kotlin: external fun nativeDeriveStakeAddress(kekHex: String, account: Int, network: Int): String?
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveStakeAddress<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
    account: jint,
    network: jint,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::derive_stake_address(kek, account as u32, network as u8))
}

/// Ký challenge proof-of-ownership /wallet/standard/register bằng payment key.
/// Kotlin: external fun nativeSignWalletRegister(kekHex: String, account: Int, message: String): String?
/// Trả JSON {"paymentPublicKeyHex","signature"} (null nếu KEK/seed sai).
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeSignWalletRegister<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
    account: jint,
    message: JString<'local>,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    let msg = match jstr(&mut env, &message) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::sign_wallet_register(kek, account as u32, msg))
}

/// Dựng + ký tx Cardano gửi ADA/LAMP (Issue #74). Kotlin:
/// nativeBuildSignedTransfer(kekHex, account, toAddress, amountLovelace, lampAmount,
///   lampPolicyHex, lampAssetNameHex, utxosJson, protocolParamsJson, network): String?
/// amount* là String (u64 vượt precision bridge). Trả CBOR hex đã ký (null nếu lỗi).
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeBuildSignedTransfer<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
    account: jint,
    to_address: JString<'local>,
    amount_lovelace: JString<'local>,
    lamp_amount: JString<'local>,
    lamp_policy_hex: JString<'local>,
    lamp_asset_name_hex: JString<'local>,
    utxos_json: JString<'local>,
    protocol_params_json: JString<'local>,
    network: jint,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    let to = match jstr(&mut env, &to_address) { Some(s) => s, None => return null_jstring() };
    let amount = jstr(&mut env, &amount_lovelace).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let lamp = jstr(&mut env, &lamp_amount).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let policy = jstr(&mut env, &lamp_policy_hex).unwrap_or_default();
    let name = jstr(&mut env, &lamp_asset_name_hex).unwrap_or_default();
    let utxos = match jstr(&mut env, &utxos_json) { Some(s) => s, None => return null_jstring() };
    let params = match jstr(&mut env, &protocol_params_json) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::build_signed_transfer(
        kek, account as u32, to, amount, lamp, policy, name, utxos, params, network as u8,
    ))
}

/// Dựng + ký tx uỷ thác stake vào 1 pool. Kotlin:
/// nativeBuildStakeDelegation(kekHex, account, poolBech32, utxosJson, protocolParamsJson, network): String?
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeBuildStakeDelegation<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
    account: jint,
    pool_bech32: JString<'local>,
    utxos_json: JString<'local>,
    protocol_params_json: JString<'local>,
    network: jint,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    let pool = match jstr(&mut env, &pool_bech32) { Some(s) => s, None => return null_jstring() };
    let utxos = match jstr(&mut env, &utxos_json) { Some(s) => s, None => return null_jstring() };
    let params = match jstr(&mut env, &protocol_params_json) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::build_stake_delegation(kek, account as u32, pool, utxos, params, network as u8))
}

/// Witness (ký) tx CBOR đã dựng sẵn (GetLAMP). Kotlin:
/// nativeWitnessUnsignedTx(kekHex, account, unsignedTxCborHex, network): String?
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeWitnessUnsignedTx<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
    account: jint,
    unsigned_tx_cbor_hex: JString<'local>,
    network: jint,
) -> jstring {
    let kek = match jstr(&mut env, &kek_hex) { Some(s) => s, None => return null_jstring() };
    let cbor = match jstr(&mut env, &unsigned_tx_cbor_hex) { Some(s) => s, None => return null_jstring() };
    ret(&env, crate::mobile_kek::witness_unsigned_tx(kek, account as u32, cbor, network as u8))
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

// ─── Mint LAMP bằng OrgDID (bản B — cổng Registry + SupplyState + A-DEST kho) ──
//
// Khớp 1:1 `mint_lamp::build_mint_lamp_via_did` và `lib.rs::taad_build_mint_lamp_via_did`
// (iOS đi đường C ABI đó). Ý nghĩa từng tham số xem doc-comment ở lib.rs — Kotlin
// truyền theo ĐÚNG thứ tự này; lệch một chỗ là tx dựng sai mà không báo lỗi.
//
// Trả null khi bất kỳ khâu nào hỏng (parse / authority không khớp registry / quá
// cap / không đủ UTxO). Rust KHÔNG trả thông điệp lỗi qua JNI — phía Kotlin chỉ
// biết "dựng không được", đúng như các hàm còn lại trong tệp này.

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
    network: jint,
    current_slot: jlong,
) -> jstring {
    let auth_keks = match jstr(&mut env, &authority_keks_json) { Some(s) => s, None => return null_jstring() };
    let registry = match jstr(&mut env, &registry_utxo_json) { Some(s) => s, None => return null_jstring() };
    let token_tag = match jstr(&mut env, &token_tag_hex) { Some(s) => s, None => return null_jstring() };
    let supply_state = match jstr(&mut env, &supply_state_utxo_json) { Some(s) => s, None => return null_jstring() };
    let ss_script = match jstr(&mut env, &supply_state_script_cbor) { Some(s) => s, None => return null_jstring() };
    let kho = match jstr(&mut env, &kho_utxo_json) { Some(s) => s, None => return null_jstring() };
    let policy = match jstr(&mut env, &lamp_policy_cbor_hex) { Some(s) => s, None => return null_jstring() };
    let mint = match jstr(&mut env, &mint_json) { Some(s) => s, None => return null_jstring() };
    let utxos = match jstr(&mut env, &utxos_json) { Some(s) => s, None => return null_jstring() };
    let params = match jstr(&mut env, &protocol_params_json) { Some(s) => s, None => return null_jstring() };
    let seed = match jstr(&mut env, &wallet_seed_hex) { Some(s) => s, None => return null_jstring() };

    match crate::mint_lamp::build_mint_lamp_via_did(
        &auth_keks, &registry, &token_tag, &supply_state, &ss_script, &kho, &policy, &mint,
        &utxos, &params, &seed, network as u8, current_slot as u64,
    ) {
        Ok(tx_hex) => ret(&env, tx_hex),
        Err(_) => null_jstring(),
    }
}
