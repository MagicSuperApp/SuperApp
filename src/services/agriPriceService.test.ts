import {
  PRICE_SOURCES, formatVnd, priceMove, toPrice, type CommodityPrice,
} from './agriPriceService';

const COFFEE = PRICE_SOURCES[0];
const page = (title: string) => `<html><head><title>${title}</title></head><body>x</body></html>`;

describe('toPrice — đọc giá từ trang, và biết khi nào KHÔNG đọc được', () => {
  it('đọc đúng khuôn tiêu đề thật của trang', () => {
    const p = toPrice(COFFEE, page('Giá cà phê hôm nay 18/08/2026 cao nhất 95,300 vnđ/kg'));
    expect(p!.priceVnd).toBe(95300);
    expect(new Date(p!.atMs).getDate()).toBe(18);
  });

  it('dấu chấm và dấu phẩy đều là phân cách nghìn, KHÔNG phải dấu thập phân', () => {
    // parseFloat("95,300") ra 95,3 — đúng cái bẫy phải tránh.
    expect(toPrice(COFFEE, page('Giá cà phê hôm nay 18/08/2026 cao nhất 95.300 vnđ/kg'))!.priceVnd)
      .toBe(95300);
  });

  it('trang đổi cách viết → trả null, KHÔNG đoán bừa', () => {
    expect(toPrice(COFFEE, page('Bản tin cà phê tuần này'))).toBeNull();
    expect(toPrice(COFFEE, '<html><body>95,300</body></html>')).toBeNull();
  });

  it('giá ngoài khoảng hợp lệ → null (trang đã đổi đơn vị hoặc ta đọc nhầm)', () => {
    // 9 đ/kg và 95 triệu đ/kg đều không phải giá cà phê.
    expect(toPrice(COFFEE, page('Giá cà phê hôm nay 18/08/2026 cao nhất 9 vnđ/kg'))).toBeNull();
    expect(toPrice(COFFEE, page('Giá cà phê hôm nay 18/08/2026 cao nhất 95.300.000 vnđ/kg'))).toBeNull();
  });

  it('không có ngày trong tiêu đề thì vẫn lấy được giá, atMs = 0', () => {
    const p = toPrice(COFFEE, page('Giá cà phê nội địa cao nhất 88.000 vnđ/kg'));
    expect(p!.priceVnd).toBe(88000);
    expect(p!.atMs).toBe(0);
  });

  it('trang rỗng → null, không nổ', () => {
    expect(toPrice(COFFEE, '')).toBeNull();
  });
});

describe('priceMove — biến động so với lần đọc trước', () => {
  const p: CommodityPrice = {
    key: 'coffee', nameKey: 'n', unitKey: 'u', priceVnd: 100_000, atMs: 0, source: 's',
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
