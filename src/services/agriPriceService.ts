/**
 * agriPriceService — GIÁ NÔNG SẢN và mức biến động.
 *
 * ── Nói trước về nguồn, vì nó quyết định mọi thứ ở đây ──────────────────────
 * KHÔNG có API miễn phí chính thức nào của Việt Nam cho giá nông sản. Đã dò:
 * `nongsan.mard.gov.vn` không phân giải được tên miền; các dịch vụ có dữ liệu
 * đàng hoàng (Agromonitor…) đều thu phí. Thứ lấy được miễn phí là TRANG WEB
 * công khai — và đọc giá từ trang web là việc mong manh: chủ trang đổi cách viết
 * tiêu đề là con số biến mất, hoặc tệ hơn, ra một con số khác.
 *
 * Vì vậy tệp này viết theo lối PHÒNG THỦ NGƯỢC với thói quen thường gặp:
 *
 *   · Không khớp đúng khuôn đã biết → trả `null`. KHÔNG đoán, không lấy đại con
 *     số đầu tiên nhìn thấy trong trang. Một con số giá SAI tệ hơn hẳn ô trống:
 *     nhà vườn bán hay giữ hàng theo chính con số đó.
 *   · Chặn khoảng hợp lệ. Giá cà phê 95.300 đ/kg là thật; 9 đ/kg hay 95 triệu
 *     đ/kg là trang đã đổi đơn vị hoặc ta đọc nhầm — vẫn trả `null`.
 *   · Nguồn khai trong một bảng, thêm mặt hàng là thêm một dòng. Không rải
 *     biểu thức chính quy khắp nơi.
 *
 * ── Biến động tính thế nào ──────────────────────────────────────────────────
 * Trang chỉ cho giá HÔM NAY, không cho lịch sử. Nên mức biến động là so với LẦN
 * ĐỌC TRƯỚC đã lưu trong máy (`priceStore`). Nghĩa là lần chạy đầu tiên không có
 * biến động — và màn hình phải nói đúng như vậy, chứ không hiện mũi tên 0%.
 */

/** Bao lâu thì bỏ cuộc. Trang tin thường chậm hơn API, nên rộng tay hơn thời tiết. */
const TIMEOUT_MS = 15_000;

export type PriceDirection = 'up' | 'down' | 'flat';

export interface CommodityPrice {
  /** Mã mặt hàng, dùng làm khoá lưu — không hiện lên màn. */
  key: string;
  /** Khoá chữ của tên mặt hàng. */
  nameKey: string;
  /** Giá, đơn vị đồng. */
  priceVnd: number;
  /** Khoá chữ của đơn vị ('đ/kg'…). */
  unitKey: string;
  /** Mốc đọc được (ms). 0 = trang không ghi ngày. */
  atMs: number;
  source: string;
}

export interface PriceMove {
  price: CommodityPrice;
  /** Chênh lệch so với lần đọc trước (đồng). `null` = chưa có gì để so. */
  deltaVnd: number | null;
  /** Phần trăm thay đổi. `null` = chưa có gì để so. */
  percent: number | null;
  direction: PriceDirection;
}

interface SourceDef {
  key: string;
  nameKey: string;
  unitKey: string;
  url: string;
  source: string;
  /** Khoảng giá coi là hợp lệ (đồng). Ngoài khoảng → coi như đọc sai. */
  sane: [number, number];
  /**
   * Rút giá từ trang. Trả `null` khi không chắc — mọi hàm ở đây đều được phép
   * nói "không biết", và đó là câu trả lời đúng khi trang đã đổi.
   */
  parse: (html: string) => { priceVnd: number; atMs: number } | null;
}

/**
 * Tiêu đề trang có dạng:
 *   "Giá cà phê hôm nay 18/08/2026 cao nhất 95,300 vnđ/kg"
 *
 * Bắt ĐÚNG khuôn đó, kể cả ngày, chứ không quét số bừa trong trang: trang giá
 * nào cũng đầy số (số điện thoại, năm, mã bài) và lấy nhầm là chuyện chắc chắn
 * xảy ra chứ không phải rủi ro.
 */
