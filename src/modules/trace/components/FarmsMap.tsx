/**
 * FarmsMap — VƯỜN CỦA TÔI TRÊN BẢN ĐỒ (thẻ "Bản đồ" ở trang Tổng quan).
 *
 * Nền OpenStreetMap. Mỗi vườn một ghim kèm TÊN; phóng vào thì các điểm nối ranh
 * được dựng lại thành VÙNG vườn; chạm ghim hay chạm vùng thì mở thẻ thông tin.
 *
 * ── Vì sao ghim là `MarkerView` chứ không phải `SymbolLayer` ────────────────
 * `SymbolLayer` vẽ chữ bằng GLYPH, mà glyph phải tải từ một endpoint khai trong
 * style. Bản đồ ở đây dựng từ RASTER thuần (chỉ có ô ảnh OSM/vệ tinh, không có
 * style vector), nên KHÔNG có nguồn glyph — `textField` sẽ ra rỗng và ta được
 * một hàng chấm không tên, đúng thứ vô dụng nhất trên một bản đồ nhiều vườn.
 * `MarkerView` bày View của React Native lên trên, chữ hiện chắc chắn và chạm
 * được như mọi nút khác. Đổi lại là chi phí mỗi ghim cao hơn — chấp nhận được vì
 * đây là vườn CỦA MỘT NGƯỜI, đếm bằng đầu ngón tay chứ không phải hàng nghìn.
 *
 * Vùng vườn thì ngược lại: đa giác là hình vector thuần, `ShapeSource` +
 * `FillLayer`/`LineLayer` vẽ đúng và rẻ, lại nhận được `onPress`.
 *
 * ── Vì sao TOÀN MÀN HÌNH không mount hai bản đồ ─────────────────────────────
 * Mở toàn màn hình thì thẻ nhỏ phía sau NGỪNG vẽ bản đồ và chỉ còn một tấm nền.
 * Giữ cả hai là giữ hai bề mặt OpenGL cùng lúc cho một thứ người dùng chỉ nhìn
 * được một — máy yếu sẽ nóng và giật ở đúng lúc người ta đang xem kỹ.
 *
 * ── Ô ảnh nền ───────────────────────────────────────────────────────────────
 * Cả hai nguồn LUÔN được mount, đổi bằng `rasterOpacity` chứ không tháo lắp —
 * maplibre-rn hay giữ lại layer cũ nên bấm "Vệ tinh" mà tháo layer thường thì
 * không ăn (đã gặp ở `FarmDetailScreen`). `maxZoomLevel={19}` là BẮT BUỘC: cả
 * hai nguồn chỉ có ảnh tới z19, thiếu khai báo thì ở z20 người dùng thấy ô
 * trắng. Khai 19 thì MapLibre kéo giãn ảnh z19 — mờ đi, không mất.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../../../components/Icon';
import { useTk } from '../../../i18n/keys';
import { BOUNDARY_METHOD } from '../../../services/farmService';
import {
  ELEVATION, NATURE, ORGANIC_CARD, RADIUS, SPACE, SURFACE, TONE, TYPE,
} from '../theme/depth';
import type { Farm } from '../types';
import {
  FALLBACK_CENTER, FALLBACK_ZOOM, FARM_FOCUS_ZOOM, POLYGON_MIN_ZOOM,
  farmAnchor, farmAreaM2, farmsBounds, formatFarmArea, pinFeatures, polygonFeatures,
  searchFarms,
} from '../utils/farmMapGeo';

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const SAT_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Cả hai nguồn chỉ có ảnh tới đây — xem chú thích đầu tệp. */
const TILE_MAX_ZOOM = 19;

/** Chiều cao thẻ gọn. Đủ để thấy cụm vườn, chưa chiếm chỗ của thời tiết bên dưới. */
const CARD_HEIGHT = 260;

/**
 * Số dòng gợi ý tìm kiếm nhiều nhất — ba ở thẻ gọn, sáu khi toàn màn hình.
 *
 * Thẻ gọn cao 260 px: sáu dòng gợi ý cộng thanh tìm là 282 px, tức danh sách bị
 * thẻ cắt cụt ở đúng chỗ không ai biết là còn dòng bên dưới.
 */
const MAX_SUGGESTIONS_COMPACT = 3;
const MAX_SUGGESTIONS_FULL = 6;

