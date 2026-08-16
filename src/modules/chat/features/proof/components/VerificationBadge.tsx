// modules/chat/features/proof/components/VerificationBadge.tsx
//
// Hiển thị kết quả kiểm chứng cuối cùng (verified / pending / failed).
// Đây là UI duy nhất Proof System “xuất” ra cho UI app dùng.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { withAlpha } from '../../../../../shared/theme';
import type { VerificationStatus } from '../types';

const CONFIG: Record<
  VerificationStatus,
  { icon: string; label: string; color: string }
> = {
  verified: { icon: 'shield-check',          label: 'Đã xác thực',  color: '#3D7A5E' },
  pending:  { icon: 'shield-sync-outline',   label: 'Đang xác thực', color: '#B07D2F' },
  failed:   { icon: 'shield-alert',          label: 'KHÔNG xác thực', color: '#C0533A' },
};

interface Props {
  status: VerificationStatus;
  compact?: boolean;
  /** Khi failed → có thể disable trust UI bên ngoài */
  size?: number;
}

const VerificationBadge: React.FC<Props> = ({ status, compact = false, size }) => {
  const cfg = CONFIG[status];
  if (compact) {
    return <Icon name={cfg.icon} size={size ?? 12} color={cfg.color} />;
  }
  return (
    <View style={[styles.wrap, { backgroundColor: withAlpha(cfg.color, 0.10) }]}>
      <Icon name={cfg.icon} size={10} color={cfg.color} />
      <Text style={[styles.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
});

export default VerificationBadge;
export { CONFIG as VERIFICATION_CONFIG };
