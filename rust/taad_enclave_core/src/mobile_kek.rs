// mobile_kek.rs — Hàm DERIVE bậc cao cho mobile (SuperApp RN).
//
// Gói gọn chuỗi derive thành 1 lời gọi để 3 nền-tảng (iOS C-ABI, Android JNI, JS)
// chỉ truyền chuỗi — KHÔNG lặp lại hằng-số derive ở mỗi nơi (tránh lệch → khoá/
// địa-chỉ khác nhau giữa các nền tảng).
//
//   - khoá điều khiển TAAD: `sign::derive_taad_public_key` — công thức ở khối chú
//     thích đầu `sign.rs`, theo đặc tả PhoenixKey-Anchorme-Tech bước 2→5. Tệp này
//     KHÔNG giữ bản chép nào của công thức đó.
//   - wallet seed (ví CHI TIÊU của người dùng): HKDF(KEK, "wallet-v1", 00*32, 32)
//   - địa chỉ:              derive_address_account(wallet_seed, account, network)
//
// ⚠ HAI THỨ CÙNG TÊN "wallet seed", KHÁC CÔNG THỨC, đừng gộp:
//   · `mobile_kek::derive_wallet_seed` (ngay dưới) — entropy cho ví CHI TIÊU của
//     người dùng, `info = "wallet-v1"`, `salt = 00 × 32`. Đổi nó là đổi địa chỉ
//     của mọi người dùng đang có.
//   · `sign::derive_taad_wallet_seed` — entropy cho khoá ĐIỀU KHIỂN TAAD,
//     `info = "wallet-seed-v1"`, `salt = SHA-256("genesis")`. Chỉ dùng trong
//     đường danh tính/validator.
//   Hai giá trị KHÁC nhau ⟹ khoá điều khiển KHÔNG phải khoá thanh toán account 0
//   của ví người dùng, dù cả hai đều đi qua CIP-1852 `m/1852'/1815'/0'/0/0`.
//
// Tái-dùng crate::sign + crate::crypto + crate::cardano (KHÔNG tự cài lại crypto).

/// Khoá công khai của khoá điều khiển TAAD (64-hex) từ Master_KEK (64-hex).
/// '' nếu KEK sai. Đây là cửa FFI mà iOS/Android dùng — nó CHỈ chuyển tiếp sang
/// nguồn duy nhất trong `sign.rs`, không tự dẫn xuất.
pub fn derive_taad_pubkey(master_kek_hex: String) -> String {
    crate::sign::derive_taad_public_key(master_kek_hex)
}

/// Wallet seed của ví CHI TIÊU (32-byte hex) từ Master_KEK
/// = HKDF(KEK, "wallet-v1", 00*32, 32). KHÔNG phải `sign::derive_taad_wallet_seed`
/// — xem khối cảnh báo đầu tệp.
pub fn derive_wallet_seed(master_kek_hex: String) -> String {
    crate::crypto::hkdf_derive(
        master_kek_hex,
        "wallet-v1".to_string(),
        "00".repeat(32),
        32,
    )
}

/// Địa chỉ Cardano Shelley (Bech32) cho `account` index từ Master_KEK.
/// network: 0 = preprod, 1 = mainnet. '' nếu KEK/derive sai.
/// Dựng + ký tx Cardano gửi ADA/LAMP (Issue #74 — CLIENT build, backend chỉ RELAY
/// qua POST /wallet/tx/submit). Derive seed ví từ Master_KEK RỒI gọi
/// `transfer::build_signed_transfer` → CBOR hex đã witness đầy đủ, sẵn sàng submit.
/// Rỗng nếu KEK/seed sai hoặc build lỗi. KHÔNG lộ seed — chỉ trả CBOR đã ký.
///
/// `utxos_json`/`protocol_params_json` = JSON THÔ từ Blockfrost (giữ snake_case).
#[allow(clippy::too_many_arguments)]
pub fn build_signed_transfer(
    master_kek_hex: String,
    account: u32,
    to_address: String,
    amount_lovelace: u64,
    lamp_amount: u64,
    lamp_policy_hex: String,
    lamp_asset_name_hex: String,
    utxos_json: String,
    protocol_params_json: String,
    network: u8,
) -> String {
    let seed = derive_wallet_seed(master_kek_hex);
    if seed.is_empty() {
        return String::new();
    }
    crate::transfer::build_signed_transfer(
        &seed,
        account,
        &to_address,
        amount_lovelace,
        lamp_amount,
        &lamp_policy_hex,
        &lamp_asset_name_hex,
        &utxos_json,
        &protocol_params_json,
        network,
    )
}

/// Dựng + ký tx UỶ THÁC stake vào 1 pool (single-pool delegation). Derive seed ví
/// từ Master_KEK rồi gọi `staking::build_stake_delegation_tx` → CBOR hex đã witness
/// (payment + stake key của account). Gồm StakeRegistration (nếu chưa) + StakeDelegation.
/// Rỗng nếu KEK/seed sai hoặc build lỗi. Submit qua /wallet/tx/submit.
#[allow(clippy::too_many_arguments)]
pub fn build_stake_delegation(
    master_kek_hex: String,
    account: u32,
    pool_bech32: String,
    utxos_json: String,
    protocol_params_json: String,
    network: u8,
) -> String {
    let seed = derive_wallet_seed(master_kek_hex);
    if seed.is_empty() {
        return String::new();
    }
    crate::staking::build_stake_delegation_tx(
        &seed,
        account,
        &pool_bech32,
        &utxos_json,
        &protocol_params_json,
        network,
    )
}

