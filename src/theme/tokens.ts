// theme/tokens.ts
//
// NGUỒN TOKEN DUY NHẤT của ecosystem (YC-1 consolidation).
// Tuân INTEGRATION-STANDARD §2: một bộ token cấp ecosystem, module CHỈ tiêu thụ,
// CẤM hardcode màu trong code module. Giá trị token là literal đã validate kiểu
// (KHÔNG expression/eval — INV-SEC / QĐ-1).
//
// LƯU Ý visual parity: app hiện có 3 nguồn màu lịch sử với giá trị KHÁC nhau
// (COLORS ở constants, NEUTRAL ở shared/theme, brand mỗi module). Để giữ nguyên
// visual tuyệt đối khi gộp, token giữ ĐÚNG từng giá trị cũ — không hợp nhất các
// hex khác nhau thành một. Các tên cũ (COLORS/NEUTRAL/*_THEME) re-export từ đây.

// ---------------------------------------------------------------------------
// withAlpha — tiện ích phủ alpha lên hex (giữ nguyên hành vi bản cũ shared/theme)
// ---------------------------------------------------------------------------
export const withAlpha = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

// ---------------------------------------------------------------------------
// Semantic token set — mặc định = giá trị app đang chạy (KHÔNG đổi visual).
//
// Lớp `app`  : palette nền/typography/feedback chủ đạo (kế thừa COLORS cũ).
// Lớp `neutral`: palette trung tính dùng chung (kế thừa NEUTRAL cũ) — một số
//   giá trị khác `app` (vd border/text) nên giữ riêng để không lệch pixel.
// Lớp `brand`: bảng màu thương hiệu mỗi module (trace/chat/work).
//
// Khi white-label, theme.config.ts override CHỈ giá trị các token này.
// ---------------------------------------------------------------------------

// ── App palette (nguồn: constants/index.ts COLORS) ─────────────────────────
export const APP_TOKENS = {
  // Backgrounds
  bg:          '#ffffff',
  bgWarm:      '#ffffff',
  white:       '#FFFFFF',
  card:        '#FFFFFF',

  // Borders & dividers
  border:      '#E5E0D8',
  divider:     '#EAE6DF',

  // Accent (unified blue)
  accent:      '#3B6EA8',
  accentDeep:  '#264E7E',
  accentLight: '#B7CEE8',
  accentGlow:  'rgba(59, 110, 168, 0.10)',

  // Typography
  text:        '#1A1F1C',
  textSub:     '#4D5A52',
  textMuted:   '#7A8C80',

  // Input
  inputBg:     '#FAFAF8',
  borderFocus: '#3B6EA8',

  // Feedback
  success:     '#3D7A5E',
  error:       '#C0533A',
  warning:     '#B07D2F',
  info:        '#088ab9',

  // Shadow
  shadow:      'rgba(26, 31, 28, 0.08)',
} as const;

// ── Neutral palette (nguồn: shared/theme/colors.ts NEUTRAL) ────────────────
export const NEUTRAL_TOKENS = {
  bg:         '#FFFFFF',
  bgSoft:     '#F7F8F7',
  bgWarm:     '#FAFAF8',
  card:       '#FFFFFF',

  border:     '#ECEDEE',
  borderSoft: '#F1F2F3',
  divider:    '#EAEBED',

  text:       '#0F1614',
  textSub:    '#4D5A52',
  textMuted:  '#9AA39E',

  white:      '#FFFFFF',
  black:      '#0F1614',

  success:    '#3D7A5E',
  error:      '#C0533A',
  warning:    '#B07D2F',
  info:       '#3B6EA8',

  shadow:     'rgba(15, 22, 20, 0.08)',
  shadowSoft: 'rgba(15, 22, 20, 0.04)',
  overlay:    'rgba(15, 22, 20, 0.4)',
} as const;

