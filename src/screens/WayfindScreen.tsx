/**
 * WayfindScreen — DẪN ĐƯỜNG tới vườn / tới đúng gốc cây.
 *
 * Hai chặng, hai cách chỉ — vì không có một cách nào chỉ được cả hai:
 *
 *   CHẶNG XA (nhà → cổng vườn): giao cho Google/Apple Maps qua `Linking`. Họ có
 *     đường sá, ta không làm lại. Nút "Mở bản đồ chỉ đường".
 *   CHẶNG GẦN (cổng → gốc cây): KHÔNG bản đồ nào chỉ được — trong vườn không có
 *     đường, cây cách nhau vài mét. Chặng này màn tự chỉ bằng khoảng cách + góc
 *     phương-vị, cập nhật liên tục theo GPS.
 *
 * ── Mũi tên chỉ đâu, và khi nào KHÔNG được quay nó ──────────────────────────
 * Máy KHÔNG có la bàn từ dùng chung được ở đây (`getCurrentHeading` của
 * TreeReIDBridge chỉ sống trong phiên chụp ảnh cây). Thứ duy nhất có là
 * `coords.heading` của GPS = hướng DI CHUYỂN, và nó chỉ đúng khi đang đi.
 * Vậy nên:
 *   đang đi  → quay mũi tên theo hướng đi ("chếch phải, 2 giờ")
 *   đứng yên → KHÔNG quay, chỉ nói hướng tuyệt đối ("Đông Bắc") + bảo đi vài bước
 * Quay mũi tên lúc đứng yên là chỉ sai đường giữa vườn — thà nói ít mà đúng.
 *
 * Route params: { lat, lon, label?, kind?: 'farm' | 'tree', treeId?, farmId? }
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
  Platform, PermissionsAndroid, Linking, Alert, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../constants';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { getTrees, type TreeInfo } from '../services/treeReIDService';
import {
  arrivalStateOf, compassPointVi, directionsUrl, formatDistanceVi, fromGpsPair,
  geoUri, haversineMeters, initialBearingDeg, isCourseUsable, isValidLatLon,
  nearestFixes, relativeBearingDeg, relativeHintVi, walkMinutes,
  type ArrivalState, type LatLon,
} from '../features/wayfind/wayfind';

interface RouteParams {
  lat?: number;
  lon?: number;
  label?: string;
  kind?: 'farm' | 'tree';
  treeId?: string;
  farmId?: string;
}

/** Vị-trí đọc được từ GPS, kèm phần dùng để quyết định có quay mũi tên không. */
interface Fix {
  pos: LatLon;
  accuracyM: number | null;
  courseDeg: number | null; // null = đứng yên / không tin được
}

/** Sai số trên mức này thì phải nói cho người dùng biết, đừng để họ tưởng máy chắc. */
const POOR_ACCURACY_M = 25;

