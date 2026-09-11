/**
 * fruitReIDService — client cho luồng QUẢ + SPECIES + SƠ-ĐỒ 3D (field-reid)
 *
 * Backend = field-reid (ORILIFE_API_BASE_URL, mặc định https://api.orilife.io) —
 * cùng máy chủ với treeReIDService. Tách file riêng để KHÔNG đụng treeReIDService
 * (tệp đang có nhánh sửa song song). Cùng pattern: Bearer token AsyncStorage, timeout 45s, retry 1 lần.
 *
 * API: GET /api/species/catalog · POST /api/tree/set_species · POST /api/fruit/detect ·
 *      POST /api/fruit/candidates · POST /api/fruit/identify · POST /api/fruit/enroll ·
 *      POST /api/fruit/add_view · POST /api/fruit/identify_verdict ·
 *      GET /api/fruit/list · GET /api/fruit/{id}/views ·
 *      GET /api/tree/{id}/layout · GET /api/farm/layout · POST /api/tree/marker
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';
import { canResendAfterNetworkError } from './resendPolicy';

/**
 * Cửa POST GỬI LẠI ĐƯỢC sau lỗi mạng. Luật + lý do đầy đủ ở `resendPolicy.ts`.
 *
 * Vắng mặt CỐ Ý: `/api/fruit/enroll` (TẠO quả) và `/api/fruit/add_view` (bổ-sung
 * góc cho quả). Đường quả nhạy hơn đường cây: ở ngưỡng đang chạy, hai quả KHÁC
 * NHAU trên cùng một cây bị nhận là một tới 73% số cặp — thêm một bản ghi thừa vào
 * đó là làm hỏng chính chữ ký đang dùng để phân biệt chúng.
 */
export const RESENDABLE_POST = [
  '/api/fruit/detect',            // đọc — dò vùng quả trong ảnh
  '/api/fruit/candidates',        // đọc — so khớp
  '/api/fruit/identify',          // đọc — so khớp
  '/api/fruit/identify_verdict',  // nhãn đo, khoá theo `query_id`
] as const;

// ---------------------------------------------------------------------------
// Types — khớp ĐÚNG response field-reid (server.py)
// ---------------------------------------------------------------------------

export interface APIError {
  type: 'auth_error' | 'rate_limited' | 'duplicate' | 'validation_error' | 'server_error' | 'network_error';
  detail: string;
  http_status: number;
  retry_after_seconds?: number;
}

export type ApiResult<T> = { ok: boolean; data?: T; error?: APIError };

/** bbox px ẢNH GỐC [x, y, w, h]. */
export type Bbox = [number, number, number, number];
export type FruitShape = 'rect' | 'circle' | 'ellipse' | 'polygon';
export type FruitStatus = 'on_tree' | 'harvested' | 'lost';
export type TreeZone = 'base' | 'mid' | 'canopy';

export interface SpeciesEntry {
  id: string;
  name_vi: string;
  has_fruit: boolean;
  products: string[];
  primary_product?: string;
  parts_schema?: string[];
}
export interface SpeciesCatalog {
  ok?: boolean;
  species: SpeciesEntry[];
  activities?: Array<{ id: string; ns: string; name_vi: string; archetype: string }>;
  product_vocab?: Record<string, string>;
  error?: string;
}

export interface FruitDetection { bbox: Bbox; centroid?: [number, number]; confidence?: number }
export interface FruitDetectResponse {
  ok: boolean;
  detections?: FruitDetection[];
  reason?: 'species_no_fruit';
  species?: string | null;
  products?: string[];
}

