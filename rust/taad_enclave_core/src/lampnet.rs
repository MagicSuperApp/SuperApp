// ================================================================
// PhoenixKey — LampNet §7 distributed-storage client (crypto layer)
//
// Implements the client-side cryptography for LampNet (Math Spec §7):
//   1. LocatorSecret / LocatorID derivation (deterministic per device+DID).
//      KEPT as a client-side INDEX/metadata only (see "LOCATOR vs CID" below) —
//      it is NOT the fetch address.
//   2. ECIES key-wrap of the NEW controller key so LampNet only ever holds
//      ciphertext, with the recipient X25519 key DERIVED FROM Master_KEK
//      (deterministic recovery — see "RECOVERY MODEL" below).
//
// RECOVERY MODEL (locked with PO):
//   After a key rotation the NEW controller key (or its EncSeed) is distributed
//   to LampNet so it can be recovered later. The thing encrypted is the NEW
//   controller key — NOT the Master_KEK.
//
//   The X25519 recipient keypair is derived DETERMINISTICALLY from Master_KEK:
//       HKDF-SHA256(ikm=Master_KEK, info="lampnet-ecies-x25519-v1", salt=∅)
//         → 32 bytes → X25519 StaticSecret (x25519-dalek clamps internally).
//   Recovery: user enters 24 words → reconstruct Master_KEK → re-derive the
//   SAME X25519 secret → download ciphertext from LampNet → decrypt the new
//   controller key. Because the user holds Master_KEK out-of-band (paper seed),
//   deriving the ECIES key from Master_KEK is VALID and NOT circular.
//
//   PRIOR BUG (CRITICAL, now fixed): the recipient X25519 key used to come from
//   the CALLER (a key Dart held on-device). If Dart generated it randomly and
//   stored it locally, losing the device meant losing the decryption key →
//   PERMANENT loss of the LampNet-stored data. Deriving from Master_KEK removes
//   that failure mode entirely: anyone with the 24 words can recover.
//
// ARCHITECTURE (mandate §V.3 — same split already used for Blockfrost/tx):
//   The FFI core performs crypto + builds the request payload; the Dart caller
//   performs the actual HTTP I/O against LampNet. Keeping network out of the
//   core makes this module fully offline-testable (no live calls in `cargo
//   test`) and mirrors how `taad_did` / `transfer` already work.
//
//   - `lampnet_build_upload_request(payload, hw_uid, did, master_kek)`
//       → { method:"POST", url, multipart:{...}, ciphertext } ready for Dart to
//         POST (multipart/form-data) to the LampNet Mirage upload endpoint.
//   - `lampnet_build_recover_request(cid)`
//       → { method:"GET", url } ready for Dart to GET the ciphertext back; that
//         ciphertext is then handed to `lampnet_recover_decrypt`.
//   - `lampnet_recover_decrypt(ciphertext, master_kek)` → recovered payload.
//
// LOCATOR vs CID (LampNet is content-addressed — verified against
// lampnet-hivemind/README.md:2042 + mobile-upload-flow.md):
//   LampNet assigns a CID (e.g. "ln1q_<blake3>_<doc_type>") on upload; the CID
//   is the ONLY fetch address (GET https://lampnet.cloud/{cid}). The CID is
//   content-derived (BLAKE3 over the ciphertext, which contains a random
//   ephemeral pubkey + random GCM nonce) ⇒ NON-DETERMINISTIC: it cannot be
//   re-derived from device material at recovery time.
//
//   ⇒ The caller MUST PERSIST the returned CID after upload and supply it back
//      to `lampnet_build_recover_request` at recovery time. WHERE the CID is
//      anchored (TAAD datum on-chain vs. backend mapping) is a layer-above
//      decision — see TODO(cid-anchoring) below.
//
//   LocatorID is RETAINED as a deterministic client-side index/metadata key
//   (a stable handle the app/backend can map → CID), NOT as the fetch address.
//
// Math Spec §7.2 (LocatorID derivation — unchanged):
//   LocatorSecret = HKDF(HW_UID ∥ DID, "lampnet-locator-v1")
//   LocatorID     = SHA-256(DID ∥ Epoch ∥ LocatorSecret)   (Epoch=0 MVP)
//
// Invariants (§7):
//   I-LAMP-1: |Droplets| / LT encode — owned by the LampNet node side; the node
//             performs LT_Encode on the ciphertext we ship. Out of scope here.
//   I-LAMP-2: LT_Decode(LT_Encode(x)) = x — node-side correctness (out of scope).
//   I-LAMP-3: LocatorSecret never transmitted in plaintext — ENFORCED: only the
//             LocatorID (a one-way hash of the secret) ever leaves the device.
//
// TODO(cid-anchoring): the returned CID is non-deterministic and MUST be stored
//   by the caller for recovery. Decide + wire the anchor (TAAD datum field vs.
//   backend LocatorID→CID mapping). Until then, Dart must persist the CID it
//   gets from the POST response and feed it to the recover request.
// ================================================================

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

