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

// Mã ngôn ngữ quốc gia được hỗ trợ = mã ngôn ngữ của app (src/i18n/types.ts).
// Mở rộng thị trường: thêm mã ở i18n rồi thêm nhãn `national` dưới đây.
import { getLanguage } from '../i18n/store';
import type { LangCode as AppLangCode } from '../i18n/types';

export type LangCode = AppLangCode;

export interface NavFrame {
  /** Nhãn tiếng Anh — CHUẨN, hiển thị ở MỌI ngôn ngữ (dòng trên). */
  en: string;
  /** Nhãn theo ngôn ngữ quốc gia (dòng dưới), khoá theo mã ngôn ngữ. */
  national: Partial<Record<LangCode, string>>;
  /** Tên icon Font Awesome Solid (bộ Icon dùng chung) — trạng thái nghỉ. */
  icon: string;
  /** Tên icon khi tab đang mở. FA Solid là 1 style → thường trùng `icon`; trạng thái phân biệt bằng màu. */
  iconActive: string;
}

// Khoá = route name (khớp instance.config.tabs + module.entrypoint).
export const NAV_FRAME: Record<string, NavFrame> = {
  Home:          { en: 'Home',    national: { vi: 'Trang chủ',  zh: '首页' }, icon: 'house',       iconActive: 'house' },
  ProofChatHome: { en: 'Chat',    national: { vi: 'Trò chuyện', zh: '聊天' }, icon: 'comments',    iconActive: 'comments' },
  Farms:         { en: 'Farm',    national: { vi: 'Trang trại', zh: '农场' }, icon: 'seedling',    iconActive: 'seedling' },
  WorkHome:      { en: 'Work',    national: { vi: 'Việc làm',   zh: '工作' }, icon: 'briefcase',   iconActive: 'briefcase' },
  JoinHome:      { en: 'Join',    national: { vi: 'Kết đèn',    zh: '连灯' }, icon: 'bolt',        iconActive: 'bolt' },
  // Account = "Me/Tôi" (anh Aladin chốt). Icon dự phòng; ô này ưu tiên vẽ AVATAR
  // user (ảnh hoặc initials) qua NavItemFrame — xem prop avatarUri/initials.
  Account:       { en: 'Me',      national: { vi: 'Tôi',        zh: '我' },  icon: 'circle-user', iconActive: 'circle-user' },
};

// Ngôn ngữ quốc gia hiện hành = ngôn ngữ app đang đặt (Cài đặt → Ngôn ngữ).
// Đây là SEAM DUY NHẤT — mọi nhãn nav đổi theo nó.
export function getNationalLanguage(): LangCode {
  return getLanguage();
}

/** Nhãn tiếng Anh (chuẩn) cho một route. Fallback = tên route. */
export function navEn(route: string): string {
  return NAV_FRAME[route]?.en ?? route;
}

/**
 * Nhãn ngôn ngữ quốc gia cho một route (fallback en → route).
 *
 * LUÔN trả nhãn THẬT, kể cả khi app đang là tiếng Anh — hàm này còn được dùng
 * làm nhãn DUY NHẤT ở nơi khác (vd `resolveGateItems`, tiêu đề tab). Việc bỏ
 * dòng thứ hai khi nó trùng dòng EN là quyết định TRÌNH BÀY của `NavItemFrame`,
 * không phải của hàm tra nhãn.
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
