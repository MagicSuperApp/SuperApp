// Cardano address derivation from BIP32 seed.
//
// Derives Shelley payment + stake credential pair → Bech32 base address.
// Spec: CIP-1852 (Cardano BIP44 derivation path).
//
// Path: m / 1852' / 1815' / account' / role / index
//   account = 0
//   role    = 0 (external payment) / 2 (stake)
//   index   = 0

use crate::utils;
use cardano_serialization_lib::{
    BaseAddress, Bip32PrivateKey, Credential, NetworkInfo, RewardAddress,
};

#[derive(Debug)]
pub enum CardanoError {
    InvalidSeed(String),
    DerivationFailed(String),
}

impl std::fmt::Display for CardanoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CardanoError::InvalidSeed(s) => write!(f, "invalid seed: {}", s),
            CardanoError::DerivationFailed(s) => write!(f, "derivation failed: {}", s),
        }
    }
}

/// Derive a Shelley base address (payment + stake) from a 32-byte seed.
///
/// Account 0 (the fixed/identity wallet). Kept for backward compatibility —
/// equivalent to `derive_address_account(seed_hex, 0, network)`.
///
/// # Args
/// * `seed_hex` — 64-char hex (32 bytes), typically output of HKDF
/// * `network` — 0 = preprod/preview/testnet, 1 = mainnet
///
/// # Returns
/// Bech32-encoded address: `addr_test1...` (testnet) or `addr1...` (mainnet)
pub fn derive_address(seed_hex: String, network: u8) -> String {
    derive_address_account(seed_hex, 0, network)
}

/// Derive a Shelley base address for a specific CIP-1852 account index.
///
/// Path: `m/1852'/1815'/account'/0/0` (payment) + `m/1852'/1815'/account'/2/0`
/// (stake). Both payment and stake credentials move with `account`, so each
/// account index yields a distinct, unlinkable address — while all of them
/// derive from the SAME 24-word Master_KEK (QĐ-B mô hình ví):
///   - account 0   = ví cố định (kho/định danh), BẤT BIẾN.
///   - account N≥1 = ví hoạt động đời N (xoay khoá off-chain).
///
/// # Args
/// * `seed_hex` — 64-char hex (32 bytes), output of HKDF (wallet seed).
/// * `account`  — CIP-1852 account index (hardened internally).
/// * `network`  — 0 = preprod/preview/testnet, 1 = mainnet.
///
/// # Returns
/// Bech32 address, or empty string on error (invalid seed / encode failure).
pub fn derive_address_account(seed_hex: String, account: u32, network: u8) -> String {
    derive_address_inner(seed_hex, account, network).unwrap_or_default()
}

fn derive_address_inner(
    seed_hex: String,
    account: u32,
    network: u8,
) -> Result<String, CardanoError> {
    let entropy = utils::hex_to_bytes(&seed_hex)
        .map_err(|e| CardanoError::InvalidSeed(e))?;
    if entropy.len() != 32 {
        return Err(CardanoError::InvalidSeed(format!(
            "expected 32 bytes, got {}", entropy.len()
        )));
    }

    let root_key = Bip32PrivateKey::from_bip39_entropy(&entropy, &[]);

    // Account (m/1852'/1815'/account')
    let account_key = root_key
        .derive(harden(1852))
        .derive(harden(1815))
        .derive(harden(account));

    // Payment key (m/1852'/1815'/account'/0/0)
    let payment_key = account_key.derive(0).derive(0).to_raw_key().to_public();

    // Stake key (m/1852'/1815'/account'/2/0)
    let stake_key = account_key.derive(2).derive(0).to_raw_key().to_public();

    let payment_cred = Credential::from_keyhash(&payment_key.hash());
    let stake_cred = Credential::from_keyhash(&stake_key.hash());

    let network_info = if network == 1 {
        NetworkInfo::mainnet()
    } else {
        NetworkInfo::testnet_preprod()
    };

    let base_address = BaseAddress::new(network_info.network_id(), &payment_cred, &stake_cred);
    Ok(base_address.to_address().to_bech32(None)
        .map_err(|e| CardanoError::DerivationFailed(e.to_string()))?)
}

