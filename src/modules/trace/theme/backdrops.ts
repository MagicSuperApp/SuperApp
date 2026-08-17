/**
 * backdrops — CHỖ CẮM ẢNH NỀN của module Truy xuất.
 *
 * ── Bạn cần làm gì ──────────────────────────────────────────────────────────
 * Bỏ ảnh vào `assets/images/trace/`, rồi mở `BACKDROP_PHOTOS` bên dưới và thay
 * `null` bằng dòng `require(...)` đã viết sẵn ở ngay cạnh. KHÔNG phải sửa gì
 * thêm ở bất cứ màn nào — mọi màn đọc chung bảng này.
 *
 *   home    trang Tổng quan   — nên là ảnh tán lá / vườn nhìn từ xa
 *   list    danh sách vườn    — ảnh thoáng, ít chi tiết
 *   detail  chi tiết vườn/cây — ảnh gần: lá, vỏ cây, đất
 *
 * ── Khi chưa cắm ảnh ────────────────────────────────────────────────────────
 * Để `null` thì nền là **mảng XANH NHẠT vẽ sẵn** (xem `GroundBackdrop`). Không
 * có ô trống, không có khung vỡ — màn vẫn dùng được bình thường.
 *
 * ── Ảnh nên chọn thế nào ────────────────────────────────────────────────────
 * · Ảnh nền nằm DƯỚI chữ, nên phải **thoáng và nhạt**. Ảnh nhiều chi tiết đậm
 *   (tán lá rậm, nắng gắt) sẽ nuốt mất chữ đúng chỗ nó đậm nhất — người đọc
 *   ngoài nắng mất chữ ở đó. Màn hình tự phủ một lớp mờ màu kem lên ảnh, nhưng
 *   lớp đó chỉ cứu được ảnh vốn đã thoáng.
 * · Bề ngang ~1080 px là đủ; ảnh 4000 px chỉ làm nặng bản dựng chứ mắt không
 *   thấy khác, vì ảnh bị phủ mờ và cắt.
 * · `.jpg` cho ảnh chụp (nhẹ hơn `.png` nhiều lần ở cùng chất lượng).
 *
 * ── Muốn chỉnh độ mờ ────────────────────────────────────────────────────────
 * Sửa `PHOTO_OPACITY`. Càng nhỏ ảnh càng chìm, chữ càng dễ đọc.
 */

import type { ImageSourcePropType } from 'react-native';

export type BackdropVariant = 'home' | 'list' | 'detail';

/**
 * Ảnh nền theo từng loại màn. `null` = chưa có ảnh → dùng mảng xanh nhạt vẽ sẵn.
 *
 * Thay `null` bằng dòng `require` ghi trong chú thích ngay bên cạnh là xong.
 */
export const BACKDROP_PHOTOS: Record<BackdropVariant, ImageSourcePropType | null> = {
  // require('../../../../assets/images/trace/backdrop-home.jpg')
  home: require('../../../../assets/images/trace/backdrop-home.jpg'),
  // require('../../../../assets/images/trace/backdrop-list.jpg')
  list: require('../../../../assets/images/trace/backdrop-list.jpg'),
  // require('../../../../assets/images/trace/backdrop-detail.jpg')
  detail: null,
};

/**
 * Ảnh chìm tới mức nào. 0,18 là mức ảnh còn đọc ra được là cây cỏ mà chữ đen
 * trên nó vẫn đạt tương phản đọc-ngoài-nắng.
 */
export const PHOTO_OPACITY = 0.45;

/** Có ảnh cho loại màn này chưa. */
export const hasPhoto = (v: BackdropVariant): boolean => BACKDROP_PHOTOS[v] != null;
