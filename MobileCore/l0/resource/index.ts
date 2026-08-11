/**
 * MobileCore l0/resource — tầng QUYẾT ĐỊNH thuần quản-trị pin/CPU/nhiệt/phiên.
 *
 * Ranh giới (council chốt): module này CHỈ trả QUYẾT ĐỊNH (boolean/enum/số).
 * KHÔNG tự đọc cảm biến (ProcessInfo.thermalState, GPS...), KHÔNG tự gọi
 * net.refreshToken (net sở hữu cơ chế single-flight) — native/caller nối kết
 * quyết định này với hành động thật. KHÔNG storage.
 *
 * Harvest nguồn:
 * - Cooldown token-refresh: orilife-mobile-app@claude/field-fix-farm-map-auth-b2
 *   src/services/fieldReidAuth.ts (~L279-317) — `lastRefreshFailedAtMs` +
 *   `REFRESH_FAIL_COOLDOWN_MS=30_000`. Cooldown CHỈ áp khi lỗi phía máy
 *   chủ/phiên (5xx, ký sai, mạng) — KHÔNG áp khi user tự huỷ sinh trắc
 *   (`res.userAction`), để cho thử lại ngay.
 * - Chính sách nhiệt: hợp nhất từ iOS `DetectionCoordinator.swift:423-451`
 *   (ProcessInfo.thermalState nhân throttle frame — Android trước đây chỉ có
 *   ngưỡng tĩnh, thiếu nhánh nhiệt) thành 1 policy TS dùng chung 2 nền tảng.
 */

/** Trạng thái nhiệt thiết bị — 4 mức chuẩn của iOS `ProcessInfo.ThermalState`,
 *  dùng chung cho cả Android (caller tự ánh xạ mức pin/nhiệt Android sang đây). */
export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';

/** Lý do lần làm-mới-token gần nhất thất bại. `'user-cancel'` = user tự huỷ
 *  sinh trắc, KHÔNG tính là lỗi phía máy chủ/phiên → không áp cooldown. */
export type RefreshFailReason = 'server' | 'session' | 'network' | 'user-cancel';

/** Cửa sổ cool-down sau 1 lần làm-mới-token thất bại phía máy chủ/phiên/mạng
 *  (harvest fieldReidAuth.ts REFRESH_FAIL_COOLDOWN_MS). */
export const REFRESH_FAIL_COOLDOWN_MS = 30_000;

/** Ngưỡng idle (ms) trước khi cân nhắc tạm dừng watchPosition khi máy nóng. */
export const WATCH_PAUSE_IDLE_MS = 60_000;

/** Hệ số nhân throttle frame theo mức nhiệt — nominal=1 (không throttle),
 *  tăng đơn điệu tới critical (throttle mạnh nhất). Hợp nhất chính sách iOS
 *  (baseInterval×1/×2/×4 cho nominal-fair/serious/critical) với 1 mức trung
 *  gian ở `fair` để Android (trước đây không có nhánh nhiệt) có cùng đường
 *  cong thay vì nhảy bậc. */
const THERMAL_THROTTLE_MULTIPLIER: Record<ThermalState, number> = {
  nominal: 1,
  fair: 1.5,
  serious: 2,
  critical: 4,
};

/** Trả hệ số nhân throttle theo mức nhiệt hiện tại (caller nhân vào khoảng
 *  cách tối thiểu giữa 2 lần xử lý frame/cảm biến). */
export function decideThermalThrottle(thermalState: ThermalState): number {
  return THERMAL_THROTTLE_MULTIPLIER[thermalState];
}

/** Số khung hình bỏ qua giữa 2 lần xử lý theo mức nhiệt (bổ sung cho
 *  `decideThermalThrottle` — hợp nhất `ScannerConfig.skipFrames` của iOS
 *  thành policy theo nhiệt thay vì hằng số tĩnh). 0 = không bỏ khung nào. */
