// Khoá điều khiển TAAD — dẫn xuất từ Master_KEK, và ký thông điệp bằng khoá đó.
//
// NGUỒN DUY NHẤT của công thức trong crate này. Mọi đường (genesis, rotate,
// lifecycle, mint, witness, cửa FFI cho mobile) đều đi qua hai hàm dưới đây;
// không nơi nào được viết lại HKDF hay đường dẫn CIP-1852 cho khoá điều khiển.
//
// Công thức — theo ĐẶC TẢ PhoenixKey-Anchorme-Tech, bước 2→5:
//
//   wallet_seed    = HKDF-SHA256(ikm  = Master_KEK,
//                                salt = SHA-256("genesis"),
//                                info = "wallet-seed-v1")          // 32 byte
//   root_xprv      = BIP32-Ed25519.from_bip39_entropy(wallet_seed, passphrase="")
//   payment_xprv   = root_xprv / 1852' / 1815' / 0' / 0 / 0        // CIP-1852
//   controller_key = payment_xprv.to_raw_key()                     // Ed25519 MỞ RỘNG
//   controller_pkh = Blake2b-224(controller_key.to_public())        // 28 byte
//
// Hai điều dễ đọc lướt qua, cả hai đều làm hỏng chữ ký nếu bỏ sót:
//
//  1. `wallet_seed` là ENTROPY BIP-39, KHÔNG phải hạt giống Ed25519 thô. Đưa
//     thẳng 32 byte đó vào `Ed25519.FromSeed` / `PrivateKey::from_normal_bytes`
//     cho ra một khoá KHÁC HẲN — vẫn ký được, vẫn ra 64 byte chữ ký hợp lệ, và
//     chỉ chết ở chuỗi dưới cái tên "chữ ký không khớp".
//  2. Khoá điều khiển là Ed25519 MỞ RỘNG (BIP32-Ed25519, 64 byte scalar+chaincode
//     qua `to_raw_key()`), không phải Ed25519 thường. Chữ ký vẫn là Ed25519 chuẩn
//     và kiểm lại được bằng thư viện Ed25519 bất kỳ, nhưng KHOÁ thì không đổi
//     qua lại được giữa hai loại.
//
// Cái gì neo công thức này: ĐẶC TẢ, không phải một tệp ở kho khác. Bản cũ của
// khối chú thích này khẳng định công thức phải khớp `enclave_bridge.dart::
// deriveTaadPublicKey` — neo vào một tệp mà kho này không dựng, không kiểm, và
// không thấy được lúc nó đổi. Bên nào (Dart, Kotlin, Swift, máy chủ) cũng đối
// chiếu với ĐẶC TẢ; vector nghiệm thu ở `tests::acceptance_vector_master_kek_all_01`
// là chỗ đối chiếu byte-for-byte giữa các bản hiện thực.

use cardano_serialization_lib as csl;
use cardano_serialization_lib::Bip32PrivateKey;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use crate::utils;

/// Nhãn `info` của HKDF — bước 2 của đặc tả.
const WALLET_SEED_INFO: &[u8] = b"wallet-seed-v1";
/// Tiền ảnh của `salt` HKDF: `salt = SHA-256("genesis")`.
const GENESIS_LABEL: &[u8] = b"genesis";

/// Bit hardened của BIP-32 (`i'` ≡ `i | 0x8000_0000`).
fn harden(i: u32) -> u32 {
    i | 0x8000_0000
}

/// Bước 2 — `wallet_seed` 32 byte từ Master_KEK.
///
/// Giá trị trả về là **entropy BIP-39**, không phải hạt giống Ed25519. Hầu hết
/// người gọi muốn [`derive_taad_controller_key`] chứ không phải hàm này; hàm này
/// để riêng chỉ vì vector nghiệm thu phải in ra được giá trị trung gian.
///
/// `None` khi Master_KEK không đúng 32 byte.
pub(crate) fn derive_taad_wallet_seed(master_kek: &[u8]) -> Option<Zeroizing<[u8; 32]>> {
    if master_kek.len() != 32 {
        return None;
    }
    let salt = Sha256::digest(GENESIS_LABEL); // 32 byte
    let hk = Hkdf::<Sha256>::new(Some(&salt), master_kek);
    let mut seed = Zeroizing::new([0u8; 32]);
    if hk.expand(WALLET_SEED_INFO, &mut *seed).is_err() {
        return None;
    }
    Some(seed)
}

