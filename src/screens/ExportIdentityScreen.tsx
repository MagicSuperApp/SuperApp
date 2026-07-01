/**
 * ExportIdentityScreen — Xuất danh tính đầy đủ (phần CÔNG KHAI).
 *
 * Tương đương Enclave/lib/screens/export_identity_screen.dart. MỘT chỗ xem + copy
 * toàn bộ phần công khai của danh tính PhoenixKey:
 *   - DID
 *   - Khoá công khai HW (P-256, DID owner)
 *   - Khoá công khai TAAD (Ed25519, controller — derive từ Master_KEK)
 *   - Ví cố định (Cardano account-0) + Ví hoạt động (account-N)
 *
 * Đều là dữ liệu CÔNG KHAI (an toàn hiển thị/chia sẻ). KHÁC với 24 từ / KEK (bí mật).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Clipboard, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { showInfo } from '../utils/alert';
import taad from '../sdk/taadEnclave';
import { currentUserDid, ownerPublicKey } from '../sdk/phoenixKey';
import { getStoredMasterKek, getActiveAccountIndex } from '../services/masterKekStore';

const WALLET_NETWORK = 0; // 0 = preprod (khớp register + ví)

const ExportIdentityScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [loading, setLoading] = useState(true);
  const [did, setDid] = useState<string | null>(null);
  const [hwPub, setHwPub] = useState<string | null>(null);
  const [taadPub, setTaadPub] = useState<string | null>(null);
  const [fixedAddr, setFixedAddr] = useState<string | null>(null);
  const [activeAddr, setActiveAddr] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(1);

  const load = useCallback(async () => {
    try {
      setDid(await currentUserDid());
      try { setHwPub(await ownerPublicKey()); } catch { /* chưa có khoá HW */ }

      const kek = await getStoredMasterKek();
      if (kek) {
        const idx = await getActiveAccountIndex();
        setActiveIdx(idx);
        try { setTaadPub(await taad.deriveTaadPubkey(kek)); } catch {}
        try { setFixedAddr(await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK)); } catch {}
        try { setActiveAddr(await taad.deriveWalletAddress(kek, idx, WALLET_NETWORK)); } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = (value: string | null, label: string) => {
    if (!value) return;
    Clipboard.setString(value);
    showInfo('Đã sao chép', `${label} đã được sao chép.`);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Xuất danh tính</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.noteBox}>
            <Icon name="information-outline" size={18} color={COLORS.accent} />
            <Text style={styles.noteText}>
              Đây là phần CÔNG KHAI — an toàn chia sẻ. Cụm 24 từ / khoá bí mật KHÔNG hiện ở đây.
            </Text>
          </View>

          <Field icon="identifier" label="DID" value={did} onCopy={() => copy(did, 'DID')} />
          <Field icon="key" label="Khoá công khai (HW · P-256)" value={hwPub} onCopy={() => copy(hwPub, 'Khoá HW')} />
          <Field icon="key-link" label="Khoá công khai TAAD (Ed25519)" value={taadPub} onCopy={() => copy(taadPub, 'Khoá TAAD')} />
          <Field icon="wallet" label="Ví cố định (account 0)" value={fixedAddr} onCopy={() => copy(fixedAddr, 'ví cố định')} />
          <Field icon="wallet-outline" label={`Ví hoạt động (account ${activeIdx})`} value={activeAddr} onCopy={() => copy(activeAddr, 'ví hoạt động')} />

          {!fixedAddr && (
            <Text style={styles.hint}>
              Chưa có ví — vào "Xuất cụm 24 từ" để khởi tạo gốc ví trước.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const Field = ({ icon, label, value, onCopy }: {
  icon: string; label: string; value: string | null; onCopy: () => void;
}) => (
  <View style={styles.card}>
    <View style={styles.cardHead}>
      <Icon name={icon} size={16} color={COLORS.accentLight} />
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
    <Text style={styles.cardValue} selectable numberOfLines={4}>
      {value ?? '—'}
    </Text>
    {!!value && (
      <TouchableOpacity style={styles.copyRow} onPress={onCopy}>
        <Icon name="content-copy" size={14} color={COLORS.accent} />
        <Text style={styles.copyText}>Sao chép</Text>
      </TouchableOpacity>
    )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },

  noteBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.accentGlow, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.accentLight, padding: 12, marginBottom: 16,
  },
  noteText: { flex: 1, fontSize: 12.5, color: COLORS.textSub, lineHeight: 18 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  cardValue: { fontSize: 13, color: COLORS.text, fontFamily: 'monospace', lineHeight: 19 },
  copyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  copyText: { fontSize: 12.5, color: COLORS.accent, fontWeight: '600' },
  hint: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});

export default ExportIdentityScreen;