/**
 * Giá trị so sánh khi CHƯA chọn vườn nào — cố ý không trùng được `farm_id` nào,
 * để `filter` của lớp viền-vườn-đang-chọn không khớp feature nào.
 *
 * ⚠ Dựng bằng `String.fromCharCode(0)`, KHÔNG gõ chuỗi thoát vào đây:
 * công cụ soạn thảo biến chuỗi thoát thành BYTE THẬT ngay lúc ghi tệp — đo được
 * 2026-09-10, và nhiều khả năng đó chính là đường byte cũ đi vào.
 * Bản trước đặt thẳng một byte NUL ở đúng chỗ này. Byte đó không hiện ra trên
 * màn hình, nhưng nó làm `file(1)` xếp tệp thành `data` thay vì `text`, và
 * `grep -rn` trên cây nguồn in `Binary file … matches` thay vì in dòng — tức
 * TOÀN BỘ 819 dòng của tệp này biến mất khỏi mọi phép rà bằng grep, kể cả các
 * bài kiểm quét mã nguồn. Hỏng im lặng đúng nghĩa: không phép đo nào kêu.
 * `nulByteScan.test.ts` nay canh chỗ này.
 */
const NO_FARM_SELECTED = String.fromCharCode(0);

type BaseLayer = 'street' | 'satellite';

// ═══════════════════════════════════════════════════════════════════════════
// Thẻ thông tin vườn
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Một dòng số liệu. Thiếu dữ liệu thì hiện "—", KHÔNG hiện 0.
 *
 * "0 cây" là một khẳng định, và nó SAI ở ca hay gặp nhất: vườn đọc từ cache lúc
 * mất mạng thì không mang theo số đếm của máy chủ. Người dùng đọc "0 cây" rồi
 * tưởng dữ liệu bay mất.
 */
const Stat: React.FC<{ icon: IconName; label: string; value?: number | string | null }> = ({
  icon, label, value,
}) => (
  <View style={styles.stat}>
    <Icon name={icon} size={13} color={TONE.primary} />
    <Text style={styles.statValue} numberOfLines={1}>
      {value === null || value === undefined || value === '' ? '—' : String(value)}
    </Text>
    <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
  </View>
);

/**
 * Thẻ thông tin một vườn.
 *
 * `compact` dành cho thẻ bản đồ cao 260 px ở trang Tổng quan: ở đó thẻ đầy đủ
 * chiếm gần hết chiều cao và người dùng còn thấy đúng một mẩu bản đồ — tức là
 * chạm vào ghim thì mất luôn thứ vừa chạm. Bản gọn nói ba điều đủ để nhận ra
 * vườn (tên · diện tích · số cây) và mở vườn bằng một chạm nữa; muốn xem đủ thì
 * đã có nút toàn màn hình ngay trên đầu.
 */
