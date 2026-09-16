// components/genie/edgeWaveMath.ts
//
// Toán hiệu ứng của Lớp Trợ lý. THUẦN — không React, không GL, không đồng hồ hệ
// thống (giờ đi vào qua tham số `t`).
//
// Nguồn thiết kế: `docs/AI_ASSISTANT_UI-UX.md` §5–§8, §15, §19.
//
// Tách ra một tệp riêng vì hai bản vẽ phải nhấp nhô GIỐNG NHAU: bản GL tính trong
// shader, bản dự phòng tính trong JS. Hai công thức chép tay ở hai nơi thì đến
// ngày ai đó chỉnh một con số, hai bản lệch nhau — và không có gì đỏ để báo.
// Tệp này là nguồn duy nhất; shader sinh ra từ đúng các hằng dưới đây.

const TAU = Math.PI * 2;

// ═══════════════════════════════════════════════════════════════════════════
// §15 — TRẠNG THÁI CỦA TRỢ LÝ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sáu trạng thái của spec §15. Mỗi cái đổi ANIMATION, không đổi bố cục chính —
 * bố cục nhảy theo trạng thái thì người dùng mất phương hướng đúng lúc họ đang
 * chờ máy trả lời.
 */
export type AgentState =
  | 'idle'
  | 'activated'
  | 'listening'
  | 'processing'
  | 'executing'
  | 'speaking';

// ═══════════════════════════════════════════════════════════════════════════
// §6 — VÙNG SÓNG ĐỘC LẬP TRÊN MỖI CẠNH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Một VÙNG sóng trên một cạnh.
 *
 * Spec §6 nói rõ: *"Mỗi cạnh màn hình được chia thành nhiều vùng wave độc lập…
 * Không được để toàn bộ border chuyển động cùng một lúc."*
 *
 * Đây là chỗ khác hẳn bản trước. Bản trước dùng MỘT công thức cho cả chu vi với
 * một độ lệch pha theo vị trí — nó cho ra sóng chạy vòng, nhưng cả viền vẫn thở
 * chung một nhịp. Spec muốn từng mảng có **năng lượng riêng**: mảng này đang
 * mạnh trong khi mảng kia gần như lặng.
 */
export interface WaveRegion {
  /** Tâm vùng trên cạnh, 0 = đầu cạnh, 1 = cuối cạnh. */
  center: number;
  /** Độ rộng cửa sổ ảnh hưởng. Rộng thì các vùng hoà vào nhau, hẹp thì tách bạch. */
  spread: number;
  /** Biên độ riêng của vùng. */
  amp: number;
  /** Tần số riêng (Hz). */
  freq: number;
  /** Pha riêng. */
  phase: number;
  /** Độ sáng riêng — spec §6 đòi cả "độ sáng khác nhau", không chỉ biên độ. */
  bright: number;
}

export type EdgeName = 'top' | 'right' | 'bottom' | 'left';
export const EDGE_NAMES: readonly EdgeName[] = ['top', 'right', 'bottom', 'left'];

/**
 * Ba vùng mỗi cạnh, mười hai vùng tất cả, KHÔNG vùng nào giống vùng nào.
 *
 * ⚠ Tần số cố ý lệch nhau và KHÔNG phải bội của nhau. Trùng nhịp thì các vùng
 *   đập cùng lúc và cả viền lại thở chung — đúng cái spec §6 cấm. Bài kiểm canh
 *   điều kiện này trên mọi cặp trong cùng một cạnh.
 *
 * Cạnh TRÊN yếu nhất (biên độ thấp): nó bị tai thỏ và thanh trạng thái cắt vụn,
 * và đó cũng là chỗ mắt người ít nhìn nhất khi cầm điện thoại.
 */
