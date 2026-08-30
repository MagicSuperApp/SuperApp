/**
 * TreeLocationMap — cây này ở ĐÂU, vẽ trên nền OpenStreetMap.
 *
 * ── Có toạ độ thì CẮM GHIM, và cho đi tới được ──────────────────────────────
 * Máy chủ trả `gps: [lat, lon]` cho mọi cây công khai. Bản trước chỉ vẽ một vòng
 * mờ vì `gps_precision` vắng mặt, và người mua nhận được một mảng màu không chỉ
 * tới đâu cả. Nay: có toạ độ là có ghim, và có ghim thì có nút **Chỉ đường** mở
 * thẳng Google Maps — hai con số vô dụng trở thành một chỗ đi tới được.
 *
 * Vòng vẫn còn, nhưng chỉ khi máy chủ TỰ KHAI là đã làm thô (`gps_precision`
 * = `coarse`, kèm `gps_precision_m`). Đó là lúc duy nhất ta biết chắc bán kính
 * để vẽ. Không khai gì thì không vẽ vòng — vẽ một vòng bịa bán kính còn tệ hơn
 * không vẽ, vì nó trông như một phép đo.
 *
 * Bản đồ nạp ĐỘNG (`await import`) giống `FarmsMap`: gói maplibre là mã nền, và
 * máy chưa dựng lại native sẽ ném ngay lúc nạp. Nạp động thì lỗi rơi vào một ô
 * nhỏ có nút thử lại, thay vì làm trắng cả màn nguồn gốc — mà phần quan trọng
 * nhất của màn (ảnh, tên cây, nhật ký) thì chẳng liên quan gì tới bản đồ.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '../../components/Icon';
import { NATURE, RADIUS, SPACE, TONE, TYPE } from '../../modules/trace/theme/depth';
import { circleShape, zoomForRadius } from './circleGeo';
import { googleDirectionsUrl } from './reverseGeocode';

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const SAT_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Cả hai nguồn chỉ có ảnh tới z19 — khai thiếu thì z20 ra ô trắng. */
const TILE_MAX_ZOOM = 19;

const MAP_HEIGHT = 220;

export interface TreeLocationMapProps {
  lat: number;
  lon: number;
  /**
   * Bán kính vòng, mét — CHỈ truyền khi máy chủ tự khai `gps_precision='coarse'`
   * kèm `gps_precision_m`. `null` ⇒ không vẽ vòng nào (xem đầu tệp).
   */
  radiusM: number | null;
  /** Dòng địa chỉ hiện dưới bản đồ. `null` thì không hiện gì. */
  caption: string | null;
  /** Tên cây — đưa vào nhãn ghim để bản đồ nói được nó đang chỉ cái gì. */
  label?: string | null;
  width: number;
}

