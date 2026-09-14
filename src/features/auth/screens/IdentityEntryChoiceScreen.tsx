// features/auth/screens/IdentityEntryChoiceScreen.tsx
//
// CỬA VÀO khi máy CHƯA có danh tính nào: hỏi MỘT câu, rồi rẽ ba lối.
//
// ── Chỗ hỏng màn này bịt ────────────────────────────────────────────────────
// Trước bản này, nút sinh trắc ở `LoginScreen` — nút tròn, xanh, to nhất màn,
// KHÔNG một chữ nào — khi máy chưa có danh tính thì đi THẲNG sang
// `SignUpBiometric`. Người dùng chọn một trong ba luồng mà không được hỏi lấy
// một câu, và hai trong ba lựa chọn là lựa chọn SAI với họ:
//
//   A. chưa từng dùng app nào của hệ           → tạo danh tính mới
//   B. CÙNG app, MÁY KHÁC (đổi máy / cài lại)  → 24 từ
//   C. CÙNG máy, APP KHÁC của hệ               → 24 từ, app kia bị đăng xuất
//   D. có một app/máy ĐANG đăng nhập trong tay → nhờ nó ký duyệt (issue #233)
//
// Đi nhầm sang A là sinh một DID THỨ HAI cho cùng một người. `farmService` lấy
// `owner_did` từ phiên, nên danh sách vườn hiện RỖNG — và rỗng trùng khớp với
// "tôi chưa ghi gì", nên nó không phải triệu chứng, nó là một hiểu lầm. Bước
// tiếp theo rất dễ là nhập lại toàn bộ vườn dưới DID thứ hai; dữ liệu chia đôi
// vĩnh viễn.
//
// ── Ba ràng buộc của màn này, đừng gỡ ───────────────────────────────────────
// 1. KHÔNG nút nào không chữ. Nút tròn chỉ-icon hợp lệ ở `LoginScreen` khi máy
//    ĐÃ có danh tính (lúc đó nó chỉ làm một việc: mở khoá). Ở đây nó sẽ là một
//    câu hỏi không có chữ, tức đúng cái hỏng đang sửa.
// 2. Mỗi lối rẽ nói HỆ QUẢ, không chỉ nói tên. B và C đều dẫn tới
//    `identity.recoverDevice`; máy chủ tăng `users.token_epoch` mỗi lần khôi
//    phục rồi bác MỌI phiên mang epoch cũ (xem khối chú thích trên
//    `handleRestore` ở `screens/RestoreIdentityScreen.tsx`). Cái giá đó phải
//    hiện TRƯỚC khi người dùng chọn, không phải sau.
// 3. Chuỗi nằm ở `i18n/keys/identity.ts`, đủ bốn thứ tiếng. Không rải chữ ở đây.
// 4. Bốn lối MANG BỐN MÀU, và lối "người mới" mang màu XANH LÁ. Trước
//    2026-09-14 bốn thẻ giống hệt nhau — cùng nền trắng, cùng viền xám, cùng ô
//    biểu tượng lam — nên phải đọc hết bốn khối chữ mới chọn được, ở đúng màn
//    mà chọn sai thì chia đôi dữ liệu vĩnh viễn. Màu ở đây không phải trang
//    trí: nó là thứ đọc được trước khi chữ kịp được đọc. Xem `AUTH_TOKENS`.
//
// Lối C vẫn dẫn sang màn 24 từ. Đường "app cũ ký phê duyệt" NAY ĐÃ CÓ, nhưng nó
// là một lối RIÊNG (lối D) chứ không thay được lối C: lối D đòi máy/app kia đang
// mở được trong tay, còn lối C phục vụ cả người không có điều kiện đó.

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { AUTH_BLUE, AUTH_WARN } from '../theme';
import { useTk } from '../../../i18n/keys';

/**
 * TÔNG của một lối rẽ: màu biểu tượng, ô nền sau biểu tượng, viền thẻ.
 *
 * Ba giá trị, không một giá trị: một mình màu biểu tượng thì cái chấm màu quá
 * nhỏ để nhận ra khi lướt, còn tô cả thẻ thì bốn thẻ thành bốn mảng màu và màn
 * đọc như một bảng quảng cáo. Ô biểu tượng là chỗ đủ lớn để thấy ngay mà vẫn
 * giữ được nền trắng cho chữ.
 */
type Tone = { icon: string; bg: string; border: string };

