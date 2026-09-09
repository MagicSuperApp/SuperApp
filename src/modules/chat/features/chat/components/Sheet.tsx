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
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // ── Trần chiều cao PHẢI tính bằng pixel, không dùng phần trăm ──────────────
  //
  // `maxHeight: '86%'` cũ là một trần KHÔNG BAO GIỜ có hiệu lực: phần trăm chiều
  // cao trong Yoga phân giải theo chiều cao CỦA CHA, mà cha ở đây (`styles.sheet`)
  // cao theo nội dung — chiều cao không xác định ⇒ Yoga bỏ qua trần. Tấm trượt vì
  // thế cứ dài ra theo nội dung rồi bị `overflow:'hidden'` XÉN ở mép cửa sổ.
  // Đo trên máy thật 2026-09-08 (uiautomator): hàng thứ tư của hộp "Trò chuyện mới"
  // khai [48,2062][1032,2176] trong khi ba hàng trên đều cao 194px — tức nó bị cắt
  // cụt 80px, và không có thanh cuộn nào để với tới. Lấy chiều cao cửa sổ THẬT rồi
  // nhân ra pixel thì trần mới chặn được, và phần vượt trần đi vào ScrollView.
  const { height: winH } = useWindowDimensions();
  // Chừa đáy: từ khi bảng phủ xuống dưới thanh điều-hướng (xem `navigationBarTranslucent`),
  // đệm đáy phải CỘNG chứ không lấy max — `max` cho ra 20dp mà 16dp trong đó nằm
  // ngay dưới thanh cử chỉ, tức dòng cuối chỉ còn 4dp thở. Cộng: 16dp né thanh
  // cử chỉ + 16dp đệm. Máy không báo inset (thanh đục) thì còn đúng 16dp như cũ.
  const insets = useSafeAreaInsets();

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
      // ── Cửa sổ Modal PHẢI phủ cả dải thanh điều-hướng ────────────────────
      // `Modal` dựng CỬA SỔ RIÊNG, và cửa sổ đó KHÔNG thừa hưởng edge-to-edge của
      // cửa sổ chính: thiếu cờ này thì hệ điều hành chừa lại dải thanh điều-hướng,
      // nên lớp mờ lẫn tấm trượt đều dừng ở mép trên thanh đó. Tấm trượt vẫn sát
      // đáy CỬA SỔ, chỉ là cửa sổ không chạm đáy MÀN — dưới bảng lòi ra nguyên
      // thanh tab của màn phía sau. Nhìn ra là "bảng không dính đáy".
      // Đối chứng ảnh chụp máy thật 2026-09-08 (Redmi, 1080x2340, cử chỉ 48px):
      // trước khi bật cờ, thanh tab dưới bảng hiện NGUYÊN màu nền xanh đậm; sau
      // khi bật, chính dải đó bị lớp Acrylic của bảng phủ mờ tới sát vạch cử chỉ.
      // (Đừng lấy `uiautomator dump` làm bằng cho việc này: nó khai 2292 cho MỌI
      //  cửa sổ, kể cả cửa sổ chính đang edge-to-edge, nên 2292-vs-2340 không
      //  chứng minh được gì.)
      // `navigationBarTranslucent` cần `statusBarTranslucent` đi kèm (RN cảnh báo
      // ở Modal.js:194 nếu thiếu) — đã bật ở dòng trên.
      navigationBarTranslucent
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
          <Pressable
            onPress={() => undefined}
            style={[
              styles.inner,
              {
                maxHeight: winH * 0.86,
                paddingBottom: insets.bottom + BASE_PAD_BOTTOM,
              },
            ]}
          >
            <View style={styles.handle} />
            {!!title && (
              <View style={styles.head}>
                <Text style={styles.title}>{title}</Text>
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
            )}
            {/*
              Thân LUÔN nằm trong ScrollView. Trước đây `scroll` mặc định false nên
              hộp nào quên bật cờ (vd bước chọn kiểu phòng của CreateConversationModal,
              bốn hàng) là nội dung vượt trần bị XÉN CÂM — người dùng không biết còn
              mục ở dưới, cũng không cuộn tới được. `scrollEnabled` giữ nguyên ý cũ
              Cuộn LUÔN bật: nội dung vừa khung thì ScrollView không cuộn gì cả, nên
              không mất gì; cờ `scroll` nay chỉ còn nghĩa "đây là danh sách dài, cho
              phép chiếm hết chỗ còn lại".
            */}
            <ScrollView
              style={[styles.scrollBody, scroll && styles.scrollBodyGrow]}
              contentContainerStyle={[styles.scrollContent, contentStyle]}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
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

/** Đệm đáy tối thiểu khi máy không có thanh cử chỉ (inset = 0). */
const BASE_PAD_BOTTOM = Platform.OS === 'ios' ? SPACE.xl : SPACE.lg;

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
    // paddingBottom + maxHeight đặt inline (safe-area và chiều cao cửa sổ thật).
    flexShrink: 1,
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
  scrollBody: { flexGrow: 0, flexShrink: 1 },
  scrollBodyGrow: { flexGrow: 1 },
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
