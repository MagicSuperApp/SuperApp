import {
  asLatLon, localOffset, projectBoundary, pxPerMeter, radarPoint, zoneOf,
} from './radar';

const O = { lat: 10.5, lon: 106.5 };
const CENTER = { x: 200, y: 400 };

/** ~9 m về phía bắc (1e-4 độ vĩ ≈ 11,1 m). */
const NORTH_OF = { lat: 10.5001, lon: 106.5 };
/** ~11 m về phía đông ở vĩ độ này. */
const EAST_OF = { lat: 10.5, lon: 106.5001 };

describe('localOffset — độ sang mét', () => {
  it('lệch về bắc thì north dương, east bằng 0', () => {
    const o = localOffset(O, NORTH_OF);
    expect(o.north).toBeGreaterThan(10);
    expect(Math.abs(o.east)).toBeLessThan(0.001);
  });

  it('lệch về đông thì east dương, và NHỎ HƠN cùng số độ ở vĩ tuyến — cos(vĩ độ)', () => {
    const e = localOffset(O, EAST_OF).east;
    const n = localOffset(O, NORTH_OF).north;
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(n);
  });

  it('chính nó thì lệch 0', () => {
    expect(localOffset(O, O)).toEqual({ east: 0, north: 0 });
  });
});

describe('radarPoint — mặt phẳng xoay theo hướng máy', () => {
  const base = { pxPerM: 10, center: CENTER, radiusM: 20 };

  it('máy chĩa Bắc, cây ở phía bắc → chấm nằm PHÍA TRÊN tâm', () => {
    const p = radarPoint(O, NORTH_OF, { ...base, headingDeg: 0 });
    expect(p.y).toBeLessThan(CENTER.y);
    expect(Math.abs(p.x - CENTER.x)).toBeLessThan(1);
  });

  it('máy chĩa Bắc, cây ở phía đông → chấm nằm BÊN PHẢI tâm', () => {
    const p = radarPoint(O, EAST_OF, { ...base, headingDeg: 0 });
    expect(p.x).toBeGreaterThan(CENTER.x);
    expect(Math.abs(p.y - CENTER.y)).toBeLessThan(1);
  });

  it('người XOAY về đông thì chính cây phía đông chuyển lên TRÊN', () => {
    const p = radarPoint(O, EAST_OF, { ...base, headingDeg: 90 });
    expect(p.y).toBeLessThan(CENTER.y);
    expect(Math.abs(p.x - CENTER.x)).toBeLessThan(1);
  });

  it('xoay người 180° thì chấm lật sang phía đối diện tâm', () => {
    const a = radarPoint(O, NORTH_OF, { ...base, headingDeg: 0 });
    const b = radarPoint(O, NORTH_OF, { ...base, headingDeg: 180 });
    expect(a.y).toBeLessThan(CENTER.y);
    expect(b.y).toBeGreaterThan(CENTER.y);
  });

  it('chưa có la bàn → coi như Bắc quay lên, không nổ', () => {
    const p = radarPoint(O, NORTH_OF, { ...base, headingDeg: null });
    expect(p.y).toBeLessThan(CENTER.y);
  });

  it('khoảng cách càng xa thì chấm càng xa tâm, đúng theo tỉ lệ pixel', () => {
    const near = radarPoint(O, NORTH_OF, { ...base, headingDeg: 0 });
    const far = radarPoint(O, { lat: 10.5002, lon: 106.5 }, { ...base, headingDeg: 0 });
    expect(CENTER.y - far.y).toBeGreaterThan(CENTER.y - near.y);
  });

  it('ngoài bán kính thì đánh dấu inRange = false', () => {
    const p = radarPoint(O, { lat: 10.5010, lon: 106.5 }, { ...base, headingDeg: 0 });
    expect(p.distanceM).toBeGreaterThan(20);
    expect(p.inRange).toBe(false);
  });
});

