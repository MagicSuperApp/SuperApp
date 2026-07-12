// navigation/traceScan.ts
//
// SG9 §3 — TRACE = NÚT QUÉT NHANH (soi nguồn gốc sản phẩm, dùng-rồi-thoát).
//
// PHẦN THUẦN: tên route quét + bộ PHÂN GIẢI mã QR → đích điều hướng. Màn quét
// (screens/TraceScanScreen) chỉ mở camera + gọi parseTraceCode; màn KẾT QUẢ là
// các màn CHI TIẾT đã có (TreeDetail/FarmDetail/AnimalDetail…) — tái dùng, KHÔNG
// dựng màn provenance mới. Cross-platform: sản phẩm Aladin mã hoá deep-link
// `magiclamp://…` (đã khai trong buildLinking) → quét ngoài app cũng mở thẳng
// màn kết quả; quét TRONG app thì màn này điều hướng tới đó.

// Tên route màn quét (host stack, full-bleed — immersive-by-omission: KHÔNG vào
// tabs[], tới được qua navigate/deep-link). Nguồn DUY NHẤT để §4 (cổng) + header
// Home + deep-link cùng tham chiếu.
export const TRACE_SCAN_ROUTE_NAME = 'TraceScan';

// Đích quét HỢP LỆ: chỉ các màn CHI TIẾT/truy-xuất (soi nguồn gốc). Whitelist để
// mã QR lạ KHÔNG điều hướng bừa tới màn host nhạy cảm.
const TRACE_TARGET_WHITELIST = new Set<string>([
  'TreeDetail',
  'FarmDetail',
  'AnimalDetail',
  'TreeIdentity',
  'AnimalIdentity',
  'Farms',
  'Dashboard',
  'Activity',
]);

export interface TraceTarget {
  route: string;
  params?: Record<string, string>;
}

/**
 * Phân giải mã QR quét được → đích điều hướng, hoặc null nếu KHÔNG nhận diện.
 *
 * Chỉ nhận deep-link nội bộ `magiclamp://…` (sản phẩm Aladin đã đăng ký). Lấy
 * đoạn cuối path làm route; query (?k=v) thành params. Route ngoài whitelist →
 * null (màn quét hiện "chưa nhận diện"). HÀM THUẦN — không điều hướng.
 */
export function parseTraceCode(raw: string): TraceTarget | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = /^magiclamp:\/\/(.+)$/i.exec(s);
  if (!m) return null;

  const [pathPart, queryPart] = m[1].split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const route = segs[segs.length - 1];
  if (!route || !TRACE_TARGET_WHITELIST.has(route)) return null;

  const params: Record<string, string> = {};
  if (queryPart) {
    for (const kv of queryPart.split('&')) {
      if (!kv) continue;
      const eq = kv.indexOf('=');
      const k = eq >= 0 ? kv.slice(0, eq) : kv;
      const v = eq >= 0 ? kv.slice(eq + 1) : '';
      if (k) {
        try {
          params[decodeURIComponent(k)] = decodeURIComponent(v);
        } catch {
          params[k] = v; // mã hỏng phần trăm → giữ thô, không vỡ
        }
      }
    }
  }

  return { route, params: Object.keys(params).length ? params : undefined };
}
