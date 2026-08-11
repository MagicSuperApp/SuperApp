/**
 * MobileCore l0/ml — vector-số đối-chiếu nguồn Swift/Kotlin.
 * Mỗi hàm export ≥1 số kỳ-vọng TÍNH TAY (không chỉ kiểm shape). Nhóm rủi-ro cao
 * (sai toạ-độ lặng-lẽ) → tập trung round-trip letterbox + EMA + góc.
 */

import { isMobileCoreError } from '../../errors';
import {
  iou,
  nms,
  computeLetterbox,
  unLetterbox,
  letterboxCoord,
  decodeYolo,
  smoothBox,
  trackDetections,
  blurVariance,
  sigmoid,
  reconstructMask,
  resizeMaskBilinear,
  thresholdMask,
  isValidMask,
  assertValidMask,
  classifyFrame,
  selectBestPerSlot,
  gatePass,
  requireTarget,
  normalizeAngle,
  signedAngleDelta,
  getModelConfig,
  DEFAULT_MODEL_CONFIG,
  type Box,
  type ScoredBox,
  type TrackedDetection,
} from '../index';

// ── iou ────────────────────────────────────────────────────────────────────
describe('iou', () => {
  test('hai hình vuông đơn-vị chồng nửa → 1/3', () => {
    // a=[0,0,1,1], b=[0.5,0,1,1] → inter=0.5, union=1+1-0.5=1.5 → 1/3.
    const a: Box = { x: 0, y: 0, width: 1, height: 1 };
    const b: Box = { x: 0.5, y: 0, width: 1, height: 1 };
    expect(iou(a, b)).toBeCloseTo(1 / 3, 10);
  });

  test('không chồng → 0', () => {
    const a: Box = { x: 0, y: 0, width: 1, height: 1 };
    const b: Box = { x: 5, y: 5, width: 1, height: 1 };
    expect(iou(a, b)).toBe(0);
  });

  test('trùng khít → 1', () => {
    const a: Box = { x: 2, y: 3, width: 4, height: 5 };
    expect(iou(a, { ...a })).toBeCloseTo(1, 10);
  });
});

// ── nms ──────────────────────────────────────────────────────────────────────
describe('nms', () => {
  const boxes: ScoredBox[] = [
    { x: 0, y: 0, width: 1, height: 1, confidence: 0.9, classId: 0 },
    { x: 0.5, y: 0, width: 1, height: 1, confidence: 0.6, classId: 0 }, // IoU=1/3 với box0
  ];

  test('cùng class, IoU(1/3) > threshold(0.3) → giữ 1 (conf cao hơn)', () => {
    expect(nms(boxes, 0.3)).toEqual([0]);
  });

  test('IoU(1/3) < threshold(0.45) → giữ cả 2', () => {
    expect(nms(boxes, 0.45)).toEqual([0, 1]);
  });

  test('khác class → KHÔNG suppress dù chồng nhiều', () => {
    const diff: ScoredBox[] = [
      { x: 0, y: 0, width: 1, height: 1, confidence: 0.9, classId: 0 },
      { x: 0.5, y: 0, width: 1, height: 1, confidence: 0.6, classId: 1 },
    ];
    expect(nms(diff, 0.3)).toEqual([0, 1]);
  });

  test('rỗng → []', () => {
    expect(nms([], 0.5)).toEqual([]);
  });
});

