/**
 * animalReIDService — Animal ReID client cho React Native
 *
 * API: POST /api/animal/identify, /api/animal/enroll, /api/animal/verify,
 *      GET /api/animal/list, GET /api/animal/{animal_did},
 *      DELETE /api/animal/{animal_did}
 * Auth: Bearer token từ AsyncStorage key 'auth_token'
 * Timeout: 45s, retry 1 lần cho lỗi mạng (không retry 4xx)
 *
 * Lưu ý: identify response KHÔNG có similarity/margin/factors (server ẩn nội tạng)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';
import { canResendAfterNetworkError } from './resendPolicy';

/**
 * Cửa POST GỬI LẠI ĐƯỢC sau lỗi mạng. Luật + lý do đầy đủ ở `resendPolicy.ts`.
 *
 * Vắng mặt CỐ Ý: `/api/animal/enroll` — TẠO con vật, sinh mã mới mỗi lượt.
 */
export const RESENDABLE_POST = [
  '/api/animal/identify',  // đọc — so khớp
  '/api/animal/verify',    // đọc — đối chiếu một con đã biết
  '/api/animal/rename',    // đặt cùng một tên hai lần vẫn ra một kết quả
] as const;

export type AnimalDecision = 'MATCH' | 'UNCERTAIN' | 'NO_MATCH' | 'EMPTY_FARM' | 'MOVED';

export interface AnimalCandidate {
  animal_did: string;
  name?: string;
  species?: string;
  sim: number;
  near_prev?: boolean;
  n_views?: number;
}

// Báo giá phí 3-bucket cho tác vụ identify — khai tập trung ở types/fee.ts.
import type { FeeQuote } from '../types/fee';
export type { FeeQuote };

export interface AnimalIdentifyResponse {
  ok: boolean;
  match: boolean;
  decision: AnimalDecision;
  animal_did?: string;
  name?: string;
  candidate_count: number;
  candidates?: AnimalCandidate[];
  moved_distance_m?: number;
  shoot_hint?: string;
  fee_quote?: FeeQuote;
}

export interface AnimalEnrollResponse {
  ok: boolean;
  animal_did: string;
  species: string;
  farm_id: string;
  n_images_added?: number;
}

export interface AnimalVerifyResponse {
  ok: boolean;
  match: boolean;
  animal_did: string;
  decision: AnimalDecision;
  shoot_hint?: string;
}

