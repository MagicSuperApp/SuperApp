/**
 * WayfindScreen — DẪN ĐƯỜNG tới vườn / tới đúng gốc cây.
 *
 * Hai chặng, hai cách chỉ — vì không có một cách nào chỉ được cả hai:
 *
 *   CHẶNG XA (nhà → cổng vườn): giao cho Google/Apple Maps qua `Linking`. Họ có
 *     đường sá, ta không làm lại.
 *   CHẶNG GẦN (cổng → gốc cây): KHÔNG bản đồ nào chỉ được — trong vườn không có
 *     đường, cây cách nhau vài mét. Chặng này màn tự chỉ bằng kim la bàn.
 *
 * ── Cái gì KHOÁ, cái gì KHÔNG ───────────────────────────────────────────────
 * ĐÍCH khoá: toạ độ vườn/cây chốt một lần từ tham số màn, không bao giờ tính lại.
 * Kim có đúng MỘT nhiệm vụ — luôn chỉ về cái đích đó.
 *
 * CHỖ ĐANG ĐỨNG thì KHÔNG khoá, vì góc từ chỗ đứng tới đích đổi theo từng bước
 * chân. Đóng băng chỗ đứng là kim chỉ theo một góc CŨ: đi chệch mười mét là nó
 * chỉ trượt qua đích, mà nhìn màn thì không có gì báo.
 *
 * Thứ gây giật không phải việc tính lại, mà là NHIỄU: GPS lắc vài mét mỗi giây,
 * ở cự ly 20 m thì vài mét đó xoay góc phương-vị hàng chục độ. Nên chỗ đứng đi
 * qua bộ lọc (`smoothPosition`) rồi mới tính góc — kim luôn chỉ đúng đích mà
 * thôi rung.
 *
 * ── Kim quay có QUÁN TÍNH ───────────────────────────────────────────────────
 * Kim la bàn thật có khối lượng: nó vượt qua đích một chút rồi lắc về. Đó là thứ
 * làm mắt tin vào nó. `Animated.spring` với ma sát thấp cho đúng dáng ấy. Hai
 * chỗ dễ sai đều đã tách ra `needle.ts` và có bài kiểm: kim phải đi VÒNG NGẮN
 * (350° → 10° là +20, không phải −340), và số la bàn phải LỌC trước khi dùng.
 *
 * ── Nguồn hướng ─────────────────────────────────────────────────────────────
 * `useHeading` tự dò: có mô-đun la bàn thì dùng la bàn (đúng cả khi đứng yên),
 * chưa cài thì lùi về hướng-đi của GPS (chỉ đúng khi đang đi). Màn NÓI RÕ đang
 * dùng nguồn nào — chỉ sai hướng giữa vườn tệ hơn nhiều so với nói "chưa biết".
 *
 * ── Ba chế độ, đổi theo việc người dùng đang làm ───────────────────────────
 *   ĐANG ĐI    kim to giữa mặt kính, chỉ về vườn.
 *   TỚI NƠI    kim hết việc (ở khoảng cách 0, góc phương-vị chỉ còn là nhiễu) →
 *              đổi sang MẶT PHẲNG TÌM CÂY phủ toàn màn, bán kính 20 m.
 *   TÌM MỘT CÂY  chạm một cây trong mặt phẳng đó → kim NHỎ ở góc trên bên phải
 *              chỉ vào đúng cây ấy, mặt phẳng vẫn nằm dưới để còn thấy các cây
 *              khác. Kim nhỏ và kim to là CÙNG một component.
 *
 * Route params: { lat, lon, label?, kind?: 'farm' | 'tree', treeId?, farmId? }
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, PermissionsAndroid,
  Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { buzz } from '../utils/haptics';
import { useTk } from '../i18n/keys';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { getTrees, type TreeInfo } from '../services/treeReIDService';
import {
  arrivalStateOf, compassPointVi, directionsUrl, formatDistanceVi,
  geoUri, haversineMeters, initialBearingDeg, isCourseUsable, isValidLatLon,
  nearestFixes, walkMinutes,
  type LatLon,
} from '../features/wayfind/wayfind';
import { smoothPosition } from '../features/wayfind/needle';
import CompassNeedle from '../features/wayfind/CompassNeedle';
import TreeRadar, { type RadarTree } from '../features/wayfind/TreeRadar';
import { forTree, useOpenWayfind } from '../features/wayfind/WayfindButton';
import { loadTreePositions } from '../features/space3d/positionStore';
import { farmOrigin, treeGeoPoint } from '../features/space3d/treeGeo';
import { courseFallback, useHeading } from '../features/wayfind/useHeading';
import { GroundBackdrop } from '../modules/trace/components/layered/Organic';
import {
  ELEVATION, GLASS, NATURE, ORGANIC_CARD, ORGANIC_TILE, SPACE, SURFACE, TONE, TYPE,
} from '../modules/trace/theme/depth';

interface RouteParams {
  lat?: number;
  lon?: number;
  label?: string;
  kind?: 'farm' | 'tree';
  treeId?: string;
  farmId?: string;
}

/** Chỗ đang đứng, ĐÃ LỌC nhiễu. Vẫn theo người — chỉ thôi rung. */
interface Fix {
  pos: LatLon;
  accuracyM: number | null;
}

