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
 *
 * Nguồn ống-kính v0.2 (repo orilife-mobile-core @ review-mvp, com.mvp.orilife):
 *   sampling/StabilitySampler.kt: windowSize=15, stableThreshold=50 (variance |accel|).
 *   coordinator/CircularCaptureState.kt: 8 sector × 45° quét-vòng.
 *   coordinator/CircularCaptureStateMachine.kt: cooldown 1500ms sau mỗi lần chụp.
 *   detection/ImageCropper.kt: padding 30% bbox, clamp 30–120px.
 *   detection/SegmentationHelper.kt: feather dual-threshold inner=0.6 / outer=0.3.
 *   ⚠ LENS-CAPTURE/LENS-DETECT PHẢI mở lại nguồn trên đúng branch, đối chiếu số;
 *     lệch với giá trị dưới đây → BÁO orchestrator (đừng tự sửa config, đây là frozen).
 *   (heading cũ MIN_HEADING_DELTA/MIN_PITCH_DELTA/STEADY_* của HeadingCaptureManager.kt
 *    ĐÃ BỎ — bản delta-đơn 25° sai, thay bằng 8-sector + StabilitySampler.)
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
  /**
   * Số frame liên tiếp match để coi 1 detection "ổn định" trong pipeline XỬ LÝ
   * (PROCESSING_STABILITY_FRAMES nguồn = 3).
   */
  readonly stableFrames: number;
  /**
   * Số frame liên tiếp để tracker đánh dấu `isConfirmed` (chống chụp trùng cùng mục tiêu).
   * KHÁC `stableFrames`: nguồn `DetectionTracker.kt` dùng AR_OVERLAY_STABILITY_FRAMES=5
   * cho ngưỡng xác-nhận-tracker, tách khỏi PROCESSING_STABILITY_FRAMES=3.
   */
  readonly trackerConfirmFrames: number;
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

  // --- Ống kính v0.2: StabilitySampler (đo đứng-yên bằng variance |accel| theo cửa sổ) ---
  /** Số mẫu gia-tốc trong cửa sổ trượt để tính variance đứng-yên. */
  readonly stabilityWindowSize: number;
  /** Variance |accel| < ngưỡng này → coi là "đứng yên" (đủ ổn định để chụp). */
  readonly stabilityThreshold: number;

  // --- Ống kính v0.2: sector geometry (quét-vòng-quanh mục tiêu) ---
  /** Số cung chia đều 360° (mặc định 8). */
  readonly sectorCount: number;
  /** Độ rộng mỗi cung (độ) = 360 / sectorCount (mặc định 45). */
  readonly sectorSizeDeg: number;
  /** Thời gian nghỉ (ms) sau mỗi lần chụp trước khi cho chụp cung kế (chống chụp dồn). */
  readonly captureCooldownMs: number;

  // --- Ống kính v0.2: crop-rect quanh bbox (thêm ngữ cảnh cho backend AI) ---
  /** % mở rộng bbox mỗi chiều khi crop (0.30 = +30%). */
  readonly cropPaddingPercent: number;
  /** Padding tối thiểu (px) sau khi tính theo %. */
  readonly cropPaddingMinPx: number;
  /** Padding tối đa (px). */
  readonly cropPaddingMaxPx: number;

  // --- Ống kính v0.2: feather mask mềm 2 ngưỡng (viền alpha gradient) ---
  /** Ngưỡng trong: mask ≥ inner → alpha=1 (foreground chắc). */
  readonly featherInnerThreshold: number;
  /** Ngưỡng ngoài: mask ≤ outer → alpha=0; giữa 2 ngưỡng nội-suy tuyến-tính. */
  readonly featherOuterThreshold: number;
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
  trackerConfirmFrames: 5,
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
  // Ống kính v0.2 (nguồn orilife-mobile-core@review-mvp — xem docstring đầu file):
  stabilityWindowSize: 15,
  stabilityThreshold: 50.0,
  sectorCount: 8,
  sectorSizeDeg: 45.0,
  captureCooldownMs: 1500,
  cropPaddingPercent: 0.3,
  cropPaddingMinPx: 30,
  cropPaddingMaxPx: 120,
  featherInnerThreshold: 0.6,
  featherOuterThreshold: 0.3,
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
