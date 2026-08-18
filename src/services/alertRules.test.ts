import type { NewsItem } from './agriNewsService';
import type { CommodityPrice, PriceMove } from './agriPriceService';
import {
  GUST_SEVERE_KPH, GUST_WARN_KPH, WEATHER_LOOKAHEAD_H,
  dropRecent, hoursUntil, isHeavyRainCode, isStormCode, priceAlert,
  significantWords, trendAlerts, weatherAlerts,
} from './alertRules';

const NOW = 1_700_000_000_000;
const H = 3600_000;

const price: CommodityPrice = {
  key: 'coffee', scope: 'domestic', nameKey: 'trace.price.coffee', unitKey: 'trace.price.perKg',
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

// ═══════════════════════════════════════════════════════════════════════════
// THỜI TIẾT DỮ
// ═══════════════════════════════════════════════════════════════════════════

const WX_NOW = Date.parse('2026-08-18T08:00:00+07:00');
const hourAt = (h: number, over: Partial<{ code: number; rainChance: number; gustKph: number }> = {}) => ({
  at: WX_NOW + h * 3600_000,
  code: 0,
  rainChance: 0,
  gustKph: 0,
  ...over,
});
const wx = (nowCode: number, windKph = 0, hours: ReturnType<typeof hourAt>[] = []) =>
  ({ now: { code: nowCode, windKph }, hours });

describe('isStormCode / isHeavyRainCode — chặn TRẦN, không nuốt mã lạ', () => {
  it('WMO chỉ có 95 · 96 · 99 là dông', () => {
    for (const c of [95, 96, 99]) expect(isStormCode(c)).toBe(true);
    for (const c of [94, 97, 98, 100, 0]) expect(isStormCode(c)).toBe(false);
  });
  it('mưa TO là 65 và 82 — mưa nhỏ 61 không phải', () => {
    expect(isHeavyRainCode(65)).toBe(true);
    expect(isHeavyRainCode(82)).toBe(true);
    expect(isHeavyRainCode(61)).toBe(false);
    expect(isHeavyRainCode(80)).toBe(false);
  });
});

describe('weatherAlerts', () => {
  it('trời quang, không gió → im lặng', () => {
    expect(weatherAlerts(wx(0), { now: WX_NOW })).toEqual([]);
  });

  it('ĐANG dông → báo ngay, dù người dùng có thể đang đứng ngoài đó', () => {
    const a = weatherAlerts(wx(95), { now: WX_NOW });
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe('weather');
    expect(a[0].titleKey).toBe('trace.alert.stormNow');
    expect(a[0].bodyKey).toBe('trace.alert.stormNow.body');
  });

  it('dông trong vài giờ tới → báo kèm SỐ GIỜ', () => {
    const a = weatherAlerts(wx(0, 0, [hourAt(1), hourAt(3, { code: 96 })]), { now: WX_NOW });
    expect(a[0].titleKey).toBe('trace.alert.stormSoon');
    expect(a[0].vars.h).toBe(3);
  });

  it('dông NGOÀI tầm nhìn trước thì chưa báo — đừng doạ về chuyện tối mai', () => {
    const far = hourAt(WEATHER_LOOKAHEAD_H + 2, { code: 95 });
    expect(weatherAlerts(wx(0, 0, [far]), { now: WX_NOW })).toEqual([]);
  });

  it('giờ đã QUA không tính', () => {
    expect(weatherAlerts(wx(0, 0, [hourAt(-2, { code: 95 })]), { now: WX_NOW })).toEqual([]);
  });

  it('gió giật lấy con LỚN NHẤT trong cả cửa sổ, không chỉ giờ hiện tại', () => {
    const a = weatherAlerts(wx(0, 10, [hourAt(2, { gustKph: 80 })]), { now: WX_NOW });
    expect(a[0].titleKey).toBe('trace.alert.gustSevere');
    expect(a[0].vars.kph).toBe(80);
  });

  it('hai mốc gió tách bạch: 50 là "mạnh", 75 là "rất mạnh"', () => {
    expect(weatherAlerts(wx(0, GUST_WARN_KPH), { now: WX_NOW })[0].titleKey).toBe('trace.alert.gust');
    expect(weatherAlerts(wx(0, GUST_SEVERE_KPH), { now: WX_NOW })[0].titleKey).toBe('trace.alert.gustSevere');
    expect(weatherAlerts(wx(0, GUST_WARN_KPH - 1), { now: WX_NOW })).toEqual([]);
  });

  it('mưa to sắp tới → báo, nhưng chỉ khi không có gì nặng hơn', () => {
    const a = weatherAlerts(wx(0, 0, [hourAt(2, { code: 82 })]), { now: WX_NOW });
    expect(a[0].titleKey).toBe('trace.alert.heavyRain');
  });

  it('MỘT cơn = MỘT cảnh báo: dông kèm gió giật kèm mưa to chỉ báo cái nặng nhất', () => {
    const a = weatherAlerts(
      wx(95, 90, [hourAt(1, { code: 82, gustKph: 90 })]),
      { now: WX_NOW },
    );
    expect(a).toHaveLength(1);
    expect(a[0].titleKey).toBe('trace.alert.stormNow');
  });

  it('không có dữ liệu → im lặng, không đoán', () => {
    expect(weatherAlerts(null, { now: WX_NOW })).toEqual([]);
    expect(weatherAlerts(undefined, { now: WX_NOW })).toEqual([]);
  });

  it('thiếu mảng giờ vẫn xét được giờ hiện tại', () => {
    expect(weatherAlerts({ now: { code: 99, windKph: 0 } }, { now: WX_NOW })[0].titleKey)
      .toBe('trace.alert.stormNow');
  });

  it('khoá gộp theo NGÀY — dông hôm nay và dông mai là hai chuyện', () => {
    const today = weatherAlerts(wx(95), { now: WX_NOW })[0].id;
    const tomorrow = weatherAlerts(wx(95), { now: WX_NOW + 24 * 3600_000 })[0].id;
    expect(today).not.toBe(tomorrow);
  });
});

describe('hoursUntil', () => {
  it('làm tròn LÊN và tối thiểu 1 — "còn 0 giờ nữa" là câu vô nghĩa', () => {
    expect(hoursUntil(WX_NOW + 10 * 60_000, WX_NOW)).toBe(1);
    expect(hoursUntil(WX_NOW + 61 * 60_000, WX_NOW)).toBe(2);
    expect(hoursUntil(WX_NOW - 5000, WX_NOW)).toBe(1);
  });
});
