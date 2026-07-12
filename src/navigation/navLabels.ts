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
// hành:  Learn: { en: 'Learn', national: { vi: 'Học hành' }, icon: 'school-outline',
// iconActive: 'school' }  — rồi khai route trong instance.config như các tab khác.
//
// TẦNG: đây là quyết định của INSTANCE (trải nghiệm), KHÔNG nhét vào
// module.manifest (manifest giữ TÊN SẢN PHẨM đầy đủ — vd proofchat.displayName =
// "ProofChat"; còn nhãn NAV ngắn gọn là "Chat"). Vì thế nhãn nav sống ở đây, tách
// khỏi displayName module (INTEGRATION-STANDARD §7.1 — experience layer).

// Mã ngôn ngữ quốc gia được hỗ trợ. Mở rộng khi thêm thị trường: | 'th' | 'km' ...
export type LangCode = 'vi';

export interface NavFrame {
  /** Nhãn tiếng Anh — CHUẨN, hiển thị ở MỌI ngôn ngữ (dòng trên). */
  en: string;
  /** Nhãn theo ngôn ngữ quốc gia (dòng dưới), khoá theo mã ngôn ngữ. */
  national: Partial<Record<LangCode, string>>;
  /** Icon Material Community — trạng thái nghỉ (outline). */
  icon: string;
  /** Icon khi tab đang mở (filled). */
  iconActive: string;
}

// Khoá = route name (khớp instance.config.tabs + module.entrypoint).
export const NAV_FRAME: Record<string, NavFrame> = {
  Home:          { en: 'Home',    national: { vi: 'Trang chủ' },  icon: 'home-outline',           iconActive: 'home' },
  ProofChatHome: { en: 'Chat',    national: { vi: 'Trò chuyện' }, icon: 'chat-processing-outline', iconActive: 'chat-processing' },
  Farms:         { en: 'Farm',    national: { vi: 'Trang trại' }, icon: 'sprout-outline',          iconActive: 'sprout' },
  WorkHome:      { en: 'Work',    national: { vi: 'Việc làm' },   icon: 'briefcase-outline',       iconActive: 'briefcase' },
  JoinHome:      { en: 'Join',    national: { vi: 'Kết đèn' },    icon: 'lightning-bolt-outline',  iconActive: 'lightning-bolt' },
  // Account = "Me/Tôi" (anh Aladin chốt). Icon dự phòng; ô này ưu tiên vẽ AVATAR
  // user (ảnh hoặc initials) qua NavItemFrame — xem prop avatarUri/initials.
  Account:       { en: 'Me',      national: { vi: 'Tôi' },       icon: 'account-circle-outline',  iconActive: 'account-circle' },
};

// Ngôn ngữ quốc gia hiện hành. App CHƯA có hệ i18n → mặc định 'vi' (thị trường
// đầu tiên). Đây là SEAM DUY NHẤT: khi thêm cài đặt ngôn ngữ, đọc setting tại đây,
// mọi nhãn nav tự đổi theo.
export function getNationalLanguage(): LangCode {
  return 'vi';
}

/** Nhãn tiếng Anh (chuẩn) cho một route. Fallback = tên route. */
export function navEn(route: string): string {
  return NAV_FRAME[route]?.en ?? route;
}

/** Nhãn ngôn ngữ quốc gia cho một route (fallback en → route). */
export function navNational(route: string, lang: LangCode = getNationalLanguage()): string {
  const f = NAV_FRAME[route];
  if (!f) return route;
  return f.national[lang] ?? f.en;
}

/** Icon cho một route (active = filled, ngược lại outline). */
export function navIcon(route: string, active = false): string {
  const f = NAV_FRAME[route];
  if (!f) return active ? 'view-dashboard' : 'view-dashboard-outline';
  return active ? f.iconActive : f.icon;
}
