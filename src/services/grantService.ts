/**
 * grantService — CHIA SẺ dữ liệu riêng của một cây / một vườn cho người khác.
 *
 * Backend: OriLife field-reid (Bearer):
 *   · `POST   /api/grant`            (`server.py:4522`) — cấp quyền, thân **form**
 *   · `DELETE /api/grant/{grant_id}` (`server.py:4563`) — thu hồi
 *   · `GET    /api/grants`           (`server.py:4612`) — danh sách hai chiều
 *   · `GET    /api/account/resolve`  (`server.py:4596`) — tra người theo TÊN
 *
 * VÌ SAO CÓ FILE NÀY. Không có nó, chủ vườn chỉ còn hai lựa chọn: mở công khai
 * toàn bộ, hoặc không cho ai xem. Người mua, hợp tác xã và đoàn kiểm tra đều rơi
 * vào khoảng giữa đó.
 *
 * ⚠️ CHỈ MỘT QUYỀN LÀ THẬT. Chú thích của route nhắc `read_private/moderate/
 * contribute`, nhưng kho grant khai `VALID_PERMS = {"read_private"}`
 * (`grant_store.py:32`) và `create()` LỌC ÂM THẦM mọi quyền ngoài tập đó
 * (`:146`). Gửi `moderate` ⟹ danh sách quyền rỗng ⟹ `create` trả `None` ⟹ HTTP
 * 400 "Grant không hợp-lệ" — một câu không hề nhắc tới quyền nào sai. Vì vậy hàm
 * ở đây **từ chối tại chỗ** thay vì gửi đi rồi đọc một câu lỗi lạc đề. Ngày máy
 * chủ mở thêm quyền thì sửa đúng `GRANT_PERMS` dưới đây, và bài kiểm sẽ đỏ nếu
 * ai đó nới ở chỗ khác.
 *
 * ⚠️ `grantee` KHÔNG phải tên người. Nó là `owner-ref` đục — `acct:<id>` hoặc
 * DID (`grant_store.py:45`). Người dùng gõ TÊN, app phải đổi tên → owner-ref qua
 * `/api/account/resolve` trước. Gửi thẳng tên vào `grantee` thì máy chủ vẫn tạo
 * grant (nó không kiểm người nhận có thật), và grant đó KHÔNG BAO GIỜ khớp ai —
 * chủ vườn tưởng đã chia sẻ, người kia không thấy gì, không có lỗi nào nổi lên.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';
import type { APIError, ApiResult } from './fruitReIDService';

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Kiểu — khớp ĐÚNG `grant_store.py:43-61` + phần làm giàu ở `server.py:4621-4624`
// ---------------------------------------------------------------------------

/** Phạm vi được chia sẻ. `VALID_SCOPES` (`grant_store.py:33`) — đúng hai giá trị. */
export type GrantScopeType = 'farm' | 'tree';

/** Quyền hợp lệ DUY NHẤT. Xem khối chú thích đầu tệp trước khi thêm giá trị. */
export type GrantPerm = 'read_private';

export const GRANT_PERMS: readonly GrantPerm[] = ['read_private'];
export const GRANT_SCOPES: readonly GrantScopeType[] = ['farm', 'tree'];

export interface Grant {
  grant_id: string;
  /** Người CẤP (owner-ref). */
  grantor: string;
  /** Người ĐƯỢC cấp (owner-ref, không phải tên). */
  grantee: string;
  scope_type: GrantScopeType;
  scope_id: string;
  perms: string[];
  created_at: string;
  /** `null` = không hết hạn, thu hồi chủ động. */
  expires_at: string | null;
  status: 'active' | 'revoked';
  revoked_at: string | null;
  revoked_by: string | null;

  // Ba trường máy chủ TÍNH SẴN để app khỏi phải nối bảng (`server.py:4621-4624`).
  // Đều best-effort ⇒ đều có thể vắng/`null`; xem `grantLabel`.
  /** `active` + chưa hết hạn, máy chủ tự tính theo giờ máy chủ. */
  live?: boolean;
  grantee_label?: string | null;
  grantor_label?: string | null;
  scope_label?: string | null;
}

export interface GrantListResponse {
  ok: boolean;
  grants: Grant[];
}

export interface GrantCreateResponse {
  ok: boolean;
  grant: Grant;
}

/** Người tra được theo tên. `owner` chính là thứ điền vào `grantee`. */
export interface AccountRef {
  owner: string;
  username: string;
}

/**
 * Ba nhánh cho phép tra tên. "Không có ai tên này" là một CÂU TRẢ LỜI (máy chủ
 * trả 404 đúng nghĩa đó), không phải một sự cố — người dùng cần nghe "chưa có ai
 * tên đó" chứ không phải "lỗi mạng".
 */
