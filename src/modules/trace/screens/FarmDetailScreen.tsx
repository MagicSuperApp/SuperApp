// modules/trace/screens/FarmDetailScreen.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  TextInput,
  DeviceEventEmitter,
  PermissionsAndroid,
  BackHandler,
  Animated,
  PanResponder,
  Pressable,
  Modal,
} from 'react-native';
// Icon: bo Font Awesome Solid tai qua Iconify (assets/icons -> icons.generated).
// Them icon moi: `node scripts/icons.js <ten-fa6-solid>`.
import Icon from '../../../components/Icon';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { addFarm, setTrees, addTree, saveFarm, loadTrees, saveTree, loadFarm, syncTreesFromBackend } from '../store/farmSlice';
import { database } from '../../../utils/database';
import Geolocation from 'react-native-geolocation-service';
import { COLORS } from '../../../constants';
// Nen huu co dung chung cua module (tong dat/la) - xem theme/depth.ts
import {
  SURFACE as ORG_SURFACE, TONE as ORG_TONE, NATURE as ORG_NATURE,
  ORGANIC_CARD, ORGANIC_TILE, ELEVATION as ORG_ELEV, SPACE as ORG_SPACE,
  GRADIENT as ORG_GRADIENT,
} from '../theme/depth';
import { GradientFill, GroundBackdrop } from '../components/layered/Organic';
import { BentoRow, BentoTile } from '../components/layered/Surface';
import FarmShape from '../components/layered/FarmShape';
import RingProgress from '../components/layered/RingProgress';
import { OSM_STREET_TILES } from '../../../features/space3d/mapTiles';
import { useTk } from '../../../i18n/keys';
// B2: tạo vườn QUA field-reid (server sinh farm_id uuid THẬT) — bỏ aladinAPI
// (backend Lợi deprecated + client tự sinh `farm-<ts>` = gốc B2). INV-1 §3.2.
import { BOUNDARY_METHOD, createFarm as createReidFarm, updateFarm } from '../../../services/farmService';
import { ensureOrilifeToken } from '../../../services/orilifeDidAuth';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import { fieldErrorMessage } from '../../../services/treeReIDService';
// We dynamically load MapLibre so the app can still run if the native module is missing
// (e.g. not linked / not supported on the current device). We load it inside the
// AddFarmMode component to avoid crashing on app startup.
let MapLibreGL: any = null;

import PaginationControls from '../components/PaginationControls';
import EntityTimeline from '../components/EntityTimeline';
import CommonPopup from '../components/CommonPopup';
import StateView from '../../../components/state/StateView';
import { useAppDispatch } from '../../../store/hooks';
import { formatTreeName, shortTreeCode } from '../../../utils/treeNameFormatter';
import {
  classifySpeed,
  validatePolygon,
  formatDistance,
  formatArea,
  decideWalkAway,
  initWalkAwayState,
  decidePointAccept,
  areaSquareMeters,
  perimeterMeters,
  decideTapInsert,
  MIN_POINTS_TO_DEFINE,
  MIN_FARM_AREA_SQM,
  MAX_VERTICES,
  type Coord,
  type WalkAwayState,
} from '../utils/polygonGuards';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { KeyboardAvoidingView } from 'react-native';
// `WayfindButton` không còn nhập ở đây: ô "Chỉ đường" nay là một ô Bento như hai
// ô cạnh nó, dựng từ `useOpenWayfind` + `forFarm`. Nhúng một nút mang kiểu dáng
// riêng vào giữa lưới là chỗ lưới bắt đầu rã.
import { forFarm, useOpenWayfind } from '../../../features/wayfind/WayfindButton';
import { showError, showInfo, showWarning } from '../../../utils/alert';
import { t } from '../../../i18n';

const { width, height } = Dimensions.get('window');

const ITEMS_PER_PAGE = 10;

/**
 * Chỗ chừa cho thanh hành động đáy ở khung hình ĐẦU TIÊN, trước khi `onLayout`
 * trả về chiều cao thật.
 *
 * ⚠ Đây KHÔNG phải chiều cao của thanh — nó là một cận TRÊN cố ý lấy dư. Đừng
 * chỉnh nó cho "khớp": chiều cao thật đến ở khung ngay sau và ghi đè giá trị này.
 * Ai thấy khoảng trắng ở đáy thì chỗ cần sửa là thanh, không phải con số ở đây.
 */
const CHUA_DO_THANH_DAY = 168;

/**
 * Màu phát sáng của ô không gian — PHẢI khớp `SANG` trong `layered/FarmShape`.
 *
 * Hai chỗ vì huy hiệu là JSX của màn còn hình là SVG của component, mà chúng
 * nằm chồng lên nhau nên lệch một sắc là thấy ngay. Ghi ra đây để lần sau đổi
 * thì đổi cả hai.
 */
const SANG_KHONG_GIAN = '#7FE7C4';

interface RouteParams { farm?: any | null }

const requestLocationPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Quyền truy cập vị trí',
          message: t('{brand} cần quyền truy cập vị trí để ghi nhận ranh giới nông trại.'),
          buttonNeutral: 'Hỏi lại sau',
          buttonNegative: 'Từ chối',
          buttonPositive: 'Cho phép',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }

  // iOS: Request authorization explicitly
  try {
    const status = await Geolocation.requestAuthorization('whenInUse');
    console.log('[iOS] Location authorization status:', status);
    return status === 'granted';
  } catch (error) {
    console.error('[iOS] Location authorization error:', error);
    return false;
  }
};
// ── Add Farm Mode Error Boundary ──────────────────────────────────────────────
class AddFarmErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    console.error('[AddFarmErrorBoundary] Caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AddFarmErrorBoundary] Component error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
          <Icon name="circle-exclamation" size={48} color={COLORS.error} />
          <Text style={[styles.mapFallbackText, { marginTop: 16, textAlign: 'center' }]}>
            Đã xảy ra lỗi khi tải màn hình thêm trang trại
          </Text>
          {this.state.error && (
            <Text style={[styles.mapFallbackText, { marginTop: 8, fontSize: 12, color: COLORS.textMuted }]}>
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.recordBtn, { marginTop: 20, paddingVertical: 12, paddingHorizontal: 20 }]}
            onPress={() => this.setState({ hasError: false, error: undefined })}
            activeOpacity={0.8}
          >
            <Text style={[styles.recordBtnText, { color: COLORS.white }]}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    console.error('[MapErrorBoundary] getDerivedStateFromError:', error);
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MapErrorBoundary] componentDidCatch:', error, info);
  }

  render() {
    if (this.state.hasError) {
      console.log('[MapErrorBoundary] Rendering error fallback');
      return (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>Không thể tải bản đồ. Vui lòng thử lại sau.</Text>
        </View>
      );
    }

    console.log('[MapErrorBoundary] Rendering children');
    return this.props.children;
  }
}

// ── Nút cây ─────────────────────────────────────────────────────
//
// Một cây = một nút TRÒN, trong lòng chỉ có TÊN, quanh viền là vòng tiến độ thu.
//
// ── Thẻ cũ mang gì, và vì sao bỏ ─────────────────────────────────
// Mỗi thẻ là một hàng ngang đầy: biểu tượng cây · tên · mã · chip 3D · thanh
// tiến độ · phần trăm · mũi tên phải. Bảy thứ cho một cây, và bốn trong đó
// giống hệt nhau ở MỌI thẻ:
//
//   biểu tượng cây   cây nào cũng là cây — không phân biệt được thẻ nào với thẻ nào
//   mũi tên phải    cả danh sách đều bấm được; mũi tên nói một điều ai cũng biết
//   mã cây         chuỗi băm ngắn, không ai đọc — tên mới là thứ nhà vườn gọi
//
// Một hàng ngang cũng chỉ xếp được MỘT cây mỗi dòng, nên vườn 128 cây thành
// 128 dòng phải cuộn. Lưới ba cột cho một màn chứa ~12 cây thay vì ~4.
//
// ── Vòng tiến độ bao quanh, không phải thanh nằm dưới ──────────────────
// Tiến độ và cây thành MỘT khối: mắt không phải nối một thanh ngang với một cái
// tên ở chỗ khác. Xem `RingProgress`.
const TreeChip = ({
  item,
  farm,
  size,
  onPress,
}: {
  item: any;
  farm?: any;
  size: number;
  onPress: () => void;
}) => {
  // ⛔ `?? 0` ở hai dòng này từng biến "chưa biết" thành "bằng không".
  //
  // `harvestProgress` trong toàn bộ `src/` có BA chỗ đọc và KHÔNG chỗ nào ghi;
  // `mapTreeInfoToUI` (`services/treeReIDService.ts`) gõ cứng `fruitCount: 0`.
  // Nên mọi cây trong lưới hiện `0 quả` với vòng rỗng — một con số bịa mang
  // hình dạng số đo, và người cầm máy ngoài ruộng chép nó vào báo cáo.
  //
  // `null` đi thẳng tới `RingProgress` (vòng nét đứt) và tới chữ "chưa đếm".
  // Cây thật sự chưa thu quả nào vẫn hiện `0 quả` với vòng nét liền — hai
  // trạng thái đó phải ra hai hình khác nhau, đó là toàn bộ điểm của chỗ này.
  const harvestPct = item.harvestProgress ?? null;
  const soQua = item.fruitCount ?? null;
  const ten = formatTreeName(item, farm);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{ width: size, alignItems: 'center' }}
      accessibilityRole="button"
      accessibilityLabel={
        `${ten}, ` +
        (soQua === null ? 'chưa đếm quả' : `${soQua} quả`) +
        ', ' +
        (harvestPct === null ? 'chưa có số liệu thu hoạch' : `đã thu ${harvestPct}%`)
      }
    >
      {/*
        BA phần, một khối. Không phần nào có nền riêng, viền riêng, hay bo góc
        riêng — chúng ngồi chung trong lòng một hình tròn duy nhất, nên mắt đọc
        ra một vật chứ không ra ba vật xếp chồng.

        Thứ nối chúng lại là MÀU: số quả và cung tiến độ dùng chung sắc xanh
        chủ đạo, còn tên là chữ tối. Nên "phần đã thu" ở viền và "quả đang có" ở
        giữa nói cùng một chuyện bằng cùng một màu, còn cái tên đứng riêng ra
        làm nhãn.
      */}
      <RingProgress pct={harvestPct} size={size} stroke={5}>
        <Text style={styles.treeChipTen} numberOfLines={2}>{ten}</Text>
        <View style={styles.treeChipGach} />
        <Text style={styles.treeChipSo} numberOfLines={1}>
          {soQua === null ? (
            <Text style={styles.treeChipDonVi}>chưa đếm</Text>
          ) : (
            <>
              {soQua}
              <Text style={styles.treeChipDonVi}> quả</Text>
            </>
          )}
        </Text>
      </RingProgress>
    </TouchableOpacity>
  );
};

// ── GPS Recording Pulse ───────────────────────────────────────────────────────
const RecordingPulse = () => {
  return (
    <View style={styles.pulseWrap}>
      <View style={styles.pulseDot} />
    </View>
  );
};

// ── ADD FARM MODE (Build 55 — full-screen map redesign) ─────────────────────
//
//  Bản đồ chiếm TOÀN màn hình. Điều khiển nổi quanh mép, không che bản đồ:
//    - Trên-trái : quay lại
//    - Trên-giữa : chu vi · diện tích · số điểm (thời gian thực)
//    - Trên-phải : đổi bản đồ thường ⇄ vệ tinh (mặc định: thường)
//    - Phải-giữa : zoom+, zoom−, về vị trí của tôi
//    - Dưới      : chuyển chế độ [Tự động ghi | Tự vẽ điểm], tên vườn, hành động
//  Điểm ranh giới: kéo-thả để chỉnh; nhấn để mở popup chi tiết + nút Xoá.
// Đỉnh ranh giới CÓ SỐ THỨ TỰ — dùng MarkerView (view thật của RN nên số luôn
// hiển thị; khác PointAnnotation bị render ra bitmap trên Android làm mất số/điểm).
// Kéo-thả bằng PanResponder + đổi toạ-độ-màn ⇄ GPS qua ref của MapView.
const DraggableVertex = ({
  Marker,
  index,
  coord,
  isSelected,
  mapRef,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  onPress,
}: {
  Marker: any;
  index: number;
  coord: { lat: number; lng: number };
  isSelected: boolean;
  mapRef: React.MutableRefObject<any>;
  onDragStart: () => void;
  onDragMove: (index: number, lat: number, lng: number) => void;
  onDragEnd: (index: number, lat: number, lng: number) => void;
  onDragCancel: () => void;
  onPress: (index: number) => void;
}) => {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const baseRef = useRef<[number, number] | null>(null);
  const convertingRef = useRef(false);

  // PanResponder tạo 1 lần → dùng ref để luôn đọc index/coord/handler mới nhất.
  const stateRef = useRef({ index, coord, onDragStart, onDragMove, onDragEnd, onDragCancel, onPress });
  stateRef.current = { index, coord, onDragStart, onDragMove, onDragEnd, onDragCancel, onPress };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        const s = stateRef.current;
        s.onDragStart();
        baseRef.current = null;
        // Vị trí màn của đỉnh (px) tại thời điểm bắt đầu kéo.
        mapRef.current?.getPointInView([s.coord.lng, s.coord.lat])
          .then((p: [number, number]) => { baseRef.current = p; })
          .catch(() => { baseRef.current = null; });
      },
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: g.dx, y: g.dy }); // di chuyển view mượt theo tay
        const base = baseRef.current;
        if (!base || convertingRef.current || !mapRef.current) return;
        // Chuyển vị-trí-màn hiện tại → GPS để đường bao/diện tích cập nhật theo.
        convertingRef.current = true;
        mapRef.current.getCoordinateFromView([base[0] + g.dx, base[1] + g.dy])
          .then((pos: [number, number]) => {
            const s = stateRef.current;
            if (pos) s.onDragMove(s.index, pos[1], pos[0]);
          })
          .catch(() => { })
          .finally(() => { convertingRef.current = false; });
      },
      onPanResponderRelease: (_e, g) => {
        const s = stateRef.current;
        const moved = Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4;
        const base = baseRef.current;
        if (!moved) {
          // Chạm (không kéo) → mở popup chi tiết điểm.
          pan.setValue({ x: 0, y: 0 });
          s.onDragCancel();
          s.onPress(s.index);
          return;
        }
        if (!base || !mapRef.current) {
          pan.setValue({ x: 0, y: 0 });
          s.onDragCancel();
          return;
        }
        mapRef.current.getCoordinateFromView([base[0] + g.dx, base[1] + g.dy])
          .then((pos: [number, number]) => {
            if (pos) s.onDragEnd(s.index, pos[1], pos[0]);
            else s.onDragCancel();
          })
          .catch(() => s.onDragCancel())
          .finally(() => { pan.setValue({ x: 0, y: 0 }); });
      },
      onPanResponderTerminate: () => {
        pan.setValue({ x: 0, y: 0 });
        stateRef.current.onDragCancel();
      },
    }),
  ).current;

  return (
    <Marker coordinate={[coord.lng, coord.lat]} allowOverlap anchor={{ x: 0.5, y: 0.5 }}>
      <Animated.View
        {...responder.panHandlers}
        style={[styles.vertexTouch, { transform: pan.getTranslateTransform() }]}
      >
        <View style={[styles.vertexDot, isSelected && styles.vertexDotSelected]}>
          <Text style={styles.vertexDotText}>{index + 1}</Text>
        </View>
      </Animated.View>
    </Marker>
  );
};

const DEFAULT_CENTER: [number, number] = [106.660172, 10.762622];

/** Ranh này lấy bằng cách nào, và sai số bao nhiêu mét. */
interface BoundaryMeta {
  /** `BOUNDARY_METHOD.gpsWalk` khi đi vòng quanh vườn, `.mapDraw` khi chấm tay. */
  method: string;
  /**
   * Sai số GPS, mét. `null` = KHÔNG ĐO ĐƯỢC, và đó là ca đúng cho ranh chấm
   * tay: điểm chấm lên bản đồ không có sai số GPS nào cả. Gửi 0 ở đó là khai
   * với máy chủ rằng ranh này chính xác tuyệt đối.
   */
  accM: number | null;
}

