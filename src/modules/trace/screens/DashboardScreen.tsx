// modules/trace/screens/DashboardScreen.tsx

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Animated,
  Dimensions,
  Platform,
  Button,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { loadFarms, loadTrees, loadActivities } from '../store/farmSlice';
import { selectChainWallet } from '../../../store/userSlice';
import { COLORS } from '../../../constants';
import PaginationControls from '../components/PaginationControls';
import { showError, showInfo } from '../../../utils/alert';
import { useAppDispatch } from '../../../store/hooks';
import StateView from '../../../components/state/StateView';
import { useOffline } from '../../../hooks/useOffline';
import { formatTreeName, shortTreeCode } from '../../../utils/treeNameFormatter';

const { width } = Dimensions.get('window');

type FilterType = 'all' | 'farms' | 'trees' | 'fruits' | 'activities';
const ITEMS_PER_PAGE = 10;

// ── Token chip ────────────────────────────────────────────────────────────────
const TokenChip = ({
  icon, label, value, color, index,
}: {
  icon: string; label: string; value: any; color: string; index: number;
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.tokenChip, { borderColor: `${color}28`, opacity: fadeAnim }]}>
      <View style={[styles.tokenChipIcon, { backgroundColor: `${color}14` }]}>
        <Icon name={icon} size={14} color={color} />
      </View>
      <View>
        <Text style={[styles.tokenChipVal, { color }]}>{value ?? 0}</Text>
        <Text style={styles.tokenChipLabel}>{label}</Text>
      </View>
    </Animated.View>
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({
  icon, label, value, color, index,
}: {
  icon: string; label: string; value: number; color: string; index: number;
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: 100 + index * 70, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: 100 + index * 70, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.statCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={[styles.statIconWrap, { backgroundColor: `${color}12` }]}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
};

// ── Quick action ──────────────────────────────────────────────────────────────
const QuickAction = ({
  icon, label, color, onPress, disabled, index,
}: {
  icon: string; label: string; color: string;
  onPress: () => void; disabled?: boolean; index: number;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: 200 + index * 60, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={1}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
      >
        <Animated.View style={[styles.quickAction, disabled && styles.quickActionDisabled, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.quickActionIcon, { backgroundColor: `${color}14` }]}>
            <Icon name={icon} size={22} color={disabled ? COLORS.textMuted : color} />
          </View>
          <Text style={[styles.quickActionLabel, disabled && { color: COLORS.textMuted }]}>{label}</Text>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Item type config ──────────────────────────────────────────────────────────
// Build 52 § A7 — `farms` passed-in để format tree name farmer-friendly
// ("Cây #3 góc Đông") thay vì raw UUID code.
const getItemConfig = (item: any, farms?: any[]) => {
  if (item.type === 'farm' || 'coordinates' in item)
    return { icon: 'pine-tree', color: COLORS.accent, typeLabel: 'TRẠI', title: item.name, sub: `${item.coordinates?.length ?? 0} điểm GPS` };
  if (item.type === 'tree' || ('farmId' in item && !('treeId' in item))) {
    const farm = farms?.find(f => f.id === item.farmId);
    const title = formatTreeName(item, farm);
    const short = shortTreeCode(item);
    return {
      icon: 'tree-outline',
      color: '#B07D2F',
      typeLabel: 'CÂY',
      title,
      sub: short ? `Mã: ${short}` : `Farm: ${item.farmId}`,
    };
  }
  if (item.type === 'fruit' || 'treeId' in item)
    return { icon: 'food-apple-outline', color: COLORS.success, typeLabel: 'QUẢ', title: item.code, sub: `Trạng thái: ${item.status}` };
  if (item.type === 'activity')
    return { icon: 'clipboard-text-outline', color: '#7D3C98', typeLabel: 'HOẠT ĐỘNG', title: item.type, sub: `${item.creditsUsed} MAGIC` };
  return { icon: 'help-circle-outline', color: COLORS.textMuted, typeLabel: '—', title: 'Unknown', sub: '' };
};

// ── Filter pill ───────────────────────────────────────────────────────────────
const FILTERS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'all', label: 'Tất cả', icon: 'view-grid-outline' },
  { key: 'farms', label: 'Trang trại', icon: 'pine-tree' },
  { key: 'trees', label: 'Cây trồng', icon: 'tree-outline' },
  { key: 'fruits', label: 'Quả', icon: 'food-apple-outline' },
  { key: 'activities', label: 'Hoạt động', icon: 'clipboard-text-outline' },
];

// ── Main Screen ───────────────────────────────────────────────────────────────
const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const user = useSelector((state: RootState) => state.user.currentUser);
  // Số dư THẬT từ chuỗi (nhất quán với Account/Activity), null → '—' (không bịa).
  const wallet = useSelector(selectChainWallet);
  const farms = useSelector((state: RootState) => state.farm.farms);
  const trees = useSelector((state: RootState) => state.farm.trees);
  const fruits = useSelector((state: RootState) => state.farm.fruits);
  const activities = useSelector((state: RootState) => state.farm.activities);
  const isLoading = useSelector((state: RootState) => state.farm.isLoading);
  const loadError = useSelector((state: RootState) => state.farm.error);
  const offline = useOffline();

  const [filter, setFilter] = useState<FilterType>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Cờ đã-chạy-tải-lần-đầu: isLoading của store chỉ true SAU khi thunk pending
  // dispatch. Giữa lúc mount và pending, isLoading=false + chưa có data → danh
  // sách rỗng chớp thoáng qua. Cờ này giữ skeleton loading tới khi lần tải đầu
  // xong (không chặn refresh về sau vì chỉ set 1 lần).
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => { setCurrentPage(1); }, [filter]);

  const loadDashboard = React.useCallback(async () => {
    try {
      // Chưa có user (vd user mới chưa đăng nhập xong) → KHÔNG tải, nhưng vẫn phải
      // rơi vào finally để đánh dấu đã-tải-xong. Nếu return sớm TRƯỚC try thì
      // `hasLoadedOnce` kẹt false → skeleton loading hiện MÃI (màn trắng phau).
      if (!user) return;
      await dispatch(loadFarms(user.id));
      if (farms.length > 0) {
        for (const farm of farms) await dispatch(loadTrees(farm.id));
        await dispatch(loadActivities(farms[0].id));
      }
    } catch (_) {
      showError('Lỗi', 'Không thể tải dữ liệu');
    } finally {
      setHasLoadedOnce(true);
    }
  }, [user, farms, dispatch]);

  useFocusEffect(
    React.useCallback(() => { loadDashboard(); }, [loadDashboard])
  );

  const autoSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await new Promise<void>(r => setTimeout(() => r(), 1200));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await loadDashboard(); } finally { setIsRefreshing(false); }
  };

  const getFilteredItems = () => {
    switch (filter) {
      case 'farms': return farms;
      case 'trees': return trees;
      case 'fruits': return fruits;
      case 'activities': return activities;
      default: return [
        ...farms.map(f => ({ ...f, type: 'farm' })),
        ...trees.map(t => ({ ...t, type: 'tree' })),
        ...fruits.map(f => ({ ...f, type: 'fruit' })),
        ...activities.map(a => ({ ...a, type: 'activity' })),
      ];
    }
  };

  const filteredItems = getFilteredItems();
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  // Initials
  const initials = (user?.name ?? 'U')
    .split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  const hasData = farms.length > 0;

  // 4 trạng thái khi chưa có dữ liệu (đã có dữ liệu cũ thì vẫn render, kể cả
  // offline — INV-1). Phân biệt mạng ⟂ server (§7.3).
  // Hiện skeleton loading toàn màn khi ĐANG tải HOẶC chưa chạy xong lần tải đầu,
  // và chưa có dữ liệu cũ để hiển thị. Bao khe hở mount→pending (lỗi hiển thị 3).
  if ((isLoading || !hasLoadedOnce) && !hasData && !offline && !loadError) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <StateView status="loading" loadingLines={5} />
      </View>
    );
  }
  if (!hasData && offline) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <StateView status="offline" onRetry={loadDashboard} />
      </View>
    );
  }
  if (!hasData && loadError) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <StateView status="error" onRetry={loadDashboard} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Top strip */}
      <View style={[styles.topStrip, { height: 3 + insets.top, paddingTop: insets.top }]}><View style={styles.topStripAccent} /></View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 12) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.accent]}
            progressBackgroundColor={COLORS.bg}
            tintColor={COLORS.accent}
          />
        }
      >
        {/* ── Header ── */}
        <Animated.View style={[styles.topBar, { transform: [{ translateY: headerSlide }] }]}>
          <View>
            <Text style={styles.topBarEyebrow}>TRUY XUẤT NGUỒN GỐC</Text>
            <Text style={styles.topBarTitle}>Tổng quan</Text>
          </View>
          <View style={styles.topBarRight}>
            {/* Sync status */}
            <TouchableOpacity
              style={[styles.syncBadge, isSyncing && styles.syncBadgeActive]}
              onPress={autoSync}
              disabled={isSyncing}
            >
              <Icon
                name={isSyncing ? 'sync' : 'cloud-check-outline'}
                size={14}
                color={isSyncing ? COLORS.accent : COLORS.success}
              />
              <Text style={[styles.syncBadgeText, isSyncing && { color: COLORS.accent }]}>
                {isSyncing ? 'Đồng bộ...' : 'Đã lưu'}
              </Text>
            </TouchableOpacity>
            {/* Avatar */}
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Greeting + Token strip ── */}
        <Animated.View style={[styles.greetingCard, { transform: [{ translateY: headerSlide }] }]}>
          {/* Decorative orb */}
          <View style={styles.greetingOrb} />
          <View style={styles.greetingOrb2} />

          <Text style={styles.greetingName}>Xin chào 👋</Text>
          <Text style={styles.greetingDesc}>
            Quản lý {farms.length} trang trại · {trees.length} cây · {fruits.length} quả
          </Text>

          {/* Token row */}
          <View style={styles.tokenRow}>
            <TokenChip index={0} icon="star-four-points-outline" label="MAGIC" value={wallet?.magicBalance ?? '—'} color="#B07D2F" />
            <TokenChip index={1} icon="lightning-bolt" label="LAMP" value={wallet?.lampBalance ?? '—'} color={COLORS.accent} />
            {/* CARP — token hệ sinh thái thứ 3. TODO brand tạm; số dư chờ API Phoenix. */}
            <TokenChip index={2} icon="fish" label="CARP" value={wallet?.carpBalance ?? '—'} color="#2F8F8F" />
            <TokenChip index={3} icon="hexagon-outline" label="ADA" value={wallet?.adaBalance ?? '—'} color="#0033AD" />
          </View>
        </Animated.View>

        {/* ── Stats grid ── */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>THỐNG KÊ</Text>
        </View>
        <View style={styles.statsGrid}>
          <StatCard index={0} icon="pine-tree" label="Trang trại" value={farms.length} color={COLORS.accent} />
          <StatCard index={1} icon="tree-outline" label="Cây trồng" value={trees.length} color="#B07D2F" />
          <StatCard index={2} icon="food-apple-outline" label="Quả" value={fruits.length} color={COLORS.success} />
          <StatCard index={3} icon="clipboard-text-outline" label="Hoạt động" value={activities.length} color="#7D3C98" />
        </View>

        {/* ── Quick actions ── */}
        <View style={[styles.sectionRow, { marginTop: 24 }]}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>THAO TÁC NHANH</Text>
        </View>
        <View style={styles.quickActionsRow}>
          <QuickAction index={0} icon="pine-tree" label="Trang trại" color={COLORS.accent}
            onPress={() => navigation.navigate('Farms')} />
          <QuickAction index={1} icon="plus-circle" label="Thêm cây" color="#B07D2F"
            onPress={() => {
              if (farms.length > 0) navigation.navigate('FarmDetail', { farm_id: farms[0].id });
              else showInfo('Thông báo', 'Vui lòng tạo trang trại trước');
            }} />
          <QuickAction index={2} icon={isSyncing ? 'sync' : 'cloud-upload-outline'} label="Đồng bộ" color={COLORS.success}
            onPress={autoSync} disabled={isSyncing} />
          <QuickAction index={3} icon="account-outline" label="Tài khoản" color="#7D3C98"
            onPress={() => navigation.navigate('Account' as never)} />
        </View>

        {/* SurfaceTestCapture ẩn — chỉ dùng nội bộ thu dữ liệu test, không hiện với user */}

        {/* ── Filter tabs ── */}
        <View style={[styles.sectionRow, { marginTop: 24 }]}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>DỮ LIỆU</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Icon name={f.icon} size={13} color={active ? COLORS.white : COLORS.textSub} />
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Items list ── */}
        {filteredItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Icon name="inbox-outline" size={36} color={COLORS.accentLight} />
              <View style={styles.emptyRing} />
            </View>
            <Text style={styles.emptyTitle}>Chưa có dữ liệu</Text>
            <Text style={styles.emptyBody}>
              {filter === 'all' ? 'Hãy thêm trang trại đầu tiên để bắt đầu.' : `Không có ${FILTERS.find(f => f.key === filter)?.label?.toLowerCase()} nào.`}
            </Text>
          </View>
        ) : (
          <>
            {paginatedItems.map((item: any, idx: number) => {
              const cfg = getItemConfig(item, farms);
              return (
                <ItemRow
                  key={item.id ?? idx}
                  item={item}
                  config={cfg}
                  index={idx}
                  onPress={() => {
                    if (item.type === 'farm' || 'coordinates' in item)
                      navigation.navigate('FarmDetail', { farm_id: item.id });
                    else if (item.type === 'tree' || ('farmId' in item && !('treeId' in item)))
                      navigation.navigate('TreeDetail', { tree: item });
                  }}
                />
              );
            })}

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              startIndex={startIndex}
              endIndex={endIndex}
              totalItems={filteredItems.length}
              onPreviousPage={() => currentPage > 1 && setCurrentPage(p => p - 1)}
              onNextPage={() => currentPage < totalPages && setCurrentPage(p => p + 1)}
            />
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

// ── Item Row ──────────────────────────────────────────────────────────────────
const ItemRow = ({
  item, config, index, onPress,
}: {
  item: any;
  config: ReturnType<typeof getItemConfig>;
  index: number;
  onPress: () => void;
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 45, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 45, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
      >
        <View style={styles.itemCard}>
          {/* Left accent */}
          <View style={[styles.itemAccentBar, { backgroundColor: config.color }]} />

          {/* Icon */}
          <View style={[styles.itemIconWrap, { backgroundColor: `${config.color}12` }]}>
            <Icon name={config.icon} size={22} color={config.color} />
          </View>

          {/* Content */}
          <View style={styles.itemContent}>
            <View style={styles.itemTopRow}>
              <Text style={styles.itemTitle} numberOfLines={1}>{config.title}</Text>
              <View style={[styles.itemTypeBadge, { backgroundColor: `${config.color}12` }]}>
                <Text style={[styles.itemTypeText, { color: config.color }]}>{config.typeLabel}</Text>
              </View>
            </View>
            <Text style={styles.itemSub} numberOfLines={1}>{config.sub}</Text>
          </View>

          <Icon name="chevron-right" size={16} color={COLORS.accentLight} style={{ marginRight: 12 }} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  topStrip: { height: 3, backgroundColor: COLORS.bgWarm, flexDirection: 'row' },
  topStripAccent: { width: '40%', height: '100%', backgroundColor: COLORS.accent },

  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Loading
  loadingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20, padding: 36,
    alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16,
    elevation: 4,
  },
  loadingText: { fontSize: 14, color: COLORS.textMuted, marginTop: 12 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  topBarEyebrow: { fontSize: 10, fontWeight: '700', color: COLORS.accent, letterSpacing: 2.5, marginBottom: 1 },
  topBarTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.card,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  syncBadgeActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  syncBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  avatar: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COLORS.accent,
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: COLORS.accent },

  // Greeting card
  greetingCard: {
    backgroundColor: COLORS.accent,
    borderRadius: 20, padding: 20,
    marginBottom: 24,
    overflow: 'hidden', position: 'relative',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16,
    elevation: 6,
  },
  greetingOrb: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -30, right: -20,
  },
  greetingOrb2: {
    position: 'absolute', width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -10, left: 40,
  },
  greetingName: { fontSize: 17, fontWeight: '700', color: COLORS.white, marginBottom: 4 },
  greetingDesc: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginBottom: 16 },
  tokenRow: { flexDirection: 'row', gap: 10 },
  tokenChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, flex: 1,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6,
    elevation: 2,
  },
  tokenChipIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  tokenChipVal: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3 },
  tokenChipLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 0.5 },

  // Section header
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 2 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: (width - 40 - 10) / 2,
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16,
    alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 2,
  },
  statIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  statLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },

  // Quick actions
  quickActionsRow: { flexDirection: 'row', gap: 10 },
  quickAction: {
    backgroundColor: COLORS.card,
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 2,
  },
  quickActionDisabled: { opacity: 0.45 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSub },
  captureCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  captureCtaIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: `${COLORS.accent}14`, alignItems: 'center', justifyContent: 'center' },
  captureCtaTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  captureCtaSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  // Filters
  filterScroll: { marginBottom: 14 },
  filterScrollContent: { gap: 8, paddingRight: 4 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterPillActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterPillText: { fontSize: 12, fontWeight: '600', color: COLORS.textSub },
  filterPillTextActive: { color: COLORS.white },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 48 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, position: 'relative',
  },
  emptyRing: {
    position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 46, borderWidth: 1.5, borderColor: COLORS.accentLight, opacity: 0.3,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

  // Item card
  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 8, overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 1,
  },
  itemAccentBar: { width: 4, alignSelf: 'stretch' },
  itemIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    margin: 12,
  },
  itemContent: { flex: 1, paddingVertical: 12 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  itemTypeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  itemTypeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  itemSub: { fontSize: 11, color: COLORS.textMuted },
});

export default DashboardScreen;