/**
 * MobileCore l0/ml — NMS + IoU.
 *
 * Dịch 1:1 từ ios/LocalPods/ScannerModule/Core/Detection/NMSHelper.swift
 *   (repo orilife-mobile-app @ origin/claude/surface-data-collection).
 *   calculateIoU: L49-58.  applyNMS: L13-49.
 * Khớp Android applyNMS() trong YOLODetectionHelper.kt (theo comment nguồn).
 */

import type { Box, ScoredBox } from './types';

/**
 * Intersection-over-Union của 2 hình chữ nhật (gốc trái-trên).
 * Nguồn NMSHelper.swift:50-58:
 *   interX = max(0, min(a.maxX,b.maxX) - max(a.minX,b.minX))
 *   interY = max(0, min(a.maxY,b.maxY) - max(a.minY,b.minY))
 *   union  = a.w*a.h + b.w*b.h - inter ;  union<=0 → 0
 */
export function iou(a: Box, b: Box): number {
  const aMinX = a.x;
  const aMinY = a.y;
  const aMaxX = a.x + a.width;
  const aMaxY = a.y + a.height;
  const bMinX = b.x;
  const bMinY = b.y;
  const bMaxX = b.x + b.width;
  const bMaxY = b.y + b.height;

  const interX = Math.max(0, Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX));
  const interY = Math.max(0, Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY));
  const interArea = interX * interY;

  const unionArea = a.width * a.height + b.width * b.height - interArea;
  if (unionArea <= 0) return 0;
  return interArea / unionArea;
}

/**
 * Non-Maximum Suppression. Trả về CHỈ SỐ (theo mảng gốc) các box GIỮ LẠI.
 * Dịch NMSHelper.swift:13-49:
 *   - sắp theo confidence GIẢM DẦN (giữ index gốc);
 *   - duyệt, box chưa bị suppress → giữ; suppress các box CÙNG classId phía sau
 *     có IoU > iouThreshold.
 * Lưu ý: chỉ suppress khi cùng class (khác class không đè nhau).
 */
export function nms(boxes: ScoredBox[], iouThreshold: number): number[] {
  if (boxes.length === 0) return [];

  // (index gốc, box) sắp theo confidence giảm dần.
  const sorted = boxes
    .map((element, offset) => ({ offset, element }))
    .sort((p, q) => q.element.confidence - p.element.confidence);

  const suppressed = new Array<boolean>(boxes.length).fill(false);
  const keep: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const { offset: originalIdx, element: box } = sorted[i];
    if (suppressed[originalIdx]) continue;

    keep.push(originalIdx);

    for (let j = i + 1; j < sorted.length; j++) {
      const { offset: otherIdx, element: otherBox } = sorted[j];
      if (suppressed[otherIdx]) continue;
      // Chỉ suppress box cùng class.
      if (box.classId !== otherBox.classId) continue;

      if (iou(box, otherBox) > iouThreshold) {
        suppressed[otherIdx] = true;
      }
    }
  }

  return keep;
}
