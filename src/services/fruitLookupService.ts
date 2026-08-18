/**
 * fruitLookupService — NGƯỜI MUA chụp một quả, hỏi "quả này từ đâu ra".
 *
 *   POST /api/fruit/lookup   — KHÔNG cần đăng nhập
 *
 * ══ HỢP ĐỒNG ĐỌC TỪ ĐÂU ═══════════════════════════════════════════════════
 * Từ **chính máy chủ đang chạy**: `https://api.orilife.io/openapi.json`, mục
 * `/api/fruit/lookup` (đo 2026-08-18, 146 đường). Phần mô tả ở đó tự nhận là
 * "nguồn sự thật của hợp đồng — không có tệp .md nào khác mô tả route này".
 *
 * ⚠ Bản ĐẦU của tệp này viết theo một bản tóm tắt bằng lời, và sai tên gần như
 * mọi trường: đọc `detections` (thật ra là `regions`), đòi `fruit_id` (máy chủ
 * CỐ Ý không trả — xem phòng thủ 3 bên dưới), đọc `thumbnail_url` (thật ra là
 * `img_urls[]`), đọc `provenance` ở gốc thẻ (thật ra nằm trong `tree`). Hậu quả
 * đo được: mọi ứng viên bị lọc sạch vì thiếu `fruit_id`, và mọi lỗi 400 rơi vào
 * nhánh "không rõ". Ghi lại đây để lần sau đọc openapi TRƯỚC khi viết.
 *
 * ── VÀO (multipart, không `Authorization`) ─────────────────────────────────
 *   file                        bắt buộc — JPEG/PNG, trần riêng 2MB
 *   bbox_x/bbox_y/bbox_w/bbox_h khung quanh quả (pixel ảnh GỬI ĐI), tuỳ chọn
 *   points + shape              khoanh đa giác thay cho bbox, tuỳ chọn
 *   sess                        mã phiên do client tự sinh (xem `lookupSession`)
 *   (KHÔNG nhận lat/lon — máy chủ nói thẳng là không thu vị trí người mua.)
 *
 * ── RA 200, hai dạng ───────────────────────────────────────────────────────
 *   (a) { ok, need_region: true, regions: [{index, bbox}], message }
 *   (b) { ok, lookup_id, verdict: CHOICES|SOLO|EMPTY_SCOPE, verdict_label,
 *         message, candidates: [thẻ], fruit: thẻ|null, match, warnings,
 *         warning_messages }
 *       thẻ = { pick, name, status, enrolled_at, n_imgs, img_urls[],
 *               tree: { name, code, gps, created_at, public_url,
 *                       provenance: { anchored, status, network, explorer_url,
 *                                     label, means } } }
 *
 * ── RA LỖI ─────────────────────────────────────────────────────────────────
 *   400 {"error_code":"image_unusable"}  ảnh mờ/hỏng, không nhúng được
 *   413                                  ảnh vượt trần
 *   429 {"error_code":"rate_limited","retry_after":N}
 *
 * ══ BỐN ĐIỀU MÁY CHỦ CỐ Ý LÀM, ĐỪNG CHỐNG LẠI ═════════════════════════════
 *
 * 1. **Không có `fruit_id`.** Thẻ chỉ có `pick` — mã CHỌN của riêng lượt tra
 *    này. Máy chủ gọi đây là "ẩn nội tạng": không điểm, không biên, không id,
 *    không chủ. Client tuyệt đối không được suy ra id thật rồi đem đi tra cửa
 *    khác — nó không tồn tại ở phía này.
 * 2. **Không có ĐIỂM SỐ.** Nên màn hình KHÔNG thể xếp hạng hay đánh dấu "khớp
 *    nhất", và đó là điều tốt: máy soi quả nhận nhầm 73% cặp quả khác nhau cùng
 *    một cây (đo trên prod, thư OriLife 08/08 §1). Mắt người là trọng tài, và
 *    máy chủ đã dựng cửa này để bắt buộc như vậy.
 * 3. **Ảnh đi qua mã hết hạn** (`/api/fruit/lookup/img/{token}`) và **thu hồi
 *    được**: nông dân hạ cây về riêng tư thì mọi ảnh đã phát tắt ngay. Nên
 *    KHÔNG cache `img_urls` qua phiên, và ảnh vỡ không phải lỗi — có thể là chủ
 *    vườn vừa rút công khai.
 * 4. **GPS đã làm thô.** `tree.gps` là VÙNG, không phải vị trí cây.
 *
 * ══ HAI ĐIỀU PHÍA APP CỐ Ý LÀM ════════════════════════════════════════════
 *
 * · **Không có tham số nào nhận toạ độ.** Không phải "mặc định tắt" — không có
 *   đường vào. Người mua chụp quả trong bếp nhà mình; đính toạ độ bếp vào một
 *   yêu cầu không đăng nhập là theo dõi, không phải truy xuất.
 * · **Cân ảnh TRƯỚC khi tải lên.** Để máy chủ trả 413 thì người dùng đã ngồi hết
 *   một lượt tải 2G rồi mới nhận lỗi. Cân KHÔNG được thì vẫn gửi — chặn oan một
 *   tấm hợp lệ tệ hơn nhận một 413.
 *
 * Tệp RIÊNG, không nhét vào `fruitReIDService`, vì tệp kia ký DID ở mọi lượt
 * gọi. Người mua vừa bổ quả ra ăn thì không có DID nào cả.
 */

