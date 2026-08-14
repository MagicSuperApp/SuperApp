/**
 * depth — HỆ THIẾT KẾ của module Truy xuất: **nhiều lớp** + **hình khối tự nhiên**.
 *
 * Hai thứ chồng lên nhau, không phải hai hệ:
 *   · THANG CHIỀU SÂU nói cái gì nằm trên cái gì (nền → thẻ → tấm trượt → hộp thoại).
 *   · PHONG CÁCH TỰ NHIÊN quyết định chúng TRÔNG như thế nào: màu đất, màu lá,
 *     góc bo không đều, mảng loang mềm ở nền, chữ nhẹ.
 *
 * ── Thang lớp ───────────────────────────────────────────────────────────────
 *   L0  NỀN          — màu đất ngả kem, KHÔNG trắng tinh; có mảng loang mờ phía sau.
 *   L1  NỘI DUNG     — chữ và hàng đặt thẳng trên nền.
 *   L2  THẺ NỔI      — đơn vị chính. Trắng ngà, bo góc KHÔNG ĐỀU, bóng mềm.
 *   L3  TẤM TRƯỢT    — kéo từ đáy lên.
 *   L4  HỘP THOẠI    — nổi cao nhất, giữa màn.
 *
 * ── Vì sao bo góc không đều ─────────────────────────────────────────────────
 * Bo đều bốn góc cho ra hình do MÁY vẽ. Trong tự nhiên không có gì đối xứng
 * tuyệt đối: lá, đá cuội, vũng nước đều lệch. Lệch nhẹ 4–10 px giữa các góc là
 * đủ để mắt thấy "mềm" mà vẫn gọn gàng — đây là điểm khác Neumorphism, vốn dựa
 * vào bóng lồi/lõm để giả vật liệu nhựa.
 *
 * ── Màu ─────────────────────────────────────────────────────────────────────
 * Tông đất + xanh lá, lấy từ chính thứ người dùng nhìn thấy mỗi ngày: đất phù sa,
 * lá non, lá già, vỏ cây, nắng. KHÔNG dùng xanh dương thương hiệu cũ làm màu
 * chính nữa — xanh dương là màu của phần mềm, không phải màu của vườn.
 *
 * ── Cỡ chữ cho người đọc ngoài ruộng ────────────────────────────────────────
 * Nông dân, phần lớn trên 40 tuổi, cầm máy giữa trời nắng, tay có thể ướt. Chữ
 * nền 16–17, số liệu to hẳn, KHÔNG dùng nhãn IN HOA cỡ nhỏ (in hoa xoá đường viền
 * trên/dưới của chữ nên đọc chậm hơn hẳn), và giãn dòng rộng cho dễ bám.
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { withAlpha } from '../../../theme';

// ---------------------------------------------------------------------------
// Bảng màu — tông đất & lá
// ---------------------------------------------------------------------------

export const NATURE = {
  /** Lá non — màu chính, dùng cho nút và điểm nhấn. */
  leaf: '#4A7C3F',
  leafDeep: '#2F5A28',
  leafSoft: '#EAF1E4',
  /** Lá già / rêu — màu phụ. */
  moss: '#6B8F5E',
  /** Đất phù sa — nền trang. */
  soil: '#ffffff',
  soilDeep: '#E9E2D4',
  /** Vỏ cây — chữ đậm, viền. */
  bark: '#3D3528',
  barkSoft: '#6B6153',
  /** Nắng — số liệu ấm, quả chín. */
  sun: '#D89B3C',
  sunSoft: '#FBF0DC',
  /** Nước mưa. */
  water: '#4F8AA8',
  waterSoft: '#E4EFF4',
  /** Giấy — mặt thẻ. Trắng NGÀ, không phải trắng tinh. */
  paper: '#FDFCF8',
  clay: '#C97B4A',
} as const;

export const SURFACE = {
  /** L0 — mặt đất của trang. */
  ground: NATURE.soil,
  /** L1 — mảng chìm nhẹ (ô nhập, hàng bị vô hiệu). */
  sunken: NATURE.soilDeep,
  /** L2/L3/L4 — mặt giấy nổi. */
  raised: NATURE.paper,
  /** Màn che sau tấm trượt / hộp thoại — ngả nâu, không phải xám máy móc. */
  scrim: 'rgba(40, 34, 24, 0.42)',
} as const;

// ---------------------------------------------------------------------------
// Bóng đổ theo lớp — iOS dùng shadow*, Android dùng elevation. Khai CẢ HAI.
// ---------------------------------------------------------------------------