// ── letterbox round-trip (chỗ dễ sai lặng) ───────────────────────────────────
describe('computeLetterbox + unLetterbox round-trip', () => {
  test('1920×1080 → 640: ratio=1/3, padLeft=0, padTop=140', () => {
    const lb = computeLetterbox(1920, 1080, 640);
    expect(lb.ratio).toBeCloseTo(640 / 1920, 10); // 0.33333
    expect(lb.padLeft).toBeCloseTo(0, 10);
    expect(lb.padTop).toBeCloseTo(140, 10); // (640 - 1080*ratio)/2 = (640-360)/2
  });

  test('pixel gốc → model-space chuẩn-hoá → ngược lại ≈ chính nó', () => {
    const inputSize = 640;
    const lb = computeLetterbox(1920, 1080, inputSize);
    // X dùng padLeft, Y dùng padTop.
    for (const px of [0, 200, 960, 1500, 1920]) {
      const norm = letterboxCoord(px, lb.padLeft, lb.ratio, inputSize);
      expect(unLetterbox(norm, lb.padLeft, lb.ratio, inputSize)).toBeCloseTo(px, 6);
    }
    for (const py of [0, 200, 540, 900, 1080]) {
      const norm = letterboxCoord(py, lb.padTop, lb.ratio, inputSize);
      expect(unLetterbox(norm, lb.padTop, lb.ratio, inputSize)).toBeCloseTo(py, 6);
    }
  });

  test('unLetterbox giá-trị biết trước: norm 0.5, padTop 140 → 540 px', () => {
    const lb = computeLetterbox(1920, 1080, 640);
    // (0.5*640 - 140)/ratio = (320-140)/(1/3) = 180*3 = 540.
    expect(unLetterbox(0.5, lb.padTop, lb.ratio, 640)).toBeCloseTo(540, 6);
  });
});

// ── decodeYolo (round-trip qua letterbox) ────────────────────────────────────
describe('decodeYolo', () => {
  const m = DEFAULT_MODEL_CONFIG;
  const originalWidth = 1920;
  const originalHeight = 1080;
  const lb = computeLetterbox(originalWidth, originalHeight, m.inputSize);

  function buildDetection(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    conf: number,
    classId: number,
  ): number[] {
    const arr = new Array<number>(m.totalValues).fill(0);
    arr[0] = letterboxCoord(x1, lb.padLeft, lb.ratio, m.inputSize);
    arr[1] = letterboxCoord(y1, lb.padTop, lb.ratio, m.inputSize);
    arr[2] = letterboxCoord(x2, lb.padLeft, lb.ratio, m.inputSize);
    arr[3] = letterboxCoord(y2, lb.padTop, lb.ratio, m.inputSize);
    arr[4] = conf;
    arr[5] = classId;
    for (let k = 0; k < m.numMaskCoeffs; k++) arr[m.numBoxValues + k] = 0.1 * (k + 1);
    return arr;
  }

  test('1 box hợp-lệ → decode về đúng pixel gốc {200,200,600,500}', () => {
    const output = buildDetection(200, 200, 800, 700, 0.9, 0);
    const dets = decodeYolo(output, { originalWidth, originalHeight, letterbox: lb, model: m });
    expect(dets).toHaveLength(1);
    const d = dets[0];
    expect(d.box.x).toBeCloseTo(200, 4);
    expect(d.box.y).toBeCloseTo(200, 4);
    expect(d.box.width).toBeCloseTo(600, 4);
    expect(d.box.height).toBeCloseTo(500, 4);
    expect(d.classId).toBe(0);
    expect(d.confidence).toBeCloseTo(0.9, 6);
    expect(d.maskCoeffs).toHaveLength(32);
    expect(d.maskCoeffs[0]).toBeCloseTo(0.1, 6);
  });

  test('conf < ngưỡng(0.25) → loại', () => {
    const output = buildDetection(200, 200, 800, 700, 0.1, 0);
    expect(decodeYolo(output, { originalWidth, originalHeight, letterbox: lb, model: m })).toHaveLength(0);
  });

  test('box quá nhỏ (dưới minDetectionWidthPercent) → loại', () => {
    // bw=10px < minW=1920*0.05=96 → bị lọc.
    const output = buildDetection(200, 200, 210, 700, 0.9, 0);
    expect(decodeYolo(output, { originalWidth, originalHeight, letterbox: lb, model: m })).toHaveLength(0);
  });
});