const THERMAL_FRAME_SKIP: Record<ThermalState, number> = {
  nominal: 0,
  fair: 1,
  serious: 2,
  critical: 4,
};

export function decideFrameSkip(thermalState: ThermalState): number {
  return THERMAL_FRAME_SKIP[thermalState];
}

/** Input cho quyết định tạm dừng/tiếp tục `watchPosition`. */
export interface WatchPauseInput {
  /** Số ms đã trôi qua kể từ lần có chuyển động/cập nhật vị trí gần nhất. */
  idleMs: number;
  thermalState: ThermalState;
  /** true nếu thiết bị đang di chuyển (theo cảm biến/GPS caller cấp). */
  moving: boolean;
}

/**
 * Quyết định tạm dừng `watchPosition` khi máy nóng + đứng yên lâu — năng lực
 * fix nóng máy CÒN THIẾU (Android trước đây không có nhánh nhiệt).
 *
 * Thứ tự ưu tiên:
 * 1. `critical` ghi đè TẤT CẢ (kể cả đang di chuyển) → luôn 'pause' — máy quá
 *    nóng thì ưu tiên hạ nhiệt hơn độ chính xác vị trí.
 * 2. `moving=true` ghi đè idle (không phải critical) → 'active' — đang di
 *    chuyển thì vẫn cần vị trí dù máy hơi nóng.
 * 3. Nhiệt cao (`serious`/`fair`) + đứng yên đủ lâu (`idleMs >= WATCH_PAUSE_IDLE_MS`)
 *    + không di chuyển → 'pause'.
 * 4. Mặc định → 'active'.
 */
export function decideWatchPause(input: WatchPauseInput): 'active' | 'pause' {
  const { idleMs, thermalState, moving } = input;

  if (thermalState === 'critical') {
    return 'pause';
  }
  if (moving) {
    return 'active';
  }
  if ((thermalState === 'serious' || thermalState === 'fair') && idleMs >= WATCH_PAUSE_IDLE_MS) {
    return 'pause';
  }
  return 'active';
}

/** Input cho quyết định có nên thử làm-mới-token hay không. */
export interface ShouldAttemptRefreshInput {
  /** Mốc (epoch ms) lần làm-mới-token gần nhất THẤT BẠI, hoặc null nếu chưa
   *  từng thất bại (hoặc đã được caller xoá sau lần thành công). */
  lastFailAtMs: number | null;
  /** "Bây giờ" — caller truyền vào để hàm giữ THUẦN (không gọi Date.now()). */
  now: number;
  /** Lý do lần thất bại gần nhất, hoặc null nếu không rõ/chưa từng thất bại. */
  lastFailReason: RefreshFailReason | null;
}

/**
 * Quyết định có nên thử làm-mới-token hay không (harvest cooldown
 * `fieldReidAuth.ts`). CHỈ trả boolean — KHÔNG tự gọi refresh, KHÔNG sở hữu
 * single-flight (net sở hữu cơ chế đó).
 *
 * Cooldown `REFRESH_FAIL_COOLDOWN_MS` CHỈ áp khi lần thất bại gần nhất là lỗi
 * phía máy chủ/phiên/mạng (`'server' | 'session' | 'network'`). Khi user tự
 * huỷ sinh trắc (`'user-cancel'`) → cho thử lại NGAY, không cooldown.
 * `lastFailReason: null` (thất bại không rõ nguyên nhân) được xử lý AN TOÀN
 * như lỗi phía máy chủ — áp cooldown, tránh bão retry khi thiếu thông tin.
 */
export function shouldAttemptRefresh(input: ShouldAttemptRefreshInput): boolean {
  const { lastFailAtMs, now, lastFailReason } = input;

  if (lastFailAtMs === null) {
    return true;
  }
  if (lastFailReason === 'user-cancel') {
    return true;
  }
  return now - lastFailAtMs >= REFRESH_FAIL_COOLDOWN_MS;
}