export type ResolveAccountResult =
  | { kind: 'found'; account: AccountRef }
  | { kind: 'not_found' }
  | { kind: 'error'; error: APIError };

// ---------------------------------------------------------------------------
// Đọc thân trả về
// ---------------------------------------------------------------------------

/**
 * Grant này còn hiệu lực không.
 *
 * Trả `null` khi máy chủ KHÔNG khai `live` — chứ không đoán bằng `status` ở đây.
 * `status === 'active'` mà đã quá `expires_at` thì grant đã chết, và so hai chuỗi
 * thời gian lệch múi giờ ở phía app là cách sai (`grant_store.py:74-88` phải
 * parse datetime thật mới so đúng). Không có `live` thì màn phải nói "không rõ",
 * không được vẽ một cái khoá đang mở.
 */
export function isGrantLive(g?: Grant | null): boolean | null {
  if (!g) return null;
  return typeof g.live === 'boolean' ? g.live : null;
}

/**
 * Tên để hiện thay cho owner-ref/UUID.
 *
 * Trả `null` khi máy chủ tra không ra — để chỗ gọi tự chọn hiện mã đục hay hiện
 * "không rõ". Trả chuỗi rỗng thì màn vẽ một ô trống trông y hệt tên bị mất.
 */
export function grantLabel(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

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
  method: 'GET' | 'POST' | 'DELETE',
  baseUrl: string,
  body?: FormData,
  attempt = 0,
): Promise<ApiResult<T>> {
  await ensureOrilifeToken(baseUrl);
  const auth = await _authHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth) headers['Authorization'] = auth;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.status === 401) {
      if (attempt === 0 && (await ensureOrilifeToken(baseUrl, { force: true }))) {
        return _apiCall<T>(url, method, baseUrl, body, 1);
      }
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }

    if (resp.status === 400 || resp.status === 403 || resp.status === 404 || resp.status === 422) {
      // Câu tiếng Việt của máy chủ nói rõ hơn bất cứ câu nào app tự soạn
      // ("Cây này không thuộc tài khoản của bạn."). Giữ nguyên, đừng nuốt.
      const b = (await resp.json().catch(() => null)) as { detail?: unknown } | null;
      const detail =
        typeof b?.detail === 'string' ? b.detail : `Không thực hiện được (HTTP ${resp.status})`;
      return {
        ok: false,
        error: { type: 'validation_error', detail, http_status: resp.status },
      };
    }

    if (!resp.ok) {
      return { ok: false, error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status } };
    }

    return { ok: true, data: (await resp.json()) as T };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isConn = err instanceof TypeError && !isTimeout;
    if (isConn && attempt === 0) return _apiCall<T>(url, method, baseUrl, body, 1);
    return { ok: false, error: { type: 'network_error', detail: String(err), http_status: 0 } };
  }
}

// ---------------------------------------------------------------------------
// Bốn cửa
// ---------------------------------------------------------------------------

/**
 * Tra owner-ref của một tài khoản theo TÊN CHÍNH XÁC.
 *
 * Máy chủ chỉ khớp tuyệt đối, không liệt kê, không tìm mờ (`server.py:4596`) —
 * cố ý, để cửa này không thành đường quét danh bạ người dùng. Nghĩa là gõ sai một
 * chữ cũng ra "không tìm thấy", màn phải nói rõ điều đó.
 */
export async function resolveAccount(
  baseUrl: string,
  username: string,
): Promise<ResolveAccountResult> {
  const uname = (username || '').trim();
  if (!uname) return { kind: 'not_found' };

  const url = `${baseUrl}/api/account/resolve?username=${encodeURIComponent(uname)}`;
  const r = await _apiCall<AccountRef & { ok: boolean }>(url, 'GET', baseUrl);
  if (r.ok && r.data?.owner) {
    return { kind: 'found', account: { owner: r.data.owner, username: r.data.username } };
  }
  if (r.error?.http_status === 404) return { kind: 'not_found' };
  return {
    kind: 'error',
    error: r.error ?? { type: 'server_error', detail: 'Không tra được tài khoản', http_status: 0 },
  };
}

/**
 * Cấp quyền xem dữ liệu riêng của một cây/vườn cho người khác.
 *
 * `grantee` phải là **owner-ref** (lấy từ `resolveAccount`), không phải tên gõ tay.
 * `ttlDays` bỏ trống = không hết hạn.
 *
 * Từ chối TẠI CHỖ (không gọi mạng) khi quyền hoặc phạm vi nằm ngoài danh sách —
 * xem khối chú thích đầu tệp: gửi đi thì máy chủ trả một câu 400 không nhắc tới
 * quyền, và người sửa đi tìm nhầm chỗ.
 */