/// HKDF info string for the LocatorSecret derivation (Math Spec §7.2).
const LOCATOR_INFO: &[u8] = b"lampnet-locator-v1";

/// HKDF info string for the ECIES content-encryption key derivation.
const ECIES_KDF_INFO: &[u8] = b"lampnet-ecies-v1";

/// HKDF info string for deriving the X25519 ECIES recipient keypair from the
/// Master_KEK. Distinct domain label from `ECIES_KDF_INFO` (which keys AES) so
/// the two HKDF outputs can never collide. Versioned for forward migration.
const ECIES_X25519_INFO: &[u8] = b"lampnet-ecies-x25519-v1";

/// LampNet base URL (production). lampnet-hivemind/mobile-upload-flow.md §Base.
pub const LAMPNET_BASE_URL: &str = "https://lampnet.cloud";

/// LampNet Mirage upload endpoint (content-addressed). Real format
/// (README.md:2042 + mobile-upload-flow.md): POST multipart/form-data; the
/// network assigns + returns a CID. The `?format=bech32&mode=symmetric` query
/// matches the PO-locked upload mode for distributed recovery data.
pub const LAMPNET_PUT_URL: &str = "https://lampnet.cloud/mirage/put?format=bech32&mode=symmetric";

/// LampNet download is by CID: GET https://lampnet.cloud/{cid}.
/// (mobile-upload-flow.md §Sơ đồ 3 Case 2.)
pub const LAMPNET_GET_BASE_URL: &str = "https://lampnet.cloud";

/// Derive the X25519 ECIES recipient keypair DETERMINISTICALLY from Master_KEK.
///
/// `HKDF-SHA256(ikm=master_kek, salt=∅, info="lampnet-ecies-x25519-v1")` → 32
/// bytes → `StaticSecret` (x25519-dalek clamps the scalar internally, so the
/// raw HKDF output is a valid X25519 secret). Returns `(secret, public)`.
///
/// DETERMINISTIC: the same Master_KEK always yields the same keypair, which is
/// exactly what recovery relies on — the user re-derives Master_KEK from the 24
/// words, re-derives this secret, and decrypts. No on-device key is involved,
/// so device loss does NOT cause data loss (the CRITICAL bug this fixes).
pub fn derive_x25519_static_from_kek(master_kek: &[u8; 32]) -> (StaticSecret, PublicKey) {
    let hk = Hkdf::<Sha256>::new(None, master_kek);
    let mut sk_bytes = Zeroizing::new([0u8; 32]);
    hk.expand(ECIES_X25519_INFO, &mut *sk_bytes)
        .expect("HKDF expand of 32 bytes from SHA-256 cannot fail");
    let secret = StaticSecret::from(*sk_bytes);
    let public = PublicKey::from(&secret);
    (secret, public)
}

/// Result of deriving the locator for a (device, DID) pair.
pub struct Locator {
    /// 32-byte HKDF output. NEVER transmitted (I-LAMP-3). Zeroized on drop.
    pub secret: Zeroizing<[u8; 32]>,
    /// Public 32-byte address = H(DID ∥ Epoch ∥ LocatorSecret). Safe to send.
    pub id: [u8; 32],
}

