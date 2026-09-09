// modules/chat/features/chat/components/InvitationsModal.tsx
//
// Lời mời người khác gửi cho tôi. Nguồn: GET /member-requests/pending
// (`memberRequests.pending`) — trước đây là ba lời mời viết cứng trong dữ-liệu mẫu,
// nhận hay từ chối cũng chỉ đổi một cờ trong máy, bên kia không hề hay biết.
//
// Nhận  → POST /member-requests/:id/accept
// Bỏ    → POST /member-requests/:id/decline
// Sau khi máy chủ trả lời, danh sách phòng được tải lại để phòng mới hiện ra.

import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import { Sheet, SheetDismiss } from './Sheet';
import Avatar from './Avatar';
import { formatRelative } from '../../../shared/utils/format';
import type { Invitation } from '../types';

interface Props {
  visible: boolean;
  invitations: Invitation[];
  loading?: boolean;
  /**
   * Lượt tải hỏng — câu viết cho người dùng, kèm tiêu đề. Rỗng nghĩa là tải xong.
   *
   * Danh sách rỗng vì KHÔNG CÓ lời mời, và danh sách rỗng vì KHÔNG TẢI ĐƯỢC, phải
   * ra hai màn hình khác nhau. Gộp lại thì màn hình khẳng định "Chưa có lời mời
   * nào" trong lúc thật ra có, và người dùng đóng hộp đi rồi bỏ lỡ lời mời thật.
   */
  errorTitle?: string;
  errorMessage?: string;
  /** ID lời mời đang xử-lý — nút của riêng dòng đó quay vòng, không khoá cả bảng. */
  busyId?: string | null;
  onClose: () => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

const InvitationsModal: React.FC<Props> = ({
  visible,
  invitations,
  loading = false,
  errorTitle,
  errorMessage,
  busyId,
  onClose,
  onAccept,
  onDecline,
}) => (
  <Sheet
    visible={visible}
    onClose={onClose}
    title="Lời mời"
    subtitle={
      invitations.length > 0
        ? `${invitations.length} người đang mời bạn vào phòng`
        : undefined
    }
    scroll
  >
    {loading && invitations.length === 0 ? (
      <View style={styles.center}>
        <ActivityIndicator color={CHAT_THEME.primary} />
      </View>
    ) : errorMessage && invitations.length === 0 ? (
      // Tải hỏng — dấu hiệu khác hẳn ca rỗng thật: biểu tượng cảnh báo, tiêu đề
      // riêng, và câu nói vì sao. KHÔNG dùng lại câu "Chưa có lời mời nào".
      <View style={styles.center}>
        <Icon name="alert-circle-outline" size={34} color={CHAT_THEME.primary} />
        {!!errorTitle && <Text style={styles.errorTitle}>{errorTitle}</Text>}
        <Text style={styles.emptyText}>{errorMessage}</Text>
      </View>
    ) : invitations.length === 0 ? (
      <View style={styles.center}>
        <Icon name="email-open-outline" size={34} color={NEUTRAL.textMuted} />
        <Text style={styles.emptyText}>Chưa có lời mời nào.</Text>
      </View>
    ) : (
      invitations.map((inv) => {
        const busy = busyId === inv.id;
        return (
          <View key={inv.id} style={styles.card}>
            <View style={styles.head}>
              <Avatar name={inv.conversationTitle} size={42} />
              <View style={styles.headText}>
                <Text style={styles.title} numberOfLines={2}>
                  {inv.conversationTitle}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {inv.inviterName} mời · {formatRelative(inv.createdAt)}
                </Text>
              </View>
            </View>

            {!!inv.message && (
              <Text style={styles.message} numberOfLines={3}>
                “{inv.message}”
              </Text>
            )}

            <View style={styles.actions}>
              <Pressable
                style={styles.declineBtn}
                disabled={busy}
                onPress={() => onDecline(inv.id)}
              >
                <Text style={styles.declineText}>Bỏ qua</Text>
              </Pressable>
              <Pressable
                style={styles.acceptBtn}
                disabled={busy}
                onPress={() => onAccept(inv.id)}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={NEUTRAL.white} />
                ) : (
                  <Text style={styles.acceptText}>Tham gia</Text>
                )}
              </Pressable>
            </View>
          </View>
        );
      })
    )}

    <SheetDismiss onPress={onClose} />
  </Sheet>
);

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xxl },
  emptyText: { fontSize: 13, color: NEUTRAL.textMuted, textAlign: 'center' },
  errorTitle: { fontSize: 15, fontWeight: '600', color: NEUTRAL.text, marginBottom: 2 },
  card: {
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACE.sm,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.base,
    gap: SPACE.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 14.5, fontWeight: '700', color: NEUTRAL.text },
  meta: { fontSize: 11.5, color: NEUTRAL.textMuted },
  message: {
    fontSize: 13,
    lineHeight: 18,
    color: NEUTRAL.textSub,
    fontStyle: 'italic',
    paddingLeft: SPACE.sm,
    borderLeftWidth: 2,
    borderLeftColor: withAlpha(CHAT_THEME.primary, 0.3),
  },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  declineBtn: {
    flex: 1,
    height: 42,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
  },
  declineText: { fontSize: 13.5, fontWeight: '600', color: NEUTRAL.textSub },
  acceptBtn: {
    flex: 1.3,
    height: 42,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT_THEME.primary,
  },
  acceptText: { fontSize: 13.5, fontWeight: '700', color: NEUTRAL.white },
});

export default InvitationsModal;
