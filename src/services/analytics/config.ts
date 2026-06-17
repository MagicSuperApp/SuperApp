// services/analytics/config.ts

/**
 * Cấu hình hệ thống thu thập hành vi.
 *
 * Có thể tắt toàn bộ tracking bằng cách đặt ENABLED = false (vd build nội bộ,
 * hoặc khi người dùng từ chối cho phép thu thập dữ liệu).
 */
export const ANALYTICS_CONFIG = {
  /** Bật/tắt toàn bộ hệ thống. */
  ENABLED: true,

  /** Chu kỳ tự động đẩy dữ liệu lên server (ms). */
  FLUSH_INTERVAL_MS: 15_000,

  /** Số event tối đa gửi trong 1 lần. */
  MAX_BATCH_SIZE: 50,

  /** Số event tối đa giữ trong hàng đợi offline (drop event cũ nhất nếu vượt). */
  MAX_QUEUE_SIZE: 1_000,

  /** Tự động flush ngay khi hàng đợi đạt ngưỡng này. */
  FLUSH_THRESHOLD: 20,

  /**
   * Cửa sổ thời gian (ms) coi một lần "nhấn nút" là nguyên nhân mở màn hình kế
   * tiếp. Nếu màn hình mới xuất hiện trong khoảng này sau khi nhấn nút →
   * emit screen_open_latency.
   */
  NAV_INTENT_TTL_MS: 8_000,

  /** Độ dài tối đa của giá trị người dùng nhập được lưu lại. */
  MAX_VALUE_LENGTH: 200,

  /** Khóa lưu hàng đợi trong AsyncStorage. */
  STORAGE_KEY: '@aladin/analytics_queue_v1',

  /** Phiên bản app (đồng bộ với package.json). */
  APP_VERSION: '0.0.1',
};

/**
 * Danh sách tên field nhạy cảm sẽ bị ẩn (không gửi giá trị thật) khi log input.
 * So khớp không phân biệt hoa thường, chứa chuỗi con là đủ.
 */
export const SENSITIVE_FIELD_HINTS = [
  'password',
  'pass',
  'pin',
  'otp',
  'mật khẩu',
  'matkhau',
  'cvv',
  'card',
  'seed',
  'mnemonic',
  'private',
  'secret',
  'token',
];
