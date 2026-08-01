/**
 * treeViewsService — Lấy ẢNH TỪNG GÓC của 1 cây TỪ SERVER (chống "đổi máy mất ảnh").
 *
 * Vì sao cần: màn TreeDetail trước đây chỉ dựng "ẢNH CÂY" từ treeImageStore (AsyncStorage
 * cục-bộ) + `tree.images` (mà `/api/trees` KHÔNG trả URL ảnh → luôn rỗng). Đổi máy / xoá app
 * = mất sạch ảnh cây. Backend giữ đủ ảnh mỗi góc; route này kéo chúng về nên ảnh sống theo
 * TÀI KHOẢN, không theo máy.
 *
 * Contract (orilife-core MassTreeIdentify, server.py:3018 — ĐÃ LIVE prod `b38496f`, KHÔNG
 * phải PR #251):
 *   GET /api/tree_views?tree_id={id}[&describe=1]     (Bearer, chỉ chủ cây — 403 nếu không)
 *     → 200 { tree_id, n, views: [ { idx, score, ts, img, url, features_vi? } ] }
 *        url        = "/gimg/{tid}/imgs/NNN_..jpg" (đường DẪN TƯƠNG ĐỐI — caller ghép baseUrl)
 *        score      = điểm self-consistency của ảnh so với phần còn lại (thấp = nên xoá)
 *        features_vi= (chỉ khi describe=1, LAZY) câu tiếng Việt mô-tả đặc-điểm nhận-dạng
 *                     hình-học của ảnh (góc cành, đếm/vị-trí quả). GIẤU embedding/score nội-tạng.
 *
 * `describe=1` là ADDITIVE: prod cũ chưa có param vẫn bỏ-qua an-toàn (FastAPI lờ query lạ),
 * bản `b38496f` đã có. Mặc-định TẮT để route nhanh; bật khi màn cần hiện đặc-điểm nhận-dạng.
 *
 * Auth: Bearer `auth_token` (cùng treeReIDService/treeVideoService). Caller ensureOrilifeToken trước.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { APIError } from './treeReIDService';

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 45_000;

/** Một ảnh-góc của cây + điểm + (tuỳ) mô-tả đặc-điểm tiếng Việt. */
export interface TreeView {
  idx: number;
  /** Điểm self-consistency (thấp = ảnh lệch, gợi ý xoá cho cây tự cải-thiện chữ-ký). */
  score?: number;
  ts?: number;
  /** Đường-dẫn ảnh tương-đối trong STORE (vd "{tid}/imgs/003_enroll_..jpg"). */
  img?: string | null;
  /** URL phục-vụ ảnh, TƯƠNG ĐỐI ("/gimg/..") — ghép baseUrl để hiển thị. null nếu thiếu ảnh. */
  url?: string | null;
  /** Chỉ có khi gọi describe=1: câu Việt mô-tả đặc-điểm nhận-dạng. undefined trên prod cũ. */
  features_vi?: string[];
}

export interface TreeViewsResult {
  tree_id: string;
  n: number;
  views: TreeView[];
}

export interface TreeViewsOptions {
  /** Bật ?describe=1 để kèm features_vi (nặng hơn — chỉ bật khi màn cần hiện đặc-điểm). */
  describe?: boolean;
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
 * Kéo ảnh-góc của 1 cây từ server. Trả { ok, data } hoặc { ok:false, error }.
 * KHÔNG ném — lỗi mạng/403/401 gói vào error để màn tự xử (giữ ảnh local làm dự-phòng).
 */
export async function fetchTreeViews(
  baseUrl: string,
  treeId: string,
  opts: TreeViewsOptions = {},
): Promise<{ ok: boolean; data?: TreeViewsResult; error?: APIError }> {
  const authHeader = await _authHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers.Authorization = authHeader;

  const qs = new URLSearchParams({ tree_id: treeId });
  if (opts.describe) qs.set('describe', '1');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${baseUrl}/api/tree_views?${qs.toString()}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.status === 401) {
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 403) {
      // Owner-guard (server.py:_guard_owner) — cây không thuộc tài-khoản.
      return { ok: false, error: { type: 'validation_error', detail: 'Cây này không thuộc bạn', http_status: 403, error_code: 'forbidden' } };
    }
    if (resp.status >= 500) {
      return { ok: false, error: { type: 'server_error', detail: `Lỗi máy chủ: HTTP ${resp.status}`, http_status: resp.status } };
    }
    if (!resp.ok) {
      return { ok: false, error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status } };
    }

    const body = await resp.json().catch(() => ({} as any));
    const views: TreeView[] = Array.isArray(body?.views) ? body.views : [];
    return {
      ok: true,
      data: {
        tree_id: body?.tree_id ?? treeId,
        n: typeof body?.n === 'number' ? body.n : views.length,
        views,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return { ok: false, error: { type: 'network_error', detail: String(err), http_status: 0 } };
  }
}

/**
 * Đổi kết-quả tree_views → danh-sách URL ẢNH TUYỆT-ĐỐI để đưa vào photo-strip.
 * Bỏ view thiếu ảnh (url null). Giữ THỨ TỰ server trả (đã sắp theo view).
 */
export function treeViewImageUrls(result: TreeViewsResult | undefined, baseUrl: string): string[] {
  if (!result?.views) return [];
  const out: string[] = [];
  for (const v of result.views) {
    if (v.url) out.push(`${baseUrl}${v.url}`);
  }
  return out;
}