export interface FruitCandidate {
  fruit_id: string;
  name: string | null;
  n_views: number;
  thumbnail_url: string | null;
  bbox: Bbox | null;
}
export interface FruitCandidatesResponse {
  ok: boolean;
  n: number;
  candidates: FruitCandidate[];
  /**
   * "Đã kiểm phạm vi" — khẳng định, KHÔNG phải `error: null`. Vắng mặt =
   * **chưa biết** (bản máy chủ cũ), KHÔNG được đọc thành "đã kiểm và rỗng".
   * OriLife nhận nguyên đề nghị này 11/08; prod hôm đó còn chậm 18 lần gộp nên
   * trường này sẽ `undefined` một thời gian nữa. Đừng suy ra gì từ chỗ vắng.
   */
  scope_checked?: boolean;
  query_id?: string;
  message?: string;
}

/**
 * Phán quyết của máy soi quả. CÙNG bộ nhãn với cây (`TreeDecision`) nhưng là
 * đường KHÁC — quả có ngưỡng riêng và độ tin cậy thấp hơn cây nhiều.
 */
export type FruitDecision = 'MATCH' | 'UNCERTAIN' | 'NO_MATCH' | 'EMPTY_BUCKET';

/**
 * Ứng viên của cửa `identify` — soi TOÀN VƯỜN nên có thể kèm cây.
 *
 * `tree_id`/`tree_name` để TUỲ CHỌN vì hợp đồng bàn giao (07/17) chỉ chốt
 * `query_id + decision + confidence`, chưa chốt hình dạng phần tử. Thiếu thì
 * bên này tự tra cây bằng `GET /api/fruit/list` (xem `features/fruitFind`) chứ
 * KHÔNG đoán — nói "quả này của cây X" mà không có cơ sở là hồ sơ sai vĩnh viễn.
 */
export interface IdentifiedFruitCandidate extends FruitCandidate {
  status?: FruitStatus;
  score?: number;
  tree_id?: string;
  tree_name?: string | null;
}

/**
 * Soi MỘT quả lạ ra tên — cửa duy nhất không cần biết cây trước.
 *
 * ⚠ `decision` KHÔNG PHẢI CÂU TRẢ LỜI. Đo trên prod của OriLife: hệ nói `MATCH`
 * thì đúng **19/37 = 51,4%**, và ở ngưỡng đang chạy nó nhận nhầm **73% (412/564)**
 * cặp quả KHÁC NHAU trên cùng một cây — hai quả khác nhau cùng cây trông giống
 * nhau hơn là cùng một quả chụp hai lần. Chỉ `rank-5` (0,92–0,95) là con số dùng
 * được. Vì vậy màn hình PHẢI là bộ CHỌN top-5, và tuyệt đối không có dấu tích
 * xanh cho `MATCH`. Nguồn: thư OriLife 08/08 §1 + 07/08 §4.
 */
export interface FruitIdentifyResponse {
  ok: boolean;
  /** Neo của lượt soi này. CHỈ cửa `identify` sinh ra nó — `candidates` thì không. */
  query_id?: string;
  decision?: FruitDecision;
  confidence?: number;
  /**
   * Danh sách để nông dân TỰ CHỌN. Bản máy chủ cũ chỉ dựng khi
   * `decision === 'UNCERTAIN'` nên ca `MATCH` trả về rỗng; PR #291 cho luôn có.
   * Prod chạy sau nhiều lần gộp, nên phải chịu được CẢ HAI: rỗng thì nói thẳng
   * là chưa chọn được, đừng lấy `decision` lấp vào chỗ trống.
   */
  candidates?: IdentifiedFruitCandidate[];
  /** Câu tiếng Việt máy chủ đặt cho nông dân. HIỆN THẲNG, đừng tự dịch lại. */
  message?: string;
}

/**
 * MẶT nào của quả. OriLife bàn giao 07/08: 54/54 góc đã lưu đều KHÔNG có trường
 * này, nên máy chủ đem mặt đáy so với góc hông rồi kết luận "không phải quả này"
 * — gốc của việc cổng bồi góc chặn oan 30/32 lượt. Gửi từ ngày đầu, đừng bổ sung
 * sau: góc đã lưu thiếu trường thì không suy ngược lại được.
 */
export type FruitViewType = 'bottom' | 'stem' | 'side' | 'context';

