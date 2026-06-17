// modules/proofchat/features/escrow/components/EscrowStatusCard.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import type { Escrow, EscrowStatus } from '../types';
import { TOKEN_SYMBOL } from '../../wallet/types';
import { formatToken } from '../../../shared/utils/format';

const STATUS_META: Record<
  EscrowStatus,
  { label: string; icon: string; color: string; bg: string }
> = {
  pending: {
    label: 'Pending',
    icon: 'clock-outline',
    color: '#B07D2F',
    bg: withAlpha('#B07D2F', 0.10),
  },
  locked: {
    label: 'Locked',
    icon: 'shield-lock-outline',
    color: PROOFCHAT_THEME.primary,
    bg: withAlpha(PROOFCHAT_THEME.primary, 0.10),
  },
  released: {
    label: 'Released',
    icon: 'check-decagram',
    color: '#3D7A5E',
    bg: withAlpha('#3D7A5E', 0.10),
  },
};

interface Props {
  escrow: Escrow;
  jobTitle: string;
  compact?: boolean;
  onPress?: () => void;
}

const EscrowStatusCard: React.FC<Props> = ({ escrow, jobTitle, compact, onPress }) => {
  const meta = STATUS_META[escrow.status];

  if (compact) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.compactRow}>
        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
          <Icon name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.compactLabel}>Ký quỹ · {meta.label}</Text>
          <Text style={styles.compactValue}>
            {formatToken(escrow.amount)} {TOKEN_SYMBOL}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={NEUTRAL.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Icon name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <Text style={styles.cardJob} numberOfLines={2}>
        {jobTitle}
      </Text>

      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>SỐ TIỀN KÝ QUỸ</Text>
        <View style={styles.amountValueWrap}>
          <Text style={styles.amountValue}>{formatToken(escrow.amount)}</Text>
          <Text style={styles.amountCurrency}>{TOKEN_SYMBOL}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: NEUTRAL.bg,
    borderBottomWidth: 1, borderBottomColor: NEUTRAL.border,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  compactLabel: { fontSize: 10, color: NEUTRAL.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  compactValue: {
    fontSize: 13, fontWeight: '800', color: NEUTRAL.text,
    marginTop: 1, letterSpacing: -0.2,
  },
  card: {
    backgroundColor: NEUTRAL.card, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: NEUTRAL.border,
    shadowColor: NEUTRAL.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 2,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  cardJob: { fontSize: 13, color: NEUTRAL.textSub, marginBottom: 16, lineHeight: 18 },
  amountRow: { gap: 4 },
  amountLabel: {
    fontSize: 10, fontWeight: '700',
    color: NEUTRAL.textMuted, letterSpacing: 1.2,
  },
  amountValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  amountValue: {
    fontSize: 32, fontWeight: '800',
    color: PROOFCHAT_THEME.primaryDeep, letterSpacing: -1,
  },
  amountCurrency: {
    fontSize: 13, fontWeight: '700', color: PROOFCHAT_THEME.primary,
  },
});

export default EscrowStatusCard;
export { STATUS_META as ESCROW_STATUS_META };
