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
// SỬA 2026-08-17 (2) — dòng cũ ở đây nói "quét ngoài app cũng mở thẳng màn kết quả".
// SAI. Deep-link `lamp://…` mới chỉ khai ở `buildLinking`; KHÔNG platform nào đăng ký
// scheme ở tầng hệ điều hành (`ios/SuperApp/Info.plist:25-35` chỉ có scheme
// OAuth Google; `android/.../AndroidManifest.xml` chỉ có intent-filter MAIN/LAUNCHER).
// `prefixes` chỉ dạy React Navigation cách ĐỌC một URL đã tới tay app, không bảo hệ
// điều hành gửi URL tới. Nên `parseTraceCode` hôm nay chỉ phục vụ đường quét TRONG app.

// Tên route màn quét (host stack, full-bleed — immersive-by-omission: KHÔNG vào
// tabs[], tới được qua navigate/deep-link). Nguồn DUY NHẤT để §4 (cổng) + header
// Home + deep-link cùng tham chiếu.
export const TRACE_SCAN_ROUTE_NAME = 'TraceScan';

// Đích quét HỢP LỆ: CHỈ các màn CHI TIẾT theo-sản-phẩm (soi nguồn gốc). Trace là
// hành động phía TIÊU DÙNG "dùng-rồi-thoát" (§3) → chỉ đưa người quét tới trang
// chi tiết của đúng thực thể trên bao bì, KHÔNG tới danh sách/dashboard nội bộ hay
// luồng ĐĂNG KÝ (TreeIdentity/AnimalIdentity là enroll phía SẢN XUẤT — không phải
// đích soi nguồn gốc). Whitelist hẹp cũng chặn QR lạ điều hướng bừa vào màn nhạy cảm.
//
// GIÁ TRỊ = TÊN KHOÁ tham số mà CHÍNH MÀN ĐÍCH ĐỌC, không phải một tên do bảng này
// đặt ra. Bảng cố ý ghi ba tên viết theo ba lối khác nhau, vì ba màn đó thật sự đọc
// ba lối khác nhau — thống nhất chúng ở đây mà không sửa màn là làm hỏng cả ba.
//
// ⚠️ VÌ SAO PHẢI ÉP KHOÁ, chứ không chỉ ép route: bộ phân giải chép NGUYÊN khoá nào
// có trong URL. Một mã QR ghi `?farmId=…` cho `FarmDetail` (màn đọc `farm_id`) vẫn
// qua được whitelist, vẫn điều hướng, và màn đích nhận `undefined` — nó không nói
// "mã sai", nó hiện một màn không có dữ liệu. Lỗi này đã xảy ra HAI lần ở hai màn
// khác nhau (`AnimalDetail` với `id` thay `animalDid`; `FarmDetail` với `farmId`
// thay `farm_id`), và cả hai lần bài kiểm đều XANH vì nó chỉ kiểm bộ phân giải chứ
// không kiểm đầu đọc. Thiếu khoá ⇒ trả null ⇒ màn quét nói "chưa nhận diện": thà
// không đi đâu còn hơn đi tới một màn không biết nó đang nói về cái gì.
//
// Dùng `Map` chứ không phải object: khoá tra là chuỗi QUÉT ĐƯỢC từ bên ngoài, mà
// object thì `TRACE_TARGET_ID_KEY['constructor']` trả về một giá trị truthy.
const TRACE_TARGET_ID_KEY = new Map<string, string>([
  // TreeDetailScreen.tsx — `interface RouteParams { tree?; treeId?; … }`
  ['TreeDetail', 'treeId'],
  // FarmDetailScreen.tsx — `useState(params.farm_id ?? null)`, và mọi lối vào
  // trong app đã dùng tên này (DashboardScreen, TreeEnrollScreen).
  ['FarmDetail', 'farm_id'],
  // AnimalDetailScreen.tsx — `readAnimalDid(route.params)`
  ['AnimalDetail', 'animalDid'],
]);

export interface TraceTarget {
  route: string;
  /**
   * LUÔN có, và luôn chứa khoá định danh của `route`. Trước đây trường này là tuỳ
   * chọn — tức hợp đồng cho phép "mở màn chi tiết mà không nói chi tiết của cái
   * gì". Đó chính là hình dạng đã dẫn tới màn trống.
   */
  params: Record<string, string>;
}

// ── Mã cây CÔNG KHAI — LỐI TẮT tra cứu, KHÔNG phải cách định danh ────────────
//
// ⚠️ Đọc kỹ chỗ này, đây là chỗ dễ hiểu ngược nhất của cả hệ.
//
// ĐỊNH DANH cây/quả trong OriLife là bằng ẢNH — mô hình so khớp lại cá thể
// (`/api/identify`, đường quét quả ở PR #151). Mã `ORI-…` KHÔNG định danh gì cả:
// nó là một cái NHÃN máy chủ cấp SAU khi cây đã được định danh, để người mua tra
// nhanh trang xuất xứ mà không phải chụp lại quả. Bỏ mã này đi thì hệ vẫn định danh
// bình thường; bỏ đường ảnh đi thì hệ chết. Đừng đảo thứ tự đó trong đầu.
//
// Nguồn hợp đồng: `OriLifeTrace/OriLife-Integration.md:75` xếp `/t/{code}`·`/qr/{code}`
// vào nhóm "Chia-sẻ · Xuất-xứ", và `:257` xếp "Xuất-xứ/QR" ở bước MỞ RỘNG truy xuất —
// không nằm trong vòng lõi định danh.
//
// Khuôn mã: `identity.tree_code()` = `ORI-{geohash7}-{crockford8}`; máy chủ ghép thành
// URL `{PUBLIC_BASE_URL}/t/{code}` (`server.py:730-741`) và cửa `/qr/{code}` trả URL đó
// dưới dạng ảnh QR SVG (`server.py:5431`). Nên chuỗi quét được là URL http, KHÔNG phải
// `lamp://…`, và `parseTraceCode` (chỉ nhận deep-link nội bộ) không đọc nổi.
//
// CHƯA ĐO ĐƯỢC, nói thẳng: nhà này KHÔNG có bằng chứng nào cho thấy đã có bao bì thật
// in mã này ngoài thực địa. Cửa máy chủ thì sống, nhưng "QR thật trên bao bì" là điều
// CHƯA kiểm. Hàm dưới đây làm cho đường tra mã sẵn sàng, không chứng minh nó đang được dùng.
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
 * Chỉ nhận deep-link nội bộ `lamp://…` (sản phẩm Aladin đã đăng ký). Lấy
 * đoạn cuối path làm route; query (?k=v) thành params. Route ngoài whitelist →
 * null (màn quét hiện "chưa nhận diện"). HÀM THUẦN — không điều hướng.
 *
 * Cũng trả null khi route hợp lệ nhưng THIẾU khoá định danh mà màn đích đọc —
 * xem `TRACE_TARGET_ID_KEY` phía trên để biết vì sao đó là điều kiện bắt buộc.
 */
export function parseTraceCode(raw: string): TraceTarget | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = /^lamp:\/\/(.+)$/i.exec(s);
  if (!m) return null;

  const [pathPart, queryPart] = m[1].split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const route = segs[segs.length - 1];
  if (!route) return null;
  const idKey = TRACE_TARGET_ID_KEY.get(route);
  if (!idKey) return null;

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

  // Khoá định danh vắng mặt hoặc rỗng ⇒ mã này không tra được thực thể nào. Không
  // điều hướng: màn quét sẽ hiện "chưa nhận diện" thay vì một màn chi tiết trống.
  if (!params[idKey]) return null;

  return { route, params };
}
