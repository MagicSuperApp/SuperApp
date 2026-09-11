// ================================================================
// PhoenixKey — Rust Core FFI Library v0.2
//
// C ABI entry points (callable from Swift / Kotlin / Dart via dart:ffi)
//
// Memory contract:
//   - Functions returning *mut c_char: caller MUST free via taad_free_string()
//   - Input *const c_char: must be valid, null-terminated, UTF-8 strings
//   - bool returns: 1 = true, 0 = false (C-compatible)
// ================================================================

mod crypto;
mod cardano;
mod sign;
mod utils;
mod taad_did;
mod transfer;
mod mint_lamp;
mod registry_mint;
mod lampnet;
mod staking;

// Hàm derive bậc cao cho mobile (composed) — dùng bởi cả C-ABI (iOS) lẫn JNI (Android).
mod mobile_kek;

// Android JNI shim — chỉ build cho target Android (xem android_jni.rs).
// iOS dùng C ABI trực tiếp; Android cần symbol JNI Java_<pkg>_<Class>_<method>.
#[cfg(target_os = "android")]
mod android_jni;

// Bài kiểm đường lỗi FFI (Issue #285) — chỉ biên dịch khi chạy test.
#[cfg(test)]
mod ffi_last_error_tests;

use std::cell::RefCell;
use std::ffi::{c_char, CStr, CString};

// ─── Memory Management ────────────────────────────────────────────

/// Free a string previously returned by any function in this library.
#[no_mangle]
pub unsafe extern "C" fn taad_free_string(s: *mut c_char) {
    if !s.is_null() {
        drop(CString::from_raw(s));
    }
}

// ─── Ô lỗi cuối (theo luồng) ──────────────────────────────────────
//
// Trước đây MỌI kiểu hỏng đều trả cùng một giá trị `null`: đối số sai định
// dạng, seed sai độ dài, UTxO không đủ, validator sẽ từ chối, và cả những
// cửa chặn CÓ CHỦ Ý (xem `taad_did::recovery_builders_gate`) — lõi viết câu
// lỗi rất cụ thể mà không câu nào ra được tới người gọi.
//
// Vì sao chọn ô lỗi theo luồng thay vì thêm tham số ra `char** out_err`:
// Android KHÔNG đi qua C ABI mà qua JNI (`android_jni.rs`), và JNI không có
// `char**`. Một tham số ra chỉ phục vụ iOS, Android vẫn mù — tức phải dựng
// HAI cơ chế cho cùng một việc. Ô lỗi theo luồng phục vụ cả hai cầu bằng một
// cơ chế và KHÔNG đổi chữ ký của hàm nào đang được gọi, nên cầu đã nối không
// phải sửa để biên dịch lại được.
//
// Hợp đồng: hàm trả `null` ⟹ ô lỗi có câu lỗi. Hàm trả giá trị ⟹ ô lỗi đã
// được xoá (xem `string_to_c`). `taad_last_error` đọc MỘT LẦN rồi xoá.
thread_local! {
    static LAST_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Ghi câu lỗi của lõi vào ô lỗi của luồng hiện tại.
pub(crate) fn set_last_error(msg: impl Into<String>) {
    let msg = msg.into();
    LAST_ERROR.with(|slot| {
        *slot.borrow_mut() = Some(msg);
    });
}

/// Lấy RA câu lỗi (đọc một lần rồi xoá).
pub(crate) fn take_last_error() -> Option<String> {
    LAST_ERROR.with(|slot| slot.borrow_mut().take())
}

/// Khuôn chuẩn cho mọi nhánh `Err` của tầng FFI: ghi câu lỗi rồi trả null.
pub(crate) fn fail<E: std::fmt::Display>(e: E) -> *mut c_char {
    set_last_error(e.to_string());
    std::ptr::null_mut()
}

/// Lỗi đối số: con trỏ null hoặc chuỗi không phải UTF-8 hợp lệ.
fn fail_arg(name: &str) -> *mut c_char {
    fail(format!(
        "invalid argument `{name}`: null pointer or not valid UTF-8"
    ))
}

/// Một số hàm lõi báo hỏng bằng chuỗi RỖNG chứ không bằng `Result`, nên ở đó
/// KHÔNG có câu lỗi nào để chuyển tiếp. Chỗ ấy ít nhất phải nói rõ HÀM NÀO
/// hỏng, và nói thẳng rằng lõi không kèm lý do — đừng bịa một lý do nghe như
/// thật. (Đổi các hàm đó sang `Result` là việc riêng, xem Issue #285.)
fn string_or_fail(s: String, op: &str) -> *mut c_char {
    if s.is_empty() {
        fail(format!(
            "{op} failed: core returned an empty result and carries no message \
             (check argument format and length)"
        ))
    } else {
        string_to_c(s)
    }
}

/// Đọc một đối số `*const c_char` bắt buộc; thoát sớm kèm câu lỗi nêu TÊN
/// đối số nếu nó null / không phải UTF-8.
macro_rules! arg {
    ($ptr:expr, $name:literal) => {
        match c_str_to_string($ptr) {
            Some(s) => s,
            None => return fail_arg($name),
        }
    };
}

/// Câu lỗi của lần gọi FFI gần nhất TRÊN LUỒNG NÀY, hoặc null nếu không có.
/// Đọc một lần — gọi xong thì ô lỗi trống. Bên gọi free bằng `taad_free_string`.
///
/// Bên gọi chỉ nên đọc khi một hàm vừa trả `null`; đọc lúc khác thì giá trị
/// không nói lên điều gì.
#[no_mangle]
pub extern "C" fn taad_last_error() -> *mut c_char {
    match take_last_error() {
        None => std::ptr::null_mut(),
        // NUL giữa chuỗi không thể đi qua C — thay bằng khoảng trắng chứ
        // không nuốt cả câu lỗi.
        Some(msg) => match CString::new(msg.replace('\0', " ")) {
            Ok(cs) => cs.into_raw(),
            // KHÔNG gọi `fail` ở đây: hàm này là đường ĐỌC ô lỗi, ghi lại
            // vào ô sẽ làm bên gọi đọc mãi không hết.
            Err(_) => std::ptr::null_mut(),
        },
    }
}

/// Xoá ô lỗi. Bên gọi nên gọi trước một chuỗi thao tác để chắc chắn không
/// đọc nhầm lỗi của lần gọi trước.
#[no_mangle]
pub extern "C" fn taad_clear_last_error() {
    let _ = take_last_error();
}

// ─── Helpers ─────────────────────────────────────────────────────

unsafe fn c_str_to_string(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string())
}

fn string_to_c(s: String) -> *mut c_char {
    match CString::new(s) {
        Ok(cs) => {
            // Trả được giá trị ⟹ lần gọi này thành công ⟹ ô lỗi phải trống,
            // nếu không bên gọi sẽ đọc được lỗi của một lần gọi ĐÃ qua.
            let _ = take_last_error();
            cs.into_raw()
        }
        Err(e) => fail(format!("cannot return string across FFI: {e}")),
    }
}

// ─── Master KEK ───────────────────────────────────────────────────

/// Generate a random 256-bit Master_KEK.
/// Returns: 64-char hex string (caller must free with taad_free_string)
/// spec §6.1: Master_KEK ←_R {0,1}^256
#[no_mangle]
pub extern "C" fn taad_generate_master_kek() -> *mut c_char {
    string_to_c(crypto::generate_master_kek())
}

// ─── BIP39 — Mode B Recovery ──────────────────────────────────────

/// Encode a 32-byte Master_KEK (64-char hex) as a 24-word BIP39 mnemonic.
/// kek_hex: 64-char hex (the Master_KEK, already unwrapped in memory).
/// Returns: space-separated 24-word phrase (caller must free) or null on error.
/// spec §6.1: BIP39_Encode(Master_KEK) — the user's paper backup.
/// SECURITY: equivalent to the raw Master_KEK. Show once, never log/persist.
#[no_mangle]
pub unsafe extern "C" fn taad_master_kek_to_mnemonic(
    kek_hex: *const c_char,
) -> *mut c_char {
    let kek = arg!(kek_hex, "kek_hex");
    let result = crypto::master_kek_to_mnemonic(kek);
    string_or_fail(result, "taad_master_kek_to_mnemonic")
}

/// Decode a 24-word BIP39 mnemonic back to a 32-byte Master_KEK (64-char hex).
/// words: space-separated phrase (whitespace/case are normalised internally).
/// Returns: 64-char hex Master_KEK (caller must free) or NULL if the phrase is
/// invalid (bad checksum, non-wordlist word, or not a 24-word/256-bit phrase).
/// spec §6.1: Master_KEK = BIP39_ToEntropy(user_24_words). The recovery primitive.
/// Callers MUST treat null as "phrase rejected" and abort the restore.
#[no_mangle]
pub unsafe extern "C" fn taad_mnemonic_to_master_kek(
    words: *const c_char,
) -> *mut c_char {
    let words = arg!(words, "words");
    let result = crypto::mnemonic_to_master_kek(words);
    string_or_fail(result, "taad_mnemonic_to_master_kek")
}

// ─── Mobile composed derive (khớp Enclave) ────────────────────────
// Bậc-cao cho mobile: 1 lời gọi = cả chuỗi derive. Xem src/mobile_kek.rs.

