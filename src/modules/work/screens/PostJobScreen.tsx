// modules/work/screens/PostJobScreen.tsx
// Form đăng tin tuyển thợ — mock submit.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { CATEGORIES } from '../data/mockData';
import { usePostJob } from '../hooks/usePostJob';

const PostJobScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [location, setLocation] = useState('');
  const [urgent, setUrgent] = useState(false);

  // Đăng tin: flag ON → POST /jobs thật; OFF → giả lập thành công.
  const { submitting, submit } = usePostJob();

  const canSubmit = title.length >= 10 && !!category && description.length >= 20 && !!budget && !!location;

  const handleSubmit = async () => {
    if (!canSubmit || !category) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ các ô bắt buộc.');
      return;
    }
    // Map form → body backend. LƯU Ý: form chưa có bước chọn JobType riêng →
    // tạm dùng categoryId làm templateKey. Nếu backend trả 404 NO_TEMPLATE,
    // báo user chọn đúng loại việc (JobType) khi bước chọn mẫu được bổ sung.
    const priceVND = Number(String(budget).replace(/[^\d]/g, '')) || undefined;
    const ok = await submit({
      templateKey: category,
      title,
      desc: description,
      priceVND,
    });

    if (ok) {
      Alert.alert(
        'Đăng tin thành công',
        'Tin của bạn đã được ký số bằng PhoenixKey và đăng lên Aladin Work.\n\nThợ phù hợp sẽ liên hệ qua Aladin Chat trong vài phút.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } else {
      Alert.alert(
        'Chưa đăng được tin',
        'Không gửi được tin lúc này. Kiểm tra kết nối, đăng nhập PhoenixKey và loại việc rồi thử lại.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Đăng tin đặt thợ</Text>
          <Text style={styles.headerSub}>Mô tả công việc, hệ thống gợi ý thợ phù hợp</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.field}>
          <Label text="Tiêu đề công việc" required />
          <TextInput
            style={styles.input}
            placeholder="VD: Cần thợ điện sửa đường dây tầng 2"
            placeholderTextColor={COLORS.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Text style={styles.hint}>{title.length}/80 ký tự</Text>
        </View>

        <View style={styles.field}>
          <Label text="Ngành nghề" required />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catList}
          >
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={[
                  styles.catItem,
                  category === c.id && { backgroundColor: c.color, borderColor: c.color },
                ]}
              >
                <Icon name={c.icon} size={16} color={category === c.id ? '#fff' : c.color} />
                <Text style={[
                  styles.catItemText,
                  category === c.id && { color: '#fff' },
                ]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.field}>
          <Label text="Mô tả chi tiết" required />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Mô tả công việc, dụng cụ cần, yêu cầu kỹ năng…"
            placeholderTextColor={COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.hint}>{description.length}/500 — tối thiểu 20 ký tự</Text>
        </View>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Label text="Ngân sách (VND)" required />
            <View style={styles.inputIconWrap}>
              <Icon name="cash" size={16} color={WORK_THEME.primary} />
              <TextInput
                style={styles.inputIcon}
                placeholder="500.000"
                placeholderTextColor={COLORS.textMuted}
                value={budget}
                onChangeText={setBudget}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Label text="Địa điểm" required />
            <View style={styles.inputIconWrap}>
              <Icon name="map-marker-outline" size={16} color={WORK_THEME.primary} />
              <TextInput
                style={styles.inputIcon}
                placeholder="Quận 1, TP. HCM"
                placeholderTextColor={COLORS.textMuted}
                value={location}
                onChangeText={setLocation}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setUrgent(u => !u)}
          activeOpacity={0.85}
          style={[styles.urgentToggle, urgent && styles.urgentToggleActive]}
        >
          <View style={styles.urgentLeft}>
            <View style={[
              styles.urgentIconWrap,
              urgent && { backgroundColor: '#C0533A' },
            ]}>
              <Icon name="lightning-bolt" size={14} color={urgent ? '#fff' : '#C0533A'} />
            </View>
            <View>
              <Text style={styles.urgentTitle}>Đánh dấu Gấp</Text>
              <Text style={styles.urgentSub}>Ưu tiên hiển thị · phí thêm 20.000đ</Text>
            </View>
          </View>
          <View style={[styles.switch, urgent && styles.switchActive]}>
            <View style={[styles.switchDot, urgent && styles.switchDotActive]} />
          </View>
        </TouchableOpacity>

        <View style={styles.contractBox}>
          <View style={styles.contractHeader}>
            <Icon name="file-sign" size={16} color={WORK_THEME.primary} />
            <Text style={styles.contractTitle}>Hợp đồng smart contract</Text>
          </View>
          <Text style={styles.contractText}>
            Khi bạn đăng tin, một hợp đồng sẽ được tạo. Pledge định giá bằng MAGIC nhưng khóa/hoàn thật bằng CARP, chỉ giải ngân khi hai bên xác nhận hoàn thành. Bạn ký số bằng PhoenixKey (P-256) ở bước cuối.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.85}
          style={[
            styles.submitBtn,
            (!canSubmit || submitting) && styles.submitBtnDisabled,
          ]}
        >
          {submitting ? (
            <Text style={styles.submitBtnText}>Đang đăng…</Text>
          ) : (
            <>
              <Icon name="shield-key" size={16} color="#fff" />
              <Text style={styles.submitBtnText}>Ký & Đăng tin</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const Label: React.FC<{ text: string; required?: boolean }> = ({ text, required }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 8 }}>
    <Text style={styles.label}>{text}</Text>
    {required && <Text style={{ color: '#C0533A', fontWeight: '800' }}>*</Text>}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WORK_THEME.primaryDeep,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  field: { paddingHorizontal: 16, paddingVertical: 10 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2 },

  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: COLORS.text,
  },
  textArea: { minHeight: 110, paddingTop: 12 },

  inputIconWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: { flex: 1, fontSize: 13, color: COLORS.text, paddingVertical: 11 },

  hint: { fontSize: 10, color: COLORS.textMuted, marginTop: 4 },

  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 0 },

  catList: { gap: 8, paddingBottom: 4 },
  catItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catItemText: { fontSize: 12, fontWeight: '600', color: COLORS.text },

  urgentToggle: {
    marginHorizontal: 16, marginTop: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  urgentToggleActive: {
    backgroundColor: '#FFF4F0',
    borderColor: '#C0533A',
  },
  urgentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  urgentIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#F8E4DD',
    alignItems: 'center', justifyContent: 'center',
  },
  urgentTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  urgentSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  switch: {
    width: 40, height: 22,
    backgroundColor: COLORS.divider,
    borderRadius: 11,
    padding: 2,
    justifyContent: 'center',
  },
  switchActive: { backgroundColor: '#C0533A' },
  switchDot: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#fff',
  },
  switchDotActive: { transform: [{ translateX: 18 }] },

  contractBox: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 16,
    padding: 12,
    backgroundColor: WORK_THEME.primaryGlow,
    borderRadius: 12,
    borderWidth: 1, borderColor: WORK_THEME.primaryLight,
  },
  contractHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 6,
  },
  contractTitle: {
    fontSize: 12, fontWeight: '800', color: WORK_THEME.primaryDeep,
  },
  contractText: {
    fontSize: 11, color: COLORS.textSub, lineHeight: 16,
  },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingVertical: 14,
    backgroundColor: WORK_THEME.primary,
    borderRadius: 12,
  },
  submitBtnDisabled: { backgroundColor: COLORS.divider },
  submitBtnText: {
    fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: -0.2,
  },
});

export default PostJobScreen;
