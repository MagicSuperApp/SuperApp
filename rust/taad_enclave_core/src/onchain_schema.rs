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
//! | lược đồ               | guard chạy thật | rẽ nhánh theo arity | assert trong test |
//! |-----------------------|-----------------|---------------------|-------------------|
//! | `TAADDatum`           | 3               | 2                   | 6                 |
//! | `RegistryDatum`       | 1               | —                   | 1                 |
//! | `RegistryEntry`       | 1               | —                   | 1                 |
//! | `Authority` (2 nhánh) | 2               | —                   | 2                 |
//! | `SupplyState`         | 1               | —                   | 5                 |
//!
//! **Hai mươi lăm** chỗ cho bốn con số. Ngày một con số đổi, lần sửa sau **chắc
//! chắn** sót một — và chỗ sót sẽ là một `assert` trong test, tức bài kiểm tiếp
//! tục xanh trong khi bên dựng đã lệch. Đó là hình dạng tệ nhất: sai mà có bằng
//! chứng "đúng".
//!
//! (Một trong các `assert` ấy còn ghim chuỗi lỗi `"4 field"` thay vì con số —
//! nên đổi arity xong thì ca đỏ vì SAI CHỮ, không phải vì sai arity. Ca đó nay
//! đọc hằng.)
//!
//! Cột **rẽ nhánh theo arity** là cột nguy nhất và là cột dễ bỏ sót nhất khi
//! đếm, vì nó không trông giống một phép kiểm: `if n == 10 { fields.get(9) }`
//! không TỪ CHỐI gì cả, nó chỉ chọn đọc hay không đọc một ô. Cổng arity ở trên
//! nhận datum, nhánh này trả "không có" — xem [`TAAD_RECOVERY_ANCHOR_INDEX`].
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

/// Bản validator mà bên dựng TAAD nhắm tới — **CHƯA CHỐT**.
///
/// Bản trước của hằng này neo vào `deploy/plutus-preprod.json @blueprint
/// 1d61d189… (preprod)` và nói đó là "bản ĐÃ DEPLOY". Đo lại trực tiếp trong kho
/// validator (2026-09-11) thì cả ba vế đều không đứng được:
///
/// * `deploy/plutus-preprod.json` **tự khai là đã cũ**: `"_stale": true`, kèm
///   `_stale_reason` nói `taad` CHƯA apply param và bản công bố trước đó "ĐÃ
///   CHẾT".
/// * Hash `taad` trong chính tệp ấy là `258cf1f4…`, **không phải** `1d61d189…`.
/// * `1d61d189…` xuất hiện đúng MỘT lần trong cả kho validator, ở
///   `docs/CBOR_SCHEMA_FOR_CORE.md`, và câu chứa nó nói UTxO ở hash đó là bản
///   **Design-1** và **KHÔNG thể spend** bởi validator hiện nay.
///
/// Tức cái neo cũ là một hash ĐÃ NGHỈ, được in ra trong mọi câu lỗi arity như
/// thể nó là bản đang chạy. Đúng cái mà [`LAMP_GENESIS_VALIDATOR`] bên dưới đã
/// cảnh báo: một cái neo sai tệ hơn một ô trống, vì ô trống thì còn có người đi
/// hỏi. Nay hạ xuống "chưa chốt", đúng mức đã đo được.
///
/// Thêm một phép đo cần biết trước khi ai đó điền lại ô này: blueprint **không
/// ghim arity nào cả** — `taad.spend` khai `datum: {"$ref": "…/Data"}`, tức
/// `Data` mờ. Số trường do mã Aiken ép lúc chạy, theo `types.ak` ở commit ĐƯỢC
/// BIÊN DỊCH ra bản đang chạy. Nên "chốt bản nhắm tới" phải là **một commit của
/// `types.ak` cộng hash script sinh ra từ chính commit đó**, không phải một hash
/// đứng một mình.
pub const TAAD_VALIDATOR: SchemaPin = SchemaPin {
    repo: "PhoenixKey-Validator",
    file: "lib/phoenixkey/types.ak + deploy/plutus-preprod.json",
    reference: "chưa chốt bản — xem issue #291 việc 1",
};

