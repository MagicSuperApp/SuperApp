// modules/chat/features/chat/components/ConversationInfoSheet.tsx
//
// Bảng thông tin phòng: đổi tên, danh sách người, mời thêm, duyệt người xin vào,
// gỡ người, rời phòng.
//
// Đây là chỗ những đường máy chủ về thành viên thật sự được dùng:
//   PATCH  /conversations/:id                          đổi tên
//   DELETE /conversations/:id/participants/:userId     gỡ người
//   POST   /conversations/:id/leave                    rời phòng
//   POST   …/member-requests/invite                    mời thêm
//   GET    …/member-requests                           ai đang xin vào
//   POST   …/member-requests/:rid/approve | reject     duyệt / từ chối
//
// Mọi nút quản-lý chỉ hiện khi tôi có quyền quản phòng — ẩn hẳn chứ không làm mờ,
// vì một nút mờ vẫn khiến người dùng đi tìm cách bật nó lên.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import { Sheet, SheetRow, SheetDismiss } from './Sheet';
import Avatar from './Avatar';
import MemberPicker from './MemberPicker';
import type { Conversation, JoinRequest } from '../types';
import { CONVERSATION_TYPE_META } from '../types';

interface Props {
  visible: boolean;
  conversation: Conversation;
  joinRequests: JoinRequest[];
  meId: string;
  onClose: () => void;
  onRename: (title: string) => Promise<void> | void;
  onInvite: (userId: string) => Promise<void> | void;
  onRemoveMember: (userId: string) => Promise<void> | void;
  onApproveRequest: (requestId: string) => Promise<void> | void;
  onRejectRequest: (requestId: string) => Promise<void> | void;
  onLeave: () => void;
}

type Pane = 'main' | 'rename' | 'invite' | 'requests';