function parseTitlePrice(html: string): { priceVnd: number; atMs: number } | null {
  const title = html.match(/<title>([^<]{5,200})<\/title>/i)?.[1];
  if (!title) return null;

  const m = title.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})[^\d]{0,40}?([\d.,]{3,12})\s*(?:vn)?đ|VNĐ/i,
  );
  const priceRaw = m?.[4] ?? title.match(/([\d.,]{4,12})\s*(?:vn)?đ/i)?.[1];
  if (!priceRaw) return null;

  // "95,300" và "95.300" đều là chín mươi lăm nghìn ba trăm ở cách viết Việt Nam.
  // Bỏ hết dấu phân cách rồi mới đọc số — đừng để `parseFloat` hiểu "95,300" là 95,3.
  const priceVnd = Number(priceRaw.replace(/[.,]/g, ''));
  if (!Number.isFinite(priceVnd)) return null;

  let atMs = 0;
  if (m?.[1] && m?.[2] && m?.[3]) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(d.getTime())) atMs = d.getTime();
  }
  return { priceVnd, atMs };
}

/**
 * Bảng nguồn. Thêm mặt hàng = thêm một dòng ở đây, không sửa chỗ nào khác.
 *
 * Hiện chỉ có cà phê vì đó là mặt hàng duy nhất tìm được trang công khai đọc
 * được ổn định. Sầu riêng — mặt hàng chính của app — CHƯA có nguồn miễn phí nào
 * đăng giá theo ngày dưới dạng máy đọc được; xem chú thích đầu tệp.
 */
export const PRICE_SOURCES: SourceDef[] = [
  {
    key: 'coffee',
    nameKey: 'trace.price.coffee',
    unitKey: 'trace.price.perKg',
    url: 'https://giacaphe.com/gia-ca-phe-noi-dia/',
    source: 'giacaphe.com',
    sane: [10_000, 500_000],
    parse: parseTitlePrice,
  },
];

/** Đọc một nguồn. Không bao giờ ném; hỏng thì `null`. */
export async function fetchPrice(def: SourceDef): Promise<CommodityPrice | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(def.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    });
    if (!resp.ok) return null;
    return toPrice(def, await resp.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Tách khỏi `fetch` để kiểm được bằng test mà không cần mạng. */
export function toPrice(def: SourceDef, html: string): CommodityPrice | null {
  const got = def.parse(html);
  if (!got) return null;
  const [lo, hi] = def.sane;
  // Ngoài khoảng hợp lệ = trang đổi đơn vị, hoặc ta đọc nhầm. Cả hai đều phải
  // im lặng, không được hiện lên màn.
  if (got.priceVnd < lo || got.priceVnd > hi) return null;
  return {
    key: def.key,
    nameKey: def.nameKey,
    unitKey: def.unitKey,
    priceVnd: got.priceVnd,
    atMs: got.atMs,
    source: def.source,
  };
}

/** Đọc mọi nguồn. Nguồn nào hỏng thì vắng mặt, không làm hỏng nguồn khác. */
export async function fetchAllPrices(): Promise<CommodityPrice[]> {
  const out = await Promise.all(PRICE_SOURCES.map(d => fetchPrice(d).catch(() => null)));
  return out.filter((p): p is CommodityPrice => p != null);
}

/**
 * Mức biến động so với lần đọc trước.
 *
 * `prevVnd` là `null` (lần đầu chạy) → `deltaVnd`/`percent` cũng `null`, và
 * hướng là `flat`. Màn hình PHẢI phân biệt "chưa có gì để so" với "không đổi";
 * hiện mũi tên ngang kèm 0% cho lần đọc đầu tiên là nói dối.
 */
export function priceMove(price: CommodityPrice, prevVnd: number | null): PriceMove {
  if (prevVnd == null || !Number.isFinite(prevVnd) || prevVnd <= 0) {
    return { price, deltaVnd: null, percent: null, direction: 'flat' };
  }
  const deltaVnd = price.priceVnd - prevVnd;
  const percent = (deltaVnd / prevVnd) * 100;
  const direction: PriceDirection = deltaVnd > 0 ? 'up' : deltaVnd < 0 ? 'down' : 'flat';
  return { price, deltaVnd, percent, direction };
}

/** Định dạng số tiền theo lối Việt Nam: 95300 → "95.300". */
export function formatVnd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('vi-VN');
}
