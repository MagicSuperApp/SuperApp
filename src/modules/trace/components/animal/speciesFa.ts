// modules/trace/components/animal/speciesFa.ts
/**
 * Loài vật nuôi → biểu tượng của bộ Font Awesome Solid (`components/Icon`).
 *
 * ── Vì sao không dùng `speciesIcon` của `constants/animalSpecies` ────────────
 * Hàm đó trả tên của bộ MaterialCommunityIcons — bộ mà bốn màn vật nuôi cũ dùng,
 * nhưng module Truy xuất thì không. Tên lạ KHÔNG ném lỗi: `<Icon>` trả `null`,
 * để lại một ô trống trên màn và một dòng `console.warn` chỉ có ở bản DEV. Kiểu
 * hỏng ấy chỉ lộ ra khi có người mở đúng màn đó và tự hỏi sao mất hình.
 *
 * ── Vài loài dùng chung một hình, và đó là lựa chọn ─────────────────────────
 * Bộ FA Solid không có hình riêng cho lợn, dê, vịt. Nhãn chữ luôn đứng ngay
 * cạnh hình ở mọi chỗ dùng, nên dùng chung một hình trung tính là đọc được.
 *
 * ⛔ ĐỪNG lấy hình gần đúng của loài khác cho "đủ bộ": một con dê mang hình con
 *    bò sai hơn là mang hình bàn chân. Người dùng đọc hình trước khi đọc chữ.
 */

/** Khoá loài của MÁY CHỦ (`animal_config.py`) → tên icon fa6-solid. */
export const HINH_LOAI: Record<string, string> = {
  chicken: 'dove',
  duck: 'dove',
  cattle: 'cow',
  goat: 'paw',
  pig: 'paw',
  dog: 'dog',
};

/** Bí danh máy chủ tự quy đổi (`animal_server_ext.py`) — app hiểu để hiện đúng. */
const BI_DANH: Record<string, string> = { cow: 'cattle', buffalo: 'cattle' };

/** Icon cho một khoá loài. Khoá lạ → hình trung tính, không phải ô trống. */
export function hinhLoai(raw?: string | null): string {
  const k = (raw ?? '').trim().toLowerCase();
  const chuan = BI_DANH[k] ?? k;
  return HINH_LOAI[chuan] ?? 'paw';
}
