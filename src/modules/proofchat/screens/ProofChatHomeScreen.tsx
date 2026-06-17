// modules/proofchat/screens/ProofChatHomeScreen.tsx
//
// Dashboard ProofChat — danh sách phòng chat dựa theo job.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Animated,
  Platform,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import { NEUTRAL, withAlpha } from '../../../shared/theme';
import { PROOFCHAT_THEME } from '../theme/colors';
import JobRoomItem from '../features/chat/components/JobRoomItem';
import SyncStatusPill from '../features/chat/components/SyncStatusPill';
import type { ChatRoom } from '../features/chat/types';

type FilterKey = 'all' | 'unread' | 'escrow';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'escrow', label: 'Có ký quỹ' },
];

const ProofChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const rooms = useSelector((s: RootState) => s.proofchat.rooms);
  const sync = useSelector((s: RootState) => s.proofchat.sync);
  const wallet = useSelector((s: RootState) => s.proofchat.wallet);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

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
    await new Promise<void>(r => setTimeout(() => r(), 700));
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />

      {/* Header */}
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
            <SyncStatusPill state={sync} />
          </View>

          <TouchableOpacity
            style={styles.walletBtn}
            onPress={() => navigation.navigate('ProofChatWallet')}
          >
            <Icon name="wallet-outline" size={18} color={PROOFCHAT_THEME.primary} />
          </TouchableOpacity>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          <Stat label="Phòng" value={rooms.length} />
          <View style={styles.statDivider} />
          <Stat label="Chưa đọc" value={totalUnread} accent />
          <View style={styles.statDivider} />
          <Stat
            label="Đang khóa"
            value={`${wallet.lockedInEscrow.toLocaleString('vi-VN')} ADA`}
            small
          />
        </View>

        {/* Search */}
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
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="close-circle" size={16} color={NEUTRAL.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter pills */}
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
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {/* Room list */}
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
        ListEmptyComponent={<EmptyState query={query} filter={filter} />}
        contentContainerStyle={
          filtered.length === 0 ? { flexGrow: 1 } : { paddingBottom: 24 }
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
    </View>
  );
};

// ── helpers ─────────────────────────────────────────────────────────────────
const Stat: React.FC<{
  label: string;
  value: number | string;
  accent?: boolean;
  small?: boolean;
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

const EmptyState: React.FC<{ query: string; filter: FilterKey }> = ({
  query,
  filter,
}) => (
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
        ? 'Tất cả tin nhắn đã được đọc 🎉'
        : filter === 'escrow'
        ? 'Chưa có job nào có ký quỹ.'
        : 'Khi bạn tạo job hoặc nhận job, phòng chat sẽ xuất hiện ở đây.'}
    </Text>
  </View>
);

// ── styles ──────────────────────────────────────────────────────────────────
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, gap: 4 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: NEUTRAL.text,
    letterSpacing: -0.4,
  },
  walletBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
  },

  statsStrip: {
    flexDirection: 'row',
    backgroundColor: NEUTRAL.bgSoft,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: NEUTRAL.text,
    letterSpacing: -0.4,
  },
  statLabel: { fontSize: 10, color: NEUTRAL.textMuted, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: NEUTRAL.border, marginVertical: 4 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 12,
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13, color: NEUTRAL.text, padding: 0 },

  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
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

export default ProofChatHomeScreen;
