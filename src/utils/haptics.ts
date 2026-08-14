/**
 * haptics — RUNG BÁO, gọi kiểu không bao giờ làm sập màn.
 *
 * ── Vì sao phải bọc lại ─────────────────────────────────────────────────────
 * `Vibration.vibrate` ném lỗi thật, không im lặng bỏ qua:
 *
 *   · thiếu `android.permission.VIBRATE` trong manifest → `SecurityException`
 *     ("Requires VIBRATE permission") ném thẳng qua cầu và sập màn RN.
 *   · máy không có mô-tơ rung (máy bảng rẻ) → ném hoặc no-op tuỳ ROM.
 *   · vài ROM hãng cho phép người dùng tắt rung ở cấp hệ thống, và khi đó lệnh
 *     rung bị từ chối.
 *
 * Rung chỉ là lời báo THÊM — nó không mang thông tin nào mà màn hình chưa nói.
 * Nên hỏng rung phải là không có gì xảy ra, tuyệt đối không phải là mất cả màn.
 * Lỗi này đã xảy ra thật: người dùng đi tới nơi, kim đổi thành dấu tích, rồi màn
 * đỏ hiện ra đúng khoảnh khắc đáng lẽ là "đã tới".
 *
 * Quyền đã khai trong `AndroidManifest.xml`. Lớp bọc này là hàng rào thứ hai —
 * cho những máy và những ROM mà một dòng manifest không cứu được.
 */

import { Vibration } from 'react-native';

/**
 * Rung theo mẫu. `pattern` là số mili-giây, hoặc mảng xen kẽ [chờ, rung, chờ, …]
 * đúng như `Vibration.vibrate`.
 *
 * Không bao giờ ném. Trả `true` nếu lệnh rung đã gửi đi được — chỉ để bài kiểm
 * đọc, phía màn hình không cần quan tâm.
 */
export function buzz(pattern: number | number[]): boolean {
  try {
    Vibration.vibrate(pattern as any);
    return true;
  } catch {
    return false;
  }
}

/** Dừng rung. Cũng không bao giờ ném, cùng lý do. */
export function stopBuzz(): void {
  try {
    Vibration.cancel();
  } catch {
    /* không có gì để dừng */
  }
}
