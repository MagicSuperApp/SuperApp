// modules/chat/features/chat/components/ChatInput.tsx
//
// Ô soạn tin. Là một tấm Acrylic nổi trên nền Mica — nội dung phòng chạy phía sau
// và mờ dần vào nó, đúng cách Fluent xử lý thanh dưới màn.
//
// Hai nút cũ (kẹp tệp, mặt cười) trước đây KHÔNG gắn hàm nào: bấm không có gì xảy
// ra. Nay nút kẹp tệp gọi thật (chọn ảnh → tải lên máy chủ), còn nút mặt cười mở
// một hàng cảm-xúc chèn thẳng vào ô chữ. Không giữ nút chết nào.

import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { ACRYLIC, ELEVATION, MOTION, RADIUS, SPACE, STROKE } from '../../../theme/fluent';

/** Hàng cảm-xúc chèn nhanh — cùng bộ với hàng thả cảm-xúc lên tin. */
const QUICK_EMOJI = ['😊', '👍', '🙏', '❤️', '😂', '😮', '😢', '🔥'];

interface Props {
  onSend: (text: string) => void;
  /** Chọn và gửi một ảnh. Bỏ trống thì ẩn nút kẹp tệp. */
  onPickImage?: () => Promise<void> | void;
  /** Báo cho phòng biết đang gõ / ngưng gõ. */
  onTypingChange?: (typing: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
}

const ChatInput: React.FC<Props> = ({
  onSend,
  onPickImage,
  onTypingChange,
  placeholder = 'Nhắn tin…',
  disabled = false,
}) => {
  const [value, setValue] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const insets = useSafeAreaInsets();
  const sendScale = useRef(new Animated.Value(1)).current;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSend = value.trim().length > 0 && !disabled;

  const handleChange = (t: string) => {
    setValue(t);
    if (!onTypingChange) return;
    onTypingChange(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    // Ngưng gõ 2 giây thì tắt chỉ báo — nếu không nó sáng mãi sau khi người ta bỏ đi.
    typingTimer.current = setTimeout(() => onTypingChange(false), 2000);
  };

  const handleSend = () => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setValue('');
    setEmojiOpen(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    onTypingChange?.(false);
  };

  const handleAttach = async () => {
    if (!onPickImage || uploading) return;
    setUploading(true);
    try {
      await onPickImage();
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      {emojiOpen && (
        <View style={styles.emojiBar}>
          {QUICK_EMOJI.map((e) => (
            <Pressable
              key={e}
              onPress={() => setValue((v) => v + e)}
              style={({ pressed }) => [styles.emojiBtn, pressed && styles.emojiBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Chèn ${e}`}
            >
              <Animated.Text style={styles.emoji}>{e}</Animated.Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, SPACE.sm) }]}>
        <View style={styles.field}>
          {!!onPickImage && (
            <Pressable
              onPress={handleAttach}
              hitSlop={6}
              style={styles.fieldBtn}
              accessibilityRole="button"
              accessibilityLabel="Gửi ảnh"
            >
              {uploading ? (
                <ActivityIndicator size="small" color={CHAT_THEME.primary} />
              ) : (
                <Icon name="image-outline" size={21} color={NEUTRAL.textMuted} />
              )}
            </Pressable>
          )}

          <TextInput
            style={styles.input}
            value={value}
            onChangeText={handleChange}
            placeholder={placeholder}
            placeholderTextColor={NEUTRAL.textMuted}
            editable={!disabled}
            multiline
            maxLength={2000}
          />

          <Pressable
            onPress={() => setEmojiOpen((o) => !o)}
            hitSlop={6}
            style={styles.fieldBtn}
            accessibilityRole="button"
            accessibilityLabel="Cảm xúc"
          >
            <Icon
              name={emojiOpen ? 'emoticon' : 'emoticon-outline'}
              size={21}
              color={emojiOpen ? CHAT_THEME.primary : NEUTRAL.textMuted}
            />
          </Pressable>
        </View>

        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <Pressable
            disabled={!canSend}
            onPressIn={() =>
              Animated.spring(sendScale, {
                toValue: 0.9,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.spring(sendScale, {
                toValue: 1,
                friction: 4,
                useNativeDriver: true,
              }).start()
            }
            onPress={handleSend}
            style={[
              styles.send,
              {
                backgroundColor: canSend
                  ? CHAT_THEME.primary
                  : withAlpha(CHAT_THEME.primary, 0.22),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Gửi"
          >
            <Icon name="send" size={19} color={NEUTRAL.white} />
          </Pressable>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm + 2,
    backgroundColor: ACRYLIC.base.fill,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: STROKE.base,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    minHeight: 46,
    paddingHorizontal: SPACE.sm,
    paddingVertical: Platform.OS === 'ios' ? SPACE.sm : 2,
    borderRadius: RADIUS.xl,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
  },
  fieldBtn: { padding: 7 },
  input: {
    flex: 1,
    fontSize: 15,
    color: NEUTRAL.text,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? 5 : 8,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...ELEVATION.raised,
  },
  emojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    backgroundColor: ACRYLIC.thick.fill,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: STROKE.outer,
  },
  emojiBtn: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: RADIUS.sm },
  emojiBtnPressed: { backgroundColor: withAlpha(CHAT_THEME.primary, 0.12) },
  emoji: { fontSize: 23 },
});

export { MOTION };
export default ChatInput;
