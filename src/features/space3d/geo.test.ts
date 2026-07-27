import {
  buildFarmRing, centroidLatLng, fallbackRing, hashSeed, latLngToMeters,
  makeRng, pointInRing, ringArea, ringBounds, ringRadius, seededPointInRing,
} from './geo';

describe('latLngToMeters', () => {
  const origin = { lat: 10.5, lng: 105.5 };

  it('gốc toạ-độ trả về (0,0)', () => {
    const p = latLngToMeters(origin, origin);
    // toBeCloseTo chứ không toEqual: −0 và 0 khác nhau với deep-equal của jest.
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });

  it('đi về phía BẮC → z ÂM (three.js: −Z là Bắc)', () => {
    const p = latLngToMeters({ lat: origin.lat + 0.001, lng: origin.lng }, origin);
    expect(p.z).toBeLessThan(0);
    expect(Math.abs(p.x)).toBeLessThan(1e-6);
  });

  it('đi về phía ĐÔNG → x DƯƠNG', () => {
    const p = latLngToMeters({ lat: origin.lat, lng: origin.lng + 0.001 }, origin);
    expect(p.x).toBeGreaterThan(0);
    expect(Math.abs(p.z)).toBeLessThan(1e-6);
  });

  it('0.001° vĩ độ ≈ 111 m', () => {
    const p = latLngToMeters({ lat: origin.lat + 0.001, lng: origin.lng }, origin);
    expect(Math.abs(p.z)).toBeGreaterThan(105);
    expect(Math.abs(p.z)).toBeLessThan(118);
  });
});

describe('pointInRing', () => {
  const square = [
    { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
  ];

  it('điểm giữa nằm trong', () => {
    expect(pointInRing({ x: 0, z: 0 }, square)).toBe(true);
  });

  it('điểm ngoài nằm ngoài', () => {
    expect(pointInRing({ x: 20, z: 0 }, square)).toBe(false);
    expect(pointInRing({ x: 0, z: -40 }, square)).toBe(false);
  });

  it('đa-giác < 3 đỉnh luôn là ngoài', () => {
    expect(pointInRing({ x: 0, z: 0 }, [{ x: 0, z: 0 }])).toBe(false);
  });

  it('nhận đúng hình lõm (chữ L)', () => {
    const lShape = [
      { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 },
      { x: 4, z: 4 }, { x: 4, z: 10 }, { x: 0, z: 10 },
    ];
    expect(pointInRing({ x: 2, z: 8 }, lShape)).toBe(true);
    expect(pointInRing({ x: 8, z: 8 }, lShape)).toBe(false); // phần khuyết của chữ L
  });
});

describe('ringArea / ringBounds / ringRadius', () => {
  const square = [
    { x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 },
  ];

  it('diện tích hình vuông 10×10 = 100', () => {
    expect(ringArea(square)).toBeCloseTo(100, 6);
  });

  it('diện tích KHÔNG phụ thuộc chiều quay của đa-giác', () => {
    expect(ringArea([...square].reverse())).toBeCloseTo(100, 6);
  });

  it('bounds và radius đúng', () => {
    expect(ringBounds(square)).toEqual({ minX: -5, maxX: 5, minZ: -5, maxZ: 5 });
    expect(ringRadius(square)).toBeCloseTo(5, 6);
  });
});

describe('buildFarmRing', () => {
  it('chưa vẽ ranh giới (0 điểm) → ô vuông mặc định', () => {
    const r = buildFarmRing([], 10);
    expect(r.hasBoundary).toBe(false);
    expect(r.ring.length).toBe(4);
    expect(ringArea(r.ring)).toBeGreaterThan(0);
  });

  it('2 điểm (chưa đủ đa-giác) → vẫn lùi về ô vuông', () => {
    const r = buildFarmRing([{ lat: 10, lng: 105 }, { lat: 10.001, lng: 105 }], 3);
    expect(r.hasBoundary).toBe(false);
  });

  it('ranh giới thật → dùng đúng số đỉnh, có gốc toạ-độ', () => {
    const boundary = [
      { lat: 10.5000, lng: 105.5000 },
      { lat: 10.5010, lng: 105.5000 },
      { lat: 10.5010, lng: 105.5010 },
      { lat: 10.5000, lng: 105.5010 },
    ];
    const r = buildFarmRing(boundary, 5);
    expect(r.hasBoundary).toBe(true);
    expect(r.ring.length).toBe(4);
    expect(r.origin).not.toBeNull();
    // ~111 m × ~109 m → khoảng 1.2 ha
    expect(ringArea(r.ring)).toBeGreaterThan(10000);
  });

  it('ranh giới suy biến (mọi đỉnh trùng nhau) → lùi về ô vuông, không để vườn 0 m²', () => {
    const same = { lat: 10.5, lng: 105.5 };
    const r = buildFarmRing([same, same, same], 4);
    expect(r.hasBoundary).toBe(false);
    expect(ringArea(r.ring)).toBeGreaterThan(0);
  });

  it('bỏ qua toạ-độ hỏng (NaN)', () => {
    const r = buildFarmRing(
      [{ lat: NaN, lng: 105 }, { lat: 10, lng: 105 }] as any,
      2,
    );
    expect(r.hasBoundary).toBe(false);
  });
});

describe('hashSeed / makeRng', () => {
  it('cùng chuỗi → cùng hạt', () => {
    expect(hashSeed('tree-abc')).toBe(hashSeed('tree-abc'));
  });

  it('chuỗi khác → hạt khác', () => {
    expect(hashSeed('tree-abc')).not.toBe(hashSeed('tree-abd'));
  });

  it('rng cùng hạt → cùng dãy, và luôn trong [0,1)', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seededPointInRing', () => {
  const square = fallbackRing(12);

  it('cùng tree_id → LUÔN cùng vị-trí (cây không nhảy mỗi lần mở màn)', () => {
    const a = seededPointInRing('tree-1', square);
    const b = seededPointInRing('tree-1', square);
    expect(a).toEqual(b);
  });

  it('cây khác nhau → chỗ khác nhau', () => {
    expect(seededPointInRing('tree-1', square)).not.toEqual(seededPointInRing('tree-2', square));
  });

  it('luôn rơi TRONG ranh giới vườn', () => {
    for (let i = 0; i < 50; i++) {
      expect(pointInRing(seededPointInRing(`tree-${i}`, square), square)).toBe(true);
    }
  });

  it('hình lõm cũng không đặt cây ra ngoài', () => {
    const lShape = [
      { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 8 },
      { x: 8, z: 8 }, { x: 8, z: 20 }, { x: 0, z: 20 },
    ];
    for (let i = 0; i < 40; i++) {
      expect(pointInRing(seededPointInRing(`t${i}`, lShape), lShape)).toBe(true);
    }
  });
});

describe('centroidLatLng', () => {
  it('trung bình các đỉnh', () => {
    const c = centroidLatLng([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }]);
    expect(c).toEqual({ lat: 1, lng: 2 });
  });

  it('mảng rỗng không nổ', () => {
    expect(centroidLatLng([])).toEqual({ lat: 0, lng: 0 });
  });
});
