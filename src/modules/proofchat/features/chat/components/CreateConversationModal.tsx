// modules/proofchat/features/chat/components/CreateConversationModal.tsx
//
// Modal "Tạo cuộc trò chuyện": title bắt buộc (max 200 ký tự),
// avatar URL optional, type chọn từ 4 loại.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import {
  CONVERSATION_TYPE_META,
  type ConversationType,
} from '../types';

const TITLE_MAX = 200;
const TYPES: ConversationType[] = ['DIRECT', 'GROUP', 'THREAD', 'JOB_NEGOTIATION'];

export interface CreateConversationPayload {
  title: string;
  avatar?: string;
  type: ConversationType;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateConversationPayload) => void;
}

const CreateConversationModal: React.FC<Props> = ({ visible, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [avatar, setAvatar] = useState('');
  const [type, setType] = useState<ConversationType>('GROUP');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setAvatar('');
      setType('GROUP');
      setTouched(false);
    }
  }, [visible]);

  const titleError = useMemo(() => {
    const t = title.trim();
    if (!t) return 'Vui lòng nhập tiêu đề.';
    if (t.length > TITLE_MAX) return `Tối đa ${TITLE_MAX} ký tự.`;
    return null;
  }, [title]);

  const avatarError = useMemo(() => {
    const v = avatar.trim();
    if (!v) return null;
    try {
      // eslint-disable-next-line no-new
      new URL(v);
      return null;
    } catch {
      return 'URL avatar không hợp lệ.';
    }
  }, [avatar]);

  const canSubmit = !titleError && !avatarError;

  const handleSubmit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      avatar: avatar.trim() || undefined,
      type,
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
              <Icon name="chat-plus-outline" size={20} color={PROOFCHAT_THEME.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Tạo cuộc trò chuyện</Text>
              <Text style={styles.subtitle}>Thiết lập thông tin phòng mới</Text>
            </View>
            <TouchableOpacity hitSlop={8} onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={18} color={NEUTRAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            <Field
              label="Tiêu đề"
              required
              counter={`${title.length}/${TITLE_MAX}`}
              error={touched ? titleError : null}
            >
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={t => setTitle(t.slice(0, TITLE_MAX))}
                placeholder="VD: Đội kỹ thuật - sửa máy giặt LG"
                placeholderTextColor={NEUTRAL.textMuted}
                maxLength={TITLE_MAX}
              />
            </Field>

            <Field
              label="Avatar (URL)"
              hint="Tùy chọn — dán đường dẫn ảnh đại diện."
              error={touched ? avatarError : null}
            >
              <TextInput
                style={styles.input}
                value={avatar}
                onChangeText={setAvatar}
                placeholder="https://…"
                placeholderTextColor={NEUTRAL.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </Field>

            <Text style={styles.label}>
              Loại cuộc trò chuyện <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.typeGrid}>
              {TYPES.map(t => {
                const meta = CONVERSATION_TYPE_META[t];
                const active = type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    activeOpacity={0.85}
                    style={[styles.typeCard, active && styles.typeCardActive]}
                    onPress={() => setType(t)}
                  >
                    <View
                      style={[
                        styles.typeIcon,
                        active && {
                          backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.15),
                        },
                      ]}
                    >
                      <Icon
                        name={meta.icon}
                        size={18}
                        color={active ? PROOFCHAT_THEME.primary : NEUTRAL.textSub}
                      />
                    </View>
                    <Text
                      style={[styles.typeLabel, active && styles.typeLabelActive]}
                      numberOfLines={1}
                    >
                      {meta.label}
                    </Text>
                    <Text style={styles.typeDesc} numberOfLines={2}>
                      {meta.description}
                    </Text>
                    {active && (
                      <View style={styles.typeCheck}>
                        <Icon name="check" size={11} color={NEUTRAL.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.btnGhostText}>Hủy bỏ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, !canSubmit && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit && touched}
              activeOpacity={0.85}
            >
              <Icon name="check" size={16} color={NEUTRAL.white} />
              <Text style={styles.btnPrimaryText}>Tạo cuộc trò chuyện</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  counter?: string;
  error?: string | null;
  children: React.ReactNode;
}> = ({ label, required, hint, counter, error, children }) => (
  <View style={styles.field}>
    <View style={styles.fieldHeader}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {counter && <Text style={styles.counter}>{counter}</Text>}
    </View>
    {children}
    {error ? (
      <Text style={styles.errorText}>{error}</Text>
    ) : hint ? (
      <Text style={styles.hint}>{hint}</Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: NEUTRAL.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
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
  hint: { fontSize: 11, color: NEUTRAL.textMuted, marginTop: 4 },
  errorText: { fontSize: 11, color: NEUTRAL.error, marginTop: 4, fontWeight: '600' },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  typeCard: {
    width: '48%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: NEUTRAL.border,
    backgroundColor: NEUTRAL.bgSoft,
    gap: 6,
    position: 'relative',
  },
  typeCardActive: {
    borderColor: PROOFCHAT_THEME.primary,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.06),
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: NEUTRAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: { fontSize: 12, fontWeight: '700', color: NEUTRAL.text },
  typeLabelActive: { color: PROOFCHAT_THEME.primary },
  typeDesc: { fontSize: 10, color: NEUTRAL.textMuted, lineHeight: 14 },
  typeCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PROOFCHAT_THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

export default CreateConversationModal;
