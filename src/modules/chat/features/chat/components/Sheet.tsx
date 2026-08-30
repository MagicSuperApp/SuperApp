// modules/chat/features/chat/components/Sheet.tsx
//
// Bảng trượt từ đáy màn, dùng chung cho mọi hộp thoại của module Trò chuyện.
// Vật liệu: Acrylic dày (che gần hết nền) trên một lớp mờ toàn màn — đứng thay
// cho lớp blur mà React Native chưa có sẵn.
//
// Gom về một chỗ vì trước đây mỗi hộp thoại tự dựng lấy phần vỏ, nên bo góc, độ
// mờ và cách đóng mỗi nơi một kiểu.

import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { ACRYLIC, ELEVATION, MOTION, RADIUS, SPACE, STROKE } from '../../../theme/fluent';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Cho phép cuộn nội dung bên trong (danh sách dài). */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export const Sheet: React.FC<SheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  scroll = false,
  contentStyle,
}) => {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: visible ? MOTION.normal : MOTION.fast,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);


  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Đóng">
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Chặn chạm xuyên qua tấm: bấm trong bảng KHÔNG được đóng bảng. */}
          <Pressable onPress={() => undefined} style={styles.inner}>
            <View style={styles.handle} />
            {!!title && (
              <View style={styles.head}>
                <Text style={styles.title}>{title}</Text>
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
            )}
            {scroll ? (
              <ScrollView
                style={styles.scrollBody}
                contentContainerStyle={[styles.scrollContent, contentStyle]}
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={contentStyle}>{children}</View>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

// ── Một dòng hành-động trong bảng ───────────────────────────────────────────

interface RowProps {
  icon: string;
  label: string;
  description?: string;
  onPress: () => void;
  /** Hành-động phá huỷ (rời phòng, thu hồi tin) — tô đỏ. */
  destructive?: boolean;
  /** Dấu tích bên phải khi mục đang bật. */
  checked?: boolean;
  disabled?: boolean;
}

export const SheetRow: React.FC<RowProps> = ({
  icon,
  label,
  description,
  onPress,
  destructive,
  checked,
  disabled,
}) => {
  const tint = destructive ? NEUTRAL.error : CHAT_THEME.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: withAlpha(tint, 0.10) },
        disabled && { opacity: 0.45 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(tint, 0.12) }]}>
        <Icon name={icon} size={19} color={tint} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, destructive && { color: NEUTRAL.error }]}>
          {label}
        </Text>
        {!!description && <Text style={styles.rowDesc}>{description}</Text>}
      </View>
      {checked && <Icon name="check" size={18} color={tint} />}
    </Pressable>
  );
};

/** Nút đóng chuẩn ở đáy bảng. */
export const SheetDismiss: React.FC<{ label?: string; onPress: () => void }> = ({
  label = 'Đóng',
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.7 }]}
    accessibilityRole="button"
  >
    <Text style={styles.dismissText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: ACRYLIC.scrim, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    ...ELEVATION.dialog,
  },
  inner: {
    backgroundColor: ACRYLIC.thick.fill,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
    paddingBottom: Platform.OS === 'ios' ? SPACE.xl : SPACE.lg,
    maxHeight: '86%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: STROKE.outer,
    marginBottom: SPACE.md,
  },
  head: { marginBottom: SPACE.md, gap: 3 },
  title: { fontSize: 17, fontWeight: '700', color: NEUTRAL.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, color: NEUTRAL.textMuted, lineHeight: 18 },
  scrollBody: { flexGrow: 0 },
  scrollContent: { paddingBottom: SPACE.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.xs + 2,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.base,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14.5, fontWeight: '600', color: NEUTRAL.text },
  rowDesc: { fontSize: 11.5, color: NEUTRAL.textMuted, lineHeight: 16 },

  dismiss: {
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
    marginTop: SPACE.xs,
  },
  dismissText: { fontSize: 14.5, fontWeight: '600', color: NEUTRAL.textSub },
});

export default Sheet;
