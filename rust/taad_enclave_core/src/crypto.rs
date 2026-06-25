// ================================================================
// PhoenixKey — Rust Core Crypto Module v0.2
//
// Layer 1 (HW_Key):  P-256 ECDSA — iOS Secure Enclave (hardware)
// Layer 2 (TAAD_Key): Ed25519 — derived from Master_KEK (spec §3.2)
//
// Spec v3.0 Key Hierarchy:
//   Master_KEK  ←_R {0,1}^256  (random, root of trust)
//   TAAD_Key    = Ed25519.FromSeed(HKDF(Master_KEK, "taad-controller-v1", H(DID)))
//   HW_Key      = SecureEnclave.Generate() → non-exportable P-256
//   Device_KEK  = HKDF(PIN_derived ∥ HW_UID, "device-kek-v1", H(DID))
//   Wrapped_KEK = AES-256-GCM(Device_KEK, Master_KEK)
// ================================================================

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use ed25519_dalek::{SigningKey, VerifyingKey};
use hkdf::Hkdf;
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey as P256VerifyingKey};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

// ─────────────────────────────────────────────────────────────────
// MASTER KEK — Root of Trust
// spec §6.1: Master_KEK ←_R {0,1}^256
// ─────────────────────────────────────────────────────────────────

/// Generate a random 256-bit Master_KEK.
/// Returns 32 bytes encoded as 64-char hex string.
///
/// SECURITY: Call this ONCE per identity. Store encrypted with Device_KEK.
/// NEVER log or transmit the raw value.
pub fn generate_master_kek() -> String {
    // Zeroizing: scrub the raw KEK bytes from RAM once we have hex-encoded them.
    let mut kek = Zeroizing::new([0u8; 32]);
    rand::thread_rng().fill_bytes(&mut *kek);
    hex::encode(&*kek)
}

// ─────────────────────────────────────────────────────────────────
// BIP39 — Mode B Recovery (spec §6.1, §9.2)
//
//   Mode A (create):  Master_KEK ←_R {0,1}^256   (generate_master_kek)
//   Mode B (restore): Master_KEK = BIP39_ToEntropy(user_24_words)
//
// FIRST-PRINCIPLES: a Master_KEK is exactly 32 random bytes. BIP39 with 256
// bits of entropy encodes 32 bytes → 24 words (+ an 8-bit checksum word).
// Therefore the SAME 32 bytes that Mode A draws at random ARE a valid BIP39
// entropy, and the 24 words are a *lossless* backup: ToEntropy(Encode(kek)) == kek
// for every 32-byte kek. This is why a wallet created in Mode A is recoverable
// in Mode B with no extra stored material — the words ARE the Master_KEK.
//
// Because TAAD_Key and the wallet seed are BOTH deterministic functions of the
// Master_KEK alone (see deriveTaadPublicKey / deriveWalletSeed in the Dart
// bridge), recovering the exact Master_KEK guarantees the recovered TAAD_Key
// (hence controller_pkh) and wallet address are byte-identical to the originals
// — the on-chain DID still recognises the controller after restore.
// ─────────────────────────────────────────────────────────────────

/// Encode a 32-byte Master_KEK (hex) as a 24-word BIP39 mnemonic.
///
/// This is BIP39_Encode(Master_KEK): the user writes these 24 words on paper as
/// the ONLY off-device backup. Returns a space-separated lowercase phrase, or
/// empty string if `kek_hex` is not exactly 32 bytes of valid hex.
///
/// SECURITY: the returned phrase is equivalent to the raw Master_KEK. Show it
/// once, never log it, never persist it, never transmit it.
pub fn master_kek_to_mnemonic(kek_hex: String) -> String {
    // Scrub the raw KEK bytes from RAM once the mnemonic is built.
    let kek = match hex::decode(&kek_hex) {
        Ok(b) if b.len() == 32 => Zeroizing::new(b),
        _ => return String::new(),
    };
    match bip39::Mnemonic::from_entropy(&kek) {
        Ok(m) => m.to_string(),
        Err(_) => String::new(),
    }
}

