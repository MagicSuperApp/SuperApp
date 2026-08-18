/**
 * capturePlanService — "còn thiếu gì, chụp gì tiếp" cho CẢ cây lẫn quả.
 *
 * Backend: OriLife field-reid, `GET /api/capture/plan` (Bearer).
 * Hợp đồng: `MassTreeIdentify/core/MOBILE-INTEGRATION.md §3.5`.
 *
 * VÌ SAO CÓ FILE NÀY. Câu từ chối của máy chủ nói **VÌ SAO** ảnh không được nhận;
 * nó không nói **LÀM GÌ TIẾP**. Số đo thực địa 12/08/2026: `/api/verify_add` hai
 * lượt liền 0/12 ảnh được nhận, `/api/fruit/add_view` 15 lượt bị từ chối — người
 * chụp đọc xong câu từ chối rồi đứng đó. Cửa này là câu trả lời cho "giờ làm gì".
 *
 * Gọi HAI lúc:
 *   1. Mở màn chụp → hiện `next.text_vi` ("còn thiếu mặt cuống") thay cho "đã có 6 ảnh".
 *   2. NGAY SAU một lượt bị từ chối, kèm `afterReject` = đúng mã máy chủ vừa trả.
 *      Có `after_reject` khớp thì kế hoạch gỡ đúng cái vừa chặn THẮNG kế hoạch thường
 *      và `ready` về `false`. Mã lạ → kế hoạch thường, máy chủ KHÔNG 4xx.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';
import type { APIError, ApiResult } from './fruitReIDService';

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Kiểu — khớp ĐÚNG §3.5
// ---------------------------------------------------------------------------

export type CaptureTargetType = 'tree' | 'fruit';

/**
 * Việc-phải-làm tiếp. Chín giá trị, không phải ba — ba cái cuối
 * (`wait`/`blocked_wrong_target`/`need_light`) chỉ xuất hiện khi app CÓ kể lại
 * lượt vừa bị từ chối qua `afterReject`.
 */
export type CaptureAction =
  | 'shoot_face'
  | 'shoot_around'
  | 'rotate'
  | 'recheck'
  | 'shoot_bark'
  | 'done'
  | 'wait'
  | 'blocked_wrong_target'
  | 'need_light';

/** Mặt của quả. `bottom` (đầu nhuỵ) và `stem` (cuống) là HAI ĐẦU ĐỐI NHAU, không phải một. */
export type FaceType = 'bottom' | 'stem' | 'side' | 'unknown';

/**
 * Mã máy chủ trả khi từ chối, dùng làm `after_reject`.
 *
 * BA NGUỒN KHÁC NHAU, đừng tìm cả sáu ở một chỗ (nhà OriLife đo lại 16/08):
 *   - `mo|toi|qua_sang|nho|xa` ← HTTP **422** của `/api/verify_add` và `/api/enroll`,
 *     nằm ở `quality_warnings[].reasons[]`. Trường `messages` ngoài cùng là câu
 *     tiếng Việt CHO NGƯỜI ĐỌC, không phải mã — đừng dán nó vào đây.
 *   - `heterogeneous` ← HTTP **409** của `/api/enroll`, là trường boolean RIÊNG ở
 *     ngoài cùng (`body.heterogeneous === true`), KHÔNG nằm trong `reasons`.
 *     `/api/verify_add` không trả mã này (cổng nhiều-cây chỉ chạy ở lượt đăng ký).
 *
 * ⛔ `/api/fruit/add_view` dùng bộ mã KHÁC HẲN (`warn`: `better_other`|`low_self`)
 * và hai mã đó CHƯA có trong bảng dịch `_REJECT_TO_ACTION` của máy chủ. Gửi lên
 * hôm nay thì cửa trả kế hoạch THƯỜNG, im lặng, không báo lỗi — đúng loại "cái vỏ
 * im lặng". Đường quả hiện thẳng `message` máy chủ đã trả sẵn; xem `rejectCodeOf`.
 */
export type RejectCode = 'heterogeneous' | 'mo' | 'toi' | 'qua_sang' | 'nho' | 'xa';

const REJECT_CODES: readonly string[] = ['heterogeneous', 'mo', 'toi', 'qua_sang', 'nho', 'xa'];

