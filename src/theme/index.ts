// theme/index.ts
//
// Selector/hook DUY NHẤT để component lấy token (YC-1).
// Component KHÔNG import màu thô từ bất cứ đâu — chỉ qua đây (hoặc qua các
// alias cũ COLORS/NEUTRAL/*_THEME re-export về đây để không vỡ import sẵn có).

import {
  APP_TOKENS,
  NEUTRAL_TOKENS,
  BRAND_TOKENS,
  NAV_TOKENS,
  ACTION_TOKENS,
  HEADER_TOKENS,
  AUTH_TOKENS,
  CHAT_SURFACE_TOKENS,
  AVATAR_TONE_TOKENS,
  withAlpha,
} from './tokens';
import type { ModuleTheme, BrandKey } from './tokens';
import { DEFAULT_THEME_CONFIG } from './theme.config';
import type { ThemeConfig } from './theme.config';

// ---------------------------------------------------------------------------
// Hợp nhất ThemeConfig (override per-instance) lên BASE_TOKENS.
// Merge nông theo từng lớp — đủ cho token phẳng; KHÔNG eval, chỉ trộn giá trị.
// ---------------------------------------------------------------------------
function resolveBrand(config: ThemeConfig) {
  const out = {} as Record<BrandKey, ModuleTheme>;
  (Object.keys(BRAND_TOKENS) as BrandKey[]).forEach((key) => {
    out[key] = { ...BRAND_TOKENS[key], ...(config.brand?.[key] ?? {}) };
  });
  return out;
}

function resolveTheme(config: ThemeConfig) {
  return {
    brandName: config.brandName ?? DEFAULT_THEME_CONFIG.brandName,
    app:     { ...APP_TOKENS, ...(config.app ?? {}) },
    neutral: { ...NEUTRAL_TOKENS, ...(config.neutral ?? {}) },
    nav:     { ...NAV_TOKENS, ...(config.nav ?? {}) },
    header:  { ...HEADER_TOKENS, ...(config.header ?? {}) },
    auth:    { ...AUTH_TOKENS, ...(config.auth ?? {}) },
    brand:   resolveBrand(config),
  };
}

export type ResolvedTheme = ReturnType<typeof resolveTheme>;

// Theme đang hoạt động. Hiện cố định = DEFAULT (visual parity tuyệt đối).
// White-label: đổi qua setActiveThemeConfig() trước khi render (vd đọc config
// instance lúc bootstrap). Không dùng React Context để tránh vỡ ~73 import
// stylesheet ở top-level module — token resolve một lần, ổn định toàn phiên.
const activeTheme: ResolvedTheme = resolveTheme(DEFAULT_THEME_CONFIG);

/**
 * Nạp theme của instance đang dựng.
 *
 * 🔴 GHI ĐÈ TẠI CHỖ, cố ý — KHÔNG gán `activeTheme = resolveTheme(config)`.
 *
 * Các alias bên dưới (`COLORS`, `NEUTRAL`, `NAV`, `*_THEME`, `HEADER_COLORS`)
 * là `const` trỏ tới CHÍNH các đối tượng nhánh của `activeTheme`, và 90 tệp
 * đọc token qua chúng ở top-level (`StyleSheet.create` chạy lúc import). Gán
 * lại `activeTheme` chỉ đổi biến trỏ: alias vẫn giữ đối tượng CŨ, nên override
 * per-instance tới được `getTheme()` (5 tệp) mà KHÔNG tới 90 tệp kia.
 *
 * Đo được trước khi sửa, bằng một bài kiểm tạm:
 *
 *     COLORS.bg trước = #ffffff | COLORS.bg sau = #ffffff | getTheme().app.bg = #FAF7F0
 *
 * Tức cơ chế white-label chạy đúng ở nhánh gần như không ai đi, và câm ở nhánh
 * gần như tất cả đều đi. Không màn nào đỏ, không bài kiểm nào đỏ — app thứ hai
 * chỉ đơn giản dựng ra mang màu app thứ nhất. `theme/instanceThemeReach.test.ts`
 * canh chỗ này.
 *
 * `Object.assign` với nguồn LUÔN đủ khoá (mỗi nhánh là spread của bộ token nền)
 * nên gọi lần hai với config khác sẽ trả các khoá không khai VỀ giá trị nền,
 * không tích luỹ vết của lần trước.
 */
