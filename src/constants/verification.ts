/**
 * OriLife Verification Constants
 * MVP v1.3
 */

// ===== Sync State Machine =====
export const SYNC_STATES = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  VERIFIED: 'verified',
  ERROR: 'error',
} as const;

// ===== Verification States =====
export const VERIFICATION_STATUS = {
  MATCH: 'MATCH',
  NO_MATCH: 'NO_MATCH',
  PENDING: 'PENDING_VERIFICATION',
} as const;

// ===== SmartCapture Config =====
export const CAPTURE_CONFIG = {
  TARGET_IMAGES: 5,
  YOLO_CONFIDENCE_THRESHOLD: 0.85,
  ACCELEROMETER_STABILITY_THRESHOLD: 0.8, // m/s²
  BLUR_DETECTION_THRESHOLD: 100, // Laplacian variance
  MANUAL_OVERRIDE_TIMEOUT: 30000, // 30 seconds
  IMAGE_QUALITY: 90, // JPEG quality
  MAX_IMAGE_SIZE: 1024 * 1024, // 1MB
} as const;

// ===== GPS Config =====
export const GPS_CONFIG = {
  ACCURACY_WARNING_THRESHOLD: 15, // meters
  OUTDOOR_TIMEOUT: 10000, // 10s
} as const;

// ===== Sync Queue Config =====
export const QUEUE_CONFIG = {
  KILL_SWITCH_THRESHOLD: 100, // Số pending items để trigger warning
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,
  BATCH_SIZE: 10, // Số items gửi cùng 1 lần
  PRIORITY_ORDER: ['high', 'normal', 'low'] as const,
} as const;

// ===== Confidence Color Mapping =====
export const CONFIDENCE_COLORS = {
  HIGH: '#4A8C6F', // Green
  MEDIUM: '#F0A841', // Orange
  LOW: '#E74C3C', // Red
} as const;

export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.85) return CONFIDENCE_COLORS.HIGH;
  if (confidence >= 0.65) return CONFIDENCE_COLORS.MEDIUM;
  return CONFIDENCE_COLORS.LOW;
};