import type { APIError } from './fruitReIDService';

// ---------------------------------------------------------------------------
// Hằng số
// ---------------------------------------------------------------------------

/** Trần dung-lượng ảnh của lane khách (`OLT_SCAN_MAX_MB`). */
export const LOOKUP_MAX_BYTES = 2 * 1024 * 1024;

/** Số ứng viên nhiều nhất. Máy chủ hứa 5; app cắt lại cho chắc. */
export const LOOKUP_MAX_CANDIDATES = 5;

const REQUEST_TIMEOUT_MS = 45_000;

/** Chờ lại bao lâu khi máy chủ chặn tần suất mà không nói rõ. */
export const DEFAULT_RETRY_AFTER_SEC = 60;

// ---------------------------------------------------------------------------
// Kiểu
// ---------------------------------------------------------------------------

/** `[x, y, w, h]` theo pixel của tấm ảnh ĐÃ GỬI ĐI. */
export type LookupBbox = [number, number, number, number];

/**
 * Chỉ đúng quả nào trong ảnh. Không gửi gì ⇒ ảnh phải chỉ có một quả.
 *
 * ⚠ HIỆN KHÔNG MÀN NÀO GỬI. `TraceScanScreen` gửi nguyên tấm ảnh và để máy chủ
 * tự tìm quả; nó cố ý bỏ phần khoanh vùng phía app (xem đầu màn đó). Giữ kiểu
 * này lại vì đây là hợp đồng THẬT của máy chủ, không phải một tính năng bỏ quên
 * — ngày nào có màn cần chỉ đúng quả (cắt ảnh, chọn trong thư viện nhiều quả)
 * thì đường đã sẵn và đã có bài kiểm.
 */
export interface LookupRegionInput {
  bbox?: LookupBbox;
  points?: Array<[number, number]>;
  /** Máy chủ mặc định `rect`; gửi `polygon` khi dùng `points`. */
  shape?: string;
}

/** Bằng chứng on-chain của CÂY MẸ. */
export interface LookupProvenance {
  /**
   * `false` = CHƯA NEO (có thể đang chờ lô), KHÔNG phải "hàng giả".
   * Vắng mặt = máy chủ không nói ⇒ chưa biết (xem `isAnchored`).
   */
  anchored?: boolean;
  status?: string;
  network?: string;
  explorer_url?: string | null;
  /** Câu tiếng Việt máy chủ đặt sẵn. HIỆN THẲNG, đừng tự dịch lại. */
  label?: string;
  /** Câu giải thích "điều đó nghĩa là gì". */
  means?: string;
  [k: string]: unknown;
}

