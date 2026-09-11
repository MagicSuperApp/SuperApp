/**
 * depth — HỆ THIẾT KẾ của module Truy xuất.
 *
 * ── Bản này đổi hướng: từ tông ĐẤT sang tông NƯỚC ───────────────────────────
 * Bản trước dùng nền kem ngả nâu, thẻ bo góc lệch, bóng đổ mềm — đọc ra "mộc mạc,
 * thủ công", nhưng đứng cạnh phần mềm 2026 thì đọc ra "cũ". Ba thứ gây cảm giác
 * đó, và bản này sửa cả ba:
 *
 *   NỀN     kem #F5F1E8 → trắng ngả xanh biển. Nền ấm ngả vàng làm cả màn trông
 *           như giấy ố; nền sáng ngả lam-lục cho cảm giác sạch và mới, mà vẫn
 *           không phải trắng bệnh viện.
 *   GÓC BO  bo lệch bốn góc → bo ĐỀU và NHẸ. Góc lệch là chữ ký của "hand-made";
 *           góc đều 12–16 px là chữ ký của phần mềm hiện đại (Material, Fluent).
 *   BÓNG    bóng mềm quanh mọi thẻ → gần như BỎ HẲN. Thẻ tách nhau bằng ĐƯỜNG
 *           VIỀN TÓC và bằng nền, không bằng bóng. Bóng đổ nhiều là lối 2014.
 *
 * ── Ba hệ tham chiếu ────────────────────────────────────────────────────────
 *   Material  thang khoảng cách 4, màu ngữ nghĩa, chạm có phản hồi rõ.
 *   Fluent    bề mặt phẳng, phân tầng bằng SẮC ĐỘ nền chứ không bằng bóng.
 *   Bento     lưới ô vuông vắn, mỗi ô một việc, không ô nào tranh chỗ ô nào.
 *
 * ── Vẫn giữ ─────────────────────────────────────────────────────────────────
 * Cỡ chữ lớn và vùng chạm rộng. Người dùng là nhà vườn trên 40 tuổi, cầm máy
 * giữa nắng, tay có thể ướt — thứ đó không đổi theo mốt thiết kế.
 *
 * MỌI TÊN TOKEN GIỮ NGUYÊN so với bản tông đất, chỉ đổi giá trị. Nhờ vậy hơn 20
 * tệp đang dùng chúng đổi hình ngay mà không phải sửa, và không màn nào bị bỏ
 * quên ở tông màu cũ.
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { TRACE_THEME, withAlpha } from '../../../theme';

// ---------------------------------------------------------------------------
// Bảng màu — nước biển nông dưới nắng
// ---------------------------------------------------------------------------

/**
 * Tên cũ (`leaf`, `soil`, `bark`…) giữ nguyên để không phải sửa nơi dùng, nhưng
 * GIÁ TRỊ nay lấy từ nước và lá non thay vì đất và vỏ cây.
 *
 * ── Ba khoá đầu ĐỔI THEO APP, phần còn lại thì không ───────────────────────
 *
 * ⛔ Bản trước gõ cứng cả ba sắc xanh chủ đạo ở đây, nên mọi app dựng từ nền mã
 *    này hiện module Truy xuất bằng đúng một tông xanh, bất kể app đó khai màu
 *    gì. `theme/hexNhanDien.test.ts` không bắt được vì nó dựng tập cần canh TỪ
 *    `theme/tokens.ts`, mà ba hex ấy không có mặt ở đó — một bảng nhãn hiệu
 *    SONG SONG thì phép kiểm dựa trên bảng chính không thể nhìn thấy.
 *
 *    Tệ hơn: `tokens.ts` có chú thích ngay tại `BRAND_TOKENS.trace` dặn "phải
 *    KHỚP `TONE.primary`/`primaryDeep`, đổi một bên thì đổi bên kia". Lời dặn
 *    ấy là một phép đồng bộ bằng tay, và nó ĐÃ TRÔI: bảng kia giữ `#0F8A6A`
 *    trong khi bảng này giữ `#166e43` — thanh trên một màu, thân màn một màu.
 *
 * Nay `leaf`/`leafDeep`/`leafSoft` ĐỌC từ `TRACE_THEME` (`theme/index.ts`), tức
 * từ cấu hình của app đang chạy: `instance.config.ts` → `themeConfig.brand.trace`.
 * Không còn bản thứ hai để mà trôi.
 *
 * Đọc bằng GETTER chứ không chụp giá trị lúc nạp module: `setActiveThemeConfig`
 * ghi đè TẠI CHỖ các nhánh của theme đang chạy, nên getter luôn trả bản mới —
 * kể cả ở bài kiểm đổi theme giữa chừng, nơi một giá trị chụp sẵn sẽ đứng im mà
 * vẫn xanh.
 *
 * Các khoá còn lại (`moss`, `soil`, `bark`, `sun`, `water`, `paper`, `clay`) CỐ
 * Ý đứng yên: chúng là màu MINH HOẠ của module — hoạ tiết lá, nền trang, chữ,
 * quả chín, nước mưa — mang nghĩa nghề vườn chứ không mang nhãn hiệu, nên chúng
 * giống nhau ở mọi app. Muốn đổi một trong số đó theo app thì phải khai nó
 * thành token ở `theme/tokens.ts` trước, đừng gõ một giá trị mới vào đây.
 */
