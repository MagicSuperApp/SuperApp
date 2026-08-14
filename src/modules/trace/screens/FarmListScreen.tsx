/**
 * FarmListScreen — danh sách VƯỜN, dựng theo phong cách Organic / Nature.
 *
 * ── Thẻ vườn ────────────────────────────────────────────────────────────────
 * Mỗi vườn là một thẻ nổi trên nền đất, góc bo KHÔNG ĐỀU, có một chiếc lá mờ ở
 * góc. Trong thẻ chỉ ba con số nhà vườn thật sự hỏi: bao nhiêu CÂY, bao nhiêu
 * QUẢ, rộng bao nhiêu.
 *
 * ── Đã bỏ khỏi bản cũ, và vì sao ────────────────────────────────────────────
 * · Huy hiệu MAGIC ở góc phải tiêu đề — số dư tiền mã hoá đặt cạnh tên vườn.
 *   Cùng lý do đã gỡ khỏi trang Tổng quan: người mở màn "Trang trại" đang tìm
 *   mảnh vườn của mình, không tìm ví. Số dư vẫn ở màn Tài khoản.
 * · Chữ IN HOA "TRUY XUẤT NGUỒN GỐC" trên tiêu đề — in hoa cỡ nhỏ đọc chậm hơn
 *   hẳn với người lớn tuổi (xem `theme/depth.ts`).
 * · Nút chuyển trang « ‹ 1/3 › » — thay bằng TỰ hiện thêm khi cuộn tới cuối,
 *   cùng lối với mục tin ở trang Tổng quan. Nông dân không đếm trang.
 * · Chữ tiếng Anh lẫn trong giao diện tiếng Việt ("farm under management",
 *   "No farms yet", "Points").
 *
 * Mọi câu chữ đi qua `tk('trace.…')` — không còn chuỗi tiếng Việt trong mã.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, FlatList, Pressable, StatusBar, StyleSheet, Text, TextInput, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import Icon, { type IconName } from '../../../components/Icon';
import StateView from '../../../components/state/StateView';
import { useOffline } from '../../../hooks/useOffline';
import { useTk } from '../../../i18n/keys';
import { polygonCenter } from '../../../features/wayfind/wayfind';
import { RootState } from '../../../store';
import { loadFarms, syncFarmsFromBackend } from '../store/farmSlice';
import { Ground } from '../components/layered/Surface';
import { Leaf } from '../components/layered/Organic';
import {
  ELEVATION, NATURE, ORGANIC_CARD, ORGANIC_TILE, RADIUS,
  SPACE, SURFACE, TONE, TYPE,
} from '../theme/depth';

/** Số vườn hiện lúc đầu và mỗi lần cuộn tới cuối. */
const PAGE_FIRST = 8;
const PAGE_STEP = 8;
const NEAR_BOTTOM_PX = 200;

/**
 * Mốc thời gian rút từ id để xếp mới-nhất-trước. id có thể là UUID hoặc
 * `prefix_<ts>` — lấy dãy số LỚN NHẤT trong id. Bản cũ dùng `split('_')[1]` nên
 * gặp UUID là ra `undefined` → `NaN` → xếp sai thứ tự mà không ai thấy.
 */
const idTimestamp = (id?: string): number => {
  if (!id) return 0;
  const matches = id.match(/\d+/g);
  return matches ? matches.reduce((max, m) => Math.max(max, Number(m)), 0) : 0;
};

const STATUS: Record<string, { key: string; tone: string; soft: string }> = {
  active: { key: 'trace.status.active', tone: TONE.primary, soft: TONE.primarySoft },
  inactive: { key: 'trace.status.inactive', tone: NATURE.barkSoft, soft: SURFACE.sunken },
  harvest: { key: 'trace.status.harvest', tone: TONE.sun, soft: TONE.sunSoft },
};

/** Tâm vườn để dẫn đường tới. Vườn chưa vẽ ranh giới → null (ẩn nút). */
const farmCenterOf = (farm: any) => polygonCenter(farm?.coordinates);

