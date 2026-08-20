/**
 * agroPriceService — GIÁ TRONG NƯỚC, nguồn Bộ Nông nghiệp (agro.gov.vn).
 *
 * ── Vì sao nguồn này thay giacaphe.com ─────────────────────────────────────
 * Bản trước đọc giá từ TIÊU ĐỀ một trang tin — mong manh, và chỉ có cà phê.
 * Trang tra cứu của agro.gov.vn cho hẳn một BẢNG có cấu trúc:
 *
 *     Sầu riêng Ri6 đẹp | Tây Nguyên | 13-08-2026 | 53000
 *
 * Có **sầu riêng** — mặt hàng chính của app — có ngày, có vùng, và là số liệu
 * nhà nước. Không so được với việc đọc chữ trong tiêu đề.
 *
 * ── Bốn chỗ bẫy khi gọi, đã đo bằng cách gọi thật ──────────────────────────
 * Trang chạy ASP.NET WebForms, nên không gọi thẳng được như một API:
 *
 *   1. Tên trường chọn nhịp là `ctl00$maincontent$Theo_thời_gian` — **CÓ DẤU
 *      tiếng Việt**. Gửi `Theo_thoi_gian` không dấu thì máy chủ vẫn trả 200 kèm
 *      trang đầy đủ, nhưng BẢNG RỖNG. Không có lỗi nào để lần ra.
 *   2. Phải kèm chính nút bấm `ctl00$maincontent$Xem=Tra cứu`; thiếu nó thì
 *      máy chủ chỉ vẽ lại trang chứ không chạy truy vấn.
 *   3. Phải GET trang trước để lấy `__VIEWSTATE` và cookie phiên. WebForms từ
 *      chối POST không mang theo trạng thái nó vừa cấp.
 *   4. KHÔNG cần `X-MicrosoftAjax: Delta=true`. POST thường trả HTML đầy đủ có
 *      `<table>` sạch; payload delta khó đọc hơn mà không được gì thêm.
 *
 * ── Vì sao KHÔNG so theo giờ nữa ───────────────────────────────────────────
 * Nguồn này tự mang theo CHUỖI NGÀY. So "giá ngày mới nhất với ngày liền trước
 * trong chính chuỗi đó" là biến động THẬT của thị trường. So với "lần trước tôi
 * đọc được" thì con số phụ thuộc vào lúc app chạy — hai người mở app khác giờ sẽ
 * thấy hai con số khác nhau cho cùng một thị trường.
 *
 * Ô giờ trong `priceHistoryDb` vẫn giữ, dùng cho nguồn nào chỉ cho một giá trần
 * không kèm ngày.
 */

import type { CommodityPrice } from './agriPriceService';

const HOST = 'https://agro.gov.vn';
const PAGE = '/vn/nguonwmy.aspx';
const TIMEOUT_MS = 20_000;

/** Trình duyệt giả — máy chủ chặn yêu cầu không có User-Agent. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

/**
 * Mặt hàng cần lấy. Giá trị gửi đi là **chính chuỗi hiển thị** trong ô chọn,
 * không phải mã số — đã kiểm bằng cách đọc `<option>` của trang.
 *
 * ── Vì sao đúng SÁU mặt hàng, không phải hai, và cũng không phải 230 ────────
 * Ô chọn của trang có **230 mục**, nhưng phần lớn đã chết từ lâu. Dò thật ngày
 * 19/08/2026 — POST từng mục, cửa sổ 400 ngày, thử cả ba nhịp ngày/tuần/tháng —
 * chỉ SÁU mục còn số liệu của hôm qua (18-08-2026):
 *
 *   Sầu riêng Ri6 đẹp        53.000 đ/kg     Tây Nguyên
 *   Cà phê nhân              96.800 đ/kg     Đắk Lăk
 *   Hạt tiêu đen trong nước 138.000 đ/kg     Đắk Lắk
 *   Heo hơi trại             57.000 đ/kg     Bắc Ninh
 *   Cà phê Robusta            3.769 USD/tấn  London      (sàn)
 *   Cà phê Arabica              345,1 c/lb   New York    (sàn)
 *
 * Mục gần nhất còn thoi thóp là `Hạt điều tươi` (06-01-2026) và
 * `Phân đạm Urê Phú mỹ` (22-12-2025) — quá cũ để bày cạnh giá hôm qua, nên
 * KHÔNG đưa vào. Toàn bộ nhóm gạo/lúa, thuỷ sản, trái cây khác (thanh long,
 * xoài, cam) đều trả bảng rỗng, kể cả ở nhịp tháng.
 *
 * Đừng thêm mục chỉ vì thấy tên nó trong ô chọn: một mục chết làm mục giá dài
 * thêm một dòng "—" chẳng nói gì, và che mất những dòng đang sống.
 *
 * ── Hai mục cuối là giá SÀN THẾ GIỚI ───────────────────────────────────────
 * London và New York không phải "trong nước", và không tính bằng đồng. Chúng đi
 * vào cụm **Thế giới** — cụm mà trước bản này luôn trống, vì nguồn duy nhất của
 * nó (FAOSTAT) đòi một token sống 60 phút, không nhúng vào app được
 * (`config/faostat.ts`). Hai dòng này lấp đúng chỗ trống ấy bằng số liệu HÔM QUA
 * thay vì số liệu năm 2024.
 */
