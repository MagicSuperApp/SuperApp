// modules/proofchat/features/chat/screens/ProofChatHomeScreen.tsx
//
// Dashboard ProofChat — danh sách phòng chat 1-1 dựa theo job.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  TextInput, Animated, Platform, RefreshControl, Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';
import { RootState } from '../../../../../store';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import JobRoomItem from '../components/JobRoomItem';
import { TOKEN_SYMBOL } from '../../wallet/types';
import CreateConversationModal, {
  type CreateConversationPayload,
} from '../components/CreateConversationModal';
import JoinConversationModal, {
  type JoinConversationPayload,
} from '../components/JoinConversationModal';
import InvitationsModal from '../components/InvitationsModal';
import StateView from '../../../../../components/state/StateView';
import type { AppDispatch } from '../../../../../store';
import {
  acceptInvitation,
  createConversation,
  joinConversation,
  loadConversations,
  receiveDecryptedMessage,
  rejectInvitation,
} from '../../../store/proofchatSlice';
import { isProofChatBackendEnabled } from '../../../../../services/proofchat-api';
import {
  createGroupConversation,
  createDirectConversation,
  init as initProofChat,
  onDecryptedMessage,
} from '../../../../../services/proofchatService';
import { useCapabilityLive } from '../../../../../config/useCapabilityLive';

type FilterKey = 'all' | 'unread' | 'escrow';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'escrow', label: 'Có ký quỹ' },
];

const ProofChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch<AppDispatch>();
  const rooms = useSelector((s: RootState) => s.proofchat.rooms);
  const sync = useSelector((s: RootState) => s.proofchat.sync);
  const wallet = useSelector((s: RootState) => s.proofchat.wallet);
  const invitations = useSelector((s: RootState) => s.proofchat.invitations);
  const publicConversationIds = useSelector(
    (s: RootState) => s.proofchat.publicConversationIds,
  );
  const roomsStatus = useSelector((s: RootState) => s.proofchat.roomsStatus);

  // Cổng runtime: chỉ tải dữ liệu THẬT khi BE ProofChat sống (probe /health 2xx).
  // Chưa sống → giữ mock (UI không vỡ). Hook re-render khi cổng lật (backend vừa
  // được sửa) mà KHÔNG cần build lại / mở lại màn.
  const proofchatLive = useCapabilityLive('proofchat');
  const backendEnabled = proofchatLive && isProofChatBackendEnabled();
  useEffect(() => {
    if (backendEnabled) {
      dispatch(loadConversations());
    }
  }, [backendEnabled, dispatch]);

  // Nối MLS realtime: đăng ký tin ĐÃ GIẢI MÃ → đổ vào store, rồi init (kết nối
  // socket.io + phiên MLS). Chạy khi backend sống; best-effort (không native/ offline
  // → chỉ log, UI vẫn chạy mock). Đây là điểm gỡ H-15 "UI chưa nối proofchatService".
  useEffect(() => {
    if (!backendEnabled) return;
    let alive = true;
    onDecryptedMessage(m => {
      if (!alive) return;
      dispatch(receiveDecryptedMessage({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        isMine: m.isMine,
        timestamp: m.timestamp,
        plaintext: m.plaintext,
        merkleVerified: m.merkleVerified,
      }));
    });
    initProofChat().catch(err => console.warn('[ProofChat] init failed:', err));
    return () => { alive = false; };
  }, [backendEnabled, dispatch]);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);

  const pendingInvitations = useMemo(
    () => invitations.filter(i => i.status === 'pending').length,
    [invitations],
  );

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
    // headerFade/headerSlide là `useRef(...).current` — tham chiếu bền, thêm vào deps
    // để đúng luật hook mà KHÔNG làm effect chạy lại.
  }, [headerFade, headerSlide]);

  const handleCreate = async (payload: CreateConversationPayload) => {
    // Backend TẮT (mock) → tạo phòng cục-bộ như cũ, không cần thành viên.
    if (!backendEnabled) {
      dispatch(createConversation(payload));
      setCreateOpen(false);
      Toast.show({ type: 'success', text1: 'Đã tạo cuộc trò chuyện', text2: payload.title });
      return;
    }

    // Backend SỐNG → tạo nhóm THẬT qua MLS (Welcome đẩy cho thành viên đồng bộ).
    const members = payload.participantIds ?? [];
    if (members.length === 0) {
      Toast.show({ type: 'error', text1: 'Chưa chọn thành viên', text2: 'Cần ít nhất 1 người để tạo nhóm.' });
      return;
    }
    // DIRECT = trò chuyện 1-1. Chọn nhiều người mà vẫn gửi DIRECT thì service chỉ
    // lấy members[0], những người còn lại rơi LẶNG LẼ — chặn ngay tại đây.
    if (payload.type === 'DIRECT' && members.length > 1) {
      Toast.show({
        type: 'error',
        text1: 'Trò chuyện riêng chỉ 1 người',
        text2: 'Bỏ bớt người, hoặc đổi sang Nhóm để thêm nhiều thành viên.',
      });
      return;
    }
    setCreateOpen(false);
    Toast.show({ type: 'info', text1: 'Đang tạo nhóm…', text2: payload.title });
    const res =
      payload.type === 'DIRECT'
        ? await createDirectConversation(members[0])
        // Truyền ĐÚNG loại người dùng chọn (GROUP / THREAD / JOB_NEGOTIATION).
        : await createGroupConversation(payload.title, members, payload.type);
    if (res.ok) {
      await dispatch(loadConversations());
      if (res.welcomePublished === false) {
        // Nhóm đã dựng trên máy nhưng lời mời CHƯA lên server → thành viên chưa vào
        // được. Nói thật, đừng báo "đã tạo" rồi để phòng câm.
        Toast.show({
          type: 'info',
          text1: 'Đã tạo nhóm — chưa mời được ai',
          text2: 'Mạng yếu nên lời mời chưa gửi đi. App sẽ tự gửi lại khi mở chat lúc có mạng.',
        });
      } else {
        Toast.show({ type: 'success', text1: 'Đã tạo nhóm', text2: payload.title });
      }
    } else {
      Toast.show({ type: 'error', text1: 'Tạo nhóm thất bại', text2: res.error ?? 'Thử lại sau.' });
    }
  };

  const handleJoin = (payload: JoinConversationPayload) => {
    const isPublic = publicConversationIds.includes(payload.conversationId);
    dispatch(joinConversation(payload));
    setJoinOpen(false);
    Toast.show({
      type: 'success',
      text1: isPublic ? 'Đã tham gia phòng' : 'Đã gửi yêu cầu tham gia',
      text2: isPublic
        ? `Phòng ${payload.conversationId} đã được thêm vào danh sách.`
        : 'Yêu cầu sẽ chờ admin của phòng phê duyệt.',
    });
  };

  const handleAcceptInvitation = (invitationId: string) => {
    const inv = invitations.find(i => i.id === invitationId);
    dispatch(acceptInvitation({ invitationId }));
    Toast.show({
      type: 'success',
      text1: 'Đã tham gia',
      text2: inv ? inv.conversationTitle : 'Đã chấp nhận lời mời.',
    });
  };

  const handleRejectInvitation = (invitationId: string) => {
    dispatch(rejectInvitation({ invitationId }));
    Toast.show({
      type: 'info',
      text1: 'Đã từ chối lời mời',
    });
  };

  const filtered = useMemo(() => {
    let list = rooms;
    if (filter === 'unread') list = list.filter(r => r.unreadCount > 0);
    if (filter === 'escrow') list = list.filter(r => !!r.escrow);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        r =>
          r.counterpartyName.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q) ||
          r.jobCategory.toLowerCase().includes(q),
      );
    }
    return [...list].sort(
      (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0),
    );
  }, [rooms, filter, query]);

  const totalUnread = rooms.reduce((sum, r) => sum + r.unreadCount, 0);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (backendEnabled) {
      // Flag ON → tải lại thật từ BE.
      await dispatch(loadConversations());
    } else {
      // Flag OFF → giữ trải nghiệm mock (giả lập độ trễ mạng).
      await new Promise<void>(r => setTimeout(() => r(), 700));
    }
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />

      <Animated.View
        style={[
          styles.header,
          { opacity: headerFade, transform: [{ translateY: headerSlide }] },
        ]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Icon name="chevron-left" size={22} color={NEUTRAL.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>Trò chuyện</Text>
            {/* Hàng phụ (huy hiệu đồng bộ + danh tính đã xác thực) tạm ẩn. Bật lại thì
                nhập lại `SyncStatusPill` và selector `s.proofchat.identity` — đã gỡ vì
                để nguyên là hai lỗi lint dead-code.
              <View style={styles.subRow}>
              <SyncStatusPill state={sync} />
              {identity.verified && (
                <View style={styles.idPill}>
                  <Icon name="account-check-outline" size={10} color={PROOFCHAT_THEME.primary} />
                  <Text style={styles.idPillText}>Verified Identity</Text>
                </View>
              )}
            </View> */}
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setInvitationsOpen(true)}
            hitSlop={6}
          >
            <Icon name="bell-outline" size={18} color={PROOFCHAT_THEME.primary} />
            {pendingInvitations > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {pendingInvitations > 9 ? '9+' : pendingInvitations}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('ProofChatWallet')}
          >
            <Icon name="wallet-outline" size={18} color={PROOFCHAT_THEME.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsStrip}>
          <Stat label="Phòng" value={rooms.length} />
          <View style={styles.statDivider} />
          <Stat label="Chưa đọc" value={totalUnread} accent />
          <View style={styles.statDivider} />
          <Stat
            label="Đang khóa"
            value={`${wallet.lockedInEscrow.toLocaleString('vi-VN')} ${TOKEN_SYMBOL}`}
            small
          />
        </View>

        <View style={styles.searchBox}>
          <Icon name="magnify" size={18} color={NEUTRAL.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm phòng theo tên, công việc…"
            placeholderTextColor={NEUTRAL.textMuted}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
              <Icon name="close-circle" size={16} color={NEUTRAL.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterPill, active && styles.filterPillActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        renderItem={({ item, index }) => (
          <JobRoomItem
            room={item}
            index={index}
            onPress={() =>
              navigation.navigate('ProofChatRoom', { roomId: item.id })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          // Thứ tự trạng thái khi CHƯA có phòng nào:
          //  1. Backend ON + đang tải lần đầu → loading skeleton.
          //  2. Backend ON + tải lỗi → error (kéo/nhấn thử lại).
          //  3. Offline → trạng thái offline thân thiện (INV-1: vẫn xem phòng đã tải).
          //  4. Còn lại → empty thường (không tìm thấy / chưa có trò chuyện).
          backendEnabled && roomsStatus === 'loading' ? (
            <StateView status="loading" loadingLines={5} />
          ) : backendEnabled && roomsStatus === 'error' ? (
            <StateView status="error" onRetry={handleRefresh} />
          ) : !sync.online && rooms.length === 0 ? (
            <StateView status="offline" onRetry={handleRefresh} />
          ) : (
            <EmptyState query={query} filter={filter} />
          )
        }
        contentContainerStyle={
          // Empty/loading/error: chiếm hết chiều cao + căn giữa dọc (tránh lệch trên
          // cùng). Có phòng: chừa khoảng dưới cho CurvedTabBar (navbar nổi iOS).
          filtered.length === 0
            ? { flexGrow: 1, justifyContent: 'center' }
            : { paddingBottom: 130 }
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={PROOFCHAT_THEME.primary}
            colors={[PROOFCHAT_THEME.primary]}
          />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setActionSheetOpen(true)}
        activeOpacity={0.85}
      >
        <Icon name="plus" size={26} color={NEUTRAL.white} />
      </TouchableOpacity>

      <Modal
        visible={actionSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={() => setActionSheetOpen(false)}
        >
          <View style={styles.actionSheet}>
            <View style={styles.actionSheetHandle} />
            <Text style={styles.actionSheetTitle}>Cuộc trò chuyện</Text>

            <TouchableOpacity
              style={styles.actionItem}
              activeOpacity={0.85}
              onPress={() => {
                setActionSheetOpen(false);
                setCreateOpen(true);
              }}
            >
              <View style={styles.actionItemIcon}>
                <Icon name="chat-plus-outline" size={20} color={PROOFCHAT_THEME.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionItemTitle}>Tạo cuộc trò chuyện</Text>
                <Text style={styles.actionItemDesc}>
                  Mở phòng mới (DIRECT, GROUP, THREAD, JOB_NEGOTIATION)
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={NEUTRAL.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              activeOpacity={0.85}
              onPress={() => {
                setActionSheetOpen(false);
                setJoinOpen(true);
              }}
            >
              <View style={styles.actionItemIcon}>
                <Icon name="account-multiple-plus-outline" size={20} color={PROOFCHAT_THEME.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionItemTitle}>Tham gia cuộc trò chuyện</Text>
                <Text style={styles.actionItemDesc}>
                  Nhập ID phòng để vào hoặc gửi yêu cầu duyệt
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={NEUTRAL.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCancel}
              onPress={() => setActionSheetOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.actionCancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <CreateConversationModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        requireMembers={backendEnabled}
      />
      <JoinConversationModal
        visible={joinOpen}
        onClose={() => setJoinOpen(false)}
        onSubmit={handleJoin}
        publicConversationIds={publicConversationIds}
      />
      <InvitationsModal
        visible={invitationsOpen}
        invitations={invitations}
        onClose={() => setInvitationsOpen(false)}
        onAccept={handleAcceptInvitation}
        onReject={handleRejectInvitation}
      />
    </View>
  );
};

const Stat: React.FC<{
  label: string; value: number | string; accent?: boolean; small?: boolean;
}> = ({ label, value, accent, small }) => (
  <View style={styles.stat}>
    <Text
      style={[
        styles.statValue,
        accent && { color: PROOFCHAT_THEME.primary },
        small && { fontSize: 14 },
      ]}
    >
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const EmptyState: React.FC<{ query: string; filter: FilterKey }> = ({ query, filter }) => (
  <View style={styles.empty}>
    <View style={styles.emptyIcon}>
      <Icon name="message-outline" size={36} color={PROOFCHAT_THEME.primary} />
    </View>
    <Text style={styles.emptyTitle}>
      {query ? 'Không tìm thấy phòng nào' : 'Chưa có cuộc trò chuyện'}
    </Text>
    <Text style={styles.emptyDesc}>
      {query
        ? 'Thử từ khóa khác hoặc xóa bộ lọc.'
        : filter === 'unread'
        ? 'Tất cả tin nhắn đã được đọc.'
        : filter === 'escrow'
        ? 'Chưa có job nào có ký quỹ.'
        : 'Khi bạn tạo job hoặc nhận job, phòng chat sẽ xuất hiện ở đây.'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NEUTRAL.bg },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: NEUTRAL.bg,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, gap: 4 },
  title: {
    fontSize: 22, fontWeight: '800',
    color: NEUTRAL.text, letterSpacing: -0.4,
  },
  subRow: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  idPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
  },
  idPillText: {
    fontSize: 9, fontWeight: '800',
    color: PROOFCHAT_THEME.primary, letterSpacing: 0.4,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8,
    backgroundColor: NEUTRAL.error,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: NEUTRAL.bg,
  },
  bellBadgeText: { fontSize: 9, fontWeight: '800', color: NEUTRAL.white },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: NEUTRAL.bgSoft,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1, borderColor: NEUTRAL.border,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: {
    fontSize: 17, fontWeight: '800',
    color: NEUTRAL.text, letterSpacing: -0.4,
  },
  statLabel: { fontSize: 10, color: NEUTRAL.textMuted, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: NEUTRAL.border, marginVertical: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 12,
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1, borderColor: NEUTRAL.border,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13, color: NEUTRAL.text, padding: 0 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1, borderColor: NEUTRAL.border,
  },
  filterPillActive: {
    backgroundColor: PROOFCHAT_THEME.primary,
    borderColor: PROOFCHAT_THEME.primary,
  },
  filterText: { fontSize: 12, fontWeight: '600', color: NEUTRAL.textSub },
  filterTextActive: { color: NEUTRAL.white },
  separator: { height: 1, backgroundColor: NEUTRAL.borderSoft, marginLeft: 78 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: NEUTRAL.text, marginBottom: 6 },
  emptyDesc: {
    fontSize: 13, color: NEUTRAL.textMuted, textAlign: 'center', lineHeight: 19,
  },

  fab: {
    position: 'absolute',
    right: 18,
    bottom: 75,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PROOFCHAT_THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PROOFCHAT_THEME.primaryDeep,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  actionSheetOverlay: {
    flex: 1,
    backgroundColor: NEUTRAL.overlay,
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    gap: 8,
  },
  actionSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: NEUTRAL.border,
    marginBottom: 8,
  },
  actionSheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: NEUTRAL.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  actionItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionItemTitle: { fontSize: 14, fontWeight: '700', color: NEUTRAL.text },
  actionItemDesc: { fontSize: 11, color: NEUTRAL.textMuted, marginTop: 2 },
  actionCancel: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    marginTop: 4,
  },
  actionCancelText: { fontSize: 13, fontWeight: '700', color: NEUTRAL.textSub },
});

export default ProofChatHomeScreen;