// ── Brand palette mỗi module (nguồn: src/modules/<m>/theme/colors.ts) ──────
// trace & chat dùng chung blue; work dùng Aladin green + cam accent.
export const BRAND_TOKENS = {
  /**
   * Truy xuất — xanh lá.
   *
   * ⛔ Chú thích cũ ở đây dặn "phải KHỚP `modules/trace/theme/depth.ts`, đổi một
   *    bên thì đổi bên kia". Đó là một phép đồng bộ BẰNG TAY giữa hai bảng màu
   *    song song, và nó đã trôi: bảng này giữ `#0F8A6A` / `#0A6350` trong khi
   *    `depth.ts` giữ `#166e43` / `#11563a` — tức thanh trên và thanh dưới một
   *    màu, thân màn một màu, đúng cái lỗi mà lời dặn kia định ngăn.
   *
   *    Nay chiều phụ thuộc chỉ còn MỘT: `depth.ts` ĐỌC từ đây (`TRACE_THEME`),
   *    không giữ bản nào của riêng nó. Giá trị dưới đây lấy đúng bộ mà `depth`
   *    đang dùng, nên mọi màn của module giữ nguyên hình; chỗ đổi là thanh trên
   *    và thanh dưới, chúng về đúng màu thân màn.
   */
  trace: {
    key: 'trace',
    name: 'Truy xuất',
    primary:      '#166E43',
    primaryDeep:  '#11563A',
    /** Nền rất nhạt cùng tông — chặng sáng của ô hero và của mảng `primarySoft`. */
    primaryLight: '#DDF3EC',
    primaryGlow:  'rgba(22, 110, 67, 0.10)',
    onPrimary:    '#FFFFFF',
    gradient:     ['#166E43', '#11563A'] as const,
  },
  chat: {
    key: 'chat',
    name: 'Trò chuyện',
    primary:      '#3B6EA8',
    primaryDeep:  '#264E7E',
    primaryLight: '#B7CEE8',
    primaryGlow:  'rgba(59, 110, 168, 0.10)',
    onPrimary:    '#FFFFFF',
    gradient:     ['#4A86C2', '#264E7E'] as const,
  },
  work: {
    key: 'work',
    name: 'Việc làm',
    primary:      '#2B7A39',
    primaryDeep:  '#1F5C2A',
    primaryLight: '#A8D4B0',
    primaryGlow:  'rgba(43, 122, 57, 0.10)',
    onPrimary:    '#FFFFFF',
    gradient:     ['#2B7A39', '#1F5C2A'] as const,
  },
  lampnet: {
    key: 'lampnet',
    name: 'Góp máy',
    // Vàng-hổ-phách (đèn) trên nền app chủ — brand LampNet (spec SG8·F8.4 §4.1).
    primary:      '#D9A227',
    primaryDeep:  '#A87A16',
    primaryLight: '#F1DCA6',
    primaryGlow:  'rgba(217, 162, 39, 0.10)',
    onPrimary:    '#FFFFFF',
    gradient:     ['#E8B347', '#A87A16'] as const,
  },
} as const;

// ── Token nav (tab-bar) — gộp hex thô từ navigation/index.tsx ───────────────
// Giữ nguyên giá trị cũ; chỉ rút khỏi component về một chỗ.
export const NAV_TOKENS = {
  tabBarBg:      'rgba(242, 244, 242, 0.93)',
  tabBarBorder:  'rgba(156, 189, 222, 0.71)',
  tabBarShadow:  '#0B1B2A',
} as const;

// ── Token menu hành động thích ứng (SG4) — nút chính + nhóm hành động ───────
// KHÔNG hardcode hex trong navigation/index.tsx nữa. Reviewer §4/§6:
//   - Nút chính: một màu ẤM tương phản cao (coral) nổi trên navbar xanh đậm.
//   - 4 NHÓM hành động, mỗi nhóm 1 màu ngữ nghĩa NHẤT QUÁN xuyên domain:
//       quét = xanh lá · dinh dưỡng = hổ phách · sức khoẻ = đỏ · tạo = lam.
// Tương phản đạt WCAG AA cho chữ/icon trắng trên các nền màu này (nông dân
// ngoài nắng). Đây là design token — Action Registry chỉ tham chiếu theo TÊN
// nhóm ('scan'|'nutrition'|'health'|'create'), KHÔNG nhúng hex.
export const ACTION_TOKENS = {
  // Nút chính (hero) — coral ấm, nổi trên navbar xanh đậm.
  heroMain:       '#E5674E',
  heroMainBorder: '#F4A895',
  onHero:         '#FFFFFF',
  // Màu theo NHÓM hành động (nhất quán mọi loại canh tác).
  scan:      '#2B7A39', // quét — xanh lá
  nutrition: '#B07D2F', // dinh dưỡng (bón phân, cho ăn…) — hổ phách
  health:    '#C0392B', // sức khoẻ (tiêm thuốc, tỉa quả…) — đỏ
  create:    '#3B6EA8', // tạo (thêm vườn/đàn) — lam
  onAction:  '#FFFFFF',
} as const;

