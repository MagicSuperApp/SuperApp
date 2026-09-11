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

/// Ghi câu lỗi vào ô lỗi theo luồng (dùng chung với C ABI ở `lib.rs`) rồi trả
/// null. Kotlin đọc lại bằng `nativeLastError()` NGAY sau khi thấy null — JNI
/// chạy đồng bộ trên đúng luồng Java đã gọi, nên ô lỗi theo luồng là của
/// chính lần gọi đó.
fn fail_jstring(msg: impl Into<String>) -> jstring {
    crate::set_last_error(msg);
    std::ptr::null_mut()
}

/// Đọc một đối số `JString` bắt buộc; thoát sớm kèm câu lỗi nêu TÊN đối số.
macro_rules! jarg {
    ($env:expr, $v:expr, $name:literal) => {
        match jstr(&mut $env, &$v) {
            Some(s) => s,
            None => {
                return fail_jstring(concat!(
                    "invalid argument `",
                    $name,
                    "`: null or not readable as UTF-8"
                ))
            }
        }
    };
}

/// Câu lỗi của lần gọi native gần nhất trên luồng này, hoặc null.
/// Đọc một lần rồi ô lỗi trống. Kotlin: `external fun nativeLastError(): String?`
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeLastError<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    match crate::take_last_error() {
        None => null_jstring(),
        Some(msg) => match env.new_string(msg) {
            Ok(s) => s.into_raw(),
            // KHÔNG ghi lại vào ô lỗi: đây là đường ĐỌC.
            Err(_) => null_jstring(),
        },
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeGenerateMasterKek<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let kek = crate::crypto::generate_master_kek();
    match env.new_string(kek) {
        Ok(s) => {
            crate::take_last_error();
            s.into_raw()
        }
        Err(e) => fail_jstring(format!(
            "nativeGenerateMasterKek: cannot hand string back to JVM: {e}"
        )),
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
        Err(_) => {
            return fail_jstring("invalid argument `kekHex`: null or not readable as UTF-8")
        }
    };
    let phrase = crate::crypto::master_kek_to_mnemonic(kek);
    ret(&env, phrase, "nativeMasterKekToMnemonic")
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeMnemonicToMasterKek<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    words: JString<'local>,
) -> jstring {
    let words: String = match env.get_string(&words) {
        Ok(s) => s.into(),
        Err(_) => {
            return fail_jstring("invalid argument `words`: null or not readable as UTF-8")
        }
    };
    let kek = crate::crypto::mnemonic_to_master_kek(words);
    ret(&env, kek, "nativeMnemonicToMasterKek")
}

// ─── Mobile derive (composed) + wrapping primitives ──────────────────────────
// Cùng pattern: lấy chuỗi UTF-8 từ JString, gọi crate, trả jstring (null nếu rỗng).

#[inline]
fn jstr<'l>(env: &mut JNIEnv<'l>, s: &JString<'l>) -> Option<String> {
    env.get_string(s).ok().map(|v| v.into())
}

