//! Vector chuẩn của bản web — nguồn DUY NHẤT cho mọi test interop của crate này.
//!
//! ⛔ VÌ SAO TỆP NÀY TỒN TẠI: trước đây các giá trị mong đợi là hằng `const` chép
//! TAY vào `message_layer.rs` và `merkle.rs` hồi 07/2026. Chép tay thì nó ĐÓNG BĂNG
//! hành vi của bên web tại thời điểm chép: web đổi thư viện, đổi thuật toán, đổi
//! ciphersuite — test Rust vẫn xanh, vì nó đang so với bản ghi nhớ chứ không so với
//! bên kia. Hai hiện thực trôi xa nhau mà không có gì đỏ. Người dùng phát hiện ra
//! trước CI.
//!
//! Nay cả hai bên đọc CÙNG một tệp: `vectors/web-vectors.json`, do
//! `spikes/chat-mls-interop/node-harness/gen-vectors.mjs` sinh ra. Cổng chỉ khép
//! kín khi CÓ ĐỦ HAI NỬA:
//!   · nửa này  — test Rust đọc tệp đã commit (chính là tệp này làm);
//!   · nửa kia  — CI của ProofChat chạy lại `gen-vectors.mjs` và `diff` với đúng
//!                tệp đã commit đó.
//! Thiếu nửa kia thì tệp chỉ là hằng số ở chỗ khác: web trôi vẫn không ai biết.

use serde_json::Value;

const RAW: &str = include_str!("../vectors/web-vectors.json");

/// Bộ thư viện web đã sinh ra tệp vector này.
///
/// Khớp cứng chuỗi này là có chủ ý. Poseidon, HKDF và Ed25519 đều là chỗ mà một
/// bản vá nhỏ của thư viện đổi được giá trị đầu ra mà không đổi API — đổi ở web,
/// vector sinh lại khác, còn Rust thì không có cách nào biết trừ khi nó ĐỌC được
/// mình đang so với bản nào. Chuỗi lệch ⇒ tệp vector không còn là thứ crate này
/// từng đối chiếu ⇒ phải xem lại bằng mắt, không phải sửa chuỗi cho hết đỏ.
pub const XUAT_XU: &str =
    "ts-mls@1.5.1 / circomlibjs@0.1.7 / blakejs@1.2.1 / tweetnacl@1.0.3";

/// Ciphersuite MLS mà toàn bộ vector được sinh dưới nó.
pub const CIPHERSUITE: &str = "MLS_128_DHKEMP256_AES128GCM_SHA256_P256";

/// Đọc tệp vector, đồng thời chặn ngay nếu xuất xứ hoặc ciphersuite đã đổi.
pub fn vectors() -> Value {
    let v: Value = serde_json::from_str(RAW).expect("vectors/web-vectors.json không phải JSON hợp lệ");
    assert_eq!(
        v["generatedBy"].as_str().expect("thiếu trường generatedBy"),
        XUAT_XU,
        "bộ thư viện sinh vector đã đổi — mọi giá trị mong đợi dưới đây có thể không còn \
         là hành vi của bên web. Đối chiếu bằng mắt trước, đừng sửa hằng cho hết đỏ."
    );
    assert_eq!(
        v["ciphersuite"].as_str().expect("thiếu trường ciphersuite"),
        CIPHERSUITE,
        "ciphersuite của vector đã đổi — tầng 1 MLS không còn cùng bộ với crate này"
    );
    v
}

/// Lấy một chuỗi theo đường dẫn, và NỔ nếu không có.
///
/// `Value` trả `Null` cho khoá không tồn tại, nên `v["a"]["b"]` sai chính tả sẽ
/// lặng lẽ thành `Null` rồi so sánh với `Null` — hai bên cùng rỗng là "xanh".
/// Đó đúng là kiểu xanh giả mà tệp này sinh ra để chặn, nên mọi lượt lấy giá trị
/// đều phải đi qua đây.
pub fn chuoi(v: &Value, duong: &[&str]) -> String {
    let mut cur = v;
    for k in duong {
        cur = cur.get(*k).unwrap_or_else(|| {
            panic!("vector thiếu khoá `{}` (đường {:?})", k, duong)
        });
    }
    cur.as_str()
        .unwrap_or_else(|| panic!("khoá {:?} không phải chuỗi", duong))
        .to_string()
}

/// Như [`chuoi`] nhưng cho số nguyên — nhận CẢ số JSON lẫn chuỗi thập phân.
///
/// Nhận cả hai không phải cho dễ dãi: `gen-vectors.mjs` dùng `BigInt` cho mốc thời
/// gian, mà `JSON.stringify` NÉM LỖI trên `BigInt`, nên bên web buộc phải ghi nó
/// thành chuỗi (`"1700000000000"`). Một lần sinh lại bằng `Number` thường sẽ ra số
/// JSON thật. Hai hình dạng đó cùng nghĩa; ép một hình là biến một thay đổi vô hại
/// bên web thành lỗi đỏ bên này.
///
/// Cái KHÔNG nhận là chuỗi không phải số — chỗ đó vẫn nổ.
pub fn so(v: &Value, duong: &[&str]) -> i64 {
    let mut cur = v;
    for k in duong {
        cur = cur.get(*k).unwrap_or_else(|| {
            panic!("vector thiếu khoá `{}` (đường {:?})", k, duong)
        });
    }
    if let Some(n) = cur.as_i64() {
        return n;
    }
    cur.as_str()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| panic!("khoá {:?} không phải số nguyên (cũng không phải chuỗi thập phân)", duong))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tep_vector_doc_duoc_va_dung_xuat_xu() {
        let v = vectors();
        assert!(v.get("tier2_message").is_some(), "thiếu khối tier2_message");
        assert!(v.get("tier3_merkle").is_some(), "thiếu khối tier3_merkle");
    }

    #[test]
    #[should_panic(expected = "vector thiếu khoá")]
    fn khoa_sai_chinh_ta_thi_no_chu_khong_lang_le_thanh_rong() {
        let v = vectors();
        chuoi(&v, &["tier2_message", "expect", "ciphertext_b46"]);
    }
}
