// modules/chat/features/proof/types.ts
//
// Kết-quả kiểm-chứng một tin nhắn, rút về đúng thứ giao-diện cần biết.
//
// Bản trước mang cả `MessageProof` (hash · chữ ký · Merkle proof) và 14 `MessageStage`
// dùng để chạy một hoạt-cảnh "đường ống bằng-chứng" bằng setTimeout. Hoạt-cảnh đó là
// dàn-dựng, không phải trạng-thái thật của tin, nên đã gỡ cùng lượt gỡ dữ-liệu mẫu.
//
// Còn lại đúng hai thứ THẬT, đều lấy từ `proofchatService`:
//   · `MessageState` — đường đi của tin (đang gửi → đã tới → đã xem)
//   · `TrustState`   — tin có đúng người gửi, đúng nội dung hay không
//
// Chữ hiện ra màn hình lấy từ `TRUST_LABEL` bên dưới. Cố ý KHÔNG dùng "chữ ký số",
// "Merkle", "băm", "mã hoá đầu-cuối": người nhận việc trên Aladin cần biết tin này
// tin được hay không, không cần biết bằng cách nào.

/** Đường đi của một tin nhắn. */
export type MessageState =
  | 'sending' // đang rời máy
  | 'sent' // máy chủ đã nhận
  | 'delivered' // đã tới máy người kia
  | 'read' // người kia đã xem
  | 'failed' // không gửi được
  | 'locked'; // đã nhận nhưng máy này chưa mở được nội dung

/** Kết-quả kiểm-chứng nguồn gốc + nội dung. */
export type TrustState =
  | 'checking' // đang kiểm
  | 'ok' // đúng người gửi, nội dung nguyên vẹn
  | 'broken' // không khớp — đừng tin nội dung
  | 'unknown'; // chưa kiểm được (chưa mở được nội dung)

export const TRUST_LABEL: Record<TrustState, string> = {
  checking: 'Đang kiểm tra',
  ok: 'Đã kiểm tra',
  broken: 'Nội dung đã bị đổi',
  unknown: 'Chưa mở được',
};