export const EDGE_REGIONS: Readonly<Record<EdgeName, readonly WaveRegion[]>> = Object.freeze({
  top: [
    { center: 0.18, spread: 0.22, amp: 0.55, freq: 0.53, phase: 0.0, bright: 0.75 },
    { center: 0.52, spread: 0.26, amp: 0.80, freq: 0.79, phase: 2.1, bright: 1.00 },
    { center: 0.86, spread: 0.20, amp: 0.45, freq: 1.13, phase: 4.4, bright: 0.65 },
  ],
  right: [
    { center: 0.22, spread: 0.24, amp: 0.90, freq: 0.61, phase: 1.3, bright: 1.00 },
    { center: 0.55, spread: 0.28, amp: 0.65, freq: 0.97, phase: 3.7, bright: 0.85 },
    { center: 0.84, spread: 0.22, amp: 1.00, freq: 1.31, phase: 5.2, bright: 0.95 },
  ],
  bottom: [
    { center: 0.16, spread: 0.24, amp: 0.70, freq: 0.67, phase: 0.8, bright: 0.90 },
    { center: 0.50, spread: 0.30, amp: 0.95, freq: 1.07, phase: 2.9, bright: 1.00 },
    { center: 0.85, spread: 0.24, amp: 0.60, freq: 0.83, phase: 5.8, bright: 0.80 },
  ],
  left: [
    { center: 0.20, spread: 0.22, amp: 1.00, freq: 0.71, phase: 4.1, bright: 0.95 },
    { center: 0.54, spread: 0.26, amp: 0.60, freq: 1.19, phase: 0.5, bright: 0.80 },
    { center: 0.88, spread: 0.24, amp: 0.85, freq: 0.89, phase: 2.4, bright: 1.00 },
  ],
});

/** Cửa sổ ảnh hưởng của một vùng tại vị trí `u` ∈ [0,1] trên cạnh. */
export function regionWeight(r: WaveRegion, u: number): number {
  const d = (u - r.center) / r.spread;
  return Math.exp(-0.5 * d * d);
}

/**
 * Biên độ sóng tại vị trí `u` trên một cạnh, thời điểm `t`, với bao hình `level`.
 *
 * TỔNG đóng góp của các vùng, mỗi vùng có cửa sổ riêng — không phải nội suy giữa
 * các vùng. Tổng cho ra chỗ giao nhau tự nhiên (hai năng lượng chồng lên nhau),
 * còn nội suy cho ra một đường chuyển tiếp trơn nhưng chết.
 *
 * `level` ∈ [0,1] là bao hình âm thanh ĐÃ LÀM MƯỢT (§8). Giá trị thô từng khung
 * âm thanh mà đưa thẳng vào đây thì sóng giật — spec cấm.
 */
export function edgeWaveAt(edge: EdgeName, u: number, t: number, level: number): number {
  let sum = 0;
  for (const r of EDGE_REGIONS[edge]) {
    sum += regionWeight(r, u) * r.amp * r.bright * Math.sin(TAU * r.freq * t + r.phase);
  }
  // `BREATH` giữ viền SỐNG cả khi im lặng (§19: "Edge wave phải luôn có một
  // chuyển động rất nhẹ khi Assistant active"). Viền đứng im = app treo, theo
  // mắt người dùng.
  const breath = BREATH_AMP * Math.sin(TAU * BREATH_FREQ * t + u * BREATH_SPREAD);
  return (BASE_ENERGY + level) * sum + breath;
}

/** Năng lượng nền khi chưa có âm thanh nào. */
export const BASE_ENERGY = 0.22;
export const BREATH_AMP = 0.14;
export const BREATH_FREQ = 0.21;
export const BREATH_SPREAD = 3.0;

// ═══════════════════════════════════════════════════════════════════════════
// §5 — DẢI SÁNG UỐN LƯỢN Ở HAI CẠNH DỌC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Spec §6 vẽ hai cạnh dọc có các nét chéo chạy (`~~~~` lệch dần), khác với hai
 * cạnh ngang. Đây là phần đó: vài dải sáng mảnh, uốn lượn dọc theo mép.
 *
 * Chỉ đặt ở trái/phải — cạnh trên bị tai thỏ cắt vụn, cạnh dưới là chỗ đặt cụm
 * nút điều khiển. Hai chỗ đó thêm đường uốn vào là thêm nhiễu.
 */
export interface Ribbon {
  /** Khoảng cách từ mép tới đường tâm dải, theo TỈ LỆ bề rộng màn. */
  base: number;
  /** Biên độ uốn, tỉ lệ bề rộng màn. */
  amp: number;
  /** Số bụng sóng trên suốt chiều cao màn. */
  freq: number;
  /** Tốc độ trôi (vòng/giây). Dấu ÂM = trôi ngược lên. */
  speed: number;
  /** Nửa bề rộng lõi dải, tỉ lệ bề rộng màn. */
  width: number;
}