/// Witness (ký) tx CBOR ĐÃ DỰNG SẴN bằng payment key của account (GetLAMP §2).
/// Derive seed từ Master_KEK rồi gọi `transfer::witness_unsigned_tx`. Rỗng nếu KEK sai.
pub fn witness_unsigned_tx(
    master_kek_hex: String,
    account: u32,
    unsigned_tx_cbor_hex: String,
    network: u8,
) -> String {
    let seed = derive_wallet_seed(master_kek_hex);
    if seed.is_empty() {
        return String::new();
    }
    crate::transfer::witness_unsigned_tx(&seed, account, &unsigned_tx_cbor_hex, network)
}

pub fn derive_wallet_address(master_kek_hex: String, account: u32, network: u8) -> String {
    let seed = derive_wallet_seed(master_kek_hex);
    if seed.is_empty() {
        return String::new();
    }
    crate::cardano::derive_address_account(seed, account, network)
}

/// Địa-chỉ STAKE (reward) của account — cùng Master_KEK, cùng đường dẫn CIP-1852,
/// chỉ lấy nhánh role 2. Dùng cho PhoenixKey /wallet/standard/register (stake_address)
/// và staking sau này. Rỗng nếu KEK/seed sai.
pub fn derive_stake_address(master_kek_hex: String, account: u32, network: u8) -> String {
    let seed = derive_wallet_seed(master_kek_hex);
    if seed.is_empty() {
        return String::new();
    }
    crate::cardano::derive_stake_address_account(seed, account, network)
}

/// Ký challenge proof-of-ownership cho PhoenixKey `/wallet/standard/register`
/// (Issue #47) bằng PAYMENT key của `account` (suy từ Master_KEK). `message` =
/// chuỗi challenge canonical do backend định (UTF-8), caller tự dựng:
///   "PHOENIXKEY_WALLET_STANDARD_REGISTER:" + userDid + ":" + fixedAddress + ":" + nonce
///
/// Trả JSON `{"paymentPublicKeyHex":"<64hex>","signature":"<128hex>"}` — cả hai
/// đều hex thuần nên nhúng thẳng vào JSON an-toàn (không cần escape). Rỗng nếu
/// KEK/seed sai. KHÔNG lộ khoá — chỉ ra pubkey + chữ-ký.
pub fn sign_wallet_register(master_kek_hex: String, account: u32, message: String) -> String {
    sign_wallet_register_bytes(master_kek_hex, account, message.as_bytes())
}

/// Same as [`sign_wallet_register`], but the message is an ARBITRARY byte string
/// passed in as hex.
///
/// Why the UTF-8 door cannot serve both: the C entry point takes
/// `*const c_char`, so a length-framed payload (4-byte big-endian lengths,
/// mostly `0x00`) is cut at the first `0x00`. The cut payload still produces a
/// well-formed 128-hex signature, so the mistake surfaces only on the server as
/// `WALLET_PAYMENT_SIGNATURE_INVALID`.
pub fn sign_wallet_register_hex(
    master_kek_hex: String,
    account: u32,
    message_hex: String,
) -> String {
    let message = match crate::utils::hex_to_bytes(&message_hex) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };
    sign_wallet_register_bytes(master_kek_hex, account, &message)
}

fn sign_wallet_register_bytes(master_kek_hex: String, account: u32, message: &[u8]) -> String {
    let seed = derive_wallet_seed(master_kek_hex);
    if seed.is_empty() {
        return String::new();
    }
    match crate::cardano::sign_payment_message(&seed, account, message) {
        Some((pubkey_hex, signature_hex)) => format!(
            r#"{{"paymentPublicKeyHex":"{}","signature":"{}"}}"#,
            pubkey_hex, signature_hex
        ),
        None => String::new(),
    }
}

// ─── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const KEK: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    /// Hai cửa phải cho ĐÚNG một kết quả khi nội dung là ASCII thuần — nếu không,
    /// chuyển luồng đang chạy sang cửa mới sẽ làm hỏng chính nó.
    #[test]
    fn hex_door_matches_string_door_for_plain_ascii() {
        let message = "PHOENIXKEY_WALLET_STANDARD_REGISTER:did:phoenix:abc:addr_test1:00ff";
        let via_string = sign_wallet_register(KEK.to_string(), 0, message.to_string());
        let via_hex =
            sign_wallet_register_hex(KEK.to_string(), 0, hex::encode(message.as_bytes()));
        assert!(via_string.contains("\"signature\":\""), "cửa chuỗi phải ký được: {via_string}");
        assert_eq!(via_string, via_hex);
    }

    /// Chuỗi đóng khung ký qua cửa hex KHÁC chuỗi bị cắt ở `0x00` đầu tiên. Đây là
    /// lý do cửa hex tồn tại: cầu `*const c_char` cắt ở byte đó mà vẫn trả về một
    /// chữ ký đúng hình dạng, nên chỗ hỏng không lộ ở tầng này.
    #[test]
    fn framed_payload_differs_from_the_payload_cut_at_the_first_nul() {
        let framed_hex = "503a000000026162"; // build("P:", "ab")
        let framed = sign_wallet_register_hex(KEK.to_string(), 0, framed_hex.to_string());
        let cut_at_nul = sign_wallet_register(KEK.to_string(), 0, "P:".to_string());
        assert!(framed.contains("\"signature\":\""), "phải ký được: {framed}");
        assert_ne!(framed, cut_at_nul);
    }

    /// Hex không hợp lệ → chuỗi RỖNG. Người gọi phải phân biệt được "không ký được"
    /// với "đã ký", nên tuyệt đối không ký bừa trên byte rác.
    #[test]
    fn hex_door_refuses_a_payload_that_is_not_hex() {
        assert_eq!(sign_wallet_register_hex(KEK.to_string(), 0, "abc".to_string()), "");
        assert_eq!(sign_wallet_register_hex(KEK.to_string(), 0, "zz".to_string()), "");
    }
}
