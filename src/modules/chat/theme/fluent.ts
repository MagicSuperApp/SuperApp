// modules/chat/theme/fluent.ts
//
// Ngôn ngữ thị-giác Fluent cho module Trò chuyện: Mica · Acrylic · Blur · bo góc.
//
// VÌ SAO KHÔNG DÙNG BLUR THẬT: blur GPU trên React Native cần một mô-đun native
// (@react-native-community/blur hoặc expo-blur) — kho này chưa có, và thêm vào là
// bắt buộc dựng lại cả hai nền. Nên lớp vật-liệu ở đây dựng bằng thứ đã có sẵn:
// nền chuyển sắc (react-native-svg) + các lớp phủ bán trong + viền tóc sáng.
//
// Cách đọc bảng dưới, theo đúng thứ-tự lớp của Fluent:
//   MICA     — nền của cả màn. Loang màu thương-hiệu rất nhạt, gần như đục, đứng yên.
//   ACRYLIC  — tấm nổi trên nền (thanh đầu màn, ô nhập, hộp thoại). Bán trong + viền sáng.
//   LAYER    — thẻ nội dung đặc, nổi bằng bóng chứ không bằng độ trong.
//   STROKE   — viền tóc: sáng ở cạnh trên, tối dần xuống dưới (giả "reveal").
//
// Khi nào có mô-đun blur native: chỉ cần bọc `ACRYLIC.*` bằng <BlurView> và giữ
// nguyên `tint`/`stroke` — bảng màu đã tính sẵn cho trường hợp có blur thật.

import { CHAT_THEME, CHAT_SURFACE } from '../../../theme';
import { NEUTRAL, withAlpha } from '../../../shared/theme';

/** Bo góc — thang Fluent, đã chỉnh cho màn cảm-ứng (to hơn bản desktop). */
export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Khoảng cách — bội số 4 như Fluent. */
export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * MICA — nền màn. Không bao giờ đặt màu đặc lên trên nó, nếu không lớp loang
 * biến mất. `wash*` là hai vệt sáng đặt tuyệt-đối ở góc trên, `base` là nền dưới.
 */
export const MICA = {
  base: NEUTRAL.bgSoft,
  /** Vệt loang chính (góc trên-phải) — màu thương-hiệu rất nhạt. */
  washPrimary: withAlpha(CHAT_THEME.primary, 0.14),
  /** Vệt loang phụ (góc trên-trái) — ấm hơn để nền không bị "một màu". */
  washAccent: withAlpha(CHAT_THEME.primaryLight, 0.22),
  washFade: withAlpha(CHAT_THEME.primary, 0),
} as const;

/**
 * ACRYLIC — tấm bán trong. Ba độ dày như Fluent:
 *   base  : thanh đầu màn, đáy màn (nội dung chạy phía sau)
 *   thin  : pill, chip, nút phụ
 *   thick : hộp thoại, bảng chọn (che gần hết nền)
 */
export const ACRYLIC = {
  base: {
    fill: CHAT_SURFACE.acrylicBase,
    tint: withAlpha(CHAT_THEME.primary, 0.04),
  },
  thin: {
    fill: CHAT_SURFACE.acrylicThin,
    tint: withAlpha(CHAT_THEME.primary, 0.06),
  },
  thick: {
    fill: CHAT_SURFACE.acrylicThick,
    tint: withAlpha(CHAT_THEME.primary, 0.03),
  },
  /** Nền mờ sau hộp thoại (đứng thay cho blur toàn màn). */
  scrim: CHAT_SURFACE.scrim,
} as const;

/** LAYER — thẻ nội dung đặc, dùng cho hàng danh sách và bong bóng tin. */
export const LAYER = {
  card: CHAT_SURFACE.card,
  /** Bong bóng tin của người khác — đặc hơn thẻ danh sách một chút để dễ đọc. */
  bubble: CHAT_SURFACE.cardStrong,
  cardSolid: NEUTRAL.card,
  cardPressed: withAlpha(CHAT_THEME.primary, 0.07),
  subtle: withAlpha(CHAT_THEME.primary, 0.05),
} as const;

/** STROKE — viền tóc. `top` sáng hơn `base` để mép trên bắt sáng. */
export const STROKE = {
  base: CHAT_SURFACE.strokeLight,
  outer: withAlpha(CHAT_THEME.primaryDeep, 0.10),
  divider: withAlpha(CHAT_THEME.primaryDeep, 0.07),
  focus: withAlpha(CHAT_THEME.primary, 0.55),
} as const;

/**
 * ELEVATION — bóng đổ Fluent (2/4/8/16). iOS dùng shadow*, Android dùng elevation;
 * khai cả hai trong cùng một object để trải thẳng vào style.
 */
type Elevation = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

const shadow = (radius: number, y: number, opacity: number, e: number): Elevation => ({
  shadowColor: CHAT_THEME.primaryDeep,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: y },
  elevation: e,
});

export const ELEVATION = {
  /** Thẻ nằm trong danh sách. */
  rest: shadow(6, 2, 0.06, 1),
  /** Tấm acrylic nổi (thanh đầu màn, ô nhập). */
  raised: shadow(14, 4, 0.10, 4),
  /** Hộp thoại, bảng chọn, nút tròn nổi. */
  dialog: shadow(28, 12, 0.18, 12),
} as const;

/** Chữ — thang Fluent (Caption → Title), đã rút gọn còn những bậc thật sự dùng. */
export const TYPE = {
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
} as const;

/**
 * SIGNAL — màu báo hiệu trong phòng chat. Chỉ dùng cho hai việc: dấu trạng-thái
 * gửi trên bong bóng của mình, và cảnh báo tin không khớp chữ ký người gửi.
 * KHÔNG dùng để trang trí — đỏ ở đây phải luôn có nghĩa "đừng tin tin này".
 */
export const SIGNAL = {
  tickRead: CHAT_SURFACE.tickRead,
  tickFailed: CHAT_SURFACE.tickFailed,
  alertBg: CHAT_SURFACE.alertBg,
  alertBorder: CHAT_SURFACE.alertBorder,
  alertText: CHAT_SURFACE.alertText,
  alertIcon: CHAT_SURFACE.alertIcon,
} as const;

/** Thời lượng chuyển động Fluent (nhanh · vừa · chậm). */
export const MOTION = { fast: 150, normal: 250, slow: 400 } as const;

export const FLUENT = {
  RADIUS,
  SPACE,
  MICA,
  ACRYLIC,
  LAYER,
  STROKE,
  SIGNAL,
  ELEVATION,
  TYPE,
  MOTION,
} as const;

export default FLUENT;