export const NATURE = {
  /** Xanh chủ đạo — màu NHÃN HIỆU của app đang chạy. */
  get leaf(): string { return TRACE_THEME.primary; },
  get leafDeep(): string { return TRACE_THEME.primaryDeep; },
  get leafSoft(): string { return TRACE_THEME.primaryLight; },
  /** Xanh phụ, dùng cho hạng hai. Màu minh hoạ — KHÔNG đổi theo app. */
  moss: '#4fa964',
  /** "Đất" nay là NƯỚC: trắng ngả lam-lục, thật sáng. */
  soil: '#F2F9FB',
  soilDeep: '#E4EFF3',
  /** Chữ: xanh-đen thay cho nâu vỏ cây — sắc lạnh hợp nền lạnh. */
  bark: '#12262E',
  barkSoft: '#5B7480',
  /** Nắng — số liệu ấm, quả chín. */
  sun: '#E08B2C',
  sunSoft: '#FDF1DF',
  /** Nước mưa. */
  water: '#2C87C4',
  waterSoft: '#E2F0FA',
  /** Mặt thẻ — TRẮNG hẳn, để nổi trên nền ngả xanh. */
  paper: '#FFFFFF',
  clay: '#D2703F',
} as const;

export const SURFACE = {
  /** L0 — nền trang: trắng pha lam-lục, thật sáng. */
  ground: NATURE.soil,
  /** L1 — mảng chìm nhẹ (ô nhập, hàng bị vô hiệu). */
  sunken: NATURE.soilDeep,
  /** L2/L3/L4 — mặt thẻ nổi. */
  raised: NATURE.paper,
  /** Màn che sau tấm trượt / hộp thoại. */
  scrim: 'rgba(12, 32, 40, 0.45)',
} as const;

// ---------------------------------------------------------------------------
// Chuyển sắc (gradient) — "organic nhẹ nhàng", và nhẹ là một CON SỐ
// ---------------------------------------------------------------------------

/**
 * VÌ SAO CÓ MỤC NÀY, và vì sao nó bị ràng chặt tới vậy.
 *
 * Chuyển sắc là thứ dễ dùng hỏng nhất trong một hệ thiết kế: nó đẹp trên ảnh
 * chụp và ăn mất chữ trên tay người dùng. Nền chuyển sắc có chỗ sáng chỗ tối, mà
 * chữ thì chỉ có MỘT màu — nên độ tương phản đổi theo vị trí, và chỗ tệ nhất
 * quyết định chữ có đọc được hay không. Người dùng ở đây là nhà vườn trên 40
 * tuổi, cầm máy giữa nắng.
 *
 * Nên luật ở đây là: **hai chặng, cùng tông, lệch nhau ít.** Mỗi cặp dưới đây
 * chênh nhau chưa tới một bậc sáng — đủ để mắt thấy bề mặt "có chiều", không đủ
 * để phần nào của chữ bị nuốt. Chuyển sắc bảy sắc, hoặc chuyển sắc lệch tông
 * (lam → cam), không thuộc hệ này.
 *
 * ── Cách đọc một mục ────────────────────────────────────────────────────────
 *   from/to  hai chặng màu, theo hướng `angle`
 *   angle    độ, 0 = trái→phải, 90 = trên→dưới. Chéo nhẹ (~135°) đọc ra "ánh
 *            sáng tự nhiên" hơn là dọc thẳng, vì ngoài đời nắng chiếu chéo.
 *   onDark   chữ trên nền này phải là chữ SÁNG hay chữ TỐI. Ghi ra để nơi dùng
 *            không phải đoán, và để lượt soát sau đo được thay vì nhìn.
 */