/// TAAD_Key (Ed25519) pubkey hex từ Master_KEK (64-hex). null nếu KEK sai.
#[no_mangle]
pub unsafe extern "C" fn taad_kek_derive_taad_pubkey(
    master_kek_hex: *const c_char,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let result = mobile_kek::derive_taad_pubkey(kek);
    string_or_fail(result, "taad_kek_derive_taad_pubkey")
}

/// Wallet seed (32-byte hex) từ Master_KEK. null nếu KEK sai.
#[no_mangle]
pub unsafe extern "C" fn taad_kek_derive_wallet_seed(
    master_kek_hex: *const c_char,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let result = mobile_kek::derive_wallet_seed(kek);
    string_or_fail(result, "taad_kek_derive_wallet_seed")
}

/// Địa chỉ Cardano Shelley (Bech32) cho account index từ Master_KEK.
/// network: 0 = preprod, 1 = mainnet. null nếu KEK/derive sai.
#[no_mangle]
pub unsafe extern "C" fn taad_kek_derive_wallet_address(
    master_kek_hex: *const c_char,
    account: u32,
    network: u8,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let result = mobile_kek::derive_wallet_address(kek, account, network);
    string_or_fail(result, "taad_kek_derive_wallet_address")
}

/// Địa chỉ STAKE (reward, Bech32 `stake_test1…`/`stake1…`) cho account index từ Master_KEK.
/// Cùng CIP-1852 với ví, chỉ khác nhánh role 2. Dùng cho /wallet/standard/register
/// (field `stake_address`) + staking. network: 0 = preprod, 1 = mainnet.
/// null nếu KEK/derive sai.
#[no_mangle]
pub unsafe extern "C" fn taad_kek_derive_stake_address(
    master_kek_hex: *const c_char,
    account: u32,
    network: u8,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let result = mobile_kek::derive_stake_address(kek, account, network);
    string_or_fail(result, "taad_kek_derive_stake_address")
}

/// Ký challenge proof-of-ownership cho PhoenixKey `/wallet/standard/register`
/// (Issue #47) bằng PAYMENT key của `account` từ Master_KEK. `message` = chuỗi
/// challenge canonical UTF-8 do caller dựng
/// ("PHOENIXKEY_WALLET_STANDARD_REGISTER:<did>:<fixedAddress>:<nonce>").
/// Trả JSON {"paymentPublicKeyHex":"<64hex>","signature":"<128hex>"} (caller free)
/// hoặc null nếu KEK/seed sai.
#[no_mangle]
pub unsafe extern "C" fn taad_kek_sign_wallet_register(
    master_kek_hex: *const c_char,
    account: u32,
    message: *const c_char,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let msg = arg!(message, "message");
    let result = mobile_kek::sign_wallet_register(kek, account, msg);
    string_or_fail(result, "taad_kek_sign_wallet_register")
}

/// Dựng + ký tx Cardano gửi ADA/LAMP (Issue #74 — client build, backend relay qua
/// POST /wallet/tx/submit). `amount_lovelace`/`lamp_amount` là CHUỖI thập phân
/// (u64 vượt double-precision của RN bridge → truyền dạng string, parse trong Rust).
/// `utxos_json` = Blockfrost `/addresses/{addr}/utxos`; `protocol_params_json` =
/// Blockfrost `/epochs/latest/parameters` (JSON thô, snake_case).
/// Trả CBOR hex đã ký (caller free) hoặc null nếu KEK/seed sai / build lỗi.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_kek_build_signed_transfer(
    master_kek_hex: *const c_char,
    account: u32,
    to_address: *const c_char,
    amount_lovelace: *const c_char,
    lamp_amount: *const c_char,
    lamp_policy_hex: *const c_char,
    lamp_asset_name_hex: *const c_char,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let to = arg!(to_address, "to_address");
    let amount = c_str_to_string(amount_lovelace).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let lamp = c_str_to_string(lamp_amount).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let policy = c_str_to_string(lamp_policy_hex).unwrap_or_default();
    let name = c_str_to_string(lamp_asset_name_hex).unwrap_or_default();
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    let result = mobile_kek::build_signed_transfer(
        kek, account, to, amount, lamp, policy, name, utxos, params, network,
    );
    string_or_fail(result, "taad_kek_build_signed_transfer")
}

/// Dựng + ký tx uỷ thác stake vào 1 pool (single-pool delegation, Issue #74).
/// `pool_bech32` = pool id bech32 (`pool1...`). `utxos_json`/`protocol_params_json`
/// = JSON thô Blockfrost. Trả CBOR hex đã ký (caller free) hoặc null nếu lỗi.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_kek_build_stake_delegation(
    master_kek_hex: *const c_char,
    account: u32,
    pool_bech32: *const c_char,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let pool = arg!(pool_bech32, "pool_bech32");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    let result = mobile_kek::build_stake_delegation(kek, account, pool, utxos, params, network);
    string_or_fail(result, "taad_kek_build_stake_delegation")
}

/// Witness (ký) tx CBOR ĐÃ DỰNG SẴN bằng payment key của account (GetLAMP §2 —
/// BE build unsigned → client witness → BE submit). Trả CBOR hex đã ký hoặc null.
#[no_mangle]
pub unsafe extern "C" fn taad_kek_witness_unsigned_tx(
    master_kek_hex: *const c_char,
    account: u32,
    unsigned_tx_cbor_hex: *const c_char,
    network: u8,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let cbor = arg!(unsigned_tx_cbor_hex, "unsigned_tx_cbor_hex");
    let result = mobile_kek::witness_unsigned_tx(kek, account, cbor, network);
    string_or_fail(result, "taad_kek_witness_unsigned_tx")
}

// ─── HKDF ────────────────────────────────────────────────────────

/// Derive keying material using HKDF-SHA256.
/// All pointer args must be valid null-terminated UTF-8 strings.
/// salt_hex: empty string = 32 zero bytes
/// Returns: hex-encoded OKM (caller must free) or null on error
/// spec §6.1: HKDF(ikm, info, salt) → {0,1}^k
#[no_mangle]
pub unsafe extern "C" fn taad_hkdf_derive(
    ikm_hex: *const c_char,
    info: *const c_char,
    salt_hex: *const c_char,
    length: u32,
) -> *mut c_char {
    let ikm  = arg!(ikm_hex, "ikm_hex");
    let info = arg!(info, "info");
    let salt = match c_str_to_string(salt_hex)  { Some(s) => s, None => String::new() };

    let result = crypto::hkdf_derive(ikm, info, salt, length as usize);
    string_or_fail(result, "taad_hkdf_derive")
}

// ─── Ed25519 — TAAD_Key ───────────────────────────────────────────

/// Derive Ed25519 public key from a 32-byte seed (hex encoded).
/// seed_hex: 64-char hex (32 bytes) — typically output of taad_hkdf_derive
/// Returns: 64-char hex Ed25519 public key (caller must free) or null on error
/// spec §3.2: TAAD_Key = Ed25519.FromSeed(...)
#[no_mangle]
pub unsafe extern "C" fn taad_derive_ed25519_public_key(
    seed_hex: *const c_char,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let result = crypto::derive_ed25519_public_key(seed);
    string_or_fail(result, "taad_derive_ed25519_public_key")
}

// ─── AES-256-GCM — Wrapped_KEK ────────────────────────────────────

/// Encrypt Master_KEK with Device_KEK using AES-256-GCM.
/// key_hex: 64-char hex (32-byte AES key)
/// plaintext_hex: hex-encoded data to encrypt (typically Master_KEK)
/// Returns: JSON string {"ciphertext":"<hex>","iv":"<hex>"} (caller must free)
///          or null on error
/// spec §6.1: Wrapped_KEK = Enc(Device_KEK, Master_KEK)
#[no_mangle]
pub unsafe extern "C" fn taad_aes_gcm_encrypt(
    key_hex: *const c_char,
    plaintext_hex: *const c_char,
) -> *mut c_char {
    let key  = arg!(key_hex, "key_hex");
    let data = arg!(plaintext_hex, "plaintext_hex");
    let result = crypto::aes_gcm_encrypt(key, data);
    string_or_fail(result, "taad_aes_gcm_encrypt")
}

/// Decrypt Master_KEK with Device_KEK.
/// key_hex: 64-char hex AES key
/// encrypted_json: JSON string from taad_aes_gcm_encrypt
/// Returns: hex-encoded plaintext (caller must free) or null on wrong key/tampered
#[no_mangle]
pub unsafe extern "C" fn taad_aes_gcm_decrypt(
    key_hex: *const c_char,
    encrypted_json: *const c_char,
) -> *mut c_char {
    let key  = arg!(key_hex, "key_hex");
    let json = arg!(encrypted_json, "encrypted_json");
    let result = crypto::aes_gcm_decrypt(key, json);
    string_or_fail(result, "taad_aes_gcm_decrypt")
}

// ─── PBKDF2 — Device_KEK from PIN ────────────────────────────────

/// Derive 32-byte key from PIN using PBKDF2-HMAC-SHA256 (300_000 iterations).
/// pin: user PIN (UTF-8 string)
/// salt_hex: 32-char hex (16-byte salt) — generate with taad_generate_salt
/// Returns: 64-char hex key (caller must free)
#[no_mangle]
pub unsafe extern "C" fn taad_pbkdf2_derive(
    pin: *const c_char,
    salt_hex: *const c_char,
) -> *mut c_char {
    let pin  = arg!(pin, "pin");
    let salt = arg!(salt_hex, "salt_hex");
    string_to_c(crypto::pbkdf2_derive(pin, salt))
}

