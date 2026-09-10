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
  ELEVATION, GRADIENT, NATURE, ORGANIC_CARD, ORGANIC_HERO, ORGANIC_TILE,
  RADIUS, SPACE, SURFACE, TONE, TOUCH_MIN, TYPE,
  type GradientName,
} from '../../theme/depth';
import { GradientFill, GroundBackdrop } from './Organic';

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
// L2b — Lưới BENTO
// ---------------------------------------------------------------------------

/**
 * Bento là một LUẬT, không phải một kiểu trang trí. Luật đó có ba vế, và bỏ vế
 * nào thì phần còn lại chỉ là "thẻ bo góc xếp cạnh nhau":
 *
 *   1. MỖI Ô MỘT VIỆC. Ô nào trả lời được nhiều hơn một câu hỏi thì nó chưa
 *      phải một ô — nó là hai ô đang dính nhau.
 *   2. Ô TO HƠN NGHĨA LÀ QUAN TRỌNG HƠN. Kích thước là câu nói thẳng nhất trên
 *      một màn hình; ba ô bằng nhau nghĩa là "ba thứ này ngang nhau", và nói
 *      câu đó khi nó không đúng là chỗ bắt đầu của một màn rối.
 *   3. TRONG MỘT TRANG CHỈ MỘT Ô TỐI. Ô tối là dấu "khác loại". Hai cái là
 *      không cái nào còn là dấu.
 *
 * `BentoRow` chỉ lo khoảng cách; chiều rộng từng ô do `flex` của `BentoTile`
 * quyết định — đó là chỗ vế (2) được viết ra thành số.
 */
export const BentoRow: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ children, style }) => <View style={[styles.bentoRow, style]}>{children}</View>;

/**
 * Một ô của lưới.
 *
 * `tone` chọn nền chuyển sắc (xem `GRADIENT` trong `theme/depth.ts`). Nền được
 * vẽ bằng SVG nằm DƯỚI nội dung, nên ô phải `overflow: 'hidden'` — nếu không,
 * góc bo mất và chuyển sắc tràn ra ngoài mép.
 *
 * ⚠ `tone` có `onDark: true` thì chữ bên trong PHẢI là chữ sáng. Ô không tự đổi
 * màu chữ của con: nó không biết con là chữ, biểu tượng hay ảnh. Dùng `onDark`
 * từ token để chọn, đừng nhớ bằng đầu.
 */
export const BentoTile: React.FC<{
  children: React.ReactNode;
  tone?: GradientName;
  /** Phần chiều rộng trong hàng. 2 nghĩa là rộng gấp đôi ô `flex={1}` cạnh nó. */
  flex?: number;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ children, tone = 'tile', flex, onPress, padded = true, style }) => {
  const dark = GRADIENT[tone].onDark;
  const body = (
    <View
      style={[
        styles.bentoTile,
        ORGANIC_CARD,
        // Ô sáng cần viền tóc để có mép trên nền sáng; ô tối thì tự tách bằng
        // sắc độ, thêm viền chỉ làm nó trông như bị kẻ khung.
        dark ? ELEVATION.cardStrong : styles.bentoTileHairline,
        padded && styles.bentoTilePad,
        style,
      ]}
    >
      <GradientFill name={tone} />
      {children}
    </View>
  );
  const wrapped = flex != null ? <View style={{ flex }}>{body}</View> : body;
  if (!onPress) return wrapped;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [flex != null && { flex }, pressed && styles.pressed]}
      android_ripple={{ color: dark ? 'rgba(255,255,255,0.14)' : TONE.primarySoft, borderless: false }}
    >
      {body}
    </Pressable>
  );
};

/**
 * Ô SỐ LIỆU — con số lớn, nhãn nhỏ.
 *
 * Có mặt ở đây thay vì để mỗi màn tự dựng vì nó là chỗ dễ trượt nhất: một con số
 * ƯỚC TÍNH trình bày y hệt một con số ĐẾM ĐƯỢC là một lời nói dối im lặng. `hint`
 * là chỗ nói ra sự khác nhau đó, và nó nằm ngay dưới con số chứ không nằm trong
 * chú thích cuối trang — người liếc một cái rồi đi tiếp không đọc chú thích.
 */
export const BentoStat: React.FC<{
  icon: IconName;
  value: React.ReactNode;
  label: string;
  /** Ví dụ "ước tính". Bỏ trống khi con số là số đếm được. */
  hint?: string;
  tone?: GradientName;
  flex?: number;
  onPress?: () => void;
}> = ({ icon, value, label, hint, tone = 'tile', flex, onPress }) => {
  const dark = GRADIENT[tone].onDark;
  const fg = dark ? NATURE.paper : NATURE.bark;
  const fgSoft = dark ? 'rgba(255,255,255,0.78)' : NATURE.barkSoft;
  return (
    <BentoTile tone={tone} flex={flex} onPress={onPress}>
      <Icon name={icon} size={18} color={dark ? NATURE.paper : TONE.primary} />
      <Text style={[TYPE.metricSm, styles.bentoStatVal, { color: fg }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[TYPE.caption, { color: fgSoft }]} numberOfLines={1}>{label}</Text>
      {hint ? (
        <Text style={[styles.bentoStatHint, { color: fgSoft }]} numberOfLines={1}>{hint}</Text>
      ) : null}
    </BentoTile>
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

  bentoRow: { flexDirection: 'row', gap: SPACE.md, paddingHorizontal: SPACE.page },
  bentoTile: {
    // `overflow: 'hidden'` KHÔNG phải tuỳ chọn: nền chuyển sắc là một lớp SVG
    // trải kín nằm dưới nội dung, thiếu dòng này thì nó tràn qua góc bo.
    overflow: 'hidden',
    flex: 1,
    justifyContent: 'center',
    backgroundColor: SURFACE.raised,
  },
  bentoTileHairline: { borderWidth: 1, borderColor: TONE.border },
  bentoTilePad: { padding: SPACE.lg },
  bentoStatVal: { marginTop: SPACE.sm, marginBottom: 2 },
  bentoStatHint: { fontSize: 12, marginTop: 1, fontStyle: 'italic' },

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
