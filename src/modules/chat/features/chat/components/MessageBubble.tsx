// modules/chat/features/chat/components/MessageBubble.tsx
//
// Một bong bóng tin. So với bản trước đã bỏ toàn bộ phần dàn-dựng:
//   · "đường ống bằng-chứng" chạy bằng setTimeout qua 4 chặng
//   · nút "chạm để giải mã" — chạm vào thì hiện ra một câu viết cứng trong mã nguồn
//   · huy hiệu "Đã xác thực / Đang xác thực" bằng chữ, hiện dưới mọi tin
//
// Còn lại đúng những gì tầng dưới thật sự báo về: nội dung (nếu mở được), đã gửi
// tới đâu, và một dấu cảnh báo ĐỎ khi nội dung không khớp với chữ ký người gửi.
// Tin bình thường không đeo huy hiệu nào — im lặng nghĩa là mọi thứ ổn; chỉ khi
// có chuyện mới lên tiếng.
//
// Vật liệu Fluent: bong bóng của tôi tô màu thương-hiệu, bong bóng người khác là
// tấm acrylic mỏng; góc bo lớn, góc sát mép được vuốt nhỏ lại để chỉ hướng.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { ELEVATION, LAYER, MOTION, RADIUS, SIGNAL, SPACE, STROKE } from '../../../theme/fluent';
import { formatTime } from '../../../shared/utils/format';
import type { Message } from '../types';
import type { MessageState } from '../../proof/types';

/** Dấu trạng-thái gửi, chỉ hiện trên tin của chính mình. */
const SEND_MARK: Partial<Record<MessageState, { icon: string; tint?: string }>> = {
  sending: { icon: 'clock-outline' },
  sent: { icon: 'check' },
  delivered: { icon: 'check-all' },
  read: { icon: 'check-all', tint: SIGNAL.tickRead },
  failed: { icon: 'alert-circle-outline', tint: SIGNAL.tickFailed },
};

interface Props {
  message: Message;
  /** Tin cuối trong chuỗi cùng người gửi — bong bóng được vuốt góc chỉ hướng. */
  showTail?: boolean;
  /** Hiện tên người gửi (phòng nhiều người, tin của người khác). */
  showSender?: boolean;
  onLongPress?: (m: Message) => void;
  onPressReaction?: (m: Message, emoji: string) => void;
}

