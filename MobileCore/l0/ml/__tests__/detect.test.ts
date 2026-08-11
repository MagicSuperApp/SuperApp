/**
 * MobileCore l0/ml — LENS-DETECT: tracking(id/confirm/avg) + blur boolean + feather/proto
 * + crop padding/union + proto-layout + guard F1/F3/F4. Số kỳ-vọng TÍNH TAY, đối-chiếu
 * nguồn Kotlin (orilife-mobile-core @ review-mvp). Import THẲNG file sibling, KHÔNG qua index.
 */

import { isMobileCoreError } from '../../errors';
import { DEFAULT_MODEL_CONFIG } from '../config';
import type { Box } from '../types';
import {
  initTrackerState,
  stepTracker,
  trackDetections,
  filterConfirmed,
  type DetectionInput,
} from '../tracking';
import { isBlurry, sharpnessScore } from '../blur';
import { featherMask, mapBoxToProto, applyMaskToCrop, resizeMaskBilinear } from '../mask';
import { computeLetterbox, decodeProtoMasks } from '../letterbox';
import { cropRectForBox, unionBox, cropRectForDetections } from '../crop';

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, width: w, height: h });
const det = (b: Box, confidence: number, classId = 0): DetectionInput => ({ box: b, confidence, classId });

// ── tracking: id bền + isConfirmed tại ngưỡng + averageConfidence ─────────────
describe('trackDetections / stepTracker — id + confirm + avg', () => {
  test('id ổn định qua frame; isConfirmed bật tại count≥trackerConfirmFrames(5); avg chạy', () => {
    const b = box(0, 0, 100, 100);
    let s = initTrackerState();

    const r1 = stepTracker(s, [det(b, 0.6)]);
    expect(r1.tracked[0].id).toBe('t1');
    expect(r1.tracked[0].count).toBe(1);
    expect(r1.tracked[0].isConfirmed).toBe(false);
    expect(r1.tracked[0].averageConfidence).toBeCloseTo(0.6, 10);

    const r2 = stepTracker(r1.state, [det(b, 0.8)]);
    expect(r2.tracked[0].id).toBe('t1'); // GIỮ id khi match
    expect(r2.tracked[0].count).toBe(2);
    expect(r2.tracked[0].isConfirmed).toBe(false);
    expect(r2.tracked[0].averageConfidence).toBeCloseTo(0.7, 10); // (0.6*1+0.8)/2

    const r3 = stepTracker(r2.state, [det(b, 1.0)]);
    expect(r3.tracked[0].count).toBe(3);
    expect(r3.tracked[0].isConfirmed).toBe(false); // 3 < trackerConfirmFrames(5)
    expect(r3.tracked[0].averageConfidence).toBeCloseTo(0.8, 10); // (0.7*2+1.0)/3

    const r4 = stepTracker(r3.state, [det(b, 1.0)]);
    expect(r4.tracked[0].count).toBe(4);
    expect(r4.tracked[0].isConfirmed).toBe(false); // 4 < 5

    const r5 = stepTracker(r4.state, [det(b, 1.0)]);
    expect(r5.tracked[0].id).toBe('t1');
    expect(r5.tracked[0].count).toBe(5);
    expect(r5.tracked[0].isConfirmed).toBe(true); // 5 ≥ trackerConfirmFrames(5)
  });

  test('box dịch trong ngưỡng IoU → id giữ nguyên + box được làm mượt (EMA α=0.3)', () => {
    let s = initTrackerState();
    const r1 = stepTracker(s, [det(box(0, 0, 100, 100), 0.9)]);
    // IoU({0,0,100,100},{10,0,100,100}) = 9000/11000 = 0.818 > 0.5 → match.
    const r2 = stepTracker(r1.state, [det(box(10, 0, 100, 100), 0.9)]);
    expect(r2.tracked[0].id).toBe('t1');
    expect(r2.tracked[0].box.x).toBeCloseTo(3, 10); // 0*0.7 + 10*0.3
  });

  test('detection mới không chồng → id đơn-điệu kế-tiếp (t2), không tái-dùng', () => {
    let s = initTrackerState();
    const r1 = stepTracker(s, [det(box(0, 0, 100, 100), 0.9)]);
    const r2 = stepTracker(r1.state, [
      det(box(0, 0, 100, 100), 0.9), // match t1
      det(box(500, 500, 50, 50), 0.7), // mới → t2
    ]);
    expect(r2.tracked[0].id).toBe('t1');
    expect(r2.tracked[1].id).toBe('t2');
    expect(r2.tracked[1].count).toBe(1);
  });

  test('trackDetections thuần (không state): id suy từ max prev, vẫn tất-định', () => {
    const prev = trackDetections([], [det(box(0, 0, 100, 100), 0.9)]);
    expect(prev[0].id).toBe('t1');
    const next = trackDetections(prev, [det(box(0, 0, 100, 100), 0.9)]);
    expect(next[0].id).toBe('t1'); // giữ id qua bước
  });

  test('BEST-match: 2 det chồng chéo 2 tracker → nhận id theo IoU LỚN NHẤT, không đổi chéo', () => {
    // prev: A(index0)={0,0,100,100} id t1 ; B(index1)={20,0,100,100} id t2 (chồng nhau).
    // det1={18,..}: IoU(A)=0.695, IoU(B)=0.961 → phải nhận B (t2), dù A đứng trước.
    // det2={2,..}:  IoU(A)=0.961, IoU(B)=0.695 → B đã dùng → nhận A (t1).
    // First-match (sai) sẽ trả det1→t1 (A đứng đầu) → HOÁN ĐỔI id.
    const prev = [
      { box: box(0, 0, 100, 100), confidence: 0.9, classId: 0, count: 1, id: 't1' },
      { box: box(20, 0, 100, 100), confidence: 0.9, classId: 0, count: 1, id: 't2' },
    ];
    const out = trackDetections(prev, [det(box(18, 0, 100, 100), 0.9), det(box(2, 0, 100, 100), 0.9)]);
    expect(out[0].id).toBe('t2'); // det1 → B
    expect(out[1].id).toBe('t1'); // det2 → A
  });

  test('[CRITICAL] gán GLOBAL: nhiều det tranh 1 tracker → det IoU khít nhất giữ id, KHÔNG phụ-thuộc thứ-tự curr', () => {
    // prev A confirmed, count=5, id t1. d1 IoU(A)=0.6 (yếu), d2 IoU(A)=0.961 (khít).
    const A = {
      box: box(0, 0, 100, 100),
      confidence: 0.8,
      classId: 0,
      count: 5,
      id: 't1',
      isConfirmed: true,
      averageConfidence: 0.8,
    };
    const d1 = det(box(25, 0, 100, 100), 0.7); // IoU(A)=(75)/(125)=0.6
    const d2 = det(box(2, 0, 100, 100), 0.9); // IoU(A)=(98)/(102)=0.961

    const out = trackDetections([A], [d1, d2]);
    // d2 (index1) khít hơn → GIỮ A (t1) + count kế-thừa 6; d1 (index0) thành tracker mới t2.
    expect(out[1].id).toBe('t1');
    expect(out[1].count).toBe(6);
    expect(out[0].id).toBe('t2');
    expect(out[0].count).toBe(1);

    // ĐẢO thứ-tự curr → CÙNG phép gán (d2 vẫn giữ A), chỉ đổi vị-trí output.
    const rev = trackDetections([A], [d2, d1]);
    expect(rev[0].id).toBe('t1'); // d2 ở index0
    expect(rev[0].count).toBe(6);
    expect(rev[1].id).toBe('t2'); // d1 thành mới
    expect(rev[1].count).toBe(1);
  });

  test('tie IoU bằng nhau → tất-định (prevIdx nhỏ hơn thắng)', () => {
    // 2 tracker box TRÙNG KHÍT (IoU với det đều =1) → det khớp prev index0 (t1), tất-định.
    const prev = [
      { box: box(0, 0, 100, 100), confidence: 0.9, classId: 0, count: 1, id: 't1' },
      { box: box(0, 0, 100, 100), confidence: 0.9, classId: 0, count: 1, id: 't2' },
    ];
    const out = trackDetections(prev, [det(box(0, 0, 100, 100), 0.9)]);
    expect(out[0].id).toBe('t1');
  });

  test('filterConfirmed chỉ giữ tracker isConfirmed', () => {
    const dets = [
      { box: box(0, 0, 1, 1), confidence: 0.5, classId: 0, count: 3, id: 't1', isConfirmed: true },
      { box: box(0, 0, 1, 1), confidence: 0.5, classId: 0, count: 1, id: 't2', isConfirmed: false },
    ];
    expect(filterConfirmed(dets).map((d) => d.id)).toEqual(['t1']);
  });
});