/// Decode a 24-word BIP39 mnemonic back to a 32-byte Master_KEK (hex).
///
/// This is BIP39_ToEntropy(words): the recovery primitive. Validates the BIP39
/// checksum and wordlist (reject typos / wrong words / wrong length) and that
/// the entropy is exactly 32 bytes (24-word phrase). Whitespace is normalised
/// and case-folded so a phrase copied with extra spaces still parses.
///
/// Returns 64-char hex Master_KEK, or empty string if the phrase is invalid —
/// callers MUST treat empty as "phrase rejected" and NOT proceed with restore.
pub fn mnemonic_to_master_kek(words: String) -> String {
    // Normalise: collapse runs of whitespace, trim, lowercase. BIP39 English
    // wordlist is all-lowercase; users often paste with stray spaces/newlines.
    let normalized = words.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
    let mnemonic = match bip39::Mnemonic::parse_normalized(&normalized) {
        Ok(m) => m,
        Err(_) => return String::new(),
    };
    // to_entropy_array returns ([u8;33], usize len) — entropy is the first
    // `len` bytes. For a 24-word phrase len == 32. Reject any other length so a
    // valid 12/15/18/21-word phrase cannot silently produce a short KEK.
    let (buf, len) = mnemonic.to_entropy_array();
    if len != 32 {
        return String::new();
    }
    // Scrub the recovered KEK material once hex-encoded.
    let entropy = Zeroizing::new(buf[..len].to_vec());
    hex::encode(&*entropy)
}

// ─────────────────────────────────────────────────────────────────
// HKDF — Key Derivation
// spec §6.1: HKDF(ikm, info, salt) → {0,1}^k  [RFC 5869, SHA-256]
// ─────────────────────────────────────────────────────────────────

/// Derive keying material using HKDF-SHA256.
///
/// # Arguments
/// * `ikm_hex`  - Input key material (hex encoded)
/// * `info`     - Domain separation label (e.g. "taad-controller-v1")
/// * `salt_hex` - Salt (hex encoded, empty string = 32 zero bytes)
/// * `length`   - Output length in bytes (max 255 × 32 = 8160)
///
/// Returns hex-encoded output key material.
pub fn hkdf_derive(ikm_hex: String, info: String, salt_hex: String, length: usize) -> String {
    // ikm is Master_KEK material — wrap so it is scrubbed when this fn returns.
    let ikm = match hex::decode(&ikm_hex) {
        Ok(b) => Zeroizing::new(b),
        Err(_) => return String::new(),
    };

    let salt: Vec<u8> = if salt_hex.is_empty() {
        vec![0u8; 32]
    } else {
        match hex::decode(&salt_hex) {
            Ok(b) => b,
            Err(_) => vec![0u8; 32],
        }
    };

    let hk = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    // okm is derived key material (seed / Device_KEK) — also scrub on drop.
    let mut okm = Zeroizing::new(vec![0u8; length]);
    if hk.expand(info.as_bytes(), &mut okm).is_err() {
        return String::new();
    }
    hex::encode(&*okm)
}

// ─────────────────────────────────────────────────────────────────
// ED25519 — TAAD_Key
// spec §3.2: TAAD_Key = Ed25519.FromSeed(HKDF(Master_KEK, "taad-controller-v1", H(DID)))
// ─────────────────────────────────────────────────────────────────

/// Derive Ed25519 public key from a 32-byte seed (hex encoded).
/// Returns 32-byte public key as 64-char hex string.
///
/// Use hkdf_derive() first to get the seed from Master_KEK.
pub fn derive_ed25519_public_key(seed_hex: String) -> String {
    // seed material — scrub on drop.
    let seed_bytes = match hex::decode(&seed_hex) {
        Ok(b) => Zeroizing::new(b),
        Err(_) => return String::new(),
    };

    if seed_bytes.len() != 32 {
        return String::new();
    }

    let mut seed_arr = Zeroizing::new([0u8; 32]);
    seed_arr.copy_from_slice(&seed_bytes);

    // ed25519_dalek::SigningKey implements ZeroizeOnDrop, so the expanded
    // secret scalar is scrubbed automatically when `signing_key` drops.
    let signing_key = SigningKey::from_bytes(&seed_arr);
    let verifying_key: VerifyingKey = (&signing_key).into();
    hex::encode(verifying_key.as_bytes())
}

