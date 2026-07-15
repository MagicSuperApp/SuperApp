/**
 * MobileCore l0/ml — capture-by-heading (chụp theo hướng) + chuẩn-hoá góc.
 *
 * Nguồn: android/app/src/main/java/com/aladincontract/company/treereid/HeadingCaptureManager.kt
 *   (repo _wt-superapp-mobilecore @ claude/orilife-farm-sync-enroll-gate) — pure Kotlin.
 *   process(): L60-98.  MIN_HEADING_DELTA=25 / MIN_PITCH_DELTA=18 (L17-18),
 *   STEADY_RATE_THRESHOLD=1.5 / STEADY_FRAMES_REQUIRED=3 (L25-26).
 *
 * ⚠️ normalizeAngle: nguồn Kotlin (private, L110-115) chuẩn-hoá về [-180,180] để lấy
 * góc-lệch NGẮN NHẤT (dùng cho DELTA). Task lại yêu-cầu export normalizeAngle theo
 * [0,360) (vector 370→10, -10→350). → tách 2 hàm:
 *   - normalizeAngle(a)      → [0,360)   (đúng vector task, tiện hiển-thị la-bàn);
 *   - signedAngleDelta(a)    → [-180,180] (đúng Kotlin, dùng TÍNH delta trong capture).
 * Logic capture DÙNG signedAngleDelta để trung-thành nguồn.
 */

import type { ModelConfig } from './config';
import { DEFAULT_MODEL_CONFIG } from './config';

/**
 * Chuẩn-hoá góc về [0, 360). Vector task: 370→10, -10→350, wrap qua 0.
 * (( a % 360 ) + 360 ) % 360.
 */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Góc-lệch có dấu, chuẩn-hoá về [-180, 180] (khoảng-cách góc ngắn nhất).
 * Dịch HeadingCaptureManager.normalizeAngle (Kotlin L110-115):
 *   n = a % 360 ; n>180 → n-360 ; n<-180 → n+360.
 */
export function signedAngleDelta(angle: number): number {
  let n = angle % 360;
  if (n > 180) n -= 360;
  else if (n < -180) n += 360;
  return n;
}

/** State máy chụp-theo-hướng. Bất-biến: hàm trả state MỚI, không sửa tại chỗ. */
export interface HeadingState {
  /** Heading lần chụp gần nhất (mốc so delta). null = chưa có. */
  lastCapturedHeading: number | null;
  lastCapturedPitch: number | null;
  /** Mẫu frame trước (đo tốc-độ xoay tức-thời). */
  prevSampleHeading: number | null;
  prevSamplePitch: number | null;
  /** Số frame đứng-yên liên-tiếp. */
  steadyFrames: number;
}

/** State khởi-tạo (giống reset() của Kotlin). */
export function initHeadingState(): HeadingState {
  return {
    lastCapturedHeading: null,
    lastCapturedPitch: null,
    prevSampleHeading: null,
    prevSamplePitch: null,
    steadyFrames: 0,
  };
}

export interface HeadingSample {
  heading: number;
  pitch: number;
  roll: number;
}

export interface HeadingResult {
  heading: number;
  pitch: number;
  roll: number;
  /** Δheading (có dấu, [-180,180]) so lần chụp gần nhất. null nếu chưa có mốc. */
  deltaHeading: number | null;
  /** Δpitch so lần chụp gần nhất (KHÔNG wrap — pitch không quấn 360). null nếu chưa có. */
  deltaPitch: number | null;
  /** Có nên chụp frame này không. */
  shouldCapture: boolean;
  /** Mốc thời-gian (giây). Chỉ để báo-cáo, KHÔNG dùng trong quyết-định. */
  timestamp: number;
}

/**
 * Xử-lý 1 mẫu cảm-biến → { state mới, result }.
 * Dịch HeadingCaptureManager.process (Kotlin L60-98):
 *   - lần đọc đầu: đặt mốc lastCaptured = heading/pitch;
 *   - deltaHeading = signedAngleDelta(heading - lastCaptured); deltaPitch = pitch - lastCaptured;
 *   - instRate = |Δpitch frame| + |signedAngleDelta(Δheading frame)| (prev null → +∞);
 *     instRate ≤ STEADY_RATE → steadyFrames+1, else 0; isSteady = steadyFrames ≥ REQUIRED;
 *   - angleMet = |Δheading|≥MIN_HEADING_DELTA hoặc |Δpitch|≥MIN_PITCH_DELTA;
 *   - shouldCapture = angleMet && isSteady;  nếu chụp → dời mốc lastCaptured về heading/pitch.
 * `now`: inject clock (ms) để thuần + test được; mặc định Date.now.
 */
export function captureByHeading(
  state: HeadingState,
  sample: HeadingSample,
  cfg?: { model?: ModelConfig; now?: () => number },
): { state: HeadingState; result: HeadingResult } {
  const model = cfg?.model ?? DEFAULT_MODEL_CONFIG;
  const now = cfg?.now ?? Date.now;
  const timestamp = now() / 1000.0;

  const { heading, pitch, roll } = sample;

  // Khởi-tạo mốc trên lần đọc đầu.
  let lastCapturedHeading = state.lastCapturedHeading ?? heading;
  let lastCapturedPitch = state.lastCapturedPitch ?? pitch;

  const deltaHeading = signedAngleDelta(heading - lastCapturedHeading);
  const deltaPitch = pitch - lastCapturedPitch;

  // Tốc-độ xoay tức-thời (frame→frame).
  let instRate: number;
  if (state.prevSamplePitch != null) {
    const headingRate =
      state.prevSampleHeading != null ? Math.abs(signedAngleDelta(heading - state.prevSampleHeading)) : 0;
    instRate = Math.abs(pitch - state.prevSamplePitch) + headingRate;
  } else {
    instRate = Number.MAX_VALUE;
  }
  const steadyFrames = instRate <= model.steadyRateThreshold ? state.steadyFrames + 1 : 0;
  const isSteady = steadyFrames >= model.steadyFramesRequired;

  const angleMet =
    Math.abs(deltaHeading) >= model.minHeadingDelta || Math.abs(deltaPitch) >= model.minPitchDelta;
  const shouldCapture = angleMet && isSteady;

  if (shouldCapture) {
    lastCapturedHeading = heading;
    lastCapturedPitch = pitch;
  }

  const nextState: HeadingState = {
    lastCapturedHeading,
    lastCapturedPitch,
    prevSampleHeading: heading,
    prevSamplePitch: pitch,
    steadyFrames,
  };

  return {
    state: nextState,
    result: { heading, pitch, roll, deltaHeading, deltaPitch, shouldCapture, timestamp },
  };
}