const AddFarmMode = ({
  coordinates,
  setCoordinates,
  editMode,
  setEditMode,
  editHistoryLength,
  onPointCandidate,
  onCaptureNow,
  onFinish,
  onBack,
  rejectReason,
  farmName,
  onFarmNameChange,
  onVertexDragEnd,
  onManualTapAppend,
  onDeleteVertex,
  onUndo,
  onResetFromScratch,
  isSaving,
}: {
  coordinates: { lat: number; lng: number }[];
  setCoordinates: React.Dispatch<React.SetStateAction<{ lat: number; lng: number }[]>>;
  /** 'recording' = auto GPS polling · 'edit-ready' = walk-away đã dừng. */
  editMode: 'recording' | 'edit-ready';
  setEditMode: React.Dispatch<React.SetStateAction<'recording' | 'edit-ready'>>;
  editHistoryLength: number;
  onPointCandidate: (lat: number, lng: number, accuracy: number | null) => void;
  onCaptureNow: () => Promise<void>;
  /**
   * Lưu vườn. Kèm theo CÁCH LẤY RANH và SAI SỐ để máy chủ ghi lại — xem
   * `BoundaryMeta`. Không có hai thứ đó thì một đường viền chấm tay và một
   * đường viền đi bộ đo GPS trông y hệt nhau về sau, mà chúng lệch nhau cả chục
   * mét.
   */
  onFinish: (meta: BoundaryMeta) => void;
  onBack: () => void;
  rejectReason?: string | null;
  farmName: string;
  onFarmNameChange: (next: string) => void;
  onVertexDragEnd: (index: number, lat: number, lng: number) => void;
  /** Chế độ tự vẽ: nhấn bản đồ → thêm điểm vào cuối polygon. */
  onManualTapAppend: (lat: number, lng: number) => void;
  /** Xoá điểm theo index (từ popup chi tiết điểm). */
  onDeleteVertex: (index: number) => void;
  onUndo: () => void;
  onResetFromScratch: () => void;
  /** B2: đang gọi backend tạo vườn → khoá nút Lưu + hiện spinner (§7.3). */
  isSaving?: boolean;
}) => {
  const insets = useSafeAreaInsets();

  // Chế độ vẽ ranh giới:
  //   'auto'   — đi vòng quanh vườn, GPS tự ghi điểm (watchPosition).
  //   'manual' — nhấn lên bản đồ để thêm điểm; kéo để chỉnh; nhấn điểm để xoá.
  const [drawMode, setDrawMode] = useState<'auto' | 'manual'>('auto');
  const [isAutoRecording, setIsAutoRecording] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  /**
   * Sai số GPS TỆ NHẤT gặp trong lúc đi vòng — con số đại diện cho cả vòng ranh.
   *
   * Không dùng `lastAccuracy` (số của lần đọc cuối): người ta thường dừng lại ở
   * chỗ thoáng để bấm Lưu, nên lần đọc cuối hay là lần đẹp nhất cả buổi — lấy nó
   * làm sai số của cả vòng là khai thấp đi đúng chỗ nó tệ nhất, dưới tán cây.
   * Ref chứ không state: nó không vẽ ra gì, đổi mỗi giây một lần thì vẽ lại cả
   * bản đồ là phí.
   */
  const worstAccRef = useRef<number | null>(null);
  // Loại bản đồ: 'normal' (OSM đường phố) mặc định · 'satellite' (ảnh vệ tinh Esri).
  const [mapType, setMapType] = useState<'normal' | 'satellite'>('normal');
  // Popup chi tiết điểm (index) khi user nhấn vào một marker.
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  // Vị trí preview khi đang kéo 1 điểm — để đường bao/chấm di chuyển mượt theo tay.
  const [dragPreview, setDragPreview] = useState<{ i: number; lat: number; lng: number } | null>(null);
  // Khi đang kéo 1 đỉnh → tắt pan bản đồ để không xê dịch nền.
  const [draggingActive, setDraggingActive] = useState(false);
  const mapViewRef = useRef<any>(null);

  // Thêm 1 điểm tại vị-trí chạm trên bản-đồ (chế-độ "Tự vẽ điểm"). Callback nhận thẳng
  // GeoJSON.Feature: geometry.coordinates = [lng, lat].
  const handleMapAddPoint = useCallback((e: any) => {
    if (drawMode !== 'manual') return;
    const c = e?.geometry?.coordinates ?? e?.payload?.geometry?.coordinates;
    if (!c) return;
    const [lng, lat] = c;
    setSelectedVertex(null);
    onManualTapAppend(lat, lng);
  }, [drawMode, onManualTapAppend]);

  // Khi parent chuyển 'edit-ready' (walk-away auto-stop) → tắt auto-record + pulse.
  useEffect(() => {
    if (editMode === 'edit-ready' && isAutoRecording) setIsAutoRecording(false);
  }, [editMode, isAutoRecording]);

  const lastRejectReason = rejectReason ?? null;

  const [mapModule, setMapModule] = useState<any | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [currentLocation, setCurrentLocation] = useState({ lat: 0, lng: 0 });
  const [showMarker, setShowMarker] = useState(false);

  // Camera (zoom / recenter) — MapLibre v10 CameraRef.zoomTo / flyTo / setCamera.
  const cameraRef = useRef<any>(null);
  const zoomRef = useRef(17);
  const didAutoCenterRef = useRef(false);

  // Refs để watchPosition callback luôn đọc giá trị mới nhất (tránh stale closure).
  const isAutoRecordingRef = useRef(false);
  useEffect(() => { isAutoRecordingRef.current = isAutoRecording; }, [isAutoRecording]);
  const onPointCandidateRef = useRef(onPointCandidate);
  useEffect(() => { onPointCandidateRef.current = onPointCandidate; }, [onPointCandidate]);

  // Xác nhận thoát nếu đã có điểm / tên vườn (tránh mất dữ liệu GPS).
  const confirmExit = () => {
    const hasUnsaved = coordinates.length > 0 || farmName.trim().length > 0;
    if (!hasUnsaved) { onBack(); return; }
    showWarning(
      t('Thoát màn thêm vườn?'),
      t('Bạn sẽ mất các điểm GPS và thông tin đã nhập. Bạn có chắc muốn thoát?'),
      {
        actions: [
          { text: t('Ở lại'), style: 'cancel' },
          { text: t('Thoát'), style: 'destructive', onPress: () => onBack() },
        ],
      },
    );
  };
  const confirmExitRef = useRef(confirmExit);
  confirmExitRef.current = confirmExit;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmExitRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const MapLib = mapModule?.default ? mapModule.default : mapModule;
  const mapSupported = Boolean(MapLib?.MapView);
  const canRenderMap = permissionGranted && mapSupported;

  // watchPosition — cập nhật vị trí hiện tại + gửi candidate khi đang auto-record.
  useEffect(() => {
    let cancelled = false;
    let watchId: number | null = null;

    const startWatchingLocation = async () => {
      const hasPermission = await requestLocationPermission();
      if (cancelled) return;
      if (!hasPermission) { setPermissionGranted(false); return; }
      setPermissionGranted(true);

      const id = Geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          // Bỏ fix CACHE cũ (>15s): OS hay trả vị trí "tỉnh từng ở" tức thì trước khi
          // GPS thật khoá → hiện sai tỉnh (field 13/07). Fix live luôn có timestamp mới.
          if (pos.timestamp && Date.now() - pos.timestamp > 15000) return;
          const { latitude, longitude, accuracy } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setLastAccuracy(accuracy ?? null);
          // Chỉ auto-tracking khi user đang "đi vòng" ở chế độ tự động.
          if (isAutoRecordingRef.current) {
            if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
              const worst = worstAccRef.current;
              if (worst === null || accuracy > worst) worstAccRef.current = accuracy;
            }
            onPointCandidateRef.current(latitude, longitude, accuracy ?? null);
          }
        },
        (err) => console.log('[AddFarmMode] watchPosition error:', err),
        // distanceFilter=3 đồng bộ với native LocationHelper (Build 51).
        // forceRequestLocation + showLocationDialog (Android): nhắc bật định-vị nếu tắt.
        {
          enableHighAccuracy: true,
          distanceFilter: 3,
          forceRequestLocation: true,
          showLocationDialog: true,
        },
      );

      if (cancelled) { Geolocation.clearWatch(id); return; }
      watchId = id;
    };

    startWatchingLocation();
    return () => {
      cancelled = true;
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, []);

  const loadMap = async () => {
    try {
      const mod = await import('@maplibre/maplibre-react-native');
      if (mod?.setAccessToken) {
        try { mod.setAccessToken(null); } catch (tokenErr: any) {
          console.warn('[FarmDetailScreen] Failed to set access token:', tokenErr);
        }
      }
      setMapError(null);
      setMapModule(mod);
    } catch (err: any) {
      console.error('[FarmDetailScreen] Failed to load MapLibreGL:', err);
      setMapError(err?.message ?? String(err));
    }
  };

  useEffect(() => {
    loadMap();
    requestLocationPermission().then(setPermissionGranted);
  }, []);

  // Auto-center theo GPS — BÁM THEO tới khi có fix ĐỦ CHÍNH XÁC rồi mới khoá (sau đó
  // user tự pan/zoom). Vì sao KHÔNG khoá ngay fix đầu: iOS/Android hay trả fix CACHE
  // (vị trí tỉnh TỪNG ở) tức thì trước khi GPS thật khoá → nếu center-rồi-khoá ở fix đầu
  // thì kẹt ở "tỉnh khác" (field 13/07). Bám theo tới khi accuracy ≤ 60m → chắc về đúng
  // chỗ đang đứng; chưa có accuracy thì vẫn center tạm nhưng CHƯA khoá (còn recenter được).
  useEffect(() => {
    if (didAutoCenterRef.current) return;
    if (currentLocation.lat === 0 && currentLocation.lng === 0) return;
    try {
      cameraRef.current?.setCamera({
        centerCoordinate: [currentLocation.lng, currentLocation.lat],
        zoomLevel: 17,
        animationDuration: 600,
      });
    } catch { }
    // Chỉ khoá auto-center khi fix đủ tốt → tránh dính fix cache sai tỉnh.
    if (lastAccuracy != null && lastAccuracy <= 60) {
      didAutoCenterRef.current = true;
    }
  }, [currentLocation, lastAccuracy]);

  // Đóng popup nếu điểm đang chọn đã bị xoá khỏi mảng.
  useEffect(() => {
    if (selectedVertex != null && selectedVertex >= coordinates.length) {
      setSelectedVertex(null);
    }
  }, [coordinates.length, selectedVertex]);

  const zoomBy = (d: number) => {
    const z = Math.max(3, Math.min(20, zoomRef.current + d));
    zoomRef.current = z;
    try { cameraRef.current?.zoomTo(z, 200); } catch { }
  };
  const recenter = () => {
    if (currentLocation.lat === 0 && currentLocation.lng === 0) return;
    try { cameraRef.current?.flyTo([currentLocation.lng, currentLocation.lat], 500); } catch { }
  };

  // Khi đang kéo, hiển thị điểm i ở vị trí preview (chưa commit vào state gốc).
  const renderCoords = dragPreview
    ? coordinates.map((c, idx) => (idx === dragPreview.i ? { lat: dragPreview.lat, lng: dragPreview.lng } : c))
    : coordinates;
  const area = areaSquareMeters(renderCoords);
  const perim = perimeterMeters(renderCoords);
  const canSave = coordinates.length >= MIN_POINTS_TO_DEFINE && areaSquareMeters(coordinates) >= MIN_FARM_AREA_SQM;

  const hintText = lastRejectReason
    ? `⚠ ${lastRejectReason}`
    : drawMode === 'manual'
      ? (coordinates.length < MIN_POINTS_TO_DEFINE
        ? `Nhấn lên bản đồ để thêm điểm (cần ≥ ${MIN_POINTS_TO_DEFINE} điểm)`
        : 'Nhấn thêm điểm · kéo để chỉnh · nhấn vào điểm để xoá')
      : isAutoRecording
        ? `Đang ghi… đi vòng quanh vườn${lastAccuracy != null ? ` · GPS ~${Math.round(lastAccuracy)}m` : ''}`
        : coordinates.length === 0
          ? 'Bấm ▶ để bắt đầu đi vòng — hệ thống tự ghi điểm'
          : `Đã ghi ${coordinates.length} điểm · bấm ▶ để đi tiếp`;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View style={[styles.root, { justifyContent: 'flex-end' }]}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* ── BẢN ĐỒ TOÀN MÀN HÌNH ── */}
        <View style={StyleSheet.absoluteFill}>
          <MapErrorBoundary>
            {canRenderMap ? (
              <MapLib.MapView
                ref={mapViewRef}
                style={StyleSheet.absoluteFillObject}
                logoEnabled={false}
                attributionEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                scrollEnabled={!draggingActive}
                onPress={handleMapAddPoint}
                onDidFinishLoadingMap={() => setShowMarker(true)}
              >
                <MapLib.Camera
                  ref={cameraRef}
                  defaultSettings={{ zoomLevel: 17, centerCoordinate: DEFAULT_CENTER }}
                  minZoomLevel={3}
                  maxZoomLevel={20}
                />

                {/* Nền bản đồ: LUÔN mount cả hai nguồn, đổi bằng rasterOpacity.
                    (Không unmount có điều kiện: maplibre-rn hay giữ lại layer cũ nên
                    bấm "Vệ tinh" không ăn — vẫn thấy bản đồ thường.)
                    Lớp vệ tinh khai báo SAU nên nằm TRÊN; opacity=1 sẽ che lớp thường.
                    Ở mức zoom Esri thiếu tile, lớp thường bên dưới lộ ra làm nền dự phòng. */}
                {/* ⚠ `maxZoomLevel` PHẢI khai trên RasterSource, và PHẢI là 19.
                    Camera cho phóng tới 20 (ở trên), nhưng cả hai nguồn ảnh chỉ CÓ
                    ảnh tới z19 — chính repo này ghi rõ ở `mapTiles.ts:45` ("vượt qua
                    là ô trống/404"), `:61` (Esri 19), `:68` (OSM 19).
                    Thiếu khai báo ⇒ ở z20 MapLibre đi xin tile KHÔNG TỒN TẠI và người
                    dùng thấy ô trắng — đúng cái "phóng to thì lỗi bản đồ" mà anh Cường
                    gặp ngoài vườn 12/08. Khai 19 thì MapLibre KÉO GIÃN ảnh z19: nền chỉ
                    mờ đi, không mất. Vẫn phóng được tới 20 để đặt đỉnh ranh giới cho
                    chính xác — đa giác là vector nên nét ở mọi mức.
                    KHÔNG hạ camera xuống 19 để "cho khớp": người vẽ ranh giới cần phóng
                    sâu hơn mức ảnh có, và ảnh mờ vẫn ướm được, còn ô trắng thì không. */}
                <MapLib.RasterSource
                  id="osm-tiles"
                  tileUrlTemplates={[OSM_STREET_TILES]}
                  tileSize={256}
                  maxZoomLevel={19}
                >
                  <MapLib.RasterLayer id="osm-tiles-layer" sourceID="osm-tiles" />
                </MapLib.RasterSource>

                <MapLib.RasterSource
                  id="sat-tiles"
                  tileUrlTemplates={['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']}
                  tileSize={256}
                  maxZoomLevel={19}
                >
                  <MapLib.RasterLayer
                    id="sat-tiles-layer"
                    sourceID="sat-tiles"
                    style={{ rasterOpacity: mapType === 'satellite' ? 1 : 0 }}
                  />
                </MapLib.RasterSource>

                {renderCoords.length >= 3 && (
                  <MapLib.ShapeSource
                    id="farm-polygon-source"
                    shape={{
                      type: 'Feature',
                      properties: {},
                      geometry: {
                        type: 'Polygon',
                        coordinates: [[...renderCoords.map(c => [c.lng, c.lat]), [renderCoords[0].lng, renderCoords[0].lat]]],
                      },
                    }}
                  >
                    <MapLib.FillLayer id="farm-polygon-fill" style={{ fillColor: 'rgba(46, 204, 113, 0.28)' }} />
                    <MapLib.LineLayer id="farm-polygon-line" style={{ lineColor: COLORS.accent, lineWidth: 2.5 }} />
                  </MapLib.ShapeSource>
                )}

                {renderCoords.length === 2 && (
                  <MapLib.ShapeSource
                    id="farm-line-source"
                    shape={{
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'LineString', coordinates: renderCoords.map(c => [c.lng, c.lat]) },
                    }}
                  >
                    <MapLib.LineLayer id="farm-line-line" style={{ lineColor: COLORS.accent, lineWidth: 2.5 }} />
                  </MapLib.ShapeSource>
                )}

                {/* Đỉnh có số thứ tự (MarkerView) — số luôn hiển thị + kéo-thả mượt. */}
                {coordinates.map((c, i) => (
                  <DraggableVertex
                    key={`v-${i}`}
                    Marker={MapLib.MarkerView}
                    index={i}
                    coord={c}
                    isSelected={selectedVertex === i}
                    mapRef={mapViewRef}
                    onDragStart={() => setDraggingActive(true)}
                    onDragMove={(idx, lat, lng) => setDragPreview({ i: idx, lat, lng })}
                    onDragEnd={(idx, lat, lng) => {
                      setDraggingActive(false);
                      setDragPreview(null);
                      onVertexDragEnd(idx, lat, lng);
                    }}
                    onDragCancel={() => { setDraggingActive(false); setDragPreview(null); }}
                    onPress={(idx) => setSelectedVertex(idx)}
                  />
                ))}

                {showMarker && (currentLocation.lat !== 0 || currentLocation.lng !== 0) && (
                  <MapLib.MarkerView id="me-loc" coordinate={[currentLocation.lng, currentLocation.lat]}>
                    <View style={styles.meDotOuter}><View style={styles.meDot} /></View>
                  </MapLib.MarkerView>
                )}
              </MapLib.MapView>
            ) : (
              <View style={[styles.mapFallback, { backgroundColor: '#e8f5e9' }]}>
                <Icon name="map" size={32} color={COLORS.accentLight} />
                <Text style={[styles.mapFallbackText, { marginTop: 8 }]}>
                  {mapError
                    ? `Lỗi bản đồ: ${mapError}`
                    : !mapSupported
                      ? 'Bản đồ không khả dụng trên thiết bị này.'
                      : !permissionGranted
                        ? 'Cần quyền vị trí để hiển thị bản đồ.'
                        : 'Đang tải bản đồ…'}
                </Text>
                {mapError && (
                  <TouchableOpacity
                    style={[styles.recordBtn, { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16 }]}
                    onPress={loadMap}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.recordBtnText, { color: COLORS.white }]}>Thử lại</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </MapErrorBoundary>
        </View>

        {/* ── TRÊN-TRÁI: quay lại ── */}
        <View style={[styles.floatTopLeft, { top: insets.top + 8 }]}>
          <TouchableOpacity style={styles.circleBtn} onPress={confirmExit} activeOpacity={0.85}>
            <Icon name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* ── TRÊN-GIỮA: chu vi · diện tích · điểm ── */}
        <View style={[styles.floatTopCenter, { top: insets.top + 10 }]} pointerEvents="none">
          <View style={styles.infoPill}>
            <View style={styles.infoItem}>
              <Text style={styles.infoVal}>{formatDistance(perim)}</Text>
              <Text style={styles.infoLbl}>chu vi</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoItem}>
              <Text style={styles.infoVal}>{formatArea(area)}</Text>
              <Text style={styles.infoLbl}>diện tích</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoItem}>
              <Text style={styles.infoVal}>{coordinates.length}</Text>
              <Text style={styles.infoLbl}>điểm</Text>
            </View>
          </View>
        </View>

        {/* ── TRÊN-PHẢI: đổi loại bản đồ ── */}
        <View style={[styles.floatTopRight, { top: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => setMapType(m => (m === 'normal' ? 'satellite' : 'normal'))}
            activeOpacity={0.85}
          >
            <Icon name={mapType === 'normal' ? 'satellite' : 'map'} size={20} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.circleBtnLabel}>{mapType === 'normal' ? 'Vệ tinh' : 'Bản đồ'}</Text>
        </View>

        {/* ── PHẢI-GIỮA: zoom + recenter ── */}
        <View style={styles.floatRightMid} pointerEvents="box-none">
          <TouchableOpacity style={styles.circleBtn} onPress={() => zoomBy(1)} activeOpacity={0.85}>
            <Icon name="plus" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.circleBtn, { marginTop: 10 }]} onPress={() => zoomBy(-1)} activeOpacity={0.85}>
            <Icon name="minus" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.circleBtn, { marginTop: 10 }]} onPress={recenter} activeOpacity={0.85}>
            <Icon name="location-crosshairs" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        {/* ── THẺ DƯỚI: chế độ + tên vườn + hành động ── */}
        <View style={[styles.bottomCard, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
          {/* Dòng gợi ý trạng thái */}
          <View style={styles.hintLine}>
            {isAutoRecording && drawMode === 'auto' ? <RecordingPulse /> : (
              <View style={[styles.pulseDot, { backgroundColor: lastRejectReason ? '#E67E22' : COLORS.textMuted }]} />
            )}
            <Text style={styles.hintText} numberOfLines={2}>{hintText}</Text>
          </View>

          {/* Chuyển chế độ vẽ */}
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentBtn, drawMode === 'auto' && styles.segmentBtnActive]}
              onPress={() => setDrawMode('auto')}
              activeOpacity={0.85}
            >
              <Icon name="person-walking" size={17} color={drawMode === 'auto' ? COLORS.white : COLORS.textSub} />
              <Text style={[styles.segmentText, drawMode === 'auto' && styles.segmentTextActive]}>Tự động ghi</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, drawMode === 'manual' && styles.segmentBtnActive]}
              onPress={() => { setIsAutoRecording(false); setDrawMode('manual'); }}
              activeOpacity={0.85}
            >
              <Icon name="hand-pointer" size={17} color={drawMode === 'manual' ? COLORS.white : COLORS.textSub} />
              <Text style={[styles.segmentText, drawMode === 'manual' && styles.segmentTextActive]}>Tự vẽ điểm</Text>
            </TouchableOpacity>
          </View>

          {/* Tên vườn */}
          <TextInput
            value={farmName}
            onChangeText={onFarmNameChange}
            placeholder="Tên vườn (tuỳ chọn)"
            placeholderTextColor={COLORS.textMuted}
            style={styles.nameInput}
            maxLength={60}
            returnKeyType="done"
          />

          {/* Hàng hành động chính */}
          <View style={styles.primaryRow}>
            {drawMode === 'auto' ? (
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  isAutoRecording ? styles.primaryBtnRec : styles.primaryBtnGo,
                  !permissionGranted && styles.btnDisabled,
                ]}
                disabled={!permissionGranted}
                onPress={async () => {
                  if (!permissionGranted) {
                    showInfo(t('Cần quyền vị trí'), t('Cấp quyền GPS trong Cài đặt → {brand}.'));
                    return;
                  }
                  const willStart = !isAutoRecording;
                  setIsAutoRecording(willStart);
                  if (willStart) { setEditMode('recording'); await onCaptureNow(); }
                }}
                activeOpacity={0.9}
              >
                <Icon name={isAutoRecording ? 'circle-pause' : 'circle-play'} size={24} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>
                  {isAutoRecording ? 'Tạm dừng' : coordinates.length === 0 ? 'Bắt đầu đi vòng' : 'Tiếp tục đi vòng'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.smallBtn, styles.smallBtnFlex, editHistoryLength === 0 && styles.btnDisabled]}
                onPress={onUndo}
                disabled={editHistoryLength === 0}
                activeOpacity={0.85}
              >
                <Icon name="arrow-rotate-left" size={20} color={COLORS.textSub} />
                <Text style={styles.smallBtnText}>Hoàn tác điểm</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, (!canSave || isSaving) && styles.btnDisabled]}
              onPress={() => onFinish(
                drawMode === 'auto'
                  ? { method: BOUNDARY_METHOD.gpsWalk, accM: worstAccRef.current }
                  // Chấm tay: KHÔNG có sai số GPS để khai (xem `BoundaryMeta.accM`).
                  : { method: BOUNDARY_METHOD.mapDraw, accM: null },
              )}
              disabled={!canSave || isSaving}
              activeOpacity={0.9}
            >
              {isSaving ? (
                <>
                  <ActivityIndicator color={COLORS.white} />
                  <Text style={styles.saveBtnText}>Đang lưu...</Text>
                </>
              ) : (
                <>
                  <Icon name="floppy-disk" size={20} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>Lưu vườn</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Hàng phụ: hoàn tác (chế độ auto) + vẽ lại */}
          <View style={styles.secondaryRow}>
            {drawMode === 'auto' && (
              <TouchableOpacity
                style={[styles.linkBtn, editHistoryLength === 0 && styles.btnDisabled]}
                onPress={onUndo}
                disabled={editHistoryLength === 0}
                activeOpacity={0.7}
              >
                <Icon name="arrow-rotate-left" size={16} color={COLORS.textSub} />
                <Text style={styles.linkBtnText}>Hoàn tác</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.linkBtn, coordinates.length === 0 && styles.btnDisabled]}
              onPress={onResetFromScratch}
              disabled={coordinates.length === 0}
              activeOpacity={0.7}
            >
              <Icon name="rotate" size={16} color="#E74C3C" />
              <Text style={[styles.linkBtnText, { color: '#E74C3C' }]}>Vẽ lại từ đầu</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── POPUP CHI TIẾT ĐIỂM ── */}
        {selectedVertex != null && coordinates[selectedVertex] && (
          <View style={styles.popupOverlay} pointerEvents="box-none">
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSelectedVertex(null)} />
            <View style={styles.vertexPopup}>
              <View style={styles.vertexPopupHeader}>
                <View style={styles.vertexPopupBadge}>
                  <Text style={styles.vertexPopupBadgeText}>{selectedVertex + 1}</Text>
                </View>
                <Text style={styles.vertexPopupTitle}>Điểm số {selectedVertex + 1}</Text>
                <TouchableOpacity onPress={() => setSelectedVertex(null)} hitSlop={8}>
                  <Icon name="xmark" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.vertexPopupBody}>
                <Text style={styles.vertexPopupCoord}>Vĩ độ: {coordinates[selectedVertex].lat.toFixed(6)}</Text>
                <Text style={styles.vertexPopupCoord}>Kinh độ: {coordinates[selectedVertex].lng.toFixed(6)}</Text>
              </View>
              <TouchableOpacity
                style={styles.vertexDeleteBtn}
                onPress={() => { const idx = selectedVertex; setSelectedVertex(null); onDeleteVertex(idx); }}
                activeOpacity={0.85}
              >
                <Icon name="trash" size={18} color={COLORS.white} />
                <Text style={styles.vertexDeleteText}>Xoá điểm này</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