/// LocatorSecret = HKDF(HW_UID ∥ DID, "lampnet-locator-v1"); then
/// LocatorID = SHA-256(DID ∥ Epoch_be8 ∥ LocatorSecret). Epoch fixed to 0 for
/// the MVP (single rotation window); a future commit threads the real epoch.
///
/// Deterministic: the SAME (hw_uid, did) always yields the SAME secret + id,
/// which is exactly what recovery on the same device relies on (§7.2 retrieval).
pub fn derive_locator(hw_uid: &[u8], did: &str) -> Locator {
    // IKM = HW_UID ∥ DID.
    let mut ikm = Vec::with_capacity(hw_uid.len() + did.len());
    ikm.extend_from_slice(hw_uid);
    ikm.extend_from_slice(did.as_bytes());

    // HKDF-SHA256 with no salt (salt omitted per §1 signature) and the §7.2
    // info label. Output is the 32-byte LocatorSecret.
    let hk = Hkdf::<Sha256>::new(None, &ikm);
    let mut secret = Zeroizing::new([0u8; 32]);
    hk.expand(LOCATOR_INFO, &mut *secret)
        .expect("HKDF expand of 32 bytes from SHA-256 cannot fail");

    // LocatorID = SHA-256(DID ∥ Epoch_be8 ∥ LocatorSecret).
    let epoch: u64 = 0;
    let mut h = Sha256::new();
    h.update(did.as_bytes());
    h.update(epoch.to_be_bytes());
    h.update(&*secret);
    let id: [u8; 32] = h.finalize().into();

    Locator { secret, id }
}

/// ECIES encrypt: ephemeral-static X25519 ECDH → HKDF-SHA256 → AES-256-GCM.
///
/// Output layout (all concatenated):
///   ephemeral_pubkey(32) ∥ nonce(12) ∥ AES-256-GCM-ciphertext(plaintext+tag)
///
/// `recipient_pub` is the recipient's 32-byte X25519 public key. Only the
/// holder of the matching X25519 secret (`ecies_decrypt`) can recover the
/// plaintext, so LampNet — which stores this blob — cannot read EncSeed.
pub fn ecies_encrypt(recipient_pub: &[u8; 32], plaintext: &[u8]) -> Vec<u8> {
    // Ephemeral X25519 keypair (fresh per encryption).
    let mut eph_bytes = Zeroizing::new([0u8; 32]);
    rand::thread_rng().fill_bytes(&mut *eph_bytes);
    let eph_secret = StaticSecret::from(*eph_bytes);
    let eph_pub = PublicKey::from(&eph_secret);

    // ECDH shared secret.
    let recipient = PublicKey::from(*recipient_pub);
    let shared = eph_secret.diffie_hellman(&recipient);

    // Derive the AES-256 content key. Salt = ephemeral pubkey (binds the key to
    // this ephemeral, standard ECIES practice); info = domain label.
    let hk = Hkdf::<Sha256>::new(Some(eph_pub.as_bytes()), shared.as_bytes());
    let mut aes_key = Zeroizing::new([0u8; 32]);
    hk.expand(ECIES_KDF_INFO, &mut *aes_key)
        .expect("HKDF expand of 32 bytes cannot fail");

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&*aes_key));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .expect("AES-256-GCM encryption cannot fail for valid key/nonce");

    let mut out = Vec::with_capacity(32 + 12 + ct.len());
    out.extend_from_slice(eph_pub.as_bytes());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    out
}

