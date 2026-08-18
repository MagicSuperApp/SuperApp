import { hourBucket, hoursBetween, previousPoint, type PricePoint } from './priceHistoryDb';

const H = 3600_000;
const at = (hours: number): number => hours * H;
const pt = (hours: number, price: number): PricePoint => ({
  commodity: 'coffee', hourBucket: at(hours), priceVnd: price,
});

describe('hourBucket — gom mọi lần đọc trong một giờ về một ô', () => {
  it('10:37 và 10:59 rơi vào cùng ô 10:00', () => {
    const a = hourBucket(at(10) + 37 * 60_000);
    const b = hourBucket(at(10) + 59 * 60_000);
    expect(a).toBe(b);
    expect(a).toBe(at(10));
  });

  it('11:00 sang ô mới', () => {
    expect(hourBucket(at(11))).not.toBe(hourBucket(at(10) + 59 * 60_000));
  });

  it('số hỏng → 0, không trả NaN vào khoá chính của bảng', () => {
    expect(hourBucket(Number.NaN)).toBe(0);
  });
});

describe('previousPoint — ô gần nhất TRƯỚC ô đang xét', () => {
  it('lấy ô liền trước khi có đủ', () => {
    const rows = [pt(10, 95_000), pt(9, 90_000), pt(8, 88_000)];
    expect(previousPoint(rows, at(10))!.priceVnd).toBe(90_000);
  });

  it('app không chạy suốt đêm → vẫn lấy ô cũ hơn, không bỏ trống', () => {
    // Đòi đúng ô kề mà không có thì cả ngày không hiện được biến động nào.
    const rows = [pt(10, 95_000), pt(2, 80_000)];
    expect(previousPoint(rows, at(10))!.priceVnd).toBe(80_000);
  });

  it('KHÔNG lấy chính ô hiện tại làm ô trước', () => {
    expect(previousPoint([pt(10, 95_000)], at(10))).toBeNull();
  });

  it('không lấy ô ở TƯƠNG LAI (đồng hồ máy bị chỉnh lùi)', () => {
    expect(previousPoint([pt(12, 99_000)], at(10))).toBeNull();
  });

  it('chưa có gì → null', () => {
    expect(previousPoint([], at(10))).toBeNull();
    expect(previousPoint(undefined as any, at(10))).toBeNull();
  });
});

describe('hoursBetween — để nói đúng "so với mấy giờ trước"', () => {
  it('kề nhau là 1 giờ', () => expect(hoursBetween(at(10), at(9))).toBe(1));
  it('cách 6 ô là 6 giờ', () => expect(hoursBetween(at(10), at(4))).toBe(6));
  it('không bao giờ trả 0 — "so với 0 giờ trước" là câu vô nghĩa', () => {
    expect(hoursBetween(at(10), at(10))).toBe(1);
  });
});
