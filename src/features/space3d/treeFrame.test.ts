import {
  DEFAULT_FRUIT_COORD, TREE_HEIGHT, TREE_RADIUS, UNSET_Z, clampCoord, coordFromServer,
  coordToLocalMeters, coordToServer, coordToZone, hasServerZ, zoneToY,
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

  it('z ∈ [−1,1] → pos_z ∈ [0,1] (trục sâu ĐƯỢC gửi lên, không rơi mất)', () => {
    expect(coordToServer({ x: 0, y: 0.5, z: -1 }).posZ).toBeCloseTo(0, 6);
    expect(coordToServer({ x: 0, y: 0.5, z: 0 }).posZ).toBeCloseTo(0.5, 6);
    expect(coordToServer({ x: 0, y: 0.5, z: 1 }).posZ).toBeCloseTo(1, 6);
    expect(coordToServer({ x: 0, y: 0.5, z: -0.35 }).posZ).toBeCloseTo(0.325, 4);
  });

  it('z ngoài dải bị kẹp trước khi đổi dải (không sinh pos_z < 0 hay > 1)', () => {
    expect(coordToServer({ x: 0, y: 0.5, z: -9 }).posZ).toBe(0);
    expect(coordToServer({ x: 0, y: 0.5, z: 9 }).posZ).toBe(1);
  });
});

describe('coordFromServer ⇄ coordToServer', () => {
  it('đi vòng qua server GIỮ NGUYÊN cả x, y VÀ z', () => {
    const original = { x: 0.42, y: 0.71, z: -0.35 };
    const payload = coordToServer(original);
    const back = coordFromServer({
      fruit_id: 'f-1', zone: payload.zone,
      pos_x: payload.posX, pos_h: payload.posH, pos_z: payload.posZ,
    });
    expect(back.x).toBeCloseTo(original.x, 3);
    expect(back.y).toBeCloseTo(original.y, 3);
    expect(back.z).toBeCloseTo(original.z, 3);
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

  it('pos_z thật từ server được DÙNG, không bị số suy-diễn đè lên', () => {
    expect(coordFromServer({ fruit_id: 'f-5', zone: 'mid', pos_z: 0 }).z).toBeCloseTo(-1, 6);
    expect(coordFromServer({ fruit_id: 'f-5', zone: 'mid', pos_z: 1 }).z).toBeCloseTo(1, 6);
    expect(coordFromServer({ fruit_id: 'f-5', zone: 'mid', pos_z: 0.75 }).z).toBeCloseTo(0.5, 6);
  });
});

// ── Ca "CHƯA BIẾT z" — chỗ trước đây bịa số ─────────────────────────────────
// Cũ: z = băm(fruit_id) → mỗi quả một độ sâu ngẫu-nhiên nhưng ổn-định, tức trông
// y hệt dữ-liệu đo thật. Mở mô hình trên máy khác là cả cây sai mà không có dấu
// hiệu nào báo. Số giả trông như thật là sai lệch thầm lặng — tệ hơn thiếu dữ-liệu.
describe('thiếu pos_z → "chưa đặt", KHÔNG bịa số', () => {
  it('không có pos_z → đúng mặt phẳng giữa (UNSET_Z), không phải số từ băm', () => {
    expect(coordFromServer({ fruit_id: 'f-a', zone: 'mid' }).z).toBe(UNSET_Z);
    expect(UNSET_Z).toBe(0);
  });

  it('pos_z = null (quả đăng ký trước khi có trục sâu) cũng là chưa đặt', () => {
    expect(coordFromServer({ fruit_id: 'f-b', zone: 'canopy', pos_z: null }).z).toBe(UNSET_Z);
  });

  it('gọi hai lần cùng đầu vào ra cùng kết quả (thuần, không ngẫu-nhiên)', () => {
    const a = coordFromServer({ fruit_id: 'f-c', zone: 'mid' });
    const b = coordFromServer({ fruit_id: 'f-c', zone: 'mid' });
    expect(a).toEqual(b);
  });

  it('MỌI quả chưa đặt đều nằm CHUNG một mặt phẳng — không rải cho giống thật', () => {
    const zs = new Set(
      Array.from({ length: 12 }, (_, i) => coordFromServer({ fruit_id: `f-${i}`, zone: 'mid' }).z),
    );
    expect(zs).toEqual(new Set([UNSET_Z]));
  });

  it('hasServerZ phân biệt được "đã đặt" với "chưa đặt"', () => {
    expect(hasServerZ({ fruit_id: 'f-d', pos_z: 0.5 })).toBe(true);
    expect(hasServerZ({ fruit_id: 'f-d', pos_z: 0 })).toBe(true);   // 0 là số đo hợp lệ, không phải "trống"
    expect(hasServerZ({ fruit_id: 'f-d', pos_z: null })).toBe(false);
    expect(hasServerZ({ fruit_id: 'f-d' })).toBe(false);
    expect(hasServerZ({ fruit_id: 'f-d', pos_z: NaN })).toBe(false);
  });
});

describe('DEFAULT_FRUIT_COORD', () => {
  it('mặc định nằm ở thân giữa và hợp lệ', () => {
    expect(clampCoord(DEFAULT_FRUIT_COORD)).toEqual(DEFAULT_FRUIT_COORD);
    expect(coordToZone(DEFAULT_FRUIT_COORD)).toBe('mid');
  });
});
