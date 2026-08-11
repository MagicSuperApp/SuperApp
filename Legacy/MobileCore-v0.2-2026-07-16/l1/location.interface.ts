/**
 * MobileCore L1 — Location engine CONTRACT (interface only).
 *
 * NO native code lives here. Xem `MobileCore/CONVENTIONS.md` §1 —
 * L1 = interface only.
 *
 * ── GHI CHÚ HARVEST ───────────────────────────────────────────────────
 * Nguồn: `orilife-mobile-app@origin/claude/spec-cam-controls-flash-ultrawide`
 * `ios/LocalPods/ScannerModule/Core/Sensor/LocationHelper.swift`.
 *   - Dòng 60-61: `locationManager.activityType = .fitness` +
 *     `pausesLocationUpdatesAutomatically = true`. Comment thật trong
 *     code (build 51, field feedback "0 điểm + máy nóng"):
 *       ".fitness activity type = Apple recommended cho walking; tự
 *        auto-pause khi user đứng yên → giảm 30-50% power vs .other
 *        default." → đây là nguồn của con số 30-50% trong
 *        `enableAutoPause` bên dưới.
 *   - Dòng 52: `distanceFilter = 3.0` — root-cause note liền kề (dòng
 *     ~47-51 trong file gốc): NearestTen + lazy GPS init từng gây
 *     duplicate ID khi field test 2026-05-15; fix = Best accuracy +
 *     giữ distanceFilter=3m (không đổi) → callback chỉ 1 lần/3m,
 *     cân bằng accuracy ↔ pin. `setDistanceFilter` dưới đây PHẢI giữ
 *     nguyên tắc "không đổi desiredAccuracy khi đổi distanceFilter".
 *   - Dòng 35: `targetAccuracy = 10.0` mét — ngưỡng "đủ tốt" để coi 1
 *     lần đọc là hợp lệ (không phải tham số của interface này, nhưng
 *     ảnh hưởng trực tiếp khi PHASE-3 quyết định `LocationSample` nào
 *     được đẩy qua `onUpdate`).
 *   - `allowsBackgroundLocationUpdates = false` (giữ mặc định, explicit)
 *     — boundary capture CHỈ chạy foreground, KHÔNG bật nền ngầm.
 * `LatLng` dùng lại NGUYÊN từ `../l0/types` (chữ ký đóng băng, orchestrator
 * sở hữu) — KHÔNG định nghĩa lại toạ độ ở đây.
 * ──────────────────────────────────────────────────────────────────────
 */

import type { LatLng } from '../l0/types';

/** 1 lần đọc GPS — toạ độ + độ chính xác + mốc thời gian. */
export interface LocationSample {
  coords: LatLng;
  /** Bán kính sai số theo mét (`horizontalAccuracy` iOS / `accuracy` Android). */
  accuracyMeters: number;
  timestampMs: number;
}

/** Handle để `clearWatch` — native trả về khi bắt đầu 1 phiên watch. */
export type LocationWatchId = number;

/**
 * Contract native cho theo dõi vị trí liên tục (watch), tách biệt với
 * mọi tính toán hình học (haversine, polygon...) — các phép đó thuộc
 * L0 `l0/geo` (TS thuần), KHÔNG lặp lại ở đây.
 */
export interface LocationEngine {
  /**
   * Bắt đầu theo dõi vị trí liên tục. Native tự xin quyền OS nếu chưa
   * cấp (harvest: `.notDetermined` → `requestWhenInUseAuthorization`).
   * `onUpdate` được gọi mỗi khi có toạ độ mới thoả `distanceFilter`
   * hiện tại; `onError` được gọi khi OS trả lỗi vị trí (denied,
   * locationUnknown...) — KHÔNG throw đồng bộ vì đây là stream dài hạn.
   *
   * @returns `LocationWatchId` để dùng với `clearWatch`.
   * @needs-device-test Quyền vị trí + độ chính xác thật không mô
   *   phỏng được đầy đủ trên simulator (đặc biệt hành vi
   *   auto-pause/.fitness chỉ quan sát được ngoài trời, đi bộ thật).
   */
  watchPosition(
    onUpdate: (sample: LocationSample) => void,
    onError: (error: unknown) => void,
  ): LocationWatchId;

  /**
   * Dừng theo dõi vị trí gắn với `watchId`. No-op nếu watch đã dừng
   * hoặc không tồn tại.
   *
   * @needs-device-test
   */
  clearWatch(watchId: LocationWatchId): void;

  /**
   * Đặt ngưỡng khoảng cách (mét) để OS mới gọi callback cập nhật tiếp
   * theo (throttle số lần callback, KHÔNG đổi `desiredAccuracy`).
   * Harvest dùng cố định 3.0m cho dedup chính xác — PHASE-3 cần giữ
   * nguyên tắc "distanceFilter nhỏ hơn thì tốn pin hơn, không đổi
   * accuracy mode song song" khi expose tham số này ra ngoài.
   *
   * @param meters Ngưỡng khoảng cách tối thiểu giữa 2 lần callback.
   * @needs-device-test
   */
  setDistanceFilter(meters: number): void;

  /**
   * Bật/tắt auto-pause khi thiết bị đứng yên (iOS:
   * `pausesLocationUpdatesAutomatically` + `activityType = .fitness`;
   * Android: tương đương qua `FusedLocationProviderClient` request
   * priority/interval — CHƯA có bằng chứng harvest phía Android, cần
   * xác nhận khi hiện thực). Harvest ghi nhận `.fitness` giảm 30-50%
   * power so với `.other` mặc định (field test build 51).
   *
   * @param enabled true = bật auto-pause khi đứng yên.
   * @needs-device-test Hiệu ứng tiết kiệm pin chỉ đo được trên máy
   *   thật ngoài trời, không đo được trên simulator (không có GPS
   *   thật/motion coprocessor).
   */
  enableAutoPause(enabled: boolean): void;
}
