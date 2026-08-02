/**
 * treeReIDService — Tree ReID client cho React Native
 *
 * API: POST /api/identify, /api/enroll, /api/verify_add, GET /api/trees,
 *      POST /api/delete, POST /api/rename
 * Auth: Bearer token từ AsyncStorage key 'auth_token'
 * Timeout: 45s, retry 1 lần cho lỗi mạng (không retry 4xx)
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TreeDecision = 'MATCH' | 'UNCERTAIN' | 'NO_MATCH' | 'EMPTY_BUCKET' | 'MOVED';

export interface TreeCandidate {
  tree_id: string;
  name: string | null;
  code: string | null;
  sim: number;
  near_prev?: boolean;
  has3d?: boolean;
  anchor?: string | null;
}

export interface IdentifyFactors {
  CTX: number;
  PLANT: number;
  BASE: number;
  LEAF: number;
}

// Báo giá phí 3-bucket cho tác vụ identify — khai tập trung ở types/fee.ts.
import type { FeeQuote } from '../types/fee';
export type { FeeQuote };

/** Băng tin-cậy THÔ (không lộ điểm số) — PoC-Tree §4 M2. */
export type ConfidenceBand = 'cao' | 'vừa' | 'thấp';

export interface IdentifyResponse {
  ok: boolean;
  decision: TreeDecision;
  tree_id?: string;
  name?: string;
  code?: string;
  similarity: number;
  margin: number;
  factors: IdentifyFactors;
  warnings: string[];
  candidates: TreeCandidate[];
  moved_distance_m?: number;
  fee_quote?: FeeQuote;
  /**
   * ADDITIVE (Lợi PR #46): mã truy-vấn hex — GIỮ để gửi verdict.
   * Không có khi backend cũ → verdict UI ẩn.
   */
  query_id?: string;
  /** ADDITIVE (Lợi PR #46): băng tin-cậy thô (cao/vừa/thấp) — KHÔNG hiện điểm số. */
  confidence?: ConfidenceBand;
  /**
   * ADDITIVE: câu gợi ý hành-động do backend trả khi kết quả chưa chắc (vd
   * "đi vòng quanh cây, chụp thêm góc khác" / "kết quả chưa chắc, nhờ chủ vườn
   * xác nhận"). Hiện ở UNCERTAIN/NO_MATCH. Thiếu (backend cũ) → UI không hiện.
   * LƯU Ý: backend đôi khi trả OBJECT {message, channel, n_candidates} thay vì
   * string — UI phải coerce (ReidConfirmDialog) kẻo render object = crash React.
   */
  suggest?: string | { message?: string; channel?: string; n_candidates?: number };
  /**
   * ADDITIVE (B1/B2 owner_review): backend có CHO PHÉP tạo cây MỚI ở lần này
   * không. Thiếu/undefined (backend cũ) = true → GIỮ hành-vi cũ (cho tạo mới).
   * false → ẩn nút "Đăng ký cây mới" để chống tạo cây trùng khi cùng-loài mơ-hồ
   * (dải điểm sập, cần chủ vườn xác nhận trước).
   */
  allow_enroll_new?: boolean;
}

export interface EnrollResponse {
  ok: boolean;
  tree_id: string;
  n_views_added?: number;
  total_trees?: number;
  provenance?: {
    code?: string;
    has3d?: boolean;
    anchor?: string | null;
    record_cid?: string;
    record_hash?: string;
    lampnet_view?: string;
  };
}

export interface VerifyAddResponse {
  ok: boolean;
  added?: boolean;
  n_added?: number;
  total_trees?: number;
  reason?: string;
  per_image?: Array<{
    sim_chosen: number;
    sim_other: number;
    other_name?: string;
    ok: boolean;
  }>;
}

export interface TreeInfo {
  tree_id: string;
  name: string;
  n_views: number;
  has3d: boolean;
  anchor: string | null;
  /** Mã cây công khai (PROV.code) — field-reid trả kèm ở /api/trees. */
  code?: string | null;
  /** [lat, lon] hoặc null — field-reid GAL.list_trees. */
  gps?: [number, number] | null;
  species?: string | null;
}

export interface TreeListResponse {
  trees: TreeInfo[];
}

