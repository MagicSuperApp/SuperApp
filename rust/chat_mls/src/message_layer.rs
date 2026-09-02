//! Tầng 2 — message-layer crypto.
//!
//! Khớp CHÍNH XÁC `lib/mls-crypto-utils.ts` + `lib/message-encryption-service.ts` của web:
//! - `messageKey = HKDF-SHA256(ikm = epoch_secret, salt = rỗng, info = "mls-msg:"+messageId, L=32)`
//! - `AES-256-GCM(messageKey, utf8(JSON.stringify({salt,nonce,plaintext})), iv=12B)` → ct + tag(16B)
//! - `body` gửi lên WS = `base64(JSON{epoch, messageId, iv:b64, ciphertext:b64, tag:b64})`
//!
//! ⚠️ WebCrypto `salt: new Uint8Array(0)` ⇔ Rust `Hkdf::new(None, ikm)`.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use zeroize::Zeroize;

use crate::{ChatMlsError, Result};

/// Nội dung rõ trước khi mã hoá. Thứ tự field PHẢI là salt → nonce → plaintext
/// để `serde_json` sinh chuỗi JSON trùng khít `JSON.stringify` của web.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlainContent {
    pub salt: String,
    pub nonce: String,
    pub plaintext: String,
}

/// Payload đã mã hoá (khớp `MessageLevelEncryptedPayload` của web). Các trường
/// nhị phân ở dạng base64.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedBody {
    pub epoch: u64,
    #[serde(rename = "messageId")]
    pub message_id: String,
    pub iv: String,
    pub ciphertext: String,
    pub tag: String,
}

/// `messageKey = HKDF-SHA256(salt rỗng, info = "mls-msg:"+id)` → 32 byte.
fn derive_message_key(epoch_secret: &[u8], message_id: &str) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, epoch_secret);
    let info = format!("mls-msg:{message_id}");
    let mut okm = [0u8; 32];
    hk.expand(info.as_bytes(), &mut okm)
        .expect("HKDF expand 32B không bao giờ fail");
    okm
}

/// Mã hoá với `messageId` + `iv` cho sẵn (deterministic — dùng cho test & khi cần
/// tái lập). Production nên dùng [`encrypt_new`].
pub fn encrypt(
    epoch_secret: &[u8],
    epoch: u64,
    message_id: &str,
    iv: &[u8],
    plain: &PlainContent,
) -> Result<EncryptedBody> {
    if iv.len() != 12 {
        return Err(ChatMlsError::Cipher(format!("IV phải 12 byte, nhận {}", iv.len())));
    }
    let plain_json = serde_json::to_string(plain)
        .map_err(|e| ChatMlsError::Encoding(e.to_string()))?;

    let mut key = derive_message_key(epoch_secret, message_id);
    let cipher = Aes256Gcm::new((&key).into());
    let sealed = cipher
        .encrypt(Nonce::from_slice(iv), Payload { msg: plain_json.as_bytes(), aad: &[] })
        .map_err(|e| ChatMlsError::Cipher(e.to_string()))?;
    key.zeroize();

    let (ct, tag) = sealed.split_at(sealed.len() - 16);
    Ok(EncryptedBody {
        epoch,
        message_id: message_id.to_string(),
        iv: B64.encode(iv),
        ciphertext: B64.encode(ct),
        tag: B64.encode(tag),
    })
}

/// Mã hoá tin mới: tự sinh `messageId` (UUID v4) + IV ngẫu nhiên 12 byte.
pub fn encrypt_new(epoch_secret: &[u8], epoch: u64, plain: &PlainContent) -> Result<EncryptedBody> {
    let message_id = uuid_v4();
    let mut iv = [0u8; 12];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut iv);
    encrypt(epoch_secret, epoch, &message_id, &iv, plain)
}

