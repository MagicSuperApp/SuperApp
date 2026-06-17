// services/analytics/types.ts
//
// Hệ thống thu thập dữ liệu hành vi người dùng (user behavior analytics).
// Mỗi sự kiện ghi rõ: tại MÀN HÌNH nào, NÚT nào (hoặc không có nút), người dùng
// NHẬP gì, dùng CHỨC NĂNG gì, kèm theo các mốc thời gian (xem màn hình bao lâu,
// nhấn nút bao lâu thì màn hình hiển thị).

export type AnalyticsEventType =
  // Vòng đời phiên
  | 'session_start'
  | 'session_end'
  // Đo thời gian một màn hình được mở/xem (durationMs)
  | 'screen_view'
  // Thời gian từ lúc nhấn nút đến lúc màn hình/chức năng hiển thị (latencyMs)
  | 'screen_open_latency'
  // Một lần nhấn vào nút / phần tử / vùng màn hình
  | 'tap'
  // Người dùng nhập dữ liệu (text input, ô tìm kiếm, form…)
  | 'input'
  // Một chức năng được sử dụng (scan, gửi giao dịch, đăng việc…)
  | 'action';

/**
 * Một sự kiện hành vi gửi lên server.
 *
 * Quy ước ghi rõ ngữ cảnh:
 *  - screen : màn hình đang đứng (vd "Home", "LoginScreen").
 *  - target : nút / phần tử bị tác động. null = "không có nút" (vd tap vào nền,
 *             swipe, hoặc event không gắn với phần tử cụ thể).
 *  - action : tên chức năng được dùng (vd "submit_login", "start_3d_scan").
 *  - value  : nội dung người dùng nhập (đã được rút gọn & ẩn dữ liệu nhạy cảm).
 */
export interface AnalyticsEvent {
  /** ID sự kiện do client sinh — dùng làm khóa idempotency ở server. */
  eventId: string;
  /** ID phiên sử dụng app hiện tại. */
  sessionId: string;
  /** DID / userId của người dùng đăng nhập (null nếu chưa đăng nhập). */
  userId: string | null;

  type: AnalyticsEventType;

  /** Màn hình nào. */
  screen: string | null;
  /** Nút nào (null = không có nút). */
  target: string | null;
  /** Chức năng gì. */
  action: string | null;
  /** Nhập những gì (đã sanitize). */
  value: string | null;

  /** Thời gian một màn hình được xem (ms). Chỉ có ở screen_view. */
  durationMs: number | null;
  /** Thời gian nhấn nút → màn hình hiển thị (ms). Chỉ có ở screen_open_latency. */
  latencyMs: number | null;

  /** Thông tin phụ tuỳ ý (toạ độ tap, số ký tự nhập, params điều hướng…). */
  metadata: Record<string, any> | null;

  // Ngữ cảnh thiết bị
  platform: string;
  appVersion: string | null;
  osVersion: string | null;

  /** Mốc thời gian client (Date.now(), ms). */
  clientTs: number;
}

/** Tham số tiện dụng khi gọi các hàm track thủ công. */
export interface TrackOptions {
  /** Tên chức năng đi kèm thao tác. */
  action?: string;
  /** Giá trị người dùng nhập / nội dung liên quan. */
  value?: string | number | null;
  /** Metadata bổ sung. */
  metadata?: Record<string, any>;
}