/** Bao nhiêu cây gần đó thì liệt kê ở cuối màn. */
const NEARBY_LIMIT = 8;

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Quyền truy cập vị trí',
          message: 'Aladin cần vị trí để chỉ đường tới vườn và tới đúng gốc cây.',
          buttonNeutral: 'Hỏi lại sau',
          buttonNegative: 'Từ chối',
          buttonPositive: 'Cho phép',
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
  const params = (route.params ?? {}) as RouteParams;

  const target: LatLon | null = useMemo(() => {
    const p = { lat: Number(params.lat), lon: Number(params.lon) };
    return isValidLatLon(p) ? p : null;
  }, [params.lat, params.lon]);

  const kind = params.kind ?? 'tree';
  const label = params.label || (kind === 'farm' ? 'Vườn' : 'Cây');

  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [nearbyTrees, setNearbyTrees] = useState<TreeInfo[]>([]);
  const watchId = useRef<number | null>(null);

  // ── Theo dõi vị-trí liên tục ────────────────────────────────────────────────
  // distanceFilter 2 m: khớp cách trace module lọc điểm ranh giới, và dưới mức
  // đó thì chỉ là nhiễu GPS chứ không phải người đã đi.
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await requestLocationPermission();
      if (!alive) return;
      if (!ok) { setDenied(true); return; }

      watchId.current = Geolocation.watchPosition(
        (pos) => {
          if (!alive) return;
          setGpsError(null);
          const { latitude, longitude, accuracy, heading, speed } = pos.coords;
          setFix({
            pos: { lat: latitude, lon: longitude },
            accuracyM: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
            courseDeg: isCourseUsable(heading, speed) ? heading : null,
          });
        },
        () => {
          if (!alive) return;
          setGpsError('Chưa bắt được vị trí. Ra chỗ thoáng, tránh dưới tán dày rồi chờ một chút.');
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
  }, []);

  // ── Cây quanh đây (để nhảy sang cây khác mà không phải quay ra danh sách) ───
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getTrees(ORILIFE_BASE, params.farmId);
      if (alive && res.ok && res.trees) setNearbyTrees(res.trees);
    })();
    return () => { alive = false; };
  }, [params.farmId]);

  // ── Số liệu dẫn đường ───────────────────────────────────────────────────────
  const nav = useMemo(() => {
    if (!target || !fix) return null;
    const distanceM = haversineMeters(fix.pos, target);
    const bearingDeg = initialBearingDeg(fix.pos, target);
    return {
      distanceM,
      bearingDeg,
      state: arrivalStateOf(distanceM, fix.accuracyM),
      relativeDeg: fix.courseDeg !== null ? relativeBearingDeg(bearingDeg, fix.courseDeg) : null,
    };
  }, [target, fix]);

  const nearby = useMemo(() => {
    if (!fix) return [];
    return nearestFixes(
      fix.pos,
      nearbyTrees.filter(t => t.tree_id !== params.treeId),
      t => fromGpsPair(t.gps),
      { limit: NEARBY_LIMIT },
    );
  }, [fix, nearbyTrees, params.treeId]);

  // ── Giao cho bản đồ ngoài (chặng xa) ───────────────────────────────────────
  const openExternalMaps = useCallback(async () => {
    if (!target) return;
    const primary = directionsUrl(target, { travelMode: 'driving' });
    try {
      await Linking.openURL(primary);
      return;
    } catch {
      // Máy không mở được liên-kết web (không trình duyệt mặc-định / Android
      // chặn intent) → thử `geo:`, thứ mọi máy có bản đồ đều nhận.
    }
    try {
      await Linking.openURL(geoUri(target, label));
    } catch {
      Alert.alert(
        'Chưa mở được bản đồ',
        'Máy chưa cài ứng dụng bản đồ nào. Anh dùng mũi tên và khoảng cách ở màn này để đi.',
      );
    }
  }, [target, label]);

  const goTree = useCallback((t: TreeInfo, pos: LatLon) => {
    navigation.push('Wayfind', {
      lat: pos.lat, lon: pos.lon,
      label: t.name || `Cây ${t.tree_id.slice(0, 6)}`,
      kind: 'tree', treeId: t.tree_id, farmId: params.farmId,
    });
  }, [navigation, params.farmId]);

  // ── Đích không có toạ-độ: nói thẳng, đừng vẽ mũi tên rỗng ──────────────────
  if (!target) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header label={label} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Icon name="map-marker-off" size={44} color={COLORS.textMuted} />
          <Text style={styles.muted}>
            {kind === 'farm' ? 'Vườn này' : 'Cây này'} chưa có toạ-độ GPS nên chưa chỉ đường được.
          </Text>
          <Text style={styles.mutedSmall}>
            Toạ-độ được ghi lúc đăng ký. Ra đứng tại {kind === 'farm' ? 'vườn' : 'gốc cây'} rồi
            đăng ký lại vị trí là chỉ đường được ngay.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <Header label={label} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {denied ? (
          <View style={styles.notice}>
            <Icon name="crosshairs-off" size={20} color={COLORS.warning} />
            <Text style={styles.noticeTxt}>
              Chưa được cấp quyền vị trí nên màn này chưa biết anh đang đứng đâu. Vẫn mở được
              bản đồ chỉ đường ở nút dưới.
            </Text>
          </View>
        ) : null}

        {gpsError ? (
          <View style={styles.notice}>
            <Icon name="satellite-variant" size={20} color={COLORS.warning} />
            <Text style={styles.noticeTxt}>{gpsError}</Text>
          </View>
        ) : null}

        {/* ── Kim chỉ hướng ───────────────────────────────────────────────── */}
        <View style={styles.dial}>
          {!fix && !denied && !gpsError ? (
            <>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.muted}>Đang bắt vị trí…</Text>
            </>
          ) : nav ? (
            <Needle nav={nav} />
          ) : (
            <Text style={styles.muted}>Chưa biết vị trí của anh.</Text>
          )}
        </View>

        {nav ? (
          <>
            <Text style={styles.distance}>{formatDistanceVi(nav.distanceM)}</Text>
            <Text style={styles.hint}>
              {nav.state === 'arrived'
                ? `Đã tới ${label}.`
                : nav.relativeDeg !== null
                  ? `${label} — ${relativeHintVi(nav.relativeDeg)}`
                  : `${label} — hướng ${compassPointVi(nav.bearingDeg)}`}
            </Text>
            {nav.state !== 'arrived' && nav.relativeDeg === null ? (
              <Text style={styles.mutedSmall}>
                Đi vài bước để máy bắt được hướng, rồi mũi tên sẽ quay theo đường anh đang đi.
              </Text>
            ) : null}
            {nav.state !== 'arrived' && nav.distanceM >= 150 ? (
              <Text style={styles.mutedSmall}>Đi bộ khoảng {walkMinutes(nav.distanceM)} phút.</Text>
            ) : null}
            {fix?.accuracyM != null && fix.accuracyM > POOR_ACCURACY_M ? (
              <Text style={styles.warnSmall}>
                Sai số GPS đang ±{Math.round(fix.accuracyM)} m — số đo trên chỉ là áng chừng.
              </Text>
            ) : null}
          </>
        ) : null}

        {/* ── Chặng xa: giao cho bản đồ ngoài ─────────────────────────────── */}
        <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={openExternalMaps}>
          <Icon name="directions" size={20} color={COLORS.white} />
          <Text style={styles.ctaTxt}>Mở bản đồ chỉ đường</Text>
        </TouchableOpacity>
        <Text style={styles.ctaNote}>
          Bản đồ ngoài chỉ được tới gần {kind === 'farm' ? 'vườn' : 'vườn'}; đoạn cuối trong vườn
          thì đi theo mũi tên ở trên.
        </Text>

        {/* ── Cây quanh đây ────────────────────────────────────────────────── */}
        {nearby.length > 0 ? (
          <View style={styles.nearbyBox}>
            <Text style={styles.nearbyTitle}>Cây quanh chỗ anh đứng</Text>
            {nearby.map(f => (
              <TouchableOpacity
                key={f.item.tree_id}
                style={styles.nearbyRow}
                activeOpacity={0.7}
                onPress={() => goTree(f.item, f.pos)}
              >
                <Icon name="tree" size={16} color={COLORS.success} />
                <Text style={styles.nearbyName} numberOfLines={1}>
                  {f.item.name || `Cây ${f.item.tree_id.slice(0, 6)}`}
                </Text>
                <Text style={styles.nearbyDist}>{formatDistanceVi(f.distanceM)}</Text>
                <Text style={styles.nearbyDir}>{compassPointVi(f.bearingDeg)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Kim chỉ hướng
// ---------------------------------------------------------------------------

interface NavState {
  distanceM: number;
  bearingDeg: number;
  state: ArrivalState;
  relativeDeg: number | null;
}

/**
 * Đã tới → dấu chốt, không mũi tên (mũi tên ở khoảng cách 0 chỉ quay loạn).
 * Đang đi → mũi tên quay theo hướng LỆCH.
 * Đứng yên → hoa gió Bắc-hướng-lên + mũi tên đặt theo góc phương-vị TUYỆT ĐỐI,
 *            kèm chữ "Bắc" để người dùng biết phải tự canh theo Bắc.
 */
const Needle: React.FC<{ nav: NavState }> = ({ nav }) => {
  if (nav.state === 'arrived') {
    return (
      <View style={styles.arrived}>
        <Icon name="map-marker-check" size={72} color={COLORS.success} />
      </View>
    );
  }
  const rotation = nav.relativeDeg !== null ? nav.relativeDeg : nav.bearingDeg;
  return (
    <View style={styles.rose}>
      {nav.relativeDeg === null ? <Text style={styles.roseNorth}>Bắc</Text> : null}
      <Icon
        name="navigation"
        size={92}
        color={nav.state === 'near' ? COLORS.success : COLORS.accent}
        style={{ transform: [{ rotate: `${rotation}deg` }] }}
      />
    </View>
  );
};

const Header: React.FC<{ label: string; onBack: () => void }> = ({ label, onBack }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={onBack} style={styles.back} hitSlop={8}>
      <Icon name="chevron-left" size={26} color={COLORS.text} />
    </TouchableOpacity>
    <Text style={styles.title} numberOfLines={1}>Đường tới {label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  scroll: { padding: 16, alignItems: 'center', paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },

  notice: {
    flexDirection: 'row', alignSelf: 'stretch', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.accentGlow, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  noticeTxt: { flex: 1, fontSize: 13, color: COLORS.textSub, lineHeight: 19 },

  dial: {
    width: 200, height: 200, borderRadius: 100, backgroundColor: COLORS.inputBg,
    alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 8,
  },
  rose: { alignItems: 'center', justifyContent: 'center' },
  roseNorth: { position: 'absolute', top: -76, fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  arrived: { alignItems: 'center', justifyContent: 'center' },

  distance: { fontSize: 40, fontWeight: '800', color: COLORS.text, marginTop: 18 },
  hint: { fontSize: 16, fontWeight: '600', color: COLORS.textSub, textAlign: 'center', marginTop: 4 },
  muted: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
  mutedSmall: { color: COLORS.textMuted, fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  warnSmall: { color: COLORS.warning, fontSize: 12.5, textAlign: 'center', marginTop: 6 },

  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22,
    backgroundColor: COLORS.accent, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14,
  },
  ctaTxt: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  ctaNote: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },

  nearbyBox: {
    alignSelf: 'stretch', marginTop: 24, backgroundColor: COLORS.card, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  nearbyTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSub, marginBottom: 4 },
  nearbyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  nearbyName: { flex: 1, fontSize: 14, color: COLORS.text },
  nearbyDist: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  nearbyDir: { fontSize: 12, color: COLORS.textMuted, width: 74, textAlign: 'right' },
});

export default WayfindScreen;
