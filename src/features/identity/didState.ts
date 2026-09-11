/**
 * BA TRẠNG THÁI của một mã định danh — `GET /identity/{did}/active`.
 *
 * ══ Vì sao ba, không phải hai ═══════════════════════════════════════════════
 * `IdentityPointInTimeDtos.java` trả về ba ca phân biệt được (xem
 * `phoenixKey-api.ts` mục `identity.isActiveAt`):
 *
 *   neverExisted=true              mã này chưa từng đăng ký
 *   active=true                    còn ≥1 khoá hiệu lực
 *   active=false & !neverExisted   mọi khoá đã bị thu hồi, `revokedAt` = lần cuối
 *
 * Cửa đã khai trong app từ lâu và **không nơi nào gọi**. Trong lúc đó màn khôi
 * phục nói một câu gộp hai ca: *"Mã định danh vừa nhập không khớp cụm 24 từ, hoặc
 * không có trên máy chủ."* Ba việc rất khác nhau nằm dưới một câu ấy:
 *
 *   · gõ sai mã          → sửa vài ký tự là xong;
 *   · mã đã bị thu hồi   → cụm 24 từ trên máy này KHÔNG bao giờ mở lại được nó,
 *                          thử lại bao nhiêu lần cũng vậy;
 *   · mã còn sống        → lỗi nằm ở cụm 24 từ, không ở mã.
 *
 * Người rơi vào ca thứ hai đọc câu gộp sẽ gõ lại mã định danh — 80 ký tự — nhiều
 * lần, cho một việc không có cách nào thành công.
 *
 * ══ Phần THUẦN TÍNH tách riêng ═════════════════════════════════════════════
 * `readDidState` không chạm mạng để bài kiểm ghim được cả ba nhánh mà không phải
 * giả lập máy chủ. Nhánh đọc mạng ở dưới, và nó KHÔNG nuốt lỗi: hỏi không được thì
 * trả `null`, nơi gọi giữ nguyên câu cũ thay vì khẳng định một trạng thái nó chưa
 * đo được.
 */

import { phoenixKeyApi } from '../../services/phoenixKey-api';
import { tk } from '../../i18n/keys';

export type DidState = 'neverExisted' | 'revoked' | 'active';

/** Phản hồi của `identity.isActiveAt`, đúng ba trường máy chủ trả về. */
export interface DidActiveResponse {
  active: boolean;
  revokedAt: string | null;
  neverExisted: boolean;
}

/**
 * Đọc ba trường thành MỘT trạng thái.
 *
 * `neverExisted` xét TRƯỚC `active`: một mã chưa từng tồn tại cũng có `active:
 * false`, nên xét ngược thứ tự là gọi nó là "đã thu hồi" — đúng cái nhầm lẫn mà
 * cả tệp này sinh ra để gỡ.
 */
export function readDidState(r: DidActiveResponse): DidState {
  if (r.neverExisted) return 'neverExisted';
  return r.active ? 'active' : 'revoked';
}

/** Khoá chuỗi hiển thị cho từng trạng thái. Một bảng, không rải `if` ở màn hình. */
export function didStateMessageKey(s: DidState): string {
  switch (s) {
    case 'neverExisted': return 'identity.did.neverExisted';
    case 'revoked': return 'identity.did.revoked';
    case 'active': return 'identity.did.activeButNoMatch';
  }
}

/**
 * Hỏi máy chủ rồi trả về CÂU nói đúng trạng thái của mã định danh đó.
 *
 * `null` khi không hỏi được (mất sóng, máy chủ lỗi, mã không đúng khuôn) — nơi gọi
 * phải hiểu `null` là "CHƯA BIẾT", không phải "không sao". Cửa này CÔNG KHAI
 * (không cần Bearer) nên gọi được ngay cả khi chưa có phiên, đúng ca của màn khôi
 * phục.
 */
export async function describeDidState(did: string): Promise<string | null> {
  try {
    const res = await phoenixKeyApi.identity.isActiveAt(did);
    if (typeof res?.active !== 'boolean' || typeof res?.neverExisted !== 'boolean') {
      return null; // hình dạng lạ ⟹ không kết luận, đừng đoán một trạng thái.
    }
    return tk(didStateMessageKey(readDidState(res)));
  } catch {
    return null;
  }
}