/// ECIES decrypt — inverse of [`ecies_encrypt`]. `recipient_priv` is the 32-byte
/// X25519 secret. Returns the plaintext (zeroized buffer) or an error string on
/// a malformed blob / wrong key / tampering (GCM tag failure).
pub fn ecies_decrypt(
    recipient_priv: &[u8; 32],
    blob: &[u8],
) -> Result<Zeroizing<Vec<u8>>, String> {
    if blob.len() < 32 + 12 + 16 {
        return Err("ecies blob too short (need ephemeral_pub|nonce|ct+tag)".into());
    }
    let mut eph_pub_arr = [0u8; 32];
    eph_pub_arr.copy_from_slice(&blob[..32]);
    let eph_pub = PublicKey::from(eph_pub_arr);
    let nonce_bytes = &blob[32..44];
    let ct = &blob[44..];

    let secret = StaticSecret::from(*recipient_priv);
    let shared = secret.diffie_hellman(&eph_pub);

    let hk = Hkdf::<Sha256>::new(Some(eph_pub.as_bytes()), shared.as_bytes());
    let mut aes_key = Zeroizing::new([0u8; 32]);
    hk.expand(ECIES_KDF_INFO, &mut *aes_key)
        .expect("HKDF expand of 32 bytes cannot fail");

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&*aes_key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ct)
        .map(Zeroizing::new)
        .map_err(|_| "ecies decrypt failed (wrong key or tampered ciphertext)".into())
}

/// Build the LampNet upload request for the new controller key (or its
/// EncSeed). Returns a JSON SPEC the Dart caller turns into a real
/// `multipart/form-data` POST — the core does NOT do HTTP (mandate §V.3).
///
/// Shape (matches lampnet-hivemind/mobile-upload-flow.md §Sơ đồ 2):
/// ```json
/// {
///   "method": "POST",
///   "url": "https://lampnet.cloud/mirage/put?format=bech32&mode=symmetric",
///   "content_type": "multipart/form-data",
///   "multipart": {
///     "file":       <hex of ciphertext bytes>,   // the `file` form field
///     "data_class": "bulk",                       // client-side encrypted → bulk
///     "redundancy": "2.5"
///   },
///   "ciphertext":   <hex>,        // == multipart.file, convenience for Dart
///   "locator_id":   <hex>,        // client-side index/metadata, NOT the address
///   "response":     "plain-text CID (ln1...), trim — NOT JSON"
/// }
/// ```
///
/// IMPORTANT — caller responsibilities:
///   * The `multipart.file` value is hex; Dart must hex-decode it to the raw
///     ciphertext bytes and attach as the binary `file` part.
///   * The upload RESPONSE is a PLAIN-TEXT CID (e.g. "ln1q_..."), NOT JSON —
///     Dart must read `body.trim()`, never `JSONDecoder`.
///   * The CID is NON-DETERMINISTIC (content hash over random ephemeral pubkey
///     + nonce); the caller MUST PERSIST it for recovery. See TODO(cid-anchoring).
///
/// `payload`    — the bytes to distribute: the NEW controller key or its EncSeed
///                (already Device_KEK-encrypted). NOT the Master_KEK.
/// `hw_uid`     — device HW_UID (Secure Enclave) — only feeds the LocatorID index.
/// `did`        — DID string — only feeds the LocatorID index.
/// `master_kek` — 32-byte Master_KEK; the X25519 recipient key is DERIVED from
///                it internally (no external key — fixes the device-loss bug).
pub fn lampnet_build_upload_request(
    payload: &[u8],
    hw_uid: &[u8],
    did: &str,
    master_kek: &[u8; 32],
) -> String {
    // Recipient X25519 PUBLIC key derived deterministically from Master_KEK.
    let (_secret, recipient_pub) = derive_x25519_static_from_kek(master_kek);
    let ciphertext = ecies_encrypt(recipient_pub.as_bytes(), payload);
    let ciphertext_hex = hex::encode(&ciphertext);

    // LocatorID kept as a client-side index/metadata handle (NOT a fetch address).
    let locator = derive_locator(hw_uid, did);
    let locator_hex = hex::encode(locator.id);

    serde_json::json!({
        "method": "POST",
        "url": LAMPNET_PUT_URL,
        "content_type": "multipart/form-data",
        "multipart": {
            "file": ciphertext_hex,
            "data_class": "bulk",
            "redundancy": "2.5",
        },
        "ciphertext": ciphertext_hex,
        "locator_id": locator_hex,
        "response": "plain-text CID (ln1...), trim — NOT JSON",
    })
    .to_string()
}

