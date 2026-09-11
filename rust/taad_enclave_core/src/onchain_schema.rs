//! onchain_schema — MỘT chỗ khai những lược đồ ON-CHAIN mà kho này neo vào.
//!
//! ── Vì sao có tệp này ───────────────────────────────────────────────────────
//! Kho này dựng giao dịch cho các validator nằm ở KHO KHÁC. Aiken giải datum
//! **theo arity**: sai số trường là giao dịch bị từ chối, và lỗi hiện ra ở tầng
//! chuỗi chứ không ở đây. Nghĩa là mỗi con số dưới đây là một lời hứa với một
//! tệp mà `cargo` không nhìn thấy, `tsc` không nhìn thấy, và không cổng nào
//! trong kho này mở ra đọc được.
//!
//! Trước tệp này, mỗi con số ấy được gõ TAY ở nhiều chỗ:
//!
//! | lược đồ               | guard chạy thật | assert trong test |
//! |-----------------------|-----------------|-------------------|
//! | `TAADDatum`           | 3               | 6                 |
//! | `RegistryDatum`       | 1               | —                 |
//! | `RegistryEntry`       | 1               | —                 |
//! | `Authority` (2 nhánh) | 2               | —                 |
//! | `SupplyState`         | 1               | 2                 |
//!
//! Mười sáu chỗ cho bốn con số. Ngày một con số đổi, lần sửa sau **chắc chắn**
//! sót một — và chỗ sót sẽ là một `assert` trong test, tức bài kiểm tiếp tục
//! xanh trong khi bên dựng đã lệch. Đó là hình dạng tệ nhất: sai mà có bằng
//! chứng "đúng".
//!
//! (Một trong sáu `assert` ấy còn ghim chuỗi lỗi `"4 field"` thay vì con số —
//! nên đổi arity xong thì ca đỏ vì SAI CHỮ, không phải vì sai arity. Ca đó nay
//! đọc hằng.)
//!
//! ── Tệp này KHÔNG làm gì ────────────────────────────────────────────────────
//! Nó **không** sửa con số nào, và **không** kết luận con số nào đúng. Nó chỉ
//! gom mười sáu chỗ về một chỗ, để ngày chốt được con số thật thì việc sửa là
//! một dòng chứ không phải một cuộc đi tìm.
//!
//! ⚠ Riêng `TAADDatum` đang có một câu hỏi CHƯA TRẢ LỜI — đọc
//! [`TAAD_DATUM_FIELDS`] trước khi đụng vào nó.

/// Neo của một lược đồ: nó ở kho nào, tệp nào, bản nào.
///
/// Ghi thành DỮ LIỆU chứ không thành chú thích vì chú thích không in ra được:
/// khi một guard arity nổ ngoài đồng, câu lỗi phải nói luôn nó đang đo theo bản
/// nào, nếu không thì người đọc log lại phải mở mã nguồn ra tra.
pub struct SchemaPin {
    /// Kho chứa validator. KHÔNG nằm trong kho này.
    pub repo: &'static str,
    /// Đường dẫn tệp khai lược đồ, kèm số dòng nếu biết.
    pub file: &'static str,
    /// Bản được nhắm tới: commit, hoặc hash của blueprint ĐÃ DEPLOY.
    /// "bản mới nhất" KHÔNG phải một câu trả lời — nó đổi sau lưng.
    pub reference: &'static str,
}