/** Cây mẹ, ở góc nhìn CÔNG KHAI (đã lọc, GPS đã làm thô). */
export interface LookupTree {
  name?: string | null;
  /** Mã `ORI-…` — đường mở hồ sơ xuất xứ công khai. */
  code?: string | null;
  /** VÙNG, không phải vị trí cây. */
  gps?: [number, number] | null;
  created_at?: string | null;
  public_url?: string | null;
  provenance?: LookupProvenance | null;
  [k: string]: unknown;
}

/**
 * Một quả ứng viên. `pick` là mã CHỌN của lượt này — KHÔNG phải `fruit_id`
 * (máy chủ cố ý không trả, xem §1 đầu tệp).
 */
export interface LookupCandidate {
  pick: string;
  name?: string | null;
  status?: string | null;
  enrolled_at?: string | null;
  n_imgs?: number;
  /** Đã quy về URL tuyệt đối. Mã có hạn và thu hồi được — đừng cache qua phiên. */
  img_urls: string[];
  tree?: LookupTree | null;
  [k: string]: unknown;
}

/** Một quả máy chủ thấy trong ảnh, để mời người dùng chỉ đúng quả. */
export interface LookupRegion {
  index: number;
  bbox: LookupBbox;
}

/** Máy chủ tự đặt tên cho kết quả. Để `| string` vì bản sau có thể thêm. */
export type LookupVerdict = 'CHOICES' | 'SOLO' | 'EMPTY_SCOPE' | string;

/**
 * Kết quả một lượt tra. BẢY nhánh, và chỉ nhánh cuối là hỏng hóc không rõ.
 *
 * Tách nhỏ như vậy vì mỗi nhánh dẫn tới một hành động KHÁC nhau ở màn quét:
 * `need_region` mời chạm chọn, `image_unusable` mời chụp lại gần hơn,
 * `rate_limited` bắt buộc KHOÁ nút chụp, `empty_scope` là câu trả lời bình
 * thường ("chưa có quả công khai nào giống"). Gộp chúng vào một câu "có trục
 * trặc" là ném đi đúng thứ người dùng cần biết để làm tiếp.
 */
export type FruitLookupResult =
  | {
    kind: 'candidates';
    candidates: LookupCandidate[];
    /** Chỉ khác `null` khi `verdict === 'SOLO'`. */
    solo: LookupCandidate | null;
    verdict?: LookupVerdict;
    /** Nhãn tiếng Việt của máy chủ cho verdict. */
    verdictLabel?: string;
    lookupId?: string;
    message?: string;
    /** `warning_messages` — câu tiếng Việt, hiện thẳng. */
    warnings: string[];
  }
  | { kind: 'need_region'; regions: LookupRegion[]; message?: string }
  /** Không có quả CÔNG KHAI nào giống. Một câu trả lời, không phải lỗi. */
  | { kind: 'empty_scope'; message?: string }
  /** 400 — ảnh mờ/hỏng, máy chủ không nhúng được. Chụp lại là xong. */
  | { kind: 'image_unusable'; message?: string }
  /** Ảnh vượt trần 2MB. */
  | { kind: 'too_large'; bytes: number; limit: number }
  /** 429 — PHẢI khoá nút chụp tới hạn máy chủ đưa, không được thử lại ngay. */
  | { kind: 'rate_limited'; retryAfterSec: number; message?: string }
  | { kind: 'error'; error: APIError };

// ---------------------------------------------------------------------------
// Mã phiên
// ---------------------------------------------------------------------------

let _sess: string | null = null;