/// Derive the STAKE (reward) address for a CIP-1852 account.
///
/// Path: `m/1852'/1815'/account'/2/0` — ĐÚNG cái stake credential đã nhúng trong base
/// address ở trên, chỉ xuất ra độc-lập dạng bech32 (`stake_test1...` / `stake1...`).
///
/// Dùng cho `PhoenixKey POST /wallet/standard/register` field `stake_address` (API.md §7)
/// và về sau là delegate/staking. KHÔNG lộ khoá — chỉ ra địa-chỉ công-khai.
///
/// # Returns
/// Bech32 reward address, hoặc chuỗi rỗng nếu lỗi (seed sai / encode lỗi).
pub fn derive_stake_address_account(seed_hex: String, account: u32, network: u8) -> String {
    derive_stake_address_inner(seed_hex, account, network).unwrap_or_default()
}

fn derive_stake_address_inner(
    seed_hex: String,
    account: u32,
    network: u8,
) -> Result<String, CardanoError> {
    let entropy = utils::hex_to_bytes(&seed_hex)
        .map_err(|e| CardanoError::InvalidSeed(e))?;
    if entropy.len() != 32 {
        return Err(CardanoError::InvalidSeed(format!(
            "expected 32 bytes, got {}", entropy.len()
        )));
    }

    let root_key = Bip32PrivateKey::from_bip39_entropy(&entropy, &[]);

    let account_key = root_key
        .derive(harden(1852))
        .derive(harden(1815))
        .derive(harden(account));

    // Stake key (m/1852'/1815'/account'/2/0) — role 2 = stake credential.
    let stake_key = account_key.derive(2).derive(0).to_raw_key().to_public();
    let stake_cred = Credential::from_keyhash(&stake_key.hash());

    let network_info = if network == 1 {
        NetworkInfo::mainnet()
    } else {
        NetworkInfo::testnet_preprod()
    };

    let reward_address = RewardAddress::new(network_info.network_id(), &stake_cred);
    Ok(reward_address.to_address().to_bech32(None)
        .map_err(|e| CardanoError::DerivationFailed(e.to_string()))?)
}

/// Derive raw 64-byte signing key bytes (BIP32 extended private key) for the
/// payment derivation path. Mobile uses this to sign Cardano tx CBOR for
/// faucet/activation. The seed is unwrapped from Wrapped_KEK in memory only,
/// passed here, signing key is derived, signs, then dropped.
pub fn derive_payment_signing_key_hex(seed_hex: String) -> String {
    derive_payment_signing_key_account(seed_hex, 0)
}

/// Derive raw 96-byte BIP32 extended private key (hex) for the payment path of
/// a specific CIP-1852 account index. Path `m/1852'/1815'/account'/0/0`.
///
/// This is the key that signs spends from the address derived at the SAME
/// account by [`derive_address_account`] — both move with `account`, so the
/// signing key and the funded address always correspond (QĐ-B mô hình ví:
/// account = walletRotationIndex). Parametrising on `account` lets the rotating
/// wallet sign tx for whichever life currently holds the funds.
///
/// # Args
/// * `seed_hex` — 64-char hex (32 bytes), the HKDF wallet seed.
/// * `account`  — CIP-1852 account index (hardened internally).
///
/// # Returns
/// Hex of the extended private key bytes, or empty string on invalid seed.
/// In-memory only — never log or persist.
pub fn derive_payment_signing_key_account(seed_hex: String, account: u32) -> String {
    match derive_payment_xprv_account(&seed_hex, account) {
        Some(xprv) => hex::encode(xprv.as_bytes()),
        None => String::new(),
    }
}

/// Derive the payment `Bip32PrivateKey` for a CIP-1852 account index.
/// Path `m/1852'/1815'/account'/0/0`. Returns `None` on invalid seed length.
///
/// Crate-internal: the transfer builder uses this to both hash the payment
/// pubkey (input credential) and sign the tx witness — keeping the secret key
/// out of any FFI-facing String.
pub(crate) fn derive_payment_xprv_account(
    seed_hex: &str,
    account: u32,
) -> Option<Bip32PrivateKey> {
    let entropy = match utils::hex_to_bytes(seed_hex) {
        Ok(b) if b.len() == 32 => b,
        _ => return None,
    };
    let root = Bip32PrivateKey::from_bip39_entropy(&entropy, &[]);
    Some(
        root.derive(harden(1852))
            .derive(harden(1815))
            .derive(harden(account))
            .derive(0)
            .derive(0),
    )
}