const TreeLocationMap: React.FC<TreeLocationMapProps> = ({
  lat, lon, radiusM, caption, label, width,
}) => {
  const [MapLib, setMapLib] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sat, setSat] = useState(false);

  const load = useCallback(async () => {
    try {
      const mod: any = await import('@maplibre/maplibre-react-native');
      // Gói phát hành cả default lẫn named export — chuẩn hoá một lần, như FarmsMap.
      const M = mod?.MapView ? mod : mod?.default;
      if (M?.setAccessToken) {
        try { M.setAccessToken(null); } catch { /* không token vẫn chạy */ }
      }
      setErr(null);
      setMapLib(M ?? null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Vòng CHỈ dựng khi có bán kính máy chủ khai. Không có thì `null`, và phần
  // JSX bên dưới không vẽ gì — chứ không vẽ một vòng bịa bán kính.
  const ring = useMemo(
    () => (radiusM && radiusM > 0 ? circleShape({ lat, lon }, radiusM) : null),
    [lat, lon, radiusM],
  );
  const zoom = useMemo(
    () => (radiusM && radiusM > 0 ? zoomForRadius(lat, radiusM, width) : 16),
    [lat, radiusM, width],
  );

  const openDirections = () => {
    Linking.openURL(googleDirectionsUrl(lat, lon))
      .catch(() => { /* máy không có trình duyệt lẫn Google Maps — không còn đường nào */ });
  };

  if (err) {
    return (
      <View style={[styles.box, styles.center]}>
        <Icon name="triangle-exclamation" size={20} color={TONE.sun} />
        <Text style={[TYPE.caption, styles.dim]} numberOfLines={2}>
          {'Chưa mở được bản đồ trên máy này. ' + err}
        </Text>
        <Pressable onPress={() => { setErr(null); void load(); }} style={styles.retry} hitSlop={8}>
          <Icon name="arrows-rotate" size={12} color={TONE.primary} />
          <Text style={styles.retryTxt}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  if (!MapLib) {
    return (
      <View style={[styles.box, styles.center]}>
        <ActivityIndicator color={TONE.primary} />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.box}>
        <MapLib.MapView
          style={StyleSheet.absoluteFillObject}
          logoEnabled={false}
          attributionEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          /* KÉO một ngón bị TẮT: ô này nằm trong một trang cuộn dọc, và kéo bản
             đồ với cuộn trang là cùng một cử chỉ. Chụm hai ngón để phóng vẫn
             chạy — nó không đụng gì tới cuộn. */
          scrollEnabled={false}
        >
          <MapLib.Camera
            defaultSettings={{ centerCoordinate: [lon, lat], zoomLevel: zoom }}
            minZoomLevel={3}
            maxZoomLevel={19}
          />

          <MapLib.RasterSource
            id="prov-osm"
            tileUrlTemplates={[OSM_TILES]}
            tileSize={256}
            maxZoomLevel={TILE_MAX_ZOOM}
          >
            <MapLib.RasterLayer id="prov-osm-layer" sourceID="prov-osm" />
          </MapLib.RasterSource>

          {/* Hai nguồn LUÔN mount, đổi bằng `rasterOpacity`: maplibre-rn hay giữ
              lại layer cũ nên tháo lắp theo state thì bấm "Vệ tinh" không ăn. */}
          <MapLib.RasterSource
            id="prov-sat"
            tileUrlTemplates={[SAT_TILES]}
            tileSize={256}
            maxZoomLevel={TILE_MAX_ZOOM}
          >
            <MapLib.RasterLayer
              id="prov-sat-layer"
              sourceID="prov-sat"
              style={{ rasterOpacity: sat ? 1 : 0 }}
            />
          </MapLib.RasterSource>

          {/* Vòng khu vực — CHỈ khi máy chủ khai bán kính. Đa giác theo TOẠ ĐỘ,
              không phải `CircleLayer` theo pixel; xem đầu `circleGeo`. Vẽ mờ và
              nét đứt, để cái ghim vẫn là thứ mắt bắt trước. */}
          {ring ? (
            <MapLib.ShapeSource id="prov-ring" shape={ring as any}>
              <MapLib.FillLayer
                id="prov-ring-fill"
                style={{ fillColor: 'rgba(22,110,67,0.13)' }}
              />
              <MapLib.LineLayer
                id="prov-ring-line"
                style={{ lineColor: TONE.primary, lineWidth: 1.5, lineDasharray: [2, 2] }}
              />
            </MapLib.ShapeSource>
          ) : null}

          {/* GHIM — luôn có, vì luôn có toạ độ. Nhãn mang tên cây: một cái chấm
              không tên trên bản đồ không nói được nó đang chỉ cái gì. */}
          <MapLib.MarkerView coordinate={[lon, lat]} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <View style={styles.pinWrap}>
              {label ? (
                <View style={styles.pinLabel}>
                  <Text style={styles.pinLabelTxt} numberOfLines={1}>{label}</Text>
                </View>
              ) : null}
              <View style={styles.pinDot} />
              <View style={styles.pinTail} />
            </View>
          </MapLib.MarkerView>
        </MapLib.MapView>

        <Pressable
          onPress={() => setSat((s) => !s)}
          style={({ pressed }) => [styles.satBtn, pressed && styles.pressed]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={sat ? 'Xem bản đồ thường' : 'Xem ảnh vệ tinh'}
        >
          <Icon name={sat ? 'map' : 'satellite'} size={14} color={NATURE.bark} />
          <Text style={styles.satTxt}>{sat ? 'Bản đồ' : 'Vệ tinh'}</Text>
        </Pressable>

        {/* CHỈ ĐƯỜNG — lý do tồn tại của cái ghim. Không có nút này thì toạ độ
            vẫn chỉ là hai con số, chỉ khác là nay có một chấm đè lên. */}
        <Pressable
          onPress={openDirections}
          style={({ pressed }) => [styles.dirBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Chỉ đường tới cây bằng Google Maps"
        >
          <Icon name="location-crosshairs" size={14} color={NATURE.paper} />
          <Text style={styles.dirTxt}>Chỉ đường</Text>
        </Pressable>
      </View>

      {caption ? <Text style={[TYPE.caption, styles.caption]}>{caption}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    height: MAP_HEIGHT,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    backgroundColor: NATURE.soilDeep,
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, padding: SPACE.lg },
  dim: { textAlign: 'center' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  retryTxt: { fontSize: 13, fontWeight: '600', color: TONE.primary },
  caption: { marginTop: SPACE.sm },
  satBtn: {
    position: 'absolute', right: SPACE.sm, top: SPACE.sm,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: RADIUS.chip, paddingHorizontal: 10, paddingVertical: 6,
  },
  satTxt: { fontSize: 12, fontWeight: '600', color: NATURE.bark },
  pressed: { opacity: 0.7 },
  dirBtn: {
    position: 'absolute', right: SPACE.sm, bottom: SPACE.sm,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: TONE.primary,
    borderRadius: RADIUS.chip, paddingHorizontal: 12, paddingVertical: 8,
  },
  dirTxt: { fontSize: 12.5, fontWeight: '700', color: NATURE.paper },
  pinWrap: { alignItems: 'center' },
  pinLabel: {
    maxWidth: 160, marginBottom: 3,
    backgroundColor: NATURE.paper, borderRadius: RADIUS.chip,
    paddingHorizontal: 9, paddingVertical: 3,
    borderWidth: 1, borderColor: TONE.primary,
  },
  pinLabelTxt: { fontSize: 11.5, fontWeight: '700', color: TONE.primaryDeep },
  pinDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: TONE.primary, borderWidth: 3, borderColor: NATURE.paper,
  },
  pinTail: {
    width: 2, height: 10, backgroundColor: TONE.primary, marginTop: -1,
  },
});

export default TreeLocationMap;
