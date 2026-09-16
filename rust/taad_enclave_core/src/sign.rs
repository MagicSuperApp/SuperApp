// Ed25519 signing — derive TAAD_Key from Master_KEK, sign message.
//
// Derivation MUST match enclave_bridge.dart::deriveTaadPublicKey:
//
//   salt = SHA-256("genesis")        // 32 bytes
//   info = "taad-controller-v1"
//   seed = HKDF-SHA256(ikm=Master_KEK, salt, info, length=32)
//   TAAD_Key = Ed25519.FromSeed(seed)
//
// If salt or info diverges, the public key derived at registration time
// (deriveTaadPublicKey) won't match the signing key here, and every signature
// will fail server-side verification. The shared helper `derive_taad_seed`
// below is the single source of truth — both `taad_sign_ed25519` and any
// future `taad_derive_ed25519_public_key_from_kek` MUST use it.
//
// Future improvement: spec §3.2 calls for `salt = H(DID)`, which requires DID
// at derivation time. Today's two-phase flow (register → server returns DID)
// makes that chicken-and-egg, so we use the literal "genesis" instead.
// Migration path: introduce a v2 salt scheme tied to DID after first rotate.

use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use crate::utils;

const TAAD_INFO: &[u8] = b"taad-controller-v1";
const GENESIS_LABEL: &[u8] = b"genesis";

/// Derive the 32-byte Ed25519 seed for TAAD_Key from Master_KEK.
/// Shared by both signing and public-key derivation paths.
///
/// `pub(crate)` so `taad_did.rs` can derive the SAME signing key that
/// `derive_taad_public_key` exposes — at genesis the on-chain validator
/// requires `must_be_signed_by(controller_pkh = blake2b_224(taad_pubkey))`,
/// and the tx-builder must produce that vkey witness without forking the
/// HKDF derivation logic (single source of truth — see the module docs).
pub(crate) fn derive_taad_seed(master_kek: &[u8]) -> Option<Zeroizing<[u8; 32]>> {
    if master_kek.len() != 32 {
        return None;
    }
    let salt = Sha256::digest(GENESIS_LABEL); // 32 bytes
    let hk = Hkdf::<Sha256>::new(Some(&salt), master_kek);
    let mut seed = Zeroizing::new([0u8; 32]);
    if hk.expand(TAAD_INFO, &mut *seed).is_err() {
        return None;
    }
    Some(seed)
}

/// Sign a UTF-8 message with the Ed25519 TAAD_Key derived from Master_KEK.
/// Returns 64-byte raw signature (r || s) hex-encoded, or empty string on error.
pub fn sign_ed25519(master_kek_hex: String, message: String) -> String {
    sign_ed25519_bytes(master_kek_hex, message.as_bytes())
}

/// Sign an ARBITRARY byte string (passed in as hex) with the Ed25519 TAAD_Key.
///
/// Why this door exists, and why the UTF-8 one cannot replace it: the C entry
/// point `taad_sign_ed25519` takes `*const c_char`, so a length-framed signing
/// payload (4-byte big-endian lengths, most of whose bytes are `0x00`) is cut
/// at the first `0x00`. The cut payload still signs and still returns 128 hex
/// characters, so nothing fails here — it fails on the server as "signature
/// does not verify", one layer away from the cause.
///
/// Returns 64-byte raw signature (r || s) hex-encoded, or empty string when the
/// Master_KEK or the message is not valid hex.
pub fn sign_ed25519_hex(master_kek_hex: String, message_hex: String) -> String {
    let message = match utils::hex_to_bytes(&message_hex) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };
    sign_ed25519_bytes(master_kek_hex, &message)
}

fn sign_ed25519_bytes(master_kek_hex: String, message: &[u8]) -> String {
    let master_kek = match utils::hex_to_bytes(&master_kek_hex) {
        Ok(b) => Zeroizing::new(b),
        Err(_) => return String::new(),
    };
    let seed = match derive_taad_seed(&master_kek) {
        Some(s) => s,
        None => return String::new(),
    };
    let signing_key = SigningKey::from_bytes(&seed);
    let signature = signing_key.sign(message);
    hex::encode(signature.to_bytes())
}