/// Trả chuỗi về JVM. Chuỗi RỖNG là quy ước báo hỏng của các hàm lõi không
/// dùng `Result`; ở đó không có câu lỗi nào để chuyển tiếp, nên ít nhất phải
/// nói HÀM NÀO hỏng và nói thẳng rằng lõi không kèm lý do.
#[inline]
fn ret<'l>(env: &JNIEnv<'l>, out: String, op: &str) -> jstring {
    if out.is_empty() {
        return fail_jstring(format!(
            "{op} failed: core returned an empty result and carries no message \
             (check argument format and length)"
        ));
    }
    match env.new_string(out) {
        Ok(s) => {
            // Trả được giá trị ⟹ lần gọi này thành công ⟹ ô lỗi phải trống.
            crate::take_last_error();
            s.into_raw()
        }
        Err(e) => fail_jstring(format!("{op}: cannot hand string back to JVM: {e}")),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveTaadPubkey<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
) -> jstring {
    let kek = jarg!(env, kek_hex, "kek_hex");
    ret(&env, crate::mobile_kek::derive_taad_pubkey(kek), "nativeDeriveTaadPubkey")
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
    let kek = jarg!(env, master_kek_hex, "master_kek_hex");
    let msg = jarg!(env, message, "message");
    ret(&env, crate::sign::sign_ed25519(kek, msg), "nativeSignEd25519")
}

/// 2FA DeviceKey opt-in. Kotlin: nativeDeviceKeyOptin(userDid, nonce): String? (JSON).
#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeviceKeyOptin<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    user_did: JString<'local>,
    nonce: JString<'local>,
) -> jstring {
    let did = jarg!(env, user_did, "user_did");
    let n = jarg!(env, nonce, "nonce");
    ret(&env, crate::sign::device_key_optin(did, n), "nativeDeviceKeyOptin")
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveWalletSeed<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
) -> jstring {
    let kek = jarg!(env, kek_hex, "kek_hex");
    ret(&env, crate::mobile_kek::derive_wallet_seed(kek), "nativeDeriveWalletSeed")
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeDeriveWalletAddress<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    kek_hex: JString<'local>,
    account: jint,
    network: jint,
) -> jstring {
    let kek = jarg!(env, kek_hex, "kek_hex");
    ret(&env, crate::mobile_kek::derive_wallet_address(kek, account as u32, network as u8), "nativeDeriveWalletAddress")
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
    let kek = jarg!(env, kek_hex, "kek_hex");
    ret(&env, crate::mobile_kek::derive_stake_address(kek, account as u32, network as u8), "nativeDeriveStakeAddress")
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
    let kek = jarg!(env, kek_hex, "kek_hex");
    let msg = jarg!(env, message, "message");
    ret(&env, crate::mobile_kek::sign_wallet_register(kek, account as u32, msg), "nativeSignWalletRegister")
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
    let kek = jarg!(env, kek_hex, "kek_hex");
    let to = jarg!(env, to_address, "to_address");
    let amount = jstr(&mut env, &amount_lovelace).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let lamp = jstr(&mut env, &lamp_amount).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let policy = jstr(&mut env, &lamp_policy_hex).unwrap_or_default();
    let name = jstr(&mut env, &lamp_asset_name_hex).unwrap_or_default();
    let utxos = jarg!(env, utxos_json, "utxos_json");
    let params = jarg!(env, protocol_params_json, "protocol_params_json");
    ret(&env, crate::mobile_kek::build_signed_transfer(
        kek, account as u32, to, amount, lamp, policy, name, utxos, params, network as u8,
    ), "nativeBuildSignedTransfer")
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
    let kek = jarg!(env, kek_hex, "kek_hex");
    let pool = jarg!(env, pool_bech32, "pool_bech32");
    let utxos = jarg!(env, utxos_json, "utxos_json");
    let params = jarg!(env, protocol_params_json, "protocol_params_json");
    ret(&env, crate::mobile_kek::build_stake_delegation(kek, account as u32, pool, utxos, params, network as u8), "nativeBuildStakeDelegation")
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
    let kek = jarg!(env, kek_hex, "kek_hex");
    let cbor = jarg!(env, unsigned_tx_cbor_hex, "unsigned_tx_cbor_hex");
    ret(&env, crate::mobile_kek::witness_unsigned_tx(kek, account as u32, cbor, network as u8), "nativeWitnessUnsignedTx")
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeGenerateSalt<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    ret(&env, crate::crypto::generate_salt(), "nativeGenerateSalt")
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativePbkdf2Derive<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    pin: JString<'local>,
    salt_hex: JString<'local>,
) -> jstring {
    let pin = jarg!(env, pin, "pin");
    let salt = jarg!(env, salt_hex, "salt_hex");
    ret(&env, crate::crypto::pbkdf2_derive(pin, salt), "nativePbkdf2Derive")
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeAesGcmEncrypt<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    key_hex: JString<'local>,
    plaintext_hex: JString<'local>,
) -> jstring {
    let key = jarg!(env, key_hex, "key_hex");
    let pt = jarg!(env, plaintext_hex, "plaintext_hex");
    ret(&env, crate::crypto::aes_gcm_encrypt(key, pt), "nativeAesGcmEncrypt")
}