impl SchemaPin {
    /// Một dòng để nhét vào câu lỗi.
    pub fn describe(&self) -> String {
        format!("{}/{} @{}", self.repo, self.file, self.reference)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PhoenixKey — TAADDatum
// ═══════════════════════════════════════════════════════════════════════════

/// Bản validator mà bên dựng TAAD đang nhắm tới.
///
/// Neo vào **blueprint ĐÃ DEPLOY**, không neo vào HEAD của kho validator. Hai
/// thứ đó đã rời nhau: mã nguồn `types.ak` ở commit `564ad83` khai 15 trường
/// (thêm `limit_meter_policy` · `pending_meter_policy` · `pending_meter_ms` ·
/// `depth` · `device_pkh`), trong khi blueprint đang chạy trên preprod dùng
/// lược đồ 10 trường.
///
/// Nhầm hai thứ này là nhầm theo hướng nguy hiểm: "validator khai 15" đọc ra
/// thành "mọi giao dịch đều bị từ chối", trong khi thứ quyết định là **bản đang
/// chạy tại địa chỉ script mà giao dịch gửi tới**.
pub const TAAD_VALIDATOR: SchemaPin = SchemaPin {
    repo: "PhoenixKey-Validator",
    file: "deploy/plutus-preprod.json",
    reference: "blueprint 1d61d189… (preprod)",
};

/// Số trường của `TAADDatum` v2 — lược đồ bên dựng đang phát.
///
/// ⚠ ĐÂY LÀ CON SỐ ĐANG CÓ TRANH CHẤP, xem issue #291. Đừng đổi nó vì đọc được
/// một con số khác trong mã nguồn validator: mã nguồn đã đi trước bản deploy.
/// Điều kiện để đổi là **một bản blueprint cụ thể** (hash) được chốt là bản
/// nhắm tới — lúc đó sửa đúng dòng này, và chín chỗ đọc nó đi theo.
///
/// Thứ tự trường xem khối chú thích "TAAD Plutus Data encoding" ở `taad_did.rs`.
pub const TAAD_DATUM_FIELDS: usize = 10;

/// Lược đồ CŨ, trước khi `recovery_anchor` được nối vào cuối.
///
/// Vẫn phải nhận: một UTxO tạo trước ngày thêm trường đó vẫn nằm trên chuỗi và
/// vẫn phải xoay khoá được. Bộ mã hoá khi xoay sẽ nâng nó lên v2, điền `None`.
pub const TAAD_DATUM_FIELDS_LEGACY: usize = 9;

/// Cổng arity dùng CHUNG cho mọi chỗ giải `TAADDatum`.
///
/// Ba bộ giải (`decode_owner_datum` · `decode_taad_datum_for_rotate` ·
/// `decode_taad_datum_full`) trước đây mỗi chỗ tự viết một câu điều kiện và một
/// câu lỗi hơi khác nhau. Ba câu lỗi khác nhau cho cùng một lỗi là ba lần người
/// đọc log phải tự đoán xem chúng có cùng nghĩa không.
///
/// `nhan` là tên chỗ gọi, để câu lỗi nói rõ datum của AI hỏng ("owner" khác hẳn
/// "cái đang xoay").
pub fn check_taad_datum_arity(nhan: &str, n: usize) -> Result<(), String> {
    if n == TAAD_DATUM_FIELDS || n == TAAD_DATUM_FIELDS_LEGACY {
        return Ok(());
    }
    Err(format!(
        "{} TAADDatum phải có {} (v2) hoặc {} (legacy) trường, nhận {} — lược đồ nhắm tới: {}",
        nhan,
        TAAD_DATUM_FIELDS,
        TAAD_DATUM_FIELDS_LEGACY,
        n,
        TAAD_VALIDATOR.describe(),
    ))
}

// ═══════════════════════════════════════════════════════════════════════════
// LAMP Genesis — RegistryDatum · RegistryEntry · SupplyState
// ═══════════════════════════════════════════════════════════════════════════

/// Kho validator THỨ HAI mà kho này neo vào.
///
/// Có mặt ở đây vì cùng một cái bẫy: `registry_mint.rs` và `mint_lamp.rs` cũng
/// chép lược đồ của một tệp `.ak` không nằm trong kho này ("mirrors
/// registry.ak/types.ak schema byte-for-byte" — `mint_lamp.rs`), và cũng gõ tay
/// arity ở nhiều chỗ. Gom riêng TAAD mà bỏ chỗ này là vá một nửa cái bẫy rồi
/// tuyên bố đã xong.
///
/// ⚠ `reference` ở đây còn thiếu một bản cụ thể. Chưa điền được từ kho này —
/// KHÔNG bịa một hash cho đủ ô: một cái neo sai còn tệ hơn một ô trống, vì ô
/// trống thì còn ai đó đi hỏi.
pub const LAMP_GENESIS_VALIDATOR: SchemaPin = SchemaPin {
    repo: "LAMP/Genesis",
    file: "onchain/lib/magiclamp/genesis/types.ak",
    reference: "chưa chốt bản — xem issue #291",
};

/// `RegistryDatum` = Constr 0 [ governing_did: ByteArray, entries: List ].
pub const REGISTRY_DATUM_FIELDS: usize = 2;

/// `RegistryEntry` = Constr 0 [ key: ByteArray, authority: Authority ].
pub const REGISTRY_ENTRY_FIELDS: usize = 2;

/// `Authority::SinglePkh` = Constr 0 [ pkh: ByteArray ].
pub const AUTHORITY_SINGLE_PKH_FIELDS: usize = 1;

/// `Authority::MultiSig` = Constr 1 [ pkhs: List<ByteArray>, threshold: Int ].
pub const AUTHORITY_MULTISIG_FIELDS: usize = 2;

/// `SupplyState` (types.ak §9) = Constr 0 [ 4 trường Int ].
pub const SUPPLY_STATE_FIELDS: usize = 4;

/// Cổng arity dùng CHUNG cho mọi lược đồ phía LAMP Genesis.
///
/// Cùng hình dạng với [`check_taad_datum_arity`], và cùng lý do: năm chỗ giải
/// datum trước đây mỗi chỗ tự viết một câu lỗi, hai trong số đó còn không nói
/// nhận được bao nhiêu trường — tức đọc log xong vẫn phải mở mã ra tra.
pub fn check_lamp_arity(nhan: &str, n: usize, mong_doi: usize) -> Result<(), String> {
    if n == mong_doi {
        return Ok(());
    }
    Err(format!(
        "{} phải có {} trường, nhận {} — lược đồ nhắm tới: {}",
        nhan,
        mong_doi,
        n,
        LAMP_GENESIS_VALIDATOR.describe(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// CHỖ DUY NHẤT ghim các con số arity.
    ///
    /// Mọi nơi khác — guard lúc chạy lẫn assert trong test — phải đọc hằng, chứ
    /// không gõ lại số. Nếu ai đó đổi một hằng ở trên mà không có chủ ý, ca này
    /// đỏ ngay và câu lỗi chỉ thẳng vào issue #291.
    #[test]
    fn arity_duoc_ghim_o_dung_mot_cho() {
        assert_eq!(
            TAAD_DATUM_FIELDS, 10,
            "TAADDatum v2 đang là 10 trường. Đổi con số này cần một blueprint ĐÃ DEPLOY \
             được chốt là bản nhắm tới — xem issue #291, đừng đổi theo HEAD của kho validator."
        );
        assert_eq!(TAAD_DATUM_FIELDS_LEGACY, 9);
        assert_eq!(REGISTRY_DATUM_FIELDS, 2);
        assert_eq!(REGISTRY_ENTRY_FIELDS, 2);
        assert_eq!(AUTHORITY_SINGLE_PKH_FIELDS, 1);
        assert_eq!(AUTHORITY_MULTISIG_FIELDS, 2);
        assert_eq!(SUPPLY_STATE_FIELDS, 4);
    }

    /// Legacy phải NHỎ HƠN v2 đúng một trường, và cả hai phải khác nhau.
    ///
    /// Không phải chuyện hình thức: `recovery_anchor` được nối vào CUỐI để giữ
    /// nguyên thứ tự CBOR của chín trường cũ. Ngày ai đó đổi hai hằng này thành
    /// bằng nhau, hoặc lệch hai, thì phép "nâng legacy lên v2 bằng cách thêm
    /// một trường" ở bộ mã hoá xoay khoá thôi đúng — mà nó sẽ thôi đúng LẶNG LẼ.
    #[test]
    fn legacy_kem_v2_dung_mot_truong() {
        assert_eq!(TAAD_DATUM_FIELDS, TAAD_DATUM_FIELDS_LEGACY + 1);
    }

    #[test]
    fn cong_arity_nhan_ca_hai_luoc_do_va_tu_choi_phan_con_lai() {
        assert!(check_taad_datum_arity("test", TAAD_DATUM_FIELDS).is_ok());
        assert!(check_taad_datum_arity("test", TAAD_DATUM_FIELDS_LEGACY).is_ok());
        for n in [0usize, 8, 11, 15] {
            assert!(
                check_taad_datum_arity("test", n).is_err(),
                "arity {} phải bị từ chối",
                n
            );
        }
    }

    #[test]
    fn cong_lamp_do_dung_con_so_duoc_truyen_vao() {
        assert!(check_lamp_arity("SupplyState", SUPPLY_STATE_FIELDS, SUPPLY_STATE_FIELDS).is_ok());
        let e = check_lamp_arity("SupplyState", 3, SUPPLY_STATE_FIELDS).unwrap_err();
        assert!(e.contains("SupplyState"), "{}", e);
        assert!(e.contains("nhận 3"), "câu lỗi phải nói arity nhận được: {}", e);
        assert!(e.contains("LAMP/Genesis"), "câu lỗi phải nói bản nhắm tới: {}", e);
    }

    /// Câu lỗi phải NÓI RA bản đang nhắm tới.
    ///
    /// Đây là lý do `SchemaPin` là dữ liệu chứ không phải chú thích: khi guard
    /// nổ ngoài đồng, người đọc log biết ngay nó đang đo theo bản nào mà không
    /// phải mở mã nguồn.
    #[test]
    fn cau_loi_noi_ra_ban_dang_nham_toi() {
        let e = check_taad_datum_arity("owner", 15).unwrap_err();
        assert!(e.contains("owner"), "câu lỗi phải nói datum của ai: {}", e);
        assert!(e.contains("15"), "câu lỗi phải nói arity nhận được: {}", e);
        assert!(
            e.contains("PhoenixKey-Validator"),
            "câu lỗi phải nói bản nhắm tới: {}",
            e
        );
    }
}
