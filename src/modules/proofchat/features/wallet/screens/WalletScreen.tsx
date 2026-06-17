// modules/proofchat/features/wallet/screens/WalletScreen.tsx
//
// Application Layer · Wallet UI.
// KHÔNG gắn với bất kỳ blockchain cụ thể nào — token nội bộ là MAGIC.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Animated, Platform, Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../../../store';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import { formatToken, formatRelative, truncateAddress } from '../../../shared/utils/format';
import IdentityCard from '../components/IdentityCard';
import { TOKEN_SYMBOL } from '../types';
import { refreshSession } from '../../../store/proofchatSlice';
import type { WalletTransaction, WalletTxType } from '../types';

const TX_META: Record<
  WalletTxType,
  { icon: string; color: string; label: string; sign: '+' | '-' | '·' }
> = {
  in:              { icon: 'arrow-down-circle-outline', color: '#3D7A5E', label: 'Nhận', sign: '+' },
  out:             { icon: 'arrow-up-circle-outline',   color: '#C0533A', label: 'Gửi', sign: '-' },
  escrow_lock:     { icon: 'shield-lock-outline',       color: PROOFCHAT_THEME.primary, label: 'Khóa ký quỹ', sign: '-' },
  escrow_release:  { icon: 'shield-check-outline',      color: '#3D7A5E', label: 'Giải ngân ký quỹ', sign: '+' },
  escrow_refund:   { icon: 'shield-refresh-outline',    color: '#B07D2F', label: 'Hoàn ký quỹ', sign: '+' },
};

const WalletScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const wallet = useSelector((s: RootState) => s.proofchat.wallet);
  const identity = useSelector((s: RootState) => s.proofchat.identity);
  const txs = useSelector((s: RootState) => s.proofchat.transactions);
  const [copied, setCopied] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleCopy = () => {
    Clipboard.setString(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PROOFCHAT_THEME.primaryDeep} />

      <Animated.View
        style={[styles.hero, { opacity: fade, transform: [{ translateY: slide }] }]}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroOrb2} />

        <View style={styles.heroTopRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Icon name="chevron-left" size={22} color={NEUTRAL.white} />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Ví Aladin</Text>
          <View style={[styles.statusPill, !wallet.connected && { opacity: 0.5 }]}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {wallet.connected ? 'Đã kết nối' : 'Chưa kết nối'}
            </Text>
          </View>
        </View>

        <Text style={styles.balanceLabel}>SỐ DƯ KHẢ DỤNG</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceValue}>{formatToken(wallet.balance)}</Text>
          <Text style={styles.balanceCurrency}>{TOKEN_SYMBOL}</Text>
        </View>

        <View style={styles.heroSubRow}>
          <View style={styles.heroSubItem}>
            <Icon name="shield-lock-outline" size={14} color="rgba(255,255,255,0.85)" />
            <View>
              <Text style={styles.heroSubLabel}>Đang khóa</Text>
              <Text style={styles.heroSubValue}>
                {formatToken(wallet.lockedInEscrow)} {TOKEN_SYMBOL}
              </Text>
            </View>
          </View>
          <View style={styles.heroSubDivider} />
          <View style={styles.heroSubItem}>
            <Icon name="account-check-outline" size={14} color="rgba(255,255,255,0.85)" />
            <View>
              <Text style={styles.heroSubLabel}>Identity</Text>
              <Text style={styles.heroSubValue}>
                {identity.verified ? 'Đã xác thực' : 'Chưa xác thực'}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Identity Card */}
        <View style={{ marginBottom: 16 }}>
          <IdentityCard
            identity={identity}
            onRefreshSession={() => dispatch(refreshSession(undefined))}
          />
        </View>

        {/* Address card (full address copy) */}
        <View style={styles.addressCard}>
          <View style={styles.addressTop}>
            <Text style={styles.addressLabel}>ĐỊA CHỈ VÍ</Text>
            <TouchableOpacity onPress={handleCopy} style={styles.copyBtn} hitSlop={6}>
              <Icon
                name={copied ? 'check' : 'content-copy'}
                size={14}
                color={copied ? '#3D7A5E' : PROOFCHAT_THEME.primary}
              />
              <Text
                style={[
                  styles.copyText,
                  { color: copied ? '#3D7A5E' : PROOFCHAT_THEME.primary },
                ]}
              >
                {copied ? 'Đã copy' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.addressFull} numberOfLines={2}>
            {truncateAddress(wallet.address, 18, 12)}
          </Text>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction icon="arrow-down" label="Nhận" onPress={() => {}} />
          <QuickAction icon="arrow-up" label="Gửi" onPress={() => {}} />
          <QuickAction icon="qrcode-scan" label="Quét" onPress={() => {}} />
          <QuickAction icon="swap-horizontal" label="Đổi" onPress={() => {}} />
        </View>

        {/* Tx history */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
          <TouchableOpacity hitSlop={6}>
            <Text style={styles.sectionAction}>Xem tất cả</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.txList}>
          {txs.map((tx, i) => (
            <TxRow key={tx.id} tx={tx} isLast={i === txs.length - 1} />
          ))}
        </View>

        <Text style={styles.footnote}>
          Giao dịch MAGIC được ghi nhận trong sổ cái nội bộ và đối soát định kỳ.
        </Text>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

