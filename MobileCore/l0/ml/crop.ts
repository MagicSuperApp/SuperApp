/**
 * MobileCore l0/ml — crop-rect quanh bbox (nới ngữ-cảnh cho backend AI) + union nhiều box.
 *
 * Nguồn: app/src/main/java/com/mvp/orilife/detection/ImageCropper.kt
 *   (repo orilife-mobile-core @ review-mvp, com.mvp.orilife).
 *   cropWithPadding: L150-183 (padding 30% clamp 30–120px, kẹp biên ảnh).
 *   cropAllDetections: L185-227 (union bbox rồi cùng logic padding).
 *   hằng DEFAULT_PADDING_PERCENT=0.30, MIN_PADDING=30, MAX_PADDING=120 (L37-39).
 *
 * L0: CHỈ toán trên Box số — trả khung crop (x,y,width,height) ở pixel ảnh gốc. KHÔNG
 * đọc/tạo bitmap (đó là L1). Toán letterbox TÁI DÙNG từ ./letterbox, KHÔNG viết lại.
 */

import type { Box } from './types';
import type { ModelConfig } from './config';
import type { LetterboxInfo } from './letterbox';
import { DEFAULT_MODEL_CONFIG } from './config';
import { unLetterbox } from './letterbox';

/** Cấu-hình padding cho crop (chỉ 3 field cần từ ModelConfig). */
export type CropConfig = Pick<
  ModelConfig,
  'cropPaddingPercent' | 'cropPaddingMinPx' | 'cropPaddingMaxPx'
>;

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(v)));
}

/**
 * Khung crop quanh 1 bbox: kẹp bbox về biên ảnh, nới padding = %-bề-rộng/cao (kẹp [min,max]
 * px, tính RIÊNG mỗi trục như Kotlin), rồi kẹp khung về biên ảnh. Trả Box pixel ảnh gốc.
 * Dịch ImageCropper.cropWithPadding (L150-183). bbox rỗng sau kẹp → ném RangeError.
 */
export function cropRectForBox(
  box: Box,
  imgW: number,
  imgH: number,
  cfg: CropConfig = DEFAULT_MODEL_CONFIG,
): Box {
  const bL = clampInt(box.x, 0, imgW);
  const bT = clampInt(box.y, 0, imgH);
  const bR = clampInt(box.x + box.width, 0, imgW);
  const bB = clampInt(box.y + box.height, 0, imgH);
  const bw = bR - bL;
  const bh = bB - bT;
  if (bw <= 0 || bh <= 0) {
    throw new RangeError(`cropRectForBox: empty box after clamp (${bw}×${bh})`);
  }

  const px = clampInt(bw * cfg.cropPaddingPercent, cfg.cropPaddingMinPx, cfg.cropPaddingMaxPx);
  const py = clampInt(bh * cfg.cropPaddingPercent, cfg.cropPaddingMinPx, cfg.cropPaddingMaxPx);

  const l = Math.max(bL - px, 0);
  const t = Math.max(bT - py, 0);
  const r = Math.min(bR + px, imgW);
  const b = Math.min(bB + py, imgH);

  return { x: l, y: t, width: r - l, height: b - t };
}

/**
 * Hộp bao (union) nhiều box: minX/minY và maxX/maxY của tất-cả. Rỗng → ném RangeError.
 * Dịch phần min/max của cropAllDetections (L189-193).
 */
export function unionBox(boxes: Box[]): Box {
  if (boxes.length === 0) throw new RangeError('unionBox: empty list');
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Khung crop bao NHIỀU detection trong 1 ảnh: union bbox rồi nới padding (cùng logic
 * cropRectForBox). Dịch cropAllDetections (L185-227). Rỗng → ném RangeError.
 */
export function cropRectForDetections(
  boxes: Box[],
  imgW: number,
  imgH: number,
  cfg: CropConfig = DEFAULT_MODEL_CONFIG,
): Box {
  return cropRectForBox(unionBox(boxes), imgW, imgH, cfg);
}

/**
 * Khung crop từ box CHUẨN-HOÁ [0,1] của model (không-gian letterbox): un-letterbox 4 mép
 * về pixel ảnh gốc (TÁI DÙNG unLetterbox — KHÔNG viết lại toán `(v*inputSize-pad)/ratio`),
 * rồi crop như cropRectForBox. Tiện cho pipeline nhận thẳng đầu-ra model.
 */
export function cropRectForModelBox(
  normBox: Box,
  letterbox: LetterboxInfo,
  imgW: number,
  imgH: number,
  cfg: ModelConfig = DEFAULT_MODEL_CONFIG,
): Box {
  const { ratio, padLeft, padTop } = letterbox;
  const inputSize = cfg.inputSize;
  const x1 = unLetterbox(normBox.x, padLeft, ratio, inputSize);
  const y1 = unLetterbox(normBox.y, padTop, ratio, inputSize);
  const x2 = unLetterbox(normBox.x + normBox.width, padLeft, ratio, inputSize);
  const y2 = unLetterbox(normBox.y + normBox.height, padTop, ratio, inputSize);
  const pixelBox: Box = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  return cropRectForBox(pixelBox, imgW, imgH, cfg);
}
