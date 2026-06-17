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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
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
  type IdentifyResponse,
} from '../services/treeReIDService';
import ResultBadge from '../components/reid/ResultBadge';
import FactorBreakdown, { type FactorScores } from '../components/reid/FactorBreakdown';
import ReidConfirmDialog, { type ReidCandidate } from '../components/reid/ReidConfirmDialog';
import { useAppDispatch, useAppSelector } from '../store/hooks';
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

// BẮTT BUỘC guard: NativeCameraPreview chỉ tồn tại trên iOS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NativeCameraPreview =
  Platform.OS === 'ios'
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

const TreeIdentityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();

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

  // Android: captures tự quản lý cục bộ bằng mảng uri ảnh
  const [androidImageUris, setAndroidImageUris] = useState<string[]>([]);

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

  // ── Native event subscriptions (iOS only) ────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const unsubHeading = subscribeHeadingUpdate((e: HeadingUpdate) => {
      setHeading(e.heading);
      setPitch(e.pitch);
      setShouldCapture(e.shouldCapture);
    });

    const unsubCapture = subscribeCaptureTriggered((_e: CaptureTriggered) => {
      // capture event — native side đã lưu file
    });

    const unsubRound = subscribeRoundComplete((e: RoundComplete) => {
      const nextRound = (e.nextRound as 1 | 2) ?? 2;
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
      // Không clearAll vì TreeEnrollScreen cần dùng captures từ redux
    };
  }, []);

  // ── Derive local capture counts ───────────────────────────────────────────
  const round1Count = capturesRedux.filter(c => c.round === 1).length;
  const round2Count = capturesRedux.filter(c => c.round === 2).length;
  const totalCaptures =
    Platform.OS === 'ios' ? capturesRedux.length : androidImageUris.length;

  // ── Guidance text ─────────────────────────────────────────────────────────
  const getGuidance = (): string => {
    if (identResult) return '';
    if (Platform.OS === 'android') return GUIDANCE.android;
    if (!isCaptureActive) return GUIDANCE.idle;
    if (totalCaptures === 0)
      return currentRoundLocal === 2 ? GUIDANCE.round2 : GUIDANCE.round1;
    if (shouldCapture) return GUIDANCE.needMore;
    if (currentRoundLocal === 1 && round1Count >= MIN_ROUND1)
      return GUIDANCE.sufficient;
    return GUIDANCE.captured;
  };

  // ── iOS: Start capture session ────────────────────────────────────────────
  const handleStartCapture = async () => {
    if (Platform.OS !== 'ios') return;

    if (!TreeReIDBridge.isAvailable()) {
      Alert.alert('Lỗi', 'Native module chưa sẵn sàng. Vui lòng cập nhật app.');
      return;
    }

    try {
      setIsLoading(true);
      dispatch(clearAll());
      const result = await TreeReIDBridge.startCaptureSession();
      setIsCaptureActive(true);
      setCurrentRoundLocal(result.round as 1 | 2);
      dispatch(setCapturing(true));
      dispatch(setCurrentRound(result.round as 1 | 2));
      setIdentResult(null);
    } catch {
      Alert.alert('Lỗi', 'Không thể bắt đầu chụp. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── iOS: Advance to round 2 ───────────────────────────────────────────────
  const handleAdvanceToRound2 = async () => {
    try {
      const result = await TreeReIDBridge.advanceToRound2();
      const nextRound = (result.round as 1 | 2) ?? 2;
      setCurrentRoundLocal(nextRound);
      dispatch(setCurrentRound(nextRound));
    } catch {
      // Không block user nếu lỗi advance
    }
  };

  // ── iOS: Stop capture + identify ─────────────────────────────────────────
  const handleStopAndIdentify = async () => {
    try {
      setIsLoading(true);
      const stopResult = await TreeReIDBridge.stopCaptureSession();
      setIsCaptureActive(false);
      dispatch(setCapturing(false));

      if (!stopResult || stopResult.captures.length < MIN_ROUND1) {
        Alert.alert(
          'Chưa đủ góc',
          `Cần ít nhất ${MIN_ROUND1} góc chụp. Hiện có ${stopResult?.captures.length ?? 0} góc.`,
        );
        return;
      }

      // Lưu captures vào redux
      for (const cap of stopResult.captures) {
        dispatch(addCapture(cap));
      }

      await runIdentify(stopResult.captures.map(c => `file://${c.fileURL}`));
    } catch {
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
    try {
      const result = await identifyTree(BASE_URL, imagePaths, {
        lat: gpsRedux?.lat,
        lon: gpsRedux?.lng,
        heading: heading ?? undefined,
        pitch: pitch ?? undefined,
      });

      if (result.ok && result.data) {
        const data = result.data;
        setIdentResult(data);
        dispatch(setIdentificationResult(data));

        if (data.decision === 'UNCERTAIN') {
          setShowConfirm(true);
        }
        // Các decision khác xử lý ở render / handleDecisionAction
      } else {
        Alert.alert('Lỗi nhận diện', result.error?.detail ?? 'Nhận diện thất bại. Thử lại.');
      }
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
        Platform.OS === 'ios'
          ? capturesRedux.map(c => `file://${c.fileURL}`)
          : androidImageUris;

      const res = await verifyAddTree(BASE_URL, identResult.tree_id, imgs);

      if (res.ok) {
        Alert.alert('Đã cập nhật', 'Vị trí mới của cây đã được lưu.');
      } else {
        Alert.alert('Lỗi', res.error?.detail ?? 'Cập nhật thất bại.');
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
        androidImagePaths: Platform.OS === 'android' ? androidImageUris : undefined,
      });
      return;
    }
    // Xác nhận candidate → thêm góc nhìn vào cây đó
    try {
      setIsLoading(true);
      const imgs =
        Platform.OS === 'ios'
          ? capturesRedux.map(c => `file://${c.fileURL}`)
          : androidImageUris;

      const res = await verifyAddTree(BASE_URL, id, imgs);

      if (res.ok) {
        Alert.alert('Đã xác nhận', `Góc nhìn mới đã thêm vào cây.\nĐã thêm: ${res.data?.n_added ?? 0} góc.`);
      } else {
        Alert.alert('Lỗi', res.error?.detail ?? 'Xác nhận thất bại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Đăng ký cây mới (NO_MATCH / EMPTY_BUCKET) ────────────────────────────
  const handleRegisterNew = () => {
    navigation.navigate('TreeEnroll', {
      androidImagePaths: Platform.OS === 'android' ? androidImageUris : undefined,
    });
  };

  // ── Reset về trạng thái ban đầu ───────────────────────────────────────────
  const handleReset = () => {
    setIdentResult(null);
    setShowFactors(false);
    setAndroidImageUris([]);
    setCurrentRoundLocal(1);
    setIsCaptureActive(false);
    dispatch(clearAll());
  };

  // ── Render result panel ───────────────────────────────────────────────────
  const renderResultPanel = () => {
    if (!identResult) return null;
    const { decision, name, code, similarity, margin, factors, moved_distance_m } =
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

    if (Platform.OS === 'android') {
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
        <View style={styles.headerCenter}>
          <Icon name="leaf" size={19} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>Nhận diện cây</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Camera preview (iOS) or placeholder */}
      <View style={styles.preview}>
        {Platform.OS === 'ios' && isCaptureActive && NativeCameraPreview ? (
          <NativeCameraPreview style={styles.previewNative} />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Icon
              name={
                Platform.OS === 'android'
                  ? 'camera-outline'
                  : 'camera-enhance-outline'
              }
              size={56}
              color={NEUTRAL.textMuted}
            />
            <Text style={styles.previewPlaceholderText}>
              {Platform.OS === 'android'
                ? 'Bấm "Chụp ảnh" bên dưới'
                : 'Bấm "Bắt đầu" để mở camera'}
            </Text>
          </View>
        )}
      </View>

      {/* Sensor bar (iOS only, khi đang chụp) */}
      {Platform.OS === 'ios' && isCaptureActive && !identResult && (
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
      {Platform.OS === 'ios' && isCaptureActive && !identResult && (
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
            <Text style={styles.roundChipCount}>
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
            <Text style={styles.roundChipCount}>
              {round2Count}/{MIN_ROUND2}
            </Text>
          </View>
        </View>
      )}

      {/* Guidance */}
      {!identResult && (
        <View style={styles.guidanceBox}>
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
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEADER_BG = '#1b5e20';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle: {
    color: NEUTRAL.white,
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: { width: 38 },

  preview: {
    height: 220,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNative: { flex: 1, width: '100%' },
  previewPlaceholder: { alignItems: 'center', gap: 10 },
  previewPlaceholderText: {
    color: NEUTRAL.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },

  sensorBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: NEUTRAL.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  sensorItem: { alignItems: 'center', gap: 2 },
  sensorLabel: { fontSize: 11, color: NEUTRAL.textMuted },
  sensorVal: { fontSize: 16, fontWeight: '700', color: NEUTRAL.text },

  roundBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
    backgroundColor: NEUTRAL.bgSoft,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  roundChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    alignItems: 'center',
  },
  roundChipActive: {
    backgroundColor: HEADER_BG,
    borderColor: HEADER_BG,
  },
  roundChipText: { fontSize: 12, color: NEUTRAL.textSub, fontWeight: '600' },
  roundChipTextActive: { color: NEUTRAL.white },
  roundChipCount: { fontSize: 10, color: NEUTRAL.textMuted, marginTop: 1 },

  guidanceBox: {
    margin: 12,
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: HEADER_BG,
  },
  guidanceText: { fontSize: 13, color: '#1b5e20', lineHeight: 18 },

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
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 8,
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
});

export default TreeIdentityScreen;
