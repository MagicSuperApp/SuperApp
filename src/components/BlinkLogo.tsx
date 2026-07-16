// components/BlinkLogo.tsx
//
// Logo linh vật với hiệu ứng CHỚP MẮT lặp tự động (Lottie).
//
// Phụ thuộc: lottie-react-native (đã cài). Android tự autolink; iOS cần `pod install`.
// Asset: src/assets/animations/blink_logo.json
//
// Clip dài 3s (90 frame @30fps). Mắt nhắm một lần mỗi vòng, bắt đầu ~frame 15
// (giây 0.5), khép trong ~10 frame rồi mở lại — như nhịp chớp mắt tự nhiên.

import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

type Props = {
  size?: number;
  autoPlay?: boolean;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Gọi khi clip chạy xong một lượt (chỉ có ý nghĩa khi loop=false). */
  onFinish?: () => void;
};

export default function BlinkLogo({
  size = 192,
  autoPlay = true,
  loop = true,
  style,
  onFinish,
}: Props) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <LottieView
        source={require('../assets/animations/blink_logo.json')}
        autoPlay={autoPlay}
        loop={loop}
        onAnimationFinish={onFinish}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#285B23', // nền xanh gốc của logo
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
