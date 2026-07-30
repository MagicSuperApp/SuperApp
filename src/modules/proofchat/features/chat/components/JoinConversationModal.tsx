// modules/proofchat/features/chat/components/JoinConversationModal.tsx
//
// Modal "Tham gia cuộc trò chuyện": nhập conversationId (bắt buộc) +
// message (optional). Gọi onSubmit để slice tự quyết định public/private.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';

const MESSAGE_MAX = 300;

export interface JoinConversationPayload {
  conversationId: string;
  message?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: JoinConversationPayload) => void;
  /** ID public dùng để hiển thị gợi ý "phòng public" cho user. */
  publicConversationIds?: string[];
}

const JoinConversationModal: React.FC<Props> = ({
  visible,
  onClose,
  onSubmit,
  publicConversationIds = [],
}) => {
  const [conversationId, setConversationId] = useState('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      setConversationId('');
      setMessage('');
      setTouched(false);
    }
  }, [visible]);

  const idError = useMemo(() => {
    const v = conversationId.trim();
    if (!v) return 'Vui lòng nhập ID cuộc trò chuyện.';
    if (v.length < 4) return 'ID quá ngắn.';
    return null;
  }, [conversationId]);

  const isPublic = useMemo(
    () => publicConversationIds.includes(conversationId.trim()),
    [conversationId, publicConversationIds],
  );

  const canSubmit = !idError;

  // Chặn bấm kép: onSubmit đóng modal ở lượt render sau, nên chạm 2 lần liên tiếp
  // (hay xảy ra khi sóng yếu, người dùng tưởng chưa ăn) gửi 2 yêu cầu tham gia.
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (visible) setSubmitting(false); }, [visible]);

  const handleSubmit = () => {
    setTouched(true);
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    onSubmit({
      conversationId: conversationId.trim(),
      message: message.trim() || undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Icon name="account-multiple-plus-outline" size={20} color={PROOFCHAT_THEME.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Tham gia cuộc trò chuyện</Text>
              <Text style={styles.subtitle}>
                Nhập ID phòng để vào hoặc gửi yêu cầu duyệt
              </Text>
            </View>
            <TouchableOpacity hitSlop={8} onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={18} color={NEUTRAL.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.field}>
              <Text style={styles.label}>
                ID cuộc trò chuyện <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={conversationId}
                onChangeText={setConversationId}
                placeholder="conv-…"
                placeholderTextColor={NEUTRAL.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {touched && idError ? (
                <Text style={styles.errorText}>{idError}</Text>
              ) : conversationId.trim().length > 0 ? (
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isPublic
                        ? withAlpha(NEUTRAL.success, 0.12)
                        : withAlpha(NEUTRAL.warning, 0.12),
                    },
                  ]}
                >
                  <Icon
                    name={isPublic ? 'lock-open-variant-outline' : 'lock-outline'}
                    size={11}
                    color={isPublic ? NEUTRAL.success : NEUTRAL.warning}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: isPublic ? NEUTRAL.success : NEUTRAL.warning },
                    ]}
                  >
                    {isPublic
                      ? 'Phòng công khai · sẽ tham gia ngay'
                      : 'Phòng riêng tư · cần admin duyệt'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.hint}>
                  Nếu là phòng công khai sẽ vào ngay, ngược lại sẽ tạo yêu cầu duyệt.
                </Text>
              )}
            </View>

            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <Text style={styles.label}>Lời nhắn cho admin</Text>
                <Text style={styles.counter}>
                  {message.length}/{MESSAGE_MAX}
                </Text>
              </View>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={message}
                onChangeText={t => setMessage(t.slice(0, MESSAGE_MAX))}
                placeholder="Tùy chọn — chỉ dùng khi cần admin duyệt"
                placeholderTextColor={NEUTRAL.textMuted}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.btnGhostText}>Hủy bỏ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, (!canSubmit || submitting) && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              activeOpacity={0.85}
            >
              <Icon
                name={isPublic ? 'login-variant' : 'send-outline'}
                size={16}
                color={NEUTRAL.white}
              />
              <Text style={styles.btnPrimaryText}>
                {isPublic ? 'Tham gia ngay' : 'Gửi yêu cầu'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: NEUTRAL.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.borderSoft,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: NEUTRAL.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: NEUTRAL.textMuted, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: NEUTRAL.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  field: { marginBottom: 14 },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: 12, fontWeight: '700', color: NEUTRAL.textSub, marginBottom: 6 },
  required: { color: NEUTRAL.error },
  counter: { fontSize: 10, color: NEUTRAL.textMuted, fontWeight: '600' },
  input: {
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    backgroundColor: NEUTRAL.bgSoft,
    fontSize: 13,
    color: NEUTRAL.text,
  },
  textarea: { minHeight: 80, paddingTop: 10 },
  hint: { fontSize: 11, color: NEUTRAL.textMuted, marginTop: 6 },
  errorText: { fontSize: 11, color: NEUTRAL.error, marginTop: 6, fontWeight: '600' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: NEUTRAL.borderSoft,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnGhost: {
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  btnGhostText: { fontSize: 13, fontWeight: '700', color: NEUTRAL.textSub },
  btnPrimary: { backgroundColor: PROOFCHAT_THEME.primary },
  btnPrimaryText: { fontSize: 13, fontWeight: '800', color: NEUTRAL.white },
  btnDisabled: { opacity: 0.5 },
});

export default JoinConversationModal;