// ── FARM DETAIL MODE ──────────────────────────────────────────────────────────
const FarmDetailMode = ({
  farm,
  trees,
  searchQuery,
  currentPage,
  onSearchChange,
  onPageChange,
  onAddTree,
  onActivityUpdate,
  onBack,
  onUpdateFarmName,
  onCoordinatesPress,
  onView3DFarm,
}: {
  farm: any;
  trees: any[];
  searchQuery: string;
  currentPage: number;
  onSearchChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onAddTree: () => void;
  onActivityUpdate: () => void;
  onBack: () => void;
  onUpdateFarmName: (newName: string) => void;
  onCoordinatesPress: () => void;
  /** Mở KHÔNG-GIAN 3D ở chế độ TOÀN CẢNH VƯỜN (Space3D mode='farm'). */
  onView3DFarm: () => void;
}) => {
  const navigation = useNavigation();
  const tk = useTk();
  const [renamePopupVisible, setRenamePopupVisible] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('openScreen', (screen) => {
      (navigation.navigate as any)(screen);
    });

    return () => sub.remove();
  }, []);
  /**
   * Chiều cao THẬT của thanh hành động nổi ở đáy, đo bằng `onLayout`.
   *
   * VÌ SAO ĐO CHỨ KHÔNG GÕ SỐ. Thanh đó `position: 'absolute'` nên nó KHÔNG chiếm
   * chỗ trong dòng chảy — phần chừa chỗ cho nó là một ô rỗng ở cuối footer, và
   * trước bản này ô đó gõ cứng `height: 86` kèm chú thích "(2 nút)".
   *
   * Thanh nay có HAI HÀNG: hàng trên là "Xem sơ đồ 3D của vườn" + nút chỉ đường,
   * hàng dưới là "Cập nhật hoạt động". Cộng lại ≈ 144 trên Android và ≈ 156 trên
   * iOS (12 đệm trên + 46 hàng một + 10 lề + 52 hàng hai + 24/36 đệm dưới). Ô
   * chừa 86 thiếu khoảng 58-70 điểm, và đó đúng là phần bị che: đuôi danh sách
   * cây, và khối "Dòng thời gian" nằm ngay trên phân trang trong cùng footer.
   *
   * Con số gõ tay ở đây hỏng theo một kiểu KHÔNG ai thấy: thêm một nút vào thanh
   * là nó sai thêm, mà không lệnh nào đỏ, không bài kiểm nào kêu — chỉ có người
   * dùng thấy nội dung cụt ở đáy. Đo thì nó không lệch được nữa.
   *
   * Cùng khuôn với `CoachMarkOverlay` ("vị trí thẻ tính theo chiều cao THẬT").
   */
  const [chieuCaoThanhDay, setChieuCaoThanhDay] = useState(0);

  // Newest tree should be on top
  const sortedTrees = [...trees].sort((a, b) => {
    const aTime = Number(a.id?.split('_')[1] ?? 0);
    const bTime = Number(b.id?.split('_')[1] ?? 0);
    return bTime - aTime;
  });

  // Filter trees by search query
  // Build 52 § A7 — also match farmer-friendly display name + short code.
  const filteredTrees = sortedTrees.filter(tree => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const code = (tree.code ?? '').toLowerCase();
    const display = formatTreeName(tree, farm).toLowerCase();
    const short = shortTreeCode(tree).toLowerCase();
    const farmerName = (tree.farmer_name ?? '').toLowerCase();
    const species = (tree.species ?? '').toLowerCase();
    return (
      code.includes(q) ||
      display.includes(q) ||
      short.includes(q) ||
      farmerName.includes(q) ||
      species.includes(q)
    );
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredTrees.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTrees = filteredTrees.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleScanExisting3D = () => { };

  // Số của cả VƯỜN, nên đếm trên toàn bộ cây — KHÔNG trên `filteredTrees`.
  // `filteredTrees` là kết quả lọc theo ô tìm kiếm; gõ "12" vào ô tìm cây thì
  // dòng đầu màn đổi từ "1.240 quả" thành "8 quả", vẫn đứng cạnh diện tích
  // vườn và vẫn đọc như một thuộc tính của vườn.
  //
  // `null` khi KHÔNG cây nào có số: cộng một dãy toàn "chưa biết" ra 0, và 0 ở
  // đây đọc như "vườn này không có quả nào".
  const dsCoQua = sortedTrees.filter((t) => typeof t.fruitCount === 'number');
  const totalFruits = dsCoQua.length
    ? dsCoQua.reduce((sum, t) => sum + t.fruitCount, 0)
    : null;

  // ⛔ Trường tên `areaM2`, KHÔNG phải `areaSqm`.
  //
  // `types/index.ts` khai `areaM2`, `farmService.ts` là nơi duy nhất sinh ra nó
  // (từ `area_sqm` của máy chủ). Hai màn đọc `areaSqm` — một trường không tồn
  // tại — nên diện tích máy chủ đã tính chưa từng hiện lần nào. Nó hỏng CÂM vì
  // ngay sau đó có nhánh lui "N điểm", và vì `farm` khai kiểu `any` nên `tsc`
  // không kêu.
  const areaLabel = farm?.areaM2
    ? `${(farm.areaM2 / 10000).toFixed(1)} ha`
    : `${farm?.coordinates?.length ?? 0} ${tk('trace.unit.points')}`;

  const moDuong = useOpenWayfind();
  const dichDuong = forFarm(farm);
  const soDiem = farm?.coordinates?.length ?? 0;
  /** Đủ ba điểm mới thành một mảnh đất vẽ được — dưới đó `FarmShape` trả `null`. */
  const coHinh = soDiem >= 3;

  /** Cây đang mở popup. `null` = không mở. */
  const [cayDangXem, setCayDangXem] = useState<any | null>(null);

  /**
   * Đường kính một nút cây trong lưới BA cột.
   *
   * Suy từ bề ngang màn chứ không gõ số: lề trang 12 mỗi bên, hai khe 12 giữa
   * ba cột. Gõ một con số cố định thì máy hẹp bị tràn còn máy rộng thừa chỗ —
   * và cả hai đều không có gì đỏ.
   */
  const CO_NUT = Math.floor((width - 12 * 2 - 12 * 2) / 3);

  /**
   * LƯỚI BENTO của màn này. Ba vế của luật (xem `BentoTile` trong
   * `components/layered/Surface.tsx`) rơi vào đây như sau:
   *
   *   Ô TO NHẤT là "Vườn này vừa trải qua gì". Người mở màn vườn hỏi câu đó
   *   trước — danh sách cây là bản kiểm kê, và bản kiểm kê thì đã nằm ngay dưới
   *   với phân trang riêng. Trước bản này dòng thời gian nằm CUỐI footer, tức
   *   chính bản ghi gốc của mọi việc đồng áng là thứ phải cuộn qua 128 cây mới
   *   thấy.
   *
   *   MỖI Ô MỘT VIỆC. Dải cũ có ba ô trông ngang hàng nhưng không cùng loại:
   *   "cây" và "quả dự kiến" là THÔNG TIN, còn "điểm GPS (nhấn xem)" là một
   *   NÚT — nhãn của nó phải xuống dòng để tự giải thích mình bấm được. Nay ba
   *   ô hành động là ba động từ, và hai con số lui về một dòng chữ nhỏ.
   *
   *   THU GỌN THÔNG TIN PHỤ. Số cây vốn thừa: nó bằng đúng độ dài danh sách
   *   ngay bên dưới, nên nó về nằm cạnh tiêu đề danh sách. Số quả thì thêm chữ
   *   "ước tính" — trước đây nó hiện y hệt một con số đếm được, và một con số
   *   không nói mình là ước tính là một con số người ta sẽ tin nhầm.
   */
  const bentoHeader = (
    <View style={styles.bento}>
      {/* Dòng thông tin phụ — nhỏ, không viền, không bấm được. */}
      <View style={styles.bentoFacts}>
        <Icon name="apple-whole" size={13} color={ORG_TONE.sun} />
        <Text style={styles.bentoFactTxt}>
          {totalFruits === null ? (
            <Text style={styles.bentoFactHint}>chưa đếm quả</Text>
          ) : (
            <>
              {totalFruits.toLocaleString('vi-VN')} quả{' '}
              <Text style={styles.bentoFactHint}>(ước tính)</Text>
            </>
          )}
        </Text>
        <View style={styles.bentoFactDot} />
        <Icon name="ruler-combined" size={13} color={ORG_TONE.rain} />
        <Text style={styles.bentoFactTxt}>{areaLabel}</Text>
      </View>

      {/* Ô CHÍNH — dòng thời gian của vườn. */}
      <BentoTile tone="hero" style={styles.bentoHero}>
        <View style={styles.bentoHeroHead}>
          <Icon name="seedling" size={18} color={ORG_TONE.primary} />
          {/* "Nhật ký", không phải "Vườn này vừa trải qua gì". Tiêu đề là NHÃN
              của một ô, không phải một câu hỏi — người dùng đọc nó mỗi lần mở
              màn, nên mỗi chữ thừa là một chữ họ phải đọc lại hàng ngày. */}
          <Text style={styles.bentoHeroTitle}>Nhật ký</Text>
        </View>
        {!!farm?.id && (
          <EntityTimeline entityType="farm" entityId={String(farm.id)} limit={3} />
        )}
        {/* CỐ Ý KHÔNG có nút "ghi việc mới" ở đây. Việc đó có đúng một chỗ, và
            chỗ đó là thanh đáy — vì nó phải theo người dùng cả khi họ đang xem
            sâu trong danh sách 128 cây. Đặt thêm một nút ở đây là dựng lại đúng
            cái vừa gỡ khỏi header: hai lối vào cho một việc. */}
      </BentoTile>

      {/*
        HAI Ô XEM TRƯỚC — mỗi ô vẽ CHÍNH mảnh vườn này, không nhãn, không biểu
        tượng. Hình đã là nhãn: một biểu tượng bánh răng cộng chữ "Sơ đồ 3D" chỉ
        nói được "bấm vào đây mở một thứ tên vậy", còn hình bóng mảnh đất nói
        luôn vườn có dạng gì, cây nằm đâu, và đã vẽ ranh giới chưa.

        `FarmShape` trả `null` khi ring dưới ba điểm — chưa có hình để vẽ. Nên ô
        chưa-vẽ-ranh-giới rơi về một lời mời bằng chữ, và đó là chỗ DUY NHẤT
        trong hàng này còn chữ.
      */}
      <BentoRow style={styles.bentoPreviews}>
        {/*
          Ô KHÔNG GIAN — ô tối duy nhất của trang.

          Nền tối không phải để cho khác lạ: một khối phát sáng chỉ đọc ra "không
          gian" khi quanh nó tối. Cùng hình ấy trên nền trắng thì vầng sáng biến
          mất và nó tụt về một hình vẽ phẳng. Không đổ bóng — bóng dưới một khối
          phát sáng kéo nó về lại thành "một tấm thẻ".
        */}
        <BentoTile
          flex={1}
          tone="space"
          onPress={onView3DFarm}
          padded={false}
          style={styles.bentoPreview}
        >
          <FarmShape farm={farm} trees={filteredTrees} mode="space" />
          {/* Huy hiệu 3D ở GÓC, không phải nhãn giữa ô: hình nghiêng đã nói đây
              là không gian, huy hiệu chỉ xác nhận. Đặt ở góc trên-trái vì đó là
              chỗ mắt chạm đầu tiên khi đọc từ trái sang, và vì mảnh vườn nghiêng
              luôn dồn về giữa-dưới nên góc ấy trống. */}
          <View style={styles.bentoBadge3D}>
            <Icon name="cube" size={13} color={SANG_KHONG_GIAN} />
            <Text style={styles.bentoBadge3DTxt}>3D</Text>
          </View>
          {!coHinh ? <Text style={styles.bentoPreviewMoiToi}>Xem sơ đồ 3D</Text> : null}
        </BentoTile>
        <BentoTile
          flex={1}
          onPress={() => onCoordinatesPress()}
          padded={false}
          style={styles.bentoPreview}
        >
          {/* `trees` PHẢI truyền: thiếu nó thì ô vẽ ranh giới trống không, và
              một mảnh đất không cây đọc ra "vườn chưa có gì" — sai với vườn đang
              có cả trăm cây. */}
          <FarmShape farm={farm} trees={filteredTrees} mode="flat" />
          {coHinh ? (
            <Text style={styles.bentoPreviewDiem}>{soDiem} điểm</Text>
          ) : (
            <Text style={styles.bentoPreviewMoi}>Vẽ ranh giới vườn</Text>
          )}
        </BentoTile>
      </BentoRow>

      {/* Chỉ đường vẫn là một VIỆC, không phải một thứ để nhìn — nên nó giữ
          nhãn. `forFarm` trả null khi vườn chưa vẽ ranh giới: không có toạ độ
          nào để đi tới, nên ô tự vắng mặt thay vì bấm rồi không xảy ra gì. */}
      {dichDuong ? (
        <BentoRow style={styles.bentoActions}>
          <BentoTile flex={1} tone="rain" onPress={() => moDuong(dichDuong)} style={styles.bentoAction}>
            <Icon name="map-location-dot" size={20} color={ORG_TONE.rain} />
            <Text style={styles.bentoActionTxt}>Chỉ đường tới vườn</Text>
          </BentoTile>
        </BentoRow>
      ) : null}

      {/* Tiêu đề danh sách — số cây về đây, cạnh chính danh sách nó đếm. */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>{tk('trace.section.treeList')}</Text>
          <Text style={styles.sectionCount}>{filteredTrees.length}</Text>
        </View>
        <TouchableOpacity style={styles.addTreeBtn} onPress={onAddTree} activeOpacity={0.8}>
          <View style={styles.addTreeBtnInner}>
            <Icon name="plus" size={16} color={COLORS.accent} />
            <Text style={styles.addTreeBtnText}>Thêm cây</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="magnifying-glass" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm cây..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => onSearchChange('')}
            hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
          >
            <Icon name="circle-xmark" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={ORG_SURFACE.ground} />
      <GroundBackdrop variant="detail" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Icon name="arrow-left" size={20} color={COLORS.textSub} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>{tk('trace.farmList.title')}</Text>
          <TouchableOpacity onPress={() => setRenamePopupVisible(true)} activeOpacity={0.7}>
            <Text style={styles.headerTitle} numberOfLines={1}>{farm?.name}</Text>
          </TouchableOpacity>
        </View>
        {/* Chia sẻ dữ liệu riêng của CẢ vườn (`scope_type=farm`). Chỉ hiện khi đã
            biết mã vườn: mở màn chia sẻ với `scopeId` rỗng thì danh sách lọc ra
            rỗng — màn báo "chưa chia sẻ cho ai" trong khi thật ra chưa hỏi được
            ai cả, và nút cấp quyền sẽ tạo một lượt cấp không gắn vào vườn nào. */}
        {farm?.id ? (
          <TouchableOpacity
            style={[styles.activityBtn, { marginRight: 8 }]}
            onPress={() =>
              (navigation as any).navigate('TreeShare', {
                scopeType: 'farm',
                scopeId: String(farm.id),
                scopeName: farm?.name,
              })
            }
          >
            <Icon name="share-nodes" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        ) : null}
        {/* CỐ Ý KHÔNG có nút "cập nhật hoạt động" ở đây nữa. Trước bản này màn
            có HAI lối vào cùng một việc: biểu tượng `file-pen` không nhãn ở đây,
            và nút lớn ở đáy — cả hai gọi đúng `onActivityUpdate`. Hai lối vào
            cho một việc là hai chỗ người dùng phải đoán xem chúng có khác nhau
            không. Nay việc đó có đúng một chỗ: ô "Vườn này vừa trải qua gì". */}
      </View>

      {/* Tree list */}
      <FlatList
        data={paginatedTrees}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.treeListContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        /*
          LƯỚI BENTO nằm TRONG phần cuộn, không đứng cố định phía trên.

          Trước bản này bốn khối — dải thống kê, ô tìm, tiêu đề mục, thanh đáy —
          đều đứng yên, nên một vườn 128 cây chỉ còn chưa tới nửa màn để xem
          danh sách. Cho lưới cuộn theo là trả lại chỗ cho đúng thứ người ta mở
          màn này để xem.

          Đánh đổi, nói thẳng: nút "Ghi việc mới" nằm trong ô hero nên nó cuộn
          khuất khi xem sâu trong danh sách. Đổi lại là danh sách được nguyên
          màn, và việc ghi nhật ký có ĐÚNG MỘT chỗ thay vì hai.
        */
        ListHeaderComponent={bentoHeader}
        ListEmptyComponent={
          filteredTrees.length === 0 ? (
            trees.length === 0 ? (
              <StateView
                status="empty"
                title="Chưa có cây nào trong vườn"
                message="Thêm cây đầu tiên để bắt đầu ghi nhận và truy xuất."
                actionLabel="Thêm cây đầu tiên"
                onAction={onAddTree}
              />
            ) : (
              <View style={styles.noSearchResults}>
                <Icon name="magnifying-glass-minus" size={48} color={COLORS.textMuted} />
                <Text style={styles.noSearchResultsText}>Không tìm thấy cây</Text>
              </View>
            )
          ) : null
        }
        /*
          LƯỚI BA CỘT. `numColumns` là thuộc tính TĨNH của `FlatList` — đổi nó
          lúc chạy làm danh sách ném. Ở đây nó là hằng nên không sao; nếu ngày
          nào cần đổi theo bề ngang màn thì phải đổi cả `key` của danh sách.
        */
        numColumns={3}
        columnWrapperStyle={styles.treeGridHang}
        renderItem={({ item }) => (
          <TreeChip
            item={item}
            farm={farm}
            size={CO_NUT}
            /* Chạm KHÔNG mở thẳng màn chi tiết nữa — nó mở popup. Màn chi tiết
               là một chuyến đi khỏi danh sách; phần lớn lượt chạm chỉ để xem
               nhanh cây này có gì, rồi quay lại chạm cây kế. */
            onPress={() => setCayDangXem(item)}
          />
        )}
        ListFooterComponent={
          <View>
            {filteredTrees.length > 0 ? (
              /* Pagination */
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={filteredTrees.length}
                onPreviousPage={handlePreviousPage}
                onNextPage={handleNextPage}
              />
            ) : null}
            {/*
              Chừa chỗ cho thanh hành động nổi ở đáy — theo chiều cao ĐO ĐƯỢC,
              không theo một con số gõ tay. Xem `chieuCaoThanhDay` ở trên.

              `CHUA_DO_THANH_DAY` chỉ dùng cho khung hình ĐẦU TIÊN, trước khi
              `onLayout` kịp chạy. Lấy dư còn hơn thiếu: thiếu là che nội dung,
              dư là một khoảng trắng biến mất ngay khung sau.
            */}
            <View style={{ height: chieuCaoThanhDay || CHUA_DO_THANH_DAY }} />
          </View>
        }
      />

      {/* Bottom action bar */}
      <View
        style={styles.bottomBar}
        onLayout={(e) => {
          // Làm tròn rồi mới so: chiều cao thật có phần lẻ, và đặt lại state với
          // một giá trị chênh 0,5 điểm là một vòng vẽ lại không đổi gì trên màn.
          const h = Math.ceil(e.nativeEvent.layout.height);
          setChieuCaoThanhDay((truoc) => (truoc === h ? truoc : h));
        }}
      >
        {/*
          MỘT hàng, MỘT nút. Trước bản này thanh có hai hàng: "Xem sơ đồ 3D" +
          chỉ đường ở trên, "Cập nhật hoạt động" ở dưới. Hai việc đầu nay là hai
          ô trong lưới Bento, nên chúng rời khỏi đây — một việc không được có hai
          chỗ bấm.

          Còn lại đúng việc PHẢI theo người dùng: ghi nhật ký. Nó ở đây chứ không
          ở trong ô hero vì người đang xem cây thứ 90 cũng phải ghi được ngay,
          không phải cuộn ngược lên đầu.

          Thanh mỏng đi còn một hàng, và phép đo `onLayout` ở trên tự bắt kịp —
          đó đúng là lý do bản #309 đổi ô chừa chỗ từ số gõ tay sang chiều cao đo
          được. Nếu ô chừa vẫn là hằng 86 thì bản này lại phải sửa tay lần nữa.
        */}
        <TouchableOpacity style={styles.activityLargeBtn} onPress={onActivityUpdate} activeOpacity={0.88}>
          <GradientFill name="action" />
          <Icon name="seedling" size={19} color={COLORS.white} />
          <Text style={styles.activityLargeBtnText}>Cập nhật hoạt động</Text>
        </TouchableOpacity>
      </View>

      {/*
        POPUP CHI TIẾT CÂY.

        Chạm một nút cây mở cái này, KHÔNG mở thẳng màn chi tiết. Lý do là nhịp
        làm việc thật: người ta quét mắt qua lưới, chạm một cây để xem nhanh nó
        có gì, rồi chạm cây kế. Mở màn chi tiết cho mỗi lượt xem nhanh là bắt họ
        đi và quay lại — mất chỗ đang đứng trong lưới, mất cả trang phân trang.

        Màn chi tiết vẫn ở đó, sau MỘT nút. Ai cần đi sâu thì đi.
      */}
      <Modal
        visible={cayDangXem != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCayDangXem(null)}
      >
        {/* Chạm ra ngoài là đóng — cách thoát mà ai cũng thử trước tiên. */}
        <Pressable style={styles.cayPopupNen} onPress={() => setCayDangXem(null)} />
        <View style={styles.cayPopupBoc} pointerEvents="box-none">
          <View style={styles.cayPopup}>
            <GradientFill name="tile" />

            <View style={styles.cayPopupDau}>
              {/*
                Cùng lý do với lưới: `?? 0` ở đây in ra "0%" và câu "đã thu
                hoạch" cho một cây mà app KHÔNG có số liệu. Đọc rời ra thì nó
                là một câu khẳng định, và nó sai.
              */}
              <RingProgress pct={cayDangXem?.harvestProgress ?? null} size={64} stroke={5}>
                <Text style={styles.cayPopupPct}>
                  {cayDangXem?.harvestProgress == null ? '—' : `${cayDangXem.harvestProgress}%`}
                </Text>
              </RingProgress>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cayPopupTen} numberOfLines={2}>
                  {cayDangXem ? formatTreeName(cayDangXem, farm) : ''}
                </Text>
                <Text style={styles.cayPopupPhu}>
                  {cayDangXem?.harvestProgress == null ? 'chưa có số liệu thu hoạch' : 'đã thu hoạch'}
                </Text>
              </View>
            </View>

            <View style={styles.cayPopupBang}>
              {[
                { nhan: 'Quả trên cây', gt: String(cayDangXem?.fruitCount ?? 'chưa đếm') },
                {
                  nhan: 'Quả dự kiến',
                  gt: String(cayDangXem?.estimatedFruits ?? 'chưa ghi'),
                  uoc: true,
                },
                { nhan: 'Giống', gt: cayDangXem?.species || 'chưa ghi' },
                {
                  nhan: 'Năm trồng',
                  gt: cayDangXem?.plantedYear ? String(cayDangXem.plantedYear) : 'chưa ghi',
                },
              ].map((d) => (
                <View key={d.nhan} style={styles.cayPopupHang}>
                  <Text style={styles.cayPopupNhan}>{d.nhan}</Text>
                  <Text style={styles.cayPopupGt}>
                    {d.gt}
                    {d.uoc ? <Text style={styles.cayPopupUoc}> (ước tính)</Text> : null}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.cayPopupNut}
              activeOpacity={0.88}
              onPress={() => {
                const cay = cayDangXem;
                setCayDangXem(null);
                if (cay) (navigation.navigate as any)('TreeDetail', { tree: cay });
              }}
            >
              <GradientFill name="action" />
              <Text style={styles.cayPopupNutTxt}>Xem chi tiết</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rename Farm Popup */}
      <CommonPopup
        visible={renamePopupVisible}
        title="Đổi tên trang trại"
        placeholder="Nhập tên mới cho trang trại"
        initialValue={farm?.name}
        onOk={(newName) => {
          onUpdateFarmName(newName);
          setRenamePopupVisible(false);
        }}
        onCancel={() => setRenamePopupVisible(false)}
        onClose={() => setRenamePopupVisible(false)}
      />
    </View>
  );
};

