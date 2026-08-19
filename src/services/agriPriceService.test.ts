import { formatVnd, priceMove, type CommodityPrice } from './agriPriceService';

// Phần đọc TRANG đã chuyển sang `agroPriceService` (bảng Bộ Nông nghiệp) và
// `faostatService`; bài kiểm cho chúng nằm ở hai tệp đó. Ở đây chỉ còn phần
// phép tính biến động và định dạng số, vốn dùng chung cho mọi nguồn.

describe('priceMove — biến động so với lần đọc trước', () => {
  const p: CommodityPrice = {
    key: 'coffee', scope: 'domestic', nameKey: 'n', unitKey: 'u', priceVnd: 100_000, atMs: 0, source: 's',
  };

  it('tăng thì hướng lên, phần trăm đúng', () => {
    const m = priceMove(p, 90_000);
    expect(m.direction).toBe('up');
    expect(m.deltaVnd).toBe(10_000);
    expect(m.percent).toBeCloseTo(11.11, 1);
  });

  it('giảm thì hướng xuống', () => {
    expect(priceMove(p, 120_000).direction).toBe('down');
  });

  it('CHƯA có lần đọc trước → không phải "không đổi", mà là KHÔNG BIẾT', () => {
    const m = priceMove(p, null);
    expect(m.percent).toBeNull();
    expect(m.deltaVnd).toBeNull();
  });

  it('giá trước là 0 hoặc rác → cũng coi như không biết, không chia cho 0', () => {
    expect(priceMove(p, 0).percent).toBeNull();
    expect(priceMove(p, Number.NaN).percent).toBeNull();
  });
});

describe('formatVnd', () => {
  it('chấm phân cách nghìn theo lối Việt Nam', () => {
    expect(formatVnd(95300).replace(/ /g, ' ')).toMatch(/95[.,]300/);
  });
  it('số hỏng → gạch ngang', () => {
    expect(formatVnd(Number.NaN)).toBe('—');
  });
});
