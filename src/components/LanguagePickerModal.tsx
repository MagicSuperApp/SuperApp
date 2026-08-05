// components/LanguagePickerModal.tsx
//
// POPUP CHỌN NGÔN NGỮ — Việt · Anh · Trung. Đổi là ÁP DỤNG NGAY cho toàn app
// (mọi <Text> đăng ký lớp dịch ở src/i18n/autoText, không cần khởi động lại,
// không mất ngăn xếp điều hướng đang mở).
//
// Danh sách ngôn ngữ lấy từ LANGUAGES (src/i18n/types) — thêm thị trường mới chỉ
// cần thêm một dòng ở đó, màn này tự có thêm mục.
//
// Mỗi mục hiển thị TÊN VIẾT BẰNG CHÍNH NGÔN NGỮ ĐÓ (English / 中文 / Tiếng Việt):
// người đang lỡ đặt sai ngôn ngữ vẫn nhận ra dòng của mình mà quay lại.

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../constants';
import { LANGUAGES, getLanguage, setLanguage, useLanguage, type LangCode } from '../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const LanguagePickerModal: React.FC<Props> = ({ visible, onClose }) => {
  // Đăng ký để dấu ✓ nhảy sang mục vừa chọn ngay trong lúc popup còn mở.
  const current = useLanguage();

  const pick = (code: LangCode) => {
    if (code !== getLanguage()) setLanguage(code);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        {/* Chặn sự kiện chạm rơi xuống backdrop khi bấm trong tấm nội dung. */}
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Chọn ngôn ngữ</Text>
          <Text style={styles.subtitle}>
            Áp dụng cho toàn bộ ứng dụng. Tên riêng và thuật ngữ giữ nguyên.
          </Text>

          {LANGUAGES.map((lang, i) => {
            const active = lang.code === current;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.row, i === LANGUAGES.length - 1 && styles.rowLast, active && styles.rowActive]}
                activeOpacity={0.75}
                onPress={() => pick(lang.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={styles.flag} allowFontScaling={false}>{lang.flag}</Text>
                {/* Endonym KHÔNG nằm trong từ điển nên đi qua lớp dịch vẫn nguyên văn. */}
                <Text style={[styles.endonym, active && styles.endonymActive]}>{lang.endonym}</Text>
                {active && <Icon name="check-circle" size={20} color={COLORS.accent} />}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.closeText}>Đóng</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  rowLast: { marginBottom: 0 },
  rowActive: {
    borderColor: COLORS.accentLight,
    backgroundColor: COLORS.bgWarm,
  },
  flag: { fontSize: 22 },
  endonym: { flex: 1, fontSize: 15.5, fontWeight: '600', color: COLORS.text },
  endonymActive: { color: COLORS.accent, fontWeight: '800' },
  close: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  closeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    ...Platform.select({ ios: { letterSpacing: -0.2 }, default: {} }),
  },
});

export default LanguagePickerModal;
