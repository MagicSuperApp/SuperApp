import type { NewsItem } from './agriNewsService';
import type { CommodityPrice, PriceMove } from './agriPriceService';
import {
  dropRecent, priceAlert, significantWords, trendAlerts,
} from './alertRules';

const NOW = 1_700_000_000_000;
const H = 3600_000;

const price: CommodityPrice = {
  key: 'coffee', nameKey: 'trace.price.coffee', unitKey: 'trace.price.perKg',
  priceVnd: 95_300, atMs: NOW, source: 'test',
};
const move = (percent: number | null, dir: 'up' | 'down' | 'flat' = 'up'): PriceMove => ({
  price, deltaVnd: percent == null ? null : 1, percent, direction: dir,
});

describe('priceAlert — chỉ cắt ngang khi đủ lớn', () => {
  it('đổi 8% → báo', () => {
    expect(priceAlert(move(8))).not.toBeNull();
  });

  it('đổi 2% → KHÔNG báo, đó là dao động thường ngày', () => {
    expect(priceAlert(move(2))).toBeNull();
  });

  it('giảm mạnh cũng báo, và dùng khoá chữ khác', () => {
    expect(priceAlert(move(-9, 'down'))!.titleKey).toBe('trace.alert.priceDown');
  });

  it('LẦN ĐỌC ĐẦU (chưa có gì để so) → KHÔNG báo', () => {
    // Báo "giá thay đổi" ngay lần đầu mở app là báo về một thay đổi chưa xảy ra.
    expect(priceAlert(move(null))).toBeNull();
  });

  it('đúng mốc 5% thì báo', () => {
    expect(priceAlert(move(5))).not.toBeNull();
  });
});

describe('significantWords — bỏ từ không phân biệt được gì', () => {
  it('bỏ từ phổ thông và từ quá ngắn', () => {
    const w = significantWords('Giá cà phê hôm nay của các vùng trồng tăng mạnh');
    expect(w.has('giá')).toBe(false);
    expect(w.has('hôm')).toBe(false);
    expect(w.has('trồng')).toBe(true);
  });

  it('bỏ dấu câu, không vỡ', () => {
    expect(significantWords('Sầu riêng: xuất khẩu tăng!').has('riêng')).toBe(true);
  });

  it('chuỗi rỗng → tập rỗng', () => {
    expect(significantWords('').size).toBe(0);
  });
});

describe('trendAlerts — nhiều NGUỒN cùng viết mới là chuyện đang xảy ra', () => {
  const mk = (id: string, source: string, title: string, agoH = 1): NewsItem => ({
    id, source, title, link: `https://x/${id}`, summary: '', imageUrl: null,
    publishedAt: NOW - agoH * H,
  });

  it('ba nguồn khác nhau cùng chủ đề → một cảnh báo', () => {
    const out = trendAlerts([
      mk('1', 'BaoA', 'Sầu riêng xuất khẩu Trung Quốc tăng mạnh'),
      mk('2', 'BaoB', 'Xuất khẩu sầu riêng sang Trung Quốc lập kỷ lục'),
      mk('3', 'BaoC', 'Trung Quốc mua sầu riêng nhiều chưa từng thấy'),
    ], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('trend');
  });

  it('MỘT nguồn đăng ba bài → KHÔNG phải xu hướng', () => {
    // Một trang đăng lại chính nó không làm nên một sự kiện.
    const out = trendAlerts([
      mk('1', 'BaoA', 'Sầu riêng xuất khẩu Trung Quốc tăng mạnh'),
      mk('2', 'BaoA', 'Xuất khẩu sầu riêng sang Trung Quốc kỷ lục'),
      mk('3', 'BaoA', 'Trung Quốc mua sầu riêng rất nhiều'),
    ], { now: NOW });
    expect(out).toHaveLength(0);
  });

  it('ba nguồn nhưng ba chuyện khác nhau → không có xu hướng nào', () => {
    const out = trendAlerts([
      mk('1', 'BaoA', 'Sầu riêng xuất khẩu tăng mạnh'),
      mk('2', 'BaoB', 'Cà phê Tây Nguyên mất mùa'),
      mk('3', 'BaoC', 'Lúa đông xuân gieo sạ sớm'),
    ], { now: NOW });
    expect(out).toHaveLength(0);
  });

  it('tin cũ ngoài khung giờ thì không tính', () => {
    const out = trendAlerts([
      mk('1', 'BaoA', 'Sầu riêng xuất khẩu Trung Quốc tăng', 40),
      mk('2', 'BaoB', 'Xuất khẩu sầu riêng Trung Quốc kỷ lục', 40),
      mk('3', 'BaoC', 'Trung Quốc mua sầu riêng nhiều', 40),
    ], { now: NOW });
    expect(out).toHaveLength(0);
  });

  it('danh sách rỗng → không nổ', () => {
    expect(trendAlerts([], { now: NOW })).toEqual([]);
    expect(trendAlerts(undefined as any, { now: NOW })).toEqual([]);
  });
});

describe('dropRecent — không báo lại chuyện vừa báo', () => {
  const a = { id: 'x', kind: 'price' as const, titleKey: 't', vars: {}, body: '' };

  it('vừa báo 2 giờ trước → bỏ', () => {
    expect(dropRecent([a], { x: NOW - 2 * H }, NOW)).toEqual([]);
  });

  it('báo từ 20 giờ trước → cho báo lại', () => {
    expect(dropRecent([a], { x: NOW - 20 * H }, NOW)).toHaveLength(1);
  });

  it('chưa báo bao giờ → cho báo', () => {
    expect(dropRecent([a], {}, NOW)).toHaveLength(1);
    expect(dropRecent([a], undefined as any, NOW)).toHaveLength(1);
  });
});
