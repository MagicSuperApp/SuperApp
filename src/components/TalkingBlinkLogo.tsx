import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

/**
 * TalkingBlinkLogo
 * -----------------------------------------------------------------------
 * Mascot logo animation: miệng cử động liên tục như đang nói + mắt nháy
 * tự nhiên (thời điểm không đều, không lặp lại y hệt mỗi lần).
 *
 * Cài đặt (một lần):
 *   npm install lottie-react-native
 *   cd ios && pod install     # chỉ cần cho iOS
 *
 * Asset: src/assets/animations/talking_logo.json
 * -----------------------------------------------------------------------
 *
 * Cấu trúc animation (180 frame @ 30fps = 6 giây/vòng lặp):
 *  - Miệng (Mouth layer): keyframe ngẫu nhiên mô phỏng khẩu hình nói tự nhiên.
 *  - Mắt (RightEye/LeftEye layer): 3 lần nháy ở frame 35, 95, 150 — khoảng cách
 *    và độ khép lệch nhau để không bị lặp máy móc.
 * -----------------------------------------------------------------------
 */

type Props = {
  size?: number;
  autoPlay?: boolean;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function TalkingBlinkLogo({
  size = 192,
  autoPlay = true,
  loop = true,
  style,
}: Props) {
  const animRef = useRef<LottieView>(null);

  useEffect(() => {
    if (autoPlay) {
      animRef.current?.play();
    }
  }, [autoPlay]);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <LottieView
        ref={animRef}
        source={require('../assets/animations/talking_logo.json')}
        autoPlay={autoPlay}
        loop={loop}
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