export function setActiveThemeConfig(config: ThemeConfig): void {
  const next = resolveTheme(config);
  activeTheme.brandName = next.brandName;
  Object.assign(activeTheme.app, next.app);
  Object.assign(activeTheme.neutral, next.neutral);
  Object.assign(activeTheme.nav, next.nav);
  Object.assign(activeTheme.header, next.header);
  Object.assign(activeTheme.auth, next.auth);
  (Object.keys(next.brand) as BrandKey[]).forEach((key) => {
    Object.assign(activeTheme.brand[key], next.brand[key]);
  });
}

// Selector chính: lấy toàn bộ theme đã resolve.
export function getTheme(): ResolvedTheme {
  return activeTheme;
}

// Hook (cùng dữ liệu getTheme; tên hook cho component dùng theo quy ước React).
export function useTheme(): ResolvedTheme {
  return activeTheme;
}

// Lấy nhanh một nhánh token hay dùng.
export const getToken = {
  app:     (): ResolvedTheme['app'] => activeTheme.app,
  neutral: (): ResolvedTheme['neutral'] => activeTheme.neutral,
  nav:     (): ResolvedTheme['nav'] => activeTheme.nav,
  header:  (): ResolvedTheme['header'] => activeTheme.header,
  auth:    (): ResolvedTheme['auth'] => activeTheme.auth,
  brand:   (key: BrandKey): ModuleTheme => activeTheme.brand[key],
};

export { withAlpha };
export type { ModuleTheme, BrandKey, ThemeConfig };

// ---------------------------------------------------------------------------
// Alias tương thích ngược — các tên cũ trỏ về token mới (giữ giá trị y hệt).
// Mọi import sẵn có (COLORS/NEUTRAL/*_THEME) vẫn chạy, KHÔNG cần đổi đồng loạt.
// ---------------------------------------------------------------------------
export const COLORS = activeTheme.app;
export const NEUTRAL = activeTheme.neutral;
export const NAV = activeTheme.nav;
export const TRACE_THEME = activeTheme.brand.trace;
export const CHAT_THEME = activeTheme.brand.chat;
export const WORK_THEME = activeTheme.brand.work;
export const LAMPNET_THEME = activeTheme.brand.lampnet;

// Token phụ của module work (cam accent + nền nhạt) — giữ nguyên giá trị cũ.
export const WORK_ACCENT = '#E08C3A';
export const WORK_ACCENT_DEEP = '#B07026';
export const WORK_BG_SOFT = '#E9F4ED';

// Token menu hành động thích ứng (SG4) + Header toàn cục — export để
// navigation/index.tsx + AppHeader tiêu thụ THAY cho hex hardcode.
export const ACTION_COLORS = ACTION_TOKENS;
// Cửa vào (đăng ký/đăng nhập) — ĐI QUA activeTheme, cùng lý do với HEADER.
// `features/auth/theme.ts` chỉ còn là con trỏ tới đây.
export const AUTH_COLORS = activeTheme.auth;
// Header ĐI QUA activeTheme (khác ACTION): app thứ hai phải đổi được màu thanh
// trên, xem chú thích `header` ở `theme.config.ts`.
export const HEADER_COLORS = activeTheme.header;

// Bề mặt Fluent của module Trò chuyện + bảng màu ảnh đại diện. Giá trị thô sống
// ở tokens.ts (YC-1); `modules/chat/theme/fluent.ts` ghép chúng với brand `chat`.
export const CHAT_SURFACE = CHAT_SURFACE_TOKENS;
export const AVATAR_TONES = AVATAR_TONE_TOKENS;
