/**
 * SeedExportScreen — Xuất cụm 24 từ khôi phục (BIP39) cho PhoenixKey Enclave.
 *
 * Tương đương Enclave/lib/screens/seed_export_screen.dart. Cụm 24 từ CHÍNH LÀ
 * Master_KEK (32 byte = 256-bit entropy) — bản sao lưu DUY NHẤT của gốc-tin-cậy.
 * Sinh qua Rust core (taadEnclave): generateMasterKek → masterKekToMnemonic.
 *
 * AN TOÀN:
 *   - Master_KEK/24 từ chỉ tồn tại trong RAM lúc hiển thị, KHÔNG log/persist thô.
 *   - Người dùng tự ghi ra giấy; xác nhận "đã lưu" mới rời màn.
 *   - Phase sau: wrap Master_KEK bằng Secure Enclave/Keystore + lưu để derive ví.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Platform, ActivityIndicator, Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { showWarning, showInfo } from '../utils/alert';
import taadEnclave from '../sdk/taadEnclave';
import { getOrCreateMasterKek } from '../services/masterKekStore';

const SeedExportScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [words, setWords] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleGenerate = async () => {
    if (!taadEnclave.isAvailable()) {
      showWarning(
        'Chưa sẵn sàng',
        'Lõi bảo mật (Rust core) chưa được tích hợp trong bản build này. ' +
          'Cần build lại app sau khi tích hợp taad_enclave_core.',
      );
      return;
    }
    try {
      setLoading(true);
      // KEK BỀN VỮNG: lấy KEK ví đã lưu, hoặc sinh + lưu lần đầu → 24 từ ỔN ĐỊNH
      // (cùng cụm mỗi lần mở, đúng nghĩa backup). KHÔNG sinh KEK mới mỗi lần.
      const kek = await getOrCreateMasterKek();
      const phrase = await taadEnclave.masterKekToMnemonic(kek);
      const list = phrase.split(/\s+/).filter(Boolean);
      if (list.length !== 24) {
        throw new Error(`Cụm từ không đúng 24 từ (nhận ${list.length})`);
      }
      setWords(list);
      setRevealed(true);
    } catch (e: any) {
      showWarning('Lỗi', e?.message ?? 'Không tạo được cụm từ khôi phục.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!words) return;
    showWarning(
      'Sao chép cụm từ?',
      'Clipboard KHÔNG an toàn (app khác đọc được). Chỉ dùng tạm rồi xoá. ' +
        'Tốt nhất nên GHI RA GIẤY.',
      {
        confirmText: 'Vẫn sao chép',
        onConfirm: () => {
          Clipboard.setString(words.join(' '));
          showInfo('Đã sao chép', 'Hãy dán vào nơi an toàn rồi xoá clipboard.');
        },
      },
    );
  };

  const handleDone = () => {
    if (!confirmed) {
      showWarning(
        'Xác nhận đã lưu',
        'Hãy chắc chắn bạn đã ghi lại đủ 24 từ đúng thứ tự. Mất cụm từ = mất ' +
          'khả năng khôi phục nếu hỏng/mất máy.',
      );
      return;
    }
    // Xoá khỏi RAM màn hình.
    setWords(null);
    setRevealed(false);
    navigation.goBack();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cụm từ khôi phục</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Cảnh báo an toàn */}
        <View style={styles.warnCard}>
          <Icon name="shield-key-outline" size={22} color={COLORS.warning} />
          <Text style={styles.warnText}>
            Cụm 24 từ là cách <Text style={styles.bold}>DUY NHẤT</Text> để khôi phục
            danh tính & ví nếu mất máy. Ghi ra giấy, cất nơi an toàn.{'\n'}
            <Text style={styles.bold}>Không</Text> ai (kể cả OriLife) khôi phục giúp được.
          </Text>
        </View>

        {!revealed ? (
          <>
            <View style={styles.placeholderCard}>
              <Icon name="eye-off-outline" size={40} color={COLORS.accentLight} />
              <Text style={styles.placeholderText}>
                Cụm từ sẽ hiện ngay bên dưới. Đảm bảo không ai nhìn màn hình của bạn.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="key-plus" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Hiện cụm 24 từ</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Lưới 24 từ */}
            <View style={styles.grid}>
              {words!.map((w, i) => (
                <View key={i} style={styles.wordChip}>
                  <Text style={styles.wordIndex}>{i + 1}</Text>
                  <Text style={styles.wordText}>{w}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
              <Icon name="content-copy" size={15} color={COLORS.accent} />
              <Text style={styles.copyBtnText}>Sao chép (kém an toàn)</Text>
            </TouchableOpacity>

            {/* Xác nhận đã lưu */}
            <TouchableOpacity
              style={styles.confirmRow}
              onPress={() => setConfirmed(v => !v)}
              activeOpacity={0.7}
            >
              <Icon
                name={confirmed ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={confirmed ? COLORS.success : COLORS.textMuted}
              />
              <Text style={styles.confirmText}>
                Tôi đã ghi lại đủ 24 từ đúng thứ tự và cất nơi an toàn.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, !confirmed && { opacity: 0.5 }]}
              onPress={handleDone}
            >
              <Icon name="check" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Hoàn tất</Text>
            </TouchableOpacity>
          </>
        )}
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

  warnCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FBF3E6', borderRadius: 14,
    borderWidth: 1, borderColor: '#EAD9B8',
    padding: 14, marginBottom: 18,
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.textSub },
  bold: { fontWeight: '800', color: COLORS.warning },

  placeholderCard: {
    alignItems: 'center', gap: 12, padding: 28,
    backgroundColor: COLORS.inputBg, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    marginBottom: 18,
  },
  placeholderText: {
    fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19,
  },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    gap: 10, marginBottom: 16,
  },
  wordChip: {
    width: '31%', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 10, paddingHorizontal: 8,
  },
  wordIndex: {
    fontSize: 11, fontWeight: '700', color: COLORS.accentLight, minWidth: 16,
  },
  wordText: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginBottom: 8,
  },
  copyBtnText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },

  confirmRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 4, marginBottom: 8,
  },
  confirmText: { flex: 1, fontSize: 13, color: COLORS.textSub, lineHeight: 19 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15,
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default SeedExportScreen;