export const AGRO_ITEMS = [
  {
    key: 'durian', label: 'Sầu riêng Ri6 đẹp', nameKey: 'trace.price.durian',
    scope: 'domestic' as const, unitKey: 'trace.price.perKg', decimals: 0,
    sane: [5_000, 400_000] as [number, number],
  },
  {
    key: 'coffee', label: 'Cà phê nhân', nameKey: 'trace.price.coffee',
    scope: 'domestic' as const, unitKey: 'trace.price.perKg', decimals: 0,
    sane: [10_000, 500_000] as [number, number],
  },
  {
    key: 'pepper', label: 'Hạt tiêu đen trong nước|Black pepper (Domestic)',
    nameKey: 'trace.price.pepper',
    scope: 'domestic' as const, unitKey: 'trace.price.perKg', decimals: 0,
    sane: [20_000, 600_000] as [number, number],
  },
  {
    // ⚠ Chuỗi này có DẤU CÁCH THỪA ở hai chỗ (`trại `, `hog `) — đúng như trang
    // ghi trong `<option>`. Gõ lại cho "sạch" là gửi một giá trị không có trong
    // ô chọn, và WebForms trả 200 kèm bảng rỗng, không lỗi nào để lần ra.
    key: 'hog', label: 'Heo hơi trại |Live hog ', nameKey: 'trace.price.hog',
    scope: 'domestic' as const, unitKey: 'trace.price.perKg', decimals: 0,
    sane: [20_000, 200_000] as [number, number],
  },
  {
    key: 'robustaLondon', label: 'Cà phê Robusta|Robusta Coffee',
    nameKey: 'trace.price.robustaLondon',
    scope: 'global' as const, unitKey: 'trace.price.usdPerTon', decimals: 0,
    // Robusta quanh 3.700 USD/tấn. Trần 15.000 loại được đúng con số hỏng đã đo
    // được ở nguồn: ngày 18-08 trang ghi `36700` trong khi hai phiên liền trước
    // là `3769` và `3810` — nguồn rơi mất dấu thập phân.
    sane: [500, 15_000] as [number, number],
  },
  {
    key: 'arabicaNy', label: 'Cà phê Arabica|Arabica Coffee',
    nameKey: 'trace.price.arabicaNy',
    // Sàn New York yết bằng US cent/pound, và có PHẦN THẬP PHÂN (`345.1`).
    scope: 'global' as const, unitKey: 'trace.price.centPerLb', decimals: 1,
    sane: [50, 1_000] as [number, number],
  },
];

export interface AgroRow {
  item: string;
  region: string;
  /** Mốc ngày (ms). */
  atMs: number;
  priceVnd: number;
}

// ---------------------------------------------------------------------------
// Phần thuần tính
// ---------------------------------------------------------------------------