/// Generate 16 random bytes for PBKDF2 salt.
/// Returns: 32-char hex string (caller must free)
#[no_mangle]
pub extern "C" fn taad_generate_salt() -> *mut c_char {
    string_to_c(crypto::generate_salt())
}

// ─── SHA-256 ─────────────────────────────────────────────────────

/// Compute SHA-256 of a UTF-8 string. Returns 64-char hex (caller must free).
#[no_mangle]
pub unsafe extern "C" fn taad_sha256_hex(data: *const c_char) -> *mut c_char {
    let s = arg!(data, "data");
    string_to_c(crypto::sha256_hex(s))
}

/// Compute SHA-256 of hex-encoded bytes. Returns 64-char hex (caller must free).
#[no_mangle]
pub unsafe extern "C" fn taad_sha256_bytes_hex(data_hex: *const c_char) -> *mut c_char {
    let s = arg!(data_hex, "data_hex");
    string_to_c(crypto::sha256_bytes_hex(s))
}

// ─── P-256 Verify — HW_Key layer (unchanged) ─────────────────────

/// Verify a P-256 ECDSA signature (SHA-256, DER-encoded).
/// pub_key_hex: uncompressed P-256 point (130 hex chars) or compressed (66 hex)
/// message: original message (UTF-8)
/// sig_hex: DER-encoded ECDSA signature (hex)
/// Returns: 1=valid, 0=invalid
#[no_mangle]
pub unsafe extern "C" fn taad_verify_p256_signature(
    pub_key_hex: *const c_char,
    message: *const c_char,
    sig_hex: *const c_char,
) -> bool {
    // `false` ở đây gộp hai nghĩa hoàn toàn khác nhau: "chữ ký KHÔNG hợp lệ"
    // và "tôi chưa đọc nổi đối số". Kiểu trả về là `bool` nên không tách được
    // ở giá trị — tách ở ô lỗi: hỏng đối số thì có câu lỗi, chữ ký sai thì ô
    // lỗi TRỐNG. Bên gọi phân biệt được bằng `taad_last_error()`.
    let pk = match c_str_to_string(pub_key_hex) {
        Some(s) => s,
        None => {
            fail_arg("pub_key_hex");
            return false;
        }
    };
    let msg = match c_str_to_string(message) {
        Some(s) => s,
        None => {
            fail_arg("message");
            return false;
        }
    };
    let sig = match c_str_to_string(sig_hex) {
        Some(s) => s,
        None => {
            fail_arg("sig_hex");
            return false;
        }
    };
    let ok = crypto::verify_p256_signature(pk, msg, sig);
    // Đọc được hết đối số ⟹ kết quả là một PHÁN ĐOÁN thật, không phải một lần
    // hỏng. Xoá ô lỗi để bên gọi không nhặt phải lý do của lần gọi trước.
    take_last_error();
    ok
}

// Backward-compat alias (old name)
#[no_mangle]
pub unsafe extern "C" fn taad_enclave_core_verify_p256_signature(
    pub_key_hex: *const c_char,
    message: *const c_char,
    sig_hex: *const c_char,
) -> bool {
    taad_verify_p256_signature(pub_key_hex, message, sig_hex)
}

#[no_mangle]
pub unsafe extern "C" fn taad_enclave_core_sha256_hex(data: *const c_char) -> *mut c_char {
    taad_sha256_hex(data)
}

#[no_mangle]
pub unsafe extern "C" fn taad_enclave_core_free_string(s: *mut c_char) {
    taad_free_string(s)
}

// ================================================================
// [V11] Cardano + Ed25519 signing additions (testnet release)
// ================================================================

/// Derive a Shelley base address from a 32-byte seed (CIP-1852 BIP44).
/// seed_hex: 64-char hex
/// network: 0 = preprod, 1 = mainnet
/// Returns Bech32 address string (caller must free with taad_free_string)
#[no_mangle]
pub unsafe extern "C" fn taad_derive_cardano_address(
    seed_hex: *const c_char,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let addr = cardano::derive_address(seed, network);
    string_or_fail(addr, "taad_derive_cardano_address")
}

/// Derive a Shelley base address for a specific CIP-1852 account index
/// (QĐ-B mô hình ví). Path `m/1852'/1815'/account'/0/0`.
///   - account 0   = ví cố định (kho/định danh), BẤT BIẾN.
///   - account N≥1 = ví hoạt động đời N (xoay khoá off-chain).
/// All accounts derive from the SAME wallet seed (→ same 24 words recover all).
/// seed_hex: 64-char hex; account: CIP-1852 account index; network: 0=preprod,1=mainnet.
/// Returns Bech32 address string (caller must free with taad_free_string) or null.
#[no_mangle]
pub unsafe extern "C" fn taad_derive_cardano_address_account(
    seed_hex: *const c_char,
    account: u32,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let addr = cardano::derive_address_account(seed, account, network);
    string_or_fail(addr, "taad_derive_cardano_address_account")
}

/// Derive BIP32 extended private key (hex) for Cardano payment path.
/// In-memory only — do not log or persist.
#[no_mangle]
pub unsafe extern "C" fn taad_derive_payment_xprv(
    seed_hex: *const c_char,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let xprv = cardano::derive_payment_signing_key_hex(seed);
    string_or_fail(xprv, "taad_derive_payment_xprv")
}

/// Derive BIP32 extended private key (hex) for the payment path of a specific
/// CIP-1852 account index (QĐ-B: account = walletRotationIndex). Path
/// `m/1852'/1815'/account'/0/0`. Signs spends from the address that
/// `taad_derive_cardano_address_account` derives at the SAME account.
/// In-memory only — do not log or persist. Null on invalid seed.
#[no_mangle]
pub unsafe extern "C" fn taad_derive_payment_xprv_account(
    seed_hex: *const c_char,
    account: u32,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let xprv = cardano::derive_payment_signing_key_account(seed, account);
    string_or_fail(xprv, "taad_derive_payment_xprv_account")
}

/// Sign a UTF-8 message with the Ed25519 TAAD_Key derived from Master_KEK.
/// Returns 64-byte raw signature (r||s) hex.
#[no_mangle]
pub unsafe extern "C" fn taad_sign_ed25519(
    master_kek_hex: *const c_char,
    message: *const c_char,
) -> *mut c_char {
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let msg = arg!(message, "message");
    let sig = sign::sign_ed25519(kek, msg);
    string_or_fail(sig, "taad_sign_ed25519")
}

/// 2FA DeviceKey opt-in (Issue #28): sinh Ed25519 NGẪU NHIÊN (per-device) + ký canonical
/// "PHOENIXKEY_DEVICE_KEY_OPTIN:<did>:<pubkey>:<nonce>" bằng chính khoá đó.
/// Trả JSON {"publicKeyHex","signature","secretHex"} (caller free; lưu secretHex vào K_bio).
#[no_mangle]
pub unsafe extern "C" fn taad_device_key_optin(
    user_did: *const c_char,
    nonce: *const c_char,
) -> *mut c_char {
    let did = arg!(user_did, "user_did");
    let n = arg!(nonce, "nonce");
    let out = sign::device_key_optin(did, n);
    string_or_fail(out, "taad_device_key_optin")
}

// ================================================================
// [V12] TAAD DID + on-chain ops (mục 1, 3, 5 trong 5 mục tiêu)
//
// Atomicity per user mandate §V.2:
//   - construct_did     — TÁCH (reuse root/sub/entity/validation)
//   - publish_did_tx    — GỘP build_doc + publish_tx (phụ thuộc 1-1)
//   - create_taad_utxo  — TÁCH (1 lần/user)
//   - rotate_taad       — TÁCH (N lần/user)
//
// Status:
//   #1 construct_did            — fully implemented + 3 unit tests
//   #2 publish_did_tx           — signature ready, body TODO (port từ
//                                  derive-demo/publish_did.rs)
//   #3 build_create_taad_utxo   — signature ready, body TODO (chờ Validator
//                                  PR #2 merge + plutus-preprod.json regen)
//   #4 build_rotate_taad        — signature ready, body TODO (chờ Tuân
//                                  finalize TAADRedeemer cbor schema)
// ================================================================

/// Construct DID string per Math Spec v4.3 §2.1 + did:phoenix method.md §2.
///
/// hash = BLAKE2b-256(type_byte || creator?:"root" || slot_be8 || rand_256)
/// did  = "did:phoenix:" || BASE32_NOPAD_LOWER(slot_be8) || ":" || lowerhex(hash)
///
/// Args:
///   type_byte:    entity type (0x01 = root person, 0x02 = sub, 0x03 = entity, ...)
///   creator_did:  parent DID, null hoặc empty = root identity
///   slot:         Cardano absolute slot (caller fetch từ /blocks/latest)
///
/// Returns: owned C string "did:phoenix:..." — caller free qua taad_free_string.
///          Null nếu OOM khi alloc CString.
#[no_mangle]
pub unsafe extern "C" fn taad_construct_did(
    type_byte: u8,
    creator_did: *const c_char,
    slot: u64,
) -> *mut c_char {
    let creator = c_str_to_string(creator_did);
    let did = taad_did::construct_did(type_byte, creator.as_deref(), slot);
    string_to_c(did)
}

