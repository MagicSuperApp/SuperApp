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
import { ensureOrilifeToken } from '../services/orilifeDidAuth';
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
import { ORILIFE_API_BASE_URL } from '@env';
const BASE_URL: string =
  (ORILIFE_API_BASE_URL as string | undefined) ?? 'https://test.orilife.io';

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
  idle:      'Bấm "Bắt đầu" để nhận diện cây.',
  round1:    'Đi vòng quanh cây, lia chậm để lấy đủ góc.',
  round2:    'Đứng SÁT GỐC, chĩa ống kính LÊN — lấy rõ vỏ gốc, sẹo, chạc cây.',
  needMore:  'Xoay thêm một chút nữa để lấy góc mới.',
  captured:  'Đã lấy một góc — tiếp tục lia.',
  sufficient:'Đủ để nhận rồi. Bấm "Lượt 2: Cận gốc" để tăng độ chính xác.',
  android:   'Bấm "Chụp ảnh" để thêm góc nhìn (tối thiểu 4 ảnh).',
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
        TreeReIDBridge.stopCaptureSession().catch(() => {});
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
      Alert.alert(
        'Lỗi đăng nhập',
        'Không đăng nhập được dịch vụ nhận diện (PhoenixKey). Kiểm tra danh tính/mạng rồi thử lại.',
      );
      setIsIdentifyingLocal(false);
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
    const { decision, name, code, similarity, margin, factors, moved_distance_m, confidence } =
      identResult as IdentifyResponse & {
        similarity?: number;
        margin?: number;
        factors?: FactorScores;
      };

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

        {/* NO_MATCH / EMPTY_BUCKET: đăng ký mới */}
        {(decision === 'NO_MATCH' || decision === 'EMPTY_BUCKET') && (
          <View style={styles.actionGroup}>
            <Text style={styles.noMatchHint}>
              {decision === 'EMPTY_BUCKET'
                ? 'Chưa có cây nào gần vị trí này.'
                : 'Cây chưa được đăng ký trong hệ thống.'}
            </Text>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.btnGreen]}
              onPress={handleRegisterNew}
              activeOpacity={0.8}
            >
              <Icon name="plus-circle" size={18} color={NEUTRAL.white} />
              <Text style={styles.decisionBtnText}>Đăng ký cây mới</Text>
            </TouchableOpacity>
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
            <Icon name="camera-plus" size={22} color="#1b5e20" />
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
              <ActivityIndicator color={NEUTRAL.white} />
            ) : (
              <>
                <Icon name="magnify" size={22} color={NEUTRAL.white} />
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
              <ActivityIndicator color={NEUTRAL.white} />
            ) : (
              <>
                <Icon name="camera-enhance" size={22} color={NEUTRAL.white} />
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
            <Icon name="arrow-right-bold" size={22} color="#1b5e20" />
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
            <ActivityIndicator color={NEUTRAL.white} />
          ) : (
            <>
              <Icon name="check-circle" size={22} color={NEUTRAL.white} />
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
  return (
    <View style={styles.container}>
      {/* Header */}
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
          <Icon name="leaf" size={19} color={NEUTRAL.white} />
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

      {/* Camera preview (native iOS+Android) or placeholder */}
      <View style={styles.preview}>
        {TreeReIDBridge.isAvailable() && isCaptureActive && NativeCameraPreview ? (
          <NativeCameraPreview style={styles.previewNative} />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Icon
              name={
                Platform.OS === 'android' && !TreeReIDBridge.isAvailable()
                  ? 'camera-outline'
                  : 'camera-enhance-outline'
              }
              size={56}
              color={NEUTRAL.textMuted}
            />
            <Text style={styles.previewPlaceholderText}>
              {Platform.OS === 'android' && !TreeReIDBridge.isAvailable()
                ? 'Bấm "Chụp ảnh" bên dưới'
                : 'Bấm "Bắt đầu" để mở camera'}
            </Text>
          </View>
        )}
      </View>

      {/* Sensor bar (iOS only, khi đang chụp) */}
      {TreeReIDBridge.isAvailable() && isCaptureActive && !identResult && (
        <View style={styles.sensorBar}>
          <View style={styles.sensorItem}>
            <Icon name="compass" size={17} color={COLORS.accent} />
            <Text style={styles.sensorLabel}>Hướng</Text>
            <Text style={styles.sensorVal}>
              {heading !== null ? `${Math.round(heading)}°` : '--'}
            </Text>
          </View>
          <View style={styles.sensorItem}>
            <Icon name="phone-rotate-portrait" size={17} color={COLORS.accent} />
            <Text style={styles.sensorLabel}>Nghiêng</Text>
            <Text style={styles.sensorVal}>
              {pitch !== null ? `${Math.round(pitch)}°` : '--'}
            </Text>
          </View>
          <View style={styles.sensorItem}>
            <Icon name="image-multiple" size={17} color={COLORS.accent} />
            <Text style={styles.sensorLabel}>Góc</Text>
            <Text style={styles.sensorVal}>{totalCaptures}</Text>
          </View>
        </View>
      )}

      {/* Round indicator (iOS, khi đang chụp) */}
      {TreeReIDBridge.isAvailable() && isCaptureActive && !identResult && (
        <View style={styles.roundBar}>
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
      )}

      {/* Guidance */}
      {!identResult && (
        <View style={styles.guidanceBox}>
          <Icon name="information-outline" size={16} color={HEADER_BG} />
          <Text style={styles.guidanceText}>{getGuidance()}</Text>
        </View>
      )}

      {/* Result panel */}
      {renderResultPanel()}

      {/* Controls */}
      {renderControls()}

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
  cao:  { label: 'Tin cậy cao',  color: '#1b5e20', bg: '#e8f5e9', icon: 'shield-check' },
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
// Styles
// ---------------------------------------------------------------------------

const HEADER_BG = '#1b5e20';   // brand xanh module cây (đồng bộ ResultBadge MATCH)
const GREEN_TINT = '#e8f5e9';  // nền mềm cho badge/guidance

// Đổ bóng nhẹ — chiều sâu hiện đại, đồng bộ token shadow.
const cardShadow = {
  shadowColor: '#0F1614',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bgSoft },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
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
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    color: NEUTRAL.white,
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: { width: 40, alignItems: 'flex-end' },

  preview: {
    // GỐC bug "1/3 màn": trước đây height:240 CỐ-ĐỊNH → thẻ ống-kính ghim 240px, trên máy cao
    // chỉ chiếm ~1/4-1/3 (camera là 1 HÀNG trong cột dọc header+preview+bar+nút). flex:1 → thẻ
    // GIÃN lấp không-gian còn lại (camera chiếm phần lớn màn), GIỮ bo-góc/margin/shadow.
    // FULL edge-to-edge (camera nền + control overlay) = việc Thư (xem PR body), cần verify device.
    flex: 1,
    minHeight: 240,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0b0f0d',
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  previewNative: { flex: 1, width: '100%' },
  previewPlaceholder: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  previewPlaceholderText: {
    color: NEUTRAL.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },

  sensorBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  sensorItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 10,
    backgroundColor: NEUTRAL.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  sensorLabel: { fontSize: 11, color: NEUTRAL.textMuted },
  sensorVal: { fontSize: 16, fontWeight: '700', color: NEUTRAL.text },

  roundBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  roundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  roundChipActive: {
    backgroundColor: HEADER_BG,
    borderColor: HEADER_BG,
  },
  roundChipText: { fontSize: 12, color: NEUTRAL.textSub, fontWeight: '600' },
  roundChipTextActive: { color: NEUTRAL.white },
  roundChipCount: { fontSize: 11, color: NEUTRAL.textMuted, fontWeight: '700' },
  roundChipCountActive: { color: 'rgba(255,255,255,0.85)' },

  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    backgroundColor: GREEN_TINT,
    borderRadius: 12,
  },
  guidanceText: { flex: 1, fontSize: 13, color: '#1b5e20', lineHeight: 18 },

  // Result panel
  resultPanel: {
    flex: 1,
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
  decisionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  btnGreen: { backgroundColor: HEADER_BG },
  btnBlue:  { backgroundColor: '#1565c0' },
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

  // Controls
  controls: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: NEUTRAL.card,
    borderTopWidth: 1,
    borderTopColor: NEUTRAL.border,
    shadowColor: '#0F1614',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
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
  ctrlBtnPrimary: { backgroundColor: HEADER_BG },
  ctrlBtnSecondary: {
    backgroundColor: NEUTRAL.card,
    borderWidth: 1.5,
    borderColor: HEADER_BG,
  },
  ctrlBtnDisabled: { opacity: 0.45 },
  ctrlBtnText: { color: NEUTRAL.white, fontSize: 15, fontWeight: '600' },
  ctrlBtnSecText: { color: HEADER_BG, fontSize: 15, fontWeight: '600' },

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
  verdictWrong:   { borderColor: '#c62828', backgroundColor: '#ffebee' },
  verdictOther:   { borderColor: '#5c6bc0', backgroundColor: '#e8eaf6' },
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
});

export default TreeIdentityScreen;