export type GradientToken = {
  from: string;
  to: string;
  angle: number;
  onDark: boolean;
};

export const GRADIENT = {
  /**
   * Nền trang. Lệch đúng một hơi so với `SURFACE.ground` phẳng — chỉ để mép trên
   * màn hình có chiều sâu, không để ai nhận ra "đây là gradient".
   */
  ground: { from: '#E8F4F8', to: NATURE.soil, angle: 135, onDark: false },

  /**
   * Ô CHÍNH của lưới Bento — ô to nhất trang.
   *
   * SÁNG, không tối, và đó là một ràng buộc từ mã chứ không phải một lựa chọn
   * thẩm mỹ: ô này chứa `EntityTimeline`, mà component đó tự vẽ bằng bảng màu
   * sáng (`COLORS`) và không nhận tham số nào để đổi. Đặt nền tối dưới nó là
   * chữ tối trên nền tối — hỏng ở đúng chỗ người ta cần đọc nhất.
   *
   * Nên "ô chính" ở đây nói bằng KÍCH THƯỚC và bằng sắc xanh nhạt, không nói
   * bằng độ tối. Muốn một ô tối thật thì phải cho `EntityTimeline` một tham số
   * `onDark` trước đã — việc đó đụng cả màn chi tiết cây, nên nó là lượt khác.
   */
  get hero(): GradientToken {
    // Getter vì chặng `to` là màu nhãn hiệu — xem `NATURE`. Một đối tượng chụp
    // sẵn lúc nạp module thì đứng im ở màu của app đầu tiên.
    return { from: '#F4FCF8', to: NATURE.leafSoft, angle: 145, onDark: false };
  },

  /** Ô số liệu / ô phụ — trắng ngả một hơi lam-lục ở góc dưới. */
  tile: { from: NATURE.paper, to: '#F1F9FB', angle: 135, onDark: false },

  /** Ô mang nghĩa NẮNG (quả chín, số ước tính). */
  sun: { from: '#FEF6EA', to: NATURE.sunSoft, angle: 135, onDark: false },

  /** Ô mang nghĩa NƯỚC (mưa, tưới). */
  rain: { from: '#EDF6FC', to: NATURE.waterSoft, angle: 135, onDark: false },

  /**
   * Ô KHÔNG GIAN — ô tối DUY NHẤT của trang, dành cho bản xem trước sơ đồ 3D.
   *
   * Nền tối ở đây không phải để cho khác lạ: một khối phát sáng chỉ đọc ra
   * "không gian" khi quanh nó tối. Cùng hình ấy đặt trên nền trắng thì vầng
   * sáng biến mất và nó tụt về một hình vẽ phẳng.
   *
   * Hai chặng lệch nhau 1,30 lần — vẫn trong ngưỡng "nhẹ" của bộ này. Chữ trắng
   * trên chặng sáng nhất cho 9,4:1; màu phát sáng `#7FE7C4` cho 6,3:1. Cả hai
   * qua AA cho cỡ chữ nhỏ.
   *
   * ⚠ Trong MỘT trang chỉ được có một ô tối. Thêm cái thứ hai là hai cái cùng
   * mất tác dụng làm dấu "khác loại".
   */
  space: { from: '#1B4C5C', to: '#123A47', angle: 150, onDark: true },

  /** Ô hành động chính khi nó KHÔNG phải ô hero — nút lớn, chữ trắng. */
  get action(): GradientToken {
    return { from: NATURE.leaf, to: NATURE.leafDeep, angle: 135, onDark: true };
  },
} as const satisfies Record<string, GradientToken>;

export type GradientName = keyof typeof GRADIENT;

// ---------------------------------------------------------------------------
// Chiều sâu — phân tầng bằng NỀN và VIỀN, gần như không dùng bóng
// ---------------------------------------------------------------------------

