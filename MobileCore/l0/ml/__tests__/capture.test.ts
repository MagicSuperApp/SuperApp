/**
 * LENS-CAPTURE — vector đối-chiếu nguồn Kotlin (orilife-mobile-core @ review-mvp).
 * Import TRỰC TIẾP từ file sibling, KHÔNG qua ../index (barrel do orchestrator quản).
 */

import {
  computeOrientationFromRotationMatrix,
  accelOnlyTilt,
  lowPassAngleFilter,
} from '../orientation';
import { sampleVariance, createStabilitySampler } from '../stability';
import {
  headingToSector,
  sectorCenter,
  sectorContainsHeading,
  guidanceToTarget,
  remainingSectors,
  nearestUncapturedSector,
} from '../sector';
import { normalizeAngle, signedAngleDelta, decideSectorCapture } from '../heading';

const RAD = Math.PI / 180;
// Ma-trận-xoay 3x3 quanh trục Z một góc azimuth (Android getRotationMatrix quy-ước).
// getOrientation: azimuth=atan2(R[1],R[4]). Rz cho R[1]=sin, R[4]=cos → azimuth=góc.
function rotZ(deg: number): number[] {
  const s = Math.sin(deg * RAD);
  const c = Math.cos(deg * RAD);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

describe('orientation — computeOrientationFromRotationMatrix', () => {
  it('ma-trận đơn-vị → heading/pitch/roll = 0', () => {
    const o = computeOrientationFromRotationMatrix([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(o.heading).toBeCloseTo(0, 5);
    expect(o.pitch).toBeCloseTo(0, 5);
    expect(o.roll).toBeCloseTo(0, 5);
  });

  it('xoay Z 90° → heading 90°', () => {
    const o = computeOrientationFromRotationMatrix(rotZ(90));
    expect(o.heading).toBeCloseTo(90, 4);
    expect(o.pitch).toBeCloseTo(0, 4);
    expect(o.roll).toBeCloseTo(0, 4);
  });

  it('azimuth âm được chuẩn-hoá về [0,360): xoay Z -90° → 270°', () => {
    const o = computeOrientationFromRotationMatrix(rotZ(-90));
    expect(o.heading).toBeCloseTo(270, 4);
  });

  it('hỗ-trợ ma-trận 16 phần-tử (4x4)', () => {
    // Rz 90° dạng 4x4 row-major: azimuth=atan2(R[1],R[5]).
    const R16 = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const o = computeOrientationFromRotationMatrix(R16);
    expect(o.heading).toBeCloseTo(90, 4);
  });

  it('[FIX1] asin kẹp [-1,1]: R[7]=1.0000002 (chưa renormalize) → pitch hữu-hạn ≈ -90, KHÔNG NaN', () => {
    const R = [1, 0, 0, 0, 1, 0, 0, 1.0000002, 1];
    const o = computeOrientationFromRotationMatrix(R);
    expect(Number.isNaN(o.pitch)).toBe(false);
    expect(o.pitch).toBeCloseTo(-90, 3);
    expect(Number.isNaN(o.heading)).toBe(false);
  });

  it('[FIX4] R.length<9 → ném mã ml/invalid-input (không phải ml/invalid-mask)', () => {
    expect.assertions(1);
    try {
      computeOrientationFromRotationMatrix([1, 0, 0]);
    } catch (e) {
      expect((e as { code?: string }).code).toBe('ml/invalid-input');
    }
  });
});

describe('orientation — accelOnlyTilt (fallback)', () => {
  it('gravity thuần trục Z (nằm phẳng) → pitch/roll ≈ 0', () => {
    const t = accelOnlyTilt({ x: 0, y: 0, z: 9.81 });
    expect(t.pitch).toBeCloseTo(0, 5);
    expect(t.roll).toBeCloseTo(0, 5);
  });

  it('nghiêng hết trục X → pitch ≈ 90°', () => {
    const t = accelOnlyTilt({ x: 9.81, y: 0, z: 0 });
    expect(t.pitch).toBeCloseTo(90, 4);
  });
});

describe('orientation — lowPassAngleFilter (EMA wrap-aware)', () => {
  it('nhảy 359°→1° với alpha 0.5 → 0° (không nội-suy sai qua mốc 0)', () => {
    expect(lowPassAngleFilter(359, 1, 0.5)).toBeCloseTo(0, 5);
  });

  it('350°→10° alpha 0.5 → 0° (đi tới qua 360)', () => {
    expect(lowPassAngleFilter(350, 10, 0.5)).toBeCloseTo(0, 5);
  });

  it('alpha=0 giữ prev; alpha=1 nhảy hẳn next', () => {
    expect(lowPassAngleFilter(100, 200, 0)).toBeCloseTo(100, 5);
    expect(lowPassAngleFilter(100, 200, 1)).toBeCloseTo(200, 5);
  });

  it('không wrap: 10°→20° alpha 0.5 → 15°', () => {
    expect(lowPassAngleFilter(10, 20, 0.5)).toBeCloseTo(15, 5);
  });
});

describe('stability — sampleVariance', () => {
  it('mọi mẫu bằng nhau → variance 0', () => {
    expect(sampleVariance([5, 5, 5, 5])).toBeCloseTo(0, 6);
  });

  it('<2 mẫu → MAX_VALUE (chưa đủ để coi đứng-yên)', () => {
    expect(sampleVariance([9.8])).toBe(Number.MAX_VALUE);
    expect(sampleVariance([])).toBe(Number.MAX_VALUE);
  });

  it('population variance (chia n) khớp Kotlin: [0,10] → 25', () => {
    expect(sampleVariance([0, 10])).toBeCloseTo(25, 6);
  });
});

describe('stability — createStabilitySampler (cửa-sổ-trượt, window=15, thr=50)', () => {
  it('chưa đủ window → filled=false, isStable=false', () => {
    const s = createStabilitySampler();
    let r = s.push(9.8);
    for (let i = 0; i < 13; i++) r = s.push(9.8);
    expect(s.size()).toBe(14);
    expect(r.filled).toBe(false);
    expect(r.isStable).toBe(false);
  });

  it('đủ 15 mẫu gần-như-đứng-yên → isStable=true (variance < 50)', () => {
    const s = createStabilitySampler();
    let r = s.push(9.8);
    for (let i = 0; i < 14; i++) r = s.push(9.8 + (i % 2) * 0.01);
    expect(r.filled).toBe(true);
    expect(r.variance).toBeLessThan(50);
    expect(r.isStable).toBe(true);
  });

  it('biên isStable: rung mạnh (variance ≥ 50) → isStable=false dù đã đầy', () => {
    const s = createStabilitySampler({ windowSize: 4, threshold: 50 });
    let r = s.push(0);
    r = s.push(20);
    r = s.push(0);
    r = s.push(20); // variance = 100 > 50
    expect(r.filled).toBe(true);
    expect(r.variance).toBeGreaterThanOrEqual(50);
    expect(r.isStable).toBe(false);
  });

  it('cửa-sổ trượt: mẫu cũ bị đẩy ra', () => {
    const s = createStabilitySampler({ windowSize: 3, threshold: 50 });
    s.push(100);
    s.push(5);
    s.push(5);
    const r = s.push(5); // 100 đã bị đẩy ra → [5,5,5]
    expect(s.size()).toBe(3);
    expect(r.variance).toBeCloseTo(0, 6);
    expect(r.isStable).toBe(true);
  });
});

describe('sector — headingToSector (8 cung × 45°)', () => {
  it('0° → cung 0; 45° → cung 1; 90° → cung 2', () => {
    expect(headingToSector(0)).toBe(0);
    expect(headingToSector(45)).toBe(1);
    expect(headingToSector(90)).toBe(2);
  });

  it('biên: 337.5° → cung 0 (wrap qua 0)', () => {
    expect(headingToSector(337.5)).toBe(0);
    expect(headingToSector(359)).toBe(0);
    expect(headingToSector(22.4)).toBe(0);
  });

  it('biên: 22.5° → cung 1 (mép trên thuộc cung kế)', () => {
    expect(headingToSector(22.5)).toBe(1);
  });

  it('chuẩn-hoá heading ngoài [0,360): -45° → cung 7; 405° → cung 1', () => {
    expect(headingToSector(-45)).toBe(7);
    expect(headingToSector(405)).toBe(1);
  });

  it('[FIX2] TƯƠNG ĐỐI referenceHeading: ref=90 → cung 0 = 90°, không neo cứng Bắc', () => {
    expect(headingToSector(90, 8, 90)).toBe(0); // đúng tại ref
    expect(headingToSector(135, 8, 90)).toBe(1); // ref+45
    expect(headingToSector(45, 8, 90)).toBe(7); // ref-45 → cung 7
  });
});

describe('sector — sectorCenter', () => {
  it('index·45° (ref=0 mặc định)', () => {
    expect(sectorCenter(0)).toBe(0);
    expect(sectorCenter(2)).toBe(90);
    expect(sectorCenter(7)).toBe(315);
  });

  it('[FIX2] tâm cung = ref + index·45: ref=90 → cung0=90, cung2=180, cung7=45', () => {
    expect(sectorCenter(0, 8, 90)).toBe(90);
    expect(sectorCenter(2, 8, 90)).toBe(180);
    expect(sectorCenter(7, 8, 90)).toBe(45); // 90+315=405→45
  });
});

describe('sector — sectorContainsHeading (overlap chống lật, [FIX3])', () => {
  it('biên 22.3° thuộc CẢ cung 0 lẫn cung 1 (overlap 27.5° mỗi bên)', () => {
    expect(sectorContainsHeading(22.3, 0)).toBe(true);
    expect(sectorContainsHeading(22.3, 1)).toBe(true);
  });

  it('biên 22.7° cũng thuộc CẢ cung 0 lẫn cung 1 (không nhấp-nháy qua biên)', () => {
    expect(sectorContainsHeading(22.7, 0)).toBe(true);
    expect(sectorContainsHeading(22.7, 1)).toBe(true);
  });

  it('ngoài overlap: 30° KHÔNG thuộc cung 0 (30 > 27.5), thuộc cung 1', () => {
    expect(sectorContainsHeading(30, 0)).toBe(false);
    expect(sectorContainsHeading(30, 1)).toBe(true);
  });

  it('overlap wrap qua 0: 355° thuộc cung 0 (tâm 0, dist 5 ≤ 27.5)', () => {
    expect(sectorContainsHeading(355, 0)).toBe(true);
  });

  it('tôn trọng referenceHeading: ref=90, heading 90 thuộc cung 0', () => {
    expect(sectorContainsHeading(90, 0, { referenceHeading: 90 })).toBe(true);
    expect(sectorContainsHeading(90, 1, { referenceHeading: 90 })).toBe(false);
  });
});

describe('sector — guidanceToTarget (xoay ngắn nhất, wrap 0/360)', () => {
  it('0→90 → CW 90', () => {
    expect(guidanceToTarget(0, 90)).toEqual({ direction: 'CW', deltaDeg: 90 });
  });

  it('90→0 → CCW 90', () => {
    expect(guidanceToTarget(90, 0)).toEqual({ direction: 'CCW', deltaDeg: 90 });
  });

  it('mốc 0: 350→10 → CW 20 (đi tới qua 360)', () => {
    expect(guidanceToTarget(350, 10)).toEqual({ direction: 'CW', deltaDeg: 20 });
  });

  it('mốc 0: 10→350 → CCW 20 (đi lùi qua 0)', () => {
    expect(guidanceToTarget(10, 350)).toEqual({ direction: 'CCW', deltaDeg: 20 });
  });

  it('đối-xứng 180°: chọn CW, delta 180', () => {
    expect(guidanceToTarget(0, 180)).toEqual({ direction: 'CW', deltaDeg: 180 });
  });
});

describe('sector — remaining / nearestUncaptured', () => {
  it('remainingSectors bỏ tập đã chụp', () => {
    expect(remainingSectors([0, 1, 2])).toEqual([3, 4, 5, 6, 7]);
    expect(remainingSectors(new Set([7]))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('nearestUncapturedSector: heading 50° (gần tâm cung 1=45°), cung 1 chưa chụp → 1', () => {
    expect(nearestUncapturedSector(50, [0])).toBe(1);
  });

  it('nearestUncaptured bỏ cung đã chụp, tìm cung kế gần nhất', () => {
    // cung 1 (45°) đã chụp; heading 50° → cung chưa-chụp gần nhất là 2 (90°, dist 40) vs 0 (0°, dist 50)
    expect(nearestUncapturedSector(50, [1])).toBe(2);
  });

  it('hết cung → -1', () => {
    expect(nearestUncapturedSector(0, [0, 1, 2, 3, 4, 5, 6, 7])).toBe(-1);
  });
});

describe('heading — normalizeAngle / signedAngleDelta (giữ nguyên)', () => {
  it('normalizeAngle [0,360): 370→10, -10→350', () => {
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-10)).toBe(350);
  });

  it('signedAngleDelta [-180,180]: 350→-10, -350→10', () => {
    expect(signedAngleDelta(350)).toBe(-10);
    expect(signedAngleDelta(-350)).toBe(10);
    expect(signedAngleDelta(180)).toBe(180);
  });
});

describe('heading — decideSectorCapture (stateless, 1-frame)', () => {
  it('đứng-yên + có-mục-tiêu + cung hiện-tại chưa chụp → shouldCapture=true', () => {
    const d = decideSectorCapture({
      heading: 90, // cung 2
      isStable: true,
      hasTarget: true,
      capturedSectors: [0, 1],
    });
    expect(d.currentSector).toBe(2);
    expect(d.targetSector).toBe(2);
    expect(d.shouldCapture).toBe(true);
    expect(d.guidance).toEqual({ direction: 'CW', deltaDeg: 0 });
  });

  it('cung hiện-tại ĐÃ chụp → shouldCapture=false, guidance dẫn qua cung chưa-chụp gần nhất', () => {
    const d = decideSectorCapture({
      heading: 90, // cung 2 (đã chụp)
      isStable: true,
      hasTarget: true,
      capturedSectors: [2],
    });
    expect(d.currentSector).toBe(2);
    expect(d.shouldCapture).toBe(false);
    expect(d.targetSector).not.toBe(2);
    expect(d.targetSector).toBeGreaterThanOrEqual(0);
    expect(d.guidance).not.toBeNull();
  });

  it('chưa đứng-yên → shouldCapture=false dù cung chưa chụp', () => {
    const d = decideSectorCapture({
      heading: 90,
      isStable: false,
      hasTarget: true,
      capturedSectors: [],
    });
    expect(d.shouldCapture).toBe(false);
  });

  it('không có mục-tiêu → shouldCapture=false', () => {
    const d = decideSectorCapture({
      heading: 90,
      isStable: true,
      hasTarget: false,
      capturedSectors: [],
    });
    expect(d.shouldCapture).toBe(false);
  });

  it('hết cung (tất cả đã chụp) → targetSector=-1, guidance=null', () => {
    const d = decideSectorCapture({
      heading: 90,
      isStable: true,
      hasTarget: true,
      capturedSectors: [0, 1, 2, 3, 4, 5, 6, 7],
    });
    expect(d.shouldCapture).toBe(false);
    expect(d.targetSector).toBe(-1);
    expect(d.guidance).toBeNull();
  });

  it('[FIX2] referenceHeading: ref=90, heading=90 → cung 0 (không neo Bắc), chụp được', () => {
    const d = decideSectorCapture({
      heading: 90,
      isStable: true,
      hasTarget: true,
      capturedSectors: [],
      referenceHeading: 90,
    });
    expect(d.currentSector).toBe(0);
    expect(d.targetSector).toBe(0);
    expect(d.shouldCapture).toBe(true);
    expect(d.guidance).toEqual({ direction: 'CW', deltaDeg: 0 });
  });
});
