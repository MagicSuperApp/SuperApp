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
import { View, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

import { DEFAULT_INSTANCE } from '../config/instance.config';

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
  // App CHƯA có linh vật riêng thì hiện dấu TĨNH của chính nó, không mượn linh
  // vật của app khác. Tới 2026-09-10 cả hai app cùng phát mặt cười Aladin ở bong
  // bóng trợ lý — thứ nổi trên MỌI màn, tức chỗ dễ thấy nhất trong app.
  //
  // Không có `onFinish` ở nhánh tĩnh: ảnh không "chạy xong" bao giờ. Gọi nó
  // ngay để chỗ gọi `loop={false}` không treo mãi chờ một sự kiện không tới.
  const mascot = DEFAULT_INSTANCE.mascot;
  React.useEffect(() => {
    if (!mascot && !loop) onFinish?.();
  }, [mascot, loop, onFinish]);

  return (
    <View
      style={[
        styles.container,
        // Nền lấy màu chrome của chính app (`header.bg`). Trước đợt này là hằng
        // `'#285B23'` kèm chú thích "nền xanh gốc của logo" — xanh của logo
        // ALADIN, đứng sau linh vật ở MỌI app.
        //
        // `'#285B23'` giữ lại làm đường lùi vì Aladin KHÔNG khai `header.bg`:
        // rơi về đúng giá trị cũ nghĩa là app đã phát hành không đổi một pixel.
        // CheckFarm có khai (`theme.config.ts` → `header.bg: '#174F2A'`) nên nhận
        // màu của mình.
        { backgroundColor: DEFAULT_INSTANCE.themeConfig.header?.bg ?? '#285B23' },
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      {mascot ? (
        <LottieView
          source={mascot.blink}
          autoPlay={autoPlay}
          loop={loop}
          onAnimationFinish={onFinish}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      ) : (
        <Image
          source={DEFAULT_INSTANCE.logo}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
