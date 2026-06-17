// modules/proofchat/features/chat/components/InvitationsModal.tsx
//
// Modal "Lời mời tham gia": liệt kê các invitation pending,
// cho phép Accept (tham gia) hoặc Reject (từ chối).

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import {
  CONVERSATION_TYPE_META,
  type Invitation,
} from '../types';
import { formatRelative } from '../../../shared/utils/format';

interface Props {
  visible: boolean;
  invitations: Invitation[];
  onClose: () => void;
  onAccept: (invitationId: string) => void;
  onReject: (invitationId: string) => void;
}

const InvitationsModal: React.FC<Props> = ({
  visible,
  invitations,
  onClose,
  onAccept,
  onReject,
}) => {
  const pendingCount = invitations.filter(i => i.status === 'pending').length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Icon name="email-outline" size={20} color={PROOFCHAT_THEME.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Lời mời tham gia</Text>
              <Text style={styles.subtitle}>
                {pendingCount > 0
                  ? `${pendingCount} lời mời đang chờ phản hồi`
                  : 'Không có lời mời mới'}
              </Text>
            </View>
            <TouchableOpacity hitSlop={8} onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={18} color={NEUTRAL.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={invitations}
            keyExtractor={i => i.id}
            renderItem={({ item }) => (
              <InvitationRow
                invitation={item}
                onAccept={() => onAccept(item.id)}
                onReject={() => onReject(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={<Empty />}
            contentContainerStyle={
              invitations.length === 0
                ? { flexGrow: 1 }
                : { paddingVertical: 8 }
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
};

const InvitationRow: React.FC<{
  invitation: Invitation;
  onAccept: () => void;
  onReject: () => void;
}> = ({ invitation, onAccept, onReject }) => {
  const meta = CONVERSATION_TYPE_META[invitation.conversationType];
  const settled = invitation.status !== 'pending';

  const initials = invitation.inviterName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.row, settled && { opacity: 0.55 }]}>
      <View style={styles.avatar}>
        {invitation.inviterAvatar ? (
          <Image source={{ uri: invitation.inviterAvatar }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarText}>{initials}</Text>
        )}
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.titleRow}>
          <Text style={styles.convTitle} numberOfLines={1}>
            {invitation.conversationTitle}
          </Text>
          <View style={styles.typeChip}>
            <Icon name={meta.icon} size={10} color={PROOFCHAT_THEME.primary} />
            <Text style={styles.typeChipText}>{meta.label}</Text>
          </View>
        </View>

        <Text style={styles.inviter} numberOfLines={1}>
          <Text style={styles.inviterLabel}>Người mời: </Text>
          {invitation.inviterName}
        </Text>

        {!!invitation.message && (
          <Text style={styles.message} numberOfLines={3}>
            "{invitation.message}"
          </Text>
        )}

        <Text style={styles.time}>{formatRelative(invitation.createdAt)} trước</Text>

        {invitation.status === 'pending' ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={onReject}
              activeOpacity={0.85}
            >
              <Icon name="close" size={14} color={NEUTRAL.error} />
              <Text style={styles.rejectText}>Từ chối</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={onAccept}
              activeOpacity={0.85}
            >
              <Icon name="check" size={14} color={NEUTRAL.white} />
              <Text style={styles.acceptText}>Tham gia</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  invitation.status === 'accepted'
                    ? withAlpha(NEUTRAL.success, 0.12)
                    : withAlpha(NEUTRAL.textMuted, 0.18),
              },
            ]}
          >
            <Icon
              name={invitation.status === 'accepted' ? 'check-circle-outline' : 'close-circle-outline'}
              size={11}
              color={invitation.status === 'accepted' ? NEUTRAL.success : NEUTRAL.textMuted}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    invitation.status === 'accepted'
                      ? NEUTRAL.success
                      : NEUTRAL.textMuted,
                },
              ]}
            >
              {invitation.status === 'accepted' ? 'Đã tham gia' : 'Đã từ chối'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const Empty: React.FC = () => (
  <View style={styles.empty}>
    <View style={styles.emptyIcon}>
      <Icon name="email-check-outline" size={36} color={PROOFCHAT_THEME.primary} />
    </View>
    <Text style={styles.emptyTitle}>Không có lời mời</Text>
    <Text style={styles.emptyDesc}>
      Khi có người mời bạn vào nhóm, lời mời sẽ xuất hiện ở đây.
    </Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: NEUTRAL.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '50%',
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
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 15, fontWeight: '800', color: PROOFCHAT_THEME.primary },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  convTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: NEUTRAL.text },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
  },
  typeChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: PROOFCHAT_THEME.primary,
    letterSpacing: 0.2,
  },
  inviter: { fontSize: 12, color: NEUTRAL.textSub },
  inviterLabel: { color: NEUTRAL.textMuted },
  message: {
    fontSize: 12,
    fontStyle: 'italic',
    color: NEUTRAL.textSub,
    backgroundColor: NEUTRAL.bgSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    lineHeight: 17,
  },
  time: { fontSize: 10, color: NEUTRAL.textMuted, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  rejectBtn: {
    backgroundColor: withAlpha(NEUTRAL.error, 0.10),
    borderWidth: 1,
    borderColor: withAlpha(NEUTRAL.error, 0.25),
  },
  rejectText: { fontSize: 12, fontWeight: '700', color: NEUTRAL.error },
  acceptBtn: { backgroundColor: PROOFCHAT_THEME.primary },
  acceptText: { fontSize: 12, fontWeight: '800', color: NEUTRAL.white },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  sep: { height: 1, backgroundColor: NEUTRAL.borderSoft, marginLeft: 76 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: NEUTRAL.text, marginBottom: 6 },
  emptyDesc: {
    fontSize: 13,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});

export default InvitationsModal;
