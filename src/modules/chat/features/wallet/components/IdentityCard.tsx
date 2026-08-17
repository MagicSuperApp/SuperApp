// modules/chat/features/wallet/components/IdentityCard.tsx
//
// Hiển thị Identity nhẹ: tên, địa chỉ ví rút gọn, trạng thái phiên,
// và badge "Verified Identity" nếu đã xác thực.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Clipboard } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import type { Identity } from '../types';
import { truncateAddress } from '../../../shared/utils/format';

interface Props {
  identity: Identity;
  onRefreshSession?: () => void;
}

const IdentityCard: React.FC<Props> = ({ identity, onRefreshSession }) => {
  const [copied, setCopied] = useState(false);
  const expired = identity.sessionStatus === 'expired';

  const handleCopy = () => {
    Clipboard.setString(identity.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: identity.verified
                ? withAlpha(CHAT_THEME.primary, 0.12)
                : withAlpha(NEUTRAL.textMuted, 0.12),
            },
          ]}
        >
          <Icon
            name={identity.verified ? 'account-check-outline' : 'account-outline'}
            size={20}
            color={identity.verified ? CHAT_THEME.primary : NEUTRAL.textMuted}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{identity.displayName}</Text>
            {identity.verified && (
              <View style={styles.verifiedPill}>
                <Icon name="shield-check" size={10} color={CHAT_THEME.primary} />
                <Text style={styles.verifiedText}>Verified Identity</Text>
              </View>
            )}
          </View>
          <Text style={styles.addr}>{truncateAddress(identity.address, 8, 6)}</Text>
        </View>
        <TouchableOpacity onPress={handleCopy} hitSlop={6} style={styles.copyBtn}>
          <Icon
            name={copied ? 'check' : 'content-copy'}
            size={14}
            color={copied ? '#3D7A5E' : CHAT_THEME.primary}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.sessionRow, expired && styles.sessionRowExpired]}>
        <View
          style={[
            styles.dot,
            { backgroundColor: expired ? '#C0533A' : '#3D7A5E' },
          ]}
        />
        <Text style={[styles.sessionText, expired && { color: '#C0533A' }]}>
          {expired
            ? 'Phiên đã hết hạn'
            : `Phiên đang hoạt động${
                identity.sessionExpiresAt
                  ? ` · còn ${formatRemain(identity.sessionExpiresAt)}`
                  : ''
              }`}
        </Text>
        {expired && onRefreshSession && (
          <TouchableOpacity onPress={onRefreshSession} hitSlop={6}>
            <Text style={styles.refreshLink}>Làm mới</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const formatRemain = (expiresAt: number) => {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return '0p';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}p` : ''}`;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '700', color: NEUTRAL.text },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.10),
  },
  verifiedText: {
    fontSize: 9, fontWeight: '800',
    color: CHAT_THEME.primary, letterSpacing: 0.4,
  },
  addr: {
    fontSize: 11, color: NEUTRAL.textMuted,
    fontFamily: 'monospace', marginTop: 2,
  },
  copyBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: NEUTRAL.bgSoft,
  },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: NEUTRAL.borderSoft,
  },
  sessionRowExpired: {},
  dot: { width: 6, height: 6, borderRadius: 3 },
  sessionText: { flex: 1, fontSize: 11, color: NEUTRAL.textSub, fontWeight: '600' },
  refreshLink: {
    fontSize: 11, fontWeight: '700', color: CHAT_THEME.primary,
  },
});

export default IdentityCard;