/** Gỡ thực thể HTML mà trang dùng cho chữ có dấu (`&#234;` → `ê`). */
export function decodeEntities(s: string): string {
  return (s ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .trim();
}

/**
 * Ô giá → số. `null` khi không đọc được, và dòng đó bị bỏ.
 *
 * ⚠ ĐÂY LÀ CHỖ BẢN TRƯỚC SAI. Nó làm `String(cell).replace(/[.,\s]/g, '')` —
 * vứt SẠCH mọi dấu chấm và phẩy. Với `138.000` thì đúng (dấu phân nhóm nghìn
 * kiểu Việt Nam), nhưng với `345.1` — giá Arabica ở New York, cent/pound — thì
 * nó ra **3451**, tức gấp mười lần. Không có gì báo: 3451 vẫn là một con số hợp
 * lệ, vẫn lọt mọi khoảng hợp lý, và vẫn được vẽ lên màn.
 *
 * Lỗi chưa cắn ai vì hai mặt hàng cũ đều là số đồng tròn. Nó cắn ngay ngày thêm
 * mặt hàng đầu tiên có phần thập phân — tức là bản này.
 *
 * Luật đọc, theo đúng thứ tự:
 *   · mọi nhóm đều ĐÚNG BA chữ số (`138.000`, `1.234.567`) ⇒ dấu phân NHÓM;
 *   · đuôi một–hai chữ số (`345.1`, `57,25`)               ⇒ dấu THẬP PHÂN;
 *   · còn lại                                               ⇒ vứt hết, đọc thô.
 *
 * Nhập nhằng còn lại: `3.769` đọc thành 3769 chứ không phải 3,769. Đó là lựa
 * chọn có chủ ý — nguồn này là trang Việt Nam và viết theo lối Việt Nam; mà một
 * giá 3,769 đồng hay 3,769 USD/tấn thì cũng không tồn tại.
 */
export function parseAgroNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw ?? '').replace(/[\s ]/g, '');
  if (!/^\d$|^\d[\d.,]*\d$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  const asNumber = (v: string): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  if (lastSep < 0) return asNumber(s);

  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return asNumber(s.replace(/[.,]/g, ''));

  const tail = s.slice(lastSep + 1);
  if (tail.length >= 1 && tail.length <= 2) {
    return asNumber(`${s.slice(0, lastSep).replace(/[.,]/g, '')}.${tail}`);
  }
  return asNumber(s.replace(/[.,]/g, ''));
}

/** `13-08-2026` → mốc ms. Chuỗi lạ → 0, và dòng đó bị bỏ. */
export function parseDate(s: string): number {
  const m = (s ?? '').match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!m) return 0;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Bảng HTML → các dòng giá.
 *
 * Chỉ nhận dòng có ĐỦ bốn ô và giá đọc được. Bảng của trang có cả dòng tiêu đề
 * và dòng trống; nhận bừa là sinh ra một mức giá bằng 0 rồi vẽ nó lên màn.
 */
export function parseAgroTable(html: string): AgroRow[] {
  const out: AgroRow[] = [];
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trs) {
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) ?? [])
      .map(c => decodeEntities(c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')))
      .filter(c => c.length > 0);
    if (cells.length < 4) continue;

    const atMs = parseDate(cells[2]);
    const priceVnd = parseAgroNumber(cells[3]);
    if (!atMs || priceVnd === null || priceVnd <= 0) continue;

    out.push({ item: cells[0], region: cells[1], atMs, priceVnd });
  }
  return out;
}

/**
 * Chuỗi dòng → giá mới nhất + giá của NGÀY liền trước.
 *
 * Một ngày có thể có nhiều vùng (Tây Nguyên, Miền Tây…). Gộp theo ngày và lấy
 * TRUNG BÌNH các vùng: bày riêng từng vùng thì mục giá dài ra gấp mấy lần, mà
 * nhà vườn chỉ cần một con số để biết thị trường đang lên hay xuống.
 */
