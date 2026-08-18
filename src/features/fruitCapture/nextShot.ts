/**
 * nextShot — sau khi lưu xong MỘT góc, có nên mời chụp tiếp không, và mời bằng câu gì.
 *
 * ── Bệnh đang chữa ──────────────────────────────────────────────────────────
 * Máy chủ đòi 3 mặt × 3 tấm = **9 tấm** cho một quả mới coi là đủ
 * (`fruit_reid.py:321` MIN_VIEWS_PER_TYPE=3 · `server.py:5825` FACE_ORDER_VI có 3
 * mặt). Còn `FruitCropperScreen.runAddView` lưu xong một tấm là `navigation.goBack()`.
 * Tức mỗi tấm trong 9 tấm đó bắt người dùng đi trọn một vòng: về màn quét → mở máy
 * ảnh → bấm chụp → chọn ảnh → chờ dò → chọn đúng quả trong danh sách ứng viên →
 * khoanh → gửi. Chín lần như thế cho MỘT quả.
 *
 * Máy chủ đã nói sẵn còn thiếu mặt nào và thiếu mấy tấm — `/api/capture/plan` trả
 * `next.text_vi` là một câu tiếng Việt hoàn chỉnh. Trước bản này app chỉ hiện câu
 * đó ở TRÊN nút, rồi vẫn thoát ra ngay sau khi gửi. Hàm này biến câu đó thành lời
 * mời chụp tấm kế tiếp, giữ nguyên quả và mặt đang chụp.
 *
 * ── Vì sao là hàm thuần, tách khỏi màn ──────────────────────────────────────
 * Chỉ có ba nhánh, nhưng cả ba đều sai kiểu IM LẶNG nếu lẫn: chưa có kế hoạch mà
 * mời chụp tiếp thì mời vu vơ; đã đủ mà vẫn mời thì bắt chụp thừa; thiếu mà thoát
 * thì bỏ dở. Khoá bằng bảng số rẻ hơn nhiều so với đi thử ngoài vườn.
 */

import { captureHint, type CapturePlan } from '../../services/capturePlanService';

export interface NextShotAsk {
  /** Câu của MÁY CHỦ (`next.text_vi`) — hiện thẳng, đừng viết lại. */
  message: string;
  /** Chữ trên nút đồng ý. */
  yesLabel: string;
}

/**
 * `null` = ĐỪNG mời, cứ thoát như cũ. Hai ca:
 *   - chưa có kế hoạch (chưa gọi được `/api/capture/plan`, hoặc gọi hỏng) → không
 *     biết còn thiếu gì thì không được bịa ra một lời mời nghe như của máy chủ;
 *   - `action: 'done'` → máy chủ nói đủ rồi.
 */
export function nextShotAsk(plan: CapturePlan | null | undefined): NextShotAsk | null {
  // Cùng một phép đọc kế hoạch với dòng hướng dẫn của đường CÂY (`captureHint`).
  // Tách đôi ra hai chỗ thì hai đường sẽ trôi khác nhau đúng vào những ca hiếm —
  // `wait`, `need_light` — mà không ai chạy tay để thấy.
  const message = captureHint(plan);
  if (!message) return null;
  return { message, yesLabel: 'Chụp tiếp' };
}
