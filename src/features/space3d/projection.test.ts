import {
  VIEW_DEFS, coordToScreenOffset, frustumHeightM, lockedAxis,
  metersPerPx, screenOffsetToCoord, type ViewDir,
} from './projection';
import { TREE_HEIGHT, TREE_RADIUS, type FruitCoord } from './treeFrame';

const CANVAS_H = 400;
const VIEWS: ViewDir[] = ['front', 'side', 'top'];

describe('metersPerPx', () => {
  it('canvas cao 0 px → 0 (chưa đo xong layout, không chia cho 0)', () => {
    expect(metersPerPx('front', 0)).toBe(0);
  });

  it('khung nhìn cao đúng frustumHeightM mét', () => {
    const mpp = metersPerPx('front', CANVAS_H);
    expect(mpp * CANVAS_H).toBeCloseTo(frustumHeightM('front'), 6);
  });

  it('hướng "trên" nhìn gần hơn (chỉ cần bao đường kính tán)', () => {
    expect(frustumHeightM('top')).toBeLessThan(frustumHeightM('front'));
  });
});

describe('coordToScreenOffset ⇄ screenOffsetToCoord', () => {
  const mppOf = (v: ViewDir) => metersPerPx(v, CANVAS_H);
  const samples: FruitCoord[] = [
    { x: 0, y: 0.5, z: 0 },
    { x: 0.6, y: 0.85, z: -0.4 },
    { x: -0.9, y: 0.12, z: 0.7 },
  ];

  VIEWS.forEach((view) => {
    it(`[${view}] đi vòng px → toạ-độ → px không đổi`, () => {
      const mpp = mppOf(view);
      samples.forEach((c) => {
        const off = coordToScreenOffset(view, c, mpp);
        const back = screenOffsetToCoord(view, c, off.dx, off.dy, mpp);
        const off2 = coordToScreenOffset(view, back, mpp);
        expect(off2.dx).toBeCloseTo(off.dx, 5);
        expect(off2.dy).toBeCloseTo(off.dy, 5);
      });
    });

    it(`[${view}] giữ NGUYÊN trục bị khoá khi kéo`, () => {
      const mpp = mppOf(view);
      const c = { x: 0.3, y: 0.6, z: -0.2 };
      const moved = screenOffsetToCoord(view, c, 40, -25, mpp);
      const axis = lockedAxis(view);
      if (axis === 'X') expect(moved.x).toBeCloseTo(c.x, 6);
      if (axis === 'Y') expect(moved.y).toBeCloseTo(c.y, 6);
      if (axis === 'Z') expect(moved.z).toBeCloseTo(c.z, 6);
    });

    it(`[${view}] mpp = 0 (chưa đo layout) không sinh NaN`, () => {
      const off = coordToScreenOffset(view, { x: 0.5, y: 0.5, z: 0.5 }, 0);
      expect(off).toEqual({ dx: 0, dy: 0 });
      const c = screenOffsetToCoord(view, { x: 0.5, y: 0.5, z: 0.5 }, 10, 10, 0);
      expect(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z)).toBe(true);
    });
  });

  it('tâm ngắm (giữa thân cây) rơi đúng TÂM canvas ở hướng Trước', () => {
    const off = coordToScreenOffset('front', { x: 0, y: 0.5, z: 0 }, mppOf('front'));
    expect(off.dx).toBeCloseTo(0, 6);
    expect(off.dy).toBeCloseTo(0, 6);
  });
});

describe('chiều kéo đúng trực giác', () => {
  const mpp = metersPerPx('front', CANVAS_H);

  it('[trước] kéo LÊN (dy âm) → quả LÊN CAO', () => {
    const c = screenOffsetToCoord('front', { x: 0, y: 0.5, z: 0 }, 0, -50, mpp);
    expect(c.y).toBeGreaterThan(0.5);
  });

  it('[trước] kéo SANG PHẢI → x tăng', () => {
    const c = screenOffsetToCoord('front', { x: 0, y: 0.5, z: 0 }, 50, 0, mpp);
    expect(c.x).toBeGreaterThan(0);
  });

  it('[bên] kéo SANG PHẢI → đi về phía BẮC (z giảm)', () => {
    const m = metersPerPx('side', CANVAS_H);
    const c = screenOffsetToCoord('side', { x: 0, y: 0.5, z: 0 }, 50, 0, m);
    expect(c.z).toBeLessThan(0);
  });

  it('[trên] kéo XUỐNG màn hình → đi về phía NAM (z tăng)', () => {
    const m = metersPerPx('top', CANVAS_H);
    const c = screenOffsetToCoord('top', { x: 0, y: 0.5, z: 0 }, 0, 50, m);
    expect(c.z).toBeGreaterThan(0);
  });

  it('kéo quá mạnh vẫn bị kẹp trong biên cây', () => {
    const c = screenOffsetToCoord('front', { x: 0, y: 0.5, z: 0 }, 99999, -99999, mpp);
    expect(c.x).toBeLessThanOrEqual(1);
    expect(c.y).toBeLessThanOrEqual(1);
  });
});

describe('thang đo khớp kích-thước cây thật', () => {
  it('[trước] ngọn cây cách tâm canvas đúng nửa chiều cao cây (quy ra px)', () => {
    const mpp = metersPerPx('front', CANVAS_H);
    const off = coordToScreenOffset('front', { x: 0, y: 1, z: 0 }, mpp);
    expect(off.dy).toBeCloseTo(-(TREE_HEIGHT / 2) / mpp, 5);
  });

  it('[trên] mép tán cách tâm canvas đúng TREE_RADIUS (quy ra px)', () => {
    const mpp = metersPerPx('top', CANVAS_H);
    const off = coordToScreenOffset('top', { x: 1, y: 0.5, z: 0 }, mpp);
    expect(off.dx).toBeCloseTo(TREE_RADIUS / mpp, 5);
  });
});

describe('VIEW_DEFS', () => {
  it('đúng 3 hướng chiếu, mỗi hướng khoá 1 trục khác nhau', () => {
    expect(VIEW_DEFS.map((v) => v.key)).toEqual(['front', 'side', 'top']);
    expect(new Set(VIEW_DEFS.map((v) => lockedAxis(v.key))).size).toBe(3);
  });

  it('hướng nào cũng có nhãn và gợi ý cho người dùng', () => {
    VIEW_DEFS.forEach((v) => {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.hint.length).toBeGreaterThan(0);
    });
  });
});
