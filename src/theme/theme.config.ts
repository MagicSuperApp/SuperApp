// theme/theme.config.ts
//
// Cơ chế override theme PER-INSTANCE (white-label) — tuân INTEGRATION-STANDARD §2.2.
// ThemeConfig là DECLARATIVE THUẦN: chỉ chứa GIÁ TRỊ token (literal màu/chuỗi),
// KHÔNG logic, KHÔNG expression, KHÔNG eval, KHÔNG ref tới code (INV-SEC / QĐ-1).
//
// Mỗi instance (Aladin / TonFarm / app suy biến) khai một ThemeConfig riêng,
// override CHỈ những token muốn đổi. Phần không khai → rơi về BASE_TOKENS.
// KHÔNG được thêm token mới ở đây — chỉ ghi đè token đã có trong tokens.ts.

import type {
  AppTokens,
  NeutralTokens,
  NavTokens,
  HeaderTokens,
  AuthTokens,
  BrandKey,
} from './tokens';

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
  /**
   * Luồng ĐĂNG KÝ / ĐĂNG NHẬP — quãng người dùng gặp TRƯỚC mọi màn khác.
   *
   * Mở cho white-label vì cùng một lý do với `header`, chỉ nặng hơn: giá trị
   * mặc định là một dải LAM riêng của app đầu tiên, và nó phủ trọn bốn màn cửa
   * vào. App thứ hai ghi đè được `app.*` mà không ghi đè được đây thì người
   * dùng đi qua một cửa lam rồi bước vào một app lục.
   */
  auth?: Partial<Record<keyof AuthTokens, string>>;
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
// Hai bậc chữ phụ: bảng đầu chỉ có MỘT màu (`mutedFg #5F6B62`), nhà CheckFarm
// gửi bổ sung `#657168` cho bậc nhạt hơn — cùng hue, chỉ nhạt hơn 2,4 bậc sáng.
//
//     textSub    #5F6B62   trên #FAF7F0  5,21
//     textMuted  #657168   trên #FAF7F0  4,77   ← bậc thấp nhất còn qua AA
//     (#6A776D  4,39 · #6C7A6F  4,22 — đều TRƯỢT)
//
// 🔴 Kèm một ràng buộc BỐ CỤC, không phải ràng buộc màu: nền kem `#FAF7F0` sáng
// 96,1%, nên từ "vừa đủ qua chuẩn" tới "thoải mái" chỉ còn 2,4 bậc sáng. Hai
// bậc chữ phụ vì thế KHÔNG nhìn ra là hai bậc. Chỗ nào cần một bậc yếu hơn thấy
// rõ thì lấy CỠ CHỮ hoặc ĐỘ ĐẬM làm trục — đừng lấy màu, màu đã hết chỗ.
//
// Bậc mặc định cũ `#7A8C80` đo 3,33 trên nền này — dưới AA, nên không kế thừa.
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
    textMuted:   '#657168',

    inputBg:     '#EEF7F1',
    warning:     '#9C4A1C',
  },
  neutral: {
    bgWarm:     '#FAF7F0',
    border:     '#DCE3DC',
    borderSoft: '#EEF7F1',
    text:       '#1A1A1A',
    textSub:    '#5F6B62',
    textMuted:  '#657168',
    warning:    '#9C4A1C',
  },
  nav: {
    // Suy từ `brandLine #CBE4D5` với ĐÚNG độ đục của bản gốc (0,71) — bản gốc
    // là `rgba(156, 189, 222, 0.71)`, tức màu LAM.
    //
    // ⚠ Đo 2026-08-31: token `nav.*` hiện KHÔNG tệp nào tiêu thụ. Thanh dưới
    // thật lấy nền từ `COLORS.accentDeep` (`navigation/index.tsx:258`, vẽ bằng
    // `boxShadow` spread), tức một mảng ĐẶC — với CheckFarm là `#174F2A`, tương
    // phản 8,97 với nền trang. Nên lo ngại "viền quá nhạt không tách nổi thanh
    // khỏi nội dung" (WCAG 1.4.11) KHÔNG bị: ranh giới là mảng đặc, không phải
    // đường viền. Giá trị dưới đây giữ cho ĐÚNG, phòng ngày có ai nối dây.
    tabBarBorder: 'rgba(203, 228, 213, 0.71)',
  },
  header: {
    // `deep` trên nền đậm: chữ trắng trên `#174F2A` đo 9,60.
    bg: '#174F2A',
  },
  // ── Cửa vào (đăng ký / đăng nhập) ─────────────────────────────────────────
  //
  // KHÔNG có giá trị nào mới ở đây: mỗi dòng là một giá trị ĐÃ nằm trong chính
  // bảng trên, chỉ gán thêm một vai. Cố ý — bảng màu là thứ nhà CheckFarm chốt,
  // và bịa thêm một sắc xanh cho vừa mắt là thay họ ra quyết định nhãn hiệu.
  //
  // Vì sao phải khai: bản trước KHÔNG khai, nên bốn màn cửa vào lấy dải lam mặc
  // định — người tải CheckFarm về đi qua một cửa xanh LAM rồi bước vào một app
  // xanh LỤC. Số đo tương phản của từng cặp dưới đây nằm ở
  // `theme/authContrast.test.ts`, tính lại từ chính các giá trị này chứ không
  // chép sang.
  auth: {
    deep:      '#174F2A', // = header.bg / app.accentDeep
    primary:   '#23763F', // = app.accent — dùng làm CHỮ nên lấy bậc qua AA
    pale:      '#CBE4D5', // = app.accentLight
    glowSoft:  'rgba(203, 228, 213, 0.25)', // `#CBE4D5` ở ĐÚNG độ đục bản gốc
    bgSoft:    '#FAF7F0', // = app.bg
    border:    '#DCE3DC', // = app.border
    text:      '#1A1A1A',
    textSub:   '#5F6B62',
    textMuted: '#657168', // bậc thấp nhất còn qua AA trên nền kem
    // Khối cảnh báo giữ tông ẤM dùng chung (nó nói "coi chừng", không nói tên
    // app); chỉ dấu hiệu lấy màu cảnh báo của CheckFarm cho khớp phần còn lại.
    warnIcon:  '#9C4A1C',
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
