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
  ActivityIndicator, Alert, Image, Linking, Modal, PermissionsAndroid,
  Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { buzz } from '../utils/haptics';
import { tk as tkNow, useTk } from '../i18n/keys';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { withPhotoSave } from '../services/mediaSavePermission';
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
import {
  loadFarmMarkers, newMarkerId, removeFarmMarker, saveFarmMarker,
  type FarmMarker,
} from '../features/space3d/markerStore';
import { farmOrigin, treeGeoPoint } from '../features/space3d/treeGeo';
import { courseFallback, useHeading } from '../features/wayfind/useHeading';
import { GroundBackdrop } from '../modules/trace/components/layered/Organic';
import {
  ELEVATION, GLASS, NATURE, ORGANIC_CARD, ORGANIC_TILE, RADIUS, SPACE, SURFACE, TONE, TYPE,
} from '../modules/trace/theme/depth';
import { showInfo, showWarning } from '../utils/alert';

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

/**
 * Bán kính tối đa của "cây quanh chỗ bạn đứng".
 *
 * Không có trần thì danh sách chỉ bị cắt theo SỐ LƯỢNG, không theo khoảng cách:
 * chủ hai vườn cách nhau 30 km sẽ thấy cây của vườn kia đứng trong mục này kèm
 * số "30 km" — đúng phép tính mà vô nghĩa với người đang đứng giữa vườn. 300 m
 * là tầm đi bộ trong một vườn; xa hơn thì không còn là "quanh chỗ bạn đứng".
 *
 * Trần này là lớp chặn ĐỘC LẬP với việc lọc theo vườn: nơi gọi quên truyền mã
 * vườn thì nó vẫn giữ danh sách nằm trong tầm chân người.
 */
const NEARBY_MAX_M = 300;

/** Cỡ mặt la bàn. Đủ to để đọc được khi cầm máy một tay giữa nắng. */
const DIAL = 264;

/** Kim tìm CÂY chiếm một phần ba chiều rộng màn — đủ đọc mà không che mặt phẳng. */
const TREE_NEEDLE_RATIO = 1 / 3;

/** Rung khi tới nơi: ba nhịp ngắn — khác hẳn nhịp thông báo của hệ điều hành. */
const ARRIVE_BUZZ = [0, 90, 80, 90, 80, 160];

/**
 * Ảnh của mốc chỉ để NHẬN RA chỗ đó ("à, cái cổng sắt xanh"), không để nhận
 * dạng máy — nên cạnh 1024 và chất lượng 0,8 là thừa đủ, mà đỡ chiếm bộ nhớ máy
 * cho thứ chưa có đường đẩy lên máy chủ.
 */
const MARKER_PHOTO_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8,
  maxWidth: 1024,
  maxHeight: 1024,
  saveToPhotos: false,
  includeBase64: false,
};

/** Đích đang được chỉ tới: một CÂY của máy chủ, hay một MỐC chỉ máy này biết. */
interface Picked {
  kind: 'tree' | 'marker';
  item: RadarTree;
}

