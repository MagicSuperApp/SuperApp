import {
  DEFAULT_FRUIT_COORD, TREE_HEIGHT, TREE_RADIUS, clampCoord, coordFromServer,
  coordToLocalMeters, coordToServer, coordToZone, derivedZ, zoneToY,
} from './treeFrame';

describe('clampCoord', () => {
  it('kẹp x/z về [−1,1] và y về [0,1]', () => {
    expect(clampCoord({ x: 5, y: 9, z: -7 })).toEqual({ x: 1, y: 1, z: -1 });
    expect(clampCoord({ x: -5, y: -9, z: 7 })).toEqual({ x: -1, y: 0, z: 1 });
  });

  it('số hỏng (NaN) → lùi về giá trị an toàn, không lan NaN vào cảnh 3D', () => {
    const c = clampCoord({ x: NaN, y: NaN, z: NaN } as any);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    expect(Number.isFinite(c.z)).toBe(true);
  });
});

describe('coordToLocalMeters', () => {
  it('gốc cây = (0,0,0)', () => {
    expect(coordToLocalMeters({ x: 0, y: 0, z: 0 })).toEqual([0, 0, 0]);
  });

  it('ngọn cây = TREE_HEIGHT mét', () => {
    expect(coordToLocalMeters({ x: 0, y: 1, z: 0 })[1]).toBeCloseTo(TREE_HEIGHT, 6);
  });

  it('mép tán = ±TREE_RADIUS mét', () => {
    expect(coordToLocalMeters({ x: 1, y: 0.5, z: -1 })[0]).toBeCloseTo(TREE_RADIUS, 6);
    expect(coordToLocalMeters({ x: 1, y: 0.5, z: -1 })[2]).toBeCloseTo(-TREE_RADIUS, 6);
  });
});

describe('coordToZone / zoneToY', () => {
  it('chia đúng 3 tầng theo chiều cao', () => {
    expect(coordToZone({ x: 0, y: 0.1, z: 0 })).toBe('base');
    expect(coordToZone({ x: 0, y: 0.5, z: 0 })).toBe('mid');
    expect(coordToZone({ x: 0, y: 0.9, z: 0 })).toBe('canopy');
  });

  it('biên giữa các tầng thuộc tầng TRÊN (khớp localH của sơ đồ 2D cũ)', () => {
    expect(coordToZone({ x: 0, y: 0.34, z: 0 })).toBe('mid');
    expect(coordToZone({ x: 0, y: 0.67, z: 0 })).toBe('canopy');
  });

  it('zoneToY rơi đúng vào dải của zone đó (đi vòng vẫn về chỗ cũ)', () => {
    (['base', 'mid', 'canopy'] as const).forEach((z) => {
      expect(coordToZone({ x: 0, y: zoneToY(z), z: 0 })).toBe(z);
    });
  });
});

describe('coordToServer', () => {
  it('x ∈ [−1,1] → pos_x ∈ [0,1]', () => {
    expect(coordToServer({ x: -1, y: 0.5, z: 0 }).posX).toBeCloseTo(0, 6);
    expect(coordToServer({ x: 0, y: 0.5, z: 0 }).posX).toBeCloseTo(0.5, 6);
    expect(coordToServer({ x: 1, y: 0.5, z: 0 }).posX).toBeCloseTo(1, 6);
  });

  it('y đi thẳng thành pos_h', () => {
    expect(coordToServer({ x: 0, y: 0.83, z: 0 }).posH).toBeCloseTo(0.83, 4);
  });

  it('zone khớp với coordToZone', () => {
    expect(coordToServer({ x: 0, y: 0.2, z: 0.5 }).zone).toBe('base');
  });
});

describe('coordFromServer ⇄ coordToServer', () => {
  it('đi vòng qua server GIỮ NGUYÊN x và y (z không có chỗ lưu)', () => {
    const original = { x: 0.42, y: 0.71, z: -0.35 };
    const payload = coordToServer(original);
    const back = coordFromServer({
      fruit_id: 'f-1', zone: payload.zone, pos_x: payload.posX, pos_h: payload.posH,
    });
    expect(back.x).toBeCloseTo(original.x, 3);
    expect(back.y).toBeCloseTo(original.y, 3);
  });

  it('thiếu pos_x/pos_h → vẫn ra toạ-độ hợp lệ trong dải của zone', () => {
    const c = coordFromServer({ fruit_id: 'f-2', zone: 'canopy' });
    expect(coordToZone(c)).toBe('canopy');
    expect(c.x).toBeGreaterThanOrEqual(-1);
    expect(c.x).toBeLessThanOrEqual(1);
  });

  it('thiếu cả zone → coi như thân giữa', () => {
    expect(coordToZone(coordFromServer({ fruit_id: 'f-3' }))).toBe('mid');
  });

  it('cùng fruit_id → LUÔN cùng toạ-độ (quả không nhảy giữa các lần mở)', () => {
    const a = coordFromServer({ fruit_id: 'f-4', zone: 'mid' });
    const b = coordFromServer({ fruit_id: 'f-4', zone: 'mid' });
    expect(a).toEqual(b);
  });

  it('quả khác nhau KHÔNG dồn hết vào cùng một mặt phẳng z', () => {
    const zs = new Set(
      Array.from({ length: 12 }, (_, i) => coordFromServer({ fruit_id: `f-${i}`, zone: 'mid' }).z),
    );
    expect(zs.size).toBeGreaterThan(6);
  });
});

describe('derivedZ', () => {
  it('ổn định và nằm trong [−0.7, 0.7]', () => {
    for (let i = 0; i < 30; i++) {
      const z = derivedZ(`fruit-${i}`);
      expect(z).toBe(derivedZ(`fruit-${i}`));
      expect(z).toBeGreaterThanOrEqual(-0.7);
      expect(z).toBeLessThanOrEqual(0.7);
    }
  });
});

describe('DEFAULT_FRUIT_COORD', () => {
  it('mặc định nằm ở thân giữa và hợp lệ', () => {
    expect(clampCoord(DEFAULT_FRUIT_COORD)).toEqual(DEFAULT_FRUIT_COORD);
    expect(coordToZone(DEFAULT_FRUIT_COORD)).toBe('mid');
  });
});
