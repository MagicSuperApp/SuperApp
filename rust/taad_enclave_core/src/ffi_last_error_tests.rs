// ================================================================
// Bài kiểm: câu lỗi của lõi PHẢI ra được tới người gọi (Issue #285).
//
// Thứ đang được ghim KHÔNG phải "trả về khác null". Một ô lỗi luôn trả
// "có lỗi xảy ra" cũng qua được phép so đó, mà người nối cầu vẫn không biết
// gì hơn hôm qua. Nên mỗi bài dưới đây đối chiếu một MẢNH NGUYÊN VĂN chỉ có
// ở đúng một nguyên nhân — thay câu lỗi bằng câu chung chung là bài đỏ.
// ================================================================
#![cfg(test)]

use super::*;
use std::ffi::CString;

/// Đọc ô lỗi ra `String` rồi giải phóng đúng hợp đồng bộ nhớ.
fn read_last_error() -> Option<String> {
    let p = taad_last_error();
    if p.is_null() {
        return None;
    }
    let s = unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned();
    unsafe { taad_free_string(p) };
    Some(s)
}

fn c(s: &str) -> CString {
    CString::new(s).unwrap()
}

#[test]
fn error_slot_is_empty_when_nothing_failed() {
    taad_clear_last_error();
    assert_eq!(read_last_error(), None);
}

#[test]
fn recovery_gate_reason_reaches_the_caller_verbatim() {
    taad_clear_last_error();
    let utxo = c("{}");
    let pk = c("00");
    let hw = c("00");
    let guardians = c("[]");
    let seed = c("00");
    let script = c("00");
    let utxos = c("[]");
    let params = c("{}");

    let out = unsafe {
        taad_build_init_recovery_tx(
            utxo.as_ptr(),
            pk.as_ptr(),
            hw.as_ptr(),
            guardians.as_ptr(),
            5_000_000,
            100,
            seed.as_ptr(),
            0,
            script.as_ptr(),
            utxos.as_ptr(),
            params.as_ptr(),
            1,
        )
    };
    assert!(out.is_null(), "cửa chặn phải trả null");

    let err = read_last_error().expect("phải có câu lỗi, không được im lặng");
    // Ba mảnh này chỉ có ở ĐÚNG cửa chặn khôi phục. Một câu lỗi chung chung
    // ("build failed") trượt cả ba.
    assert!(
        err.contains("recovery builders disabled"),
        "câu lỗi thật: {err}"
    );
    assert!(err.contains("POSIX milliseconds"), "câu lỗi thật: {err}");
    assert!(err.contains("recovery_timelock_ms"), "câu lỗi thật: {err}");
}

#[test]
fn deactivate_gate_reason_reaches_the_caller_verbatim() {
    taad_clear_last_error();
    let utxo = c("{}");
    let kek = c("00");
    let seed = c("00");
    let script = c("00");
    let utxos = c("[]");
    let params = c("{}");

    let out = unsafe {
        taad_build_deactivate_taad_tx(
            utxo.as_ptr(),
            kek.as_ptr(),
            seed.as_ptr(),
            0,
            script.as_ptr(),
            utxos.as_ptr(),
            params.as_ptr(),
            1,
        )
    };
    assert!(out.is_null());
    let err = read_last_error().expect("phải có câu lỗi");
    assert!(
        err.contains("deactivate builder disabled"),
        "câu lỗi thật: {err}"
    );
    assert!(err.contains("revoked_ms"), "câu lỗi thật: {err}");
}

#[test]
fn null_argument_error_names_the_argument() {
    taad_clear_last_error();
    let out = unsafe { taad_master_kek_to_mnemonic(std::ptr::null()) };
    assert!(out.is_null());
    let err = read_last_error().expect("phải có câu lỗi");
    assert!(err.contains("kek_hex"), "câu lỗi phải nêu tên đối số: {err}");
    assert!(err.contains("invalid argument"), "{err}");
}

/// Hai cực phải PHÂN BIỆT được: đối số sai định dạng và cửa chặn có chủ ý
/// trước đây cùng ra một giá trị `null`. Nay phải ra hai câu khác nhau.
#[test]
fn two_different_causes_give_two_different_messages() {
    taad_clear_last_error();
    let bad_kek = c("khong-phai-hex");
    let out_a = unsafe { taad_master_kek_to_mnemonic(bad_kek.as_ptr()) };
    assert!(out_a.is_null());
    let a = read_last_error().expect("phải có câu lỗi");

    let utxo = c("{}");
    let pk = c("00");
    let hw = c("00");
    let guardians = c("[]");
    let seed = c("00");
    let script = c("00");
    let utxos = c("[]");
    let params = c("{}");
    let out_b = unsafe {
        taad_build_init_recovery_tx(
            utxo.as_ptr(),
            pk.as_ptr(),
            hw.as_ptr(),
            guardians.as_ptr(),
            5_000_000,
            100,
            seed.as_ptr(),
            0,
            script.as_ptr(),
            utxos.as_ptr(),
            params.as_ptr(),
            1,
        )
    };
    assert!(out_b.is_null());
    let b = read_last_error().expect("phải có câu lỗi");

    assert_ne!(a, b, "hai nguyên nhân khác nhau mà cùng một câu lỗi");
}