export async function createGrant(
  baseUrl: string,
  params: {
    grantee: string;
    scopeType: GrantScopeType;
    scopeId: string;
    perms: GrantPerm[];
    ttlDays?: number | null;
  },
): Promise<ApiResult<GrantCreateResponse>> {
  const perms = params.perms.filter((p) => GRANT_PERMS.includes(p));
  if (perms.length !== params.perms.length || perms.length === 0) {
    return {
      ok: false,
      error: {
        type: 'validation_error',
        detail: 'Quyền không hợp lệ — hiện chỉ chia sẻ được quyền XEM dữ liệu riêng.',
        http_status: 0,
      },
    };
  }
  if (!GRANT_SCOPES.includes(params.scopeType)) {
    return {
      ok: false,
      error: {
        type: 'validation_error',
        detail: 'Chỉ chia sẻ được một VƯỜN hoặc một CÂY.',
        http_status: 0,
      },
    };
  }
  const grantee = (params.grantee || '').trim();
  const scopeId = (params.scopeId || '').trim();
  if (!grantee || !scopeId) {
    return {
      ok: false,
      error: { type: 'validation_error', detail: 'Thiếu người nhận hoặc phạm vi.', http_status: 0 },
    };
  }

  const form = new FormData();
  form.append('grantee', grantee);
  form.append('scope_type', params.scopeType);
  form.append('scope_id', scopeId);
  form.append('perms', perms.join(','));
  // Chỉ gửi khi có: chuỗi rỗng và trường vắng mặt là CÙNG nghĩa với máy chủ
  // (`server.py:4544-4545`), nên không gửi cho gọn.
  if (typeof params.ttlDays === 'number' && Number.isFinite(params.ttlDays) && params.ttlDays >= 1) {
    form.append('ttl_days', String(Math.floor(params.ttlDays)));
  }

  return _apiCall<GrantCreateResponse>(`${baseUrl}/api/grant`, 'POST', baseUrl, form);
}

/**
 * Thu hồi. CHỈ người đã cấp mới thu hồi được; người khác nhận 404 — máy chủ **cố
 * ý** không phân biệt "không có grant đó" với "grant đó không phải của bạn"
 * (`server.py:4563`), nên đừng dịch 404 ở đây thành "đã bị xoá rồi".
 */
export async function revokeGrant(
  baseUrl: string,
  grantId: string,
): Promise<ApiResult<{ ok: boolean }>> {
  const id = (grantId || '').trim();
  if (!id) {
    return {
      ok: false,
      error: { type: 'validation_error', detail: 'Thiếu mã chia sẻ.', http_status: 0 },
    };
  }
  return _apiCall<{ ok: boolean }>(
    `${baseUrl}/api/grant/${encodeURIComponent(id)}`,
    'DELETE',
    baseUrl,
  );
}

/**
 * Danh sách chia sẻ HAI CHIỀU: cả cái mình cấp cho người khác lẫn cái người khác
 * cấp cho mình (`server.py:4612`). Muốn tách hai nhóm thì so `grantor` với
 * owner-ref của chính mình — máy chủ KHÔNG chia sẵn.
 */
export async function listGrants(baseUrl: string): Promise<ApiResult<GrantListResponse>> {
  return _apiCall<GrantListResponse>(`${baseUrl}/api/grants`, 'GET', baseUrl);
}

/**
 * Tách danh sách hai chiều thành hai nhóm theo owner-ref của người đang đăng nhập.
 *
 * `me` rỗng/không biết ⟹ trả cả hai nhóm RỖNG kèm `unknown` giữ nguyên danh sách.
 * Đoán bừa ở đây là dựng ra câu "bạn đã chia sẻ cây này cho 3 người" trong khi
 * thật ra đó là ba người đã chia sẻ cây của họ cho bạn — nhầm đúng chiều ngược.
 */
export function splitGrants(
  grants: Grant[] | null | undefined,
  me: string | null | undefined,
): { given: Grant[]; received: Grant[]; unknown: Grant[] } {
  const list = Array.isArray(grants) ? grants : [];
  const owner = (me || '').trim();
  if (!owner) return { given: [], received: [], unknown: list };
  return {
    given: list.filter((g) => g.grantor === owner),
    received: list.filter((g) => g.grantee === owner),
    unknown: list.filter((g) => g.grantor !== owner && g.grantee !== owner),
  };
}
