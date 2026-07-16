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

// Letterbox + decode YOLO + proto-layout auto-detect.
export {
  computeLetterbox,
  unLetterbox,
  letterboxCoord,
  decodeYolo,
  decodeProtoMasks,
  type LetterboxInfo,
  type DecodeConfig,
  type ProtoLayout,
  type ProtoMasks,
} from './letterbox';

// Tracking + EMA + stable-id/confirm.
export {
  smoothBox,
  trackDetections,
  filterConfirmed,
  initTrackerState,
  stepTracker,
  type DetectionInput,
  type TrackerState,
} from './tracking';

// Blur (Laplacian variance) + vỏ boolean.
export { blurVariance, isBlurry, sharpnessScore } from './blur';

// Mask segmentation + feather + crop-mapping.
export {
  sigmoid,
  reconstructMask,
  resizeMaskBilinear,
  thresholdMask,
  isValidMask,
  assertValidMask,
  featherMask,
  mapBoxToProto,
  applyMaskToCrop,
} from './mask';

// Crop-rect quanh bbox (Box-level, tái dùng letterbox).
export {
  cropRectForBox,
  unionBox,
  cropRectForDetections,
  cropRectForModelBox,
  type CropConfig,
} from './crop';

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

// Chuẩn-hoá góc + quyết-định-chụp theo cung (stateless; SESSION FSM là của OriLife).
export {
  normalizeAngle,
  signedAngleDelta,
  decideSectorCapture,
  type SectorCaptureInput,
  type SectorCaptureDecision,
} from './heading';

// Orientation producer (sensor-fusion, phần toán thuần — engine cảm biến ở L1).
export {
  computeOrientationFromRotationMatrix,
  accelOnlyTilt,
  lowPassAngleFilter,
  type Orientation,
  type Tilt,
} from './orientation';

// Stability sampler (nhà DUY NHẤT đo đứng-yên bằng variance |accel| cửa-sổ).
export {
  sampleVariance,
  createStabilitySampler,
  type StabilityReading,
  type StabilitySampler,
} from './stability';

// Sector geometry 8×45° + guidance CW/CCW (hình học thuần, không state-machine).
export {
  headingToSector,
  sectorCenter,
  sectorContainsHeading,
  guidanceToTarget,
  remainingSectors,
  nearestUncapturedSector,
  type Guidance,
} from './sector';