// ===== Error Codes & Mapping =====
export const ERROR_CODES = {
  // Network errors
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_FAILED: 'NETWORK_FAILED',

  // Camera & Sensor errors
  BLUR_DETECTED: 'BLUR_DETECTED',
  CAMERA_UNSTABLE: 'CAMERA_UNSTABLE',
  CAMERA_PERMISSION: 'CAMERA_PERMISSION',

  // GPS errors
  GPS_UNAVAILABLE: 'GPS_UNAVAILABLE',
  GPS_ACCURACY_LOW: 'GPS_ACCURACY_LOW',

  // Signature & Security
  SIGNATURE_FAILED: 'SIGNATURE_FAILED',
  NOT_ACTIVATED: 'NOT_ACTIVATED',

  // Verification errors
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  VERIFICATION_TIMEOUT: 'VERIFICATION_TIMEOUT',

  // Storage errors
  STORAGE_FULL: 'STORAGE_FULL',
  STORAGE_ERROR: 'STORAGE_ERROR',

  // Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// ===== User-Facing Error Messages =====
export const ERROR_MESSAGES: Record<
  string,
  { message: string; retryable: boolean }
> = {
  [ERROR_CODES.NETWORK_OFFLINE]: {
    message: 'Không có kết nối mạng. App sẽ lưu dữ liệu cục bộ và đồng bộ sau.',
    retryable: true,
  },
  [ERROR_CODES.NETWORK_TIMEOUT]: {
    message: 'Kết nối mạng chậm. Vui lòng thử lại.',
    retryable: true,
  },
  [ERROR_CODES.NETWORK_FAILED]: {
    message: 'Đẩy dữ liệu thất bại. Vui lòng kiểm tra mạng và thử lại.',
    retryable: true,
  },
  [ERROR_CODES.BLUR_DETECTED]: {
    message: 'Ảnh mờ, giữ chắc tay.',
    retryable: false,
  },
  [ERROR_CODES.CAMERA_UNSTABLE]: {
    message: 'Thiết bị rung, vui lòng giữ yên.',
    retryable: false,
  },
  [ERROR_CODES.CAMERA_PERMISSION]: {
    message: 'App cần quyền truy cập camera. Vui lòng cấp quyền trong Cài đặt.',
    retryable: true,
  },
  [ERROR_CODES.GPS_UNAVAILABLE]: {
    message: 'GPS không khả dụng. Vui lòng kiểm tra vị trí.',
    retryable: true,
  },
  [ERROR_CODES.GPS_ACCURACY_LOW]: {
    message: 'Độ chính xác GPS thấp (> 15m), dữ liệu có thể không chính xác.',
    retryable: false,
  },
  [ERROR_CODES.SIGNATURE_FAILED]: {
    message: 'Xác thực ký số thất bại. Vui lòng xác thực lại sinh trắc học.',
    retryable: true,
  },
  [ERROR_CODES.NOT_ACTIVATED]: {
    message: 'Tài khoản chưa được kích hoạt. Vui lòng hoàn tất bước Kích hoạt.',
    retryable: false,
  },
  [ERROR_CODES.VERIFICATION_FAILED]: {
    message: 'Định danh thất bại. Vui lòng thử lại hoặc chụp lại hình.',
    retryable: true,
  },
  [ERROR_CODES.VERIFICATION_TIMEOUT]: {
    message: 'Yêu cầu định danh mất quá lâu. Vui lòng thử lại.',
    retryable: true,
  },
  [ERROR_CODES.STORAGE_FULL]: {
    message: 'Bộ nhớ thiết bị đầy. Vui lòng xoá dữ liệu cũ.',
    retryable: false,
  },
  [ERROR_CODES.STORAGE_ERROR]: {
    message: 'Lỗi lưu trữ dữ liệu. Vui lòng thử lại.',
    retryable: true,
  },
  [ERROR_CODES.UNKNOWN_ERROR]: {
    message: 'Lỗi không xác định. Vui lòng liên hệ hỗ trợ.',
    retryable: true,
  },
};

// ===== Icons & UI Constants =====
export const SYNC_STATE_ICONS = {
  pending: 'clock-outline',
  syncing: 'cloud-upload-outline',
  verified: 'shield-check',
  error: 'alert-circle',
} as const;

/**
 * Bảng này hiện KHÔNG nơi nào dùng (`grep VERIFICATION_ICONS src/` → chỉ dòng
 * khai). Giữ lại thì phải giữ cho ĐÚNG, vì cái bẫy nằm ở chỗ nó trông vô hại:
 * ai đó nối nó vào một màn là dấu tích xanh quay lại.
 *
 * `MATCH` KHÔNG được mang dấu tích. Máy tra ra "khớp" chỉ đúng 19/37 = 51,4%
 * (số đo OriLife). Nguồn trình bày CHUẨN là `src/components/reid/ResultBadge.tsx`
 * — có test khoá. Cần biểu-tượng cho kết quả nhận-diện thì lấy ở đó, đừng dựng
 * bảng thứ hai.
 */
export const VERIFICATION_ICONS = {
  MATCH: 'magnify',
  NO_MATCH: 'close-circle',
  PENDING_VERIFICATION: 'help-circle',
} as const;

// ===== Navigation Routes =====
export const ROUTES = {
  SMART_CAPTURE: 'SmartCapture',
  DASHBOARD: 'Dashboard',
  VERIFICATION: 'Verification',
  TREE_DETAIL: 'TreeDetail',
  FRUIT_DETAIL: 'FruitDetail',
} as const;

// ===== Retry Policy =====
export const RETRY_POLICY = {
  maxAttempts: QUEUE_CONFIG.MAX_RETRY_ATTEMPTS,
  initialDelayMs: QUEUE_CONFIG.RETRY_DELAY_MS,
  backoffMultiplier: 1.5, // exponential backoff
  maxDelayMs: 60000, // max 1 minute
};

// ===== Feature Flags =====
export const FEATURES = {
  ENABLE_OFFLINE_MODE: true,
  ENABLE_MOCK_VERIFICATION: false, // chỉ bật khi dev — production KHÔNG mock xác minh
  ENABLE_DEBUG_OVERLAY: false,
  ENABLE_QUALITY_THRESHOLD: true,
  ENABLE_STABILITY_CHECK: true,
  // Launch production = CHỈ lõi traceability (cây/quả/động-vật/care/3D — đều thật).
  // Super-app (Trò chuyện/Việc làm) còn dùng mock-data, backend chưa dựng → ẩn.
  // Bật lại = đổi cờ này thành true khi backend ProofChat/Work sẵn sàng.
  ENABLE_SUPERAPP: false,
} as const;
