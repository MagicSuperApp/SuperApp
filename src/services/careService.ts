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

/**
 * Một sản phẩm thuốc/phân như MÁY CHỦ trả về.
 *
 * ⚠ Ba tên trường ở bản trước SAI, và sai câm: `name`, `active_ingredient`,
 * `withdrawal_days`. Máy chủ trả `trade_name`, `active_ingredients` (số nhiều),
 * `withdrawal_period_days` — `care_router.py:177-183` (`_candidate_view`) và
 * `:326-334` (`/api/care/products`). Đọc trường không có ⇒ `undefined` ⇒ thẻ sản
 * phẩm rơi về mã sản phẩm thô và **dòng "Cách ly: N ngày" không bao giờ được vẽ**.
 * Đó đúng là con số nông dân cần thấy trước khi bấm ghi.
 *
 * `score` đã bỏ: máy chủ CỐ Ý không trả điểm khớp (`care_router.py:175`
 * — *"KHÔNG kèm score (giấu nội-tạng)"*). Giữ khai báo đó chỉ mời người sau sắp
 * xếp theo một trường vĩnh viễn `undefined`.
 */
export interface CareProduct {
  product_id: string;
  trade_name?: string;
  active_ingredients?: string;
  category?: string;
  scope?: string;
  withdrawal_period_days?: number;
  /**
   * `low`/`medium` ⇒ thời gian cách ly là ƯỚC TÍNH, giao diện phải nói ra.
   * `high`/vắng ⇒ đáng tin. (`care_router.py:181`)
   */
  phi_confidence?: string | null;
  manufacturer?: string;
}

/**
 * Vì sao `candidates: []` KHÔNG phải một tình huống mà là BA, và máy chủ đã tách sẵn.
 *
 * `care_router.py:164-171` ghi rõ ba ca đòi ba hành động NGƯỢC nhau:
 *   · `ocr_unavailable` — máy chủ không có OCR. **Chụp lại là vô ích.** Đo trên máy
 *     thật 17/08: prod không có nhị phân `tesseract` lẫn gói `pytesseract`, nên hôm
 *     nay MỌI lượt quét ảnh rơi vào đúng ca này.
 *   · `ocr_no_text`    — OCR chạy nhưng không ra chữ. Chụp gần hơn thì ăn.
 *   · `no_match`       — đọc ra chữ mà kho thuốc chưa có nhãn đó. Chụp lại cũng vô ích.
 * Cộng `no_input` (không có ảnh lẫn chữ) và `ambiguous` (khớp nhiều thuốc có số ngày
 * cách ly khác nhau — `care_router.py:385-392`, có kèm `message` soạn sẵn).
 *
 * Khai kiểu cũ chỉ có `{ ok, candidates? }` nên `reason` bị nuốt ngay tại đây, và màn
 * hình buộc phải tự bịa lý do từ độ dài mảng — đúng thứ chú thích của máy chủ cảnh báo.
 *
 * `reason` để mở (`| string`) CỐ Ý: máy chủ thêm giá trị mới thì app rơi vào nhánh
 * "không rõ" chứ không vỡ kiểu, và cũng không im lặng nhận nhầm sang ca khác.
 */
export type CareMatchReason =
  | 'ocr_unavailable'
  | 'ocr_no_text'
  | 'no_input'
  | 'no_match'
  | 'ambiguous'
  | string;

export interface CareMatchResponse {
  ok: boolean;
  candidates?: CareProduct[];
  reason?: CareMatchReason;
  /** `true` khi đầu bảng sát nhau mà số ngày cách ly khác nhau. */
  ambiguous?: boolean;
  /** Câu máy chủ soạn sẵn cho ca `ambiguous`. Hiện NGUYÊN VĂN, không diễn đạt lại. */
  message?: string;
}

