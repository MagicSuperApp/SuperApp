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

/**
 * GHI một sự kiện vào dòng thời gian của thực thể.
 *
 *   POST /api/{entity_type}/{entity_id}/event   (Bearer BẮT BUỘC)
 *   thân: object tự do (`additionalProperties: true`) — máy chủ đọc `kind`,
 *   `payload`, `media`, `ts`; `kind` lạ bị ép về `observe`.
 *
 * Đo trên bản đang chạy 2026-08-15: đường có trong
 * `https://api.orilife.io/openapi.json` (139 đường), tag `timeline`, mô tả của
 * chính máy chủ: "owner TỪ auth (chống IDOR)" và thực thể CHƯA đăng ký (chưa
 * enroll) bị trả **403** để không ai tạo sự kiện đầu nhằm chiếm quyền chủ.
 * ⇒ 403 ở đây KHÔNG phải lỗi mạng: nó nghĩa là cây/vườn này chưa đăng ký lên
 * máy chủ. Màn phải nói đúng như vậy, đừng gộp vào "lỗi không rõ".
 *
 * KHÔNG ném — mọi lỗi gói vào `error` để nơi gọi tự quyết giữ hàng đợi hay báo.
 */
export async function addTimelineEvent(
  baseUrl: string,
  entityType: TimelineEntityType,
  entityId: string,
  body: { kind: TimelineKind; ts?: string; payload?: Record<string, unknown>; media?: unknown[] },
): Promise<{ ok: boolean; event_id?: string; error?: APIError }> {
  const authHeader = await _authHeader();
  if (!authHeader) {
    return { ok: false, error: { type: 'auth_error', detail: 'Chưa đăng nhập', http_status: 401 } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url =
      `${baseUrl}/api/${encodeURIComponent(entityType)}` +
      `/${encodeURIComponent(entityId)}/event`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.status === 401) {
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 403) {
      return {
        ok: false,
        error: {
          type: 'validation_error',
          detail: 'Thực thể này chưa đăng ký trên máy chủ',
          http_status: 403,
          error_code: 'entity_not_enrolled',
        },
      };
    }
    if (resp.status === 404) {
      return {
        ok: false,
        error: { type: 'validation_error', detail: 'Máy chủ chưa bật dòng thời gian', http_status: 404, error_code: 'timeline_off' },
      };
    }
    if (!resp.ok) {
      return {
        ok: false,
        error: {
          type: resp.status >= 500 ? 'server_error' : 'validation_error',
          detail: `HTTP ${resp.status}`,
          http_status: resp.status,
        },
      };
    }

    const json = await resp.json().catch(() => ({} as any));
    // Cùng bẫy HAI TẦNG `ok` như `fetchTimeline`: máy chủ này trả `{"ok": false}`
    // kèm HTTP 200 ở vài đường.
    if (json?.ok === false) {
      return {
        ok: false,
        error: { type: 'server_error', detail: String(json?.error ?? json?.detail ?? 'Máy chủ từ chối'), http_status: resp.status },
      };
    }
    return { ok: true, event_id: typeof json?.event_id === 'string' ? json.event_id : undefined };
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

// ═══════════════════════════════════════════════════════════════════════════
// BẰNG CHỨNG của một sự kiện — hai cửa còn lại của bộ dòng thời gian
// ═══════════════════════════════════════════════════════════════════════════
//
//   GET  /api/{entity_type}/{entity_id}/proof/{event_id}
//   POST /api/{entity_type}/{entity_id}/event/{event_id}/anchor
//
// Hai cửa này bù nốt chỗ hổng của `fetchTimeline`: dòng thời gian nói ĐÃ CÓ
// những gì, còn hai cửa dưới nói LẤY GÌ CHỨNG MINH. Chúng dùng chung đúng bộ
// `entity_type` (`tree · fruit · farm · animal · plot`) với timeline — nên nếu
// máy chủ thêm loại thực thể mới thì cả ba cửa nhận được cùng lúc.

/** Một mắt trên đường Merkle: băm anh em + nó nằm bên nào. */
export interface ProofPathNode {
  hash: string;
  /** `left`/`right` — thiếu thì KHÔNG tự đoán, xem chú thích `EventProof.path`. */
  side?: 'left' | 'right' | string;
}

/** Neo on-chain của một sự kiện (hoặc của lô chứa nó). */
export interface EventAnchor {
  /** `anchored` · `pending` · `none` — tên do máy chủ đặt, đừng ép về boolean. */
  status?: string;
  network?: string;
  tx_hash?: string;
  block_height?: number;
  /** Thời điểm neo, chuỗi ISO. */
  ts?: string;
  /** Đường xem giao dịch. CHỈ mở qua `safeExplorerUrl()`. */
  explorer_url?: string | null;
  [k: string]: unknown;
}

/**
 * Bằng chứng của MỘT sự kiện.
 *
 * ⚠ `path` có thể vắng hoặc rỗng ở hai ca RẤT khác nhau: sự kiện chưa vào lô nào
 * (chưa có cây Merkle để đi), và máy chủ lược bớt cho khách (cùng luật rọc-phách
 * đã lược `prev_hash`/`leaf_hash` ở `fetchTimeline`). App KHÔNG phân biệt được
 * hai ca đó, nên đừng viết câu nào hàm ý "sự kiện này không có bằng chứng" —
 * câu đúng là "chưa lấy được đường chứng minh".
 *
 * ⚠ Và app KHÔNG tự kiểm lại được cây Merkle: `leaf_hash` do chính máy chủ băm,
 * còn app không giữ nội dung gốc của sự kiện dưới dạng chuẩn hoá byte-cho-byte.
 * Thứ duy nhất kiểm được ĐỘC LẬP là `tx_hash` trên trình duyệt chuỗi — vì vậy
 * `explorer_url` mới là nút quan trọng nhất của màn bằng chứng, không phải bảng
 * băm dài loằng ngoằng.
 */
export interface EventProof {
  event_id: string;
  entity_type?: string;
  entity_id?: string;
  leaf_hash?: string;
  prev_hash?: string;
  merkle_root?: string;
  path?: ProofPathNode[];
  anchor?: EventAnchor | null;
  /** Máy chủ tự kiểm chuỗi băm. LỜI CỦA MÁY CHỦ — app không kiểm lại được. */
  chain_ok?: boolean;
  [k: string]: unknown;
}

/**
 * Kết quả xin neo. `already_anchored` KHÔNG phải lỗi.
 *
 * Máy chủ trả 409 khi sự kiện đã neo rồi. Với người dùng thì đó là chuyện tốt
 * ("xong rồi"), nên gói nó vào nhánh thành công kèm cờ, thay vì đẩy ra `error` để
 * màn hình hiện chữ đỏ cho một việc đã hoàn tất.
 */
export interface AnchorResult extends EventAnchor {
  already_anchored?: boolean;
}

/**
 * URL trình duyệt chuỗi, ĐÃ LỌC. `null` = không có gì an toàn để mở.
 *
 * Cùng lý do như ở `fruitLookupService.safeExplorerUrl`: chuỗi này do máy chủ gửi
 * và đi thẳng vào `Linking.openURL`. Chỉ `http`/`https` được qua.
 */
export function safeExplorerUrl(a: EventAnchor | null | undefined): string | null {
  const raw = typeof a?.explorer_url === 'string' ? a.explorer_url.trim() : '';
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return null;
  return raw;
}

/**
 * Sự kiện này đã neo chưa: `true` · `false` · `null` (CHƯA BIẾT).
 *
 * Ba giá trị, cùng luật với `provenanceService.isAnchored`. Có `tx_hash` là đã
 * neo, dù `status` viết gì; không có `anchor` thì không kết luận.
 */
export function anchorState(a: EventAnchor | null | undefined): boolean | null {
  if (!a || typeof a !== 'object') return null;
  if (typeof a.tx_hash === 'string' && a.tx_hash.trim().length > 0) return true;
  if (typeof a.status === 'string') {
    if (a.status === 'anchored' || a.status === 'confirmed') return true;
    if (a.status === 'pending' || a.status === 'none' || a.status === 'unanchored') return false;
  }
  return null;
}

function _proofUrl(
  baseUrl: string,
  entityType: TimelineEntityType,
  entityId: string,
  eventId: string,
): string {
  return (
    `${baseUrl}/api/${encodeURIComponent(entityType)}` +
    `/${encodeURIComponent(entityId)}/proof/${encodeURIComponent(eventId)}`
  );
}

/**
 * Lấy bằng chứng của MỘT sự kiện.
 *
 * Gửi Bearer NẾU CÓ, nhưng không đòi: người mua quét mã trên thùng hàng phải xem
 * được bằng chứng của sự kiện công khai mà không cần tài khoản — cùng lý lẽ với
 * hai cửa công khai ở `provenanceService`. Chưa đăng nhập mà máy chủ vẫn chặn thì
 * nó trả 401/403 và câu lỗi là của máy chủ, không phải của app đoán trước.
 *
 * KHÔNG ném.
 */
export async function fetchEventProof(
  baseUrl: string,
  entityType: TimelineEntityType,
  entityId: string,
  eventId: string,
): Promise<{ ok: boolean; data?: EventProof; error?: APIError }> {
  const id = (eventId ?? '').trim();
  if (!id) {
    return { ok: false, error: { type: 'validation_error', detail: 'Thiếu mã sự kiện', http_status: 0 } };
  }

  const authHeader = await _authHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers.Authorization = authHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(_proofUrl(baseUrl, entityType, entityId, id), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        error: {
          type: 'auth_error',
          detail: 'Bằng chứng này không công khai',
          http_status: resp.status,
        },
      };
    }
    if (resp.status === 404) {
      // Gộp đúng hai ca máy chủ cố ý gộp: không có sự kiện đó, và có nhưng không
      // cho xem. App không tách được — nên câu hiện lên phải KHÔNG khẳng định sự
      // kiện không tồn tại.
      return {
        ok: false,
        error: {
          type: 'validation_error',
          detail: 'Không lấy được bằng chứng của sự kiện này',
          http_status: 404,
          error_code: 'proof_not_available',
        },
      };
    }
    if (resp.status >= 500) {
      return { ok: false, error: { type: 'server_error', detail: `Lỗi máy chủ: HTTP ${resp.status}`, http_status: resp.status } };
    }
    if (!resp.ok) {
      return { ok: false, error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status } };
    }

    const body = await resp.json().catch(() => ({} as any));
    if (body?.ok === false) {
      return {
        ok: false,
        error: { type: 'server_error', detail: String(body?.error ?? body?.detail ?? 'Máy chủ từ chối'), http_status: resp.status },
      };
    }

    // Máy chủ có thể gói dưới `proof` hoặc trải phẳng — nhận cả hai, vì đoán sai
    // chỗ này thì màn bằng chứng trống trơn mà không có gì báo.
    const p = (body?.proof && typeof body.proof === 'object' ? body.proof : body) as Record<string, unknown>;
    return {
      ok: true,
      data: {
        ...p,
        event_id: typeof p?.event_id === 'string' ? p.event_id : id,
        entity_type: typeof p?.entity_type === 'string' ? p.entity_type : entityType,
        entity_id: typeof p?.entity_id === 'string' ? p.entity_id : entityId,
        path: Array.isArray(p?.path) ? (p.path as ProofPathNode[]) : undefined,
        anchor: p?.anchor && typeof p.anchor === 'object' ? (p.anchor as EventAnchor) : null,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return { ok: false, error: { type: 'network_error', detail: String(err), http_status: 0 } };
  }
}

/**
 * Xin NEO một sự kiện lên chuỗi. CẦN đăng nhập, và chỉ chủ mới neo được.
 *
 * ── Ba điều phải biết trước khi gọi ─────────────────────────────────────────
 *
 * 1. **Neo là việc TỐN TIỀN và KHÔNG hoàn tác.** Mỗi lượt là một giao dịch trên
 *    chuỗi. Đừng gọi tự động sau khi ghi sự kiện, và đừng thử lại trong vòng lặp
 *    khi mạng chập chờn: một lượt gọi hỏng giữa chừng có thể ĐÃ vào hàng đợi phía
 *    máy chủ, gọi lại là nguy cơ trả tiền hai lần cho một sự kiện.
 *
 * 2. **Trả về thường là `pending`, không phải `anchored`.** Chuỗi cần thời gian
 *    xác nhận. Màn hình phải hiện "đang neo" và để người dùng quay lại xem sau
 *    bằng `fetchEventProof`, chứ không đứng chờ quay vòng.
 *
 * 3. **409 = đã neo rồi** → trả `{ ok: true, already_anchored: true }`. Với người
 *    dùng đó là việc đã xong, không phải lỗi.
 *
 * KHÔNG ném.
 */
export async function anchorEvent(
  baseUrl: string,
  entityType: TimelineEntityType,
  entityId: string,
  eventId: string,
): Promise<{ ok: boolean; data?: AnchorResult; error?: APIError }> {
  const id = (eventId ?? '').trim();
  if (!id) {
    return { ok: false, error: { type: 'validation_error', detail: 'Thiếu mã sự kiện', http_status: 0 } };
  }

  const authHeader = await _authHeader();
  if (!authHeader) {
    return { ok: false, error: { type: 'auth_error', detail: 'Chưa đăng nhập', http_status: 401 } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url =
      `${baseUrl}/api/${encodeURIComponent(entityType)}` +
      `/${encodeURIComponent(entityId)}/event/${encodeURIComponent(id)}/anchor`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: authHeader },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.status === 401) {
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 403) {
      return {
        ok: false,
        error: {
          type: 'validation_error',
          detail: 'Chỉ chủ của thực thể này mới neo được',
          http_status: 403,
          error_code: 'not_owner',
        },
      };
    }
    if (resp.status === 409) {
      const body = await resp.json().catch(() => ({} as any));
      const a = (body?.anchor && typeof body.anchor === 'object' ? body.anchor : body) as EventAnchor;
      return { ok: true, data: { ...a, already_anchored: true } };
    }
    if (resp.status === 402) {
      // Hết hạn mức / ví không đủ. Câu của máy chủ nói rõ hơn bất cứ câu nào app
      // tự soạn (nó biết còn bao nhiêu lượt), nên giữ nguyên.
      let detail = 'Không đủ hạn mức để neo';
      try { detail = String((await resp.json())?.detail ?? detail); } catch { /* bỏ qua */ }
      return { ok: false, error: { type: 'validation_error', detail, http_status: 402, error_code: 'insufficient_funds' } };
    }
    if (resp.status === 404) {
      return {
        ok: false,
        error: { type: 'validation_error', detail: 'Máy chủ chưa bật neo sự kiện', http_status: 404, error_code: 'anchor_off' },
      };
    }
    if (resp.status === 429) {
      const ra = resp.headers.get('Retry-After');
      return {
        ok: false,
        error: {
          type: 'rate_limited',
          detail: 'Quá nhiều lượt neo',
          http_status: 429,
          retry_after_seconds: ra ? parseInt(ra, 10) : 60,
        },
      };
    }
    if (!resp.ok) {
      return {
        ok: false,
        error: {
          type: resp.status >= 500 ? 'server_error' : 'validation_error',
          detail: `HTTP ${resp.status}`,
          http_status: resp.status,
        },
      };
    }

    const body = await resp.json().catch(() => ({} as any));
    if (body?.ok === false) {
      return {
        ok: false,
        error: { type: 'server_error', detail: String(body?.error ?? body?.detail ?? 'Máy chủ từ chối'), http_status: resp.status },
      };
    }
    const a = (body?.anchor && typeof body.anchor === 'object' ? body.anchor : body) as EventAnchor;
    return { ok: true, data: { ...a, already_anchored: false } };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return { ok: false, error: { type: 'network_error', detail: String(err), http_status: 0 } };
  }
}
