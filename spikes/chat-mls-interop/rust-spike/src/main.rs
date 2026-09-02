// Pha 0 spike — đối chiếu bản Rust với golden vectors (rust/chat_mls/vectors/web-vectors.json).
//
// Tầng 2 (message-layer): HKDF-SHA256(salt rỗng, info="mls-msg:"+id) -> AES-256-GCM.
// Tầng 3 (Merkle):        strToField=first31(blake2b256), Poseidon BN254, Ed25519 sig.
//
// Mục tiêu: mọi giá trị Rust tính ra PHẢI trùng khít với "expect" trong tệp vector đó.

use std::str::FromStr;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::Hkdf;
use serde_json::Value;
use sha2::Sha256;

type Blake2b256 = Blake2b<U32>;

fn hexd(s: &str) -> Vec<u8> {
    hex::decode(s).expect("hex decode")
}

// ---- Tầng 2 -------------------------------------------------------------
fn derive_message_key(epoch_secret: &[u8], message_id: &str) -> [u8; 32] {
    // WebCrypto HKDF salt=Uint8Array(0) tương đương salt None (chuỗi 0 dài HashLen).
    let hk = Hkdf::<Sha256>::new(None, epoch_secret);
    let info = format!("mls-msg:{message_id}");
    let mut okm = [0u8; 32];
    hk.expand(info.as_bytes(), &mut okm).expect("hkdf expand");
    okm
}

fn aes_gcm_seal(key: &[u8; 32], iv: &[u8], plaintext: &[u8]) -> (Vec<u8>, Vec<u8>) {
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(iv); // 12 byte
    let out = cipher
        .encrypt(nonce, Payload { msg: plaintext, aad: &[] })
        .expect("aes-gcm encrypt");
    let (ct, tag) = out.split_at(out.len() - 16);
    (ct.to_vec(), tag.to_vec())
}

// ---- Tầng 3 -------------------------------------------------------------
fn str_to_field(value: &str) -> Fr {
    // blake2b-256(utf8(value)) -> lấy 31 byte đầu -> big-endian integer
    let mut h = Blake2b256::new();
    h.update(value.as_bytes());
    let digest = h.finalize();
    let first31 = &digest[..31];
    Fr::from_be_bytes_mod_order(first31)
}

fn salt_to_field(salt_hex: &str) -> Fr {
    let bytes = hexd(salt_hex); // 32 byte
    Fr::from_be_bytes_mod_order(&bytes[..31])
}

fn poseidon(inputs: &[Fr]) -> Fr {
    use light_poseidon::{Poseidon, PoseidonHasher};
    let mut h = Poseidon::<Fr>::new_circom(inputs.len()).expect("poseidon params");
    h.hash(inputs).expect("poseidon hash")
}

fn fr_to_hex_be(f: &Fr) -> String {
    let bytes = f.into_bigint().to_bytes_be(); // 32 byte big-endian
    hex::encode(bytes)
}

fn check(label: &str, got: &str, want: &str, ok: &mut bool) {
    let pass = got.eq_ignore_ascii_case(want);
    *ok &= pass;
    println!(
        "  [{}] {label}\n      got : {got}\n      want: {want}",
        if pass { "PASS" } else { "FAIL" }
    );
}