/**
 * Ba dải mỗi cạnh. Số bụng sóng và tốc độ đều KHÁC NHAU và không phải bội của
 * nhau — trùng nhịp thì ba dải dính lại thành một dải dày, và cái uốn lượn biến
 * mất. Dải thứ ba trôi NGƯỢC chiều hai dải kia: hai luồng đi ngược nhau là chỗ
 * mắt bắt được chuyển động rõ nhất.
 *
 * ── BA DẢI SÁT MÉP VÀ ĐÈ LÊN NHAU ──────────────────────────────────────────
 * Bản trước ép ba dải KHÔNG được chạm nhau và trải tới 15% bề ngang màn. Chủ sở
 * hữu bác: phải sát mép và đè lên nhau.
 *
 * Và bác đúng. Ba dải tách bạch, trải rộng vào trong thì chúng đọc thành BA ĐƯỜNG
 * KẺ SONG SONG — một cái khung, không phải ánh sáng. Ánh sáng thật thì các lớp
 * chồng lên nhau: chỗ giao nhau sáng hơn, chỗ tách ra mảnh đi, và cái dày mỏng
 * bất thường đó mới là thứ mắt đọc thành "đang phát sáng".
 *
 * Nay cả ba nằm trong ~7% bề ngang tính từ mép, và biên độ uốn đủ lớn để chúng
 * cắt qua nhau. Bài kiểm canh chiều NGƯỢC LẠI so với bản trước: các dải PHẢI phủ
 * lên nhau, và PHẢI nằm sát mép.
 */
export const RIBBONS: readonly Ribbon[] = [
  { base: 0.016, amp: 0.015, freq: 1.7, speed: 0.13, width: 0.0045 },
  { base: 0.034, amp: 0.021, freq: 1.1, speed: 0.09, width: 0.0034 },
  { base: 0.054, amp: 0.027, freq: 2.3, speed: -0.17, width: 0.0024 },
];

/** Trần khoảng cách từ mép tới dải xa nhất, theo tỉ lệ bề ngang màn. */
export const RIBBON_MAX_REACH = 0.09;

/**
 * Lệch pha cho cạnh PHẢI, một giá trị cho mỗi dải.
 *
 * Hai cạnh uốn ĐỐI XỨNG GƯƠNG thì trông như một cái khung, không như hai luồng
 * đang chảy. Lệch pha phá cái đối xứng đó.
 *
 * ⚠ `phase` là một tham số RIÊNG, KHÔNG được cộng vào `yNorm`. Bản đầu cộng thẳng
 *   và nó tắt hẳn cạnh phải: `fade = sin(π·clamp(yNorm,0,1))`, nên `yNorm + 1.11`
 *   luôn clamp về 1 ⇒ `sin(π) = 0` ⇒ dải thứ ba bên phải VÔ HÌNH ở mọi độ cao.
 *   Trên máy nó hiện thành "bên phải không có dải nào" — không lỗi nào nổ ra.
 */
export const RIBBON_PHASE_RIGHT = [0.37, 0.74, 0.11] as const;

/** Nhân bề rộng của quầng bloom quanh lõi dải. */
export const RIBBON_HALO_SCALE = 4.5;
/** Độ đậm của quầng bloom so với lõi. */
export const RIBBON_HALO_WEIGHT = 0.5;

/** Vị trí đường tâm dải (tỉ lệ bề rộng, tính từ MÉP) tại độ cao `yNorm` ∈ [0,1]. */
export function ribbonCenter(r: Ribbon, yNorm: number, t: number, phase = 0): number {
  return r.base + r.amp * Math.sin(TAU * (r.freq * yNorm + r.speed * t + phase));
}

/**
 * Độ sáng của một dải tại điểm cách mép `xNorm`, độ cao `yNorm`.
 *
 * Hai lớp: LÕI mảnh và sắc, cộng một QUẦNG rộng gấp mấy lần và mờ hơn. Chỉ có
 * lõi thì dải trông như một sợi dây vẽ bằng bút chì; quầng là thứ làm nó ra ánh
 * sáng (§18: *"Green glow cần có cảm giác ánh sáng phát ra từ edge"*).
 */
export function ribbonGlow(
  r: Ribbon, xNorm: number, yNorm: number, t: number, phase = 0,
): number {
  const d = Math.abs(xNorm - ribbonCenter(r, yNorm, t, phase));
  const core = Math.exp(-(d * d) / (2 * r.width * r.width));
  const hw = r.width * RIBBON_HALO_SCALE;
  const halo = Math.exp(-(d * d) / (2 * hw * hw)) * RIBBON_HALO_WEIGHT;
  // Dải MỜ DẦN Ở HAI ĐẦU: cắt cụt ở mép trên/dưới trông như một vết xước.
  const fade = Math.sin(Math.PI * Math.min(1, Math.max(0, yNorm)));
  return (core + halo) * fade;
}

