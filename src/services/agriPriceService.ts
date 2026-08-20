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

/**
 * Giá TRONG NƯỚC hay NGOÀI NƯỚC.
 *
 * Hai nhóm này không so sánh trực tiếp được với nhau — khác đơn vị, khác sàn,
 * khác đồng tiền — nên màn bày riêng hai cụm chứ không trộn một danh sách. Nhà
 * vườn đọc giá trong nước để quyết định bán; đọc giá thế giới để đoán tuần sau.
 */
export type PriceScope = 'domestic' | 'global';

export interface CommodityPrice {
  /** Mã mặt hàng, dùng làm khoá lưu — không hiện lên màn. */
  key: string;
  scope: PriceScope;
  /** Khoá chữ của tên mặt hàng. */
  nameKey: string;
  /** Giá, đơn vị đồng. */
  priceVnd: number;
  /** Khoá chữ của đơn vị ('đ/kg'…). */
  unitKey: string;
  /**
   * Số chữ số thập phân khi HIỆN. Vắng ⇒ 0.
   *
   * Cần vì không phải mặt hàng nào cũng là số đồng tròn: sàn New York yết cà phê
   * Arabica bằng US cent/pound với một chữ số (`345,1`). Làm tròn nó về `345` là
   * bỏ mất chuyển động nhỏ nhất mà sàn ấy giao dịch được.
   */
  decimals?: number;
  /** Mốc đọc được (ms). 0 = trang không ghi ngày. */
  atMs: number;
  source: string;
  /**
   * Giá KỲ TRƯỚC lấy từ CHÍNH NGUỒN, khi nguồn có kèm chuỗi ngày/tháng.
   *
   * Có nó thì biến động là chuyển động THẬT của thị trường. Không có thì mới lùi
   * về so với ô giờ đã lưu trong máy — con số ấy phụ thuộc vào lúc app chạy, nên
   * chỉ dùng khi không còn cách nào tốt hơn.
   */
  prevVnd?: number | null;
  prevAtMs?: number | null;
  /**
   * Nguồn đổi giá theo nhịp nào. Quyết định CÂU CHỮ trên màn: nguồn theo ngày
   * không được nói "so với 1 giờ trước", nguồn theo tháng không được nói "hôm qua".
   */
  cadence?: 'daily' | 'monthly' | 'spot';
}

export interface PriceMove {
  price: CommodityPrice;
  /** Chênh lệch so với lần đọc trước (đồng). `null` = chưa có gì để so. */
  deltaVnd: number | null;
  /** Phần trăm thay đổi. `null` = chưa có gì để so. */
  percent: number | null;
  direction: PriceDirection;
}

export interface SourceDef {
  key: string;
  scope: PriceScope;
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
 * Bảng nguồn cho các nguồn kiểu "một trang, một con số".
 *
 * Hiện TRỐNG: nguồn trong nước đã chuyển sang `agroPriceService` (bảng của Bộ
 * Nông nghiệp — có sầu riêng, có ngày, có vùng), nguồn ngoài nước sang
 * `faostatService`. Giữ lại cơ chế này cho nguồn nào sau này chỉ cho một con số
 * trần không kèm ngày.
 */
export const PRICE_SOURCES: SourceDef[] = [];

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
    scope: def.scope,
    nameKey: def.nameKey,
    unitKey: def.unitKey,
    priceVnd: got.priceVnd,
    atMs: got.atMs,
    source: def.source,
  };
}

/** Các nguồn thuộc một cụm. Cụm chưa có nguồn nào → mảng rỗng, màn nói rõ. */
export function sourcesIn(scope: PriceScope): SourceDef[] {
  return PRICE_SOURCES.filter(d => d.scope === scope);
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

/**
 * Giá → chuỗi hiện lên màn, giữ đúng số chữ số thập phân của mặt hàng.
 *
 * `formatVnd` vẫn còn vì nhiều chỗ chỉ có số đồng tròn, nhưng mục giá đi qua hàm
 * này: một mặt hàng yết `345,1` mà hiện `345` là bỏ mất chuyển động nhỏ nhất sàn
 * ấy giao dịch được, và người đọc thấy giá "đứng im" trong khi nó đang chạy.
 */
export function formatPriceValue(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '—';
  const d = Number.isFinite(decimals) ? Math.min(4, Math.max(0, Math.trunc(decimals))) : 0;
  return n.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
