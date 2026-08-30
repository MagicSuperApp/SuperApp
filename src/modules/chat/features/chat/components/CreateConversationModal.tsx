// modules/chat/features/chat/components/CreateConversationModal.tsx
//
// Mở một cuộc trò chuyện mới. Hai bước, không nhồi vào một màn:
//   1. chọn kiểu phòng  (riêng / nhóm / chủ đề / thoả thuận công việc)
//   2. chọn người + đặt tên
//
// Bỏ so với bản cũ: ô "Ảnh đại diện (URL)". Không ai dán được URL ảnh trên điện
// thoại, và máy chủ cũng không nhận trường đó lúc tạo phòng — nó chỉ tồn tại để
// điền vào dữ-liệu mẫu. Đổi ảnh làm ở bảng thông tin phòng, sau khi đã tạo.
//
// "Trò chuyện riêng" chỉ nhận đúng một người: tầng dưới lập phòng 1-1 với người
// đầu tiên, những người chọn thêm sẽ rơi lặng lẽ. Chặn ngay tại đây thay vì để
// người dùng phát hiện sau.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import { Sheet } from './Sheet';
import MemberPicker, { displayNameOf } from './MemberPicker';
import { CONVERSATION_TYPE_META, type ConversationType } from '../types';
import type { RemoteUser } from '../../../../../services/proofchat-api';

const TYPES: ConversationType[] = ['DIRECT', 'GROUP', 'THREAD', 'JOB_NEGOTIATION'];

export interface CreateConversationPayload {
  title: string;
  type: ConversationType;
  participantIds: string[];
}

interface Props {
  visible: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateConversationPayload) => void;
}

const CreateConversationModal: React.FC<Props> = ({
  visible,
  submitting = false,
  onClose,
  onSubmit,
}) => {
  const [step, setStep] = useState<'type' | 'people'>('type');
  const [type, setType] = useState<ConversationType>('GROUP');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<RemoteUser[]>([]);

  useEffect(() => {
    if (!visible) return;
    setStep('type');
    setType('GROUP');
    setTitle('');
    setSelected([]);
  }, [visible]);

  const isDirect = type === 'DIRECT';
  const selectedIds = useMemo(() => selected.map((u) => u.userDid), [selected]);

  const toggle = (u: RemoteUser) => {
    setSelected((cur) => {
      const has = cur.some((x) => x.userDid === u.userDid);
      if (has) return cur.filter((x) => x.userDid !== u.userDid);
      // Phòng riêng: người mới thay người cũ, không cộng dồn rồi báo lỗi sau.
      return isDirect ? [u] : [...cur, u];
    });
  };

  const effectiveTitle = isDirect
    ? selected[0]
      ? displayNameOf(selected[0])
      : ''
    : title.trim();

  const canSubmit =
    selected.length > 0 && (isDirect || effectiveTitle.length > 0) && !submitting;

  // ── Bước 1: kiểu phòng ──
  if (step === 'type') {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Trò chuyện mới"
        subtitle="Chọn kiểu phòng trước — sau đó chọn người."
      >
        {TYPES.map((t) => {
          const meta = CONVERSATION_TYPE_META[t];
          const active = type === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                setType(t);
                setSelected([]);
                setStep('people');
              }}
              style={({ pressed }) => [
                styles.typeRow,
                active && styles.typeRowActive,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
            >
              <View style={styles.typeIcon}>
                <Icon name={meta.icon} size={20} color={CHAT_THEME.primary} />
              </View>
              <View style={styles.typeText}>
                <Text style={styles.typeLabel}>{meta.label}</Text>
                <Text style={styles.typeDesc}>{meta.description}</Text>
              </View>
              <Icon name="chevron-right" size={19} color={NEUTRAL.textMuted} />
            </Pressable>
          );
        })}
      </Sheet>
    );
  }

  // ── Bước 2: người + tên ──
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={CONVERSATION_TYPE_META[type].label}
      subtitle={
        isDirect
          ? 'Chọn một người để bắt đầu.'
          : 'Chọn những người bạn muốn mời, rồi đặt tên cho phòng.'
      }
      scroll
    >
      {!isDirect && (
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Tên phòng"
          placeholderTextColor={NEUTRAL.textMuted}
          maxLength={200}
        />
      )}

      {selected.length > 0 && (
        <View style={styles.chipRow}>
          {selected.map((u) => (
            <Pressable key={u.userDid} style={styles.chip} onPress={() => toggle(u)}>
              <Text style={styles.chipText} numberOfLines={1}>
                {displayNameOf(u)}
              </Text>
              <Icon name="close" size={13} color={CHAT_THEME.primaryDeep} />
            </Pressable>
          ))}
        </View>
      )}

      <MemberPicker selectedIds={selectedIds} onPick={toggle} />

      <View style={styles.buttonRow}>
        <Pressable style={styles.ghostBtn} onPress={() => setStep('type')}>
          <Text style={styles.ghostBtnText}>Quay lại</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, !canSubmit && styles.primaryBtnOff]}
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({ title: effectiveTitle, type, participantIds: selectedIds })
          }
        >
          {submitting ? (
            <ActivityIndicator size="small" color={NEUTRAL.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Tạo phòng</Text>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.sm,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.base,
  },
  typeRowActive: { borderColor: withAlpha(CHAT_THEME.primary, 0.5) },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeText: { flex: 1 },
  typeLabel: { fontSize: 14.5, fontWeight: '600', color: NEUTRAL.text },
  typeDesc: { fontSize: 11.5, color: NEUTRAL.textMuted, marginTop: 2 },

  input: {
    height: 48,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    fontSize: 15,
    color: NEUTRAL.text,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
    marginBottom: SPACE.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACE.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 190,
    paddingHorizontal: SPACE.sm + 2,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.12),
  },
  chipText: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: CHAT_THEME.primaryDeep },

  buttonRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  ghostBtn: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
  },
  ghostBtnText: { fontSize: 14.5, fontWeight: '600', color: NEUTRAL.textSub },
  primaryBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT_THEME.primary,
  },
  primaryBtnOff: { backgroundColor: withAlpha(CHAT_THEME.primary, 0.3) },
  primaryBtnText: { fontSize: 14.5, fontWeight: '700', color: NEUTRAL.white },
});

export default CreateConversationModal;
