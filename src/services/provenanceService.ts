/**
 * provenanceService — "lấy gì chứng minh cây này là cây này".
 *
 * Ba cửa OriLife field-reid:
 *   · `GET /api/provenance/{tree_id}`  (`server.py:5301`) — CÔNG KHAI, không auth
 *   · `GET /api/tree_by_code/{code}`   (`server.py:5313`) — CÔNG KHAI, không auth
 *   · `GET /api/fruit/{fruit_id}`      (`server.py:7268`) — CẦN auth, chỉ chủ
 *
 * VÌ SAO CÓ FILE NÀY. Hai cửa đầu là nửa sản phẩm dành cho NGƯỜI MUA: quét mã dán
 * ở gốc cây hoặc trên thùng hàng, đọc ra ảnh + CID + trạng thái neo, không cần tài
 * khoản. Cửa thứ ba vá chỗ màn quả đang dựng từ mảnh dữ liệu của danh sách
 * (`/api/fruit/list`) vì thiếu cửa chi tiết.
 *
 * ⚠️ BA CÁI BẪY, cả ba đều thuộc loại hỏng-mà-không-có-gì-báo:
 *
 * 1. **404 ở hai cửa công khai KHÔNG phải "dữ liệu hỏng".** Máy chủ CỐ Ý trả cùng
 *    404 cho *cây riêng tư* và *cây không tồn tại* (`server.py:5307`, `:5317` —
 *    rọc-phách §18: phân biệt hai ca là lộ sự tồn tại của cây riêng tư người khác
 *    qua mã in trên QR). App hiện "lỗi, thử lại" ở đây là hiện sai: không có gì để
 *    thử lại. Vì vậy hàm trả **ba nhánh**, `not_public` là một câu trả lời bình
 *    thường chứ không phải lỗi.
 *
 * 2. **GPS trả về có thể ĐÃ BỊ LÀM THÔ ~111m, và không có trường nào nói điều đó.**
 *    `_coarsen_public_gps` (`server.py`) làm tròn 3 chữ số theo mặc định
 *    `expose_location = 'geohash_coarse'`; chủ vườn phải chủ động đặt `'exact'`.
 *    Nhưng `_public_prov` KHÔNG trả `expose_location` ra ngoài — nên client nhận
 *    hai con số và không có cách nào biết chúng chỉ cây hay chỉ một ô 111m. Vẽ một
 *    ghim nhọn lên đó là nói dối bằng đồ hoạ. `gpsPrecision()` dưới đây trả lời
 *    đúng mức biết được: **chứng minh được "không bị làm thô", KHÔNG chứng minh
 *    được "chính xác"** — vì một toạ độ thật cũng có thể tình cờ đúng 3 chữ số.
 *
 * 3. **`gps` có thể là `null` hẳn** (`expose_location = 'none'`). Đó là lựa chọn
 *    của chủ vườn, không phải dữ liệu thiếu.
 *
 * Hai cửa công khai KHÔNG gửi `Authorization` và KHÔNG gọi `ensureOrilifeToken`:
 * người mua chưa có tài khoản, ép lấy token là dựng một cánh cửa khoá ngay trước
 * mặt đúng người mà cửa này sinh ra để phục vụ.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';
import type { APIError, ApiResult } from './fruitReIDService';

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Kiểu — khớp allowlist `_public_prov` (`server.py:806-838`)
// ---------------------------------------------------------------------------

/** Toạ độ máy chủ trả: `[lat, lon]`, hoặc `null` khi chủ vườn chọn ẩn. */
export type ProvGps = [number, number] | null;

/** Một ảnh trong hồ sơ xuất xứ. `nodes_offsite` đã bị máy chủ gỡ — đừng đọc. */
export interface ProvImage {
  cid?: string;
  hash?: string;
  nodes?: number;
  [k: string]: unknown;
}

/**
 * Hồ sơ xuất xứ đã lọc cho cửa công khai. Danh sách trường là allowlist ở
 * `server.py:812-816` — máy chủ thêm trường mới thì nó KHÔNG tự lọt ra đây.
 */
export interface Provenance {
  tree_id?: string;
  code?: string;
  name?: string;
  gps?: ProvGps;
  created_at?: string;
  images?: ProvImage[];
  model3d?: Record<string, unknown> | null;
  embedding_hash?: string;
  n_views?: number;
  record_cid?: string;
  record_hash?: string;
  lampnet_base?: string;
  lampnet_pending?: boolean;
  /** URL xem ảnh trực tiếp theo CID — máy chủ gắn thêm (`server.py:837`). */
  lampnet_view?: string;
  anchor?: Record<string, unknown> | null;
}

