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

import type { Box } from './types';
import { MobileCoreError, type MobileCoreErrorCode } from '../errors';
import { DEFAULT_MODEL_CONFIG } from './config';
import { computeLetterbox, letterboxCoord } from './letterbox';

/**
 * Trần cấp-phát mask (số ô = width×height). Chống OOM khi kích-thước đầu-vào bất-thường
 * lớn (native cấp sai). 64M ô ≈ 8k×8k — thừa cho crop điện-thoại, vẫn chặn được input rác.
 */
const MAX_MASK_CELLS = 64_000_000;

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
  // Guard F1: cần ≥2 mẫu mỗi trục để nội-suy (x0 kẹp về srcWidth-2; <2 → chỉ-số âm → NaN).
  if (srcWidth < 2 || srcHeight < 2) {
    throw new MobileCoreError('ml/invalid-mask', 'resizeMaskBilinear: source mask must be ≥2×2', {
      detail: { srcWidth, srcHeight },
    });
  }
  // Cap cấp-phát: chống OOM khi kích-thước đích bất-thường lớn.
  if (width * height > MAX_MASK_CELLS) {
    throw new MobileCoreError('ml/invalid-mask', 'resizeMaskBilinear: target size exceeds cap', {
      detail: { width, height, cap: MAX_MASK_CELLS },
    });
  }

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

/**
 * Feather mask 2 ngưỡng → alpha gradient [0,1] (viền mềm thay cho cắt cứng).
 *   value ≥ inner → 1 (foreground chắc);
 *   value ≤ outer → 0 (background chắc);
 *   giữa 2 ngưỡng → nội-suy tuyến-tính (value - outer)/(inner - outer), kẹp [0,1].
 * Dịch SegmentationHelper.applyMaskWithFeather (Kotlin L227-242) — tách phần TÍNH ALPHA
 * (thuần số) khỏi phần ghép pixel (native/L1). inner > outer (mặc định 0.6 / 0.3).
 */
export function featherMask(
  mask: number[][],
  inner: number = DEFAULT_MODEL_CONFIG.featherInnerThreshold,
  outer: number = DEFAULT_MODEL_CONFIG.featherOuterThreshold,
): number[][] {
  // Guard tham-số ĐẢO: inner PHẢI > outer, nếu không dải chuyển-tiếp âm → nhánh `v>=inner`
  // nuốt cả dải [outer,inner] → trả 1 sai (chết-lặng). Ném thay vì đoán.
  if (!(inner > outer)) {
    throw new MobileCoreError(
      'ml/invalid-input' as MobileCoreErrorCode,
      'featherMask: inner threshold must be > outer',
      { detail: { inner, outer } },
    );
  }
  const span = inner - outer;
  return mask.map((row) =>
    row.map((v) => {
      if (v >= inner) return 1;
      if (v <= outer) return 0;
      const a = (v - outer) / span;
      return a < 0 ? 0 : a > 1 ? 1 : a;
    }),
  );
}

/**
 * Map bbox ẢNH GỐC (pixel, hệ imgW×imgH) → khung chỉ-số trên lưới proto (protoSize×protoSize).
 *
 * ⚠ Lưới proto 160×160 KHÔNG đại-diện ảnh gốc — nó đại-diện ảnh 640×640 ĐÃ LETTERBOX
 * (ImageCropper.kt L44-45: "Mask 160×160 … đại diện cho toàn bộ ảnh 640×640 (letterboxed)").
 * Vì vậy phải đưa box qua không-gian model letterboxed TRƯỚC (letterboxCoord: px→[0,1] model),
 * rồi × protoSize. Bỏ bước này thì ảnh KHÔNG vuông (điện-thoại luôn portrait) bị lệch đúng
 * bằng phần đệm (vd 1080×1920 → padLeft 140px model → lệch ~35 ô proto → crop nhầm vùng đen).
 * (Với ảnh VUÔNG, padLeft=padTop=0 nên rút gọn về px/img — trùng cách map cũ.)
 *
 * left/top kẹp [0, protoSize-1]; right/bottom kẹp [0, protoSize]; width/height ≥ 1.
 * Trả Box ở TOẠ-ĐỘ Ô proto. `inputSize` = cạnh vuông model (letterbox target, mặc định 640).
 */
export function mapBoxToProto(
  box: Box,
  imgW: number,
  imgH: number,
  protoSize: number,
  inputSize: number = DEFAULT_MODEL_CONFIG.inputSize,
): Box {
  if (imgW <= 0 || imgH <= 0) {
    throw new MobileCoreError('ml/invalid-mask', 'mapBoxToProto: image size must be > 0', {
      detail: { imgW, imgH },
    });
  }
  const clampInt = (v: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, Math.trunc(v)));

  // Ảnh gốc → không-gian model letterboxed, chuẩn-hoá [0,1] (X dùng padLeft, Y dùng padTop).
  const lb = computeLetterbox(imgW, imgH, inputSize);
  const nl = letterboxCoord(box.x, lb.padLeft, lb.ratio, inputSize);
  const nt = letterboxCoord(box.y, lb.padTop, lb.ratio, inputSize);
  const nr = letterboxCoord(box.x + box.width, lb.padLeft, lb.ratio, inputSize);
  const nb = letterboxCoord(box.y + box.height, lb.padTop, lb.ratio, inputSize);

  const left = clampInt(nl * protoSize, 0, protoSize - 1);
  const top = clampInt(nt * protoSize, 0, protoSize - 1);
  const right = clampInt(nr * protoSize, 0, protoSize);
  const bottom = clampInt(nb * protoSize, 0, protoSize);

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * Xoá-nền CỨNG trên 1 crop biểu-diễn bằng lưới số (rows=height, cols=width): với mỗi ô,
 * map sang toạ-độ mask rồi giữ giá-trị nếu mask > threshold, ngược lại → 0.
 * Dịch SegmentationHelper.applyMaskToBitmap (Kotlin L154-173) — nhưng L0 KHÔNG chạm pixel
 * buffer thật: thao-tác trên number[][] (cường-độ/chỉ-số), trả lưới mới cùng hình.
 * Tầng L1 mới ánh-xạ kết-quả này lên pixel thật. `mask` có thể khác kích-thước crop
 * (map tỉ-lệ như Kotlin: maskX = trunc(x/width*maskW), kẹp [0, maskW-1]).
 */
export function applyMaskToCrop(
  crop: number[][],
  mask: number[][],
  threshold: number = DEFAULT_MODEL_CONFIG.maskThreshold,
): number[][] {
  const height = crop.length;
  const width = height === 0 ? 0 : crop[0].length;
  const maskHeight = mask.length;
  const maskWidth = maskHeight === 0 ? 0 : mask[0].length;
  if (width === 0 || height === 0 || maskWidth === 0 || maskHeight === 0) {
    throw new MobileCoreError('ml/invalid-mask', 'applyMaskToCrop: empty crop or mask', {
      detail: { width, height, maskWidth, maskHeight },
    });
  }

  const out: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row = new Array<number>(width);
    const maskY = Math.max(0, Math.min(maskHeight - 1, Math.trunc((y / height) * maskHeight)));
    for (let x = 0; x < width; x++) {
      const maskX = Math.max(0, Math.min(maskWidth - 1, Math.trunc((x / width) * maskWidth)));
      row[x] = mask[maskY][maskX] > threshold ? crop[y][x] : 0;
    }
    out.push(row);
  }
  return out;
}
