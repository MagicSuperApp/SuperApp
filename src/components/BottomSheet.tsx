/**
 * BottomSheet — tấm trượt từ đáy màn, thay cho `Alert.alert` khi cần NGƯỜI DÙNG CHỌN.
 *
 * Vì sao không dùng `Alert.alert`: hộp thoại hệ thống mỗi nền tảng một kiểu, không
 * đặt được icon, không theo bảng màu của app, và trên Android thứ tự nút bị hệ điều
 * hành sắp lại — ba nút "Huỷ / Thư viện / Chụp ảnh" hiện ra mỗi máy một khác.
 *
 * Ở đây: nền phủ mờ bấm-để-đóng + tấm bo góc trượt lên, có hoạt-ảnh vào/ra thật
 * (giữ `<Modal>` sống thêm một nhịp để chạy nốt hoạt-ảnh đóng, nếu tháo ngay thì
 * tấm biến mất khựng một cái).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';

const DUR_IN = 220;
const DUR_OUT = 160;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** Tắt thanh gạt nhỏ ở đầu tấm (khi tấm đã có tiêu đề rõ ràng). */
  hideHandle?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible, onClose, title, subtitle, children, hideHandle,
}) => {
  const insets = useSafeAreaInsets();
  // `mounted` tách khỏi `visible` để còn kịp chạy hoạt-ảnh ĐÓNG.
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1, duration: DUR_IN, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0, duration: DUR_OUT, easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible, mounted, anim]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 10) + 8,
              transform: [{
                translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }),
              }],
            },
          ]}
        >
          {!hideHandle && <View style={styles.handle} />}
          {title ? (
            <View style={styles.head}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 22, 20, 0.45)' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 8,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginBottom: 12,
  },
  head: { marginBottom: 14, gap: 3 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
});

export default BottomSheet;
