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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import Icon, { type IconName } from '../../../components/Icon';
import { openAssistant } from '../../../components/assistantBus';
import StateView from '../../../components/state/StateView';
import { useOffline } from '../../../hooks/useOffline';
import { useTk } from '../../../i18n/keys';
import { RootState } from '../../../store';
import { useAppDispatch } from '../../../store/hooks';
import { loadActivities, loadFarms, loadTrees, syncFarmsFromBackend } from '../store/farmSlice';
import FarmsMapCard from '../components/FarmsMap';
import { showError } from '../../../utils/alert';
import { Card, Ground, SectionHeader } from '../components/layered/Surface';
import { Leaf } from '../components/layered/Organic';
import {
  AI_TINT, DARK_CARD, LIME_CARD, NATURE, ORGANIC_CARD, ORGANIC_TILE, RADIUS,
  SPACE, SURFACE, TONE, TYPE,
} from '../theme/depth';
import {
  DEFAULT_COORD, centroidOf, describeWeather, farmAdviceKey, fetchWeather, weekdayVi,
  type WeatherReport,
} from '../../../services/weatherService';
import { fetchAgriNews, hotNews, timeAgoVi, type NewsItem } from '../../../services/agriNewsService';
import { runAlertCheck } from '../../../services/alertDispatcher';
import {
  formatPriceValue, priceMove, type CommodityPrice, type PriceMove,
} from '../../../services/agriPriceService';
import { fetchAgroPrices } from '../../../services/agroPriceService';
import { fetchWorldPrices } from '../../../services/worldPriceService';
import {
  historyOf, hourBucket, hoursBetween, previousPoint, recordPrice,
} from '../../../services/priceHistoryDb';

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

/**
 * Bày NĂM ngày, dù máy chủ trả bảy.
 *
 * Quá năm ngày thì khả năng mưa gần như chỉ còn là phỏng đoán — mà đây lại đúng
 * là con số nhà vườn dựa vào để hoãn hay không hoãn buổi phun thuốc. Bày thêm
 * hai cột nữa chỉ làm mỗi cột hẹp lại và mời người ta tin vào phần yếu nhất của
 * dự báo.
 */
const FORECAST_DAYS = 5;

/**
 * Thẻ thời tiết đổi màu theo GIỜ THẬT, không cố định một tông.
 *
 * Ban đêm mà thẻ vẫn trắng sáng thì mở app lúc 4 giờ sáng đi thăm vườn là chói
 * mắt — và người trồng sầu riêng có đi vườn giờ đó. Ngược lại, giữa trưa nắng
 * gắt thì thẻ tối lại là thứ khó đọc nhất trên màn.
 *
 * Mốc 6h–18h theo giờ máy. Không tính giờ mặt trời mọc/lặn thật: chênh lệch ở
 * Việt Nam chỉ vài chục phút, không đáng để thêm một phép tính có thể sai.
 */
const DAY_START_H = 6;
const DAY_END_H = 18;

function isDaytime(d: Date): boolean {
  const h = d.getHours();
  return h >= DAY_START_H && h < DAY_END_H;
}

/** Bảng màu của thẻ thời tiết theo buổi. Ban ngày lấy đúng tông sáng của trang. */
function wxPalette(day: boolean) {
  return day
    ? {
      bg: SURFACE.raised,
      bgSoft: TONE.primarySoft,
      text: NATURE.bark,
      textSoft: NATURE.barkSoft,
      border: TONE.border,
    }
    : DARK_CARD;
}


// ════════════════════════════════════════════════════════════════════════════
// MÀN HÌNH
// ════════════════════════════════════════════════════════════════════════════