// ── Token Header toàn cục (SG-Header — thanh trên kiểu Facebook, thu/thả) ────
// Header xanh đậm đồng bộ navbar; icon/chữ trắng (WCAG AA trên nền đậm).
export const HEADER_TOKENS = {
  bg:      '#264E7E', // xanh đậm như navbar (accentDeep)
  onBg:    '#FFFFFF',
  onBgSub: 'rgba(255,255,255,0.72)',
  badge:   '#E5533C',
  onBadge: '#FFFFFF',
} as const;

// ── Token bề mặt Fluent của module Trò chuyện ──────────────────────────────
// Vật liệu Mica/Acrylic dựng ở `modules/chat/theme/fluent.ts`, nhưng giá trị màu
// THÔ phải nằm ở đây theo YC-1 (nguồn token duy nhất). File bên module chỉ ghép
// các giá trị này với brand `chat` thành lớp vật liệu.
export const CHAT_SURFACE_TOKENS = {
  /** Ba độ dày acrylic — trắng bán trong, đứng thay cho lớp blur GPU. */
  acrylicBase:  'rgba(255,255,255,0.72)',
  acrylicThin:  'rgba(255,255,255,0.55)',
  acrylicThick: 'rgba(255,255,255,0.92)',
  /** Nền mờ sau hộp thoại. */
  scrim:        'rgba(20,28,38,0.32)',
  /** Thẻ nội dung đặc + viền tóc bắt sáng ở mép. */
  card:         'rgba(255,255,255,0.86)',
  cardStrong:   'rgba(255,255,255,0.90)',
  strokeLight:  'rgba(255,255,255,0.65)',

  /** Dấu "đã xem" trên bong bóng tin của mình (nền là màu brand, cần sáng hơn). */
  tickRead:     '#BFE3C6',
  /** Dấu gửi hỏng, cùng vị trí. */
  tickFailed:   '#FFC4B4',

  /** Tin không khớp chữ ký người gửi — nền · viền · chữ. */
  alertBg:      '#FFF3EF',
  alertBorder:  '#E5A891',
  alertText:    '#7E2F19',
  alertIcon:    '#A63D24',
} as const;

/**
 * Sáu sắc độ cho ảnh đại diện chữ-cái-đầu. Cùng một tên luôn ra cùng một màu,
 * nên người dùng nhận ra phòng bằng màu trước cả khi đọc chữ. Đủ khác nhau để
 * phân biệt, đủ gần nhau để không loè trên nền Mica nhạt.
 */
export const AVATAR_TONE_TOKENS = [
  '#3B6EA8',
  '#4E8C7D',
  '#8A6BA8',
  '#B0743A',
  '#3F7FA8',
  '#A85E6B',
] as const;

// ---------------------------------------------------------------------------
// Bộ token nền hợp nhất — đây là default ThemeConfig sẽ phủ lên.
// ---------------------------------------------------------------------------
export const BASE_TOKENS = {
  app:     APP_TOKENS,
  neutral: NEUTRAL_TOKENS,
  brand:   BRAND_TOKENS,
  nav:     NAV_TOKENS,
  action:  ACTION_TOKENS,
  header:  HEADER_TOKENS,
} as const;

// ---------------------------------------------------------------------------
// Kiểu
// ---------------------------------------------------------------------------
export type AppTokens = typeof APP_TOKENS;
export type NeutralTokens = typeof NEUTRAL_TOKENS;
export type NavTokens = typeof NAV_TOKENS;
export type HeaderTokens = typeof HEADER_TOKENS;
export type BrandKey = keyof typeof BRAND_TOKENS;

export interface ModuleTheme {
  key: 'trace' | 'chat' | 'work' | 'lampnet' | 'phoenixkey';
  name: string;
  primary: string;
  primaryDeep: string;
  primaryLight: string;
  primaryGlow: string;
  onPrimary: string;
  gradient: readonly [string, string];
}

export type BaseTokens = typeof BASE_TOKENS;