// ── blur: vỏ boolean + sharpnessScore ────────────────────────────────────────
describe('isBlurry / sharpnessScore', () => {
  test('variance < threshold → mờ (boolean)', () => {
    expect(isBlurry(50, 100)).toBe(true);
    expect(isBlurry(150, 100)).toBe(false);
    expect(isBlurry(50, 40)).toBe(false); // 50 ≥ 40 → nét
  });

  test('ngưỡng mặc định = config (100)', () => {
    expect(DEFAULT_MODEL_CONFIG.blurVarianceThreshold).toBe(100);
    expect(isBlurry(99)).toBe(true);
    expect(isBlurry(100)).toBe(false); // dùng `<` nghiêm
  });

  test('sharpnessScore = variance / threshold', () => {
    expect(sharpnessScore(200, 100)).toBeCloseTo(2, 10);
    expect(sharpnessScore(100)).toBeCloseTo(1, 10); // ngay ngưỡng
  });
});

// ── featherMask: alpha gradient 2 ngưỡng ─────────────────────────────────────
describe('featherMask', () => {
  test('≥inner→1, ≤outer→0, giữa→nội-suy tuyến-tính (inner=0.6,outer=0.3)', () => {
    const out = featherMask([[0.2, 0.3, 0.45, 0.6, 0.7]]);
    // 0.2≤0.3→0 ; 0.3≤0.3→0 ; 0.45→(0.45-0.3)/0.3=0.5 ; 0.6≥0.6→1 ; 0.7→1.
    expect(out[0][0]).toBeCloseTo(0, 10);
    expect(out[0][1]).toBeCloseTo(0, 10);
    expect(out[0][2]).toBeCloseTo(0.5, 10);
    expect(out[0][3]).toBeCloseTo(1, 10);
    expect(out[0][4]).toBeCloseTo(1, 10);
  });

  test('ngưỡng tuỳ-biến', () => {
    const out = featherMask([[0.5]], 0.8, 0.4);
    expect(out[0][0]).toBeCloseTo((0.5 - 0.4) / (0.8 - 0.4), 10); // 0.25
  });

  test('inner ≤ outer (tham-số đảo) → ném ml/invalid-input, KHÔNG trả 1 dead-code', () => {
    for (const [inner, outer] of [[0.3, 0.6], [0.5, 0.5]]) {
      try {
        featherMask([[0.45]], inner, outer);
        throw new Error('expected throw');
      } catch (e) {
        expect(isMobileCoreError(e)).toBe(true);
        if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-input');
      }
    }
  });
});