/// Derive the Ed25519 TAAD_Key public key directly from Master_KEK.
/// Convenience for callers that don't want to do the HKDF step separately.
/// Output matches `enclave_bridge.dart::deriveTaadPublicKey(masterKekHex)`.
pub fn derive_taad_public_key(master_kek_hex: String) -> String {
    let master_kek = match utils::hex_to_bytes(&master_kek_hex) {
        Ok(b) => Zeroizing::new(b),
        Err(_) => return String::new(),
    };
    let seed = match derive_taad_seed(&master_kek) {
        Some(s) => s,
        None => return String::new(),
    };
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key: VerifyingKey = (&signing_key).into();
    hex::encode(verifying_key.as_bytes())
}

/// 2FA DeviceKey opt-in (Issue #28): sinh cặp Ed25519 NGẪU NHIÊN (per-device, KHÔNG
/// derive từ Seed) rồi ký canonical opt-in bằng CHÍNH khoá đó (proof-of-ownership).
/// Canonical: "PHOENIXKEY_DEVICE_KEY_OPTIN:" + user_did + ":" + publicKeyHex + ":" + nonce
///
/// Trả JSON {"publicKeyHex":<64hex>,"signature":<128hex>,"secretHex":<64hex>}.
/// `secretHex` = 32-byte seed device key — caller LƯU vào K_bio (secureStore) để
/// dùng cosign 2of2 sau; user_did/pub/nonce đều hex/ASCII nên nhúng JSON an-toàn.
/// Rỗng nếu random/derive lỗi.
pub fn device_key_optin(user_did: String, nonce: String) -> String {
    // Random 32 byte từ nguồn CSPRNG dùng chung (generate_master_kek → 64-hex).
    let seed_hex = crate::crypto::generate_master_kek();
    let seed_bytes = match utils::hex_to_bytes(&seed_hex) {
        Ok(b) if b.len() == 32 => b,
        _ => return String::new(),
    };
    let seed: [u8; 32] = match seed_bytes.try_into() {
        Ok(s) => s,
        Err(_) => return String::new(),
    };
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key: VerifyingKey = (&signing_key).into();
    let pub_hex = hex::encode(verifying_key.as_bytes());
    let message = format!("PHOENIXKEY_DEVICE_KEY_OPTIN:{user_did}:{pub_hex}:{nonce}");
    let signature = signing_key.sign(message.as_bytes());
    format!(
        "{{\"publicKeyHex\":\"{}\",\"signature\":\"{}\",\"secretHex\":\"{}\"}}",
        pub_hex,
        hex::encode(signature.to_bytes()),
        seed_hex,
    )
}

