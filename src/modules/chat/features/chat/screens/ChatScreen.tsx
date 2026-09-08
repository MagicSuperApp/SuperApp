// modules/chat/features/chat/screens/ChatScreen.tsx
//
// Một phòng chat.
//
// ĐÃ GỠ so với bản trước — tất cả đều là dàn-dựng, không phải trạng-thái thật:
//   · `OUTGOING_PIPELINE` / `INCOMING_PIPELINE` chạy bằng setTimeout để tin của
//     mình lần lượt "đang mã hoá → đang ký → đang gửi"
//   · `handleDecrypt` — chạm vào tin thì hiện ra một câu viết cứng trong mã nguồn,
//     chọn theo id tin ('m6' → "Em vừa kiểm tra lại…")
//   · dải "End-to-end · Proof System" đứng thường trực trên đầu phòng
//   · thẻ ký-quỹ + nút mở màn ký-quỹ (chat không giữ tiền — xem module.manifest.json)
//
// Máy chủ dùng ở màn này:
//   GET  /conversations/:id/messages    tin cũ (phần vỏ)
//   GET  /conversations/:id             thành viên + quyền quản
//   GET  /conversations/:id/pins        tin đã ghim
//   POST /trackmess/signals             báo đã-xem
//   cảm-xúc · ghim · lưu · thu hồi      qua `messages.*` / `conversations.*`
// Nội dung tin đi qua `proofchatService` (mã hoá + socket), không qua REST.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';
import type { RootState, AppDispatch } from '../../../../../store';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { ACRYLIC, RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import { MicaBackdrop } from '../../../shared/components/Fluent';
import StateView from '../../../../../components/state/StateView';
import ChatHeader from '../components/ChatHeader';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import SyncStatusPill from '../components/SyncStatusPill';
import MessageActionsSheet from '../components/MessageActionsSheet';
import ConversationInfoSheet from '../components/ConversationInfoSheet';
import {
  deleteMessage,
  inviteMember,
  leaveConversation,
  loadConversationDetail,
  loadJoinRequests,
  loadMessages,
  loadPins,
  approveJoinRequest,
  rejectJoinRequest,
  markConversationRead,
  removeMember,
  renameConversation,
  reportSeen,
  togglePin,
  toggleReaction,
  toggleSave,
} from '../../../store/chatSlice';
import type { Message } from '../types';
import { isProofChatBackendEnabled } from '../../../../../services/proofchat-api';
import { sendText, syncConversation } from '../../../../../services/proofchatService';
import chatSocket from '../../../../../services/chatSocket';
import { showWarning } from '../../../../../utils/alert';
import { useCapabilityLive } from '../../../../../config/useCapabilityLive';

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useDispatch<AppDispatch>();

  const conversationId: string = route.params?.roomId;

  const conversation = useSelector((s: RootState) =>
    s.chat.conversations.find((c) => c.id === conversationId),
  );
  const messages = useSelector(
    (s: RootState) => s.chat.messagesByConversation[conversationId] ?? [],
  );
  const messagesStatus = useSelector(
    (s: RootState) => s.chat.messagesStatus[conversationId] ?? 'idle',
  );
  const joinRequests = useSelector(
    (s: RootState) => s.chat.joinRequestsByConversation[conversationId] ?? [],
  );
  const typingIds = useSelector(
    (s: RootState) => s.chat.typingByConversation[conversationId] ?? [],
  );
  const sync = useSelector((s: RootState) => s.chat.sync);
  const meId = useSelector((s: RootState) => s.chat.meId);

  const listRef = useRef<FlatList>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // Phải ĐĂNG KÝ nghe cổng runtime, không chỉ đọc một phát lúc render như trước:
  // `isProofChatBackendEnabled()` đọc `liveState` ĐỒNG BỘ, nên nếu màn này gắn trước
  // khi probe /health xong (mở app rồi vào thẳng một phòng là đúng ca đó), nó chốt
  // `false` và KHÔNG có gì bắt nó vẽ lại — ô nhập kẹt "Chưa kết nối máy chủ" tới khi
  // thoát ra vào lại. ChatHomeScreen đã nối hook này từ đầu; đây là chỗ bị bỏ sót.
  const proofchatLive = useCapabilityLive('proofchat');
  const backendReady = proofchatLive && isProofChatBackendEnabled();

  // ── Nạp phòng ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!backendReady || !conversationId) return;
    dispatch(loadMessages(conversationId));
    dispatch(loadConversationDetail(conversationId));
    dispatch(loadPins(conversationId));
    // Chuẩn bị khoá của phòng trước khi gửi được tin đầu tiên. Chạy nền, hỏng
    // thì lần gửi sẽ báo lỗi cụ thể chứ không cần chặn màn ở đây.
    syncConversation(conversationId).catch((err) =>
      console.warn('[Chat] chuẩn bị phòng thất bại:', err),
    );
  }, [backendReady, conversationId, dispatch]);

  useEffect(() => {
    if (conversation?.iAmAdmin) dispatch(loadJoinRequests(conversationId));
  }, [conversation?.iAmAdmin, conversationId, dispatch]);

  useEffect(() => {
    if (conversation && conversation.unreadCount > 0) {
      dispatch(markConversationRead(conversationId));
    }
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length]);

  // ── Báo đã-xem ───────────────────────────────────────────────────────────
  // Gom những tin của người khác vừa hiện lên màn, gửi một lần. `seenRef` chặn
  // gửi lại cùng một tin mỗi lần cuộn qua.
  const handleViewable = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: Item }> }) => {
      const fresh: string[] = [];
      viewableItems.forEach((v) => {
        if (v.item.type !== 'msg') return;
        const m = v.item.message;
        if (m.isMine || seenRef.current.has(m.id)) return;
        seenRef.current.add(m.id);
        fresh.push(m.id);
      });
      if (fresh.length > 0) {
        dispatch(reportSeen({ conversationId, messageIds: fresh }));
      }
    },
  ).current;

  // ── Gửi ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    (text: string) => {
      if (!backendReady) {
        Toast.show({
          type: 'error',
          text1: 'Chưa kết nối',
          text2: 'Máy chủ trò chuyện chưa sẵn sàng.',
        });
        return;
      }
      // Tin hiện lên khi máy chủ dội về đã giải mã — một nguồn duy nhất, nên
      // không có bản tạm nào để nhân đôi khi mạng chậm.
      sendText(conversationId, text, conversation?.type)
        .then((ack) => {
          if (!ack.ok) {
            Toast.show({
              type: 'error',
              text1: 'Chưa gửi được',
              text2: ack.error ?? 'Thử lại sau.',
            });
          }
        })
        .catch(() =>
          Toast.show({ type: 'error', text1: 'Chưa gửi được', text2: 'Mất kết nối.' }),
        );
    },
    [backendReady, conversationId, conversation?.type],
  );

  const handleTyping = useCallback(
    (typing: boolean) => {
      if (backendReady) chatSocket.sendTyping(conversationId, typing);
    },
    [backendReady, conversationId],
  );

  // ── Thao tác trên một tin ────────────────────────────────────────────────
  const handleReact = (message: Message, emoji: string) => {
    const had = message.reactions.some((r) => r.emoji === emoji && r.mine);
    dispatch(toggleReaction({ conversationId, messageId: message.id, emoji, had }));
  };

  const closeActions = () => setActionTarget(null);

  const handleDelete = () => {
    const target = actionTarget;
    if (!target) return;
    closeActions();
    showWarning(
      'Thu hồi tin nhắn?',
      'Tin sẽ biến mất với tất cả mọi người trong phòng.',
      {
        confirmText: 'Thu hồi',
        onConfirm: () => {
          dispatch(
            deleteMessage({ conversationId, messageId: target.id, forEveryone: true }),
          );
        },
      },
    );
  };

  const handleLeave = () => {
    setInfoOpen(false);
    showWarning('Rời cuộc trò chuyện?', 'Bạn sẽ không nhận tin mới từ phòng này nữa.', {
      confirmText: 'Rời phòng',
      onConfirm: async () => {
        try {
          await dispatch(leaveConversation(conversationId)).unwrap();
          navigation.goBack();
        } catch {
          Toast.show({ type: 'error', text1: 'Chưa rời được', text2: 'Thử lại sau.' });
        }
      },
    });
  };

  const items = useMemo(() => groupByDate(messages, conversation?.type !== 'DIRECT'), [
    messages,
    conversation?.type,
  ]);

  const typingNames = useMemo(
    () =>
      typingIds
        .filter((id) => id !== meId)
        .map(
          (id) => conversation?.participants.find((p) => p.id === id)?.name ?? 'Ai đó',
        ),
    [typingIds, meId, conversation?.participants],
  );

  const pinned = useMemo(
    () => messages.filter((m) => m.pinned && !m.deleted),
    [messages],
  );

  if (!conversation) {
    return (
      <View style={styles.root}>
        <MicaBackdrop intensity={0.6} />
        <StateView
          status="empty"
          title="Không mở được cuộc trò chuyện"
          message="Quay lại danh sách rồi thử lần nữa."
          onRetry={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <MicaBackdrop intensity={0.6} />

      <ChatHeader
        conversation={conversation}
        typingNames={typingNames}
        onBack={() => navigation.goBack()}
        onPressTitle={() => setInfoOpen(true)}
        onPressInfo={() => setInfoOpen(true)}
      />

      {pinned.length > 0 && (
        <Pressable
          style={styles.pinnedBar}
          onPress={() => setActionTarget(pinned[pinned.length - 1])}
        >
          <Icon name="pin" size={14} color={CHAT_THEME.primary} />
          <Text style={styles.pinnedText} numberOfLines={1}>
            {pinned[pinned.length - 1].text ?? 'Một tin đã được ghim'}
          </Text>
          {pinned.length > 1 && (
            <Text style={styles.pinnedCount}>+{pinned.length - 1}</Text>
          )}
        </Pressable>
      )}

      <SyncStatusPill state={sync} />

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) =>
          item.type === 'sep' ? (
            <View style={styles.dateSep}>
              <Text style={styles.dateText}>{item.label}</Text>
            </View>
          ) : (
            <MessageBubble
              message={item.message}
              showTail={item.showTail}
              showSender={item.showSender}
              onLongPress={setActionTarget}
              onPressReaction={handleReact}
            />
          )
        }
        onViewableItemsChanged={handleViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        contentContainerStyle={
          items.length === 0 ? styles.listEmpty : styles.listContent
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          messagesStatus === 'loading' ? (
            <StateView status="loading" loadingLines={4} />
          ) : messagesStatus === 'error' ? (
            <StateView
              status="error"
              title="Chưa tải được tin nhắn"
              onRetry={() => dispatch(loadMessages(conversationId))}
            />
          ) : (
            <StateView
              status="empty"
              title="Chưa có tin nhắn"
              message="Gửi lời chào để bắt đầu."
            />
          )
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      <ChatInput
        onSend={handleSend}
        onTypingChange={handleTyping}
        disabled={!backendReady}
        placeholder={backendReady ? 'Nhắn tin…' : 'Chưa kết nối máy chủ'}
      />

      <MessageActionsSheet
        message={actionTarget}
        canPin={conversation.iAmAdmin}
        onClose={closeActions}
        onReact={(emoji) => {
          if (actionTarget) handleReact(actionTarget, emoji);
          closeActions();
        }}
        onTogglePin={() => {
          if (actionTarget) {
            dispatch(
              togglePin({
                conversationId,
                messageId: actionTarget.id,
                pinned: actionTarget.pinned,
              }),
            );
          }
          closeActions();
        }}
        onToggleSave={() => {
          if (actionTarget) {
            dispatch(
              toggleSave({
                conversationId,
                messageId: actionTarget.id,
                saved: actionTarget.saved,
              }),
            );
          }
          closeActions();
        }}
        onCopy={() => {
          if (actionTarget?.text) {
            Clipboard.setString(actionTarget.text);
            Toast.show({ type: 'success', text1: 'Đã sao chép' });
          }
          closeActions();
        }}
        onDelete={handleDelete}
      />

      <ConversationInfoSheet
        visible={infoOpen}
        conversation={conversation}
        joinRequests={joinRequests}
        meId={meId}
        onClose={() => setInfoOpen(false)}
        onRename={async (title) => {
          await dispatch(renameConversation({ conversationId, title })).unwrap();
        }}
        onInvite={async (userId) => {
          await dispatch(inviteMember({ conversationId, userId })).unwrap();
          Toast.show({ type: 'success', text1: 'Đã gửi lời mời' });
        }}
        onRemoveMember={async (userId) => {
          await dispatch(removeMember({ conversationId, userId })).unwrap();
        }}
        onApproveRequest={async (requestId) => {
          await dispatch(approveJoinRequest({ conversationId, requestId })).unwrap();
          dispatch(loadConversationDetail(conversationId));
        }}
        onRejectRequest={async (requestId) => {
          await dispatch(rejectJoinRequest({ conversationId, requestId })).unwrap();
        }}
        onLeave={handleLeave}
      />
    </View>
  );
};

// ── Gom tin theo ngày ───────────────────────────────────────────────────────

type Item =
  | { type: 'msg'; key: string; message: Message; showTail: boolean; showSender: boolean }
  | { type: 'sep'; key: string; label: string };

function groupByDate(messages: Message[], group: boolean): Item[] {
  const out: Item[] = [];
  let prevDate = '';
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const d = new Date(m.timestamp);
    const dateKey = d.toDateString();
    if (dateKey !== prevDate) {
      out.push({ type: 'sep', key: `sep-${dateKey}`, label: humanDate(d) });
      prevDate = dateKey;
    }
    const next = messages[i + 1];
    const prev = messages[i - 1];
    out.push({
      type: 'msg',
      key: m.id,
      message: m,
      showTail: !next || next.isMine !== m.isMine,
      // Tên người gửi chỉ hiện ở tin ĐẦU của mỗi lượt nói, trong phòng nhiều người.
      showSender: group && !m.isMine && (!prev || prev.senderId !== m.senderId),
    });
  }
  return out;
}

function humanDate(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN');
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginHorizontal: SPACE.md,
    marginTop: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.09),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(CHAT_THEME.primary, 0.22),
  },
  pinnedText: { flex: 1, fontSize: 12.5, color: NEUTRAL.textSub, fontWeight: '500' },
  pinnedCount: { fontSize: 11, fontWeight: '700', color: CHAT_THEME.primary },

  listContent: { paddingVertical: SPACE.md },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },

  dateSep: { alignItems: 'center', marginVertical: SPACE.md },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: NEUTRAL.textMuted,
    paddingHorizontal: SPACE.md,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: ACRYLIC.thin.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.base,
    overflow: 'hidden',
  },
});

export default ChatScreen;
