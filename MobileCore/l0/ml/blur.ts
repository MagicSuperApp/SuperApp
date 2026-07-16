/**
 * MobileCore l0/ml — Laplacian variance (đo mờ).
 *
 * Nguồn: ios/LocalPods/ScannerModule/Core/Detection/BlurChecker.swift
 *   (repo orilife-mobile-app @ origin/claude/surface-data-collection).
 *   calculateLaplacianVariance: L27-70.  Kernel 3x3 [[0,1,0],[1,-4,1],[0,1,0]].
 *
 * L0: nhận MẢNG GRAYSCALE đã có (native trích từ pixel buffer), KHÔNG tự đọc buffer.
 */

import { DEFAULT_MODEL_CONFIG } from './config';

/**
 * Variance của đáp-ứng Laplacian trên ảnh grayscale phẳng (row-major, width×height).
 * Chỉ tính pixel NỘI (bỏ viền 1px) — khớp Swift (y:1..h-1, x:1..w-1).
 *   lap = center*-4 + top + bottom + left + right
 *   variance = mean(lap^2) - mean(lap)^2
 * Cao = nét, thấp = mờ. width|height < 3 → 0 (không đủ pixel nội).
 */
export function blurVariance(grayscale: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  if (grayscale.length < width * height) return 0;

  const laplacianSize = (width - 2) * (height - 2);
  let sum = 0; // Σ lap
  let sumSq = 0; // Σ lap^2

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = grayscale[y * width + x];
      const top = grayscale[(y - 1) * width + x];
      const bottom = grayscale[(y + 1) * width + x];
      const left = grayscale[y * width + (x - 1)];
      const right = grayscale[y * width + (x + 1)];

      const lap = center * -4 + top + bottom + left + right;
      sum += lap;
      sumSq += lap * lap;
    }
  }

  const mean = sum / laplacianSize;
  // variance = E[x^2] - (E[x])^2  (khớp vDSP_svesq/laplacianSize - mean^2 của Swift).
  return sumSq / laplacianSize - mean * mean;
}

/**
 * Vỏ boolean quanh variance: variance < threshold → coi là MỜ.
 * Dịch BlurChecker.isBlurry (Kotlin L91-96): dùng `<` nghiêm, ngưỡng mặc định = config.
 * L0 nhận SỐ variance đã tính (không nhận bitmap) — tách phần toán khỏi phần đọc pixel.
 */
export function isBlurry(
  variance: number,
  threshold: number = DEFAULT_MODEL_CONFIG.blurVarianceThreshold,
): boolean {
  return variance < threshold;
}

/**
 * Độ sắc-nét tương-đối = variance / threshold. 1.0 = ngay ngưỡng; >1 nét hơn; <1 mờ hơn.
 * Dịch BlurChecker.getSharpnessScore (Kotlin L112-115).
 */
export function sharpnessScore(
  variance: number,
  threshold: number = DEFAULT_MODEL_CONFIG.blurVarianceThreshold,
): number {
  return variance / threshold;
}
