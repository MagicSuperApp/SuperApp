// modules/work/hooks/mutationOutcome.ts
//
// Kết quả MỘT lượt gọi ghi — trả thẳng về chỗ gọi, KHÔNG bắt chỗ gọi đi đọc state.
//
// ── Vì sao cần hình dạng này ────────────────────────────────────────────────
// Các hook ghi của module đều nuôi một `errorCode` trong state để VẼ. Chỗ gọi
// viết `const res = await create(...)` rồi đọc `errorCode` sẽ đọc trúng bao đóng
// của lần dựng hình TRƯỚC — ở lượt bấm ĐẦU TIÊN mã đó còn là `null`, nên nhánh
// riêng cho `BACKEND_DISABLED` / `BAD_INPUT` / `ALREADY` không bao giờ chạy và
// người dùng luôn nhận câu chung chung. Lỗi này TẤT ĐỊNH, không phụ thuộc tốc độ
// mạng, nên nó đi qua mọi lần thử tay mà vẫn sai với người dùng thật.
//
// `usePostJob.ts` đã sửa theo lối này từ trước (`PostJobOutcome`); tệp này chỉ là
// hình dạng chung để bốn hook ghi còn lại dùng cùng một nếp.
//
// Quy ước: `ok === true` ⟺ `code === null`. `value` là thứ máy chủ trả về, `null`
// ở mọi lượt hỏng và ở lượt ghi không có giá trị trả về.

export interface MutationOutcome<T> {
  ok: boolean;
  /** Giá trị máy chủ trả về khi thành công. */
  value: T | null;
  /** Mã lỗi CỦA CHÍNH lượt này (`WorkApiError.code`, hoặc `BACKEND_DISABLED`). */
  code: string | null;
}

export const mutationOk = <T>(value: T | null): MutationOutcome<T> => ({
  ok: true,
  value,
  code: null,
});

export const mutationFailed = <T>(code: string): MutationOutcome<T> => ({
  ok: false,
  value: null,
  code,
});
