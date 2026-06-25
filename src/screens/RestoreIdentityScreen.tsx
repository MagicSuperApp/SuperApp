/**
 * RestoreIdentityScreen — Khôi phục danh tính từ cụm 24 từ (BIP39) trên máy mới.
 *
 * Tương đương Enclave/lib/screens/restore_identity_screen.dart. Người dùng nhập
 * cụm 24 từ → Rust core (taadEnclave.mnemonicToMasterKek) giải về Master_KEK
 * (64-hex). Reject nếu sai checksum / không thuộc wordlist / không đủ 24 từ.
 *
 * Phase 1: validate cụm từ + lấy lại Master_KEK. Phase sau: derive DID/ví từ KEK,
 * wrap lại bằng Secure Enclave/Keystore của máy mới, đăng ký thiết bị.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { showWarning, showSuccess } from '../utils/alert';
import taadEnclave from '../sdk/taadEnclave';

const RestoreIdentityScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [phrase, setPhrase] = useState('');
  const [loading, setLoading] = useState(false);

  // Đếm số từ realtime để hướng dẫn người dùng (cần đúng 24).
  const wordCount = useMemo(
    () => phrase.trim().split(/\s+/).filter(Boolean).length,
    [phrase],
  );
  const countOk = wordCount === 24;

  const handleRestore = async () => {
    if (!taadEnclave.isAvailable()) {
      showWarning(
        'Chưa sẵn sàng',
        'Lõi bảo mật (Rust core) chưa được tích hợp trong bản build này.',
      );
      return;
    }
    if (!countOk) {
      showWarning('Chưa đủ', `Cần đúng 24 từ — hiện có ${wordCount}.`);
      return;
    }
    try {
      setLoading(true);
      // taadEnclave tự normalise (trim/lower/space) trước khi gọi native.
      const kek = await taadEnclave.mnemonicToMasterKek(phrase);
      if (!kek || kek.length !== 64) {
        throw new Error('Master_KEK trả về không hợp lệ');
      }
      // TODO(phase sau): derive DID + ví từ kek, wrap bằng Secure Enclave/Keystore,
      // đăng ký thiết bị, lưu danh tính → điều hướng vào Main.
      showSuccess(
        'Cụm từ hợp lệ',
        'Đã khôi phục được gốc-tin-cậy (Master_KEK). Bước tạo lại danh tính/ví ' +
          'trên máy này sẽ được nối ở bản kế tiếp.',
        { onConfirm: () => navigation.goBack() },
      );
    } catch (e: any) {
      showWarning(
        'Cụm từ không hợp lệ',
        e?.message?.includes('không hợp lệ') || e?.code === 'E_MNEMONIC_INVALID'
          ? 'Kiểm tra lại: đúng 24 từ, đúng chính tả, đúng thứ tự (tiếng Anh, viết thường).'
          : (e?.message ?? 'Không khôi phục được từ cụm từ này.'),
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
        <Text style={styles.headerTitle}>Khôi phục bằng cụm từ</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.infoCard}>
          <Icon name="backup-restore" size={22} color={COLORS.accent} />
          <Text style={styles.infoText}>
            Nhập đủ <Text style={styles.bold}>24 từ</Text> khôi phục (cách nhau bằng
            dấu cách, đúng thứ tự). Hệ thống sẽ khôi phục lại CHÍNH danh tính cũ của bạn.
          </Text>
        </View>

        <View style={[styles.inputWrap, countOk && styles.inputWrapOk]}>
          <TextInput
            style={styles.input}
            value={phrase}
            onChangeText={setPhrase}
            placeholder="ví dụ: abandon ability able about ..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.countRow}>
          <Icon
            name={countOk ? 'check-circle' : 'information-outline'}
            size={15}
            color={countOk ? COLORS.success : COLORS.textMuted}
          />
          <Text style={[styles.countText, countOk && { color: COLORS.success }]}>
            {wordCount}/24 từ
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, (!countOk || loading) && { opacity: 0.5 }]}
          onPress={handleRestore}
          disabled={!countOk || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="lock-open-check-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Khôi phục</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Cụm từ chỉ được xử lý trên thiết bị của bạn — không gửi lên máy chủ.
        </Text>
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

  infoCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: COLORS.accentGlow, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.accentLight,
    padding: 14, marginBottom: 18,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.textSub },
  bold: { fontWeight: '800', color: COLORS.accent },

  inputWrap: {
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: 4,
  },
  inputWrapOk: { borderColor: COLORS.success },
  input: {
    minHeight: 120, fontSize: 16, color: COLORS.text,
    padding: 12, lineHeight: 24,
  },

  countRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, marginBottom: 18, paddingHorizontal: 4,
  },
  countText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  note: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    marginTop: 16, lineHeight: 17,
  },
});

export default RestoreIdentityScreen;
