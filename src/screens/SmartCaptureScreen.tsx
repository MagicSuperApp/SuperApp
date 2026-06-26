import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS } from '../constants';
import { ScannerSDK, EVENTS } from '../scansdk';
import type {
  ScanCompleteData,
  ScanErrorData,
  UploadProgressData,
  ScannerOptions,
} from '../scansdk';

const TARGET_IMAGES = 8; // Circular capture: 8 sectors × 45°

// Số lần tối đa được bấm "Thử lại" cho lỗi tạm thời, tránh để nông dân
// bấm đi bấm lại vô tận khi gặp đúng một lỗi. Quá ngưỡng → chuyển sang
// thông báo có lối thoát rõ ràng.
const MAX_RETRY = 2;

/**
 * Nhận diện trường hợp "scanner trên máy chưa sẵn sàng" (native module chưa
 * có / chưa được tích hợp cho thiết bị này). ScannerSDK ném lỗi tiếng Anh
 * dạng "Native scanner module not available — ...". Chị Oanh không đọc được
 * tiếng Anh kỹ thuật nên tuyệt đối không hiện chuỗi này ra UI.
 */
const isScannerUnavailable = (message: string): boolean => {
  const s = (message || '').toLowerCase();
  return s.includes('module not available') || s.includes('not available');
};

/**
 * Đổi lỗi kỹ thuật (thường tiếng Anh, từ native) thành câu tiếng Việt thân
 * thiện để hiện cho nông dân. Không bao giờ trả về err.message thô.
 */
const friendlyScannerError = (message: string): string => {
  const s = (message || '').toLowerCase();
  if (s.includes('permission') || s.includes('camera')) {
    return 'App cần quyền dùng camera để nhận diện cây. Hãy bật quyền Camera trong Cài đặt rồi thử lại.';
  }
  if (s.includes('network') || s.includes('timeout') || s.includes('mạng')) {
    return 'Mạng yếu nên chưa mở được. Hãy kiểm tra kết nối rồi thử lại.';
  }
  return 'Chưa mở được phần nhận diện cây. Bạn vui lòng thử lại sau ít phút.';
};

interface SmartCaptureScreenParams {
  treeId?: string;
  farmId?: string;
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
  };
}

const SmartCaptureScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const params = (route.params as SmartCaptureScreenParams) || {};

  // State: Scan result
  // 'unavailable' = scanner native chưa sẵn sàng trên máy này → KHÔNG cho
  // bấm "Thử lại" (sẽ lặp đúng lỗi vô tận), chỉ cho lối thoát "Đóng".
  const [scanStatus, setScanStatus] = useState<'launching' | 'scanning' | 'uploading' | 'complete' | 'error' | 'unavailable'>('launching');
  const [treeIds, setTreeIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ progress: 0, total: 0 });
  // Đếm số lần đã bấm "Thử lại"; quá MAX_RETRY thì chuyển sang lối thoát.
  const [retryCount, setRetryCount] = useState(0);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const feedbackAnim = useRef(new Animated.Value(0)).current;

  // ── Request Camera Permission ────────────────────────────────────────────

  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      const allGranted = Object.values(granted).every(
        (v) => v === PermissionsAndroid.RESULTS.GRANTED,
      );
      return allGranted;
    } catch (err) {
      console.warn('[SmartCapture] Permission request failed:', err);
      return false;
    }
  };

  // ── Launch Native Scanner ────────────────────────────────────────────────

  // Giữ cleanup của lần quét đang chạy để: (a) gỡ listener cũ TRƯỚC khi quét lại
  // (tránh chồng listener mỗi lần "Quét lại"/"Thử lại"); (b) gỡ chắc chắn khi
  // unmount, kể cả khi unmount xảy ra TRƯỚC lúc launchNativeScanner resolve.
  const scannerCleanupRef = useRef<(() => void) | undefined>(undefined);

  const launchNativeScanner = useCallback(async () => {
    setScanStatus('launching');

    // 1. Request permissions
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      setScanStatus('error');
      setErrorMessage('Cần quyền Camera để quét cây.');
      return;
    }

    // 2. Subscribe to events BEFORE launching
    const scanCompleteSub = ScannerSDK.addListener(
      EVENTS.SCAN_COMPLETE,
      (data: ScanCompleteData) => {
        console.log('[SmartCapture] onScanComplete:', data);
        setTreeIds(data.treeIds || []);
        setScanStatus('complete');
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      },
    );

    const scanErrorSub = ScannerSDK.addListener(
      EVENTS.SCAN_ERROR,
      (data: ScanErrorData) => {
        console.log('[SmartCapture] onScanError:', data);
        const raw = data?.error ?? '';
        if (isScannerUnavailable(raw)) {
          setScanStatus('unavailable');
          setErrorMessage(null);
        } else {
          // Luôn map sang câu tiếng Việt thân thiện, không hiện lỗi thô.
          setScanStatus('error');
          setErrorMessage(friendlyScannerError(raw));
        }
      },
    );

    const uploadProgressSub = ScannerSDK.addListener(
      EVENTS.UPLOAD_PROGRESS,
      (data: UploadProgressData) => {
        console.log('[SmartCapture] uploadProgress:', data);
        setUploadProgress({ progress: data.progress, total: data.total });
        setScanStatus('uploading');
      },
    );

    // 3. Launch native scanner
    setScanStatus('scanning');

    const scannerOptions: ScannerOptions = {
      mode: 'circular',
      virtualId: params.treeId,
    };

    try {
      await ScannerSDK.startScanner(scannerOptions);
    } catch (err: any) {
      // Giữ log kỹ thuật cho lập trình viên, nhưng KHÔNG hiện err.message thô ra UI.
      console.error('[SmartCapture] Failed to launch scanner:', err);
      const rawMessage = err?.message ?? '';
      if (isScannerUnavailable(rawMessage)) {
        // Scanner native chưa sẵn sàng cho máy này → không cho "Thử lại"
        // (sẽ lặp đúng lỗi vô tận), chỉ hiện hướng dẫn + lối thoát.
        setScanStatus('unavailable');
        setErrorMessage(null);
      } else {
        setScanStatus('error');
        setErrorMessage(friendlyScannerError(rawMessage));
      }
      scanCompleteSub.remove();
      scanErrorSub.remove();
      uploadProgressSub.remove();
    }

    // Return cleanup
    return () => {
      scanCompleteSub.remove();
      scanErrorSub.remove();
      uploadProgressSub.remove();
    };
  }, [params.treeId]);

  // ── Lifecycle: Launch scanner on mount ─────────────────────────────────

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    let cancelled = false;
    launchNativeScanner().then((fn) => {
      // Unmount xảy ra trước khi scanner resolve → gỡ listener ngay, tránh
      // setState-sau-unmount và leak listener trên máy yếu.
      if (cancelled) { fn?.(); return; }
      scannerCleanupRef.current = fn;
    });

    return () => {
      cancelled = true;
      scannerCleanupRef.current?.();
      scannerCleanupRef.current = undefined;
    };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Dùng cho nút "Quét lại" sau khi quét xong thành công — luôn cho phép,
  // không tính vào giới hạn thử-lại-khi-lỗi.
  const handleScanAgain = async () => {
    scannerCleanupRef.current?.();        // gỡ listener lần quét trước
    scannerCleanupRef.current = undefined;
    setScanStatus('launching');
    setTreeIds([]);
    setErrorMessage(null);
    setRetryCount(0);
    scannerCleanupRef.current = await launchNativeScanner();
  };

  // Dùng cho nút "Thử lại" khi gặp lỗi tạm thời. Giới hạn MAX_RETRY lần để
  // không kẹt trong vòng lặp bấm-lại-cùng-một-lỗi. Quá ngưỡng → chuyển sang
  // thông báo tử tế có lối thoát ("Đóng").
  const handleRetryAfterError = async () => {
    if (retryCount >= MAX_RETRY) {
      setScanStatus('unavailable');
      setErrorMessage(null);
      return;
    }
    scannerCleanupRef.current?.();        // gỡ listener lần thử trước
    scannerCleanupRef.current = undefined;
    setRetryCount((c) => c + 1);
    setScanStatus('launching');
    setTreeIds([]);
    setErrorMessage(null);
    scannerCleanupRef.current = await launchNativeScanner();
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const handleUploadSync = async () => {
    try {
      const count = await ScannerSDK.getPendingUploadCount();
      if (count === 0) {
        Alert.alert('Đồng bộ', 'Không có ảnh nào chờ gửi.');
      } else {
        await ScannerSDK.stopScanner(); // trigger manual sync
        Alert.alert('Đồng bộ', `Đang gửi ${count} ảnh...`);
      }
    } catch (err) {
      console.warn('[SmartCapture] Sync error:', err);
    }
  };

  const getStatusIcon = () => {
    switch (scanStatus) {
      case 'launching':
        return 'loader-outline';
      case 'scanning':
        return 'barley';
      case 'uploading':
        return 'cloud-upload';
      case 'complete':
        return 'check-circle';
      case 'error':
        return 'alert-circle';
      case 'unavailable':
        return 'camera-off-outline';
      default:
        return 'barley';
    }
  };

  const getStatusText = () => {
    switch (scanStatus) {
      case 'launching':
        return 'Đang khởi động scanner...';
      case 'scanning':
        return 'Scanner đang chạy.\nDi chuyển xung quanh cây để chụp 8 góc.';
      case 'uploading':
        return `Đang gửi ảnh lên server...\n${uploadProgress.progress}/${uploadProgress.total}`;
      case 'complete':
        return 'Quét hoàn tất!';
      case 'error':
        return errorMessage || 'Chưa mở được phần nhận diện cây. Bạn vui lòng thử lại sau.';
      case 'unavailable':
        return 'Tính năng nhận diện cây bằng camera đang được hoàn thiện cho máy của bạn.\nBạn có thể chụp ảnh cây để lưu trước.';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (scanStatus) {
      case 'complete':
        return '#4CAF50';
      case 'error':
        return '#F44336';
      case 'unavailable':
        return '#FF9800';
      case 'uploading':
        return '#FF9800';
      default:
        return COLORS.accent;
    }
  };

  // ── Render: Waiting / Scanning overlay (shown while native scanner runs) ──

  const renderScanningOverlay = () => (
    <View style={[styles.overlay, { paddingTop: 24 + insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Pulsating icon */}
      <Animated.View style={styles.iconContainer}>
        <Icon name={getStatusIcon()} size={64} color={getStatusColor()} />
        {scanStatus === 'launching' && (
          <ActivityIndicator
            size="small"
            color={COLORS.white}
            style={styles.loadingSpinner}
          />
        )}
      </Animated.View>

      {/* Status text */}
      <Text style={styles.statusText}>{getStatusText()}</Text>

      {/* Progress indicator for scanning */}
      {scanStatus === 'scanning' && (
        <Text style={styles.subText}>
          Scanner chạy trong native Activity{'\n'}
          <Text style={styles.mutedText}>
            (YOLO detection + Circular capture 8 góc)
          </Text>
        </Text>
      )}

      {/* Tree IDs result */}
      {scanStatus === 'complete' && treeIds.length > 0 && (
        <Animated.View style={[styles.resultCard, { opacity: fadeAnim }]}>
          <Icon name="check-circle" size={32} color="#4CAF50" />
          <Text style={styles.resultTitle}>Đã phát hiện {treeIds.length} cây</Text>
          {treeIds.map((id, i) => (
            <View key={id} style={styles.treeIdRow}>
              <Icon name="pine-tree" size={14} color="#4CAF50" />
              <Text style={styles.treeIdText}>
                Cây #{i + 1}: {id.slice(0, 12)}…
              </Text>
            </View>
          ))}
        </Animated.View>
      )}

      {/* Error state — luôn là câu tiếng Việt thân thiện, không lỗi thô */}
      {scanStatus === 'error' && (
        <View style={styles.errorCard}>
          <Icon name="alert-circle" size={40} color="#F44336" />
          <Text style={styles.errorText}>{getStatusText()}</Text>
        </View>
      )}

      {/* Scanner native chưa sẵn sàng — thông báo tử tế, có lối thoát rõ ràng,
          KHÔNG có nút "Thử lại" để tránh vòng lặp đúng một lỗi */}
      {scanStatus === 'unavailable' && (
        <View style={styles.unavailableCard}>
          <Icon name="camera-off-outline" size={40} color="#FF9800" />
          <Text style={styles.unavailableText}>{getStatusText()}</Text>
        </View>
      )}

      {/* Bottom action buttons */}
      <View style={[styles.bottomActions, { bottom: Math.max(insets.bottom, 16) + 24 }]}>
        {scanStatus === 'complete' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleScanAgain}
          >
            <Icon name="camera-retake" size={20} color={COLORS.white} />
            <Text style={styles.buttonText}>Quét lại</Text>
          </TouchableOpacity>
        )}

        {/* Chỉ hiện "Thử lại" khi còn lượt; hết lượt thì handleRetryAfterError
            đã chuyển sang trạng thái 'unavailable' (không còn nút này) */}
        {scanStatus === 'error' && retryCount < MAX_RETRY && (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleRetryAfterError}
          >
            <Icon name="refresh" size={20} color={COLORS.white} />
            <Text style={styles.buttonText}>Thử lại</Text>
          </TouchableOpacity>
        )}

        {/* Ẩn "Đồng bộ" ở trạng thái lỗi/chưa sẵn sàng để chỉ còn một lối
            thoát rõ ràng là "Đóng", tránh làm chị Oanh phân vân */}
        {scanStatus !== 'error' && scanStatus !== 'unavailable' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={handleUploadSync}
          >
            <Icon name="cloud-sync" size={20} color={COLORS.accent} />
            <Text style={[styles.buttonText, { color: COLORS.accent }]}>Đồng bộ</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.cancelButton]}
          onPress={handleClose}
        >
          <Icon name="close" size={20} color={COLORS.white} />
          <Text style={styles.buttonText}>Đóng</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Scanner overlay — covers the screen while native scanner runs */}
      {renderScanningOverlay()}
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  iconContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },

  loadingSpinner: {
    marginTop: 12,
  },

  statusText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 26,
  },

  subText: {
    color: '#AAAAAA',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },

  mutedText: {
    color: '#666666',
    fontSize: 12,
  },

  resultCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
    width: '100%',
    maxWidth: 320,
  },

  resultTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },

  treeIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  treeIdText: {
    color: '#CCCCCC',
    fontSize: 13,
  },

  errorCard: {
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
    width: '100%',
    maxWidth: 320,
  },

  errorText: {
    color: '#FF8A80',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },

  unavailableCard: {
    backgroundColor: 'rgba(255, 152, 0, 0.12)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
    width: '100%',
    maxWidth: 320,
  },

  unavailableText: {
    color: '#FFCC80',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },

  bottomActions: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    minWidth: 100,
  },

  primaryButton: {
    backgroundColor: '#4CAF50',
  },

  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },

  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  buttonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SmartCaptureScreen;
