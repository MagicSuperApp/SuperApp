// services/treeVisibilityService.ts
//
// BẬT CÔNG KHAI CHO CÂY — `POST /api/tree/set_visibility`.
//
// ── Vì sao đây là mắt xích ĐẦU TIÊN của truy xuất, không phải mắt xích phụ ────
// Đường tra cứu của người mua (`fruitLookupService.ts` → `/api/fruit/lookup`) có
// phạm vi = **quả thuộc cây mà chính nông dân đã bật công khai**. Nông dân chưa
// bật thì cửa đó trả `EMPTY_SCOPE` — không phải "không tìm thấy", mà là "chưa có
// gì trong tầm để mà tìm".
//
// Máy chủ đo trên kho sản xuất 08/2026 (`server.py:8325`):
//
//     139 cây — 54 riêng tư, 85 CHƯA ĐẶT, 0 công khai
//     ⟹ "bật route này lên là TRƠ, không phơi gì cả, cho tới khi có nông dân
//        đầu tiên tự bật."
//
// Và app thì trước bản này **chưa từng gọi cửa `set_visibility`** (grep
// `set_visibility` trong `src/` chỉ ra module chat, không liên quan). Tức là
// không có đường nào để nông dân bật — mắt xích đứt ngay khâu đầu.
//
// ── Đây là quyết định của NGƯỜI DÙNG, không phải mặc định của hệ ──────────────
// Máy chủ chọn "quả kế thừa mức công khai của cây mẹ" chính vì lý do đó
// (`server.py:8320`). Nên giao diện gọi tệp này PHẢI nói rõ hệ quả trước khi bật:
// công khai nghĩa là **mọi người lạ đem ảnh tới so được**, không chỉ là "có trang
// web để xem". Bật hộ, hoặc bật mà không giải thích, là lấy mất quyết định đó.
//
// ── Hạn mức, và vì sao 429 ở đây KHÔNG phải "máy chủ bận" ─────────────────────
// `PUBLISH_RL` = 50 cây / 24 giờ / tài khoản (`server.py:866`). Nó chặn đúng
// hành-động CHUYỂN SANG công khai, để bịt đường lạm dụng mà route tự nêu: tạo
// tài khoản → tải ảnh vườn người khác → enroll → bật công khai ⟹ bơm cây giả vào
// tầm khớp của mọi người.
//
// Nên 429 ở cửa này nghĩa là "hết suất công khai hôm nay", KHÔNG phải "thử lại
// sau vài giây". Hiện nhầm câu là đẩy nông dân bấm lại 50 lần vô ích.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Ba mức, đúng enum máy chủ (`server.py:4054`). Gửi chuỗi lạ → 400.
 *
 *   private              chỉ chủ thấy; quả KHÔNG bao giờ vào tầm tra cứu
 *   public_readonly      người lạ xem được, KHÔNG đóng góp được
 *   public_contributable người lạ còn gửi được đóng góp
 */
export type TreeVisibility = 'private' | 'public_readonly' | 'public_contributable';

/**
 * Mức lộ vị trí trên trang công khai (§8/§12.2).
 *
 *   none            không hiện toạ độ
 *   geohash_coarse  ô thô (mặc định an toàn)
 *   exact           toạ độ thật — chỉ khi chủ CHỦ ĐỘNG chọn (vd quán cà phê muốn
 *                   khách tìm tới). Đừng bao giờ đặt sẵn mức này.
 */
export type ExposeLocation = 'none' | 'geohash_coarse' | 'exact';

export const VISIBILITY_VALUES: readonly TreeVisibility[] = [
  'private',
  'public_readonly',
  'public_contributable',
];

export const EXPOSE_LOCATION_VALUES: readonly ExposeLocation[] = [
  'none',
  'geohash_coarse',
  'exact',
];

export function isPublicVisibility(v: TreeVisibility | string | null | undefined): boolean {
  return v === 'public_readonly' || v === 'public_contributable';
}

export type VisibilityErrorKind =
  | 'auth'          // 401 — chưa đăng nhập / phiên hết hạn
  | 'invalid'       // 400 — mức lạ
  | 'quota'         // 429 — HẾT SUẤT công khai trong 24 giờ, không phải "bận"
  | 'network'
  | 'server';

export interface VisibilityError {
  kind: VisibilityErrorKind;
  message: string;
  http_status?: number;
  /** Chỉ có với `quota`. Giây tới khi cửa sổ trượt nhả suất. */
  retry_after?: number;
}

export type VisibilityResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: VisibilityError };

