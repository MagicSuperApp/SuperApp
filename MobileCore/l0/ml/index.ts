/**
 * MobileCore l0/ml — toán ML thuần TS (post-process YOLO-seg, mask, blur, tracking,
 * capture-by-heading). Dịch từ Swift/Kotlin gốc của orilife-mobile-app.
 *
 * RANH GIỚI L0: CHỈ toán trên mảng số ĐÃ CÓ. KHÔNG gọi TFLite/inference, KHÔNG đọc
 * pixel buffer/tensor runtime. Input là number[]/Float32Array do native cấp; output là
 * số. `modelName` CHỈ chọn config (ngưỡng/kích-thước) qua getModelConfig — KHÔNG kích model.
 *
 * Nhóm rủi ro cao (sai toạ-độ lặng-lẽ, không crash) → mỗi hàm có vector số đối-chiếu nguồn
 * trong __tests__/ml.test.ts.
 */

// Config theo model-name (chọn ngưỡng, KHÔNG inference).
export {
  getModelConfig,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from './config';

// Shape số dùng chung.
export type { Box, ScoredBox, YoloDetection, TrackedDetection } from './types';

// NMS + IoU.
export { iou, nms } from './nms';

// Letterbox + decode YOLO.
export {
  computeLetterbox,
  unLetterbox,
  letterboxCoord,
  decodeYolo,
  type LetterboxInfo,
  type DecodeConfig,
} from './letterbox';

// Tracking + EMA.
export { smoothBox, trackDetections, type DetectionInput } from './tracking';

// Blur (Laplacian variance).
export { blurVariance } from './blur';

// Mask segmentation.
export {
  sigmoid,
  reconstructMask,
  resizeMaskBilinear,
  thresholdMask,
  isValidMask,
  assertValidMask,
} from './mask';

// Frame purpose classifier (harvest TS).
export {
  classifyFrame,
  selectBestPerSlot,
  type FramePurpose,
  type FrameQualityMetrics,
  type FrameFruitDetection,
} from './frameClassifier';

// Cổng "có mục tiêu".
export { gatePass, requireTarget, type GateState } from './gate';

// Capture-by-heading + chuẩn-hoá góc.
export {
  normalizeAngle,
  signedAngleDelta,
  captureByHeading,
  initHeadingState,
  type HeadingState,
  type HeadingSample,
  type HeadingResult,
} from './heading';