/** Nhảy xa hơn ngần này thì nhận thẳng, không bò theo trung bình trượt. */
const SNAP_M = 25;

/** Sai số trên mức này thì phải nói cho người dùng biết, đừng để họ tưởng máy chắc. */
const POOR_ACCURACY_M = 25;

/** Bao nhiêu cây gần đó thì liệt kê ở cuối màn. */
const NEARBY_LIMIT = 8;

/** Cỡ mặt la bàn. Đủ to để đọc được khi cầm máy một tay giữa nắng. */
const DIAL = 264;

/** Kim tìm CÂY chiếm một phần ba chiều rộng màn — đủ đọc mà không che mặt phẳng. */
const TREE_NEEDLE_RATIO = 1 / 3;

/** Rung khi tới nơi: ba nhịp ngắn — khác hẳn nhịp thông báo của hệ điều hành. */
const ARRIVE_BUZZ = [0, 90, 80, 90, 80, 160];

async function requestLocationPermission(
  strings: { title: string; body: string; allow: string; deny: string; later: string },
): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: strings.title,
          message: strings.body,
          buttonNeutral: strings.later,
          buttonNegative: strings.deny,
          buttonPositive: strings.allow,
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
  try {
    const status = await Geolocation.requestAuthorization('whenInUse');
    return status === 'granted';
  } catch {
    return false;
  }
}

const WayfindScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const tk = useTk();

  /**
   * Ranh giới vườn lấy từ KHO trong máy, không truyền qua tham số màn: đa-giác
   * có thể vài chục đỉnh, và nhét nó vào tham số điều hướng là mang theo một
   * bản sao có thể đã cũ. Kho chưa nạp vườn (mở từ liên kết ngoài) → không có
   * ranh giới, mặt phẳng vẫn chạy bình thường, chỉ thiếu mảng nền.
   */
  const farmBoundary = useSelector((s: any) => {
    const id = (route.params as RouteParams | undefined)?.farmId;
    if (!id) return undefined;
    return s?.farm?.farms?.find((f: any) => f.id === id)?.coordinates;
  });
  const openWayfind = useOpenWayfind();
  const params = (route.params ?? {}) as RouteParams;

  const target: LatLon | null = useMemo(() => {
    const p = { lat: Number(params.lat), lon: Number(params.lon) };
    return isValidLatLon(p) ? p : null;
  }, [params.lat, params.lon]);

  const kind = params.kind ?? 'tree';
  const label = params.label
    || tk(kind === 'farm' ? 'map.target.farmCap' : 'map.target.treeCap');

  // Khai TRƯỚC mọi `useMemo` đọc nó: callback của useMemo chạy ngay trong lượt
  // vẽ, nên khai sau là lỗi vùng-chết (hàm chưa tồn tại lúc bị gọi).
  const treeLabel = (t: TreeInfo) =>
    t.name || tk('map.nearby.unnamed', { code: t.tree_id.slice(0, 6) });

  /** Cây đang được chỉ tới. `null` = đang xem cả vườn. */
  const [pickedTree, setPickedTree] = useState<RadarTree | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [nearbyTrees, setNearbyTrees] = useState<TreeInfo[]>([]);
  const watchId = useRef<number | null>(null);
  /** Vị trí đã lọc của lần đọc trước — đầu vào cho lần lọc kế tiếp. */
  const smoothedPos = useRef<LatLon | null>(null);

  // ── Hướng máy đang chĩa ────────────────────────────────────────────────────
  const compass = useHeading(true);
  // Nguồn LÙI khi máy chưa có la bàn: hướng-đi của GPS, đã lọc cùng một bộ lọc.
  const [courseDeg, setCourseDeg] = useState<number | null>(null);
  const courseSmoothed = useRef<number | null>(null);

  const headingDeg = compass.hasCompass ? compass.headingDeg : courseDeg;
  const headingSource = compass.hasCompass
    ? (compass.headingDeg !== null ? 'compass' : null)
    : (courseDeg !== null ? 'course' : null);

  // ── Theo dõi GPS liên tục — kim phải luôn chỉ đúng đích khi người đi ──────
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await requestLocationPermission({
        title: tk('map.perm.title'), body: tk('map.perm.body'),
        allow: tk('map.perm.allow'), deny: tk('map.perm.deny'), later: tk('map.perm.later'),
      });
      if (!alive) return;
      if (!ok) { setDenied(true); return; }

      watchId.current = Geolocation.watchPosition(
        (pos) => {
          if (!alive) return;
          setGpsError(null);
          const { latitude, longitude, accuracy, heading, speed } = pos.coords;
          const here: LatLon = { lat: latitude, lon: longitude };
          const accuracyM =
            typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null;

          // Hướng-đi chỉ nhận khi thật sự đang đi (isCourseUsable đọc cả speed).
          if (isCourseUsable(heading, speed)) {
            courseSmoothed.current = courseFallback(courseSmoothed.current, heading);
            setCourseDeg(courseSmoothed.current);
          }

          // Lọc chỗ đứng rồi mới dùng: GPS lắc vài mét mỗi giây, mà ở cự ly gần
          // vài mét đó xoay góc hàng chục độ. Nhảy xa (đi thật / GPS vừa bắt lại)
          // thì nhận thẳng, không bò theo — xem `smoothPosition`.
          const prev = smoothedPos.current;
          const movedM = prev ? haversineMeters(prev, here) : Number.POSITIVE_INFINITY;
          const next = smoothPosition(prev, here, { distanceM: movedM, snapM: SNAP_M });
          smoothedPos.current = next;
          setFix({ pos: next, accuracyM });
        },
        () => {
          if (!alive) return;
          setGpsError(tk('map.warn.noFix'));
        },
        { enableHighAccuracy: true, distanceFilter: 2, interval: 2000, fastestInterval: 1000 },
      );
    })();

    return () => {
      alive = false;
      if (watchId.current !== null) {
        Geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Vị trí NGƯỜI DÙNG TỰ ĐẶT trong sơ đồ 3D, theo mã cây. Đọc một lần mỗi khi
   * danh sách cây đổi — đây là bộ nhớ trong máy, không phải mạng.
   */
  const [placedPos, setPlacedPos] = useState<Record<string, { x: number; z: number }>>({});
  const treeIdsKey = nearbyTrees.map(t => t.tree_id).join(',');
  useEffect(() => {
    let alive = true;
    const ids = treeIdsKey ? treeIdsKey.split(',') : [];
    if (ids.length === 0) { setPlacedPos({}); return; }
    loadTreePositions(ids).then(m => { if (alive) setPlacedPos(m); }).catch(() => { });
    return () => { alive = false; };
  }, [treeIdsKey]);

  /** Gốc hệ toạ độ vườn — cùng công thức với sơ đồ 3D (xem `treeGeo.ts`). */
  const origin = useMemo(() => farmOrigin(farmBoundary), [farmBoundary]);

  // ── Cây quanh đây (nhảy sang cây khác mà không phải quay ra danh sách) ─────
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getTrees(ORILIFE_BASE, params.farmId);
      if (alive && res.ok && res.trees) setNearbyTrees(res.trees);
    })();
    return () => { alive = false; };
  }, [params.farmId]);

  // ── Số liệu dẫn đường — tính lại mỗi lần chỗ đứng đổi, đích thì đứng yên ──
  const nav = useMemo(() => {
    if (!target || !fix) return null;
    const distanceM = haversineMeters(fix.pos, target);
    return {
      distanceM,
      bearingDeg: initialBearingDeg(fix.pos, target),
      state: arrivalStateOf(distanceM, fix.accuracyM),
    };
  }, [target, fix]);

  /**
   * Cây có toạ độ, đưa về dạng mặt phẳng cần.
   *
   * Chỗ NGƯỜI DÙNG TỰ ĐẶT trong sơ đồ 3D thắng GPS máy chủ — xem `treeGeo.ts`.
   * Không có toạ độ nào dùng được thì bỏ qua cây đó, chứ không vẽ nó ở 0,0.
   */
  const radarTrees: RadarTree[] = useMemo(() => {
    const out: RadarTree[] = [];
    for (const t of nearbyTrees) {
      const p = treeGeoPoint({
        serverGps: t.gps,
        localPos: placedPos[t.tree_id],
        origin,
      });
      if (!p) continue;
      out.push({ id: t.tree_id, name: treeLabel(t), pos: p });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyTrees, placedPos, origin, tk]);

  /** Số liệu tới CÂY đang chọn — cùng phép tính với vườn, chỉ khác đích. */
  const treeNav = useMemo(() => {
    if (!pickedTree || !fix) return null;
    const distanceM = haversineMeters(fix.pos, pickedTree.pos);
    return {
      distanceM,
      bearingDeg: initialBearingDeg(fix.pos, pickedTree.pos),
      state: arrivalStateOf(distanceM, fix.accuracyM),
    };
  }, [pickedTree, fix]);

  const nearby = useMemo(() => {
    if (!fix) return [];
    return nearestFixes(
      fix.pos,
      nearbyTrees.filter(t => t.tree_id !== params.treeId),
      // Cùng luật với mặt phẳng: đặt tay thắng GPS. Hai chỗ trên CÙNG một màn mà
      // đọc vị trí khác nhau cho cùng một cây là lỗi không ai đọc ra được.
      t => treeGeoPoint({ serverGps: t.gps, localPos: placedPos[t.tree_id], origin }),
      { limit: NEARBY_LIMIT },
    );
  }, [fix, nearbyTrees, params.treeId, placedPos, origin]);

  // ── Rung khi tới nơi, đúng MỘT lần cho mỗi lần tới ────────────────────────
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (nav?.state === 'arrived') {
      if (!buzzedRef.current) {
        buzzedRef.current = true;
        // Qua `buzz`: máy thiếu quyền rung / không có mô-tơ thì im lặng bỏ qua.
        // Sập màn đúng lúc "đã tới nơi" là lỗi tệ nhất có thể có ở màn này.
        buzz(ARRIVE_BUZZ);
      }
    } else {
      // Rời khỏi đích (đi tiếp sang cây khác) → cho phép rung lại lần sau.
      buzzedRef.current = false;
    }
  }, [nav?.state]);

  // ── Giao cho bản đồ ngoài (chặng xa) ──────────────────────────────────────
  const openExternalMaps = useCallback(async () => {
    if (!target) return;
    try {
      await Linking.openURL(directionsUrl(target, { travelMode: 'driving' }));
      return;
    } catch {
      // Máy không mở được liên-kết web (không trình duyệt mặc-định / Android
      // chặn intent) → thử `geo:`, thứ mọi máy có bản đồ đều nhận.
    }
    try {
      await Linking.openURL(geoUri(target, label));
    } catch {
      Alert.alert(tk('map.openmap.failTitle'), tk('map.openmap.failBody'));
    }
  }, [target, label, tk]);

  // `push` chứ không `navigate`: đang ĐỨNG ở chính màn này, xem ghi chú trong
  // `useOpenWayfind`.
  const goTree = useCallback((t: TreeInfo) => {
    openWayfind(forTree(t, params.farmId), { push: true });
  }, [openWayfind, params.farmId]);

  // ── Đích không có toạ độ: nói thẳng, đừng vẽ kim rỗng ─────────────────────
  if (!target) {
    const targetWord = tk(kind === 'farm' ? 'map.target.farm' : 'map.target.tree');
    return (
      <View style={styles.root}>
        <GroundBackdrop variant="detail" />
        <Header title={tk('map.title', { name: label })} onBack={() => navigation.goBack()} top={insets.top} />
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Icon name="location-crosshairs" size={30} color={NATURE.barkSoft} />
          </View>
          <Text style={styles.emptyTitle}>{tk('map.warn.noCoord', { target: targetWord })}</Text>
          <Text style={styles.muted}>{tk('map.warn.noCoordFix', { target: targetWord })}</Text>
        </View>
      </View>
    );
  }

  /**
   * Đổi sang mặt phẳng tìm cây khi: đã tới nơi, đích là VƯỜN, và đã biết chỗ
   * đứng. Tới một CÂY thì không đổi — quanh cây đó không còn gì để bày.
   */
  const arrivedAtFarm = nav?.state === 'arrived' && kind === 'farm' && fix != null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GroundBackdrop variant="detail" />

      {/* ── CHẾ ĐỘ 2 & 3: đã tới vườn ──
          Kim vườn hết việc ở đây (khoảng cách 0 → góc phương-vị chỉ còn nhiễu).
          Thay bằng mặt phẳng tìm cây; chọn một cây thì thêm kim nhỏ góc trên. */}
      {arrivedAtFarm ? (
        <>
          <TreeRadar
            origin={fix!.pos}
            headingDeg={headingDeg}
            trees={radarTrees}
            boundary={farmBoundary}
            onPickTree={setPickedTree}
            insetTop={insets.top + 58}
            insetBottom={insets.bottom}
          />

          <View style={[styles.radarHead, { paddingTop: insets.top + SPACE.sm }]}>
            <Pressable
              onPress={() => (pickedTree ? setPickedTree(null) : navigation.goBack())}
              style={styles.backBtn}
              hitSlop={10}
            >
              <Icon name="arrow-left" size={21} color={NATURE.bark} />
            </Pressable>
            <View style={styles.radarHeadText}>
              <Text style={styles.radarTitle} numberOfLines={1}>
                {pickedTree
                  ? tk(treeNav?.state === 'arrived' ? 'map.tree.arrived' : 'map.tree.finding',
                    { name: pickedTree.name })
                  : tk('map.nav.arrived', { name: label })}
              </Text>
              <Text style={styles.radarSub} numberOfLines={1}>
                {pickedTree && treeNav
                  ? formatDistanceVi(treeNav.distanceM)
                  : tk(headingSource ? 'map.radar.hint' : 'map.radar.northUp')}
              </Text>
            </View>
          </View>

          {/* Kim tìm CÂY — góc trên bên phải, rộng 1/3 màn. Đặt ở đó để nó không
              che phần giữa, chỗ mặt phẳng đang bày các cây khác. */}
          {pickedTree && treeNav ? (
            <View
              style={[
                styles.treeNeedleBox,
                { top: insets.top + 74, width: screenW * TREE_NEEDLE_RATIO, height: screenW * TREE_NEEDLE_RATIO },
              ]}
              pointerEvents="box-none"
            >
              <CompassNeedle
                bearingDeg={treeNav.bearingDeg}
                headingDeg={headingDeg}
                size={screenW * TREE_NEEDLE_RATIO * 0.72}
                close={treeNav.state !== 'far'}
              />
            </View>
          ) : null}
        </>
      ) : (
        /* ── CHẾ ĐỘ 1: đang đi tới vườn ── */
        <>
          <Header title={tk('map.title', { name: label })} onBack={() => navigation.goBack()} top={insets.top} />

          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
            {denied ? <Notice icon="location-crosshairs" text={tk('map.warn.denied')} /> : null}
            {gpsError ? <Notice icon="satellite-dish" text={gpsError} /> : null}

            <View style={styles.dialWrap}>
              <GlassDial />
              {!fix && !denied && !gpsError ? (
                <View style={styles.dialCenter}>
                  <ActivityIndicator size="large" color={TONE.primary} />
                  <Text style={styles.muted}>{tk('map.nav.locating')}</Text>
                </View>
              ) : nav ? (
                <View style={styles.dialCenter}>
                  {headingSource === null ? (
                    <Text style={styles.northMark}>{tk('map.heading.northUp')}</Text>
                  ) : null}
                  <CompassNeedle
                    bearingDeg={nav.bearingDeg}
                    headingDeg={headingDeg}
                    size={150}
                    close={nav.state === 'near'}
                  />
                </View>
              ) : (
                <Text style={[styles.muted, styles.dialCenter]}>{tk('map.nav.unknownPos')}</Text>
              )}
            </View>

            {nav ? (
              <View style={styles.readout}>
                <Text style={styles.distance}>{formatDistanceVi(nav.distanceM)}</Text>
                <Text style={styles.hint}>
                  {tk('map.nav.headTowards', { dir: compassPointVi(nav.bearingDeg) })}
                </Text>
                {nav.distanceM >= 150 ? (
                  <Text style={styles.muted}>
                    {tk('map.nav.walkMinutes', { n: walkMinutes(nav.distanceM) })}
                  </Text>
                ) : null}

                {fix?.accuracyM != null && fix.accuracyM > POOR_ACCURACY_M ? (
                  <Text style={styles.warnSmall}>
                    {tk('map.warn.accuracy', { n: Math.round(fix.accuracyM) })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
              onPress={openExternalMaps}
            >
              <Icon name="map-location-dot" size={20} color={NATURE.paper} />
              <Text style={styles.ctaTxt}>{tk('map.openmap')}</Text>
            </Pressable>
            <Text style={styles.ctaNote}>{tk('map.openmap.note')}</Text>

            {nearby.length > 0 ? (
              <View style={styles.glassCard}>
                <Text style={styles.nearbyTitle}>{tk('map.nearby.title')}</Text>
                {nearby.map(f => (
                  <Pressable
                    key={f.item.tree_id}
                    style={({ pressed }) => [styles.nearbyRow, pressed && styles.pressed]}
                    onPress={() => goTree(f.item)}
                  >
                    <View style={styles.nearbyIcon}>
                      <Icon name="tree" size={15} color={TONE.primary} />
                    </View>
                    <Text style={styles.nearbyName} numberOfLines={1}>{treeLabel(f.item)}</Text>
                    <Text style={styles.nearbyDist}>{formatDistanceVi(f.distanceM)}</Text>
                    <Text style={styles.nearbyDir}>{compassPointVi(f.bearingDeg)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Mặt la bàn — kính mờ trên nền vườn
// ---------------------------------------------------------------------------

/**
 * Mặt kính: vòng tròn trong mờ + vệt sáng lệch tâm + vành khắc.
 *
 * Không dùng thư viện làm mờ nền (`BlurView` cần mô-đun native, app chưa cài).
 * Dáng "kính" ở đây dựng bằng ba lớp trong suốt chồng nhau — thứ trình duyệt và
 * RN đều làm được, và nhìn gần như không khác vì nền phía sau vốn đã mờ.
 */
const GlassDial: React.FC = () => (
  <Svg width={DIAL} height={DIAL} style={StyleSheet.absoluteFill} pointerEvents="none">
    <Defs>
      <RadialGradient id="glass" cx="34%" cy="26%" r="78%">
        <Stop offset="0" stopColor={GLASS.sheen} stopOpacity={0.92} />
        <Stop offset="0.55" stopColor={GLASS.sheen} stopOpacity={0.52} />
        <Stop offset="1" stopColor={NATURE.leafSoft} stopOpacity={0.44} />
      </RadialGradient>
      <RadialGradient id="sheen" cx="30%" cy="18%" r="42%">
        <Stop offset="0" stopColor={GLASS.sheen} stopOpacity={0.85} />
        <Stop offset="1" stopColor={GLASS.sheen} stopOpacity={0} />
      </RadialGradient>
    </Defs>

    <Circle cx={DIAL / 2} cy={DIAL / 2} r={DIAL / 2 - 2} fill="url(#glass)" />
    <Circle
      cx={DIAL / 2} cy={DIAL / 2} r={DIAL / 2 - 2}
      fill="none" stroke={GLASS.sheen} strokeOpacity={0.75} strokeWidth={1.5}
    />
    <Circle
      cx={DIAL / 2} cy={DIAL / 2} r={DIAL / 2 - 14}
      fill="none" stroke={NATURE.moss} strokeOpacity={0.2} strokeWidth={1}
    />
    {/* Vệt sáng — đặt lệch trên-trái như ánh sáng hắt vào mặt kính thật. */}
    <Circle cx={DIAL * 0.38} cy={DIAL * 0.3} r={DIAL * 0.34} fill="url(#sheen)" />

    {/* Vành khắc 12 vạch. Vạch chính (4 hướng) dài và đậm hơn. */}
    <G>
      {Array.from({ length: 12 }, (_, i) => {
        const major = i % 3 === 0;
        const a = (i * 30 - 90) * (Math.PI / 180);
        const rOut = DIAL / 2 - 20;
        const rIn = rOut - (major ? 13 : 7);
        return (
          <Path
            key={i}
            d={`M${DIAL / 2 + rIn * Math.cos(a)} ${DIAL / 2 + rIn * Math.sin(a)}
                L${DIAL / 2 + rOut * Math.cos(a)} ${DIAL / 2 + rOut * Math.sin(a)}`}
            stroke={major ? NATURE.bark : NATURE.barkSoft}
            strokeOpacity={major ? 0.42 : 0.22}
            strokeWidth={major ? 2.4 : 1.4}
            strokeLinecap="round"
          />
        );
      })}
    </G>
  </Svg>
);

// ---------------------------------------------------------------------------
// Mảnh nhỏ
// ---------------------------------------------------------------------------

const Header: React.FC<{ title: string; onBack: () => void; top: number }> = ({
  title, onBack, top,
}) => (
  <View style={[styles.header, { paddingTop: top + SPACE.md }]}>
    <Pressable onPress={onBack} style={styles.backBtn} hitSlop={10}>
      <Icon name="arrow-left" size={21} color={NATURE.bark} />
    </Pressable>
    <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
  </View>
);

const Notice: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <View style={styles.notice}>
    <Icon name={icon} size={18} color={TONE.sun} />
    <Text style={styles.noticeTxt}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  pressed: { opacity: 0.9 },
  scroll: { paddingHorizontal: SPACE.page, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xxl, gap: SPACE.sm },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.page, paddingBottom: SPACE.md,
  },
  backBtn: {
    width: 44, height: 44, ...ORGANIC_TILE, ...ELEVATION.card,
    backgroundColor: SURFACE.raised, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...TYPE.title, fontSize: 22, flex: 1 },

  notice: {
    flexDirection: 'row', alignSelf: 'stretch', gap: SPACE.sm, alignItems: 'flex-start',
    backgroundColor: TONE.sunSoft, ...ORGANIC_CARD,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, marginBottom: SPACE.md,
  },
  noticeTxt: { flex: 1, fontSize: 13.5, color: NATURE.bark, lineHeight: 20 },

  dialWrap: {
    width: DIAL, height: DIAL, marginTop: SPACE.sm,
    alignItems: 'center', justifyContent: 'center',
    ...ELEVATION.cardStrong,
  },
  dialCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  northMark: { position: 'absolute', top: -104, fontSize: 13, fontWeight: '700', color: NATURE.barkSoft },

  radarHead: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.page, paddingBottom: SPACE.sm,
  },
  radarHeadText: { flex: 1, minWidth: 0 },
  radarTitle: { ...TYPE.section, fontSize: 18 },
  radarSub: { ...TYPE.caption, fontSize: 12.5 },

  treeNeedleBox: {
    position: 'absolute', right: SPACE.page,
    justifyContent: 'center',
    alignItems: 'center', gap: 2,
  },
  treeNeedleName: { fontSize: 13.5, fontWeight: '700', color: NATURE.bark, maxWidth: '100%' },
  treeNeedleBack: { fontSize: 12, color: TONE.primaryDeep, fontWeight: '600' },

  readout: { alignItems: 'center', gap: 5, marginTop: SPACE.xl },
  distance: { fontSize: 46, fontWeight: '700', letterSpacing: -1.5, color: NATURE.bark },
  arrivedTxt: { ...TYPE.section, fontSize: 22, color: TONE.primaryDeep, textAlign: 'center' },
  hint: { fontSize: 17, fontWeight: '600', color: NATURE.barkSoft },
  muted: { ...TYPE.caption, textAlign: 'center' },
  warnSmall: { fontSize: 13, color: TONE.sun, textAlign: 'center', marginTop: 2 },


  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    alignSelf: 'stretch', marginTop: SPACE.lg,
    backgroundColor: TONE.primary, ...ORGANIC_CARD, ...ELEVATION.cardStrong,
    paddingVertical: 17,
  },
  ctaTxt: { color: NATURE.paper, fontSize: 17, fontWeight: '700' },
  ctaNote: { ...TYPE.caption, fontSize: 13, textAlign: 'center', marginTop: SPACE.sm, paddingHorizontal: SPACE.md },

  glassCard: {
    alignSelf: 'stretch', marginTop: SPACE.xxl,
    backgroundColor: GLASS.film, ...ORGANIC_CARD, ...ELEVATION.card,
    padding: SPACE.md,
  },
  nearbyTitle: { ...TYPE.cardTitle, fontSize: 16, marginBottom: SPACE.xs, paddingHorizontal: SPACE.xs },
  nearbyRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    paddingVertical: SPACE.sm, paddingHorizontal: SPACE.xs, minHeight: 52,
  },
  nearbyIcon: {
    width: 32, height: 32, ...ORGANIC_TILE,
    backgroundColor: TONE.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  nearbyName: { flex: 1, fontSize: 15, color: NATURE.bark },
  nearbyDist: { fontSize: 14, fontWeight: '700', color: NATURE.bark },
  nearbyDir: { fontSize: 12.5, color: NATURE.barkSoft, width: 76, textAlign: 'right' },

  emptyIcon: {
    width: 68, height: 68, ...ORGANIC_TILE, marginBottom: SPACE.xs,
    backgroundColor: SURFACE.sunken, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { ...TYPE.cardTitle, fontSize: 18, textAlign: 'center' },
});

export default WayfindScreen;