/** Mốc → khuôn của mặt phẳng tìm cây, để dùng lại nguyên phép chiếu và toán. */
const markerAsRadar = (m: FarmMarker): RadarTree => ({
  id: m.id,
  name: m.name || tkNow('map.marker.unnamed'),
  pos: { lat: m.lat, lon: m.lon },
});

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

  /** Đích đang được chỉ tới (cây hoặc mốc). `null` = đang xem cả vườn. */
  const [picked, setPicked] = useState<Picked | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [nearbyTrees, setNearbyTrees] = useState<TreeInfo[]>([]);
  /**
   * Hỏi danh sách cây HỎNG. Khác `null` nghĩa là CHƯA BIẾT quanh đây có cây nào
   * — không phải "quanh đây không có cây". Trước bản này hai chuyện đó vẽ ra
   * cùng một màn trống, và nông dân kết luận vườn mình chưa có cây nào trong
   * khi màn chỉ chưa hỏi được máy chủ.
   */
  const [treesError, setTreesError] = useState<string | null>(null);
  /** Đã hỏi xong ít nhất một lượt chưa — để không kết luận "vườn trống" quá sớm. */
  const [treesLoaded, setTreesLoaded] = useState(false);
  /** Đổi số này = hỏi lại. Nút "Thử lại" chỉ việc tăng nó lên. */
  const [treesNonce, setTreesNonce] = useState(0);
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

  // ── Mốc vườn (chỉ nằm trong máy này — xem `markerStore.ts`) ───────────────
  const [markers, setMarkers] = useState<FarmMarker[]>([]);
  const [markerOpen, setMarkerOpen] = useState(false);

  /**
   * Không có mã vườn thì KHÔNG mở lối đặt mốc: mốc phải thuộc về một vườn để
   * lần sau còn liệt kê lại đúng chỗ. Mở màn từ chi tiết một cây (route không
   * kèm `farmId`) là đúng tình huống đó.
   */
  const canMark = Boolean(params.farmId);

  useEffect(() => {
    let alive = true;
    if (!params.farmId) { setMarkers([]); return; }
    loadFarmMarkers(params.farmId).then(m => { if (alive) setMarkers(m); });
    return () => { alive = false; };
  }, [params.farmId]);

  const radarMarkers = useMemo(() => markers.map(markerAsRadar), [markers]);

  /**
   * Ghi mốc. `saveFarmMarker` trả về danh sách SAU khi ghi, nên chỉ cần soi mốc
   * mới có nằm trong đó không là biết ghi được hay không — không phải đoán.
   */
  const addMarker = useCallback(async (name: string, photoPath?: string) => {
    if (!params.farmId || !fix) return;
    const m: FarmMarker = {
      id: newMarkerId(),
      farmId: params.farmId,
      name: name.trim(),
      lat: fix.pos.lat,
      lon: fix.pos.lon,
      accuracyM: fix.accuracyM,
      photoPath,
      createdAt: Date.now(),
    };
    const next = await saveFarmMarker(params.farmId, m);
    setMarkers(next);
    setMarkerOpen(false);
    if (!next.some(x => x.id === m.id)) {
      showWarning(tk('map.marker.title'), tk('map.marker.saveFail'));
    }
  }, [params.farmId, fix, tk]);

  const askRemoveMarker = useCallback((moc: RadarTree) => {
    if (!params.farmId) return;
    Alert.alert(
      tk('map.marker.deleteTitle'),
      tk('map.marker.deleteBody', { name: moc.name }),
      [
        { text: tk('map.marker.cancel'), style: 'cancel' },
        {
          text: tk('map.marker.delete'),
          style: 'destructive',
          onPress: () => {
            removeFarmMarker(params.farmId as string, moc.id).then(rest => {
              setMarkers(rest);
              // Đang chỉ tới đúng mốc vừa xoá thì phải thả đích ra, không thì
              // kim còn chỉ về một chỗ không còn tồn tại trong danh sách nào.
              setPicked(p => (p?.kind === 'marker' && p.item.id === moc.id ? null : p));
            });
          },
        },
      ],
    );
  }, [params.farmId, tk]);

  // ── Cây quanh đây (nhảy sang cây khác mà không phải quay ra danh sách) ─────
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getTrees(ORILIFE_BASE, params.farmId);
      if (!alive) return;
      if (res.ok && res.trees) {
        setNearbyTrees(res.trees);
        setTreesError(null);
      } else {
        // KHÔNG xoá danh sách đang có: mất sóng giữa vườn mà xoá sạch thì người
        // dùng mất luôn thứ vừa đọc được. Chỉ ghi cờ lỗi để màn NÓI RA.
        setTreesError(res.error?.detail || tk('map.nearby.error'));
      }
      setTreesLoaded(true);
    })();
    return () => { alive = false; };
  }, [params.farmId, treesNonce, tk]);

  /** Hỏi lại danh sách cây. Xoá cờ lỗi trước để nút không nằm lại giữa lượt hỏi. */
  const retryTrees = useCallback(() => {
    setTreesError(null);
    setTreesNonce(n => n + 1);
  }, []);

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

  /**
   * Số liệu tới ĐÍCH ĐANG CHỌN — cùng phép tính với vườn, chỉ khác đích. Mốc và
   * cây dùng CHUNG khối này: đích nào cũng chỉ là một cặp lat/lon, và viết lại
   * phép tính cho mốc là mở đường cho hai màn nói hai khoảng cách khác nhau.
   */
  const treeNav = useMemo(() => {
    if (!picked || !fix) return null;
    const distanceM = haversineMeters(fix.pos, picked.item.pos);
    return {
      distanceM,
      bearingDeg: initialBearingDeg(fix.pos, picked.item.pos),
      state: arrivalStateOf(distanceM, fix.accuracyM),
    };
  }, [picked, fix]);

  const nearby = useMemo(() => {
    if (!fix) return [];
    return nearestFixes(
      fix.pos,
      nearbyTrees.filter(t => t.tree_id !== params.treeId),
      // Cùng luật với mặt phẳng: đặt tay thắng GPS. Hai chỗ trên CÙNG một màn mà
      // đọc vị trí khác nhau cho cùng một cây là lỗi không ai đọc ra được.
      t => treeGeoPoint({ serverGps: t.gps, localPos: placedPos[t.tree_id], origin }),
      // `maxMeters` KHÔNG được bỏ: `nearestFixes` chỉ lọc theo khoảng cách khi
      // có trần (xem `wayfind.ts`), nên thiếu nó là danh sách kéo về cây của
      // vườn khác cách hàng chục km.
      { limit: NEARBY_LIMIT, maxMeters: NEARBY_MAX_M },
    );
  }, [fix, nearbyTrees, params.treeId, placedPos, origin]);

  /**
   * Mốc kèm khoảng cách + hướng, dùng ĐÚNG `nearestFixes` của cây. KHÔNG đặt
   * trần khoảng cách như cây: mốc là thứ chính người dùng đặt cho vườn này, họ
   * có quyền thấy đủ cả khi đang đứng ở nhà cách vườn 20 km.
   */
  const markerFixes = useMemo(() => {
    if (!fix) return [];
    return nearestFixes(fix.pos, markers, m => ({ lat: m.lat, lon: m.lon }));
  }, [fix, markers]);

  /**
   * Thứ tự bày mốc: GẦN NHẤT trước khi đã biết chỗ đứng, MỚI NHẤT trước khi
   * chưa biết. Không có chỗ đứng mà vẫn giả vờ xếp theo khoảng cách thì thứ tự
   * đó là bịa.
   */
  const markerRows = useMemo(
    () => (fix ? markerFixes.map(f => f.item) : markers),
    [fix, markerFixes, markers],
  );

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
      showWarning(tk('map.openmap.failTitle'), tk('map.openmap.failBody'));
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
            onPickTree={(t) => setPicked({ kind: 'tree', item: t })}
            markers={radarMarkers}
            onPickMarker={(m) => setPicked({ kind: 'marker', item: m })}
            onRemoveMarker={canMark ? askRemoveMarker : undefined}
            onAddMarker={canMark ? () => setMarkerOpen(true) : undefined}
            insetTop={insets.top + 58}
            insetBottom={insets.bottom}
          />

          <View style={[styles.radarHead, { paddingTop: insets.top + SPACE.sm }]}>
            <Pressable
              onPress={() => (picked ? setPicked(null) : navigation.goBack())}
              style={styles.backBtn}
              hitSlop={10}
            >
              <Icon name="arrow-left" size={21} color={NATURE.bark} />
            </Pressable>
            <View style={styles.radarHeadText}>
              <Text style={styles.radarTitle} numberOfLines={1}>
                {picked
                  ? tk(
                    picked.kind === 'marker'
                      ? (treeNav?.state === 'arrived' ? 'map.marker.arrived' : 'map.marker.finding')
                      : (treeNav?.state === 'arrived' ? 'map.tree.arrived' : 'map.tree.finding'),
                    { name: picked.item.name },
                  )
                  : tk('map.nav.arrived', { name: label })}
              </Text>
              <Text style={styles.radarSub} numberOfLines={1}>
                {picked && treeNav
                  ? formatDistanceVi(treeNav.distanceM)
                  : tk(headingSource ? 'map.radar.hint' : 'map.radar.northUp')}
              </Text>
            </View>
          </View>

          {/* Mặt phẳng trống vì CHƯA HỎI ĐƯỢC máy chủ thì phải nói ra ngay trên
              mặt phẳng. Ở chế độ này không có khối "Cây quanh chỗ bạn đứng" để
              chở câu đó, mà một mặt phẳng trống trơn thì đọc thành "vườn không
              có cây" — kết luận sai và không có gì đính chính. */}
          {treesError ? (
            <View style={[styles.radarNotice, { top: insets.top + 66 }]} pointerEvents="box-none">
              <View style={styles.nearbyErr}>
                <Text style={styles.nearbyNote}>{treesError}</Text>
                <Pressable
                  onPress={retryTrees}
                  style={({ pressed }) => [styles.nearbyRetry, pressed && styles.pressed]}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Icon name="rotate-right" size={15} color={TONE.primary} />
                  <Text style={styles.nearbyRetryTxt}>{tk('map.nearby.retry')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Kim tìm CÂY — góc trên bên phải, rộng 1/3 màn. Đặt ở đó để nó không
              che phần giữa, chỗ mặt phẳng đang bày các cây khác. */}
          {picked && treeNav ? (
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

            {/* ── Cây quanh chỗ bạn đứng ──
                Khối này KHÔNG được biến mất khi danh sách rỗng. Trước bản này
                nó chỉ hiện lúc `nearby.length > 0`, nên "chưa hỏi được máy chủ"
                (token hết hạn, 3G rớt) trông y hệt "vườn chưa có cây nào" — và
                đây đúng là việc chính của màn. Nay ba tình huống nói ba câu
                khác nhau, và tình huống hỏng có nút hỏi lại. */}
            {treesError || treesLoaded ? (
              <View style={styles.glassCard}>
                <Text style={styles.nearbyTitle}>{tk('map.nearby.title')}</Text>

                {treesError ? (
                  <View style={styles.nearbyErr}>
                    <Text style={styles.nearbyNote}>{treesError}</Text>
                    <Pressable
                      onPress={retryTrees}
                      style={({ pressed }) => [styles.nearbyRetry, pressed && styles.pressed]}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Icon name="rotate-right" size={15} color={TONE.primary} />
                      <Text style={styles.nearbyRetryTxt}>{tk('map.nearby.retry')}</Text>
                    </Pressable>
                  </View>
                ) : null}

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

                {/* Rỗng mà KHÔNG lỗi: nói rõ rỗng vì đâu. Chưa có chỗ đứng thì
                    im — dòng cảnh báo GPS ở đầu màn đã nói rồi, nói thêm
                    "không cây nào trong 300 m" lúc chưa biết mình ở đâu là sai. */}
                {!treesError && nearby.length === 0 && (nearbyTrees.length === 0 || fix) ? (
                  <Text style={styles.nearbyNote}>
                    {nearbyTrees.length === 0
                      ? tk('map.nearby.empty')
                      : tk('map.nearby.outOfRange', { n: NEARBY_MAX_M })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* ── Mốc vườn ──
                Cũng có ở đây, không riêng mặt phẳng tìm cây: mặt phẳng chỉ bật
                khi đã "tới nơi" (trong vòng vài chục mét quanh trọng tâm vườn),
                mà cổng vườn thì thường nằm ngoài vòng đó. Bắt người ta đi vào
                giữa vườn rồi mới cho đặt mốc cổng là hỏng đúng việc cần làm. */}
            {canMark ? (
              <View style={styles.glassCard}>
                <Text style={styles.nearbyTitle}>{tk('map.marker.title')}</Text>

                <Pressable
                  onPress={() => setMarkerOpen(true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.markerCta, pressed && styles.pressed]}
                >
                  <Icon name="location-crosshairs" size={17} color={NATURE.paper} />
                  <Text style={styles.markerCtaTxt}>{tk('map.marker.add')}</Text>
                </Pressable>
                <Text style={styles.markerNote}>{tk('map.marker.localOnly')}</Text>

                {/* Chưa biết mình đứng đâu thì VẪN liệt kê mốc, chỉ bỏ trống ô
                    khoảng cách. Ẩn cả danh sách là người dùng tưởng mốc mình
                    đặt hôm qua đã mất, trong khi màn mới chỉ chưa bắt được GPS. */}
                {markerRows.map(m => {
                  const f = markerFixes.find(x => x.item.id === m.id);
                  return (
                    <Pressable
                      key={m.id}
                      // Chỉ CHẠM GIỮ, không có việc gì cho cú chạm thường — nên
                      // cũng không tô hiệu ứng bấm, đừng hứa một hành động không có.
                      style={styles.nearbyRow}
                      onLongPress={() => askRemoveMarker(markerAsRadar(m))}
                    >
                      <View style={styles.markerIcon}>
                        <Icon name="location-crosshairs" size={15} color={TONE.sun} />
                      </View>
                      <Text style={styles.nearbyName} numberOfLines={1}>
                        {m.name || tk('map.marker.unnamed')}
                      </Text>
                      <Text style={styles.nearbyDist}>
                        {f ? formatDistanceVi(f.distanceM) : '—'}
                      </Text>
                      <Text style={styles.nearbyDir}>
                        {f ? compassPointVi(f.bearingDeg) : ''}
                      </Text>
                    </Pressable>
                  );
                })}

                {markers.length === 0 ? (
                  <Text style={styles.nearbyNote}>{tk('map.marker.empty')}</Text>
                ) : (
                  <Text style={styles.markerNote}>{tk('map.marker.hint')}</Text>
                )}
              </View>
            ) : null}
          </ScrollView>
        </>
      )}

      {/* Hộp đặt mốc dựng LẠI mỗi lần mở (chỉ vẽ khi `markerOpen`) — nhờ vậy tên
          và ảnh của lượt trước không còn nằm sẵn trong ô của lượt sau. */}
      {markerOpen ? (
        <MarkerDialog
          fix={fix}
          onCancel={() => setMarkerOpen(false)}
          onSave={addMarker}
        />
      ) : null}
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

/**
 * Hộp ĐẶT MỐC.
 *
 * Ba thứ bắt buộc phải nói ra ngay ở đây, không đẩy sang chỗ khác:
 *   1. Mốc CHỈ nằm trong máy này (máy chủ chưa có chỗ nhận — xem `markerStore`).
 *   2. SAI SỐ GPS đang là bao nhiêu. Dưới tán cây 15–25 m là thường; đặt mốc
 *      "cổng vườn" với sai số 25 m rồi tưởng nó chính xác là hỏng đúng thứ mà
 *      mốc sinh ra để chữa.
 *   3. Chưa bắt được vị trí thì KHÔNG cho lưu — mốc không toạ độ là một cái tên
 *      trôi nổi, tệ hơn là không có.
 */
const MarkerDialog: React.FC<{
  fix: Fix | null;
  onCancel: () => void;
  onSave: (name: string, photoPath?: string) => void;
}> = ({ fix, onCancel, onSave }) => {
  const tk = useTk();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const takePhoto = useCallback(async () => {
    // Nạp MỀM đúng lối `AnimalEnrollScreen`: bản dựng thiếu mô-đun máy ảnh thì
    // báo một câu rồi vẫn lưu được mốc, chứ không nổ giữa vườn.
    let picker: { launchCamera?: (o: unknown, cb: (r: any) => void) => void } | null = null;
    try { picker = require('react-native-image-picker'); } catch { picker = null; }
    if (!picker?.launchCamera) {
      showWarning(tk('map.marker.title'), tk('map.marker.cameraFail'));
      return;
    }
    try {
      picker.launchCamera(await withPhotoSave(MARKER_PHOTO_OPTIONS), (r: any) => {
        if (r?.didCancel) return;
        const uri = r?.assets?.[0]?.uri;
        if (uri) setPhoto(uri);
        else if (r?.errorCode) showWarning(tk('map.marker.title'), tk('map.marker.cameraFail'));
      });
    } catch {
      showWarning(tk('map.marker.title'), tk('map.marker.cameraFail'));
    }
  }, [tk]);

  const submit = useCallback(() => {
    if (!fix) { showWarning(tk('map.marker.title'), tk('map.marker.noFix')); return; }
    if (!name.trim()) { showWarning(tk('map.marker.title'), tk('map.marker.needName')); return; }
    // Chặn bấm hai lần: mỗi lần bấm sinh một mã mốc mới, nên hai lần bấm là hai
    // mốc trùng tên nằm chồng nhau trên mặt phẳng.
    if (saving) return;
    setSaving(true);
    onSave(name, photo ?? undefined);
  }, [fix, name, photo, saving, onSave, tk]);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.dialogScrim}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{tk('map.marker.dialog')}</Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={tk('map.marker.namePlaceholder')}
            placeholderTextColor={NATURE.barkSoft}
            maxLength={60}
            autoFocus
          />

          {/* Sai số hiện NGAY, không giấu sau một dấu chấm hỏi. */}
          {!fix ? (
            <Text style={styles.dialogWarn}>{tk('map.marker.noFix')}</Text>
          ) : fix.accuracyM == null ? (
            <Text style={styles.dialogWarn}>{tk('map.marker.accuracyUnknown')}</Text>
          ) : (
            <Text style={fix.accuracyM > POOR_ACCURACY_M ? styles.dialogWarn : styles.dialogMuted}>
              {tk('map.marker.accuracy', { n: Math.round(fix.accuracyM) })}
            </Text>
          )}

          <Pressable
            onPress={takePhoto}
            accessibilityRole="button"
            style={({ pressed }) => [styles.dialogGhost, pressed && styles.pressed]}
          >
            <Icon name="camera" size={17} color={TONE.primary} />
            <Text style={styles.dialogGhostTxt}>
              {photo ? tk('map.marker.photoDone') : tk('map.marker.photo')}
            </Text>
          </Pressable>
          {photo ? <Image source={{ uri: photo }} style={styles.dialogPhoto} /> : null}

          <Text style={styles.dialogMuted}>{tk('map.marker.localOnly')}</Text>

          <View style={styles.dialogRow}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.dialogBtn, pressed && styles.pressed]}
            >
              <Text style={styles.dialogBtnTxt}>{tk('map.marker.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              accessibilityRole="button"
              disabled={!fix || saving}
              style={({ pressed }) => [
                styles.dialogBtn, styles.dialogBtnMain,
                (!fix || saving) && styles.dialogBtnOff,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.dialogBtnTxt, styles.dialogBtnMainTxt]}>
                {tk('map.marker.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

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
  radarNotice: {
    position: 'absolute', left: SPACE.page, right: SPACE.page,
    backgroundColor: GLASS.film, ...ORGANIC_CARD, ...ELEVATION.card,
    paddingHorizontal: SPACE.sm,
  },
  nearbyErr: { paddingHorizontal: SPACE.xs, paddingVertical: SPACE.sm, gap: SPACE.sm },
  nearbyNote: {
    fontSize: 13.5, color: NATURE.barkSoft, lineHeight: 20,
    paddingHorizontal: SPACE.xs, paddingVertical: SPACE.sm,
  },
  nearbyRetry: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    alignSelf: 'flex-start', minHeight: 44, paddingRight: SPACE.sm,
  },
  nearbyRetryTxt: { fontSize: 14.5, fontWeight: '700', color: TONE.primary },

  // ── Mốc vườn ──────────────────────────────────────────────────────────────
  markerCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    alignSelf: 'stretch', minHeight: 50, marginTop: SPACE.xs,
    backgroundColor: TONE.primary, ...ORGANIC_TILE,
    paddingHorizontal: SPACE.md,
  },
  markerCtaTxt: { color: NATURE.paper, fontSize: 16, fontWeight: '700' },
  markerNote: {
    ...TYPE.caption, fontSize: 12.5, lineHeight: 18,
    paddingHorizontal: SPACE.xs, marginTop: SPACE.sm,
  },
  markerIcon: {
    width: 32, height: 32, ...ORGANIC_TILE,
    backgroundColor: TONE.sunSoft, alignItems: 'center', justifyContent: 'center',
  },

  dialogScrim: {
    flex: 1, backgroundColor: SURFACE.scrim,
    justifyContent: 'center', paddingHorizontal: SPACE.page,
  },
  dialog: {
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD, ...ELEVATION.cardStrong,
    padding: SPACE.lg, gap: SPACE.sm,
  },
  dialogTitle: { ...TYPE.section, fontSize: 18 },
  input: {
    ...ORGANIC_TILE, backgroundColor: SURFACE.sunken,
    paddingHorizontal: SPACE.md, minHeight: 50,
    fontSize: 16, color: NATURE.bark,
  },
  dialogMuted: { ...TYPE.caption, fontSize: 12.5, lineHeight: 18 },
  dialogWarn: { fontSize: 13, lineHeight: 19, color: TONE.sun },
  dialogGhost: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    minHeight: 46, paddingHorizontal: SPACE.md,
    ...ORGANIC_TILE, backgroundColor: TONE.primarySoft,
  },
  dialogGhostTxt: { fontSize: 15, fontWeight: '600', color: TONE.primaryDeep },
  dialogPhoto: { width: '100%', height: 132, borderRadius: RADIUS.card },
  dialogRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  dialogBtn: {
    flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center',
    ...ORGANIC_TILE, backgroundColor: SURFACE.sunken,
  },
  dialogBtnMain: { backgroundColor: TONE.primary },
  dialogBtnOff: { opacity: 0.5 },
  dialogBtnTxt: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  dialogBtnMainTxt: { color: NATURE.paper },

  emptyIcon: {
    width: 68, height: 68, ...ORGANIC_TILE, marginBottom: SPACE.xs,
    backgroundColor: SURFACE.sunken, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { ...TYPE.cardTitle, fontSize: 18, textAlign: 'center' },
});

export default WayfindScreen;
