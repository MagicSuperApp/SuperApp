/**
 * SeedExportScreen — Xuất cụm 24 từ khôi phục (BIP39) cho PhoenixKey Enclave.
 *
 * Tương đương Enclave/lib/screens/seed_export_screen.dart. Cụm 24 từ CHÍNH LÀ
 * Master_KEK (32 byte = 256-bit entropy) — bản sao lưu DUY NHẤT của gốc-tin-cậy.
 * Sinh qua Rust core (taadEnclave): generateMasterKek → masterKekToMnemonic.
 *
 * AN TOÀN:
 *   - Master_KEK/24 từ chỉ tồn tại trong RAM lúc hiển thị, KHÔNG log/persist thô.
 *   - Phase sau: wrap Master_KEK bằng Secure Enclave/Keystore + lưu để derive ví.
 *
 * ── Vì sao màn này KHÔNG giục người dùng ghi ra giấy ──────────────────────────
 * PhoenixKey sinh ra để BỎ cụm từ khôi phục, không phải để phát nó ra. Cụm 24 từ
 * là bản sao KHÔNG THU HỒI ĐƯỢC của toàn bộ ví: ai đọc được tờ giấy đó thì có ví,
 * vĩnh viễn, và chủ ví không có cách nào huỷ nó. Đổi khoá cũng không cứu — cụm từ
 * SINH RA khoá, nên nó vẫn mở được ví mới.
 *
 * Bản trước của màn này giục ("Ghi ra giấy, cất nơi an toàn") rồi CHẶN nút Hoàn
 * tất sau một ô đánh dấu "Tôi đã ghi lại đủ 24 từ" — tức là buộc người dùng khai
 * đã làm một việc nguy hiểm thì mới thoát ra được. Nay: xuất là TUỲ CHỌN, nói rõ
 * rủi ro trước khi hiện, và đẩy người dùng sang việc an toàn hơn làm được ngay
 * hôm nay — đặt người bảo hộ, thứ đường khôi phục on-chain sẽ đọc.
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
import { showInfo, showWarning } from '../utils/alert';
import taadEnclave from '../sdk/taadEnclave';
import { getOrCreateMasterKek } from '../services/masterKekStore';

const SeedExportScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [words, setWords] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

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
        {/* Nói RỦI RO trước, không giục. Người dùng phải biết mình đang đánh đổi
            cái gì TRƯỚC khi cụm từ hiện lên màn hình — sau khi hiện thì muộn rồi. */}
        <View style={styles.dangerCard}>
          <Icon name="alert-octagon-outline" size={22} color="#B3261E" />
          <Text style={styles.warnText}>
            Ghi cụm 24 từ ra giấy là <Text style={styles.bold}>tự tạo một chìa khoá thứ hai</Text> cho
            ví của bạn. Ai đọc được tờ giấy đó thì mở được ví, và bạn
            {' '}<Text style={styles.bold}>không thu hồi được</Text> — đổi khoá cũng không cứu, vì
            chính cụm từ sinh ra khoá.
          </Text>
        </View>

        {/* Việc AN TOÀN HƠN và làm được ngay hôm nay. Để trên nút hiện cụm từ, vì
            phần lớn người vào đây chỉ đang tìm cách khỏi mất ví. */}
        <TouchableOpacity
          style={styles.saferCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Guardian')}
        >
          <Icon name="account-multiple-check-outline" size={22} color={COLORS.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.saferTitle}>Cách an toàn hơn: đặt người bảo hộ</Text>
            <Text style={styles.saferSub}>
              Không có giấy tờ nào để mất. Đặt ngay bây giờ thì lúc mất máy đã sẵn sàng.
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.warnCard}>
          <Icon name="shield-key-outline" size={22} color={COLORS.warning} />
          <Text style={styles.warnText}>
            Hôm nay đường khôi phục bằng người bảo hộ chưa chạy được tới cuối, nên cụm 24 từ vẫn là
            bản dự phòng duy nhất nếu mất máy. Nó là bản sao <Text style={styles.bold}>tạm thời</Text>,
            không phải cách hệ định vận hành. Khi đường kia mở, hãy xoay khoá trước rồi mới huỷ giấy —
            đừng huỷ trước.
          </Text>
        </View>

        {!revealed ? (
          <>
            <View style={styles.placeholderCard}>
              <Icon name="eye-off-outline" size={40} color={COLORS.accentLight} />
              <Text style={styles.placeholderText}>
                Bạn không bắt buộc phải xuất cụm từ. Nếu vẫn muốn, hãy chắc không ai nhìn màn hình của bạn.
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
                  <Text style={styles.primaryBtnText}>Vẫn hiện cụm 24 từ</Text>
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
            {/* Không còn ô "Tôi đã ghi lại đủ 24 từ" chặn nút. Ghi hay không là
                việc của người dùng; bắt họ khai đã ghi mới cho thoát là ép làm một
                việc rủi ro, và cái khai đó cũng không kiểm được. */}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleDone}>
              <Icon name="check" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Đóng</Text>
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

  dangerCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FDECEA', borderRadius: 14,
    borderWidth: 1, borderColor: '#F3B9B2',
    padding: 14, marginBottom: 14,
  },
  saferCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 14,
  },
  saferTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  saferSub: { fontSize: 12, lineHeight: 17, color: COLORS.textMuted, marginTop: 2 },
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