// ═══════════════════════════════════════════════════════════════════════════
// DẢI SÓNG GIỮA MÀN — sự hiện diện của Trợ lý
// ═══════════════════════════════════════════════════════════════════════════
//
// Thay cho vòng tròn có quầng sáng ở bản trước. Chủ sở hữu bác: vòng tròn xấu.
//
// Và nó xấu có lý do đo được: một cái vòng CHỈ nở ra co vào được. Nó nói "có thứ
// gì đó đang sống", nhưng không nói "đang NÓI". Sóng thì nói được — mắt người đọc
// hình dạng sóng thành tiếng nói từ trước khi có máy tính, và spec §8 xây cả một
// mục quanh đúng chuyện đó.
//
// Điều này KHÔNG bỏ §11 (biểu tượng nhịp theo trạng thái). Nó đổi hình dạng của
// biểu tượng: từ một vòng tròn sang một cụm sóng. Vai trò giữ nguyên.
//
// ── HÌNH DẠNG MỘT DẢI ───────────────────────────────────────────────────────
//
//   biên độ lớn ở ĐIỂM TỤ, thấp dần ra hai đầu, và bằng 0 ở hai mép:
//
//        ___                                    ___
//   ____/   \______           /\  /\        ___/   \____
//                 \____/\____/  \/  \__/\__/
//              ↑ điểm tụ
//
// Bao hình = một cái chuông quanh điểm tụ, NHÂN với một cái kẹp `1 − u²` để dải
// tắt hẳn ở hai mép. Chỉ có chuông thôi thì đuôi dải còn một vệt mờ chạy tới sát
// mép màn, và nó trông như một nét vẽ bị cắt cụt.

export interface CenterWave {
  /** Điểm tụ trên trục ngang, −1 = mép trái, 0 = giữa, 1 = mép phải. */
  focus: number;
  /** Độ rộng vùng tụ. Nhỏ thì dải gom lại một chỗ, lớn thì trải ra. */
  sigma: number;
  /** Biên độ tương đối (nhân với nửa chiều cao dải). */
  amp: number;
  /** Số bụng sóng trên suốt bề ngang. */
  freq: number;
  /** Tốc độ trôi ngang (vòng/giây). Dấu ÂM = chạy ngược. */
  speed: number;
  phase: number;
  /** Nửa bề rộng LÕI, theo điểm ảnh logic. */
  widthPx: number;
  /** Nhân bề rộng quầng bloom so với lõi. */
  halo: number;
  /** Độ đậm của quầng so với lõi. */
  haloWeight: number;
  /** Độ sáng riêng của dải. */
  bright: number;
}

/**
 * Ba dải, ĐIỂM TỤ KHÁC NHAU, độ sáng và bloom khác nhau.
 *
 * Ba điểm tụ lệch nhau là thứ làm cụm sóng có CHIỀU SÂU: mắt thấy ba lớp ở ba chỗ
 * chứ không thấy ba đường vẽ chồng lên nhau. Tụ cùng một chỗ thì ba dải dính lại
 * và cụm sóng trông dày mà phẳng.
 *
 * Tần số và tốc độ cũng lệch, và KHÔNG là bội của nhau — trùng nhịp thì ba dải
 * gặp nhau đều đặn ở cùng một chỗ, và mắt bắt được cái chu kỳ đó ngay.
 *
 * Dải 1 SÁNG và MẢNH (nét chính), dải 2 mờ hơn và bloom rộng (lớp khí quyển),
 * dải 3 mảnh nhất và tối nhất (nét phụ, chạy ngược chiều).
 */
export const CENTER_WAVES: readonly CenterWave[] = [
  { focus: -0.18, sigma: 0.52, amp: 1.00, freq: 2.30, speed: 0.33, phase: 0.0, widthPx: 1.7, halo: 5.0, haloWeight: 0.55, bright: 1.00 },
  { focus: 0.24, sigma: 0.64, amp: 0.72, freq: 1.70, speed: 0.21, phase: 2.2, widthPx: 2.6, halo: 8.0, haloWeight: 0.80, bright: 0.62 },
  { focus: 0.02, sigma: 0.38, amp: 0.55, freq: 3.10, speed: -0.47, phase: 4.1, widthPx: 1.2, halo: 4.0, haloWeight: 0.40, bright: 0.45 },
];

/**
 * Bao hình biên độ của một dải tại vị trí `u` ∈ [−1,1].
 *
 * Chuông quanh điểm tụ × kẹp `1 − u²`. Kẹp là phần bắt buộc: thiếu nó thì đuôi
 * dải còn một vệt mờ chạy tới sát mép màn và trông như một nét bị cắt cụt.
 */