/**
 * Mã phiên gửi kèm mỗi lượt tra (`sess`).
 *
 * Máy chủ dùng nó cho lớp hạn tần suất CHẶT NHẤT, và tự nhận đây là lớp "GIỮ
 * TRẢI NGHIỆM" chứ không phải lớp an ninh (giả được). Nên giá trị chỉ cần ổn
 * định trong một lần chạy app: gửi mã ổn định thì mỗi người dùng có ngân sách
 * riêng; KHÔNG gửi thì tất cả rơi chung vào lớp địa chỉ gọi — và ở một quán cà
 * phê hay một hội chợ dùng chung wifi, người thứ hai bị khoá vì người thứ nhất.
 *
 * Sinh mới mỗi lần mở app, KHÔNG lưu xuống đĩa: đây không phải danh tính, và
 * một mã theo máy vĩnh viễn thì đúng là thứ dùng để lần theo người mua.
 */
export function lookupSession(): string {
  if (!_sess) {
    _sess = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return _sess;
}

/** Chỉ dùng cho test — trả mã phiên về trạng thái chưa sinh. */
export function _resetLookupSession(): void {
  _sess = null;
}

// ---------------------------------------------------------------------------
// Đọc kết quả — mấy câu hỏi màn hình hay hỏi
// ---------------------------------------------------------------------------

/**
 * Cây mẹ đã neo lên chuỗi chưa: `true` · `false` · `null` (KHÔNG BIẾT).
 *
 * Ba giá trị chứ không phải hai. Máy chủ không gửi `provenance` thì app không
 * được kết luận "chưa neo" — nó chỉ được nói "chưa biết". Đọc chỗ vắng thành
 * `false` là in một câu khẳng định mà không ai đo được.
 */
export function isAnchored(p: LookupProvenance | null | undefined): boolean | null {
  if (!p || typeof p !== 'object') return null;
  if (typeof p.anchored === 'boolean') return p.anchored;
  if (typeof p.status === 'string') {
    if (p.status === 'anchored' || p.status === 'confirmed') return true;
    if (p.status === 'pending' || p.status === 'none' || p.status === 'unanchored') return false;
  }
  return null;
}

/** Bằng chứng của một ứng viên nằm trong `tree`, không ở gốc thẻ. */
export function provenanceOf(c: LookupCandidate | null | undefined): LookupProvenance | null {
  const p = c?.tree?.provenance;
  return p && typeof p === 'object' ? p : null;
}

/**
 * URL trình duyệt chuỗi, ĐÃ LỌC. `null` = không có gì an toàn để mở.
 *
 * ⚠ Chuỗi này do máy chủ gửi và app đem thẳng vào `Linking.openURL`. Không lọc
 * thì một máy chủ bị chiếm (hoặc một bản thử cấu hình sai) đẩy được `javascript:`
 * hay deep-link của app khác vào tay người dùng chỉ bằng một trường JSON.
 */
export function safeExplorerUrl(p: LookupProvenance | null | undefined): string | null {
  return safeHttpUrl(typeof p?.explorer_url === 'string' ? p.explorer_url : null);
}

/** Cùng luật lọc, dùng chung cho `tree.public_url`. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  const lower = s.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return null;
  return s;
}

/** Ảnh đầu tiên của ứng viên. `null` khi thẻ chưa có ảnh nào dùng được. */
export function candidateImageUrl(c: LookupCandidate | null | undefined): string | null {
  const first = c?.img_urls?.find((u) => typeof u === 'string' && u.trim().length > 0);
  return first ? first.trim() : null;
}

// ---------------------------------------------------------------------------
// Đọc thân trả về — thuần, test được
// ---------------------------------------------------------------------------

function _num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function _str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function _bbox(v: unknown): LookupBbox | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const four = v.slice(0, 4).map(_num);
  if (four.some((n) => n === undefined)) return null;
  return four as LookupBbox;
}

/**
 * Ảnh của lane khách là đường tương đối (`/api/fruit/lookup/img/{token}`). Quy
 * về tuyệt đối NGAY khi đọc, để không chỗ nào phía trên phải nhớ ghép base.
 */
