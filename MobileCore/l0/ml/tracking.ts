/**
 * MobileCore l0/ml — tracking (IoU match) + EMA làm mượt box.
 *
 * Nguồn: ios/LocalPods/ScannerModule/Core/Detection/DetectionTracker.swift
 *   (repo orilife-mobile-app @ origin/claude/surface-data-collection).
 *   smoothBox: L95-104 (EMA).  match theo IoU: findMatchingTracker L118-129.
 *   update count + smoothing: track() L40-70.
 *
 * Khác biệt L0: bản gốc là class có state theo frame (aging theo frame index).
 * Ở L0 ta tách phần TOÁN thuần: 1 bước prev→curr (match + smooth + đếm).
 * Aging theo thời-gian/frame là việc tầng điều-phối, KHÔNG thuộc toán này.
 */

import type { Box, TrackedDetection } from './types';
import type { ModelConfig } from './config';
import { DEFAULT_MODEL_CONFIG } from './config';
import { iou } from './nms';

/**
 * EMA làm mượt box: smoothed = current*(1-α) + next*α.
 * Dịch DetectionTracker.smoothBox (L95-104). α mặc định lấy từ config
 * (xem chú thích MÂU THUẪN 0.15 vs 0.3 ở config.ts).
 */
export function smoothBox(current: Box, next: Box, alpha: number = DEFAULT_MODEL_CONFIG.smoothingAlpha): Box {
  const a = alpha;
  return {
    x: current.x * (1 - a) + next.x * a,
    y: current.y * (1 - a) + next.y * a,
    width: current.width * (1 - a) + next.width * a,
    height: current.height * (1 - a) + next.height * a,
  };
}

/** 1 detection đầu vào cho tracking (box + điểm + lớp). */
export interface DetectionInput {
  box: Box;
  confidence: number;
  classId: number;
}

/**
 * Bước tracking prev→curr. Với mỗi detection hiện tại:
 *   - tìm tracker cũ (chưa bị dùng ở frame này) có IoU > trackingIouThreshold
 *     → làm mượt box (EMA) + count+1;
 *   - không match → tracker MỚI, box giữ nguyên, count=1 (giống Swift: khởi tạo
 *     tracker mới bằng det.rect chưa mượt).
 * Trả danh sách tracker của frame hiện tại (matched-đã-mượt + mới).
 * Dịch DetectionTracker.track (L40-70) + findMatchingTracker (L118-129).
 */
export function trackDetections(
  prev: TrackedDetection[],
  curr: DetectionInput[],
  cfg?: { model?: ModelConfig; alpha?: number },
): TrackedDetection[] {
  const model = cfg?.model ?? DEFAULT_MODEL_CONFIG;
  const alpha = cfg?.alpha ?? model.smoothingAlpha;
  const trackingIou = model.trackingIouThreshold;

  const usedPrev = new Set<number>();
  const result: TrackedDetection[] = [];

  for (const det of curr) {
    // Tìm tracker cũ khớp IoU, loại các tracker đã match ở frame này.
    let matchIdx = -1;
    for (let k = 0; k < prev.length; k++) {
      if (usedPrev.has(k)) continue;
      if (iou(prev[k].box, det.box) > trackingIou) {
        matchIdx = k;
        break;
      }
    }

    if (matchIdx >= 0) {
      const entry = prev[matchIdx];
      usedPrev.add(matchIdx);
      const smoothed = smoothBox(entry.box, det.box, alpha);
      result.push({
        box: smoothed,
        confidence: det.confidence,
        classId: det.classId,
        count: entry.count + 1,
      });
    } else {
      result.push({
        box: det.box,
        confidence: det.confidence,
        classId: det.classId,
        count: 1,
      });
    }
  }

  return result;
}
