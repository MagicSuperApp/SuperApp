/**
 * MobileCore L1 — SQLite engine CONTRACT (interface only).
 *
 * NO native code lives here. Xem `MobileCore/CONVENTIONS.md` §1 —
 * L1 = interface only.
 *
 * ── GHI CHÚ HARVEST (đọc trước khi hiện thực) ────────────────────────────
 * Nguồn: `SuperApp@claude/orilife-farm-sync-enroll-gate` `src/utils/database.ts`.
 *   - `init(userKey)` (dòng 18) mở DB tên `OriLife-<safeKey>.db` với
 *     `safeKey = userKey.replace(/[^a-zA-Z0-9_-]/g, '_')` — tách DB
 *     VẬT LÝ theo user (không phải 1 DB dùng chung + filter user_id).
 *     `openForUser(didSlug)` dưới đây kế thừa đúng nguyên tắc này:
 *     `didSlug` PHẢI đã được sanitize ở tầng gọi hoặc engine tự sanitize
 *     — PHASE-3 quyết định nơi sanitize, ghi rõ khi hiện thực.
 *   - `SQLite.openDatabase(...)` (dòng 33) dùng
 *     `react-native-sqlite-storage` — cần khai vào `<module>/NEEDS.md`
 *     nếu PHASE-3 giữ lib này (CONVENTIONS §6, KHÔNG tự sửa package.json).
 *   - Bản harvest có `createTables()` (dòng 62) hardcode SCHEMA nghiệp vụ
 *     (farms/trees/fruits/activities/wallet/phoenix_key...). ĐÂY LÀ
 *     BUSINESS LOGIC CỦA PLATFORM, NGOÀI PHẠM VI MobileCore
 *     (MOBILE-CORE-STANDARD.md §0 "NGOÀI phạm vi: logic nghiệp vụ
 *     platform — lõi chỉ cung NĂNG LỰC"). `SqliteEngine` dưới đây vì
 *     vậy KHÔNG có method per-table (`saveFarm`, `getFarm`...) — chỉ
 *     `exec`/`query` tổng quát; platform tự định nghĩa schema/CRUD của
 *     mình qua `exec`/`query`. KHÔNG copy các bảng nghiệp vụ vào đây.
 * ──────────────────────────────────────────────────────────────────────
 */

/** Kết quả 1 lệnh `query` — hàng dữ liệu thô, chưa map sang domain type nào. */
export interface SqlQueryResult {
  rows: ReadonlyArray<Record<string, unknown>>;
  rowsAffected: number;
  /** `AUTOINCREMENT` id nếu câu lệnh gốc là INSERT, ngược lại undefined. */
  insertId?: number;
}

/**
 * Contract native cho SQLite per-user (1 file DB / user, mở theo
 * `didSlug`). KHÔNG chứa schema nghiệp vụ — platform tự tạo bảng qua
 * `exec`.
 */
export interface SqliteEngine {
  /**
   * Mở (hoặc tạo mới nếu chưa có) file DB gắn với `didSlug`. Nếu DB
   * đang mở cho user khác, engine PHẢI đóng DB cũ trước khi mở DB mới
   * (harvest: `init()` gọi `close()` khi `currentUserId !== userKey`).
   * Gọi lại với cùng `didSlug` đang mở là no-op.
   *
   * @param didSlug Định danh user đã sanitize an toàn cho tên file
   *   (per-user DB, KHÔNG dùng chung 1 DB filter theo user_id).
   * @needs-device-test Cần verify hành vi filesystem thật (đường dẫn
   *   sandbox app per-OS, quyền ghi) — không đại diện đầy đủ trên
   *   Jest/node mock.
   */
  openForUser(didSlug: string): Promise<void>;

  /**
   * Thực thi 1 câu lệnh SQL không cần đọc kết quả hàng (CREATE TABLE,
   * INSERT, UPDATE, DELETE...). Ném lỗi nếu chưa `openForUser` trước.
   *
   * @param sql Câu lệnh SQL, dùng placeholder `?` cho params.
   * @param params Giá trị bind theo thứ tự `?` trong `sql`.
   * @throws khi DB chưa mở (harvest pattern: "DB not initialized for
   *   user: ...") hoặc SQL lỗi.
   * @needs-device-test
   */
  exec(sql: string, params?: ReadonlyArray<unknown>): Promise<void>;

  /**
   * Thực thi 1 câu lệnh SELECT và trả về hàng kết quả thô.
   *
   * @param sql Câu lệnh SQL, dùng placeholder `?` cho params.
   * @param params Giá trị bind theo thứ tự `?` trong `sql`.
   * @throws khi DB chưa mở hoặc SQL lỗi.
   * @needs-device-test
   */
  query(sql: string, params?: ReadonlyArray<unknown>): Promise<SqlQueryResult>;

  /**
   * Đóng DB hiện tại (nếu có mở). No-op nếu chưa mở DB nào. Sau khi
   * đóng, `openForUser` phải được gọi lại trước khi `exec`/`query`.
   *
   * @needs-device-test
   */
  close(): Promise<void>;
}