function _absUrl(raw: unknown, baseUrl: string): string | null {
  const s = _str(raw);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const base = baseUrl.replace(/\/+$/, '');
  return s.startsWith('/') ? `${base}${s}` : `${base}/${s}`;
}

function _card(raw: unknown, baseUrl: string): LookupCandidate | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const pick = _str(o.pick);
  // Không có `pick` thì không chọn tiếp được gì — một dòng ảnh không bấm được là
  // một dòng bày ra để làm người ta bấm hụt.
  if (!pick) return null;

  const imgs = Array.isArray(o.img_urls)
    ? o.img_urls.map((u) => _absUrl(u, baseUrl)).filter((u): u is string => u !== null)
    : [];

  const treeRaw = (o.tree ?? null) as Record<string, unknown> | null;
  const tree: LookupTree | null = treeRaw && typeof treeRaw === 'object'
    ? {
      ...treeRaw,
      name: _str(treeRaw.name),
      code: _str(treeRaw.code),
      public_url: _str(treeRaw.public_url),
      created_at: _str(treeRaw.created_at),
      gps: Array.isArray(treeRaw.gps) && treeRaw.gps.length >= 2 &&
        _num(treeRaw.gps[0]) !== undefined && _num(treeRaw.gps[1]) !== undefined
        ? [treeRaw.gps[0] as number, treeRaw.gps[1] as number]
        : null,
      provenance: treeRaw.provenance && typeof treeRaw.provenance === 'object'
        ? (treeRaw.provenance as LookupProvenance)
        : null,
    }
    : null;

  return {
    ...o,
    pick,
    name: _str(o.name),
    status: _str(o.status),
    enrolled_at: _str(o.enrolled_at),
    n_imgs: _num(o.n_imgs),
    img_urls: imgs,
    tree,
  };
}

/**
 * JSON máy chủ → `FruitLookupResult`. Tách khỏi `fetch` để test được không cần mạng.
 *
 * Thứ tự xét CÓ CHỦ Ý: `need_region` xét TRƯỚC danh sách ứng viên. Máy chủ có thể
 * trả kèm cả hai; ưu tiên ứng viên trong ca đó là bày danh sách của quả NÀO ĐÓ
 * trong ảnh mà người mua tưởng là quả mình đang hỏi.
 */
