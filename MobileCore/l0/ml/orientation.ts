/**
 * MobileCore l0/ml — sensor-fusion ORIENTATION producer (toán thuần).
 *
 * SINH ra {heading, pitch, roll} mà sector-capture TIÊU THỤ. Chỉ phần PURE:
 * ma-trận-xoay → góc (getOrientation), fallback accel-only, low-pass wrap-aware.
 * getRotationMatrix + đọc cảm-biến THẬT = native L1, KHÔNG thuộc file này.
 * Nguồn cảm biến: l1/motion.interface.ts MotionEngine (L1 native).
 *
 * Nguồn: orilife-mobile-core @ review-mvp,
 *   sensor/SensorDataCollector.kt:
 *     - updateOrientation (L183-225): getRotationMatrix → getOrientation →
 *       rad→deg → azimuth<0?+360 → lowPassAngleFilter.
 *     - computeAccelerometerOnlyOrientation (L232-246): atan2 pitch/roll từ gravity.
 *     - lowPassAngleFilter (L275-292): EMA wrap-aware (diff về [-180,180], out về [0,360)).
 *
 * getOrientation khớp Android SensorManager.getOrientation:
 *   9 phần-tử (3x3 row-major):  azimuth=atan2(R[1],R[4]); pitch=asin(-R[7]); roll=atan2(-R[6],R[8]).
 *   16 phần-tử (4x4):           azimuth=atan2(R[1],R[5]); pitch=asin(-R[9]); roll=atan2(-R[8],R[10]).
 */

import { normalizeAngle, signedAngleDelta } from './heading';
import { MobileCoreError } from '../errors';

const RAD_TO_DEG = 180 / Math.PI;

/** Kẹp về [-1,1] trước asin — ma-trận-xoay chưa renormalize (tích luỹ sai số gyro
 *  nhiều frame) có thể đẩy |arg|>1 → asin trả NaN lan xuống heading/guidance. */
function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

export interface Orientation {
  /** Azimuth (la-bàn) độ, [0,360). 0=Bắc, 90=Đông. */
  heading: number;
  /** Pitch độ, [-90,90] (nghiêng trước/sau). */
  pitch: number;
  /** Roll độ, [-180,180] (nghiêng trái/phải). */
  roll: number;
}

/** Tilt (không heading) từ accelerometer/gravity — fallback khi thiếu magnetometer. */
export interface Tilt {
  pitch: number;
  roll: number;
}

/**
 * {heading,pitch,roll} từ ma-trận-xoay (Android getOrientation), rad→deg,
 * heading chuẩn-hoá [0,360). Nhận R 9 phần-tử (3x3) hoặc 16 phần-tử (4x4).
 * Nguồn: SensorDataCollector.updateOrientation (L194-204).
 */
export function computeOrientationFromRotationMatrix(R: number[]): Orientation {
  let azimuthRad: number;
  let pitchRad: number;
  let rollRad: number;

  if (R.length >= 16) {
    azimuthRad = Math.atan2(R[1], R[5]);
    pitchRad = Math.asin(clampUnit(-R[9]));
    rollRad = Math.atan2(-R[8], R[10]);
  } else if (R.length >= 9) {
    azimuthRad = Math.atan2(R[1], R[4]);
    pitchRad = Math.asin(clampUnit(-R[7]));
    rollRad = Math.atan2(-R[6], R[8]);
  } else {
    throw new MobileCoreError(
      'ml/invalid-input',
      `rotation matrix cần ≥9 phần-tử, nhận ${R.length}`,
      { detail: { length: R.length } },
    );
  }

  // rad→deg; heading về [0,360) (azimuth<0 → +360, rồi normalize cho chắc).
  return {
    heading: normalizeAngle(azimuthRad * RAD_TO_DEG),
    pitch: pitchRad * RAD_TO_DEG,
    roll: rollRad * RAD_TO_DEG,
  };
}

/**
 * Fallback tilt CHỈ từ gia-tốc (thiếu rotation vector / magnetometer).
 * Nguồn: computeAccelerometerOnlyOrientation (L235-246):
 *   pitch = atan2(x, sqrt(y²+z²)); roll = atan2(y, sqrt(x²+z²)); rad→deg.
 */
export function accelOnlyTilt(accel: { x: number; y: number; z: number }): Tilt {
  const { x, y, z } = accel;
  const pitch = Math.atan2(x, Math.sqrt(y * y + z * z)) * RAD_TO_DEG;
  const roll = Math.atan2(y, Math.sqrt(x * x + z * z)) * RAD_TO_DEG;
  return { pitch, roll };
}

/**
 * EMA WRAP-AWARE cho góc la-bàn — xử đúng nhảy 359°→1° (không nội-suy sai qua mốc 0).
 * Nguồn: lowPassAngleFilter (L275-292):
 *   diff = signedAngleDelta(next - prev) (đường ngắn nhất, [-180,180]);
 *   out  = normalizeAngle(prev + alpha*diff) ([0,360)).
 * alpha ∈ [0,1]: 0 = giữ prev, 1 = nhảy hẳn sang next.
 */
export function lowPassAngleFilter(prev: number, next: number, alpha: number): number {
  const diff = signedAngleDelta(next - prev);
  return normalizeAngle(prev + alpha * diff);
}
