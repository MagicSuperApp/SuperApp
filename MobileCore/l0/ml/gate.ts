/**
 * MobileCore l0/ml — cổng "có mục tiêu" (gatePass) cho TreeReID.
 *
 * Nguồn: TreeReIDYolo (repo _wt-superapp-mobilecore @ claude/orilife-farm-sync-enroll-gate)
 *   ios/.../TreeReID/TreeReIDYolo.swift: gatePass() L119-125, staleness 800ms L123,
 *     confThreshold 0.25 L30.
 *   android/.../treereid/TreeReIDYolo.kt: hasTarget() L125-128, CONF_THRESHOLD 0.25 L42.
 *
 * L0: KHÔNG chạy detect (đó là inference). Nhận lastConf (max confidence do native
 * tính) + mốc thời-gian → quyết PASS. `detect()`/TFLite ở tầng native, không ở đây.
 */

import { MobileCoreError } from '../errors';
import type { ModelConfig } from './config';
import { DEFAULT_MODEL_CONFIG } from './config';

export interface GateState {
  /** Detector đã nạp chưa. false → luôn PASS (không chặn oan). */
  available: boolean;
  /** Max confidence kết quả detect gần nhất. < 0 = chưa có kết quả. */
  lastConf: number;
  /** Mốc (ms) khi có lastConf. So với `nowMs` ra tuổi kết quả. */
  lastConfAtMs: number;
  /** Thời điểm hiện tại (ms). Inject để thuần + test được. */
  nowMs: number;
}

/**
 * Cổng: frame gần nhất CÓ mục tiêu không? An toàn (không chặn oan):
 *   - detector chưa nạp (!available) → PASS;
 *   - chưa có kết quả (lastConf < 0) HOẶC kết quả quá cũ (age > gateStalenessMs) → PASS
 *     (rơi về stillness);
 *   - còn lại → lastConf ≥ gateConfThreshold.
 * Dịch gatePass() (Swift L119-125) + hasTarget() (Kotlin L125-128).
 */
export function gatePass(state: GateState, model: ModelConfig = DEFAULT_MODEL_CONFIG): boolean {
  if (!state.available) return true;
  const ageMs = state.nowMs - state.lastConfAtMs;
  if (state.lastConf < 0 || ageMs > model.gateStalenessMs) return true;
  return state.lastConf >= model.gateConfThreshold;
}

/**
 * Ném ml/no-target nếu không có detection nào. Cho tầng gọi 1 chỗ dùng mã lỗi chuẩn
 * khi pipeline BẮT BUỘC có mục tiêu (vd bước enroll). Trả lại chính mảng nếu hợp-lệ.
 * (Không có trong Swift/Kotlin — nguồn trả rỗng/-1; đây là lớp vỏ MobileCore.)
 */
export function requireTarget<T>(detections: T[]): T[] {
  if (detections.length === 0) {
    throw new MobileCoreError('ml/no-target', 'no detection in frame', { detail: { count: 0 } });
  }
  return detections;
}
