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
//
// Lối C hôm nay dẫn TẠM sang cùng màn 24 từ: đường "app cũ ký phê duyệt" chưa
// tồn tại. Màn nói thẳng điều đó thay vì để người dùng tưởng đã có đường riêng.

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { AUTH_BLUE, AUTH_WARN } from '../theme';
import { useTk } from '../../../i18n/keys';

/** Một lối rẽ. `cost` chỉ có ở lối phải trả giá — không bịa giá cho lối không có. */
type Choice = {
  testID: string;
  icon: string;
  titleKey: string;
  bodyKey: string;
  costKey?: string;
  noteKey?: string;
  target: 'SignUpBiometric' | 'RestoreIdentity';
};

// Thứ tự CÓ Ý: lối "người mới" đứng đầu vì nó là lối duy nhất KHÔNG phá gì cả.
// Hai lối dưới đều thu hồi phiên ở nơi khác, nên chúng đứng sau và mang theo
// dòng `cost` của mình.
const CHOICES: Choice[] = [
  {
    testID: 'entry-choice-new',
    icon: 'account-plus-outline',
    titleKey: 'identity.gate.new.title',
    bodyKey: 'identity.gate.new.body',
    target: 'SignUpBiometric',
  },
  {
    testID: 'entry-choice-same-app',
    icon: 'cellphone-arrow-down',
    titleKey: 'identity.gate.sameApp.title',
    bodyKey: 'identity.gate.sameApp.body',
    costKey: 'identity.gate.sameApp.cost',
    target: 'RestoreIdentity',
  },
  {
    testID: 'entry-choice-other-app',
    icon: 'apps',
    titleKey: 'identity.gate.otherApp.title',
    bodyKey: 'identity.gate.otherApp.body',
    costKey: 'identity.gate.otherApp.cost',
    noteKey: 'identity.gate.otherApp.temporary',
    target: 'RestoreIdentity',
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
            onPress={() => navigation.navigate(choice.target)}
            style={styles.card}
          >
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                <Icon name={choice.icon} size={20} color={AUTH_BLUE.primary} />
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

  card: {
    backgroundColor: AUTH_BLUE.white,
    borderRadius: 16,
    borderWidth: 1.5, borderColor: AUTH_BLUE.border,
    padding: 16,
    marginBottom: 14,
  },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 8,
  },
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
