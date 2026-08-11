// MobileCore l0/ml — frame purpose classifier.
//
// HARVEST TRỰC TIẾP (đã là TS thuần) từ repo orilife-mobile-app
//   @ origin/claude/surface-data-collection : src/modules/capture3d/utils/frameClassifier.ts
// Giữ nguyên thuật-toán + ngưỡng + comment giải-thích (tri-thức field), chỉ đặt vào l0/ml.
//
// Build 52 (2026-05-17) — Frame purpose classifier algorithm.
// User mandate: "Phải có thuật toán để tính chính xác frame nào cho train AI,
// frame nào để làm chứng cứ lịch sử của quả."
// SPEC: docs/build52/CAPTURE3D-REDESIGN-V2-SPEC.md § Frame Purpose Classifier
// Owner: Lợi (Backend AI) — chạy post-capture, persist vào manifest 3dmesh/2.0

export type FramePurpose =
  | 'training_candidate' // best lit + sharpest, for AI model training
  | 'evidence' // fruit visible với confidence cao, for audit history
  | 'both' // qualifies cả 2 (default cho 15-frame current flow)
  | 'discard'; // blurry / overexposed / no fruit

export interface FrameQualityMetrics {
  /** Laplacian variance — sharpness score (higher = sharper). 0-1000+ range. */
  sharpness_laplacian_var: number;
  /** Mean luminance frame [0, 1]. 0.3-0.75 = well-exposed. */
  exposure_mean: number;
  /** Gyro angular velocity magnitude squared at capture instant. Lower = stiller. */
  motion_blur_score: number;
}

export interface FrameFruitDetection {
  frame_index: number;
  confidence: number;
  bbox_pixels?: { x: number; y: number; w: number; h: number };
}

// Thresholds (calibrated for iPhone 14 Pro outdoor sầu riêng Đắk Lắk)
const SHARPNESS_TRAINING_MIN = 100.0;
const SHARPNESS_DISCARD_MAX = 50.0;
const EXPOSURE_TRAINING_RANGE: [number, number] = [0.3, 0.75];
const EXPOSURE_DISCARD_RANGE: [number, number] = [0.15, 0.85];
const BLUR_TRAINING_MAX = 0.2;
const BLUR_DISCARD_MAX = 0.5;
const EVIDENCE_CONFIDENCE_MIN = 0.7;

/**
 * Classify single frame purpose dựa quality metrics + fruit detections.
 *
 * Algorithm:
 *   1. Discard nếu chất lượng quá kém (sharp < 50, blur > 0.5, exposure ngoài [0.15, 0.85])
 *   2. Evidence nếu có fruit detected với confidence >= 0.7
 *   3. Training_candidate nếu chất lượng cao (sharp >= 100, blur <= 0.2, exposure [0.3, 0.75])
 *   4. Both nếu qualify cả training + evidence
 *   5. Default discard nếu acceptable quality nhưng no fruit + not best-of-slot
 */
export function classifyFrame(
  metrics: FrameQualityMetrics,
  fruitsInFrame: FrameFruitDetection[],
): FramePurpose {
  const { sharpness_laplacian_var, exposure_mean, motion_blur_score } = metrics;

  // 1. Discard threshold
  if (
    sharpness_laplacian_var < SHARPNESS_DISCARD_MAX ||
    motion_blur_score > BLUR_DISCARD_MAX ||
    exposure_mean < EXPOSURE_DISCARD_RANGE[0] ||
    exposure_mean > EXPOSURE_DISCARD_RANGE[1]
  ) {
    return 'discard';
  }

  // 2. Evidence check
  const maxFruitConf =
    fruitsInFrame.length > 0 ? Math.max(...fruitsInFrame.map((d) => d.confidence)) : 0;
  const isEvidence = maxFruitConf >= EVIDENCE_CONFIDENCE_MIN;

  // 3. Training candidate check
  const isTraining =
    sharpness_laplacian_var >= SHARPNESS_TRAINING_MIN &&
    motion_blur_score <= BLUR_TRAINING_MAX &&
    exposure_mean >= EXPOSURE_TRAINING_RANGE[0] &&
    exposure_mean <= EXPOSURE_TRAINING_RANGE[1];

  // 4. Combine
  if (isTraining && isEvidence) return 'both';
  if (isTraining) return 'training_candidate';
  if (isEvidence) return 'evidence';
  return 'discard';
}

/**
 * Slot dedup post-classifier: keep ≤ 3 best frames per (horizontal × vertical) slot.
 *   - 1 best `training_candidate` (highest sharpness)
 *   - 1 best `evidence` per detected fruit (highest fruit confidence)
 *   - 1 backup `both` if available
 *
 * Returns indices của frames to KEEP. Caller filters bundle.
 */
export function selectBestPerSlot(
  frames: Array<{
    frame_index: number;
    slot_key: string;
    purpose: FramePurpose;
    sharpness: number;
    max_fruit_conf: number;
  }>,
): number[] {
  const bySlot = new Map<string, typeof frames>();
  for (const f of frames) {
    if (!bySlot.has(f.slot_key)) bySlot.set(f.slot_key, []);
    bySlot.get(f.slot_key)!.push(f);
  }

  const keep = new Set<number>();
  for (const [, slotFrames] of bySlot) {
    // Best training_candidate hoặc both, sharpest
    const trainingCandidates = slotFrames
      .filter((f) => f.purpose === 'training_candidate' || f.purpose === 'both')
      .sort((a, b) => b.sharpness - a.sharpness);
    if (trainingCandidates.length > 0) keep.add(trainingCandidates[0].frame_index);

    // Best evidence, highest fruit confidence
    const evidence = slotFrames
      .filter((f) => f.purpose === 'evidence' || f.purpose === 'both')
      .sort((a, b) => b.max_fruit_conf - a.max_fruit_conf);
    if (evidence.length > 0) keep.add(evidence[0].frame_index);

    // Backup `both` (already included above nếu sharpest)
    const both = slotFrames.filter((f) => f.purpose === 'both');
    if (both.length > 0) keep.add(both[0].frame_index);
  }

  return Array.from(keep).sort((a, b) => a - b);
}
