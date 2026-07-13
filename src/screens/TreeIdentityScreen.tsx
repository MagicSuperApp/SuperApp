/**
 * TreeIdentityScreen — Nhận diện cây bằng camera
 *
 * Platform guard bắt buộc:
 *   iOS  → NativeCameraPreview (requireNativeComponent) + TreeReIDBridge
 *   Android → react-native-geolocation-service + PermissionsAndroid + Alert "chụp thủ công"
 *
 * Flow 2 lượt:
 *   Lượt 1: Chụp thân cây đi vòng quanh (≥4 góc)
 *   Lượt 2: Chụp gốc/vỏ cận (≥2 góc, tuỳ chọn)
 *
 * Sau nhận diện:
 *   MATCH         → ResultBadge + FactorBreakdown + tên/code/similarity
 *   UNCERTAIN     → ReidConfirmDialog với candidates
 *   NO_MATCH /
 *   EMPTY_BUCKET  → nút "Đăng ký cây mới" → navigate TreeEnroll
 *                   (captures lưu qua redux, KHÔNG qua navigation params)
 *   MOVED         → hiện khoảng cách + nút "Cập nhật vị trí"
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { launchCamera } from 'react-native-image-picker';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  Alert,
  Linking,
  ActivityIndicator,
  ScrollView,
  requireNativeComponent,
  Modal,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';

import { COLORS } from '../constants';
import { NEUTRAL } from '../shared/theme';
import {
  TreeReIDBridge,
  subscribeHeadingUpdate,
  subscribeCaptureTriggered,
  subscribeRoundComplete,
  type HeadingUpdate,
  type CaptureTriggered,
  type RoundComplete,
  type CapturedImage,
} from '../services/treeReIDNativeBridge';
import {
  identifyTree,
  verifyAddTree,
  submitIdentifyVerdict,
  getTrees,
  fieldErrorMessage,
  type IdentifyResponse,
  type ConfidenceBand,
  type IdentifyVerdict,
  type ShellMatcher,
  type TreeInfo,
} from '../services/treeReIDService';
import ResultBadge from '../components/reid/ResultBadge';
import FactorBreakdown, { type FactorScores } from '../components/reid/FactorBreakdown';
import ReidConfirmDialog, { type ReidCandidate } from '../components/reid/ReidConfirmDialog';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { ensureOrilifeToken, clearOrilifeToken } from '../services/orilifeDidAuth';
import { phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { loginUser } from '../store/userSlice';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import rLog from '../services/remoteLogger';
import {
  addCapture,
  setCapturing,
  setCurrentRound,
  setIdentificationResult,
  clearAll,
  selectCaptures,
  selectIdentificationResult,
  selectIsIdentifying,
  selectGPS,
  setGPS,
} from '../store/treeReIDSlice';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Dùng @env (react-native-dotenv) — biến phải khai báo trong .env
// Nếu chưa có → fallback staging
import { ORILIFE_BASE } from '../services/orilifeBase';
const BASE_URL: string =
  ORILIFE_BASE;

// ---------------------------------------------------------------------------
// Native component (iOS only)
// ---------------------------------------------------------------------------

// NativeCameraPreview tồn tại trên cả iOS lẫn Android (ViewManager cùng tên
// "TreeReIDCameraPreview"). Máy Android chưa cập nhật (thiếu view) sẽ không render
// — nhưng guard isCaptureActive + isAvailable() ở dưới đảm bảo chỉ dùng khi có native.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NativeCameraPreview =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (requireNativeComponent('TreeReIDCameraPreview') as React.ComponentType<{
      style?: object;
    }>)
    : null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ROUND1 = 4;
const MIN_ROUND2 = 2;

const GUIDANCE = {
  idle: 'Bấm "Bắt đầu" để nhận diện cây.',
  round1: 'Đi vòng quanh cây, lia chậm để lấy đủ góc.',
  round2: 'Đứng SÁT GỐC, chĩa ống kính LÊN — lấy rõ vỏ gốc, sẹo, chạc cây.',
  needMore: 'Xoay thêm một chút nữa để lấy góc mới.',
  captured: 'Đã lấy một góc — tiếp tục lia.',
  sufficient: 'Đủ để nhận rồi. Bấm "Lượt 2: Cận gốc" để tăng độ chính xác.',
  android: 'Bấm "Chụp ảnh" để thêm góc nhìn (tối thiểu 4 ảnh).',
} as const;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type TreeIdentityRouteParams = {
  TreeIdentity: {
    /** Vườn hiện-hành — truyền tiếp xuống TreeEnroll để gắn cây vào vườn. */
    farmId?: string;
  };
};

const TreeIdentityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<TreeIdentityRouteParams, 'TreeIdentity'>>();
  const dispatch = useAppDispatch();
  // Giữ tên hiển-thị khi phải đăng-ký-lại (DID mới nhưng tên cũ).
  const currentUser = useAppSelector(s => s.user.currentUser);

  // Vườn hiện-hành (nếu mở từ ngữ-cảnh farm) — truyền tiếp xuống TreeEnroll.
  const farmId = route.params?.farmId;

  useEffect(() => {
    rLog.treeIdentity.screenMount({ farmId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Redux state ───────────────────────────────────────────────────────────
  const capturesRedux = useAppSelector(selectCaptures);
  const identResultRedux = useAppSelector(selectIdentificationResult);
  const isIdentifyingRedux = useAppSelector(selectIsIdentifying);
  const gpsRedux = useAppSelector(selectGPS);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [isCaptureActive, setIsCaptureActive] = useState(false);
  const [currentRoundLocal, setCurrentRoundLocal] = useState<1 | 2>(1);
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [shouldCapture, setShouldCapture] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isIdentifyingLocal, setIsIdentifyingLocal] = useState(false);
  const [identResult, setIdentResult] = useState<IdentifyResponse | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showFactors, setShowFactors] = useState(false);

  // ── PoC-Tree §4: verdict + matcher (ADDITIVE, ẩn nội-tạng) ────────────────
  // query_id của lần identify hiện-tại (Lợi PR #46) — GIỮ để gửi verdict.
  const [queryId, setQueryId] = useState<string | null>(null);
  // Phán-quyết đã gửi (null = chưa gửi) → khoá nút sau 1 chạm.
  const [verdictSent, setVerdictSent] = useState<IdentifyVerdict | null>(null);
  const [isSendingVerdict, setIsSendingVerdict] = useState(false);
  // Bộ chọn "cây khác" (verdict='other' cần correct_tid từ /api/trees).
  const [showTreePicker, setShowTreePicker] = useState(false);
  const [pickerTrees, setPickerTrees] = useState<TreeInfo[]>([]);
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // ── M4: matcher toggle ẩn (tester) — long-press tiêu-đề mở chọn ───────────
  // null = mặc-định (không gửi ?matcher=, backend dùng ENV).
  const [matcher, setMatcher] = useState<ShellMatcher | null>(null);
  const [showMatcherPicker, setShowMatcherPicker] = useState(false);

  // Android: captures tự quản lý cục bộ bằng mảng uri ảnh
  const [androidImageUris, setAndroidImageUris] = useState<string[]>([]);

  // iOS: đếm capture từ native event (capturesRedux chỉ được điền SAU stop).
  const [iosCaptureCount, setIosCaptureCount] = useState(0);
  // Snapshot tổng-số-capture tại thời điểm advance sang lượt 2 → tính per-round.
  const [iosRound1Snapshot, setIosRound1Snapshot] = useState(0);

  const geoWatchRef = useRef<number | null>(null);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const startGPS = useCallback(() => {
    if (geoWatchRef.current !== null) return;

    const requestAndWatch = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Quyền Vị trí',
            message: 'Aladin cần GPS để nhận diện cây gần bạn.',
            buttonPositive: 'Cho phép',
            buttonNegative: 'Từ chối',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }

      geoWatchRef.current = Geolocation.watchPosition(
        pos => {
          dispatch(
            setGPS({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          );
        },
        _err => {
          // GPS không sẵn — tiếp tục không có toạ độ
        },
        { enableHighAccuracy: true, distanceFilter: 5 },
      );
    };

    requestAndWatch();
  }, [dispatch]);

  const stopGPS = useCallback(() => {
    if (geoWatchRef.current !== null) {
      Geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
  }, []);

  // ── Permissions (camera Android) ─────────────────────────────────────────
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Quyền Camera',
        message: 'Aladin cần Camera để chụp ảnh cây.',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Từ chối',
      },
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert('Cần quyền Camera', 'Vui lòng bật Camera trong Cài đặt.', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
    return true;
  };

  // ── Native event subscriptions (iOS + Android khi có native) ─────────────
  useEffect(() => {
    if (!TreeReIDBridge.isAvailable()) return;

    const unsubHeading = subscribeHeadingUpdate((e: HeadingUpdate) => {
      setHeading(e.heading);
      setPitch(e.pitch);
      setRoll(e.roll);
      setShouldCapture(e.shouldCapture);
    });

    const unsubCapture = subscribeCaptureTriggered((e: CaptureTriggered) => {
      // Native gửi 2 lần: lần đầu (trước save) totalCaptures=N-1, lần sau (sau save) totalCaptures=N.
      // Lấy max để counter chỉ tăng, không lùi.
      if (e.totalCaptures > 0) {
        setIosCaptureCount(prev => {
          const next = Math.max(prev, e.totalCaptures);
          rLog.treeIdentity.captureTriggered(next, currentRoundLocal);
          return next;
        });
      }
    });

    const unsubRound = subscribeRoundComplete((e: RoundComplete) => {
      const nextRound = (e.nextRound as 1 | 2) ?? 2;
      rLog.nativeBridge.roundComplete(nextRound, iosCaptureCount);
      setCurrentRoundLocal(nextRound);
      dispatch(setCurrentRound(nextRound));
    });

    return () => {
      unsubHeading();
      unsubCapture();
      unsubRound();
    };
  }, [dispatch]);

  // ── GPS watch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    startGPS();
    return () => stopGPS();
  }, [startGPS, stopGPS]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Không clearAll vì TreeEnrollScreen cần dùng captures từ redux.
      // Dừng session native để giải phóng camera nếu user rời màn giữa chừng
      // (không bấm "Nhận diện"). Best-effort — không có session thì native resolve null.
      if (TreeReIDBridge.isAvailable()) {
        TreeReIDBridge.stopCaptureSession().catch(() => { });
      }
    };
  }, []);

  // ── Derive local capture counts ───────────────────────────────────────────
  // iOS: capturesRedux chỉ điền SAU stop session → dùng iosCaptureCount real-time.
  //   round1Count  = iosCaptureCount khi đang lượt 1; khi sang lượt 2 = snapshot lúc advance.
  //   round2Count  = iosCaptureCount - iosRound1Snapshot khi đang lượt 2.
  // Native (iOS + Android): dùng counter real-time iosCaptureCount; fallback picker dùng redux/URIs.
  const round1Count = TreeReIDBridge.isAvailable() && isCaptureActive
    ? (currentRoundLocal === 1 ? iosCaptureCount : iosRound1Snapshot)
    : capturesRedux.filter(c => c.round === 1).length;
  const round2Count = TreeReIDBridge.isAvailable() && isCaptureActive
    ? (currentRoundLocal === 2 ? iosCaptureCount - iosRound1Snapshot : 0)
    : capturesRedux.filter(c => c.round === 2).length;
  const totalCaptures =
    TreeReIDBridge.isAvailable() ? iosCaptureCount : androidImageUris.length;

  // ── Guidance text ─────────────────────────────────────────────────────────
  const getGuidance = (): string => {
    if (identResult) return '';
    // Android KHÔNG có native → guidance chụp tay; có native thì dùng guidance theo round như iOS.
    if (Platform.OS === 'android' && !TreeReIDBridge.isAvailable()) return GUIDANCE.android;
    if (!isCaptureActive) return GUIDANCE.idle;
    if (totalCaptures === 0)
      return currentRoundLocal === 2 ? GUIDANCE.round2 : GUIDANCE.round1;
    if (shouldCapture) return GUIDANCE.needMore;
    if (currentRoundLocal === 1 && round1Count >= MIN_ROUND1)
      return GUIDANCE.sufficient;
    return GUIDANCE.captured;
  };

  // ── Start capture session (iOS + Android native) ──────────────────────────
  const handleStartCapture = async () => {
    if (!TreeReIDBridge.isAvailable()) {
      Alert.alert('Lỗi', 'Native module chưa sẵn sàng. Vui lòng cập nhật app.');
      return;
    }
    // Android: xin quyền Camera trước (iOS module tự xin trong startCaptureSession).
    if (Platform.OS === 'android') {
      const ok = await requestCameraPermission();
      if (!ok) return;
    }

    try {
      setIsLoading(true);
      rLog.treeIdentity.startCapture();
      dispatch(clearAll());
      setIosCaptureCount(0);
      setIosRound1Snapshot(0);
      const result = await TreeReIDBridge.startCaptureSession();
      setIsCaptureActive(true);
      setCurrentRoundLocal(result.round as 1 | 2);
      dispatch(setCapturing(true));
      dispatch(setCurrentRound(result.round as 1 | 2));
      setIdentResult(null);
    } catch (e: any) {
      rLog.nativeBridge.bridgeError('startCaptureSession', e?.message ?? String(e));
      Alert.alert('Lỗi', 'Không thể bắt đầu chụp. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── iOS: Advance to round 2 ───────────────────────────────────────────────
  const handleAdvanceToRound2 = async () => {
    try {
      rLog.treeIdentity.advanceRound2(iosCaptureCount);
      setIosRound1Snapshot(iosCaptureCount);  // snapshot round1 count trước khi advance
      const result = await TreeReIDBridge.advanceToRound2();
      const nextRound = (result.round as 1 | 2) ?? 2;
      setCurrentRoundLocal(nextRound);
      dispatch(setCurrentRound(nextRound));
    } catch (e: any) {
      rLog.nativeBridge.bridgeError('advanceToRound2', e?.message ?? String(e));
    }
  };

  // ── iOS: Stop capture + identify ─────────────────────────────────────────
  const handleStopAndIdentify = async () => {
    try {
      setIsLoading(true);
      rLog.treeIdentity.stopAndIdentifyStart(iosCaptureCount);
      const stopResult = await TreeReIDBridge.stopCaptureSession();
      setIsCaptureActive(false);
      dispatch(setCapturing(false));

      const captureCount = stopResult?.captures.length ?? 0;
      rLog.treeIdentity.stopSessionResult(captureCount >= MIN_ROUND1, captureCount);

      if (!stopResult || captureCount < MIN_ROUND1) {
        Alert.alert(
          'Chưa đủ góc',
          `Cần ít nhất ${MIN_ROUND1} góc chụp. Hiện có ${captureCount} góc.`,
        );
        return;
      }

      // Lưu captures vào redux
      for (const cap of stopResult.captures) {
        dispatch(addCapture(cap));
      }

      await runIdentify(stopResult.captures.map(c => `file://${c.fileURL}`));
    } catch (e: any) {
      rLog.nativeBridge.bridgeError('stopCaptureSession', e?.message ?? String(e));
      Alert.alert('Lỗi', 'Không thể dừng chụp. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Android: Thêm ảnh từ camera (react-native-image-picker) ───────────────
  const handleAndroidAddPhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const res = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
        saveToPhotos: false,
      });
      if (res.didCancel) return;
      if (res.errorCode) {
        Alert.alert('Lỗi camera', res.errorMessage || 'Không mở được camera.');
        return;
      }
      const uri = res.assets?.[0]?.uri;
      if (uri) {
        setAndroidImageUris(prev => [...prev, uri]);
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không chụp được ảnh.');
    }
  };

  // ── Android: Identify với ảnh picker ──────────────────────────────────────
  const handleAndroidIdentify = async () => {
    if (androidImageUris.length < MIN_ROUND1) {
      Alert.alert(
        'Chưa đủ ảnh',
        `Cần ít nhất ${MIN_ROUND1} ảnh. Hiện có ${androidImageUris.length} ảnh.`,
      );
      return;
    }
    await runIdentify(androidImageUris);
  };

  // ── Đăng-ký-lại danh-tính (DID mồ côi) rồi nhận-diện tiếp ─────────────────
  // Keypair cũ còn nên registerIdentity sẽ recover DID cũ → reRegisterIdentity WIPE
  // trước để sinh DID MỚI + ghi genesis mới lên PhoenixKey. Xong tự thử identify lại.
  const reRegisterThenIdentify = async (imagePaths: string[]) => {
    setIsIdentifyingLocal(true);
    try {
      // Xác-định loại sinh-trắc để đặt đúng nhãn khoá (không đổi hành-vi ký).
      let kind: 'face' | 'fingerprint' | 'strong' = 'strong';
      try {
        const { biometryType } = await new ReactNativeBiometrics().isSensorAvailable();
        kind = biometryType === BiometryTypes.FaceID ? 'face'
          : biometryType === BiometryTypes.TouchID ? 'fingerprint' : 'strong';
      } catch { /* mặc-định 'strong' */ }

      const prevName = currentUser?.name;
      const { user } = await phoenixKeyAuth.reRegisterIdentity(kind);
      await clearOrilifeToken(); // token cũ (nếu có) gắn DID cũ → bỏ để login lại bằng DID mới
      await dispatch(loginUser({ ...user, name: prevName } as any) as any);
      // Đăng-ký xong → thử nhận-diện lại luôn (ensureOrilifeToken sẽ ký bằng DID mới).
      await runIdentify(imagePaths);
    } catch (e: any) {
      setIsIdentifyingLocal(false);
      Alert.alert('Đăng ký lại thất bại', e?.message || 'Vui lòng thử lại.');
    }
  };

  // ── Core: Gọi API identify ────────────────────────────────────────────────
  const runIdentify = async (imagePaths: string[]) => {
    setIsIdentifyingLocal(true);
    // Mỗi lần identify mới → xoá phán-quyết cũ.
    setQueryId(null);
    setVerdictSent(null);
    rLog.treeIdentity.apiStart(imagePaths.length, gpsRedux?.lat, gpsRedux?.lng);

    // Đảm bảo có token field-reid. Chưa có → đăng nhập DID bằng khoá PhoenixKey
    // (ký challenge bằng Secure Enclave/Keystore → server cấp token). Token TTL 12h
    // nên thường chỉ phải ký 1 lần/phiên.
    const tokenOk = await ensureOrilifeToken(BASE_URL);
    if (!tokenOk) {
      rLog.treeIdentity.apiError('did_login_failed', imagePaths.length);
      setIsIdentifyingLocal(false);
      // Phân-biệt DID MỒ CÔI (server PhoenixKey đã reset → DID local không còn trên
      // directory → OriLife trả 503) với lỗi tạm (mạng/server bận). Chỉ mời đăng-ký-lại
      // khi probe trả 404 chắc-chắn — tránh bắt user đăng-ký oan khi chỉ mất mạng.
      const registered = await phoenixKeyAuth.isIdentityRegisteredOnServer();
      if (registered === false) {
        Alert.alert(
          'Danh tính chưa có trên máy chủ',
          'Máy chủ nhận diện đã được làm mới nên danh tính cũ trên máy không còn hiệu lực. ' +
            'Đăng ký lại danh tính để tiếp tục nhận diện?',
          [
            { text: 'Huỷ', style: 'cancel' },
            { text: 'Đăng ký lại', onPress: () => reRegisterThenIdentify(imagePaths) },
          ],
        );
      } else {
        Alert.alert(
          'Chưa nhận diện được',
          'Máy chủ nhận diện đang bận hoặc mạng chập chờn. Vui lòng thử lại sau ít phút.',
        );
      }
      return;
    }

    const callIdentify = () =>
      identifyTree(BASE_URL, imagePaths, {
        lat: gpsRedux?.lat,
        lon: gpsRedux?.lng,
        heading: heading ?? undefined,
        pitch: pitch ?? undefined,
        // M4: chỉ gửi khi tester đã bật toggle.
        matcher: matcher ?? undefined,
      });

    try {
      let result = await callIdentify();

      // Token hết hạn/không hợp lệ (401) → DID login lại 1 lần rồi thử lại.
      if (!result.ok && result.error?.type === 'auth_error') {
        const relog = await ensureOrilifeToken(BASE_URL, { force: true });
        if (relog) result = await callIdentify();
      }

      if (result.ok && result.data) {
        const data = result.data;
        rLog.treeIdentity.apiResult(
          data.decision,
          data.confidence ?? null,
          data.tree_id ?? null,
          data.query_id ?? null,
          data.similarity ?? null,
        );
        setIdentResult(data);
        dispatch(setIdentificationResult(data));
        // M2/M3: giữ query_id để gửi verdict (chỉ khi backend mới trả).
        setQueryId(data.query_id ?? null);

        if (data.decision === 'UNCERTAIN') {
          setShowConfirm(true);
        }
        // Các decision khác xử lý ở render / handleDecisionAction
      } else {
        rLog.treeIdentity.apiError(result.error?.detail ?? 'unknown', imagePaths.length);
        // Hiện câu gợi ý rõ ràng (flat/heterogeneous/need_gps...) thay vì "lỗi" chung (Lỗi field #3).
        Alert.alert('Chưa tạo được cây', fieldErrorMessage(result.error));
      }
    } catch (e: any) {
      rLog.treeIdentity.apiError(e?.message ?? String(e), imagePaths.length);
      Alert.alert('Lỗi nhận diện', 'Lỗi kết nối. Thử lại.');
    } finally {
      setIsIdentifyingLocal(false);
    }
  };

  // ── MATCH: cập nhật vị trí MOVED ──────────────────────────────────────────
  const handleUpdateLocation = async () => {
    if (!identResult?.tree_id || !gpsRedux) {
      Alert.alert('Lỗi', 'Không có GPS hoặc mã cây để cập nhật vị trí.');
      return;
    }
    try {
      setIsLoading(true);
      // Gọi verify_add với ảnh hiện tại — server tự cập nhật GPS mới
      const imgs =
        TreeReIDBridge.isAvailable()
          ? capturesRedux.map(c => `file://${c.fileURL}`)
          : androidImageUris;

      const res = await verifyAddTree(BASE_URL, identResult.tree_id, imgs);

      if (res.ok) {
        Alert.alert('Đã cập nhật', 'Vị trí mới của cây đã được lưu.');
      } else {
        Alert.alert('Chưa cập nhật được', fieldErrorMessage(res.error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── UNCERTAIN: chọn candidate ─────────────────────────────────────────────
  const handleSelectCandidate = async (id: string | 'new') => {
    setShowConfirm(false);
    if (id === 'new') {
      navigation.navigate('TreeEnroll', {
        androidImagePaths:
          Platform.OS === 'android' && !TreeReIDBridge.isAvailable() ? androidImageUris : undefined,
        farmId,
      });
      return;
    }
    // Xác nhận candidate → thêm góc nhìn vào cây đó
    try {
      setIsLoading(true);
      const imgs =
        TreeReIDBridge.isAvailable()
          ? capturesRedux.map(c => `file://${c.fileURL}`)
          : androidImageUris;

      const res = await verifyAddTree(BASE_URL, id, imgs);

      if (res.ok) {
        Alert.alert('Đã xác nhận', `Góc nhìn mới đã thêm vào cây.\nĐã thêm: ${res.data?.n_added ?? 0} góc.`);
      } else {
        Alert.alert('Chưa thêm được góc', fieldErrorMessage(res.error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Đăng ký cây mới (NO_MATCH / EMPTY_BUCKET) ────────────────────────────
  const handleRegisterNew = () => {
    navigation.navigate('TreeEnroll', {
      androidImagePaths: Platform.OS === 'android' ? androidImageUris : undefined,
      farmId,
    });
  };

  // ── "Không phải cây này — đây là CÂY MỚI" (từ luồng MATCH sai) ────────────
  // Field (Giang 13/07): server khớp NHẦM cây đã có (ngưỡng same-species chưa
  // calibrate) → user biết là cây khác NHƯNG bộ chọn "Cây khác" chỉ liệt kê cây
  // ĐÃ CÓ → KẸT, không tạo được cây mới nào nữa. Mở lối đăng-ký-mới ngay tại đây
  // để field không phải chờ server chỉnh ngưỡng.
  const handleRegisterNewFromMatch = () => {
    setShowTreePicker(false);
    // Phản hồi top-1 SAI (giúp server hiệu-chỉnh ngưỡng). Best-effort, không chặn UI.
    if (queryId && !verdictSent && !isSendingVerdict) {
      void sendVerdict('wrong');
    }
    handleRegisterNew();
  };

  // ── Reset về trạng thái ban đầu ───────────────────────────────────────────
  const handleReset = () => {
    rLog.treeIdentity.reset();
    setIdentResult(null);
    setShowFactors(false);
    setAndroidImageUris([]);
    setIosCaptureCount(0);
    setIosRound1Snapshot(0);
    setCurrentRoundLocal(1);
    setIsCaptureActive(false);
    setQueryId(null);
    setVerdictSent(null);
    setShowTreePicker(false);
    dispatch(clearAll());
  };

  // ── M3: gửi phán-quyết (Đúng / Sai / Là-cây-khác) ─────────────────────────
  const sendVerdict = async (verdict: IdentifyVerdict, correctTid?: string) => {
    if (!queryId || verdictSent || isSendingVerdict) return;
    setIsSendingVerdict(true);
    rLog.treeIdentity.verdictSend(verdict, queryId, correctTid);
    try {
      const res = await submitIdentifyVerdict(BASE_URL, {
        queryId,
        verdict,
        correctTid,
      });
      if (res.ok) {
        rLog.treeIdentity.verdictResult(true);
        setVerdictSent(verdict);
      } else {
        rLog.treeIdentity.verdictResult(false, res.error?.detail ?? 'unknown');
        Alert.alert('Lỗi', res.error?.detail ?? 'Không gửi được phản hồi. Thử lại.');
      }
    } finally {
      setIsSendingVerdict(false);
    }
  };

  // ── M3: "Là cây khác" → nạp /api/trees rồi chọn correct_tid ───────────────
  const handleOpenTreePicker = async () => {
    if (verdictSent || isSendingVerdict) return;
    setShowTreePicker(true);
    setIsLoadingPicker(true);
    setPickerError(null);
    try {
      const res = await getTrees(BASE_URL, farmId);
      if (res.ok && res.trees) {
        setPickerTrees(res.trees);
      } else {
        setPickerError(res.error?.detail ?? 'Không tải được danh sách cây.');
      }
    } catch {
      setPickerError('Không tải được danh sách cây.');
    } finally {
      setIsLoadingPicker(false);
    }
  };

  const handlePickCorrectTree = async (treeId: string) => {
    setShowTreePicker(false);
    await sendVerdict('other', treeId);
  };

  // ── Render result panel ───────────────────────────────────────────────────
  const renderResultPanel = () => {
    if (!identResult) return null;
    const { decision, name, code, similarity, margin, factors, moved_distance_m, confidence, suggest } =
      identResult as IdentifyResponse & {
        similarity?: number;
        margin?: number;
        factors?: FactorScores;
      };
    // owner_review: backend thiếu cờ = cho tạo mới (giữ hành-vi cũ).
    const allowEnrollNew = identResult.allow_enroll_new !== false;

    return (
      <ScrollView
        style={styles.resultPanel}
        contentContainerStyle={styles.resultPanelContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Badge */}
        <ResultBadge
          decision={decision}
          context="tree"
          extra={
            decision === 'MATCH'
              ? `${name ?? 'Không tên'} · ${code ?? 'N/A'}`
              : decision === 'MOVED'
                ? `Di chuyển ~${moved_distance_m?.toFixed(0) ?? '?'} m`
                : undefined
          }
        />

        {/* M2: băng tin-cậy THÔ (cao/vừa/thấp) — KHÔNG hiện điểm số */}
        {confidence && <ConfidenceBandView band={confidence} />}

        {/* Gợi ý hành-động từ server (suggest) — vd "đi vòng chụp thêm góc" */}
        {suggest ? (
          <View style={styles.suggestBox}>
            <Icon name="lightbulb-on-outline" size={16} color={NEUTRAL.warning} />
            <Text style={styles.suggestText}>{suggest}</Text>
          </View>
        ) : null}

        {/* M3: phán-quyết người dùng — chỉ hiện khi backend trả query_id */}
        {queryId && (
          <View style={styles.verdictBox}>
            <Text style={styles.verdictTitle}>Kết quả này có đúng không?</Text>
            {verdictSent ? (
              <View style={styles.verdictDone}>
                <Icon name="check-circle" size={18} color="#1b5e20" />
                <Text style={styles.verdictDoneText}>
                  Đã ghi nhận phản hồi. Cảm ơn bạn.
                </Text>
              </View>
            ) : (
              <View style={styles.verdictRow}>
                <TouchableOpacity
                  style={[styles.verdictBtn, styles.verdictCorrect]}
                  onPress={() => sendVerdict('correct')}
                  disabled={isSendingVerdict}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Kết quả đúng"
                >
                  <Icon name="thumb-up" size={16} color="#1b5e20" />
                  <Text style={[styles.verdictBtnText, { color: '#1b5e20' }]}>Đúng</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.verdictBtn, styles.verdictWrong]}
                  onPress={() => sendVerdict('wrong')}
                  disabled={isSendingVerdict}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Kết quả sai"
                >
                  <Icon name="thumb-down" size={16} color="#c62828" />
                  <Text style={[styles.verdictBtnText, { color: '#c62828' }]}>Sai</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.verdictBtn, styles.verdictOther]}
                  onPress={handleOpenTreePicker}
                  disabled={isSendingVerdict}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Là cây khác"
                >
                  <Icon name="swap-horizontal" size={16} color="#5c6bc0" />
                  <Text style={[styles.verdictBtnText, { color: '#5c6bc0' }]}>Cây khác</Text>
                </TouchableOpacity>
              </View>
            )}
            {isSendingVerdict && (
              <View style={styles.verdictSending}>
                <ActivityIndicator size="small" color={NEUTRAL.textSub} />
                <Text style={styles.verdictSendingText}>Đang gửi...</Text>
              </View>
            )}
          </View>
        )}

        {/* MATCH: chi tiết */}
        {decision === 'MATCH' && (
          <View style={styles.matchDetail}>
            <View style={styles.matchRow}>
              <Icon name="tree" size={16} color="#1b5e20" />
              <Text style={styles.matchLabel}>Tên cây</Text>
              <Text style={styles.matchValue}>{name ?? '—'}</Text>
            </View>
            <View style={styles.matchRow}>
              <Icon name="barcode" size={16} color="#1b5e20" />
              <Text style={styles.matchLabel}>Mã</Text>
              <Text style={styles.matchValue}>{code ?? '—'}</Text>
            </View>
            {typeof similarity === 'number' && (
              <View style={styles.matchRow}>
                <Icon name="percent" size={16} color="#1b5e20" />
                <Text style={styles.matchLabel}>Độ giống</Text>
                <Text style={styles.matchValue}>
                  {Math.round(similarity * 100)}%
                  {typeof margin === 'number'
                    ? ` (+${Math.round(margin * 100)}% so với cây tiếp theo)`
                    : ''}
                </Text>
              </View>
            )}

            {/* Toggle factor breakdown */}
            <TouchableOpacity
              style={styles.factorToggle}
              onPress={() => setShowFactors(v => !v)}
              activeOpacity={0.7}
            >
              <Icon
                name={showFactors ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={NEUTRAL.textSub}
              />
              <Text style={styles.factorToggleText}>
                {showFactors ? 'Ẩn chi tiết' : 'Xem chi tiết 4 tín hiệu'}
              </Text>
            </TouchableOpacity>

            {factors && (
              <FactorBreakdown
                factors={factors}
                visible={showFactors}
              />
            )}
          </View>
        )}

        {/* MATCH nhưng SAI cây → lối thoát đăng-ký cây mới.
            Server có thể khớp NHẦM cây cùng-loài (ngưỡng chưa calibrate). Không có
            lối này thì user KẸT: "Cây khác" chỉ chọn được cây đã có (field Giang 13/07). */}
        {decision === 'MATCH' && allowEnrollNew && (
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.btnOutlineGreen]}
              onPress={handleRegisterNewFromMatch}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Không phải cây này, đăng ký cây mới"
            >
              <Icon name="plus-circle-outline" size={18} color="#1b5e20" />
              <Text style={[styles.decisionBtnText, { color: '#1b5e20' }]}>
                Không phải cây này — Đăng ký cây mới
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* MOVED: nút cập nhật vị trí */}
        {decision === 'MOVED' && (
          <View style={styles.actionGroup}>
            <Text style={styles.movedHint}>
              Vị trí GPS hiện tại cách vị trí đã lưu{' '}
              <Text style={styles.movedDist}>
                ~{moved_distance_m?.toFixed(0) ?? '?'} m
              </Text>
              . Nếu cây đã được chuyển đến đây, bấm cập nhật.
            </Text>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.btnBlue]}
              onPress={handleUpdateLocation}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={NEUTRAL.white} />
              ) : (
                <>
                  <Icon name="map-marker-right" size={18} color={NEUTRAL.white} />
                  <Text style={styles.decisionBtnText}>Cập nhật vị trí</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* NO_MATCH / EMPTY_BUCKET: đăng ký mới (chỉ khi server CHO PHÉP) */}
        {(decision === 'NO_MATCH' || decision === 'EMPTY_BUCKET') && (
          <View style={styles.actionGroup}>
            <Text style={styles.noMatchHint}>
              {decision === 'EMPTY_BUCKET'
                ? 'Chưa có cây nào gần vị trí này.'
                : 'Cây chưa được đăng ký trong hệ thống.'}
            </Text>
            {allowEnrollNew ? (
              <TouchableOpacity
                style={[styles.decisionBtn, styles.btnGreen]}
                onPress={handleRegisterNew}
                activeOpacity={0.8}
              >
                <Icon name="plus-circle" size={18} color={NEUTRAL.white} />
                <Text style={styles.decisionBtnText}>Đăng ký cây mới</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.noMatchHint}>
                Kết quả chưa chắc chắn — hãy chụp thêm góc khác hoặc nhờ chủ vườn xác nhận. Tạm chưa thể đăng ký cây mới ở đây.
              </Text>
            )}
          </View>
        )}

        {/* Nút nhận diện lại */}
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <Icon name="refresh" size={16} color={NEUTRAL.textSub} />
          <Text style={styles.retryBtnText}>Nhận diện lại</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Render bottom controls ─────────────────────────────────────────────────
  const renderControls = () => {
    if (identResult) return null;

    // Android KHÔNG có native → controls chụp tay (picker). Có native → dùng chung controls
    // guided với iOS bên dưới (Bắt đầu / Lượt 2 / Nhận diện).
    if (Platform.OS === 'android' && !TreeReIDBridge.isAvailable()) {
      return (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.ctrlBtnSecondary]}
            onPress={handleAndroidAddPhoto}
            activeOpacity={0.8}
          >
            <Icon name="camera-plus" size={22} color={CAM} />
            <Text style={styles.ctrlBtnSecText}>
              Chụp ảnh ({androidImageUris.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ctrlBtn,
              styles.ctrlBtnPrimary,
              (isIdentifyingLocal || androidImageUris.length < MIN_ROUND1) &&
              styles.ctrlBtnDisabled,
            ]}
            onPress={handleAndroidIdentify}
            disabled={isIdentifyingLocal || androidImageUris.length < MIN_ROUND1}
            activeOpacity={0.8}
          >
            {isIdentifyingLocal ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Icon name="magnify" size={22} color="#000000" />
                <Text style={styles.ctrlBtnText}>Nhận diện</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    // iOS
    if (!isCaptureActive) {
      return (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.ctrlBtnPrimary]}
            onPress={handleStartCapture}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Icon name="camera-enhance" size={22} color="#000000" />
                <Text style={styles.ctrlBtnText}>Bắt đầu</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.controls}>
        {currentRoundLocal === 1 && round1Count >= MIN_ROUND1 && (
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.ctrlBtnSecondary]}
            onPress={handleAdvanceToRound2}
            activeOpacity={0.8}
          >
            <Icon name="arrow-right-bold" size={22} color={CAM} />
            <Text style={styles.ctrlBtnSecText}>Lượt 2: Cận gốc</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.ctrlBtn,
            styles.ctrlBtnPrimary,
            (isLoading || isIdentifyingLocal || totalCaptures < MIN_ROUND1) &&
            styles.ctrlBtnDisabled,
          ]}
          onPress={handleStopAndIdentify}
          disabled={isLoading || isIdentifyingLocal || totalCaptures < MIN_ROUND1}
          activeOpacity={0.8}
        >
          {isLoading || isIdentifyingLocal ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <>
              <Icon name="check-circle" size={22} color="#000000" />
              <Text style={styles.ctrlBtnText}>
                Nhận diện ({totalCaptures} góc)
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  const nativeHudActive = TreeReIDBridge.isAvailable() && isCaptureActive && !identResult;

  return (
    <View style={styles.container}>
      {/* Header (vùng đen) */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={1}
          // M4 (ẩn): giữ tiêu-đề ~1s để mở chọn matcher vỏ-thân (tester).
          onLongPress={() => setShowMatcherPicker(true)}
          delayLongPress={900}
        >
          <Text style={styles.headerTitle}>Nhận diện cây</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {matcher && (
            <View style={styles.matcherChip} accessibilityLabel={`Matcher ${matcher}`}>
              <Text style={styles.matcherChipText}>{matcher}</Text>
            </View>
          )}
        </View>
      </View>

      {identResult ? (
        /* Result panel (nền đục, đọc rõ) */
        renderResultPanel()
      ) : (
        <>
          {/* ══ VÙNG GIỮA: CAMERA ══ */}
          <View style={styles.cameraZone}>
            {TreeReIDBridge.isAvailable() && isCaptureActive && NativeCameraPreview ? (
              <NativeCameraPreview style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Icon
                  name={
                    Platform.OS === 'android' && !TreeReIDBridge.isAvailable()
                      ? 'camera-outline'
                      : 'camera-enhance-outline'
                  }
                  size={64}
                  color="rgba(255,255,255,0.35)"
                />
                <Text style={styles.previewPlaceholderText}>
                  {Platform.OS === 'android' && !TreeReIDBridge.isAvailable()
                    ? 'Bấm "Chụp ảnh" bên dưới'
                    : 'Bấm "Bắt đầu" để mở camera'}
                </Text>
              </View>
            )}
            {/* Nháy "chụp" dịu — chỉ trong khung camera */}
            {nativeHudActive && <CaptureFlash count={totalCaptures} />}
          </View>
          {nativeHudActive && (
            <View style={styles.topZone}>
              <CompassHologram heading={heading} />
              <View style={styles.zoneDivider} />
              <TiltZone pitch={pitch} roll={roll} yaw={heading} />
            </View>
          )}
          {/* ══ VÙNG DƯỚI (đen): LƯỢT + SỐ ẢNH + hướng dẫn ══ */}
          <View style={styles.bottomZone}>
            {nativeHudActive && (
              <View style={styles.bottomRow}>
                <View style={styles.roundGroup}>
                  <View
                    style={[
                      styles.roundChip,
                      currentRoundLocal === 1 && styles.roundChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roundChipText,
                        currentRoundLocal === 1 && styles.roundChipTextActive,
                      ]}
                    >
                      Lượt 1: Thân
                    </Text>
                    <Text
                      style={[
                        styles.roundChipCount,
                        currentRoundLocal === 1 && styles.roundChipCountActive,
                      ]}
                    >
                      {round1Count}/{MIN_ROUND1}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.roundChip,
                      currentRoundLocal === 2 && styles.roundChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roundChipText,
                        currentRoundLocal === 2 && styles.roundChipTextActive,
                      ]}
                    >
                      Lượt 2: Gốc
                    </Text>
                    <Text
                      style={[
                        styles.roundChipCount,
                        currentRoundLocal === 2 && styles.roundChipCountActive,
                      ]}
                    >
                      {round2Count}/{MIN_ROUND2}
                    </Text>
                  </View>
                </View>

                <PhotoCount count={totalCaptures} shouldCapture={shouldCapture} />
              </View>
            )}

            {/* Hướng dẫn */}
            <View style={styles.guidanceRow}>
              <Icon name="information-outline" size={16} color={CAM} />
              <Text style={styles.guidanceText}>{getGuidance()}</Text>
            </View>
          </View>

          {/* Controls */}
          {renderControls()}
        </>
      )}

      {/* Loading overlay khi đang identify */}
      {(isIdentifyingLocal || isIdentifyingRedux) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.overlayText}>Đang nhận diện cây...</Text>
        </View>
      )}

      {/* UNCERTAIN dialog — map TreeCandidate → ReidCandidate */}
      <ReidConfirmDialog
        visible={showConfirm}
        context="tree"
        candidates={
          (identResult?.candidates ?? []).map(
            (c): ReidCandidate => ({
              id: c.tree_id,
              name: c.name ?? '',
              code: c.code ?? undefined,
              sim: (c as any).sim,
              near_prev: c.near_prev,
              has3d: c.has3d,
              anchor: c.anchor ?? undefined,
            }),
          )
        }
        onSelect={handleSelectCandidate}
        onDismiss={() => setShowConfirm(false)}
        allowNew={identResult?.allow_enroll_new !== false}
        suggestText={identResult?.suggest}
      />

      {/* M3: bộ chọn "cây khác" (correct_tid từ /api/trees) */}
      <Modal
        visible={showTreePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTreePicker(false)}
        statusBarTranslucent
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Chọn cây đúng</Text>
              <TouchableOpacity
                onPress={() => setShowTreePicker(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Đóng"
                accessibilityRole="button"
              >
                <Icon name="close" size={20} color={NEUTRAL.textMuted} />
              </TouchableOpacity>
            </View>

            {isLoadingPicker ? (
              <View style={styles.pickerCenter}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.pickerHint}>Đang tải danh sách cây...</Text>
              </View>
            ) : pickerError ? (
              <View style={styles.pickerCenter}>
                <Icon name="alert-circle-outline" size={36} color={NEUTRAL.textMuted} />
                <Text style={styles.pickerHint}>{pickerError}</Text>
                <TouchableOpacity
                  style={styles.pickerRetry}
                  onPress={handleOpenTreePicker}
                  activeOpacity={0.7}
                >
                  <Icon name="refresh" size={15} color={COLORS.accent} />
                  <Text style={styles.pickerRetryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : pickerTrees.length === 0 ? (
              <View style={styles.pickerCenter}>
                <Icon name="tree-outline" size={36} color={NEUTRAL.textMuted} />
                <Text style={styles.pickerHint}>Chưa có cây nào trong vườn.</Text>
              </View>
            ) : (
              <FlatList
                data={pickerTrees}
                keyExtractor={t => t.tree_id}
                style={styles.pickerList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => handlePickCorrectTree(item.tree_id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn cây ${item.name || 'Không tên'}`}
                  >
                    <Icon name="tree" size={20} color="#1b5e20" />
                    <View style={styles.pickerRowBody}>
                      <Text style={styles.pickerRowName} numberOfLines={1}>
                        {item.name || 'Không tên'}
                      </Text>
                      {(item.code ?? null) && (
                        <Text style={styles.pickerRowSub} numberOfLines={1}>
                          Mã: {item.code}
                        </Text>
                      )}
                    </View>
                    <Icon name="chevron-right" size={20} color={NEUTRAL.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}

            {/* LỐI THOÁT: không cây nào trong danh sách là đúng → ĐÂY LÀ CÂY MỚI.
                Thiếu lối này thì khi server khớp NHẦM, user KẸT không tạo được cây
                mới nào nữa (field Giang 13/07). */}
            {!isLoadingPicker && !pickerError && (
              <TouchableOpacity
                style={styles.pickerNewBtn}
                onPress={handleRegisterNewFromMatch}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Đây là cây mới, đăng ký cây mới"
              >
                <Icon name="plus-circle" size={20} color="#1b5e20" />
                <View style={styles.pickerRowBody}>
                  <Text style={styles.pickerNewTitle}>Đây là cây mới</Text>
                  <Text style={styles.pickerRowSub}>
                    Không phải cây nào ở trên — đăng ký thành cây mới
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color="#1b5e20" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* M4 (ẩn): chọn matcher vỏ-thân — tester */}
      <Modal
        visible={showMatcherPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMatcherPicker(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.matcherOverlay}
          activeOpacity={1}
          onPress={() => setShowMatcherPicker(false)}
        >
          <View style={styles.matcherSheet}>
            <Text style={styles.matcherTitle}>Matcher vỏ-thân (tester)</Text>
            <Text style={styles.matcherSub}>
              Ép thuật-toán khớp cho lần nhận diện sau. Mặc-định dùng cấu-hình máy chủ.
            </Text>
            {(['sift', 'xfeat', 'loftr'] as ShellMatcher[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.matcherOption, matcher === m && styles.matcherOptionActive]}
                onPress={() => {
                  setMatcher(m);
                  setShowMatcherPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.matcherOptionText,
                    matcher === m && styles.matcherOptionTextActive,
                  ]}
                >
                  {m}
                </Text>
                {matcher === m && <Icon name="check" size={16} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.matcherOption, matcher === null && styles.matcherOptionActive]}
              onPress={() => {
                setMatcher(null);
                setShowMatcherPicker(false);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.matcherOptionText,
                  matcher === null && styles.matcherOptionTextActive,
                ]}
              >
                Mặc-định (máy chủ)
              </Text>
              {matcher === null && <Icon name="check" size={16} color={COLORS.accent} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------------
// ConfidenceBandView — băng tin-cậy THÔ (M2): cao/vừa/thấp, KHÔNG điểm số
// ---------------------------------------------------------------------------

const BAND_META: Record<ConfidenceBand, { label: string; color: string; bg: string; icon: string }> = {
  cao: { label: 'Tin cậy cao', color: '#1b5e20', bg: '#e8f5e9', icon: 'shield-check' },
  'vừa': { label: 'Tin cậy vừa', color: '#e65100', bg: '#fff3e0', icon: 'shield-half-full' },
  'thấp': { label: 'Tin cậy thấp', color: '#c62828', bg: '#ffebee', icon: 'shield-alert' },
};

const ConfidenceBandView: React.FC<{ band: ConfidenceBand }> = ({ band }) => {
  const m = BAND_META[band];
  return (
    <View
      style={[styles.bandBox, { backgroundColor: m.bg }]}
      accessible
      accessibilityLabel={m.label}
    >
      <Icon name={m.icon} size={18} color={m.color} />
      <Text style={[styles.bandText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// HUD — hologram tokens dùng chung cho compass / tilt / capture
// ---------------------------------------------------------------------------

// Palette CHỤP ẢNH: CAM / ĐEN / TRẮNG — tương phản cao, gọn gàng.
const CAM = "#4d8bdc";                       // cam nhấn (điểm nhìn chính)
const CAM_DIM = 'rgba(0, 174, 255, 0.46)';
const HUD_BORDER = 'rgba(255,255,255,0.16)'; // viền trắng mờ, gọn
const PANEL_BG = '#0B0D0C';                  // nền 3 VÙNG đen (đồng đều)

const CARDINALS_FULL = [
  'Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc',
] as const;

// La bàn (kiểu iPhone): mặt phẳng, bán kính nhỏ (đường kính = chiều cao zone góc).
// Vạch chia 6°/vạch, BỎ vạch ở 4 điểm B/Đ/N/T (chỉ ghi chữ để không đè). Mũi trỏ
// cam cố định ở đỉnh.
const DIAL_SIZE = 95;
const DIAL_C = DIAL_SIZE / 2;
const DIAL_TICKS = Array.from({ length: 60 }, (_, i) => i * 6).filter(a => a % 90 !== 0);
const WIND_R = 35; // bán kính đặt chữ hướng
const WIND_DEFS = [
  { t: 'B', a: 0 }, { t: 'Đ', a: 90 }, { t: 'N', a: 180 }, { t: 'T', a: 270 },
];
const WINDS = WIND_DEFS.map(w => {
  const rad = (w.a * Math.PI) / 180;
  return {
    ...w,
    x: DIAL_C + WIND_R * Math.sin(rad) - 9, // box rộng 18 → lệch nửa
    y: DIAL_C - WIND_R * Math.cos(rad) - 8, // box cao 16 → lệch nửa
  };
});

// ---------------------------------------------------------------------------
// CompassHologram — la bàn kiểu iPhone: mặt đĩa phẳng nhiều lớp (có chiều sâu),
// VÀNH XOAY ngược theo heading + mũi trỏ đỏ cố định ở đỉnh; thông số hướng gom
// vào 1 zone (giống zone độ nghiêng). Thuần Animated + transform.
// ---------------------------------------------------------------------------

const CompassHologram: React.FC<{ heading: number | null }> = ({ heading }) => {
  const rot = useRef(new Animated.Value(0)).current;   // góc vành liên-tục (unwrap)
  const contRef = useRef(0);
  const prevRef = useRef<number | null>(null);

  // Vành xoay NGƯỢC heading (−heading) để hướng thực nằm dưới mũi trỏ đỉnh.
  // Đi theo đường ngắn nhất để không giật khi qua mốc 0°/360°.
  useEffect(() => {
    if (heading == null) return;
    const target = (((-heading % 360) + 360) % 360);
    const prev = prevRef.current;
    if (prev == null) {
      contRef.current = target;
      rot.setValue(target);
      prevRef.current = target;
      return;
    }
    let d = target - prev;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    contRef.current += d;
    prevRef.current = target;
    Animated.timing(rot, {
      toValue: contRef.current,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [heading, rot]);

  const dialSpin = rot.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const deg = heading == null ? null : (((Math.round(heading) % 360) + 360) % 360);
  const idx = deg == null ? 0 : Math.round(deg / 45) % 8;
  const fullName = deg == null ? '--' : CARDINALS_FULL[idx];

  return (
    <View style={styles.compassBlock} pointerEvents="none">
      {/* ── Đĩa la bàn ── */}
      <View style={styles.dial}>
        {/* Lớp nền tạo chiều sâu */}
        <View style={styles.dialFace} />
        <View style={styles.dialRingOuter} />

        {/* Vành xoay: vạch chia (bỏ ở B/Đ/N/T) + chữ hướng */}
        <Animated.View style={[styles.dialRotor, { transform: [{ rotate: dialSpin }] }]}>
          {DIAL_TICKS.map(a => (
            <View
              key={a}
              style={[styles.dTickSlot, { transform: [{ rotate: `${a}deg` }] }]}
            >
              <View style={[styles.dTick, a % 30 === 0 && styles.dTickMajor]} />
            </View>
          ))}
          {WINDS.map(w => (
            <Text
              key={w.t}
              style={[styles.windLabel, { left: w.x, top: w.y }, w.a === 0 && styles.windLabelN]}
            >
              {w.t}
            </Text>
          ))}
        </Animated.View>

        {/* Mũi trỏ cam cố định ở đỉnh */}
        <View style={styles.dialPointer} />

        {/* Số độ ở tâm (cố định, không xoay) */}
        <View style={styles.dialCenter}>
          <Text style={styles.dialDeg}>{deg == null ? '--' : `${deg}°`}</Text>
        </View>
      </View>

      <Text style={styles.compassCaption} numberOfLines={1}>{fullName}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// TiltZone — đo độ nghiêng kiểu iPhone: bọt nước (Roll↔X, Pitch↕Y) + 3 chỉ số
// Pitch (ngửa/cúi) · Roll (nghiêng T/P) · Yaw (xoay trục đứng ≈ heading).
// ---------------------------------------------------------------------------

const LEVEL_EPS = 3;         // ngưỡng coi như "cân bằng" (±3°)
const BUBBLE_TRAVEL = 34;    // px bọt di chuyển tối đa

const tiltHint = (v: number | null, pos: string, neg: string): string => {
  if (v == null) return '';
  if (Math.abs(v) < LEVEL_EPS) return 'Cân';
  return v > 0 ? pos : neg;
};

const TiltRow: React.FC<{
  label: string;
  value: number | null;
  hint: string;
}> = ({ label, value, hint }) => (
  <View style={styles.tiltRow}>
    <Text style={styles.tiltRowLabel}>{label}</Text>
    <Text style={styles.tiltRowVal}>{value == null ? '--' : `${Math.round(value)}°`}</Text>
    {!!hint && <Text style={styles.tiltRowHint}>{hint}</Text>}
  </View>
);

const TiltZone: React.FC<{
  pitch: number | null;
  roll: number | null;
  yaw: number | null;
}> = ({ pitch, roll, yaw }) => {
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const clamp = (v: number) => Math.max(-BUBBLE_TRAVEL, Math.min(BUBBLE_TRAVEL, v));
    const nx = roll == null ? 0 : clamp((roll / 45) * BUBBLE_TRAVEL);
    const ny = pitch == null ? 0 : clamp((pitch / 45) * BUBBLE_TRAVEL);
    Animated.spring(tx, { toValue: nx, useNativeDriver: true, friction: 6, tension: 55 }).start();
    Animated.spring(ty, { toValue: ny, useNativeDriver: true, friction: 6, tension: 55 }).start();
  }, [pitch, roll, tx, ty]);

  const level =
    pitch != null &&
    roll != null &&
    Math.abs(pitch) < LEVEL_EPS &&
    Math.abs(roll) < LEVEL_EPS;

  return (
    <View style={styles.tiltWrap} pointerEvents="none">
      <View style={[styles.tiltCircle, level && styles.tiltCircleLevel]}>
        <View style={styles.crossH} />
        <View style={styles.crossV} />
        <View style={[styles.tiltTarget, level && styles.tiltTargetLevel]} />
        <Animated.View
          style={[
            styles.bubble,
            level && styles.bubbleLevel,
            { transform: [{ translateX: tx }, { translateY: ty }] },
          ]}
        />
      </View>
      <View style={styles.tiltReadouts}>
        <TiltRow label="Ngẩng" value={pitch} hint={tiltHint(pitch, 'Cúi', 'Ngửa')} />
        <TiltRow label="Nghiêng" value={roll} hint={tiltHint(roll, 'Phải', 'Trái')} />
        <TiltRow label="Xoay" value={yaw} hint="" />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// CaptureFlash — nháy màn "chụp" dịu, chỉ phủ trong khung camera (auto-capture)
// ---------------------------------------------------------------------------

const CaptureFlash: React.FC<{ count: number }> = ({ count }) => {
  const flash = useRef(new Animated.Value(0)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.26, duration: 90, useNativeDriver: true }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevCount.current = count;
  }, [count, flash]);

  return (
    <Animated.View pointerEvents="none" style={[styles.captureFlash, { opacity: flash }]} />
  );
};

// ---------------------------------------------------------------------------
// PhotoCount — bộ đếm số ảnh (nảy nhẹ mỗi lần chụp), đặt ở vùng dưới
// ---------------------------------------------------------------------------

const PhotoCount: React.FC<{ count: number; shouldCapture: boolean }> = ({
  count,
  shouldCapture,
}) => {
  const pop = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      Animated.sequence([
        Animated.spring(pop, { toValue: 1.28, useNativeDriver: true, friction: 4, tension: 140 }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }),
      ]).start();
    }
    prevCount.current = count;
  }, [count, pop]);

  return (
    <Animated.View
      style={[
        styles.counterPill,
        shouldCapture && styles.counterPillHot,
        { transform: [{ scale: pop }] },
      ]}
    >
      <Icon name="camera-iris" size={18} color={CAM} />
      <Text style={styles.counterNum}>{count}</Text>
      <Text style={styles.counterLabel}>ảnh</Text>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEADER_BG = '#1b5e20';   // brand xanh module cây (đồng bộ ResultBadge MATCH — panel kết quả)

// Đổ bóng nhẹ — chiều sâu hiện đại, đồng bộ token shadow.
const cardShadow = {
  shadowColor: '#0F1614',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PANEL_BG },

  // ── 3 VÙNG chính (đồng đều): trên đen · camera · dưới đen ──────────────────
  topZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PANEL_BG,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  zoneDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cameraZone: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomZone: {
    backgroundColor: PANEL_BG,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  roundGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PANEL_BG,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    color: NEUTRAL.white,
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: { width: 40, alignItems: 'flex-end' },

  previewPlaceholder: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  previewPlaceholderText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
  },

  roundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  roundChipActive: {
    backgroundColor: CAM,
    borderColor: CAM,
  },
  roundChipText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  roundChipTextActive: { color: '#000000', fontWeight: '700' },
  roundChipCount: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '700' },
  roundChipCountActive: { color: '#000000' },

  guidanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guidanceText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 18 },

  // Result panel — nền đục để đọc rõ trên nền camera tối
  resultPanel: {
    flex: 1,
    backgroundColor: NEUTRAL.bgSoft,
  },
  resultPanelContent: {
    padding: 16,
    gap: 12,
  },
  matchDetail: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 8,
    ...cardShadow,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchLabel: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    width: 72,
  },
  matchValue: {
    fontSize: 13,
    fontWeight: '600',
    color: NEUTRAL.text,
    flex: 1,
  },
  factorToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 4,
  },
  factorToggleText: {
    fontSize: 13,
    color: NEUTRAL.textSub,
  },

  actionGroup: { gap: 8 },
  movedHint: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    lineHeight: 18,
  },
  movedDist: {
    fontWeight: '700',
    color: '#1565c0',
  },
  noMatchHint: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    lineHeight: 18,
  },
  suggestBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: NEUTRAL.bgWarm,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  suggestText: {
    flex: 1,
    fontSize: 13,
    color: NEUTRAL.text,
    lineHeight: 18,
  },
  decisionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  btnGreen: { backgroundColor: HEADER_BG },
  btnBlue: { backgroundColor: '#1565c0' },
  // Viền xanh (phụ) — lối thoát "không phải cây này" ở luồng MATCH: rõ nhưng KHÔNG
  // tranh vai với hành-động chính, tránh user bấm nhầm tạo cây trùng.
  btnOutlineGreen: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1.5,
    borderColor: '#1b5e20',
  },
  decisionBtnText: {
    color: NEUTRAL.white,
    fontSize: 15,
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryBtnText: {
    fontSize: 13,
    color: NEUTRAL.textSub,
  },

  // Controls — thanh dưới đen mờ, nút chính CAM, nút phụ viền CAM (đồng bộ chụp)
  controls: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: PANEL_BG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  ctrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctrlBtnPrimary: { backgroundColor: CAM },
  ctrlBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: CAM,
  },
  ctrlBtnDisabled: { opacity: 0.4 },
  ctrlBtnText: { color: '#000000', fontSize: 15, fontWeight: '700' },
  ctrlBtnSecText: { color: CAM, fontSize: 15, fontWeight: '700' },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  overlayText: {
    marginTop: 14,
    color: NEUTRAL.white,
    fontSize: 15,
    fontWeight: '500',
  },

  // ── M4 matcher chip (header) ──────────────────────────────────────────────
  matcherChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  matcherChipText: {
    color: NEUTRAL.white,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // ── M2 confidence band ────────────────────────────────────────────────────
  bandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bandText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── M3 verdict ────────────────────────────────────────────────────────────
  verdictBox: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 10,
    ...cardShadow,
  },
  verdictTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  verdictRow: {
    flexDirection: 'row',
    gap: 8,
  },
  verdictBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  verdictCorrect: { borderColor: '#1b5e20', backgroundColor: '#e8f5e9' },
  verdictWrong: { borderColor: '#c62828', backgroundColor: '#ffebee' },
  verdictOther: { borderColor: '#5c6bc0', backgroundColor: '#e8eaf6' },
  verdictBtnText: { fontSize: 13, fontWeight: '700' },
  verdictDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  verdictDoneText: {
    fontSize: 13,
    color: '#1b5e20',
    fontWeight: '600',
    flex: 1,
  },
  verdictSending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verdictSendingText: {
    fontSize: 12,
    color: NEUTRAL.textSub,
  },

  // ── M3 tree picker (correct_tid) ──────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: NEUTRAL.text,
  },
  pickerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  pickerHint: {
    fontSize: 14,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  pickerRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pickerRetryText: {
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: '600',
  },
  pickerList: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  pickerRowBody: { flex: 1 },
  pickerRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  pickerRowSub: {
    fontSize: 11,
    color: NEUTRAL.textMuted,
    marginTop: 1,
  },
  // Lối thoát "Đây là cây mới" — nổi bật, tách khỏi danh sách cây đã có.
  pickerNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1b5e20',
    backgroundColor: '#e8f5e9',
  },
  pickerNewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1b5e20',
  },

  // ── M4 matcher picker ─────────────────────────────────────────────────────
  matcherOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  matcherSheet: {
    width: '100%',
    backgroundColor: NEUTRAL.bg,
    borderRadius: 16,
    padding: 18,
    gap: 4,
  },
  matcherTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: NEUTRAL.text,
  },
  matcherSub: {
    fontSize: 12,
    color: NEUTRAL.textMuted,
    lineHeight: 17,
    marginBottom: 8,
  },
  matcherOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    marginTop: 6,
  },
  matcherOptionActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(59,110,168,0.08)',
  },
  matcherOptionText: {
    fontSize: 15,
    color: NEUTRAL.text,
    fontWeight: '600',
  },
  matcherOptionTextActive: {
    color: COLORS.accent,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Compass (kiểu iPhone) — đĩa phẳng nhiều lớp, đặt trong VÙNG TRÊN
  // ═══════════════════════════════════════════════════════════════════════════
  compassBlock: {
    alignItems: 'center',
    gap: 4,
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lớp nền tối tạo cảm giác "lõm sâu" của mặt la bàn.
  dialFace: {
    position: 'absolute',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_C,
    backgroundColor: 'rgba(0,0,0,0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dialRingOuter: {
    position: 'absolute',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_C,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  dialRotor: {
    position: 'absolute',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
  },
  dTickSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
  },
  dTick: {
    width: StyleSheet.hairlineWidth,
    height: 3.5,
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dTickMajor: {
    width: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  windLabel: {
    position: 'absolute',
    width: 18,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  windLabelN: {
    color: CAM,
    fontWeight: '700',
  },
  // Số độ ở tâm (cố định, không xoay)
  dialCenter: {
    position: 'absolute',
    top: DIAL_C - 11,
    left: DIAL_C - 22,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialDeg: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  // Mũi trỏ cam cố định ở đỉnh (tam giác trỏ xuống)
  dialPointer: {
    position: 'absolute',
    top: -1,
    left: DIAL_C - 5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: CAM,
  },
  compassCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    maxWidth: DIAL_SIZE + 20,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Capture: nháy trong khung camera + bộ đếm số ảnh (vùng dưới)
  // ═══════════════════════════════════════════════════════════════════════════
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: HUD_BORDER,
  },
  counterPillHot: {
    borderColor: CAM_DIM,
    backgroundColor: 'rgba(255,122,0,0.12)',
  },
  counterNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tilt (iPhone-level) — bọt nước + Pitch/Roll/Yaw, đặt trong VÙNG TRÊN
  // ═══════════════════════════════════════════════════════════════════════════
  tiltWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tiltCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tiltCircleLevel: {
    borderColor: CAM,
    shadowColor: CAM,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  crossH: {
    position: 'absolute',
    width: 76,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    height: 76,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tiltTarget: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  tiltTargetLevel: {
    borderColor: CAM,
  },
  bubble: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(255,255,255,0.6)',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  bubbleLevel: {
    backgroundColor: CAM,
    shadowColor: CAM,
  },
  tiltReadouts: {
    gap: 3,
  },
  tiltRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 104,
  },
  tiltRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: CAM,
    width: 34,
  },
  tiltRowVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
  },
  tiltRowHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
});

export default TreeIdentityScreen;