/** Độ phủ của CÂY. */
export interface CoverageHave {
  views?: number;
  poses?: number;
  weak_views?: number;
}
/** Số ảnh theo MẶT của QUẢ. */
export type FacesHave = Partial<Record<FaceType, number>>;

export interface CaptureNext {
  action: CaptureAction;
  /** Chỉ có ở nhánh quả. */
  view_type?: FaceType;
  need?: number;
  /** Chỉ có ở `action: 'wait'`. */
  eta_seconds?: number;
  /** Dòng chữ DUY NHẤT cần hiện to. Luôn là một việc làm được ngay. */
  text_vi?: string;
}

export interface CapturePlan {
  ok: boolean;
  target_type?: CaptureTargetType;
  target_id?: string;
  /**
   * CHỖ BẮT BUỘC RẼ NHÁNH. `have` đổi nghĩa theo loại đối tượng:
   *   `faces`    (quả) → `{bottom, stem, side, unknown}`, đếm theo mặt
   *   `coverage` (cây) → `{views, poses, weak_views}`
   * Đọc `have.side` ở nhánh cây nhận `undefined`, và thanh tiến độ vẽ từ
   * `undefined` trông Y HỆT thanh vẽ từ 0 — tức "chưa có tấm nào" — mà KHÔNG có
   * gì báo lỗi. Dùng `facesOf()`/`coverageOf()` dưới đây, đừng đọc `have` trực tiếp.
   */
  have_kind?: 'faces' | 'coverage';
  have?: FacesHave | CoverageHave;
  n?: number;
  /** Mặt chưa có tấm nào. Nhánh cây: luôn `[]`. */
  missing?: FaceType[];
  /** Mặt đã có nhưng chưa đủ. Nhánh cây: luôn `[]`. */
  thin?: FaceType[];
  ready?: boolean;
  next?: CaptureNext;
  /** Dòng phụ, chữ nhỏ. */
  why_vi?: string;
}

/**
 * `403`/`404`/`422` ở cửa này nghĩa là **thử lại vô ích** (đối tượng của chủ khác /
 * không tồn tại / `target_type` sai) — khác hẳn lỗi mạng, nơi thử lại có ích.
 * Máy chủ cố ý báo bằng MÃ HTTP chứ không trả 200 kèm kế hoạch rỗng.
 */
export function isPermanentPlanError(err?: APIError): boolean {
  const s = err?.http_status ?? 0;
  return s === 403 || s === 404 || s === 422;
}

// ---------------------------------------------------------------------------
// Đọc `have` AN TOÀN — hai hàm này là lý do file có `have_kind`
// ---------------------------------------------------------------------------

/** Số ảnh theo mặt, CHỈ khi máy chủ khai `have_kind === 'faces'`. Ngược lại `null`. */
export function facesOf(plan?: CapturePlan | null): FacesHave | null {
  if (!plan || plan.have_kind !== 'faces') return null;
  return (plan.have ?? {}) as FacesHave;
}

/** Độ phủ cây, CHỈ khi `have_kind === 'coverage'`. Ngược lại `null`. */
export function coverageOf(plan?: CapturePlan | null): CoverageHave | null {
  if (!plan || plan.have_kind !== 'coverage') return null;
  return (plan.have ?? {}) as CoverageHave;
}

/**
 * Mặt nên chụp tiếp, theo máy chủ. `null` = máy chủ không chỉ định mặt nào
 * (nhánh cây, hoặc đã đủ) → màn giữ nguyên lựa chọn của người dùng, KHÔNG tự đặt
 * bừa một mặt. Đây là chỗ thay cho việc viết cứng `'side'`.
 */
export function suggestedFace(plan?: CapturePlan | null): Exclude<FaceType, 'unknown'> | null {
  const v = plan?.next?.view_type;
  // `unknown` là một Ô ĐẾM ở `have` (ảnh cũ chưa khai mặt), KHÔNG phải mặt chụp
  // được. Để nó lọt ra đây là đặt cho bộ chọn một mặt không tồn tại trên quả.
  return v === 'bottom' || v === 'stem' || v === 'side' ? v : null;
}