export function parseLookupBody(body: unknown, baseUrl: string): FruitLookupResult {
  const b = (body ?? {}) as Record<string, unknown>;

  // Bẫy HAI TẦNG `ok` như mọi cửa khác của máy chủ này: `{"ok": false}` có thể về
  // kèm HTTP 200. Chỉ đọc mã HTTP là bỏ sót.
  if (b.ok === false && b.need_region !== true) {
    return {
      kind: 'error',
      error: {
        type: 'server_error',
        detail: String(b.error ?? b.detail ?? b.message ?? 'Máy chủ từ chối'),
        http_status: 200,
      },
    };
  }

  const message = _str(b.message) ?? undefined;

  if (b.need_region === true) {
    const raw = Array.isArray(b.regions) ? b.regions : [];
    const regions: LookupRegion[] = [];
    for (let i = 0; i < raw.length; i++) {
      const o = (raw[i] ?? {}) as Record<string, unknown>;
      const bbox = _bbox(o.bbox);
      if (bbox) regions.push({ index: _num(o.index) ?? i, bbox });
    }
    return { kind: 'need_region', regions, message };
  }

  const verdict = _str(b.verdict) ?? undefined;
  const solo = _card(b.fruit, baseUrl);

  const cards: LookupCandidate[] = [];
  for (const raw of Array.isArray(b.candidates) ? b.candidates : []) {
    const c = _card(raw, baseUrl);
    if (c) cards.push(c);
    if (cards.length >= LOOKUP_MAX_CANDIDATES) break;
  }
  // Verdict SOLO có thể chỉ trả `fruit`; đưa nó vào danh sách để màn hình chỉ
  // phải biết MỘT hình dạng.
  if (cards.length === 0 && solo) cards.push(solo);

  if (cards.length === 0) {
    // Bao gồm cả `EMPTY_SCOPE` lẫn ca máy chủ trả danh sách rỗng không nói gì —
    // với người mua thì hai ca đó là cùng một câu trả lời.
    return { kind: 'empty_scope', message };
  }

  const warnings = Array.isArray(b.warning_messages)
    ? b.warning_messages.map(_str).filter((s): s is string => s !== null)
    : [];

  return {
    kind: 'candidates',
    candidates: cards,
    solo,
    verdict,
    verdictLabel: _str(b.verdict_label) ?? undefined,
    lookupId: _str(b.lookup_id) ?? undefined,
    message,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Cân ảnh trước khi gửi
// ---------------------------------------------------------------------------

/**
 * Dung-lượng tệp theo byte, hoặc `null` khi KHÔNG ĐO ĐƯỢC.
 *
 * `null` và `0` là hai chuyện khác nhau: `0` là tệp rỗng thật, `null` là "không
 * cân được" (URI `content://`, thiếu `expo-file-system`, bản signed lỗi
 * ExpoModulesCore…). Nơi gọi phải cho `null` đi tiếp — chặn oan một tấm ảnh hợp
 * lệ tệ hơn là để máy chủ trả 413.
 */
export async function imageBytes(uri: string): Promise<number | null> {
  if (!uri || !uri.startsWith('file://')) return null;
  try {
    // `legacy` vì `getInfoAsync` còn nằm ở đó trên SDK này — khớp `treeDraftStore`.
    // `require` NÉM nếu ExpoModulesCore chưa cài; catch trả `null`.
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    const size = info?.size;
    return typeof size === 'number' && Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cửa duy nhất
// ---------------------------------------------------------------------------

/** Đọc `retry_after` từ thân, rồi tới header, rồi mới tới mặc định. */
function _retryAfter(body: unknown, header: string | null): number {
  const b = (body ?? {}) as Record<string, unknown>;
  const fromBody = _num(b.retry_after);
  if (fromBody !== undefined && fromBody > 0) return Math.ceil(fromBody);
  const fromHeader = header ? parseInt(header, 10) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
  return DEFAULT_RETRY_AFTER_SEC;
}

/**
 * Tra nguồn gốc một quả từ ảnh. KHÔNG cần đăng nhập.
 *
 * @param baseUrl    gốc máy chủ (`ORILIFE_BASE`)
 * @param imagePath  URI ảnh JPEG/PNG trên máy
 * @param region     bbox / points chỉ đúng quả cần hỏi (bỏ trống nếu ảnh chỉ 1 quả)
 *
 * KHÔNG có tham số vị trí, và sẽ không bao giờ có — xem đầu tệp.
 * KHÔNG ném: mọi hỏng hóc gói vào một nhánh.
 */
export async function lookupFruit(
  baseUrl: string,
  imagePath: string,
  region?: LookupRegionInput,
): Promise<FruitLookupResult> {
  const uri = (imagePath ?? '').trim();
  if (!uri) {
    return {
      kind: 'error',
      error: { type: 'validation_error', detail: 'Chưa có ảnh để tra', http_status: 0 },
    };
  }

  const bytes = await imageBytes(uri);
  if (bytes !== null && bytes > LOOKUP_MAX_BYTES) {
    return { kind: 'too_large', bytes, limit: LOOKUP_MAX_BYTES };
  }

  const form = new FormData();
  const isPng = uri.toLowerCase().endsWith('.png');
  (form as unknown as { append: (k: string, v: unknown) => void }).append('file', {
    uri,
    type: isPng ? 'image/png' : 'image/jpeg',
    name: isPng ? 'lookup.png' : 'lookup.jpg',
  });
  if (region?.bbox) {
    // Máy chủ khai bốn trường này là CHUỖI (openapi: type string) — gửi số thô
    // qua FormData của RN cũng thành chuỗi, nhưng ép ở đây cho khỏi phụ thuộc.
    form.append('bbox_x', String(region.bbox[0]));
    form.append('bbox_y', String(region.bbox[1]));
    form.append('bbox_w', String(region.bbox[2]));
    form.append('bbox_h', String(region.bbox[3]));
  }
  if (region?.points && region.points.length > 0) {
    form.append('points', JSON.stringify(region.points));
    form.append('shape', region.shape ?? 'polygon');
  } else if (region?.shape) {
    form.append('shape', region.shape);
  }
  form.append('sess', lookupSession());
  // Ở ĐÂY KHÔNG CÓ `lat`/`lon`. Ai định thêm: đọc đầu tệp trước.

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${baseUrl}/api/fruit/lookup`, {
      method: 'POST',
      // KHÔNG `Authorization`: cửa công khai, người mua không có tài khoản.
      headers: { Accept: 'application/json' },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.status === 400) {
      // Hợp đồng: `image_unusable` — ảnh mờ/hỏng/không đọc được. ĐÂY LÀ CA HAY
      // GẶP NHẤT ở đường chụp quả, và nó có cách xử rõ ràng (chụp lại gần hơn,
      // đủ sáng) nên KHÔNG được gộp vào "lỗi không rõ".
      const body = await resp.json().catch(() => null);
      const code = _str((body as any)?.error_code);
      if (code === 'image_unusable' || code === null) {
        return { kind: 'image_unusable', message: _str((body as any)?.message) ?? undefined };
      }
      return {
        kind: 'error',
        error: { type: 'validation_error', detail: code, http_status: 400 },
      };
    }
    if (resp.status === 413) {
      // Máy chủ cân lại và từ chối — xảy ra khi phía app không cân được.
      return { kind: 'too_large', bytes: bytes ?? -1, limit: LOOKUP_MAX_BYTES };
    }
    if (resp.status === 429) {
      const body = await resp.json().catch(() => null);
      return {
        kind: 'rate_limited',
        retryAfterSec: _retryAfter(body, resp.headers.get('Retry-After')),
        message: _str((body as any)?.message) ?? undefined,
      };
    }
    if (resp.status === 415) {
      return {
        kind: 'error',
        error: {
          type: 'validation_error',
          detail: 'Máy chủ chỉ nhận ảnh JPEG hoặc PNG',
          http_status: 415,
        },
      };
    }
    if (resp.status === 422) {
      let detail = 'Ảnh không hợp lệ';
      try {
        const j = await resp.json();
        // FastAPI trả `detail` là MẢNG lỗi từng trường; nối lại thay vì in
        // "[object Object]" lên mặt người dùng.
        detail = Array.isArray(j?.detail)
          ? j.detail.map((d: any) => d?.msg ?? String(d)).join(' · ')
          : String(j?.detail ?? detail);
      } catch { /* giữ câu mặc định */ }
      return { kind: 'error', error: { type: 'validation_error', detail, http_status: 422 } };
    }
    if (resp.status === 404) {
      return {
        kind: 'error',
        error: {
          type: 'validation_error',
          detail: 'Máy chủ chưa bật tra nguồn gốc bằng ảnh',
          http_status: 404,
        },
      };
    }
    if (resp.status >= 500) {
      return {
        kind: 'error',
        error: { type: 'server_error', detail: `Lỗi máy chủ HTTP ${resp.status}`, http_status: resp.status },
      };
    }
    if (!resp.ok) {
      return {
        kind: 'error',
        error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status },
      };
    }

    const body = await resp.json().catch(() => null);
    if (body === null) {
      return {
        kind: 'error',
        error: { type: 'server_error', detail: 'Máy chủ trả 200 nhưng thân không đọc được', http_status: 200 },
      };
    }
    return parseLookupBody(body, baseUrl);
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      kind: 'error',
      error: {
        type: 'network_error',
        detail: isTimeout ? 'Quá hạn chờ máy chủ' : String(err),
        http_status: 0,
      },
    };
  }
}