/// Bước 3→4 — khoá điều khiển TAAD (Ed25519 MỞ RỘNG) từ Master_KEK.
///
/// `controller_pkh` mà validator đòi ở `must_be_signed_by` chính là
/// `derive_taad_controller_key(kek)?.to_public().hash()`.
///
/// `pub(crate)` để `taad_did.rs` / `registry_mint.rs` / `transfer.rs` /
/// `mint_lamp.rs` dựng được vkey witness mà KHÔNG chép lại công thức — một bản
/// chép thứ hai đã từng tồn tại (`taad_did::derive_taad_seed_from_kek`) và phải
/// nuôi một bài kiểm riêng chỉ để canh hai bản khỏi trôi khỏi nhau.
///
/// `None` khi Master_KEK không đúng 32 byte.
pub(crate) fn derive_taad_controller_key(master_kek: &[u8]) -> Option<csl::PrivateKey> {
    let wallet_seed = derive_taad_wallet_seed(master_kek)?;
    // `wallet_seed` = entropy BIP-39, passphrase rỗng (bước 2 của đặc tả).
    let root = Bip32PrivateKey::from_bip39_entropy(&*wallet_seed, &[]);
    // CIP-1852: m/1852'/1815'/0'/0/0 — account 0, role 0 (payment), index 0.
    let payment_xprv = root
        .derive(harden(1852))
        .derive(harden(1815))
        .derive(harden(0))
        .derive(0)
        .derive(0);
    Some(payment_xprv.to_raw_key())
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
    let controller_key = match derive_taad_controller_key(&master_kek) {
        Some(k) => k,
        None => return String::new(),
    };
    hex::encode(controller_key.sign(message).to_bytes())
}

