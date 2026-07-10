// modules/phoenixOrgMint/screens/OrgMintResultScreen.tsx
//
// Kết quả sau khi submit tx (tạo OrgDID hoặc mint LAMP) — hiện tx hash + link
// explorer (CardanoScan, theo đúng network đã build/submit).

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Clipboard,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, ORGMINT_THEME } from '../../../theme';

const GOLD = ORGMINT_THEME.primary;

export interface OrgMintResultParams {
  txHash: string;
  network: 0 | 1 | 2;
  kind: 'create' | 'mint';
  /** DID vừa tạo (chỉ có khi kind='create'). */
  orgDid?: string;
}

function explorerUrl(txHash: string, network: 0 | 1 | 2): string {
  const host =
    network === 1 ? 'cardanoscan.io' : network === 2 ? 'preview.cardanoscan.io' : 'preprod.cardanoscan.io';
  return `https://${host}/transaction/${txHash}`;
}

const OrgMintResultScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params ?? {}) as OrgMintResultParams;
  const [copied, setCopied] = useState(false);

  const url = params.txHash ? explorerUrl(params.txHash, params.network ?? 0) : '';

  const handleCopy = () => {
    if (!params.txHash) return;
    Clipboard.setString(params.txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>
          {params.kind === 'create' ? 'Đã tạo tổ chức' : 'Đã mint LAMP'}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
      >
        <View style={styles.successBox}>
          <Icon name="check-circle" size={40} color={COLORS.success} />
          <Text style={styles.successTitle}>
            {params.kind === 'create'
              ? 'Đã submit tx tạo OrgDID'
              : 'Đã submit tx mint LAMP'}
          </Text>
          <Text style={styles.successDesc}>
            {params.kind === 'create'
              ? 'Anchor OrgDID đã lên chuỗi. Chờ vài khối để xác nhận trước khi mint LAMP.'
              : 'LAMP đã rót vào KHO (A-DEST) — KHÔNG ra ví cá nhân. Chờ vài khối để xác nhận.'}
          </Text>
        </View>

        {!!params.orgDid && (
          <>
            <Text style={styles.sectionLabel}>ORGDID</Text>
            <View style={styles.card}>
              <Text style={styles.monoText} selectable numberOfLines={2}>
                {params.orgDid}
              </Text>
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>TX HASH</Text>
        <View style={styles.card}>
          <Text style={styles.monoText} selectable numberOfLines={3}>
            {params.txHash || '(không có)'}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.8}>
              <Icon
                name={copied ? 'check-circle-outline' : 'content-copy'}
                size={15}
                color={copied ? COLORS.success : GOLD}
              />
              <Text style={[styles.actionText, copied && { color: COLORS.success }]}>
                {copied ? 'Đã sao chép' : 'Sao chép'}
              </Text>
            </TouchableOpacity>
            {!!url && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => Linking.openURL(url)}
                activeOpacity={0.8}
              >
                <Icon name="open-in-new" size={15} color={GOLD} />
                <Text style={styles.actionText}>Xem trên CardanoScan</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('OrgMintHome')}
        >
          <Text style={styles.doneBtnText}>Xong</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: COLORS.bg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: COLORS.text },
  headerPlaceholder: { width: 36 },
  scroll: { paddingTop: 20, paddingHorizontal: 20 },
  successBox: {
    alignItems: 'center', backgroundColor: `${COLORS.success}12`, borderRadius: 16,
    borderWidth: 1, borderColor: `${COLORS.success}30`, padding: 20, marginBottom: 20, gap: 8,
  },
  successTitle: { fontSize: 15, fontWeight: '700', color: COLORS.success, textAlign: 'center' },
  successDesc: { fontSize: 12.5, color: COLORS.textSub, textAlign: 'center', lineHeight: 18 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5,
    marginBottom: 8, marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 20,
  },
  monoText: { fontSize: 12, color: COLORS.text, fontFamily: 'monospace', lineHeight: 17 },
  actionRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 12.5, fontWeight: '600', color: GOLD },
  doneBtn: {
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
});

export default OrgMintResultScreen;