/// Giải mã một [`EncryptedBody`] về [`PlainContent`].
pub fn decrypt(epoch_secret: &[u8], body: &EncryptedBody) -> Result<PlainContent> {
    let iv = B64.decode(&body.iv).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
    let ct = B64.decode(&body.ciphertext).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
    let tag = B64.decode(&body.tag).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
    if iv.len() != 12 || tag.len() != 16 {
        return Err(ChatMlsError::Cipher("IV/tag sai kích thước".into()));
    }

    let mut combined = ct;
    combined.extend_from_slice(&tag);

    let mut key = derive_message_key(epoch_secret, &body.message_id);
    let cipher = Aes256Gcm::new((&key).into());
    let plain_bytes = cipher
        .decrypt(Nonce::from_slice(&iv), Payload { msg: &combined, aad: &[] })
        .map_err(|e| ChatMlsError::Cipher(e.to_string()))?;
    key.zeroize();

    let plain_json = String::from_utf8(plain_bytes)
        .map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
    serde_json::from_str(&plain_json).map_err(|e| ChatMlsError::Encoding(e.to_string()))
}

/// `base64(JSON(body))` — đúng thứ mà FE nhét vào `encryptedContent.body` gửi lên WS.
pub fn encode_body_b64(body: &EncryptedBody) -> Result<String> {
    let json = serde_json::to_vec(body).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
    Ok(B64.encode(json))
}

/// Ngược lại [`encode_body_b64`].
pub fn decode_body_b64(body_b64: &str) -> Result<EncryptedBody> {
    let json = B64.decode(body_b64).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
    serde_json::from_slice(&json).map_err(|e| ChatMlsError::Encoding(e.to_string()))
}

/// UUID v4 (khớp `crypto.randomUUID()` của web về format, không cần trùng giá trị).
fn uuid_v4() -> String {
    let mut b = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vector chuẩn ĐỌC TỪ TỆP, không chép tay — xem `crate::golden` để biết vì sao.
    use crate::golden::{chuoi, vectors};

    fn t2(duong: &[&str]) -> String {
        let v = vectors();
        let mut d = vec!["tier2_message"];
        d.extend_from_slice(duong);
        chuoi(&v, &d)
    }

    fn epoch_secret() -> Vec<u8> {
        hex::decode(t2(&["input", "epochSecret_hex"])).unwrap()
    }

    fn message_id() -> String {
        t2(&["input", "messageId"])
    }

    /// `plainContentJson` trong vector là ĐẦU VÀO đã được web tuần tự hoá. Đọc lại
    /// từ đó thay vì gõ tay `salt`/`plaintext`: gõ tay là đường để một ngày nào đó
    /// hai bên mã hoá hai nội dung khác nhau mà vẫn so ciphertext với nhau.
    fn plain() -> PlainContent {
        serde_json::from_str(&t2(&["input", "plainContentJson"]))
            .expect("plainContentJson trong vector không đọc được thành PlainContent")
    }

    #[test]
    fn message_key_matches_web() {
        let k = derive_message_key(&epoch_secret(), &message_id());
        assert_eq!(hex::encode(k), t2(&["expect", "messageKey_hex"]));
    }

    #[test]
    fn encrypt_matches_web_golden() {
        let iv = hex::decode(t2(&["input", "iv_hex"])).unwrap();
        let body = encrypt(&epoch_secret(), 3, &message_id(), &iv, &plain()).unwrap();
        assert_eq!(body.ciphertext, t2(&["expect", "ciphertext_b64"]), "ciphertext lệch web");
        assert_eq!(body.tag, t2(&["expect", "tag_b64"]), "tag lệch web");
    }

    #[test]
    fn roundtrip_encrypt_decrypt() {
        let es = epoch_secret();
        let body = encrypt_new(&es, 7, &plain()).unwrap();
        let got = decrypt(&es, &body).unwrap();
        assert_eq!(got.plaintext, plain().plaintext);
        assert_eq!(got.salt, plain().salt);
    }

    #[test]
    fn body_b64_roundtrip() {
        let iv = hex::decode(t2(&["input", "iv_hex"])).unwrap();
        let body = encrypt(&epoch_secret(), 3, &message_id(), &iv, &plain()).unwrap();
        let enc = encode_body_b64(&body).unwrap();
        let dec = decode_body_b64(&enc).unwrap();
        assert_eq!(dec.ciphertext, body.ciphertext);
        assert_eq!(dec.message_id, message_id());
    }
}