// ── Màn này đang ở trạng thái nào ─────────────────────────────────────────────
//
// XUẤT RA để bài kiểm gọi được. Trước đây quyết định này là một dòng nằm giữa thân
// component — `if (!farm) return <AddFarmMode …/>` — nên không có cách nào kiểm nó
// mà không dựng cả màn hơn 3.000 dòng kèm bản đồ, máy ảnh, native.
//
// ⛔ VÌ SAO TÁCH RA: dòng cũ gộp hai tình huống KHÁC HẲN NHAU vào một màn hình.
//   a) không có `farm_id` — người dùng bấm "Thêm vườn", tạo mới ĐÚNG là ý họ;
//   b) có `farm_id` — người dùng mở một vườn ĐÃ CÓ (bấm từ danh sách, quét QR),
//      nhưng vườn chưa nạp xong hoặc kho máy không có nó.
// Ở ca (b) người dùng gặp một biểu mẫu TRỐNG ở đúng chỗ họ chờ vườn của mình. Việc
// hợp lý nhất để làm với biểu mẫu trống là điền nó — nên họ vẽ lại ranh, đặt lại
// tên, và app sinh ra vườn TRÙNG. Không lỗi nào hiện ra, không dòng log nào đỏ.
// Đó là một nhánh phòng thủ nguỵ trang thành đường đi bình thường: cái vỏ im lặng.
//
// Luật ở đây: **chỉ SỰ VẮNG MẶT của `farm_id` mới mở màn tạo.** Mọi ca "có
// `farm_id` mà chưa có vườn" đều phải nói ra là chưa có — đang tải, hoặc không tải
// được — chứ không được im lặng đổi nghĩa màn hình.
export type FarmDetailView = 'create' | 'loading' | 'unavailable' | 'detail';

