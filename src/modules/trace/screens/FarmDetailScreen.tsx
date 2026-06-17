// modules/trace/screens/FarmDetailScreen.tsx

import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { addFarm, setTrees, addTree, saveFarm, loadTrees, saveTree, loadFarm, syncTreesFromBackend } from '../store/farmSlice';
import { database } from '../../../utils/database';
import Geolocation from 'react-native-geolocation-service';
import { ScannerSDK, EVENTS, ScanCompleteData } from '../../../scansdk';
import { COLORS } from '../../../constants';
import aladinAPI from '../../../services/aladin-api';
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
  onVertexLongPress,
  onMapTapInsert,
  onUndo,
  onResetFromScratch,
  onResumeRecording,
}: {
  coordinates: { lat: number; lng: number }[];
  setCoordinates: React.Dispatch<React.SetStateAction<{ lat: number; lng: number }[]>>;
  /** Build 54 — macro state: 'recording' (active GPS polling) vs 'edit-ready' (manual edit). */
  editMode: 'recording' | 'edit-ready';
  setEditMode: React.Dispatch<React.SetStateAction<'recording' | 'edit-ready'>>;
  /** Build 54 — length of undo history; used to disable undo button. */
  editHistoryLength: number;
  /**
   * Auto-tracking callback: gọi mỗi khi watchPosition emit position trong khi
   * auto-recording bật. Parent quyết định có thêm vào polygon hay không
   * (dựa accuracy + khoảng cách từ điểm trước).
   */
  onPointCandidate: (lat: number, lng: number, accuracy: number | null) => void;
  /**
   * One-shot capture ngay lập tức (khi user tap "Bắt đầu đi vòng" — capture điểm 1
   * không cần đợi watchPosition fire).
   */
  onCaptureNow: () => Promise<void>;
  onFinish: () => void;
  onBack: () => void;
  /** Build 51: lý do reject point gần nhất để hiện UI feedback (toast 2.5s). */
  rejectReason?: string | null;
  /** Build 54: user-typed farm name (parent owns state for handleAddFarm). */
  farmName: string;
  onFarmNameChange: (next: string) => void;
  /** Build 54 — edit-mode handlers (parent owns state for undo history coordination). */
  onVertexDragEnd: (index: number, lat: number, lng: number) => void;
  onVertexLongPress: (index: number) => void;
  onMapTapInsert: (lat: number, lng: number) => void;
  onUndo: () => void;
  onResetFromScratch: () => void;
  onResumeRecording: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const [isAutoRecording, setIsAutoRecording] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  // Build 54 audit fix A1: when parent moves us to 'edit-ready' (manual stop OR
  // walk-away auto-stop), force isAutoRecording off so the in-flight
  // watchPosition callback won't re-enter handleAutoPoint.
  useEffect(() => {
    if (editMode === 'edit-ready' && isAutoRecording) {
      setIsAutoRecording(false);
    }
  }, [editMode, isAutoRecording]);
  // Build 51 (2026-05-17): rejectReason comes from parent FarmDetailScreen
  // (where handleAutoPoint lives). Stay null khi không có reject gần đây.
  const lastRejectReason = rejectReason ?? null;
  // Visual pulse: khi đang auto OR đã có điểm
  const isRecording = isAutoRecording || coordinates.length > 0;

  const [mapModule, setMapModule] = useState<any | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [currentLocation, setCurrentLocation] = useState({ lat: 0, lng: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [showMarker, setShowMarker] = useState(false);

  // Ref để callback luôn dùng giá trị mới nhất (tránh stale closure trong watchPosition)
  const isAutoRecordingRef = useRef(false);
  useEffect(() => { isAutoRecordingRef.current = isAutoRecording; }, [isAutoRecording]);
  const onPointCandidateRef = useRef(onPointCandidate);
  useEffect(() => { onPointCandidateRef.current = onPointCandidate; }, [onPointCandidate]);

  // Xác nhận thoát: khi user nhấn nút back (header) hoặc nút back cứng Android,
  // nếu đã có điểm GPS hoặc đã nhập tên vườn thì hỏi xác nhận để tránh mất dữ liệu.
  // Nếu màn hình còn trống thì thoát luôn, không làm phiền.
  const confirmExit = () => {
    const hasUnsaved = coordinates.length > 0 || farmName.trim().length > 0;
    if (!hasUnsaved) {
      onBack();
      return;
    }
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
  // Ref để listener back cứng luôn gọi confirmExit mới nhất (tránh stale closure),
  // chỉ cần subscribe một lần.
  const confirmExitRef = useRef(confirmExit);
  confirmExitRef.current = confirmExit;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmExitRef.current();
      return true; // chặn hành vi back mặc định, để alert xử lý
    });
    return () => sub.remove();
  }, []);

  const [minimalMap, setMinimalMap] = useState(true); // Start with minimal map to debug
  const [featuresEnabled, setFeaturesEnabled] = useState({
    raster: true,
    userLocation: true,
    markers: true,
    polygon: true,
  });

  const MapLib = mapModule?.default ? mapModule.default : mapModule;
  const mapSupported = Boolean(MapLib?.MapView);
  const canRenderMap = permissionGranted && mapSupported;


  useEffect(() => {
    // Cleanup-safe pattern: dùng cờ + check sau mỗi await để tránh race
    // (watchId có thể assign sau khi cleanup chạy nếu async permission request chậm)
    let cancelled = false;
    let watchId: number | null = null;

    const startWatchingLocation = async () => {
      const hasPermission = await requestLocationPermission();
      if (cancelled) return;
      if (!hasPermission) {
        setPermissionGranted(false);
        console.log('[AddFarmMode] Location permission denied');
        return;
      }
      setPermissionGranted(true);

      const id = Geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          const { latitude, longitude, accuracy } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setLastAccuracy(accuracy ?? null);

          // Auto-tracking: nếu user đang đi vòng → gửi candidate lên parent
          // (parent filter theo accuracy + khoảng cách trước khi push vào polygon)
          if (isAutoRecordingRef.current) {
            onPointCandidateRef.current(latitude, longitude, accuracy ?? null);
          }
        },
        (err) => console.log('[AddFarmMode] watchPosition error:', err),
        {
          enableHighAccuracy: true,
          // Build 51 (2026-05-17) — Thư field "0 điểm" bug:
          // Sync với native LocationHelper.swift distanceFilter=3.0 để loại bỏ
          // mismatch race condition (JS lọc 2m, native chỉ fire 3m).
          // Native .fitness activityType + sensor fusion đã sufficient cho density.
          distanceFilter: 3,
        }
      );

      // Nếu cleanup đã chạy trong khi await → clearWatch ngay
      if (cancelled) {
        Geolocation.clearWatch(id);
        return;
      }
      watchId = id;
    };

    startWatchingLocation();

    return () => {
      cancelled = true;
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
      }
    };
  }, []);
  const loadMap = async () => {
    try {
      console.log('[FarmDetailScreen] Starting to load MapLibre module...');
      const mod = await import('@maplibre/maplibre-react-native');
      console.log('[FarmDetailScreen] MapLibre module loaded successfully:', !!mod);

      // Some versions require an access token set before mounting.
      if (mod?.setAccessToken) {
        try {
          console.log('[FarmDetailScreen] Setting access token...');
          mod.setAccessToken(null);
          console.log('[FarmDetailScreen] Access token set');
        } catch (tokenErr: any) {
          console.warn('[FarmDetailScreen] Failed to set access token:', tokenErr);
        }
      }

      console.log('[FarmDetailScreen] Setting map module state...');
      setMapError(null);
      setMapModule(mod);
      console.log('[FarmDetailScreen] Map module state set successfully');
    } catch (err: any) {
      console.error('[FarmDetailScreen] Failed to load MapLibreGL:', err);
      setMapError(err?.message ?? String(err));
    }
  };

  useEffect(() => {
    console.log('[FarmDetailScreen] AddFarmMode useEffect starting...');

    // Add global error handlers to catch silent crashes
    const originalConsoleError = console.error;
    console.error = (...args) => {
      originalConsoleError('[GLOBAL ERROR]', ...args);
    };

    loadMap();
    requestLocationPermission().then(granted => {
      console.log('[FarmDetailScreen] Location permission result:', granted);
      setPermissionGranted(granted);
    });

    console.log('[FarmDetailScreen] AddFarmMode useEffect completed');

    // Cleanup
    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  const region = coordinates.length > 0 ? {
    latitude: coordinates[coordinates.length - 1].lat,
    longitude: coordinates[coordinates.length - 1].lng,
  } : undefined;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Bản đồ nửa trên */}
      <View style={styles.addFarmMapPane}>
        <MapErrorBoundary>

          {canRenderMap ? (
            <>

              <MapLib.MapView
                style={StyleSheet.absoluteFillObject}
                logoEnabled={false}
                attributionEnabled={false}
                // Build 54 — tap-to-insert new vertex during edit-ready mode.
                // decideTapInsert filters out taps near existing vertices (user
                // probably meant to drag) and taps far from the polygon.
                onPress={(e: any) => {
                  if (editMode !== 'edit-ready') return;
                  const coords = e?.geometry?.coordinates ?? e?.payload?.geometry?.coordinates;
                  if (!coords) return;
                  const [lng, lat] = coords;
                  onMapTapInsert(lat, lng);
                }}
                onDidFinishLoadingMap={() => {
                  setMapReady(true);
                  setTimeout(() => setShowMarker(true), 500);
                  console.log('[FarmDetailScreen] Map finished loading');
                  // After map loads successfully, try enabling full features
                  if (minimalMap) {
                    console.log('[FarmDetailScreen] Switching to full map features...');
                    setMinimalMap(false);
                  }
                }}
                onDidFailLoadingMap={(_error: any) => console.error('[FarmDetailScreen] Map failed to load:', _error)}
              >

                <MapLib.Camera
                  zoomLevel={17}
                  centerCoordinate={
                    currentLocation
                      ? [currentLocation.lng, currentLocation.lat]
                      : [106.660172, 10.762622]
                  }
                />

                {!minimalMap && (
                  <>
                    {/* Test each feature individually with error handling */}
                    {(() => {
                      try {
                        console.log('[FarmDetailScreen] Testing RasterSource...');
                        return featuresEnabled.raster ? (
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
                        ) : null;
                      } catch (error) {
                        console.error('[FarmDetailScreen] RasterSource failed:', error);
                        setFeaturesEnabled(prev => ({ ...prev, raster: false }));
                        return null;
                      }
                    })()}

                    {(() => {
                      try {
                        console.log('[FarmDetailScreen] Testing UserLocation...');
                        // return featuresEnabled.userLocation && permissionGranted ? (
                        //   <MapLib.UserLocation visible={true} showsUserHeadingIndicator={true} />
                        // ) : null;
                      } catch (error) {
                        console.error('[FarmDetailScreen] UserLocation failed:', error);
                        setFeaturesEnabled(prev => ({ ...prev, userLocation: false }));
                        return null;
                      }
                    })()}

                    {(() => {
                      try {
                        console.log('[FarmDetailScreen] Testing markers...');
                        return featuresEnabled.markers ? coordinates.map((c, i) => (
                          <MapLib.PointAnnotation
                            key={`marker-${i}`}
                            id={`marker-${i}`}
                            coordinate={[c.lng, c.lat]}
                            // Build 54 — vertices draggable in edit-ready mode.
                            // Long-press is wired through onSelected (MapLibre fires
                            // it on tap; long-press is approximated by the user holding
                            // before dragging — accepted limitation of MapLibre RN API).
                            draggable={editMode === 'edit-ready'}
                            onDragEnd={(e: any) => {
                              if (editMode !== 'edit-ready') return;
                              const coords = e?.geometry?.coordinates ?? e?.payload?.geometry?.coordinates;
                              if (!coords) return;
                              const [lng, lat] = coords;
                              onVertexDragEnd(i, lat, lng);
                            }}
                            onSelected={() => {
                              if (editMode === 'edit-ready') onVertexLongPress(i);
                            }}
                          >
                            <View style={{
                              width: editMode === 'edit-ready' ? 28 : 24,
                              height: editMode === 'edit-ready' ? 28 : 24,
                              borderRadius: 14,
                              backgroundColor: editMode === 'edit-ready' ? '#3498DB' : COLORS.accent,
                              borderWidth: 2,
                              borderColor: COLORS.white,
                              alignItems: 'center',
                              justifyContent: 'center',
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              elevation: 4,
                            }}>
                              <Text style={{ color: COLORS.white, fontSize: 10, fontWeight: 'bold' }}>{i + 1}</Text>
                            </View>
                          </MapLib.PointAnnotation>
                        )) : null;
                      } catch (error) {
                        console.error('[FarmDetailScreen] Markers failed:', error);
                        // setFeaturesEnabled(prev => ({ ...prev, markers: false }));
                        return null;
                      }
                    })()}

                    {(() => {
                      try {
                        console.log('[FarmDetailScreen] Testing polygon...');
                        return featuresEnabled.polygon && coordinates.length >= 3 ? (
                          <MapLib.ShapeSource
                            id="farm-polygon-source"
                            shape={{
                              type: 'Feature',
                              geometry: {
                                type: 'Polygon',
                                coordinates: [[...coordinates.map(c => [c.lng, c.lat]), [coordinates[0].lng, coordinates[0].lat]]]
                              },
                              properties: {}
                            }}
                          >
                            <MapLib.FillLayer
                              id="farm-polygon-fill"
                              style={{ fillColor: 'rgba(46, 204, 113, 0.3)' }}
                            />
                            <MapLib.LineLayer
                              id="farm-polygon-line"
                              style={{ lineColor: COLORS.accent, lineWidth: 2 }}
                            />
                          </MapLib.ShapeSource>
                        ) : null;
                      } catch (error) {
                        console.error('[FarmDetailScreen] Polygon failed:', error);
                        setFeaturesEnabled(prev => ({ ...prev, polygon: false }));
                        return null;
                      }
                    })()}
                  </>
                )}
                <MapLib.MarkerView
                  coordinate={[currentLocation.lng, currentLocation.lat]}
                >
                  <View style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: 'blue',
                    borderWidth: 3,
                    borderColor: 'white'
                  }} />
                </MapLib.MarkerView>
                {showMarker && currentLocation && (
                  <MapLib.PointAnnotation
                    id="user-location"
                    coordinate={[currentLocation.lng, currentLocation.lat]}
                  >
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: '#007AFF',
                      borderWidth: 3,
                      borderColor: 'white'
                    }} />
                  </MapLib.PointAnnotation>
                )}
              </MapLib.MapView>
            </>
          ) : (
            <View style={[styles.mapFallback, { backgroundColor: '#e8f5e9' }]}>
              <Icon name="map-outline" size={32} color={COLORS.accentLight} />
              <Text style={[styles.mapFallbackText, { marginTop: 8 }]}>
                {minimalMap ? 'Đang khởi tạo bản đồ cơ bản...' : 'Bản đồ đầy đủ đã tải'}
              </Text>
              {!minimalMap && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.mapFallbackText, { fontSize: 12 }]}>Tính năng:</Text>
                  <Text style={[styles.mapFallbackText, { fontSize: 12 }]}>
                    • Bản đồ: {featuresEnabled.raster ? '✅' : '❌'}
                  </Text>
                  <Text style={[styles.mapFallbackText, { fontSize: 12 }]}>
                    • Vị trí: {featuresEnabled.userLocation ? '✅' : '❌'}
                  </Text>
                  <Text style={[styles.mapFallbackText, { fontSize: 12 }]}>
                    • Điểm đánh dấu: {featuresEnabled.markers ? '✅' : '❌'}
                  </Text>
                  <Text style={[styles.mapFallbackText, { fontSize: 12 }]}>
                    • Đa giác: {featuresEnabled.polygon ? '✅' : '❌'}
                  </Text>
                </View>
              )}
              {mapError && (
                <>
                  <Text style={[styles.mapFallbackText, { marginTop: 8 }]}>Lỗi: {mapError}</Text>
                  <TouchableOpacity
                    style={[styles.recordBtn, { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16 }]}
                    onPress={() => {
                      console.log('[FarmDetailScreen] Retrying map load...');
                      loadMap();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.recordBtnText, { color: COLORS.white }]}>Thử lại</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.recordBtn, { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: COLORS.textMuted }]}
                    onPress={() => {
                      console.log('[FarmDetailScreen] Resetting features...');
                      setFeaturesEnabled({
                        raster: true,
                        userLocation: true,
                        markers: true,
                        polygon: true,
                      });
                      setMinimalMap(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.recordBtnText, { color: COLORS.white }]}>
                      Reset tính năng
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              {!mapSupported && !mapError && (
                <Text style={[styles.mapFallbackText, { marginTop: 8 }]}>Bản đồ không khả dụng trên thiết bị này.</Text>
              )}
            </View>
          )}
        </MapErrorBoundary>

        <View style={[styles.header, { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'transparent', zIndex: 10 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={confirmExit}>
            <Icon name="arrow-left" size={20} color={COLORS.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Build 54 V4 — Language-independent UI:
            All primary actions are icon + color + size + motion. Vietnamese
            text is a small supplementary label ("Action · ActionEN") so that
            future i18n only requires translating one short string per button.

          Layout:
            - ScrollView with safe-area-inset bottom so "Save" button is never
              clipped on iPhone 16 Pro (Build 53 field test bug).
            - editMode === 'recording' shows: Stop (when ready) + Play/Pause
            - editMode === 'edit-ready' shows: Save + Drag/Undo row + Resume + Reset */}
      <ScrollView
        style={styles.addFarmFormPane}
        contentContainerStyle={[
          styles.addFarmContent,
          { paddingTop: 16, paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* Status card — pulse motion when recording, blue when in edit mode */}
        <View style={[styles.gpsStatusCard, { marginBottom: 12 }]}>
          <View style={styles.gpsStatusLeft}>
            {editMode === 'recording' && isRecording ? <RecordingPulse /> : (
              <View style={[styles.pulseDot, {
                backgroundColor: editMode === 'edit-ready' ? '#3498DB' : COLORS.textMuted,
              }]} />
            )}
            <View style={{ marginLeft: 12, flex: 1, paddingRight: 8 }}>
              <Text style={styles.gpsStatusTitle} numberOfLines={1} ellipsizeMode="tail">
                {editMode === 'edit-ready'
                  ? `${coordinates.length} điểm · ${formatArea(areaSquareMeters(coordinates))}`
                  : coordinates.length === 0
                    ? 'Chưa ghi điểm nào'
                    : isAutoRecording
                      ? `Đang ghi · ${coordinates.length} điểm`
                      : `Đã ghi ${coordinates.length} điểm`}
              </Text>
              <Text style={styles.gpsStatusSub} allowFontScaling={true} numberOfLines={2}>
                {lastRejectReason
                  ? `⚠ ${lastRejectReason}`
                  : lastAccuracy != null
                    ? `GPS sai số ~${Math.round(lastAccuracy)}m`
                    : 'Đang chờ GPS…'}
              </Text>
            </View>
          </View>

          <View style={styles.coordCountWrap}>
            <Text style={styles.coordCountNum}>{coordinates.length}</Text>
            <Text style={styles.coordCountLabel} allowFontScaling={false}>điểm</Text>
          </View>
        </View>

        {/* Farm name input — always available (both modes) */}
        <View style={{ marginBottom: 12 }}>
          <TextInput
            value={farmName}
            onChangeText={onFarmNameChange}
            placeholder="Tên vườn · Farm name (tuỳ chọn · optional)"
            placeholderTextColor={COLORS.textMuted}
            style={{
              borderWidth: 1,
              borderColor: COLORS.border ?? '#D9D9D9',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: Platform.OS === 'ios' ? 12 : 8,
              fontSize: 15,
              color: COLORS.text,
              backgroundColor: COLORS.white ?? '#FFFFFF',
            }}
            maxLength={60}
            returnKeyType="done"
          />
        </View>

        {/* ── ACTION BUTTONS — language-independent (icon + color + size + motion) ── */}

        {editMode === 'recording' && (
          <>
            {/* Stop button — only enabled when polygon "looks complete":
                ≥3 points AND area > MIN_FARM_AREA_SQM. Orange icon, contrasts
                with green/red recording controls below. */}
            {coordinates.length >= MIN_POINTS_TO_DEFINE && areaSquareMeters(coordinates) >= MIN_FARM_AREA_SQM && (
              <TouchableOpacity
                style={[styles.iconActionBtn, { backgroundColor: '#F39C12', marginBottom: 10 }]}
                onPress={() => setEditMode('edit-ready')}
                activeOpacity={0.85}
              >
                <Icon name="stop-circle-outline" size={28} color={COLORS.white} />
                <Text style={styles.iconActionLabel}>Dừng · Stop</Text>
              </TouchableOpacity>
            )}

            {/* Start / Pause — primary action, large icon, green (idle) / red (recording) */}
            <TouchableOpacity
              style={[
                styles.iconActionBtn,
                styles.primaryWalkBtn,
                !permissionGranted && styles.primaryWalkBtnDisabled,
              ]}
              onPress={async () => {
                if (!permissionGranted) {
                  Alert.alert(
                    'Cần quyền vị trí · Location required',
                    'Cấp quyền GPS trong Cài đặt → Aladin · Grant in Settings → Aladin',
                  );
                  return;
                }
                const willStart = !isAutoRecording;
                setIsAutoRecording(willStart);
                if (willStart) {
                  await onCaptureNow();
                }
              }}
              disabled={!permissionGranted}
              activeOpacity={0.9}
            >
              <Icon
                name={isAutoRecording ? 'pause-circle' : 'play-circle'}
                size={34}
                color={COLORS.white}
              />
              <Text style={styles.primaryWalkBtnText}>
                {isAutoRecording
                  ? 'Tạm dừng đi vòng'
                  : coordinates.length === 0
                    ? 'Bắt đầu đi vòng quanh vườn'
                    : 'Tiếp tục đi vòng quanh vườn'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {editMode === 'edit-ready' && (
          <>
            {/* Save — primary, large green */}
            <TouchableOpacity
              style={[styles.iconActionBtn, { backgroundColor: '#2ECC71', marginBottom: 10 }]}
              onPress={onFinish}
              activeOpacity={0.85}
            >
              <Icon name="content-save-check" size={32} color={COLORS.white} />
              <Text style={styles.iconActionLabel}>Lưu nông trại · Save</Text>
            </TouchableOpacity>

            {/* Edit hint (info) + Undo (action) — row of two */}
            <View style={{ flexDirection: 'row', marginBottom: 10, gap: 10 }}>
              <View style={[styles.iconActionBtnSm, { backgroundColor: '#3498DB', flex: 1 }]}>
                <Icon name="vector-polyline-edit" size={22} color={COLORS.white} />
                <Text style={[styles.iconActionLabel, { fontSize: 11 }]}>Kéo điểm · Drag</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.iconActionBtnSm,
                  { backgroundColor: '#95A5A6', flex: 1, opacity: editHistoryLength === 0 ? 0.4 : 1 },
                ]}
                onPress={onUndo}
                disabled={editHistoryLength === 0}
                activeOpacity={0.85}
              >
                <Icon name="undo-variant" size={22} color={COLORS.white} />
                <Text style={[styles.iconActionLabel, { fontSize: 11 }]}>Hoàn tác · Undo</Text>
              </TouchableOpacity>
            </View>

            {/* Resume recording */}
            <TouchableOpacity
              style={[styles.iconActionBtn, { backgroundColor: '#3498DB', marginBottom: 10 }]}
              onPress={onResumeRecording}
              activeOpacity={0.85}
            >
              <Icon name="play-circle-outline" size={26} color={COLORS.white} />
              <Text style={styles.iconActionLabel}>Tiếp tục ghi · Resume</Text>
            </TouchableOpacity>

            {/* Reset (danger, outline only) */}
            <TouchableOpacity
              style={[styles.iconActionBtnOutline, { borderColor: '#E74C3C' }]}
              onPress={onResetFromScratch}
              activeOpacity={0.85}
            >
              <Icon name="restart" size={22} color="#E74C3C" />
              <Text style={[styles.iconActionLabel, { color: '#E74C3C' }]}>Vẽ lại · Reset</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Helper text — only in recording mode + no points yet (onboarding-style hint) */}
        {editMode === 'recording' && coordinates.length === 0 && (
          <Text style={[styles.minPointsNote, { marginTop: 12, backgroundColor: 'transparent' }]}>
            Bấm ▶ để bắt đầu ghi · Tap ▶ to start. Đi vòng quanh ruộng — hệ thống tự ghi điểm.
          </Text>
        )}
        {editMode === 'recording' && coordinates.length > 0 && coordinates.length < MIN_POINTS_TO_DEFINE && (
          <Text style={[styles.minPointsNote, { marginTop: 12, backgroundColor: 'transparent' }]}>
            Cần {MIN_POINTS_TO_DEFINE - coordinates.length} điểm nữa · {MIN_POINTS_TO_DEFINE - coordinates.length} more points needed
          </Text>
        )}
      </ScrollView>
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

      // 2. Build closed polygon (GeoJSON)
      const polygonCoords = coordinates.map(c => [c.lng, c.lat]);
      const first = polygonCoords[0];
      const last = polygonCoords[polygonCoords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        polygonCoords.push([first[0], first[1]]);
      }
      const boundary = { type: 'Polygon' as const, coordinates: [polygonCoords] };

      // 3. Build farm record
      const farmId = `farm-${Date.now()}`;
      const inputName = farmNameInputRef.current.trim();
      const farmName = inputName.length > 0
        ? inputName
        : `Vườn ${new Date().toLocaleDateString('vi-VN')}`;

      const localFarm = {
        id: farmId,
        name: farmName,
        coordinates,
        userId: user.id,
      };

      // 4. SAVE LOCAL FIRST — source of truth, backend is best-effort
      try {
        await dispatch(saveFarm(localFarm));
        console.log('[FarmDetailScreen] ✅ Local farm saved:', farmId);
      } catch (localErr: any) {
        console.error('[FarmDetailScreen] Local DB save failed:', localErr);
        Alert.alert(
          'Lỗi lưu cục bộ',
          'Không thể lưu vào bộ nhớ máy. Hãy đóng app và mở lại, rồi thử lại.',
        );
        return;
      }

      // 5. Backend POST best-effort — region_code='auto' sentinel lets backend
      //    derive region from boundary GPS centroid (CPO V4 decision #3).
      try {
        await aladinAPI.createFarm({
          farm_id: farmId,
          owner_did: user.id,
          region_code: 'auto',
          farm_name: farmName,
          boundary,
        });
        console.log('[FarmDetailScreen] ✅ Backend farm synced');
        Toast.show({
          type: 'success',
          text1: '✓ Đã lưu nông trại · Saved',
          text2: 'Đồng bộ thành công · Synced to cloud',
          visibilityTime: 2500,
        });
      } catch (backendErr: any) {
        console.warn('[FarmDetailScreen] Backend sync failed (will retry):', backendErr?.message);
        if (backendErr?.response?.status === 422) {
          console.warn('[FarmDetailScreen] API 422 details:', JSON.stringify(backendErr.response.data, null, 2));
        }
        // Both alert (informational, one-time) + toast (background sync indicator)
        Alert.alert(
          'Đã lưu vào máy · Saved locally',
          'Chưa đồng bộ lên máy chủ. Sẽ tự sync khi có mạng ổn định.',
          [{ text: 'OK' }],
        );
      }

      // 6. Reset state + navigate
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

  const handleAddTree = async () => {
    // Launch native scanner via OriLife SDK with farm data
    try {
      // Initialize scanner first (iOS requires this, Android is idempotent)
      console.log('[FarmDetailScreen] Initializing scanner...');
      await ScannerSDK.initialize();
      console.log('[FarmDetailScreen] Scanner initialized');

      // Then start scanner
      console.log('[FarmDetailScreen] Starting scanner...');
      await ScannerSDK.startScanner({
        mode: 'single',
        farm_id: farm_id
      });
      console.log('[FarmDetailScreen] Scanner started');
    } catch (err) {
      console.error('[FarmDetailScreen] Failed to start scanner:', err);
      // Show error to user
      Alert.alert(
        'Lỗi',
        'Không thể mở scanner. Vui lòng thử lại.',
        [{ text: 'OK' }]
      );
    }
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

  // Subscribe to scan complete event from OriLife SDK.
  // Android: emits 'onScanComplete' → { treeIds, count }
  // iOS capture done: 'onCaptureComplete' → { treeId, capturedCount }   (fast, before upload)
  // iOS upload done: 'onUploadComplete'   → { success, count, treeId, latitude, longitude }
  useEffect(() => {
    if (!farm_id) return;

    // ── Android handler ──────────────────────────────────────────────────
    const handleAndroidScanComplete = async (data: any) => {
      console.log('[FarmDetailScreen] [Android] Scan complete:', JSON.stringify(data));
      const treeIds = data.treeIds || [];
      const rawId = treeIds[0];
      if (!rawId) return;

      // Register on backend first
      try {
        await aladinAPI.createTree({
          id: rawId,
          farm_id,
          region_code: 'vn-south-01',
          geohash_7: 'w3gvk9q',
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        });
        console.log('[FarmDetailScreen] [Android] ✅ Tree registered on backend:', rawId);
      } catch (e: any) {
        if (e?.response?.status !== 409) {
          console.warn('[FarmDetailScreen] [Android] Backend tree create failed (non-fatal):', e?.message);
        }
      }

      const code = `TREE-${rawId.slice(0, 8).toUpperCase()}`;
      const newTree: any = {
        id: rawId,
        farmId: farm_id,
        code,
        latitude: data.latitude ?? 0,
        longitude: data.longitude ?? 0,
        species: 'Durian',
        plantedYear: new Date().getFullYear(),
        images: [],
        estimatedFruits: 0,
        fruitCount: 0,
        scanData: { treeIds, count: data.count || treeIds.length },
      };

      try {
        await dispatch(saveTree(newTree));
        await dispatch(loadTrees(farm_id));
        setCurrentPage(1);
        setTreeIdentificationResult(null);
      } catch (e) {
        console.error('[FarmDetailScreen] [Android] saveTree failed:', e);
      }
    };

    // ── iOS: capture done — wait for upload/verify before saving locally ────
    const handleIOSCaptureComplete = async (data: any) => {
      console.log('[FarmDetailScreen] [iOS] onCaptureComplete:', JSON.stringify(data));
      const treeId = data.treeId;
      if (!treeId) return;
      setTreeIdentificationResult(null);
    };

    // ── iOS: upload done — register on backend with real GPS ─────────────
    const handleIOSUploadComplete = async (data: any) => {
      console.log('[FarmDetailScreen] [iOS] onUploadComplete:', JSON.stringify(data));
      if (!data.success) {
        console.warn('[FarmDetailScreen] [iOS] Upload/verify not successful, skip local tree save');
        return;
      }

      const finalTreeId: string = data.finalTreeId || data.treeId;
      const originalTreeId: string | undefined = data.originalTreeId;
      const matchedTreeId: string | null = data.matchedTreeId || null;
      const usedExistingTree = Boolean(data.usedExistingTree && matchedTreeId);
      const createdNewTree = Boolean(data.createdNewTree || !usedExistingTree);
      const treeId: string = finalTreeId;
      const lat: number = data.latitude ?? 0;
      const lng: number = data.longitude ?? 0;
      if (!treeId) return;

      if (usedExistingTree && matchedTreeId) {
        try {
          const remoteTree = await aladinAPI.getTreeById(matchedTreeId);
          if (remoteTree.farmId === farm_id) {
            await dispatch(saveTree({
              ...remoteTree,
              scanData: {
                ...(remoteTree.scanData ?? {}),
                treeIds: [matchedTreeId],
                count: data.count || 1,
                matchedTreeId,
                originalTreeId,
              },
            } as any));
            await dispatch(loadTrees(farm_id));
            setCurrentPage(1);
          } else {
            Toast.show({
              type: 'info',
              text1: 'Đã thêm ảnh vào cây cũ',
              text2: `Cây ${matchedTreeId} thuộc vườn khác`,
              visibilityTime: 4000,
            });
          }
          setTreeIdentificationResult(null);
          return;
        } catch (e: any) {
          console.warn('[FarmDetailScreen] [iOS] Fetch matched tree failed:', e?.message);
          Toast.show({
            type: 'info',
            text1: 'Đã thêm ảnh vào cây cũ',
            text2: matchedTreeId,
            visibilityTime: 4000,
          });
          setTreeIdentificationResult(null);
          return;
        }
      }

      if (!createdNewTree) return;

      // Register tree on backend with real GPS coordinates from iOS
      // Note: iOS native (EnhancedUploadQueue) already called POST /trees with correct
      // geohash. This is a RN-side safety net — 409 Conflict means the tree already exists.
      try {
        await aladinAPI.createTree({
          id: treeId,
          farm_id,
          region_code: 'vn-south-01',
          geohash_7: 'w3gvk9q',  // Fallback; iOS native already created with real geohash
          latitude: lat ?? undefined,
          longitude: lng ?? undefined,
        });
        console.log('[FarmDetailScreen] [iOS] ✅ Tree registered on backend:', treeId, `lat=${lat}, lng=${lng}`);

      } catch (e: any) {
        if (e?.response?.status !== 409) {
          console.warn('[FarmDetailScreen] [iOS] Backend tree create failed (non-fatal):', e?.message);
        }
      }

      // Update local record with confirmed GPS
      const code = `TREE-${treeId.slice(0, 8).toUpperCase()}`;
      const confirmedTree: any = {
        id: treeId,
        farmId: farm_id,
        code,
        latitude: lat,
        longitude: lng,
        species: 'Durian',
        plantedYear: new Date().getFullYear(),
        images: [],
        estimatedFruits: 0,
        fruitCount: 0,
        scanData: { treeIds: [treeId], count: data.count || 1, originalTreeId },
      };

      try {
        await dispatch(saveTree(confirmedTree));
        await dispatch(loadTrees(farm_id));
        setCurrentPage(1);
        setTreeIdentificationResult(null);
        console.log('[FarmDetailScreen] [iOS] ✅ Tree confirmed locally with GPS');
      } catch (e) {
        console.error('[FarmDetailScreen] [iOS] confirmed saveTree failed:', e);
      }
    };

    // ── Subscribe ────────────────────────────────────────────────────────
    const subs: any[] = [];

    if (Platform.OS === 'ios') {
      console.log('[FarmDetailScreen] Setting up iOS listeners');
      subs.push(ScannerSDK.addListener(EVENTS.CAPTURE_COMPLETE, handleIOSCaptureComplete));
      subs.push(ScannerSDK.addListener(EVENTS.UPLOAD_COMPLETE, handleIOSUploadComplete));
    } else {
      console.log('[FarmDetailScreen] Setting up Android listener: onScanComplete');
      subs.push(ScannerSDK.addListener(EVENTS.SCAN_COMPLETE, handleAndroidScanComplete));
    }

    return () => {
      console.log('[FarmDetailScreen] Cleaning up scan listeners');
      subs.forEach(sub => sub.remove());
    };
  }, [farm_id, dispatch]);





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
        onVertexLongPress={handleVertexLongPress}
        onMapTapInsert={handleMapTapInsert}
        onUndo={handleUndo}
        onResetFromScratch={handleResetFromScratch}
        onResumeRecording={handleResumeRecording}
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
});

export default FarmDetailScreen;