/** Số tin hiện lúc đầu, và số tin thêm mỗi lần cuộn tới cuối. */
/** Còn cách đáy bằng này thì đã tính là "tới cuối" — nạp trước, đừng để hụt. */

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
  /**
   * Thẻ đang mở của mục Vườn. Mặc định là DANH SÁCH, không phải bản đồ.
   *
   * Bản đồ tốn một bề mặt OpenGL và một loạt lượt tải ô ảnh; mở nó cho mọi người
   * ở mọi lần vào app là bắt máy yếu và gói 3G trả giá cho một thứ chỉ thỉnh
   * thoảng mới cần. Ai cần thì bấm một cái là có.
   */
  const [gardenTab, setGardenTab] = useState<'list' | 'map'>('list');
  const [weather, setWeather] = useState<WeatherReport | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [prices, setPrices] = useState<Array<PriceMove & { agoH: number }>>([]);
  const [priceLoading, setPriceLoading] = useState(true);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  /**
   * Trang Tổng quan chỉ bày TIN NÓNG — trong 24 giờ, nhiều nhất ba mục.
   * Xem `hotNews` để biết vì sao ngày ít tin vẫn có mục hiện ra thay vì trống.
   *
   * Khai Ở ĐÂY, TRƯỚC mọi lệnh `return` sớm bên dưới: hook gọi có điều kiện là
   * lỗi thứ tự hook, và hậu quả không phải một dòng sai mà là state của cả màn
   * trượt sang nhau.
   */
  const hot = useMemo(() => hotNews(news, { now: Date.now(), limit: 3 }), [news]);

  /**
   * Nạp giá nông sản, rồi tính biến động THEO GIỜ.
   *
   * Ghi giá đọc được vào ô của giờ hiện tại, và so với ô gần nhất trước đó. Nhờ
   * vậy con số biến động không còn phụ thuộc vào việc người dùng mở app thưa hay
   * dày — xem `priceHistoryDb`.
   */
  const loadPrices = useCallback(async () => {
    // Hai nguồn chạy song song; nguồn nào hỏng thì vắng mặt, không kéo nguồn kia.
    const [domestic, world] = await Promise.all([
      fetchAgroPrices().catch(() => []),
      fetchWorldPrices().catch(() => []),
    ]);
    const now = Date.now();
    const bucket = hourBucket(now);

    const rows = await Promise.all([...domestic, ...world].map(async (c: CommodityPrice) => {
      // Nguồn tự mang chuỗi ngày/tháng → so bằng chính chuỗi đó. Đây là chuyển
      // động THẬT của thị trường, không phụ thuộc lúc người dùng mở app.
      if (c.prevVnd != null) {
        return { ...priceMove(c, c.prevVnd), agoH: 0 };
      }
      // Nguồn chỉ cho một giá trần → mới lùi về ô giờ đã lưu trong máy.
      const past = await historyOf(c.key);
      const prev = previousPoint(past, bucket);
      // Ghi SAU khi đã đọc ô trước — ghi trước thì ô hiện tại chính là ô vừa ghi
      // và mọi mặt hàng đều hiện "0%".
      await recordPrice(c.key, c.priceVnd, now);
      return {
        ...priceMove(c, prev?.priceVnd ?? null),
        agoH: prev ? hoursBetween(bucket, prev.hourBucket) : 0,
      };
    }));

    setPrices(rows);
    setPriceLoading(false);
  }, []);

  useEffect(() => { loadPrices(); }, [loadPrices]);

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [fade]);

  // ── Vườn ──────────────────────────────────────────────────────────────────
  /**
   * Cache TRƯỚC, máy chủ SAU — và không nạp lại cache sau khi đồng bộ.
   *
   * Bước 1 đọc SQLite nên danh sách hiện ngay cả khi mất sóng. Bước 2 thay bằng
   * bản của máy chủ, vốn mang thêm TÂM VƯỜN, CÁCH LẤY RANH, SAI SỐ RANH và SỐ
   * CÂY/CON VẬT — chính mấy trường thẻ "Bản đồ" cần để vẽ vùng vườn và bày thông
   * tin khi chạm vào.
   *
   * ⚠ Không gọi `loadFarms` lần nữa sau bước 2. Bảng `farms` trong SQLite chỉ có
   * bốn cột (`id · name · coordinates · user_id`), nên nạp lại cache là ném đi
   * đúng những trường vừa lấy về — thẻ Bản đồ sẽ im lặng mất tâm vườn và số cây
   * mà không có gì báo. (Màn Danh sách vườn đang làm ngược thứ tự này; ở đó
   * không hại vì nó chỉ cần tên và ranh.)
   */
  const loadGarden = useCallback(async () => {
    try {
      if (!user) return;
      const cached = await dispatch(loadFarms(user.id)).unwrap();
      let list = cached;
      try {
        const fresh = await dispatch(syncFarmsFromBackend(user.id)).unwrap();
        if (Array.isArray(fresh) && fresh.length > 0) list = fresh;
      } catch {
        // Máy chủ hỏng → giữ nguyên cache. `syncFarmsFromBackend` tự nuốt lỗi
        // mạng, nên tới đây là ca hiếm; vẫn bắt để không kéo đổ cả màn.
      }
      if (list.length > 0) {
        for (const farm of list) await dispatch(loadTrees(farm.id));
        await dispatch(loadActivities(list[0].id));
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
    setNewsLoading(false);
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  /**
   * XÉT CẢNH BÁO — dông, gió giật, mưa to, và tin nhiều báo cùng đưa.
   *
   * Chạy ở ĐÂY vì trang này vốn đã tải thời tiết và tin để vẽ màn; bắt bộ cảnh
   * báo tự tải lại là nhân đôi lượt mạng của người dùng cho cùng một dữ liệu.
   *
   * ⚠ Hệ quả phải biết: cảnh báo chỉ được xét khi trang Tổng quan có dữ liệu
   * mới, tức lúc mở app hoặc quay lại app. **App đóng hẳn thì không có cảnh
   * báo** — muốn báo lúc nửa đêm thì phải để máy chủ đẩy push. Xem đầu
   * `services/localNotify.ts`.
   *
   * Chờ cả hai nguồn tải xong mới xét: chạy khi tin còn rỗng thì luật "nhiều báo
   * cùng đưa một chuyện" không bao giờ đủ nguồn để đếm, và ta khoá mất 30 phút
   * nhịp tối thiểu cho một lượt xét nửa vời.
   */
  useEffect(() => {
    if (weatherLoading || newsLoading) return;
    // Không cần cờ `alive`: `runAlertCheck` không đặt state của màn này, nó chỉ
    // đọc/ghi AsyncStorage và gọi notifee. Màn tháo giữa chừng thì lượt xét cứ
    // chạy nốt — và đó là điều ĐÚNG, vì cảnh báo không thuộc về màn hình nào.
    runAlertCheck({ now: Date.now(), weather, news }).catch(() => {
      // Cảnh báo là phần THÊM. Hỏng nó không được làm hỏng trang Tổng quan.
    });
  }, [weatherLoading, newsLoading, weather, news]);

  /**
   * Cuộn gần tới đáy thì hiện thêm tin. Không nút, không "trang 2".
   * Chặn ở `news.length` nên tới hết là dừng hẳn — không có vòng lặp nào chạy tiếp.
   */

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

  /**
   * Bảng màu thẻ thời tiết theo GIỜ. Tính lại mỗi lượt vẽ chứ không nhớ: người
   * dùng mở app lúc 17h55 rồi để đó, 18h05 quay lại là phải thấy thẻ đã tối.
   */
  const wx = wxPalette(isDaytime(new Date()));
  const look = weather ? describeWeather(weather.now.code) : null;
  const adviceKey = weather ? farmAdviceKey(weather.now, weather.days) : null;
  const todayIso = weather?.days[0]?.date;

  return (
    <Ground backdrop="home">
      <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, SPACE.md) + 36 }}
        showsVerticalScrollIndicator={false}
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
          {/* KHÔNG còn `hint` ở đây: tên vườn nay nằm trong chính thẻ bên dưới.
              Để cả hai chỗ là in cùng một chuỗi hai lần cách nhau 40 px — người
              đọc phải kiểm xem hai dòng đó có khác nhau không, rồi phát hiện là
              không. */}
          <SectionHeader
            icon={ICON.farm}
            title={tk('trace.section.myGarden')}
            actionLabel={hasData ? tk('trace.button.viewGardens') : undefined}
            onAction={hasData ? () => navigation.navigate('FarmList') : undefined}
          />
          {/* HAI THẺ: con số và bản đồ.
              Cùng một mục "Vườn của tôi" nhưng hai câu hỏi khác nhau — "tôi có
              bao nhiêu" và "chúng nằm ở đâu". Nhồi cả hai vào một khung dọc thì
              bản đồ đẩy thời tiết và giá xuống dưới nếp gấp, mà đó mới là thứ
              người ta mở app buổi sáng để xem. Thẻ giữ bản đồ ở đúng một khoảng
              cao 260 px, ai cần nhìn kỹ thì bấm nút mở toàn màn hình. */}
          <View style={styles.tabBar}>
            <GardenTab
              icon="list-check"
              label={tk('trace.tab.list')}
              active={gardenTab === 'list'}
              onPress={() => setGardenTab('list')}
            />
            <GardenTab
              icon="map-location-dot"
              label={tk('trace.tab.map')}
              active={gardenTab === 'map'}
              onPress={() => setGardenTab('map')}
            />
          </View>

          {gardenTab === 'list' ? (
            <>
              {/*
                MỘT THẺ, không phải ba ô rời.

                Ba bản trước lần lượt là: thẻ to bọc ba cụm icon-trên-số ngăn bằng
                vạch dọc (lối bảng biểu 2010) → lưới hai hàng → một hàng ba ô
                trắng. Bản này gom lại thành MỘT mảng màu.

                Vì sao đổi lần nữa: ba ô trắng trên nền trắng thì mắt phải đi tìm
                chúng. Vườn · cây · quả là thứ liếc MỘT cái rồi đi tiếp — một mảng
                màu đặc kéo mắt tới đúng chỗ nhanh hơn mọi cỡ chữ. Và nó chỉ hiệu
                quả chừng nào trong trang CHỈ CÓ MỘT mảng như vậy; thêm cái thứ hai
                là hai cái cùng mất tác dụng (xem `LIME_CARD` ở `theme/depth`).

                HAI vùng chạm, KHÔNG lồng nhau: phần số bấm vào mở danh sách vườn,
                nút bên dưới thêm cây. Lồng `Pressable` trong `Pressable` thì trên
                Android chuyện "cú chạm này thuộc về ai" phụ thuộc thứ tự dựng và
                vùng đè — thứ chỉ lộ ra trên máy thật, ở đúng cái nút quan trọng
                nhất của trang. Tách phẳng thì không phải đoán.
              */}
              <View style={styles.gardenCard}>
                {/*
                  HOẠ TIẾT TÁN LÁ — góc dưới bên phải.

                  Nằm DƯỚI chữ và `pointerEvents="none"`, nên không bao giờ ăn mất
                  cú chạm. Ba lá lệch cỡ và lệch góc: xoay đều nhau thì ra hình do
                  máy vẽ, lệch thì mắt đọc thành tán lá thật. Tràn ra ngoài mép và
                  bị `overflow: hidden` cắt — lá bị cắt ở mép trông như tán lá còn
                  tiếp diễn, lá nằm gọn trong khung thì trông như một cái tem dán.
                */}
                <View style={styles.gardenLeaves} pointerEvents="none">
                  <Leaf size={132} color={LIME_CARD.leaf} opacity={0.20} rotate={-18} style={styles.leafA} />
                  <Leaf size={92} color={LIME_CARD.leaf} opacity={0.28} rotate={34} style={styles.leafB} />
                  <Leaf size={64} color={NATURE.paper} opacity={0.13} rotate={-52} style={styles.leafC} />
                </View>

                <Pressable
                  onPress={() => navigation.navigate('FarmList')}
                  style={({ pressed }) => [styles.gardenTop, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={tk('trace.section.myGarden')}
                >
                  <View style={styles.gardenHead}>
                    <Icon name={ICON.farm} size={13} color={LIME_CARD.textSoft} />
                    <Text style={styles.gardenHeadTxt} numberOfLines={1}>
                      {hasData ? spot.name : tk('trace.empty.noGarden')}
                    </Text>
                    <Icon name="chevron-right" size={12} color={LIME_CARD.textSoft} />
                  </View>

                  <View style={styles.gardenStats}>
                    <GardenStat value={farms.length} label={tk('trace.label.gardens')} />
                    <GardenStat value={trees.length} label={tk('trace.label.trees')} />
                    <GardenStat value={fruits.length} label={tk('trace.label.fruits')} />
                  </View>
                </Pressable>

                {/*
                  NÚT TRONG THẺ — viền mảnh, nền trong suốt.

                  Nút đặc màu xanh của trang (`TONE.primary`) đặt lên nền lá mạ là
                  xanh-trên-xanh: hai mảng cùng họ màu chồng nhau thì mép nút biến
                  mất, và cái duy nhất còn phân biệt được là bóng đổ — thứ bảng màu
                  này đã bỏ. Nút VIỀN thì đường ranh do chính viền vẽ ra, không phụ
                  thuộc vào việc hai màu có khác nhau đủ hay không.

                  Không tô nền trắng: trắng đặc trên nền màu là mảng SÁNG NHẤT thẻ,
                  nó sẽ kéo mắt về trước cả ba con số — mà ba con số mới là lý do
                  thẻ này tồn tại. Nền chỉ là một lớp tối rất mỏng (LIME_CARD.wash),
                  đủ để hoạ tiết lá chạy phía sau không làm chữ trắng lúc đậm lúc
                  nhạt theo từng chữ cái.
                */}
                <Pressable
                  style={({ pressed }) => [styles.gardenAction, pressed && styles.gardenActionOn]}
                  onPress={() => (hasData
                    ? navigation.navigate('FarmDetail', { farm_id: farms[0].id })
                    : navigation.navigate('FarmList'))}
                  accessibilityRole="button"
                >
                  <Icon name={ICON.add} size={15} color={LIME_CARD.text} />
                  <Text style={styles.gardenActionTxt}>
                    {tk(hasData ? 'trace.button.addTree' : 'trace.button.createFirstGarden')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <FarmsMapCard
              farms={farms}
              onOpenFarm={(farmId) => navigation.navigate('FarmDetail', { farm_id: farmId })}
            />
          )}

          <View style={styles.pagePad}>
            <Pressable
              style={({ pressed }) => [styles.askBar, pressed && styles.pressed]}
              onPress={() => openAssistant()}
              accessibilityRole="button"
              accessibilityLabel={tk('trace.ask.placeholder')}
            >
              <Icon name="wand-magic-sparkles" size={18} color={TONE.primaryDeep} />
              <Text style={styles.askTxt} numberOfLines={1}>{tk('trace.ask.placeholder')}</Text>
              <View style={styles.askSend}>
                <Icon name="arrow-right" size={15} color={NATURE.paper} />
              </View>
            </Pressable>
          </View>

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
            /* Ô TỐI giữa trang sáng — lối Bento: khối này khác loại với các khối
                           quanh nó (thứ để ĐỌC, không phải thứ bấm vào để làm việc), nên nói
                           điều đó bằng nền, chứ không bằng viền dày hay tiêu đề to hơn. */
            <View style={[styles.wxCard, { backgroundColor: wx.bg, borderColor: wx.border }]}>
              <View style={styles.wxToday}>
                <View style={styles.wxTodayLeft}>
                  <View style={styles.wxPlace}>
                    <Icon name={ICON.place} size={12} color={wx.textSoft} />
                    <Text style={[styles.wxPlaceTxt, { color: wx.textSoft }]} numberOfLines={1}>{spot.name}</Text>
                  </View>
                  <Text style={[styles.wxTemp, { color: wx.text }]}>{weather.now.tempC}°</Text>
                  <Text style={[styles.wxLabel, { color: wx.textSoft }]}>{tk(look.labelKey)}</Text>
                </View>
                {/* Icon thời tiết KHÔNG truyền `color`: bộ này có màu riêng, ép
                    một màu vào là mất hết chỗ phân biệt nắng với mưa. */}
                <Icon name={look.wxIcon as IconName} size={88} />
              </View>

              <View style={[styles.wxFacts, { borderTopColor: wx.border }]}>
                <WxFact tone={wx} icon="wx-humidity" value={`${weather.now.humidity}%`} label={tk('trace.weather.humidity')} />
                <WxFact tone={wx} icon="wx-wind" value={`${weather.now.windKph} km/h`} label={tk('trace.weather.wind')} />
                <WxFact tone={wx} icon="wx-rainchance" value={`${weather.days[0]?.rainChance ?? 0}%`} label={tk('trace.weather.rainChance')} />
              </View>

              {adviceKey ? (
                <View style={[styles.advice, { backgroundColor: wx.bgSoft }]}>
                  <Icon name="seedling" size={15} color={wx.text} />
                  <Text style={[styles.adviceTxt, { color: wx.text }]}>{tk(adviceKey)}</Text>
                </View>
              ) : null}

              {/* NĂM ngày, không phải bảy: quá năm ngày thì khả năng mưa gần như
                  chỉ còn là phỏng đoán, mà nhà vườn lại hoãn cả buổi phun thuốc
                  theo chính con số đó. Bày ít mà đúng, hơn bày nhiều. */}
              <View style={[styles.wxWeek, { borderTopColor: wx.border }]}>
                {weather.days.slice(0, FORECAST_DAYS).map(d => {
                  const dl = describeWeather(d.code);
                  const isToday = d.date === todayIso;
                  return (
                    <View
                      key={d.date}
                      style={[styles.wxDay, isToday && { backgroundColor: wx.bgSoft }]}
                    >
                      <Text
                        style={[styles.wxDayName, { color: isToday ? wx.text : wx.textSoft }]}
                        numberOfLines={1}
                      >
                        {weekdayVi(d.date, todayIso, tk('trace.weather.today'))}
                      </Text>
                      <Icon name={dl.wxIcon as IconName} size={30} />
                      <Text style={[styles.wxDayMax, { color: wx.text }]}>{d.maxC}°</Text>
                      <Text style={[styles.wxDayMin, { color: wx.textSoft }]}>{d.minC}°</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ══ MỤC 3 — BIẾN ĐỘNG GIÁ ═════════════════════════════════════ */}
          <View style={styles.sectionGap} />
          <SectionHeader
            icon="chart-line"
            title={tk('trace.price.title')}
            hint={tk('trace.price.hint')}
          />
          {priceLoading && prices.length === 0 ? (
            <View style={styles.priceCard}>
              <View style={styles.inlineLoad}>
                <ActivityIndicator color={TONE.primary} />
                <Text style={TYPE.caption}>{tk('trace.price.loading')}</Text>
              </View>
            </View>
          ) : prices.length === 0 ? (
            <View style={styles.priceCard}>
              <Text style={[TYPE.caption, styles.priceNote]}>{tk('trace.price.none')}</Text>
            </View>
          ) : (
            /* Hai cụm RIÊNG: giá trong nước và giá thế giới khác đơn vị, khác
               sàn, khác đồng tiền — trộn một danh sách là mời người đọc so hai
               con số không so được với nhau. */
            <>
              <PriceGroup
                title={tk('trace.price.domestic')}
                rows={prices.filter(m => m.price.scope === 'domestic')}
                emptyText={tk('trace.price.noneDomestic')}
                tk={tk}
              />
              <View style={styles.priceGap} />
              <PriceGroup
                title={tk('trace.price.global')}
                rows={prices.filter(m => m.price.scope === 'global')}
                emptyText={tk('trace.price.noneGlobal')}
                tk={tk}
              />
            </>
          )}

          {/* ══ MỤC 4 — TIN NHÀ NÔNG ══════════════════════════════════════ */}
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
              {hot.map(item => <NewsCard key={item.id} item={item} />)}
              {/* Trang Tổng quan chỉ bày TIN NÓNG. Đổ cả danh sách vào đây là
                  biến trang chủ thành trang báo — người mở app buổi sáng để xem
                  vườn, không để đọc hai chục tin. Muốn đọc hết thì có cửa riêng. */}
              <Pressable
                style={({ pressed }) => [styles.newsAll, pressed && styles.newsAllOn]}
                onPress={() => (navigation.navigate as any)('TraceNews')}
              >
                <Text style={styles.newsAllTxt}>{tk('trace.news.seeAll')}</Text>
                <Icon name="arrow-right" size={15} color={TONE.primaryDeep} />
              </Pressable>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </Ground>
  );
};

// ── Mảnh nhỏ ────────────────────────────────────────────────────────────────

/**
 * Một thẻ của mục Vườn ("Vườn của tôi" · "Bản đồ").
 *
 * Thẻ đang mở được tô nền chứ không chỉ gạch chân: gạch chân mảnh 2 px là thứ
 * người trên 40 tuổi cầm máy giữa nắng nhìn không ra, và cả hai thẻ trông giống
 * hệt nhau thì không ai biết mình đang ở đâu.
 */
const GardenTab: React.FC<{
  icon: IconName; label: string; active: boolean; onPress: () => void;
}> = ({ icon, label, active, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.tab, active && styles.tabOn, pressed && styles.pressed]}
    accessibilityRole="tab"
    accessibilityState={{ selected: active }}
    accessibilityLabel={label}
  >
    <Icon name={icon} size={14} color={active ? NATURE.paper : NATURE.barkSoft} />
    <Text style={[styles.tabTxt, active && styles.tabTxtOn]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

/**
 * Một con số trong thẻ vườn.
 *
 * Không icon cạnh nhãn: trên nền màu đặc, một icon nhỏ mờ đi thành vệt bẩn, còn
 * đủ đậm thì nó tranh chỗ với chính con số. "Vườn" · "Cây" · "Quả" là ba chữ ai
 * cũng đọc được — thêm hình vào là thêm thứ để nhìn chứ không thêm nghĩa.
 */
const GardenStat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <View style={styles.gardenStat}>
    <Text style={styles.gardenStatVal}>{value}</Text>
    <Text style={styles.gardenStatLbl} numberOfLines={1}>{label}</Text>
  </View>
);

/** `1723...` → `13/08/2026`. Mốc 0 (nguồn không ghi ngày) → chuỗi rỗng. */
function shortDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Câu nói rõ con số biến động đang so với cái gì. */
function basisNote(
  row: PriceMove & { agoH: number },
  tk: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (row.percent == null) return tk('trace.price.firstRead');
  const c = row.price.cadence;
  if (c === 'daily') return tk('trace.price.vsPrevDay');
  if (c === 'monthly') return tk('trace.price.vsPrevMonth');
  return row.agoH > 0 ? tk('trace.price.vsHours', { n: row.agoH }) : tk('trace.price.firstRead');
}

/** Một cụm giá (trong nước / thế giới). Cụm rỗng vẫn hiện, kèm lời giải thích. */
const PriceGroup: React.FC<{
  title: string;
  rows: Array<PriceMove & { agoH: number }>;
  emptyText: string;
  tk: (k: string, v?: Record<string, string | number>) => string;
}> = ({ title, rows, emptyText, tk }) => (
  <View style={styles.priceCard}>
    <Text style={styles.priceGroupHead}>{title}</Text>
    {rows.length === 0 ? (
      <Text style={styles.priceNote}>{emptyText}</Text>
    ) : (
      <>
        {rows.map(m => (
          <PriceRow
            key={m.price.key}
            move={m}
            label={tk(m.price.nameKey)}
            unit={tk(m.price.unitKey)}
          />
        ))}
        {/* Nói rõ mốc so sánh. "Tăng 6%" mà không nói so với cái gì thì người
            đọc tự hiểu là so với hôm qua — mà không phải. */}
        {/* Mốc so sánh nói theo NHỊP của chính nguồn. Nguồn theo ngày không
            được nói "so với 1 giờ trước"; nguồn theo tháng không được nói
            "hôm qua". Nói sai mốc là làm hỏng ý nghĩa của con số. */}
        <Text style={styles.priceNote}>{basisNote(rows[0], tk)}</Text>
      </>
    )}
  </View>
);

/** Một dòng giá: tên · giá · mức biến động. */
const PriceRow: React.FC<{ move: PriceMove; label: string; unit: string }> = ({
  move, label, unit,
}) => {
  const up = move.direction === 'up';
  const tone = move.percent == null ? NATURE.barkSoft : up ? TONE.primary : TONE.danger;
  return (
    <View style={styles.priceRow}>
      <View style={styles.priceLeft}>
        <Text style={styles.priceName} numberOfLines={1}>{label}</Text>
        {/* Ghi rõ SỐ LIỆU CỦA NGÀY NÀO. Nguồn thế giới chậm hơn một năm; để
            trống chỗ này là mời người đọc tưởng đó là giá hôm nay. */}
        <Text style={styles.priceSrc} numberOfLines={1}>
          {move.price.source}{move.price.atMs ? ` · ${shortDate(move.price.atMs)}` : ''}
        </Text>
      </View>
      <View style={styles.priceRight}>
        <Text style={styles.priceVal}>
          {formatPriceValue(move.price.priceVnd, move.price.decimals)}<Text style={styles.priceUnit}> {unit}</Text>
        </Text>
        {/* `percent` là null nghĩa là CHƯA CÓ GÌ ĐỂ SO, không phải "không đổi" —
            nên hiện dấu gạch chứ không hiện mũi tên ngang kèm 0%. */}
        {move.percent == null ? (
          <Text style={styles.priceFlat}>—</Text>
        ) : (
          <View style={styles.priceDelta}>
            <Icon name={up ? 'arrow-right' : 'arrow-right'} size={11} color={tone}
              style={{ transform: [{ rotate: up ? '-45deg' : '45deg' }] }} />
            <Text style={[styles.pricePct, { color: tone }]}>
              {Math.abs(move.percent).toFixed(1)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

/** Ba con số trong thẻ THỜI TIẾT — nền tối nên phải có bảng màu riêng. */
const WxFact: React.FC<{
  icon: string; value: string; label: string;
  tone: { text: string; textSoft: string };
}> = ({ icon, value, label, tone }) => (
  <View style={styles.wxFact}>
    <Icon name={icon as IconName} size={26} />
    <View>
      <Text style={[styles.wxFactVal, { color: tone.text }]}>{value}</Text>
      <Text style={[styles.wxFactLbl, { color: tone.textSoft }]}>{label}</Text>
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
  metricLabel: { ...TYPE.caption, fontWeight: '600' },

  // Mục 2
  retryBtn: {
    alignSelf: 'flex-start', marginTop: SPACE.md,
    paddingHorizontal: SPACE.lg, minHeight: 46, justifyContent: 'center',
    borderRadius: RADIUS.field, backgroundColor: TONE.primarySoft,
  },
  retryTxt: { fontSize: 16, fontWeight: '700', color: TONE.primaryDeep },

  // ── Lưới Bento của mục Vườn
  pagePad: { paddingHorizontal: SPACE.page },

  // Hai thẻ của mục Vườn
  tabBar: {
    flexDirection: 'row', gap: SPACE.sm,
    paddingHorizontal: SPACE.page, marginBottom: SPACE.md,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 40, borderRadius: RADIUS.chip,
    backgroundColor: SURFACE.raised,
    borderWidth: 1, borderColor: TONE.border,
  },
  tabOn: { backgroundColor: TONE.primary, borderColor: TONE.primaryDeep },
  tabTxt: { fontSize: 14.5, fontWeight: '700', color: NATURE.barkSoft },
  tabTxtOn: { color: NATURE.paper },

  // Thẻ vườn — mảng màu DUY NHẤT của trang
  gardenCard: {
    marginHorizontal: SPACE.page,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.md,
    backgroundColor: LIME_CARD.bg,
    borderWidth: 1,
    borderColor: LIME_CARD.border,
    // `overflow: hidden` là thứ cắt hoạ tiết lá ở mép thẻ — bỏ nó thì lá tràn ra
    // ngoài và đè lên phần bên dưới.
    overflow: 'hidden',
    ...ORGANIC_CARD,
  },
  gardenLeaves: { ...StyleSheet.absoluteFillObject },
  leafA: { position: 'absolute', right: -34, bottom: -40 },
  leafB: { position: 'absolute', right: 34, bottom: -30 },
  leafC: { position: 'absolute', right: -8, bottom: 24 },

  /** Vùng chạm thứ nhất: nhãn + ba con số → mở danh sách vườn. */
  gardenTop: { paddingBottom: SPACE.md },
  gardenHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gardenHeadTxt: {
    flex: 1, fontSize: 13, fontWeight: '600', color: LIME_CARD.textSoft,
  },
  gardenStats: { flexDirection: 'row', marginTop: SPACE.md },
  gardenStat: { flex: 1 },
  gardenStatVal: {
    fontSize: 30, lineHeight: 34, fontWeight: '800',
    letterSpacing: -1, color: LIME_CARD.text,
  },
  gardenStatLbl: { fontSize: 13, color: LIME_CARD.textSoft, marginTop: 1 },

  /**
   * Vùng chạm thứ hai: nút thêm cây.
   *
   * Cao 46 chứ không 56 như `TOUCH_MIN` của trang: đây là hành động PHỤ nằm trong
   * một thẻ, không phải nút chính giữa màn trống. 46 vẫn trên ngưỡng 44 mà cả
   * Android lẫn iOS đặt cho vùng chạm nhỏ nhất — vẫn bấm được bằng ngón tay đeo
   * găng, mà không biến nửa dưới thẻ thành một cái nút.
   */
  gardenAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 46,
    borderRadius: RADIUS.chip,
    borderWidth: 1, borderColor: LIME_CARD.border,
    backgroundColor: LIME_CARD.wash,
  },
  gardenActionOn: { backgroundColor: LIME_CARD.washOn },
  gardenActionTxt: { fontSize: 15.5, fontWeight: '700', color: LIME_CARD.text },

  // ── Mục giá
  priceCard: {
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD,
    borderWidth: 1, borderColor: TONE.border,
    paddingHorizontal: SPACE.lg,
  },
  priceGap: { height: SPACE.sm },
  priceGroupHead: {
    fontSize: 13, fontWeight: '700', color: NATURE.barkSoft,
    paddingTop: SPACE.md,
  },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingVertical: SPACE.md,
  },
  priceLeft: { flex: 1, minWidth: 0 },
  priceName: { fontSize: 16, fontWeight: '600', color: NATURE.bark },
  priceSrc: { fontSize: 12, color: NATURE.barkSoft },
  priceRight: { alignItems: 'flex-end', gap: 2 },
  priceVal: { fontSize: 18, fontWeight: '700', color: NATURE.bark },
  priceUnit: { fontSize: 12.5, fontWeight: '500', color: NATURE.barkSoft },
  priceDelta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pricePct: { fontSize: 13.5, fontWeight: '700' },
  priceFlat: { fontSize: 13.5, color: NATURE.barkSoft },
  priceNote: {
    ...TYPE.caption, fontSize: 12.5,
    paddingBottom: SPACE.md, paddingTop: 2,
  },

  // ── Thanh hỏi trợ lý
  askTintRight: {
    position: 'absolute', top: 0, bottom: 0, right: 0, left: '45%',
    backgroundColor: AI_TINT, opacity: 0.75,
    borderTopRightRadius: RADIUS.card, borderBottomRightRadius: RADIUS.card,
  },
  askBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    minHeight: 56, paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.card, overflow: 'hidden',
    marginTop: SPACE.sm,
    backgroundColor: NATURE.paper
  },
  askTxt: { flex: 1, fontSize: 15.5, color: NATURE.barkSoft },
  askSend: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: TONE.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  wxToday: { flexDirection: 'row', alignItems: 'center' },
  wxTodayLeft: { flex: 1, minWidth: 0 },
  wxPlace: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  // Thẻ này nền TỐI — mọi chữ trong nó phải lấy từ `DARK_CARD`, không lấy từ
  // bảng màu chữ của trang. Đổi nền mà quên đổi chữ là lỗi đã xảy ra thật.
  wxPlaceTxt: { fontSize: 13.5, flexShrink: 1, fontWeight: '600', color: DARK_CARD.textSoft },
  wxTemp: { fontSize: 56, lineHeight: 62, fontWeight: '700', letterSpacing: -2, color: DARK_CARD.text },
  wxLabel: { fontSize: 16, fontWeight: '600', marginTop: -2, color: DARK_CARD.textSoft },

  wxFacts: {
    flexDirection: 'row', gap: SPACE.md,
    paddingTop: SPACE.md,
    borderTopWidth: 1, borderTopColor: DARK_CARD.border,
  },
  factValue: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  factLabel: { ...TYPE.caption, fontSize: 13 },

  advice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm,
    padding: SPACE.md, ...ORGANIC_TILE, backgroundColor: DARK_CARD.bgSoft,
  },
  adviceTxt: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600', color: DARK_CARD.text },

  // ── Thẻ thời tiết: ô tối trong lưới Bento
  wxCard: {
    // Màu nền/viền do `wxPalette` quyết định theo GIỜ — xem chỗ dựng thẻ.
    // Ban ngày thẻ gần trắng nên phải có viền, ban đêm viền tự chìm đi.
    ...ORGANIC_CARD,
    borderWidth: 1,
    padding: SPACE.lg,
    gap: SPACE.lg,
  },
  wxFact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  wxFactVal: { fontSize: 15, fontWeight: '700', color: DARK_CARD.text },
  wxFactLbl: { fontSize: 12, color: DARK_CARD.textSoft },

  // ── Mục tin
  newsAll: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 48, borderRadius: RADIUS.field,
    borderWidth: 1, borderColor: TONE.border,
    backgroundColor: SURFACE.raised,
    marginBottom: 70
  },
  newsAllOn: { backgroundColor: TONE.primarySoft },
  newsAllTxt: { fontSize: 15.5, fontWeight: '600', color: TONE.primaryDeep },

  wxWeek: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: SPACE.md,
    borderTopWidth: 1, borderTopColor: DARK_CARD.border,
  },
  wxDay: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: SPACE.sm, borderRadius: RADIUS.field },
  wxDayToday: { backgroundColor: DARK_CARD.bgSoft },
  wxDayName: { fontSize: 12.5, fontWeight: '600', color: DARK_CARD.textSoft },
  wxDayNameToday: { color: DARK_CARD.text, fontWeight: '700' },
  wxDayMax: { fontSize: 15, fontWeight: '700', color: DARK_CARD.text },
  wxDayMin: { fontSize: 12.5, color: DARK_CARD.textSoft },

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

});

export default DashboardScreen;
