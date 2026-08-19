import {
  BOX_PAD_RATIO, centerOf, hitTest, imageBoxToPreview, matchSlots, padBbox, previewPointToImage,
} from './previewBox';

/** Ảnh 4:3 ngang, khung xem vuông 300 dp. */
const IMG = { w: 1600, h: 1200 };
const VIEW = { w: 300, h: 300 };
const SCALE = 0.25;
const OFF_X = -50;

/** Ảnh ĐÃ CẮT VUÔNG — hình dạng thật của đường chụp từ khung ngắm. */
const SQ = { w: 1200, h: 1200 };

describe('imageBoxToPreview — luật cover', () => {
  it('ảnh vuông (đường chụp từ khung ngắm) → nhân thẳng, không cắt gì', () => {
    const r = imageBoxToPreview([300, 300, 600, 600], SQ, VIEW)!;
    expect(r).toEqual({ x: 75, y: 75, w: 150, h: 150 });
  });

  it('ảnh 4:3 (đường thư viện) → trừ đúng phần bị cắt hai bên', () => {
    const r = imageBoxToPreview([700, 500, 200, 200], IMG, VIEW)!;
    expect(r.x).toBeCloseTo(700 * SCALE + OFF_X, 5);
    expect(r.y).toBeCloseTo(500 * SCALE, 5);
    expect(r.w).toBeCloseTo(50, 5);
  });

  it('quả nằm hẳn ngoài phần nhìn thấy → null, không vẽ hộp ma', () => {
    expect(imageBoxToPreview([0, 0, 100, 100], IMG, VIEW)).toBeNull();
  });

  it('số rác → null chứ không ra NaN vẽ lên màn', () => {
    expect(imageBoxToPreview([NaN, 0, 10, 10], SQ, VIEW)).toBeNull();
    expect(imageBoxToPreview([0, 0, 0, 10], SQ, VIEW)).toBeNull();
    expect(imageBoxToPreview(null, SQ, VIEW)).toBeNull();
    expect(imageBoxToPreview([0, 0, 10, 10], SQ, null)).toBeNull();
    expect(imageBoxToPreview([1, 2, 3] as any, SQ, VIEW)).toBeNull();
  });
});

describe('previewPointToImage — chạm ngược về pixel ảnh', () => {
  it('là phép nghịch của imageBoxToPreview', () => {
    const p = previewPointToImage({ x: 125, y: 125 }, IMG, VIEW)!;
    expect(p.x).toBeCloseTo(700, 5);
    expect(p.y).toBeCloseTo(500, 5);
  });
  it('thiếu kích thước → null', () => {
    expect(previewPointToImage({ x: 1, y: 1 }, null, VIEW)).toBeNull();
    expect(previewPointToImage({ x: NaN, y: 1 }, SQ, VIEW)).toBeNull();
  });
});

describe('hitTest', () => {
  const big = { x: 0, y: 0, w: 200, h: 200 };
  const small = { x: 50, y: 50, w: 40, h: 40 };

  it('chạm ngoài mọi hộp → -1', () => {
    expect(hitTest([big, small], { x: 300, y: 300 })).toBe(-1);
  });
  it('chạm chỗ chồng nhau → chọn hộp NHỎ hơn', () => {
    expect(hitTest([big, small], { x: 60, y: 60 })).toBe(1);
  });
  it('bỏ qua ô trống trong danh sách', () => {
    expect(hitTest([null, small], { x: 60, y: 60 })).toBe(1);
    expect(hitTest([null, null], { x: 60, y: 60 })).toBe(-1);
  });
  it('trúng đúng mép vẫn tính là trúng — ngón tay không đặt vào giữa pixel được', () => {
    expect(hitTest([small], { x: 50, y: 50 })).toBe(0);
    expect(hitTest([small], { x: 90, y: 90 })).toBe(0);
  });
});

describe('matchSlots — khung phải TRƯỢT tới vùng gần nhất, không bay chéo', () => {
  const A = { x: 0, y: 0, w: 20, h: 20 };
  const B = { x: 200, y: 200, w: 20, h: 20 };

  it('máy chủ đảo thứ tự thì khung vẫn ở nguyên ô của nó', () => {
    const out = matchSlots([A, B], [{ ...B, x: 205 }, { ...A, x: 5 }], 2);
    expect(out[0]!.x).toBe(5);
    expect(out[1]!.x).toBe(205);
  });
  it('ít vùng hơn lượt trước → ô thừa để trống', () => {
    const out = matchSlots([A, B], [{ ...A, y: 2 }], 2);
    expect(out[0]!.y).toBe(2);
    expect(out[1]).toBeNull();
  });
  it('vùng mới xuất hiện → nhận ô trống', () => {
    expect(matchSlots([A, null], [A, B], 2)).toEqual([A, B]);
  });
  it('lượt đầu → xếp lần lượt', () => {
    expect(matchSlots([null, null], [A, B], 2)).toEqual([A, B]);
  });
  it('thừa vùng hơn số ô → bỏ bớt, không vẽ đè', () => {
    expect(matchSlots([null], [A, B], 1)).toEqual([A]);
  });
  it('tất định và không sửa mảng gốc', () => {
    const prev = [A, B];
    const next = [B, A];
    expect(matchSlots(prev, next, 2)).toEqual(matchSlots(prev, next, 2));
    expect(prev).toEqual([A, B]);
  });
});

describe('padBbox — nới hộp để giữ rìa quả', () => {
  it('nới đều bốn phía theo tỉ lệ', () => {
    const [x, y, w, h] = padBbox([500, 400, 100, 100], SQ);
    expect(x).toBeCloseTo(500 - 100 * BOX_PAD_RATIO, 5);
    expect(y).toBeCloseTo(400 - 100 * BOX_PAD_RATIO, 5);
    expect(w).toBeCloseTo(100 * (1 + BOX_PAD_RATIO * 2), 5);
    expect(h).toBeCloseTo(100 * (1 + BOX_PAD_RATIO * 2), 5);
  });
  it('không tràn ra ngoài mép ảnh', () => {
    const [x, y, w, h] = padBbox([0, 0, SQ.w, SQ.h], SQ);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(w).toBeLessThanOrEqual(SQ.w);
    expect(h).toBeLessThanOrEqual(SQ.h);
  });
});

describe('centerOf', () => {
  it('tâm là tâm', () => {
    expect(centerOf({ x: 10, y: 20, w: 30, h: 40 })).toEqual({ x: 25, y: 40 });
  });
});