// ─────────────────────────────────────────────────────────────────
// AES-256-GCM — Wrapped_KEK
// spec §6.1: Wrapped_KEK = Enc(Device_KEK, Master_KEK)
// ─────────────────────────────────────────────────────────────────

/// Encrypt Master_KEK with Device_KEK using AES-256-GCM.
///
/// Returns JSON string: {"ciphertext":"<hex>","iv":"<hex>"}
/// or empty string on failure.
pub fn aes_gcm_encrypt(key_hex: String, plaintext_hex: String) -> String {
    // key_bytes = Device_KEK, plaintext = Master_KEK — both scrubbed on drop.
    let key_bytes = match hex::decode(&key_hex) {
        Ok(b) if b.len() == 32 => Zeroizing::new(b),
        _ => return String::new(),
    };

    let plaintext = match hex::decode(&plaintext_hex) {
        Ok(b) => Zeroizing::new(b),
        Err(_) => return String::new(),
    };

    let mut iv_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv_bytes);

    let cipher = match Aes256Gcm::new_from_slice(&key_bytes) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let nonce = Nonce::from_slice(&iv_bytes);
    let ciphertext = match cipher.encrypt(nonce, plaintext.as_ref()) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    // Return JSON: {ciphertext: hex, iv: hex}
    format!(
        r#"{{"ciphertext":"{}","iv":"{}"}}"#,
        hex::encode(ciphertext),
        hex::encode(iv_bytes)
    )
}

/// Decrypt Master_KEK with Device_KEK using AES-256-GCM.
///
/// `encrypted_json`: JSON string from aes_gcm_encrypt.
/// Returns plaintext hex or empty string on failure (wrong key / tampered).
pub fn aes_gcm_decrypt(key_hex: String, encrypted_json: String) -> String {
    // key_bytes = Device_KEK — scrub on drop.
    let key_bytes = match hex::decode(&key_hex) {
        Ok(b) if b.len() == 32 => Zeroizing::new(b),
        _ => return String::new(),
    };

    // Parse JSON: {"ciphertext":"...","iv":"..."}
    let ciphertext_hex = extract_json_field(&encrypted_json, "ciphertext");
    let iv_hex = extract_json_field(&encrypted_json, "iv");

    let ciphertext = match hex::decode(&ciphertext_hex) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };

    let iv_bytes = match hex::decode(&iv_hex) {
        Ok(b) if b.len() == 12 => b,
        _ => return String::new(),
    };

    let cipher = match Aes256Gcm::new_from_slice(&key_bytes) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let nonce = Nonce::from_slice(&iv_bytes);
    match cipher.decrypt(nonce, ciphertext.as_ref()) {
        // plaintext = recovered Master_KEK — scrub the buffer once hex-encoded.
        Ok(plaintext) => {
            let plaintext = Zeroizing::new(plaintext);
            hex::encode(&*plaintext)
        }
        Err(_) => String::new(), // Wrong key or tampered ciphertext
    }
}

// ─────────────────────────────────────────────────────────────────
// PBKDF2 — Device_KEK from PIN
// spec §6.1 prototype: Device_KEK = PBKDF2(PIN, salt, 300_000 iter)
// ─────────────────────────────────────────────────────────────────

/// Derive a 32-byte key from PIN using PBKDF2-HMAC-SHA256.
/// salt_hex: 16-byte random salt (hex encoded).
/// Returns 32-byte key as 64-char hex string.
pub fn pbkdf2_derive(pin: String, salt_hex: String) -> String {
    let salt = match hex::decode(&salt_hex) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };

    // key is the Device_KEK — scrub the raw bytes once hex-encoded.
    let mut key = Zeroizing::new([0u8; 32]);
    pbkdf2_hmac::<Sha256>(pin.as_bytes(), &salt, 300_000, &mut *key);
    hex::encode(&*key)
}

/// Generate 16 random bytes for PBKDF2 salt.
/// Returns 32-char hex string.
pub fn generate_salt() -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    hex::encode(salt)
}

