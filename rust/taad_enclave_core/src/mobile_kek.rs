// mobile_kek.rs — Hàm DERIVE bậc cao cho mobile (SuperApp RN).
//
// Gói gọn chuỗi derive của Enclave (enclave_bridge.dart deriveTaadPublicKey /
// deriveWalletSeed / deriveCardanoAddressAccount) thành 1 lời gọi để 3 nền-tảng
// (iOS C-ABI, Android JNI, JS) chỉ truyền chuỗi — KHÔNG lặp lại hằng-số derive ở
// mỗi nơi (tránh lệch → khoá/địa-chỉ khác Enclave). Hằng-số LẤY ĐÚNG từ Dart:
//   - TAAD_Key (Ed25519): ed25519( HKDF(KEK, "taad-controller-v1", SHA256("genesis"), 32) )
//   - wallet seed:        HKDF(KEK, "wallet-v1", 00*32, 32)
//   - địa chỉ:            derive_address_account(wallet_seed, account, network)
//
// Tái-dùng crate::crypto + crate::cardano (KHÔNG tự cài lại crypto).

/// TAAD_Key (Ed25519) public key hex từ Master_KEK (64-hex). '' nếu KEK sai.
pub fn derive_taad_pubkey(master_kek_hex: String) -> String {
    let salt = crate::crypto::sha256_hex("genesis".to_string());
    let seed = crate::crypto::hkdf_derive(
        master_kek_hex,
        "taad-controller-v1".to_string(),
        salt,
        32,
    );
    if seed.is_empty() {
        return String::new();
    }
    crate::crypto::derive_ed25519_public_key(seed)
}

/// Wallet seed (32-byte hex) từ Master_KEK = HKDF(KEK, "wallet-v1", 00*32, 32).
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
    let seed = derive_wallet_seed(master_kek_hex);
    if seed.is_empty() {
        return String::new();
    }
    match crate::cardano::sign_payment_message(&seed, account, message.as_bytes()) {
        Some((pubkey_hex, signature_hex)) => format!(
            r#"{{"paymentPublicKeyHex":"{}","signature":"{}"}}"#,
            pubkey_hex, signature_hex
        ),
        None => String::new(),
    }
}