/**
 * Kết quả một cửa CÔNG KHAI. Ba nhánh, và `not_public` KHÔNG phải lỗi.
 *
 * `not_public` gộp đúng hai ca mà máy chủ cố ý gộp: cây riêng tư, và cây không có.
 * App không được nói câu nào hàm ý "cây này không tồn tại" — nó có thể tồn tại và
 * chỉ là của người khác.
 */
export type ProvenanceResult =
  | { kind: 'ok'; provenance: Provenance }
  | { kind: 'not_public' }
  | { kind: 'error'; error: APIError };

/** Chi tiết một quả (`fruit_reid.py:1708-1720`). `views` và `mark_sig` bị máy chủ giữ lại. */
export interface FruitDetail {
  fruit_id?: string;
  tree_id?: string;
  name?: string;
  status?: string;
  created_at?: string;
  /** Máy chủ tự tính từ độ dài `views` — luôn có mặt. */
  n_views?: number;
  /** Đếm ảnh theo MẶT, gộp cả ảnh đã đẩy vào lưu trữ (`fruit_reid.py:1722`). */
  views_by_type?: Record<string, number>;
  [k: string]: unknown;
}

/**
 * Kết quả cửa chi tiết quả. `forbidden` tách riêng vì máy chủ gộp *"quả của người
 * khác"* với *"cây không có"* vào cùng 403 (`_guard_owner`, chống IDOR) — hai ca
 * đó app không phân biệt được, nhưng phân biệt được chúng với 404 "không có quả".
 */
export type FruitDetailResult =
  | { kind: 'ok'; fruit: FruitDetail }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; detail: string }
  | { kind: 'error'; error: APIError };

// ---------------------------------------------------------------------------
// Độ chính xác GPS — nói đúng mức biết được, không hơn
// ---------------------------------------------------------------------------

/**
 * `exact_not_coarsened` — có chữ số thứ 4 trở đi ⇒ CHẮC CHẮN chưa qua làm tròn.
 * `maybe_coarsened`     — ≤ 3 chữ số thập phân ⇒ có thể là ô ~111m, cũng có thể
 *                         là toạ độ thật tình cờ tròn. Không phân biệt được.
 * `hidden`              — chủ vườn chọn ẩn (`expose_location='none'`).
 */
export type GpsPrecision = 'exact_not_coarsened' | 'maybe_coarsened' | 'hidden';

/** Số chữ số thập phân `_coarsen_public_gps` làm tròn về. */
const COARSE_DECIMALS = 3;

function _decimals(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const dot = s.indexOf('.');
  if (dot < 0) return 0;
  // Số rất nhỏ/rất lớn in ra dạng mũ (`1e-7`) — không đếm được bằng cách này,
  // và một toạ độ thật không bao giờ ở dạng đó. Coi như 0 chữ số ⇒ rơi về
  // `maybe_coarsened`, tức về phía THẬN TRỌNG.
  if (s.includes('e') || s.includes('E')) return 0;
  return s.length - dot - 1;
}

/**
 * Nói được gì về độ chính xác của toạ độ nhận từ cửa công khai.
 *
 * ⚠️ Không có nhánh nào trả "chính xác". Máy chủ không gửi `expose_location` ra
 * cửa công khai, nên thứ duy nhất chứng minh được là **chưa bị làm tròn**. Màn
 * hình phải vẽ vùng chứ không vẽ ghim khi kết quả là `maybe_coarsened`.
 */
export function gpsPrecision(gps: ProvGps | undefined): GpsPrecision {
  if (!Array.isArray(gps) || gps.length < 2) return 'hidden';
  const [lat, lon] = gps;
  if (typeof lat !== 'number' || typeof lon !== 'number') return 'hidden';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'hidden';
  const d = Math.max(_decimals(lat), _decimals(lon));
  return d > COARSE_DECIMALS ? 'exact_not_coarsened' : 'maybe_coarsened';
}

/** Câu tiếng Việt đi kèm bản đồ. `null` = không có gì để nói (chưa đo được). */
export function gpsPrecisionLabelVi(p: GpsPrecision): string | null {
  if (p === 'hidden') return null;
  if (p === 'exact_not_coarsened') return 'Vị trí chính xác do chủ vườn công bố';
  return 'Vị trí chỉ tới vùng khoảng 100m — không phải toạ độ cây';
}

