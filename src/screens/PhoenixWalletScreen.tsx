/**
 * PhoenixWalletScreen — Ví Cardano của PhoenixKey (derive từ Master_KEK).
 *
 * Tương đương Enclave/lib/screens/wallet_screen.dart. Hiển thị:
 *   - Số dư ADA / LAMP / MAGIC (query backend theo DID).
 *   - Địa chỉ Cardano account-0 (cố định) — derive TẠI MÁY từ Master_KEK
 *     (taad.deriveWalletAddress), KHÔNG cần backend. Sao chép được.
 *
 * Master_KEK = gốc ví (24 từ backup), TÁCH với khoá HW/DID (did_auth). Nếu máy
 * chưa có KEK → mời thiết lập (sang Xuất cụm 24 từ để khởi tạo ví).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Clipboard, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { showInfo, showWarning } from '../utils/alert';
import taad from '../sdk/taadEnclave';
import { getStoredMasterKek, getActiveAccountIndex, rotateActiveAccount } from '../services/masterKekStore';
import { currentUserDid } from '../sdk/phoenixKey';
import { phoenixKeyApi } from '../services/phoenixKey-api';

// 0 = preprod (testnet, khớp register WALLET_NETWORK), 1 = mainnet.
const WALLET_NETWORK = 0;

const fmtAda = (lovelace: number) => (lovelace / 1_000_000).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 6,
});
const fmtNum = (n: number) => n.toLocaleString('en-US');

const PhoenixWalletScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasKek, setHasKek] = useState(false);
  const [address, setAddress] = useState<string | null>(null);       // ví cố định (account 0)
  const [activeAddr, setActiveAddr] = useState<string | null>(null); // ví hoạt động (account N)
  const [activeIdx, setActiveIdx] = useState(1);
  const [rotating, setRotating] = useState(false);
  const [ada, setAda] = useState<number | null>(null);
  const [lamp, setLamp] = useState<number | null>(null);
  const [magic, setMagic] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      // 1) Địa chỉ Cardano từ KEK (local, không cần mạng).
      const kek = await getStoredMasterKek();
      if (!kek) { setHasKek(false); return; }
      setHasKek(true);
      const idx = await getActiveAccountIndex();
      setActiveIdx(idx);
      try {
        const addr = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
        setAddress(addr || null);
      } catch { setAddress(null); }
      try {
        const a = await taad.deriveWalletAddress(kek, idx, WALLET_NETWORK);
        setActiveAddr(a || null);
      } catch { setActiveAddr(null); }

      // 2) Số dư theo DID (có thể lỗi nếu backend ví chưa sẵn → vẫn hiện địa chỉ).
      const did = await currentUserDid();
      if (did) {
        try {
          const res = await phoenixKeyApi.wallet.getBalance(did);
          setAda(res.balanceLovelace ?? 0);
          setLamp(res.balanceLamp ?? 0);
          setMagic(res.balanceMagic ?? 0);
        } catch {
          // số dư chưa lấy được — giữ null (hiện "—")
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const copyAddress = () => {
    if (!address) return;
    Clipboard.setString(address);
    showInfo('Đã sao chép', 'Địa chỉ ví đã được sao chép.');
  };

  const doRotate = async () => {
    setRotating(true);
    try {
      const kek = await getStoredMasterKek();
      if (!kek) return;
      const next = await rotateActiveAccount();
      setActiveIdx(next);
      const a = await taad.deriveWalletAddress(kek, next, WALLET_NETWORK);
      setActiveAddr(a || null);
      showInfo('Đã xoay ví', `Ví hoạt động đời #${next}. Cùng cụm 24 từ vẫn khôi phục mọi ví.`);
    } catch (e: any) {
      showWarning('Lỗi', e?.message ?? 'Không xoay được ví.');
    } finally {
      setRotating(false);
    }
  };

  const handleRotate = () => {
    showWarning(
      'Xoay ví hoạt động?',
      `Tạo ví hoạt động mới (account ${activeIdx + 1}) từ cùng cụm 24 từ. Ví cố định ` +
        '(account 0) giữ nguyên. Dùng khi muốn địa chỉ nhận mới. KHÔNG mất tài sản ở ví cũ.',
      { confirmText: 'Xoay ví', onConfirm: doRotate },
    );
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Icon name="chevron-left" size={26} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Ví PhoenixKey</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        {Header}
        <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>
      </View>
    );
  }

  if (!hasKek) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        {Header}
        <View style={styles.center}>
          <Icon name="wallet-outline" size={48} color={COLORS.accentLight} />
          <Text style={styles.emptyTitle}>Chưa có ví</Text>
          <Text style={styles.emptyText}>
            Thiết lập gốc ví (Master_KEK) bằng cách xuất cụm 24 từ — sau đó ví Cardano
            sẽ tự được tạo từ cụm từ đó.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('SeedExport')}
          >
            <Icon name="key-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Thiết lập ví (cụm 24 từ)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      {Header}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* Số dư */}
        <View style={styles.balanceRow}>
          <BalanceCard icon="cardano" label="ADA" value={ada == null ? '—' : fmtAda(ada)} color="#0033AD" />
          <BalanceCard icon="lightbulb-on-outline" label="LAMP" value={lamp == null ? '—' : fmtNum(lamp)} color="#B07D2F" />
          <BalanceCard icon="star-four-points-outline" label="MAGIC" value={magic == null ? '—' : fmtNum(magic)} color="#7A4DB8" />
        </View>

        {/* Địa chỉ */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>ĐỊA CHỈ VÍ (CỐ ĐỊNH)</Text>
          </View>
          <View style={styles.addrCard}>
            <Text style={styles.addrText} numberOfLines={3}>
              {address ?? 'Không derive được địa chỉ'}
            </Text>
            {!!address && (
              <TouchableOpacity style={styles.copyRow} onPress={copyAddress}>
                <Icon name="content-copy" size={15} color={COLORS.accent} />
                <Text style={styles.copyText}>Sao chép địa chỉ</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Ví hoạt động (account N) + xoay */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>VÍ HOẠT ĐỘNG (ĐỜI #{activeIdx})</Text>
          </View>
          <View style={styles.addrCard}>
            <Text style={styles.addrText} numberOfLines={3}>
              {activeAddr ?? '—'}
            </Text>
            <View style={styles.activeRow}>
              {activeAddr ? (
                <TouchableOpacity
                  style={styles.inlineBtn}
                  onPress={() => { Clipboard.setString(activeAddr); showInfo('Đã sao chép', 'Địa chỉ ví hoạt động đã sao chép.'); }}
                >
                  <Icon name="content-copy" size={15} color={COLORS.accent} />
                  <Text style={styles.copyText}>Sao chép</Text>
                </TouchableOpacity>
              ) : <View />}
              <TouchableOpacity style={styles.inlineBtn} onPress={handleRotate} disabled={rotating}>
                {rotating
                  ? <ActivityIndicator size="small" color={COLORS.accent} />
                  : <><Icon name="autorenew" size={15} color={COLORS.accent} /><Text style={styles.copyText}>Xoay ví</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={styles.note}>
          Ví derive từ cụm 24 từ — khôi phục được trên máy khác. Kéo xuống để cập nhật số dư.
        </Text>
      </ScrollView>
    </View>
  );
};

const BalanceCard = ({ icon, label, value, color }: {
  icon: string; label: string; value: string; color: string;
}) => (
  <View style={styles.balCard}>
    <View style={[styles.balIcon, { backgroundColor: `${color}14` }]}>
      <Icon name={icon} size={18} color={color} />
    </View>
    <Text style={styles.balValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.balLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  scroll: { padding: 20, paddingBottom: 40 },

  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },

  balanceRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  balCard: {
    flex: 1, alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, paddingVertical: 16, paddingHorizontal: 6,
  },
  balIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  balValue: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  balLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1 },

  sectionWrap: { marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 2 },
  addrCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  addrText: { fontSize: 13, color: COLORS.text, fontFamily: 'monospace', lineHeight: 20 },
  copyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  copyText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  activeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 17 },
});

export default PhoenixWalletScreen;