/// Build the LampNet retrieval request for a previously-uploaded CID. Returns a
/// JSON spec the Dart caller GETs from `<url>` to obtain the ciphertext, then
/// passes that ciphertext to [`ecies_decrypt`] (FFI `lampnet_recover_decrypt`).
///   { "method":"GET", "url": "https://lampnet.cloud/{cid}", "cid": <cid> }
///
/// `cid` — the content-addressed identifier RETURNED by the upload POST and
/// PERSISTED by the caller (LampNet is content-addressed; the CID is the only
/// fetch address and cannot be re-derived). See TODO(cid-anchoring).
pub fn lampnet_build_recover_request(cid: &str) -> String {
    serde_json::json!({
        "method": "GET",
        "url": format!("{}/{}", LAMPNET_GET_BASE_URL, cid),
        "cid": cid,
    })
    .to_string()
}

// ─── TESTS ─────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    /// LocatorSecret + LocatorID must be deterministic for a fixed (hw_uid,did)
    /// — recovery on the same device re-derives the identical locator (§7.2).
    #[test]
    fn locator_is_deterministic() {
        let hw_uid = b"secure-enclave-uid-AAAA";
        let did = "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000";
        let a = derive_locator(hw_uid, did);
        let b = derive_locator(hw_uid, did);
        assert_eq!(&*a.secret, &*b.secret, "LocatorSecret must be deterministic");
        assert_eq!(a.id, b.id, "LocatorID must be deterministic");
    }

    /// Different device OR different DID ⇒ different locator (no collision /
    /// privacy: one device's locators don't reveal another's).
    #[test]
    fn locator_varies_by_device_and_did() {
        let did1 = "did:phoenix:aaaaaaaaaaaac:1111111111111111111111111111111111111111111111111111111111111111";
        let did2 = "did:phoenix:aaaaaaaaaaaac:2222222222222222222222222222222222222222222222222222222222222222";
        let l_dev1 = derive_locator(b"device-1", did1);
        let l_dev2 = derive_locator(b"device-2", did1);
        let l_did2 = derive_locator(b"device-1", did2);
        assert_ne!(l_dev1.id, l_dev2.id, "different HW_UID ⇒ different LocatorID");
        assert_ne!(l_dev1.id, l_did2.id, "different DID ⇒ different LocatorID");
    }

    /// I-LAMP-3 sanity: the LocatorID is a one-way hash of the secret, so the
    /// id alone does not equal / leak the secret bytes.
    #[test]
    fn locator_id_is_not_the_secret() {
        let l = derive_locator(b"dev", "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000");
        assert_ne!(l.id, *l.secret, "LocatorID must not equal LocatorSecret");
    }

    /// ECIES round-trip: encrypt → decrypt returns the original plaintext.
    #[test]
    fn ecies_round_trip() {
        // Deterministic recipient X25519 keypair from a fixed secret.
        let recip_secret_bytes = [0x42u8; 32];
        let recip_secret = StaticSecret::from(recip_secret_bytes);
        let recip_pub = PublicKey::from(&recip_secret);

        let enc_seed = b"EncSeed = Enc(Device_KEK, Master_KEK || H(DID)) -- 48 bytes ish";
        let blob = ecies_encrypt(recip_pub.as_bytes(), enc_seed);
        // Blob carries ephemeral pub (32) + nonce (12) + ct(>=plaintext+16).
        assert!(blob.len() >= 32 + 12 + enc_seed.len() + 16);
        // Ciphertext must not equal plaintext anywhere obvious.
        assert_ne!(&blob[44..44 + enc_seed.len()], &enc_seed[..]);

        let recovered = ecies_decrypt(&recip_secret_bytes, &blob).unwrap();
        assert_eq!(&recovered[..], &enc_seed[..], "ECIES must round-trip");
    }

    /// Two encryptions of the same plaintext differ (fresh ephemeral + nonce),
    /// but both decrypt to the same plaintext.
    #[test]
    fn ecies_is_nondeterministic_but_decrypts() {
        let recip_secret_bytes = [0x07u8; 32];
        let recip_pub = PublicKey::from(&StaticSecret::from(recip_secret_bytes));
        let pt = b"same plaintext";
        let c1 = ecies_encrypt(recip_pub.as_bytes(), pt);
        let c2 = ecies_encrypt(recip_pub.as_bytes(), pt);
        assert_ne!(c1, c2, "fresh ephemeral ⇒ different ciphertext each time");
        assert_eq!(&ecies_decrypt(&recip_secret_bytes, &c1).unwrap()[..], pt);
        assert_eq!(&ecies_decrypt(&recip_secret_bytes, &c2).unwrap()[..], pt);
    }

    /// Wrong recipient key ⇒ decrypt fails (GCM tag mismatch), never a wrong
    /// plaintext.
    #[test]
    fn ecies_wrong_key_fails() {
        let right = [0x11u8; 32];
        let wrong = [0x22u8; 32];
        let right_pub = PublicKey::from(&StaticSecret::from(right));
        let blob = ecies_encrypt(right_pub.as_bytes(), b"secret");
        assert!(ecies_decrypt(&wrong, &blob).is_err(), "wrong key must fail closed");
    }

    /// Tampering with the ciphertext ⇒ authenticated decryption fails.
    #[test]
    fn ecies_tamper_fails() {
        let secret = [0x33u8; 32];
        let pub_ = PublicKey::from(&StaticSecret::from(secret));
        let mut blob = ecies_encrypt(pub_.as_bytes(), b"integrity matters");
        let last = blob.len() - 1;
        blob[last] ^= 0xFF; // flip a tag/ct byte
        assert!(ecies_decrypt(&secret, &blob).is_err(), "tamper must fail closed");
    }

    // ─── KEK-derived X25519 recipient key (the CRITICAL fix) ─────────

    /// Deterministic: the SAME Master_KEK yields the SAME X25519 keypair. This
    /// is what makes recovery work from the 24 words alone.
    #[test]
    fn x25519_from_kek_is_deterministic() {
        let kek = [0x42u8; 32];
        let (s1, p1) = derive_x25519_static_from_kek(&kek);
        let (s2, p2) = derive_x25519_static_from_kek(&kek);
        assert_eq!(s1.to_bytes(), s2.to_bytes(), "same KEK ⇒ same X25519 secret");
        assert_eq!(p1.as_bytes(), p2.as_bytes(), "same KEK ⇒ same X25519 public");
    }

    /// Different Master_KEK ⇒ different X25519 keypair (no cross-KEK collision).
    #[test]
    fn x25519_from_kek_varies_by_kek() {
        let (_, p_a) = derive_x25519_static_from_kek(&[0x01u8; 32]);
        let (_, p_b) = derive_x25519_static_from_kek(&[0x02u8; 32]);
        assert_ne!(p_a.as_bytes(), p_b.as_bytes(), "different KEK ⇒ different key");
    }

    /// The derived public key is exactly PublicKey::from(derived secret) — i.e.
    /// encrypting to the public and decrypting with the secret are consistent.
    #[test]
    fn x25519_from_kek_pub_matches_secret() {
        let kek = [0xABu8; 32];
        let (secret, public) = derive_x25519_static_from_kek(&kek);
        assert_eq!(PublicKey::from(&secret).as_bytes(), public.as_bytes());
    }

    /// ECIES round-trip through KEK-derived keys: encrypt to the KEK's public,
    /// decrypt with the KEK's secret.
    #[test]
    fn ecies_round_trip_via_kek_derived_key() {
        let kek = [0x5Au8; 32];
        let (secret, public) = derive_x25519_static_from_kek(&kek);
        let new_controller_key = b"NEW controller key material (post-rotation)";

        let blob = ecies_encrypt(public.as_bytes(), new_controller_key);
        let recovered = ecies_decrypt(&secret.to_bytes(), &blob).unwrap();
        assert_eq!(&recovered[..], &new_controller_key[..], "must round-trip via KEK");
    }

    /// Upload request shape (REAL LampNet format): POST, content-addressed URL
    /// with query, multipart `file`/`data_class`/`redundancy`; the shipped
    /// ciphertext decrypts back with the SAME Master_KEK.
    #[test]
    fn upload_request_well_formed_and_recoverable_via_kek() {
        let kek = [0x55u8; 32];
        let payload = b"opaque-new-controller-key-bytes";
        let hw_uid = b"hw-uid-xyz";
        let did = "did:phoenix:aaaaaaaaaaaac:0000000000000000000000000000000000000000000000000000000000000000";

        let req_json = lampnet_build_upload_request(payload, hw_uid, did, &kek);
        let v: serde_json::Value = serde_json::from_str(&req_json).unwrap();

        // Method + content-addressed URL (with query) + multipart fields.
        assert_eq!(v["method"], "POST");
        assert_eq!(v["url"].as_str().unwrap(), LAMPNET_PUT_URL);
        assert_eq!(v["content_type"], "multipart/form-data");
        assert_eq!(v["multipart"]["data_class"], "bulk");
        assert_eq!(v["multipart"]["redundancy"], "2.5");
        // `file` multipart field == convenience `ciphertext` field, both hex.
        let file_hex = v["multipart"]["file"].as_str().unwrap();
        assert_eq!(file_hex, v["ciphertext"].as_str().unwrap());

        // LocatorID retained as a 64-hex client-side index.
        let locator_hex = v["locator_id"].as_str().unwrap();
        assert_eq!(locator_hex.len(), 64, "LocatorID is 32 bytes = 64 hex");
        assert_eq!(locator_hex, hex::encode(derive_locator(hw_uid, did).id));

        // The shipped ciphertext must decrypt back with the SAME Master_KEK.
        let (secret, _) = derive_x25519_static_from_kek(&kek);
        let ct = hex::decode(file_hex).unwrap();
        let recovered = ecies_decrypt(&secret.to_bytes(), &ct).unwrap();
        assert_eq!(&recovered[..], &payload[..]);
    }

    /// End-to-end recovery: upload with a KEK → recover with the SAME KEK
    /// succeeds; recover with a DIFFERENT KEK fails closed (no wrong plaintext).
    #[test]
    fn recovery_same_kek_succeeds_other_kek_fails_closed() {
        let kek = [0x11u8; 32];
        let wrong_kek = [0x22u8; 32];
        let payload = b"new-controller-key-to-recover";

        let up: serde_json::Value = serde_json::from_str(
            &lampnet_build_upload_request(payload, b"hw", "did:phoenix:x:0", &kek),
        )
        .unwrap();
        let ct = hex::decode(up["ciphertext"].as_str().unwrap()).unwrap();

        // Right KEK → recovers the payload.
        let (right_secret, _) = derive_x25519_static_from_kek(&kek);
        let ok = ecies_decrypt(&right_secret.to_bytes(), &ct).unwrap();
        assert_eq!(&ok[..], &payload[..]);

        // Wrong KEK → fail-closed (GCM tag mismatch), never a wrong plaintext.
        let (wrong_secret, _) = derive_x25519_static_from_kek(&wrong_kek);
        assert!(
            ecies_decrypt(&wrong_secret.to_bytes(), &ct).is_err(),
            "wrong Master_KEK must fail closed"
        );
    }

    /// Recover request is a GET by CID against the content-addressed base URL.
    #[test]
    fn recover_request_is_get_by_cid() {
        let cid = "ln1q_a3f5b2e89c47d1e6_phoenix-controller";
        let rec: serde_json::Value =
            serde_json::from_str(&lampnet_build_recover_request(cid)).unwrap();
        assert_eq!(rec["method"], "GET");
        assert_eq!(rec["cid"], cid);
        assert_eq!(
            rec["url"].as_str().unwrap(),
            format!("{}/{}", LAMPNET_GET_BASE_URL, cid)
        );
    }
}
