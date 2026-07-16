/**
 * MobileCore L1 — Motion sensor engine CONTRACT (interface only).
 *
 * NO native code lives here. Xem `MobileCore/CONVENTIONS.md` §1 —
 * L1 = interface only.
 *
 * Phạm vi: engine này CHỈ cấp SỐ CẢM BIẾN THÔ từ phần cứng chuyển-động
 * (ma-trận-xoay từ rotation vector, gia-tốc tức thời). MỌI phép toán trên
 * số thô — fusion → {heading, pitch, roll}, variance đo đứng-yên — thuộc
 * L0 và KHÔNG lặp lại ở đây:
 *   - `l0/ml/orientation.ts:computeOrientationFromRotationMatrix` tiêu thụ
 *     ma-trận-xoay (`getRotationMatrix`) → {heading, pitch, roll}.
 *   - `l0/ml/stability.ts:createStabilitySampler` tiêu thụ |accel| (độ-lớn
 *     tính từ `getAcceleration`) → trạng-thái đứng-yên (variance cửa-sổ).
 * Đây là nửa còn thiếu của hợp đồng "L0 producer ⟷ L1 sensor": L0 ml là
 * producer toán thuần, engine này là nguồn cảm biến L1 cấp đầu vào cho nó.
 *
 * ── GHI CHÚ HARVEST ───────────────────────────────────────────────────
 * Nguồn thô tương ứng phía native (để PHASE-3 hiện thực):
 *   - Android: `SensorManager.getRotationMatrix(R, I, gravity, geomagnetic)`
 *     → R là mảng 9 (3x3) hoặc 16 (4x4) phần-tử row-major, khớp đúng shape
 *     mà `computeOrientationFromRotationMatrix` đã xử (xem JSDoc getOrientation
 *     trong orientation.ts). Gia-tốc: `Sensor.TYPE_ACCELEROMETER` (m/s²).
 *   - iOS: `CMDeviceMotion.attitude.rotationMatrix` (`CMRotationMatrix`, 3x3
 *     → dàn phẳng thành 9 phần-tử row-major khi cấp qua đây). Gia-tốc:
 *     `CMDeviceMotion.userAcceleration` + gravity, HOẶC
 *     `CMAccelerometerData.acceleration` (đơn vị g — PHASE-3 thống nhất đơn
 *     vị với consumer trước khi tính |accel|).
 * KHÔNG có bằng chứng harvest 1-1 từ orilife-mobile-app cho engine cảm biến
 * chuyển-động độc lập (SensorDataCollector.kt @ orilife-mobile-core là
 * L0 producer đã harvest sang `l0/ml`, KHÔNG phải L1 native gate) → PHASE-3
 * hiện thực nguồn cảm biến này theo API nền tảng ở trên.
 * ──────────────────────────────────────────────────────────────────────
 */

/**
 * Contract native cấp tín hiệu cảm biến chuyển-động THÔ (rotation matrix +
 * gia-tốc). Không giữ trạng-thái toán học nào — mọi fusion/variance ở L0.
 */
export interface MotionEngine {
  /**
   * Đọc 1 lần ma-trận-xoay hiện tại của thiết bị.
   * Trả mảng 9 phần-tử (3x3 row-major) HOẶC 16 phần-tử (4x4) — đúng 2 shape
   * mà consumer `l0/ml/orientation.ts:computeOrientationFromRotationMatrix`
   * chấp nhận (nó tự phân nhánh theo `R.length`, xem JSDoc getOrientation).
   * Native KHÔNG chuyển sang góc — chỉ cấp ma-trận thô.
   *
   * Nguồn: Android `SensorManager.getRotationMatrix`; iOS
   * `CMDeviceMotion.attitude.rotationMatrix` (dàn phẳng 3x3 → 9 phần-tử).
   *
   * @needs-device-test Rotation vector / attitude thật cần magnetometer +
   *   gyro trên máy thật; simulator/emulator không cấp giá-trị fusion đúng.
   */
  getRotationMatrix(): Promise<number[]>;

  /**
   * Đọc 1 lần gia-tốc tức thời theo 3 trục thiết bị. Consumer
   * `l0/ml/stability.ts:createStabilitySampler` lấy độ-lớn
   * |accel| = sqrt(x²+y²+z²) từ giá-trị này để đo đứng-yên (variance
   * cửa-sổ) — việc tính |accel| và variance thuộc L0, KHÔNG làm ở đây.
   * `l0/ml/orientation.ts:accelOnlyTilt` cũng nhận nguyên {x,y,z} này làm
   * fallback tilt khi thiếu magnetometer.
   *
   * Đơn vị do native quyết (Android m/s², iOS g) — PHASE-3 phải thống nhất
   * đơn vị với ngưỡng `stabilityThreshold` của consumer trước khi nối dây.
   *
   * @needs-device-test Accelerometer thật (rung tay, chuyển-động) không mô
   *   phỏng được trên simulator/emulator.
   */
  getAcceleration(): Promise<{ x: number; y: number; z: number }>;

  /**
   * Đăng ký nhận cảm biến chuyển-động liên tục (streaming) — `cb` được gọi
   * mỗi khi có mẫu mới (dùng cho vòng cập nhật orientation/stability thời-
   * gian-thực thay vì poll từng `getRotationMatrix`/`getAcceleration`).
   * `cb` chỉ cấp SỐ THÔ (ma-trận-xoay + gia-tốc cùng mốc); mọi fusion/
   * variance vẫn ở L0. Tương tự `watchPosition` của LocationEngine nhưng
   * trả hàm huỷ trực tiếp thay vì id.
   *
   * @returns Hàm huỷ đăng ký (gọi để dừng stream, giải phóng cảm biến).
   *   No-op nếu gọi lần 2.
   * @needs-device-test Tần suất + độ trễ stream cảm biến chỉ đo đúng trên
   *   máy thật (SensorManager delay / CMMotionManager updateInterval).
   */
  subscribe(
    cb: (sample: {
      rotationMatrix: number[];
      acceleration: { x: number; y: number; z: number };
      timestampMs: number;
    }) => void,
  ): () => void;
}