fn main() {
    let raw = std::fs::read_to_string(
        // Cùng MỘT tệp mà crate thật đọc (rust/chat_mls/src/golden.rs). Trước đây spike
        // này đọc `../node-harness/vectors.json` — một bản riêng — nên spike xanh không
        // nói được gì về crate thật.
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../../rust/chat_mls/vectors/web-vectors.json"),
    )
    .expect("đọc web-vectors.json — chạy `node gen-vectors.mjs` trước");
    let v: Value = serde_json::from_str(&raw).unwrap();
    let mut ok = true;

    // ===== TẦNG 2 =====
    println!("=== TẦNG 2 — message-layer (HKDF-SHA256 + AES-256-GCM) ===");
    let t2 = &v["tier2_message"];
    let epoch_secret = hexd(t2["input"]["epochSecret_hex"].as_str().unwrap());
    let message_id = t2["input"]["messageId"].as_str().unwrap();
    let iv = hexd(t2["input"]["iv_hex"].as_str().unwrap());
    let plain = t2["input"]["plainContentJson"].as_str().unwrap();

    let mkey = derive_message_key(&epoch_secret, message_id);
    check("messageKey", &hex::encode(mkey), t2["expect"]["messageKey_hex"].as_str().unwrap(), &mut ok);

    let (ct, tag) = aes_gcm_seal(&mkey, &iv, plain.as_bytes());
    check("ciphertext(b64)", &B64.encode(&ct), t2["expect"]["ciphertext_b64"].as_str().unwrap(), &mut ok);
    check("tag(b64)", &B64.encode(&tag), t2["expect"]["tag_b64"].as_str().unwrap(), &mut ok);

    // ===== TẦNG 3 =====
    println!("\n=== TẦNG 3 — Merkle (Poseidon BN254 + Ed25519) ===");
    let t3 = &v["tier3_merkle"];
    let plaintext = t3["input"]["plaintext"].as_str().unwrap();
    let salt_hex = t3["input"]["saltHex"].as_str().unwrap();
    let conv = t3["input"]["conversationId"].as_str().unwrap();
    let sender = t3["input"]["senderId"].as_str().unwrap();
    let ts = u128::from_str(t3["input"]["timestamp"].as_str().unwrap()).unwrap();

    // strToField / saltField
    let content_field = str_to_field(plaintext);
    check("contentField(dec)", &content_field.into_bigint().to_string(), t3["expect"]["contentField_dec"].as_str().unwrap(), &mut ok);
    let salt_field = salt_to_field(salt_hex);
    check("saltField(dec)", &salt_field.into_bigint().to_string(), t3["expect"]["saltField_dec"].as_str().unwrap(), &mut ok);

    // ptCommit = Poseidon(content, salt)
    let pt_commit = poseidon(&[content_field, salt_field]);
    check("ptCommit(hex)", &fr_to_hex_be(&pt_commit), t3["expect"]["ptCommit_hex"].as_str().unwrap(), &mut ok);

    // leafHash = Poseidon(conv, sender, timestamp, ptCommit)
    let ts_field = Fr::from(ts);
    let leaf = poseidon(&[str_to_field(conv), str_to_field(sender), ts_field, pt_commit]);
    let leaf_hex = fr_to_hex_be(&leaf);
    check("leafHash(hex)", &leaf_hex, t3["expect"]["leafHash_hex"].as_str().unwrap(), &mut ok);

    // Ed25519: seed cố định -> sign(leafHashHex bytes)
    let seed = hexd(t3["expect"]["ed25519_seed_hex"].as_str().unwrap());
    let sk = SigningKey::from_bytes(&seed.try_into().unwrap());
    let vk: VerifyingKey = sk.verifying_key();
    check("ed25519_pub(hex)", &hex::encode(vk.to_bytes()), t3["expect"]["ed25519_pub_hex"].as_str().unwrap(), &mut ok);

    let leaf_bytes = hexd(&leaf_hex);
    let sig: Signature = sk.sign(&leaf_bytes);
    check("signature(hex)", &hex::encode(sig.to_bytes()), t3["expect"]["signature_hex"].as_str().unwrap(), &mut ok);

    // Verify chéo chữ ký từ vector (bằng chứng dalek <-> tweetnacl tương thích)
    let want_sig = Signature::from_bytes(&hexd(t3["expect"]["signature_hex"].as_str().unwrap()).try_into().unwrap());
    let verified = vk.verify(&leaf_bytes, &want_sig).is_ok();
    println!("  [{}] verify chữ ký tweetnacl bằng ed25519-dalek", if verified { "PASS" } else { "FAIL" });
    ok &= verified;

    println!("\n{}", if ok { "✅ TẤT CẢ KHỚP — tầng 2 & 3 interop OK" } else { "❌ CÓ MỤC LỆCH — xem FAIL ở trên" });
    std::process::exit(if ok { 0 } else { 1 });
}