// ── smoothBox (EMA α=0.3) ─────────────────────────────────────────────────────
describe('smoothBox', () => {
  test('α=0.3 một bước: old*(0.7) + new*(0.3)', () => {
    const current: Box = { x: 0, y: 0, width: 100, height: 100 };
    const next: Box = { x: 10, y: 20, width: 80, height: 60 };
    const s = smoothBox(current, next, 0.3);
    expect(s.x).toBeCloseTo(3, 10); // 0*0.7 + 10*0.3
    expect(s.y).toBeCloseTo(6, 10); // 0*0.7 + 20*0.3
    expect(s.width).toBeCloseTo(94, 10); // 100*0.7 + 80*0.3
    expect(s.height).toBeCloseTo(88, 10); // 100*0.7 + 60*0.3
  });

  test('α mặc định lấy từ config (0.3)', () => {
    expect(DEFAULT_MODEL_CONFIG.smoothingAlpha).toBe(0.3);
    const s = smoothBox({ x: 0, y: 0, width: 0, height: 0 }, { x: 10, y: 10, width: 10, height: 10 });
    expect(s.x).toBeCloseTo(3, 10);
  });
});

// ── trackDetections ──────────────────────────────────────────────────────────
describe('trackDetections', () => {
  const prev: TrackedDetection[] = [
    { box: { x: 0, y: 0, width: 100, height: 100 }, confidence: 0.9, classId: 0, count: 1 },
  ];

  test('curr chồng (IoU=0.818 > 0.5) → match, box mượt (α=0.3), count 2', () => {
    // IoU: inter=90*100=9000, union=10000+10000-9000=11000 → 0.818.
    const curr = [{ box: { x: 10, y: 0, width: 100, height: 100 }, confidence: 0.8, classId: 0 }];
    const out = trackDetections(prev, curr);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].box.x).toBeCloseTo(3, 10); // 0*0.7 + 10*0.3
    expect(out[0].box.width).toBeCloseTo(100, 10);
  });

  test('curr không chồng → tracker MỚI count 1, box giữ nguyên', () => {
    const curr = [{ box: { x: 500, y: 500, width: 50, height: 50 }, confidence: 0.7, classId: 0 }];
    const out = trackDetections(prev, curr);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
    expect(out[0].box.x).toBe(500);
  });
});

// ── blurVariance ──────────────────────────────────────────────────────────────
describe('blurVariance', () => {
  test('mảng phẳng (mọi pixel bằng nhau) → 0', () => {
    const w = 4;
    const h = 4;
    const flat = new Array<number>(w * h).fill(50);
    expect(blurVariance(flat, w, h)).toBeCloseTo(0, 10);
  });

  test('1 pixel sáng giữa 5×5 → variance = 200000/9 ≈ 22222.22', () => {
    // Laplacian nội (9 điểm): center(2,2)=-400; 4 hàng-xóm trực-tiếp=+100; 4 góc=0.
    // mean=0; sumSq=400^2 + 4*100^2 = 200000; variance = 200000/9.
    const w = 5;
    const h = 5;
    const img = new Array<number>(w * h).fill(0);
    img[2 * w + 2] = 100;
    expect(blurVariance(img, w, h)).toBeCloseTo(200000 / 9, 4);
  });

  test('kích-thước < 3 → 0', () => {
    expect(blurVariance([1, 2, 3, 4], 2, 2)).toBe(0);
  });
});

// ── sigmoid + mask ────────────────────────────────────────────────────────────
describe('sigmoid', () => {
  test('sigmoid(0)=0.5, sigmoid(2)≈0.880797', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 10);
    expect(sigmoid(2)).toBeCloseTo(0.8807970779, 9);
    expect(sigmoid(-2)).toBeCloseTo(0.1192029221, 9);
  });
});

