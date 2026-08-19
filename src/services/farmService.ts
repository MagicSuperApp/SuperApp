/**
 * farmService — Farm client cho React Native (backend field-reid).
 *
 * Anh gom app về MỘT backend field-reid (bỏ aladin-api của Lợi). File này
 * soi gương treeReIDService: cùng base URL (ORILIFE_API_BASE_URL), cùng cách
 * _apiCall + Bearer auth từ AsyncStorage, cùng kiểu trả { ok, data?, error? }.
 *
 * Contract field-reid Farm:
 *   Farm JSON = { farm_id, owner_did, name, kind, boundary:[[lat,lon],...],
 *                 center:[lat,lon]|null, boundary_method, boundary_acc_m,
 *                 note, created_at }
 *   - POST   /api/farm                  Form(name, kind?, boundary_json?, center_json?,
 *                                            boundary_method?, boundary_acc_m?, note?) → {ok, farm}
 *   - GET    /api/farms                 → {ok, farms:[{...farm, counts:{n_trees,n_animals}}]}
 *   - GET    /api/farm/{farm_id}        → {ok, farm, trees:[...], animals:[...]}
 *   - POST   /api/farm/{farm_id}/update Form(name?/kind?/boundary_json?/center_json?/
 *                                            boundary_method?/boundary_acc_m?/note?) → {ok, farm}
 *   - DELETE /api/farm/{farm_id}        → {ok}
 *   owner LẤY TỪ AUTH (KHÔNG gửi owner_did khi tạo).
 *
 * ── RANH VƯỜN: ba trường đi cùng nhau, không tách ──────────────────────────
 * Máy chủ giữ ranh vườn dưới dạng DANH SÁCH ĐIỂM (`boundary`), kèm hai thứ nói
 * *ranh đó đáng tin tới đâu*:
 *   · `boundary_method` — lấy bằng cách nào (đi vòng quanh vườn, hay chấm tay
 *     lên bản đồ). Hai cách này sai khác nhau cả chục mét.
 *   · `boundary_acc_m`  — sai số GPS lúc ghi, tính bằng mét.
 * Vẽ vùng vườn lên bản đồ mà bỏ hai trường này là vẽ một đường sắc nét cho một
 * số liệu mờ. Chúng được map ra `Farm.boundaryMethod`/`boundaryAccM` để màn bản
 * đồ nói được "ranh này chấm tay, sai số chưa rõ" thay vì im lặng.
 *
 * `boundary_acc_m` VẮNG ≠ 0. Vắng là *chưa biết*; 0 là *đo được và bằng 0* —
 * điều không xảy ra với GPS thật. Nên hàm map giữ `null` cho chỗ vắng.
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
  /** Ranh lấy bằng cách nào — nhãn tự do, xem `BOUNDARY_METHOD`. */
  boundary_method?: string | null;
  /** Sai số GPS lúc ghi ranh, mét. Vắng = chưa biết (KHÁC 0). */
  boundary_acc_m?: number | null;
  note?: string | null;
  created_at?: string | null;
  counts?: { n_trees?: number; n_animals?: number };
  /** Máy chủ TỰ TÍNH từ ranh và trả kèm — đừng gửi lên, FastAPI bỏ qua. */
  area_sqm?: number | null;
  perimeter_m?: number | null;
  /**
   * Máy chấm lời khai `boundary_method` (server.py #107) — trường DẪN-XUẤT, tính
   * lại mỗi lần trả về. Client gửi kèm cũng vô hiệu: không có đường nào cho một
   * lời khai tự chấm điểm cho chính nó.
   */
  method_verified?: boolean | null;
  boundary_warnings?: string[] | null;
  /** Chưa có trong hợp đồng — đọc dè chừng, có thì dùng. */
  image_url?: string | null;
}

/**
 * Ba giá trị `boundary_method` mà MÁY CHỦ nhận. Đọc từ openapi của bản đang chạy:
 * `boundary_method ∈ {gps_walk, map_draw, mixed} (lạ→unknown)`.
 *
 * ⚠ Bản trước của tệp này tự đặt `walk`/`manual` theo `drawMode` ở màn vẽ ranh.
 * Máy chủ KHÔNG từ chối giá trị lạ — nó lặng lẽ ghi `unknown`. Tức lời khai
 * nguồn-gốc ranh biến mất mà không có gì báo, và VeData chấm độ-tin của mảnh
 * vườn đó như thể chưa ai nói gì. Đúng loại hỏng mà chỉ đọc hợp đồng mới thấy.
 *
 * Đọc vào thì vẫn phải chịu được chuỗi lạ (máy chủ có thể thêm giá trị mới, và
 * `unknown` là một giá trị thật sẽ gặp).
 */
