// screens/OnboardingScreen.tsx
//
// MÀN CHÀO — hỏi-một-lần, bỏ qua được. Đứng giữa "Chọn ngôn ngữ" và "Đăng nhập".
//
// ── Vì sao dựng lại màn này ─────────────────────────────────────────────────
// App đã nằm trên hai cửa hàng từ v1.0 mà KHÔNG có chỗ nào nói Aladin là cái gì:
// người tải về thấy ngay màn đăng nhập sinh trắc, tức là được yêu cầu giao khuôn
// mặt/vân tay cho một cái tên chưa từng được giải thích. Ba màn onboarding cũ đã bị
// gỡ (xem khối `initServices` trong `navigation/index.tsx`). Đây là bản dựng lại,
// MỘT màn, cuộn được, bỏ qua được — không phải một chuỗi ba bước bắt bấm.
//
// ── Ranh giới ───────────────────────────────────────────────────────────────
// · Màn này KHÔNG hứa tính năng chưa có. Bốn khe module nêu ở đây (trace/chat/
//   work/join) đúng bằng bốn khe đang có trong khung điều hướng.
// · Câu về sinh trắc nói ĐÚNG cơ chế hiện tại: khuôn mặt/vân tay do máy điện thoại
//   giữ, app không gửi đi. Nếu điều đó đổi thì phải sửa câu ở `i18n/keys/onboarding.ts`
//   TRƯỚC khi đổi mã — chỗ này là lời hứa với người dùng, không phải chữ trang trí.
// · Ghi cờ đã-xem hỏng cũng vẫn đi tiếp (xem `utils/onboardingFlag.ts`): không được
//   giam người dùng ở màn giới thiệu vì một lần ghi đĩa thất bại.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import { useTk } from '../i18n/keys';
import { DEFAULT_INSTANCE } from '../config/instance.config';
import { markOnboardingSeen } from '../utils/onboardingFlag';
import { ALADIN_WEB_URL } from '../utils/webLink';

// Xanh lá KHỞI ĐỘNG — cùng bảng với màn Chọn ngôn ngữ và HERO màn Đăng nhập, để ba
// màn đầu tiên liền một mạch.
//
// NỢ ĐÃ BIẾT: ba giá trị này viết cứng, y như `LanguageSelectScreen.tsx` đang làm.
// Bảng token hiện KHÔNG có nhóm "màu khởi động của app" — xanh này trùng nhóm brand
// `work` (theme/tokens.ts:124-130) nhưng dùng nhóm đó ở màn chào là gán sai nghĩa
// (đây là vỏ app, không phải module Việc làm). Khi dựng thương hiệu thứ hai
// (TonFarm) phải thêm nhóm token khởi động và sửa CẢ BA màn cùng lúc — sửa lẻ một
// màn thì hai màn kia lệch màu mà không có gì báo.
const BRAND = {
  deep: '#1F5C2A',
  primary: '#2B7A39',
  pale: '#C8E3CE',
  // Còn lại lấy từ token — không có lý do gì viết cứng.
  white: COLORS.white,
  ink: COLORS.text,
  sub: COLORS.textSub,
  line: COLORS.border,
  card: COLORS.card,
};

// Bốn khe module — ĐÚNG bốn khe đang có trong khung điều hướng (trace/chat/work/join).
const SLOTS: ReadonlyArray<{ icon: string; title: string; body: string }> = [
  { icon: 'sprout-outline', title: 'onboarding.trace.title', body: 'onboarding.trace.body' },
  { icon: 'message-lock-outline', title: 'onboarding.chat.title', body: 'onboarding.chat.body' },
  { icon: 'briefcase-check-outline', title: 'onboarding.work.title', body: 'onboarding.work.body' },
  { icon: 'lightbulb-on-outline', title: 'onboarding.join.title', body: 'onboarding.join.body' },
];