// ---------------------------------------------------------------------------
// Gọi mạng
// ---------------------------------------------------------------------------

function _netError(err: unknown): APIError {
  const isTimeout = err instanceof Error && err.name === 'AbortError';
  return {
    type: 'network_error',
    detail: isTimeout ? 'Quá hạn chờ máy chủ' : String(err),
    http_status: 0,
  };
}

/**
 * Gọi một cửa CÔNG KHAI. Không token, không `Authorization`.
 *
 * Trả `null` ở nhánh 404 để chỗ gọi tự dịch thành `not_public` — cửa này 404 là
 * câu trả lời, không phải lỗi.
 */
async function _publicGet<T>(url: string, attempt = 0): Promise<ApiResult<T> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.status === 404) return null;

    if (!resp.ok) {
      return {
        ok: false,
        error: {
          type: resp.status >= 500 ? 'server_error' : 'validation_error',
          detail: `HTTP ${resp.status}`,
          http_status: resp.status,
        },
      };
    }
    return { ok: true, data: (await resp.json()) as T };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isConn = err instanceof TypeError && !isTimeout;
    if (isConn && attempt === 0) return _publicGet<T>(url, 1);
    return { ok: false, error: _netError(err) };
  }
}

async function _authHeader(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

async function _authGet<T>(
  url: string,
  baseUrl: string,
  attempt = 0,
): Promise<ApiResult<T>> {
  await ensureOrilifeToken(baseUrl);
  const auth = await _authHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth) headers['Authorization'] = auth;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timer);

    if (resp.status === 401) {
      if (attempt === 0 && (await ensureOrilifeToken(baseUrl, { force: true }))) {
        return _authGet<T>(url, baseUrl, 1);
      }
      return {
        ok: false,
        error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 },
      };
    }

    if (resp.status === 403 || resp.status === 404 || resp.status === 422) {
      // Câu tiếng Việt của máy chủ ("Cây này không thuộc tài khoản của bạn.")
      // nói rõ hơn bất cứ câu nào app tự soạn. Giữ nguyên.
      const b = (await resp.json().catch(() => null)) as { detail?: unknown } | null;
      const detail =
        typeof b?.detail === 'string' ? b.detail : `Không đọc được (HTTP ${resp.status})`;
      return { ok: false, error: { type: 'validation_error', detail, http_status: resp.status } };
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status },
      };
    }
    return { ok: true, data: (await resp.json()) as T };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isConn = err instanceof TypeError && !isTimeout;
    if (isConn && attempt === 0) return _authGet<T>(url, baseUrl, 1);
    return { ok: false, error: _netError(err) };
  }
}

function _readProv(r: ApiResult<{ ok?: boolean; provenance?: Provenance }> | null): ProvenanceResult {
  if (r === null) return { kind: 'not_public' };
  if (!r.ok || !r.data) {
    return { kind: 'error', error: r.error ?? { type: 'server_error', detail: 'Không rõ', http_status: 0 } };
  }
  const p = r.data.provenance;
  if (!p || typeof p !== 'object') {
    // Máy chủ trả 200 mà không có hồ sơ ⇒ KHÔNG dựng một hồ sơ rỗng trông như thật.
    return {
      kind: 'error',
      error: { type: 'server_error', detail: 'Máy chủ trả 200 nhưng thiếu hồ sơ xuất xứ', http_status: 200 },
    };
  }
  return { kind: 'ok', provenance: p };
}

// ---------------------------------------------------------------------------
// Ba cửa
// ---------------------------------------------------------------------------

/**
 * Xuất xứ một cây theo `tree_id`. CÔNG KHAI — dùng được khi chưa đăng nhập.
 *
 * `not_public` = cây riêng tư HOẶC không có. Đừng viết câu nào khẳng định cây
 * không tồn tại.
 */
export async function getProvenance(
  baseUrl: string,
  treeId: string,
): Promise<ProvenanceResult> {
  const id = (treeId ?? '').trim();
  if (!id) {
    return {
      kind: 'error',
      error: { type: 'validation_error', detail: 'Thiếu mã cây', http_status: 0 },
    };
  }
  const r = await _publicGet<{ ok?: boolean; provenance?: Provenance }>(
    `${baseUrl}/api/provenance/${encodeURIComponent(id)}`,
  );
  return _readProv(r);
}