export interface AnimalInfo {
  animal_did: string;
  name?: string;
  species: string;
  farm_id: string;
  n_images?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AnimalListResponse {
  animals: AnimalInfo[];
  total?: number;
  offset?: number;
  limit?: number;
}

export interface APIError {
  type: 'network_error' | 'auth_error' | 'validation_error' | 'duplicate' | 'rate_limited' | 'server_error';
  detail: string;
  http_status: number;
  retry_after_seconds?: number;
  /**
   * Mã cá thể mà máy chủ cho là TRÙNG với con đang đăng ký (ca 409).
   *
   * Máy chủ trả nó trong `detail` dưới dạng OBJECT — `{error, duplicate: true,
   * similar_animal_did}` — chứ không phải chuỗi. Bản trước gán thẳng object đó vào
   * `detail: string` nên màn hình hiện "[object Object]" cho nông dân, và mã con
   * trùng thì rơi mất dù máy chủ vẫn gửi. Tên trường là `similar_animal_did`, KHÔNG
   * phải `existing_animal_did` — OriLife cố ý không đặt bí danh, vì hai tên cho một
   * thứ thì tên nào cũng thành nửa đúng.
   */
  similarAnimalDid?: string;
}

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 45_000;

async function _getAuthHeader(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/** Cắt phần gốc (https://host) khỏi URL đầy đủ để truyền cho ensureOrilifeToken. */
function _baseOf(url: string): string {
  const i = url.indexOf('/api/');
  return i > 0 ? url.slice(0, i) : url;
}

async function _apiCall<T>(
  url: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: FormData,
  attempt = 0,
): Promise<{ ok: boolean; data?: T; error?: APIError }> {
  // Ký DID TRƯỚC mỗi lệnh (khớp treeReIDService:315). Vì sao: `auth_token` chỉ do
  // orilifeDidAuth ghi. Ai mở app vào thẳng "Quét con vật" mà chưa chạm luồng
  // cây/vườn thì chưa có ai ký → 401 oan ngay giữa ruộng.
  await ensureOrilifeToken(_baseOf(url));
  const authHeader = await _getAuthHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, { method, headers, body: body ?? undefined, signal: controller.signal });
    clearTimeout(timeoutHandle);

    if (resp.status === 401) {
      // Token hết hạn GIỮA BUỔI → ký lại bằng DID ĐÚNG MỘT lần rồi thử lại (khớp
      // treeReIDService:336). Trước đây trả thẳng auth_error: nút "Thử lại" ở màn
      // quản lý gọi lại đúng đường cũ nên lặp lại đúng lỗi đó vĩnh viễn.
      if (attempt === 0 && (await ensureOrilifeToken(_baseOf(url), { force: true }))) {
        return _apiCall<T>(url, method, body, 1);
      }
      return { ok: false, error: { type: 'auth_error', detail: 'Token hết hạn hoặc không hợp lệ', http_status: 401 } };
    }
    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      return { ok: false, error: { type: 'rate_limited', detail: 'Quá nhiều yêu cầu', http_status: 429, retry_after_seconds: retryAfter ? parseInt(retryAfter, 10) : 60 } };
    }
    if (resp.status === 409) {
      // `detail` ở ca này là OBJECT, không phải chuỗi — xem chú thích ở `APIError`.
      let detail = 'Trùng lặp';
      let similarAnimalDid: string | undefined;
      try {
        const raw = (await resp.json())?.detail;
        if (typeof raw === 'string') {
          detail = raw;
        } else if (raw && typeof raw === 'object') {
          detail = typeof raw.error === 'string' ? raw.error : detail;
          similarAnimalDid =
            typeof raw.similar_animal_did === 'string' ? raw.similar_animal_did : undefined;
        }
      } catch { /* bỏ qua */ }
      return { ok: false, error: { type: 'duplicate', detail, http_status: 409, similarAnimalDid } };
    }
    if (resp.status === 422) {
      let detail = 'Dữ liệu không hợp lệ';
      try { detail = (await resp.json()).detail ?? detail; } catch { /* bỏ qua */ }
      return { ok: false, error: { type: 'validation_error', detail, http_status: 422 } };
    }
    if (resp.status >= 500) {
      return { ok: false, error: { type: 'server_error', detail: `Lỗi máy chủ: HTTP ${resp.status}`, http_status: resp.status } };
    }
    if (!resp.ok) {
      return { ok: false, error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status } };
    }

    const data = await resp.json() as T;
    return { ok: true, data };

  } catch (err: unknown) {
    clearTimeout(timeoutHandle);

    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { type: 'network_error', detail: 'Hết thời gian chờ', http_status: 0 } };
    }

    const isNetworkErr =
      (err instanceof TypeError && err.name !== 'AbortError') ||
      (err instanceof Error && err.message.includes('network'));

    if (isNetworkErr && attempt === 0 && canResendAfterNetworkError(url, method, RESENDABLE_POST)) {
      return _apiCall<T>(url, method, body, 1);
    }

    return { ok: false, error: { type: 'network_error', detail: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', http_status: 0 } };
  }
}

function normalizeSpecies(species: string): string {
  return species.toLowerCase().replace(/ /g, '_');
}

export async function identifyAnimal(
  baseUrl: string,
  species: string,
  farmId: string,
  imagePath: string,
): Promise<{ ok: boolean; data?: AnimalIdentifyResponse; error?: APIError }> {
  const form = new FormData();
  form.append('species', normalizeSpecies(species));
  form.append('farm_id', farmId);
  (form as any).append('image', { uri: imagePath, type: 'image/jpeg', name: 'img.jpg' });
  return _apiCall<AnimalIdentifyResponse>(`${baseUrl}/api/animal/identify`, 'POST', form);
}

export async function enrollAnimal(
  baseUrl: string,
  species: string,
  farmId: string,
  name: string,
  imagePaths: string[],
): Promise<{ ok: boolean; data?: AnimalEnrollResponse; error?: APIError }> {
  const form = new FormData();
  form.append('species', normalizeSpecies(species));
  form.append('farm_id', farmId);
  form.append('name', name);
  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('images', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }
  return _apiCall<AnimalEnrollResponse>(`${baseUrl}/api/animal/enroll`, 'POST', form);
}

