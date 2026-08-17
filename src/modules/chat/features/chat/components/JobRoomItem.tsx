// modules/chat/features/chat/components/JobRoomItem.tsx

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import type { ChatRoom } from '../types';
import { formatRelative, formatToken } from '../../../shared/utils/format';
import { TOKEN_SYMBOL } from '../../wallet/types';

const ESCROW_PILL: Record<string, { color: string; label: string; icon: string }> = {
  pending: { color: '#B07D2F', label: 'Chờ nạp', icon: 'clock-outline' },
  locked: { color: CHAT_THEME.primary, label: 'Đang khóa', icon: 'shield-lock-outline' },
  released: { color: '#3D7A5E', label: 'Đã chi', icon: 'check-circle-outline' },
};

interface Props {
  room: ChatRoom;
  onPress: () => void;
  index: number;
}

const JobRoomItem: React.FC<Props> = ({ room, onPress, index }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(8)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1, duration: 280, delay: index * 40, useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0, duration: 280, delay: index * 40, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const initials = room.counterpartyName
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const escrowCfg = room.escrow ? ESCROW_PILL[room.escrow.status] : undefined;
  const isEncryptedPreview =
    room.lastMessage?.toLowerCase().includes('mã hóa');

  return (
    <Animated.View
      style={{ opacity: fade, transform: [{ translateY: slide }, { scale }] }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1, friction: 4, useNativeDriver: true,
          }).start()
        }
        onPress={onPress}
        style={styles.row}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {room.online && <View style={styles.onlineDot} />}
        </View>

        <View style={styles.middle}>
          <View style={styles.topRow}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {room.counterpartyName}
              </Text>
              {room.counterpartyVerified && (
                <Icon
                  name="check-decagram"
                  size={13}
                  color={CHAT_THEME.primary}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
            <Text style={styles.time}>
              {room.lastMessageAt ? formatRelative(room.lastMessageAt) : ''}
            </Text>
          </View>
          {/* 
          <Text style={styles.jobTitle} numberOfLines={1}>
            {room.jobCategory} · {room.jobTitle}
          </Text> */}

          <View style={styles.bottomRow}>
            {isEncryptedPreview && (
              <Icon
                name="lock-outline"
                size={11}
                color={NEUTRAL.textMuted}
                style={{ marginRight: 2 }}
              />
            )}
            <Text
              style={[
                styles.lastMsg,
                isEncryptedPreview && styles.lastMsgEncrypted,
                room.unreadCount > 0 && styles.lastMsgUnread,
              ]}
              numberOfLines={1}
            >
              {room.lastMessage ?? '—'}
            </Text>
            {room.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {room.unreadCount > 9 ? '9+' : room.unreadCount}
                </Text>
              </View>
            )}
          </View>

          {escrowCfg && (
            <View style={styles.escrowRow}>
              <View
                style={[
                  styles.escrowPill,
                  { backgroundColor: withAlpha(escrowCfg.color, 0.10) },
                ]}
              >
                <Icon name={escrowCfg.icon} size={11} color={escrowCfg.color} />
                <Text style={[styles.escrowText, { color: escrowCfg.color }]}>
                  {escrowCfg.label} · {formatToken(room.escrow!.amount)} {TOKEN_SYMBOL}
                </Text>
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: NEUTRAL.bg,
    gap: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 50, height: 50, borderRadius: 16,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.12),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: withAlpha(CHAT_THEME.primary, 0.4),
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: CHAT_THEME.primary },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#3D7A5E', borderWidth: 2, borderColor: NEUTRAL.bg,
  },
  middle: { flex: 1, gap: 2 },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  name: {
    flexShrink: 1, fontSize: 14, fontWeight: '700',
    color: NEUTRAL.text, letterSpacing: -0.2,
  },
  time: { fontSize: 11, color: NEUTRAL.textMuted, marginLeft: 6, fontWeight: '500' },
  jobTitle: { fontSize: 11, color: CHAT_THEME.primary, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastMsg: { flex: 1, fontSize: 12, color: NEUTRAL.textMuted },
  lastMsgEncrypted: { fontStyle: 'italic' },
  lastMsgUnread: { color: NEUTRAL.text, fontWeight: '600' },
  unreadBadge: {
    minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: CHAT_THEME.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: NEUTRAL.white, fontSize: 10, fontWeight: '800' },
  escrowRow: { marginTop: 4 },
  escrowPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
  },
  escrowText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
});

export default JobRoomItem;