const MessageBubble: React.FC<Props> = ({
  message,
  showTail = true,
  showSender = false,
  onLongPress,
  onPressReaction,
}) => {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: MOTION.normal,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const { isMine, deleted, trust } = message;
  const broken = trust === 'broken';
  const locked = message.text === undefined && !deleted;

  return (
    <Animated.View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }),
            },
          ],
        },
      ]}
    >
      <View style={styles.column}>
        {showSender && !isMine && !!message.senderName && (
          <Text style={styles.sender} numberOfLines={1}>
            {message.senderName}
          </Text>
        )}

        <Pressable
          onLongPress={() => onLongPress?.(message)}
          delayLongPress={280}
          style={({ pressed }) => [
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleTheirs,
            showTail && (isMine ? styles.tailMine : styles.tailTheirs),
            broken && styles.bubbleBroken,
            pressed && { opacity: 0.85 },
          ]}
        >
          {deleted ? (
            <Text style={[styles.body, styles.bodyRemoved, isMine && styles.bodyRemovedMine]}>
              Tin nhắn đã được thu hồi
            </Text>
          ) : locked ? (
            <View style={styles.lockedRow}>
              <Icon
                name="lock-outline"
                size={14}
                color={isMine ? 'rgba(255,255,255,0.85)' : NEUTRAL.textMuted}
              />
              <Text style={[styles.body, styles.bodyLocked, isMine && styles.bodyLockedMine]}>
                Chưa mở được trên máy này
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.body,
                isMine ? styles.bodyMine : styles.bodyTheirs,
                broken && styles.bodyBroken,
              ]}
            >
              {message.text}
            </Text>
          )}

          <View style={styles.metaRow}>
            {message.saved && (
              <Icon
                name="bookmark"
                size={11}
                color={isMine ? 'rgba(255,255,255,0.75)' : NEUTRAL.textMuted}
              />
            )}
            {message.pinned && (
              <Icon
                name="pin"
                size={11}
                color={isMine ? 'rgba(255,255,255,0.75)' : NEUTRAL.textMuted}
              />
            )}
            <Text style={[styles.time, isMine ? styles.timeMine : styles.timeTheirs]}>
              {formatTime(message.timestamp)}
            </Text>
            {isMine && SEND_MARK[message.state] && (
              <Icon
                name={SEND_MARK[message.state]!.icon}
                size={13}
                color={SEND_MARK[message.state]!.tint ?? 'rgba(255,255,255,0.8)'}
              />
            )}
          </View>

          {broken && (
            <View style={styles.warnRow}>
              <Icon name="alert-circle" size={13} color={SIGNAL.alertIcon} />
              <Text style={styles.warnText}>
                Nội dung không khớp với người gửi. Đừng làm theo tin này.
              </Text>
            </View>
          )}
        </Pressable>

        {message.reactions.length > 0 && (
          <View style={[styles.reactionRow, isMine && styles.reactionRowMine]}>
            {message.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onPressReaction?.(message, r.emoji)}
                style={[styles.reaction, r.mine && styles.reactionMine]}
                accessibilityRole="button"
                accessibilityLabel={`${r.emoji}, ${r.count} người`}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: SPACE.md },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  column: { maxWidth: '80%' },

  sender: {
    fontSize: 11,
    fontWeight: '600',
    color: CHAT_THEME.primary,
    marginBottom: 3,
    marginLeft: SPACE.sm,
  },

  bubble: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 1,
    borderRadius: RADIUS.lg,
    ...ELEVATION.rest,
  },
  bubbleMine: { backgroundColor: CHAT_THEME.primary },
  bubbleTheirs: {
    backgroundColor: LAYER.bubble,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.base,
  },
  tailMine: { borderBottomRightRadius: RADIUS.xs },
  tailTheirs: { borderBottomLeftRadius: RADIUS.xs },
  bubbleBroken: {
    backgroundColor: SIGNAL.alertBg,
    borderWidth: 1,
    borderColor: SIGNAL.alertBorder,
  },

  body: { fontSize: 15, lineHeight: 21 },
  bodyMine: { color: NEUTRAL.white },
  bodyTheirs: { color: NEUTRAL.text },
  bodyBroken: { color: SIGNAL.alertText },
  bodyLocked: { color: NEUTRAL.textMuted, fontStyle: 'italic', fontSize: 14 },
  bodyLockedMine: { color: 'rgba(255,255,255,0.88)' },
  bodyRemoved: { color: NEUTRAL.textMuted, fontStyle: 'italic', fontSize: 14 },
  bodyRemovedMine: { color: 'rgba(255,255,255,0.85)' },

  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 3,
  },
  time: { fontSize: 10, fontWeight: '500' },
  timeMine: { color: 'rgba(255,255,255,0.8)' },
  timeTheirs: { color: NEUTRAL.textMuted },

  warnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: SPACE.sm,
    paddingTop: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SIGNAL.alertBorder,
  },
  warnText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: SIGNAL.alertText, fontWeight: '600' },

  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -6,
    marginLeft: SPACE.sm,
  },
  reactionRowMine: { justifyContent: 'flex-end', marginLeft: 0, marginRight: SPACE.sm },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    backgroundColor: LAYER.bubble,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
  },
  reactionMine: {
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.14),
    borderColor: withAlpha(CHAT_THEME.primary, 0.45),
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 10, fontWeight: '700', color: NEUTRAL.textSub },
});

export default MessageBubble;