const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tk = useTk();
  // Chặn bấm hai lần trong lúc đang ghi cờ — bấm đúp sẽ replace hai lần.
  const [leaving, setLeaving] = useState(false);

  const goOn = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    // Không chặn đường đi theo kết quả ghi: ghi hỏng thì lần sau thấy lại màn này,
    // chấp nhận được; giam người dùng ở đây thì không.
    await markOnboardingSeen();
    navigation.replace('Login');
  }, [leaving, navigation]);

  const openWeb = useCallback(() => {
    navigation.navigate('WebPage', { url: ALADIN_WEB_URL, title: 'aladin.work' });
  }, [navigation]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND.deep} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Đầu màn ───────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { paddingTop: insets.top + (Platform.OS === 'ios' ? 28 : 24) }]}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Image source={require('../../assets/images/logo.png')} style={styles.logoImg} />
            </View>
          </View>
          <Text allowFontScaling={false} style={styles.title}>{DEFAULT_INSTANCE.displayName}</Text>
          <Text style={styles.tagline}>{tk('onboarding.tagline')}</Text>
        </View>

        {/* ── Bốn khe module ────────────────────────────────────────────────── */}
        <View style={styles.body}>
          {SLOTS.map((s) => (
            <View key={s.title} style={styles.card}>
              <View style={styles.cardIcon}>
                <Icon name={s.icon} size={22} color={BRAND.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{tk(s.title)}</Text>
                <Text style={styles.cardBody}>{tk(s.body)}</Text>
              </View>
            </View>
          ))}

          {/* ── Câu về danh tính — chỗ người dùng đang được yêu cầu tin tưởng ── */}
          <View style={styles.identity}>
            <View style={styles.identityHead}>
              <Icon name="fingerprint" size={20} color={BRAND.deep} />
              <Text style={styles.identityTitle}>{tk('onboarding.identity.title')}</Text>
            </View>
            <Text style={styles.identityBody}>{tk('onboarding.identity.body')}</Text>
          </View>

          <TouchableOpacity onPress={openWeb} style={styles.webLink} activeOpacity={0.7}>
            <Icon name="open-in-new" size={16} color={BRAND.primary} />
            <Text style={styles.webLinkText}>{tk('onboarding.web')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Nút ───────────────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, leaving && styles.btnDim]}
            onPress={goOn}
            disabled={leaving}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>{tk('onboarding.start')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goOn} disabled={leaving} hitSlop={10}>
            <Text style={styles.skipText}>{tk('onboarding.skip')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.white },
  scroll: { flexGrow: 1 },

  hero: {
    backgroundColor: BRAND.deep,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  logoOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: BRAND.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: 52, height: 52, resizeMode: 'contain' },
  title: {
    marginTop: 14,
    fontSize: 26,
    fontWeight: '800',
    color: BRAND.white,
    letterSpacing: 0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.pale,
    textAlign: 'center',
  },

  body: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.line,
    backgroundColor: BRAND.card,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF6EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: BRAND.ink },
  cardBody: { marginTop: 3, fontSize: 13, lineHeight: 19, color: BRAND.sub },

  identity: {
    marginTop: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F3F8F4',
    borderWidth: 1,
    borderColor: '#DCEBDF',
  },
  identityHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identityTitle: { fontSize: 15, fontWeight: '700', color: BRAND.deep },
  identityBody: { marginTop: 6, fontSize: 13, lineHeight: 19, color: BRAND.sub },

  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  webLinkText: { fontSize: 13, fontWeight: '600', color: BRAND.primary },

  actions: { paddingHorizontal: 20, paddingTop: 4, alignItems: 'center', gap: 12 },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: BRAND.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDim: { opacity: 0.6 },
  primaryBtnText: { color: BRAND.white, fontSize: 16, fontWeight: '800' },
  skipText: { fontSize: 14, color: BRAND.sub, fontWeight: '600' },
});

export default OnboardingScreen;