export const BOUNDARY_METHOD = {
  /** Đi vòng quanh vườn, máy tự ghi điểm theo GPS — ranh ĐO tại chỗ. */
  gpsWalk: 'gps_walk',
  /** Chấm tay lên bản đồ — ranh VẼ từ xa. */
  mapDraw: 'map_draw',
  /** Ranh GPS rồi chỉnh tay, hoặc ngược lại. */
  mixed: 'mixed',
} as const;

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
  // Tâm: chỉ nhận khi máy chủ gửi ĐÚNG cặp số. `null` ở đây có nghĩa "máy chủ
  // không giữ tâm" → nơi dùng tự tính từ ranh, chứ đừng dựng ra { lat: 0, lng: 0 }
  // (toạ độ 0,0 nằm giữa Đại Tây Dương và trông y như một vườn thật trên bản đồ).
  const center =
    Array.isArray(f.center) && f.center.length >= 2 &&
      Number.isFinite(f.center[0]) && Number.isFinite(f.center[1])
      ? { lat: f.center[0], lng: f.center[1] }
      : null;
  const acc =
    typeof f.boundary_acc_m === 'number' && Number.isFinite(f.boundary_acc_m) && f.boundary_acc_m >= 0
      ? f.boundary_acc_m
      : null;
  return {
    id: f.farm_id,
    name: (f.name && f.name.trim()) || f.farm_id,
    coordinates,
    userId: f.owner_did ?? '',
    center,
    boundaryMethod: typeof f.boundary_method === 'string' && f.boundary_method.trim()
      ? f.boundary_method.trim()
      : null,
    boundaryAccM: acc,
    kind: f.kind ?? null,
    note: f.note ?? null,
    ownerDid: f.owner_did ?? null,
    createdAt: f.created_at ?? null,
    // Đếm: chỉ gán khi máy chủ THẬT SỰ gửi số. `?? 0` ở đây là bịa — vườn mới
    // tạo mà hiện "0 cây" thì đúng, nhưng vườn có 40 cây và máy chủ quên trả
    // `counts` cũng hiện "0 cây", và không ai phân biệt được hai ca đó.
    treeCount: typeof f.counts?.n_trees === 'number' ? f.counts.n_trees : undefined,
    animalCount: typeof f.counts?.n_animals === 'number' ? f.counts.n_animals : undefined,
    imageUrl: typeof f.image_url === 'string' && f.image_url.trim() ? f.image_url.trim() : null,
    // Diện tích do MÁY CHỦ tính. Ưu tiên nó hơn phép tính phía app: cùng một
    // vòng ranh mà hai bên ra hai con số thì người dùng thấy màn này một số, màn
    // kia một số, và không ai biết tin cái nào.
    areaM2: typeof f.area_sqm === 'number' && Number.isFinite(f.area_sqm) && f.area_sqm > 0
      ? f.area_sqm
      : null,
    perimeterM: typeof f.perimeter_m === 'number' && Number.isFinite(f.perimeter_m) && f.perimeter_m > 0
      ? f.perimeter_m
      : null,
    methodVerified: typeof f.method_verified === 'boolean' ? f.method_verified : null,
    boundaryWarnings: Array.isArray(f.boundary_warnings)
      ? f.boundary_warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

/** Đóng FormData từ các field tuỳ chọn của farm (dùng chung create + update). */
function _buildFarmForm(input: CreateFarmInput): FormData {
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
  if (input.boundaryMethod !== undefined) {
    form.append('boundary_method', input.boundaryMethod);
  }
  // Chỉ gửi sai số khi ĐO ĐƯỢC. Gửi 0 cho ca "chưa đo" là ghi vào máy chủ một
  // lời khai "ranh này chính xác tuyệt đối" — sai vĩnh viễn và không ai kiểm lại.
  if (typeof input.boundaryAccM === 'number' && Number.isFinite(input.boundaryAccM)) {
    form.append('boundary_acc_m', String(input.boundaryAccM));
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
  /** `BOUNDARY_METHOD.walk` | `.manual` — gửi để đời sau biết ranh này lấy sao. */
  boundaryMethod?: string;
  /** Sai số GPS lúc ghi ranh, mét. BỎ TRỐNG khi không đo được — đừng gửi 0. */
  boundaryAccM?: number | null;
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

/**
 * POST /api/farm/{farm_id}/update — sửa các field tuỳ chọn.
 *
 * ⚠ ĐỔI RANH thì PHẢI gửi kèm `boundaryMethod`. Hợp đồng máy chủ: gửi
 * `boundary_json` mà không gửi method ⇒ nó **reset nguồn-gốc ranh về `unknown`
 * và xoá sai số** (ranh mới không kế-thừa nguồn-gốc ranh cũ). Tức một lần sửa
 * tên vườn kèm ranh là mất sạch lời khai đo đạc, im lặng. Chỉnh tay một ranh GPS
 * cũ thì method đúng là `mixed`.
 */
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
