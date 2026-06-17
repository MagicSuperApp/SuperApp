/**
 * fruitReIDService — client cho luồng QUẢ + SPECIES + SƠ-ĐỒ 3D (field-reid)
 *
 * Backend = field-reid (ORILIFE_API_BASE_URL, mặc định https://test.orilife.io) —
 * cùng máy chủ với treeReIDService. Tách file riêng để KHÔNG đụng treeReIDService
 * (file Thư đang build). Cùng pattern: Bearer token AsyncStorage, timeout 45s, retry 1 lần.
 *
 * API: GET /api/species/catalog · POST /api/tree/set_species · POST /api/fruit/detect ·
 *      POST /api/fruit/candidates · POST /api/fruit/enroll · POST /api/fruit/add_view ·
 *      GET /api/fruit/list · GET /api/fruit/{id}/views ·
 *      GET /api/tree/{id}/layout · GET /api/farm/layout · POST /api/tree/marker
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

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
export interface FruitCandidatesResponse { ok: boolean; n: number; candidates: FruitCandidate[] }

export interface FruitEnrollResponse {
  ok: boolean;
  fruit_id?: string;
  name?: string;
  n_fruits_in_tree?: number;
  duplicate?: boolean;
  similar?: { fruit_id?: string; name?: string };
}
export interface FruitAddViewResponse {
  ok: boolean;
  fruit_id?: string;
  n_views?: number;
  warn?: 'better_other' | 'low_self' | null;
  best_other?: { fruit_id: string; name: string } | null;
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
  zone: TreeZone | null; pos_x: number | null; pos_h: number | null;
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

async function _apiCall<T>(
  url: string,
  method: 'GET' | 'POST',
  body?: FormData,
  attempt = 0,
): Promise<ApiResult<T>> {
  const auth = await _authHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth) headers['Authorization'] = auth;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { method, headers, body: body ?? undefined, signal: controller.signal });
    clearTimeout(timer);

    if (resp.status === 401) return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
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
    if (isConn && attempt === 0) return _apiCall<T>(url, method, body, 1);
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

/** Lưu quả MỚI. allowDup=true để vẫn lưu khi trùng (sau xác nhận). */
export function enrollFruit(baseUrl: string, treeId: string, name: string, imagePath: string, region: FruitRegion, opts?: { allowDup?: boolean; zone?: TreeZone; posX?: number; posH?: number }): Promise<ApiResult<FruitEnrollResponse>> {
  const form = new FormData();
  form.append('tree_id', treeId);
  form.append('name', name);
  _appendImageRegion(form, imagePath, region);
  if (opts?.allowDup) form.append('allow_dup', '1');
  if (opts?.zone) form.append('zone', opts.zone);
  if (opts?.posX !== undefined) form.append('pos_x', String(opts.posX));
  if (opts?.posH !== undefined) form.append('pos_h', String(opts.posH));
  return _apiCall<FruitEnrollResponse>(`${baseUrl}/api/fruit/enroll`, 'POST', form);
}

/** Thêm GÓC vào quả đã có. allowMismatch=true để ép thêm khi backend cảnh báo nhồi-nhầm. */
export function addFruitView(baseUrl: string, fruitId: string, imagePath: string, region: FruitRegion, opts?: { allowMismatch?: boolean; zone?: TreeZone; posX?: number; posH?: number }): Promise<ApiResult<FruitAddViewResponse>> {
  const form = new FormData();
  form.append('fruit_id', fruitId);
  _appendImageRegion(form, imagePath, region);
  if (opts?.allowMismatch) form.append('allow_mismatch', '1');
  if (opts?.zone) form.append('zone', opts.zone);
  if (opts?.posX !== undefined) form.append('pos_x', String(opts.posX));
  if (opts?.posH !== undefined) form.append('pos_h', String(opts.posH));
  return _apiCall<FruitAddViewResponse>(`${baseUrl}/api/fruit/add_view`, 'POST', form);
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