/**
 * Công thức bóng — **toả rộng, rất nhạt, hạ thấp**.
 *
 * Bóng "hiện đại" không phải bóng ĐẬM, mà là bóng KHÓ THẤY: bán kính loang lớn
 * gấp 4–6 lần độ dời, độ đục dưới 0,07. Mắt không đọc ra "cái bóng", chỉ đọc ra
 * "tấm thẻ này nổi lên một chút". Bóng dày (dời 8, đục 0,12) là lối của giao diện
 * 2014 — nay nhìn ra ngay là cũ.
 *
 * Bóng ngả NÂU chứ không đen: đen trên nền kem cho ra vệt xám như vết bẩn.
 *
 * Android không có `shadowRadius` — chỉ có `elevation`, mà elevation vẽ bóng
 * riêng của hệ, đậm hơn iOS ở cùng một con số. Nên bậc Android luôn đặt THẤP hơn
 * bậc iOS tương ứng, chứ không map 1-1.
 */
const shadow = (y: number, blur: number, opacity: number, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#4A3F2A',
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
    android: { elevation, shadowColor: '#4A3F2A' },
    default: {},
  })!;

export const ELEVATION = {
  content: {} as ViewStyle,
  /** Thẻ thường — gần như chỉ là một hơi tối dưới mép. */
  card: shadow(2, 14, 0.05, 1),
  /** Thẻ chính / nút nổi — vẫn nhạt, chỉ loang rộng hơn. */
  cardStrong: shadow(4, 20, 0.07, 3),
  /** Tấm trượt — bóng hắt LÊN, tách nó khỏi trang bên dưới. */
  sheet: shadow(-3, 28, 0.1, 8),
  /** Hộp thoại — bậc duy nhất được phép thấy rõ, vì nó chặn cả màn. */
  modal: shadow(8, 36, 0.16, 16),
} as const;

// ---------------------------------------------------------------------------
// Bo góc — KHÔNG ĐỀU, theo lối hình tự nhiên
// ---------------------------------------------------------------------------

/** Thẻ thường: lệch nhẹ, mắt thấy mềm mà không thấy méo. */
export const ORGANIC_CARD = {
  borderTopLeftRadius: 26,
  borderTopRightRadius: 20,
  borderBottomRightRadius: 26,
  borderBottomLeftRadius: 20,
} as const;

/** Thẻ chính của trang: lệch mạnh hơn, ra dáng viên cuội. */
export const ORGANIC_HERO = {
  borderTopLeftRadius: 34,
  borderTopRightRadius: 24,
  borderBottomRightRadius: 34,
  borderBottomLeftRadius: 24,
} as const;

/** Ô nhỏ (icon, ảnh nhỏ) — lệch ít vì cỡ nhỏ, lệch nhiều là thành méo. */
export const ORGANIC_TILE = {
  borderTopLeftRadius: 18,
  borderTopRightRadius: 14,
  borderBottomRightRadius: 18,
  borderBottomLeftRadius: 14,
} as const;

export const RADIUS = {
  chip: 999,
  field: 18,
  card: 24,
  sheet: 32,
  modal: 28,
} as const;

// ---------------------------------------------------------------------------
// Khoảng cách — thang 4
// ---------------------------------------------------------------------------

export const SPACE = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28,
  page: 18,
  section: 30,
} as const;

// ---------------------------------------------------------------------------
// Chữ — mềm, giãn rộng
// ---------------------------------------------------------------------------

export const TYPE = {
  title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.4, color: NATURE.bark } as TextStyle,
  section: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2, color: NATURE.bark } as TextStyle,
  cardTitle: { fontSize: 17, fontWeight: '700', color: NATURE.bark } as TextStyle,
  body: { fontSize: 16, lineHeight: 24, color: NATURE.barkSoft } as TextStyle,
  caption: { fontSize: 14, lineHeight: 21, color: NATURE.barkSoft } as TextStyle,
  metric: { fontSize: 32, fontWeight: '700', letterSpacing: -1, color: NATURE.bark } as TextStyle,
  metricSm: { fontSize: 23, fontWeight: '700', letterSpacing: -0.5, color: NATURE.bark } as TextStyle,
} as const;

/** Cạnh nhỏ nhất của chỗ bấm được — 56 vì tay bẩn, tay ướt, có khi đeo găng. */
export const TOUCH_MIN = 56;

// ---------------------------------------------------------------------------
// Màu ngữ nghĩa — tên theo VIỆC, không theo sắc độ
// ---------------------------------------------------------------------------

export const TONE = {
  primary: NATURE.leaf,
  primaryDeep: NATURE.leafDeep,
  primarySoft: NATURE.leafSoft,
  leaf: NATURE.moss,
  leafSoft: withAlpha(NATURE.moss, 0.14),
  sun: NATURE.sun,
  sunSoft: NATURE.sunSoft,
  rain: NATURE.water,
  rainSoft: NATURE.waterSoft,
  soil: NATURE.clay,
  danger: '#B5533C',
  border: '#E6DFCF',
} as const;