export interface APIError {
  type: 'network_error' | 'auth_error' | 'validation_error' | 'duplicate' | 'rate_limited' | 'server_error';
  detail: string;
  http_status: number;
  retry_after_seconds?: number;
  /** Mã lỗi máy chủ trả về (vd: 'duplicate_tree' | 'heterogeneous' | 'flat'). Ưu tiên dùng trường này thay vì phân tích chuỗi detail. */
  error_code?: string;
  /** Câu gợi ý hành-động từ backend (vd "hãy đi vòng quanh cây, chụp góc khác"). */
  reason?: string;
  /** tree_id của cây trùng — backend trả khi 409 duplicate_tree */
  existing_tree_id?: string;
}

/**
 * Đổi lỗi API (field-reid) thành câu tiếng Việt DỄ HIỂU cho nông dân — hiện thay vì
 * "lỗi" chung chung (Lỗi field #3). Ưu tiên `reason` (server đã trả câu gợi ý), rồi map
 * theo `error_code`, cuối cùng fallback `detail`.
 */
export function fieldErrorMessage(err?: APIError): string {
  if (!err) return 'Có lỗi xảy ra. Bạn thử lại nhé.';
  if (err.reason && err.reason.trim()) return err.reason;

  switch (err.error_code) {
    case 'flat':
      return 'Các góc chụp gần như giống nhau. Hãy ĐI VÒNG QUANH cây thật và chụp các góc khác nhau (đừng đứng yên một chỗ).';
    case 'heterogeneous':
      return 'Ảnh lẫn nhiều vật khác nhau — hãy chụp tập trung vào MỘT cây, cùng một thân.';
    case 'need_gps':
      return 'Cần bật định vị (GPS) để tạo/nhận diện cây. Hãy bật Vị trí rồi thử lại.';
    case 'duplicate_tree':
      return 'Cây này có thể đã được tạo trước đó.';
    default:
      break;
  }

  switch (err.type) {
    case 'network_error':
      return 'Mất kết nối mạng. Kiểm tra sóng/Wi-Fi rồi thử lại.';
    case 'auth_error':
      return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.';
    case 'rate_limited':
      return 'Thao tác quá nhanh. Chờ một chút rồi thử lại.';
    case 'server_error':
      return 'Máy chủ đang bận. Thử lại sau ít phút.';
    default:
      return err.detail || 'Có lỗi xảy ra. Bạn thử lại nhé.';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_TOKEN_KEY = 'auth_token';
// Timeout mặc-định cho request nhẹ (trees / verdict / delete).
const REQUEST_TIMEOUT_MS = 45_000;

// Timeout cho tác-vụ NẶNG ẢNH (identify / enroll / verify_add): upload 20–30+ ảnh
// rồi backend chạy match vỏ-thân (sift/xfeat/loftr) thường >45s → 45s bị AbortError.
// Nâng lên 120s để không tự huỷ giữa chừng. (Xem log: tree_identity_api_error =
// "AbortError: Aborted" đúng ~45s mỗi lần.)
const IMAGE_REQUEST_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Shared internal helper
// ---------------------------------------------------------------------------

async function _getAuthHeader(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

async function _apiCall<T>(
  url: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: FormData,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  attempt = 0,
): Promise<{ ok: boolean; data?: T; error?: APIError }> {
  const authHeader = await _getAuthHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutHandle);

    if (resp.status === 401) {
      return {
        ok: false,
        error: { type: 'auth_error', detail: 'Token hết hạn hoặc không hợp lệ', http_status: 401 },
      };
    }

    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      return {
        ok: false,
        error: {
          type: 'rate_limited',
          detail: 'Quá nhiều yêu cầu',
          http_status: 429,
          retry_after_seconds: retryAfter ? parseInt(retryAfter, 10) : 60,
        },
      };
    }

    if (resp.status === 409) {
      let detail = 'Trùng lặp';
      let errorCode: string | undefined;
      let existingTreeId: string | undefined;
      try {
        const body409 = await resp.json();
        detail = body409.detail ?? detail;
        errorCode = body409.code ?? undefined;
        existingTreeId = body409.existing_tree_id ?? undefined;
      } catch { /* bỏ qua */ }
      return {
        ok: false,
        error: { type: 'duplicate', detail, http_status: 409, error_code: errorCode, existing_tree_id: existingTreeId },
      };
    }

    if (resp.status === 400 || resp.status === 422) {
      let detail = 'Dữ liệu không hợp lệ';
      let errorCode: string | undefined;
      let reason: string | undefined;
      try {
        const body = await resp.json();
        detail = body.detail ?? detail;
        // Backend field-reid trả mã lỗi chất-lượng ảnh ở code/error_code + câu gợi ý ở reason.
        errorCode = body.code ?? body.error_code ?? undefined;
        reason = body.reason ?? undefined;
      } catch { /* bỏ qua */ }
      return {
        ok: false,
        error: { type: 'validation_error', detail, http_status: resp.status, error_code: errorCode, reason },
      };
    }

    if (resp.status >= 500) {
      return {
        ok: false,
        error: { type: 'server_error', detail: `Lỗi máy chủ: HTTP ${resp.status}`, http_status: resp.status },
      };
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status },
      };
    }

    const data = await resp.json() as T;
    return { ok: true, data };

  } catch (err: unknown) {
    clearTimeout(timeoutHandle);
    const isTimeoutErr = err instanceof Error && err.name === 'AbortError';
    const isConnErr = err instanceof TypeError && !isTimeoutErr;

    if (isConnErr && attempt === 0) {
      return _apiCall<T>(url, method, body, timeoutMs, 1);
    }

    return {
      ok: false,
      error: { type: 'network_error', detail: String(err), http_status: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Identify options
// ---------------------------------------------------------------------------

/** Matcher vỏ-thân (PoC-Tree §4 M4) — override ENV backend, CHỈ cho tester. */
export type ShellMatcher = 'sift' | 'xfeat' | 'loftr';

/**
 * Hướng máy lúc chụp MỘT ảnh. Mảng `captures` song song với `files[]` — khuôn này
 * lấy đúng theo tiền lệ `regions` của OriLife (`server.py:1710-1712`, xử bởi
 * `_parse_regions`), không đẻ hình dạng thứ hai. Ảnh nào không có số thì để `null`.
 *
 * Đơn vị (OriLife đề nghị 2026-07-29): `heading` độ [0,360), `pitch` độ [-90,90]
 * dương là ngẩng lên, `roll` độ [-180,180] dương là nghiêng phải.
 */
export interface CaptureOrientation {
  heading?: number | null;
  pitch?: number | null;
  roll?: number | null;
}

/**
 * Gốc quy chiếu của `heading` — gửi kèm để server lọc được, vì hai nền tảng KHÔNG
 * cùng gốc và app chưa sửa được điều đó:
 *   · `ios_true_or_magnetic` — `HeadingCaptureManager.swift:278` lấy `trueHeading`
 *     khi hợp lệ, ÂM THẦM rơi về `magneticHeading` khi không. Không phân biệt được
 *     từng mẫu ở tầng JS.
 *   · `android_magnetic` — `HeadingSensorReader.kt:27` đọc `TYPE_ROTATION_VECTOR`
 *     và KHÔNG cộng độ lệch từ (`GeomagneticField`), nên là Bắc TỪ.
 *
 * OriLife yêu cầu Bắc THẬT. App CHƯA đạt, và sửa là việc native (Thư) — đã báo.
 * Trong lúc đó thà khai đúng gốc quy chiếu còn hơn dán nhãn "true" cho số Bắc từ.
 */
export type HeadingRef = 'ios_true_or_magnetic' | 'android_magnetic';

export interface IdentifyOptions {
  lat?: number;
  lon?: number;
  acc?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  /** Hướng THEO TỪNG ẢNH, song song `files[]`. Có `captures` thì nó thắng cấp request. */
  captures?: CaptureOrientation[];
  /** Gốc quy chiếu của mọi con số heading trong lần gửi này. */
  headingRef?: HeadingRef;
  /** Khi true: bỏ qua kiểm tra trùng lặp, tạo cây mới bất kể. Dùng cho handleForceEnroll. */
  force?: boolean;
  /**
   * ADDITIVE (PoC-Tree §4 M4): ép matcher vỏ-thân (sift|xfeat|loftr) qua
   * ?matcher=. Mặc-định KHÔNG gửi → backend dùng đường ENV. Chỉ tester bật.
   */
  matcher?: ShellMatcher;
}

export type IdentifyVerdict = 'correct' | 'wrong' | 'other';

export interface IdentifyVerdictResponse {
  ok: boolean;
  query_id: string;
  verdict: IdentifyVerdict;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Gắn GPS + hướng máy vào form. Dùng chung cho identify / enroll / verify_add để ba
 * route không lệch nhau — trước đây enroll không gửi hướng nào, mà enroll lại chính
 * là nguồn dựng 3D, tức chỗ mất dữ liệu nặng nhất.
 *
 * Quy tắc bỏ trường (OriLife chốt): thiếu số thì **KHÔNG gửi khoá đó**. Đừng gửi
 * chuỗi rỗng, đừng gửi "null" — server ép kiểu không nổ nhưng nhật ký lưu rác.
 */
function appendGeoAndOrientation(form: FormData, options: IdentifyOptions): void {
  if (options.lat !== undefined) form.append('lat', String(options.lat));
  if (options.lon !== undefined) form.append('lon', String(options.lon));
  if (options.acc !== undefined) form.append('acc', String(options.acc));
  if (options.heading !== undefined) form.append('heading', String(options.heading));
  if (options.pitch !== undefined) form.append('pitch', String(options.pitch));
  if (options.roll !== undefined) form.append('roll', String(options.roll));
  if (options.headingRef) form.append('heading_ref', options.headingRef);

  // Chỉ gửi `captures` khi có ÍT NHẤT một ảnh có số thật — mảng toàn null chỉ làm
  // nặng request và làm nhật ký server bẩn thêm.
  if (options.captures?.length) {
    const anyReal = options.captures.some(
      c => c && (c.heading != null || c.pitch != null || c.roll != null),
    );
    if (anyReal) form.append('captures', JSON.stringify(options.captures));
  }
}

/** Dựng mảng `captures` từ ảnh native đã chụp (đã song song với `files[]`). */
export function toCaptureOrientations(
  caps: Array<{ heading?: number | null; pitch?: number | null; roll?: number | null }>,
): CaptureOrientation[] {
  return caps.map(c => ({
    heading: Number.isFinite(c?.heading as number) ? (c.heading as number) : null,
    pitch: Number.isFinite(c?.pitch as number) ? (c.pitch as number) : null,
    roll: Number.isFinite(c?.roll as number) ? (c.roll as number) : null,
  }));
}

/** Gốc quy chiếu heading của nền tảng đang chạy. Xem chú thích `HeadingRef`. */
export function platformHeadingRef(): HeadingRef {
  return Platform.OS === 'ios' ? 'ios_true_or_magnetic' : 'android_magnetic';
}

export async function identifyTree(
  baseUrl: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
): Promise<{ ok: boolean; data?: IdentifyResponse; error?: APIError }> {
  const form = new FormData();

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  appendGeoAndOrientation(form, options);
  form.append('source', 'phone');

  // M4: chỉ nối ?matcher= khi tester ép — mặc-định để backend dùng ENV.
  const qs = options.matcher ? `?matcher=${encodeURIComponent(options.matcher)}` : '';
  return _apiCall<IdentifyResponse>(`${baseUrl}/api/identify${qs}`, 'POST', form, IMAGE_REQUEST_TIMEOUT_MS);
}

/**
 * submitIdentifyVerdict — gửi phán-quyết người dùng cho 1 lần identify (PoC-Tree §4 M3).
 *
 * POST /api/identify_verdict (form): query_id (bắt-buộc), verdict (bắt-buộc),
 * correct_tid? (khi verdict='other', mã cây đúng lấy từ /api/trees).
 * Auth Bearer (qua _apiCall). Trả { ok, query_id, verdict }; 400 nếu thiếu/sai.
 */
export async function submitIdentifyVerdict(
  baseUrl: string,
  params: { queryId: string; verdict: IdentifyVerdict; correctTid?: string },
): Promise<{ ok: boolean; data?: IdentifyVerdictResponse; error?: APIError }> {
  const form = new FormData();
  form.append('query_id', params.queryId);
  form.append('verdict', params.verdict);
  if (params.correctTid) form.append('correct_tid', params.correctTid);

  return _apiCall<IdentifyVerdictResponse>(`${baseUrl}/api/identify_verdict`, 'POST', form);
}

export async function enrollTree(
  baseUrl: string,
  name: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
  farmId?: string,
): Promise<{ ok: boolean; data?: EnrollResponse; error?: APIError }> {
  const form = new FormData();

  form.append('name', name);
  form.append('source', 'phone');

  // Gắn cây vào vườn hiện-hành — nếu thiếu, backend gán farm_id=null và
  // /api/trees?farm_id=X sẽ lọc bỏ cây (cây không hiện trong vườn nào).
  if (farmId) form.append('farm_id', farmId);

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  appendGeoAndOrientation(form, options);
  if (options.force) form.append('force', 'true');

  return _apiCall<EnrollResponse>(`${baseUrl}/api/enroll`, 'POST', form, IMAGE_REQUEST_TIMEOUT_MS);
}

export async function verifyAddTree(
  baseUrl: string,
  treeId: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
): Promise<{ ok: boolean; data?: VerifyAddResponse; error?: APIError }> {
  const form = new FormData();

  form.append('tree_id', treeId);

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  // verify_add cũng nhận heading/pitch/roll (`server.py:1941`) — gộp ảnh vào cây đã
  // có mà không gửi hướng thì ảnh mới kém giá trị hơn ảnh cũ.
  appendGeoAndOrientation(form, options);

  return _apiCall<VerifyAddResponse>(`${baseUrl}/api/verify_add`, 'POST', form, IMAGE_REQUEST_TIMEOUT_MS);
}

export async function getTrees(
  baseUrl: string,
  farmId?: string,
): Promise<{ ok: boolean; trees?: TreeInfo[]; error?: APIError }> {
  // Lọc theo vườn khi có farm_id (contract field-reid: GET /api/trees?farm_id=X).
  const qs = farmId ? `?farm_id=${encodeURIComponent(farmId)}` : '';
  const result = await _apiCall<TreeListResponse>(`${baseUrl}/api/trees${qs}`, 'GET');
  if (result.ok && result.data) {
    return { ok: true, trees: result.data.trees };
  }
  return { ok: false, error: result.error };
}

/**
 * Map TreeInfo (field-reid) → shape mà UI/Redux farmSlice kỳ-vọng (Tree-like).
 *
 * Vì cây giờ đến TỪ field-reid, cờ 3D phải vào ĐÚNG field UI đọc.
 * TreeCard (FarmDetailScreen) gate chip "Xem 3D" theo:
 *   item.has_3d ?? item.has3DModel ?? item.latest_mesh_cid ?? item.meshCid
 * → ta đặt `has_3d` = field-reid `has3d`. Sửa lỗi cũ "chip 3D không bao giờ
 *   hiện vì cây đến từ Lợi" (Lợi không trả cờ 3D).
 *
 * gps field-reid là [lat, lon] → tách ra latitude/longitude cho dedup GPS + map.
 */
export function mapTreeInfoToUI(t: TreeInfo, farmId: string): any {
  const gps = Array.isArray(t.gps) && t.gps.length >= 2 ? t.gps : null;
  return {
    id: t.tree_id,
    farmId,
    code: t.code ?? t.tree_id,
    name: t.name,
    farmer_name: t.name,
    species: t.species ?? undefined,
    latitude: gps ? gps[0] : undefined,
    longitude: gps ? gps[1] : undefined,
    images: [],
    estimatedFruits: 0,
    fruitCount: 0,
    // Cờ 3D field-reid → field UI đang đọc (làm sáng chip "Xem 3D").
    has_3d: !!t.has3d,
    anchor: t.anchor ?? null,
    n_views: t.n_views,
  };
}

export async function deleteTree(
  baseUrl: string,
  treeId: string,
): Promise<{ ok: boolean; error?: APIError }> {
  const form = new FormData();
  form.append('tree_id', treeId);

  const result = await _apiCall<{ ok: boolean }>(`${baseUrl}/api/delete`, 'POST', form);
  return { ok: result.ok, error: result.error };
}

export async function renameTree(
  baseUrl: string,
  treeId: string,
  name: string,
): Promise<{ ok: boolean; error?: APIError }> {
  const form = new FormData();
  form.append('tree_id', treeId);
  form.append('name', name);

  const result = await _apiCall<{ ok: boolean }>(`${baseUrl}/api/rename`, 'POST', form);
  return { ok: result.ok, error: result.error };
}