/// Lần gọi THÀNH CÔNG phải xoá ô lỗi — nếu không, bên gọi đọc được lý do
/// hỏng của một lần gọi ĐÃ qua rồi đi sửa nhầm chỗ.
#[test]
fn successful_call_clears_the_stale_error() {
    taad_clear_last_error();
    let out = unsafe { taad_master_kek_to_mnemonic(std::ptr::null()) };
    assert!(out.is_null());

    let kek = taad_generate_master_kek();
    assert!(!kek.is_null());
    unsafe { taad_free_string(kek) };

    assert_eq!(
        read_last_error(),
        None,
        "ô lỗi phải trống sau một lần gọi thành công"
    );
}

/// Ô lỗi đọc MỘT LẦN: đọc lần hai không được trả lại câu cũ.
#[test]
fn error_slot_is_read_once_then_empty() {
    taad_clear_last_error();
    let out = unsafe { taad_master_kek_to_mnemonic(std::ptr::null()) };
    assert!(out.is_null());
    assert!(read_last_error().is_some());
    assert_eq!(read_last_error(), None);
}

/// Hàm lõi báo hỏng bằng chuỗi RỖNG (không dùng `Result`) vẫn phải nêu được
/// TÊN HÀM hỏng, và phải nói thẳng là lõi không kèm lý do — không bịa lý do.
#[test]
fn empty_result_convention_still_names_the_failing_function() {
    taad_clear_last_error();
    let bad_kek = c("00");
    let out = unsafe { taad_master_kek_to_mnemonic(bad_kek.as_ptr()) };
    assert!(out.is_null());
    let err = read_last_error().expect("phải có câu lỗi");
    assert!(err.contains("taad_master_kek_to_mnemonic"), "{err}");
    assert!(err.contains("carries no message"), "{err}");
}

/// Hàm trả `bool` không tách được hai nghĩa ở giá trị, nên phải tách ở ô lỗi:
/// chữ ký SAI ⟹ ô lỗi trống; đối số hỏng ⟹ ô lỗi có câu.
#[test]
fn bool_verify_separates_wrong_signature_from_bad_argument() {
    // Cực 1 — chữ ký sai thật, đối số đọc được.
    taad_clear_last_error();
    let pk = c("04".to_owned().repeat(1).as_str());
    let msg = c("xin chao");
    let sig = c("3006020100020100");
    let ok = unsafe { taad_verify_p256_signature(pk.as_ptr(), msg.as_ptr(), sig.as_ptr()) };
    assert!(!ok, "chữ ký rác phải bị từ chối");
    assert_eq!(
        read_last_error(),
        None,
        "chữ ký sai là một PHÁN ĐOÁN, không phải một lần hỏng — ô lỗi phải trống"
    );

    // Cực 2 — đối số không đọc được.
    taad_clear_last_error();
    let ok2 = unsafe {
        taad_verify_p256_signature(std::ptr::null(), msg.as_ptr(), sig.as_ptr())
    };
    assert!(!ok2);
    let err = read_last_error().expect("đối số hỏng phải để lại câu lỗi");
    assert!(err.contains("pub_key_hex"), "{err}");
}

/// Câu lỗi KHÔNG được mang theo giá trị bí mật. `hex::decode` báo lỗi kèm ký
/// tự sai — với Master_KEK đó là một byte khoá đi ra ngoài.
#[test]
fn hex_error_never_copies_a_character_of_the_key() {
    taad_clear_last_error();
    let ct = c("00");
    let bad_kek = c("ZZ11223344556677889900aabbccddeeff00112233445566778899aabbccddee");
    let out = unsafe { taad_lampnet_recover_decrypt(ct.as_ptr(), bad_kek.as_ptr()) };
    assert!(out.is_null());
    let err = read_last_error().expect("phải có câu lỗi");
    assert!(err.contains("master_kek_hex"), "{err}");
    assert!(
        !err.contains('Z'),
        "câu lỗi không được chép ký tự của khoá vào: {err}"
    );
}
