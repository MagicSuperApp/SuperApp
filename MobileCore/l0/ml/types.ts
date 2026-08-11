/**
 * MobileCore l0/ml — shape dùng chung cho toán ML.
 * L0 rule: chỉ mảng số / struct số. KHÔNG chạm pixel buffer / tensor runtime.
 */

/** Hình chữ nhật gốc trái-trên (x,y) + kích thước — tương ứng CGRect của Swift. */
export interface Box {
  /** minX (gốc trái). */
  x: number;
  /** minY (gốc trên). */
  y: number;
  /** chiều rộng (≥ 0). */
  width: number;
  /** chiều cao (≥ 0). */
  height: number;
}

/** 1 detection thô: box + confidence + lớp. Đầu vào cho NMS. */
export interface ScoredBox extends Box {
  confidence: number;
  classId: number;
}

/** 1 YOLO detection sau decode: box ở toạ-độ PIXEL ảnh gốc + coeff mask. */
export interface YoloDetection {
  /** Box pixel trong ảnh gốc (đã un-letterbox + clamp). */
  box: Box;
  confidence: number;
  classId: number;
  /** 32 hệ-số mask (dùng dựng lại mask ở tầng sau). */
  maskCoeffs: number[];
}

/** 1 tracker: detection đã làm mượt + số lần match liên tiếp. */
export interface TrackedDetection {
  box: Box;
  confidence: number;
  classId: number;
  /** Số frame liên tiếp đã match (≥ 1). */
  count: number;
  /**
   * ID bền qua các frame (LENS-DETECT gán khi tracker mới sinh; giữ nguyên khi match).
   * Dùng để KHÔNG chụp trùng cùng 1 mục tiêu qua nhiều frame. Optional để không phá
   * consumer cũ chỉ đọc box/count.
   */
  id?: string;
  /** true khi count ≥ stableFrames (đã "xác nhận", đủ tin để chụp/upload). */
  isConfirmed?: boolean;
  /** Trung bình confidence các lần match (ổn định hơn 1 frame lẻ). */
  averageConfidence?: number;
}