export interface FruitEnrollResponse {
  ok: boolean;
  fruit_id?: string;
  name?: string;
  n_fruits_in_tree?: number;
  duplicate?: boolean;
  similar?: { fruit_id?: string; name?: string };
  /** Câu tiếng Việt máy chủ đặt cho nông dân. HIỆN THẲNG, đừng tự dịch lại. */
  message?: string;
}
export interface FruitAddViewResponse {
  ok: boolean;
  fruit_id?: string;
  n_views?: number;
  warn?: 'better_other' | 'low_self' | null;
  /** ĐỐI TƯỢNG, không phải chuỗi — `best_other_sim` mới là số. */
  best_other?: { fruit_id: string; name: string } | null;
  /** Câu tiếng Việt máy chủ đặt cho nông dân. HIỆN THẲNG, đừng tự dịch lại. */
  message?: string;
}

/** Nông dân phán "đúng quả / không phải" → dữ liệu hiệu-chỉnh cho OriLife. */
export interface FruitVerdictResponse { ok: boolean; message?: string }

/**
 * Kết-cục THẬT của một lời gọi. Có BA, không phải hai.
 *
 * Cờ `ok` ở vỏ `ApiResult` là tầng VẬN CHUYỂN — mọi HTTP 200 đều `ok: true`.
 * Nhưng máy chủ quả từ chối bằng **HTTP 200 kèm `{ok: false, …}`** (cổng bồi góc
 * ở `add_view`, và cổng trùng ở `enroll` qua 409 được `_apiCall` chuyển thành
 * `{ok:true, data}` cố ý để caller đọc cờ). Viết `if (r.ok) xong()` là bỏ qua
 * đúng ca máy chủ nói không — màn tự đóng như đã lưu, dữ-liệu không hề vào kho.
 */
export type ApiOutcome = 'failed' | 'needs_confirm' | 'ok';

/**
 * Ép hai tầng cờ về ba nhánh tường-minh. Dùng ở MỌI nơi đọc kết quả quả — đừng
 * viết lại điều-kiện tại chỗ.
 *
 * `data` vắng mặt mà tầng vận-chuyển xanh thì coi là `ok`: một số endpoint trả
 * thân rỗng. Chỉ `data.ok === false` (so sánh NGHIÊM) mới là máy chủ từ chối;
 * `undefined` không phải `false`.
 */
export function outcomeOf<T extends { ok?: boolean }>(r: ApiResult<T>): ApiOutcome {
  if (!r.ok) return 'failed';
  if (r.data && r.data.ok === false) return 'needs_confirm';
  return 'ok';
}

export interface FruitListItem {
  fruit_id: string;
  tree_id: string;
  name: string | null;
  status: FruitStatus;
  enrolled_at: string;
  n_views: number;
  thumbnail_url: string | null;
  bbox: Bbox | null;
}
export interface FruitListResponse { ok: boolean; count: number; fruits: FruitListItem[] }

export interface FruitView { url: string | null; enrolled_at: string; bbox: Bbox | null }
export interface FruitViewsResponse { fruit_id: string; n: number; views: FruitView[] }

export interface TreeLayoutFruit {
  fruit_id: string; name: string | null; status: FruitStatus; n_views: number;
  /** pos_x / pos_h / pos_z đều 0..1 (server `_clean_pos` kẹp về dải này). */
  zone: TreeZone | null; pos_x: number | null; pos_h: number | null;
  /** Trục SÂU. null = quả đăng ký TRƯỚC khi có trục sâu → chưa đặt, đừng bịa số. */
  pos_z: number | null;
  thumbnail_url: string | null; bbox: Bbox | null; enrolled_at: string;
}
export interface TreeMarker { label: string; side: 'left' | 'right' | 'front' | 'back' }
export interface TreeLayoutResponse {
  ok: boolean;
  tree: { tree_id: string; name: string | null; species: string | null };
  stats: { total: number; on_tree: number; harvested: number; lost: number; named: number };
  fruits: TreeLayoutFruit[];
  markers: TreeMarker[];
}