#[no_mangle]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeAesGcmDecrypt<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    key_hex: JString<'local>,
    encrypted_json: JString<'local>,
) -> jstring {
    let key = jarg!(env, key_hex, "key_hex");
    let json = jarg!(env, encrypted_json, "encrypted_json");
    ret(&env, crate::crypto::aes_gcm_decrypt(key, json), "nativeAesGcmDecrypt")
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
    let auth_keks = jarg!(env, authority_keks_json, "authority_keks_json");
    let registry = jarg!(env, registry_utxo_json, "registry_utxo_json");
    let token_tag = jarg!(env, token_tag_hex, "token_tag_hex");
    let supply_state = jarg!(env, supply_state_utxo_json, "supply_state_utxo_json");
    let ss_script = jarg!(env, supply_state_script_cbor, "supply_state_script_cbor");
    let kho = jarg!(env, kho_utxo_json, "kho_utxo_json");
    let policy = jarg!(env, lamp_policy_cbor_hex, "lamp_policy_cbor_hex");
    let mint = jarg!(env, mint_json, "mint_json");
    let utxos = jarg!(env, utxos_json, "utxos_json");
    let params = jarg!(env, protocol_params_json, "protocol_params_json");
    let seed = jarg!(env, wallet_seed_hex, "wallet_seed_hex");

    match crate::mint_lamp::build_mint_lamp_via_did(
        &auth_keks, &registry, &token_tag, &supply_state, &ss_script, &kho, &policy, &mint,
        &utxos, &params, &seed, network as u8, current_slot as u64,
    ) {
        Ok(tx_hex) => ret(&env, tx_hex, "nativeBuildMintLampViaDid"),
        Err(e) => fail_jstring(e),
    }
}

// ─── Mint token qua Registry (bộ dựng tổng quát) ───────────────────────────
//
// Khớp 1:1 `registry_mint::build_mint_via_registry` và
// `lib.rs::taad_build_mint_via_registry` (iOS đi đường C ABI đó). Ý nghĩa từng
// tham số xem doc-comment ở lib.rs.
//
// Khác `nativeBuildMintLampViaDid` ở hai chỗ, đừng nhầm hai hàm:
//   • Ở đây policy vào bằng `token_policy_cbor` (policy-id = hash của chính nó),
//     nên dùng được cho token BẤT KỲ có cổng Registry, không riêng LAMP.
//   • Ở đây KHÔNG dựng output KHO (A-DEST). Nhánh `DistributionVest` của
//     `lamp_mint` đòi rót vào KHO, nên truyền policy LAMP vào hàm này sẽ dựng ra
//     tx bị chuỗi bác ở phase-2. Mint LAMP thì dùng `nativeBuildMintLampViaDid`.
//
// Trả null khi bất kỳ khâu nào hỏng. Rust KHÔNG trả thông điệp lỗi qua JNI.

#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "system" fn Java_com_aladincontract_company_TaadEnclaveModule_nativeBuildMintViaRegistry<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    authority_keks_json: JString<'local>,
    registry_utxo_json: JString<'local>,
    token_policy_cbor: JString<'local>,
    mint_json: JString<'local>,
    supply_state_utxo_json: JString<'local>,
    supply_state_script_cbor: JString<'local>,
    utxos_json: JString<'local>,
    params_json: JString<'local>,
    wallet_seed_hex: JString<'local>,
    network: jint,
    slot: jlong,
) -> jstring {
    let auth_keks = jarg!(env, authority_keks_json, "authority_keks_json");
    let registry = jarg!(env, registry_utxo_json, "registry_utxo_json");
    let policy = jarg!(env, token_policy_cbor, "token_policy_cbor");
    let mint = jarg!(env, mint_json, "mint_json");
    let supply_state = jarg!(env, supply_state_utxo_json, "supply_state_utxo_json");
    let ss_script = jarg!(env, supply_state_script_cbor, "supply_state_script_cbor");
    let utxos = jarg!(env, utxos_json, "utxos_json");
    let params = jarg!(env, params_json, "params_json");
    let seed = jarg!(env, wallet_seed_hex, "wallet_seed_hex");

    match crate::registry_mint::build_mint_via_registry(
        &auth_keks, &registry, &policy, &mint, &supply_state, &ss_script,
        &utxos, &params, &seed, network as u8, slot as u64,
    ) {
        Ok(tx_hex) => ret(&env, tx_hex, "nativeBuildMintViaRegistry"),
        Err(e) => fail_jstring(e),
    }
}
