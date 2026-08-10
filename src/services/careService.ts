/**
 * careService — Chăm-sóc / dư-lượng client cho React Native
 *
 * API field-reid: POST /api/care/match (nhận-diện bao-bì thuốc/phân từ ảnh hoặc chữ),
 *                 POST /api/care/log (ghi nhật-ký sử-dụng + tính cách-ly),
 *                 GET  /api/care/products (kho sản-phẩm, cache offline),
 *                 GET  /api/care/withdrawal (trạng-thái cách-ly chặn thu-hoạch/bán).
 * Auth: Bearer token từ AsyncStorage key 'auth_token'. Mẫu theo animalReIDService.
 *
 * Triết-lý OriLife: cảnh-báo CÁCH LY (blocked_until) là then-chốt — chặn thu-hoạch khi
 * chưa hết thời-gian an-toàn sau phun thuốc.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CareProduct {
  product_id: string;
  name?: string;
  category?: string;
  active_ingredient?: string;
  withdrawal_days?: number;
  score?: number;
}

export interface CareMatchResponse {
  ok: boolean;
  candidates?: CareProduct[];
}

export interface CareLogResponse {
  ok: boolean;
  /**
   * BA giá-trị, không phải hai (OriLife `care.py:443-451`):
   *   `false` → đang trong thời-gian cách-ly
   *   `null`  → CHƯA XÁC ĐỊNH (không tra được thời-gian cách-ly của thuốc đã dùng)
   *   `true`  → an-toàn
   * `null` KHÔNG phải an-toàn. Trường vắng mặt cũng xử như `null`.
   * Cấm `safe ?? true` và `safe !== false` — cả hai đẩy `null` sang nhánh an-toàn.
   */
  safe?: boolean | null;
  /** Chỉ có khi tra được thuốc. `safe === false` vẫn có thể thiếu trường này. */
  blocked_until?: string;
  events?: unknown[];
  products?: CareProduct[];
}

export type SafeState = 'blocked' | 'unknown' | 'safe';

/**
 * Ép cờ `safe` BA giá-trị về ba nhánh tường-minh.
 * Dùng hàm này ở MỌI nơi đọc `safe` — đừng viết lại điều-kiện tại chỗ, vì
 * `safe ?? true` và `safe !== false` đều lặng lẽ đẩy `null` sang "an-toàn".
 * Vắng mặt (`undefined`) xử như `null`: CHƯA XÁC ĐỊNH.
 */
export function safeStateOf(safe: boolean | null | undefined): SafeState {
  if (safe === false) return 'blocked';
  if (safe === true) return 'safe';
  return 'unknown';
}

export interface CareProductsResponse {
  ok?: boolean;
  products: CareProduct[];
}

export interface APIError {
  type: 'network_error' | 'auth_error' | 'validation_error' | 'duplicate' | 'rate_limited' | 'server_error';
  detail: string;
  http_status: number;
  retry_after_seconds?: number;
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
    const resp = await fetch(url, { method, headers, body: body ?? undefined, signal: controller.signal });
    clearTimeout(timeoutHandle);

    if (resp.status === 401) {
      return { ok: false, error: { type: 'auth_error', detail: 'Token hết hạn hoặc không hợp lệ', http_status: 401 } };
    }
    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      return { ok: false, error: { type: 'rate_limited', detail: 'Quá nhiều yêu cầu', http_status: 429, retry_after_seconds: retryAfter ? parseInt(retryAfter, 10) : 60 } };
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
    if (isNetworkErr && attempt === 0) {
      return _apiCall<T>(url, method, body, 1);
    }
    return { ok: false, error: { type: 'network_error', detail: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', http_status: 0 } };
  }
}

/** Nhận-diện sản-phẩm thuốc/phân từ ảnh bao-bì (và/hoặc chữ trên nhãn). */
export async function matchCareLabel(
  baseUrl: string,
  imagePath?: string,
  text?: string,
): Promise<{ ok: boolean; data?: CareMatchResponse; error?: APIError }> {
  const form = new FormData();
  if (text) form.append('text', text);
  if (imagePath) {
    (form as any).append('files', { uri: imagePath, type: 'image/jpeg', name: 'label.jpg' });
  }
  return _apiCall<CareMatchResponse>(`${baseUrl}/api/care/match`, 'POST', form);
}

/** Ghi nhật-ký dùng thuốc/phân cho 1 cây/quả/vườn → trả trạng-thái cách-ly. */
export async function logCare(
  baseUrl: string,
  params: {
    targetType: string;     // 'tree' | 'fruit' | 'farm'
    targetId: string;
    productId: string;
    dose?: string;
    purpose?: string;
    farmId?: string;
    appliedAt?: string;
    recognitionMethod?: string;  // 'manual' | 'label_scan'
    imagePath?: string;
  },
): Promise<{ ok: boolean; data?: CareLogResponse; error?: APIError }> {
  const form = new FormData();
  form.append('target_type', params.targetType);
  form.append('target_id', params.targetId);
  form.append('product_id', params.productId);
  if (params.dose) form.append('dose', params.dose);
  if (params.purpose) form.append('purpose', params.purpose);
  if (params.farmId) form.append('farm_id', params.farmId);
  if (params.appliedAt) form.append('applied_at', params.appliedAt);
  form.append('recognition_method', params.recognitionMethod ?? 'manual');
  if (params.imagePath) {
    (form as any).append('files', { uri: params.imagePath, type: 'image/jpeg', name: 'apply.jpg' });
  }
  return _apiCall<CareLogResponse>(`${baseUrl}/api/care/log`, 'POST', form);
}

/** Kho sản-phẩm để cache offline (chọn tay khi mạng kém / nhận-diện không ra). */
export async function getCareProducts(
  baseUrl: string,
  category?: string,
): Promise<{ ok: boolean; data?: CareProductsResponse; error?: APIError }> {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  const qs = params.toString();
  return _apiCall<CareProductsResponse>(`${baseUrl}/api/care/products${qs ? `?${qs}` : ''}`, 'GET');
}