/// Build + sign tx publish DID Document lên Cardano.
/// Tx attach metadata 721 chứa W3C DID Document (auto-chunk 64-byte).
///
/// Status: signature stable, body TODO. Hiện return null + sẽ trả về error
/// JSON khi implement xong.
///
/// Args đầy đủ theo ffi-draft-v1.rs (anh đã duyệt naming + atomicity):
///   did                  - output của taad_construct_did
///   hw_pubkey_hex        - HW_Key (P-256) làm metadata
///   taad_pubkey_hex      - TAAD_Key (Ed25519) làm controller on-chain
///   wallet_address       - Bech32 Shelley để pay fee + change
///   wallet_seed_hex      - 32-byte hex seed để derive payment xprv (sign tx)
///   service_endpoint     - resolver URL (vd: "https://api.phoenixkey.me")
///   network              - 0 = preprod, 1 = mainnet
///   utxo_inputs_json     - JSON array UTxO available, format derive-demo
///   protocol_params_json - từ /epochs/latest/parameters
///   current_slot         - tip slot (+ TTL window 7200)
///
/// Returns: hex signed tx CBOR (caller submit qua /tx/submit) hoặc null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_publish_did_tx(
    did: *const c_char,
    hw_pubkey_hex: *const c_char,
    taad_pubkey_hex: *const c_char,
    wallet_address: *const c_char,
    wallet_seed_hex: *const c_char,
    service_endpoint: *const c_char,
    network: u8,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let did_s = arg!(did, "did");
    let hw = arg!(hw_pubkey_hex, "hw_pubkey_hex");
    let taad = arg!(taad_pubkey_hex, "taad_pubkey_hex");
    let addr = arg!(wallet_address, "wallet_address");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let svc = arg!(service_endpoint, "service_endpoint");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    match taad_did::build_publish_did_tx(
        &did_s, &hw, &taad, &addr, &seed, &svc,
        network, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// Tạo TAAD UTxO: lock min_ada + (TAAD-NFT, when mint policy lands) vào địa
/// chỉ TAAD script với datum Active.
///
/// Signature change (Option C, PO 2026-05): extended with `entity_type`,
/// `master_kek_hex`, `policy_id_hex`; `taad_script_address` replaced by
/// `taad_script_cbor_hex` so Rust can derive the script address itself.
/// Returns null on error (FFI cannot carry Rust error strings cheaply);
/// callers should validate inputs upstream and treat null as "input rejected
/// by validator" — see `taad_did::build_create_taad_utxo_tx` source for the
/// full set of error conditions.
///
/// # Args (all `*const c_char` are null-terminated UTF-8 hex strings unless noted)
/// * `did`                  — output of [`taad_construct_did`]
/// * `entity_type`          — 0..=9 per types.ak `EntityType` (0=Person, 1=Org,
///   2=Device, 3=Machine, 4=Asset, 5=Bot, 6=AI, 7=Service, 8=Context, 9=Character)
/// * `hw_pub_hex`           — 32-byte HW_Key pubkey (64 hex chars)
/// * `taad_pub_hex`         — 32-byte TAAD_Key Ed25519 pubkey (64 hex chars)
/// * `master_kek_hex`       — 32-byte Master_KEK (forward-compat; validated)
/// * `wallet_seed_hex`      — 32-byte wallet entropy (CIP-1852)
/// * `network`              — 0=testnet_preprod, 1=mainnet, 2=testnet_preview
/// * `taad_script_cbor_hex` — compiled Plutus V3 script (from blueprint)
/// * `policy_id_hex`        — 28-byte TAAD-NFT minting policy ID (currently
///   length-validated only; mint witness lands in a follow-up commit)
/// * `utxo_inputs_json`     — JSON array of UtxoInput (same shape as publish_did)
/// * `protocol_params_json` — Blockfrost `/epochs/latest/parameters` JSON
/// * `current_slot`         — Cardano tip slot
///
/// Returns: hex signed tx CBOR (caller free via `taad_free_string`) or null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_create_taad_utxo_tx(
    did: *const c_char,
    entity_type: u8,
    hw_pub_hex: *const c_char,
    taad_pub_hex: *const c_char,
    master_kek_hex: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    policy_id_hex: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let did_s = arg!(did, "did");
    let hw = arg!(hw_pub_hex, "hw_pub_hex");
    let taad = arg!(taad_pub_hex, "taad_pub_hex");
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let policy = arg!(policy_id_hex, "policy_id_hex");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    match taad_did::build_create_taad_utxo_tx(
        &did_s, entity_type, &hw, &taad, &kek, &seed,
        network, &script_cbor, &policy, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}


/// Tạo CHILD DID (OrgDID / non-Person) on-chain qua cổng `GenesisChild`.
///
/// Mint anchor NFT (name = blake2b_256(child_did)) dưới validator multi-purpose,
/// khoá datum tươi (parent_did = Some(owner_did)) tại địa chỉ script, và tham
/// chiếu (CIP-31) anchor đang-sống của OWNER. OWNER controller ký (validator G-1
/// chỉ đòi chữ ký owner — CHILD KHÔNG ký genesis). Owner UTxO là REFERENCE input,
/// KHÔNG bị tiêu.
///
/// # Inputs (xem `taad_did::build_create_child_taad_utxo_tx` để biết chi tiết)
/// * `child_did`            — DID con mới (did:phoenix:…)
/// * `owner_did`            — DID owner đang sống (neo redeemer + parent_did)
/// * `entity_type`          — 1..=9 (1=Org … 9=Character). CẤM 0 (Person) — G-4.
/// * `hw_pub_hex`           — HW_Key con (32 byte / 64 hex)
/// * `child_taad_pub_hex`   — TAAD_Key con Ed25519 (32 byte). controller_pkh con
///   = blake2b_224(pubkey). Con KHÔNG ký ⇒ không cần child KEK.
/// * `owner_master_kek_hex` — Master_KEK của OWNER (32 byte). Suy ra khoá ký owner
///   thoả G-1; pkh suy ra PHẢI khớp controller_pkh trong datum owner được tham chiếu.
/// * `wallet_seed_hex`      — 32-byte entropy ví (phí + collateral)
/// * `network`              — 0=preprod, 1=mainnet, 2=preview
/// * `taad_script_cbor_hex` — script Plutus V3 đã compile (policy id ≡ script hash)
/// * `policy_id_hex`        — 28-byte hex; PHẢI bằng script hash
/// * `owner_utxo_json`      — OwnerUtxoRef JSON (UTxO owner; thêm làm reference input)
/// * `utxo_inputs_json`     — mảng JSON UtxoInput (UTxO ví cho phí + collateral)
/// * `protocol_params_json` — JSON `/epochs/latest/parameters`
/// * `current_slot`         — slot đỉnh chuỗi
///
/// Trả: hex signed tx CBOR (caller free bằng `taad_free_string`) hoặc null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_create_child_taad_utxo_tx(
    child_did: *const c_char,
    owner_did: *const c_char,
    entity_type: u8,
    hw_pub_hex: *const c_char,
    child_taad_pub_hex: *const c_char,
    owner_master_kek_hex: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    policy_id_hex: *const c_char,
    owner_utxo_json: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let child = arg!(child_did, "child_did");
    let owner = arg!(owner_did, "owner_did");
    let hw = arg!(hw_pub_hex, "hw_pub_hex");
    let child_taad = arg!(child_taad_pub_hex, "child_taad_pub_hex");
    let owner_kek = arg!(owner_master_kek_hex, "owner_master_kek_hex");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let policy = arg!(policy_id_hex, "policy_id_hex");
    let owner_utxo = arg!(owner_utxo_json, "owner_utxo_json");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    match taad_did::build_create_child_taad_utxo_tx(
        &child, &owner, entity_type, &hw, &child_taad, &owner_kek, &seed,
        network, &script_cbor, &policy, &owner_utxo, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// Xoay TAAD: spend TAAD UTxO hiện tại với redeemer Rotate, re-lock với
/// (controller_pkh + hw_pubkey) mới.
///
/// Signature change (Option C): return type widened to `Result<String,String>`
/// in Rust so error chains carry context. FFI side still returns null on
/// failure (no error string transport).
///
/// Schema v2: `new_recovery_anchor_cid` (last arg, nullable/empty allowed) is
/// the LampNet CID anchoring the distributed backup of the NEW controller key.
/// Pass the bech32 CID string after uploading the new key to LampNet; pass an
/// empty string (or null) to skip — the previous anchor is then preserved (or
/// stays None for a legacy datum). Stored in datum field 9 as UTF-8 bytes.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_rotate_taad_tx(
    current_taad_utxo_json: *const c_char,
    new_taad_pubkey_hex: *const c_char,
    new_hw_pubkey_hex: *const c_char,
    old_master_kek_hex: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
    new_recovery_anchor_cid: *const c_char,
) -> *mut c_char {
    let utxo = arg!(current_taad_utxo_json, "current_taad_utxo_json");
    let new_taad = arg!(new_taad_pubkey_hex, "new_taad_pubkey_hex");
    let new_hw = arg!(new_hw_pubkey_hex, "new_hw_pubkey_hex");
    let old_kek = arg!(old_master_kek_hex, "old_master_kek_hex");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    // LampNet CID của khoá mới. Chuỗi rỗng (hoặc null) = chưa phân tán → None,
    // rotate encoder giữ anchor cũ (hoặc None với datum legacy).
    let anchor_cid = c_str_to_string(new_recovery_anchor_cid).unwrap_or_default();
    let anchor_cid_opt = if anchor_cid.is_empty() { None } else { Some(anchor_cid.as_str()) };

    match taad_did::build_rotate_taad_tx(
        &utxo, &new_taad, &new_hw, &old_kek, &seed,
        network, &script_cbor, &utxos, &params, current_slot, anchor_cid_opt,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

// ─── M2 lifecycle FFI: deactivate / update-guardians / recovery ──────

/// FFI: **Deactivate** — controller ký, status → Revoked, revoked_slot neo vào
/// validity lower bound. Trạng thái cuối (không thể quay lại). Null nếu lỗi.
#[no_mangle]
pub unsafe extern "C" fn taad_build_deactivate_taad_tx(
    current_taad_utxo_json: *const c_char,
    master_kek_hex: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let utxo = arg!(current_taad_utxo_json, "current_taad_utxo_json");
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    match taad_did::build_deactivate_taad_tx(
        &utxo, &kek, &seed, network, &script_cbor, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// FFI: **UpdateGuardians** — controller ký, thay danh sách guardian (≤5).
/// `new_guardians_json` = mảng JSON các pkh hex 28 byte. Null nếu lỗi.
#[no_mangle]
pub unsafe extern "C" fn taad_build_update_guardians_tx(
    current_taad_utxo_json: *const c_char,
    new_guardians_json: *const c_char,
    master_kek_hex: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let utxo = arg!(current_taad_utxo_json, "current_taad_utxo_json");
    let guardians = arg!(new_guardians_json, "new_guardians_json");
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    match taad_did::build_update_guardians_tx(
        &utxo, &guardians, &kek, &seed, network, &script_cbor, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// FFI: **InitRecovery** — guardian (đủ ngưỡng) ký, KHÔNG phải controller đã mất.
/// status → Recovering{pending = khoá mới, deadline = slot + timelock}. Khoá lại
/// thêm `collateral_lovelace` ADA. `recovery_timelock_slots` PHẢI đúng tham số
/// đã nướng vào validator khi deploy. `guardian_signing_keys_json` = mảng JSON
/// seed Ed25519 hex 32 byte (luồng test/preprod; production gom witness guardian
/// ký trên máy của họ). Null nếu lỗi.
#[no_mangle]
pub unsafe extern "C" fn taad_build_init_recovery_tx(
    current_taad_utxo_json: *const c_char,
    new_taad_pubkey_hex: *const c_char,
    new_hw_pubkey_hex: *const c_char,
    guardian_signing_keys_json: *const c_char,
    collateral_lovelace: u64,
    recovery_timelock_slots: u64,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let utxo = arg!(current_taad_utxo_json, "current_taad_utxo_json");
    let new_taad = arg!(new_taad_pubkey_hex, "new_taad_pubkey_hex");
    let new_hw = arg!(new_hw_pubkey_hex, "new_hw_pubkey_hex");
    let guardians = arg!(guardian_signing_keys_json, "guardian_signing_keys_json");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    match taad_did::build_init_recovery_tx(
        &utxo, &new_taad, &new_hw, &guardians, collateral_lovelace, recovery_timelock_slots,
        &seed, network, &script_cbor, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// FFI: **CancelRecovery** — controller hiện tại ký TRƯỚC deadline; status →
/// Active (A-6: upper bound < deadline). Null nếu lỗi (kể cả khi đã quá hạn).
#[no_mangle]
pub unsafe extern "C" fn taad_build_cancel_recovery_tx(
    current_taad_utxo_json: *const c_char,
    master_kek_hex: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let utxo = arg!(current_taad_utxo_json, "current_taad_utxo_json");
    let kek = arg!(master_kek_hex, "master_kek_hex");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    match taad_did::build_cancel_recovery_tx(
        &utxo, &kek, &seed, network, &script_cbor, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// FFI: **FinalizeRecovery** — controller MỚI (pending) ký SAU deadline; status
/// → Active, lắp controller/hw từ pending. `new_master_kek_hex` = Master_KEK mới
/// của chủ đã khôi phục (pkh TAAD phải khớp pending committed ở InitRecovery).
/// Null nếu lỗi (kể cả khi chưa tới hạn hoặc khoá không khớp).
#[no_mangle]
pub unsafe extern "C" fn taad_build_finalize_recovery_tx(
    current_taad_utxo_json: *const c_char,
    new_master_kek_hex: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    taad_script_cbor_hex: *const c_char,
    utxo_inputs_json: *const c_char,
    protocol_params_json: *const c_char,
    current_slot: u64,
) -> *mut c_char {
    let utxo = arg!(current_taad_utxo_json, "current_taad_utxo_json");
    let new_kek = arg!(new_master_kek_hex, "new_master_kek_hex");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");
    let script_cbor = arg!(taad_script_cbor_hex, "taad_script_cbor_hex");
    let utxos = arg!(utxo_inputs_json, "utxo_inputs_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    match taad_did::build_finalize_recovery_tx(
        &utxo, &new_kek, &seed, network, &script_cbor, &utxos, &params, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// Sinh keypair controller Ed25519 ĐỘC LẬP cho luồng xoay khoá Model B.
///
/// Khoá mới = entropy NGẪU NHIÊN độc lập (CSPRNG hệ điều hành), KHÔNG derive từ
/// Master_KEK — để seed cũ lộ KHÔNG suy ra được controller key mới.
///
/// Trả JSON `{"secret_hex":"<64hex>","pubkey_hex":"<64hex>","pkh_hex":"<56hex>"}`
/// (caller free bằng `taad_free_string`):
///   - `pubkey_hex` → dùng làm `new_taad_pubkey_hex` khi gọi build rotate.
///   - `pkh_hex`    → 28-byte VerificationKeyHash = blake2b-224(pubkey), khớp
///     đúng `controller_pkh` mà build rotate/create tự tính lại.
///   - `secret_hex` → CALLER tự lưu. Storage/wrap (Device_KEK) + recovery
///     wrapping + phân tán LampNet theo §11 spec (Long làm) — NGOÀI phạm vi FFI
///     này. KHÔNG log/persist/transmit ở tầng Rust.
///
/// SECURITY: `secret_hex` là root-of-trust controller mới sau rotate. Caller
/// PHẢI wrap + sao lưu an toàn TRƯỚC khi submit tx rotate.
#[no_mangle]
pub extern "C" fn taad_generate_controller_keypair() -> *mut c_char {
    let kp = taad_did::generate_controller_keypair();
    // Ba field đều là hex thuần [0-9a-f] → an toàn nhúng thẳng vào JSON, không
    // cần escape (cùng cách crypto.rs build JSON ciphertext/iv).
    let json = format!(
        r#"{{"secret_hex":"{}","pubkey_hex":"{}","pkh_hex":"{}"}}"#,
        kp.secret_hex,
        kp.pubkey_hex,
        hex::encode(kp.pkh),
    );
    string_to_c(json)
}

/// Ký một giao dịch MINT LAMP theo cổng on-chain THẬT (bản B canonical,
/// token-mint v2 — chốt 2026-07-06, xem `LAMP/SPEC/lamp-mint-core-adapter.md`).
///
/// Ráp + ký tx mint LAMP dưới `lamp_mint` (route DistributionVest), gate qua BA
/// validator ghép: `supply_state` (spend, cap) + `registry` (reference, WHO) +
/// `lamp_mint` (mint, A-DEST). Authority mint được đọc TRỰC TIẾP từ RegistryDatum
/// (decode raw inline datum — KHÔNG còn mô hình bản A đọc controller_pkh từ TAAD
/// anchor). Toàn bộ Δ LAMP rót vào KHO (A-DEST), KHÔNG ra ví.
///
/// Thứ tự tham số PHẢI khớp `mint_lamp::build_mint_lamp_via_did`:
///   - `authority_keks_json`      JSON array 64-hex Master_KEK — 1 cho SinglePkh,
///                                ≥ threshold cho MultiSig. KHÔNG log.
///   - `registry_utxo_json`      JSON {tx_hash,index,inline_datum_hex} — Registry
///                                UTxO (reference input; datum decode tại Rust).
///   - `token_tag_hex`           hex token_tag tra bảng registry (param bake vào
///                                lamp_mint, vd `#"4c414d50746167"`).
///   - `supply_state_utxo_json`  JSON {tx_hash,index,amount_lovelace,assets,
///                                inline_datum_hex} — SupplyState UTxO (SPEND,
///                                redeemer Advance; datum decode tại Rust).
///   - `supply_state_script_cbor` Plutus V3 supply_state script (CBOR hex); hash
///                                = địa chỉ SupplyState UTxO đang nằm.
///   - `kho_utxo_json`           JSON {tx_hash,index,address} — KHO UTxO (reference
///                                input mang KHO NFT); `address` = A-DEST output.
///   - `lamp_policy_cbor_hex`    Plutus V3 lamp_mint script (CBOR hex); hash =
///                                LAMP policy id (mint witness).
///   - `mint_json`               JSON {token_name_hex,amount} — Δ oil (>0).
///   - `utxos_json`              JSON array UtxoInput ví (fee + collateral pure-ADA).
///   - `protocol_params_json`    Blockfrost /epochs/latest/parameters JSON.
///   - `wallet_seed_hex`         64-hex seed ví CIP-1852 (trả phí + nhận change).
///   - `network`                 0=testnet (preprod/preview), 1=mainnet.
///   - `current_slot`            slot tip (TTL = current_slot + 7200).
///
/// Trả hex signed tx CBOR (caller free bằng `taad_free_string`) hoặc null khi
/// lỗi. Caller (super-app team) lo: fetch dữ liệu chuỗi (registry/supply_state/
/// kho/ví), evaluate-then-patch ExUnits, và submit + neo CID.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_mint_lamp_via_did(
    authority_keks_json: *const c_char,
    registry_utxo_json: *const c_char,
    token_tag_hex: *const c_char,
    supply_state_utxo_json: *const c_char,
    supply_state_script_cbor: *const c_char,
    kho_utxo_json: *const c_char,
    lamp_policy_cbor_hex: *const c_char,
    mint_json: *const c_char,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    current_slot: u64,
) -> *mut c_char {
    let auth_keks = arg!(authority_keks_json, "authority_keks_json");
    let registry = arg!(registry_utxo_json, "registry_utxo_json");
    let token_tag = arg!(token_tag_hex, "token_tag_hex");
    let supply_state = arg!(supply_state_utxo_json, "supply_state_utxo_json");
    let ss_script = arg!(supply_state_script_cbor, "supply_state_script_cbor");
    let kho = arg!(kho_utxo_json, "kho_utxo_json");
    let policy = arg!(lamp_policy_cbor_hex, "lamp_policy_cbor_hex");
    let mint = arg!(mint_json, "mint_json");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");

    match mint_lamp::build_mint_lamp_via_did(
        &auth_keks, &registry, &token_tag, &supply_state, &ss_script, &kho, &policy, &mint,
        &utxos, &params, &seed, network, current_slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

// ================================================================
// [V13] Wallet transfer (gửi ADA / LAMP) — chi tiêu ví thường
//
// Spec: testnet-plan/TRANSFER-TX-SPEC-2026-06-05.md
// Độc lập với TAAD on-chain (publish/create/rotate). Build + sign tx Cardano
// thật để gửi ADA hoặc LAMP từ ví đời `account` (= walletRotationIndex).
// ================================================================

/// Build + sign a wallet transfer tx (gửi ADA hoặc LAMP). Returns hex-encoded
/// signed tx CBOR, or null on any error (insufficient UTxO / min-ada / parse).
///
/// The sender wallet = CIP-1852 address at `account` (QĐ-B mô hình ví); the tx
/// is signed by the payment key derived from `seed_hex` at the SAME account, so
/// the signing key always matches the funded address. Caller submits the CBOR
/// via Blockfrost `/tx/submit` or the backend submit endpoint.
///
/// # Args (all `*const c_char` are null-terminated UTF-8)
/// * `seed_hex`             — 64-char hex wallet seed (from Master_KEK)
/// * `account`              — CIP-1852 account index = walletRotationIndex
/// * `to_address`           — bech32 recipient
/// * `amount_lovelace`      — ADA to send (lovelace). With LAMP, acts as the
///   recipient output's ADA floor (bumped to min-ada if too small)
/// * `lamp_amount`          — 0 = ADA-only; >0 = also send this many LAMP units
/// * `lamp_policy_hex`      — 28-byte LAMP policy id hex (empty if lamp_amount=0)
/// * `lamp_asset_name_hex`  — LAMP asset name hex (may be empty)
/// * `utxos_json`           — JSON `[{tx_hash,index,lovelace,assets:[{policy,name,quantity}]}]`
/// * `protocol_params_json` — Blockfrost `/epochs/latest/parameters`
/// * `network`              — 0 = testnet/preprod, 1 = mainnet
///
/// Returns: hex signed tx CBOR (caller free via `taad_free_string`) or null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_signed_transfer(
    seed_hex: *const c_char,
    account: u32,
    to_address: *const c_char,
    amount_lovelace: u64,
    lamp_amount: u64,
    lamp_policy_hex: *const c_char,
    lamp_asset_name_hex: *const c_char,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let to = arg!(to_address, "to_address");
    let policy = c_str_to_string(lamp_policy_hex).unwrap_or_default();
    let name = c_str_to_string(lamp_asset_name_hex).unwrap_or_default();
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    let tx_hex = transfer::build_signed_transfer(
        &seed, account, &to, amount_lovelace, lamp_amount,
        &policy, &name, &utxos, &params, network,
    );
    string_or_fail(tx_hex, "taad_build_signed_transfer")
}

// ================================================================
// [V14] Mint-Authority Registry (do DID quản) — deploy / update / mint
//
// Registry = UTxO ở addr validator registry, mang Registry-NFT (policy ≡ script
// hash, name = blake2b_256(governing_did)) + inline RegistryDatum liệt kê bảng
// authorization (action_tag → SinglePkh / MultiSig / Revoked). Controller của
// governing_did quản trị: update phải có chữ ký controller + REFERENCE input là
// DID anchor. Token mint qua policy did_token_mint đọc registry (reference input)
// + thoả authorization. Ba FFI dưới khớp `registry_mint::build_*`.
// ================================================================

/// Deploy registry: MINT Registry-NFT one-shot (bound vào genesis OutputReference)
/// + khoá RegistryDatum{governing_did, entries} ở addr script. Controller của
/// governing_did (suy từ `controller_kek`) ký chứng minh chủ ý. Genesis UTxO bị
/// TIÊU để chốt one-shot.
///
/// Thứ tự tham số PHẢI khớp `registry_mint::build_deploy_mint_registry`:
///   - `controller_kek`        64-hex Master_KEK của controller governing_did.
///   - `governing_did`         DID quản registry (UTF-8). Vào datum field 0 +
///                             drive Registry-NFT name = blake2b_256(did).
///   - `genesis_utxo_json`     JSON {tx_hash,index,amount_lovelace,assets?} —
///                             outpoint one-shot, bị TIÊU.
///   - `initial_entries_json`  JSON array [{action_tag_hex, authorization:{kind,...}}]
///                             (kind = single|multisig|revoked). `[]` = bảng rỗng.
///   - `registry_script_cbor`  Plutus V3 registry script (CBOR hex); hash = addr +
///                             policy id Registry-NFT.
///   - `utxos_json`            JSON array UtxoInput ví (fee + collateral pure-ADA).
///   - `params_json`           Blockfrost /epochs/latest/parameters JSON.
///   - `wallet_seed_hex`       64-hex seed ví CIP-1852 (fee + change).
///   - `network`               0=preprod, 1=mainnet, 2=preview.
///   - `slot`                  slot tip (TTL = slot + 7200).
///
/// Trả hex signed tx CBOR (caller free bằng `taad_free_string`) hoặc null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_deploy_mint_registry(
    controller_kek: *const c_char,
    governing_did: *const c_char,
    genesis_utxo_json: *const c_char,
    initial_entries_json: *const c_char,
    registry_script_cbor: *const c_char,
    utxos_json: *const c_char,
    params_json: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    slot: u64,
) -> *mut c_char {
    let kek = arg!(controller_kek, "controller_kek");
    let did = arg!(governing_did, "governing_did");
    let genesis = arg!(genesis_utxo_json, "genesis_utxo_json");
    let entries = arg!(initial_entries_json, "initial_entries_json");
    let script = arg!(registry_script_cbor, "registry_script_cbor");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(params_json, "params_json");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");

    match registry_mint::build_deploy_mint_registry(
        &kek, &did, &genesis, &entries, &script, &utxos, &params, &seed, network, slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// Update registry: SPEND Registry UTxO (Update redeemer), đặt DID anchor làm
/// REFERENCE input (KHÔNG tiêu), controller (suy từ `controller_kek`) ký
/// (add_required_signer), continuing output ở addr script giữ Registry-NFT +
/// RegistryDatum MỚI (từ `new_entries_json`). `governing_did` truyền lại để
/// datum mới giữ field 0 BẤT BIẾN.
///
/// Thứ tự tham số PHẢI khớp `registry_mint::build_update_mint_registry`:
///   - `controller_kek`        64-hex Master_KEK controller.
///   - `governing_did`         DID quản (giữ nguyên trong datum mới).
///   - `registry_utxo_json`    JSON {tx_hash,index,amount_lovelace,assets[]} — UTxO
///                             registry bị spend (assets gồm Registry-NFT, giữ lại).
///   - `did_anchor_utxo_json`  JSON {tx_hash,index,...} — DID anchor (reference input).
///   - `new_entries_json`      JSON array entries MỚI (thay toàn bộ bảng cũ).
///   - `registry_script_cbor`  Plutus V3 registry script (CBOR hex).
///   - `utxos_json`            JSON array UtxoInput ví (fee + collateral; phải có
///                             UTxO khác registry).
///   - `params_json`           protocol params JSON.
///   - `wallet_seed_hex`       64-hex seed ví.
///   - `network` / `slot`      như deploy.
///
/// Trả hex signed tx CBOR (caller free) hoặc null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_update_mint_registry(
    controller_kek: *const c_char,
    governing_did: *const c_char,
    registry_utxo_json: *const c_char,
    did_anchor_utxo_json: *const c_char,
    new_entries_json: *const c_char,
    registry_script_cbor: *const c_char,
    utxos_json: *const c_char,
    params_json: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    slot: u64,
) -> *mut c_char {
    let kek = arg!(controller_kek, "controller_kek");
    let did = arg!(governing_did, "governing_did");
    let registry = arg!(registry_utxo_json, "registry_utxo_json");
    let anchor = arg!(did_anchor_utxo_json, "did_anchor_utxo_json");
    let entries = arg!(new_entries_json, "new_entries_json");
    let script = arg!(registry_script_cbor, "registry_script_cbor");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(params_json, "params_json");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");

    match registry_mint::build_update_mint_registry(
        &kek, &did, &registry, &anchor, &entries, &script, &utxos, &params, &seed, network, slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// Mint token qua registry: token policy `did_token_mint(...)` đọc Registry UTxO
/// làm REFERENCE input + thoả authorization của action_tag. Thêm mỗi authorization
/// key làm required signer + ký bằng tất cả (single hoặc multisig M-of-N).
///
/// Thứ tự tham số PHẢI khớp `registry_mint::build_mint_via_registry`. Tên trường
/// dưới đây đọc THẲNG từ struct `Deserialize` trong `registry_mint.rs` — trường
/// nào không ghi `#[serde(default)]` là BẮT BUỘC, thiếu thì hàm trả null:
///   - `authority_keks_json`   JSON array hex Master_KEK — 1 (SinglePkh) hoặc M..N
///                             (MultiSig). Mỗi cái suy 1 khoá ký + required signer.
///   - `registry_utxo_json`    `RefUtxo` (registry_mint.rs:535) — registry làm
///                             REFERENCE input. {tx_hash, index} bắt buộc;
///                             {amount_lovelace, assets} có mặc định.
///   - `token_policy_cbor`     Plutus V3 token mint policy (CBOR hex); hash = policy id.
///   - `mint_json`             `TokenMintInstruction` (registry_mint.rs:607) —
///                             {amount} bắt buộc; {asset_name_hex, recipient,
///                             route} có mặc định. `route` = "distribution"
///                             (mặc định) | "reserve", chỉ dùng khi token CÓ cap.
///   - `supply_state_utxo_json` `SupplyStateSpendUtxo` (registry_mint.rs:576) —
///                             UTxO SupplyState bị SPEND (token CÓ cap, vd LAMP).
///                             BẮT BUỘC: {tx_hash, index, amount_lovelace,
///                             dist_minted, dist_cap, reserve_cap}. Có mặc định:
///                             {assets, reserve_minted, supply_state_nft_policy_hex,
///                             supply_state_nft_name_hex}. Đơn vị minted/cap là
///                             OIL, đọc từ inline datum CŨ.
///                             "" (rỗng) = token KHÔNG cap (giữ đường reference cũ).
///   - `supply_state_script_cbor` Plutus V3 supply_state script (CBOR hex); bỏ qua
///                             khi `supply_state_utxo_json` rỗng.
///   - `utxos_json`            JSON array UtxoInput ví (fee + collateral pure-ADA).
///   - `params_json`           protocol params JSON.
///   - `wallet_seed_hex`       64-hex seed ví (fee + change).
///   - `network` / `slot`      như deploy.
///
/// Trả hex signed tx CBOR (caller free) hoặc null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_mint_via_registry(
    authority_keks_json: *const c_char,
    registry_utxo_json: *const c_char,
    token_policy_cbor: *const c_char,
    mint_json: *const c_char,
    supply_state_utxo_json: *const c_char,
    supply_state_script_cbor: *const c_char,
    utxos_json: *const c_char,
    params_json: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    slot: u64,
) -> *mut c_char {
    let keks = arg!(authority_keks_json, "authority_keks_json");
    let registry = arg!(registry_utxo_json, "registry_utxo_json");
    let policy = arg!(token_policy_cbor, "token_policy_cbor");
    let mint = arg!(mint_json, "mint_json");
    let ss_utxo = arg!(supply_state_utxo_json, "supply_state_utxo_json");
    let ss_script = arg!(supply_state_script_cbor, "supply_state_script_cbor");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(params_json, "params_json");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");

    match registry_mint::build_mint_via_registry(
        &keks, &registry, &policy, &mint, &ss_utxo, &ss_script, &utxos, &params, &seed, network, slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

/// Genesis SupplyState: MINT thread NFT one-shot ("SUPPLY", bound vào genesis
/// OutputReference) qua `thread_nft` policy + khoá `SupplyState{dist_minted:0,
/// reserve_minted:0, dist_cap, reserve_cap}` ở addr supply_state script. Genesis UTxO
/// bị TIÊU (one-shot). KHÔNG cần controller ký (chỉ ví trả phí).
///
/// THỨ TỰ DEPLOY (thread_nft.ak/lamp_mint.ak): thread_nft (param genesis_ref) →
/// thread_nft_policy; lamp_mint (param thread_nft_policy + caps) → lamp_policy;
/// supply_state (param lamp_policy + thread_nft_policy + token_name). Tuyến tính.
///
/// Thứ tự tham số PHẢI khớp `registry_mint::build_genesis_supply_state`:
///   - `genesis_utxo_json`       JSON {tx_hash,index,amount_lovelace,assets?} bị TIÊU.
///   - `thread_nft_policy_cbor`  Plutus V3 thread_nft script (CBOR hex); hash = policy
///                               id thread NFT. Mint +1 ("SUPPLY", qty 1) dưới nó.
///   - `dist_cap` / `reserve_cap` caps (oil) bake vào lamp_mint đã deploy (LAMP:
///                               26_370_000_000_000_000 / 9_630_000_000_000_000).
///   - `supply_state_script_cbor` Plutus V3 supply_state script (CBOR hex); hash = addr
///                               khoá SupplyState UTxO.
///   - `utxos_json`              JSON array UtxoInput ví (fee + collateral pure-ADA).
///   - `params_json`             protocol params JSON.
///   - `wallet_seed_hex`         64-hex seed ví.
///   - `network` / `slot`        như deploy.
///
/// Trả hex signed tx CBOR (caller free) hoặc null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_genesis_supply_state(
    genesis_utxo_json: *const c_char,
    thread_nft_policy_cbor: *const c_char,
    dist_cap_str: *const c_char,
    reserve_cap_str: *const c_char,
    supply_state_script_cbor: *const c_char,
    utxos_json: *const c_char,
    params_json: *const c_char,
    wallet_seed_hex: *const c_char,
    network: u8,
    slot: u64,
) -> *mut c_char {
    let genesis = arg!(genesis_utxo_json, "genesis_utxo_json");
    let thread_policy = arg!(thread_nft_policy_cbor, "thread_nft_policy_cbor");
    let dist_cap_s = arg!(dist_cap_str, "dist_cap_str");
    let reserve_cap_s = arg!(reserve_cap_str, "reserve_cap_str");
    let ss_script = arg!(supply_state_script_cbor, "supply_state_script_cbor");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(params_json, "params_json");
    let seed = arg!(wallet_seed_hex, "wallet_seed_hex");

    // caps passed as decimal strings (oil) — u128 exceeds C u64 semantics safely.
    let dist_cap: u128 = match dist_cap_s.trim().parse() {
        Ok(v) => v,
        Err(e) => return fail(format!("invalid argument `dist_cap_str`: {e}")),
    };
    let reserve_cap: u128 = match reserve_cap_s.trim().parse() {
        Ok(v) => v,
        Err(e) => return fail(format!("invalid argument `reserve_cap_str`: {e}")),
    };

    match registry_mint::build_genesis_supply_state(
        &genesis, &thread_policy, dist_cap, reserve_cap, &ss_script, &utxos, &params, &seed, network, slot,
    ) {
        Ok(tx_hex) => string_to_c(tx_hex),
        Err(e) => fail(e),
    }
}

// ================================================================
// [V14] LampNet §7 distributed storage — client crypto layer
//
// PURPOSE (PO-locked recovery model): after a key rotation, the NEW controller
// key (or its EncSeed) is distributed to LampNet so it can be recovered later.
// The thing encrypted is the NEW controller key — NOT the Master_KEK.
//
// CRITICAL FIX: the ECIES recipient X25519 keypair is now DERIVED FROM the
// Master_KEK (HKDF, info="lampnet-ecies-x25519-v1") instead of being supplied
// by the caller. Previously the caller passed an X25519 key it held on-device;
// losing the device meant losing the decryption key → PERMANENT data loss.
// Now recovery works from the 24 words alone: user re-derives Master_KEK →
// re-derives the SAME X25519 secret → decrypts. NOT circular (the user holds
// Master_KEK out-of-band via the paper seed).
//
// CONTENT-ADDRESSED (real LampNet format, README.md:2042 +
// mobile-upload-flow.md): upload is a multipart/form-data POST; LampNet returns
// a CID (plain-text, e.g. "ln1q_..."). Download is GET https://lampnet.cloud/
// {cid}. The CID is NON-DETERMINISTIC and MUST be persisted by the caller for
// recovery — see TODO(cid-anchoring) in lampnet.rs.
//
// The FFI does the crypto + builds the request SPEC; the Dart caller does the
// actual HTTP I/O (network kept out of the core — mandate §V.3).
// ================================================================

/// Build the LampNet upload request for the new controller key (client-side
/// ECIES-wrapped to a Master_KEK-derived recipient key).
///
/// # Args (`*const c_char`, null-terminated UTF-8)
/// * `payload_hex`     — hex of the bytes to distribute: the NEW controller key
///   or its EncSeed (already Device_KEK encrypted). NOT the Master_KEK.
/// * `hw_uid_hex`      — hex of the device HW_UID (feeds the LocatorID index only).
/// * `did`             — DID string (feeds the LocatorID index only).
/// * `master_kek_hex`  — 32-byte (64-hex) Master_KEK. The X25519 recipient key
///   is DERIVED from it internally — no external key. Same hex format as
///   `taad_sign_ed25519` / `taad_build_rotate_taad_tx` (`old_master_kek_hex`).
///
/// Returns a JSON SPEC for a multipart POST:
/// `{"method":"POST","url","content_type","multipart":{"file","data_class",
/// "redundancy"},"ciphertext","locator_id","response"}`. The upload RESPONSE is
/// a PLAIN-TEXT CID (trim, not JSON) which the caller MUST persist for recovery.
/// (caller free via `taad_free_string`) or null on bad hex / wrong-length KEK.
#[no_mangle]
pub unsafe extern "C" fn taad_lampnet_build_upload_request(
    payload_hex: *const c_char,
    hw_uid_hex: *const c_char,
    did: *const c_char,
    master_kek_hex: *const c_char,
) -> *mut c_char {
    let payload_s = arg!(payload_hex, "payload_hex");
    let hw_uid_s = arg!(hw_uid_hex, "hw_uid_hex");
    let did_s = arg!(did, "did");
    let kek_s = arg!(master_kek_hex, "master_kek_hex");

    // Câu lỗi của crate `hex` nêu KÝ TỰ sai — với chuỗi bí mật (payload, KEK)
    // đó là một byte của bí mật đi ra ngoài. Chỉ nêu TÊN đối số.
    let payload = match hex::decode(&payload_s) {
        Ok(b) => b,
        Err(_) => return fail("invalid argument `payload_hex`: not valid hex"),
    };
    let hw_uid = match hex::decode(&hw_uid_s) {
        Ok(b) => b,
        Err(_) => return fail("invalid argument `hw_uid_hex`: not valid hex"),
    };
    let kek_bytes = match hex::decode(&kek_s) {
        Ok(b) => b,
        Err(_) => return fail("invalid argument `master_kek_hex`: not valid hex"),
    };
    if kek_bytes.len() != 32 {
        return fail(format!(
            "invalid argument `master_kek_hex`: expected 32 bytes (64 hex chars), got {}",
            kek_bytes.len()
        ));
    }
    let mut kek = [0u8; 32];
    kek.copy_from_slice(&kek_bytes);

    let json = lampnet::lampnet_build_upload_request(&payload, &hw_uid, &did_s, &kek);
    string_to_c(json)
}

/// Build the LampNet retrieval request (GET by CID). Returns JSON
/// `{"method":"GET","url":"https://lampnet.cloud/{cid}","cid"}` — the Dart
/// caller GETs the URL, then feeds the returned ciphertext to
/// `taad_lampnet_recover_decrypt`.
///
/// # Args
/// * `cid` — the content-addressed identifier returned by the upload POST and
///   PERSISTED by the caller (LampNet is content-addressed; the CID is the only
///   fetch address — see TODO(cid-anchoring)).
///
/// Returns owned JSON string (free via `taad_free_string`) or null on null arg.
#[no_mangle]
pub unsafe extern "C" fn taad_lampnet_build_recover_request(
    cid: *const c_char,
) -> *mut c_char {
    let cid_s = arg!(cid, "cid");
    string_to_c(lampnet::lampnet_build_recover_request(&cid_s))
}

/// Decrypt a ciphertext blob retrieved from LampNet back into the new
/// controller key, using the X25519 secret DERIVED from the Master_KEK.
///
/// # Args
/// * `ciphertext_hex`  — hex of the ECIES blob returned by the GET.
/// * `master_kek_hex`  — 32-byte (64-hex) Master_KEK (recovered from the 24
///   words). The X25519 secret is derived from it internally.
///
/// Returns hex of the recovered payload (free via `taad_free_string`) or null
/// on bad hex / wrong KEK / tampered ciphertext (GCM auth failure → fail-closed).
#[no_mangle]
pub unsafe extern "C" fn taad_lampnet_recover_decrypt(
    ciphertext_hex: *const c_char,
    master_kek_hex: *const c_char,
) -> *mut c_char {
    let ct_s = arg!(ciphertext_hex, "ciphertext_hex");
    let kek_s = arg!(master_kek_hex, "master_kek_hex");
    let blob = match hex::decode(&ct_s) {
        Ok(b) => b,
        Err(_) => return fail("invalid argument `ciphertext_hex`: not valid hex"),
    };
    let kek_bytes = match hex::decode(&kek_s) {
        Ok(b) => b,
        Err(_) => return fail("invalid argument `master_kek_hex`: not valid hex"),
    };
    if kek_bytes.len() != 32 {
        return fail(format!(
            "invalid argument `master_kek_hex`: expected 32 bytes (64 hex chars), got {}",
            kek_bytes.len()
        ));
    }
    let mut kek = [0u8; 32];
    kek.copy_from_slice(&kek_bytes);

    let (secret, _) = lampnet::derive_x25519_static_from_kek(&kek);
    match lampnet::ecies_decrypt(&secret.to_bytes(), &blob) {
        Ok(plain) => string_to_c(hex::encode(&plain[..])),
        Err(e) => fail(e),
    }
}
// [V15] Staking + delegation (ĐA POOL — nền ISPO)
//
// CỐT LÕI: Cardano 1 stake key ⇒ 1 pool. ĐA POOL = ĐA ACCOUNT — mỗi CIP-1852
// account' có stake key riêng (m/1852'/1815'/account'/2/0) ủy thác 1 pool. Một
// tx CÓ THỂ gộp NHIỀU cert cho các stake credential khác nhau (multi-pool).
// Mọi hàm trả hex signed-tx CBOR (caller free via taad_free_string) hoặc null.
// ================================================================

/// Stake-key registration + delegation cho 1 account → 1 pool.
///
/// # Args (`*const c_char` null-terminated UTF-8 trừ số)
/// * `seed_hex`             — 64-hex wallet seed (Master_KEK)
/// * `account`              — CIP-1852 account index (stake key + vốn nguồn)
/// * `pool_bech32`          — pool id `pool1...`
/// * `utxos_json`           — `[{tx_hash,index,lovelace,assets?}]` của ví nguồn
/// * `protocol_params_json` — Blockfrost `/epochs/latest/parameters`
/// * `network`              — 0 = testnet/preprod, 1 = mainnet
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_stake_delegation_tx(
    seed_hex: *const c_char,
    account: u32,
    pool_bech32: *const c_char,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let pool = arg!(pool_bech32, "pool_bech32");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    let tx_hex =
        staking::build_stake_delegation_tx(&seed, account, &pool, &utxos, &params, network);
    string_or_fail(tx_hex, "taad_build_stake_delegation_tx")
}

/// MULTI-POOL delegation (nền ISPO) — MỘT tx gồm N output + N StakeRegistration
/// + N StakeDelegation cho N account khác nhau. Vốn chi từ `funding_account`.
///
/// # Args
/// * `seed_hex`             — 64-hex wallet seed
/// * `funding_account`      — account chi vốn (thường 0 = ví cố định)
/// * `allocations_json`     — `[{"account":1,"lovelace":"50000000","pool_bech32":"pool1..."}, ...]`
///   (account TRÙNG bị từ chối — 1 stake key ủy thác 1 pool)
/// * `utxos_json`           — UTxO của ví nguồn (`funding_account`)
/// * `protocol_params_json` — Blockfrost params
/// * `network`              — 0 = testnet/preprod, 1 = mainnet
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_multi_pool_delegation_tx(
    seed_hex: *const c_char,
    funding_account: u32,
    allocations_json: *const c_char,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let allocs = arg!(allocations_json, "allocations_json");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    let tx_hex = staking::build_multi_pool_delegation_tx(
        &seed, funding_account, &allocs, &utxos, &params, network,
    );
    string_or_fail(tx_hex, "taad_build_multi_pool_delegation_tx")
}

/// Rút reward của stake account `account`.
///
/// # Args
/// * `reward_lovelace` — số reward rút (lovelace); phải đúng số đang có on-chain
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_withdraw_reward_tx(
    seed_hex: *const c_char,
    account: u32,
    reward_lovelace: u64,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    let tx_hex =
        staking::build_withdraw_reward_tx(&seed, account, reward_lovelace, &utxos, &params, network);
    string_or_fail(tx_hex, "taad_build_withdraw_reward_tx")
}

/// Conway vote delegation — ủy thác voting power của stake key `account` tới DRep.
///
/// # Args
/// * `drep_id` — bech32 `drep1...`/`drep_script1...`, hoặc `abstain`/`no_confidence`.
///   Stake key phải ĐÃ đăng ký (vote delegation không tự đăng ký stake key).
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn taad_build_vote_delegation_tx(
    seed_hex: *const c_char,
    account: u32,
    drep_id: *const c_char,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let drep = arg!(drep_id, "drep_id");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    let tx_hex =
        staking::build_vote_delegation_tx(&seed, account, &drep, &utxos, &params, network);
    string_or_fail(tx_hex, "taad_build_vote_delegation_tx")
}

/// Hủy đăng ký stake key `account` (hoàn lại ~2 ADA key deposit).
#[no_mangle]
pub unsafe extern "C" fn taad_build_stake_deregistration_tx(
    seed_hex: *const c_char,
    account: u32,
    utxos_json: *const c_char,
    protocol_params_json: *const c_char,
    network: u8,
) -> *mut c_char {
    let seed = arg!(seed_hex, "seed_hex");
    let utxos = arg!(utxos_json, "utxos_json");
    let params = arg!(protocol_params_json, "protocol_params_json");

    let tx_hex =
        staking::build_stake_deregistration_tx(&seed, account, &utxos, &params, network);
    string_or_fail(tx_hex, "taad_build_stake_deregistration_tx")
}

