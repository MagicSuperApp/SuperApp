/**
 * CompassNeedle — KIM CHỈ ĐƯỜNG, dùng chung cho hai chỗ có cỡ khác hẳn nhau.
 *
 * Tên tệp KHÔNG phải `Needle.tsx`: cạnh nó đã có `needle.ts` (phép tính), mà
 * Windows và macOS không phân biệt hoa-thường trong tên tệp — hai tệp chỉ khác
 * mỗi chữ N sẽ trỏ về cùng một đường dẫn, và `import` lấy nhầm module.
 *
 *   · Kim VƯỜN — to, giữa mặt kính, lúc còn đang đi tới vườn.
 *   · Kim CÂY  — nhỏ, góc trên bên phải, lúc đã vào vườn và đang tìm một cây.
 *
 * Hai kim phải cư xử GIỐNG HỆT nhau: cùng phép trừ góc, cùng vòng ngắn, cùng độ
 * nảy của lò xo. Chép thành hai bản là mở đường cho hai kim quay khác nhau trên
 * cùng một màn — thứ người dùng đọc ra ngay là "cái nào đúng?".
 *
 * Phần dễ sai nằm ở `needle.ts` và đã có bài kiểm: kim đi VÒNG NGẮN (350° → 10°
 * là +20 chứ không phải −340), và số la bàn phải LỌC trước khi dùng.
 *
 * ── Quán tính ───────────────────────────────────────────────────────────────
 * Kim la bàn thật có khối lượng: vượt qua đích một chút rồi lắc về. `spring` ma
 * sát thấp cho đúng dáng ấy. Không có nó thì kim nhảy cóc giữa các góc và mắt
 * đọc thành "máy đang đoán bừa".
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { NATURE, TONE } from '../../modules/trace/theme/depth';
import { needleAngle, shortestTurn } from './needle';

const CompassNeedle: React.FC<{
  /** Góc phương-vị TUYỆT ĐỐI tới đích (0 = Bắc). */
  bearingDeg: number;
  /** Hướng máy đang chĩa. `null` = chưa có → kim chỉ theo góc tuyệt đối. */
  headingDeg: number | null;
  /** Cạnh của ô vẽ, tính bằng pixel. */
  size: number;
  /** Sắp tới nơi thì đổi màu đậm hơn — một tín hiệu nữa ngoài con số. */
  close?: boolean;
}> = ({ bearingDeg, headingDeg, size, close = false }) => {
  const spin = useRef(new Animated.Value(0)).current;
  const continuous = useRef(0);

  const targetAngle = needleAngle(bearingDeg, headingDeg);

  useEffect(() => {
    continuous.current = shortestTurn(continuous.current, targetAngle);
    Animated.spring(spin, {
      toValue: continuous.current,
      // friction thấp + tension vừa = vượt qua đích rồi lắc về hai ba nhịp.
      friction: 5.5,
      tension: 26,
      useNativeDriver: true,
    }).start();
  }, [targetAngle, spin]);

  const rotate = spin.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
    // Kim quay quá một vòng là chuyện thường (góc cộng dồn) → phải cho ngoại suy,
    // không thì mọi góc ngoài [-360, 360] bị kẹp lại và kim đứng im.
    extrapolate: 'extend',
  });

  return (
    <Animated.View style={[styles.wrap, { transform: [{ rotate }] }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* Nửa chỉ hướng — lá kim nhọn, tô màu lá. */}
        <Path d="M50 8 L67 62 L50 53 L33 62 Z" fill={close ? TONE.primaryDeep : TONE.primary} />
        {/* Nửa đuôi — nhạt hơn hẳn, để mắt không đọc nhầm đầu với đuôi. */}
        <Path d="M50 92 L33 62 L50 71 L67 62 Z" fill={NATURE.barkSoft} opacity={0.32} />
        {/* Trục kim */}
        <Circle cx="50" cy="62" r="6.5" fill={NATURE.paper} />
        <Circle cx="50" cy="62" r="6.5" fill="none" stroke={NATURE.moss} strokeOpacity={0.4} strokeWidth={1.4} />
      </Svg>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});

export default CompassNeedle;