export async function verifyAnimal(
  baseUrl: string,
  animalDid: string,
  imagePath: string,
): Promise<{ ok: boolean; data?: AnimalVerifyResponse; error?: APIError }> {
  const form = new FormData();
  form.append('animal_did', animalDid);
  (form as any).append('image', { uri: imagePath, type: 'image/jpeg', name: 'img.jpg' });
  return _apiCall<AnimalVerifyResponse>(`${baseUrl}/api/animal/verify`, 'POST', form);
}

export async function listAnimals(
  baseUrl: string,
  farmId?: string,
  species?: string,
  limit = 20,
  offset = 0,
): Promise<{ ok: boolean; animals?: AnimalInfo[]; total?: number; error?: APIError }> {
  const params = new URLSearchParams();
  if (farmId) params.append('farm_id', farmId);
  if (species) params.append('species', normalizeSpecies(species));
  params.append('limit', String(limit));
  params.append('offset', String(offset));

  const result = await _apiCall<AnimalListResponse>(`${baseUrl}/api/animal/list?${params.toString()}`, 'GET');
  if (result.ok && result.data) {
    // `total` là TỔNG đàn khớp bộ lọc, khác hẳn `animals.length` (số của MỘT trang).
    // Trả nó ra thay vì vứt: chỗ gọi đang bày `animals.length` như tổng đàn, và con số
    // đó bị PAGE_SIZE chặn trần. Máy chủ đời cũ không gửi `total` ⇒ `undefined`, và chỗ
    // gọi phải xử ca đó chứ không được coi là 0.
    return { ok: true, animals: result.data.animals, total: result.data.total };
  }
  return { ok: false, error: result.error };
}

export async function getAnimal(
  baseUrl: string,
  animalDid: string,
): Promise<{ ok: boolean; data?: AnimalInfo; error?: APIError }> {
  return _apiCall<AnimalInfo>(`${baseUrl}/api/animal/${encodeURIComponent(animalDid)}`, 'GET');
}

/**
 * Đổi tên một cá thể. `POST /api/animal/rename` (`animal_server_ext.py:911-935`).
 *
 * ⚠️ Cửa này trả `200` kèm `ok:false` khi tên sau vệ sinh còn rỗng — CÙNG khuôn
 * với `POST /api/rename` của cây. Nên phải đọc `data.ok`, không đọc cờ vận
 * chuyển của `_apiCall`. Đọc nhầm tầng nghĩa là app ghi tên mới vào danh sách
 * trên máy trong khi máy chủ giữ tên cũ, và tên cũ quay về ở lần làm mới sau —
 * đúng cái hỏng mà docstring của chính cửa này mô tả.
 *
 * Máy chủ trả kèm `name` (tên sau vệ sinh) — trả lên để màn dùng ĐÚNG chuỗi máy
 * chủ đã ghi, thay vì chuỗi người dùng vừa gõ. Hai cái có thể khác nhau.
 */
export async function renameAnimal(
  baseUrl: string,
  animalDid: string,
  name: string,
): Promise<{ ok: boolean; name?: string; error?: APIError }> {
  const form = new FormData();
  form.append('animal_did', animalDid);
  form.append('name', name);

  const result = await _apiCall<{ ok: boolean; name?: string; error?: string }>(
    `${baseUrl}/api/animal/rename`,
    'POST',
    form,
  );
  if (!result.ok) return { ok: false, error: result.error };

  if (result.data?.ok !== true) {
    return {
      ok: false,
      error: {
        type: 'validation_error',
        // Máy chủ soạn sẵn câu ("Tên không được để trống.") — hiện nguyên văn.
        detail: result.data?.error ?? 'Máy chủ không đổi được tên.',
        http_status: 200,
      },
    };
  }
  return { ok: true, name: result.data?.name };
}

export async function deleteAnimal(
  baseUrl: string,
  animalDid: string,
): Promise<{ ok: boolean; error?: APIError }> {
  const result = await _apiCall<{ ok: boolean }>(`${baseUrl}/api/animal/${encodeURIComponent(animalDid)}`, 'DELETE');
  return { ok: result.ok, error: result.error };
}
