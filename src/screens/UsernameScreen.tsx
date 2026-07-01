/**
 * UsernameScreen — Đặt/đổi "username" tra cứu cho danh tính PhoenixKey.
 *
 * Tương đương Enclave/lib/screens/username_screen.dart. Username là lối tắt tra
 * cứu công khai (GET /identity/by-username/{name} → DID). Ràng buộc (khớp backend
 * UsernameController): 3-32 ký tự, chỉ [a-z0-9_], viết thường. Đổi có cooldown.
 *
 * API: identity.setUsername(name) (PUT /identity/username, JWT). Trả {username,
 * cooldownUntil?}.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, TextInput, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { showSuccess, showWarning } from '../utils/alert';
import { phoenixKeyApi } from '../services/phoenixKey-api';

const MIN = 3;
const MAX = 32;
const ALLOWED = /^[a-z0-9_]+$/;

const validate = (raw: string): string | null => {
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null; // rỗng = chưa nhập, không báo lỗi
  if (v.length < MIN) return `Tối thiểu ${MIN} ký tự`;
  if (v.length > MAX) return `Tối đa ${MAX} ký tự`;
  if (!ALLOWED.test(v)) return 'Chỉ chữ thường, số và dấu _';
  return null;
};

const UsernameScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const normalized = value.trim().toLowerCase();
  const error = useMemo(() => validate(value), [value]);
  const canSave = normalized.length >= MIN && !error && !loading;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setLoading(true);
      const res = await phoenixKeyApi.identity.setUsername(normalized);
      const cd = res.cooldownUntil
        ? `\nĐổi lại sau: ${new Date(res.cooldownUntil * 1000).toLocaleString('vi-VN')}`
        : '';
      showSuccess('Đã đặt username', `Người khác có thể tìm bạn qua "@${res.username}".${cd}`,
        { onConfirm: () => navigation.goBack() });
    } catch (e: any) {
      const http = e?.httpStatus;
      showWarning(
        'Không đặt được',
        http === 409 ? 'Username đã có người dùng. Chọn tên khác.' :
          http === 429 ? 'Đang trong thời gian chờ (cooldown). Thử lại sau.' :
            (e?.message ?? 'Đặt username thất bại.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Username</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.noteBox}>
          <Icon name="at" size={18} color={COLORS.accent} />
          <Text style={styles.noteText}>
            Lối tắt để người khác tìm danh tính của bạn (thay vì gõ cả DID). Công khai — chọn tên bạn muốn hiển thị.
          </Text>
        </View>

        <View style={[styles.inputWrap, !!error && styles.inputWrapErr]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={t => setValue(t.replace(/\s/g, ''))}
            placeholder="ten_cua_ban"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={MAX}
          />
        </View>
        <Text style={[styles.hint, !!error && { color: COLORS.error }]}>
          {error ?? `${MIN}–${MAX} ký tự · chữ thường, số, dấu _`}
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, !canSave && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <><Icon name="check" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Lưu username</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  scroll: { padding: 20, paddingBottom: 40 },

  noteBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.accentGlow, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.accentLight, padding: 12, marginBottom: 20,
  },
  noteText: { flex: 1, fontSize: 12.5, color: COLORS.textSub, lineHeight: 18 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 14,
  },
  inputWrapErr: { borderColor: COLORS.error },
  at: { fontSize: 18, color: COLORS.textMuted, fontWeight: '700' },
  input: { flex: 1, fontSize: 17, color: COLORS.text, paddingVertical: 14, paddingLeft: 4 },
  hint: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 8, marginBottom: 20, paddingHorizontal: 4 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default UsernameScreen;