const TxRow: React.FC<{ tx: WalletTransaction; isLast: boolean }> = ({ tx }) => {
  const meta = TX_META[tx.type];
  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
        <Icon name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle} numberOfLines={1}>
          {tx.jobTitle ?? meta.label}
        </Text>
        <Text style={styles.txSub} numberOfLines={1}>
          {tx.counterparty ?? meta.label} · {formatRelative(tx.timestamp)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.txAmount, { color: meta.color }]}>
          {meta.sign === '+' ? '+' : meta.sign === '-' ? '−' : ''}
          {formatToken(tx.amount)}
        </Text>
        <Text style={styles.txCurrency}>{TOKEN_SYMBOL}</Text>
      </View>
    </TouchableOpacity>
  );
};

const QuickAction: React.FC<{
  icon: string; label: string; onPress: () => void;
}> = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.quickItem} onPress={onPress} activeOpacity={0.85}>
    <View style={styles.quickIcon}>
      <Icon name={icon} size={20} color={PROOFCHAT_THEME.primary} />
    </View>
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NEUTRAL.bgSoft },
  hero: {
    backgroundColor: PROOFCHAT_THEME.primary,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    paddingBottom: 30,
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroOrb: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -60, right: -50,
  },
  heroOrb2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -30, left: -30,
  },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 24,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 16, fontWeight: '800', color: NEUTRAL.white, letterSpacing: -0.2,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.20)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A8E6A1' },
  statusText: {
    fontSize: 10, fontWeight: '800',
    color: NEUTRAL.white, letterSpacing: 0.4,
  },
  balanceLabel: {
    fontSize: 10, fontWeight: '700',
    color: 'rgba(255,255,255,0.78)', letterSpacing: 1.2,
  },
  balanceRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    marginTop: 4, marginBottom: 22,
  },
  balanceValue: {
    fontSize: 44, fontWeight: '800',
    color: NEUTRAL.white, letterSpacing: -1.5,
  },
  balanceCurrency: {
    fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)',
  },
  heroSubRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 14, padding: 12, gap: 12,
  },
  heroSubItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSubDivider: {
    width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroSubLabel: {
    fontSize: 9, fontWeight: '700',
    color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5,
  },
  heroSubValue: {
    fontSize: 13, fontWeight: '800', color: NEUTRAL.white, marginTop: 1,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },

  addressCard: {
    backgroundColor: NEUTRAL.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: 16,
  },
  addressTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  addressLabel: {
    fontSize: 9, fontWeight: '800',
    color: NEUTRAL.textMuted, letterSpacing: 1.2,
  },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText: { fontSize: 11, fontWeight: '700' },
  addressFull: {
    fontSize: 12, color: NEUTRAL.text,
    fontFamily: 'monospace', letterSpacing: 0.3,
  },

  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  quickItem: {
    flex: 1, alignItems: 'center', gap: 6,
    backgroundColor: NEUTRAL.card, borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1, borderColor: NEUTRAL.border,
  },
  quickIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 11, fontWeight: '600', color: NEUTRAL.textSub },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '800',
    color: NEUTRAL.text, letterSpacing: -0.2,
  },
  sectionAction: {
    fontSize: 12, fontWeight: '600', color: PROOFCHAT_THEME.primary,
  },
  txList: {
    backgroundColor: NEUTRAL.card, borderRadius: 14,
    borderWidth: 1, borderColor: NEUTRAL.border, overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: NEUTRAL.borderSoft,
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  txTitle: {
    fontSize: 13, fontWeight: '700',
    color: NEUTRAL.text, marginBottom: 2, letterSpacing: -0.1,
  },
  txSub: { fontSize: 11, color: NEUTRAL.textMuted },
  txAmount: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  txCurrency: { fontSize: 9, color: NEUTRAL.textMuted, fontWeight: '700' },
  footnote: {
    fontSize: 11, color: NEUTRAL.textMuted,
    textAlign: 'center', marginTop: 16, lineHeight: 17,
  },
});

export default WalletScreen;