describe('reconstructMask', () => {
  test('Σ coeff×proto rồi sigmoid; sum=0 → 0.5; sum=2 → 0.880797', () => {
    // size=2 (2×2). ch0 chỉ pixel idx1 = 2; ch1 = 0. coeffs=[1,0].
    // pixel(0,0)=sigmoid(0)=0.5 ; pixel(0,1)=sigmoid(1*2)=0.880797.
    const coeffs = [1, 0];
    const protos = [
      [0, 2, 0, 0],
      [0, 0, 0, 0],
    ];
    const mask = reconstructMask(coeffs, protos, 2);
    expect(mask).toHaveLength(2);
    expect(mask[0][0]).toBeCloseTo(0.5, 9);
    expect(mask[0][1]).toBeCloseTo(0.8807970779, 9);
    expect(mask[1][0]).toBeCloseTo(0.5, 9);
  });

  test('coeffs ít hơn số kênh → ném ml/invalid-mask', () => {
    try {
      reconstructMask([1], [[0], [0]], 1);
      throw new Error('expected throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-mask');
    }
  });
});

describe('resizeMaskBilinear', () => {
  test('2×2 [[0,0],[0,90]] → 3×3, tâm = 90*(1/3)^2 = 10.0', () => {
    // Tâm (x=1,y=1): srcX=srcY=1/3*(2-1)=0.333; v11=90 → 90*(1/3)*(1/3)=10.
    const src = [
      [0, 0],
      [0, 90],
    ];
    const out = resizeMaskBilinear(src, 3, 3);
    expect(out).toHaveLength(3);
    expect(out[0]).toHaveLength(3);
    expect(out[1][1]).toBeCloseTo(10, 6);
    expect(out[0][0]).toBeCloseTo(0, 10); // góc (0,0) → v00=0
  });
});

describe('thresholdMask', () => {
  test('ngưỡng 0.5 dùng dấu > NGHIÊM: 0.5→0, 0.6→1, 0.4→0', () => {
    expect(thresholdMask([[0.4, 0.5, 0.6]], 0.5)).toEqual([[0, 0, 1]]);
  });

  test('ngưỡng mặc định = config 0.5', () => {
    expect(thresholdMask([[0.7, 0.2]])).toEqual([[1, 0]]);
  });
});

describe('isValidMask / assertValidMask', () => {
  test('toàn 0 → false (mean 0 ≤ 0.01)', () => {
    expect(isValidMask([[0, 0], [0, 0]])).toBe(false);
  });

  test('mean > 0.01 → true', () => {
    expect(isValidMask([[0.5, 0.5], [0.5, 0.5]])).toBe(true);
  });

  test('có NaN → false', () => {
    expect(isValidMask([[NaN, 0.5]])).toBe(false);
  });

  test('assertValidMask ném ml/invalid-mask khi toàn 0', () => {
    try {
      assertValidMask([[0, 0]]);
      throw new Error('expected throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-mask');
    }
  });
});

// ── classifyFrame / selectBestPerSlot ─────────────────────────────────────────
describe('classifyFrame', () => {
  const goodFruit = [{ frame_index: 0, confidence: 0.8 }];

  test('chất-lượng cao + fruit conf 0.8 → both', () => {
    expect(
      classifyFrame({ sharpness_laplacian_var: 150, exposure_mean: 0.5, motion_blur_score: 0.1 }, goodFruit),
    ).toBe('both');
  });

  test('sharp 40 (<50) → discard', () => {
    expect(
      classifyFrame({ sharpness_laplacian_var: 40, exposure_mean: 0.5, motion_blur_score: 0.1 }, goodFruit),
    ).toBe('discard');
  });

  test('sharp 60 (qua discard, dưới training) + fruit 0.8 → evidence', () => {
    expect(
      classifyFrame({ sharpness_laplacian_var: 60, exposure_mean: 0.5, motion_blur_score: 0.1 }, goodFruit),
    ).toBe('evidence');
  });

  test('chất-lượng cao, không fruit → training_candidate', () => {
    expect(
      classifyFrame({ sharpness_laplacian_var: 150, exposure_mean: 0.5, motion_blur_score: 0.1 }, []),
    ).toBe('training_candidate');
  });
});

