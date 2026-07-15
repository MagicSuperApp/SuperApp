/**
 * MobileCore l0/ml — model config registry.
 *
 * `modelName` chỉ CHỌN config (ngưỡng/kích thước), KHÔNG kích inference.
 * Không hardcode "yolov26seg" trong các hàm toán — hàm nhận cfg/param.
 *
 * Nguồn số (repo orilife-mobile-app @ origin/claude/surface-data-collection):
 *   ios/LocalPods/ScannerModule/Core/Detection/ScannerConfig.swift
 *     modelInputSize=640 (L146), numDetections=300 (L147), numBoxValues=6 (L148),
 *     numMaskCoeffs=32 (L149), totalValues=38 (L150),
 *     yoloConfidenceThreshold=0.25 (L81), nmsIOUThreshold=0.45 (L96),
 *     sameTreeIOUThreshold=0.50 (L97), processingStabilityFrames=3 (L90),
 *     boxSmoothingAlpha=0.15 (L93), minDetectionWidthPercent=0.05 (L113),
 *     minDetectionHeightPercent=0.08 (L114), minDetectionAreaPercent=0.009 (L115),
 *     minAspectRatio=0.10 (L116), maxAspectRatio=10.0 (L117),
 *     maskThreshold=0.50 (L127), blurVarianceThreshold=100.0 (L136).
 *   ios/.../Core/Detection/SegmentationHelper.swift: protoSize=160, numProtos=32.
 *   android/.../treereid/TreeReIDYolo.kt: CONF_THRESHOLD=0.25 (gate).
 *   android/.../treereid/HeadingCaptureManager.kt: MIN_HEADING_DELTA=25,
 *     MIN_PITCH_DELTA=18, STEADY_RATE_THRESHOLD=1.5, STEADY_FRAMES_REQUIRED=3.
 */

export interface ModelConfig {
  /** Cạnh vuông ảnh vào model (letterbox target). */
  readonly inputSize: number;
  /** Số detection tối đa của output[0]. */
  readonly numDetections: number;
  /** Số giá-trị box đầu mỗi detection: x1,y1,x2,y2,conf,classId. */
  readonly numBoxValues: number;
  /** Số hệ-số mask sau phần box. */
  readonly numMaskCoeffs: number;
  /** Bước stride mỗi detection trong flat array = numBoxValues + numMaskCoeffs. */
  readonly totalValues: number;
  /** Cạnh vuông prototype mask (output[1]). */
  readonly protoSize: number;
  /** Số kênh prototype mask. */
  readonly numProtos: number;
  /** Ngưỡng confidence để giữ 1 detection khi decode. */
  readonly confThreshold: number;
  /** Ngưỡng IoU cho NMS (chồng > ngưỡng → loại box conf thấp hơn). */
  readonly nmsIouThreshold: number;
  /** Ngưỡng IoU coi 2 detection là CÙNG mục tiêu (tracking match). */
  readonly trackingIouThreshold: number;
  /** Số frame liên tiếp match để 1 tracker trở nên "ổn định". */
  readonly stableFrames: number;
  /**
   * Hệ-số EMA làm mượt box: smoothed = old*(1-α) + new*α.
   * ⚠️ Default ở đây = 0.3 (giá trị khởi-điểm/minh-hoạ, KHỚP vector kiểm thử).
   * KHÔNG phải α production iOS — ScannerConfig.boxSmoothingAlpha LIVE = 0.15 (mượt hơn).
   * Consumer production PHẢI truyền α thật của họ; smoothBox/trackDetections nhận α tham số.
   * (Không đặt 0.15 làm default để khỏi ngầm khoá 1 giá trị vào core; α là quyết định tuning của consumer.)
   */
  readonly smoothingAlpha: number;
  /** % chiều rộng ảnh gốc tối thiểu để giữ 1 box. */
  readonly minDetectionWidthPercent: number;
  /** % chiều cao ảnh gốc tối thiểu. */
  readonly minDetectionHeightPercent: number;
  /** % diện tích ảnh gốc tối thiểu. */
  readonly minDetectionAreaPercent: number;
  /** Tỉ-lệ khung (w/h) tối thiểu. */
  readonly minAspectRatio: number;
  /** Tỉ-lệ khung (w/h) tối đa. */
  readonly maxAspectRatio: number;
  /** Ngưỡng nhị-phân-hoá mask (mask > ngưỡng → foreground). */
  readonly maskThreshold: number;
  /** Ngưỡng Laplacian variance: variance < ngưỡng → coi là mờ. */
  readonly blurVarianceThreshold: number;
  /** Ngưỡng confidence cổng "có mục tiêu" (gatePass). */
  readonly gateConfThreshold: number;
  /** Kết quả detect cũ hơn ngưỡng này (ms) → gate coi như PASS (rơi về stillness). */
  readonly gateStalenessMs: number;
  /** |Δheading| (độ) tối thiểu so lần chụp gần nhất để trigger capture. */
  readonly minHeadingDelta: number;
  /** |Δpitch| (độ) tối thiểu. */
  readonly minPitchDelta: number;
  /** Tốc-độ xoay tức-thời (độ/frame) tối đa coi là "đứng yên". */
  readonly steadyRateThreshold: number;
  /** Số frame đứng-yên liên-tiếp cần có trước khi cho phép chụp. */
  readonly steadyFramesRequired: number;
}

/**
 * Config mặc định — bám ScannerConfig.swift + TreeReID (yolov26seg-seg),
 * NGOẠI TRỪ `smoothingAlpha` (xem chú thích field: default=0.3 minh-hoạ, iOS live=0.15).
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  inputSize: 640,
  numDetections: 300,
  numBoxValues: 6,
  numMaskCoeffs: 32,
  totalValues: 38,
  protoSize: 160,
  numProtos: 32,
  confThreshold: 0.25,
  nmsIouThreshold: 0.45,
  trackingIouThreshold: 0.5,
  stableFrames: 3,
  smoothingAlpha: 0.3,
  minDetectionWidthPercent: 0.05,
  minDetectionHeightPercent: 0.08,
  minDetectionAreaPercent: 0.009,
  minAspectRatio: 0.1,
  maxAspectRatio: 10.0,
  maskThreshold: 0.5,
  blurVarianceThreshold: 100.0,
  gateConfThreshold: 0.25,
  gateStalenessMs: 800,
  minHeadingDelta: 25.0,
  minPitchDelta: 18.0,
  steadyRateThreshold: 1.5,
  steadyFramesRequired: 3,
};

/** Registry theo TÊN model. Thêm biến thể ở đây, KHÔNG rải hằng vào hàm toán. */
const MODEL_CONFIGS: Readonly<Record<string, ModelConfig>> = {
  'yolov26seg': DEFAULT_MODEL_CONFIG,
};

/**
 * Lấy config theo tên model. `modelName` CHỈ để tra config (ngưỡng/kích thước),
 * KHÔNG kích inference. Không biết tên → trả DEFAULT (không ném) để pipeline không gãy.
 */
export function getModelConfig(modelName?: string): ModelConfig {
  if (modelName != null && modelName in MODEL_CONFIGS) {
    return MODEL_CONFIGS[modelName];
  }
  return DEFAULT_MODEL_CONFIG;
}
