// modules/trace/utils/animalPhotoCache.ts
/**
 * Ảnh ĐẠI DIỆN của từng cá thể, giữ TRÊN MÁY.
 *
 * ── Vì sao phải tự giữ ──────────────────────────────────────────────────────
 * Máy chủ OriLife KHÔNG trả ảnh của một con vật. Cả bảy cửa của nhánh vật nuôi
 * — `identify` · `enroll` · `verify` · `list` · `{did}` · `rename` · `delete` —
 * chỉ trả `n_images`, tức SỐ ẢNH, không trả một đường dẫn ảnh nào. Nên app không
 * có cách nào tải về ảnh của một con đã đăng ký.
 *
 * Thứ app CÓ là ảnh người dùng vừa chụp lúc đăng ký, ngay trước khi gửi đi. Bảng
 * này giữ lại một tấm trong số đó theo mã cá thể, để sổ đàn còn có mặt con vật
 * mà bày ra thay vì sáu ô giống hệt nhau.
 *
 * ⚠ ĐÂY LÀ BẢN VÁ, KHÔNG PHẢI LỜI GIẢI. Nó chỉ phủ được những con đăng ký TRÊN
 *   CHÍNH MÁY NÀY: đổi điện thoại, cài lại app, hay xem sổ đàn của một vườn do
 *   người khác ghi thì bảng rỗng. Lời giải thật là máy chủ trả kèm một đường dẫn
 *   ảnh trong `/api/animal/list` — lúc đó bỏ hẳn tệp này đi.
 *
 * ⚠ Đường dẫn có thể CHẾT. Ảnh nằm trong vùng nhớ tạm của máy ảnh; Android dọn
 *   vùng đó khi máy thiếu chỗ, và người dùng cũng xoá được. Nên nơi dùng PHẢI
 *   xử ca ảnh không mở được (bắt `onError`) và rơi về ảnh loài — đừng tin rằng
 *   có khoá trong bảng thì có ảnh trên đĩa.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const KHOA_ANH_CA_THE = 'animal_photo_v1';

/**
 * Trần số mục. Bảng này chỉ để TRANG TRÍ danh sách, nên nó không đáng lớn vô
 * hạn trong bộ nhớ của máy. Quá trần thì bỏ mục CŨ NHẤT — con mới ghi là con
 * người dùng đang làm việc cùng.
 */
export const TRAN_MUC = 500;

type Bang = Record<string, string>;

/** Đọc cả bảng. Hỏng thì trả bảng RỖNG — mất ảnh trang trí, không mất dữ liệu. */
export async function docAnhCaThe(): Promise<Bang> {
  try {
    const raw = await AsyncStorage.getItem(KHOA_ANH_CA_THE);
    if (!raw) return {};
    const v = JSON.parse(raw);
    // Ghi hỏng dở chừng, hoặc một bản app cũ ghi kiểu khác: coi như chưa có.
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Bang) : {};
  } catch {
    return {};
  }
}

/**
 * Nhớ ảnh của một cá thể. Trả về ghi được hay không.
 *
 * Nơi gọi KHÔNG được chặn người dùng vì lượt ghi này hỏng: đăng ký đã xong trên
 * máy chủ rồi, và mất một tấm ảnh trang trí không làm hỏng con vật vừa ghi.
 */
export async function luuAnhCaThe(animalDid: string, uri: string): Promise<boolean> {
  if (!animalDid || !uri) return false;
  try {
    const bang = await docAnhCaThe();
    bang[animalDid] = uri;
    const khoa = Object.keys(bang);
    if (khoa.length > TRAN_MUC) {
      // `Object.keys` giữ thứ tự chèn cho khoá dạng chuỗi, nên mục đầu là mục cũ
      // nhất còn lại. Ghi đè một khoá đã có KHÔNG đẩy nó về cuối — chấp nhận
      // được: đây là bảng trang trí, không phải bộ nhớ đệm cần đúng LRU.
      for (const k of khoa.slice(0, khoa.length - TRAN_MUC)) delete bang[k];
    }
    await AsyncStorage.setItem(KHOA_ANH_CA_THE, JSON.stringify(bang));
    return true;
  } catch (e) {
    console.warn('[vật nuôi] Không nhớ được ảnh cá thể:', e);
    return false;
  }
}

/** Quên ảnh của một cá thể — gọi khi xoá con đó khỏi sổ. */
export async function quenAnhCaThe(animalDid: string): Promise<void> {
  try {
    const bang = await docAnhCaThe();
    if (!(animalDid in bang)) return;
    delete bang[animalDid];
    await AsyncStorage.setItem(KHOA_ANH_CA_THE, JSON.stringify(bang));
  } catch {
    // Quên hụt một mục chỉ để lại một đường dẫn chết — nơi dùng đã xử ca đó.
  }
}