// ── Thẻ một vườn ────────────────────────────────────────────────────────────

const FarmCard: React.FC<{
  item: any;
  index: number;
  onPress: () => void;
  /** null = vườn chưa vẽ ranh giới → chưa có toạ-độ để dẫn tới. */
  onWayfind: (() => void) | null;
}> = ({
  item, index, onPress, onWayfind,
}) => {
  const tk = useTk();
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    // Trễ theo vị trí, nhưng CHẶN TRẦN ở 6 mục: danh sách dài mà nhân mãi thì mục
    // thứ 30 phải đợi 2,4 giây mới hiện — người dùng đọc thành "màn bị treo".
    const delay = Math.min(index, 6) * 70;
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start();
  }, [fade, slide, index]);

  const trees = item.treeCount || 0;
  const fruits = item.fruitCount || 0;
  const area = item.areaSqm
    ? `${(item.areaSqm / 10000).toFixed(1)} ha`
    : `${item.coordinates?.length ?? 0} ${tk('trace.unit.points')}`;
  const st = STATUS[item.status] ?? STATUS.active;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, ELEVATION.card, pressed && styles.pressed]}
        android_ripple={{ color: TONE.primarySoft }}
      >
        <Leaf size={78} color={NATURE.moss} opacity={0.07} rotate={22} style={styles.cardLeaf} />

        <View style={styles.cardHead}>
          <View style={styles.cardIcon}>
            <Icon name="tree" size={20} color={TONE.primary} />
          </View>
          <View style={styles.cardHeadText}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            {item.location ? (
              <View style={styles.cardPlace}>
                <Icon name="location-dot" size={12} color={NATURE.barkSoft} />
                <Text style={styles.cardPlaceTxt} numberOfLines={1}>{item.location}</Text>
              </View>
            ) : null}
          </View>
          {/* Dẫn đường tới vườn — đích là TRỌNG TÂM ranh giới đã vẽ, không phải
              một điểm nào đó trong đa-giác. Chưa vẽ ranh giới thì không hiện nút.
              Nút nằm TRONG thẻ nhưng bắt chạm riêng, nên bấm vào nó không mở
              luôn trang chi tiết vườn. */}
          {onWayfind ? (
            <Pressable
              style={({ pressed }) => [styles.wayBtn, pressed && styles.pressed]}
              onPress={onWayfind}
              accessibilityLabel={tk('trace.farmList.wayfind', { name: item.name })}
              hitSlop={10}
            >
              <Icon name="map-location-dot" size={19} color={TONE.primary} />
            </Pressable>
          ) : null}

          <View style={[styles.chip, { backgroundColor: st.soft }]}>
            <View style={[styles.chipDot, { backgroundColor: st.tone }]} />
            <Text style={[styles.chipTxt, { color: st.tone }]}>{tk(st.key)}</Text>
          </View>
        </View>

        <View style={styles.cardStats}>
          <Stat icon="tree" value={String(trees)} label={tk('trace.label.trees')} tone={TONE.primary} />
          <View style={styles.statSep} />
          <Stat icon="apple-whole" value={String(fruits)} label={tk('trace.label.fruits')} tone={TONE.sun} />
          <View style={styles.statSep} />
          <Stat icon="draw-polygon" value={area} label="" tone={TONE.leaf} />
        </View>
      </Pressable>
    </Animated.View>
  );
};

const Stat: React.FC<{ icon: IconName; value: string; label: string; tone: string }> = ({
  icon, value, label, tone,
}) => (
  <View style={styles.stat}>
    <Icon name={icon} size={14} color={tone} />
    <Text style={styles.statVal} numberOfLines={1}>{value}</Text>
    {label ? <Text style={styles.statLabel}>{label}</Text> : null}
  </View>
);

// ── Màn hình ────────────────────────────────────────────────────────────────

const FarmListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<any>();
  const tk = useTk();

  const farms = useSelector((s: RootState) => s.farm.farms);
  const isLoading = useSelector((s: RootState) => s.farm.isLoading);
  const loadError = useSelector((s: RootState) => s.farm.error);
  const user = useSelector((s: RootState) => s.user.currentUser);
  const offline = useOffline();

  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_FIRST);

  const headerFade = useRef(new Animated.Value(0)).current;

  /**
   * Hiện CACHE trong máy ngay (đọc được lúc mất sóng), rồi đồng bộ từ máy chủ và
   * nạp lại. Máy chủ lỗi/offline → `syncFarmsFromBackend` tự lùi về cache, danh
   * sách vẫn hiện — không màn trắng.
   */
  const refreshFarms = useCallback(() => {
    if (!user) return;
    dispatch(loadFarms(user.id));
    dispatch(syncFarmsFromBackend(user.id)).finally(() => dispatch(loadFarms(user.id)));
  }, [user, dispatch]);

  useEffect(() => {
    refreshFarms();
    Animated.timing(headerFade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [refreshFarms, headerFade]);

  useFocusEffect(useCallback(() => { refreshFarms(); setShown(PAGE_FIRST); }, [refreshFarms]));
  useEffect(() => { setShown(PAGE_FIRST); }, [query]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? farms.filter(f =>
          f.name.toLowerCase().includes(q) ||
          String((f as any).location ?? '').toLowerCase().includes(q))
      : farms;
    return [...list].sort((a, b) => idTimestamp(b.id) - idTimestamp(a.id));
  }, [farms, query]);

  const visible = matched.slice(0, shown);
  const moreComing = shown < matched.length;

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM_PX) {
      setShown(n => (n >= matched.length ? n : Math.min(n + PAGE_STEP, matched.length)));
    }
  }, [matched.length]);

  const goToAddFarm = () => navigation.navigate('FarmDetail', { farm_id: null });

  const renderEmpty = () => {
    if (matched.length > 0) return null;
    if (isLoading && farms.length === 0) return <StateView status="loading" loadingLines={4} />;
    if (farms.length === 0 && offline) return <StateView status="offline" onRetry={refreshFarms} />;
    if (farms.length === 0 && loadError) return <StateView status="error" onRetry={refreshFarms} />;
    if (farms.length === 0) {
      return (
        <StateView
          status="empty"
          title={tk('trace.empty.noFarmTitle')}
          message={tk('trace.empty.noFarmBody')}
          actionLabel={tk('trace.button.addFarm')}
          onAction={goToAddFarm}
        />
      );
    }
    // Có vườn nhưng lọc rỗng — khác hẳn "chưa có vườn nào", nên nói khác.
    return (
      <View style={styles.noResult}>
        <View style={styles.noResultIcon}>
          <Icon name="magnifying-glass-minus" size={30} color={TONE.primary} />
        </View>
        <Text style={TYPE.cardTitle}>{tk('trace.farmList.noResults')}</Text>
        <Text style={[TYPE.caption, styles.noResultHint]}>{tk('trace.farmList.noResultsHint')}</Text>
      </View>
    );
  };

  return (
    <Ground backdrop="list">
      <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />

      <Animated.View style={[styles.header, { paddingTop: insets.top + SPACE.md, opacity: headerFade }]}>
        <View style={styles.headRow}>
          {navigation.canGoBack() && (
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
              <Icon name="arrow-left" size={22} color={NATURE.bark} />
            </Pressable>
          )}
          <View style={styles.headText}>
            <Text style={TYPE.title} numberOfLines={1}>{tk('trace.farmList.title')}</Text>
            <Text style={TYPE.caption}>
              {farms.length > 0
                ? tk('trace.farmList.count', { n: matched.length })
                : tk('trace.empty.noFarmTitle')}
            </Text>
          </View>
        </View>

        <View style={styles.search}>
          <Icon name="magnifying-glass" size={17} color={NATURE.barkSoft} />
          <TextInput
            style={styles.searchInput}
            placeholder={tk('trace.farmList.search')}
            placeholderTextColor={NATURE.barkSoft}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={12}>
              <Icon name="circle-xmark" size={17} color={NATURE.barkSoft} />
            </Pressable>
          )}
        </View>
      </Animated.View>

      <FlatList
        data={visible}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 132 }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={160}
        ListEmptyComponent={renderEmpty()}
        ItemSeparatorComponent={() => <View style={{ height: SPACE.md }} />}
        renderItem={({ item, index }) => (
          <FarmCard
            item={item}
            index={index}
            onPress={() => navigation.navigate('FarmDetail', { farm_id: item.id })}
            onWayfind={farmCenterOf(item)
              ? () => {
                const c = farmCenterOf(item)!;
                navigation.navigate('Wayfind', {
                  lat: c.lat, lon: c.lng, kind: 'farm', label: item.name, farmId: item.id,
                });
              }
              : null}
          />
        )}
        ListFooterComponent={
          moreComing ? <View style={styles.moreHint}><Leaf size={26} color={TONE.primary} opacity={0.35} /></View> : null
        }
      />

      {farms.length > 0 && (
        <View style={[styles.fabWrap, { bottom: insets.bottom + 78 }]}>
          <Pressable
            style={({ pressed }) => [styles.fab, ELEVATION.cardStrong, pressed && styles.pressed]}
            onPress={goToAddFarm}
          >
            <Icon name="plus" size={24} color={NATURE.paper} />
          </Pressable>
          <Text style={styles.fabLabel}>{tk('trace.button.addFarm')}</Text>
        </View>
      )}
    </Ground>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACE.page, paddingBottom: SPACE.lg, gap: SPACE.lg },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  backBtn: {
    width: 42, height: 42, ...ORGANIC_TILE,
    alignItems: 'center', justifyContent: 'center', backgroundColor: SURFACE.raised,
  },
  headText: { flex: 1, minWidth: 0, gap: 1 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    minHeight: 52, paddingHorizontal: SPACE.lg,
    ...ORGANIC_CARD, backgroundColor: SURFACE.raised, ...ELEVATION.card,
  },
  searchInput: { flex: 1, fontSize: 16, color: NATURE.bark, paddingVertical: 0 },

  list: { paddingHorizontal: SPACE.page, paddingTop: SPACE.xs },

  card: {
    ...ORGANIC_CARD, backgroundColor: SURFACE.raised,
    padding: SPACE.lg, gap: SPACE.md, overflow: 'hidden',
  },
  pressed: { opacity: 0.92 },
  cardLeaf: { position: 'absolute', top: -16, right: -12 },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  cardIcon: {
    width: 46, height: 46, ...ORGANIC_TILE,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TONE.primarySoft,
  },
  cardHeadText: { flex: 1, minWidth: 0, gap: 2 },
  cardName: { fontSize: 18, fontWeight: '700', color: NATURE.bark },
  cardPlace: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardPlaceTxt: { ...TYPE.caption, flexShrink: 1, fontSize: 13 },

  wayBtn: {
    width: 40, height: 40, ...ORGANIC_TILE,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TONE.primarySoft,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.chip,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { fontSize: 12.5, fontWeight: '600' },

  cardStats: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: TONE.border,
  },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statVal: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  statLabel: { ...TYPE.caption, fontSize: 13 },
  statSep: { width: 1, height: 20, backgroundColor: TONE.border },

  noResult: { alignItems: 'center', paddingTop: SPACE.xxl, paddingHorizontal: SPACE.xl, gap: SPACE.sm },
  noResultIcon: {
    width: 66, height: 66, ...ORGANIC_TILE, marginBottom: SPACE.sm,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TONE.primarySoft,
  },
  noResultHint: { textAlign: 'center' },

  moreHint: { alignItems: 'center', paddingVertical: SPACE.xl },

  fabWrap: { position: 'absolute', right: SPACE.page, alignItems: 'center', gap: 6 },
  fab: {
    width: 62, height: 62,
    borderTopLeftRadius: 26, borderTopRightRadius: 20,
    borderBottomRightRadius: 26, borderBottomLeftRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TONE.primary,
  },
  fabLabel: { fontSize: 13, fontWeight: '600', color: TONE.primaryDeep },
});

export default FarmListScreen;
