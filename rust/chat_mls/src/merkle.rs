//! Tầng 3 — Merkle identity proof (chỉ hội thoại DIRECT & JOB_NEGOTIATION).
//!
//! Khớp CHÍNH XÁC `lib/merkle-crypto.ts` + `lib/merkle-leaf.ts` + `lib/session-delegation.ts`:
//! - `strToField(s)  = first31bytes(blake2b256(utf8(s)))` (big-endian → field BN254)
//! - `ptCommit       = Poseidon([strToField(plaintext), first31(salt)])`
//! - `leafHash       = Poseidon([strToField(convId), strToField(senderId), Fr(timestamp), ptCommit])`
//! - `signature      = Ed25519(sessionSk, bytes(leafHashHex))`
//! Poseidon dùng `light-poseidon` (BN254) — đã kiểm khớp `circomlibjs` 0.1.7 ở Pha 0.

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use light_poseidon::{Poseidon, PoseidonHasher};
use serde::{Deserialize, Serialize};

use crate::{ChatMlsError, Result};

type Blake2b256 = Blake2b<U32>;

/// MerkleLeaf khớp `types/merkle.types.ts`. Hash ở dạng hex 64 ký tự; cert ở base64.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleLeaf {
    pub v: u32,
    #[serde(rename = "delegationCert")]
    pub delegation_cert: String,
    #[serde(rename = "walletCoseKey")]
    pub wallet_cose_key: String,
    #[serde(rename = "leafHash")]
    pub leaf_hash: String,
    #[serde(rename = "ptCommit")]
    pub pt_commit: String,
    pub algorithm: String,
    pub signature: String,
    #[serde(rename = "signerPublicKey")]
    pub signer_public_key: String,
}

/// `strToField` — blake2b-256(utf8) rồi lấy 31 byte đầu làm field BN254.
pub fn str_to_field(value: &str) -> Fr {
    let mut h = Blake2b256::new();
    h.update(value.as_bytes());
    let digest = h.finalize();
    Fr::from_be_bytes_mod_order(&digest[..31])
}

fn salt_hex_to_field(salt_hex: &str) -> Result<Fr> {
    let bytes = hex::decode(salt_hex).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
    if bytes.len() < 31 {
        return Err(ChatMlsError::Merkle("salt < 31 byte".into()));
    }
    Ok(Fr::from_be_bytes_mod_order(&bytes[..31]))
}

fn poseidon(inputs: &[Fr]) -> Result<Fr> {
    let mut h = Poseidon::<Fr>::new_circom(inputs.len())
        .map_err(|e| ChatMlsError::Merkle(format!("poseidon params: {e}")))?;
    h.hash(inputs).map_err(|e| ChatMlsError::Merkle(format!("poseidon hash: {e}")))
}

fn fr_to_hex_be(f: &Fr) -> String {
    hex::encode(f.into_bigint().to_bytes_be())
}

/// `ptCommit = Poseidon(strToField(plaintext), first31(salt))`.
pub fn compute_pt_commit(plaintext: &str, salt_hex: &str) -> Result<Fr> {
    poseidon(&[str_to_field(plaintext), salt_hex_to_field(salt_hex)?])
}

/// `leafHash = Poseidon(strToField(convId), strToField(senderId), Fr(timestamp), ptCommit)`.
pub fn compute_leaf_hash(
    conversation_id: &str,
    sender_id: &str,
    timestamp_ms: u128,
    pt_commit: Fr,
) -> Result<Fr> {
    poseidon(&[
        str_to_field(conversation_id),
        str_to_field(sender_id),
        Fr::from(timestamp_ms),
        pt_commit,
    ])
}

/// Tạo MerkleLeaf hoàn chỉnh (ký leafHash bằng session key Ed25519).
///
/// `session_sk` là khoá ký session (32 byte seed). `delegation_cert` + `wallet_cose_key`
/// là COSE_Sign1 / COSE_Key lấy từ ví (CIP-30 signData) — chat_mls chỉ mang theo, không tạo.
#[allow(clippy::too_many_arguments)]
pub fn create_merkle_leaf(
    conversation_id: &str,
    sender_id: &str,
    timestamp_ms: u128,
    plaintext: &str,
    salt_hex: &str,
    session_sk: &SigningKey,
    delegation_cert: &str,
    wallet_cose_key: &str,
) -> Result<MerkleLeaf> {
    let pt_commit = compute_pt_commit(plaintext, salt_hex)?;
    let leaf = compute_leaf_hash(conversation_id, sender_id, timestamp_ms, pt_commit)?;
    let leaf_hex = fr_to_hex_be(&leaf);

    let sig: Signature = session_sk.sign(&hex::decode(&leaf_hex).unwrap());
    Ok(MerkleLeaf {
        v: 1,
        delegation_cert: delegation_cert.to_string(),
        wallet_cose_key: wallet_cose_key.to_string(),
        leaf_hash: leaf_hex,
        pt_commit: fr_to_hex_be(&pt_commit),
        algorithm: "pos-b2b".into(),
        signature: hex::encode(sig.to_bytes()),
        signer_public_key: hex::encode(session_sk.verifying_key().to_bytes()),
    })
}