// ── mapBoxToProto: bbox ảnh → lưới proto ──────────────────────────────────────
describe('mapBoxToProto', () => {
  test('box nửa-ảnh 320→proto160: {0,0,160,160}→{0,0,80,80}', () => {
    expect(mapBoxToProto(box(0, 0, 160, 160), 320, 320, 160)).toEqual(box(0, 0, 80, 80));
  });

  test('box full ảnh → phủ trọn lưới {0,0,160,160}', () => {
    expect(mapBoxToProto(box(0, 0, 320, 320), 320, 320, 160)).toEqual(box(0, 0, 160, 160));
  });

  test('box tí-hon → width/height kẹp tối-thiểu 1', () => {
    expect(mapBoxToProto(box(0, 0, 1, 1), 320, 320, 160)).toEqual(box(0, 0, 1, 1));
  });

  test('[CRITICAL] ảnh portrait 1080×1920: box mép-trái x=0 → proto x≈35 (KHÔNG phải 0)', () => {
    // computeLetterbox(1080,1920,640): ratio=1/3, padLeft=140, padTop=0.
    // left x=0 → (0*1/3+140)/640=0.21875 ×160 = 35 (không letterbox sẽ ra 0 → lệch).
    // box {0,0,540,1920}: right=(540/3+140)/640=0.5×160=80 ; bottom=(1920/3)/640=1×160=160.
    const p = mapBoxToProto(box(0, 0, 540, 1920), 1080, 1920, 160);
    expect(p.x).toBe(35);
    expect(p.y).toBe(0);
    expect(p.width).toBe(45); // 80 - 35
    expect(p.height).toBe(160);
  });
});

