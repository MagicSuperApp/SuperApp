/**
 * MobileCore L1 — Camera stream engine CONTRACT (interface only).
 *
 * NO native code lives here. Xem `MobileCore/CONVENTIONS.md` §1 —
 * L1 = interface only.
 *
 * Phạm vi: đây là năng lực XỬ LÝ khung hình camera (stream/stop/skip/
 * idle-power), KHÔNG phải phần cứng camera (ống kính/cảm biến chip) —
 * MOBILE-CORE-STANDARD.md §0 loại phần cứng biên khỏi phạm vi MobileCore.
 * Quyết định "skip bao nhiêu frame vì nhiệt" (CHÍNH SÁCH) là việc của
 * L0 resource-policy (`l0/resource`, MOBILE-CORE-STANDARD.md §2 E4 —
 * "frame-rate throttle/skip: CHÍNH SÁCH — E4 sở hữu; lệnh gọi model ở
 * E2"), KHÔNG phải của `CameraEngine`. Engine ở đây chỉ THI HÀNH con số
 * mà policy truyền vào (`setFrameSkip`) — không tự đọc `thermalState`.
 *
 * ── GHI CHÚ HARVEST ───────────────────────────────────────────────────
 * Thermal frame-skip (bằng chứng policy cần thi hành):
 *   `orilife-mobile-app@origin/main`
 *   `ios/LocalPods/ScannerModule/Core/Detection/DetectionCoordinator.swift`
 *   dòng 430-441: `ProcessInfo.processInfo.thermalState` →
 *     .nominal/.fair = baseInterval, .serious = baseInterval*2 (~5fps
 *     thay vì 10fps), .critical = baseInterval*4 (~2.5fps). Dòng 449-451:
 *     frame-skip riêng (`enableFrameSkip && frameCount % (skipFrames+1) != 0`)
 *     — CỘNG DỒN với throttle nhiệt, 2 cơ chế độc lập.
 *   Android tương đương: `android/orilifesdk/.../coordinator/DetectionCoordinator.kt`
 *     dòng 230: `Config.ENABLE_FRAME_SKIP && frameCount % (Config.SKIP_FRAMES + 1) != 0`.
 *
 * Idle power-off:
 *   Android CÓ SẴN: `android/orilifesdk/.../camera/CameraStateManager.kt`
 *     dòng 22: `autoPowerOffDelay = 5 * 60 * 1000L` (mặc định 5 phút);
 *     dòng 26 `recordActivity()` reset timer; dòng 47 `checkAutoPowerOff()`
 *     bắn `onAutoPowerOff()` khi hết hạn không hoạt động.
 *   iOS HIỆN THIẾU cơ chế tương đương (không tìm thấy class song song
 *     trong ScannerModule) — PHASE-3 PHẢI tự hiện thực idle-off cho iOS,
 *     KHÔNG có sẵn để harvest 1-1 như Android.
 * ──────────────────────────────────────────────────────────────────────
 */

/**
 * Frame thô từ camera — kiểu dữ liệu THỰC (CVPixelBuffer trên iOS,
 * `ImageProxy`/YUV planes trên Android) do native quyết định, MobileCore
 * KHÔNG áp đặt shape chung. Tầng gọi (E2 ML pipeline) tự biết cách đọc
 * theo platform đang chạy.
 */
export type CameraFrameHandle = unknown;

/**
 * Contract native cho việc mở/đóng luồng khung hình camera + 2 công tắc
 * tiết kiệm tài nguyên (frame-skip, idle-power-off) mà policy L0 điều
 * khiển từ bên ngoài.
 */
export interface CameraEngine {
  /**
   * Bắt đầu stream khung hình từ camera đang active. `onFrame` được
   * gọi cho MỖI khung KHÔNG bị loại bởi `setFrameSkip` hiện hành (việc
   * throttle theo nhiệt độ — nếu có — xảy ra ở tầng policy gọi
   * `setFrameSkip`, không phải bên trong `startStream`).
   *
   * @throws khi không có quyền camera hoặc không bind được device.
   * @needs-device-test Camera thật (preview session, AVCaptureSession/
   *   CameraX) không mô phỏng được trên simulator/emulator theo đúng
   *   throughput/thermal thật.
   */
  startStream(onFrame: (frame: CameraFrameHandle) => void): Promise<void>;

  /**
   * Dừng stream hiện tại, giải phóng camera session. No-op nếu chưa
   * `startStream` hoặc đã dừng.
   *
   * @needs-device-test
   */
  stop(): Promise<void>;

  /**
   * Đặt N: chỉ xử lý (gọi `onFrame`) 1 trên mỗi `skipEveryN + 1` khung
   * nhận từ camera; các khung còn lại bị camera engine loại trước khi
   * tới callback. Đây là THI HÀNH — quyết định N là bao nhiêu (theo
   * `thermalState`, xem ghi chú harvest ở đầu file) thuộc về policy
   * L0 gọi method này, KHÔNG phải logic nội tại của `CameraEngine`.
   *
   * @param skipEveryN 0 = xử lý mọi khung (không skip).
   * @needs-device-test Hiệu ứng giảm tải/nhiệt chỉ đo được trên máy
   *   thật chạy pipeline đầy đủ (camera+ML+GPS đồng thời).
   */
  setFrameSkip(skipEveryN: number): void;

  /**
   * Bật/tắt tự động tắt camera sau `delayMs` không có hoạt động
   * (tương đương `CameraStateManager.recordActivity`/`checkAutoPowerOff`
   * phía Android — xem ghi chú harvest). iOS hiện THIẾU cơ chế này,
   * PHASE-3 phải tự xây khi hiện thực, không có sẵn để copy 1-1.
   *
   * @param delayMs Thời gian không hoạt động trước khi tự tắt camera.
   *   Harvest Android dùng mặc định 5 phút (`5 * 60 * 1000`).
   * @needs-device-test Hành vi idle timeout + resume phải verify trên
   *   máy thật (đo pin thật, không giả lập được thời gian chờ dài
   *   trên CI).
   */
  enableIdlePowerOff(delayMs: number): void;
}