/**
 * Tra cây bằng MÃ in ra giấy / dán bảng vườn (`ORI-...`). CÔNG KHAI.
 *
 * Cùng luật 404 với `getProvenance`, và cùng bộ lọc `_public_prov` — nên trả về
 * đúng kiểu `Provenance`, không phải một kiểu riêng.
 */
export async function getTreeByCode(
  baseUrl: string,
  code: string,
): Promise<ProvenanceResult> {
  const c = (code ?? '').trim();
  if (!c) {
    return {
      kind: 'error',
      error: { type: 'validation_error', detail: 'Thiếu mã cây', http_status: 0 },
    };
  }
  const r = await _publicGet<{ ok?: boolean; provenance?: Provenance }>(
    `${baseUrl}/api/tree_by_code/${encodeURIComponent(c)}`,
  );
  return _readProv(r);
}

/**
 * Chi tiết một quả. CẦN đăng nhập, và chỉ chủ cây đọc được.
 *
 * 403 gộp *"quả của người khác"* với *"cây không có"* — cố ý, chống IDOR. Câu lỗi
 * giữ nguyên của máy chủ.
 */
export async function getFruitDetail(
  baseUrl: string,
  fruitId: string,
): Promise<FruitDetailResult> {
  const id = (fruitId ?? '').trim();
  if (!id) {
    return {
      kind: 'error',
      error: { type: 'validation_error', detail: 'Thiếu mã quả', http_status: 0 },
    };
  }
  const r = await _authGet<{ ok?: boolean; fruit?: FruitDetail }>(
    `${baseUrl}/api/fruit/${encodeURIComponent(id)}`,
    baseUrl,
  );
  if (r.ok && r.data) {
    const f = r.data.fruit;
    if (!f || typeof f !== 'object') {
      return {
        kind: 'error',
        error: { type: 'server_error', detail: 'Máy chủ trả 200 nhưng thiếu bản ghi quả', http_status: 200 },
      };
    }
    return { kind: 'ok', fruit: f };
  }
  const e = r.error ?? { type: 'server_error' as const, detail: 'Không rõ', http_status: 0 };
  if (e.http_status === 404) return { kind: 'not_found' };
  if (e.http_status === 403) return { kind: 'forbidden', detail: e.detail };
  return { kind: 'error', error: e };
}

// ---------------------------------------------------------------------------
// Đọc hồ sơ — mấy câu hỏi màn hình hay hỏi
// ---------------------------------------------------------------------------

/**
 * Cây này đã neo lên chuỗi chưa?
 *
 * Trả `null` khi máy chủ KHÔNG gửi trường `anchor` hoặc gửi thứ không đọc được —
 * "chưa neo" và "không biết" là hai câu khác nhau, và chỉ có câu thứ hai là đúng
 * khi ta không đo được.
 */
export function isAnchored(p: Provenance | null | undefined): boolean | null {
  const a = p?.anchor;
  if (!a || typeof a !== 'object') return null;
  const tx = (a as Record<string, unknown>)['tx_hash'] ?? (a as Record<string, unknown>)['txid'];
  if (typeof tx === 'string' && tx.trim().length > 0) return true;
  const st = (a as Record<string, unknown>)['status'];
  if (typeof st === 'string') return st === 'anchored' || st === 'confirmed';
  return null;
}

/**
 * Số ảnh làm bằng chứng. `null` khi máy chủ không gửi — màn hình hiện "—" chứ
 * không hiện số 0, vì 0 đọc thành "cây này chưa có ảnh nào".
 */
export function evidenceCount(p: Provenance | null | undefined): number | null {
  if (typeof p?.n_views === 'number' && Number.isFinite(p.n_views)) return p.n_views;
  if (Array.isArray(p?.images)) return p.images.length;
  return null;
}

/**
 * Đường xem một ảnh theo CID. `null` khi thiếu bất kỳ mảnh nào — nối chuỗi rỗng
 * ra một URL hỏng thì màn hình hiện ô ảnh vỡ, không ai biết vì sao.
 */
export function imageViewUrl(p: Provenance | null | undefined, cid?: string | null): string | null {
  const base = typeof p?.lampnet_view === 'string' ? p.lampnet_view.trim() : '';
  const c = typeof cid === 'string' ? cid.trim() : '';
  if (!base || !c) return null;
  return base.endsWith('/') ? `${base}${c}` : `${base}/${c}`;
}
