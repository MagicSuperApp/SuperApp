/**
 * Error Handling & Mapping Utilities
 * Maps SDK/API errors to user-facing Vietnamese messages
 */

import { CaptureError, APIError } from '../types/verification';
import { ERROR_CODES, ERROR_MESSAGES, SYNC_STATE_ICONS } from '../constants/verification';

/**
 * Create a CaptureError with context
 */
export const createCaptureError = (
  code: string,
  context: 'blur' | 'stability' | 'network' | 'gps' | 'signature' | 'storage'
): CaptureError => {
  const errorConfig = ERROR_MESSAGES[code];

  return {
    code,
    message: errorConfig?.message || 'Lỗi không xác định',
    userMessage: errorConfig?.message || 'Lỗi không xác định',
    retryable: errorConfig?.retryable ?? true,
    context,
  };
};

/**
 * Map error code to icon
 */
export const getErrorIcon = (code: string): string => {
  switch (code) {
    case ERROR_CODES.BLUR_DETECTED:
    case ERROR_CODES.CAMERA_UNSTABLE:
      return 'alert-circle';
    case ERROR_CODES.NETWORK_OFFLINE:
    case ERROR_CODES.NETWORK_FAILED:
      return 'wifi-off';
    case ERROR_CODES.GPS_UNAVAILABLE:
    case ERROR_CODES.GPS_ACCURACY_LOW:
      return 'map-marker-off';
    case ERROR_CODES.SIGNATURE_FAILED:
    case ERROR_CODES.NOT_ACTIVATED:
      return 'lock-alert';
    case ERROR_CODES.STORAGE_FULL:
    case ERROR_CODES.STORAGE_ERROR:
      return 'folder-alert';
    default:
      return 'alert-circle';
  }
};

/**
 * Map error code to severity color
 */
export const getErrorSeverity = (
  code: string
): 'critical' | 'warning' | 'info' => {
  switch (code) {
    case ERROR_CODES.STORAGE_FULL:
    case ERROR_CODES.NOT_ACTIVATED:
    case ERROR_CODES.SIGNATURE_FAILED:
      return 'critical';
    case ERROR_CODES.GPS_ACCURACY_LOW:
    case ERROR_CODES.NETWORK_OFFLINE:
    case ERROR_CODES.BLUR_DETECTED:
    case ERROR_CODES.CAMERA_UNSTABLE:
      return 'warning';
    default:
      return 'info';
  }
};

/**
 * Determine if error should block user action
 */
export const shouldBlockAction = (code: string): boolean => {
  const blockingErrors: string[] = [
    ERROR_CODES.NOT_ACTIVATED,
    ERROR_CODES.SIGNATURE_FAILED,
    ERROR_CODES.STORAGE_FULL,
  ];
  return blockingErrors.includes(code);
};

/**
 * Get retry action text
 */
export const getRetryActionText = (code: string): string => {
  switch (code) {
    case ERROR_CODES.NETWORK_OFFLINE:
    case ERROR_CODES.NETWORK_FAILED:
      return 'Thử lại';
    case ERROR_CODES.SIGNATURE_FAILED:
      return 'Xác thực lại';
    case ERROR_CODES.NOT_ACTIVATED:
      return 'Kích hoạt tài khoản';
    case ERROR_CODES.STORAGE_FULL:
      return 'Xoá dữ liệu cũ';
    default:
      return 'Thử lại';
  }
};

/**
 * Parse SDK error response
 */
export const parseSDKError = (error: any): APIError => {
  if (typeof error === 'string') {
    return {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: error,
      userMessage: error,
      retryable: true,
    };
  }

  if (error.code && ERROR_MESSAGES[error.code]) {
    const config = ERROR_MESSAGES[error.code];
    return {
      code: error.code,
      message: error.message || config.message,
      userMessage: config.message,
      retryable: config.retryable,
      details: error.details,
    };
  }

  return {
    code: ERROR_CODES.UNKNOWN_ERROR,
    message: error.message || 'Lỗi không xác định',
    userMessage: 'Lỗi không xác định. Vui lòng thử lại.',
    retryable: true,
    details: error,
  };
};

/**
 * Log error for debugging
 */
export const logError = (error: CaptureError | APIError, context?: string) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    context,
    code: error.code,
    message: error.message,
    details: 'details' in error ? error.details : undefined,
  };

  console.error('[OriLife Error]', logEntry);

  // In production: send to logging service (e.g., Sentry)
  // if (__DEV__ === false) {
  //   Sentry.captureException(error, { extra: logEntry });
  // }
};

/**
 * Format error message for UI display
 */
export const formatErrorMessage = (error: CaptureError | APIError): string => {
  return error.userMessage || error.message || 'Lỗi không xác định';
};

/**
 * Suggest action based on error
 */
export interface ErrorSuggestion {
  title: string;
  action: string;
  actionLabel: string;
  details?: string;
}

export const getSuggestionForError = (error: CaptureError): ErrorSuggestion | null => {
  switch (error.code) {
    case ERROR_CODES.BLUR_DETECTED:
      return {
        title: 'Ảnh mờ',
        action: 'retry_capture',
        actionLabel: 'Chụp lại',
        details: 'Giữ tay yên và chắc chắn ánh sáng đủ',
      };

    case ERROR_CODES.CAMERA_UNSTABLE:
      return {
        title: 'Thiết bị rung',
        action: 'retry_capture',
        actionLabel: 'Thử lại',
        details: 'Đặt thiết bị lên bề mặt cứng hoặc giữ chắc hơn',
      };

    case ERROR_CODES.GPS_ACCURACY_LOW:
      return {
        title: 'Vị trí không chính xác',
        action: 'acknowledge',
        actionLabel: 'Hiểu rồi',
        details: `Độ chính xác: > 15m. Dữ liệu có thể không đúng.`,
      };

    case ERROR_CODES.NETWORK_OFFLINE:
      return {
        title: 'Không có mạng',
        action: 'offline_mode',
        actionLabel: 'Tiếp tục ngoại tuyến',
        details: 'Dữ liệu sẽ được lưu cục bộ và đồng bộ khi có mạng',
      };

    case ERROR_CODES.NOT_ACTIVATED:
      return {
        title: 'Chưa kích hoạt',
        action: 'activate',
        actionLabel: 'Kích hoạt',
      };

    case ERROR_CODES.SIGNATURE_FAILED:
      return {
        title: 'Xác thực thất bại',
        action: 'reauth',
        actionLabel: 'Xác thực lại',
        details: 'Vui lòng xác thực bằng sinh trắc học',
      };

    default:
      return null;
  }
};

/**
 * Retry strategy for failed queue items
 */
export interface RetryStrategy {
  shouldRetry: boolean;
  delayMs: number;
  maxAttempts: number;
}

export const getRetryStrategy = (
  retryCount: number,
  error: APIError | CaptureError
): RetryStrategy => {
  const maxAttempts = 3;
  const initialDelayMs = 5000;
  const backoffMultiplier = 1.5;

  if (!error.retryable || retryCount >= maxAttempts) {
    return {
      shouldRetry: false,
      delayMs: 0,
      maxAttempts,
    };
  }

  const delayMs = Math.min(
    initialDelayMs * Math.pow(backoffMultiplier, retryCount),
    60000 // max 1 minute
  );

  return {
    shouldRetry: true,
    delayMs: Math.floor(delayMs),
    maxAttempts,
  };
};
