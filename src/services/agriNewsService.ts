/**
 * agriNewsService — tin nông nghiệp Việt Nam cho trang Tổng quan.
 *
 * Nguồn: RSS công khai của báo Dân Việt — chuyên mục **Nhà nông** và **Nông thôn
 * mới**. Chọn hai mục này vì chúng viết cho chính người đọc của app: giá nông
 * sản, sâu bệnh, mùa vụ, chính sách — chứ không phải tin kinh tế vĩ mô.
 *
 * ── Vì sao RSS chứ không phải một API tin tức ───────────────────────────────
 * Các API tổng hợp tin đều cần khoá và có hạn mức; khoá nhúng trong app di động
 * coi như công khai, và tới ngày vượt hạn mức thì cả mục tin tắt ngóm. RSS là
 * đường công khai, không khoá, các toà báo Việt Nam đều giữ ổn định nhiều năm.
 *
 * ── Vì sao tự đọc XML, không thêm thư viện ──────────────────────────────────
 * RSS 2.0 phẳng và cực kỳ đều: `<item>` chứa `title` · `link` · `description` ·
 * `pubDate` · `image`. Kéo cả một trình phân tích XML vào bản dựng cho năm cái
 * thẻ là đổi vài chục KB lấy một thứ đã biết trước hình dạng. Hàm đọc dưới đây
 * là hàm thuần và có bài kiểm bám — sai ở đâu thì test đỏ, không phải người dùng
 * phát hiện hộ.
 */

const FEEDS: Array<{ url: string; source: string }> = [
  { url: 'https://danviet.vn/nha-nong.rss', source: 'Dân Việt · Nhà nông' },
  { url: 'https://danviet.vn/nong-thon-moi.rss', source: 'Dân Việt · Nông thôn mới' },
];

const TIMEOUT_MS = 12_000;
/** Số tin giữ lại sau khi gộp — trang Tổng quan không phải trang báo. */
const MAX_ITEMS = 12;

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  summary: string;
  imageUrl: string | null;
  /** Mốc thời gian (ms). 0 = không đọc được ngày. */
  publishedAt: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Đọc XML
// ---------------------------------------------------------------------------

/** Gỡ CDATA + đổi thực thể HTML + gộp khoảng trắng. */
export function cleanText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tagOf(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? cleanText(m[1]) : '';
}

/**
 * Ảnh minh hoạ. Dân Việt trả `<image>`; các báo khác hay dùng `<enclosure url>`
 * hoặc `<media:content url>` — đọc cả ba để đổi nguồn không phải sửa lại đây.
 * Không có ảnh thì trả `null`, thẻ tin tự rơi về bố cục chỉ-chữ.
 */
function imageOf(item: string): string | null {
  const direct = tagOf(item, 'image');
  if (/^https?:\/\//.test(direct)) return direct;
  const attr = item.match(/<(?:enclosure|media:content|media:thumbnail)[^>]*url="([^"]+)"/i);
  if (attr && /^https?:\/\//.test(attr[1])) return attr[1];
  const inDesc = item.match(/<img[^>]*src="([^"]+)"/i);
  return inDesc && /^https?:\/\//.test(inDesc[1]) ? inDesc[1] : null;
}

/**
 * `pubDate` → ms. RSS cho phép nhiều dạng; Dân Việt trả
 * `2026-08-14T09:52:00 +07:00` (có KHOẢNG TRẮNG trước múi giờ) mà `new Date()`
 * không nuốt được — bỏ khoảng trắng đó trước khi đọc. Không đọc được thì trả 0
 * và tin xuống cuối danh sách, chứ không bịa "vừa xong".
 */
export function parseRssDate(raw: string): number {
  const s = cleanText(raw);
  if (!s) return 0;
  const direct = Date.parse(s);
  if (!Number.isNaN(direct)) return direct;
  const tightened = Date.parse(s.replace(/\s+([+-]\d{2}:?\d{2})$/, '$1'));
  return Number.isNaN(tightened) ? 0 : tightened;
}

/** XML một feed → danh sách tin. Feed hỏng/rỗng → mảng rỗng, không ném. */
export function parseFeed(xml: string, source: string): NewsItem[] {
  if (!xml || typeof xml !== 'string') return [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const out: NewsItem[] = [];
  for (const raw of items) {
    const title = tagOf(raw, 'title');
    const link = tagOf(raw, 'link') || tagOf(raw, 'guid');
    if (!title || !/^https?:\/\//.test(link)) continue; // tin không mở được thì giữ làm gì
    out.push({
      id: link,
      title,
      link,
      summary: tagOf(raw, 'description'),
      imageUrl: imageOf(raw),
      publishedAt: parseRssDate((raw.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ?? [])[1] ?? ''),
      source,
    });
  }
  return out;
}

/** Gộp nhiều feed: bỏ tin trùng đường dẫn, xếp mới nhất trước, cắt còn `limit`. */
export function mergeFeeds(lists: NewsItem[][], limit = MAX_ITEMS): NewsItem[] {
  const seen = new Set<string>();
  const all: NewsItem[] = [];
  for (const list of lists) {
    for (const it of list) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      all.push(it);
    }
  }
  return all.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, limit);
}

/** "3 giờ trước" — người đọc cần biết tin còn mới không, không cần ngày giờ đầy đủ. */
export function timeAgoVi(ms: number, now = Date.now()): string {
  if (!ms) return '';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} ngày trước`;
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Mạng
// ---------------------------------------------------------------------------

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return [];
    return parseFeed(await resp.text(), source);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tin mới nhất từ mọi nguồn. Một nguồn chết KHÔNG kéo theo nguồn còn lại
 * (`Promise.all` trên các hàm đã tự nuốt lỗi) — mất một báo thì vẫn còn tin đọc.
 */
export async function fetchAgriNews(): Promise<NewsItem[]> {
  const lists = await Promise.all(FEEDS.map(f => fetchFeed(f.url, f.source)));
  return mergeFeeds(lists);
}
