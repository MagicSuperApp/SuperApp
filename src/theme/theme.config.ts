// theme/theme.config.ts
//
// Cơ chế override theme PER-INSTANCE (white-label) — tuân INTEGRATION-STANDARD §2.2.
// ThemeConfig là DECLARATIVE THUẦN: chỉ chứa GIÁ TRỊ token (literal màu/chuỗi),
// KHÔNG logic, KHÔNG expression, KHÔNG eval, KHÔNG ref tới code (INV-SEC / QĐ-1).
//
// Mỗi instance (Aladin / TonFarm / app suy biến) khai một ThemeConfig riêng,
// override CHỈ những token muốn đổi. Phần không khai → rơi về BASE_TOKENS.
// KHÔNG được thêm token mới ở đây — chỉ ghi đè token đã có trong tokens.ts.

import type { AppTokens, NeutralTokens, NavTokens, HeaderTokens, BrandKey } from './tokens';

// Partial vì instance chỉ override token cần đổi; còn lại kế thừa default.
export interface ThemeConfig {
  // Nhãn instance (chỉ để hiển thị/log, không ảnh hưởng render).
  brandName?: string;
  app?: Partial<Record<keyof AppTokens, string>>;
  neutral?: Partial<Record<keyof NeutralTokens, string>>;
  nav?: Partial<Record<keyof NavTokens, string>>;
  /**
   * Thanh trên toàn cục. Mở cho white-label vì giá trị mặc định của nó là màu
   * NHÃN HIỆU của app đầu tiên: `HEADER_TOKENS.bg = '#264E7E'`, kèm chú thích
   * ngay tại chỗ nói nó bằng `accentDeep` của app đó (`tokens.ts`). App thứ hai
   * ghi đè `app.accentDeep` mà không ghi đè được đây thì mọi màn xanh lục còn
   * thanh trên xanh lam — sai ở đúng chỗ người dùng nhìn đầu tiên.
   *
   * `action` CỐ Ý không mở: bốn màu nhóm hành động (quét/dinh dưỡng/sức
   * khoẻ/tạo) mang NGHĨA xuyên app, không phải nhãn hiệu riêng app nào.
   */
  header?: Partial<Record<keyof HeaderTokens, string>>;
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
// `brandName` ở đây chỉ là ĐƯỜNG LÙI. Nguồn tên thật là
// `InstanceConfig.displayName` (`config/instance.config.ts`) — mỗi instance tự
// mang `brandName` bằng tên app của nó. Giá trị `'OriLife'` dưới đây là tên NỀN
// nhận diện, không phải tên app nào; nó chỉ hiện ra nếu có ai dựng theme trần
// mà quên đi qua instance.
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

// ---------------------------------------------------------------------------
// CheckFarm — bảng màu do nhà CheckFarm chốt (thư `cf-sa-bangmau-3108`).
//
// Dựng từ màu nhãn `#298A4A` = HSL(140,4 · 54,2% · 35,1%): mọi sắc xanh giữ
// nguyên hue và bão hoà, CHỈ đổi độ sáng.
//
// 🔴 `#298A4A` KHÔNG dùng cho chữ cỡ thường. Đo lại bằng công thức tương phản
// WCAG 2.x, khớp số nhà CheckFarm gửi:
//
//     #298A4A trên #FFFFFF  4,35    trên #FAF7F0  4,06   ← TRƯỢT ngưỡng AA 4,5
//     #23763F trên #FFFFFF  5,62    trên #FAF7F0  5,26
//     #174F2A trên #FFFFFF  9,60    trên #FAF7F0  8,97
//
// Nên màu nhãn chỉ đi vào chỗ là HÌNH (khối, dấu kiểm, ngôi sao, chữ ≥24px
// đậm); chỗ là CHỮ thì lấy `#23763F`. Người dùng app này phần lớn đứng ngoài
// nắng cầm điện thoại rẻ. `theme/checkfarmContrast.test.ts` canh việc này bằng
// cách TÍNH lại tương phản từ chính các giá trị dưới đây.
//
// Một chỗ phải chệch khỏi bảng gửi sang: bảng chỉ có MỘT màu chữ phụ
// (`mutedFg #5F6B62`), trong khi token có hai bậc `textSub`/`textMuted`. Bậc
// `textMuted` mặc định `#7A8C80` đo được **3,33** trên nền `#FAF7F0` — dưới
// ngưỡng AA. Nên cả hai bậc cùng lấy `#5F6B62` (5,21) thay vì để một bậc kế
// thừa giá trị trượt chuẩn; nhà CheckFarm muốn tách hai bậc thì gửi thêm một
// mã, đây không phải chỗ tự nghĩ ra.
// ---------------------------------------------------------------------------
export const CHECKFARM_THEME_CONFIG: ThemeConfig = {
  brandName: 'CheckFarm',
  app: {
    bg:          '#FAF7F0',
    bgWarm:      '#FAF7F0',
    card:        '#FFFFFF',
    border:      '#DCE3DC',

    // accent = chỗ chữ/nút, nên lấy `primary` chứ KHÔNG lấy màu nhãn.
    accent:      '#23763F',
    accentDeep:  '#174F2A',
    accentLight: '#CBE4D5',
    accentGlow:  'rgba(41, 138, 74, 0.10)',
    borderFocus: '#23763F',

    text:        '#1A1A1A',
    textSub:     '#5F6B62',
    textMuted:   '#5F6B62',

    inputBg:     '#EEF7F1',
    warning:     '#9C4A1C',
  },
  neutral: {
    bgWarm:     '#FAF7F0',
    border:     '#DCE3DC',
    borderSoft: '#EEF7F1',
    text:       '#1A1A1A',
    textSub:    '#5F6B62',
    textMuted:  '#5F6B62',
    warning:    '#9C4A1C',
  },
  nav: {
    // Suy từ `brandLine #CBE4D5` với ĐÚNG độ đục của bản gốc (0,71) — bản gốc
    // là `rgba(156, 189, 222, 0.71)`, tức màu LAM. Để nguyên thì viền thanh
    // dưới của app xanh lục vẫn viền lam.
    tabBarBorder: 'rgba(203, 228, 213, 0.71)',
  },
  header: {
    // `deep` trên nền đậm: chữ trắng trên `#174F2A` đo 9,60.
    bg: '#174F2A',
  },
  brand: {
    // `trace` là module người dùng CheckFarm chạm nhiều nhất; kéo nó về hue của
    // nhãn thay vì để xanh lam-lục của nền chung.
    trace: {
      primary:      '#23763F',
      primaryDeep:  '#174F2A',
      primaryLight: '#CBE4D5',
      primaryGlow:  'rgba(41, 138, 74, 0.10)',
      gradient:     ['#298A4A', '#174F2A'] as const,
    },
  },
};
