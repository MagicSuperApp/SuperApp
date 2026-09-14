// modules/trace/components/animal/speciesPhoto.ts
/**
 * Loài vật nuôi → ẢNH THẬT (PNG đã xoá nền).
 *
 * ⚠ NỢ KỸ THUẬT — `chicken.png` và `cattle.png` CÒN WATERMARK.
 *
 * Hai tệp đó là ảnh xem trước của kho ảnh Dreamstime: chữ chìm in đè lên thân
 * con vật, và nó HIỆN LÊN trong app ở ô chọn Gà và ô chọn Bò. Ảnh xem trước là
 * ảnh CHƯA MUA, nên để nguyên tới lúc phát hành là một rủi ro bản quyền, không
 * chỉ là một vết xấu trên màn hình. Chủ dự án đã biết và sẽ thay hai tệp này;
 * ai đọc tới đây trước lúc đó thì đừng coi chúng là xong.
 *
 * Bốn tệp còn lại (`pig` · `goat` · `duck` · `dog`) sạch.
 *
 * ── Vì sao bảng này tồn tại ─────────────────────────────────────────────────
 * Ô chọn loài là bước MỘT của cả luồng vật nuôi, và một tấm ảnh con vật đọc
 * nhanh hơn hẳn một biểu tượng — nhất là với người đọc chữ chậm.
 *
 * Lượt đi tìm ảnh tự động đã chạy và không ra: Wikimedia Commons (nguồn duy
 * nhất vừa khai giấy phép rõ ràng vừa tải được bằng máy) không có bộ ảnh chụp
 * xoá nền cho sáu loài này. Sáu tệp hiện tại là do chủ dự án tự tìm và đặt vào.
 *
 * ── Thiếu ảnh thì rơi về BIỂU TƯỢNG, không rơi về ô rỗng ────────────────────
 * `anhLoai` trả `null` cho loài chưa có tệp, và nơi dùng phải vẽ biểu tượng
 * (`speciesFa`) thay vì một ô xám. Ô rỗng đọc ra "app hỏng"; biểu tượng đọc ra
 * "đây là con gà". Giữ nhánh đó sống để bảng này thêm/bớt được mà không ai phải
 * sửa chỗ vẽ.
 *
 * ⚠ `require` của React Native phải là HẰNG VĂN BẢN — Metro đọc lúc đóng gói
 *   chứ không phải lúc chạy. Nên không dựng được đường dẫn động từ khoá loài, và
 *   `require` một tệp CHƯA CÓ thì hỏng CẢ bản dựng chứ không phải mất một ô ảnh.
 *   Thêm loài mới: bỏ tệp vào `assets/images/animals/` TRƯỚC, rồi mới thêm dòng.
 *   `AnimalWizard.gate.test.ts` đếm số `require` ở đây so với số tệp PNG thật
 *   trong thư mục, nên sai thứ tự hai việc đó là đỏ ở CI chứ không đỏ lúc đóng gói.
 */

import type { ImageSourcePropType } from 'react-native';

/**
 * Bảng ảnh. Tên tệp theo KHOÁ MÁY CHỦ (`animal_config.py`), không theo tiếng
 * Việt — cùng bộ khoá mà `speciesLabel` và `speciesFa` tra, nên ba bảng đó luôn
 * nói về cùng một con.
 */
export const ANH_LOAI: Record<string, ImageSourcePropType | null> = {
  // ⚠ còn watermark Dreamstime — xem đầu tệp.
  chicken: require('../../../../../assets/images/animals/chicken.png'),
  pig: require('../../../../../assets/images/animals/pig.png'),
  goat: require('../../../../../assets/images/animals/goat.png'),
  // ⚠ còn watermark Dreamstime — xem đầu tệp.
  cattle: require('../../../../../assets/images/animals/cattle.png'),
  duck: require('../../../../../assets/images/animals/duck.png'),
  dog: require('../../../../../assets/images/animals/dog.png'),
};

/** Bí danh máy chủ tự quy đổi — app hiểu để không rơi về ô trống oan. */
const BI_DANH: Record<string, string> = { cow: 'cattle', buffalo: 'cattle' };

/**
 * Ảnh của một loài, hoặc `null` khi loài đó chưa có tệp.
 *
 * Nơi dùng PHẢI xử `null` bằng cách vẽ biểu tượng — xem `speciesFa`. Đừng vẽ một
 * ô xám rỗng: ô rỗng đọc ra "app hỏng", còn biểu tượng đọc ra "đây là con gà".
 */
export function anhLoai(raw?: string | null): ImageSourcePropType | null {
  const k = (raw ?? '').trim().toLowerCase();
  return ANH_LOAI[BI_DANH[k] ?? k] ?? null;
}

/** Đã có ảnh cho mấy loài. Dùng cho bài kiểm và cho người dọn nốt phần còn lại. */
export function soLoaiCoAnh(): number {
  return Object.values(ANH_LOAI).filter(Boolean).length;
}
