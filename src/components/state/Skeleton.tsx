// components/state/Skeleton.tsx
//
// Placeholder loading token-driven (INTEGRATION-STANDARD §7.3 Loading):
// "Skeleton token-driven; KHÔNG spinner trắng vô định".
//
// Shimmer nhẹ bằng Animated CORE của RN (useNativeDriver: true) — KHÔNG cài
// reanimated. Máy yếu (lowEnd) → TẮT shimmer, chỉ còn khối tĩnh: vẫn cho thấy
// bố cục sắp tới mà không tốn GPU. "2 cực ngang nhau" — lowEnd vẫn mượt.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../../theme';
import { useAdaptive } from '../../theme/adaptive';

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// Một khối skeleton. Shimmer (opacity pulse) chỉ chạy khi adaptive cho phép.
export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}) => {
  const theme = useTheme();
  const adaptive = useAdaptive();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!adaptive.shimmer) {
      pulse.setValue(0.6); // khối tĩnh, độ mờ trung tính
      return;
    }
    const dur = Math.round(700 * adaptive.motionScale);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: dur, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: dur, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [adaptive.shimmer, adaptive.motionScale, pulse]);

  return (
    <Animated.View
      style={[
        {
          width: width as ViewStyle['width'],
          height,
          borderRadius: radius,
          backgroundColor: theme.neutral.borderSoft,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
};

interface SkeletonProps {
  // Số dòng/khối lặp lại (vd skeleton danh sách card).
  lines?: number;
  style?: StyleProp<ViewStyle>;
}

// Mẫu skeleton dạng "card list" mặc định — phủ phần lớn màn danh sách của app.
export const Skeleton: React.FC<SkeletonProps> = ({ lines = 4, style }) => {
  const adaptive = useAdaptive();
  const gap = Math.round(14 * adaptive.spacingScale);

  return (
    <View style={[styles.wrap, { padding: Math.round(20 * adaptive.spacingScale) }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <View key={i} style={[styles.card, { marginBottom: gap }]}>
          <SkeletonBox width={40} height={40} radius={12} />
          <View style={styles.cardBody}>
            <SkeletonBox width="60%" height={14} />
            <SkeletonBox width="90%" height={11} style={styles.gapTop} />
            <SkeletonBox width="40%" height={11} style={styles.gapTop} />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardBody: { flex: 1 },
  gapTop: { marginTop: 8 },
});

export default Skeleton;
