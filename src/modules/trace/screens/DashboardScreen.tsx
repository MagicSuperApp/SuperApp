/**
 * DashboardScreen — trang TỔNG QUAN của module Truy xuất, dựng cho NHÀ VƯỜN.
 *
 * ── Ba mục, hết ─────────────────────────────────────────────────────────────
 *   1. VƯỜN CỦA TÔI  — vườn, cây, quả: mấy con số đó và lối đi tiếp.
 *   2. THỜI TIẾT     — hôm nay + 7 ngày tới, ngay tại mảnh vườn của họ.
 *   3. TIN NHÀ NÔNG  — báo Việt Nam viết cho người làm vườn, TỰ tải thêm khi cuộn.
 *
 * ── Phong cách: Organic / Nature ────────────────────────────────────────────
 * Màu đất và màu lá, mảng loang mờ phía sau, góc bo KHÔNG ĐỀU, chữ nhẹ. Khác
 * Neumorphism ở chỗ không giả vật liệu nhựa bằng bóng lồi/lõm — ở đây hình khối
 * mượn từ thứ người dùng nhìn mỗi ngày: hòn cuội, chiếc lá, vũng nước.
 * Tokens ở `theme/depth.ts`, hình nền ở `components/layered/Organic.tsx`.
 *
 * ── Chữ ─────────────────────────────────────────────────────────────────────
 * KHÔNG còn chuỗi tiếng Việt viết thẳng trong mã. Mọi câu đi qua `tk('trace.…')`
 * (xem `src/i18n/keys`) — sửa câu chữ không đụng tới mã, và người viết phần mềm
 * không đọc tiếng Việt vẫn sửa được giao diện.
 *
 * ── Đã BỎ khỏi bản cũ, và vì sao ────────────────────────────────────────────
 * · Dải token MAGIC · LAMP · CARP · ADA — bốn chữ viết tắt tiền mã hoá ngay đầu
 *   trang một ứng dụng nhà vườn. Số dư vẫn còn nguyên ở màn Tài khoản.
 * · Bộ lọc 5 nút + danh sách trộn vườn/cây/quả/hoạt động + phân trang — bảng tra
 *   dữ liệu của người viết phần mềm, không phải thứ để nhìn buổi sáng.
 * · Huy hiệu "Đã lưu / Đồng bộ…" chỉ chạy `setTimeout(1200)` rồi tự tắt — một cái
 *   nút GIẢ VỜ đồng bộ.
 * · Nút "Xem thêm tin": tin nay TỰ hiện thêm khi người dùng cuộn tới cuối. Bắt bấm
 *   một cái nút để đọc tiếp là dựng một cánh cửa ở giữa hành lang.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, Linking, Pressable, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import Icon, { type IconName } from '../../../components/Icon';
import StateView from '../../../components/state/StateView';
import { useOffline } from '../../../hooks/useOffline';
import { useTk } from '../../../i18n/keys';
import { RootState } from '../../../store';
import { useAppDispatch } from '../../../store/hooks';
import { loadActivities, loadFarms, loadTrees } from '../store/farmSlice';
import { showError } from '../../../utils/alert';
import { Card, Ground, SectionHeader } from '../components/layered/Surface';
import { Leaf } from '../components/layered/Organic';
import {
  NATURE, ORGANIC_CARD, ORGANIC_TILE, RADIUS,
  SPACE, SURFACE, TONE, TOUCH_MIN, TYPE,
} from '../theme/depth';
import {
  DEFAULT_COORD, centroidOf, describeWeather, farmAdviceKey, fetchWeather, weekdayVi,
  type WeatherReport,
} from '../../../services/weatherService';
import { fetchAgriNews, timeAgoVi, type NewsItem } from '../../../services/agriNewsService';
import { COLORS } from '../../../theme';

const ICON = {
  farm: 'tractor',
  tree: 'tree',
  fruit: 'apple-whole',
  weather: 'cloud-sun',
  news: 'newspaper',
  place: 'location-dot',
  humidity: 'droplet',
  wind: 'wind',
  add: 'circle-plus',
} satisfies Record<string, IconName>;

/** Lời chào theo giờ — nông dân bắt đầu ngày rất sớm, "buổi sáng" lúc 5h là đúng. */
function greetingKey(hour: number): string {
  if (hour < 11) return 'trace.greeting.morning';
  if (hour < 14) return 'trace.greeting.noon';
  if (hour < 18) return 'trace.greeting.afternoon';
  return 'trace.greeting.evening';
}

