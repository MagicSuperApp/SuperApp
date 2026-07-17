// components/LoginSuccessOverlay.tsx
//
// Lớp phủ toàn màn hình chạy hiệu ứng logo CHỚP MẮT khi ĐĂNG NHẬP THÀNH CÔNG,
// rồi gọi onDone() để màn gọi tiếp tục điều hướng (reset về Main).
//
// Dùng: bật khi login/khởi tạo tài khoản thành công; overlay tự phủ mờ vào, chạy
// một nhịp chớp mắt, rồi sau `holdMs` gọi onDone.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, StatusBar } from 'react-native';
import BlinkLogo from './BlinkLogo';

const BRAND_BG = '#0F3D18'; // xanh lá rất đậm — nền chuyển tiếp

type Props = {
  visible: boolean;
  onDone: () => void;
  /** Giữ overlay bao lâu trước khi onDone (ms). Đủ cho 1 nhịp chớp mắt. */
  holdMs?: number;
  message?: string;
  /** Tên người dùng thật để thay vào %username% trong message. */
  username?: string;
};

export default function LoginSuccessOverlay({
  visible,
  onDone,
  holdMs = 1600,
  message = 'Xin chào %username%!',
  username = 'bạn',
}: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;
  const doneRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    doneRef.current = false;
    fade.setValue(0);
    rise.setValue(12);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    }, holdMs);
    return () => clearTimeout(t);
    // onDone giữ ổn định ở màn gọi; chỉ chạy lại khi visible bật.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, holdMs]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]} pointerEvents="auto">
      <StatusBar barStyle="light-content" backgroundColor={BRAND_BG} />
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: rise }] }}>
        {/* loop=false: chạy đúng 1 lượt; overlay tự đóng sau holdMs (ngắn hơn 3s). */}
        <BlinkLogo size={168} loop={false} />
        <Text style={styles.msg}>{message.replace('%username%', username)}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
  msg: {
    marginTop: 22,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