export function centerEnvelope(w: CenterWave, u: number): number {
  const d = (u - w.focus) / w.sigma;
  const bell = Math.exp(-d * d);
  const clamp = Math.max(0, 1 - u * u);
  return bell * clamp;
}

/**
 * Độ lệch dọc của một dải tại `u`, thời điểm `t`, theo TỈ LỆ nửa chiều cao dải.
 * Nhân với nửa chiều cao (px) ở nơi vẽ.
 */
export function centerWaveY(w: CenterWave, u: number, t: number, level: number): number {
  const lv = Math.max(0, Math.min(1, level));
  // Sàn 0.12: sóng phẳng lì khi im lặng đọc thành "tắt", không thành "đang chờ"
  // (§19). Người dùng cần thấy Trợ lý vẫn ở đó giữa hai câu.
  const bienDo = (0.12 + 0.88 * lv) * w.amp;
  return bienDo * centerEnvelope(w, u) * Math.sin(TAU * (w.freq * u - w.speed * t) + w.phase);
}

/**
 * Độ sáng của một dải tại điểm cách đường sóng `dPx`.
 *
 * Hai lớp: LÕI mảnh và sắc, cộng QUẦNG rộng gấp mấy lần và mờ hơn — quầng là thứ
 * làm dải ra ÁNH SÁNG chứ không ra một nét vẽ. Nhân thêm bao hình để dải tắt hẳn
 * ở hai đầu thay vì mảnh dần rồi đứt ngang.
 */
export function centerWaveGlow(w: CenterWave, dPx: number, env: number): number {
  const core = Math.exp(-(dPx * dPx) / (2 * w.widthPx * w.widthPx));
  const hw = w.widthPx * w.halo;
  const halo = Math.exp(-(dPx * dPx) / (2 * hw * hw)) * w.haloWeight;
  return (core + halo) * w.bright * env;
}

// ═══════════════════════════════════════════════════════════════════════════
// §8 — BAO HÌNH ÂM THANH: LÀM MƯỢT, NỘI SUY, GIẢM CHẤN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bộ bám bao hình (envelope follower).
 *
 * Spec §8: *"Animation cần có smoothing / interpolation / damping. Không được
 * giật theo từng frame audio."*
 *
 * LÊN NHANH, XUỐNG CHẬM — và đó không phải chuyện thẩm mỹ. Tai người nghe một
 * phụ âm bật ra tức thì nhưng nghe đuôi âm tắt dần; một bộ bám đối xứng sẽ làm
 * sóng nhấp nháy theo từng âm tiết, đọc thành "giật" chứ không thành "đang nói".
 *
 * Thuần và có đồng hồ tiêm vào: bài kiểm tua được thời gian mà không phải chờ.
 */
export class Envelope {
  private v = 0;

  constructor(
    /** Thời gian lên tới ~63% giá trị mới, ms. */
    private readonly attackMs = 70,
    /** Thời gian xuống, ms. Dài hơn attack nhiều lần. */
    private readonly releaseMs = 260,
  ) {}

  get value(): number {
    return this.v;
  }

  reset(v = 0): void {
    this.v = v;
  }

  /**
   * Đẩy một mẫu mới vào, trả bao hình đã mượt.
   * @param target mức tức thời ∈ [0,1]
   * @param dtMs   thời gian trôi qua từ lần trước
   */
  push(target: number, dtMs: number): number {
    const x = Math.max(0, Math.min(1, Number.isFinite(target) ? target : 0));
    const tau = x > this.v ? this.attackMs : this.releaseMs;
    // Làm mượt mũ một bậc, ĐỘC LẬP với nhịp khung hình: `1 - e^(-dt/τ)`.
    // Dùng một hệ số cố định kiểu `v += (x-v)*0.2` thì tốc độ bám đổi theo fps —
    // máy yếu sẽ mượt hơn máy khoẻ, và không ai hiểu vì sao.
    const a = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tau));
    this.v += (x - this.v) * a;
    return this.v;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DÁNG HIỆU ỨNG THEO TRẠNG THÁI (§13, §15, §19)
// ═══════════════════════════════════════════════════════════════════════════

