// theme/theme.config.ts
//
// Cơ chế override theme PER-INSTANCE (white-label) — tuân INTEGRATION-STANDARD §2.2.
// ThemeConfig là DECLARATIVE THUẦN: chỉ chứa GIÁ TRỊ token (literal màu/chuỗi),
// KHÔNG logic, KHÔNG expression, KHÔNG eval, KHÔNG ref tới code (INV-SEC / QĐ-1).
//
// Mỗi instance (Aladin / TonFarm / app suy biến) khai một ThemeConfig riêng,
// override CHỈ những token muốn đổi. Phần không khai → rơi về BASE_TOKENS.
// KHÔNG được thêm token mới ở đây — chỉ ghi đè token đã có trong tokens.ts.

import type { AppTokens, NeutralTokens, NavTokens, BrandKey } from './tokens';

// Partial vì instance chỉ override token cần đổi; còn lại kế thừa default.
export interface ThemeConfig {
  // Nhãn instance (chỉ để hiển thị/log, không ảnh hưởng render).
  brandName?: string;
  app?: Partial<Record<keyof AppTokens, string>>;
  neutral?: Partial<Record<keyof NeutralTokens, string>>;
  nav?: Partial<Record<keyof NavTokens, string>>;
  brand?: Partial<
    Record<
      BrandKey,
      Partial<{
        primary: string;
        primaryDeep: string;
        primaryLight: string;
        primaryGlow: string;
        onPrimary: string;
        gradient: readonly [string, string];
      }>
    >
  >;
}

// ---------------------------------------------------------------------------
// Default = giá trị app đang chạy (override rỗng → giữ nguyên BASE_TOKENS).
// Aladin/TonFarm sau này thay object này (hoặc nạp qua config instance) để
// white-label, KHÔNG cần sửa tokens.ts hay component.
// ---------------------------------------------------------------------------
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  brandName: 'OriLife',
};

// Ví dụ override white-label (để tham khảo, KHÔNG dùng làm default):
//
// export const ALADIN_THEME_CONFIG: ThemeConfig = {
//   brandName: 'Aladin',
//   app:   { accent: '#2B7A39', accentDeep: '#1F5C2A' },
//   brand: { work: { primary: '#2B7A39' } },
// };
