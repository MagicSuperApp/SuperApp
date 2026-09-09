/**
 * agriPriceService — HÌNH DẠNG chung của một mức giá nông sản, và phép tính biến
 * động dùng chung cho mọi nguồn.
 *
 * ── Tệp này KHÔNG còn đi mạng ───────────────────────────────────────────────
 * Việc đọc nguồn đã chuyển hết sang hai tệp khác: `agroPriceService` (bảng của
 * Bộ Nông nghiệp — có sầu riêng, có ngày, có vùng) cho giá trong nước, và
 * `faostatService` cho giá ngoài nước. Cơ chế cũ kiểu "một trang, một con số"
 * (`PRICE_SOURCES`/`fetchPrice`/`toPrice`/`sourcesIn`/`fetchAllPrices`) đã gỡ:
 * bảng nguồn của nó rỗng từ lúc chuyển, nên `sourcesIn` và `fetchAllPrices`
 * luôn trả mảng rỗng, và không nơi nào gọi tới nữa. Cần lại thì lấy ở lịch sử
 * git — giữ mã không ai chạy trong cây làm việc chỉ khiến người đọc sau tưởng
 * đây vẫn là đường lấy giá.
 *
 * ── Biến động tính thế nào ──────────────────────────────────────────────────
 * Nguồn chỉ cho giá HÔM NAY, không cho lịch sử. Nên mức biến động là so với LẦN
 * ĐỌC TRƯỚC đã lưu trong máy (`priceStore`). Nghĩa là lần chạy đầu tiên không có
 * biến động — và màn hình phải nói đúng như vậy, chứ không hiện mũi tên 0%.
 */

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
