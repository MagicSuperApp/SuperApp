/**
 * treeReIDService — Tree ReID client cho React Native
 *
 * API: POST /api/identify, /api/enroll, /api/verify_add, GET /api/trees,
 *      POST /api/delete, POST /api/rename
 * Auth: Bearer token từ AsyncStorage key 'auth_token'
 * Timeout: 45s, retry 1 lần cho lỗi mạng (không retry 4xx)
 */

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
  /** tree_id của cây trùng — backend trả khi 409 duplicate_tree */
  existing_tree_id?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 45_000;

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
  attempt = 0,
): Promise<{ ok: boolean; data?: T; error?: APIError }> {
  const authHeader = await _getAuthHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

    if (resp.status === 422) {
      let detail = 'Dữ liệu không hợp lệ';
      try { detail = (await resp.json()).detail ?? detail; } catch { /* bỏ qua */ }
      return { ok: false, error: { type: 'validation_error', detail, http_status: 422 } };
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
      return _apiCall<T>(url, method, body, 1);
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

export interface IdentifyOptions {
  lat?: number;
  lon?: number;
  acc?: number;
  heading?: number;
  pitch?: number;
  /** Khi true: bỏ qua kiểm tra trùng lặp, tạo cây mới bất kể. Dùng cho handleForceEnroll. */
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function identifyTree(
  baseUrl: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
): Promise<{ ok: boolean; data?: IdentifyResponse; error?: APIError }> {
  const form = new FormData();

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  if (options.lat !== undefined) form.append('lat', String(options.lat));
  if (options.lon !== undefined) form.append('lon', String(options.lon));
  if (options.acc !== undefined) form.append('acc', String(options.acc));
  if (options.heading !== undefined) form.append('heading', String(options.heading));
  if (options.pitch !== undefined) form.append('pitch', String(options.pitch));
  form.append('source', 'phone');

  return _apiCall<IdentifyResponse>(`${baseUrl}/api/identify`, 'POST', form);
}

export async function enrollTree(
  baseUrl: string,
  name: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
): Promise<{ ok: boolean; data?: EnrollResponse; error?: APIError }> {
  const form = new FormData();

  form.append('name', name);
  form.append('source', 'phone');

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  if (options.lat !== undefined) form.append('lat', String(options.lat));
  if (options.lon !== undefined) form.append('lon', String(options.lon));
  if (options.acc !== undefined) form.append('acc', String(options.acc));
  if (options.heading !== undefined) form.append('heading', String(options.heading));
  if (options.pitch !== undefined) form.append('pitch', String(options.pitch));
  if (options.force) form.append('force', 'true');

  return _apiCall<EnrollResponse>(`${baseUrl}/api/enroll`, 'POST', form);
}

export async function verifyAddTree(
  baseUrl: string,
  treeId: string,
  imagePaths: string[],
): Promise<{ ok: boolean; data?: VerifyAddResponse; error?: APIError }> {
  const form = new FormData();

  form.append('tree_id', treeId);

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  return _apiCall<VerifyAddResponse>(`${baseUrl}/api/verify_add`, 'POST', form);
}

export async function getTrees(
  baseUrl: string,
): Promise<{ ok: boolean; trees?: TreeInfo[]; error?: APIError }> {
  const result = await _apiCall<TreeListResponse>(`${baseUrl}/api/trees`, 'GET');
  if (result.ok && result.data) {
    return { ok: true, trees: result.data.trees };
  }
  return { ok: false, error: result.error };
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
