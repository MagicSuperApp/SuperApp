// screens/LanguageSelectScreen.tsx
//
// MÀN ĐẦU TIÊN khi máy VỪA CÀI — hỏi ngôn ngữ trước cả màn Đăng nhập.
// Chỉ hiện MỘT lần: sau khi bấm Tiếp tục, lựa chọn được ghi xuống AsyncStorage
// (i18n/store) nên lần mở app sau vào thẳng Đăng nhập. Đổi lại về sau ở
// Tài khoản → Cài đặt → Ngôn ngữ, hoặc nút cờ ở góc màn Đăng nhập.
//
// NGUYÊN TẮC TRÌNH BÀY: màn này KHÔNG được phụ thuộc vào việc người dùng đọc
// được tiếng Việt — họ chưa chọn ngôn ngữ nào cả. Vì vậy:
//   · mỗi mục ghi TÊN NGÔN NGỮ BẰNG CHÍNH NÓ (Tiếng Việt · English · 中文);
//   · tiêu đề in cả ba thứ tiếng;
//   · nhãn nút Tiếp tục đổi theo mục đang chọn (xem CONTINUE_LABEL).
// Nhờ vậy không có chữ nào cần bản dịch — đây là màn DUY NHẤT trong app cố ý
// không đi qua từ điển i18n.

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { LANGUAGES, getLanguage, setLanguage, type LangCode } from '../i18n';

// Xanh lá thương hiệu — khớp HERO của màn Đăng nhập để hai màn liền mạch.
const BRAND = {
  deep: '#1F5C2A',
  primary: '#2B7A39',
  pale: '#C8E3CE',
  white: '#FFFFFF',
};

// Nhãn nút Tiếp tục viết bằng chính ngôn ngữ đang chọn.
const CONTINUE_LABEL: Record<LangCode, string> = {
  vi: 'Tiếp tục',
  en: 'Continue',
  zh: '继续',
  ja: '続ける',
};

// Câu phụ dưới nút, cũng theo ngôn ngữ đang chọn: cho biết đổi lại được ở đâu.
const HINT: Record<LangCode, string> = {
  vi: 'Đổi lại bất cứ lúc nào ở Tôi → Cài đặt → Ngôn ngữ.',
  en: 'You can change this any time in Me → Settings → Language.',
  zh: '你可以随时在 我 → 设置 → 语言 中更改。',
  ja: 'マイページ → 設定 → 言語 でいつでも変更できます。',
};

const LanguageSelectScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  // Chọn TẠI CHỖ (chưa ghi) để người dùng xem trước rồi mới xác nhận. Mặc định
  // là ngôn ngữ đang chạy ('vi' khi máy mới cài).
  const [picked, setPicked] = useState<LangCode>(getLanguage());

  const confirm = () => {
    // force: bấm Tiếp tục mà không đổi gì vẫn phải ghi nhận "đã chọn", nếu không
    // lần mở app sau lại rơi vào màn này.
    setLanguage(picked, true);
    // replace: màn hỏi-một-lần không nên nằm lại trong ngăn xếp (bấm back từ
    // Đăng nhập sẽ quay lại đây).
    navigation.replace('Login');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND.deep} />

      {/* ── Đầu màn: logo + tiêu đề ba thứ tiếng ───────────────────────────── */}
      <View style={[styles.hero, { paddingTop: insets.top + (Platform.OS === 'ios' ? 28 : 24) }]}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.logoImg}
            />
          </View>
        </View>
        <Text allowFontScaling={false} style={styles.eyebrow}>ALADINN</Text>
        <Text allowFontScaling={false} style={styles.title}>{
            picked === 'vi' ? 'Cài đặt ngôn ngữ' : picked === 'en' ? 'Select language' : '选择语言'
        }</Text>
      </View>

      {/* ── Danh sách ngôn ngữ ─────────────────────────────────────────────── */}
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.handle} />

        {LANGUAGES.map((lang) => {
          const active = lang.code === picked;
          return (
            <TouchableOpacity
              key={lang.code}
              activeOpacity={0.85}
              onPress={() => setPicked(lang.code)}
              style={[styles.row, active && styles.rowActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={lang.endonym}
            >
              <Text style={styles.flag} allowFontScaling={false}>{lang.flag}</Text>
              <Text
                allowFontScaling={false}
                style={[styles.endonym, active && styles.endonymActive]}
              >
                {lang.endonym}
              </Text>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <Icon name="check" size={14} color={BRAND.white} />}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.cta} activeOpacity={0.88} onPress={confirm}>
          <Text allowFontScaling={false} style={styles.ctaText}>{CONTINUE_LABEL[picked]}</Text>
          <Icon name="arrow-right" size={18} color={BRAND.white} />
        </TouchableOpacity>

        <Text allowFontScaling={false} style={styles.hint}>{HINT[picked]}</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.deep },

  hero: { paddingHorizontal: 26, paddingBottom: 34 },
  logoOuter: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  logoInner: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    padding: 3,
  },
  logoImg: { width: 50, height: 50, borderRadius: 9 },
  eyebrow: { fontSize: 10, fontWeight: '800', color: BRAND.pale, letterSpacing: 3, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: BRAND.white, letterSpacing: -0.6 },
  titleAlt: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 6, lineHeight: 19 },

  sheet: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: { paddingHorizontal: 22, paddingTop: 14 },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: 20,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, paddingHorizontal: 16,
    borderRadius: 16, borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginBottom: 10,
  },
  rowActive: { borderColor: BRAND.primary, backgroundColor: COLORS.bgWarm },
  flag: { fontSize: 26 },
  endonym: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2 },
  endonymActive: { color: BRAND.deep, fontWeight: '800' },
  radio: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: BRAND.primary, backgroundColor: BRAND.primary },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 18, paddingVertical: 16, borderRadius: 16,
    backgroundColor: BRAND.primary,
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 14,
    elevation: 5,
  },
  ctaText: { color: BRAND.white, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  hint: {
    marginTop: 14, textAlign: 'center',
    fontSize: 11.5, lineHeight: 17, color: COLORS.textMuted,
  },
});

export default LanguageSelectScreen;
