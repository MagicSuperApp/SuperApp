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
 * Đọc phần SỐ của id dạng `t<n>`. Không parse được → 0.
 * Dùng để suy bộ-đếm đơn-điệu từ prev khi gọi trackDetections thuần (không kèm state).
 */
function idNum(id: string | undefined): number {
  if (id == null) return 0;
  const m = /^t(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/**
 * Bước tracking prev→curr. Với mỗi detection hiện tại:
 *   - tìm tracker cũ (chưa bị dùng ở frame này) có IoU > trackingIouThreshold
 *     → làm mượt box (EMA) + count+1; giữ NGUYÊN id; cập-nhật averageConfidence
 *     (trung-bình chạy các lần match) + isConfirmed (count ≥ trackerConfirmFrames);
 *   - không match → tracker MỚI: box giữ nguyên, count=1, id mới đơn-điệu,
 *     averageConfidence = confidence (giống DetectionTracker.kt L94-104).
 * Trả danh sách tracker của frame hiện tại (matched-đã-mượt + mới).
 *
 * Dịch DetectionTracker.track (L70-110) + findBestMatch (L120-134) +
 * updateStableDetection (L136-156). Khác biệt CHỦ Ý với Kotlin:
 *   - id: Kotlin sinh key theo System.currentTimeMillis() (KHÔNG tất-định); ở L0
 *     ta dùng bộ-đếm đơn-điệu `t1,t2,…` (tất-định, không phụ thuộc đồng-hồ/random).
 *   - averageConfidence: trung-bình chạy trên MỌI lần match (Kotlin có quirk bỏ
 *     sót conf frame đầu khỏi list); ở đây tính đủ = (prevAvg*count + conf)/(count+1).
 *   - match: gán GLOBAL theo IoU GIẢM DẦN (KHÔNG greedy-theo-hàng). Dựng mọi cặp
 *     det×prev có IoU > ngưỡng, sắp IoU giảm dần (tie-break tất-định: detIdx rồi prevIdx),
 *     duyệt và khớp cặp nào cả det LẪN prev còn trống → cặp IoU cao nhất thắng bất-kể
 *     vị-trí trong mảng. Vì vậy kết-quả KHÔNG phụ-thuộc thứ-tự mảng curr (hình-học 2 frame
 *     giống nhau → gán như nhau). Greedy-theo-hàng sai: khi ≥2 det tranh 1 tracker, det
 *     đứng TRƯỚC (IoU yếu, vừa qua ngưỡng) chiếm tracker, det đứng SAU (IoU khít hơn) mất
 *     id/count/isConfirmed → HOÁN ĐỔI danh-tính → gắn ảnh nhầm cây (hỏng dữ-liệu lõi).
 *     (Mạnh hơn DetectionTracker.findBestMatch của Kotlin — bản đó best-per-detection theo
 *      thứ-tự, vẫn dính lỗi phụ-thuộc thứ-tự này.)
 *   - id tracker MỚI cấp theo THỨ-TỰ curr (giữ id t1,t2… tất-định theo input order).
 */
export function trackDetections(
  prev: TrackedDetection[],
  curr: DetectionInput[],
  cfg?: { model?: ModelConfig; alpha?: number; allocId?: () => string },
): TrackedDetection[] {
  const model = cfg?.model ?? DEFAULT_MODEL_CONFIG;
  const alpha = cfg?.alpha ?? model.smoothingAlpha;
  const trackingIou = model.trackingIouThreshold;
  const confirmFrames = model.trackerConfirmFrames;

  // Bộ-cấp id: dùng allocId của state tracker nếu có (đơn-điệu toàn-cục), ngược lại
  // suy từ max id trong prev (đơn-điệu trong tầm dữ-liệu 1 bước, vẫn tất-định).
  let nextId = 1;
  for (const p of prev) nextId = Math.max(nextId, idNum(p.id) + 1);
  const allocId = cfg?.allocId ?? (() => `t${nextId++}`);

  // Gán GLOBAL theo IoU giảm dần — KHÔNG greedy-theo-hàng (chống phụ-thuộc thứ-tự curr).
  // 1. Mọi cặp (det, prev) có IoU > ngưỡng.
  const cand: { d: number; p: number; io: number }[] = [];
  for (let d = 0; d < curr.length; d++) {
    for (let p = 0; p < prev.length; p++) {
      const io = iou(prev[p].box, curr[d].box);
      if (io > trackingIou) cand.push({ d, p, io });
    }
  }
  // 2. IoU GIẢM DẦN; tie-break TẤT-ĐỊNH (detIdx tăng, rồi prevIdx tăng).
  cand.sort((a, b) => b.io - a.io || a.d - b.d || a.p - b.p);
  // 3. Khớp cặp nào cả det LẪN prev còn trống — cặp IoU cao nhất được ưu-tiên trước.
  const usedPrev = new Set<number>();
  const usedDet = new Set<number>();
  const matchPrevOf = new Array<number>(curr.length).fill(-1);
  for (const c of cand) {
    if (usedDet.has(c.d) || usedPrev.has(c.p)) continue;
    usedDet.add(c.d);
    usedPrev.add(c.p);
    matchPrevOf[c.d] = c.p;
  }

  // 4. Dựng kết-quả theo THỨ-TỰ curr (id tracker mới cấp tất-định theo input order).
  const result: TrackedDetection[] = [];
  for (let d = 0; d < curr.length; d++) {
    const det = curr[d];
    const matchIdx = matchPrevOf[d];
    if (matchIdx >= 0) {
      const entry = prev[matchIdx];
      const smoothed = smoothBox(entry.box, det.box, alpha);
      const newCount = entry.count + 1;
      const prevAvg = entry.averageConfidence ?? entry.confidence;
      const avg = (prevAvg * entry.count + det.confidence) / newCount;
      result.push({
        box: smoothed,
        confidence: det.confidence,
        classId: det.classId,
        count: newCount,
        id: entry.id ?? allocId(),
        isConfirmed: newCount >= confirmFrames,
        averageConfidence: avg,
      });
    } else {
      result.push({
        box: det.box,
        confidence: det.confidence,
        classId: det.classId,
        count: 1,
        id: allocId(),
        isConfirmed: 1 >= confirmFrames,
        averageConfidence: det.confidence,
      });
    }
  }

  return result;
}

/** Chỉ giữ tracker đã "xác nhận" (count ≥ trackerConfirmFrames). Dịch ý DetectionFilter/isConfirmed. */
export function filterConfirmed(dets: TrackedDetection[]): TrackedDetection[] {
  return dets.filter((d) => d.isConfirmed === true);
}

/**
 * State tracker BỀN qua nhiều frame — giữ prev + bộ-đếm id đơn-điệu toàn-cục.
 * Bọc trackDetections để id KHÔNG tái-dùng kể cả khi caller tự cắt tỉa danh sách.
 */
export interface TrackerState {
  /** Tracker của frame ngay trước (đầu vào cho bước kế). */
  prev: TrackedDetection[];
  /** Số thứ-tự id kế-tiếp (đơn-điệu, không lùi). */
  nextId: number;
}

/** Khởi tạo state tracker rỗng (đếm id bắt đầu từ 1). */
export function initTrackerState(): TrackerState {
  return { prev: [], nextId: 1 };
}

/**
 * 1 bước tracking có-state: match curr với state.prev, cấp id đơn-điệu toàn-cục.
 * Trả state mới (prev = kết-quả, nextId đã tiến) + danh sách tracker frame này.
 */
export function stepTracker(
  state: TrackerState,
  curr: DetectionInput[],
  cfg?: { model?: ModelConfig; alpha?: number },
): { state: TrackerState; tracked: TrackedDetection[] } {
  let counter = state.nextId;
  const allocId = () => `t${counter++}`;
  const tracked = trackDetections(state.prev, curr, {
    model: cfg?.model,
    alpha: cfg?.alpha,
    allocId,
  });
  return { state: { prev: tracked, nextId: counter }, tracked };
}
