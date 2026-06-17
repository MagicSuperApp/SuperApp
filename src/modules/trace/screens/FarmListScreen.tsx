// modules/trace/screens/FarmListScreen.tsx

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { loadFarms } from '../store/farmSlice';
import { selectChainWallet } from '../../../store/userSlice';
import { COLORS } from '../../../constants';
import PaginationControls from '../components/PaginationControls';

const { width, height } = Dimensions.get('window');

const ITEMS_PER_PAGE = 10;

// Tách "mốc thời gian" từ id để sắp mới-nhất-trước. id có thể là UUID hoặc
// `prefix_<ts>` / `prefix-<ts>` — lấy dãy số LỚN NHẤT trong id (thường là
// timestamp ms). Trước đây split('_')[1] ra undefined với UUID → NaN → sắp sai.
const idTimestamp = (id?: string): number => {
  if (!id) return 0;
  const matches = id.match(/\d+/g);
  if (!matches) return 0;
  return matches.reduce((max, m) => Math.max(max, Number(m)), 0);
};

// ── Credit Badge ─────────────────────────────────────────────────────────────
const MagicCreditBadge = ({ credits }: { credits: number }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.creditBadge, { transform: [{ scale: pulseAnim }] }]}>
      <Icon name="lightning-bolt" size={13} color={COLORS.accent} />
      <Text style={styles.creditValue}>{credits?.toLocaleString() ?? '0'}</Text>
      <Text style={styles.creditLabel}>MAGIC</Text>
    </Animated.View>
  );
};

// ── Empty State ───────────────────────────────────────────────────────────────
const EmptyState = ({ onAdd }: { onAdd: () => void }) => {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -8, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue:  0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.emptyWrap}>
      <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
        <View style={styles.emptyIconWrap}>
          <Icon name="sprout-outline" size={48} color={COLORS.accentLight} />
          <View style={styles.emptyIconRing} />
        </View>
      </Animated.View>
      <Text style={styles.emptyTitle}>Chưa có trang trại nào</Text>
      <Text style={styles.emptyBody}>
        Hãy thêm nông trại đầu tiên để bắt đầu{'\n'}ghi nhận và truy xuất sầu riêng của bạn.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onAdd} activeOpacity={0.85}>
        <Icon name="plus" size={16} color={COLORS.white} />
        <Text style={styles.emptyBtnText}>Thêm trang trại</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Farm Card ─────────────────────────────────────────────────────────────────
