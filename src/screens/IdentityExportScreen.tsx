// screens/IdentityExportScreen.tsx
//
// "Xuất danh tính" — hiển thị + xuất ĐẦY ĐỦ 3 mục danh-tính, mỗi mục có Copy + QR:
//   (1) DID đầy-đủ (did = phoenixKey.did ?? user.did)
//   (2) Địa-chỉ Standard = ví-seed GIỮ TÀI SẢN (walletAddress) — base address payment+stake.
//   (3) Địa-chỉ Phoenix (CANONICAL v2.0.0) = controllerPkh — KHOÁ ĐIỀU-KHIỂN/QUẢN-TRỊ DID,
//       KHÔNG giữ tài sản. Nguồn: GET /identity/{did}/status → currentControllerPkh
//       (store: state.user.controllerPkh, nạp bởi refreshControllerPkh).
//
// Khi Phoenix CHƯA derive được (controllerPkh = null vì backend offline / chưa trả, HOẶC
// thiết-kế franken did_stake còn là spec chưa build) → hiển-thị Standard + DID THẬT và mục
// Phoenix ở trạng-thái "chờ backend" có NHÃN RÕ, KHÔNG bịa địa-chỉ.
//
// ADDITIVE: màn mới, KHÔNG sửa luồng login/ví hiện có. Đọc state read-only, không dispatch gì.
// Bám style AccountScreen (COLORS, Section, mono, copy-pattern) để đồng-bộ pixel.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
  Clipboard,
} from 'react-native';
import { useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { RootState } from '../store';
import { selectChainWallet } from '../store/userSlice';
import { COLORS } from '../constants';
import QrCode from '../components/QrCode';

// ── Một thẻ danh-tính: nhãn + giá-trị (mono) + Copy + QR ────────────────────────
const IdentityCard = ({
  icon,
  title,
  subtitle,
  value,
  pending,
  pendingText,
  accent,
}: {
  icon: string;
  title: string;
  subtitle: string;
  value: string;
  pending?: boolean;
  pendingText?: string;
  accent: string;
}) => {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIconWrap, { backgroundColor: `${accent}14` }]}>
          <Icon name={icon} size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {pending ? (
        <View style={styles.pendingBox}>
          <Icon name="timer-sand" size={15} color={COLORS.textMuted} />
          <Text style={styles.pendingText}>{pendingText}</Text>
        </View>
      ) : (
        <>
          <View style={styles.valueBox}>
            <Text style={styles.valueText} selectable>
              {value}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.8}>
              <Icon
                name={copied ? 'check-circle-outline' : 'content-copy'}
                size={15}
                color={copied ? COLORS.success : COLORS.accent}
              />
              <Text style={[styles.actionText, copied && { color: COLORS.success }]}>
                {copied ? 'Đã sao chép' : 'Sao chép'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setShowQr((s) => !s)}
              activeOpacity={0.8}
            >
              <Icon name={showQr ? 'qrcode-remove' : 'qrcode'} size={15} color={COLORS.accent} />
              <Text style={styles.actionText}>{showQr ? 'Ẩn mã QR' : 'Hiện mã QR'}</Text>
            </TouchableOpacity>
          </View>

          {showQr && (
            <View style={styles.qrWrap}>
              <View style={styles.qrFrame}>
                <QrCode value={value} size={196} color={COLORS.text} background={COLORS.white} />
              </View>
              <Text style={styles.qrCaption}>Quét để lấy {title.toLowerCase()}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const IdentityExportScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const user = useSelector((state: RootState) => state.user.currentUser);
  const phoenixKey = useSelector((state: RootState) => state.user.phoenixKey);
  const chainWallet = useSelector(selectChainWallet);
  // Địa-chỉ-2 CANONICAL (Phoenix v2.0.0): khoá điều-khiển/quản-trị DID, KHÔNG giữ tài sản.
  const controllerPkh = useSelector((state: RootState) => state.user.controllerPkh);

  // (1) DID đầy-đủ — cùng nguồn AccountScreen.
  const did = phoenixKey?.did ?? user?.did ?? '';
  // (2) Standard = ví-seed giữ tài sản — cùng fallback-chain AccountScreen.
  const walletAddress =
    chainWallet?.address ?? phoenixKey?.walletAddress ?? user?.walletAddress ?? '';
  // (3) Phoenix = controllerPkh (null nếu backend chưa trả → trạng-thái chờ).
  const phoenix = controllerPkh ?? '';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Xuất danh tính</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
      >
        <View style={styles.introBox}>
          <Icon name="shield-account-outline" size={16} color={COLORS.accent} />
          <Text style={styles.introText}>
            Đây là danh tính số của bạn trên Cardano. Sao chép hoặc quét mã QR để chia sẻ —
            <Text style={styles.introStrong}> không bao giờ chia sẻ seed phrase</Text>.
          </Text>
        </View>

        {/* (1) DID */}
        {did ? (
          <IdentityCard
            icon="identifier"
            title="DID"
            subtitle="Mã định danh phi tập trung (đầy đủ)"
            value={did}
            accent={COLORS.accent}
          />
        ) : (
          <IdentityCard
            icon="identifier"
            title="DID"
            subtitle="Mã định danh phi tập trung"
            value=""
            pending
            pendingText="Chưa có DID — vui lòng đăng nhập lại."
            accent={COLORS.accent}
          />
        )}

        {/* (2) Standard address (giữ tài sản) */}
        {walletAddress ? (
          <IdentityCard
            icon="wallet-outline"
            title="Địa chỉ ví (Standard)"
            subtitle="Ví giữ tài sản — gửi/nhận MAGIC, LAMP, ADA"
            value={walletAddress}
            accent={COLORS.success}
          />
        ) : (
          <IdentityCard
            icon="wallet-outline"
            title="Địa chỉ ví (Standard)"
            subtitle="Ví giữ tài sản"
            value=""
            pending
            pendingText="Đang lấy địa chỉ ví từ chuỗi. Kiểm tra kết nối mạng rồi thử lại."
            accent={COLORS.success}
          />
        )}

        {/* (3) Phoenix address = controllerPkh (CANONICAL). null → chờ-backend, KHÔNG bịa. */}
        {phoenix ? (
          <IdentityCard
            icon="key-outline"
            title="Địa chỉ Phoenix"
            subtitle="Khoá điều-khiển (quản-trị DID) — KHÔNG giữ tài sản"
            value={phoenix}
            accent="#B07D2F"
          />
        ) : (
          <IdentityCard
            icon="key-outline"
            title="Địa chỉ Phoenix"
            subtitle="Khoá điều-khiển (quản-trị DID) — KHÔNG giữ tài sản"
            value=""
            pending
            pendingText="Đang chờ máy chủ PhoenixKey cấp khoá điều-khiển. Sẽ hiển thị khi sẵn sàng."
            accent="#B07D2F"
          />
        )}

        <View style={styles.footNote}>
          <Icon name="information-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.footNoteText}>
            <Text style={styles.footNoteStrong}>Địa chỉ ví (Standard)</Text> giữ tài sản.{' '}
            <Text style={styles.footNoteStrong}>Địa chỉ Phoenix</Text> chỉ là khoá quản-trị danh
            tính, không chứa tiền — chia sẻ an toàn.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },

  scrollContent: { paddingHorizontal: 18, paddingTop: 16 },

  introBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  introText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.textSub },
  introStrong: { fontWeight: '800', color: COLORS.error },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  cardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  cardSubtitle: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, lineHeight: 16 },

  valueBox: {
    backgroundColor: COLORS.bgWarm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  valueText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12.5,
    lineHeight: 19,
    color: COLORS.text,
  },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${COLORS.accent}26`,
    backgroundColor: `${COLORS.accent}08`,
  },
  actionText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },

  qrWrap: { alignItems: 'center', marginTop: 16 },
  qrFrame: {
    padding: 14,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qrCaption: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 10 },

  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.bgWarm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    paddingHorizontal: 13,
    paddingVertical: 14,
  },
  pendingText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.textMuted },

  footNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  footNoteText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: COLORS.textMuted },
  footNoteStrong: { fontWeight: '700', color: COLORS.textSub },
});

export default IdentityExportScreen;
