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
  kind: 'price' | 'trend' | 'weather';
  /** Khoá chữ của tiêu đề thông báo. */
  titleKey: string;
  /** Khoá chữ của DÒNG DƯỚI — câu bảo người ta nên làm gì. Tin thì dùng `body`. */
  bodyKey?: string;
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

// ═══════════════════════════════════════════════════════════════════════════
// THỜI TIẾT DỮ — dông, gió giật, mưa to
// ═══════════════════════════════════════════════════════════════════════════
//
// ── NÓI TRƯỚC MÁY NÀY BIẾT GÌ VÀ KHÔNG BIẾT GÌ ─────────────────────────────
//
// Nguồn duy nhất là Open-Meteo (mô hình dự báo toàn cầu). Từ đó suy ra được:
//   · **dông** — mã WMO 95 · 96 · 99, có cả ở giờ hiện tại lẫn giờ sắp tới;
//   · **gió giật** — `wind_gusts_10m`, km/h;
//   · **mưa to** — mã 65 (mưa to) · 82 (mưa rào dữ dội), và khả năng mưa %.
//
// KHÔNG suy ra được, và app KHÔNG được nói như thể biết:
//   · **BÃO có tên** (Yagi, Trà Mi…). Cảnh báo bão ở Việt Nam do Trung tâm Dự
//     báo KTTV Quốc gia phát; Open-Meteo không có cờ nào cho nó và nhà này chưa
//     nối được nguồn đó. Nên chữ trong app nói "gió rất mạnh", KHÔNG nói "bão" —
//     người đọc chữ "bão" sẽ đi chằng nhà, mà ta chỉ đo được gió.
//   · **LỐC/vòi rồng.** Lốc là hiện tượng cục bộ vài trăm mét, mô hình lưới
//     ~10 km không thấy. Thứ đo được là gió giật mạnh, và đó là điều app nói.
//
// ── Ngưỡng lấy từ đâu ──────────────────────────────────────────────────────
// Cấp gió Beaufort (thang chính thức, dùng trong bản tin KTTV Việt Nam):
//   cấp 6 ≈ 39–49 km/h  — cây nhỏ rung mạnh, đi ngược gió khó
//   cấp 8 ≈ 62–74 km/h  — gãy cành, giàn lưới bay
//   cấp 10 ≈ 89–102 km/h — cây bật gốc
// Chọn 50 km/h cho mức "đáng cất đồ" và 75 km/h cho mức "nguy hiểm". Không bịa
// số tròn cho đẹp: hai mốc này nằm đúng ranh cấp 6→7 và cấp 8→9.

/** Gió giật từ mức này (km/h) thì đáng báo — quanh ranh cấp 6/7 Beaufort. */
export const GUST_WARN_KPH = 50;

/** Và từ mức này là nguy hiểm — quanh ranh cấp 8/9. */
export const GUST_SEVERE_KPH = 75;

/** Nhìn trước bao nhiêu giờ. Xa hơn thì mô hình đoán, và người ta cũng quên mất. */
export const WEATHER_LOOKAHEAD_H = 6;

/** Mã WMO của dông. Chỉ 95 · 96 · 99 — chặn TRẦN, đừng để `>= 95` nuốt mã lạ. */
export function isStormCode(code: number): boolean {
  return code === 95 || code === 96 || code === 99;
}

/** Mã WMO của mưa TO: 65 = mưa lớn, 82 = mưa rào dữ dội. */
export function isHeavyRainCode(code: number): boolean {
  return code === 65 || code === 82;
}

/**
 * Cảnh báo thời tiết dữ. Mảng rỗng = không có gì đáng cắt ngang.
 *
 * ── Vì sao "đang xảy ra" vẫn đáng báo ──────────────────────────────────────
 * Nghe có vẻ thừa — trời đang dông thì ai chả biết. Nhưng người có vườn không
 * phải lúc nào cũng đứng trong vườn: họ ở nhà cách đó vài cây số, hoặc đang ở
 * chợ. Cái họ cần biết là "chỗ VƯỜN đang dông", và toạ độ tra thời tiết là toạ
 * độ vườn, không phải chỗ họ đứng.
 *
 * ── Một chuyện, một cảnh báo ───────────────────────────────────────────────
 * Dông thường kèm gió giật và mưa to. Báo ba cái cho một cơn là dạy người ta
 * tắt thông báo. Nên hàm này trả về NHIỀU NHẤT MỘT cảnh báo mỗi lượt, chọn theo
 * mức nặng: đang dông > sắp dông > gió giật nguy hiểm > gió giật mạnh > mưa to.
 */