const toneBg = (t: string) =>
  t === 'sun' ? TONE.sunSoft : t === 'rain' || t === 'storm' ? TONE.rainSoft : TONE.primarySoft;
const toneFg = (t: string) =>
  t === 'sun' ? TONE.sun : t === 'rain' || t === 'storm' ? TONE.rain : TONE.primary;

// ════════════════════════════════════════════════════════════════════════════
// MÀN HÌNH
// ════════════════════════════════════════════════════════════════════════════

/** Số tin hiện lúc đầu, và số tin thêm mỗi lần cuộn tới cuối. */
const NEWS_FIRST = 4;
const NEWS_STEP = 4;
/** Còn cách đáy bằng này thì đã tính là "tới cuối" — nạp trước, đừng để hụt. */
const NEAR_BOTTOM_PX = 240;

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const tk = useTk();

  const user = useSelector((s: RootState) => s.user.currentUser);
  const farms = useSelector((s: RootState) => s.farm.farms);
  const trees = useSelector((s: RootState) => s.farm.trees);
  const fruits = useSelector((s: RootState) => s.farm.fruits);
  const isLoading = useSelector((s: RootState) => s.farm.isLoading);
  const loadError = useSelector((s: RootState) => s.farm.error);
  const offline = useOffline();

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState<WeatherReport | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  /** Số tin ĐANG hiện — tăng dần khi cuộn tới cuối, không cần nút nào. */
  const [shown, setShown] = useState(NEWS_FIRST);

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [fade]);

  // ── Vườn ──────────────────────────────────────────────────────────────────
  const loadGarden = useCallback(async () => {
    try {
      if (!user) return;
      const loaded = await dispatch(loadFarms(user.id)).unwrap();
      if (loaded.length > 0) {
        for (const farm of loaded) await dispatch(loadTrees(farm.id));
        await dispatch(loadActivities(loaded[0].id));
      }
    } catch {
      showError(tk('trace.error.loadTitle'), tk('trace.error.loadBody'));
    } finally {
      setHasLoadedOnce(true);
    }
  }, [user, dispatch, tk]);

  useFocusEffect(useCallback(() => { loadGarden(); }, [loadGarden]));

  // ── Thời tiết: theo TÂM RANH GIỚI vườn đầu tiên ───────────────────────────
  const spot = useMemo(() => {
    const c = centroidOf(farms[0]?.coordinates ?? []);
    return c
      ? { ...c, name: farms[0]?.name ?? tk('trace.weather.yourGarden') }
      : { ...DEFAULT_COORD, name: tk('trace.weather.defaultPlace') };
  }, [farms, tk]);

  const loadWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeather(await fetchWeather(spot.lat, spot.lon));
    setWeatherLoading(false);
  }, [spot.lat, spot.lon]);

  useEffect(() => { loadWeather(); }, [loadWeather]);

  // ── Tin ───────────────────────────────────────────────────────────────────
  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    setNews(await fetchAgriNews());
    setShown(NEWS_FIRST);
    setNewsLoading(false);
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  /**
   * Cuộn gần tới đáy thì hiện thêm tin. Không nút, không "trang 2".
   * Chặn ở `news.length` nên tới hết là dừng hẳn — không có vòng lặp nào chạy tiếp.
   */
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const nearBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM_PX;
    if (nearBottom) setShown(n => (n >= news.length ? n : Math.min(n + NEWS_STEP, news.length)));
  }, [news.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([loadGarden(), loadWeather(), loadNews()]); }
    finally { setRefreshing(false); }
  }, [loadGarden, loadWeather, loadNews]);

  const hasData = farms.length > 0;

  if ((isLoading || !hasLoadedOnce) && !hasData && !offline && !loadError) {
    return (
      <Ground>
        <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
        <StateView status="loading" loadingLines={5} />
      </Ground>
    );
  }
  if (!hasData && offline) {
    return (
      <Ground>
        <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
        <StateView status="offline" onRetry={loadGarden} />
      </Ground>
    );
  }
  if (!hasData && loadError) {
    return (
      <Ground>
        <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
        <StateView status="error" onRetry={loadGarden} />
      </Ground>
    );
  }

  const visibleNews = news.slice(0, shown);
  const moreComing = shown < news.length;
  const look = weather ? describeWeather(weather.now.code) : null;
  const adviceKey = weather ? farmAdviceKey(weather.now, weather.days) : null;
  const todayIso = weather?.days[0]?.date;

  return (
    <Ground backdrop="home">
      <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, SPACE.md) + 36 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={160}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[TONE.primary]}
            tintColor={TONE.primary}
            progressBackgroundColor={SURFACE.raised}
          />
        }
      >
        <Animated.View style={{ opacity: fade }}>
          {/* ── Lời chào ───────────────────────────────────────────────── */}
          <View style={styles.hello}>
            <Text style={styles.helloGreet}>{tk(greetingKey(new Date().getHours()))}</Text>
            <Text style={TYPE.title} numberOfLines={1}>
              {user?.name?.trim() || tk('trace.greeting.fallbackName')}
            </Text>
          </View>

          {/* ══ MỤC 1 — VƯỜN CỦA TÔI ══════════════════════════════════════ */}
          <SectionHeader
            icon={ICON.farm}
            title={tk('trace.section.myGarden')}
            hint={hasData ? spot.name : tk('trace.empty.noGarden')}
            actionLabel={hasData ? tk('trace.button.viewGardens') : undefined}
            onAction={hasData ? () => navigation.navigate('FarmList') : undefined}
          />
          <Card strong style={{ backgroundColor: "#fbfffd96" }}>
            {/* Chiếc lá nhỏ ở góc thẻ — dấu hiệu của phong cách, không phải trang trí thừa */}
            <Leaf size={70} color={NATURE.moss} opacity={0.07} rotate={28} style={styles.cardLeaf} />
            <View style={styles.metrics}>
              <Metric icon={ICON.farm} value={farms.length} label={tk('trace.label.gardens')}
                tone={TONE.primary} toneSoft={TONE.primarySoft} />
              <View style={styles.metricSep} />
              <Metric icon={ICON.tree} value={trees.length} label={tk('trace.label.trees')}
                tone={TONE.leaf} toneSoft={TONE.leafSoft} />
              <View style={styles.metricSep} />
              <Metric icon={ICON.fruit} value={fruits.length} label={tk('trace.label.fruits')}
                tone={TONE.sun} toneSoft={TONE.sunSoft} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              onPress={() => (hasData
                ? navigation.navigate('FarmDetail', { farm_id: farms[0].id })
                : navigation.navigate('FarmList'))}
            >
              <Icon name={hasData ? ICON.add : ICON.farm} size={17} color={NATURE.paper} />
              <Text style={styles.primaryBtnTxt}>
                {tk(hasData ? 'trace.button.addTree' : 'trace.button.createFirstGarden')}
              </Text>
            </Pressable>
          </Card>

          {/* ══ MỤC 2 — THỜI TIẾT ═════════════════════════════════════════ */}
          <View style={styles.sectionGap} />
          <SectionHeader
            icon={ICON.weather}
            title={tk('trace.section.weather')}
            hint={tk('trace.weather.hint')}
          />
          {weatherLoading && !weather ? (
            <Card>
              <View style={styles.inlineLoad}>
                <ActivityIndicator color={TONE.primary} />
                <Text style={TYPE.caption}>{tk('trace.weather.loading')}</Text>
              </View>
            </Card>
          ) : !weather || !look ? (
            <Card>
              <Text style={TYPE.cardTitle}>{tk('trace.weather.failTitle')}</Text>
              <Text style={[TYPE.caption, styles.gapTop]}>{tk('trace.weather.failBody')}</Text>
              <Pressable style={styles.retryBtn} onPress={loadWeather}>
                <Text style={styles.retryTxt}>{tk('trace.button.retry')}</Text>
              </Pressable>
            </Card>
          ) : (
            <Card strong padded={false}>
              <View style={styles.wxToday}>
                <View style={styles.wxTodayLeft}>
                  <View style={styles.wxPlace}>
                    <Icon name={ICON.place} size={12} color={TONE.primary} />
                    <Text style={styles.wxPlaceTxt} numberOfLines={1}>{spot.name}</Text>
                  </View>
                  <Text style={styles.wxTemp}>{weather.now.tempC}°</Text>
                  <Text style={styles.wxLabel}>{tk(look.labelKey)}</Text>
                </View>
                <View style={[styles.wxGlyph, { backgroundColor: toneBg(look.tone) }]}>
                  <Icon name={look.icon as IconName} size={46} color={toneFg(look.tone)} />
                </View>
              </View>

              <View style={styles.wxFacts}>
                <Fact icon={ICON.humidity} value={`${weather.now.humidity}%`} label={tk('trace.weather.humidity')} />
                <Fact icon={ICON.wind} value={`${weather.now.windKph} km/h`} label={tk('trace.weather.wind')} />
                <Fact icon="cloud-rain" value={`${weather.days[0]?.rainChance ?? 0}%`} label={tk('trace.weather.rainChance')} />
              </View>

              {adviceKey ? (
                <View style={styles.advice}>
                  <Icon name="seedling" size={15} color={TONE.primaryDeep} />
                  <Text style={styles.adviceTxt}>{tk(adviceKey)}</Text>
                </View>
              ) : null}

              <View style={styles.wxWeek}>
                {weather.days.map(d => {
                  const dl = describeWeather(d.code);
                  const isToday = d.date === todayIso;
                  return (
                    <View key={d.date} style={[styles.wxDay, isToday && styles.wxDayToday]}>
                      <Text style={[styles.wxDayName, isToday && styles.wxDayNameToday]}>
                        {weekdayVi(d.date)}
                      </Text>
                      <Icon name={dl.icon as IconName} size={20} color={isToday ? "yellow" : toneFg(dl.tone)} />
                      <Text style={[styles.wxDayMax, isToday && { color: "white" }]}>{d.maxC}°</Text>
                      <Text style={[styles.wxDayMin, isToday && { color: "white" }]}>{d.minC}°</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {/* ══ MỤC 3 — TIN NHÀ NÔNG ══════════════════════════════════════ */}
          <View style={styles.sectionGap} />
          <SectionHeader
            icon={ICON.news}
            title={tk('trace.section.news')}
            hint={tk('trace.news.hint')}

          />

          {newsLoading && !news.length ? (
            <Card>
              <View style={styles.inlineLoad}>
                <ActivityIndicator color={TONE.primary} />
                <Text style={TYPE.caption}>{tk('trace.news.loading')}</Text>
              </View>
            </Card>
          ) : !news.length ? (
            <Card>
              <Text style={TYPE.cardTitle}>{tk('trace.news.failTitle')}</Text>
              <Text style={[TYPE.caption, styles.gapTop]}>{tk('trace.news.failBody')}</Text>
            </Card>
          ) : (
            <>
              {visibleNews.map(item => <NewsCard key={item.id} item={item} />)}
              {/* Cuộn tới đây là tin tự hiện thêm — dòng này chỉ để người dùng biết
                  còn tin phía dưới, không phải nút bấm. */}
              <View style={styles.newsFoot}>
                {moreComing ? (
                  <>
                    <ActivityIndicator size="small" color={TONE.primary} />
                    <Text style={TYPE.caption}>{tk('trace.news.loadingMore')}</Text>
                  </>
                ) : (
                  <Text style={TYPE.caption}>{tk('trace.news.end')}</Text>
                )}
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </Ground>
  );
};

// ── Mảnh nhỏ ────────────────────────────────────────────────────────────────

const Metric: React.FC<{
  icon: IconName; value: number; label: string; tone: string; toneSoft: string;
}> = ({ icon, value, label, tone, toneSoft }) => (
  <View style={styles.metric}>
    <View style={[styles.metricIcon, { backgroundColor: toneSoft }]}>
      <Icon name={icon} size={18} color={tone} />
    </View>
    <Text style={TYPE.metricSm}>{value}</Text>
    <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
  </View>
);

const Fact: React.FC<{ icon: IconName; value: string; label: string }> = ({ icon, value, label }) => (
  <View style={styles.fact}>
    <Icon name={icon} size={15} color={TONE.primary} />
    <View>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  </View>
);

/**
 * Thẻ tin kiểu ẢNH-TRƯỚC: ảnh chiếm trọn bề ngang ở trên, chữ nằm dưới.
 *
 *   ┌─────────────────────┐
 *   │        ẢNH          │
 *   ├─────────────────────┤
 *   │ Tiêu đề — ĐỦ CÂU    │
 *   │ Trích một đoạn ngắn │
 *   │ Nguồn · 3 giờ trước │
 *   └─────────────────────┘
 *
 * TIÊU ĐỀ KHÔNG CẮT. Tiêu đề báo tiếng Việt hay dài, mà cắt giữa chừng thì mất
 * đúng vế mang tin ("Mít giá thấp vẫn cười: bóc tách tâm lý bán…" — vế sau mới là
 * nội dung). Phần TRÍCH thì cắt 2 dòng: nó chỉ để ướm xem có đáng đọc không.
 */
const NewsCard: React.FC<{ item: NewsItem }> = ({ item }) => (
  <Card onPress={() => Linking.openURL(item.link).catch(() => { })} padded={false} style={styles.newsCard}>
    {item.imageUrl ? (
      <Image source={{ uri: item.imageUrl }} style={styles.newsCover} resizeMode="cover" />
    ) : (
      <View style={[styles.newsCover, styles.newsCoverEmpty]}>
        <Icon name={ICON.news} size={30} color={TONE.primary} />
      </View>
    )}
    <View style={styles.newsBody}>
      <Text style={styles.newsTitle}>{item.title}</Text>
      {item.summary ? (
        <Text style={styles.newsSummary} numberOfLines={2}>{item.summary}</Text>
      ) : null}
      <View style={styles.newsMeta}>
        <Text style={styles.newsSource} numberOfLines={1}>{item.source}</Text>
        {item.publishedAt ? (
          <>
            <View style={styles.dot} />
            <Text style={styles.newsTime}>{timeAgoVi(item.publishedAt)}</Text>
          </>
        ) : null}
      </View>
    </View>
  </Card>
);

const styles = StyleSheet.create({
  hello: { paddingHorizontal: SPACE.page, paddingTop: SPACE.xl, paddingBottom: SPACE.xl },
  helloGreet: { ...TYPE.body, color: TONE.primary, fontWeight: '600', marginBottom: 2 },

  sectionGap: { height: SPACE.section },
  gapTop: { marginTop: 4 },
  pressed: { opacity: 0.9 },
  inlineLoad: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm },

  // Mục 1
  cardLeaf: { position: 'absolute', top: -14, right: -10 },
  metrics: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1, alignItems: 'center', gap: 4 },
  metricIcon: {
    width: 44, height: 44, ...ORGANIC_TILE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  metricLabel: { ...TYPE.caption, fontWeight: '600' },
  metricSep: { width: 1, height: 46, backgroundColor: TONE.border },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    minHeight: TOUCH_MIN, marginTop: SPACE.lg,
    ...ORGANIC_CARD, backgroundColor: TONE.primary,
  },
  primaryBtnTxt: { fontSize: 17, fontWeight: '700', color: NATURE.paper },

  // Mục 2
  retryBtn: {
    alignSelf: 'flex-start', marginTop: SPACE.md,
    paddingHorizontal: SPACE.lg, minHeight: 46, justifyContent: 'center',
    borderRadius: RADIUS.field, backgroundColor: TONE.primarySoft,
  },
  retryTxt: { fontSize: 16, fontWeight: '700', color: TONE.primaryDeep },

  wxToday: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, paddingBottom: SPACE.md,
  },
  wxTodayLeft: { flex: 1, minWidth: 0 },
  wxPlace: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  wxPlaceTxt: { ...TYPE.caption, flexShrink: 1, fontWeight: '600', color: TONE.primary },
  wxTemp: { fontSize: 56, lineHeight: 62, fontWeight: '700', letterSpacing: -2, color: NATURE.bark },
  wxLabel: { ...TYPE.body, fontWeight: '600', marginTop: -2 },
  wxGlyph: { width: 96, height: 96, borderTopLeftRadius: 40, borderTopRightRadius: 30, borderBottomRightRadius: 40, borderBottomLeftRadius: 30, alignItems: 'center', justifyContent: 'center' },

  wxFacts: { flexDirection: 'row', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md },
  fact: { flex: 1, display: "flex", flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  factValue: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  factLabel: { ...TYPE.caption, fontSize: 13},

  advice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm,
    marginHorizontal: SPACE.lg, marginBottom: SPACE.md,
    padding: SPACE.md, ...ORGANIC_TILE, backgroundColor: TONE.primarySoft,
  },
  adviceTxt: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600', color: TONE.primaryDeep },

  wxWeek: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: SPACE.lg,
    borderTopWidth: 1, borderTopColor: TONE.border,
  },
  wxDay: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: SPACE.sm, borderRadius: RADIUS.field },
  wxDayToday: { backgroundColor: NATURE.leaf, color: "white" },
  wxDayName: { ...TYPE.caption, fontSize: 13, fontWeight: '600' },
  wxDayNameToday: { color: "white", fontWeight: '700' },
  wxDayMax: { fontSize: 15, fontWeight: '700', color: NATURE.bark },
  wxDayMin: { ...TYPE.caption, fontSize: 13 },

  // Mục 3 — thẻ tin ẢNH-TRƯỚC
  newsCard: { marginBottom: SPACE.lg },
  // Ảnh cao 190: đủ để thấy cảnh vườn/quả trong ảnh báo, chưa tới mức mỗi tin
  // chiếm trọn màn khiến người dùng phải cuộn mãi mới thấy tin thứ hai.
  newsCover: { width: '100%', height: 190, backgroundColor: SURFACE.sunken },
  newsCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  newsBody: { padding: SPACE.lg, gap: SPACE.sm },
  // KHÔNG numberOfLines: tiêu đề phải hiện đủ câu.
  newsTitle: { fontSize: 17.5, lineHeight: 25, fontWeight: '700', color: NATURE.bark },
  newsSummary: { ...TYPE.caption, fontSize: 14.5, lineHeight: 21 },
  newsMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: 2 },
  newsSource: { ...TYPE.caption, fontSize: 13, flexShrink: 1, color: TONE.primary, fontWeight: '600' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: TONE.border },
  newsTime: { ...TYPE.caption, fontSize: 13 },

  newsFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    paddingVertical: SPACE.xl,
  },
});

export default DashboardScreen;
