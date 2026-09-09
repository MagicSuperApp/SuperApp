/**
 * treeProfileService — hồ sơ sinh trưởng của cây (`/api/tree/{tree_id}/profile`).
 *
 * ── VÌ SAO KHÔNG DÙNG `_apiCall` CỦA `farmService` ─────────────────────────
 * Gần hết cửa field-reid nhận `multipart/form-data`. Cửa này nhận **JSON**, và
 * đó là chủ ý của phía máy chủ chứ không phải lệch chuẩn. Đo trên lược đồ máy
 * sản xuất (`GET https://api.orilife.io/openapi.json`, 2026-09-08):
 *
 *   "Đây là cửa JSON (`Body(...)`), KHÔNG phải `multipart/form-data` như gần hết
 *    cửa khác trong kho — có chủ ý […]: ba trạng-thái "vắng/null/giá-trị" của MỖI
 *    trường chỉ phân-biệt được trong JSON, form không có khái-niệm null."
 *
 * Biểu mẫu không có `null`, nên nhét cửa này vào đường form là mất đúng cái trạng
 * thái thứ ba — và mất im lặng.
 *
 * ── BA TRẠNG THÁI CỦA MỖI TRƯỜNG — VẮNG ≠ RỖNG ────────────────────────────
 *   trường VẮNG mặt   ⟹ giữ nguyên giá trị cũ trên máy chủ
 *   trường = `null`   ⟹ XOÁ giá trị cũ
 *   trường = `""`     ⟹ 400
 *
 * Màn nhập (`TreeMetadataTab`) dựng đối tượng bằng cách **bỏ hẳn** khoá rỗng. Nên
 * gửi thẳng đối tượng đó lên là người dùng XOÁ một trường mà máy chủ đọc thành
 * "không đụng tới" — trên máy thì mất, trên máy chủ thì còn, và không có gì kêu.
 * Chỗ khử đúng là `buildTreeProfilePatch`: nó so bản CŨ với bản MỚI và tự sinh ra
 * `null` cho chỗ vừa bị xoá.
 *
 * ── `source: "declared"` LÀ CỦA MÁY CHỦ, KHÔNG PHẢI TRƯỜNG APP GỬI ────────
 * Mọi trường ở cửa này là lời NGƯỜI KHAI. Máy chủ tự đóng dấu; app **không** gửi
 * khoá `source` nào. Ngày máy suy được tuổi cây từ ảnh thì đó là nguồn khác và nó
 * không viết đè lên đây.
 *
 * ── GHI ÂM: CỬA NÀY KHÔNG NHẬN TỆP, VÀ NÓ NÓI RA ─────────────────────────
 * Thân JSON có nhắc tới ghi âm thì phản hồi mang `voice_memo: { accepted: false,
 * reason }`, nêu đích danh khoá nó đã thấy. Câu `reason` là **tiếng Việt dành cho
 * người dùng** — hiện nguyên văn, đừng thay bằng câu chung chung của app.
 *
 * App CỐ Ý gửi kèm hai khoá ghi âm để lấy đúng câu đó. Nhưng KHÔNG gửi
 * `voice_memo_path`: đó là đường tệp trên máy người dùng, máy chủ không dùng được
 * nó vào việc gì, và một đường dẫn cục bộ đi ra ngoài là một lần rò không cần trả.
 */

import { orilifeAuthHeaderValue } from './orilifeAuthHeader';
import type { APIError } from './treeReIDService';
import type { TreeMetadata } from '../modules/trace/types';

const REQUEST_TIMEOUT_MS = 45_000;

/** Sáu khoá NGƯỜI KHAI mà cửa này nhận. Ghi âm không nằm ở đây — xem đầu tệp. */
export const DECLARED_KEYS = [
  'variety',
  'variety_other',
  'age_years',
  'health_status',
  'last_harvest_date',
  'notes',
] as const;

export type DeclaredKey = (typeof DECLARED_KEYS)[number];

/** Thân gửi lên: khoá vắng = giữ, `null` = xoá. Không bao giờ chứa `""`. */
export type TreeProfilePatch = Partial<Record<DeclaredKey, string | number | null>>;

/** Khối máy chủ trả về khi thân có nhắc tới ghi âm. `reason` hiện NGUYÊN VĂN. */
export interface VoiceMemoVerdict {
  accepted: boolean;
  reason?: string;
}

export interface TreeProfileResult {
  ok: boolean;
  /** Hồ sơ máy chủ đọc lại sau khi ghi — sáu khoá, chỗ chưa khai là `null`. */
  profile?: Record<string, unknown>;
  voiceMemo?: VoiceMemoVerdict;
  error?: APIError;
}

/**
 * So bản cũ với bản mới, sinh ra thân gửi lên đúng ba trạng thái.
 *
 * Tách thành hàm THUẦN để ghim được bằng bài kiểm mà không cần dựng mạng: đây là
 * chỗ duy nhất biết "người dùng vừa xoá" khác "người dùng không đụng tới".
 */
