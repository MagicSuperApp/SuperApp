// shared/components/SoftGradient.tsx
//
// Lớp NỀN CHUYỂN SẮC NHẸ dùng chung cho các màn NGOÀI module — trước mắt là màn
// Đăng nhập và Trang chủ. Đây là bản rút gọn, đặt ở tầng dùng chung, của
// `modules/trace/components/layered/Organic#GradientFill`.
//
// ── Đã từng có một lớp thứ hai ở đây, và nó bị GỠ ───────────────────────────
// Bản đầu còn chép cả `<MicaBackdrop>` của module Trò chuyện: hai VỆT LOANG TRÒN
// đặt ở hai góc trên, màu nhãn hiệu pha alpha ngay trong chuỗi chặng màu
// (`rgba(43, 122, 57, 0.10)`). Báo về từ thực địa: *"mảng màu xanh bên phải tối
// quá, nhìn như màn hình bị hỏng"*.
//
// Đó là đúng hình dạng mà một vệt loang tròn cho ra khi lớp alpha trong chuỗi
// chặng màu không được quy đúng: thay vì một hơi sáng tan dần, nó thành một mảng
// màu đặc neo ở một góc — trên nền gần trắng thì đọc ra vết ố của màn hình chứ
// không đọc ra ánh sáng. Cùng họ với ba lượt vá đã ghi ở dưới.
//
// Nên hướng đi nay chỉ còn MỘT: chuyển sắc THẲNG, hai chặng đều là hex ĐẶC (pha
// sẵn bằng `tint`/`deepen`, không alpha trong chuỗi màu), trải đều cả bề mặt
// thay vì tụ vào một góc. Không còn chỗ cho một mảng màu neo ở đâu đó.
//
// VÌ SAO CHÉP RA CHỨ KHÔNG IMPORT THẲNG: hai bản gốc đọc bảng màu CỦA MODULE
// chúng (`trace/theme/depth#GRADIENT`, `chat/theme/fluent#MICA`). Màn Đăng nhập
// và Trang chủ không thuộc module nào — chúng nói bằng màu nhãn hiệu của cả app
// (`WORK_THEME`) — nên ở đây màu là THAM SỐ, không phải hằng đọc từ một module.
// Kéo `depth.ts` vào màn đăng nhập sẽ buộc màn đó phải mang cả tông nước của
// module Truy xuất.
//
// ── Luật "nhẹ" chép nguyên từ `trace/theme/depth.ts` ────────────────────────
// Hai chặng, CÙNG tông, lệch nhau chưa tới một bậc sáng. Nền chuyển sắc có chỗ
// sáng chỗ tối mà chữ chỉ có một màu — chỗ tệ nhất quyết định chữ còn đọc được
// hay không. Chuyển sắc lệch tông (lam → cam) không thuộc hệ này.
//
// ── Hai cái bẫy của `react-native-svg` — đã tốn ba lượt vá ở module Truy xuất ─
//   1. `id` là sổ CHUNG cho cả ứng dụng, không theo từng thẻ `<Svg>`. Hai lớp
//      cùng id thì lớp gắn sau ghi đè hình học của lớp trước. → `useId()`.
//   2. `gradientUnits` mặc định là `objectBoundingBox`: x1/y1/cx/cy là PHÂN SỐ
//      0..1, không phải chuỗi phần trăm. `"88%"` bị đọc thành 88 đơn vị người
//      dùng. → luôn truyền số thập phân.
//   3. Kích thước `<Svg>`/`<Rect>` đo bằng `onLayout` rồi truyền PIXEL, không
//      dùng `"100%"`: phần trăm từng quy trượt và cho ra một mảng màu neo ở góc
//      trên-trái, nhỏ hơn khối cha.
//
// Lớp này `pointerEvents="none"` — nền không bao giờ ăn mất cú chạm — và có một
// lớp MÀU ĐẶC nằm dưới để khung hình đầu (chưa có số đo) và mọi sự cố SVG về sau
// chỉ cho ra một mảng phẳng, không bao giờ cho ra một mảng phủ dở.

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** Đo khối cha bằng pixel bố cục. Xem bẫy số 3 ở đầu tệp. */
const useSize = () => {
  const [size, setSize] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const onLayout = React.useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    const h = Math.ceil(e.nativeEvent.layout.height);
    // So trước khi đặt lại: một lượt bố cục cho ra cùng số đo là một vòng vẽ lại
    // không đổi gì trên màn, mà lớp này nằm dưới TOÀN BỘ nội dung của màn.
    setSize((truoc) => (truoc.w === w && truoc.h === h ? truoc : { w, h }));
  }, []);
  return { size, onLayout };
};