export function weatherAlerts(
  report: { now: { code: number; windKph: number }; hours?: WeatherHourLike[] } | null | undefined,
  opts: { now: number; lookaheadH?: number },
): Alert[] {
  if (!report?.now) return [];
  const lookahead = (opts.lookaheadH ?? WEATHER_LOOKAHEAD_H) * 3600_000;
  const soon = (report.hours ?? []).filter(
    h => h && h.at > opts.now && h.at - opts.now <= lookahead,
  );

  // Khoá gộp theo NGÀY: cơn dông hôm nay và cơn dông ngày mai là hai chuyện, cả
  // hai đều đáng báo. Cùng ngày thì `dropRecent` lo phần không lặp.
  const day = new Date(opts.now).toDateString();

  if (isStormCode(report.now.code)) {
    return [{
      id: `wx:storm-now:${day}`,
      kind: 'weather',
      titleKey: 'trace.alert.stormNow',
      bodyKey: 'trace.alert.stormNow.body',
      vars: {},
      body: '',
    }];
  }

  const stormHour = soon.find(h => isStormCode(h.code));
  if (stormHour) {
    return [{
      id: `wx:storm-soon:${day}`,
      kind: 'weather',
      titleKey: 'trace.alert.stormSoon',
      bodyKey: 'trace.alert.stormSoon.body',
      vars: { h: hoursUntil(stormHour.at, opts.now) },
      body: '',
    }];
  }

  // Gió: xét cả giờ hiện tại lẫn các giờ sắp tới, lấy con LỚN NHẤT — một cú giật
  // ở giờ thứ tư vẫn thổi bay giàn lưới như cú giật ngay bây giờ.
  const peakGust = Math.max(
    report.now.windKph ?? 0,
    ...soon.map(h => h.gustKph ?? 0),
  );
  if (peakGust >= GUST_SEVERE_KPH) {
    return [{
      id: `wx:gust-severe:${day}`,
      kind: 'weather',
      titleKey: 'trace.alert.gustSevere',
      bodyKey: 'trace.alert.gustSevere.body',
      vars: { kph: Math.round(peakGust) },
      body: '',
    }];
  }
  if (peakGust >= GUST_WARN_KPH) {
    return [{
      id: `wx:gust:${day}`,
      kind: 'weather',
      titleKey: 'trace.alert.gust',
      bodyKey: 'trace.alert.gust.body',
      vars: { kph: Math.round(peakGust) },
      body: '',
    }];
  }

  const rainHour = soon.find(h => isHeavyRainCode(h.code));
  if (rainHour) {
    return [{
      id: `wx:rain:${day}`,
      kind: 'weather',
      titleKey: 'trace.alert.heavyRain',
      bodyKey: 'trace.alert.heavyRain.body',
      vars: { h: hoursUntil(rainHour.at, opts.now) },
      body: '',
    }];
  }

  return [];
}

/** Chỉ dùng nội bộ: kiểu tối thiểu của một giờ dự báo (khớp `WeatherHour`). */
export interface WeatherHourLike {
  at: number;
  code: number;
  rainChance: number;
  gustKph: number;
}

/**
 * Còn mấy giờ nữa. Làm tròn LÊN và tối thiểu 1: "còn 0 giờ nữa" là câu vô nghĩa,
 * và dưới một tiếng thì nói "1 giờ" là an toàn hơn — người ta chuẩn bị sớm hơn
 * chứ không muộn hơn.
 */
export function hoursUntil(at: number, now: number): number {
  return Math.max(1, Math.ceil((at - now) / 3600_000));
}