async function authHeader(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return t ? `Bearer ${t}` : null;
  } catch {
    return null;
  }
}

function trimBase(base: string): string {
  return (base ?? '').trim().replace(/\/+$/, '');
}

/**
 * Đặt mức công khai cho một cây.
 *
 * `expose_location` và `public_card` là TUỲ CHỌN — không gửi thì máy chủ giữ
 * nguyên giá trị đang có. Cố ý không đặt mặc định ở phía app: gửi kèm một giá trị
 * mà người dùng không chọn là âm thầm đổi hộ họ một thiết lập khác.
 *
 * `public_card`: cây RIÊNG TƯ có cho người cầm mã thấy THẺ TỐI THIỂU (loài, vùng
 * thô ~39 km, đã neo chuỗi chưa) không. Máy chủ mặc định CÓ, vì QR đã dán ngoài
 * vườn mà trả 404 thì "mặt tiền của hệ nói dối người mua" (#195).
 *
 * KHÔNG ném — trả `{ ok: false, error }`.
 */
export async function setTreeVisibility(
  baseUrl: string,
  treeId: string,
  visibility: TreeVisibility,
  opts?: { exposeLocation?: ExposeLocation; publicCard?: boolean },
  attempt = 0,
): Promise<VisibilityResult> {
  const b = trimBase(baseUrl);
  if (!b) return { ok: false, error: { kind: 'server', message: 'Chưa cấu hình máy chủ.' } };
  if (!treeId) return { ok: false, error: { kind: 'invalid', message: 'Thiếu mã cây.' } };
  // Chặn ở máy để khỏi tốn một vòng mạng cho một giá trị chắc chắn bị 400.
  if (!VISIBILITY_VALUES.includes(visibility)) {
    return { ok: false, error: { kind: 'invalid', message: `Mức công khai lạ: ${visibility}` } };
  }

  await ensureOrilifeToken(b);
  const auth = await authHeader();

  const form = new FormData();
  form.append('tree_id', treeId);
  form.append('visibility', visibility);
  if (opts?.exposeLocation) form.append('expose_location', opts.exposeLocation);
  if (opts?.publicCard !== undefined) form.append('public_card', opts.publicCard ? '1' : '0');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (auth) headers.Authorization = auth;

    const resp = await fetch(`${b}/api/tree/set_visibility`, {
      method: 'POST',
      headers,
      body: form,
      signal: ctrl.signal,
    });

    if (resp.status === 401) {
      // Ký lại bằng DID đúng MỘT lần rồi thử lại — khớp cách `fruitReIDService` xử lý.
      if (attempt === 0 && (await ensureOrilifeToken(b, { force: true }))) {
        clearTimeout(timer);
        return setTreeVisibility(baseUrl, treeId, visibility, opts, 1);
      }
      return { ok: false, error: { kind: 'auth', message: 'Phiên hết hạn.', http_status: 401 } };
    }

    if (resp.status === 429) {
      let retry: number | undefined;
      try {
        const body = await resp.json();
        if (typeof body?.retry_after === 'number') retry = body.retry_after;
      } catch {
        /* thân không đọc được */
      }
      if (retry === undefined) {
        const h = resp.headers.get('Retry-After');
        if (h) retry = parseInt(h, 10);
      }
      return {
        ok: false,
        error: {
          kind: 'quota',
          // Nói ĐÚNG chuyện gì xảy ra. "Thử lại sau" ở đây là câu sai — cửa sổ là 24 giờ.
          message: 'Đã hết suất mở công khai trong 24 giờ (tối đa 50 cây).',
          http_status: 429,
          retry_after: retry,
        },
      };
    }

    if (resp.status === 400) {
      let msg = 'Máy chủ từ chối mức công khai này.';
      try {
        const body = await resp.json();
        if (typeof body?.detail === 'string' && body.detail) msg = body.detail;
      } catch {
        /* giữ câu mặc định */
      }
      return { ok: false, error: { kind: 'invalid', message: msg, http_status: 400 } };
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: { kind: 'server', message: `Máy chủ trả HTTP ${resp.status}.`, http_status: resp.status },
      };
    }

    let data: Record<string, unknown> = {};
    try {
      data = (await resp.json()) as Record<string, unknown>;
    } catch {
      // 200 mà thân rỗng vẫn là thành công — cửa này trả trạng thái, không trả dữ liệu bắt buộc.
    }
    return { ok: true, data };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return {
      ok: false,
      error: {
        kind: 'network',
        message: aborted ? 'Quá hạn chờ máy chủ.' : 'Không nối được máy chủ.',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
