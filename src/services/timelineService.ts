/**
 * timelineService — DÒNG THỜI GIAN của một cây / quả / vườn.
 *
 * Đây là thứ người mua nhìn vào để tin: mọi việc đã xảy ra với một cây, xếp theo
 * thời gian, móc-xích bằng băm nên sửa một mắt là gãy cả chuỗi.
 *
 * ── Hợp đồng (đọc từ MÃ MÁY CHỦ, không suy từ tên hàm) ────────────────────────
 *   GET /api/{entity_type}/{entity_id}/timeline          (Bearer, BẮT BUỘC)
 *     → 200 { ok, entity_type, entity_id, events[], chain_ok, is_owner }
 *
 *   Nguồn: OriLife-Core/MassTreeIdentify/core/timeline_router.py:164-176
 *          (thân trả về ở :173-175), và hình dạng một `event` ở
 *          timeline_store.py:255-272.
 *
 *   `entity_type` hợp lệ: tree · fruit · farm · animal · plot
 *     (timeline_router.py:57 `VALID_ENTITY_TYPES`)
 *   `kind` hợp lệ: enroll · care · flowering · fruiting · harvest · observe ·
 *                  note · media · transfer   (timeline_store.py:55-58;
 *                  `:242` ép mọi giá trị lạ về `observe`, nên app KHÔNG cần
 *                  chặn trước — nhưng vẫn phải chịu được `kind` chưa biết vì
 *                  máy chủ có thể thêm loại mới trước app.)
 *
 * ── RỌC-PHÁCH: khách và chủ nhận HAI thân khác nhau ───────────────────────────
 * Khách chỉ thấy event `visibility=public` VÀ `review=approved`; và với khách,
 * máy chủ LƯỢC luôn `prev_hash`/`leaf_hash` (`timeline_store.py:373-380`).
 * ⇒ chuỗi băm KHÔNG kiểm lại được ở phía khách, nên đừng hiện chữ "đã kiểm chuỗi"
 * dựa trên việc app tự băm; chỉ hiện lại `chain_ok` mà máy chủ trả, và nói rõ đó
 * là lời của máy chủ.
 *
 * ── Đường này đã sống chưa ────────────────────────────────────────────────────
 * Router nạp CÓ ĐIỀU KIỆN (`server.py:1072,1124-1129`) nên có thể vắng mà không
 * ai biết. Đo 2026-08-11 trên bản đang chạy: đường có mặt trong
 * `https://api.orilife.io/openapi.json` (131 đường), và gọi thẳng trả
 * `401 {"error":"Cần đăng nhập."}` — tức route tồn tại và đang đòi phiên, không
 * phải 404. Chưa đo được THÂN 200 vì cần phiên DID của một máy thật.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { APIError } from './treeReIDService';

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 30_000;

/** Loại thực thể có dòng thời gian (timeline_router.py:57). */
export type TimelineEntityType = 'tree' | 'fruit' | 'farm' | 'animal' | 'plot';

/**
 * Loại sự kiện. Để `| string` CỐ Ý: máy chủ có thể thêm loại mới trước khi app
 * cập nhật, và một `kind` lạ phải hiện ra được chứ không được rơi mất.
 */
export type TimelineKind =
  | 'enroll' | 'care' | 'flowering' | 'fruiting' | 'harvest'
  | 'observe' | 'note' | 'media' | 'transfer'
  | string;

export interface TimelineEvent {
  event_id: string;
  entity_id?: string;
  entity_type?: string;
  kind: TimelineKind;
  /** Chuỗi ISO (`timeline_store.py:260` `_now_iso()`), KHÔNG phải epoch. */
  ts: string;
  author_did?: string;
  payload?: Record<string, unknown>;
  media?: unknown[];
  gps?: unknown;
  quality?: unknown;
  visibility?: 'public' | 'private' | string;
  review?: 'approved' | 'pending' | 'rejected' | string;
  anchor_now?: boolean;
  /** Chỉ có ở góc nhìn CHỦ — khách bị lược (timeline_store.py:373-380). */
  prev_hash?: string;
  leaf_hash?: string;
}

export interface TimelineResult {
  entity_type: string;
  entity_id: string;
  events: TimelineEvent[];
  /** Máy chủ tự kiểm chuỗi băm gốc. Đây là LỜI CỦA MÁY CHỦ, app không tự kiểm được. */
  chain_ok: boolean;
  is_owner: boolean;
}