/** Một lối rẽ. `cost` chỉ có ở lối phải trả giá — không bịa giá cho lối không có. */
type Choice = {
  testID: string;
  icon: string;
  tone: Tone;
  titleKey: string;
  bodyKey: string;
  costKey?: string;
  noteKey?: string;
  target: 'SignUpBiometric' | 'RestoreIdentity' | 'DevicePair';
  /** Tham số điều hướng. Chỉ lối ghép máy cần — nó dùng CHUNG màn với vai quét. */
  params?: Record<string, unknown>;
  /**
   * Thẻ được tô cả nền và viền đậm, thay vì chỉ có ô biểu tượng màu.
   *
   * Chỉ ĐÚNG MỘT lối được đặt cờ này, và đó là lối an toàn. Đặt cho lối thứ hai
   * là hỏng chính thứ nó làm: nổi bật là một thứ TƯƠNG ĐỐI, hai thẻ cùng nổi
   * bật thì không thẻ nào nổi bật.
   */
  noiBat?: boolean;
};

// Bốn tông, đọc từ tầng token (`theme/tokens.ts#AUTH_TOKENS`) — không gõ hex ở
// đây: Integration-Standard §2.1, và bảng cửa vào từng có đúng lỗi ấy một lần.
const TONE_AN_TOAN: Tone = {
  icon: AUTH_BLUE.safeIcon, bg: AUTH_BLUE.safeBg, border: AUTH_BLUE.safeBorder,
};
const TONE_DOI_MAY: Tone = {
  icon: AUTH_BLUE.moveIcon, bg: AUTH_BLUE.moveBg, border: AUTH_BLUE.moveBorder,
};
const TONE_APP_KHAC: Tone = {
  icon: AUTH_BLUE.swapIcon, bg: AUTH_BLUE.swapBg, border: AUTH_BLUE.swapBorder,
};
const TONE_GHEP_MAY: Tone = {
  icon: AUTH_BLUE.pairIcon, bg: AUTH_BLUE.pairBg, border: AUTH_BLUE.pairBorder,
};

// Thứ tự CÓ Ý: lối "người mới" đứng đầu vì nó là lối duy nhất KHÔNG phá gì cả.
// Hai lối dưới đều thu hồi phiên ở nơi khác, nên chúng đứng sau và mang theo
// dòng `cost` của mình.
const CHOICES: Choice[] = [
  {
    testID: 'entry-choice-new',
    icon: 'account-plus-outline',
    // XANH LÁ, và là thẻ duy nhất được tô cả nền: nó là lối KHÔNG mất gì. Ba lối
    // dưới đều đổi trạng thái ở nơi khác — hai lối thu hồi phiên, một lối thêm
    // khoá vào DID — nên không lối nào trong ba được mang màu này.
    tone: TONE_AN_TOAN,
    noiBat: true,
    titleKey: 'identity.gate.new.title',
    bodyKey: 'identity.gate.new.body',
    target: 'SignUpBiometric',
  },
  {
    testID: 'entry-choice-same-app',
    icon: 'cellphone-arrow-down',
    tone: TONE_DOI_MAY,
    titleKey: 'identity.gate.sameApp.title',
    bodyKey: 'identity.gate.sameApp.body',
    costKey: 'identity.gate.sameApp.cost',
    target: 'RestoreIdentity',
  },
  {
    testID: 'entry-choice-other-app',
    icon: 'apps',
    tone: TONE_APP_KHAC,
    titleKey: 'identity.gate.otherApp.title',
    bodyKey: 'identity.gate.otherApp.body',
    costKey: 'identity.gate.otherApp.cost',
    noteKey: 'identity.gate.otherApp.temporary',
    target: 'RestoreIdentity',
  },
  // Lối D — issue #233. Đứng CUỐI dù nó là lối rẻ nhất, vì nó có một điều kiện
  // ngoài tầm app: máy kia phải đang trong tay và mở được. Ai không có điều kiện
  // đó mà đọc nó đầu tiên thì mất thời gian rồi mới quay về ba lối trên.
  //
  // KHÔNG có `costKey`: `POST /keys/authorize` THÊM một khoá vào DID, không thu
  // hồi khoá nào — khác hẳn B và C, vốn đi qua `recoverDevice` và nâng
  // `users.token_epoch`. Bịa một cái giá ở đây là nói sai theo chiều ngược lại.
  {
    testID: 'entry-choice-pair',
    icon: 'cellphone-link',
    tone: TONE_GHEP_MAY,
    titleKey: 'identity.gate.pair.title',
    bodyKey: 'identity.gate.pair.body',
    noteKey: 'identity.gate.pair.note',
    target: 'DevicePair',
    params: { mode: 'show' },
  },
];

const IdentityEntryChoiceScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const tk = useTk();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_BLUE.bgSoft} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{tk('identity.gate.title')}</Text>
        <Text style={styles.intro}>{tk('identity.gate.intro')}</Text>

        {CHOICES.map(choice => (
          <TouchableOpacity
            key={choice.testID}
            testID={choice.testID}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={tk(choice.titleKey)}
            onPress={() =>
              choice.params
                ? navigation.navigate(choice.target, choice.params)
                : navigation.navigate(choice.target)
            }
            style={[
              styles.card,
              { borderColor: choice.tone.border },
              // Thẻ nổi bật: nền tô nhạt + viền dày hơn. Hai dấu hiệu chứ không
              // một, vì một mình màu thì người không phân biệt được hue chỉ thấy
              // bốn thẻ y hệt nhau — đúng cái màn này đang sửa.
              choice.noiBat && styles.cardNoiBat,
              choice.noiBat && { backgroundColor: choice.tone.bg },
            ]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: choice.tone.bg }]}>
                <Icon name={choice.icon} size={20} color={choice.tone.icon} />
              </View>
              <Text style={styles.cardTitle}>{tk(choice.titleKey)}</Text>
              <Icon name="chevron-right" size={20} color={AUTH_BLUE.textMuted} />
            </View>

            <Text style={styles.cardBody}>{tk(choice.bodyKey)}</Text>

            {choice.costKey ? (
              <View style={styles.costRow}>
                <Icon name="alert-outline" size={14} color={AUTH_WARN.icon} />
                <Text style={styles.costText}>{tk(choice.costKey)}</Text>
              </View>
            ) : null}

            {choice.noteKey ? (
              <Text style={styles.noteText}>{tk(choice.noteKey)}</Text>
            ) : null}
          </TouchableOpacity>
        ))}

        {/* Đường quay lại — màn này mở từ `LoginScreen`, phải về được chỗ cũ. */}
        <TouchableOpacity
          testID="entry-choice-back"
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={tk('identity.gate.back')}
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Icon name="arrow-left" size={16} color={AUTH_BLUE.textSub} />
          <Text style={styles.backText}>{tk('identity.gate.back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_BLUE.bgSoft },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'ios' ? 72 : 46,
    paddingBottom: 36,
  },

  title: {
    fontSize: 22, fontWeight: '800',
    color: AUTH_BLUE.text, letterSpacing: -0.4,
    lineHeight: 30, marginBottom: 10,
  },
  intro: {
    fontSize: 13, color: AUTH_BLUE.textSub,
    lineHeight: 19, marginBottom: 22,
  },

  // `borderColor` bị ghi đè theo tông ở chỗ dùng; giá trị ở đây là nền lùi.
  card: {
    backgroundColor: AUTH_BLUE.white,
    borderRadius: 16,
    borderWidth: 1.5, borderColor: AUTH_BLUE.border,
    padding: 16,
    marginBottom: 14,
  },
  /** Viền dày hơn ba thẻ kia. Màu đến từ tông, đặt ở chỗ dùng. */
  cardNoiBat: { borderWidth: 2 },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 8,
  },
  // Nền ô lấy theo TÔNG của từng lối (đặt tại chỗ dùng). `glowSoft` cũ để lại
  // đây làm nền lùi cho trường hợp một lối mới quên khai tông.
  cardIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: AUTH_BLUE.glowSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 15, fontWeight: '800',
    color: AUTH_BLUE.text, letterSpacing: -0.2,
    lineHeight: 20,
  },
  cardBody: {
    fontSize: 12, color: AUTH_BLUE.textSub, lineHeight: 18,
  },
  costRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: AUTH_WARN.bg,
    borderRadius: 10,
    borderWidth: 1, borderColor: AUTH_WARN.border,
    paddingHorizontal: 10, paddingVertical: 9,
    marginTop: 10,
  },
  costText: {
    flex: 1,
    fontSize: 11, color: AUTH_WARN.text, lineHeight: 16, fontWeight: '600',
  },
  noteText: {
    fontSize: 11, color: AUTH_BLUE.textMuted,
    lineHeight: 16, marginTop: 8,
  },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginTop: 6,
  },
  backText: {
    fontSize: 13, fontWeight: '700', color: AUTH_BLUE.textSub,
  },
});

export default IdentityEntryChoiceScreen;
