// modules/chat/features/chat/screens/ChatHomeScreen.tsx
//
// Danh sách trò chuyện. Toàn bộ dữ-liệu tới từ máy chủ ProofChat; không còn
// nhánh nào vẽ phòng mẫu khi máy chủ chưa mở.
//
// Máy chủ dùng ở màn này:
//   GET  /conversations                 danh sách phòng
//   GET  /member-requests/pending       lời mời gửi cho tôi
//   POST /member-requests/:id/accept|decline
//   POST /conversations/:id/join        vào phòng bằng mã
//   (tạo phòng đi qua `proofchatService` vì còn phải dựng khoá cho phòng)
//
// Vật liệu Fluent: nền Mica cho cả màn, thanh đầu màn là tấm Acrylic, mỗi dòng
// trò chuyện là một thẻ bo góc nổi nhẹ.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  StatusBar,
  TextInput,
  Animated,
  Platform,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';
import type { RootState, AppDispatch } from '../../../../../store';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { ACRYLIC, ELEVATION, MOTION, RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import { MicaBackdrop } from '../../../shared/components/Fluent';
import StateView from '../../../../../components/state/StateView';
import ConversationItem from '../components/ConversationItem';
import CreateConversationModal, {
  type CreateConversationPayload,
} from '../components/CreateConversationModal';
import JoinConversationModal, {
  type JoinConversationPayload,
} from '../components/JoinConversationModal';
import InvitationsModal from '../components/InvitationsModal';
import { Sheet, SheetRow } from '../components/Sheet';
import {
  acceptInvitation,
  declineInvitation,
  joinConversation,
  loadConversations,
  loadInvitations,
  receiveDecryptedMessage,
  setMeId,
  setTyping,
} from '../../../store/chatSlice';
import { isProofChatBackendEnabled } from '../../../../../services/proofchat-api';
import {
  createGroupConversation,
  createDirectConversation,
  init as initProofChat,
  onDecryptedMessage,
} from '../../../../../services/proofchatService';
import { getDid } from '../../../../../services/proofchatIdentity';
import { resetProofChatSessionBackoff } from '../../../../../services/proofchatAuthBridge';
import chatSocket from '../../../../../services/chatSocket';
import { useCapabilityLive } from '../../../../../config/useCapabilityLive';

type FilterKey = 'all' | 'unread' | 'groups';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'groups', label: 'Nhóm' },
];

