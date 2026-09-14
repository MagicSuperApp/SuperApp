// screens/TermsScreen.tsx — Điều khoản & Chính sách, mở được NGAY TRONG ứng dụng.
//
// Vì sao màn này tồn tại chứ không phải một liên kết ra trình duyệt: Google Play đòi phần
// tiết lộ dữ liệu phải mở được trong ứng dụng, và người dùng ngoài vườn thường không có
// mạng đủ khoẻ để tải một trang web. Nội dung gắn trong bản dựng nên đọc được cả khi mất
// mạng — đó là chủ ý, không phải tiện tay.
//
// Nội dung nằm ở `src/legal/policyContent.ts`. Sửa mã mà đổi dữ liệu thu thập thì phải
// sửa file đó — đọc chú thích đầu file trước khi sửa.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLORS } from '../constants';
import { useLanguage } from '../i18n';
import { policyFor } from '../legal/policyContent';

const TermsScreen = () => {
  const navigation = useNavigation<any>();
  // useLanguage() để màn vẽ lại khi người dùng đổi ngôn ngữ trong lúc đang đọc.
  const lang = useLanguage();
  const doc = policyFor(lang);
  // Màn này KHÔNG có thanh tiêu đề của navigator (`headerShown: false`), nên nó
  // tự chịu trách nhiệm chừa lề trên. Thiếu chỗ này thì nút Quay lại nằm lọt
  // trong vùng thanh trạng thái: đo trên iPhone 17 ở giả lập, nó đè lên đồng hồ
  // và cú chạm vào đó bị hệ điều hành nuốt làm thao tác "cuộn lên đầu" — nút vẫn
  // vẽ ra, trông bấm được, mà không bao giờ lùi được. Lấy số thật từ thiết bị
  // chứ không gõ một hằng: tai thỏ mỗi máy một cỡ.
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Icon name="arrow-left" size={20} color={COLORS.textSub} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.effective}>{doc.effective}</Text>
          <Text style={styles.intro}>{doc.intro}</Text>
        </View>

        {doc.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>{s.heading}</Text>
            </View>
            <View style={styles.card}>
              {s.body.map((p, i) => {
                const bullet = p.startsWith('• ');
                return (
                  <Text
                    key={i}
                    style={[styles.para, bullet && styles.paraBullet, i === 0 && styles.paraFirst]}
                  >
                    {p}
                  </Text>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.footerSpace} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  header: { marginTop: 18, marginBottom: 22 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  effective: { marginTop: 6, fontSize: 12, color: COLORS.textMuted },
  intro: { marginTop: 12, fontSize: 14, lineHeight: 21, color: COLORS.textSub },

  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.accent,
    marginRight: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  para: { marginTop: 10, fontSize: 13.5, lineHeight: 21, color: COLORS.textSub },
  paraFirst: { marginTop: 0 },
  paraBullet: { paddingLeft: 4 },

  footerSpace: { height: 24 },
});

export default TermsScreen;
