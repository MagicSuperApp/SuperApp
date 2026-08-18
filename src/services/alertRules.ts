/**
 * alertRules — CÁI GÌ ĐÁNG BÁO cho người dùng, và cái gì thì không.
 *
 * ── Vì sao tách riêng, thuần tính, có bài kiểm ──────────────────────────────
 * Báo về điện thoại là thứ CẮT NGANG người ta. Nhà vườn đang lái xe, đang phun
 * thuốc, đang ngủ. Một thông báo sai chỗ không chỉ vô ích — nó dạy người dùng
 * tắt hết thông báo, và sau đó cái báo thật sự quan trọng cũng không tới nơi.
 *
 * Nên ngưỡng phải là số, viết một chỗ, có bài kiểm bám. Không rải `if` trong màn.
 *
 * ── Giá: có số thật, nên có luật thật ───────────────────────────────────────
 * Đổi ≥ 5% trong một lần đọc là mức đủ để đổi quyết định bán hay giữ hàng. Dưới
 * mức đó là dao động thường ngày; báo mỗi lần nhích là báo mỗi ngày.
 *
 * ── Tin: KHÔNG đoán "độ nóng" từ tiêu đề ────────────────────────────────────
 * Cám dỗ ở đây là chấm điểm tiêu đề theo từ khoá ("giá", "dịch", "cấm"…) rồi gọi
 * đó là độ nóng. Đó là gán ý nghĩa cho thứ mình không đo được — cùng lỗi đã
 * tránh khi định nghĩa tin nóng bằng THỜI GIAN.
 *
 * Thứ đo được thật là SỰ TRÙNG HỢP: nhiều nguồn KHÁC NHAU cùng viết về một
 * chuyện trong khoảng thời gian ngắn. Một báo đăng thì là một bài báo; bốn báo
 * cùng đăng trong sáu giờ thì là một chuyện đang xảy ra. Đó là tín hiệu, không
 * phải phỏng đoán.
 */

import type { NewsItem } from './agriNewsService';
import type { PriceMove } from './agriPriceService';

/** Đổi bao nhiêu phần trăm thì đáng cắt ngang người dùng. */
export const PRICE_ALERT_PCT = 5;

/** Bao nhiêu nguồn KHÁC NHAU cùng viết thì coi là một chuyện đang xảy ra. */
export const TREND_MIN_SOURCES = 3;

/** Trong bao nhiêu giờ. */
export const TREND_WINDOW_H = 6;

/** Cùng một cảnh báo không lặp lại trong bấy nhiêu giờ. */
export const ALERT_COOLDOWN_H = 12;

export interface Alert {
  /** Khoá ổn định — dùng để không báo lại cùng một chuyện. */
  id: string;
  kind: 'price' | 'trend';
  /** Khoá chữ của tiêu đề thông báo. */
  titleKey: string;
  /** Chỗ thay cho `tk(titleKey, vars)`. */
  vars: Record<string, string | number>;
  /** Câu mô tả — với tin thì là chính tiêu đề bài, nên để chuỗi thô. */
  body: string;
}

/**
 * Giá biến động đủ mạnh chưa.
 *
 * `percent` là `null` (lần đọc đầu, chưa có gì để so) → KHÔNG báo. Báo "giá thay
 * đổi" ngay lần đầu mở app là báo về một thay đổi chưa từng xảy ra.
 */
export function priceAlert(move: PriceMove): Alert | null {
  if (move.percent == null || !Number.isFinite(move.percent)) return null;
  if (Math.abs(move.percent) < PRICE_ALERT_PCT) return null;

  const pct = Math.abs(move.percent);
  return {
    // Khoá gộp cả NGÀY: cùng một mặt hàng biến động mạnh hai ngày liền là hai
    // tin khác nhau, phải báo cả hai.
    id: `price:${move.price.key}:${new Date(move.price.atMs || Date.now()).toDateString()}`,
    kind: 'price',
    titleKey: move.direction === 'up' ? 'trace.alert.priceUp' : 'trace.alert.priceDown',
    vars: { name: move.price.nameKey, pct: pct.toFixed(1) },
    body: '',
  };
}

/** Từ để trống khi so tiêu đề — chúng có mặt ở mọi bài, không phân biệt được gì. */
const STOP_WORDS = new Set([
  'và', 'của', 'cho', 'trong', 'với', 'các', 'những', 'một', 'này', 'đó', 'là',
  'có', 'được', 'tại', 'từ', 'đến', 'về', 'khi', 'sau', 'trước', 'người', 'hôm',
  'nay', 'ngày', 'năm', 'giá', 'tin', 'the', 'and', 'for',
]);

/** Tiêu đề → tập từ ĐÁNG KỂ (bỏ dấu câu, bỏ từ quá ngắn, bỏ từ phổ thông). */
export function significantWords(title: string): Set<string> {
  const words = (title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Nhiều nguồn cùng viết về một chuyện → một cảnh báo.
 *
 * Cách nhóm: lấy từng bài làm hạt nhân, gom các bài khác CÙNG KHUNG GIỜ mà chia
 * sẻ ít nhất hai từ đáng kể. Đếm số NGUỒN khác nhau trong nhóm — đếm số bài thì
 * một trang đăng lại chính nó năm lần cũng thành "đang xảy ra".
 */
export function trendAlerts(
  items: NewsItem[],
  opts: { now: number; minSources?: number; windowH?: number },
): Alert[] {
  const minSources = opts.minSources ?? TREND_MIN_SOURCES;
  const windowMs = (opts.windowH ?? TREND_WINDOW_H) * 3600_000;

  const fresh = (items ?? []).filter(
    n => n?.publishedAt > 0 && opts.now - n.publishedAt <= windowMs,
  );
  if (fresh.length < minSources) return [];

  const out: Alert[] = [];
  const claimed = new Set<string>();

  for (const seed of fresh) {
    if (claimed.has(seed.id)) continue;
    const seedWords = significantWords(seed.title);
    if (seedWords.size < 2) continue;

    const group = fresh.filter(n => {
      if (n.id === seed.id) return true;
      const shared = [...significantWords(n.title)].filter(w => seedWords.has(w));
      return shared.length >= 2;
    });

    const sources = new Set(group.map(n => n.source));
    if (sources.size < minSources) continue;

    group.forEach(n => claimed.add(n.id));
    out.push({
      id: `trend:${[...seedWords].sort().slice(0, 3).join('-')}`,
      kind: 'trend',
      titleKey: 'trace.alert.trending',
      vars: { n: sources.size },
      body: seed.title,
    });
  }
  return out;
}

/**
 * Bỏ những cảnh báo VỪA báo rồi.
 *
 * `sentAt` là bảng `id → mốc đã báo`. Không có bước này thì mỗi lần mở app lại
 * báo đúng chuyện cũ, và người dùng tắt thông báo trong hai ngày.
 */
export function dropRecent(
  alerts: Alert[],
  sentAt: Record<string, number>,
  now: number,
  cooldownH = ALERT_COOLDOWN_H,
): Alert[] {
  const cutoff = cooldownH * 3600_000;
  return alerts.filter(a => {
    const last = sentAt?.[a.id];
    return !last || now - last >= cutoff;
  });
}