// ── applyMaskToCrop: xoá-nền cứng trên lưới số ────────────────────────────────
describe('applyMaskToCrop', () => {
  test('mask > threshold giữ giá-trị crop, ngược lại → 0 (map tỉ-lệ)', () => {
    const crop = [
      [10, 20],
      [30, 40],
    ];
    // mask cùng kích-thước 2×2: giữ (0,0)&(1,1), bỏ (0,1)&(1,0). threshold 0.5.
    const mask = [
      [0.9, 0.1],
      [0.2, 0.8],
    ];
    expect(applyMaskToCrop(crop, mask, 0.5)).toEqual([
      [10, 0],
      [0, 40],
    ]);
  });
});

// ── crop: cropRectForBox padding clamp 30/120 + kẹp biên; unionBox ────────────
describe('cropRectForBox padding clamp + kẹp biên', () => {
  const IMG = 2000;

  test('box rộng 100: px=trunc(30)=30 (trong [30,120]) → crop nới +30 mỗi bên', () => {
    const c = cropRectForBox(box(500, 500, 100, 100), IMG, IMG);
    expect(c).toEqual(box(470, 470, 160, 160)); // 100 + 2*30
  });

  test('box rộng 50: px=trunc(15)=15 → kẹp MIN 30', () => {
    const c = cropRectForBox(box(500, 500, 50, 50), IMG, IMG);
    expect(c.width).toBe(110); // 50 + 2*30
  });

  test('box rộng 500: px=trunc(150)=150 → kẹp MAX 120', () => {
    const c = cropRectForBox(box(500, 500, 500, 500), IMG, IMG);
    expect(c.width).toBe(740); // 500 + 2*120
  });

  test('box sát biên → khung kẹp về [0, img]', () => {
    const c = cropRectForBox(box(10, 10, 100, 100), IMG, IMG);
    expect(c.x).toBe(0); // 10-30 → 0
    expect(c.y).toBe(0);
    expect(c.width).toBe(140); // 0..(110+30)
  });

  test('box rỗng sau kẹp → ném RangeError', () => {
    expect(() => cropRectForBox(box(0, 0, 0, 0), IMG, IMG)).toThrow(RangeError);
  });
});

describe('unionBox / cropRectForDetections', () => {
  test('union 2 box rời → hộp bao nhỏ nhất', () => {
    expect(unionBox([box(0, 0, 10, 10), box(20, 20, 10, 10)])).toEqual(box(0, 0, 30, 30));
  });

  test('rỗng → ném RangeError', () => {
    expect(() => unionBox([])).toThrow(RangeError);
  });

  test('cropRectForDetections = union rồi padding', () => {
    // union {0,0,30,30}; px=trunc(30*0.3=9)=9→min30. imgW lớn → nới +30.
    const c = cropRectForDetections([box(100, 100, 30, 30), box(140, 140, 30, 30)], 2000, 2000);
    // union {100,100,70,70}; px=trunc(21)=21→min30 → 100-30=70.. (170+30)=200 → width130.
    expect(c).toEqual(box(70, 70, 130, 130));
  });
});

