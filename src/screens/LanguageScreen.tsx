// screens/LanguageScreen.tsx
//
// Chọn ngôn ngữ quốc gia. Tiếng Anh KHÔNG nằm trong danh sách vì nó là chuẩn — luôn
// hiển thị ở dòng trên, không phải một lựa chọn ngang hàng (quy ước anh Aladin chốt,
// spec SG9 §5.2).
//
// Mỗi dòng ghi tên ngôn ngữ BẰNG CHÍNH NGÔN NGỮ ĐÓ. Người mở màn này thường là người
// đang lạc trong một giao diện họ không đọc được — ghi "Tiếng Trung" thì đúng người cần
// nó nhất lại không tìm ra.

import * as React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { NEUTRAL } from '../shared/theme';
import {
  SUPPORTED_LANGS,
  LANG_ENDONYM,
  setNationalLanguage,
  type LangCode,
} from '../i18n/languages';
import { useNationalLanguage } from '../i18n/useNationalLanguage';

// Câu giải thích ở mỗi ngôn ngữ, để người không đọc được tiếng Việt vẫn hiểu chuyện gì
// đang xảy ra khi họ chạm vào.
const HINT: Record<LangCode, string> = {
  vi: 'Chữ tiếng Anh vẫn hiện cùng lúc.',
  zh: '英文将同时显示。',
  ja: '英語も併せて表示されます。',
};

const LanguageScreen: React.FC = () => {
  const navigation = useNavigation();
  const current = useNationalLanguage();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <Icon name="chevron-left" size={28} color={NEUTRAL.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ngôn ngữ · Language</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {SUPPORTED_LANGS.map(code => {
          const selected = code === current;
          return (
            <TouchableOpacity
              key={code}
              style={[styles.row, selected && styles.rowSelected]}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={LANG_ENDONYM[code]}
              onPress={() => {
                // Không chờ ghi đĩa xong mới đổi: `setNationalLanguage` đổi giá trị và
                // báo cho giao diện NGAY, phần nhớ vào máy chạy sau. Người dùng thấy
                // chữ đổi tức thì, đó là phản hồi họ cần.
                void setNationalLanguage(code);
              }}
            >
              <View style={styles.rowText}>
                <Text style={styles.langName}>{LANG_ENDONYM[code]}</Text>
                <Text style={styles.langHint}>{HINT[code]}</Text>
              </View>
              {selected && <Icon name="check" size={22} color="#2e7d32" />}
            </TouchableOpacity>
          );
        })}

        <Text style={styles.note}>
          Một số phần trong ứng dụng còn đang được dịch. Chỗ nào chưa có, ứng dụng hiện
          tiếng Anh để bạn không gặp ô trống.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: NEUTRAL.border,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: NEUTRAL.text },
  body: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    backgroundColor: NEUTRAL.card,
  },
  rowSelected: { borderColor: '#2e7d32', borderWidth: 2 },
  rowText: { flex: 1, gap: 2 },
  langName: { fontSize: 17, fontWeight: '600', color: NEUTRAL.text },
  langHint: { fontSize: 13, color: NEUTRAL.textSub },
  note: { marginTop: 12, fontSize: 13, lineHeight: 19, color: NEUTRAL.textSub },
});

export default LanguageScreen;