/**
 * Thân trả về THẬT của `POST /api/care/log` — `care_router.py:273-274`.
 *
 * ⚠ KHÔNG có `safe`, KHÔNG có `blocked_until`. Bản trước đọc hai trường đó ở đây và
 * dựng cả một hàm ba nhánh rất cẩn thận cho chúng (`safeStateOf`) — cẩn thận với một
 * trường không tồn tại. Hệ quả: mọi lượt ghi đều rơi vào `'unknown'`, nông dân luôn
 * thấy "CHƯA khẳng định được an toàn", và nhánh `blocked` thật **không bao giờ chạm
 * tới**. Cờ ba giá trị nằm ở `GET /api/care/withdrawal` (`care_router.py:311`) —
 * xem `getWithdrawalStatus`.
 */
export interface CareLogResponse {
  ok: boolean;
  care_event_id?: string;
  /** Mốc hết cách ly do CHÍNH lần ghi này sinh ra. Không tra được thuốc → null. */
  withdrawal_until?: string | null;
}

/**
 * Thân trả về của `GET /api/care/withdrawal` — `care_router.py:310-318`.
 * Đây mới là nơi có cờ an toàn.
 */
export interface CareWithdrawalResponse {
  ok: boolean;
  /**
   * BA giá-trị, không phải hai (`care.py:443-451`):
   *   `false` → đang trong thời-gian cách-ly
   *   `null`  → CHƯA XÁC ĐỊNH (không tra được thời-gian cách-ly của thuốc đã dùng)
   *   `true`  → an-toàn
   * `null` KHÔNG phải an-toàn. Trường vắng mặt cũng xử như `null`.
   * Cấm `safe ?? true` và `safe !== false` — cả hai đẩy `null` sang nhánh an-toàn.
   */
  safe?: boolean | null;
  blocked_until?: string | null;
  days_left?: number | null;
  by_product?: string | null;
  /** Có thuốc mà không tra được thời gian cách ly của nó. */
  unknown_phi?: boolean;
  flags?: string[];
  advice?: string[];
  /**
   * VẬT NUÔI: thịt có thể đã qua cách ly trong khi TRỨNG/SỮA thì chưa (ví dụ máy chủ
   * nêu: Via-Levasol thịt 3 ngày, trứng-sữa 4 ngày). Máy chủ trả khối riêng và
   * `eggmilk_safe: false` để app KHÔNG báo an toàn cho việc thu trứng/sữa.
   * Bỏ qua khối này là báo an toàn sai trong đúng khoảng chênh đó.
   */
  eggmilk?: { safe?: boolean | null; blocked_until?: string | null; days_left?: number | null; by_product?: string | null };
  eggmilk_safe?: boolean;
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

/**
 * Ghi nhật-ký dùng thuốc/phân cho 1 cây/quả/vườn.
 *
 * Trả `care_event_id` + `withdrawal_until` của CHÍNH lần ghi này — KHÔNG trả cờ an
 * toàn. Muốn biết đối tượng đó hiện có đang bị cách ly không thì gọi
 * `getWithdrawalStatus` (mốc xa nhất trong MỌI lần ghi, không riêng lần này).
 */
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

/**
 * TRẠNG THÁI CÁCH LY của một đối tượng — cửa duy nhất có cờ `safe`.
 * `GET /api/care/withdrawal?target_type=&target_id=` (`care_router.py:299`).
 *
 * Máy chủ gộp MỌI lần ghi của đối tượng và lấy mốc XA NHẤT, nên đây mới là câu trả
 * lời cho "cây/con này bán được chưa" — `withdrawal_until` của một lần ghi lẻ thì
 * không, vì một lần ghi khác có thể còn xa hơn.
 */
export async function getWithdrawalStatus(
  baseUrl: string,
  targetType: string,
  targetId: string,
): Promise<{ ok: boolean; data?: CareWithdrawalResponse; error?: APIError }> {
  const qs = new URLSearchParams({ target_type: targetType, target_id: targetId });
  return _apiCall<CareWithdrawalResponse>(`${baseUrl}/api/care/withdrawal?${qs.toString()}`, 'GET');
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
