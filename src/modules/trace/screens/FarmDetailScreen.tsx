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
  Alert,
  BackHandler,
  Animated,
  PanResponder,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { addFarm, setTrees, addTree, saveFarm, loadTrees, saveTree, loadFarm, syncTreesFromBackend } from '../store/farmSlice';
import { database } from '../../../utils/database';
import Geolocation from 'react-native-geolocation-service';
import { COLORS } from '../../../constants';
// B2: tạo vườn QUA field-reid (server sinh farm_id uuid THẬT) — bỏ aladinAPI
// (backend Lợi deprecated + client tự sinh `farm-<ts>` = gốc B2). INV-1 §3.2.
import { createFarm as createReidFarm } from '../../../services/farmService';
import { ensureOrilifeToken } from '../../../services/orilifeDidAuth';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import { fieldErrorMessage } from '../../../services/treeReIDService';
// We dynamically load MapLibre so the app can still run if the native module is missing
// (e.g. not linked / not supported on the current device). We load it inside the
// AddFarmMode component to avoid crashing on app startup.
let MapLibreGL: any = null;

import PaginationControls from '../components/PaginationControls';
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

const { width, height } = Dimensions.get('window');

const ITEMS_PER_PAGE = 10;

interface RouteParams { farm?: any | null }

const requestLocationPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Quyền truy cập vị trí',
          message: 'Aladin cần quyền truy cập vị trí để ghi nhận ranh giới nông trại.',
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
          <Icon name="alert-circle-outline" size={48} color={COLORS.error} />
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