/** Vòng đời một lượt nạp vườn theo `farm_id`. */
export type FarmLoadState = 'idle' | 'loading' | 'loaded' | 'failed';

export function resolveFarmDetailView(input: {
  farmId: string | null | undefined;
  farm: unknown;
  loadState: FarmLoadState;
}): FarmDetailView {
  if (input.farm) return 'detail';
  // `TreeEnrollScreen.tsx` điều hướng với `{ farm_id: null }`, các lối "Thêm vườn"
  // thì không truyền params — chuỗi rỗng, null, undefined cùng nghĩa "chưa chọn".
  if (!input.farmId) return 'create';
  // Có id mà chưa có vườn: chưa xong thì báo đang tải, xong rồi mà vẫn không có
  // (kho máy thiếu, hoặc lượt nạp hỏng) thì báo không tải được — kèm nút thử lại.
  return input.loadState === 'idle' || input.loadState === 'loading'
    ? 'loading'
    : 'unavailable';
}

// ── Main Screen ───────────────────────────────────────────────────────────────
const FarmDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  // Lấy dữ liệu từ params
  // Nếu mở từ code Kotlin, nó sẽ nằm trong route.params
  // Build 54 V5 — fix crash when navigated WITHOUT params (e.g. from HomeScreen
  // "🗺️ Vườn" Quick Action which goes straight to AddFarmMode). React Navigation
  // leaves route.params undefined if not passed; we must default to {} so the
  // many `params.X` reads below don't throw TypeError on undefined access.
  const params = (route.params ?? {}) as RouteParams & {
    farm_id?: string;
    scanResult?: string;
    images?: string[];
    // Build 54 V5 — set by HomeScreen Quick Action "Cây" to auto-trigger
    // ScannerSDK on mount without user needing to tap "+Add tree" again.
    autoStartScanner?: boolean;
  };
  useEffect(() => {
    try {
      console.log('[FarmDetailScreen] Received route params:', params);
    } catch (e) {
      console.error('[FarmDetailScreen] Error logging params:', e);
    }
  }, [params]);

  const [farm_id, setFarm_id] = useState<any>(params.farm_id ?? null);

  const dispatch = useAppDispatch();
  const user = useSelector((state: RootState) => state.user.currentUser);
  const trees = useSelector((state: RootState) => state.farm.trees);
  const [treeIdentificationResult, setTreeIdentificationResult] = useState<{
    code: string;
    images: string[];
    estimatedFruits: number;
    scanData: {
      treeIds: string[];
      count: number;
    };
  } | null>(null);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number }[]>([]);
  // Build 54 — macro state for AddFarmMode + edit history for undo.
  const [editMode, setEditMode] = useState<'recording' | 'edit-ready'>('recording');
  const [editHistory, setEditHistory] = useState<{ lat: number; lng: number }[][]>([]);
  const walkAwayStateRef = useRef<WalkAwayState>(initWalkAwayState());
  const [coordMapVisible, setCoordMapVisible] = useState(false);
  const [mapModule, setMapModule] = useState<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [coordMapMinimal, setCoordMapMinimal] = useState(true);
  const [farm, setFarm] = useState<any>(null);
  // Vòng đời lượt nạp vườn. KHÔNG suy được từ `farm === null`: "chưa nạp xong" và
  // "nạp xong mà không có" là hai sự thật khác nhau, và gộp chúng lại chính là cái
  // đã biến màn chi tiết thành màn tạo. Xem `resolveFarmDetailView`.
  const [farmLoadState, setFarmLoadState] = useState<FarmLoadState>('idle');
  // Search and Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    // Parse scan result from Kotlin Intent if available
    if (params.scanResult && !treeIdentificationResult) {
      try {
        const scanResult = JSON.parse(params.scanResult);
        const images = params.images || [];
        setTreeIdentificationResult({
          code: scanResult.code || `TREE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          images: images,
          estimatedFruits: 0,
          scanData: {
            treeIds: scanResult.treeIds || [],
            count: scanResult.count || 0,
          },
        });
        console.log('[FarmDetailScreen] Parsed scan result from Kotlin Intent:', scanResult);
      } catch (e) {
        console.error('[FarmDetailScreen] Failed to parse scanResult JSON:', e);
      }
    }
  }, [params.scanResult, params.images]);

  /**
   * Nạp một vườn theo id và GHI LẠI kết quả thật của lượt nạp.
   *
   * `loadFarm` trả `payload === undefined` khi kho máy không có vườn đó, và lượt
   * dispatch có thể `rejected` khi kho máy hỏng. Trước đây cả hai kết cục đều rơi
   * vào `setFarm(null)` — cùng một giá trị với "chưa nạp" — nên màn không phân biệt
   * nổi ba tình huống và chọn tình huống dễ nhất: hiện biểu mẫu tạo mới.
   */
  const fetchFarm = useCallback(
    (id: string) => {
      setFarmLoadState('loading');
      dispatch(loadFarm(id))
        .then((action: any) => {
          const loaded = action?.payload ?? null;
          setFarm(loaded);
          // `rejected` cũng đi vào `.then` với redux-toolkit: phân biệt bằng `error`
          // chứ không bằng payload rỗng, không thì lần nạp hỏng đội lốt "không có".
          setFarmLoadState(action?.error ? 'failed' : 'loaded');
        })
        .catch(() => {
          setFarm(null);
          setFarmLoadState('failed');
        });
      dispatch(syncTreesFromBackend(id));
    },
    [dispatch],
  );

  useEffect(() => {
    if (farm_id) fetchFarm(farm_id);
  }, [farm_id, fetchFarm]);

  // Refetch cây MỖI KHI màn được focus lại (vd quay về sau khi đăng ký cây mới ở
  // màn khác) → cây vừa tạo hiện ngay, không kẹt danh sách cũ (fix "cây không vào vườn").
  useFocusEffect(
    useCallback(() => {
      if (farm_id) dispatch(syncTreesFromBackend(farm_id));
    }, [farm_id]),
  );

  useEffect(() => {
    if (params.farm_id && params.farm_id !== farm_id) {
      console.log('[FarmDetailScreen] Detected farm_id change in params:', params.farm_id);
      // Chỉ đổi id. Lượt nạp do effect ở trên lo — trước đây chỗ này chép lại y
      // nguyên đoạn nạp, nên có hai bản phải sửa song song và bản này đã bị bỏ quên
      // đúng lúc bản kia được sửa.
      setFarm(null);
      setFarmLoadState('idle');
      setFarm_id(params.farm_id);
    }
  }, [params, farm_id]);
  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Load MapLibre when user requests coordinate map
  useEffect(() => {
    if (coordMapVisible && !mapModule) {
      import('@maplibre/maplibre-react-native')
        .then((mod) => {
          setMapModule(mod);
          setMapError(null);
        })
        .catch((err: any) => {
          setMapError(err?.message ?? String(err));
        });
    }
  }, [coordMapVisible, mapModule]);

  // Ref để getCurrentPosition callback đọc coordinates hiện tại (tránh stale closure)
  const coordinatesRef = useRef<{ lat: number; lng: number }[]>([]);
  useEffect(() => { coordinatesRef.current = coordinates; }, [coordinates]);

  const handleRecord = async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      showInfo('Cần quyền vị trí', 'Vui lòng cấp quyền truy cập vị trí để ghi điểm.');
      return;
    }

    // FIX field test 2026-05-15:
    //  - maximumAge=0 → KHÔNG dùng GPS cache (trước cache 10s khiến 2 điểm trùng)
    //  - Validate accuracy ≤ 15m, distance từ điểm trước ≥ 2m
    //  - Side effects (Alert) ngoài setCoordinates updater (React anti-pattern fix)
    Geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;

        // Build 51: Sync accuracy threshold với native LocationHelper.swift
        // targetAccuracy=10m. Reject nếu GPS accuracy quá kém (>10m).
        if (accuracy != null && accuracy > 10) {
          showInfo('Tín hiệu GPS yếu',
            `Sai số hiện tại ~${Math.round(accuracy)}m. Hãy ra chỗ thoáng (không che bởi tán cây/mái tôn) rồi thử lại.`);
          return;
        }

        // Build 51: distance threshold 2 → 3m sync với native distanceFilter
        const prev = coordinatesRef.current;
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          const d = haversineMeters(last.lat, last.lng, lat, lng);
          if (d < 3) {
            showInfo('Điểm quá gần điểm trước',
              `Cách điểm trước chỉ ${d.toFixed(1)}m. Hãy đi xa ra (ít nhất 3m) rồi ghi điểm tiếp.`);
            return;
          }
        }

        // 3. Pure setState — không side effects trong updater
        setCoordinates(c => [...c, { lat, lng }]);
      },
      (err) => {
        console.log('Geolocation Error:', err);
        showError('Không lấy được vị trí',
          err.code === 3 ? 'GPS timeout — hãy ra chỗ thoáng.' : 'Vui lòng thử lại.');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  };

  // Haversine distance (meters) — chính xác cho khoảng cách ngắn
  const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // Build 51 (2026-05-17): track last reject reason for UI feedback toast.
  // Fixes Thư's "0 điểm" silent-fail bug — user wants to know app is working
  // but rejecting because GPS accuracy yếu or distance chưa đủ.
  const [autoPointRejectReason, setAutoPointRejectReason] = useState<string | null>(null);
  const autoPointRejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRejectFeedback = (reason: string) => {
    setAutoPointRejectReason(reason);
    if (autoPointRejectTimerRef.current) clearTimeout(autoPointRejectTimerRef.current);
    autoPointRejectTimerRef.current = setTimeout(() => setAutoPointRejectReason(null), 2500);
  };

  // Build 54 — speed filter + walk-away state.
  // Speed filter caches last accepted point's timestamp for dt computation.
  const lastPointTimestampRef = useRef<number | null>(null);

  /**
   * Auto-tracking handler: gọi từ watchPosition trong khi recording.
   *
   * Build 54 (CPO Đức 2026-05-18) — hai cơ chế:
   *
   * 1. Walk-away auto-stop (BEFORE accept/reject)
   *    decideWalkAway() chạy mọi GPS callback (kể cả khi point bị reject).
   *    Nếu user rời khỏi vùng polygon trong WALK_AWAY_IDLE_MS giây liên tiếp
   *    + GPS tốt + có >= 3 điểm + area > MIN_FARM_AREA_SQM → auto-stop.
   *
   * 2. Point accept/reject (sau khi walk-away không trigger)
   *    decidePointAccept() pure function trả về quyết định. Caller mutate refs
   *    bên ngoài setCoordinates updater (audit fix A3 — không mutate ref trong
   *    React updater để tránh anti-pattern với StrictMode).
   */
  const handleAutoPoint = (lat: number, lng: number, accuracy: number | null) => {
    const now = Date.now();
    const currentGPS: Coord = {
      lat,
      lng,
      timestamp: now,
      accuracy: accuracy ?? undefined,
    };

    // 1. Walk-away check — runs on every GPS callback (no accept/reject filter applied)
    const wa = decideWalkAway(
      walkAwayStateRef.current,
      currentGPS,
      accuracy,
      coordinatesRef.current,
    );
    walkAwayStateRef.current = wa.state;
    if (wa.decision.shouldStop) {
      console.log('[walk-away] auto-stop:', wa.decision.reason, wa.decision.debug);
      setEditMode('edit-ready');
      Toast.show({
        type: 'info',
        text1: wa.decision.reason === 'gps_lost_5min'
          ? 'GPS yếu — đã dừng ghi · GPS lost'
          : 'Đã dừng ghi tự động · Auto-stopped',
        text2: 'Kéo điểm để sửa, hoặc lưu nông trại · Drag to edit or save',
        visibilityTime: 3500,
      });
      return;
    }

    // 2. Point accept/reject — pure decision, then mutate refs outside updater (audit A3)
    const decision = decidePointAccept(
      coordinatesRef.current,
      currentGPS,
      lastPointTimestampRef.current,
    );

    switch (decision.kind) {
      case 'reject_accuracy':
        showRejectFeedback(`GPS sai số ${Math.round(decision.accuracyMeters)}m — đứng chỗ thoáng hơn`);
        return;
      case 'reject_distance_too_close':
        showRejectFeedback(`Chưa đủ 3m (${decision.distMeters.toFixed(1)}m) — tiếp tục đi`);
        return;
      case 'reject_distance_jump':
        showRejectFeedback(`GPS nhảy ${decision.distMeters.toFixed(0)}m — bỏ qua điểm bất thường`);
        return;
      case 'reject_vehicle':
        showRejectFeedback(`Tốc độ ${decision.speedKmh.toFixed(1)} km/h — đi bộ lại để tiếp tục`);
        return;
      case 'warn_run':
        showRejectFeedback(`Đi chậm lại (${decision.speedKmh.toFixed(1)} km/h) để GPS chính xác`);
        // fall through to accept
        break;
      case 'accept':
        break;
    }

    // Commit: pure setCoordinates updater (no ref mutation inside)
    setCoordinates(prev => [...prev, { lat, lng }]);
    // Update refs AFTER deciding to accept (audit A3)
    lastPointTimestampRef.current = now;
    walkAwayStateRef.current = { ...walkAwayStateRef.current, lastAcceptedAtMs: now };
  };

  /**
   * One-shot capture ngay lập tức (khi user vừa tap "Bắt đầu đi vòng").
   * Cần thiết vì watchPosition với distanceFilter=3m sẽ KHÔNG fire callback
   * khi user đứng yên → user thấy "0 điểm" mãi → tưởng app hỏng.
   *
   * Validate accuracy ≤ 15m; nếu kém → Alert (đây là điểm đầu tiên, cần fix tốt).
   */
  const handleCaptureNow = async (): Promise<void> => {
    if (!(await requestLocationPermission())) {
      showInfo('Cần quyền vị trí', 'Vui lòng cấp quyền truy cập vị trí.');
      return;
    }
    return new Promise(resolve => {
      Geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;
          if (accuracy != null && accuracy > 15) {
            showInfo('GPS tín hiệu yếu',
              `Sai số ~${Math.round(accuracy)}m. Vẫn ghi điểm đầu tiên nhưng nên ra chỗ thoáng. Hãy bắt đầu đi vòng — các điểm sau sẽ ghi tự động.`);
          }
          setCoordinates(prev => {
            // Nếu prev đã có điểm và khoảng cách <3m thì skip (chống trùng khi user tap rồi tap lại)
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (haversineMeters(last.lat, last.lng, lat, lng) < 3) return prev;
            }
            return [...prev, { lat, lng }];
          });
          resolve();
        },
        err => {
          console.log('[handleCaptureNow] error:', err);
          showError('Không lấy được vị trí', 'Vui lòng thử lại.');
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  };

  // Build 54 — user-typed farm name (replaces hardcoded "Trang trại ${random}")
  // Default falls back to a friendly placeholder if user leaves blank.
  const [farmNameInput, setFarmNameInput] = useState<string>('');
  const farmNameInputRef = useRef<string>('');
  useEffect(() => { farmNameInputRef.current = farmNameInput; }, [farmNameInput]);
  // B2: cờ đang gọi backend tạo vườn — khoá nút Lưu + hiện loading (§7.3), chống bấm kép.
  const [isSavingFarm, setIsSavingFarm] = useState<boolean>(false);

  /**
   * Build 54 (CPO Đức 2026-05-18) — Offline-first farm save.
   *
   * Login required: guest mode was rejected in design V4 (too much surface area
   * for data migration, privacy, attack vectors). Biometric login is fast (~5s)
   * and already simplified.
   *
   * Sequence:
   *   1. Sanity validate polygon (self-intersection, area, point count)
   *   2. Build closed GeoJSON Polygon
   *   3. SAVE LOCAL FIRST — source of truth, never lose user's GPS points
   *   4. Try backend POST best-effort (region_code='auto' — backend derives from GPS)
   *   5. Both alert + toast feedback (CPO V4 decision #9)
   *   6. Reset state + navigate
   */
  const handleAddFarm = async (boundaryMeta: BoundaryMeta) => {
    if (!user) {
      showInfo('Cần đăng nhập · Login required',
        'Bạn cần đăng nhập (vân tay / Face ID) trước khi lưu nông trại.');
      return;
    }

    try {
      console.log('[FarmDetailScreen] Creating farm (offline-first)...');

      // 1. Sanity validation
      const coordsForValidation: Coord[] = coordinates.map(c => ({ lat: c.lat, lng: c.lng }));
      const validation = validatePolygon(coordsForValidation);
      if (validation.blocking) {
        showInfo('Ranh giới chưa hợp lệ',
          validation.warnings.map(translateValidationKey).join('\n'));
        return;
      }
      if (validation.warnings.length > 0) {
        const proceed = await new Promise<boolean>(resolve => {
          showWarning(
            t('Cảnh báo ranh giới'),
            validation.warnings.map(translateValidationKey).join('\n') + t('\n\nVẫn lưu?'),
            {
              // `dismissable: false` là BẮT BUỘC ở đây: chỗ gọi đang `await` lời
              // hứa này. Đóng lặng lẽ mà không nhánh nào chạy là treo luôn việc lưu.
              dismissable: false,
              actions: [
                { text: t('Để sửa'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('Vẫn lưu'), style: 'destructive', onPress: () => resolve(true) },
              ],
            },
          );
        });
        if (!proceed) return;
      }

      // 2. Tên vườn
      const inputName = farmNameInputRef.current.trim();
      const farmName = inputName.length > 0
        ? inputName
        : `Vườn ${new Date().toLocaleDateString('vi-VN')}`;

      // 3. TẠO QUA BACKEND field-reid TRƯỚC — server sinh farm_id (uuid) THẬT.
      //    INV-1 (INTEGRATION-STANDARD §3.2): client KHÔNG tự sinh id, ghi qua API
      //    versioned; backend là nguồn sự-thật. farm_id thật là điều-kiện để enroll
      //    gắn cây ĐÚNG vườn (sửa B2 "tạo vườn nhưng cây không vào vườn"). Trước đây
      //    client tự sinh `farm-<ts>` + ghi backend Lợi → field-reid không biết id →
      //    gán farm_id=null → cây mồ-côi.
      //    farmService đóng boundary [lat,lon] từ coordinates {lat,lng}.
      setIsSavingFarm(true);
      let created;
      try {
        // Token OriLife field-reid (DID challenge-sign) — KHÁC login PhoenixKey/vân-tay.
        // Tạo vườn ghi qua backend field-reid nên PHẢI có token này. Nếu user CHƯA quét
        // cây lần nào (token chưa lấy) hoặc token 12h hết hạn → tạo vườn 401 "Phiên hết hạn"
        // dù đã đăng-nhập. Chủ-động ký DID lấy token TRƯỚC (bằng khoá, không bắt nhập lại).
        const tokenOk = await ensureOrilifeToken(ORILIFE_BASE);
        if (tokenOk) {
          created = await createReidFarm(ORILIFE_BASE, {
            name: farmName,
            boundary: coordinates,
            boundaryMethod: boundaryMeta.method,
            boundaryAccM: boundaryMeta.accM,
          });
          // Token vừa hết hạn giữa chừng (401) → làm mới 1 lần rồi thử lại.
          if (!created.ok && created.error?.type === 'auth_error') {
            const relog = await ensureOrilifeToken(ORILIFE_BASE, { force: true });
            if (relog) {
              // Lượt thử lại phải gửi ĐÚNG những gì lượt đầu gửi. Thiếu hai
              // trường ranh ở đây thì vườn nào tạo trúng lúc token hết hạn sẽ
              // mất cách-lấy-ranh và sai số — im lặng, và không lấy lại được.
              created = await createReidFarm(ORILIFE_BASE, {
                name: farmName,
                boundary: coordinates,
                boundaryMethod: boundaryMeta.method,
                boundaryAccM: boundaryMeta.accM,
              });
            }
          }
        } else {
          // Không lấy được token → coi như auth_error để nhánh dưới báo đúng.
          created = { ok: false as const, error: { type: 'auth_error' as const, detail: 'Không lấy được phiên field-reid', http_status: 401 } };
        }
      } finally {
        setIsSavingFarm(false);
      }

      if (!created.ok || !created.farm) {
        const err = created.error;
        // Phân biệt mạng ⟂ auth ⟂ server (§7.3). KHÔNG tạo bản ghi cục-bộ id-giả →
        // tránh cây mồ-côi. Giữ nguyên màn + điểm GPS để người dùng thử lại.
        if (err?.type === 'network_error') {
          showInfo('Cần kết nối mạng',
            'Tạo vườn cần mạng để máy chủ cấp mã vườn. Việc thêm cây (chụp ảnh) cũng cần mạng — hãy kết nối rồi thử lại. Các điểm GPS bạn đã ghi vẫn được giữ.');
        } else if (err?.type === 'auth_error') {
          // App đã TỰ ký DID lấy token + thử lại 1 lần ở trên → vẫn auth_error nghĩa là
          // danh-tính chưa đăng-ký trên máy chủ (DID mồ côi) hoặc máy chủ đang trục-trặc.
          showError('Chưa xác thực được với máy chủ',
            'Không tạo được phiên với máy chủ nhận diện. Thử đăng xuất rồi đăng nhập lại; nếu vẫn lỗi, có thể danh tính chưa được đăng ký trên máy chủ.');
        } else {
          showError('Chưa lưu được vườn', fieldErrorMessage(err));
        }
        return;
      }

      // 4. Lưu CACHE SQLite (offline-first đọc lại) với id THẬT từ server.
      //    owner = người đăng-nhập → loadFarms(user.id) khớp. Lỗi cache = không chặn
      //    (vườn đã ở backend = nguồn sự-thật).
      const serverFarm = { ...created.farm, userId: user.id };
      try {
        await dispatch(saveFarm(serverFarm)).unwrap();
        console.log('[FarmDetailScreen] ✅ Farm created on backend + cached:', serverFarm.id);
      } catch (localErr: any) {
        console.warn('[FarmDetailScreen] Local cache save failed (non-blocking):', localErr?.message);
      }

      Toast.show({
        type: 'success',
        text1: '✓ Đã tạo vườn',
        text2: 'Giờ bạn có thể thêm cây vào vườn này',
        visibilityTime: 2500,
      });

      // 5. Reset state + navigate
      walkAwayStateRef.current = initWalkAwayState();
      lastPointTimestampRef.current = null;
      setEditMode('recording');
      setEditHistory([]);
      navigation.goBack();
    } catch (error: any) {
      console.error('[FarmDetailScreen] Unexpected error in handleAddFarm:', error);
      showError('Lỗi không xác định',
        error?.message ?? 'Vui lòng thử lại. Dữ liệu GPS của bạn vẫn an toàn.');
    }
  };

  // i18n placeholder — convert sanity-check keys to user-facing Vietnamese.
  // Future: pull from i18n library.
  function translateValidationKey(key: string): string {
    switch (key) {
      case 'polygon_too_few_points': return `Cần ít nhất ${MIN_POINTS_TO_DEFINE} điểm`;
      case 'polygon_self_intersection': return 'Đường ranh giới cắt nhau — vẽ lại';
      case 'polygon_too_small': return 'Ranh giới quá nhỏ (cạnh < 5m)';
      case 'polygon_too_large': return 'Diện tích quá lớn (> 1000 ha)';
      default: return key;
    }
  }

  // ── Edit-mode handlers (Build 54) ─────────────────────────────────────────
  const pushEditHistory = (snapshot: { lat: number; lng: number }[]) => {
    setEditHistory(h => [...h.slice(-9), snapshot]); // keep last 10 snapshots
  };

  const handleVertexDragEnd = (index: number, newLat: number, newLng: number) => {
    pushEditHistory(coordinatesRef.current);
    setCoordinates(prev => {
      const next = [...prev];
      next[index] = { lat: newLat, lng: newLng };
      return next;
    });
  };

  const handleVertexLongPress = (index: number) => {
    if (coordinatesRef.current.length <= MIN_POINTS_TO_DEFINE) {
      Toast.show({
        type: 'info',
        text1: `Tối thiểu ${MIN_POINTS_TO_DEFINE} điểm · Minimum ${MIN_POINTS_TO_DEFINE}`,
        visibilityTime: 1500,
      });
      return;
    }
    showWarning('Xoá điểm này? · Delete this point?', `Điểm số ${index + 1}`, {
        confirmText: 'Xoá · Delete',
        cancelText: 'Huỷ · Cancel',
        onConfirm: () => {
            pushEditHistory(coordinatesRef.current);
            setCoordinates(prev => prev.filter((_, i) => i !== index));
          },
    });
  };

  const handleMapTapInsert = (tapLat: number, tapLng: number) => {
    const decision = decideTapInsert({ lat: tapLat, lng: tapLng }, coordinatesRef.current);
    switch (decision.kind) {
      case 'skip_near_vertex':
        // Silent — user probably meant to drag the nearby vertex
        return;
      case 'skip_far_from_polygon':
        // Silent — random map tap, not actionable
        return;
      case 'skip_max_vertices':
        Toast.show({
          type: 'info',
          text1: `Tối đa ${MAX_VERTICES} điểm · Maximum ${MAX_VERTICES}`,
          visibilityTime: 1500,
        });
        return;
      case 'insert':
        pushEditHistory(coordinatesRef.current);
        setCoordinates(prev => {
          const next = [...prev];
          next.splice(decision.segmentIndex + 1, 0, decision.point);
          return next;
        });
        return;
    }
  };

  const handleUndo = () => {
    setEditHistory(h => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setCoordinates(last);
      return h.slice(0, -1);
    });
  };

  const handleResetFromScratch = () => {
    showWarning('Vẽ lại từ đầu? · Reset?', 'Xoá toàn bộ điểm hiện tại và bắt đầu lại?', {
        confirmText: 'Vẽ lại · Reset',
        cancelText: 'Huỷ · Cancel',
        onConfirm: () => {
            setCoordinates([]);
            setEditHistory([]);
            setEditMode('recording');
            walkAwayStateRef.current = initWalkAwayState();
            lastPointTimestampRef.current = null;
          },
    });
  };

  const handleResumeRecording = () => {
    // Continue recording from current state — reset walk-away timer so we don't
    // auto-stop again immediately at the same location.
    walkAwayStateRef.current = initWalkAwayState();
    setEditMode('recording');
  };

  // Build 55 — chế độ "Tự vẽ điểm": nhấn lên bản đồ → thêm điểm vào cuối polygon.
  // Khác handleMapTapInsert (chèn vào cạnh gần nhất): ở đây user vẽ tuần tự từng
  // đỉnh nên append đúng trực giác. Có undo history + chặn vượt trần MAX_VERTICES.
  const handleManualTapAppend = (lat: number, lng: number) => {
    if (coordinatesRef.current.length >= MAX_VERTICES) {
      Toast.show({
        type: 'info',
        text1: `Tối đa ${MAX_VERTICES} điểm · Maximum ${MAX_VERTICES}`,
        visibilityTime: 1500,
      });
      return;
    }
    pushEditHistory(coordinatesRef.current);
    setCoordinates(prev => [...prev, { lat, lng }]);
  };

  // Build 55 — xoá 1 điểm từ popup chi tiết. Không chặn tối thiểu (user đang
  // dựng polygon); validatePolygon lúc lưu mới bắt buộc ≥3 điểm.
  const handleDeleteVertex = (index: number) => {
    if (index < 0 || index >= coordinatesRef.current.length) return;
    pushEditHistory(coordinatesRef.current);
    setCoordinates(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTree = async () => {
    // Thay scanner cũ bằng màn Nhận diện (TreeIdentity) — giống nút quick "Nhận diện".
    // GPS/ranh giới vườn trên bản đồ vẫn giữ nguyên (recording coordinates ở dưới).
    (navigation as any).navigate('TreeIdentity', { farmId: farm_id });
  };

  // Build 54 V5 — Quick Action "Cây" from HomeScreen passes autoStartScanner=true.
  // We trigger handleAddTree once after farm is loaded so the scanner opens
  // automatically without requiring the user to find and tap "+Add tree".
  // Guard with a ref so we only auto-fire ONCE per mount.
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (autoStartFiredRef.current) return;
    if (!params.autoStartScanner) return;
    if (!farm_id) return;
    if (!farm) return; // wait until loadFarm resolves so handleAddTree has context
    autoStartFiredRef.current = true;
    // Small delay so navigation transition finishes first
    const t = setTimeout(() => { handleAddTree(); }, 300);
    return () => clearTimeout(t);
  }, [params.autoStartScanner, farm_id, farm]);






  const handleUpdateOnnet = async () => {
    if (!treeIdentificationResult || !farm_id) return;

    const treeData = {
      id: `tree_${Date.now()}`,
      farmId: farm_id,
      code: treeIdentificationResult.code,
      latitude: coordinates[0]?.lat || 0,
      longitude: coordinates[0]?.lng || 0,
      species: 'Durian',
      plantedYear: new Date().getFullYear(),
      images: treeIdentificationResult.images,
      estimatedFruits: treeIdentificationResult.estimatedFruits,
      fruitCount: 0,
      scanData: treeIdentificationResult.scanData,
    };
    await dispatch(saveTree(treeData));
    setTreeIdentificationResult(null);
    setCurrentPage(1);
    // TODO: Implement blockchain update and credit deduction
  };

  const handleCancelIdentification = () => {
    setTreeIdentificationResult(null);
  };

  /**
   * Đổi tên vườn — MÁY CHỦ TRƯỚC, kho máy sau.
   *
   * ── Bản trước ghi ĐI ĐÂU MẤT ────────────────────────────────────────────
   * Hàm này chỉ `dispatch(saveFarm(...))`, tức chỉ ghi SQLite trên máy. Tên mới
   * hiện đúng, không lỗi, không trạng thái chờ — rồi biến mất khi gỡ app hoặc
   * đổi máy, và người dùng không có cách nào nhìn ra. `updateFarm()` đã có sẵn ở
   * `services/farmService.ts` trỏ đúng `POST /api/farm/{id}/update`, chỉ là chưa
   * nơi nào gọi.
   *
   * ── Vì sao KHÔNG ghi cục bộ khi máy chủ trượt ───────────────────────────
   * App này không có hàng đợi đồng bộ. Ghi cục bộ rồi báo xong là dựng lại đúng
   * cái vỏ im lặng vừa gỡ, chỉ khác là lần này có chủ ý. Trượt thì nói thẳng,
   * giữ nguyên tên cũ trên màn — người dùng thấy tên chưa đổi thì biết là chưa
   * đổi. Đánh đổi phải nói rõ: mất mạng thì KHÔNG đổi tên được nữa, trong khi
   * bản cũ "đổi được" — nhưng cái đổi được đó không sống qua lần cài lại.
   *
   * ── Bẫy đã tránh, đừng vô tình mở lại ───────────────────────────────────
   * CHỈ gửi `{ name }`. Hợp đồng máy chủ: gửi `boundary_json` mà thiếu
   * `boundary_method` thì nó ĐẶT LẠI nguồn-gốc ranh về `unknown` và xoá sai số —
   * tức một lần đổi tên là mất sạch lời khai đo đạc, im lặng. `_buildFarmForm`
   * chỉ đính ranh khi có ranh, nên gọi với mỗi `name` là an toàn. Ai thêm trường
   * vào lời gọi này phải đọc lại docstring của `updateFarm` trước.
   */
  const handleUpdateFarmName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!farm_id || !trimmed) return;

    try {
      // 1. Ghi lên máy chủ trước — nguồn sự-thật. Cùng nếp token với đường tạo
      //    vườn ở `handleAddFarm`: ký DID lấy phiên field-reid, hết hạn thì làm
      //    mới đúng một lần rồi thử lại.
      let saved;
      const tokenOk = await ensureOrilifeToken(ORILIFE_BASE);
      if (tokenOk) {
        saved = await updateFarm(ORILIFE_BASE, farm_id, { name: trimmed });
        if (!saved.ok && saved.error?.type === 'auth_error') {
          const relog = await ensureOrilifeToken(ORILIFE_BASE, { force: true });
          if (relog) saved = await updateFarm(ORILIFE_BASE, farm_id, { name: trimmed });
        }
      } else {
        saved = {
          ok: false as const,
          error: {
            type: 'auth_error' as const,
            detail: 'Không lấy được phiên field-reid',
            http_status: 401,
          },
        };
      }

      if (!saved.ok) {
        const err = saved.error;
        if (err?.type === 'network_error') {
          showInfo('Cần kết nối mạng',
            'Đổi tên vườn cần mạng để máy chủ ghi lại. Tên cũ được giữ nguyên — hãy kết nối rồi thử lại.');
        } else if (err?.type === 'auth_error') {
          showError('Chưa xác thực được với máy chủ',
            'Không tạo được phiên với máy chủ nhận diện. Thử đăng xuất rồi đăng nhập lại; nếu vẫn lỗi, có thể danh tính chưa được đăng ký trên máy chủ.');
        } else {
          showError('Chưa đổi được tên', fieldErrorMessage(err));
        }
        return;
      }

      // 2. Máy chủ đã nhận → cập nhật kho máy để đọc lại lúc không mạng.
      //    Trước đây dùng loadFarms(farm_id) — SAI action (loadFarms nhận userId,
      //    trả MẢNG farm) rồi spread cả object thunk action vào farm → mất hết
      //    field + null user_id khi lưu. Dùng loadFarm (đơn) + unwrap payload,
      //    map user_id (snake từ SQLite) → userId (saveFarm đọc farm.userId).
      //
      //    Lỗi ở bước này KHÔNG chặn: tên đã nằm ở máy chủ, lần đồng bộ sau lấy
      //    lại được. Cùng lối với đường tạo vườn.
      try {
        const action = await dispatch(loadFarm(farm_id));
        const oldFarm: any = (action as any).payload;
        if (oldFarm) {
          await dispatch(saveFarm({
            id: oldFarm.id,
            name: trimmed,
            coordinates: oldFarm.coordinates ?? [],
            userId: oldFarm.userId ?? oldFarm.user_id ?? user?.id,
          }));
        } else {
          console.warn('[FarmDetailScreen] handleUpdateFarmName: farm not in local cache', farm_id);
        }
      } catch (cacheErr: any) {
        console.warn('[FarmDetailScreen] Local cache rename failed (non-blocking):', cacheErr?.message);
      }

      // Cập nhật local state ngay để tên mới hiển thị (saveFarm chỉ cập nhật
      // state.farm.farms, không cập nhật biến `farm` cục bộ của màn này).
      setFarm((prev: any) => (prev ? { ...prev, name: trimmed } : prev));
    } catch (error: any) {
      console.error('Error updating farm name:', error);
      showError('Không đổi được tên', error?.message ?? 'Vui lòng thử lại.');
    }
  };

  // ⛔ ĐỌC `resolveFarmDetailView` TRƯỚC KHI SỬA KHỐI NÀY. Nhánh `create` chỉ được
  // chạy khi KHÔNG có `farm_id`. Đưa nó về lại `if (!farm)` là dựng lại đúng lỗi
  // "màn chi tiết hoá thành màn tạo" ⇒ vườn trùng.
  const view = resolveFarmDetailView({ farmId: farm_id, farm, loadState: farmLoadState });

  if (view === 'loading') {
    // Không dùng `StateView status="loading"`: nó vẽ khung xương và BỎ QUA `title`,
    // nên người dùng không đọc được là màn đang mở vườn nào chứ không phải đứng im.
    return (
      <View style={styles.root}>
        <View style={styles.coordMapLoadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.coordMapLoadingText}>Đang mở vườn…</Text>
        </View>
      </View>
    );
  }

  if (view === 'unavailable') {
    // Nói thẳng là chưa mở được, và để người dùng thử lại. KHÔNG hiện biểu mẫu
    // trống: người dùng sẽ điền nó và tạo ra một vườn thứ hai trùng vườn đang có.
    return (
      <View style={styles.root}>
        <StateView
          status="error"
          title="Chưa mở được vườn này"
          message="Vườn chưa có trên máy. Kiểm tra kết nối rồi thử lại; nếu vẫn không được, mở lại từ danh sách vườn."
          actionLabel="Thử lại"
          onRetry={() => fetchFarm(farm_id)}
        />
      </View>
    );
  }

  if (view === 'create') {
    return (
      <AddFarmMode
        coordinates={coordinates}
        setCoordinates={setCoordinates}
        editMode={editMode}
        setEditMode={setEditMode}
        editHistoryLength={editHistory.length}
        onPointCandidate={handleAutoPoint}
        onCaptureNow={handleCaptureNow}
        onFinish={handleAddFarm}
        onBack={() => navigation.goBack()}
        rejectReason={autoPointRejectReason}
        farmName={farmNameInput}
        onFarmNameChange={setFarmNameInput}
        onVertexDragEnd={handleVertexDragEnd}
        onManualTapAppend={handleManualTapAppend}
        onDeleteVertex={handleDeleteVertex}
        onUndo={handleUndo}
        onResetFromScratch={handleResetFromScratch}
        isSaving={isSavingFarm}
      />
    );
  }

  const MapView = () => {
    const MapLib = mapModule?.default ? mapModule.default : mapModule;
    const canRenderMap = Boolean(MapLib?.MapView);
    const polygonCoords = farm.coordinates && farm.coordinates.length >= 3
      ? [...farm.coordinates.map((c: any) => [c.lng, c.lat]), [farm.coordinates[0].lng, farm.coordinates[0].lat]]
      : [];

    if (mapError) {
      return (
        <View style={styles.coordMapErrorContainer}>
          <Text style={styles.coordMapErrorText}>Không thể tải bản đồ: {mapError}</Text>
          <TouchableOpacity
            style={[styles.recordBtn, { marginTop: 12, paddingVertical: 10, paddingHorizontal: 14 }]}
            onPress={() => {
              setMapError(null);
              setMapReady(false);
              setMapModule(null);
              import('@maplibre/maplibre-react-native')
                .then(mod => setMapModule(mod))
                .catch(e => setMapError(e?.message ?? String(e)));
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.recordBtnText, { color: COLORS.white }]}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!mapModule) {
      return (
        <View style={styles.coordMapLoadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.coordMapLoadingText}>Đang tải bản đồ...</Text>
        </View>
      );
    }

    if (!canRenderMap) {
      return (
        <View style={styles.coordMapErrorContainer}>
          <Text style={styles.coordMapErrorText}>Bản đồ không khả dụng trên thiết bị này.</Text>
        </View>
      );
    }

    return (
      <MapErrorBoundary>
        <MapLib.MapView
          style={StyleSheet.absoluteFillObject}
          logoEnabled={false}
          attributionEnabled={false}
          onDidFinishLoadingMap={() => setMapReady(true)}
        >
          <MapLib.Camera
            zoomLevel={14}
            centerCoordinate={
              farm.coordinates && farm.coordinates.length > 0
                ? [farm.coordinates[0].lng, farm.coordinates[0].lat]
                : [106.660172, 10.762622]
            }
          />

          {/* Always show base map tiles for streets and areas.

              ⛔ Ba dòng subdomain OSM đã ngưng (`a|b|c.tile…`) NẰM Ở ĐÂY tới tận
              bản này, dù chỗ ngay trên trong CÙNG TỆP đã vá và ghi hẳn lý do ra.
              Chúng không phân giải được, nên lớp bản đồ đường phố ra một mảng
              xanh dương trống trong khi vệ tinh vẫn chạy (vệ tinh trỏ ArcGIS).
              Nay cả hai nguồn lấy từ MỘT hằng — xem `mapTiles.ts`. */}
          <MapLib.RasterSource
            id="osm-tiles-detail"
            tileUrlTemplates={[OSM_STREET_TILES]}
            tileSize={256}
          >
            <MapLib.RasterLayer id="osm-tiles-layer-detail" sourceID="osm-tiles-detail" />
          </MapLib.RasterSource>

          {farm.coordinates && farm.coordinates.length > 0 && (
            farm.coordinates.map((coord: any, idx: number) => (
              <MapLib.PointAnnotation
                key={`coord-${idx}`}
                id={`coord-${idx}`}
                coordinate={[coord.lng, coord.lat]}
              >
                <View style={styles.coordMarker}>
                  <Text style={styles.coordMarkerText}>{idx + 1}</Text>
                </View>
              </MapLib.PointAnnotation>
            ))
          )}

          {polygonCoords.length > 0 && (
            <MapLib.ShapeSource
              id="farm-polygon-source-detail"
              shape={{
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [polygonCoords],
                },
              }}
            >
              <MapLib.FillLayer
                id="farm-polygon-fill-detail"
                style={{ fillColor: 'rgba(46, 204, 113, 0.25)' }}
              />
              <MapLib.LineLayer
                id="farm-polygon-line-detail"
                style={{ lineColor: COLORS.accent, lineWidth: 2 }}
              />
            </MapLib.ShapeSource>
          )}
        </MapLib.MapView>
      </MapErrorBoundary>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <FarmDetailMode
        farm={farm}
        trees={trees}
        searchQuery={searchQuery}
        currentPage={currentPage}
        onSearchChange={setSearchQuery}
        onPageChange={setCurrentPage}
        onAddTree={handleAddTree}
        onActivityUpdate={() => {
          // @ts-ignore
          (navigation.navigate as any)('Activity', { farm })
        }}
        onBack={() => navigation.goBack()}
        onUpdateFarmName={handleUpdateFarmName}
        onCoordinatesPress={() => setCoordMapVisible(true)}
        onView3DFarm={() => {
          // Toàn cảnh vườn: KHÔNG truyền treeId → Space3D mở ở chế độ vườn.
          // farm_id là nguồn dự phòng khi `farm` (đọc từ SQLite) chưa về.
          (navigation.navigate as any)('Space3D', {
            mode: 'farm',
            farmId: farm?.id ?? farm_id ?? undefined,
          });
        }}
      />

      {coordMapVisible && (
        <View style={styles.coordMapOverlay}>
          <View style={styles.coordMapHeader}>
            <Text style={styles.coordMapHeaderText}>Bản đồ toạ độ nông trại</Text>
            <TouchableOpacity onPress={() => setCoordMapVisible(false)}>
              <Icon name="xmark" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.coordMapContainer}>
            <MapView />
          </View>
        </View>
      )}

      {treeIdentificationResult && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }]}>
          <View style={[styles.identificationResult, { zIndex: 10000, elevation: 10000 }]}>
            <View style={styles.resultHeader}>
              <Icon name="circle-check" size={48} color={COLORS.success} />
              <Text style={styles.resultTitle}>Đã xác định 1 cây!</Text>
            </View>

            <View style={styles.resultDetails}>
              <Text style={styles.resultCode}>Mã cây: {treeIdentificationResult.code}</Text>
              <Text style={styles.resultFruits}>Dự kiến: {treeIdentificationResult.estimatedFruits} quả</Text>
            </View>

            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelIdentification}>
                <Text style={styles.cancelButtonText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.updateButton} onPress={handleUpdateOnnet}>
                <Text style={styles.updateButtonText}>Cập nhật onnet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ORG_SURFACE.ground },

  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORG_SURFACE.raised,
    padding: 20,
  },
  mapFallbackText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // Header
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: ORG_SURFACE.ground,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 44, height: 44, ...ORGANIC_TILE,
    backgroundColor: ORG_SURFACE.raised,
    alignItems: 'center', justifyContent: 'center',
    ...ORG_ELEV.card,
  },
  headerEyebrow: {
    fontSize: 14, fontWeight: '600', color: ORG_TONE.primary,
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 26, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.4,
  },
  activityBtn: {
    width: 44, height: 44, ...ORGANIC_TILE,
    backgroundColor: ORG_TONE.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },

  // Stats banner
  // ── Nút cây + lưới ba cột ─────────────────────────────────────────────────
  treeGridHang: { gap: 12, marginBottom: 12 },
  /*
   * Lòng nút KHÔNG có nền riêng nữa — nền là `fill` của chính hình tròn SVG
   * (xem `RingProgress`). Một `View` bo tròn lồng vào giữa là một mép THỨ HAI, và
   * hai mép không bao giờ khớp tuyệt đối — chúng để lại một đường chỉ mờ, và cái
   * vòng đọc ra "thứ đeo quanh nút" thay vì "viền của nút".
   */
  treeChipTen: {
    fontSize: 13, fontWeight: '700', color: ORG_NATURE.bark,
    textAlign: 'center', letterSpacing: -0.2, lineHeight: 16,
  },
  /**
   * Gạch nối giữa tên và số — ngắn, nhạt, không chạm hai bên.
   *
   * Nó là thứ duy nhất trong nút không mang tin, và có mặt vì một lý do: hai dòng
   * chữ cỡ gần nhau đặt sát nhau thì mắt đọc thành một cụm ba dòng rối. Một vạch
   * mảnh chia nó thành "nhãn" và "số liệu" mà không thêm một mảng nền nào.
   */
  treeChipGach: {
    width: 16, height: 1, marginVertical: 5,
    backgroundColor: ORG_TONE.border,
  },
  /** Số quả dùng CHÍNH sắc của cung tiến độ — đó là thứ nối giữa và viền. */
  treeChipSo: {
    fontSize: 15, fontWeight: '800', color: ORG_TONE.primary,
    letterSpacing: -0.3, lineHeight: 18,
  },
  treeChipDonVi: { fontSize: 11, fontWeight: '600', color: ORG_NATURE.barkSoft },

  // ── Popup chi tiết cây ────────────────────────────────────────────────────
  cayPopupNen: { ...StyleSheet.absoluteFillObject, backgroundColor: ORG_SURFACE.scrim },
  cayPopupBoc: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  cayPopup: {
    width: '100%', maxWidth: 420,
    borderRadius: 20, padding: 20, gap: 16,
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.border,
    // Lớp chuyển sắc trải kín nằm dưới nội dung — thiếu dòng này thì nó tràn
    // qua góc bo.
    overflow: 'hidden',
  },
  cayPopupDau: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cayPopupPct: { fontSize: 15, fontWeight: '800', color: ORG_NATURE.bark, letterSpacing: -0.5 },
  cayPopupTen: { fontSize: 19, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.3 },
  cayPopupPhu: { fontSize: 13, color: ORG_NATURE.barkSoft, marginTop: 2 },
  cayPopupBang: { gap: 2 },
  cayPopupHang: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: ORG_TONE.border,
  },
  cayPopupNhan: { fontSize: 14, color: ORG_NATURE.barkSoft },
  cayPopupGt: { fontSize: 15, fontWeight: '700', color: ORG_NATURE.bark },
  /** "(ước tính)" phải KHÁC mắt so với con số — cùng lý do với dòng thông tin phụ. */
  cayPopupUoc: { fontSize: 12, fontWeight: '400', fontStyle: 'italic', color: ORG_NATURE.barkSoft },
  cayPopupNut: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    // Cùng họ màu với lớp phủ — xem chú thích ở `activityLargeBtn`.
    backgroundColor: ORG_GRADIENT.action.from,
  },
  cayPopupNutTxt: { fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2 },

  // ── Lưới Bento ────────────────────────────────────────────────────────────
  //
  // KHE HỞ HẸP, Ô RỘNG. Bản đầu dùng thẳng `SPACE.page` (16) và `SPACE.md` (12)
  // cho lề và khe — đúng thang chung của module, nhưng ở đây nó ăn 44 điểm bề
  // ngang cho hai ô đứng cạnh nhau, tức gần 12% màn hẹp dành cho chỗ trống.
  // Lưới Bento sống bằng KHỐI, không bằng khoảng trắng giữa các khối; khe rộng
  // làm các ô rời ra thành từng thẻ lẻ và mất luôn cảm giác một lưới.
  //
  // Nay lề 12, khe 8. Vẫn đủ để mắt tách hai ô, mà trả lại 20 điểm bề ngang cho
  // chính nội dung — trên máy hẹp đó là chỗ cho hình vườn thở.
  bento: { paddingBottom: 2 },

  /** Dòng thông tin phụ: nhỏ, không viền, không bấm được. */
  bentoFacts: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingBottom: ORG_SPACE.sm,
  },
  bentoFactTxt: { fontSize: 13, color: ORG_NATURE.barkSoft },
  /** "(ước tính)" phải KHÁC mắt so với con số, nếu không nó chỉ là chữ trang trí. */
  bentoFactHint: { fontStyle: 'italic', color: ORG_NATURE.barkSoft },
  bentoFactDot: {
    width: 3, height: 3, borderRadius: 2,
    backgroundColor: ORG_TONE.border, marginHorizontal: 2,
  },

  bentoHero: { marginHorizontal: 12, paddingHorizontal: 0, paddingVertical: ORG_SPACE.md },
  bentoHeroHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: ORG_SPACE.md, paddingBottom: ORG_SPACE.sm,
  },
  bentoHeroTitle: {
    fontSize: 17, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.2,
  },

  /** Hai ô xem trước: cao hơn rộng một chút, đủ chỗ cho hình vườn thở. */
  bentoPreviews: { marginTop: 8 },
  bentoPreview: { height: 132, justifyContent: 'flex-end', alignItems: 'center' },
  /** Số điểm ranh giới — chữ nhỏ ĐÈ lên hình, không chiếm một hàng riêng. */
  bentoPreviewDiem: {
    fontSize: 12, fontWeight: '700', color: ORG_NATURE.barkSoft,
    paddingBottom: 8,
  },
  /**
   * Huy hiệu 3D — góc trên-trái, trên NỀN TỐI.
   *
   * Nền của nó là một lớp sáng rất mờ chứ không phải màu đặc: ô là không gian
   * phát sáng, nên một chip trắng đục nằm đè lên trông như dán giấy lên màn.
   */
  bentoBadge3D: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(127, 231, 196, 0.12)',
    borderWidth: 1, borderColor: 'rgba(127, 231, 196, 0.32)',
  },
  bentoBadge3DTxt: { fontSize: 11, fontWeight: '800', color: SANG_KHONG_GIAN },

  /** Chỉ hiện khi CHƯA có hình để vẽ — lúc đó ô phải tự nói nó mở ra cái gì. */
  bentoPreviewMoi: {
    fontSize: 14, fontWeight: '700', color: ORG_TONE.primary,
    textAlign: 'center', paddingBottom: 14, paddingHorizontal: 8,
  },
  // ⛔ Cùng chữ, KHÁC nền ⇒ phải khác kiểu.
  //
  // Ô "Xem sơ đồ 3D" nằm trong `<BentoTile tone="space">`, tức nền TỐI
  // (`GRADIENT.space`), còn ô "Vẽ ranh giới vườn" nằm trên nền sáng. Trước bản
  // này cả hai dùng chung `bentoPreviewMoi` với `TONE.primary` — chữ xanh đậm
  // trên nền tối, tương phản đo được **1,50** ở chặng sáng nhất của dải và
  // **1,94** ở chỗ chữ thật sự đứng. Ngưỡng AA là 4,5; ngoài nắng thì bằng 0.
  //
  // Nó rơi đúng vào vườn VỪA TẠO, chưa đi ranh giới — lúc `FarmShape` trả
  // `null` nên ô chỉ còn một hình chữ nhật tối và đúng dòng chữ này. Tức lời
  // mời tàng hình ở đúng lúc người dùng cần nó nhất.
  //
  // `Surface.tsx` đã viết ra luật này thành chữ: ô có `onDark` thì chữ bên
  // trong PHẢI là chữ sáng, và ô không tự đổi màu chữ của con.
  bentoPreviewMoiToi: {
    fontSize: 14, fontWeight: '700', color: ORG_NATURE.paper,
    textAlign: 'center', paddingBottom: 14, paddingHorizontal: 8,
  },

  bentoActions: { marginTop: 8, marginBottom: ORG_SPACE.lg },
  bentoAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: ORG_SPACE.md,
  },
  bentoActionTxt: {
    fontSize: 14, fontWeight: '700', color: ORG_NATURE.bark, textAlign: 'center',
  },

  /** Số cây, đặt cạnh chính danh sách nó đếm. */
  sectionCount: {
    fontSize: 14, fontWeight: '700', color: ORG_NATURE.barkSoft,
    marginLeft: 2,
  },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12, marginBottom: 8,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent,
  },
  sectionTitle: {
    fontSize: 19, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.2,
  },
  addTreeBtn: { overflow: 'hidden', borderRadius: 10 },
  addTreeBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: ORG_TONE.border,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  addTreeBtnText: {
    fontSize: 13, fontWeight: '600', color: COLORS.accent,
  },

  // Tree list
  treeListContent: {
    // 12, cùng mép với lưới Bento ở trên. Lệch mép giữa phần đầu và phần danh
    // sách là thứ mắt bắt được ngay dù không gọi tên ra được.
    paddingHorizontal: 12, paddingTop: 4, flexGrow: 1,
  },

  // Tree card
  treeCapture3DBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingVertical: 7, paddingHorizontal: 10,
    borderRadius: 10, alignSelf: 'flex-start',
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: 'rgba(59,110,168,0.18)',
  },
  treeCapture3DBtnText: {
    fontSize: 12, fontWeight: '600', color: COLORS.accent,
  },

  // Tree empty
  treeEmpty: {
    alignItems: 'center', paddingTop: 48, gap: 10,
  },
  treeEmptyText: {
    fontSize: 14, color: COLORS.textMuted, marginTop: 4,
  },
  treeEmptyBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 12, backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  treeEmptyBtnText: {
    fontSize: 13, fontWeight: '600', color: COLORS.accent,
  },

  // ── Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
    gap: 8,
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

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    backgroundColor: ORG_SURFACE.ground,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  scan3DExistingBtn: {
    marginBottom: 10,
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
  },
  scan3DExistingBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  activityLargeBtn: {
    /*
      ⛔ Nền lấy từ CHÍNH token chuyển sắc, KHÔNG lấy `COLORS.accent`.

      Nút này có một lớp `GradientFill name="action"` phủ lên. Nền ở dưới chỉ
      hiện ra khi lớp phủ không phủ kín — và lúc đó nó phải CÙNG HỌ MÀU, để chỗ
      hở chỉ hơi lệch sắc chứ không thành một mảng màu khác hẳn.

      `COLORS.accent` không cùng họ: ở lớp token mặc định (`theme/tokens.ts:47`)
      nó là XANH DƯƠNG `#3B6EA8`, trong khi `GRADIENT.action` là xanh lá. Đó là
      lý do thật của "nút nửa trên xanh lá, nửa dưới xanh dương" — nền và lớp
      phủ khác họ màu, cộng một lớp phủ có lúc hở.

      Hai lượt vá trước sửa hai lỗi CÓ THẬT (id trùng, toạ độ dạng chuỗi phần
      trăm) nhưng không phải lỗi này, nên triệu chứng còn nguyên qua cả hai.
      Dòng này làm cho dù lớp phủ có hở lần nữa, người dùng cũng không thấy hai
      màu — nó không sửa chỗ hở, nó làm chỗ hở thôi nhìn thấy được.
    */
    backgroundColor: ORG_GRADIENT.action.from,
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, overflow: 'hidden', position: 'relative',
    ...ORG_ELEV.cardStrong,
  },
  activityLargeBtnText: {
    fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2,
  },

  // Shared
  /**
   * ⛔ ĐÃ GỠ khỏi nút "Cập nhật hoạt động", giữ định nghĩa vì màn khác còn dùng.
   *
   * Nó là một lớp trắng mờ phủ ĐÚNG NỬA TRÊN (`height: '50%'`) — mép dưới của
   * nó là một đường ngang CẮT NGANG nút. Trên một nền màu phẳng thì gần như
   * không thấy; trên nền chuyển sắc thì nửa trên bị nâng sáng còn nửa dưới thì
   * không, và cái đường ấy hiện rõ thành ranh giới hai mảng màu.
   *
   * Nó ra đời để GIẢ một vệt sáng trên nền phẳng. Nay nền đã là chuyển sắc thật,
   * nên nó vừa thừa vừa phá đúng thứ nó từng giả.
   */
  btnShine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%', backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
  },

  // ── Add Farm Mode ──────────────────────────────────────────────────────────
  addFarmMapPane: {
    flex: 1,
    minHeight: 280,
    position: 'relative',
  },
  addFarmFormPane: {
    flexShrink: 0,
    maxHeight: height * 0.44,
    backgroundColor: ORG_SURFACE.ground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  addFarmContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  instructionCard: {
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: ORG_TONE.border,
    marginBottom: 16,
    ...ORG_ELEV.card,
  },
  instructionIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  instructionTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.text,
    letterSpacing: -0.2, marginBottom: 8,
  },
  instructionBody: {
    fontSize: 14, color: COLORS.textSub, lineHeight: 22,
  },
  gpsStatusCard: {
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: ORG_TONE.border,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  gpsStatusLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  gpsStatusTitle: {
    fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2,
  },
  gpsStatusSub: {
    fontSize: 12, color: COLORS.textMuted,
  },
  coordCountWrap: {
    alignItems: 'center', backgroundColor: COLORS.accentGlow,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: ORG_TONE.border,
    flexShrink: 0,
  },
  coordCountNum: {
    fontSize: 22, fontWeight: '800', color: COLORS.accent, letterSpacing: -0.5,
  },
  coordCountLabel: {
    fontSize: 11, color: COLORS.accentLight, fontWeight: '600',
  },

  coordMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  coordMapHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ORG_SURFACE.raised,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
  },
  coordMapHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  coordMapContainer: {
    width: '100%',
    height: '80%',
    backgroundColor: ORG_SURFACE.ground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
    overflow: 'hidden',
    marginTop: 8,
  },
  coordMapLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORG_SURFACE.raised,
  },
  coordMapLoadingText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  coordMapErrorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORG_SURFACE.raised,
    padding: 16,
  },
  coordMapErrorText: {
    fontSize: 14,
    color: COLORS.error,
    textAlign: 'center',
  },
  coordMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    borderColor: COLORS.white,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordMarkerText: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '700',
  },

  coordPreview: {
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  coordPreviewLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 1.5,
  },
  coordChip: {
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginRight: 8, borderWidth: 1, borderColor: ORG_TONE.border,
  },
  coordChipText: { fontSize: 11, color: COLORS.textSub, fontWeight: '500' },

  // GPS pulse
  pulseWrap: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.success,
  },
  pulseDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success,
  },

  // Add farm actions
  addFarmActions: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: ORG_SURFACE.ground,
  },
  recordBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.accent,
    backgroundColor: COLORS.accentGlow,
  },
  recordBtnText: {
    fontSize: 13, fontWeight: '700', color: COLORS.accent,
  },
  autoTrackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16,
    borderRadius: 14, backgroundColor: COLORS.accent,
    ...ORG_ELEV.cardStrong,
  },
  autoTrackBtnActive: {
    backgroundColor: '#C0533A',
    ...ORG_ELEV.card,
  },
  autoTrackBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  autoTrackBtnText: {
    fontSize: 15, fontWeight: '800', color: COLORS.white, letterSpacing: 0.2,
  },
  finishBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15,
    borderRadius: 14, backgroundColor: COLORS.accent,
    overflow: 'hidden', position: 'relative',
    ...ORG_ELEV.cardStrong,
  },
  finishBtnDisabled: { opacity: 0.45 },
  finishBtnText: {
    fontSize: 15, fontWeight: '700', color: COLORS.white,
  },
  minPointsNote: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    paddingBottom: 8, paddingHorizontal: 20,
    backgroundColor: ORG_SURFACE.ground,
  },

  // Identification result
  identificationResult: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ORG_SURFACE.ground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 12,
  },
  resultDetails: {

    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  resultCode: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: 8,
  },
  resultFruits: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 16,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  updateButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },

  // ── Build 54 — language-independent icon buttons ───────────────────────────
  // Primary action button: large icon + supplementary text label below.
  // Color is the semantic carrier (green=save, red=stop/record, orange=stop-record,
  // blue=continue/info, gray=undo). Text is a translation hint, not the carrier.
  iconActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 10,
    elevation: 3,
    ...ORG_ELEV.card,
  },
  primaryWalkBtn: {
    backgroundColor: COLORS.accent,
    minHeight: 92,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  primaryWalkBtnDisabled: {
    opacity: 0.5,
  },
  primaryWalkBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  iconActionBtnSm: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 4,
    elevation: 2,
  },
  iconActionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 10,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  iconActionLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Build 55 — Full-screen add-farm map controls ──────────────────────────
  circleBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    ...ORG_ELEV.card,
  },
  circleBtnLabel: {
    marginTop: 4, fontSize: 10, fontWeight: '700', color: COLORS.text,
    backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 6,
    paddingVertical: 1, borderRadius: 6, overflow: 'hidden',
  },
  floatTopLeft: { position: 'absolute', left: 12 },
  floatTopRight: { position: 'absolute', right: 12, alignItems: 'center' },
  floatTopCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  floatRightMid: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  infoPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14, paddingVertical: 7, paddingHorizontal: 14,
    maxWidth: width - 132,
    ...ORG_ELEV.card,
  },
  infoItem: { alignItems: 'center', minWidth: 50 },
  infoVal: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  infoLbl: { fontSize: 9, fontWeight: '600', color: COLORS.textMuted, marginTop: 1 },
  infoDivider: { width: 1, height: 24, backgroundColor: COLORS.border, marginHorizontal: 10 },

  // KHÔNG dùng shadow/elevation: PointAnnotation trên Android render child ra
  // bitmap; shadow/elevation làm bitmap trắng → mất điểm. Giữ phẳng như coordMarker.
  // Vùng chạm rộng hơn để dễ kéo; chấm nằm giữa (khớp tâm với toạ độ đỉnh).
  vertexTouch: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  vertexDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.accent, borderWidth: 2, borderColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  vertexDotSelected: { backgroundColor: '#E67E22', width: 32, height: 32, borderRadius: 16 },
  vertexDotText: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  meDotOuter: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,122,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  meDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#007AFF', borderWidth: 2, borderColor: COLORS.white,
  },

  bottomCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 12,
    ...ORG_ELEV.modal,
  },
  hintLine: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
    paddingHorizontal: 2,
  },
  hintText: { flex: 1, fontSize: 12, color: COLORS.textSub, lineHeight: 16 },

  segment: {
    flexDirection: 'row', backgroundColor: ORG_SURFACE.raised,
    borderRadius: 12, padding: 4, marginBottom: 10,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.accent,
    ...ORG_ELEV.card,
  },
  segmentText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  segmentTextActive: { color: COLORS.white },

  nameInput: {
    borderWidth: 1, borderColor: ORG_TONE.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 15, color: COLORS.text, backgroundColor: ORG_SURFACE.raised, marginBottom: 10,
  },

  primaryRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  primaryBtnGo: {
    backgroundColor: COLORS.accent,
    ...ORG_ELEV.card,
  },
  primaryBtnRec: {
    backgroundColor: '#C0533A',
    ...ORG_ELEV.card,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },

  smallBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: ORG_SURFACE.raised, borderWidth: 1, borderColor: ORG_TONE.border,
  },
  smallBtnFlex: { flex: 1 },
  smallBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.textSub },

  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#2ECC71',
    ...ORG_ELEV.card,
  },
  saveBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },

  secondaryRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 2,
  },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  linkBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSub },

  btnDisabled: { opacity: 0.4 },

  popupOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  vertexPopup: {
    width: '100%', maxWidth: 320, backgroundColor: ORG_SURFACE.raised,
    borderRadius: 18, padding: 18,
    ...ORG_ELEV.modal,
  },
  vertexPopupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  vertexPopupBadge: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  vertexPopupBadgeText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  vertexPopupTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: COLORS.text },
  vertexPopupBody: {
    backgroundColor: ORG_SURFACE.raised, borderRadius: 10, padding: 12, marginBottom: 14, gap: 4,
  },
  vertexPopupCoord: { fontSize: 13, color: COLORS.textSub, fontVariant: ['tabular-nums'] },
  vertexDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 12, backgroundColor: '#E74C3C',
  },
  vertexDeleteText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});

export default FarmDetailScreen;