export interface WaveStyle {
  /** Bao hình biên độ ∈ [0,1] — nguồn ở §8. */
  level: number;
  /** Nhân tốc độ thời gian. */
  speed: number;
  /** Độ đậm chung của quầng sáng ∈ [0,1]. */
  alpha: number;
  /** Bề rộng quầng sáng ở đáy, theo pixel. */
  widthPx: number;
  /** Bề rộng tăng thêm khi sóng lên đỉnh, theo pixel. */
  spanPx: number;
  /** Độ đậm của dải sáng uốn lượn hai cạnh dọc. 0 = tắt hẳn. */
  ribbon: number;
  /**
   * ĐÍCH của hệ số cuộn: 1 = ba dải cuộn thành ba vòng tròn, 0 = duỗi ngang.
   *
   * Đây là ĐÍCH, không phải giá trị đang vẽ. Chỗ vẽ tự đi tới đích qua `COIL_MS`
   * — nhảy thẳng tới đích là một khung hình đổi hình dạng, và mắt đọc nó thành
   * hình bị giật.
   */
  coil: number;
}

/**
 * Dáng viền theo trạng thái.
 *
 * Người dùng đọc được máy đang làm gì **mà không cần đọc chữ**. Với người ít tiếp
 * xúc công nghệ thì đây không phải trang trí — đây là giao diện chính.
 *
 * `level` là mức âm thanh tức thời ∈ [0,1], ĐÃ qua `Envelope`. Khi người nói thì
 * đây là RMS ĐO THẬT từ bộ ghi âm; khi trợ lý nói thì đây là bao hình ƯỚC LƯỢNG
 * dựng từ mốc tiến trình TTS — nền tảng không trả biên độ mẫu, và gọi đúng tên
 * nó là ước lượng thì sau này không ai đi tìm bug ở chỗ nó lệch.
 */
export function styleFor(state: AgentState, level = 0): WaveStyle {
  const lv = Math.max(0, Math.min(1, level));
  switch (state) {
    case 'activated':
      // Vừa bật: một nhịp mạnh để người dùng biết lớp đã lên.
      return { level: 0.55, speed: 1.1, alpha: 0.95, widthPx: 26, spanPx: 44, ribbon: 1, coil: 0 };
    case 'listening':
      return { level: 0.2 + 0.8 * lv, speed: 1, alpha: 1, widthPx: 28, spanPx: 52, ribbon: 1, coil: 0 };
    case 'processing':
      // ĐANG NGHĨ: ba dải CUỘN thành ba vòng tròn, mỗi vòng một tốc độ một chiều.
      // Hình đang quay nói ra trạng thái mà không bắt ai đọc chữ — và nó thay hẳn
      // dòng "Em đang xử lý…" từng nằm ở giữa màn.
      //
      // `level` hạ xuống 0.34 và `speed` xuống 1.45 so với bản trước (0.42 / 1.9):
      // vòng tròn quay ĐÃ là chuyển động rồi, cộng thêm sóng mạnh nữa thì thành
      // rối. Yêu cầu là "vẫn giữ nhịp nhưng nhẹ nhàng hơn".
      return { level: 0.34, speed: 1.45, alpha: 0.9, widthPx: 22, spanPx: 30, ribbon: 1, coil: 1 };
    case 'executing':
      // Đang thao tác thật trong app: lặng bớt để mắt dồn xuống màn hình bên dưới,
      // nhưng KHÔNG tắt — người dùng cần biết trợ lý vẫn đang làm.
      return { level: 0.3, speed: 1.3, alpha: 0.8, widthPx: 20, spanPx: 24, ribbon: 0.7, coil: 0 };
    case 'speaking':
      return { level: 0.18 + 0.82 * lv, speed: 1, alpha: 0.95, widthPx: 26, spanPx: 46, ribbon: 1, coil: 0 };
    case 'idle':
    default:
      return { level: 0, speed: 0.6, alpha: 0.7, widthPx: 18, spanPx: 22, ribbon: 0.7, coil: 0 };
  }
}

/**
 * Bề rộng quầng sáng (px) tại vị trí `u` trên cạnh `edge`, thời điểm `t`.
 * Bản dự phòng dùng hàm này; bản GL tính cùng công thức trong shader.
 */
export function glowWidthPx(edge: EdgeName, u: number, t: number, s: WaveStyle): number {
  const a = edgeWaveAt(edge, u, t * s.speed, s.level);
  // Kẹp về [0,1] rồi mới nhân: bề rộng ÂM là vô nghĩa, và `exp(-d/w)` với `w ≤ 0`
  // cho ra NaN loang khắp khung hình — trên máy thật nó hiện thành cả màn xanh đặc.
  const k = Math.max(0, Math.min(1, 0.5 + 0.5 * a));
  return s.widthPx + s.spanPx * k;
}

/** Độ sáng tại khoảng cách `dPx` tới viền. */
export function glowAt(dPx: number, widthPx: number): number {
  if (widthPx <= 0) return 0;
  return Math.exp(-Math.max(0, dPx) / widthPx);
}