// ─── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Verifier;

    /// Round-trip: derive TAAD pubkey from kek, sign message with same kek,
    /// verify signature against that pubkey. This is the contract that
    /// prevents a previously flagged bug.
    #[test]
    fn sign_then_verify_with_derived_public_key() {
        let master_kek_hex =
            "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string();
        let message = "PHOENIXKEY_GENESIS:abcdef".to_string();

        let pub_key_hex = derive_taad_public_key(master_kek_hex.clone());
        assert_eq!(pub_key_hex.len(), 64, "Ed25519 pubkey must be 32 bytes (64 hex chars)");

        let sig_hex = sign_ed25519(master_kek_hex.clone(), message.clone());
        assert_eq!(sig_hex.len(), 128, "Ed25519 signature must be 64 bytes (128 hex chars)");

        let pub_bytes = hex::decode(&pub_key_hex).unwrap();
        let sig_bytes = hex::decode(&sig_hex).unwrap();
        let verifying_key =
            VerifyingKey::from_bytes(&pub_bytes.try_into().unwrap()).unwrap();
        let sig: [u8; 64] = sig_bytes.try_into().unwrap();
        let signature = ed25519_dalek::Signature::from_bytes(&sig);

        verifying_key.verify(message.as_bytes(), &signature)
            .expect("Signature must verify with the derived public key");
    }

    const KEK: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    /// Cửa hex và cửa chuỗi phải cho ĐÚNG một chữ ký khi nội dung là ASCII thuần.
    /// Nếu hai cửa lệch ở đây thì mọi luồng đang chạy sẽ hỏng lúc chuyển sang cửa mới.
    #[test]
    fn hex_door_matches_string_door_for_plain_ascii() {
        let message = "PHOENIXKEY_RECOVER:did:phoenix:abc:cafe:0011";
        let via_string = sign_ed25519(KEK.to_string(), message.to_string());
        let via_hex = sign_ed25519_hex(KEK.to_string(), hex::encode(message.as_bytes()));
        assert_eq!(via_string.len(), 128);
        assert_eq!(via_string, via_hex);
    }

    /// Chuỗi ký ĐÓNG KHUNG THEO ĐỘ DÀI đi qua cửa hex thì được ký trên TRỌN byte —
    /// và chữ ký đó KHÁC chữ ký của phần bị cắt ở `0x00` đầu tiên.
    ///
    /// Đây là phép đo nói vì sao cửa hex phải tồn tại: một cầu `*const c_char` đọc
    /// `50 3a 00 00 00 02 61 62` thành `"P:"` rồi dừng, ký xong vẫn trả về 128 ký tự
    /// hex hợp lệ. Không có gì hỏng ở tầng này — nó hỏng ở máy chủ, dưới cái tên
    /// "chữ ký không khớp", cách nguyên nhân một tầng.
    #[test]
    fn framed_payload_signs_over_all_bytes_not_up_to_the_first_nul() {
        // Vector ghim của nhà PhoenixKey: build("P:", "ab").
        let framed_hex = "503a000000026162";
        let sig_full = sign_ed25519_hex(KEK.to_string(), framed_hex.to_string());
        let sig_cut_at_nul = sign_ed25519(KEK.to_string(), "P:".to_string());

        assert_eq!(sig_full.len(), 128);
        assert_ne!(
            sig_full, sig_cut_at_nul,
            "chữ ký trên trọn khung phải khác chữ ký trên phần trước 0x00, \
             không thì cửa hex chẳng đóng được lỗ nào",
        );

        // Và chữ ký trọn vẹn phải verify được trên ĐỦ tám byte đó.
        let pub_bytes = hex::decode(derive_taad_public_key(KEK.to_string())).unwrap();
        let verifying_key = VerifyingKey::from_bytes(&pub_bytes.try_into().unwrap()).unwrap();
        let sig: [u8; 64] = hex::decode(&sig_full).unwrap().try_into().unwrap();
        verifying_key
            .verify(&hex::decode(framed_hex).unwrap(), &ed25519_dalek::Signature::from_bytes(&sig))
            .expect("chữ ký phải verify trên trọn chuỗi đóng khung");
    }

    /// Hex lẻ hoặc có ký tự ngoài bảng hex → chuỗi RỖNG, không phải một chữ ký của
    /// byte rác. Người gọi phải phân biệt được "không ký được" với "đã ký".
    #[test]
    fn hex_door_refuses_a_payload_that_is_not_hex() {
        assert_eq!(sign_ed25519_hex(KEK.to_string(), "abc".to_string()), "");
        assert_eq!(sign_ed25519_hex(KEK.to_string(), "zz".to_string()), "");
        // Khung rỗng vẫn là một chuỗi hợp lệ (0 byte) — ký được.
        assert_eq!(sign_ed25519_hex(KEK.to_string(), String::new()).len(), 128);
    }

    /// Cross-check the seed Dart bridge would produce:
    ///   salt = sha256("genesis")
    ///   info = "taad-controller-v1"
    /// — this matches the existing taad_hkdf_derive call sites in
    /// enclave_bridge.dart::deriveTaadPublicKey.
    #[test]
    fn seed_matches_dart_bridge_derivation() {
        let master_kek = [0x42u8; 32];
        let seed = derive_taad_seed(&master_kek).unwrap();

        // Reference: run the same HKDF inputs manually
        let expected_salt = Sha256::digest(b"genesis");
        let hk = Hkdf::<Sha256>::new(Some(&expected_salt), &master_kek);
        let mut expected_seed = [0u8; 32];
        hk.expand(b"taad-controller-v1", &mut expected_seed).unwrap();

        assert_eq!(*seed, expected_seed);
    }

    /// Determinism: same kek twice → same signature for same message.
    #[test]
    fn deterministic_signature() {
        let kek = "ff".repeat(32);
        let sig1 = sign_ed25519(kek.clone(), "hello".to_string());
        let sig2 = sign_ed25519(kek, "hello".to_string());
        assert_eq!(sig1, sig2);
    }

    #[test]
    fn rejects_wrong_kek_length() {
        let short_kek = "ab".to_string(); // 1 byte, not 32
        assert!(sign_ed25519(short_kek.clone(), "msg".to_string()).is_empty());
        assert!(derive_taad_public_key(short_kek).is_empty());
    }
}