describe('selectBestPerSlot', () => {
  test('giữ training sharpest + evidence conf cao nhất mỗi slot', () => {
    const keep = selectBestPerSlot([
      { frame_index: 0, slot_key: 'A', purpose: 'training_candidate', sharpness: 120, max_fruit_conf: 0 },
      { frame_index: 1, slot_key: 'A', purpose: 'training_candidate', sharpness: 200, max_fruit_conf: 0 },
      { frame_index: 2, slot_key: 'A', purpose: 'evidence', sharpness: 80, max_fruit_conf: 0.9 },
    ]);
    // sharpest training = idx1; evidence cao nhất = idx2.
    expect(keep).toEqual([1, 2]);
  });
});

// ── gatePass ──────────────────────────────────────────────────────────────────
describe('gatePass', () => {
  test('detector chưa nạp → PASS', () => {
    expect(gatePass({ available: false, lastConf: -1, lastConfAtMs: 0, nowMs: 0 })).toBe(true);
  });

  test('kết-quả tươi, conf 0.3 ≥ 0.25 → PASS', () => {
    expect(gatePass({ available: true, lastConf: 0.3, lastConfAtMs: 1000, nowMs: 1200 })).toBe(true);
  });

  test('kết-quả tươi, conf 0.1 < 0.25 → BLOCK', () => {
    expect(gatePass({ available: true, lastConf: 0.1, lastConfAtMs: 1000, nowMs: 1200 })).toBe(false);
  });

  test('kết-quả cũ > 800ms → PASS (rơi về stillness)', () => {
    expect(gatePass({ available: true, lastConf: 0.1, lastConfAtMs: 1000, nowMs: 2000 })).toBe(true);
  });

  test('requireTarget rỗng → ml/no-target', () => {
    try {
      requireTarget([]);
      throw new Error('expected throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('ml/no-target');
    }
  });
});

// ── normalizeAngle / signedAngleDelta ─────────────────────────────────────────
describe('normalizeAngle [0,360)', () => {
  test('370→10, -10→350, wrap qua 0', () => {
    expect(normalizeAngle(370)).toBeCloseTo(10, 10);
    expect(normalizeAngle(-10)).toBeCloseTo(350, 10);
    expect(normalizeAngle(360)).toBeCloseTo(0, 10);
    expect(normalizeAngle(720)).toBeCloseTo(0, 10);
    expect(normalizeAngle(-370)).toBeCloseTo(350, 10);
  });
});

describe('signedAngleDelta [-180,180]', () => {
  test('góc-lệch ngắn nhất', () => {
    expect(signedAngleDelta(10)).toBeCloseTo(10, 10);
    expect(signedAngleDelta(-10)).toBeCloseTo(-10, 10);
    expect(signedAngleDelta(190)).toBeCloseTo(-170, 10);
    expect(signedAngleDelta(-190)).toBeCloseTo(170, 10);
    expect(signedAngleDelta(350)).toBeCloseTo(-10, 10);
  });
});

// (captureByHeading cũ đã BỎ — thay bằng 8-sector + StabilitySampler; test mới ở capture.test.ts)

// ── getModelConfig ────────────────────────────────────────────────────────────
describe('getModelConfig', () => {
  test('tên biết → config; không biết → DEFAULT (không ném)', () => {
    expect(getModelConfig('yolov26seg')).toBe(DEFAULT_MODEL_CONFIG);
    expect(getModelConfig('unknown-model')).toBe(DEFAULT_MODEL_CONFIG);
    expect(getModelConfig()).toBe(DEFAULT_MODEL_CONFIG);
  });
});
