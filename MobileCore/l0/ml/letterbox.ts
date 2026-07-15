/**
 * MobileCore l0/ml — letterbox math + un-letterbox + YOLO decode.
 *
 * Nguồn (repo orilife-mobile-app @ origin/claude/surface-data-collection):
 *   computeLetterbox: LetterboxProcessor.swift:110-124.
 *   un-letterbox:     YOLOTFLiteRunner.swift:437-445 `(v*inputSize - pad)/ratio`.
 *   decode + filters: YOLOTFLiteRunner.swift:420-465 (+ ScannerConfig filters).
 */

import type { Box, YoloDetection } from './types';
import type { ModelConfig } from './config';
import { DEFAULT_MODEL_CONFIG } from './config';

export interface LetterboxInfo {
  /** min(inputSize/w, inputSize/h) — hệ-số co giữ tỉ-lệ. */
  ratio: number;
  /** đệm trái (px, trong không-gian model). */
  padLeft: number;
  /** đệm trên (px, trong không-gian model). */
  padTop: number;
}

/**
 * Tham số letterbox đưa ảnh srcW×srcH → vuông inputSize×inputSize (giữ tỉ-lệ + đệm giữa).
 * Dịch LetterboxProcessor.computeLetterbox (L110-124):
 *   ratio = min(inputSize/w, inputSize/h); pad = (inputSize - w*ratio)/2 (mỗi trục).
 */
export function computeLetterbox(srcW: number, srcH: number, inputSize: number): LetterboxInfo {
  const scaleX = inputSize / srcW;
  const scaleY = inputSize / srcH;
  const ratio = Math.min(scaleX, scaleY);

  const scaledWidth = srcW * ratio;
  const scaledHeight = srcH * ratio;

  const padLeft = (inputSize - scaledWidth) / 2.0;
  const padTop = (inputSize - scaledHeight) / 2.0;

  return { ratio, padLeft, padTop };
}

/**
 * Đưa 1 toạ-độ CHUẨN-HOÁ [0,1] của model → PIXEL ảnh gốc.
 * Dịch YOLOTFLiteRunner.swift:437-445:  px = (normCoord*inputSize - pad) / ratio.
 * `pad` là padLeft cho trục X, padTop cho trục Y.
 */
export function unLetterbox(normCoord: number, pad: number, ratio: number, inputSize: number): number {
  return (normCoord * inputSize - pad) / ratio;
}

/**
 * Nghịch của unLetterbox: PIXEL ảnh gốc → toạ-độ CHUẨN-HOÁ [0,1] của model.
 * Suy từ letterbox (co rồi tịnh-tiến): modelPx = px*ratio + pad; norm = modelPx/inputSize.
 * Không có trong Swift (Swift chỉ đi 1 chiều lúc decode) — thêm để test round-trip
 * và cho tầng overlay chiếu box ngược lại. GIỮ khớp nghịch-đảo unLetterbox.
 */
export function letterboxCoord(pixel: number, pad: number, ratio: number, inputSize: number): number {
  return (pixel * ratio + pad) / inputSize;
}

/** Kẹp v vào [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface DecodeConfig {
  /** Kích thước ảnh gốc (pixel) để un-letterbox + clamp về. */
  originalWidth: number;
  originalHeight: number;
  /** Tham số letterbox đã tính lúc tiền-xử-lý. */
  letterbox: LetterboxInfo;
  /** Config model (ngưỡng/kích thước). Mặc định DEFAULT_MODEL_CONFIG. */
  model?: ModelConfig;
}

/**
 * Decode flat output[0] của YOLO-seg thành danh sách detection ở PIXEL ảnh gốc.
 *
 * `output`: mảng phẳng, mỗi detection dài `totalValues` (=38):
 *   [x1,y1,x2,y2 (chuẩn-hoá 0..1), conf, classId, + 32 mask coeff].
 * Dịch YOLOTFLiteRunner.swift:420-465. Bỏ nhánh "Format 2" (không tồn tại ở nguồn),
 * giữ đúng un-letterbox + clamp + các bộ lọc kích-thước/tỉ-lệ/lề.
 *
 * L0: KHÔNG gọi model — `output` do native cấp. `model` chỉ chọn ngưỡng/kích-thước.
 */
export function decodeYolo(output: ArrayLike<number>, cfg: DecodeConfig): YoloDetection[] {
  const m = cfg.model ?? DEFAULT_MODEL_CONFIG;
  const { originalWidth, originalHeight } = cfg;
  const { ratio, padLeft, padTop } = cfg.letterbox;
  const { inputSize, totalValues, numBoxValues, numMaskCoeffs, confThreshold } = m;

  const minW = originalWidth * m.minDetectionWidthPercent;
  const minH = originalHeight * m.minDetectionHeightPercent;
  const minArea = originalWidth * originalHeight * m.minDetectionAreaPercent;
  const marginX = originalWidth * 0.01;
  const marginY = originalHeight * 0.01;

  const out: YoloDetection[] = [];
  const numDetections = Math.min(m.numDetections, Math.floor(output.length / totalValues));

  for (let i = 0; i < numDetections; i++) {
    const base = i * totalValues;
    if (base + totalValues - 1 >= output.length) break;

    const v0 = output[base + 0];
    const v1 = output[base + 1];
    const v2 = output[base + 2];
    const v3 = output[base + 3];
    const conf = output[base + 4];
    const classId = Math.trunc(output[base + 5]);

    if (conf < confThreshold) continue;

    // Un-letterbox normalized [0,1] → pixel ảnh gốc.
    let x1 = unLetterbox(v0, padLeft, ratio, inputSize);
    let y1 = unLetterbox(v1, padTop, ratio, inputSize);
    let x2 = unLetterbox(v2, padLeft, ratio, inputSize);
    let y2 = unLetterbox(v3, padTop, ratio, inputSize);

    x1 = clamp(x1, 0, originalWidth);
    y1 = clamp(y1, 0, originalHeight);
    x2 = clamp(x2, 0, originalWidth);
    y2 = clamp(y2, 0, originalHeight);

    if (x2 <= x1 || y2 <= y1) continue;

    const bw = x2 - x1;
    const bh = y2 - y1;
    const area = bw * bh;
    const ar = bw / bh;

    // Bộ lọc (khớp Android): kích-thước, diện-tích, tỉ-lệ, lề.
    if (bw < minW || bh < minH || area < minArea) continue;
    if (ar < m.minAspectRatio || ar > m.maxAspectRatio) continue;
    if (
      x2 < marginX ||
      y2 < marginY ||
      x1 > originalWidth - marginX ||
      y1 > originalHeight - marginY
    ) {
      continue;
    }

    const maskCoeffs = new Array<number>(numMaskCoeffs);
    for (let k = 0; k < numMaskCoeffs; k++) {
      maskCoeffs[k] = output[base + numBoxValues + k];
    }

    const box: Box = { x: x1, y: y1, width: bw, height: bh };
    out.push({ box, confidence: conf, classId, maskCoeffs });
  }

  return out;
}