// ── CUỘN TRÒN — dáng "đang nghĩ" (§15) ─────────────────────────────────────
//
// Khi Trợ lý đang xử lý, ba dải sóng ngang **cuộn lại thành ba vòng tròn**, vẫn
// giữ nhịp sóng nhưng nhẹ hơn, và mỗi vòng xoay một tốc độ, một chiều.
//
// ── VÌ SAO CUỘN, CHỨ KHÔNG PHẢI MỘT DÒNG CHỮ "đang xử lý" ──────────────────
// Chữ "đang xử lý" là thứ người dùng ĐỌC rồi quên; một hình đang quay là thứ họ
// thấy mà không phải đọc. Với người ít tiếp xúc máy móc thì cái thứ hai rẻ hơn
// hẳn. Và spec §8 đã xây cả một mục quanh chuyện đó: dáng sóng phải nói ra trạng
// thái, chứ không để một nhãn chữ nói hộ.
//
// ── VÌ SAO BA THÔNG SỐ ĐỀU KHÁC NHAU ───────────────────────────────────────
// Ba vòng cùng bán kính, cùng tốc độ, cùng chiều sẽ chồng khít lên nhau và đọc
// thành MỘT vòng dày. Khác bán kính thì thấy ba; khác tốc độ thì chúng tách nhau
// ra theo thời gian; khác CHIỀU thì mắt bắt được chuyển động ngay cả khi ba vòng
// đang chồng nhau ở một khoảnh khắc.

export interface Coil {
  /** Bán kính, theo tỉ lệ của bán kính nền (xem `coilBaseR`). */
  radius: number;
  /** Vòng/giây. **Dấu là CHIỀU xoay** — hai cùng chiều, một ngược lại. */
  spin: number;
}

export const COILS: readonly Coil[] = [
  { radius: 0.34, spin: 0.17 },
  { radius: 0.52, spin: -0.11 },
  { radius: 0.70, spin: 0.26 },
];

/**
 * Biên độ sóng khi đã cuộn hẳn, so với lúc duỗi thẳng.
 *
 * "Nhẹ nhàng hơn" là một yêu cầu về CẢM GIÁC, nên nó phải là một con số: 0.42.
 * Giữ nguyên biên độ thì vòng tròn răng cưa như một bánh răng; bỏ hẳn sóng thì
 * nó thành ba vòng tròn chết, và mất luôn cái nhịp nói rằng Trợ lý vẫn sống.
 */
export const COIL_CALM = 0.42;

/** [PARAM] Cuộn vào / bung ra mất bao lâu. Đủ để mắt theo kịp, không lê thê. */
export const COIL_MS = 620;

/**
 * Bán kính nền, tính từ khung dải.
 *
 * Kẹp theo CẢ HAI chiều: theo `halfW` để vòng lớn nhất không tràn mép ngang, và
 * theo `halfH` để ba vòng không bẹt dí khi dải quá thấp. Thiếu một vế thì trên
 * máy màn hẹp (hoặc dải thấp) hình vỡ, mà chỉ vỡ ở đúng máy đó.
 */
export function coilBaseR(halfW: number, halfH: number): number {
  return Math.min(halfW, halfH * 3);
}

/**
 * Nội suy mượt cho hệ số cuộn — `smoothstep`, không tuyến tính.
 *
 * Tuyến tính thì lúc bắt đầu và lúc kết thúc đều có một cú giật: vận tốc nhảy từ
 * 0 lên hằng số rồi về 0. Mắt bắt được cú đó, và nó đọc thành "hình bị khựng".
 */
export function coilEase(p: number): number {
  const x = p < 0 ? 0 : p > 1 ? 1 : p;
  return x * x * (3 - 2 * x);
}

/**
 * Số chu kỳ sóng quanh MỘT vòng — và nó PHẢI là số nguyên.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ĐÂY LÀ ĐIỀU KIỆN ĐỂ HAI ĐẦU SÓNG NỐI LIỀN
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Đoạn thẳng có hai đầu; vòng tròn thì hai đầu ấy GẶP NHAU. Nên giá trị sóng tại
 * `u = −1` phải bằng giá trị tại `u = +1`, không thì chỗ gặp là một MỐI NỐI —
 * một chỗ gãy chạy vòng quanh theo nhịp xoay, và mắt bắt được ngay.
 *
 * Đặt `θ = π·u` thì số sóng theo góc là `N = 2·freq`. Với `freq` hiện tại
 * (2.30 · 1.70 · 3.10) thì `N` = 4.6 · 3.4 · 6.2 — KHÔNG nguyên, nên bản trước
 * có mối nối thật.
 *
 * Làm tròn về số nguyên gần nhất: 5 · 3 · 6. Khi đó
 *
 *     sin(N·(+π) + φ) = (−1)ᴺ·sin φ = sin(N·(−π) + φ)     ⇒ NỐI LIỀN
 *     đạo hàm hai đầu cũng bằng nhau                        ⇒ nối MƯỢT, không gấp khúc
 *
 * Nối liền thôi chưa đủ — phải nối MƯỢT. Hai đầu bằng nhau mà độ dốc khác nhau
 * thì chỗ gặp là một góc nhọn, và nó cũng lộ y như một khe hở.
 *
 * Ba số 5/3/6 vẫn khác nhau, nên ba vòng vẫn không chồng khít — điều kiện kia
 * không bị hy sinh cho điều kiện này.
 */
