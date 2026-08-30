// modules/chat/features/chat/components/ConversationItem.tsx
//
// Một dòng trong danh sách trò chuyện. Thay cho `JobRoomItem` cũ — dòng cũ bày
// tên công việc, huy hiệu "đã xác thực" và thẻ ký-quỹ kèm số tiền, mà máy chủ
// ProofChat không hề cấp trường nào trong số đó: tất cả đến từ dữ-liệu mẫu.
//
// Dòng mới chỉ hiện thứ có thật: tên phòng · trích tin gần nhất · lúc nào · số
// tin chưa đọc. Với phòng nhiều người thì thêm số thành viên.
//
// Vật liệu: thẻ Acrylic mỏng, bo góc Fluent, nhấn xuống thì sắc nền đậm lên.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { ELEVATION, LAYER, MOTION, RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import Avatar from './Avatar';
import { formatRelative } from '../../../shared/utils/format';
import type { Conversation } from '../types';

interface Props {
  conversation: Conversation;
  index: number;
  onPress: () => void;
  onLongPress?: () => void;
}

const ConversationItem: React.FC<Props> = ({
  conversation,
  index,
  onPress,
  onLongPress,
}) => {
  const enter = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: MOTION.normal,
      // Xếp dòng vào lần lượt, nhưng chặn ở dòng thứ tám: cuộn nhanh mà dòng nào
      // cũng chờ tới lượt thì danh sách hiện ra chậm hẳn.
      delay: Math.min(index, 7) * 35,
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const unread = conversation.unreadCount > 0;
  const isGroup = conversation.type !== 'DIRECT';

  const preview =
    conversation.lastMessage?.trim() ||
    (conversation.lastMessageAt ? 'Tin nhắn riêng tư' : 'Chưa có tin nhắn nào');
  const previewLocked = !conversation.lastMessage?.trim() && !!conversation.lastMessageAt;

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() =>
          Animated.timing(press, {
            toValue: 1,
            duration: MOTION.fast,
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.timing(press, {
            toValue: 0,
            duration: MOTION.fast,
            useNativeDriver: true,
          }).start()
        }
        style={({ pressed }) => [
          styles.card,
          pressed && { backgroundColor: LAYER.cardPressed },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${conversation.title}${unread ? `, ${conversation.unreadCount} tin chưa đọc` : ''}`}
      >
        <Avatar name={conversation.title} uri={conversation.avatar} size={50} />

        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text
              style={[styles.title, unread && styles.titleUnread]}
              numberOfLines={1}
            >
              {conversation.title}
            </Text>
            {!!conversation.lastMessageAt && (
              <Text style={[styles.time, unread && styles.timeUnread]}>
                {formatRelative(conversation.lastMessageAt)}
              </Text>
            )}
          </View>

          <View style={styles.bottomRow}>
            {previewLocked && (
              <Icon name="lock-outline" size={12} color={NEUTRAL.textMuted} />
            )}
            <Text
              style={[
                styles.preview,
                previewLocked && styles.previewLocked,
                unread && styles.previewUnread,
              ]}
              numberOfLines={1}
            >
              {preview}
            </Text>

            {unread ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </Text>
              </View>
            ) : null}
          </View>

          {isGroup && conversation.memberCount > 0 && (
            <View style={styles.metaRow}>
              <Icon name="account-multiple-outline" size={11} color={NEUTRAL.textMuted} />
              <Text style={styles.metaText}>{conversation.memberCount} người</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    marginHorizontal: SPACE.lg,
    marginBottom: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: LAYER.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.base,
    ...ELEVATION.rest,
  },
  body: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: NEUTRAL.text,
    letterSpacing: -0.2,
  },
  titleUnread: { fontWeight: '700' },
  time: { fontSize: 11, color: NEUTRAL.textMuted, fontWeight: '500' },
  timeUnread: { color: CHAT_THEME.primary, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  preview: { flex: 1, fontSize: 13, color: NEUTRAL.textMuted, lineHeight: 18 },
  previewLocked: { fontStyle: 'italic' },
  previewUnread: { color: NEUTRAL.textSub, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: CHAT_THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: NEUTRAL.white, fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  metaText: { fontSize: 11, color: NEUTRAL.textMuted, fontWeight: '500' },
});

export default ConversationItem;