export interface FarmTree {
  tree_id: string; name: string | null; species: string | null;
  gps: [number, number] | null; x_m: number | null; y_m: number | null;
  n_fruits: number; named_fruits: number;
}
export interface FarmLayoutResponse {
  ok: boolean;
  center: { lat: number; lon: number } | null;
  trees: FarmTree[];
}

/** Vùng khoanh quả (cropper): bbox bắt buộc; shape/points tuỳ chọn (vẽ tròn/elip/đa-giác). */
export interface FruitRegion { bbox: Bbox; shape?: FruitShape; points?: Array<[number, number]> }

// ---------------------------------------------------------------------------
// Shared helper (bản sao gọn của treeReIDService — giữ cô lập, không phá file kia)
// ---------------------------------------------------------------------------

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 45_000;

async function _authHeader(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/** Base máy-chủ từ URL endpoint (`https://x/api/y` → `https://x`) — để ký lại token đúng chỗ. */
function _baseOf(url: string): string {
  const i = url.indexOf('/api/');
  return i > 0 ? url.slice(0, i) : url;
}

async function _apiCall<T>(
  url: string,
  method: 'GET' | 'POST',
  body?: FormData,
  attempt = 0,
): Promise<ApiResult<T>> {
  // Chưa có token (mở app xong vào THẲNG luồng quả, chưa qua màn nào ký DID) →
  // tự ký bằng DID trước khi gọi. Không có bước này thì mọi endpoint quả trả 401
  // "Phiên hết hạn" oan — cùng lỗi đã sửa ở farmSlice/FarmDetailScreen.
  await ensureOrilifeToken(_baseOf(url));
  const auth = await _authHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth) headers['Authorization'] = auth;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { method, headers, body: body ?? undefined, signal: controller.signal });
    clearTimeout(timer);

    if (resp.status === 401) {
      // Token hết hạn → ký lại bằng DID 1 lần rồi thử lại (khớp cách farmSlice xử lý).
      if (attempt === 0 && (await ensureOrilifeToken(_baseOf(url), { force: true }))) {
        return _apiCall<T>(url, method, body, 1);
      }
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 429) {
      const ra = resp.headers.get('Retry-After');
      return { ok: false, error: { type: 'rate_limited', detail: 'Quá nhiều yêu cầu', http_status: 429, retry_after_seconds: ra ? parseInt(ra, 10) : 60 } };
    }
    // 409 (trùng quả) + 4xx khác: TRẢ data để caller đọc cờ (duplicate/warn) thay vì coi là lỗi cứng.
    if (resp.status === 409) {
      try { return { ok: true, data: (await resp.json()) as T }; } catch { /* ignore */ }
      return { ok: false, error: { type: 'duplicate', detail: 'Trùng', http_status: 409 } };
    }
    if (resp.status === 422) {
      let detail = 'Dữ liệu không hợp lệ';
      try { detail = (await resp.json()).detail ?? detail; } catch { /* ignore */ }
      return { ok: false, error: { type: 'validation_error', detail, http_status: 422 } };
    }
    if (resp.status >= 500) return { ok: false, error: { type: 'server_error', detail: `Lỗi máy chủ HTTP ${resp.status}`, http_status: resp.status } };
    if (!resp.ok) return { ok: false, error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status } };

    return { ok: true, data: (await resp.json()) as T };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isConn = err instanceof TypeError && !isTimeout;
    if (isConn && attempt === 0 && canResendAfterNetworkError(url, method, RESENDABLE_POST)) {
      return _apiCall<T>(url, method, body, 1);
    }
    return { ok: false, error: { type: 'network_error', detail: String(err), http_status: 0 } };
  }
}

