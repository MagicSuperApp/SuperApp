/**
 * RingProgress — vòng tiến độ bao quanh một nút tròn.
 *
 * ── Vì sao vẽ bằng SVG chứ không xoay viền ──────────────────────────────────
 * Cách quen thuộc trong React Native là dựng một `View` bo tròn rồi cho
 * `borderRightColor: 'transparent'` và xoay nó đi một góc. Cách đó ĐÚNG ở đúng
 * bốn mốc (0 · 25 · 50 · 75%) và SAI ở mọi giá trị giữa: viền của một hình vuông
 * bo tròn được chia theo BỐN CẠNH, không theo góc quét, nên phần hiện ra không
 * tỉ lệ với phần trăm. `CircleProgress` trong `TreeDetailScreen` đang dùng đúng
 * mẹo ấy — nó vẽ ra một cái vòng trông có lý, nhưng 30% và 45% cho gần như cùng
 * một hình.
 *
 * Với module đã có `react-native-svg`, `strokeDasharray` cho cung ĐÚNG ở mọi
 * phần trăm mà không tốn thêm gì. Một con số sai không rẻ hơn một con số đúng.
 *
 * ── Vòng này nói gì ─────────────────────────────────────────────────────────
 * Phần đã quét = phần quả đã thu. Nó bao quanh chính nút cây, nên tiến độ và
 * đối tượng là MỘT khối — mắt không phải nối một thanh ngang với một cái tên ở
 * chỗ khác.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { TONE } from '../../theme/depth';

export const RingProgress: React.FC<{
  /** 0..100. Ngoài dải thì bị kẹp — không có vòng nào quét quá một vòng. */
  pct: number;
  size: number;
  /** Bề dày nét. Mỏng quá thì ngoài nắng không thấy; dày quá thì nuốt chữ bên trong. */
  stroke?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ pct, size, stroke = 4, children, style }) => {
  const phanTram = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const r = (size - stroke) / 2;
  const chuVi = 2 * Math.PI * r;

  return (
    <View style={[{ width: size, height: size }, styles.wrap, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Rãnh — luôn vẽ đủ vòng, để cái vòng có hình cả khi tiến độ bằng 0. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={TONE.border}
          strokeWidth={stroke}
          fill="none"
        />
        {phanTram > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={TONE.primary}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(chuVi * phanTram) / 100} ${chuVi}`}
            // Bắt đầu từ ĐỈNH, quét theo chiều kim đồng hồ. Không xoay thì cung
            // bắt đầu ở mép phải — đúng về toán, lạ về mắt.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.giua}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  giua: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
  },
});

export default RingProgress;
