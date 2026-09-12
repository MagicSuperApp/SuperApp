//! chat_mls — lõi E2EE cho ProofChat mobile.
//!
//! Ba tầng port từ giao thức web (ts-mls). ⛔ 12/09/2026: tầng 2 KHÔNG còn khớp —
//! web đã sang application message RFC 9420, chỗ này vẫn HKDF cũ. Lý do + số đo ở
//! `../README.md`; `spikes/chat-mls-interop/PHA0-FINDINGS.md` là bản khảo sát ĐÃ CŨ
//! và đang xanh giả, đừng lập kế hoạch dựa trên nó.
//! - [`message_layer`] — tầng 2: HKDF-SHA256(epoch_secret) → AES-256-GCM.
//! - [`merkle`]        — tầng 3: Poseidon BN254 + Ed25519 session signature.
//! - tầng 1 (MLS RFC 9420 qua OpenMLS fork) thêm ở module `mls` (pha kế tiếp).
//!
//! Mọi giá trị dây (wire) đi ra/vào dưới dạng base64/hex để bắc cầu RN dễ dàng.

#[cfg(test)]
pub mod golden;

pub mod merkle;
pub mod message_layer;
pub mod mls;

// C-ABI FFI (iOS gọi trực tiếp; Android qua JNI shim).
mod ffi;

// Android JNI shim — chỉ build cho target Android. iOS dùng C-ABI trực tiếp.
#[cfg(target_os = "android")]
mod android_jni;

/// Lỗi thống nhất của lõi chat.
#[derive(Debug, thiserror::Error)]
pub enum ChatMlsError {
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("mã hoá/giải mã thất bại: {0}")]
    Cipher(String),
    #[error("dữ liệu vào sai định dạng: {0}")]
    Encoding(String),
    #[error("merkle: {0}")]
    Merkle(String),
}

pub type Result<T> = std::result::Result<T, ChatMlsError>;