const ConversationInfoSheet: React.FC<Props> = ({
  visible,
  conversation,
  joinRequests,
  meId,
  onClose,
  onRename,
  onInvite,
  onRemoveMember,
  onApproveRequest,
  onRejectRequest,
  onLeave,
}) => {
  const [pane, setPane] = useState<Pane>('main');
  const [draftTitle, setDraftTitle] = useState(conversation.title);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPane('main');
      setDraftTitle(conversation.title);
      setBusy(false);
    }
  }, [visible, conversation.title]);

  const members = useMemo(
    () => [...conversation.participants].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)),
    [conversation.participants],
  );

  const run = async (fn: () => Promise<void> | void, back = true) => {
    setBusy(true);
    try {
      await fn();
      if (back) setPane('main');
    } finally {
      setBusy(false);
    }
  };

  // ── Đổi tên ──
  if (pane === 'rename') {
    const dirty = draftTitle.trim().length > 0 && draftTitle.trim() !== conversation.title;
    return (
      <Sheet visible={visible} onClose={onClose} title="Đổi tên cuộc trò chuyện">
        <TextInput
          style={styles.input}
          value={draftTitle}
          onChangeText={setDraftTitle}
          placeholder="Tên hiển thị cho cả phòng"
          placeholderTextColor={NEUTRAL.textMuted}
          maxLength={200}
          autoFocus
        />
        <View style={styles.buttonRow}>
          <Pressable style={styles.ghostBtn} onPress={() => setPane('main')}>
            <Text style={styles.ghostBtnText}>Quay lại</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, !dirty && styles.primaryBtnOff]}
            disabled={!dirty || busy}
            onPress={() => run(() => onRename(draftTitle.trim()))}
          >
            {busy ? (
              <ActivityIndicator size="small" color={NEUTRAL.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Lưu</Text>
            )}
          </Pressable>
        </View>
      </Sheet>
    );
  }

  // ── Mời thêm người ──
  if (pane === 'invite') {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Mời thêm người"
        subtitle="Tìm theo tên hoặc mã người dùng. Người được mời sẽ nhận lời mời và tự quyết định."
      >
        <MemberPicker
          excludeIds={[meId, ...members.map((m) => m.id)]}
          onPick={(user) => run(() => onInvite(user.userDid))}
        />
        <SheetDismiss label="Quay lại" onPress={() => setPane('main')} />
      </Sheet>
    );
  }

  // ── Duyệt người xin vào ──
  if (pane === 'requests') {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Chờ bạn duyệt"
        subtitle={`${joinRequests.length} người muốn vào phòng này`}
        scroll
      >
        {joinRequests.length === 0 ? (
          <Text style={styles.emptyLine}>Không còn ai đang chờ.</Text>
        ) : (
          joinRequests.map((r) => (
            <View key={r.id} style={styles.requestRow}>
              <Avatar name={r.requesterName ?? '?'} size={38} />
              <View style={styles.requestText}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {r.requesterName}
                </Text>
                {!!r.message && (
                  <Text style={styles.memberMeta} numberOfLines={2}>
                    “{r.message}”
                  </Text>
                )}
              </View>
              <Pressable
                style={styles.approveBtn}
                disabled={busy}
                onPress={() => run(() => onApproveRequest(r.id), false)}
                accessibilityLabel="Cho vào"
              >
                <Icon name="check" size={17} color={NEUTRAL.white} />
              </Pressable>
              <Pressable
                style={styles.rejectBtn}
                disabled={busy}
                onPress={() => run(() => onRejectRequest(r.id), false)}
                accessibilityLabel="Từ chối"
              >
                <Icon name="close" size={17} color={NEUTRAL.error} />
              </Pressable>
            </View>
          ))
        )}
        <SheetDismiss label="Quay lại" onPress={() => setPane('main')} />
      </Sheet>
    );
  }

  // ── Bảng chính ──
  return (
    <Sheet visible={visible} onClose={onClose} scroll>
      <View style={styles.hero}>
        <Avatar name={conversation.title} uri={conversation.avatar} size={64} />
        <Text style={styles.heroTitle} numberOfLines={2}>
          {conversation.title}
        </Text>
        <Text style={styles.heroMeta}>
          {CONVERSATION_TYPE_META[conversation.type].label}
          {conversation.type !== 'DIRECT' ? ` · ${conversation.memberCount} người` : ''}
        </Text>
      </View>

      {conversation.iAmAdmin && (
        <>
          <SheetRow
            icon="pencil-outline"
            label="Đổi tên"
            onPress={() => setPane('rename')}
          />
          <SheetRow
            icon="account-plus-outline"
            label="Mời thêm người"
            onPress={() => setPane('invite')}
          />
          {joinRequests.length > 0 && (
            <SheetRow
              icon="account-clock-outline"
              label={`Chờ bạn duyệt (${joinRequests.length})`}
              description="Có người muốn vào phòng này"
              onPress={() => setPane('requests')}
            />
          )}
        </>
      )}

      {members.length > 0 && (
        <View style={styles.memberBlock}>
          <Text style={styles.sectionLabel}>Trong phòng</Text>
          {members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Avatar name={m.name} uri={m.avatar} size={36} />
              <View style={styles.memberText}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {m.name}
                  {m.id === meId ? ' (bạn)' : ''}
                </Text>
                {m.isAdmin && <Text style={styles.memberMeta}>Người quản lý</Text>}
              </View>
              {conversation.iAmAdmin && m.id !== meId && (
                <Pressable
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => run(() => onRemoveMember(m.id), false)}
                  accessibilityLabel={`Gỡ ${m.name}`}
                >
                  <Icon name="account-remove-outline" size={19} color={NEUTRAL.textMuted} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      <SheetRow
        icon="exit-to-app"
        label="Rời cuộc trò chuyện"
        description="Bạn sẽ không nhận tin mới từ phòng này nữa"
        onPress={onLeave}
        destructive
      />

      <SheetDismiss onPress={onClose} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingBottom: SPACE.lg },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NEUTRAL.text,
    textAlign: 'center',
    marginTop: SPACE.xs,
  },
  heroMeta: { fontSize: 12.5, color: NEUTRAL.textMuted },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: NEUTRAL.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: SPACE.sm,
    marginTop: SPACE.xs,
  },
  memberBlock: { marginBottom: SPACE.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xs,
  },
  memberText: { flex: 1, gap: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: NEUTRAL.text },
  memberMeta: { fontSize: 11.5, color: NEUTRAL.textMuted },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
  },
  requestText: { flex: 1, gap: 2 },
  approveBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: CHAT_THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(NEUTRAL.error, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLine: {
    fontSize: 13,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    paddingVertical: SPACE.xl,
  },

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
  buttonRow: { flexDirection: 'row', gap: SPACE.sm },
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
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT_THEME.primary,
  },
  primaryBtnOff: { backgroundColor: withAlpha(CHAT_THEME.primary, 0.3) },
  primaryBtnText: { fontSize: 14.5, fontWeight: '700', color: NEUTRAL.white },
});

export default ConversationInfoSheet;
