/**
 * Bài kiểm cho `agriNewsService` — phần ĐỌC RSS.
 *
 * Đọc XML bằng biểu thức chính quy chỉ an toàn khi có bài kiểm bám: báo đổi cách
 * bọc CDATA, đổi thẻ ảnh, hay đổi dạng ngày là mục tin lặng lẽ trống trơn chứ
 * không có lỗi nào nổ ra. Mẫu dưới đây lấy đúng hình dạng thật của Dân Việt.
 */

import {
  parseFeed, parseRssDate, cleanText, mergeFeeds, timeAgoVi, type NewsItem,
} from './agriNewsService';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title><![CDATA[Nhà nông | danviet.vn]]></title>
<item><title><![CDATA[Mít giá thấp vẫn cười: tâm lý bán "mít lùa"]]></title>
<link>https://danviet.vn/mit-gia-thap-d1451255.html</link>
<description><![CDATA[Nhà vườn trồng mít tại ĐBSCL bước vào đợt bán quy mô lớn.]]></description>
<pubDate>2026-08-14T09:52:00 +07:00</pubDate>
<image>https://t.ex-cdn.com/danviet.vn/480w/files/mit.jpg</image>
<guid>https://danviet.vn/mit-gia-thap-d1451255.html</guid></item>
<item><title>Giá lúa hôm nay</title>
<link>https://danviet.vn/gia-lua-d1451300.html</link>
<description>Giá lúa tăng nhẹ.</description>
<pubDate>Wed, 13 Aug 2026 08:00:00 +0700</pubDate></item>
</channel></rss>`;

describe('parseFeed', () => {
  const items = parseFeed(FEED, 'Dân Việt · Nhà nông');

  it('đọc đủ tin, giữ nguyên thứ tự feed', () => {
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Mít giá thấp vẫn cười: tâm lý bán "mít lùa"');
  });

  it('gỡ CDATA khỏi tiêu đề và tóm tắt', () => {
    expect(items[0].title).not.toContain('CDATA');
    expect(items[0].summary).toBe('Nhà vườn trồng mít tại ĐBSCL bước vào đợt bán quy mô lớn.');
  });

  it('lấy được ảnh minh hoạ; tin không có ảnh thì null chứ không phải chuỗi rỗng', () => {
    expect(items[0].imageUrl).toBe('https://t.ex-cdn.com/danviet.vn/480w/files/mit.jpg');
    expect(items[1].imageUrl).toBeNull();
  });

  it('bỏ tin không có đường dẫn mở được — giữ lại cũng không bấm vào đâu', () => {
    const broken = '<rss><channel><item><title>Không link</title></item></channel></rss>';
    expect(parseFeed(broken, 's')).toEqual([]);
  });

  it('feed rỗng / hỏng → mảng rỗng, không ném', () => {
    expect(parseFeed('', 's')).toEqual([]);
    expect(parseFeed('<html>trang lỗi 404</html>', 's')).toEqual([]);
    expect(parseFeed(undefined as unknown as string, 's')).toEqual([]);
  });

  it('đọc được cả thẻ ảnh kiểu enclosure / media:content của báo khác', () => {
    const other = `<rss><channel><item><title>A</title><link>https://x.vn/a</link>
      <enclosure url="https://x.vn/a.jpg" type="image/jpeg"/></item></channel></rss>`;
    expect(parseFeed(other, 's')[0].imageUrl).toBe('https://x.vn/a.jpg');
  });
});

describe('parseRssDate', () => {
  it('đọc dạng RFC-822 quen thuộc', () => {
    expect(parseRssDate('Wed, 13 Aug 2026 08:00:00 +0700')).toBeGreaterThan(0);
  });

  it('đọc dạng ISO có KHOẢNG TRẮNG trước múi giờ — dạng Dân Việt đang trả', () => {
    const ms = parseRssDate('2026-08-14T09:52:00 +07:00');
    expect(ms).toBeGreaterThan(0);
    expect(new Date(ms).toISOString()).toBe('2026-08-14T02:52:00.000Z');
  });

  it('ngày hỏng → 0 (tin xuống cuối) chứ không bịa "vừa xong"', () => {
    expect(parseRssDate('hôm qua')).toBe(0);
    expect(parseRssDate('')).toBe(0);
  });
});

describe('mergeFeeds', () => {
  const mk = (id: string, at: number): NewsItem => ({
    id, title: id, link: id, summary: '', imageUrl: null, publishedAt: at, source: 's',
  });

  it('bỏ tin trùng giữa hai chuyên mục — cùng bài hay đăng ở cả hai', () => {
    const out = mergeFeeds([[mk('a', 3)], [mk('a', 3), mk('b', 2)]]);
    expect(out.map(i => i.id)).toEqual(['a', 'b']);
  });

  it('xếp mới nhất trước', () => {
    const out = mergeFeeds([[mk('cũ', 1), mk('mới', 9)]]);
    expect(out[0].id).toBe('mới');
  });

  it('cắt đúng số lượng — trang Tổng quan không phải trang báo', () => {
    const many = Array.from({ length: 40 }, (_, i) => mk(`t${i}`, i));
    expect(mergeFeeds([many], 12)).toHaveLength(12);
  });
});

describe('timeAgoVi', () => {
  const now = Date.parse('2026-08-14T10:00:00Z');
  it.each([
    [now - 30_000, 'Vừa xong'],
    [now - 5 * 60_000, '5 phút trước'],
    [now - 3 * 3_600_000, '3 giờ trước'],
    [now - 2 * 86_400_000, '2 ngày trước'],
  ])('%s → %s', (ms, want) => {
    expect(timeAgoVi(ms as number, now)).toBe(want);
  });

  it('quá một tuần thì hiện ngày/tháng', () => {
    expect(timeAgoVi(Date.parse('2026-07-01T10:00:00Z'), now)).toBe('01/07');
  });

  it('không có ngày → chuỗi rỗng, không hiện "Vừa xong" sai sự thật', () => {
    expect(timeAgoVi(0, now)).toBe('');
  });
});

describe('cleanText', () => {
  it('đổi thực thể HTML về ký tự thật', () => {
    expect(cleanText('Lúa &amp; ngô &quot;vụ hè&quot;')).toBe('Lúa & ngô "vụ hè"');
  });

  it('gộp khoảng trắng và xuống dòng', () => {
    expect(cleanText('  a\n\n  b  ')).toBe('a b');
  });
});
