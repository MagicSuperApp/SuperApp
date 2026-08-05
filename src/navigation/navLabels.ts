// navigation/navLabels.ts
//
// NAV FRAME — nguồn DUY NHẤT cho nhãn + icon thanh điều hướng (experience layer).
//
// Quy ước song ngữ (anh Aladin chốt): tiếng ANH là CHUẨN, hiển thị ở MỌI ngôn
// ngữ (dòng TRÊN); ngôn ngữ QUỐC GIA hiển thị bên DƯỚI, chỉ khi app đặt ngôn ngữ
// đó. Ví dụ: "Chat" luôn ở trên; "Trò chuyện" hiện dưới nếu app = tiếng Việt.
//
// FRAME CHUẨN — thêm một dịch vụ = CLONE 1 DÒNG trong NAV_FRAME (đặt en +
// national + icon). KHÔNG sửa navigator, KHÔNG sửa NavItemFrame. Ví dụ thêm Học
// hành:  Learn: { en: 'Learn', national: { vi: 'Học hành' }, icon: 'graduation-cap',
// iconActive: 'graduation-cap' }  — nhớ tải icon FA (`npm run icons -- graduation-cap`)
// rồi khai route trong instance.config như các tab khác.
//
// TẦNG: đây là quyết định của INSTANCE (trải nghiệm), KHÔNG nhét vào
// module.manifest (manifest giữ TÊN SẢN PHẨM đầy đủ — vd proofchat.displayName =
// "ProofChat"; còn nhãn NAV ngắn gọn là "Chat"). Vì thế nhãn nav sống ở đây, tách
// khỏi displayName module (INTEGRATION-STANDARD §7.1 — experience layer).

// Mã ngôn ngữ quốc gia: nay sống ở `src/i18n/languages.ts` (seam duy nhất — dò ngôn ngữ
// máy, nhớ lựa chọn, báo cho giao diện vẽ lại). Re-export để mọi nơi đang import từ đây
// không phải sửa; nơi viết mới thì import thẳng từ `src/i18n`.
export type { LangCode } from '../i18n/languages';
export { getNationalLanguage } from '../i18n/languages';

import type { LangCode } from '../i18n/languages';
import { getNationalLanguage } from '../i18n/languages';

export interface NavFrame {
  /** Nhãn tiếng Anh — CHUẨN, hiển thị ở MỌI ngôn ngữ (dòng trên). */
  en: string;
  /**
   * Nhãn theo ngôn ngữ quốc gia (dòng dưới), khoá theo mã ngôn ngữ.
   * `Record` ĐẦY ĐỦ, không phải `Partial`: thêm một ngôn ngữ vào `SUPPORTED_LANGS` là
   * `tsc` chỉ ra ngay mọi mục còn thiếu, thay vì lặng lẽ rơi về tiếng Anh trên máy
   * người dùng — thứ chỉ phát hiện được khi đã phát hành.
   */
  national: Record<LangCode, string>;
  /** Tên icon Font Awesome Solid (bộ Icon dùng chung) — trạng thái nghỉ. */
  icon: string;
  /** Tên icon khi tab đang mở. FA Solid là 1 style → thường trùng `icon`; trạng thái phân biệt bằng màu. */
  iconActive: string;
}

// Khoá = route name (khớp instance.config.tabs + module.entrypoint).
export const NAV_FRAME: Record<string, NavFrame> = {
  Home:          { en: 'Home', national: { vi: 'Trang chủ',  zh: '主页',   ja: 'ホーム' },     icon: 'house',       iconActive: 'house' },
  ProofChatHome: { en: 'Chat', national: { vi: 'Trò chuyện', zh: '聊天',   ja: 'チャット' },   icon: 'comments',    iconActive: 'comments' },
  Farms:         { en: 'Farm', national: { vi: 'Trang trại', zh: '农场',   ja: '農園' },       icon: 'seedling',    iconActive: 'seedling' },
  WorkHome:      { en: 'Work', national: { vi: 'Việc làm',   zh: '工作',   ja: '仕事' },       icon: 'briefcase',   iconActive: 'briefcase' },
  // "Kết đèn" là tên riêng của hệ, không dịch nghĩa đen sang zh/ja được — dùng chữ mô
  // tả VIỆC người dùng làm (góp sức máy), đúng tinh thần "người dùng không cần hiểu
  // tên module".
  JoinHome:      { en: 'Join', national: { vi: 'Kết đèn',    zh: '共享',   ja: '参加' },       icon: 'bolt',        iconActive: 'bolt' },
  // Account = "Me/Tôi" (anh Aladin chốt). Icon dự phòng; ô này ưu tiên vẽ AVATAR
  // user (ảnh hoặc initials) qua NavItemFrame — xem prop avatarUri/initials.
  Account:       { en: 'Me',   national: { vi: 'Tôi',        zh: '我的',   ja: 'マイページ' }, icon: 'circle-user', iconActive: 'circle-user' },
};

/** Nhãn tiếng Anh (chuẩn) cho một route. Fallback = tên route. */
export function navEn(route: string): string {
  return NAV_FRAME[route]?.en ?? route;
}

/**
 * Nhãn ngôn ngữ quốc gia cho một route (fallback en → route).
 *
 * ⚠ Gọi trong render thì màn PHẢI dùng `useNationalLanguage()` để đăng ký nghe đổi
 * ngôn ngữ — hàm này chỉ đọc giá trị hiện tại, React không tự biết nó đã đổi.
 */
export function navNational(route: string, lang: LangCode = getNationalLanguage()): string {
  const f = NAV_FRAME[route];
  if (!f) return route;
  return f.national[lang] ?? f.en;
}

/** Icon cho một route (active = filled, ngược lại outline). */
export function navIcon(route: string, active = false): string {
  const f = NAV_FRAME[route];
  if (!f) return 'table-cells-large';
  return active ? f.iconActive : f.icon;
}
