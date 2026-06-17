// modules/proofchat/features/chat/components/ChatHeader.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import type { ChatRoom } from '../types';
import { truncateAddress } from '../../../shared/utils/format';

interface Props {
  room: ChatRoom;
  onBack: () => void;
  onPressEscrow?: () => void;
  onPressMore?: () => void;
}

const ChatHeader: React.FC<Props> = ({ room, onBack, onPressEscrow, onPressMore }) => {
  const initials = room.counterpartyName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={8}>
        <Icon name="chevron-left" size={24} color={NEUTRAL.text} />
      </TouchableOpacity>

      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        {room.online && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.middle}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {room.counterpartyName}
          </Text>
          {room.counterpartyVerified && (
            <View style={styles.verifiedPill}>
              <Icon name="check-decagram" size={9} color={PROOFCHAT_THEME.primary} />
              <Text style={styles.verifiedText}>Đã xác thực</Text>
            </View>
          )}
        </View>
        {/* Identity row: ví rút gọn + trạng thái */}
        <View style={styles.idRow}>
          <Icon name="wallet-outline" size={10} color={NEUTRAL.textMuted} />
          <Text style={styles.idAddr}>
            {truncateAddress(room.counterpartyAddress, 8, 6)}
          </Text>
          <View style={styles.idDivider} />
          <View
            style={[
              styles.dotSmall,
              { backgroundColor: room.online ? '#3D7A5E' : NEUTRAL.textMuted },
            ]}
          />
          <Text style={styles.idStatus}>
            {room.online ? 'Đang hoạt động' : 'Offline'}
          </Text>
        </View>
      </View>

      {room.escrow && (
        <TouchableOpacity onPress={onPressEscrow} style={styles.escrowBtn} hitSlop={6}>
          <Icon name="shield-lock-outline" size={18} color={PROOFCHAT_THEME.primary} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onPressMore} style={styles.iconBtn} hitSlop={8}>
        <Icon name="dots-vertical" size={20} color={NEUTRAL.text} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    paddingBottom: 10,
    backgroundColor: NEUTRAL.bg,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: { position: 'relative', marginHorizontal: 4 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: PROOFCHAT_THEME.primary,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: PROOFCHAT_THEME.primary,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3D7A5E',
    borderWidth: 2,
    borderColor: NEUTRAL.bg,
  },
  middle: { flex: 1, marginLeft: 8, marginRight: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    color: NEUTRAL.text,
    letterSpacing: -0.2,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: '800',
    color: PROOFCHAT_THEME.primary,
    letterSpacing: 0.3,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  idAddr: {
    fontSize: 10,
    color: NEUTRAL.textMuted,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  idDivider: { width: 1, height: 8, backgroundColor: NEUTRAL.border, marginHorizontal: 2 },
  dotSmall: { width: 5, height: 5, borderRadius: 3 },
  idStatus: { fontSize: 10, color: NEUTRAL.textMuted, fontWeight: '500' },
  escrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatHeader;