// ── proto-layout: NHWC vs NCHW (suy từ shape) ─────────────────────────────────
describe('decodeProtoMasks — layout từ shape', () => {
  // protoSize=2, numProtos=3 → expected=12. flat = 0..11.
  const flat = Array.from({ length: 12 }, (_, i) => i);

  test('shape [1,2,2,3] → NHWC: protos[c][h][w]=flat[h*6+w*3+c]', () => {
    const { layout, protos } = decodeProtoMasks(flat, [1, 2, 2, 3], 2, 3);
    expect(layout).toBe('NHWC');
    expect(protos[0][0][0]).toBe(0); // h0w0c0
    expect(protos[1][0][0]).toBe(1); // c=1
    expect(protos[0][0][1]).toBe(3); // w=1 → 0*6+1*3+0
    expect(protos[0][1][0]).toBe(6); // h=1 → 1*6+0+0
  });

  test('shape [1,3,2,2] → NCHW: protos[c][h][w]=flat[c*4+h*2+w]', () => {
    const { layout, protos } = decodeProtoMasks(flat, [1, 3, 2, 2], 2, 3);
    expect(layout).toBe('NCHW');
    expect(protos[0][0][0]).toBe(0);
    expect(protos[1][0][0]).toBe(4); // c=1 → 4
    expect(protos[0][0][1]).toBe(1); // w=1
    expect(protos[0][1][0]).toBe(2); // h=1
  });

  test('guard F4: flat length lệch → ml/invalid-mask', () => {
    try {
      decodeProtoMasks(flat.slice(0, 11), [1, 2, 2, 3], 2, 3);
      throw new Error('expected throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-mask');
    }
  });

  test('guard F4: shape không khớp NHWC/NCHW → ml/invalid-mask', () => {
    try {
      decodeProtoMasks(flat, [1, 5, 5, 5], 2, 3);
      throw new Error('expected throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-mask');
    }
  });

  test('numProtos == protoSize → MƠ HỒ, ném ml/invalid-mask (không đoán)', () => {
    const f8 = Array.from({ length: 8 }, (_, i) => i); // protoSize=numProtos=2 → 2*2*2=8.
    try {
      decodeProtoMasks(f8, [1, 2, 2, 2], 2, 2);
      throw new Error('expected throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-mask');
    }
  });

  test('forcedLayout tường minh gỡ mơ-hồ (bỏ qua suy-luận shape)', () => {
    const f8 = Array.from({ length: 8 }, (_, i) => i);
    const { layout, protos } = decodeProtoMasks(f8, [], 2, 2, 'NCHW');
    expect(layout).toBe('NCHW');
    expect(protos[1][0][0]).toBe(4); // c=1 → c*4 = flat[4]
  });
});

// ── guard F1 (resizeMaskBilinear src<2 + cap) ─────────────────────────────────
describe('guard F1 resizeMaskBilinear', () => {
  test('src < 2×2 → ml/invalid-mask (chống chỉ-số âm → NaN)', () => {
    for (const bad of [[[1]], [[1, 2]], [[1], [2]]]) {
      try {
        resizeMaskBilinear(bad, 4, 4);
        throw new Error('expected throw');
      } catch (e) {
        expect(isMobileCoreError(e)).toBe(true);
        if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-mask');
      }
    }
  });

  test('kích-thước đích vượt cap → ml/invalid-mask (chống OOM)', () => {
    const src = [
      [0, 0],
      [0, 1],
    ];
    try {
      resizeMaskBilinear(src, 100000, 100000);
      throw new Error('expected throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('ml/invalid-mask');
    }
  });

  test('src 2×2 hợp-lệ → KHÔNG ném (không phá test cũ)', () => {
    expect(() => resizeMaskBilinear([[0, 0], [0, 1]], 3, 3)).not.toThrow();
  });
});

// ── guard F3 (computeLetterbox 0px) ───────────────────────────────────────────
describe('guard F3 computeLetterbox', () => {
  test('srcW=0 hoặc srcH=0 → ném (chống ratio=Infinity→pad=NaN)', () => {
    expect(() => computeLetterbox(0, 100, 640)).toThrow();
    expect(() => computeLetterbox(100, 0, 640)).toThrow();
  });

  test('kích-thước hợp-lệ vẫn chạy (round-trip cũ không gãy)', () => {
    const lb = computeLetterbox(1920, 1080, 640);
    expect(lb.ratio).toBeCloseTo(640 / 1920, 10);
    expect(lb.padTop).toBeCloseTo(140, 10);
  });
});
