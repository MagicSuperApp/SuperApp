// modules/chat/features/chat/components/MessageActionsSheet.tsx
//
// Bảng hiện ra khi nhấn giữ một tin: thả cảm-xúc, ghim, lưu, sao chép, thu hồi.
//
// Bốn thao tác đầu chạy trên METADATA — máy chủ giữ được chúng mà không cần đọc
// nội dung tin, nên chúng làm việc kể cả khi máy này chưa mở được nội dung. Chỉ
// "Sao chép" là cần nội dung đã mở, nên nó tự mờ đi khi chưa mở được.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import { Sheet, SheetRow, SheetDismiss } from './Sheet';
import type { Message } from '../types';

/** Bộ cảm-xúc thả nhanh. Cùng bộ với hàng chèn nhanh trong ô soạn tin. */
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface Props {
  message: Message | null;
  /** Tôi có quyền quản phòng — chỉ khi đó mới ghim được. */
  canPin: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onTogglePin: () => void;
  onToggleSave: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

const MessageActionsSheet: React.FC<Props> = ({
  message,
  canPin,
  onClose,
  onReact,
  onTogglePin,
  onToggleSave,
  onCopy,
  onDelete,
}) => {
  if (!message) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const opened = message.text !== undefined && !message.deleted;

  return (
    <Sheet visible={!!message} onClose={onClose} title="Tin nhắn">
      <View style={styles.reactionBar}>
        {REACTIONS.map((emoji) => {
          const mine = message.reactions.some((r) => r.emoji === emoji && r.mine);
          return (
            <Pressable
              key={emoji}
              onPress={() => onReact(emoji)}
              style={({ pressed }) => [
                styles.reactionBtn,
                mine && styles.reactionBtnMine,
                pressed && { opacity: 0.65 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Thả ${emoji}`}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>

      <SheetRow
        icon={message.saved ? 'bookmark' : 'bookmark-outline'}
        label={message.saved ? 'Bỏ khỏi mục đã lưu' : 'Lưu tin này'}
        description="Lưu riêng cho bạn, người khác không thấy"
        onPress={onToggleSave}
      />

      {canPin && (
        <SheetRow
          icon={message.pinned ? 'pin-off-outline' : 'pin-outline'}
          label={message.pinned ? 'Bỏ ghim' : 'Ghim lên đầu phòng'}
          description="Mọi người trong phòng đều thấy"
          onPress={onTogglePin}
        />
      )}

      <SheetRow
        icon="content-copy"
        label="Sao chép nội dung"
        description={opened ? undefined : 'Chưa mở được nội dung trên máy này'}
        onPress={onCopy}
        disabled={!opened}
      />

      {message.isMine && !message.deleted && (
        <SheetRow
          icon="undo-variant"
          label="Thu hồi tin"
          description="Gỡ khỏi phòng với tất cả mọi người"
          onPress={onDelete}
          destructive
        />
      )}

      <SheetDismiss onPress={onClose} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  reactionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xs,
    paddingVertical: SPACE.sm,
    marginBottom: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.base,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBtnMine: { backgroundColor: withAlpha(CHAT_THEME.primary, 0.16) },
  reactionEmoji: { fontSize: 24 },
});

export { NEUTRAL };
export default MessageActionsSheet;