pub(crate) fn harden(index: u32) -> u32 {
    index | 0x80000000
}

#[cfg(test)]
mod tests {
    use super::*;
    use cardano_serialization_lib::Address;

    // A fixed 32-byte wallet seed (64 hex chars). Stands in for the HKDF wallet
    // seed derived from a real Master_KEK; the derivation logic is identical.
    const SEED: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    fn is_testnet_bech32(addr: &str) -> bool {
        addr.starts_with("addr_test1")
    }

    /// account 0 ≠ account 1 ≠ account 2 — each rotation index is a distinct
    /// address. This is the privacy property of the rotating wallet (QĐ-B).
    #[test]
    fn distinct_accounts_yield_distinct_addresses() {
        let a0 = derive_address_account(SEED.to_string(), 0, 0);
        let a1 = derive_address_account(SEED.to_string(), 1, 0);
        let a2 = derive_address_account(SEED.to_string(), 2, 0);

        assert!(!a0.is_empty(), "account 0 should derive a non-empty address");
        assert!(!a1.is_empty(), "account 1 should derive a non-empty address");
        assert!(!a2.is_empty(), "account 2 should derive a non-empty address");

        assert_ne!(a0, a1, "account 0 and 1 must differ");
        assert_ne!(a1, a2, "account 1 and 2 must differ");
        assert_ne!(a0, a2, "account 0 and 2 must differ");
    }

    /// Every derived address is a valid testnet bech32 (`addr_test1...`).
    #[test]
    fn addresses_are_valid_testnet_bech32() {
        for acct in 0u32..5 {
            let addr = derive_address_account(SEED.to_string(), acct, 0);
            assert!(
                is_testnet_bech32(&addr),
                "account {} address must start with addr_test1, got: {}",
                acct, addr
            );
            // Round-trip through the address parser to prove it is well-formed.
            let parsed = Address::from_bech32(&addr);
            assert!(parsed.is_ok(), "account {} address must re-parse", acct);
        }
    }

    /// Mainnet derivation produces `addr1...` (no `_test`).
    #[test]
    fn mainnet_addresses_use_addr_prefix() {
        let addr = derive_address_account(SEED.to_string(), 0, 1);
        assert!(addr.starts_with("addr1"), "mainnet must be addr1..., got: {}", addr);
        assert!(!addr.starts_with("addr_test"), "mainnet must not be testnet");
    }

    /// Deterministic: same seed + same account → byte-identical address across
    /// calls. The 24 words therefore recover every account reproducibly.
    #[test]
    fn account0_is_deterministic() {
        let first = derive_address_account(SEED.to_string(), 0, 0);
        let second = derive_address_account(SEED.to_string(), 0, 0);
        assert!(!first.is_empty());
        assert_eq!(first, second, "account 0 must derive identically every call");

        // account 3 deterministic too (a rotated wallet must be re-derivable).
        let r1 = derive_address_account(SEED.to_string(), 3, 0);
        let r2 = derive_address_account(SEED.to_string(), 3, 0);
        assert_eq!(r1, r2, "account 3 must derive identically every call");
    }

    /// The legacy `derive_address` (no account param) MUST equal account 0, so
    /// existing callers and stored account-0 addresses stay valid.
    #[test]
    fn legacy_derive_address_equals_account0() {
        let legacy = derive_address(SEED.to_string(), 0);
        let acct0 = derive_address_account(SEED.to_string(), 0, 0);
        assert_eq!(legacy, acct0, "legacy derive_address must equal account 0");
    }

    /// Invalid seed → empty string (FFI null), never a panic.
    #[test]
    fn bad_seed_returns_empty() {
        assert!(derive_address_account("zzzz".to_string(), 0, 0).is_empty());
        assert!(derive_address_account("00".to_string(), 1, 0).is_empty());
    }
}