const FarmPopup: React.FC<{
  farm: Farm;
  compact?: boolean;
  onClose: () => void;
  onOpen?: (farmId: string) => void;
}> = ({ farm, compact, onClose, onOpen }) => {
  const tk = useTk();
  // Diện tích: số của MÁY CHỦ trước, phép tính phía app chỉ là đường lùi khi vườn
  // đọc từ cache (cache không giữ `area_sqm`).
  const area = formatFarmArea(farm.areaM2 ?? farmAreaM2(farm));
  const hasBoundary = (farm.coordinates?.length ?? 0) >= 3;

  if (compact) {
    const bits = [
      area,
      typeof farm.treeCount === 'number' ? `${farm.treeCount} ${tk('trace.label.trees')}` : null,
    ].filter(Boolean) as string[];
    return (
      <Pressable
        style={({ pressed }) => [styles.popup, styles.popupMini, pressed && styles.pressed]}
        onPress={() => onOpen?.(farm.id)}
        accessibilityRole="button"
        accessibilityLabel={farm.name}
      >
        {farm.imageUrl ? (
          <Image source={{ uri: farm.imageUrl }} style={styles.miniThumb} />
        ) : (
          <View style={[styles.miniThumb, styles.popupThumbEmpty]}>
            <Icon name="tractor" size={16} color={TONE.primary} />
          </View>
        )}
        <View style={styles.popupHeadText}>
          <Text style={styles.miniName} numberOfLines={1}>{farm.name}</Text>
          <Text style={styles.miniSub} numberOfLines={1}>
            {bits.length > 0 ? bits.join(' · ') : tk('trace.farmMap.noBoundary')}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={tk('trace.farmMap.close')}>
          <Icon name="xmark" size={14} color={NATURE.barkSoft} />
        </Pressable>
      </Pressable>
    );
  }

  // Câu về ranh giới: nói CÁCH LẤY và SAI SỐ, vì một đường viền vẽ sắc nét trên
  // bản đồ trông như số liệu đo đạc, trong khi nó có thể chỉ là mấy cái chấm tay.
  let boundaryLine: string | null = null;
  if (!hasBoundary) {
    boundaryLine = tk('trace.farmMap.noBoundary');
  } else if (farm.boundaryMethod) {
    const how =
      farm.boundaryMethod === BOUNDARY_METHOD.gpsWalk ? tk('trace.farmMap.boundaryWalk')
        : farm.boundaryMethod === BOUNDARY_METHOD.mapDraw ? tk('trace.farmMap.boundaryManual')
          : farm.boundaryMethod === BOUNDARY_METHOD.mixed ? tk('trace.farmMap.boundaryMixed')
            // Nhãn lạ (kể cả `unknown` máy chủ tự gán khi lời khai không hợp lệ):
            // hiện NGUYÊN VĂN thay vì nuốt. Bịa một câu tiếng Việt cho một giá trị
            // chưa biết là nói thay máy chủ.
            : farm.boundaryMethod;
    const acc =
      typeof farm.boundaryAccM === 'number'
        ? tk('trace.farmMap.boundaryAcc', { n: Math.round(farm.boundaryAccM) })
        : tk('trace.farmMap.boundaryAccUnknown');
    // Máy chủ tự đo hình dạng ranh rồi CHẤM lời khai. Nó nói không khớp thì phải
    // hiện ra — giấu đi là để một lời khai sai đứng yên trong hồ sơ truy xuất.
    const verified = farm.methodVerified === false ? ` · ${tk('trace.farmMap.methodUnverified')}` : '';
    boundaryLine = `${how} · ${acc}${verified}`;
  }

  return (
    <View style={styles.popup}>
      <Pressable
        style={styles.popupClose}
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={tk('trace.farmMap.close')}
      >
        <Icon name="xmark" size={14} color={NATURE.barkSoft} />
      </Pressable>

      <View style={styles.popupHead}>
        {farm.imageUrl ? (
          <Image source={{ uri: farm.imageUrl }} style={styles.popupThumb} />
        ) : (
          <View style={[styles.popupThumb, styles.popupThumbEmpty]}>
            <Icon name="tractor" size={20} color={TONE.primary} />
          </View>
        )}
        <View style={styles.popupHeadText}>
          <Text style={TYPE.cardTitle} numberOfLines={2}>{farm.name}</Text>
          <Text style={styles.popupOwner} numberOfLines={1}>
            {`${tk('trace.farmMap.owner')}: ${farm.ownerDid?.trim() || tk('trace.farmMap.unknown')}`}
          </Text>
        </View>
      </View>

      <View style={styles.popupStats}>
        <Stat icon="draw-polygon" label={tk('trace.farmMap.area')} value={area} />
        <Stat icon="tree" label={tk('trace.label.trees')} value={farm.treeCount ?? null} />
        <Stat icon="apple-whole" label={tk('trace.label.fruits')} value={farm.fruitCount ?? null} />
        <Stat icon="cow" label={tk('trace.farmMap.animals')} value={farm.animalCount ?? null} />
      </View>

      {boundaryLine ? (
        <Text style={styles.popupNote} numberOfLines={2}>{boundaryLine}</Text>
      ) : null}

      {onOpen ? (
        <Pressable
          style={({ pressed }) => [styles.popupBtn, pressed && styles.pressed]}
          onPress={() => onOpen(farm.id)}
          accessibilityRole="button"
        >
          <Text style={styles.popupBtnTxt}>{tk('trace.farmMap.openFarm')}</Text>
          <Icon name="chevron-right" size={12} color={NATURE.paper} />
        </Pressable>
      ) : null}
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Thân bản đồ
// ═══════════════════════════════════════════════════════════════════════════

interface MapBodyProps {
  farms: Farm[];
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenFarm?: (farmId: string) => void;
}

const MapBody: React.FC<MapBodyProps> = ({
  farms, fullscreen, onToggleFullscreen, onOpenFarm,
}) => {
  const tk = useTk();
  const insets = useSafeAreaInsets();

  const [mapModule, setMapModule] = useState<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layer, setLayer] = useState<BaseLayer>('street');
  const [zoom, setZoom] = useState<number>(FALLBACK_ZOOM);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);
  const didFitRef = useRef(false);

  const loadMap = useCallback(async () => {
    try {
      const mod: any = await import('@maplibre/maplibre-react-native');
      // Gói này phát hành cả `export default` lẫn named export; chỗ khác trong
      // repo đã vấp đúng chỗ này nên chuẩn hoá MỘT lần ở đây.
      const M = mod?.MapView ? mod : mod?.default;
      if (M?.setAccessToken) {
        try { M.setAccessToken(null); } catch { /* không có token cũng chạy */ }
      }
      setMapError(null);
      setMapModule(M ?? null);
    } catch (err: any) {
      setMapError(err?.message ?? String(err));
    }
  }, []);

  useEffect(() => { loadMap(); }, [loadMap]);

  const bounds = useMemo(() => farmsBounds(farms), [farms]);
  const pins = useMemo(() => pinFeatures(farms), [farms]);
  const polys = useMemo(() => polygonFeatures(farms), [farms]);
  const suggestions = useMemo(
    () => (query.trim()
      ? searchFarms(farms, query).slice(0, fullscreen ? MAX_SUGGESTIONS_FULL : MAX_SUGGESTIONS_COMPACT)
      : []),
    [farms, query, fullscreen],
  );
  const selected = useMemo(
    () => farms.find((f) => f.id === selectedId) ?? null,
    [farms, selectedId],
  );
  const withoutCoords = useMemo(
    () => farms.filter((f) => farmAnchor(f) === null).length,
    [farms],
  );

  const fitAll = useCallback(() => {
    if (!bounds) return;
    try { cameraRef.current?.fitBounds(bounds.ne, bounds.sw, 48, 600); } catch { /* camera chưa gắn */ }
  }, [bounds]);

  // Ngắm hết vườn MỘT LẦN, khi vườn về tới. Không chạy lại mỗi lượt `farms` đổi:
  // danh sách được nạp lại mỗi lần màn lấy nét, và bay camera về giữa lúc người
  // dùng đang kéo bản đồ là giật thứ họ đang cầm khỏi tay.
  //
  // Cái chốt `didFitRef` phải đóng lúc camera ĐÃ bay, KHÔNG phải lúc hẹn giờ.
  // Bản trước đóng chốt ngay trước `setTimeout`, và mất hẳn lần ngắm ở ca hay
  // gặp nhất: `bounds` là `useMemo` theo `farms`, nên mỗi lần danh sách vườn về
  // lại (Home hâm nóng store rồi màn lấy nét nạp thêm) là một OBJECT mới ⇒ deps
  // đổi ⇒ React chạy hàm dọn (`clearTimeout`) rồi chạy lại effect ⇒ gặp chốt đã
  // đóng ⇒ thoát sớm. Hẹn giờ cũ bị huỷ, hẹn giờ mới không bao giờ được đặt:
  // camera nằm nguyên ở `FALLBACK_CENTER` và người dùng mở "Bản đồ" ra không
  // thấy vườn nào của mình. Không có gì đỏ, không có gì log.
  //
  // Đóng chốt trong thân hẹn giờ thì mỗi lần `farms` đổi chỉ dời lịch thêm
  // 350 ms — tức ngắm MỘT LẦN sau khi danh sách đã yên, đúng thứ chú thích dưới
  // đây hứa, và vẫn không giật bản đồ khỏi tay người đang kéo.
  useEffect(() => {
    if (didFitRef.current || !bounds || !mapModule) return;
    const t = setTimeout(() => { didFitRef.current = true; fitAll(); }, 350);
    return () => clearTimeout(t);
  }, [bounds, mapModule, fitAll]);

  const focusFarm = useCallback((farm: Farm) => {
    setSelectedId(farm.id);
    setSearching(false);
    setQuery('');
    const a = farmAnchor(farm);
    if (!a) return;
    try {
      cameraRef.current?.setCamera({
        centerCoordinate: [a.lng, a.lat],
        zoomLevel: Math.max(zoom, FARM_FOCUS_ZOOM),
        animationDuration: 600,
      });
    } catch { /* camera chưa gắn */ }
  }, [zoom]);

  // ── Các trạng thái không có bản đồ ────────────────────────────────────────
  if (mapError) {
    return (
      <View style={styles.center}>
        <Icon name="triangle-exclamation" size={22} color={TONE.sun} />
        <Text style={[TYPE.cardTitle, styles.centerTitle]}>{tk('trace.farmMap.failTitle')}</Text>
        <Text style={[TYPE.caption, styles.centerBody]} numberOfLines={2}>{mapError}</Text>
        <Pressable
          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
          onPress={() => { setMapError(null); setMapModule(null); loadMap(); }}
        >
          <Text style={styles.smallBtnTxt}>{tk('trace.farmMap.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!mapModule) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={TONE.primary} />
        <Text style={[TYPE.caption, styles.centerBody]}>{tk('trace.farmMap.loading')}</Text>
      </View>
    );
  }

  const MapLib = mapModule;
  if (!MapLib?.MapView) {
    return (
      <View style={styles.center}>
        <Icon name="map" size={22} color={NATURE.barkSoft} />
        <Text style={[TYPE.caption, styles.centerBody]}>{tk('trace.farmMap.unavailable')}</Text>
      </View>
    );
  }

  const topInset = fullscreen ? insets.top + SPACE.sm : SPACE.sm;

  return (
    <View style={styles.fill}>
      <MapLib.MapView
        style={StyleSheet.absoluteFillObject}
        logoEnabled={false}
        attributionEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        /* KÉO một ngón chỉ bật khi TOÀN MÀN HÌNH.
           Thẻ gọn nằm trong trang cuộn dọc; kéo một ngón trên bản đồ và cuộn
           trang là CÙNG một cử chỉ, nên ai thắng cũng là sai với một nửa số
           lần: hoặc trang đứng im khi người ta muốn cuộn xuống xem thời tiết,
           hoặc bản đồ đứng im khi người ta muốn kéo sang vườn bên cạnh.
           CHỤM HAI NGÓN thì không đụng gì tới cuộn trang, nên `zoomEnabled` để
           nguyên — phóng vào vẫn thấy ranh vườn hiện ra, đúng thứ thẻ này hứa.
           Muốn kéo đi khắp nơi thì bấm nút mở toàn màn hình. */
        scrollEnabled={fullscreen}
        onRegionDidChange={(f: any) => {
          const z = f?.properties?.zoomLevel;
          if (typeof z === 'number' && Number.isFinite(z)) setZoom(z);
        }}
        // Chạm ra chỗ trống = đóng thẻ thông tin. Đây là cách thoát ai cũng thử
        // trước tiên, và nó phải hoạt động kể cả khi nút ✕ bị ngón tay che.
        onPress={() => { setSelectedId(null); setSearching(false); }}
      >
        <MapLib.Camera
          ref={cameraRef}
          defaultSettings={
            bounds
              ? { bounds: { ne: bounds.ne, sw: bounds.sw, paddingTop: 48, paddingBottom: 48, paddingLeft: 24, paddingRight: 24 } }
              : { centerCoordinate: FALLBACK_CENTER, zoomLevel: FALLBACK_ZOOM }
          }
          minZoomLevel={3}
          maxZoomLevel={20}
        />

        <MapLib.RasterSource
          id="farms-osm"
          tileUrlTemplates={[OSM_TILES]}
          tileSize={256}
          maxZoomLevel={TILE_MAX_ZOOM}
        >
          <MapLib.RasterLayer id="farms-osm-layer" sourceID="farms-osm" />
        </MapLib.RasterSource>

        <MapLib.RasterSource
          id="farms-sat"
          tileUrlTemplates={[SAT_TILES]}
          tileSize={256}
          maxZoomLevel={TILE_MAX_ZOOM}
        >
          <MapLib.RasterLayer
            id="farms-sat-layer"
            sourceID="farms-sat"
            style={{ rasterOpacity: layer === 'satellite' ? 1 : 0 }}
          />
        </MapLib.RasterSource>

        {/* VÙNG vườn — dựng lại từ chính các điểm nối, chỉ hiện khi đã phóng đủ
            (xem `POLYGON_MIN_ZOOM`). Chạm vào vùng cũng mở thẻ thông tin, vì ở
            mức phóng đó vùng to hơn ghim nhiều và ngón tay sẽ trúng nó trước. */}
        {polys.features.length > 0 ? (
          <MapLib.ShapeSource
            id="farms-polygons"
            shape={polys as any}
            onPress={(e: any) => {
              const id = e?.features?.[0]?.properties?.farm_id;
              if (typeof id === 'string') setSelectedId(id);
            }}
          >
            <MapLib.FillLayer
              id="farms-polygons-fill"
              minZoomLevel={POLYGON_MIN_ZOOM}
              style={{ fillColor: 'rgba(22, 110, 67, 0.22)' }}
            />
            <MapLib.LineLayer
              id="farms-polygons-line"
              minZoomLevel={POLYGON_MIN_ZOOM}
              style={{ lineColor: TONE.primary, lineWidth: 2 }}
            />
            {/* Vườn đang chọn được tô đậm hơn — cùng nguồn, khác bộ lọc, nên
                không phải dựng thêm một FeatureCollection thứ hai. */}
            <MapLib.LineLayer
              id="farms-polygons-line-selected"
              minZoomLevel={POLYGON_MIN_ZOOM}
              filter={['==', 'farm_id', selectedId ?? NO_FARM_SELECTED]}
              style={{ lineColor: TONE.sun, lineWidth: 4 }}
            />
          </MapLib.ShapeSource>
        ) : null}

        {/* GHIM + TÊN. `MarkerView` chứ không phải SymbolLayer — xem đầu tệp. */}
        {pins.features.map((f) => {
          const [lng, lat] = (f.geometry as any).coordinates as [number, number];
          const isSel = f.properties.farm_id === selectedId;
          return (
            <MapLib.MarkerView
              key={f.properties.farm_id}
              coordinate={[lng, lat]}
              anchor={{ x: 0.5, y: 1 }}
              allowOverlap
            >
              <Pressable
                onPress={() => setSelectedId(f.properties.farm_id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={f.properties.name}
                style={styles.pinWrap}
              >
                <View style={[styles.pinLabel, isSel && styles.pinLabelSel]}>
                  <Text style={[styles.pinLabelTxt, isSel && styles.pinLabelTxtSel]} numberOfLines={1}>
                    {f.properties.name}
                  </Text>
                </View>
                <View style={[styles.pinDot, isSel && styles.pinDotSel]} />
                <View style={[styles.pinTail, isSel && styles.pinTailSel]} />
              </Pressable>
            </MapLib.MarkerView>
          );
        })}
      </MapLib.MapView>

      {/* ── Thanh tìm vườn ──────────────────────────────────────────────── */}
      <View style={[styles.topBar, { top: topInset }]} pointerEvents="box-none">
        <View style={styles.searchBox}>
          <Icon name="magnifying-glass" size={14} color={NATURE.barkSoft} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={(t) => { setQuery(t); setSearching(true); }}
            onFocus={() => setSearching(true)}
            placeholder={tk('trace.farmMap.search')}
            placeholderTextColor={NATURE.barkSoft}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => { setQuery(''); setSearching(false); }} hitSlop={10}>
              <Icon name="circle-xmark" size={14} color={NATURE.barkSoft} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={() => setLayer((l) => (l === 'street' ? 'satellite' : 'street'))}
          accessibilityRole="button"
          accessibilityLabel={tk(layer === 'street' ? 'trace.farmMap.satellite' : 'trace.farmMap.street')}
        >
          <Icon name={layer === 'street' ? 'satellite' : 'map'} size={16} color={NATURE.bark} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onToggleFullscreen}
          accessibilityRole="button"
          accessibilityLabel={tk(fullscreen ? 'trace.farmMap.close' : 'trace.farmMap.fullscreen')}
        >
          <Icon name={fullscreen ? 'xmark' : 'expand'} size={16} color={NATURE.bark} />
        </Pressable>
      </View>

      {searching && query.trim().length > 0 ? (
        <View style={[styles.suggestBox, { top: topInset + 46 }]}>
          {suggestions.length === 0 ? (
            <Text style={[TYPE.caption, styles.suggestEmpty]}>{tk('trace.farmMap.noResult')}</Text>
          ) : (
            suggestions.map((f) => (
              <Pressable
                key={f.id}
                style={({ pressed }) => [styles.suggestRow, pressed && styles.pressed]}
                onPress={() => focusFarm(f)}
              >
                <Icon
                  name={farmAnchor(f) ? 'location-dot' : 'circle-question'}
                  size={13}
                  color={farmAnchor(f) ? TONE.primary : NATURE.barkSoft}
                />
                <Text style={styles.suggestTxt} numberOfLines={1}>{f.name}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {/* ── Mép dưới: nút, ghi chú, thẻ vườn, dòng ghi nguồn ─────────────────
          MỘT cột xếp chồng, không phải mấy lớp cùng neo vào đáy. Neo riêng thì
          thẻ thông tin đè lên dòng ghi nguồn OpenStreetMap — mà dòng đó là nghĩa
          vụ giấy phép, không phải trang trí bỏ được. */}
      <View
        style={[styles.bottomStack, { bottom: (fullscreen ? insets.bottom : 0) + SPACE.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.bottomRow} pointerEvents="box-none">
          {bounds ? (
            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              onPress={fitAll}
              accessibilityRole="button"
              accessibilityLabel={tk('trace.farmMap.fitAll')}
            >
              <Icon name="location-crosshairs" size={16} color={NATURE.bark} />
            </Pressable>
          ) : <View />}

          <View style={styles.hintCol} pointerEvents="none">
            {zoom < POLYGON_MIN_ZOOM && polys.features.length > 0 ? (
              <Text style={styles.hintChip}>{tk('trace.farmMap.zoomHint')}</Text>
            ) : null}
            {withoutCoords > 0 ? (
              <Text style={styles.hintChip}>{tk('trace.farmMap.noCoords', { n: withoutCoords })}</Text>
            ) : null}
          </View>
        </View>

        {selected ? (
          <FarmPopup
            farm={selected}
            compact={!fullscreen}
            onClose={() => setSelectedId(null)}
            onOpen={onOpenFarm}
          />
        ) : null}

        {/* Giấy phép ODbL của OpenStreetMap đòi ghi nguồn ở nơi nhìn thấy được.
            `attributionEnabled={false}` ở trên chỉ tắt nút mặc định của thư viện
            (nó chiếm chỗ và mở một hộp thoại lạc lõng), không miễn nghĩa vụ ghi
            nguồn — nên dòng này KHÔNG được bỏ. */}
        <Text style={styles.attribution}>
          {layer === 'satellite' ? '© Esri · Maxar' : '© OpenStreetMap'}
        </Text>
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Thẻ gọn + toàn màn hình
// ═══════════════════════════════════════════════════════════════════════════

export const FarmsMapCard: React.FC<{
  farms: Farm[];
  onOpenFarm?: (farmId: string) => void;
}> = ({ farms, onOpenFarm }) => {
  const tk = useTk();
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <View style={styles.card}>
        {fullscreen ? (
          // Toàn màn hình đang mở → thẻ này NGỪNG vẽ bản đồ (xem đầu tệp).
          <View style={styles.center}>
            <Icon name="map-location-dot" size={22} color={NATURE.barkSoft} />
            <Text style={[TYPE.caption, styles.centerBody]}>{tk('trace.farmMap.inFullscreen')}</Text>
          </View>
        ) : (
          <MapBody
            farms={farms}
            fullscreen={false}
            onToggleFullscreen={() => setFullscreen(true)}
            onOpenFarm={onOpenFarm}
          />
        )}
      </View>

      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fullscreen}>
          <MapBody
            farms={farms}
            fullscreen
            onToggleFullscreen={() => setFullscreen(false)}
            onOpenFarm={(id) => { setFullscreen(false); onOpenFarm?.(id); }}
          />
        </View>
      </Modal>
    </>
  );
};

export default FarmsMapCard;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fullscreen: { flex: 1, backgroundColor: SURFACE.ground },

  card: {
    height: CARD_HEIGHT,
    marginHorizontal: SPACE.page,
    backgroundColor: SURFACE.sunken,
    borderWidth: 1,
    borderColor: TONE.border,
    overflow: 'hidden',
    ...ORGANIC_CARD,
  },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: SPACE.sm, padding: SPACE.lg,
  },
  centerTitle: { textAlign: 'center' },
  centerBody: { textAlign: 'center' },

  smallBtn: {
    marginTop: SPACE.xs,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm,
    borderRadius: RADIUS.chip, backgroundColor: TONE.primary,
  },
  smallBtnTxt: { color: NATURE.paper, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.9 },

  // ── Thanh trên ──────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute', left: SPACE.sm, right: SPACE.sm,
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    height: 38, paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.chip,
    backgroundColor: SURFACE.raised,
    borderWidth: 1, borderColor: TONE.border,
    ...ELEVATION.cardStrong,
  },
  searchInput: { flex: 1, fontSize: 15, color: NATURE.bark, padding: 0 },

  iconBtn: {
    width: 38, height: 38, borderRadius: RADIUS.chip,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE.raised,
    borderWidth: 1, borderColor: TONE.border,
    ...ELEVATION.cardStrong,
  },

  suggestBox: {
    position: 'absolute', left: SPACE.sm, right: SPACE.sm + 84,
    backgroundColor: SURFACE.raised,
    borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: TONE.border,
    paddingVertical: SPACE.xs,
    ...ELEVATION.sheet,
  },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  suggestTxt: { flex: 1, fontSize: 15, color: NATURE.bark },
  suggestEmpty: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },

  // ── Ghim ────────────────────────────────────────────────────────────────
  pinWrap: { alignItems: 'center' },
  pinLabel: {
    maxWidth: 148,
    paddingHorizontal: SPACE.sm, paddingVertical: 3,
    borderRadius: RADIUS.chip,
    backgroundColor: SURFACE.raised,
    borderWidth: 1, borderColor: TONE.border,
    marginBottom: 2,
  },
  pinLabelSel: { backgroundColor: TONE.primary, borderColor: TONE.primaryDeep },
  pinLabelTxt: { fontSize: 12, fontWeight: '700', color: NATURE.bark },
  pinLabelTxtSel: { color: NATURE.paper },
  pinDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: TONE.primary, borderWidth: 2.5, borderColor: NATURE.paper,
  },
  pinDotSel: { backgroundColor: TONE.sun },
  // Cái đuôi nhọn cho ghim trỏ đúng điểm — dựng bằng viền, không cần ảnh.
  pinTail: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: TONE.primary,
  },
  pinTailSel: { borderTopColor: TONE.sun },

  // ── Mép dưới ────────────────────────────────────────────────────────────
  bottomStack: {
    position: 'absolute', left: SPACE.sm, right: SPACE.sm,
    gap: SPACE.sm,
  },
  bottomRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  hintCol: { flex: 1, alignItems: 'flex-end', gap: 4 },
  hintChip: {
    fontSize: 11, color: NATURE.bark,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: SPACE.sm, paddingVertical: 3,
    borderRadius: RADIUS.chip, overflow: 'hidden',
  },
  attribution: {
    alignSelf: 'flex-end',
    fontSize: 10, color: NATURE.bark,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RADIUS.chip, overflow: 'hidden',
  },

  emptyVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTxt: {
    fontSize: 14, color: NATURE.bark, textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm,
    borderRadius: RADIUS.chip, overflow: 'hidden',
  },

  // ── Thẻ thông tin vườn ──────────────────────────────────────────────────
  popupMini: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  miniThumb: { width: 38, height: 38, borderRadius: RADIUS.field, backgroundColor: SURFACE.sunken },
  miniName: { fontSize: 15, fontWeight: '700', color: NATURE.bark },
  miniSub: { fontSize: 12, color: NATURE.barkSoft, marginTop: 1 },

  popup: {
    backgroundColor: SURFACE.raised,
    borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: TONE.border,
    padding: SPACE.md,
    ...ELEVATION.sheet,
  },
  popupClose: {
    position: 'absolute', right: SPACE.sm, top: SPACE.sm, zIndex: 2,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE.sunken,
  },
  popupHead: { flexDirection: 'row', gap: SPACE.md, paddingRight: 30 },
  popupThumb: { width: 52, height: 52, borderRadius: RADIUS.field, backgroundColor: SURFACE.sunken },
  popupThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  popupHeadText: { flex: 1, minWidth: 0 },
  popupOwner: { fontSize: 12, color: NATURE.barkSoft, marginTop: 2 },

  popupStats: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginTop: SPACE.md, gap: SPACE.sm,
  },
  stat: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACE.sm, paddingVertical: 5,
    borderRadius: RADIUS.chip, backgroundColor: SURFACE.sunken,
  },
  statValue: { fontSize: 14, fontWeight: '700', color: NATURE.bark, maxWidth: 92 },
  statLabel: { fontSize: 12, color: NATURE.barkSoft },

  popupNote: { fontSize: 12, color: NATURE.barkSoft, marginTop: SPACE.sm },

  popupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: SPACE.md, minHeight: 42,
    borderRadius: RADIUS.chip, backgroundColor: TONE.primary,
  },
  popupBtnTxt: { color: NATURE.paper, fontWeight: '700', fontSize: 15 },
});