/**
 * Công thức bóng còn giữ cho hai bậc trên cùng (tấm trượt, hộp thoại) — chúng
 * che nội dung phía sau nên phải có ranh giới vật lý. Bậc thẻ thường thì KHÔNG
 * còn bóng: một trang đầy thẻ có bóng là một trang trông bẩn và cũ.
 */
const shadow = (y: number, blur: number, opacity: number, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0E2A35',
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
    android: { elevation, shadowColor: '#0E2A35' },
    default: {},
  })!;

export const ELEVATION = {
  content: {} as ViewStyle,
  /** Thẻ thường — KHÔNG bóng. Tách khỏi nền bằng `TONE.border` và màu trắng. */
  card: {} as ViewStyle,
  /** Nút nổi / thẻ chính — một hơi tối, gần ngưỡng nhìn thấy. */
  cardStrong: shadow(1, 6, 0.05, 1),
  /** Tấm trượt — che nội dung nên cần ranh giới. */
  sheet: shadow(-2, 18, 0.08, 6),
  /** Hộp thoại — bậc duy nhất được phép thấy rõ, vì nó chặn cả màn. */
  modal: shadow(6, 26, 0.14, 12),
} as const;

// ---------------------------------------------------------------------------
// Bo góc — ĐỀU và NHẸ
// ---------------------------------------------------------------------------

/**
 * Tên `ORGANIC_*` giữ lại vì hơn hai chục chỗ đang dùng, nhưng giá trị nay là bo
 * ĐỀU. Góc lệch bốn bên là thứ làm giao diện đọc ra "thủ công / cũ"; góc đều vừa
 * phải là ngôn ngữ của Material và Fluent.
 */
export const ORGANIC_CARD = {
  borderRadius: 16,
} as const;

/** Thẻ chính của trang. */
export const ORGANIC_HERO = {
  borderRadius: 20,
} as const;

/** Ô nhỏ (icon, ảnh nhỏ). */
export const ORGANIC_TILE = {
  borderRadius: 12,
} as const;

export const RADIUS = {
  chip: 999,
  field: 12,
  card: 16,
  sheet: 24,
  modal: 20,
} as const;

// ---------------------------------------------------------------------------
// Khoảng cách — thang 4 (Material)
// ---------------------------------------------------------------------------

export const SPACE = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28,
  page: 16,
  section: 28,
} as const;

// ---------------------------------------------------------------------------
// Chữ
// ---------------------------------------------------------------------------

export const TYPE = {
  title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.5, color: NATURE.bark } as TextStyle,
  section: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: NATURE.bark } as TextStyle,
  cardTitle: { fontSize: 17, fontWeight: '600', color: NATURE.bark } as TextStyle,
  body: { fontSize: 16, lineHeight: 24, color: NATURE.barkSoft } as TextStyle,
  caption: { fontSize: 14, lineHeight: 21, color: NATURE.barkSoft } as TextStyle,
  metric: { fontSize: 32, fontWeight: '700', letterSpacing: -1, color: NATURE.bark } as TextStyle,
  metricSm: { fontSize: 23, fontWeight: '700', letterSpacing: -0.5, color: NATURE.bark } as TextStyle,
} as const;

/** Cạnh nhỏ nhất của chỗ bấm được — 56 vì tay bẩn, tay ướt, có khi đeo găng. */
export const TOUCH_MIN = 56;

// ---------------------------------------------------------------------------
// Lớp kính — giữ cho màn Dẫn đường (kính trên nền ảnh vườn)
// ---------------------------------------------------------------------------

export const GLASS = {
  film: 'rgba(255, 255, 255, 0.82)',
  filmSoft: 'rgba(255, 255, 255, 0.66)',
  rim: 'rgba(255, 255, 255, 0.9)',
  sheen: '#FFFFFF',
  seal: 'rgba(255, 255, 255, 0.88)',
} as const;

// ---------------------------------------------------------------------------
// Màu ngữ nghĩa — tên theo VIỆC, không theo sắc độ
// ---------------------------------------------------------------------------

