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
// Lớp `brand`: bảng màu thương hiệu mỗi module (trace/proofchat/work).
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
// trace & proofchat dùng chung blue; work dùng Aladin green + cam accent.
export const BRAND_TOKENS = {
  trace: {
    key: 'trace',
    name: 'Truy xuất',
    primary:      '#3B6EA8',
    primaryDeep:  '#264E7E',
    primaryLight: '#B7CEE8',
    primaryGlow:  'rgba(59, 110, 168, 0.10)',
    onPrimary:    '#FFFFFF',
    gradient:     ['#4A86C2', '#264E7E'] as const,
  },
  proofchat: {
    key: 'proofchat',
    name: 'ProofChat',
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
    name: 'Kết đèn',
    primary:      '#F5A623',
    primaryDeep:  '#C47F0D',
    primaryLight: '#FDF3DC',
    primaryGlow:  'rgba(245, 166, 35, 0.10)',
    onPrimary:    '#FFFFFF',
    gradient:     ['#F5A623', '#C47F0D'] as const,
  },
  orgmint: {
    key: 'orgmint',
    name: 'Tạo tổ chức & mint LAMP',
    primary:      '#F5A623',
    primaryDeep:  '#C47F0D',
    primaryLight: '#FDF3DC',
    primaryGlow:  'rgba(245, 166, 35, 0.10)',
    onPrimary:    '#FFFFFF',
    gradient:     ['#F5A623', '#C47F0D'] as const,
  },
} as const;

// ── Token nav (tab-bar) — gộp hex thô từ navigation/index.tsx ───────────────
// Giữ nguyên giá trị cũ; chỉ rút khỏi component về một chỗ.
export const NAV_TOKENS = {
  tabBarBg:      'rgba(242, 244, 242, 0.93)',
  tabBarBorder:  'rgba(156, 189, 222, 0.71)',
  tabBarShadow:  '#0B1B2A',
} as const;

// ---------------------------------------------------------------------------
// Bộ token nền hợp nhất — đây là default ThemeConfig sẽ phủ lên.
// ---------------------------------------------------------------------------
export const BASE_TOKENS = {
  app:     APP_TOKENS,
  neutral: NEUTRAL_TOKENS,
  brand:   BRAND_TOKENS,
  nav:     NAV_TOKENS,
} as const;

// ---------------------------------------------------------------------------
// Kiểu
// ---------------------------------------------------------------------------
export type AppTokens = typeof APP_TOKENS;
export type NeutralTokens = typeof NEUTRAL_TOKENS;
export type NavTokens = typeof NAV_TOKENS;
export type BrandKey = keyof typeof BRAND_TOKENS;

export interface ModuleTheme {
  key: 'trace' | 'proofchat' | 'work' | 'phoenixkey' | 'lampnet' | 'orgmint';
  name: string;
  primary: string;
  primaryDeep: string;
  primaryLight: string;
  primaryGlow: string;
  onPrimary: string;
  gradient: readonly [string, string];
}

export type BaseTokens = typeof BASE_TOKENS;