export function coilCycles(i: number): number {
  return Math.max(1, Math.round(2 * CENTER_WAVES[i].freq));
}

/**
 * Bao hình khi đã cuộn — theo GÓC, nên nó tự tuần hoàn.
 *
 * KHÁC hẳn `centerEnvelope`: bản kia có kẹp `1 − u²` để dải tắt hẳn ở hai mép —
 * đúng cho một đoạn thẳng có hai đầu, và là thứ XÉ vòng tròn thành một cung cụt.
 *
 * Và nó phải là hàm của GÓC, không phải của `u`: một bao hình theo `u` sẽ nhảy ở
 * chỗ `u` gấp vòng (+1 → −1), tức là mối nối vẫn còn, chỉ chuyển từ pha sóng
 * sang độ sáng. `1 − cos(Δθ)` là "khoảng cách bình phương" của đường tròn — nó
 * tuần hoàn sẵn, nên không có chỗ nào để nhảy.
 *
 * Hệ số `0.7/σ²` chọn để ở gần đỉnh nó khớp với bề rộng của bao hình lúc duỗi:
 * `1 − cos d ≈ d²/2`, nên `exp(−(1−cos d)·0.7/σ²) ≈ exp(−0.35·(d/σ)²)`.
 */
export function coilEnvelopeAt(w: CenterWave, th: number): number {
  const d = th - Math.PI * w.focus;
  const k = 0.7 / (w.sigma * w.sigma);
  return 0.45 + 0.55 * Math.exp(-(1 - Math.cos(d)) * k);
}

/**
 * Một điểm trên dải thứ `i`, ở vị trí `u` ∈ [−1,1], tại thời điểm `t`.
 *
 * `coil` ∈ [0,1] hoà giữa hai dáng: 0 = đoạn sóng ngang, 1 = vòng tròn. Hoà ở
 * mức TOẠ ĐỘ chứ không đổi hẳn hình dạng, nên lúc chuyển không có khung nào nhảy.
 *
 * Trả về px, gốc toạ độ ở TÂM dải.
 */
export function centerWavePoint(
  i: number,
  u: number,
  t: number,
  level: number,
  coil: number,
  halfW: number,
  halfH: number,
): { x: number; y: number } {
  const w = CENTER_WAVES[i];
  const c = COILS[i];
  const k = coil < 0 ? 0 : coil > 1 ? 1 : coil;

  const lv = Math.max(0, Math.min(1, level));
  // Nhẹ dần khi cuộn vào — xem `COIL_CALM`.
  const bien = (0.12 + 0.88 * lv) * w.amp * (1 - k + k * COIL_CALM);

  // Dáng THẲNG.
  const sThang = Math.sin(TAU * (w.freq * u - w.speed * t) + w.phase);
  const xThang = u * halfW;
  const yThang = bien * centerEnvelope(w, u) * halfH * sThang;

  // Dáng VÒNG. `u` thành GÓC, và sóng đếm theo số chu kỳ NGUYÊN quanh vòng để
  // hai đầu nối liền — xem `coilCycles`.
  const th = Math.PI * u;
  const N = coilCycles(i);
  const R = c.radius * coilBaseR(halfW, halfH);
  const sVong = Math.sin(N * th - TAU * w.speed * t + w.phase);
  const rVong = R + bien * coilEnvelopeAt(w, th) * halfH * sVong;
  // Góc xoay RIÊNG của vòng này cộng vào sau: nó xoay cả hình, không làm lệch
  // pha giữa hai đầu.
  const goc = th + TAU * c.spin * t;
  const xVong = rVong * Math.cos(goc);
  const yVong = rVong * Math.sin(goc);

  return { x: xThang + (xVong - xThang) * k, y: yThang + (yVong - yThang) * k };
}