/// Kiểm tra một MerkleLeaf: tính lại ptCommit/leafHash và verify chữ ký session.
///
/// (Chưa kiểm chuỗi ví→session qua `delegation_cert`/`wallet_cose_key` COSE — sẽ bổ sung
/// khi tích hợp verify COSE_Sign1; ở đây xác thực toàn vẹn nội dung + chữ ký session.)
pub fn verify_merkle_leaf(
    leaf: &MerkleLeaf,
    conversation_id: &str,
    sender_id: &str,
    timestamp_ms: u128,
    plaintext: &str,
    salt_hex: &str,
) -> Result<bool> {
    let pt_commit = compute_pt_commit(plaintext, salt_hex)?;
    if fr_to_hex_be(&pt_commit) != leaf.pt_commit {
        return Ok(false);
    }
    let leaf_hash = compute_leaf_hash(conversation_id, sender_id, timestamp_ms, pt_commit)?;
    let leaf_hex = fr_to_hex_be(&leaf_hash);
    if leaf_hex != leaf.leaf_hash {
        return Ok(false);
    }

    let pk_bytes: [u8; 32] = hex::decode(&leaf.signer_public_key)
        .map_err(|e| ChatMlsError::Encoding(e.to_string()))?
        .try_into()
        .map_err(|_| ChatMlsError::Merkle("signerPublicKey không phải 32 byte".into()))?;
    let sig_bytes: [u8; 64] = hex::decode(&leaf.signature)
        .map_err(|e| ChatMlsError::Encoding(e.to_string()))?
        .try_into()
        .map_err(|_| ChatMlsError::Merkle("signature không phải 64 byte".into()))?;

    let vk = VerifyingKey::from_bytes(&pk_bytes)
        .map_err(|e| ChatMlsError::Crypto(e.to_string()))?;
    let sig = Signature::from_bytes(&sig_bytes);
    Ok(vk.verify(&hex::decode(&leaf_hex).unwrap(), &sig).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Golden vector từ gen-vectors.mjs (circomlibjs/blakejs/tweetnacl).
    const PLAINTEXT: &str = "xin chào 🌱";

    fn salt() -> String { "ab".repeat(32) }

    #[test]
    fn pt_commit_matches_web() {
        let pt = compute_pt_commit(PLAINTEXT, &salt()).unwrap();
        assert_eq!(fr_to_hex_be(&pt), "1bb179f17c9f93deec26dd15e8284ee0708b9e02ba5d76842b0447fceadefffa");
    }

    #[test]
    fn leaf_hash_matches_web() {
        let pt = compute_pt_commit(PLAINTEXT, &salt()).unwrap();
        let leaf = compute_leaf_hash("conv-direct-0001", "stake1uxyztestsenderaddress", 1_700_000_000_000, pt).unwrap();
        assert_eq!(fr_to_hex_be(&leaf), "0a9ebfe2278cef528e5423024cdaa7225a9831b193ade0346d12b8595a8c8007");
    }

    #[test]
    fn create_and_verify_leaf() {
        let seed: [u8; 32] = hex::decode("11".repeat(32)).unwrap().try_into().unwrap();
        let sk = SigningKey::from_bytes(&seed);
        // Khớp pub key + signature golden
        assert_eq!(hex::encode(sk.verifying_key().to_bytes()), "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737");

        let leaf = create_merkle_leaf(
            "conv-direct-0001", "stake1uxyztestsenderaddress", 1_700_000_000_000,
            PLAINTEXT, &salt(), &sk, "cert-b64", "cose-b64",
        ).unwrap();
        assert_eq!(leaf.signature, "b2daf749c7cfa9ce7444dabdec461690a7959bf68817bdc1b2ea44841f62a539d0a6c04c516379eed406587da6e1c923f4b6da7f6ef00390bbf6fb1b35997705");

        let ok = verify_merkle_leaf(&leaf, "conv-direct-0001", "stake1uxyztestsenderaddress", 1_700_000_000_000, PLAINTEXT, &salt()).unwrap();
        assert!(ok, "verify chính leaf mình tạo phải PASS");

        // Sai plaintext → verify FAIL
        let bad = verify_merkle_leaf(&leaf, "conv-direct-0001", "stake1uxyztestsenderaddress", 1_700_000_000_000, "sai", &salt()).unwrap();
        assert!(!bad);
    }
}