async function _authHeader(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/**
 * Kéo dòng thời gian của 1 thực thể. KHÔNG ném — mọi lỗi gói vào `error` để màn
 * tự quyết hiện gì (dòng thời gian là phần bổ sung, hỏng nó không được làm hỏng
 * cả màn chi tiết cây).
 */
export async function fetchTimeline(
  baseUrl: string,
  entityType: TimelineEntityType,
  entityId: string,
): Promise<{ ok: boolean; data?: TimelineResult; error?: APIError }> {
  const authHeader = await _authHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers.Authorization = authHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url =
      `${baseUrl}/api/${encodeURIComponent(entityType)}` +
      `/${encodeURIComponent(entityId)}/timeline`;
    const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);

    if (resp.status === 401) {
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 404) {
      // Router nạp CÓ ĐIỀU KIỆN phía máy chủ — 404 ở đây nghĩa là bản đang chạy
      // không bật dòng thời gian, KHÁC hẳn "cây này chưa có sự kiện nào" (200 +
      // mảng rỗng). Hai thứ đó phải hiện khác nhau, đừng gộp làm một.
      return {
        ok: false,
        error: { type: 'validation_error', detail: 'Máy chủ chưa bật dòng thời gian', http_status: 404, error_code: 'timeline_off' },
      };
    }
    if (resp.status >= 500) {
      return { ok: false, error: { type: 'server_error', detail: `Lỗi máy chủ: HTTP ${resp.status}`, http_status: resp.status } };
    }
    if (!resp.ok) {
      return { ok: false, error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status } };
    }

    const body = await resp.json().catch(() => ({} as any));
    // HAI TẦNG `ok`: `resp.ok` là cờ HTTP, `body.ok` là cờ nghiệp vụ. Máy chủ này
    // trả `{"ok": false, ...}` kèm HTTP 200 ở vài đường (xem thân 401 ở trên cũng
    // có `ok:false`), nên chỉ đọc `resp.ok` là bỏ sót.
    if (body?.ok === false) {
      return {
        ok: false,
        error: { type: 'server_error', detail: String(body?.error ?? body?.detail ?? 'Máy chủ từ chối'), http_status: resp.status },
      };
    }

    const events: TimelineEvent[] = Array.isArray(body?.events) ? body.events : [];
    return {
      ok: true,
      data: {
        entity_type: typeof body?.entity_type === 'string' ? body.entity_type : entityType,
        entity_id: typeof body?.entity_id === 'string' ? body.entity_id : entityId,
        events,
        chain_ok: body?.chain_ok === true,
        is_owner: body?.is_owner === true,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return { ok: false, error: { type: 'network_error', detail: String(err), http_status: 0 } };
  }
}

/** Nhãn tiếng Việt cho `kind`. Loại lạ → trả lại chính chuỗi đó, KHÔNG nuốt. */
export const KIND_VI: Record<string, string> = {
  enroll: 'Đăng ký cây',
  care: 'Chăm sóc',
  flowering: 'Ra hoa',
  fruiting: 'Đậu quả',
  harvest: 'Thu hoạch',
  observe: 'Ghi nhận',
  note: 'Ghi chú',
  media: 'Thêm ảnh/video',
  transfer: 'Chuyển giao',
};

/**
 * Biểu tượng theo `kind`. Tên lấy TỪ BỘ ĐÃ SINH (`components/Icon/icons.generated.ts`,
 * Font Awesome Solid, 140 tên) — tên ngoài bộ đó render ra RỖNG kèm cảnh báo chỉ ở
 * bản DEV, tức ở bản phát hành nó là một ô trống câm. `KIND_FALLBACK_ICON` dùng cho
 * `kind` mà máy chủ thêm sau này.
 */
export const KIND_ICON: Record<string, string> = {
  enroll: 'seedling',
  care: 'spray-can',
  flowering: 'spa',
  fruiting: 'apple-whole',
  harvest: 'basket-shopping',
  observe: 'eye',
  note: 'file-pen',
  media: 'images',
  transfer: 'share-nodes',
};

export const KIND_FALLBACK_ICON = 'circle';

/**
 * Sắp xếp MỚI NHẤT TRƯỚC để hiện. Trả mảng mới, không sửa mảng gốc — thứ tự gốc
 * là thứ tự móc-xích băm, đảo nó tại chỗ là phá luôn khả năng đối chiếu chuỗi.
 * Sự kiện thiếu/hỏng `ts` bị đẩy xuống cuối thay vì làm hỏng phép so sánh.
 */
export function sortNewestFirst(events: TimelineEvent[]): TimelineEvent[] {
  const at = (e: TimelineEvent): number => {
    const t = Date.parse(e?.ts ?? '');
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...events].sort((a, b) => at(b) - at(a));
}