const FarmCard = ({
  item,
  index,
  onPress,
}: {
  item: any;
  index: number;
  onPress: () => void;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn  = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  // Derive some display info
  const treeCount  = item.treeCount || 0;
  const fruitCount = item.fruitCount || 0;
  const areaLabel  = item.areaSqm
    ? `${(item.areaSqm / 10000).toFixed(1)} ha`
    : `${item.coordinates?.length ?? 0} điểm`;

  // Status chip
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    active:   { label: 'Đang hoạt động', color: COLORS.success,  bg: 'rgba(74,124,89,0.10)' },
    inactive: { label: 'Tạm dừng',       color: COLORS.textMuted, bg: COLORS.bgWarm },
    harvest:  { label: 'Mùa thu hoạch',  color: '#B07D2F',        bg: 'rgba(176,125,47,0.10)' },
  };
  const status = statusMap[item.status] ?? statusMap.active;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={styles.card}>
          {/* Left accent bar */}
          <View style={styles.cardAccentBar} />

          <View style={styles.cardBody}>
            {/* Top row */}
            <View style={styles.cardTopRow}>
              <View style={styles.cardIconWrap}>
                <Icon name="pine-tree" size={20} color={COLORS.accent} />
              </View>
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: status.bg },
                ]}
              >
                <View
                  style={[styles.statusDot, { backgroundColor: status.color }]}
                />
                <Text style={[styles.statusText, { color: status.color }]}>
                  {status.label}
                </Text>
              </View>
            </View>

            {/* Farm name */}
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>

            {/* Location */}
            {item.location ? (
              <View style={styles.cardLocation}>
                <Icon name="map-marker-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.cardLocationText} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            ) : null}

            {/* Stats */}
            <View style={styles.cardStats}>
              {[
                { icon: 'tree-outline',        val: treeCount,  label: 'cây' },
                { icon: 'food-apple-outline',  val: fruitCount, label: 'quả' },
                { icon: 'vector-polygon',      val: areaLabel,  label: '' },
              ].map((s, i) => (
                <View key={i} style={styles.cardStatItem}>
                  <Icon name={s.icon} size={13} color={COLORS.accentLight} />
                  <Text style={styles.cardStatVal}>{s.val}</Text>
                  {s.label ? <Text style={styles.cardStatLabel}>{s.label}</Text> : null}
                </View>
              ))}
            </View>
          </View>

          {/* Chevron */}
          <View style={styles.cardChevron}>
            <Icon name="chevron-right" size={20} color={COLORS.accentLight} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
const FarmListScreen = () => {
  const navigation = useNavigation<any>();
  const insets     = useSafeAreaInsets();
  const dispatch   = useDispatch<any>();
  const farms      = useSelector((state: RootState) => state.farm.farms);
  const user       = useSelector((state: RootState) => state.user.currentUser);
  // Số dư MAGIC THẬT từ chuỗi (nhất quán với Account/Activity/Dashboard).
  const wallet     = useSelector(selectChainWallet);

  const headerFade  = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;

  // Search and Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (user) {
      dispatch(loadFarms(user.id));
    }
    Animated.parallel([
      Animated.timing(headerFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [user]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Reload farms when returning to this screen and move to page 1
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        dispatch(loadFarms(user.id));
        setCurrentPage(1);
      }
    }, [user])
  );

  // Filter farms by search query
  const filteredFarms = farms.filter(farm =>
    farm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ((farm as any).location && (farm as any).location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // New farms should show first (by id timestamp 'farm_<ts>')
  const sortedFarms = [...filteredFarms].sort((a, b) => idTimestamp(b.id) - idTimestamp(a.id));

  // Pagination logic
  const totalPages = Math.ceil(filteredFarms.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedFarms = sortedFarms.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToAddFarm = () =>
    navigation.navigate('FarmDetail', { farm_id: null });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* ── Header ── */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: (Platform.OS === 'ios' ? 60 : 44) + insets.top },
          { opacity: headerFade, transform: [{ translateY: headerSlide }] },
        ]}
      >
        {/* Top bar */}
        <View style={styles.headerTopBar}>
          <View>
            <Text style={styles.headerEyebrow}>TRUY XUẤT NGUỒN GỐC</Text>
            <Text style={styles.headerTitle}>Trang trại</Text>
          </View>
          <MagicCreditBadge credits={wallet?.magicBalance ?? 0} />
        </View>

        {/* Subtitle + count */}
        <View style={styles.headerSubRow}>
          <Text style={styles.headerSub}>
            {filteredFarms.length > 0
              ? `${filteredFarms.length} nông trại đang quản lý`
              : 'Chưa có nông trại nào'}
          </Text>
          {filteredFarms.length > 0 && (
            <View style={styles.farmCountBadge}>
              <Text style={styles.farmCountText}>{filteredFarms.length}</Text>
            </View>
          )}
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Icon name="magnify" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm trang trại..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Ornament */}
        <View style={styles.headerRule}>
          <View style={styles.headerRuleLine} />
          <Icon name="leaf-outline" size={12} color={COLORS.accentLight} />
          <View style={styles.headerRuleLine} />
        </View>
      </Animated.View>

      {/* ── List ── */}
      <FlatList
        data={paginatedFarms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          filteredFarms.length === 0 ? (
            farms.length === 0 ? (
              <EmptyState onAdd={goToAddFarm} />
            ) : (
              <View style={styles.noSearchResults}>
                <Icon name="magnify-close" size={48} color={COLORS.textMuted} />
                <Text style={styles.noSearchResultsText}>Không tìm thấy nông trại</Text>
              </View>
            )
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item, index }) => (
          <FarmCard
            item={item}
            index={index}
            onPress={() =>
              navigation.navigate('FarmDetail', { farm_id: item.id })
            }
          />
        )}
        ListFooterComponent={
          filteredFarms.length > 0 ? (
            <View>
              {/* Pagination */}
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={filteredFarms.length}
                onPreviousPage={handlePreviousPage}
                onNextPage={handleNextPage}
              />
              <View style={{ height: 30 }} />
            </View>
          ) : null
        }
      />

      {/* ── FAB ── */}
      {farms.length > 0 && (
        <View style={[styles.fabWrap, { bottom: (Platform.OS === 'ios' ? 40 : 28) + insets.bottom }]}>
          <TouchableOpacity style={styles.fab} onPress={goToAddFarm} activeOpacity={0.88}>
            <View style={styles.fabShine} />
            <Icon name="plus" size={26} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.fabLabel}>Thêm trại</Text>
        </View>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // ── Header
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: COLORS.bg,
  },
  headerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -1,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  farmCountBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  farmCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  headerRule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRuleLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },

  // ── Credit Badge
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  creditValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  creditLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.accentLight,
    letterSpacing: 1,
  },

  // ── List
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexGrow: 1,
  },

  // ── Farm Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  cardAccentBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: COLORS.accent,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  cardBody: {
    flex: 1,
    padding: 14,
    paddingLeft: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
    marginBottom: 5,
  },
  cardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  cardLocationText: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
  },
  cardStats: {
    flexDirection: 'row',
    gap: 14,
  },
  cardStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardStatVal: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  cardStatLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  cardChevron: {
    paddingRight: 14,
    paddingLeft: 4,
  },

  // ── Empty State
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: height * 0.1,
    paddingHorizontal: 36,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  emptyIconRing: {
    position: 'absolute',
    top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 54,
    borderWidth: 1.5,
    borderColor: COLORS.accentLight,
    opacity: 0.3,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  emptyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.2,
  },

  // ── Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchIcon: {
    color: COLORS.textMuted,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 4,
  },

  // ── No Search Results
  noSearchResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  noSearchResultsText: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginTop: 12,
    fontWeight: '500',
  },

  // ── FAB
  fabWrap: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 28,
    right: 24,
    alignItems: 'center',
    gap: 6,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 8,
  },
  fabShine: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 29,
  },
  fabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});

export default FarmListScreen;