/**
 * Câu hướng dẫn DUY NHẤT nên hiện to — chính chữ máy chủ đã viết sẵn
 * (`next.text_vi`), dùng được cho CẢ cây lẫn quả.
 *
 * `null` = KHÔNG có gì để nói, và màn phải im: chưa lấy được kế hoạch (mạng hỏng,
 * đối tượng chưa tồn tại), hoặc `action: 'done'` — máy chủ nói đủ rồi. Chỗ gọi
 * TUYỆT ĐỐI không được thay `null` bằng một câu tự viết: câu tự viết trông y hệt
 * câu của máy chủ nhưng không dựa trên số ảnh thật, nên nó sai mà không ai biết.
 *
 * Không lọc theo `action` nào khác `done`: `wait`/`need_light`/`blocked_wrong_target`
 * đều là việc người chụp phải làm ngay, và máy chủ đã viết sẵn câu cho từng cái.
 */
export function captureHint(plan?: CapturePlan | null): string | null {
  const next = plan?.next;
  if (!plan?.ok || !next) return null;
  if (next.action === 'done') return null;
  const text = (next.text_vi ?? '').trim();
  return text || null;
}

// ---------------------------------------------------------------------------
// Rút mã từ chối từ thân trả về — ba nguồn, ba chỗ đọc
// ---------------------------------------------------------------------------

/**
 * Rút `after_reject` từ thân mà `/api/enroll` hoặc `/api/verify_add` vừa trả.
 * `null` = không có mã nào đọc được ⇒ gọi kế hoạch THƯỜNG, đừng bịa mã.
 *
 * ⛔ KHÔNG dùng cho `/api/fruit/add_view`: cửa đó từ chối bằng HTTP 200 + `warn`
 * (`better_other`|`low_self`), hai mã máy chủ CHƯA dịch được. Đường quả hiện thẳng
 * trường `message` — nó đã là câu tiếng Việt hoàn chỉnh.
 */
export function rejectCodeOf(body: unknown): RejectCode | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as {
    heterogeneous?: unknown;
    quality_warnings?: Array<{ reasons?: unknown }>;
  };

  // 409 — trường boolean riêng ở ngoài cùng, KHÔNG nằm trong `reasons`.
  if (b.heterogeneous === true) return 'heterogeneous';

  // 422 — `quality_warnings[].reasons[]`. Lấy mã ĐẦU TIÊN đọc được của ảnh đầu tiên
  // có cảnh báo; máy chủ xếp `reasons` theo mức nặng nên phần tử [0] là cái đáng gỡ nhất.
  const warnings = Array.isArray(b.quality_warnings) ? b.quality_warnings : [];
  for (const w of warnings) {
    const reasons = Array.isArray(w?.reasons) ? w.reasons : [];
    for (const r of reasons) {
      if (typeof r === 'string' && REJECT_CODES.includes(r)) return r as RejectCode;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gọi
// ---------------------------------------------------------------------------

async function _authHeader(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/**
 * `GET /api/capture/plan`.
 *
 * KHÔNG thử lại ở 403/404/422 (thử lại vô ích) — chỉ thử lại đúng một lần khi
 * token hết hạn (401), giống mọi cửa OriLife khác.
 */
export async function getCapturePlan(
  baseUrl: string,
  targetType: CaptureTargetType,
  targetId: string,
  opts?: { afterReject?: RejectCode | null },
  attempt = 0,
): Promise<ApiResult<CapturePlan>> {
  const qs = new URLSearchParams({ target_type: targetType, target_id: targetId });
  // Mã lạ máy chủ bỏ qua chứ không 4xx — nhưng app vẫn chỉ gửi mã trong danh sách,
  // để một chuỗi rác lọt từ chỗ khác vào không âm thầm thành "kế hoạch thường".
  if (opts?.afterReject && REJECT_CODES.includes(opts.afterReject)) {
    qs.append('after_reject', opts.afterReject);
  }
  const url = `${baseUrl}/api/capture/plan?${qs.toString()}`;

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
        return getCapturePlan(baseUrl, targetType, targetId, opts, 1);
      }
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 403 || resp.status === 404 || resp.status === 422) {
      return {
        ok: false,
        error: { type: 'validation_error', detail: `Không lấy được kế hoạch (HTTP ${resp.status})`, http_status: resp.status },
      };
    }
    if (!resp.ok) {
      return { ok: false, error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status } };
    }
    return { ok: true, data: (await resp.json()) as CapturePlan };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isConn = err instanceof TypeError && !isTimeout;
    if (isConn && attempt === 0) return getCapturePlan(baseUrl, targetType, targetId, opts, 1);
    return { ok: false, error: { type: 'network_error', detail: String(err), http_status: 0 } };
  }
}
