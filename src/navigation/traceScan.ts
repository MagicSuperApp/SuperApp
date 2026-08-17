// navigation/traceScan.ts
//
// SG9 §3 — TRACE = NÚT QUÉT NHANH (soi nguồn gốc sản phẩm, dùng-rồi-thoát).
//
// PHẦN THUẦN: tên route quét + bộ PHÂN GIẢI mã QR → đích điều hướng. Màn quét
// (screens/TraceScanScreen) chỉ mở camera + gọi parseTraceCode; màn KẾT QUẢ là
// các màn CHI TIẾT đã có (TreeDetail/FarmDetail/AnimalDetail…) — tái dùng.
//
// SỬA 2026-08-17 — dòng "KHÔNG dựng màn provenance mới" ở đây viết khi tin rằng
// `TreeDetail` dùng lại được cho NGƯỜI MUA. Không: nó tra cây trong Redux
// `state.farm.trees` (TreeDetailScreen.tsx:271-281), tức vườn của chính người đang
// đăng nhập. Người mua quét mã trên bao bì không có cây nào trong store nên luôn ra
// "không tìm thấy". Vì vậy mã `ORI-…` đi sang `TraceResult` (màn công khai), còn
// deep-link nội bộ vẫn đi các màn chi tiết như cũ.
//
// Cross-platform: sản phẩm Aladin mã hoá deep-link
// `magiclamp://…` (đã khai trong buildLinking) → quét ngoài app cũng mở thẳng
// màn kết quả; quét TRONG app thì màn này điều hướng tới đó.

// Tên route màn quét (host stack, full-bleed — immersive-by-omission: KHÔNG vào
// tabs[], tới được qua navigate/deep-link). Nguồn DUY NHẤT để §4 (cổng) + header
// Home + deep-link cùng tham chiếu.
export const TRACE_SCAN_ROUTE_NAME = 'TraceScan';

// Đích quét HỢP LỆ: CHỈ các màn CHI TIẾT theo-sản-phẩm (soi nguồn gốc). Trace là
// hành động phía TIÊU DÙNG "dùng-rồi-thoát" (§3) → chỉ đưa người quét tới trang
// chi tiết của đúng thực thể trên bao bì, KHÔNG tới danh sách/dashboard nội bộ hay
// luồng ĐĂNG KÝ (TreeIdentity/AnimalIdentity là enroll phía SẢN XUẤT — không phải
// đích soi nguồn gốc). Whitelist hẹp cũng chặn QR lạ điều hướng bừa vào màn nhạy cảm.
const TRACE_TARGET_WHITELIST = new Set<string>([
  'TreeDetail',
  'FarmDetail',
  'AnimalDetail',
]);

export interface TraceTarget {
  route: string;
  params?: Record<string, string>;
}

// ── Mã cây CÔNG KHAI in trên bao bì ─────────────────────────────────────────
//
// Máy chủ sinh mã theo `identity.tree_code()` = `ORI-{geohash7}-{crockford8}`, và
// nhúng vào QR dưới dạng URL `{PUBLIC_BASE_URL}/t/{code}` (`server.py:730-741`).
// Nghĩa là QR THẬT trên sản phẩm KHÔNG phải `magiclamp://…` — nó là một URL http.
// Trước bản này, `parseTraceCode` chỉ nhận deep-link nội bộ nên mọi QR in ra đều
// rơi vào nhánh "chưa nhận diện": cửa `GET /api/tree_by_code/{code}` đã chạy trên
// máy chủ mà không đường nào của app gọi tới.
//
// Bảng chữ COPY ĐÚNG `_CODE_RE` phía máy chủ (`server.py:718`): geohash bỏ a,i,l,o
// (chữ THƯỜNG), crockford bỏ I,L,O,U (chữ HOA). Không nới thành `[a-z0-9]` cho gọn
// — nới ra là gửi chuỗi quét được TÙY Ý lên máy chủ, tức mang nội dung mã lạ của
// người ta ra khỏi máy.
const TREE_CODE_RE = /^ORI-[0-9b-hjkmnp-z]{7}-[0-9A-HJKMNP-TV-Z]{8}$/;

/**
 * Rút MÃ CÂY công khai từ chuỗi quét được, hoặc `null` nếu chuỗi không phải mã.
 *
 * Nhận hai dạng: mã trần (`ORI-…`) và URL trang công khai (`…/t/ORI-…`, đúng dạng
 * máy chủ nhúng vào QR). HÀM THUẦN — không gọi mạng, không điều hướng.
 *
 * Trả `null` là "không nhận ra", KHÔNG phải "mã sai": chỉ máy chủ mới biết mã có
 * thật không. Đây chỉ là cổng chặn ở máy để khỏi bắn chuỗi lạ lên `api.orilife.io`.
 */
export function parseTreeCode(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (TREE_CODE_RE.test(s)) return s;

  // Dạng URL: lấy ĐÚNG đoạn ngay sau `/t/`. Không quét cả chuỗi tìm `ORI-…` — làm
  // vậy thì một URL của trang khác có chữ ORI trong query cũng bị nuốt thành mã.
  const m = /^https?:\/\/[^/]+\/t\/([^/?#]+)/i.exec(s);
  if (!m) return null;
  let seg = m[1];
  try {
    seg = decodeURIComponent(seg); // máy chủ `quote(code, safe='')` trước khi ghép
  } catch {
    return null; // mã hỏng phần trăm → không đoán, coi như không nhận ra
  }
  return TREE_CODE_RE.test(seg) ? seg : null;
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
