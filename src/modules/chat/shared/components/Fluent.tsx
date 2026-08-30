// modules/chat/shared/components/Fluent.tsx
//
// Ba khối dựng hình của ngôn-ngữ Fluent trong module Trò chuyện. Bảng màu và
// lý-do-kỹ-thuật nằm ở `theme/fluent.ts` — file này chỉ vẽ.
//
//   <MicaBackdrop/>    nền màn: hai vệt loang màu thương-hiệu, đặt sau mọi thứ
//   <Acrylic/>         tấm bán trong: nền + sắc phủ + viền tóc, có bo góc
//   <Divider/>         đường kẻ tóc theo đúng độ đậm của bộ token
//
// Lưu ý khi dùng Acrylic: đặt nó TRÊN MicaBackdrop thì mới thấy được độ trong.
// Nếu bọc trong một View có `backgroundColor` đặc thì nó chỉ còn là thẻ trắng.

import React from 'react';
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ACRYLIC, ELEVATION, MICA, RADIUS, STROKE } from '../../theme/fluent';

// ── Mica ────────────────────────────────────────────────────────────────────

interface MicaProps {
  /** Đậm hơn cho màn danh sách, nhạt hơn cho màn đọc tin. Mặc định 1. */
  intensity?: number;
}

/**
 * Nền Mica. Đặt là con ĐẦU TIÊN của màn, sau đó mọi thứ khác vẽ đè lên.
 * Không nhận sự-kiện chạm (`pointerEvents="none"`).
 */
export const MicaBackdrop: React.FC<MicaProps> = ({ intensity = 1 }) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <View style={[StyleSheet.absoluteFill, { backgroundColor: MICA.base }]} />
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="micaA" cx="88%" cy="4%" rx="82%" ry="46%">
          <Stop offset="0" stopColor={MICA.washPrimary} stopOpacity={intensity} />
          <Stop offset="1" stopColor={MICA.washFade} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="micaB" cx="6%" cy="0%" rx="70%" ry="34%">
          <Stop offset="0" stopColor={MICA.washAccent} stopOpacity={intensity} />
          <Stop offset="1" stopColor={MICA.washFade} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#micaA)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#micaB)" />
    </Svg>
  </View>
);

// ── Acrylic ─────────────────────────────────────────────────────────────────

type AcrylicKind = 'base' | 'thin' | 'thick';
type AcrylicElevation = 'none' | 'rest' | 'raised' | 'dialog';

interface AcrylicProps {
  children?: React.ReactNode;
  /** Độ dày vật-liệu. base = thanh/ô nhập · thin = pill · thick = hộp thoại. */
  kind?: AcrylicKind;
  radius?: number;
  elevation?: AcrylicElevation;
  /** Viền tóc quanh tấm. Mặc định có. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tấm acrylic. Ba lớp chồng nhau đúng thứ-tự Fluent:
 *   1. `fill`  — nền trắng bán trong (thay cho lớp blur)
 *   2. `tint`  — sắc phủ màu thương-hiệu, rất nhạt
 *   3. viền tóc sáng ở mép
 */
export const Acrylic: React.FC<AcrylicProps> = ({
  children,
  kind = 'base',
  radius = RADIUS.lg,
  elevation = 'none',
  bordered = true,
  style,
}) => {
  const material = ACRYLIC[kind];
  return (
    <View
      style={[
        styles.clip,
        { borderRadius: radius, backgroundColor: material.fill },
        bordered && {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: STROKE.base,
        },
        elevation !== 'none' && ELEVATION[elevation],
        style,
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: material.tint },
        ]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
};

// ── Divider ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

export const Divider: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => (
  <View
    style={[
      { height: StyleSheet.hairlineWidth, backgroundColor: STROKE.divider },
      style,
    ]}
  />
);

export default { MicaBackdrop, Acrylic, Divider };