/// Số trường của `TAADDatum` v2 — lược đồ bên dựng đang phát.
///
/// ⚠ ĐÂY LÀ CON SỐ ĐANG CÓ TRANH CHẤP, xem issue #291. Nó mô tả **bên dựng**:
/// ba bộ mã hoá trong `taad_did.rs` phát đúng 10 ô. Nó KHÔNG phải một khẳng định
/// rằng validator nhận 10.
///
/// Đừng đổi nó chỉ vì đọc được một con số khác trong mã nguồn validator. Điều
/// kiện để đổi là [`TAAD_VALIDATOR`] được chốt thành một bản cụ thể — lúc đó sửa
/// đúng dòng này, và mọi chỗ đọc nó đi theo.
///
/// ── Đã đo được gì, tính đến 2026-09-11 ──────────────────────────────────────
/// `TAADDatum` ở HEAD kho validator (`lib/phoenixkey/types.ak`) có **16** trường
/// — không phải 15 như issue #291 ghi; `aux_device_pkhs` được nối thêm sau khi
/// issue được viết. Mười ô ĐẦU khớp **đúng thứ tự** với bên dựng:
///
/// ```text
///   0 did · 1 entity_type · 2 controller_pkh · 3 hw_key_pubkey · 4 sequence
///   5 status · 6 guardians · 7 parent_did · 8 revoked_ms · 9 recovery_anchor
/// ```
///
/// Sáu ô sau (`limit_meter_policy` · `pending_meter_policy` · `pending_meter_ms`
/// · `depth` · `device_pkh` · `aux_device_pkhs`) là phần bên dựng chưa có.
///
/// Nên chỗ lệch là **số lượng**, không phải **thứ tự** — và đó là tin tốt: nối
/// thêm ô vào cuối thì chín ô đầu giữ nguyên vị trí CBOR. Nhưng ô số 8 thì phải
/// đọc kỹ: validator gọi nó là `revoked_ms` (POSIX mili-giây) còn bên dựng ghi
/// SỐ SLOT vào đó. Cùng kiểu `Int`, cùng dương ⇒ không phép kiểm kiểu nào bắt
/// được. Đường GHI ô đó đang bị chặn fail-closed ở
/// `taad_did::deactivate_builder_gate`.
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

/// Vị trí của `recovery_anchor` — trường DUY NHẤT mà v2 nối thêm vào cuối lược
/// đồ cũ. Đánh số từ 0 nên chỉ số của nó BẰNG số trường của bản legacy.
///
/// Phải là một hằng chứ không phải số `9` gõ tay, vì hai bộ giải đều rẽ nhánh
/// theo nó và cả hai rẽ nhánh ấy hỏng LẶNG LẼ: chúng đọc arity để quyết định
/// "datum này có ô anchor không". Gõ tay `if n == 10 { fields.get(9) }` thì ngày
/// [`TAAD_DATUM_FIELDS`] lên 11, cổng arity ở trên vẫn NHẬN datum 11 trường,
/// còn câu điều kiện thành sai ⇒ anchor bị đọc thành "không có". Bộ mã hoá xoay
/// khoá liền sau đó ghi `None` đè lên — tức MẤT neo phân tán khoá trên chuỗi,
/// không một dòng lỗi nào.
///
/// Quan hệ "v2 = legacy + 1" mà biểu thức này dựa vào được
/// `legacy_kem_v2_dung_mot_truong` ghim: ngày ai đó nối thêm một trường NỮA mà
/// không nghĩ lại chỗ này, ca đó đỏ trước.
pub const TAAD_RECOVERY_ANCHOR_INDEX: usize = TAAD_DATUM_FIELDS_LEGACY;

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
            "Bên dựng đang phát 10 trường. Đổi con số này cần `TAAD_VALIDATOR` được chốt \
             trước (một commit của types.ak + hash script sinh ra từ chính commit đó) — \
             xem issue #291 việc 1. Đừng đổi chỉ vì đọc được 16 ở HEAD kho validator."
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
        // Tiền đề mà HAI bộ giải dựa vào để đọc `recovery_anchor`: nó là ô CUỐI
        // của v2. Ghim riêng ra vì nếu ngày nào đó có trường thứ hai được nối
        // thêm, quan hệ "legacy + 1" ở trên vẫn đúng cho một bước nhưng chỉ số
        // này thì thôi đúng, và nó thôi đúng bằng cách trả về sai ô chứ không
        // bằng một lỗi.
        assert_eq!(
            TAAD_RECOVERY_ANCHOR_INDEX,
            TAAD_DATUM_FIELDS - 1,
            "recovery_anchor phải là ô cuối của v2 — hai bộ giải đọc nó bằng chỉ số này"
        );
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
