// utils/whenLabel.ts
//
// "hôm nay" / "hôm qua" / "N ngày trước" — nhãn thời gian TƯƠNG ĐỐI, thô theo NGÀY.
//
// Dùng ở chỗ phải nói cho người dùng biết một thứ để dở CŨ TỚI MỨC NÀO trước khi
// họ quyết định giữ hay bỏ nó. Không in giờ-phút: bản chụp dở sống qua đêm là
// chuyện thường (chụp buổi chiều ngoài vườn, mở lại sáng hôm sau), và mốc chính
// xác không giúp gì cho quyết định đó.
//
// So sánh theo ĐẦU NGÀY chứ không theo hiệu số mili-giây: 23h hôm qua tới 1h hôm
// nay chỉ cách 2 tiếng, nhưng với người dùng đó vẫn là "hôm qua".

import { tk } from '../i18n/keys';

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Nhãn ngày tương đối. `savedAt` rỗng → "hôm nay" (không có mốc thì đừng doạ
 * người dùng bằng một con số bịa).
 *
 * Mốc TƯƠNG LAI cũng rơi về "hôm nay": đồng hồ máy bị chỉnh lùi rồi chỉnh lại là
 * có thật, và in ra "-3 ngày trước" thì vô nghĩa hơn hẳn.
 */
export function whenLabel(savedAt?: number | null, now: number = Date.now()): string {
  if (!savedAt) return tk('trace.enroll.whenToday');
  const days = Math.floor((startOfDay(now) - startOfDay(savedAt)) / 86400000);
  if (days <= 0) return tk('trace.enroll.whenToday');
  if (days === 1) return tk('trace.enroll.whenYesterday');
  return tk('trace.enroll.whenDaysAgo', { n: days });
}