// ─────────────────────────────────────────────────────────────────
// SHA-256
// ─────────────────────────────────────────────────────────────────

pub fn sha256_hex(data: String) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn sha256_bytes_hex(data_hex: String) -> String {
    let bytes = match hex::decode(&data_hex) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    hex::encode(hasher.finalize())
}

// ─────────────────────────────────────────────────────────────────
// P-256 ECDSA Verification — HW_Key layer (unchanged)
// ─────────────────────────────────────────────────────────────────

pub fn verify_p256_signature(
    public_key_hex: String,
    message: String,
    signature_hex: String,
) -> bool {
    let pub_bytes = match hex::decode(&public_key_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let verifying_key = match P256VerifyingKey::from_sec1_bytes(&pub_bytes) {
        Ok(key) => key,
        Err(_) => return false,
    };
    let sig_bytes = match hex::decode(&signature_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let signature = match Signature::from_der(&sig_bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let mut hasher = Sha256::new();
    hasher.update(message.as_bytes());
    let hash = hasher.finalize();
    verifying_key.verify(&hash, &signature).is_ok()
}

// ─────────────────────────────────────────────────────────────────
// Internal helper
// ─────────────────────────────────────────────────────────────────

fn extract_json_field(json: &str, field: &str) -> String {
    let search = format!(r#""{}":""#, field);
    if let Some(start) = json.find(&search) {
        let value_start = start + search.len();
        if let Some(end) = json[value_start..].find('"') {
            return json[value_start..value_start + end].to_string();
        }
    }
    String::new()
}

// ─────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_master_kek_length() {
        let kek = generate_master_kek();
        assert_eq!(kek.len(), 64); // 32 bytes = 64 hex chars
        assert!(kek.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_generate_master_kek_unique() {
        let kek1 = generate_master_kek();
        let kek2 = generate_master_kek();
        assert_ne!(kek1, kek2); // Must be random
    }

    #[test]
    fn test_hkdf_derive_deterministic() {
        let kek = "0".repeat(64); // 32 zero bytes
        let out1 = hkdf_derive(kek.clone(), "taad-controller-v1".to_string(), String::new(), 32);
        let out2 = hkdf_derive(kek, "taad-controller-v1".to_string(), String::new(), 32);
        assert_eq!(out1, out2); // Same input → same output
        assert_eq!(out1.len(), 64);
    }

    #[test]
    fn test_hkdf_domain_separation() {
        let kek = "0".repeat(64);
        let out1 = hkdf_derive(kek.clone(), "taad-controller-v1".to_string(), String::new(), 32);
        let out2 = hkdf_derive(kek, "wallet-v1".to_string(), String::new(), 32);
        assert_ne!(out1, out2); // Different info → different output (MT7)
    }

    #[test]
    fn test_ed25519_public_key_length() {
        let kek = generate_master_kek();
        let seed = hkdf_derive(kek, "taad-controller-v1".to_string(), String::new(), 32);
        let pub_key = derive_ed25519_public_key(seed);
        assert_eq!(pub_key.len(), 64); // 32 bytes = 64 hex chars
    }

    #[test]
    fn test_ed25519_deterministic() {
        let seed = "a".repeat(64);
        let pk1 = derive_ed25519_public_key(seed.clone());
        let pk2 = derive_ed25519_public_key(seed);
        assert_eq!(pk1, pk2); // Same seed → same key (recovery proof)
    }

    #[test]
    fn test_aes_gcm_roundtrip() {
        let key = generate_master_kek(); // reuse random hex as test key
        let plaintext = generate_master_kek(); // random plaintext
        let encrypted = aes_gcm_encrypt(key.clone(), plaintext.clone());
        assert!(!encrypted.is_empty());
        let decrypted = aes_gcm_decrypt(key, encrypted);
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_aes_gcm_wrong_key_returns_empty() {
        let key1 = generate_master_kek();
        let key2 = generate_master_kek();
        let plaintext = generate_master_kek();
        let encrypted = aes_gcm_encrypt(key1, plaintext);
        let result = aes_gcm_decrypt(key2, encrypted); // Wrong key
        assert!(result.is_empty()); // Must fail silently
    }

    #[test]
    fn test_pbkdf2_deterministic() {
        let salt = generate_salt();
        let k1 = pbkdf2_derive("my-pin-123".to_string(), salt.clone());
        let k2 = pbkdf2_derive("my-pin-123".to_string(), salt);
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_sha256_hex_known() {
        let hash = sha256_hex("".to_string());
        assert_eq!(hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    // ── Device_KEK v2 derivation (mirrors EnclaveBridge.deriveDeviceKek) ──
    //
    // v1: Device_KEK = PBKDF2(PIN, salt)
    // v2: Device_KEK = HKDF(ikm = PBKDF2(PIN,salt) || gate, info="device-kek-v2", salt)
    //
    // These pin the formula so the Dart side (which calls the same FFI) and the
    // versioned unlock path cannot drift. A wallet wrapped under v2 MUST unwrap
    // with exactly this derivation forever, or it is lost.

    #[test]
    fn test_device_kek_v2_deterministic_with_fixed_gate() {
        // Fixed 32-byte "gate secret" (stand-in for the Secure Enclave output).
        let gate = "11".repeat(32); // 64 hex chars
        let salt = generate_salt();
        let pbk = pbkdf2_derive("123456".to_string(), salt.clone());
        let kek1 = hkdf_derive(
            format!("{pbk}{gate}"),
            "device-kek-v2".to_string(),
            salt.clone(),
            32,
        );
        let kek2 = hkdf_derive(
            format!("{pbk}{gate}"),
            "device-kek-v2".to_string(),
            salt,
            32,
        );
        assert_eq!(kek1, kek2, "v2 Device_KEK must be deterministic");
        assert_eq!(kek1.len(), 64, "Device_KEK must be 32 bytes (64 hex)");
    }

    #[test]
    fn test_device_kek_v2_differs_from_v1_and_from_other_gate() {
        let salt = generate_salt();
        let pbk = pbkdf2_derive("123456".to_string(), salt.clone());
        let gate_a = "aa".repeat(32);
        let gate_b = "bb".repeat(32);

        let v1 = pbk.clone(); // legacy Device_KEK
        let v2_a = hkdf_derive(
            format!("{pbk}{gate_a}"),
            "device-kek-v2".to_string(),
            salt.clone(),
            32,
        );
        let v2_b = hkdf_derive(
            format!("{pbk}{gate_b}"),
            "device-kek-v2".to_string(),
            salt,
            32,
        );

        // v2 must NOT equal v1 — proves version mismatch yields a different key
        // (hence the need for the stored kek_version to pick the right branch).
        assert_ne!(v1, v2_a);
        // Different gate secret (e.g. a different device) → different key.
        assert_ne!(v2_a, v2_b);
    }

    // ── BIP39 Mode B recovery (spec §6.1 / §9.2) ──────────────────────────

    #[test]
    fn test_master_kek_to_mnemonic_24_words() {
        // 32-byte entropy MUST encode to exactly 24 words.
        let kek = generate_master_kek();
        let phrase = master_kek_to_mnemonic(kek);
        assert!(!phrase.is_empty());
        let word_count = phrase.split_whitespace().count();
        assert_eq!(word_count, 24, "256-bit Master_KEK must yield 24 BIP39 words");
    }

    #[test]
    fn test_master_kek_mnemonic_roundtrip_random() {
        // The core recovery invariant: ToEntropy(Encode(kek)) == kek, so a wallet
        // created in Mode A is fully recoverable in Mode B from the 24 words.
        for _ in 0..32 {
            let kek = generate_master_kek();
            let phrase = master_kek_to_mnemonic(kek.clone());
            let recovered = mnemonic_to_master_kek(phrase);
            assert_eq!(recovered, kek, "Master_KEK must round-trip through BIP39");
        }
    }

    #[test]
    fn test_mnemonic_known_vector() {
        // BIP39 standard 24-word test vector for 32 zero bytes of entropy.
        let zero_kek = "00".repeat(32);
        let phrase = master_kek_to_mnemonic(zero_kek.clone());
        assert_eq!(
            phrase,
            "abandon abandon abandon abandon abandon abandon abandon abandon \
abandon abandon abandon abandon abandon abandon abandon abandon abandon \
abandon abandon abandon abandon abandon abandon art"
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        );
        // …and it decodes straight back to the all-zero entropy.
        assert_eq!(mnemonic_to_master_kek(phrase), zero_kek);
    }

    #[test]
    fn test_mnemonic_recovers_taad_key_identically() {
        // PROOF controller_pkh is stable after restore: TAAD_Key is a pure
        // function of Master_KEK, so recovering the exact KEK recovers the exact
        // Ed25519 controller pubkey. (Mirrors deriveTaadPublicKey in Dart.)
        let kek = generate_master_kek();
        let salt = sha256_hex("genesis".to_string());
        let seed1 = hkdf_derive(kek.clone(), "taad-controller-v1".to_string(), salt.clone(), 32);
        let taad1 = derive_ed25519_public_key(seed1);

        // Round-trip the KEK through the 24-word phrase, as a restore would.
        let phrase = master_kek_to_mnemonic(kek);
        let recovered_kek = mnemonic_to_master_kek(phrase);
        let seed2 = hkdf_derive(recovered_kek, "taad-controller-v1".to_string(), salt, 32);
        let taad2 = derive_ed25519_public_key(seed2);

        assert_eq!(taad1, taad2, "TAAD_Key (controller) MUST be identical after restore");
    }

    #[test]
    fn test_mnemonic_reject_bad_checksum() {
        // Valid wordlist words but a deliberately broken checksum: swap the last
        // word of the all-zero vector ("art" → "abandon").
        let bad = "abandon ".repeat(24);
        let bad = bad.trim().to_string();
        assert!(mnemonic_to_master_kek(bad).is_empty(), "bad checksum must be rejected");
    }

    #[test]
    fn test_mnemonic_reject_non_wordlist() {
        let bad = "zzzz ".repeat(24).trim().to_string();
        assert!(mnemonic_to_master_kek(bad).is_empty(), "non-wordlist words must be rejected");
    }

    #[test]
    fn test_mnemonic_reject_wrong_length_12_words() {
        // A perfectly valid 12-word phrase (128-bit entropy) MUST be rejected:
        // a Master_KEK is 32 bytes, never 16, so accepting it would derive the
        // wrong (short) KEK and brick the wallet.
        let kek16 = "00".repeat(16);
        // Build a valid 12-word phrase directly via the crate to be sure it is
        // genuinely valid (only the LENGTH is wrong, not the checksum).
        let m12 = bip39::Mnemonic::from_entropy(&hex::decode(&kek16).unwrap()).unwrap();
        assert_eq!(m12.word_count(), 12);
        assert!(
            mnemonic_to_master_kek(m12.to_string()).is_empty(),
            "12-word phrase must be rejected — KEK must be 32 bytes"
        );
    }

    #[test]
    fn test_mnemonic_normalizes_whitespace_and_case() {
        let kek = generate_master_kek();
        let phrase = master_kek_to_mnemonic(kek.clone());
        // Mangle spacing + case the way a paste might.
        let mangled = format!("  {}  ", phrase.replace(' ', "   ").to_uppercase());
        assert_eq!(
            mnemonic_to_master_kek(mangled),
            kek,
            "extra whitespace / uppercase must still recover the KEK"
        );
    }

    #[test]
    fn test_device_kek_v2_roundtrip_wrap_unwrap() {
        // Full wrap/unwrap with a v2 Device_KEK: encrypt Master_KEK, decrypt back.
        let salt = generate_salt();
        let gate = "cd".repeat(32);
        let pbk = pbkdf2_derive("987654".to_string(), salt.clone());
        let device_kek = hkdf_derive(
            format!("{pbk}{gate}"),
            "device-kek-v2".to_string(),
            salt,
            32,
        );
        let master_kek = generate_master_kek();
        let wrapped = aes_gcm_encrypt(device_kek.clone(), master_kek.clone());
        let unwrapped = aes_gcm_decrypt(device_kek, wrapped);
        assert_eq!(unwrapped, master_kek, "v2 Device_KEK must round-trip");
    }
}