/** Gắn ảnh + vùng khoanh (bbox/shape/points) vào FormData (dùng chung enroll/add_view/candidates). */
function _appendImageRegion(form: FormData, imagePath: string, region?: FruitRegion): void {
  (form as unknown as { append: (k: string, v: unknown) => void }).append(
    'file', { uri: imagePath, type: 'image/jpeg', name: 'fruit.jpg' });
  if (region) {
    form.append('bbox_x', String(region.bbox[0]));
    form.append('bbox_y', String(region.bbox[1]));
    form.append('bbox_w', String(region.bbox[2]));
    form.append('bbox_h', String(region.bbox[3]));
    if (region.shape) form.append('shape', region.shape);
    if (region.points) form.append('points', JSON.stringify(region.points));
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Danh mục loài + hoạt động (gate UI theo loài). Không cần auth. */
export function getSpeciesCatalog(baseUrl: string): Promise<ApiResult<SpeciesCatalog>> {
  return _apiCall<SpeciesCatalog>(`${baseUrl}/api/species/catalog`, 'GET');
}

/** Gán/đổi loài cho cây (ẩn nút quả loài không-quả). species rỗng → bỏ loài. */
export function setTreeSpecies(baseUrl: string, treeId: string, species: string | null): Promise<ApiResult<{ ok: boolean; tree_id: string; species: string | null }>> {
  const form = new FormData();
  form.append('tree_id', treeId);
  if (species) form.append('species', species);
  return _apiCall(`${baseUrl}/api/tree/set_species`, 'POST', form);
}

/** Tự phát hiện quả trên 1 ảnh. tree_id → cổng theo loài (loài không-quả trả species_no_fruit). */
export function detectFruit(baseUrl: string, imagePath: string, treeId: string): Promise<ApiResult<FruitDetectResponse>> {
  const form = new FormData();
  (form as unknown as { append: (k: string, v: unknown) => void }).append('file', { uri: imagePath, type: 'image/jpeg', name: 'scan.jpg' });
  form.append('tree_id', treeId);
  return _apiCall<FruitDetectResponse>(`${baseUrl}/api/fruit/detect`, 'POST', form);
}

/** Quả ỨNG-VIÊN của cây, xếp giống-nhất trước (trả ĐỦ, để chọn theo tên/ảnh). */
export function fruitCandidates(baseUrl: string, treeId: string, imagePath: string, region: FruitRegion): Promise<ApiResult<FruitCandidatesResponse>> {
  const form = new FormData();
  form.append('tree_id', treeId);
  _appendImageRegion(form, imagePath, region);
  return _apiCall<FruitCandidatesResponse>(`${baseUrl}/api/fruit/candidates`, 'POST', form);
}

/**
 * Lưu quả MỚI. allowDup=true để vẫn lưu khi trùng (sau xác nhận).
 *
 * posZ = trục SÂU 0..1. BỎ TRỐNG khi người dùng chưa thật sự đặt độ sâu — máy chủ
 * chỉ ghi pos_z khi nhận được, nên vắng mặt = "chưa đặt", còn gửi bừa 0.5 thì quả
 * bị đóng dấu là đã-đặt-ở-giữa và không ai còn phân biệt được nữa.
 */
export function enrollFruit(baseUrl: string, treeId: string, name: string, imagePath: string, region: FruitRegion, opts?: { allowDup?: boolean; zone?: TreeZone; posX?: number; posH?: number; posZ?: number; viewType?: FruitViewType; capture?: string }): Promise<ApiResult<FruitEnrollResponse>> {
  const form = new FormData();
  form.append('tree_id', treeId);
  form.append('name', name);
  _appendImageRegion(form, imagePath, region);
  if (opts?.capture) form.append('capture', opts.capture);
  if (opts?.allowDup) form.append('allow_dup', '1');
  if (opts?.zone) form.append('zone', opts.zone);
  if (opts?.posX !== undefined) form.append('pos_x', String(opts.posX));
  if (opts?.posH !== undefined) form.append('pos_h', String(opts.posH));
  if (opts?.posZ !== undefined) form.append('pos_z', String(opts.posZ));
  if (opts?.viewType) form.append('view_type', opts.viewType);
  return _apiCall<FruitEnrollResponse>(`${baseUrl}/api/fruit/enroll`, 'POST', form);
}

/**
 * Thêm GÓC vào quả đã có. allowMismatch=true để ép thêm khi backend cảnh báo nhồi-nhầm.
 *
 * zone/posX/posH/posZ: máy chủ CHỈ cập nhật trường nào được truyền. Bỏ trống →
 * giữ nguyên giá trị cũ. Nên đừng gửi posZ khi lần này người dùng không đặt lại
 * độ sâu: gửi = ghi đè mất độ sâu họ đã đặt lần trước.
 */
export function addFruitView(baseUrl: string, fruitId: string, imagePath: string, region: FruitRegion, opts?: { allowMismatch?: boolean; zone?: TreeZone; posX?: number; posH?: number; posZ?: number; viewType?: FruitViewType; capture?: string }): Promise<ApiResult<FruitAddViewResponse>> {
  const form = new FormData();
  form.append('fruit_id', fruitId);
  _appendImageRegion(form, imagePath, region);
  if (opts?.capture) form.append('capture', opts.capture);
  if (opts?.allowMismatch) form.append('allow_mismatch', '1');
  if (opts?.zone) form.append('zone', opts.zone);
  if (opts?.posX !== undefined) form.append('pos_x', String(opts.posX));
  if (opts?.posH !== undefined) form.append('pos_h', String(opts.posH));
  if (opts?.posZ !== undefined) form.append('pos_z', String(opts.posZ));
  if (opts?.viewType) form.append('view_type', opts.viewType);
  return _apiCall<FruitAddViewResponse>(`${baseUrl}/api/fruit/add_view`, 'POST', form);
}

/**
 * Soi 1 quả lạ ra tên, KHÔNG cần biết cây trước — đây là "quét quả → ra cây".
 *
 * Bắt buộc `file`. Tuỳ chọn `tree_id` (thu hẹp về 1 cây), `lat`/`lon` (thu hẹp
 * theo chỗ đứng). Hợp đồng: thư OriLife 17/07 §bảng cửa quả.
 *
 * GỬI KÈM GPS KHI CÓ. Người cầm quả đang đứng ngay gốc cây; toạ-độ là tín hiệu
 * thu hẹp mạnh nhất mà bên này có, và nó miễn phí. Bỏ trống thì máy phải so với
 * toàn kho — đúng ca mà tỉ lệ nhận nhầm 73% cắn mạnh nhất.
 *
 * Xem `FruitIdentifyResponse` về việc vì sao `decision` KHÔNG được hiện như câu
 * trả lời cuối.
 */
export function identifyFruit(
  baseUrl: string,
  imagePath: string,
  opts?: { treeId?: string; lat?: number; lon?: number; region?: FruitRegion },
): Promise<ApiResult<FruitIdentifyResponse>> {
  const form = new FormData();
  _appendImageRegion(form, imagePath, opts?.region);
  if (opts?.treeId) form.append('tree_id', opts.treeId);
  if (opts?.lat !== undefined) form.append('lat', String(opts.lat));
  if (opts?.lon !== undefined) form.append('lon', String(opts.lon));
  return _apiCall<FruitIdentifyResponse>(`${baseUrl}/api/fruit/identify`, 'POST', form);
}

/** Nông dân phán quả máy đoán có đúng không. `other` = không phải quả nào máy đưa. */
export type FruitVerdict = 'correct' | 'wrong' | 'other';

/**
 * Nông dân phán quả máy đoán có ĐÚNG không.
 *
 * OriLife nói thẳng đây là thứ giá-trị nhất bên này có thể cho họ: không có nhãn
 * đúng/sai thì 100 nông dân nhập xong vẫn không hiệu-chỉnh được gì — mọi ngưỡng
 * bên đó còn mang nhãn `[CẦN CALIBRATE từ ≥50 quả thực địa]`.
 *
 * Cửa này ĐÃ được nối: `src/screens/FruitScanScreen.tsx:279` gọi tới sau khi
 * nông dân bấm phán quyết. (Chú thích cũ ở đây ghi "0 lượt gọi" — số đó đúng lúc
 * viết, đã sai từ lúc màn hình nối vào; sửa 2026-09-08.)
 *
 * ⚠ NEO LÀ `query_id`, KHÔNG PHẢI `fruit_id`. Bản trước gửi
 * `fruit_id + correct + actual_fruit_id` — hợp đồng thật KHÔNG CÓ tham số nào
 * trong ba cái đó (thư OriLife 10/08 §2, nguyên văn: *"Không có tham số
 * `fruit_id`"*). `query_id` đã neo sẵn *cái máy nói*, app chỉ gửi *cái người
 * nói*; máy chủ tự ghép. Hàm cũ chưa có nơi nào gọi nên chưa gây hại — nhưng
 * gọi là 422.
 *
 * `query_id` CHỈ sinh ra ở `/api/fruit/identify`. Đi vào bằng
 * `/api/fruit/candidates` thì chưa có neo để gửi phán quyết (bên OriLife hứa
 * thêm, chưa lên prod) — lúc đó ĐỪNG hiện nút phán quyết chứ đừng bịa neo.
 *
 * Đường CÂY đã có sẵn ở `treeReIDService.ts` (`/api/identify_verdict`); đây là
 * đường QUẢ, tách riêng vì endpoint khác.
 */
export function fruitIdentifyVerdict(
  baseUrl: string,
  queryId: string,
  verdict: FruitVerdict,
  opts?: { correctFruitId?: string },
): Promise<ApiResult<FruitVerdictResponse>> {
  const form = new FormData();
  form.append('query_id', queryId);
  form.append('verdict', verdict);
  if (opts?.correctFruitId) form.append('correct_fruit_id', opts.correctFruitId);
  return _apiCall<FruitVerdictResponse>(`${baseUrl}/api/fruit/identify_verdict`, 'POST', form);
}

/** Danh sách quả của cây (thumbnail + bbox). */
export function listFruits(baseUrl: string, treeId: string): Promise<ApiResult<FruitListResponse>> {
  return _apiCall<FruitListResponse>(`${baseUrl}/api/fruit/list?tree_id=${encodeURIComponent(treeId)}`, 'GET');
}

/** Các góc (timeline ảnh) của 1 quả. */
export function getFruitViews(baseUrl: string, fruitId: string): Promise<ApiResult<FruitViewsResponse>> {
  return _apiCall<FruitViewsResponse>(`${baseUrl}/api/fruit/${encodeURIComponent(fruitId)}/views`, 'GET');
}

/** Sơ-đồ KHÔNG-GIAN quả trên cây (tree-view 2.5D). */
export function getTreeLayout(baseUrl: string, treeId: string): Promise<ApiResult<TreeLayoutResponse>> {
  return _apiCall<TreeLayoutResponse>(`${baseUrl}/api/tree/${encodeURIComponent(treeId)}/layout`, 'GET');
}

/** Bản-đồ vườn (farm-map): cây chiếu ra mét quanh tâm. */
export function getFarmLayout(baseUrl: string): Promise<ApiResult<FarmLayoutResponse>> {
  return _apiCall<FarmLayoutResponse>(`${baseUrl}/api/farm/layout`, 'GET');
}

/** Thêm mốc ngữ-cảnh quanh cây (bồn xanh • trái…). */
export function addTreeMarker(baseUrl: string, treeId: string, label: string, side: TreeMarker['side']): Promise<ApiResult<{ ok: boolean; markers: TreeMarker[] }>> {
  const form = new FormData();
  form.append('tree_id', treeId);
  form.append('label', label);
  form.append('side', side);
  return _apiCall(`${baseUrl}/api/tree/marker`, 'POST', form);
}
