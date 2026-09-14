/**
 * Dòng Wakeme trong popup LAMP của màn Tài khoản: một lượt hỏi két có BA kết cục,
 * không phải hai.
 *
 * Bản trước gộp "máy chủ nói người này chưa có két" với "không hỏi được máy chủ"
 * vào cùng một nhánh `catch`, rồi in `Chưa nhận`. Tức app khẳng định hộ máy chủ
 * một điều nó chưa từng nghe. Với người dùng, "chưa nhận" và "chưa hỏi được" dẫn
 * tới hai hành động khác hẳn: một bên đi nhận, một bên chờ mạng — và bên thứ nhất
 * là thứ đang được in ra cho cả hai.
 *
 * Hôm nay đường thật ném **501 vô điều kiện** (`ActivationVaultServiceImpl.java:158-159`),
 * nghĩa là ca "chưa hỏi được" là ca DUY NHẤT chạy được. Nên nó là ca đáng làm đúng.
 */

/** Trạng thái một lượt hỏi két. Tách ở đây để kiểm được mà không phải dựng cả màn. */
export type VaultRowState = 'idle' | 'loading' | 'ok' | 'closed' | 'unknown';

/**
 * Lỗi của lượt hỏi → trạng thái.
 *
 * Chỉ **404** mới là câu trả lời: máy chủ đọc được, và nói DID này không có két.
 * Mọi thứ khác — 501 (cửa chưa triển khai), 5xx, 401, mất mạng (`httpStatus = 0`)
 * — là chưa có câu trả lời nào. Không suy "không có" từ một lượt hỏi trượt.
 */
export function vaultStateFromError(err: unknown): 'closed' | 'unknown' {
  const status = (err as { httpStatus?: unknown } | null | undefined)?.httpStatus;
  return status === 404 ? 'closed' : 'unknown';
}

/** Chữ hiện trên dòng Wakeme khi CHƯA có số thật để in. */
export interface VaultRowText {
  /** Dòng phụ dưới tên. */
  sub: string;
  /** Ô bên phải, chỗ lẽ ra là con số. */
  value: string;
}

/**
 * Ô bên phải của ca `unknown` là **chữ**, không phải dấu `—`.
 *
 * Người dùng phổ thông đọc dấu gạch ngang ra thành *"con số 0 bị che"* — tức một
 * ký hiệu vẫn bị đọc thành con số, và số đó thì đọc ra thành "tôi vừa mất sạch".
 * Chữ "chưa rõ" không đọc nhầm được.
 *
 * Ca `closed` giữ dấu `—` vì ở đó dòng phụ đã nói rõ "Chưa nhận": không có số nào
 * để che, và câu đó là câu máy chủ thật sự đã trả lời.
 */
export function vaultRowText(state: VaultRowState): VaultRowText {
  switch (state) {
    case 'loading':
      return { sub: 'Đang hỏi máy chủ…', value: '…' };
    case 'closed':
      return { sub: 'Chưa nhận', value: '—' };
    default:
      // `idle` cũng vào đây, và đúng: chưa hỏi lần nào thì cũng là chưa biết.
      return { sub: 'Chưa hỏi được máy chủ', value: 'chưa rõ' };
  }
}
