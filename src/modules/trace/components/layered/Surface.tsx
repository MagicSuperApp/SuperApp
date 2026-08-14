/**
 * Surface — các khối dựng sẵn của HỆ NHIỀU LỚP (xem `theme/depth.ts`).
 *
 * Màn hình chỉ nói "cái này nằm ở lớp mấy", không tự chọn nền/bo góc/đổ bóng.
 * Nhờ vậy mọi màn trong module Truy xuất trông như một sản phẩm, và muốn chỉnh
 * chiều sâu toàn module thì sửa MỘT chỗ.
 *
 *   <Ground>            L0 — mặt đất của trang
 *     <SectionHeader/>  L1 — tiêu đề mục, nằm thẳng trên nền
 *     <Card>            L2 — thẻ nổi
 *     <Sheet>           L3 — tấm trượt từ đáy
 *     <Dialog>          L4 — hộp thoại giữa màn
 */

import React from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../../../../components/Icon';
import {
  ELEVATION, ORGANIC_CARD, ORGANIC_HERO, ORGANIC_TILE,
  RADIUS, SPACE, SURFACE, TONE, TOUCH_MIN, TYPE,
} from '../../theme/depth';
import { GroundBackdrop } from './Organic';

// ---------------------------------------------------------------------------
// L0 — Mặt đất
// ---------------------------------------------------------------------------

/**
 * Nền của một màn. `backdrop` bật lớp mảng loang + lá phía sau (mặc định BẬT) —
 * đó là thứ làm module trông ra "vườn" chứ không ra "bảng dữ liệu".
 */
export const Ground: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  backdrop?: false | 'home' | 'list' | 'detail';
}> = ({ children, style, backdrop = 'home' }) => (
  <View style={[styles.ground, style]}>
    {backdrop ? <GroundBackdrop variant={backdrop} /> : null}
    {children}
  </View>
);

// ---------------------------------------------------------------------------
// L1 — Tiêu đề mục
// ---------------------------------------------------------------------------

/**
 * Tiêu đề một mục. `action` là chữ bấm được ở mép phải (vd "Xem tất cả").
 *
 * Không dùng chữ IN HOA cỡ nhỏ như bản cũ: in hoa xoá mất đường viền trên/dưới
 * của chữ nên mắt phải đọc từng ký tự — chậm hẳn với người lớn tuổi.
 */
export const SectionHeader: React.FC<{
  icon?: IconName;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, hint, actionLabel, onAction }) => (
  <View style={styles.sectionHeader}>
    {icon ? (
      <View style={styles.sectionIcon}>
        <Icon name={icon} size={17} color={TONE.primary} />
      </View>
    ) : null}
    <View style={styles.sectionText}>
      <Text style={TYPE.section} numberOfLines={1}>{title}</Text>
      {hint ? <Text style={[TYPE.caption, styles.sectionHint]} numberOfLines={1}>{hint}</Text> : null}
    </View>
    {actionLabel && onAction ? (
      <Pressable onPress={onAction} hitSlop={10} style={styles.sectionAction}>
        <Text style={styles.sectionActionTxt}>{actionLabel}</Text>
        <Icon name="chevron-right" size={12} color={TONE.primary} />
      </Pressable>
    ) : null}
  </View>
);

// ---------------------------------------------------------------------------
// L2 — Thẻ nổi
// ---------------------------------------------------------------------------

export const Card: React.FC<{
  children: React.ReactNode;
  /** Thẻ chính của trang → bóng xa hơn, góc lệch mạnh hơn (ra dáng viên cuội). */
  strong?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}> = ({ children, strong, onPress, style, padded = true }) => {
  const body = (
    <View
      style={[
        styles.card,
        strong ? ORGANIC_HERO : ORGANIC_CARD,
        strong ? ELEVATION.cardStrong : ELEVATION.card,
        padded && styles.cardPad,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
      android_ripple={{ color: TONE.primarySoft, borderless: false }}
    >
      {body}
    </Pressable>
  );
};

/** Hàng bấm được bên trong thẻ — cao tối thiểu bằng ngón tay đeo găng. */
export const CardRow: React.FC<{
  children: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}> = ({ children, onPress, last }) => {
  const inner = <View style={[styles.row, !last && styles.rowDivider]}>{children}</View>;
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: TONE.primarySoft }}>
      {inner}
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// L3 — Tấm trượt từ đáy
// ---------------------------------------------------------------------------

export const Sheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Cho nội dung cuộn khi dài hơn màn. */
  scroll?: boolean;
}> = ({ visible, onClose, title, children, scroll }) => {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Màn che: chạm ra ngoài là đóng — cách thoát mà ai cũng thử trước tiên. */}
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, ELEVATION.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.lg) }]}>
        <View style={styles.grabber} />
        {title ? <Text style={[TYPE.section, styles.sheetTitle]}>{title}</Text> : null}
        <Body {...(scroll ? { showsVerticalScrollIndicator: false } : {})}>{children}</Body>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// L4 — Hộp thoại
// ---------------------------------------------------------------------------

export const Dialog: React.FC<{
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
}> = ({ visible, onClose, title, children }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.scrim} onPress={onClose} />
    <View style={styles.dialogWrap} pointerEvents="box-none">
      <View style={[styles.dialog, ELEVATION.modal]}>
        <Text style={[TYPE.section, styles.dialogTitle]}>{title}</Text>
        {children}
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  ground: { flex: 1, backgroundColor: SURFACE.ground },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.page, marginBottom: SPACE.md,
  },
  sectionIcon: {
    width: 36, height: 36, ...ORGANIC_TILE,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TONE.primarySoft,
  },
  sectionText: { flex: 1, minWidth: 0 },
  sectionHint: { marginTop: 1 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingLeft: 8 },
  sectionActionTxt: { fontSize: 15, fontWeight: '700', color: TONE.primary },

  card: {
    backgroundColor: SURFACE.raised,
    marginHorizontal: SPACE.page,
    overflow: 'hidden',
  },
  cardPad: { padding: SPACE.lg },
  pressed: { opacity: 0.92 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    minHeight: TOUCH_MIN, paddingVertical: SPACE.md,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: TONE.border },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: SURFACE.scrim },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: '86%',
    backgroundColor: SURFACE.raised,
    borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: SPACE.page, paddingTop: SPACE.md,
  },
  grabber: {
    alignSelf: 'center', width: 44, height: 5, borderRadius: 3,
    backgroundColor: TONE.border, marginBottom: SPACE.md,
  },
  sheetTitle: { marginBottom: SPACE.md },

  dialogWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  dialog: {
    width: '100%', maxWidth: 420,
    backgroundColor: SURFACE.raised, borderRadius: RADIUS.modal, padding: SPACE.xl,
  },
  dialogTitle: { marginBottom: SPACE.md },
});
