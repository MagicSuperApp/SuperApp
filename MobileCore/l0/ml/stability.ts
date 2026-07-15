/**
 * MobileCore l0/ml — nhà DUY NHẤT của "đo đứng-yên" (stability).
 *
 * Đo rung tay bằng variance của |accel| trên cửa-sổ-trượt: variance thấp = đứng yên.
 * heading/sector-capture PHẢI gọi vào đây để biết đứng-yên — KHÔNG tự tính lại (dedup chốt).
 *
 * Nguồn: orilife-mobile-core @ review-mvp, sampling/StabilitySampler.kt:
 *   - windowSize=15, stableThreshold=50 (L8-9) → khớp config stabilityWindowSize/Threshold.
 *   - addMagnitude (L35-41): ArrayDeque giữ N mẫu gần nhất, đầy thì removeFirst.
 *   - isStable (L49-54): size ≥ windowSize VÀ variance < threshold.
 *   - calculateVariance (L77-90): population variance (chia n), <2 mẫu → MAX_VALUE.
 */

import { getModelConfig } from './config';

/**
 * Population variance của một tập giá-trị (chia n, KHÔNG chia n-1 — bám Kotlin).
 * <2 phần-tử → Number.MAX_VALUE (chưa đủ để coi là đứng-yên).
 * Nguồn: StabilitySampler.calculateVariance (L77-90).
 */
export function sampleVariance(values: number[]): number {
  const n = values.length;
  if (n < 2) return Number.MAX_VALUE;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let sumSq = 0;
  for (const v of values) {
    const d = v - mean;
    sumSq += d * d;
  }
  return sumSq / n;
}

export interface StabilityReading {
  /** true khi cửa-sổ đã ĐẦY windowSize VÀ motionVariance < threshold. */
  isStable: boolean;
  /** Variance |accel| hiện tại trên cửa-sổ (Number.MAX_VALUE khi <2 mẫu). */
  variance: number;
  /** Cửa-sổ đã đủ windowSize mẫu chưa (chưa đủ → luôn isStable=false). */
  filled: boolean;
}

export interface StabilitySampler {
  /**
   * Nạp 1 độ-lớn gia-tốc (|accel| = sqrt(x²+y²+z²), do L1/consumer tính).
   * Trả trạng-thái đứng-yên SAU khi nạp mẫu này.
   */
  push(accelMagnitude: number): StabilityReading;
  /** Xoá cửa-sổ — gọi khi mở session chụp mới. */
  reset(): void;
  /** Số mẫu đang giữ trong cửa-sổ. */
  size(): number;
}

/**
 * Sampler đo đứng-yên trên cửa-sổ-trượt. Hằng đọc qua getModelConfig() nếu không
 * truyền tường-minh (KHÔNG hardcode). Dịch hành-vi StabilitySampler.kt.
 */
export function createStabilitySampler(opts?: {
  windowSize?: number;
  threshold?: number;
  modelName?: string;
}): StabilitySampler {
  const cfg = getModelConfig(opts?.modelName);
  const windowSize = opts?.windowSize ?? cfg.stabilityWindowSize;
  const threshold = opts?.threshold ?? cfg.stabilityThreshold;

  const buffer: number[] = [];

  return {
    push(accelMagnitude: number): StabilityReading {
      if (buffer.length >= windowSize) buffer.shift();
      buffer.push(accelMagnitude);
      const filled = buffer.length >= windowSize;
      const variance = sampleVariance(buffer);
      return { isStable: filled && variance < threshold, variance, filled };
    },
    reset(): void {
      buffer.length = 0;
    },
    size(): number {
      return buffer.length;
    },
  };
}