export function buildTreeProfilePatch(
  previous: TreeMetadata | undefined,
  next: TreeMetadata,
): TreeProfilePatch {
  const patch: TreeProfilePatch = {};
  for (const key of DECLARED_KEYS) {
    const previousValue = previous?.[key];
    const nextValue = next[key];
    if (previousValue === nextValue) continue; // không đổi ⟹ VẮNG mặt trong thân
    // Chuỗi rỗng cũng là "vừa xoá". Gửi `""` lên là ăn 400 cho một thao tác hợp lệ.
    patch[key] = nextValue === undefined || nextValue === '' ? null : nextValue;
  }
  return patch;
}

/** Có ghi âm trên máy không — quyết định app có gửi kèm hai khoá ghi âm hay không. */
export const hasVoiceMemo = (m: TreeMetadata): boolean => Boolean(m.voice_memo_path);

/** Thân JSON đầy đủ: phần khai + (nếu có ghi âm) hai khoá để máy chủ nói ra lý do. */
export function buildTreeProfileBody(
  previous: TreeMetadata | undefined,
  next: TreeMetadata,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...buildTreeProfilePatch(previous, next) };
  if (hasVoiceMemo(next)) {
    // KHÔNG gửi `voice_memo_path` — xem đầu tệp.
    body.voice_memo_duration_s = next.voice_memo_duration_s ?? null;
    body.voice_memo_recorded_at = next.voice_memo_recorded_at ?? null;
  }
  return body;
}

async function requestJson(
  url: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: any; error?: APIError }> {
  const auth = await orilifeAuthHeaderValue();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth) headers.Authorization = auth;
  if (body) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutHandle);

    // Câu của máy chủ được ưu tiên hơn câu của app — nó nói được người dùng phải
    // làm gì, câu "có lỗi xảy ra" thì không.
    let parsed: any = null;
    try {
      parsed = await resp.json();
    } catch {
      parsed = null;
    }
    const serverMessage: string | undefined =
      typeof parsed?.detail === 'string'
        ? parsed.detail
        : typeof parsed?.message === 'string'
          ? parsed.message
          : undefined;

    if (resp.status === 401) {
      return {
        ok: false,
        error: {
          type: 'auth_error',
          detail: serverMessage ?? 'Phiên đăng nhập đã hết hạn',
          http_status: 401,
        },
      };
    }
    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      return {
        ok: false,
        error: {
          type: 'rate_limited',
          detail: serverMessage ?? 'Quá nhiều yêu cầu',
          http_status: 429,
          retry_after_seconds: retryAfter ? parseInt(retryAfter, 10) : 60,
        },
      };
    }
    if (resp.status === 400 || resp.status === 422) {
      return {
        ok: false,
        error: {
          type: 'validation_error',
          detail: serverMessage ?? 'Dữ liệu không hợp lệ',
          http_status: resp.status,
        },
      };
    }
    if (!resp.ok) {
      return {
        ok: false,
        error: {
          type: 'server_error',
          detail: serverMessage ?? `Lỗi máy chủ: HTTP ${resp.status}`,
          http_status: resp.status,
        },
      };
    }
    // 200 mà thân không đọc được thành JSON là một hình dạng LẠ, không phải một
    // hồ sơ rỗng — ném ra chỗ gọi thay vì trả về một khối trống trông như đã lưu.
    if (parsed === null) {
      return {
        ok: false,
        error: {
          type: 'server_error',
          detail: 'Máy chủ trả 200 nhưng thân không phải JSON',
          http_status: resp.status,
        },
      };
    }
    return { ok: true, data: parsed };
  } catch (e: any) {
    clearTimeout(timeoutHandle);
    const aborted = e?.name === 'AbortError';
    return {
      ok: false,
      error: {
        type: 'network_error',
        detail: aborted
          ? 'Máy chủ không trả lời kịp'
          : (e?.message ?? 'Không kết nối được máy chủ'),
        http_status: 0,
      },
    };
  }
}

/** `POST /api/tree/{tree_id}/profile` — ghi cả khối một lượt. */
export async function saveTreeProfile(
  baseUrl: string,
  treeId: string,
  body: Record<string, unknown>,
): Promise<TreeProfileResult> {
  const res = await requestJson(
    `${baseUrl}/api/tree/${encodeURIComponent(treeId)}/profile`,
    'POST',
    body,
  );
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    profile: res.data?.profile,
    voiceMemo: res.data?.voice_memo,
  };
}

/** `GET /api/tree/{tree_id}/profile` — đọc lại đúng thứ máy chủ đang giữ. */
export async function getTreeProfile(
  baseUrl: string,
  treeId: string,
): Promise<TreeProfileResult> {
  const res = await requestJson(
    `${baseUrl}/api/tree/${encodeURIComponent(treeId)}/profile`,
    'GET',
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, profile: res.data?.profile };
}
