/**
 * farmService — Farm client cho React Native (backend field-reid).
 *
 * Anh gom app về MỘT backend field-reid (bỏ aladin-api của Lợi). File này
 * soi gương treeReIDService: cùng base URL (ORILIFE_API_BASE_URL), cùng cách
 * _apiCall + Bearer auth từ AsyncStorage, cùng kiểu trả { ok, data?, error? }.
 *
 * Contract field-reid Farm:
 *   Farm JSON = { farm_id, owner_did, name, kind, boundary:[[lat,lon],...],
 *                 center:[lat,lon]|null, note, created_at }
 *   - POST   /api/farm                  Form(name, kind?, boundary_json?, center_json?, note?) → {ok, farm}
 *   - GET    /api/farms                 → {ok, farms:[{...farm, counts:{n_trees,n_animals}}]}
 *   - GET    /api/farm/{farm_id}        → {ok, farm, trees:[...], animals:[...]}
 *   - POST   /api/farm/{farm_id}/update Form(name?/kind?/boundary_json?/center_json?/note?) → {ok, farm}
 *   - DELETE /api/farm/{farm_id}        → {ok}
 *   owner LẤY TỪ AUTH (KHÔNG gửi owner_did khi tạo).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ORILIFE_BASE } from './orilifeBase';
import type { Farm } from '../modules/trace/types';
import type { APIError } from './treeReIDService';

// ---------------------------------------------------------------------------
// Base URL — đồng nhất với TreeEnrollScreen/fruitReIDService (field-reid duy nhất)
// ---------------------------------------------------------------------------

export const FARM_BASE_URL: string =
  ORILIFE_BASE;

// ---------------------------------------------------------------------------
// Types — khớp ĐÚNG shape field-reid Farm
// ---------------------------------------------------------------------------

/** Farm thô từ field-reid (snake_case). boundary/center là [lat, lon]. */
export interface FieldReidFarm {
  farm_id: string;
  owner_did?: string | null;
  name?: string | null;
  kind?: string | null;
  boundary?: [number, number][] | null;
  center?: [number, number] | null;
  note?: string | null;
  created_at?: string | null;
  counts?: { n_trees?: number; n_animals?: number };
}

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Shared internal helper (bản sao gọn của treeReIDService — giữ cô lập)
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
// Map field-reid Farm JSON → type app (Farm)
// ---------------------------------------------------------------------------

/**
 * field-reid boundary là [lat, lon] (khác GeoJSON [lng, lat]). App Farm.coordinates
 * dùng { lat, lng }. Map giữ NGUYÊN thứ tự lat/lng để UI bản đồ không lệch.
 */
export function mapFieldReidFarm(f: FieldReidFarm): Farm {
  const coordinates = Array.isArray(f.boundary)
    ? f.boundary
        .filter((pt) => Array.isArray(pt) && pt.length >= 2)
        .map((pt) => ({ lat: pt[0], lng: pt[1] }))
    : [];
  return {
    id: f.farm_id,
    name: (f.name && f.name.trim()) || f.farm_id,
    coordinates,
    userId: f.owner_did ?? '',
  };
}

/** Đóng FormData từ các field tuỳ chọn của farm (dùng chung create + update). */
function _buildFarmForm(input: {
  name?: string;
  kind?: string;
  boundary?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number } | null;
  note?: string;
}): FormData {
  const form = new FormData();
  if (input.name !== undefined) form.append('name', input.name);
  if (input.kind !== undefined) form.append('kind', input.kind);
  if (input.boundary && input.boundary.length > 0) {
    // boundary_json = mảng [lat, lon] (đúng thứ tự field-reid).
    const ring = input.boundary.map((c) => [c.lat, c.lng]);
    form.append('boundary_json', JSON.stringify(ring));
  }
  if (input.center) {
    form.append('center_json', JSON.stringify([input.center.lat, input.center.lng]));
  }
  if (input.note !== undefined) form.append('note', input.note);
  return form;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CreateFarmInput {
  name?: string;
  kind?: string;
  boundary?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number } | null;
  note?: string;
}

/** POST /api/farm — owner lấy từ AUTH (không gửi). Trả Farm đã map. */
export async function createFarm(
  baseUrl: string,
  input: CreateFarmInput,
): Promise<{ ok: boolean; farm?: Farm; error?: APIError }> {
  const form = _buildFarmForm(input);
  const result = await _apiCall<{ ok: boolean; farm: FieldReidFarm }>(
    `${baseUrl}/api/farm`, 'POST', form,
  );
  if (result.ok && result.data?.farm) {
    return { ok: true, farm: mapFieldReidFarm(result.data.farm) };
  }
  return { ok: false, error: result.error };
}

/** GET /api/farms — danh sách vườn của người đăng nhập. */
export async function listFarms(
  baseUrl: string,
): Promise<{ ok: boolean; farms?: Farm[]; error?: APIError }> {
  const result = await _apiCall<{ ok: boolean; farms: FieldReidFarm[] }>(
    `${baseUrl}/api/farms`, 'GET',
  );
  if (result.ok && result.data) {
    const farms = (result.data.farms ?? []).map(mapFieldReidFarm);
    return { ok: true, farms };
  }
  return { ok: false, error: result.error };
}

/** GET /api/farm/{farm_id} — chi tiết vườn KÈM cây + con vật (thô, chưa map tree). */
export async function getFarm(
  baseUrl: string,
  farmId: string,
): Promise<{
  ok: boolean;
  farm?: Farm;
  trees?: any[];
  animals?: any[];
  error?: APIError;
}> {
  const result = await _apiCall<{ ok: boolean; farm: FieldReidFarm; trees?: any[]; animals?: any[] }>(
    `${baseUrl}/api/farm/${encodeURIComponent(farmId)}`, 'GET',
  );
  if (result.ok && result.data?.farm) {
    return {
      ok: true,
      farm: mapFieldReidFarm(result.data.farm),
      trees: result.data.trees ?? [],
      animals: result.data.animals ?? [],
    };
  }
  return { ok: false, error: result.error };
}

/** POST /api/farm/{farm_id}/update — sửa các field tuỳ chọn. */
export async function updateFarm(
  baseUrl: string,
  farmId: string,
  input: CreateFarmInput,
): Promise<{ ok: boolean; farm?: Farm; error?: APIError }> {
  const form = _buildFarmForm(input);
  const result = await _apiCall<{ ok: boolean; farm: FieldReidFarm }>(
    `${baseUrl}/api/farm/${encodeURIComponent(farmId)}/update`, 'POST', form,
  );
  if (result.ok && result.data?.farm) {
    return { ok: true, farm: mapFieldReidFarm(result.data.farm) };
  }
  return { ok: false, error: result.error };
}

/** DELETE /api/farm/{farm_id}. */
export async function deleteFarm(
  baseUrl: string,
  farmId: string,
): Promise<{ ok: boolean; error?: APIError }> {
  const result = await _apiCall<{ ok: boolean }>(
    `${baseUrl}/api/farm/${encodeURIComponent(farmId)}`, 'DELETE',
  );
  return { ok: result.ok, error: result.error };
}