/// Khoá CÔNG KHAI của khoá điều khiển TAAD (32 byte Ed25519), hex, từ Master_KEK.
///
/// Đây là giá trị mà `Blake2b-224` của nó ra `controller_pkh` trong datum — xem
/// khối chú thích đầu tệp cho công thức đầy đủ. Rỗng nếu Master_KEK không phải
/// 32 byte hex.
pub fn derive_taad_public_key(master_kek_hex: String) -> String {
    let master_kek = match utils::hex_to_bytes(&master_kek_hex) {
        Ok(b) => Zeroizing::new(b),
        Err(_) => return String::new(),
    };
    let controller_key = match derive_taad_controller_key(&master_kek) {
        Some(k) => k,
        None => return String::new(),
    };
    hex::encode(controller_key.to_public().as_bytes())
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

    /// Bước 2 của đặc tả, dựng lại HKDF bằng tay: `salt = SHA-256("genesis")`,
    /// `info = "wallet-seed-v1"`.
    ///
    /// Bài này KHÔNG chứng minh khoá điều khiển đúng — nó chỉ ghim đúng một mắt
    /// (HKDF). Mắt "entropy BIP-39 + CIP-1852" do
    /// `acceptance_vector_master_kek_all_01` và
    /// `new_formula_differs_from_the_retired_one` ghim.
    #[test]
    fn wallet_seed_matches_the_spec_hkdf_inputs() {
        let master_kek = [0x42u8; 32];
        let seed = derive_taad_wallet_seed(&master_kek).unwrap();

        let expected_salt = Sha256::digest(b"genesis");
        let hk = Hkdf::<Sha256>::new(Some(&expected_salt), &master_kek);
        let mut expected_seed = [0u8; 32];
        hk.expand(b"wallet-seed-v1", &mut expected_seed).unwrap();

        assert_eq!(*seed, expected_seed);
    }

    /// `wallet_seed` đi vào BIP-39 rồi CIP-1852 — KHÔNG đi thẳng vào Ed25519.
    ///
    /// Đột biến mà bài này bắt: ai đó "đơn giản hoá" `derive_taad_controller_key`
    /// thành `PrivateKey::from_normal_bytes(wallet_seed)`. Lúc đó mọi bài round-trip
    /// khác trong tệp này VẪN XANH (ký được, verify được, tất định) vì chúng chỉ
    /// đối chiếu mã với chính nó.
    #[test]
    fn controller_key_is_not_the_wallet_seed_used_as_a_raw_ed25519_key() {
        let master_kek = [0x42u8; 32];
        let wallet_seed = derive_taad_wallet_seed(&master_kek).unwrap();

        let spec_pub = derive_taad_controller_key(&master_kek)
            .unwrap()
            .to_public()
            .as_bytes();
        let raw_seed_pub = csl::PrivateKey::from_normal_bytes(&*wallet_seed)
            .unwrap()
            .to_public()
            .as_bytes();

        assert_ne!(
            spec_pub, raw_seed_pub,
            "wallet_seed là entropy BIP-39; dùng nó làm hạt giống Ed25519 thô \
             phải cho ra khoá KHÁC, không thì đường CIP-1852 đã bị bỏ qua",
        );
    }

    /// Công thức ĐÃ BỎ (`info = "taad-controller-v1"` + hạt giống Ed25519 thô) và
    /// công thức đặc tả phải cho hai `controller_pkh` KHÁC nhau.
    ///
    /// Vì sao viết bằng vector hằng gõ thẳng chứ không gọi lại hàm cũ: giữ hàm cũ
    /// trong mã chạy là giữ một đường dẫn xuất thứ hai còn gọi được — đúng thứ mà
    /// bản vá này đi xoá. Vector dưới đây do chính mã cũ sinh ra (đo một lần, trước
    /// khi xoá), nên nó là dữ liệu chứ không phải mã.
    ///
    ///   Master_KEK   = 01 × 32
    ///   seed(cũ)     = HKDF(salt = SHA-256("genesis"), info = "taad-controller-v1")
    ///   pkh(cũ)      = Blake2b-224(Ed25519.FromSeed(seed(cũ)).public)
    #[test]
    fn new_formula_differs_from_the_retired_one() {
        const RETIRED_CONTROLLER_PKH_HEX: &str =
            "a259236bf52c39341ff4b4802f88637fd4db21b801a3f78fa1e2944b";

        let kek = [0x01u8; 32];
        let now_pkh = hex::encode(
            derive_taad_controller_key(&kek)
                .unwrap()
                .to_public()
                .hash()
                .to_bytes(),
        );

        assert_ne!(
            now_pkh, RETIRED_CONTROLLER_PKH_HEX,
            "công thức đặc tả phải KHÁC công thức đã bỏ — trùng nghĩa là bản vá \
             chưa vào, hoặc vector đối chứng đã bị sửa cho khớp",
        );
    }

    /// VECTOR NGHIỆM THU — gửi cho đội khác đối chiếu byte-for-byte.
    ///
    /// Master_KEK = 32 byte `0x01`. In cả ba giá trị ra stdout; chạy
    /// `cargo test acceptance_vector -- --nocapture` để đọc.
    ///
    /// Hằng số dưới đây là số đo của chính mã này, ghim lại để một lần đổi công
    /// thức nữa sẽ làm bài đỏ chứ không trôi lặng lẽ.
    #[test]
    fn acceptance_vector_master_kek_all_01() {
        let kek = [0x01u8; 32];

        let wallet_seed = derive_taad_wallet_seed(&kek).unwrap();
        let controller_key = derive_taad_controller_key(&kek).unwrap();
        let payment_pubkey = controller_key.to_public();
        let controller_pkh = payment_pubkey.hash();

        let wallet_seed_hex = hex::encode(&*wallet_seed);
        let payment_pubkey_hex = hex::encode(payment_pubkey.as_bytes());
        let controller_pkh_hex = hex::encode(controller_pkh.to_bytes());

        println!("─── VECTOR NGHIỆM THU (Master_KEK = 01 × 32) ───");
        println!("master_kek     = {}", hex::encode(kek));
        println!("wallet_seed    = {wallet_seed_hex}");
        println!("payment_pubkey = {payment_pubkey_hex}");
        println!("controller_pkh = {controller_pkh_hex}");

        assert_eq!(wallet_seed_hex.len(), 64, "wallet_seed phải 32 byte");
        assert_eq!(payment_pubkey_hex.len(), 64, "payment_pubkey phải 32 byte");
        assert_eq!(controller_pkh_hex.len(), 56, "controller_pkh phải 28 byte");

        assert_eq!(wallet_seed_hex, WALLET_SEED_01);
        assert_eq!(payment_pubkey_hex, PAYMENT_PUBKEY_01);
        assert_eq!(controller_pkh_hex, CONTROLLER_PKH_01);
    }

    // Vector nghiệm thu, ghim. Đo từ mã đã build (xem
    // `acceptance_vector_master_kek_all_01`), KHÔNG tính tay.
    const WALLET_SEED_01: &str =
        "ac760ab38bf72f4008edc3b24726bad83d3ef412a48da6e6a440166a39e3964f";
    const PAYMENT_PUBKEY_01: &str =
        "b40825df304442f00bfc91f2459dcf717bae4a8cdce63e4daf0e4c54c77c9727";
    const CONTROLLER_PKH_01: &str = "3c8982e243bdd3da838432ffcf63c5621a6a900484af73fda78f413e";

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