/** Id riêng theo từng lượt dựng. Xem bẫy số 1. */
const useGradId = (prefix: string) => {
  const rieng = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${rieng}`;
};

// ── Chặng thứ hai, tính từ chặng thứ nhất ───────────────────────────────────

/**
 * Tối màu `hex` đi một hơi, để lấy chặng CUỐI của một chuyển sắc từ một màu đã
 * có sẵn (thẻ module, banner — nơi mã chỉ cho MỘT màu nền).
 *
 * ── Vì sao TỐI đi chứ không SÁNG lên ────────────────────────────────────────
 * Chữ trên các thẻ ấy là chữ TRẮNG. Kéo một chặng sáng lên là hạ tương phản ở
 * đúng nửa thẻ đó, và một vài màu nền trong danh mục (vd `#C47F0D` của Góp máy)
 * đã sát ngưỡng sẵn — thêm một chặng sáng nữa là nó rơi xuống dưới. Tối đi thì
 * mọi vị trí trên nền đều tương phản BẰNG HOẶC HƠN bản phẳng hiện nay, nên
 * không màn nào có thể tệ đi vì lượt này.
 *
 * ── Vì sao đúng 0,12 ────────────────────────────────────────────────────────
 * Nhân thẳng ba kênh sRGB với 0,88 cho tỉ số tương phản giữa hai chặng nằm trong
 * khoảng 1,11–1,32 trên mọi màu đo được (`softGradient.test.ts` dò cả bảng màu
 * đang dùng lẫn các trường hợp biên: đen, trắng, bão hoà từng kênh) — gọn dưới
 * ngưỡng 1,5 mà `trace/theme/gradient.test.ts` đặt cho "chuyển sắc nhẹ".
 *
 * Khoảng ấy hẹp là nhờ phép nhân tác động theo TỈ LỆ chứ không theo lượng tuyệt
 * đối: màu tối bị trừ đi ít, màu sáng bị trừ đi nhiều, nên không màu nào tụt hẳn
 * ra khỏi tông của nó. Một phép "trừ đi N đơn vị mỗi kênh" thì không có tính
 * chất đó — nó nuốt trọn các màu tối và gần như không đụng tới các màu sáng.
 *
 * Chỉ nhận `#rrggbb`. Chuỗi khác (`rgba(…)`, tên màu) trả về NGUYÊN chuỗi cũ —
 * lúc đó hai chặng bằng nhau, tức một mảng phẳng: vẫn là bản hiện nay, không
 * phải một màn hỏng.
 */
export const deepen = (hex: string, amount = 0.12): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const k = 1 - amount;
  const ch = (shift: number) => Math.round(((n >> shift) & 0xff) * k);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Pha một hơi `brand` vào `base` — để lấy chặng SÁNG của một nền trang từ màu
 * nhãn hiệu, mà không phải gõ một hex nhạt mới vào mã màn hình.
 *
 * Đây là cặp đối của `deepen`, và hai hàm dùng ở hai chỗ khác hẳn nhau:
 *   · `deepen` — cho bề mặt ĐẬM có chữ TRẮNG (thẻ module, banner, khu hero).
 *   · `tint`   — cho nền TRANG gần trắng có chữ TỐI.
 *
 * ── Vì sao pha ra một màu ĐẶC chứ không phủ một lớp alpha ───────────────────
 * Lớp nền nhận hai chặng là hai màu đặc, và đó là một ràng buộc chứ không phải
 * sở thích: chặng màu của SVG nhận alpha viết trong chuỗi `rgba(…)`, nhưng đó
 * đúng là đường đã cho ra lỗi vừa báo — một mảng màu đậm nằm ở góc trên-phải nền
 * trắng, đọc ra "màn hình bị hỏng" chứ không ra một vệt sáng. Pha sẵn ra hex đặc
 * thì không còn chỗ nào để một lớp alpha quy sai nữa: thứ tệ nhất có thể xảy ra
 * là một mảng PHẲNG đúng màu, vì `LinearWash` lấy chính chặng đầu làm nền dự
 * phòng.
 *
 * `amount` là phần của `brand` trong hỗn hợp, 0 = giữ nguyên `base`. Giữ THẬT
 * thấp (0,04–0,08): nền trang nằm dưới toàn bộ chữ của màn.
 *
 * Chuỗi không phải `#rrggbb` → trả về `base` nguyên vẹn, cùng lối dự phòng với
 * `deepen`.
 */
export const tint = (base: string, brand: string, amount: number): string => {
  const doc = (hex: string) => /^#([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  const b = doc(base);
  const t = doc(brand);
  if (!b || !t) return base;
  const kenhCua = (h: string, i: number) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
  const pha = (i: number) =>
    Math.round(kenhCua(b, i) + (kenhCua(t, i) - kenhCua(b, i)) * amount);
  return `#${[0, 1, 2].map((i) => pha(i).toString(16).padStart(2, '0')).join('')}`;
};

// ── Chuyển sắc thẳng ────────────────────────────────────────────────────────

export interface LinearWashProps {
  /** Chặng đầu. Cũng là màu nền đặc dự phòng. */
  from: string;
  /** Chặng cuối. Phải CÙNG tông với `from`, lệch chưa tới một bậc sáng. */
  to: string;
  /**
   * Độ, theo quy ước CSS `linear-gradient()`: 0 = chảy lên trên · 90 = sang phải
   * · 180 = xuống dưới · 135 = xuống góc dưới-phải. Chéo nhẹ (~135–145°) đọc ra
   * "ánh sáng tự nhiên" hơn dọc thẳng, vì ngoài đời nắng chiếu chéo.
   */
  angle?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Lớp chuyển sắc lấp đầy khối cha. Đặt làm con ĐẦU TIÊN của một `View` có
 * `overflow: 'hidden'` (và bo góc, nếu có).
 */
export const LinearWash: React.FC<LinearWashProps> = ({ from, to, angle = 135, style }) => {
  const { size, onLayout } = useSize();
  const id = useGradId('wash');
  const rad = (angle * Math.PI) / 180;
  // Hướng chảy trong hệ toạ độ màn hình (trục y hướng XUỐNG).
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  return (
    <View
      pointerEvents="none"
      // `overflow: 'hidden'` ở chính lớp này, không trông chờ khối cha: nơi dùng
      // có thể truyền `borderRadius` qua `style` để lớp nền tự bo theo góc thẻ —
      // cần thế khi thẻ cha đổ bóng và do đó KHÔNG được cắt tràn (cắt tràn ở
      // khối đổ bóng thì trên iOS bóng mất theo).
      style={[StyleSheet.absoluteFill, styles.clip, { backgroundColor: from }, style]}
      onLayout={onLayout}
    >
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {/* Số thập phân, không phải chuỗi phần trăm — xem bẫy số 2. */}
            <LinearGradient
              id={id}
              x1={0.5 - dx / 2}
              y1={0.5 - dy / 2}
              x2={0.5 + dx / 2}
              y2={0.5 + dy / 2}
            >
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
};

// ── Màn phủ ẢNH → MÀU ───────────────────────────────────────────────────────

export interface ScrimWashProps {
  /** Màu đặc ở CUỐI dải. Thường là màu module của thẻ. */
  color: string;
  /**
   * Hướng, cùng quy ước `LinearWash`. 90 = chảy ngang sang PHẢI; lệch vài độ
   * khỏi 90 thì mốc đặc màu thành một đường XIÊN — xem `mocDacAnToan`, và
   * đừng bẻ nghiêng mà quên chỉnh `solidAt` theo.
   */
  angle?: number;
  /**
   * Nơi dải đạt màu ĐẶC, tính theo phần của bề rộng (0..1). Chữ phải bắt đầu
   * SAU mốc này, nếu không nó nằm trên ảnh và mất tương phản.
   */
  solidAt?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Lớp phủ chuyển từ TRONG SUỐT sang một màu đặc — để một tấm ảnh tan vào nền
 * màu của thẻ thay vì bị cắt thành hai nửa bằng một đường thẳng.
 *
 * ── Đây là lớp DUY NHẤT trong tệp được dùng alpha, và vì sao ────────────────
 * Đầu tệp kể lại một lỗi: chặng màu viết alpha ngay trong chuỗi `rgba(…)` cho
 * ra "một mảng màu đậm ở góc, đọc như màn hình hỏng". Bài học rút ra ở đó là
 * đúng, nhưng nó thuộc về một ca khác: một VỆT LOANG TRÒN đặt lên nền TRANG gần
 * trắng, nơi mọi độ đục đều đọc ra vết bẩn, và nơi hoàn toàn có thể pha sẵn ra
 * hex đặc vì phía dưới chỉ là một màu.
 *
 * Ở đây phía dưới là một tấm ẢNH. Không pha sẵn được: hỗn hợp phải tính trên
 * từng điểm ảnh của ảnh, mà mã không đọc được điểm ảnh. Alpha không phải một
 * lựa chọn phong cách, nó là cách duy nhất. Hai rào giữ nó khỏi lặp lại ca cũ:
 *   · alpha đi qua `stopOpacity` (thuộc tính riêng), không trộn vào chuỗi màu —
 *     chỗ từng quy trượt;
 *   · dải trải HẾT bề ngang và kết thúc ĐẶC, nên thứ tệ nhất nó cho ra là một
 *     mảng màu phủ kín, không bao giờ là một vệt neo ở góc.
 *
 * KHÔNG có màu nền dự phòng — dự phòng ở đây phải là "không phủ gì cả", vì một
 * mảng đặc phủ kín sẽ giấu mất tấm ảnh. Khung hình đầu (chưa có số đo) vì thế
 * hiện ảnh trần; nơi dùng phải giữ chữ đọc được ở cả khung ấy (bóng chữ).
 *
 * ── Vì sao BỐN chặng chứ không hai ─────────────────────────────────────────
 * Hai chặng cho một dải alpha tuyến tính: nó đi qua vùng nửa đục ở đúng khúc
 * giữa, nơi mắt nhạy nhất với chuyển dần, và trên nền ảnh nhiều chi tiết thì
 * khúc ấy lộ ra thành một dải sọc. Bốn chặng bẻ đường cong: chậm lúc đầu (ảnh
 * còn rõ), nhanh ở khúc giữa, rồi đặc hẳn trước mốc `solidAt`.
 */
/**
 * Mốc đặc màu AN TOÀN cho một dải nghiêng — tức giá trị lớn nhất mà `solidAt`
 * được phép nhận nếu muốn mọi điểm từ `tuX` sang phải đều đã đặc màu.
 *
 * ── Vì sao cần một phép tính chứ không một con số ──────────────────────────
 * Dải THẲNG NGANG (90°) thì mốc đặc là một đường dọc: chữ bắt đầu ở 50% bề
 * ngang thì `solidAt = 0.5` là vừa khít. Dải NGHIÊNG thì mốc ấy là một đường
 * xiên — nó chạm mép trên ở một chỗ và mép dưới ở một chỗ khác, cách nhau đúng
 * `|cos(góc)|` của bề ngang. Giữ nguyên 0,5 khi bẻ nghiêng là để một GÓC của
 * khối chữ thò ra ngoài vùng đã đặc màu, nằm trên ảnh — và đó là góc trên hoặc
 * góc dưới, chỗ mắt ít soi nhất lúc thử, chỗ chữ mất tương phản lúc dùng thật.
 *
 * Suy thẳng từ hình học của `LinearGradient`: với trục chạy từ `0,5 − d/2` tới
 * `0,5 + d/2` trong hộp đơn vị, chặng tại một điểm là
 * `t = 0,5 + (x−0,5)·dx + (y−0,5)·dy`. Lấy `y` tệ nhất (0 hoặc 1) ra được công
 * thức dưới. Hộp ĐƠN VỊ, không phải pixel: `gradientUnits` mặc định là
 * `objectBoundingBox`, nên góc ở đây bị bề ngang thẻ kéo bẹt ra — 100° trên một
 * thẻ rộng gấp hai lần rưỡi chiều cao đọc ra khoảng 4° nghiêng, đúng mức "chéo
 * nhẹ" chứ không phải một đường chéo thật.
 */
export const mocDacAnToan = (angle: number, tuX = 0.5): number => {
  const rad = (angle * Math.PI) / 180;
  return 0.5 + (tuX - 0.5) * Math.sin(rad) - Math.abs(Math.cos(rad)) / 2;
};

export const ScrimWash: React.FC<ScrimWashProps> = ({
  color,
  angle = 90,
  solidAt = 0.72,
  style,
}) => {
  const { size, onLayout } = useSize();
  const id = useGradId('scrim');
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  // Ba chặng đầu rải trong quãng trước `solidAt`, chặng cuối đặc từ đó tới hết.
  //
  // ── Dải GIỮ TRONG lâu rồi mới đóng nhanh ─────────────────────────────────
  // Bản đầu rải đều hơn (0,42 → 0,18 rồi 0,75 → 0,72). Hệ quả đo được: ở nửa
  // quãng, dải đã đục 18%, và tới ba phần tư quãng đã 72% — tức tấm ảnh bị làm
  // mờ gần hết ngay trong vùng lẽ ra còn phải thấy rõ. Với một hình minh hoạ
  // nằm gọn trong quãng ấy thì cái đọc ra là "mất ảnh".
  //
  // Nay hơn nửa quãng đầu gần như trong suốt (8%), rồi dải đóng lại trong một
  // phần năm cuối. Ảnh vì thế còn rõ ở phần lớn khung của nó, và chỗ chuyển vẫn
  // đủ dài để không thành một đường kẻ.
  const moc = Math.min(Math.max(solidAt, 0.2), 0.95);
  const chang: Array<[number, number]> = [
    [0, 0],
    [moc * 0.55, 0.08],
    [moc * 0.82, 0.55],
    [moc, 1],
    [1, 1],
  ];

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip, style]}
      onLayout={onLayout}
    >
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient
              id={id}
              x1={0.5 - dx / 2}
              y1={0.5 - dy / 2}
              x2={0.5 + dx / 2}
              y2={0.5 + dy / 2}
            >
              {chang.map(([offset, opacity]) => (
                <Stop
                  key={offset}
                  offset={String(offset)}
                  stopColor={color}
                  stopOpacity={opacity}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