export function latestAndPrevious(rows: AgroRow[]): {
  latest: { atMs: number; priceVnd: number } | null;
  prev: { atMs: number; priceVnd: number } | null;
} {
  const byDay = new Map<number, number[]>();
  for (const r of rows ?? []) {
    const list = byDay.get(r.atMs) ?? [];
    list.push(r.priceVnd);
    byDay.set(r.atMs, list);
  }
  const days = [...byDay.entries()]
    .map(([atMs, list]) => ({
      atMs,
      // KHÔNG làm tròn về số nguyên ở đây: sàn New York yết cent/pound với một
      // chữ số thập phân, và làm tròn tại chỗ này là vứt nó đi trước khi màn kịp
      // biết mặt hàng ấy có mấy chữ số. Việc làm tròn để HIỆN là việc của màn.
      priceVnd: Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 100) / 100,
    }))
    .sort((a, b) => b.atMs - a.atMs);

  return { latest: days[0] ?? null, prev: days[1] ?? null };
}

/** Ngày `dd-mm-yyyy` cho ô nhập của trang. */
export function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Gọi mạng
// ---------------------------------------------------------------------------

function fieldValue(html: string, id: string): string {
  const m = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
}

/**
 * Lấy giá một mặt hàng trong khoảng ngày. Không bao giờ ném; hỏng thì `null`.
 *
 * Lấy lùi 30 ngày để chắc chắn có ít nhất hai ngày có số liệu — trang không đăng
 * giá mọi ngày (thứ Bảy, Chủ nhật, ngày lễ thường trống).
 */
export async function fetchAgroPrice(
  item: (typeof AGRO_ITEMS)[number],
  now = new Date(),
): Promise<CommodityPrice | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const pageResp = await fetch(`${HOST}${PAGE}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA },
    });
    if (!pageResp.ok) return null;
    const html = await pageResp.text();
    const cookie = pageResp.headers.get('set-cookie')?.split(';')[0] ?? '';

    const from = new Date(now.getTime() - 30 * 86_400_000);
    const body = new URLSearchParams({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATE: fieldValue(html, '__VIEWSTATE'),
      __VIEWSTATEGENERATOR: fieldValue(html, '__VIEWSTATEGENERATOR'),
      'ctl00$catid': '0',
      'ctl00$maincontent$tu_ngay': ddmmyyyy(from),
      'ctl00$maincontent$den_ngay': ddmmyyyy(now),
      // CÓ DẤU — xem chú thích đầu tệp, đây là chỗ sai làm bảng rỗng.
      'ctl00$maincontent$Theo_thời_gian': 'ngay',
      'ctl00$maincontent$mathangnongsan': item.label,
      'ctl00$maincontent$Xem': 'Tra cứu',
    }).toString();

    const resp = await fetch(`${HOST}${PAGE}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${HOST}${PAGE}`,
      },
      body,
    });
    if (!resp.ok) return null;

    const [lo, hi] = item.sane;
    // Lọc theo khoảng hợp lý ở mức TỪNG DÒNG, trước khi chọn ngày mới nhất.
    //
    // Bản trước lọc SAU: lấy ngày mới nhất rồi mới xét, nên một phiên hỏng ở
    // nguồn làm cả mặt hàng biến mất khỏi màn. Đã gặp thật — Robusta ngày
    // 18-08-2026 ghi `36700` giữa hai phiên `3769` và `3810`. Lọc theo dòng thì
    // phiên hỏng bị bỏ và người dùng vẫn thấy giá của phiên liền trước, kèm đúng
    // ngày của nó.
    const rows = parseAgroTable(await resp.text())
      .filter(r => r.priceVnd >= lo && r.priceVnd <= hi);
    const { latest, prev } = latestAndPrevious(rows);
    if (!latest) return null;

    return {
      key: item.key,
      scope: item.scope,
      nameKey: item.nameKey,
      unitKey: item.unitKey,
      priceVnd: latest.priceVnd,
      decimals: item.decimals,
      atMs: latest.atMs,
      source: 'agro.gov.vn',
      prevVnd: prev?.priceVnd ?? null,
      prevAtMs: prev?.atMs ?? null,
      cadence: 'daily',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Lấy mọi mặt hàng trong nước. Mặt hàng nào hỏng thì vắng mặt. */
export async function fetchAgroPrices(): Promise<CommodityPrice[]> {
  const out = await Promise.all(
    AGRO_ITEMS.map(i => fetchAgroPrice(i).catch(() => null)),
  );
  return out.filter((p): p is CommodityPrice => p != null);
}
