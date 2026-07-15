/**
 * MobileCore l0/ml — dựng lại + resize + ngưỡng + kiểm-tra mask segmentation.
 *
 * Nguồn: ios/LocalPods/ScannerModule/Core/Detection/SegmentationHelper.swift
 *   (repo orilife-mobile-app @ origin/claude/surface-data-collection).
 *   sigmoid: L427-435.  reconstructMask: L37-80.  resizeMaskToBox: L192-234.
 *   ngưỡng mask (maskValue > threshold → giữ): applyMaskToBitmap L280-292.
 *   isValidMask: L387-403.
 *
 * L0: nhận/ trả MẢNG SỐ (Float). KHÔNG dựng CGImage / đọc pixel buffer.
 */

import { MobileCoreError } from '../errors';
import { DEFAULT_MODEL_CONFIG } from './config';

/**
 * Sigmoid ổn-định số (Swift SegmentationHelper.sigmoid L427-435):
 *   x≥0 → 1/(1+e^-x) ;  x<0 → e^x/(1+e^x).
 */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1.0 / (1.0 + e);
  }
  const e = Math.exp(x);
  return e / (1.0 + e);
}

/**
 * Dựng mask 2D [size][size] từ hệ-số + prototype mask.
 *   mask[y][x] = sigmoid( Σ_i coeffs[i] × protos[i][y*size + x] ).
 * Dịch reconstructMask (L37-80). `protos[i]` là kênh i phẳng (size*size).
 * `size` mặc định = protoSize của config (160). Thiếu coeff/proto → ném ml/invalid-mask.
 */
export function reconstructMask(
  coeffs: ArrayLike<number>,
  protos: ArrayLike<number>[],
  size: number = DEFAULT_MODEL_CONFIG.protoSize,
): number[][] {
  const numProtos = protos.length;
  if (coeffs.length < numProtos) {
    throw new MobileCoreError('ml/invalid-mask', 'reconstructMask: coeffs fewer than proto channels', {
      detail: { coeffs: coeffs.length, protos: numProtos },
    });
  }

  const mask: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row = new Array<number>(size);
    for (let x = 0; x < size; x++) {
      let s = 0;
      const idx = y * size + x;
      for (let i = 0; i < numProtos; i++) {
        const channel = protos[i];
        if (idx < channel.length) s += coeffs[i] * channel[idx];
      }
      row[x] = sigmoid(s);
    }
    mask.push(row);
  }
  return mask;
}

/**
 * Resize mask [srcH][srcW] → [height][width] bằng nội-suy song-tuyến (bilinear).
 * Dịch resizeMaskToBox (L192-234):
 *   srcX = x/width*(srcW-1) ; srcY = y/height*(srcH-1) ; kẹp x0∈[0,srcW-2], y0∈[0,srcH-2].
 */
export function resizeMaskBilinear(mask: number[][], width: number, height: number): number[][] {
  if (width <= 0 || height <= 0) return mask;
  const srcHeight = mask.length;
  const srcWidth = srcHeight === 0 ? 0 : mask[0].length;
  if (srcWidth <= 0 || srcHeight <= 0) return mask;

  const resized: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row = new Array<number>(width);
    for (let x = 0; x < width; x++) {
      const srcX = (x / width) * (srcWidth - 1);
      const srcY = (y / height) * (srcHeight - 1);

      const x0 = Math.max(0, Math.min(srcWidth - 2, Math.trunc(srcX)));
      const y0 = Math.max(0, Math.min(srcHeight - 2, Math.trunc(srcY)));
      const x1 = x0 + 1;
      const y1 = y0 + 1;

      const xFrac = srcX - x0;
      const yFrac = srcY - y0;

      const v00 = mask[y0][x0];
      const v01 = mask[y0][x1];
      const v10 = mask[y1][x0];
      const v11 = mask[y1][x1];

      row[x] =
        v00 * (1 - xFrac) * (1 - yFrac) +
        v01 * xFrac * (1 - yFrac) +
        v10 * (1 - xFrac) * yFrac +
        v11 * xFrac * yFrac;
    }
    resized.push(row);
  }
  return resized;
}

/**
 * Nhị-phân-hoá mask theo ngưỡng: value > threshold → 1, ngược lại → 0.
 * Dùng dấu `>` NGHIÊM (không phải ≥) khớp applyMaskToBitmap (L280: `maskValue > threshold`).
 * Swift áp ngưỡng inline lúc ghép ảnh; ở L0 tách thành hàm thuần cho testable + tái dùng.
 */
export function thresholdMask(
  mask: number[][],
  threshold: number = DEFAULT_MODEL_CONFIG.maskThreshold,
): number[][] {
  return mask.map((row) => row.map((v) => (v > threshold ? 1 : 0)));
}

/**
 * Mask hợp-lệ? rỗng → false; có NaN/Inf → false; mean phải > 0.01.
 * Dịch isValidMask (L387-403).
 */
export function isValidMask(mask: number[][]): boolean {
  if (mask.length === 0 || mask[0].length === 0) return false;

  let sum = 0;
  let count = 0;
  for (const row of mask) {
    for (const v of row) {
      if (Number.isNaN(v) || !Number.isFinite(v)) return false;
      sum += v;
      count += 1;
    }
  }
  return count > 0 && sum / count > 0.01;
}

/**
 * Ném ml/invalid-mask nếu mask không hợp-lệ. Cho tầng gọi 1 chỗ dùng mã lỗi chuẩn.
 * (Không có trong Swift — Swift trả bool; đây là lớp vỏ MobileCore quanh isValidMask.)
 */
export function assertValidMask(mask: number[][]): void {
  if (!isValidMask(mask)) {
    throw new MobileCoreError('ml/invalid-mask', 'mask is empty/all-zero/NaN', {
      detail: { rows: mask.length, cols: mask[0]?.length ?? 0 },
    });
  }
}