describe('asLatLon — nối hai cách viết kinh độ', () => {
  it('nhận {lat, lon}', () => {
    expect(asLatLon({ lat: 10.5, lon: 106.5 })).toEqual({ lat: 10.5, lon: 106.5 });
  });

  it('nhận {lat, lng} — dạng ranh giới vườn đang lưu', () => {
    expect(asLatLon({ lat: 10.5, lng: 106.5 })).toEqual({ lat: 10.5, lon: 106.5 });
  });

  it('thiếu kinh độ → null, KHÔNG trả NaN im lặng', () => {
    expect(asLatLon({ lat: 10.5 })).toBeNull();
  });

  it('rác thì null chứ không nổ', () => {
    expect(asLatLon(null)).toBeNull();
    expect(asLatLon('10.5,106.5')).toBeNull();
    expect(asLatLon({ lat: 'x', lng: 'y' })).toBeNull();
  });
});

describe('projectBoundary — ranh giới vườn', () => {
  const base = { pxPerM: 10, center: CENTER, radiusM: 20, headingDeg: 0 };

  it('giữ ĐỦ số đỉnh, kể cả đỉnh ngoài tầm nhìn', () => {
    // Đỉnh thứ hai cách hơn 100 m — vẫn phải có mặt, vì nó định hình cạnh đi
    // ngang qua tầm nhìn.
    const pts = projectBoundary(O, [
      { lat: 10.5001, lng: 106.5 },
      { lat: 10.5010, lng: 106.5 },
      { lat: 10.5, lng: 106.5001 },
    ], base);
    expect(pts).toHaveLength(3);
  });

  it('bỏ qua đỉnh hỏng thay vì dựng đa-giác có NaN', () => {
    const pts = projectBoundary(O, [
      { lat: 10.5001, lng: 106.5 },
      { lat: 'hỏng' },
      null,
    ], base);
    expect(pts).toHaveLength(1);
    expect(Number.isFinite(pts[0].x)).toBe(true);
  });

  it('không có ranh giới → mảng rỗng, không nổ', () => {
    expect(projectBoundary(O, [], base)).toEqual([]);
    expect(projectBoundary(O, undefined as any, base)).toEqual([]);
  });

  it('xoay người thì cả đa-giác xoay theo, giống hệt chấm cây', () => {
    const a = projectBoundary(O, [{ lat: 10.5001, lng: 106.5 }], base)[0];
    const b = projectBoundary(O, [{ lat: 10.5001, lng: 106.5 }], { ...base, headingDeg: 180 })[0];
    expect(a.y).toBeLessThan(CENTER.y);
    expect(b.y).toBeGreaterThan(CENTER.y);
  });
});

describe('zoneOf — chia cụm theo tầm với', () => {
  it('trong tầm với', () => expect(zoneOf(3)).toBe('here'));
  it('còn nhìn rõ', () => expect(zoneOf(9)).toBe('near'));
  it('phải đi mới tới', () => expect(zoneOf(18)).toBe('far'));
  it('đúng mốc thì thuộc cụm gần hơn', () => {
    expect(zoneOf(5)).toBe('here');
    expect(zoneOf(12)).toBe('near');
  });
  it('số hỏng thì xếp vào xa nhất, không nổ', () => {
    expect(zoneOf(Number.NaN)).toBe('far');
  });
});

describe('pxPerMeter — bán kính vừa khít cạnh ngắn', () => {
  it('màn dọc thì lấy theo chiều RỘNG', () => {
    expect(pxPerMeter(360, 800, 20)).toBeCloseTo(9, 5);
  });
  it('bán kính lớn hơn thì mỗi mét ít pixel hơn', () => {
    expect(pxPerMeter(360, 800, 40)).toBeLessThan(pxPerMeter(360, 800, 20));
  });
  it('bán kính 0 thì trả 0 chứ không chia cho 0', () => {
    expect(pxPerMeter(360, 800, 0)).toBe(0);
  });
});