export const TONE = {
  // Ba khoá này là NHÃN HIỆU, nên chúng đi thẳng từ theme của app đang chạy.
  // Getter chứ không chụp giá trị — lý do đầy đủ ở chú thích của `NATURE`.
  get primary(): string { return NATURE.leaf; },
  get primaryDeep(): string { return NATURE.leafDeep; },
  get primarySoft(): string { return NATURE.leafSoft; },
  leaf: NATURE.moss,
  leafSoft: withAlpha(NATURE.moss, 0.14),
  sun: NATURE.sun,
  sunSoft: NATURE.sunSoft,
  rain: NATURE.water,
  rainSoft: NATURE.waterSoft,
  soil: NATURE.clay,
  danger: '#D1483C',
  /**
   * Viền tóc. Nay là thứ TÁCH THẺ KHỎI NỀN — việc mà bóng đổ làm ở bản trước.
   * Phải đủ nhạt để không thành lưới kẻ ô, đủ rõ để mép thẻ có thật.
   */
  border: '#DCE9EE',
} as const;

/**
 * Thẻ tối — dùng cho khối THỜI TIẾT ở trang Tổng quan.
 *
 * Một ô tối giữa trang sáng là lối Bento quen thuộc: nó nói "khối này khác loại
 * với các khối quanh nó" mà không cần viền dày hay tiêu đề to. Thời tiết đúng là
 * khác loại — nó là thứ ĐỌC, không phải thứ bấm vào để làm việc gì.
 */
/**
 * Sắc tím rất nhạt, CHỈ dùng cho thanh hỏi trợ lý.
 *
 * Tách khỏi `TONE` vì nó không mang nghĩa nào trong nghề vườn — nó là quy ước
 * thị giác của phần mềm: tím nhạt = chỗ có máy trả lời. Để lẫn vào bảng màu
 * ngữ nghĩa là mời người sau dùng nó cho một cái nút bình thường.
 */
export const AI_TINT = '#EDE7FB';

/**
 * Thẻ XANH LÁ MẠ — thẻ thông tin vườn ở trang Tổng quan.
 *
 * "Lá mạ" là xanh ngả vàng của mạ non, không phải xanh lá cây già. Hạ tối vừa đủ
 * để chữ TRẮNG đọc được: #4F7D22 với chữ trắng cho tỉ lệ tương phản ~5,4:1 — qua
 * mức AA (4,5) cho cả cỡ chữ nhỏ, mà vẫn còn ra màu mạ chứ chưa thành màu rêu.
 *
 * Vì sao một thẻ MÀU giữa trang toàn thẻ trắng: ba con số vườn·cây·quả là thứ
 * người ta liếc một cái rồi đi tiếp. Một mảng màu đặc kéo mắt tới đúng chỗ đó
 * nhanh hơn bất cứ cỡ chữ nào, và nó chỉ hiệu quả chừng nào TRONG TRANG CHỈ CÓ
 * MỘT — thêm cái thứ hai là hai cái cùng mất tác dụng.
 */
export const LIME_CARD = {
  bg: '#4F7D22',
  /** Đậm hơn — dùng cho lớp nằm dưới / mảng loang trong thẻ. */
  bgDeep: '#3E6419',
  /** Sáng hơn nền — dùng cho hoạ tiết lá, đủ nổi mà không thành hình vẽ chính. */
  leaf: '#8CBF4D',
  text: '#FFFFFF',
  textSoft: 'rgba(255, 255, 255, 0.78)',
  border: 'rgba(255, 255, 255, 0.14)',
  /**
   * Lớp tối rất nhẹ cho một vùng NẰM TRONG thẻ (nút, ô nhập).
   *
   * Cần nó vì hoạ tiết lá chạy qua phía sau: nút để trong suốt hoàn toàn thì chữ
   * trắng có lúc nằm trên nền lá sáng hơn, có lúc trên nền thẻ — độ tương phản
   * đổi theo từng chữ cái. Một lớp tối mỏng làm nền dưới chữ trở lại đồng đều mà
   * không cần thêm màu nào mới.
   */
  wash: 'rgba(0, 0, 0, 0.13)',
  washOn: 'rgba(0, 0, 0, 0.26)',
} as const;

export const DARK_CARD = {
  bg: '#123A47',
  bgSoft: '#1B4C5C',
  text: '#F0F8FA',
  textSoft: '#9FC0CC',
  border: 'rgba(255, 255, 255, 0.1)',
} as const;
