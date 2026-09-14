/**
 * WalletReceiveScreen — NHẬN tài sản: mã QR + địa chỉ ví cố định.
 *
 * ── Vì sao một màn riêng, trong khi đã có nút "Sao chép" ─────────────────────
 * Chép vào bộ nhớ tạm chỉ giúp được khi người GỬI ngồi trên cùng một máy. Ca
 * thường là người gửi cầm máy khác, và lúc đó thứ duy nhất dùng được là một mã
 * quét từ màn hình. Không có mã thì người dùng đọc 103 ký tự bech32 bằng mắt —
 * và một ký tự sai trong địa chỉ Cardano cho ra một địa chỉ KHÁC vẫn hợp lệ
 * (checksum bech32 bắt phần lớn, không bắt hết), nên sai là mất tiền.
 *
 * ── Ba ràng buộc ─────────────────────────────────────────────────────────────
 * 1. **Địa chỉ CỐ ĐỊNH (account 0), không phải ví hoạt động.** Đó là địa chỉ đã
 *    đăng ký với máy chủ ví (`standardWalletService.ensureStandardWalletRegistered`),
 *    nên tiền về đó CHẮC CHẮN hiện ở số dư. Tiền về một account N chưa đăng ký
 *    vẫn nằm trên chuỗi nhưng số dư trong app không nhúc nhích — người dùng đọc
 *    thành "mất tiền". Cùng lý do `WalletSendScreen` khoá `ACCOUNT = 0`.
 * 2. **Không có mã nào thì nói KHÔNG CÓ MÃ.** `buildQrMatrix` trả `null` khi
 *    không dựng nổi, và `TreeQrCode` vẽ một ô trống có nền — ô trắng trơn trông
 *    y hệt mã đang tải. Ở đây thêm một dòng chữ, vì ô trống không tự nói được.
 * 3. **Nói rõ đang ở mạng nào.** Cùng một cụm 24 từ derive ra `addr1…` trên
 *    mainnet và `addr_test1…` trên chuỗi thử. Người gửi không nhìn tiền tố thì
 *    gửi nhầm chuỗi, và đó là hỏng không lấy lại được — `WalletSendScreen` chặn
 *    ở chiều GỬI, màn này phải nói ở chiều NHẬN.
 *
 * Dùng lại `features/treeQr/TreeQrCode` chứ không dựng bộ vẽ QR thứ hai: tệp đó
 * đã có lưới, ô định vị vuông, lề 4 ô và bộ kiểm riêng. Tên nó mang chữ "Tree"
 * vì nơi dùng đầu tiên là tem cây — nó không đọc gì của miền cây, chỉ nhận một
 * chuỗi. Tắt logo nền (`withLogo={false}`): logo ăn vào phần sạch của mã, đánh
 * đổi đó đúng cho một cái tem in ngoài vườn và SAI cho một địa chỉ nhận tiền.
 */

import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Clipboard, Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS } from '../constants';
import TreeQrCode from '../features/treeQr/TreeQrCode';
import { IS_MAINNET } from '../config/cardanoNetwork';
import { showError, showInfo } from '../utils/alert';

const PRIMARY = '#0033AD'; // Cardano blue — cùng màu với WalletSend/Staking
const QR_SIZE = 232;

const WalletReceiveScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const route: any = useRoute();

  /**
   * Địa chỉ do màn ví truyền sang. KHÔNG derive lại ở đây: derive lần hai là dựng
   * một nguồn thứ hai cho cùng một sự thật, và hai nguồn đó lệch nhau được (khác
   * `account`, khác mạng) mà không gì kêu lên.
   */
  const address: string | null = useMemo(() => {
    const a = route?.params?.address;
    return typeof a === 'string' && a.trim() ? a.trim() : null;
  }, [route?.params?.address]);

  const copy = () => {
    if (!address) return;
    Clipboard.setString(address);
    showInfo('Đã sao chép', 'Địa chỉ ví đã vào bộ nhớ tạm.');
  };

  const share = async () => {
    if (!address) return;
    try {
      await Share.share({ message: address });
    } catch (e: any) {
      // Người dùng bấm Huỷ cũng rơi vào đây ở một số bản Android. Không dựng nó
      // thành lỗi to — nhưng cũng không nuốt im: nói đúng điều đã xảy ra.
      showError('Chưa chia sẻ được', e?.message ?? 'Hệ điều hành từ chối mở bảng chia sẻ.');
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nhận tài sản</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.qrCard}>
          {address ? (
            <TreeQrCode
              value={address}
              size={QR_SIZE}
              color="#12161C"
              background="#FFFFFF"
              withLogo={false}
            />
          ) : (
            <View style={[styles.qrEmpty, { width: QR_SIZE, height: QR_SIZE }]}>
              <Icon name="qrcode-remove" size={40} color={COLORS.textMuted} />
              <Text style={styles.qrEmptyText}>
                Chưa có địa chỉ để dựng mã. Quay lại màn Ví và kéo xuống để tải lại.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.caption}>Ví cố định (account 0)</Text>
        <Text style={styles.addr} selectable>
          {address ?? '—'}
        </Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, !address ? styles.actionBtnOff : null]}
            disabled={!address}
            onPress={copy}
            activeOpacity={0.85}
          >
            <Icon name="content-copy" size={18} color={PRIMARY} />
            <Text style={styles.actionText}>Sao chép</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, !address ? styles.actionBtnOff : null]}
            disabled={!address}
            onPress={share}
            activeOpacity={0.85}
          >
            <Icon name="share-variant" size={18} color={PRIMARY} />
            <Text style={styles.actionText}>Chia sẻ</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.noteCard}>
          <Icon name="alert-circle-outline" size={17} color={PRIMARY} />
          <Text style={styles.noteText}>
            {IS_MAINNET
              ? 'Địa chỉ này thuộc MẠNG CHÍNH Cardano. Chỉ nhận ADA và tài sản gốc '
                + 'Cardano gửi từ mạng chính. Tài sản từ chuỗi khác gửi vào đây sẽ mất.'
              : 'Địa chỉ này thuộc CHUỖI THỬ (preprod). Tài sản trên chuỗi thử không có '
                + 'giá trị thật, và tiền từ mạng chính gửi vào đây sẽ mất.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: { width: 26 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  scroll: { padding: 20, alignItems: 'center', paddingBottom: 40 },

  qrCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  qrEmpty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  qrEmptyText: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },

  caption: {
    marginTop: 18, fontSize: 11, fontWeight: '700',
    color: COLORS.accent, letterSpacing: 2,
  },
  addr: {
    marginTop: 8, fontSize: 13, lineHeight: 20, color: COLORS.text,
    fontFamily: 'Courier', textAlign: 'center',
  },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 20, alignSelf: 'stretch' },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionBtnOff: { opacity: 0.45 },
  actionText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },

  noteCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 22,
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  noteText: { flex: 1, fontSize: 12.5, color: COLORS.textMuted, lineHeight: 18 },
});

export default WalletReceiveScreen;
