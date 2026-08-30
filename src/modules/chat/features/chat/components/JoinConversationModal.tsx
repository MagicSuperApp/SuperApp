// modules/chat/features/chat/components/JoinConversationModal.tsx
//
// Vào một phòng đã có sẵn bằng mã phòng.
//
// KHÁC HẲN BẢN CŨ Ở CHỖ AI QUYẾT ĐỊNH: bản cũ giữ trong máy một danh sách mã
// phòng "công khai" (ba mã bịa trong dữ-liệu mẫu) rồi TỰ đoán — mã nằm trong
// danh sách thì báo "đã vào phòng", không nằm thì báo "đã gửi yêu cầu". Cả hai
// câu đều có thể sai, vì máy chủ mới là nơi biết phòng đó mở hay kín.
//
// Nay app chỉ gửi mã lên (`POST /conversations/:id/join`) và ĐỌC câu trả lời:
// `action: 'JOINED'` → vào thẳng; ngược lại → đang chờ người quản duyệt.

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import { Sheet } from './Sheet';

export interface JoinConversationPayload {
  conversationId: string;
  message?: string;
}

interface Props {
  visible: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: JoinConversationPayload) => void;
}

const JoinConversationModal: React.FC<Props> = ({
  visible,
  submitting = false,
  onClose,
  onSubmit,
}) => {
  const [id, setId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) return;
    setId('');
    setMessage('');
  }, [visible]);

  const trimmed = id.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Vào một phòng"
      subtitle="Dán mã phòng người khác gửi cho bạn."
      scroll
    >
      <TextInput
        style={styles.input}
        value={id}
        onChangeText={setId}
        placeholder="Mã phòng"
        placeholderTextColor={NEUTRAL.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextInput
        style={[styles.input, styles.inputMulti]}
        value={message}
        onChangeText={setMessage}
        placeholder="Lời nhắn cho người quản phòng (không bắt buộc)"
        placeholderTextColor={NEUTRAL.textMuted}
        multiline
        maxLength={300}
      />

      <View style={styles.note}>
        <Icon name="information-outline" size={14} color={NEUTRAL.textMuted} />
        <Text style={styles.noteText}>
          Phòng mở thì bạn vào được ngay. Phòng kín thì lời nhắn của bạn sẽ chờ
          người quản phòng đồng ý.
        </Text>
      </View>

      <Pressable
        style={[styles.primaryBtn, !canSubmit && styles.primaryBtnOff]}
        disabled={!canSubmit}
        onPress={() =>
          onSubmit({ conversationId: trimmed, message: message.trim() || undefined })
        }
      >
        {submitting ? (
          <ActivityIndicator size="small" color={NEUTRAL.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Gửi</Text>
        )}
      </Pressable>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
    fontSize: 15,
    color: NEUTRAL.text,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
    marginBottom: SPACE.md,
  },
  inputMulti: { minHeight: 84, textAlignVertical: 'top' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: SPACE.sm + 2,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.07),
    marginBottom: SPACE.lg,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: NEUTRAL.textSub },
  primaryBtn: {
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT_THEME.primary,
  },
  primaryBtnOff: { backgroundColor: withAlpha(CHAT_THEME.primary, 0.3) },
  primaryBtnText: { fontSize: 14.5, fontWeight: '700', color: NEUTRAL.white },
});

export default JoinConversationModal;
