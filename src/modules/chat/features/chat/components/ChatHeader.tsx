// modules/chat/features/chat/components/ChatHeader.tsx
//
// Thanh đầu phòng chat — tấm Acrylic, nội dung phòng chạy phía sau.
//
// Bản cũ bày một dòng "định danh": biểu-tượng ví + địa chỉ ví rút gọn dạng
// `0x7a3f…e3f4` + huy hiệu "Đã xác thực". Ba thứ đó đều đến từ dữ-liệu mẫu, và
// kể cả có thật thì một chuỗi băm cũng không nói được gì cho người đang tìm thợ.
// Dòng phụ nay nói thứ dùng được: có bao nhiêu người trong phòng, hoặc ai đang gõ.

import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { ACRYLIC, RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import Avatar from './Avatar';
import type { Conversation } from '../types';

interface Props {
  conversation: Conversation;
  /** Tên những người đang gõ (đã lọc bỏ chính mình). */
  typingNames?: string[];
  onBack: () => void;
  onPressTitle?: () => void;
  onPressInfo?: () => void;
}

const ChatHeader: React.FC<Props> = ({
  conversation,
  typingNames = [],
  onBack,
  onPressTitle,
  onPressInfo,
}) => {
  const subtitle =
    typingNames.length > 0
      ? typingNames.length === 1
        ? `${typingNames[0]} đang nhập…`
        : `${typingNames.length} người đang nhập…`
      : conversation.type === 'DIRECT'
      ? 'Trò chuyện riêng'
      : `${conversation.memberCount} người`;

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Quay lại">
        <Icon name="chevron-left" size={26} color={NEUTRAL.text} />
      </Pressable>

      <Pressable style={styles.center} onPress={onPressTitle} accessibilityRole="button">
        <Avatar name={conversation.title} uri={conversation.avatar} size={38} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {conversation.title}
          </Text>
          <Text
            style={[styles.subtitle, typingNames.length > 0 && styles.subtitleTyping]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onPressInfo}
        hitSlop={8}
        style={styles.actionBtn}
        accessibilityRole="button"
        accessibilityLabel="Thông tin cuộc trò chuyện"
      >
        <Icon name="information-outline" size={20} color={CHAT_THEME.primary} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingTop: Platform.OS === 'ios' ? 52 : SPACE.md,
    paddingBottom: SPACE.sm + 2,
    backgroundColor: ACRYLIC.base.fill,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: STROKE.outer,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  text: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: NEUTRAL.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 11.5, color: NEUTRAL.textMuted, marginTop: 1, fontWeight: '500' },
  subtitleTyping: { color: CHAT_THEME.primary, fontWeight: '600' },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatHeader;