const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch<AppDispatch>();

  const conversations = useSelector((s: RootState) => s.chat.conversations);
  const invitations = useSelector((s: RootState) => s.chat.invitations);
  const listStatus = useSelector((s: RootState) => s.chat.listStatus);
  const loadError = useSelector((s: RootState) => s.chat.loadError);
  const loadErrorTitle = useSelector((s: RootState) => s.chat.loadErrorTitle);
  const invitationsStatus = useSelector((s: RootState) => s.chat.invitationsStatus);
  const sync = useSelector((s: RootState) => s.chat.sync);

  // Cổng runtime: chỉ gọi máy chủ khi nó thật sự sống (probe /health). Hook này
  // re-render khi cổng lật, nên máy chủ vừa mở lại là màn tự nạp — không cần
  // đóng mở app.
  const proofchatLive = useCapabilityLive('proofchat');
  const backendReady = proofchatLive && isProofChatBackendEnabled();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  // `undefined` = chưa hỏi xong danh tính. Phải chờ mốc này rồi mới tải danh sách:
  // `iAmAdmin` và tên phòng 1-1 đều tính theo "tôi là ai", tải trước thì mọi phòng
  // nạp lúc đó vĩnh viễn thiếu nút quản lý.
  const [identityResolved, setIdentityResolved] = useState<boolean>(false);

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: MOTION.slow,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  // ── Mở phiên chat: danh tính → nhận tin đã mở → nối máy chủ ───────────────
  useEffect(() => {
    if (!backendReady) return;
    let alive = true;

    // Hỏi danh tính TRƯỚC. Không có phiên (did rỗng) vẫn mở khoá việc tải — người
    // dùng còn xem được phòng, chỉ là không nhận ra mình trong đó.
    getDid()
      .then((did) => {
        if (!alive) return;
        if (did) dispatch(setMeId(did));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setIdentityResolved(true);
      });

    onDecryptedMessage((m) => {
      if (!alive) return;
      dispatch(
        receiveDecryptedMessage({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          isMine: m.isMine,
          timestamp: m.timestamp,
          plaintext: m.plaintext,
          merkleVerified: m.merkleVerified,
        }),
      );
    });

    initProofChat()
      .then(() => {
        if (!alive) return;
        // Chỉ báo "đang nhập" — gắn sau khi socket đã nối, nếu không `onTyping`
        // đăng ký vào một socket chưa tồn tại và im lặng không làm gì.
        chatSocket.onTyping((t: { userId: string; isTyping: boolean; roomId?: string }) => {
          if (!alive || !t.roomId) return;
          dispatch(
            setTyping({
              conversationId: t.roomId,
              userId: t.userId,
              isTyping: t.isTyping,
            }),
          );
        });
      })
      .catch((err) => console.warn('[Chat] mở phiên thất bại:', err));

    return () => {
      alive = false;
    };
  }, [backendReady, dispatch]);

  // ── Nạp danh sách phòng + lời mời ────────────────────────────────────────
  useEffect(() => {
    if (!backendReady || !identityResolved) return;
    dispatch(loadConversations());
    dispatch(loadInvitations());
  }, [backendReady, identityResolved, dispatch]);

  const handleRefresh = useCallback(async () => {
    if (!backendReady) return;
    setRefreshing(true);
    // Kéo-xuống / bấm "Thử lại" là ý muốn RÕ RÀNG của người dùng, nên được phép
    // dựng lại phiên ngay (kể cả khi lần trước hỏng và cầu nối đang nghỉ) — hộp
    // vân tay bật lên lúc này là do người dùng vừa yêu cầu, không phải tự nhiên.
    resetProofChatSessionBackoff();
    await Promise.all([dispatch(loadConversations()), dispatch(loadInvitations())]);
    setRefreshing(false);
  }, [backendReady, dispatch]);

  // ── Tạo phòng ────────────────────────────────────────────────────────────
  const handleCreate = async (payload: CreateConversationPayload) => {
    const members = payload.participantIds;
    if (members.length === 0) return;

    setCreating(true);
    const res =
      payload.type === 'DIRECT'
        ? await createDirectConversation(members[0])
        : await createGroupConversation(payload.title, members, payload.type);
    setCreating(false);

    if (!res.ok) {
      Toast.show({
        type: 'error',
        text1: 'Chưa tạo được phòng',
        text2: res.error ?? 'Thử lại sau ít phút.',
      });
      return;
    }

    setCreateOpen(false);
    await dispatch(loadConversations());

    if (res.welcomePublished === false) {
      // Phòng đã dựng trên máy nhưng lời mời chưa lên được máy chủ — người được
      // mời chưa vào được. Nói thẳng, đừng báo "đã tạo" rồi để phòng câm.
      Toast.show({
        type: 'info',
        text1: 'Đã tạo phòng — chưa mời được ai',
        text2: 'Mạng yếu nên lời mời chưa gửi đi. App sẽ tự gửi lại khi có mạng.',
      });
    } else {
      Toast.show({ type: 'success', text1: 'Đã tạo phòng', text2: payload.title });
    }
  };

  // ── Vào phòng bằng mã ────────────────────────────────────────────────────
  const handleJoin = async (payload: JoinConversationPayload) => {
    setJoining(true);
    try {
      // Máy chủ quyết vào thẳng hay chờ duyệt — app chỉ đọc câu trả lời.
      const res = await dispatch(joinConversation(payload)).unwrap();
      setJoinOpen(false);
      if (res.action === 'JOINED') {
        await dispatch(loadConversations());
        Toast.show({ type: 'success', text1: 'Đã vào phòng' });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Đã gửi yêu cầu',
          text2: 'Chờ người quản phòng đồng ý.',
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Không vào được phòng',
        text2: 'Kiểm tra lại mã phòng rồi thử lần nữa.',
      });
    } finally {
      setJoining(false);
    }
  };

  // ── Lời mời ──────────────────────────────────────────────────────────────
  const handleAcceptInvite = async (id: string) => {
    setBusyInvite(id);
    try {
      await dispatch(acceptInvitation(id)).unwrap();
      await dispatch(loadConversations());
      Toast.show({ type: 'success', text1: 'Đã tham gia' });
    } catch {
      Toast.show({ type: 'error', text1: 'Chưa tham gia được', text2: 'Thử lại sau.' });
    } finally {
      setBusyInvite(null);
    }
  };

  const handleDeclineInvite = async (id: string) => {
    setBusyInvite(id);
    try {
      await dispatch(declineInvitation(id)).unwrap();
    } catch {
      Toast.show({ type: 'error', text1: 'Chưa bỏ qua được', text2: 'Thử lại sau.' });
    } finally {
      setBusyInvite(null);
    }
  };

  // ── Lọc + sắp xếp ────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    let list = conversations;
    if (filter === 'unread') list = list.filter((c) => c.unreadCount > 0);
    if (filter === 'groups') list = list.filter((c) => c.type !== 'DIRECT');
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.participants.some((p) => p.name.toLowerCase().includes(q)),
      );
    }
    return [...list].sort(
      (a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt),
    );
  }, [conversations, filter, query]);

  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <MicaBackdrop />

      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-10, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
            <Icon name="chevron-left" size={26} color={NEUTRAL.text} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>Trò chuyện</Text>
            {totalUnread > 0 && (
              <Text style={styles.subtitle}>{totalUnread} tin chưa đọc</Text>
            )}
          </View>

          <Pressable
            onPress={() => setInvitesOpen(true)}
            hitSlop={6}
            style={styles.bellBtn}
            accessibilityLabel="Lời mời"
          >
            <Icon name="email-outline" size={19} color={CHAT_THEME.primary} />
            {invitations.length > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {invitations.length > 9 ? '9+' : invitations.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Icon name="magnify" size={18} color={NEUTRAL.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm theo tên phòng hoặc người"
            placeholderTextColor={NEUTRAL.textMuted}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={12}>
              <Icon name="close-circle" size={16} color={NEUTRAL.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <ConversationItem
            conversation={item}
            index={index}
            onPress={() => navigation.navigate('ChatRoom', { roomId: item.id })}
          />
        )}
        ListHeaderComponent={<View style={{ height: SPACE.md }} />}
        ListEmptyComponent={
          !backendReady ? (
            <StateView
              status="offline"
              title="Chưa kết nối được"
              message="Máy chủ trò chuyện chưa sẵn sàng. Màn hình sẽ tự hiện phòng của bạn ngay khi kết nối lại."
              onRetry={handleRefresh}
            />
          ) : listStatus === 'loading' ? (
            <StateView status="loading" loadingLines={5} />
          ) : listStatus === 'error' ? (
            // Tiêu đề + lời nhắn do reducer đặt theo NGUYÊN NHÂN thật (401 chưa
            // đăng nhập / mạng đứt / máy chủ lỗi) — xem LOAD_FAILURE_TEXT trong
            // chatSlice. Câu cứng "Kéo xuống để thử lại" trước đây chỉ đúng một
            // trong ba ca.
            <StateView
              status="error"
              title={loadErrorTitle ?? 'Chưa tải được'}
              message={loadError ?? 'Kéo xuống để thử lại.'}
              onRetry={handleRefresh}
            />
          ) : !sync.online ? (
            <StateView status="offline" onRetry={handleRefresh} />
          ) : (
            <EmptyState query={query} filter={filter} />
          )
        }
        contentContainerStyle={
          visible.length === 0 ? styles.listCentered : styles.listContent
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={CHAT_THEME.primary}
            colors={[CHAT_THEME.primary]}
          />
        }
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Trò chuyện mới"
      >
        <Icon name="plus" size={26} color={NEUTRAL.white} />
      </Pressable>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Bắt đầu">
        <SheetRow
          icon="chat-plus-outline"
          label="Trò chuyện mới"
          description="Chọn người và mở một phòng"
          onPress={() => {
            setMenuOpen(false);
            setCreateOpen(true);
          }}
        />
        <SheetRow
          icon="login-variant"
          label="Vào phòng bằng mã"
          description="Dùng mã phòng người khác gửi cho bạn"
          onPress={() => {
            setMenuOpen(false);
            setJoinOpen(true);
          }}
        />
      </Sheet>

      <CreateConversationModal
        visible={createOpen}
        submitting={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <JoinConversationModal
        visible={joinOpen}
        submitting={joining}
        onClose={() => setJoinOpen(false)}
        onSubmit={handleJoin}
      />
      <InvitationsModal
        visible={invitesOpen}
        invitations={invitations}
        loading={invitationsStatus === 'loading'}
        busyId={busyInvite}
        onClose={() => setInvitesOpen(false)}
        onAccept={handleAcceptInvite}
        onDecline={handleDeclineInvite}
      />
    </View>
  );
};

const EmptyState: React.FC<{ query: string; filter: FilterKey }> = ({ query, filter }) => (
  <View style={styles.empty}>
    <View style={styles.emptyIcon}>
      <Icon name="message-outline" size={34} color={CHAT_THEME.primary} />
    </View>
    <Text style={styles.emptyTitle}>
      {query ? 'Không tìm thấy phòng nào' : 'Chưa có cuộc trò chuyện'}
    </Text>
    <Text style={styles.emptyDesc}>
      {query
        ? 'Thử từ khoá khác.'
        : filter === 'unread'
        ? 'Bạn đã đọc hết tin rồi.'
        : filter === 'groups'
        ? 'Bạn chưa ở nhóm nào.'
        : 'Nhấn nút cộng để mở cuộc trò chuyện đầu tiên.'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.md,
    backgroundColor: ACRYLIC.base.fill,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: STROKE.outer,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 24, fontWeight: '700', color: NEUTRAL.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: CHAT_THEME.primary, fontWeight: '600', marginTop: 1 },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: NEUTRAL.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: NEUTRAL.white,
  },
  bellBadgeText: { fontSize: 9.5, fontWeight: '800', color: NEUTRAL.white },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    height: 44,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
    marginBottom: SPACE.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: NEUTRAL.text, padding: 0 },

  filterRow: { flexDirection: 'row', gap: SPACE.sm },
  filterPill: {
    paddingHorizontal: SPACE.lg,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
  },
  filterPillActive: { backgroundColor: CHAT_THEME.primary, borderColor: CHAT_THEME.primary },
  filterText: { fontSize: 12.5, fontWeight: '600', color: NEUTRAL.textSub },
  filterTextActive: { color: NEUTRAL.white },

  listCentered: { flexGrow: 1, justifyContent: 'center' },
  // Chừa chỗ cho thanh điều-hướng nổi ở đáy màn.
  listContent: { paddingBottom: 130 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xl,
    backgroundColor: withAlpha(CHAT_THEME.primary, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: NEUTRAL.text, marginBottom: 6 },
  emptyDesc: {
    fontSize: 13,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },

  fab: {
    position: 'absolute',
    right: SPACE.lg,
    bottom: 78,
    width: 58,
    height: 58,
    borderRadius: RADIUS.xl,
    backgroundColor: CHAT_THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...ELEVATION.dialog,
  },
});

export default ChatHomeScreen;