// ── Tree Card ─────────────────────────────────────────────────────────────────
const TreeCard = ({
  item,
  index,
  farm,
  onPress,
  onView3D,
}: {
  item: any;
  index: number;
  farm?: any;
  onPress: () => void;
  onView3D?: () => void;
}) => {
  const fruitCount = item.fruitCount ?? 0;
  const has3DModel = item.has_3d ?? item.has3DModel ?? item.latest_mesh_cid ?? item.meshCid;
  // Build 58 (2026-05-26): bỏ random fallback 10-90% — field test 25/5 báo
  // nông dân thấy số phần trăm thu hoạch ngẫu nhiên → mất niềm tin. 0% khi
  // chưa có data thật trung thực hơn.
  const harvestPct = item.harvestProgress ?? 0;
  const statusColor = fruitCount > 0 ? COLORS.success : COLORS.textMuted;
  // Build 52 § A7 — farmer-friendly tree name.
  const treeDisplayName = formatTreeName(item, farm);
  const treeShortCode = shortTreeCode(item);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      <View style={styles.treeCard}>
        <View style={styles.treeCardLeft}>
          <View style={styles.treeIconWrap}>
            <Icon name="tree-outline" size={22} color={COLORS.accent} />
          </View>
          <View style={styles.treeProgBarWrap}>
            <View style={[styles.treeProgBar, { height: `${harvestPct}%` as any }]} />
          </View>
        </View>

        <View style={styles.treeCardBody}>
          <View style={styles.treeTopRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.treeCode} numberOfLines={1}>{treeDisplayName}</Text>
              {treeShortCode ? (
                <Text style={styles.treeCodeSub} numberOfLines={1}>Mã: {treeShortCode}</Text>
              ) : null}
            </View>
            {has3DModel && onView3D ? (
              <TouchableOpacity
                style={[styles.treeFruitChip, { backgroundColor: COLORS.accentGlow }]}
                onPress={onView3D}
                hitSlop={6}
              >
                <Icon name="cube-scan" size={12} color={COLORS.accent} />
                <Text style={[styles.treeFruitCount, { color: COLORS.accent }]}>
                  Xem 3D · {fruitCount} quả
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.treeFruitChip, { backgroundColor: COLORS.bgWarm }]}>
                <Icon name="cube-outline" size={12} color={COLORS.textMuted} />
                <Text style={[styles.treeFruitCount, { color: COLORS.textMuted }]}>
                  Chưa có 3D · {fruitCount} quả
                </Text>
              </View>
            )}
          </View>

          {item.lastActivity && (
            <View style={styles.treeLastActivity}>
              <Icon name="clock-outline" size={11} color={COLORS.textMuted} />
              <Text style={styles.treeLastActivityText}>{item.lastActivity}</Text>
            </View>
          )}

          {/* Mini progress bar */}
          <View style={styles.treeHarvestRow}>
            <View style={styles.treeHarvestTrack}>
              <View style={[styles.treeHarvestFill, { width: `${harvestPct}%` as any }]} />
            </View>
            <Text style={styles.treeHarvestPct}>{harvestPct}%</Text>
          </View>

          {/* Build 54: nút "Chụp cây" chuyển sang TreeDetailScreen. */}
        </View>

        <Icon name="chevron-right" size={18} color={COLORS.accentLight} style={{ alignSelf: 'center', marginRight: 12 }} />
      </View>
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
          .catch(() => {})
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
  onFinish: () => void;
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
  // Loại bản đồ: 'normal' (OSM đường phố) mặc định · 'satellite' (ảnh vệ tinh Esri).
  const [mapType, setMapType] = useState<'normal' | 'satellite'>('normal');
  // Popup chi tiết điểm (index) khi user nhấn vào một marker.
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  // Vị trí preview khi đang kéo 1 điểm — để đường bao/chấm di chuyển mượt theo tay.
  const [dragPreview, setDragPreview] = useState<{ i: number; lat: number; lng: number } | null>(null);
  // Khi đang kéo 1 đỉnh → tắt pan bản đồ để không xê dịch nền.
  const [draggingActive, setDraggingActive] = useState(false);
  const mapViewRef = useRef<any>(null);

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
    Alert.alert(
      'Thoát màn thêm vườn?',
      'Bạn sẽ mất các điểm GPS và thông tin đã nhập. Bạn có chắc muốn thoát?',
      [
        { text: 'Ở lại', style: 'cancel' },
        { text: 'Thoát', style: 'destructive', onPress: () => onBack() },
      ],
      { cancelable: true },
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
          const { latitude, longitude, accuracy } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setLastAccuracy(accuracy ?? null);
          // Chỉ auto-tracking khi user đang "đi vòng" ở chế độ tự động.
          if (isAutoRecordingRef.current) {
            onPointCandidateRef.current(latitude, longitude, accuracy ?? null);
          }
        },
        (err) => console.log('[AddFarmMode] watchPosition error:', err),
        // distanceFilter=3 đồng bộ với native LocationHelper (Build 51).
        { enableHighAccuracy: true, distanceFilter: 3 },
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

  // Auto-center một lần khi có định vị GPS đầu tiên (sau đó user tự pan/zoom).
  useEffect(() => {
    if (didAutoCenterRef.current) return;
    if (currentLocation.lat === 0 && currentLocation.lng === 0) return;
    didAutoCenterRef.current = true;
    try {
      cameraRef.current?.setCamera({
        centerCoordinate: [currentLocation.lng, currentLocation.lat],
        zoomLevel: 17,
        animationDuration: 600,
      });
    } catch {}
  }, [currentLocation]);

  // Đóng popup nếu điểm đang chọn đã bị xoá khỏi mảng.
  useEffect(() => {
    if (selectedVertex != null && selectedVertex >= coordinates.length) {
      setSelectedVertex(null);
    }
  }, [coordinates.length, selectedVertex]);

  const zoomBy = (d: number) => {
    const z = Math.max(3, Math.min(20, zoomRef.current + d));
    zoomRef.current = z;
    try { cameraRef.current?.zoomTo(z, 200); } catch {}
  };
  const recenter = () => {
    if (currentLocation.lat === 0 && currentLocation.lng === 0) return;
    try { cameraRef.current?.flyTo([currentLocation.lng, currentLocation.lat], 500); } catch {}
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
                onPress={(e: any) => {
                  if (drawMode !== 'manual') return;
                  const c = e?.geometry?.coordinates ?? e?.payload?.geometry?.coordinates;
                  if (!c) return;
                  const [lng, lat] = c;
                  setSelectedVertex(null);
                  onManualTapAppend(lat, lng);
                }}
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
                <MapLib.RasterSource
                  id="osm-tiles"
                  tileUrlTemplates={[
                    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
                  ]}
                  tileSize={256}
                >
                  <MapLib.RasterLayer id="osm-tiles-layer" sourceID="osm-tiles" />
                </MapLib.RasterSource>

                <MapLib.RasterSource
                  id="sat-tiles"
                  tileUrlTemplates={['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']}
                  tileSize={256}
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
                <Icon name="map-outline" size={32} color={COLORS.accentLight} />
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
            <Icon name={mapType === 'normal' ? 'satellite-variant' : 'map-outline'} size={20} color={COLORS.text} />
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
            <Icon name="crosshairs-gps" size={20} color={COLORS.accent} />
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
              <Icon name="walk" size={17} color={drawMode === 'auto' ? COLORS.white : COLORS.textSub} />
              <Text style={[styles.segmentText, drawMode === 'auto' && styles.segmentTextActive]}>Tự động ghi</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, drawMode === 'manual' && styles.segmentBtnActive]}
              onPress={() => { setIsAutoRecording(false); setDrawMode('manual'); }}
              activeOpacity={0.85}
            >
              <Icon name="gesture-tap" size={17} color={drawMode === 'manual' ? COLORS.white : COLORS.textSub} />
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
                    Alert.alert('Cần quyền vị trí', 'Cấp quyền GPS trong Cài đặt → Aladin.');
                    return;
                  }
                  const willStart = !isAutoRecording;
                  setIsAutoRecording(willStart);
                  if (willStart) { setEditMode('recording'); await onCaptureNow(); }
                }}
                activeOpacity={0.9}
              >
                <Icon name={isAutoRecording ? 'pause-circle' : 'play-circle'} size={24} color={COLORS.white} />
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
                <Icon name="undo-variant" size={20} color={COLORS.textSub} />
                <Text style={styles.smallBtnText}>Hoàn tác điểm</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, (!canSave || isSaving) && styles.btnDisabled]}
              onPress={onFinish}
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
                  <Icon name="content-save-check" size={20} color={COLORS.white} />
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
                <Icon name="undo-variant" size={16} color={COLORS.textSub} />
                <Text style={styles.linkBtnText}>Hoàn tác</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.linkBtn, coordinates.length === 0 && styles.btnDisabled]}
              onPress={onResetFromScratch}
              disabled={coordinates.length === 0}
              activeOpacity={0.7}
            >
              <Icon name="restart" size={16} color="#E74C3C" />
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
                  <Icon name="close" size={20} color={COLORS.textMuted} />
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
                <Icon name="trash-can-outline" size={18} color={COLORS.white} />
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
}) => {
  const navigation = useNavigation();
  const [renamePopupVisible, setRenamePopupVisible] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('openScreen', (screen) => {
      (navigation.navigate as any)(screen);
    });

    return () => sub.remove();
  }, []);
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

  const handleScanExisting3D = () => {};

  const totalFruits = filteredTrees.reduce((sum, t) => sum + (t.fruitCount ?? 0), 0);
  const areaLabel = farm?.areaSqm
    ? `${(farm?.areaSqm / 10000).toFixed(1)} ha`
    : `${farm?.coordinates?.length ?? 0} điểm`;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Icon name="arrow-left" size={20} color={COLORS.textSub} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>TRANG TRẠI</Text>
          <TouchableOpacity onPress={() => setRenamePopupVisible(true)} activeOpacity={0.7}>
            <Text style={styles.headerTitle} numberOfLines={1}>{farm?.name}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.activityBtn} onPress={onActivityUpdate}>
          <Icon name="clipboard-edit-outline" size={20} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* Stats banner */}
      <View style={styles.statsBanner}>
        {[
          { icon: 'tree-outline', val: filteredTrees.length, label: 'cây' },
          { icon: 'food-apple-outline', val: totalFruits, label: 'quả dự kiến' },
          { icon: 'vector-polygon', val: areaLabel, label: '' },
          { icon: 'map-marker-check-outline', val: farm?.coordinates?.length ?? 0, label: 'điểm GPS\n(nhấn xem)', onPress: () => onCoordinatesPress() },
        ].map((s, i) => (
          <View
            key={i}
            style={[
              styles.statBannerItem,
              i < 3 && { borderRightWidth: 1, borderRightColor: COLORS.border },
            ]}
          >
            <TouchableOpacity
              activeOpacity={s.onPress ? 0.7 : 1}
              onPress={s.onPress}
              style={{ alignItems: 'center' }}
            >
              <Icon name={s.icon} size={16} color={COLORS.accent} />
              <Text style={styles.statBannerVal}>{s.val}</Text>
              {s.label ? <Text style={styles.statBannerLabel}>{s.label}</Text> : null}
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Icon name="magnify" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm cây..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange('')}>
            <Icon name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Section header */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>DANH SÁCH CÂY</Text>
        </View>
        <TouchableOpacity
          style={styles.addTreeBtn}
          onPress={onAddTree}
          activeOpacity={0.8}
        >
          <View style={styles.addTreeBtnInner}>
            <Icon name="plus" size={16} color={COLORS.accent} />
            <Text style={styles.addTreeBtnText}>Thêm cây</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Tree list */}
      <FlatList
        data={paginatedTrees}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.treeListContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
                <Icon name="magnify-close" size={48} color={COLORS.textMuted} />
                <Text style={styles.noSearchResultsText}>Không tìm thấy cây</Text>
              </View>
            )
          ) : null
        }
        renderItem={({ item, index }) => (
          <TreeCard
            item={item}
            index={index}
            farm={farm}
            onPress={() => {
              // @ts-ignore
              (navigation.navigate as any)('TreeDetail', { tree: item })
            }}
            onView3D={() => {
              (navigation.navigate as any)('TreeViewer3D', {
                code: item.code ?? item.shortCode ?? '',
                treeName: formatTreeName(item, farm),
              });
            }}
          />
        )}
        ListFooterComponent={
          filteredTrees.length > 0 ? (
            <View>
              {/* Pagination */}
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={filteredTrees.length}
                onPreviousPage={handlePreviousPage}
                onNextPage={handleNextPage}
              />
              <View style={{ height: 30 }} />
            </View>
          ) : null
        }
      />

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.activityLargeBtn} onPress={onActivityUpdate} activeOpacity={0.88}>
          <View style={styles.btnShine} />
          <Icon name="sprout-outline" size={19} color={COLORS.white} />
          <Text style={styles.activityLargeBtnText}>Cập nhật hoạt động</Text>
        </TouchableOpacity>
      </View>

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

  useEffect(() => {
    if (farm_id) {
      dispatch(loadFarm(farm_id)).then((fetchedFarm) => {
        setFarm(fetchedFarm.payload ?? null);
      });
      dispatch(syncTreesFromBackend(farm_id));
    }
  }, [farm_id]);

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
      setFarm_id(params.farm_id);
      dispatch(loadFarm(params.farm_id)).then((fetchedFarm) => {
        setFarm(fetchedFarm.payload ?? null);
      });
      dispatch(syncTreesFromBackend(params.farm_id));
    }
  }, [params]);
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
      Alert.alert('Cần quyền vị trí', 'Vui lòng cấp quyền truy cập vị trí để ghi điểm.');
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
          Alert.alert(
            'Tín hiệu GPS yếu',
            `Sai số hiện tại ~${Math.round(accuracy)}m. Hãy ra chỗ thoáng (không che bởi tán cây/mái tôn) rồi thử lại.`,
          );
          return;
        }

        // Build 51: distance threshold 2 → 3m sync với native distanceFilter
        const prev = coordinatesRef.current;
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          const d = haversineMeters(last.lat, last.lng, lat, lng);
          if (d < 3) {
            Alert.alert(
              'Điểm quá gần điểm trước',
              `Cách điểm trước chỉ ${d.toFixed(1)}m. Hãy đi xa ra (ít nhất 3m) rồi ghi điểm tiếp.`,
            );
            return;
          }
        }

        // 3. Pure setState — không side effects trong updater
        setCoordinates(c => [...c, { lat, lng }]);
      },
      (err) => {
        console.log('Geolocation Error:', err);
        Alert.alert(
          'Không lấy được vị trí',
          err.code === 3 ? 'GPS timeout — hãy ra chỗ thoáng.' : 'Vui lòng thử lại.',
        );
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
      Alert.alert('Cần quyền vị trí', 'Vui lòng cấp quyền truy cập vị trí.');
      return;
    }
    return new Promise(resolve => {
      Geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;
          if (accuracy != null && accuracy > 15) {
            Alert.alert(
              'GPS tín hiệu yếu',
              `Sai số ~${Math.round(accuracy)}m. Vẫn ghi điểm đầu tiên nhưng nên ra chỗ thoáng. Hãy bắt đầu đi vòng — các điểm sau sẽ ghi tự động.`,
            );
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
          Alert.alert('Không lấy được vị trí', 'Vui lòng thử lại.');
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
  const handleAddFarm = async () => {
    if (!user) {
      Alert.alert(
        'Cần đăng nhập · Login required',
        'Bạn cần đăng nhập (vân tay / Face ID) trước khi lưu nông trại.',
      );
      return;
    }

    try {
      console.log('[FarmDetailScreen] Creating farm (offline-first)...');

      // 1. Sanity validation
      const coordsForValidation: Coord[] = coordinates.map(c => ({ lat: c.lat, lng: c.lng }));
      const validation = validatePolygon(coordsForValidation);
      if (validation.blocking) {
        Alert.alert(
          'Ranh giới chưa hợp lệ',
          validation.warnings.map(translateValidationKey).join('\n'),
        );
        return;
      }
      if (validation.warnings.length > 0) {
        const proceed = await new Promise<boolean>(resolve => {
          Alert.alert(
            'Cảnh báo ranh giới',
            validation.warnings.map(translateValidationKey).join('\n') + '\n\nVẫn lưu?',
            [
              { text: 'Để sửa', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Vẫn lưu', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: false },
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
          });
          // Token vừa hết hạn giữa chừng (401) → làm mới 1 lần rồi thử lại.
          if (!created.ok && created.error?.type === 'auth_error') {
            const relog = await ensureOrilifeToken(ORILIFE_BASE, { force: true });
            if (relog) {
              created = await createReidFarm(ORILIFE_BASE, {
                name: farmName,
                boundary: coordinates,
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
          Alert.alert(
            'Cần kết nối mạng',
            'Tạo vườn cần mạng để máy chủ cấp mã vườn. Việc thêm cây (chụp ảnh) cũng cần mạng — hãy kết nối rồi thử lại. Các điểm GPS bạn đã ghi vẫn được giữ.',
          );
        } else if (err?.type === 'auth_error') {
          // App đã TỰ ký DID lấy token + thử lại 1 lần ở trên → vẫn auth_error nghĩa là
          // danh-tính chưa đăng-ký trên máy chủ (DID mồ côi) hoặc máy chủ đang trục-trặc.
          Alert.alert(
            'Chưa xác thực được với máy chủ',
            'Không tạo được phiên với máy chủ nhận diện. Thử đăng xuất rồi đăng nhập lại; nếu vẫn lỗi, có thể danh tính chưa được đăng ký trên máy chủ.',
          );
        } else {
          Alert.alert('Chưa lưu được vườn', fieldErrorMessage(err));
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
      Alert.alert(
        'Lỗi không xác định',
        error?.message ?? 'Vui lòng thử lại. Dữ liệu GPS của bạn vẫn an toàn.',
      );
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
    Alert.alert(
      'Xoá điểm này? · Delete this point?',
      `Điểm số ${index + 1}`,
      [
        { text: 'Huỷ · Cancel', style: 'cancel' },
        {
          text: 'Xoá · Delete',
          style: 'destructive',
          onPress: () => {
            pushEditHistory(coordinatesRef.current);
            setCoordinates(prev => prev.filter((_, i) => i !== index));
          },
        },
      ],
    );
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
    Alert.alert(
      'Vẽ lại từ đầu? · Reset?',
      'Xoá toàn bộ điểm hiện tại và bắt đầu lại?',
      [
        { text: 'Huỷ · Cancel', style: 'cancel' },
        {
          text: 'Vẽ lại · Reset',
          style: 'destructive',
          onPress: () => {
            setCoordinates([]);
            setEditHistory([]);
            setEditMode('recording');
            walkAwayStateRef.current = initWalkAwayState();
            lastPointTimestampRef.current = null;
          },
        },
      ],
    );
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

  const handleUpdateFarmName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!farm_id || !trimmed) return;

    try {
      // Trước đây dùng loadFarms(farm_id) — SAI action (loadFarms nhận userId,
      // trả MẢNG farm) rồi spread cả object thunk action vào farm → mất hết field
      // + null user_id khi lưu. Dùng loadFarm (đơn) + unwrap payload, map
      // user_id (snake từ SQLite) → userId (saveFarm đọc farm.userId).
      const action = await dispatch(loadFarm(farm_id));
      const oldFarm: any = (action as any).payload;
      if (!oldFarm) {
        console.warn('[FarmDetailScreen] handleUpdateFarmName: farm not found', farm_id);
        return;
      }
      const updatedFarm = {
        id: oldFarm.id,
        name: trimmed,
        coordinates: oldFarm.coordinates ?? [],
        userId: oldFarm.userId ?? oldFarm.user_id ?? user?.id,
      };
      await dispatch(saveFarm(updatedFarm));
      // Cập nhật local state ngay để tên mới hiển thị (saveFarm chỉ cập nhật
      // state.farm.farms, không cập nhật biến `farm` cục bộ của màn này).
      setFarm((prev: any) => (prev ? { ...prev, name: trimmed } : prev));
    } catch (error) {
      console.error('Error updating farm name:', error);
      Toast.show({
        type: 'error',
        text1: 'Không đổi được tên',
        text2: 'Vui lòng thử lại.',
        visibilityTime: 2500,
      });
    }
  };

  if (!farm) {
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

          {/* Always show base map tiles for streets and areas */}
          <MapLib.RasterSource
            id="osm-tiles-detail"
            tileUrlTemplates={[
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ]}
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
      />

      {coordMapVisible && (
        <View style={styles.coordMapOverlay}>
          <View style={styles.coordMapHeader}>
            <Text style={styles.coordMapHeaderText}>Bản đồ toạ độ nông trại</Text>
            <TouchableOpacity onPress={() => setCoordMapVisible(false)}>
              <Icon name="close" size={22} color={COLORS.textMuted} />
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
              <Icon name="check-circle" size={48} color={COLORS.success} />
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
  root: { flex: 1, backgroundColor: COLORS.bg },

  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
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
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6,
    elevation: 2,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '700', color: COLORS.accent,
    letterSpacing: 2.5, marginBottom: 1,
  },
  headerTitle: {
    fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5,
  },
  activityBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  // Stats banner
  statsBanner: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10,
    elevation: 2,
  },
  statBannerItem: {
    flex: 1, paddingVertical: 14, alignItems: 'center', gap: 3,
  },
  statBannerVal: {
    fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3,
  },
  statBannerLabel: {
    fontSize: 10, color: COLORS.textMuted,
  },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 10,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 2,
  },
  addTreeBtn: { overflow: 'hidden', borderRadius: 10 },
  addTreeBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  addTreeBtnText: {
    fontSize: 13, fontWeight: '600', color: COLORS.accent,
  },

  // Tree list
  treeListContent: {
    paddingHorizontal: 20, paddingTop: 4, flexGrow: 1,
  },

  // Tree card
  treeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'stretch',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 1, overflow: 'hidden',
  },
  treeCardLeft: {
    width: 48, alignItems: 'center', paddingVertical: 14, gap: 8,
    backgroundColor: COLORS.bgWarm,
    borderRightWidth: 1, borderRightColor: COLORS.border,
  },
  treeIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  treeProgBarWrap: {
    flex: 1, width: 4, backgroundColor: COLORS.border,
    borderRadius: 2, overflow: 'hidden', maxHeight: 40,
  },
  treeProgBar: {
    width: '100%', backgroundColor: COLORS.accent,
    borderRadius: 2, position: 'absolute', bottom: 0,
  },
  treeCardBody: { flex: 1, padding: 12 },
  treeTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 5,
  },
  treeCode: {
    fontSize: 15, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2,
  },
  treeCodeSub: {
    fontSize: 10, fontWeight: '500', color: COLORS.textMuted,
    letterSpacing: 0.3, marginTop: 1,
  },
  treeFruitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  treeFruitCount: { fontSize: 11, fontWeight: '600' },
  treeLastActivity: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8,
  },
  treeLastActivityText: { fontSize: 11, color: COLORS.textMuted },
  treeHarvestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  treeHarvestTrack: {
    flex: 1, height: 4, backgroundColor: COLORS.border,
    borderRadius: 2, overflow: 'hidden',
  },
  treeHarvestFill: {
    height: '100%', backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  treeHarvestPct: {
    fontSize: 11, fontWeight: '600', color: COLORS.textMuted, width: 32,
  },
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
    borderWidth: 1, borderColor: COLORS.border,
  },
  treeEmptyBtnText: {
    fontSize: 13, fontWeight: '600', color: COLORS.accent,
  },

  // ── Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 16,
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

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    backgroundColor: COLORS.bg,
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
    borderColor: COLORS.border,
  },
  scan3DExistingBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  activityLargeBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, overflow: 'hidden', position: 'relative',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14,
    elevation: 6,
  },
  activityLargeBtnText: {
    fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2,
  },

  // Shared
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
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  addFarmContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  instructionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 12,
    elevation: 2,
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
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
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
    borderWidth: 1, borderColor: COLORS.border,
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
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  coordMapHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  coordMapContainer: {
    width: '100%',
    height: '80%',
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginTop: 8,
  },
  coordMapLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
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
    backgroundColor: COLORS.card,
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
    backgroundColor: COLORS.card,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  coordPreviewLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 1.5,
  },
  coordChip: {
    backgroundColor: COLORS.bgWarm,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginRight: 8, borderWidth: 1, borderColor: COLORS.border,
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
    backgroundColor: COLORS.bg,
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
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.30, shadowRadius: 12,
    elevation: 5,
  },
  autoTrackBtnActive: {
    backgroundColor: '#C0533A',
    shadowColor: '#C0533A',
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
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12,
    elevation: 5,
  },
  finishBtnDisabled: { opacity: 0.45 },
  finishBtnText: {
    fontSize: 15, fontWeight: '700', color: COLORS.white,
  },
  minPointsNote: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    paddingBottom: 8, paddingHorizontal: 20,
    backgroundColor: COLORS.bg,
  },

  // Identification result
  identificationResult: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  primaryWalkBtn: {
    backgroundColor: '#3B6EA8',
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 5, elevation: 4,
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 5, elevation: 4,
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
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 12,
  },
  hintLine: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
    paddingHorizontal: 2,
  },
  hintText: { flex: 1, fontSize: 12, color: COLORS.textSub, lineHeight: 16 },

  segment: {
    flexDirection: 'row', backgroundColor: COLORS.bgWarm,
    borderRadius: 12, padding: 4, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 5, elevation: 3,
  },
  segmentText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  segmentTextActive: { color: COLORS.white },

  nameInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 10,
  },

  primaryRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  primaryBtnGo: {
    backgroundColor: '#3B6EA8',
    shadowColor: '#3B6EA8', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnRec: {
    backgroundColor: '#C0533A',
    shadowColor: '#C0533A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },

  smallBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: COLORS.bgWarm, borderWidth: 1, borderColor: COLORS.border,
  },
  smallBtnFlex: { flex: 1 },
  smallBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.textSub },

  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#2ECC71',
    shadowColor: '#2ECC71', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32, shadowRadius: 8, elevation: 4,
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
    width: '100%', maxWidth: 320, backgroundColor: COLORS.white,
    borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 12,
  },
  vertexPopupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  vertexPopupBadge: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  vertexPopupBadgeText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  vertexPopupTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: COLORS.text },
  vertexPopupBody: {
    backgroundColor: COLORS.bgWarm, borderRadius: 10, padding: 12, marginBottom: 14, gap: 4,
  },
  vertexPopupCoord: { fontSize: 13, color: COLORS.textSub, fontVariant: ['tabular-nums'] },
  vertexDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 12, backgroundColor: '#E74C3C',
  },
  vertexDeleteText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});

export default FarmDetailScreen;