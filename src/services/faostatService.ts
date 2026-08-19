/**
 * faostatService — GIÁ NGOÀI NƯỚC, lấy từ FAOSTAT (FAO).
 *
 * ── Đã đo thật, và đây là thứ FAOSTAT CHO và KHÔNG CHO ─────────────────────
 * Gọi thật vào `faostatservices.fao.org` với tài khoản đã cấp:
 *
 *   CHO      giá sản xuất theo THÁNG, theo nước, theo mặt hàng.
 *            Ví dụ cà phê nhân Việt Nam 2024: tháng 1 = 16.020.523 LCU/tấn …
 *            tháng 12 = 20.723.781 LCU/tấn. Có cả chỉ số giá (2014–2016 = 100).
 *   KHÔNG    · dữ liệu thời gian thực. Năm mới nhất là **2024** — chậm khoảng
 *              hai năm so với hôm nay.
 *            · **sầu riêng**. Mặt hàng chính của app KHÔNG có trong danh mục giá
 *              sản xuất của FAOSTAT (đã tra danh mục: chỉ có `Coffee, green`,
 *              `Rice`… không có `Durian`).
 *
 * ── Hệ quả cho thiết kế, và đây là chỗ quan trọng nhất ─────────────────────
 * KHÔNG so số liệu này theo GIỜ. Nó đổi mỗi tháng một lần và chậm hai năm; đặt
 * nó cạnh một đồng hồ đếm giờ thì mọi mặt hàng sẽ mãi mãi hiện 0%, và tệ hơn,
 * người đọc tưởng đó là giá hôm nay.
 *
 * Nên mục NGOÀI NƯỚC so **tháng với tháng liền trước**, và luôn ghi rõ đang xem
 * số liệu của tháng nào. Mục TRONG NƯỚC (nguồn sống, đổi hằng ngày) mới so theo
 * giờ. Hai cadence khác nhau vì hai loại dữ liệu khác nhau — gộp chung một cách
 * so là nói dối về một trong hai.
 *
 * ── Dùng CHỈ SỐ, không dùng số tiền, cho phần so sánh giữa các nước ────────
 * Giá sản xuất trả về bằng ĐỒNG TIỀN BẢN ĐỊA (LCU): Việt Nam ra đồng, Brazil ra
 * real. Đặt cạnh nhau là so hai con số không cùng đơn vị. Chỉ số giá
 * (2014–2016 = 100) thì không có đơn vị và so được — mà "biến động" vốn là đúng
 * việc của chỉ số.
 */

import { FAOSTAT_TOKEN } from '../config/faostat';

const BASE = 'https://faostatservices.fao.org/api/v1/en';
const TIMEOUT_MS = 15_000;

/** Miền GIÁ SẢN XUẤT của FAOSTAT. */
const DOMAIN = 'PP';

/** Chỉ số giá sản xuất (2014–2016 = 100) — không đơn vị, so giữa các nước được. */
const ELEMENT_PRICE_INDEX = 5532;

/** Mã nước theo FAOSTAT. */
export const AREA = { vietnam: 237, brazil: 21, indonesia: 101, colombia: 44 } as const;

/** Mã mặt hàng theo FAOSTAT. Sầu riêng KHÔNG có — xem chú thích đầu tệp. */
export const ITEM = { coffeeGreen: 656, rice: 27 } as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface FaoRow {
  Year: string | number;
  Months: string;
  Value: string | number;
  Area?: string;
  Item?: string;
}

export interface MonthlyPoint {
  /** 0–11. */
  monthIndex: number;
  year: number;
  value: number;
}

// ---------------------------------------------------------------------------
// Phần thuần tính — kiểm được không cần mạng
// ---------------------------------------------------------------------------

/**
 * Chuỗi FAOSTAT trả về → điểm theo tháng, đã bỏ dòng "Annual value".
 *
 * Bỏ dòng năm là bắt buộc: nó nằm LẪN trong cùng danh sách với 12 tháng, và giá
 * trị của nó là trung bình cả năm. Nhận nhầm nó thành một tháng là so "tháng 12"
 * với "trung bình năm" rồi gọi kết quả là biến động tháng.
 */
export function toMonthly(rows: FaoRow[]): MonthlyPoint[] {
  const out: MonthlyPoint[] = [];
  for (const r of rows ?? []) {
    const monthIndex = MONTHS.indexOf(String(r?.Months ?? '').trim());
    if (monthIndex < 0) continue;
    const value = Number(r.Value);
    const year = Number(r.Year);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(year)) continue;
    out.push({ monthIndex, year, value });
  }
  return out.sort((a, b) => (a.year - b.year) || (a.monthIndex - b.monthIndex));
}

/** Tháng mới nhất và tháng liền trước nó. Thiếu một trong hai → `prev` là `null`. */
export function latestPair(points: MonthlyPoint[]): {
  latest: MonthlyPoint | null;
  prev: MonthlyPoint | null;
} {
  const sorted = [...(points ?? [])];
  if (sorted.length === 0) return { latest: null, prev: null };
  return {
    latest: sorted[sorted.length - 1],
    prev: sorted.length >= 2 ? sorted[sorted.length - 2] : null,
  };
}

/** Nhãn tháng cho màn hình: `{ y: 2024, m: 12 }` — màn tự dịch. */
export function monthLabel(p: MonthlyPoint): { y: number; m: number } {
  return { y: p.year, m: p.monthIndex + 1 };
}

// ---------------------------------------------------------------------------
// Gọi mạng
// ---------------------------------------------------------------------------

/**
 * Đọc chỉ số giá theo tháng. Không bao giờ ném.
 *
 * CHƯA có token → trả mảng rỗng ngay, không gọi mạng. Đó là trạng thái mặc định
 * của bản dựng công khai; xem `config/faostat.ts`.
 */
export async function fetchPriceIndex(opts: {
  area: number;
  item: number;
  years: number[];
}): Promise<MonthlyPoint[]> {
  if (!FAOSTAT_TOKEN) return [];

  const url =
    `${BASE}/data/${DOMAIN}?area=${opts.area}&item=${opts.item}` +
    `&element=${ELEMENT_PRICE_INDEX}&year=${opts.years.join(',')}` +
    '&show_unit=true&show_flags=false&limit=200';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${FAOSTAT_TOKEN}`,
        Accept: 'application/json',
        // CloudFront của FAO chặn yêu cầu không có User-Agent (đã gặp 403 thật).
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    return toMonthly((json as { data?: FaoRow[] })?.data ?? []);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
