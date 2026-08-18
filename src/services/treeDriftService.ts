/**
 * treeDriftService — "vùng nào trên cây bền, vùng nào hay đổi".
 *
 * Backend: OriLife field-reid, `GET /api/tree_drift/{tree_id}` (Bearer).
 * Mã máy chủ: `MassTreeIdentify/core/server.py:5127` + `visual_reid.py:1171`.
 *
 * VÌ SAO CÓ FILE NÀY. Máy chủ đã tính sẵn con số này từ lâu, app chưa hỏi lần
 * nào. Nó trả lời đúng câu người trồng hay hỏi sau vài tháng: *"cây thay lá hết
 * rồi, máy còn nhận ra nó không?"* — kênh biến thiên THẤP là mỏ neo định danh
 * (vẫn nhận ra được), kênh CAO là chỗ nên chụp lại định kỳ.
 *
 * ⚠️ BA TRẠNG THÁI, KHÔNG PHẢI HAI. Máy chủ trả **HTTP 400** cho ca "cây mới có
 * 1 góc, chưa đủ cặp để đo" (`server.py:5135-5138`). Gộp nó vào nhánh lỗi là nói
 * với người dùng rằng có gì đó hỏng, trong khi thật ra chưa có gì để đo — hai ca
 * này đòi hai câu khác hẳn nhau trên màn ("chụp thêm một góc nữa" vs "thử lại").
 * Vì vậy hàm này trả một kiểu BA NHÁNH chứ không phải `ApiResult`.
 *
 * ⚠️ 400 CÓ HAI NGHĨA trên cùng route này, phân biệt bằng THÂN, không bằng mã:
 *   · `{ok:false, error:"chưa đủ dữ liệu…"}` ← chưa đủ góc (`JSONResponse`)
 *   · `{detail:"tree_id không hợp lệ"}`     ← mã cây sai khuôn (`_vid`, `server.py:684`)
 * Chỉ ca ĐẦU mới là "chưa đủ dữ liệu". Không có `ok === false` thì đây là lỗi
 * thật, đừng hiển thị nó như một cây khoẻ mạnh còn thiếu ảnh.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';
import type { APIError } from './fruitReIDService';

const AUTH_TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Kiểu — khớp ĐÚNG `visual_reid.py:1198` và `_drift_predict` (`:380`)
// ---------------------------------------------------------------------------

/**
 * Bốn kênh chữ ký của một cây (`embedder.CHANNELS`, xem `visual_reid.py:28`).
 * Tên kênh viết HOA trong thân trả về — đừng tự hạ chữ thường khi tra bảng.
 */
export type DriftChannel = 'CTX' | 'PLANT' | 'BASE' | 'LEAF';

export const DRIFT_CHANNELS: readonly DriftChannel[] = ['CTX', 'PLANT', 'BASE', 'LEAF'];

/**
 * Nhãn tiếng Việt của từng kênh — chép ĐÚNG `_DRIFT_LABEL` (`visual_reid.py:363`).
 *
 * Vì sao chép lại thay vì đọc từ máy chủ: `predict.fast`/`predict.stable` trả về
 * đã là NHÃN VIỆT rồi, còn `drift_per_channel` thì trả về MÃ kênh. Muốn xếp hai
 * thứ đó cạnh nhau trên một màn thì phải có bảng này ở đây. Máy chủ đổi nhãn mà
 * quên báo thì hai chỗ lệch nhau — nên bài kiểm khoá đúng bốn chuỗi này.
 */
export const DRIFT_LABEL_VI: Record<DriftChannel, string> = {
  LEAF: 'tán lá',
  PLANT: 'thân',
  BASE: 'vỏ-gốc/sẹo',
  CTX: 'bối cảnh',
};

/** Dự đoán vùng dễ đổi / vùng bền. `fast`/`stable` là NHÃN VIỆT, không phải mã kênh. */
export interface DriftPredict {
  /** Hai vùng biến thiên nhiều nhất (nhiều nhất trước). */
  fast: string[];
  /** Hai vùng bền nhất (bền nhất trước) — mỏ neo định danh. */
  stable: string[];
  /** Câu tiếng Việt máy chủ soạn sẵn. Hiện thẳng, đừng tự ghép lại từ `fast`/`stable`. */
  message: string;
}

export interface TreeDrift {
  ok: true;
  tree_id: string;
  /**
   * Số ngày kể từ lần cập nhật gần nhất. **`null` được** — `days_since_update`
   * khai `Optional[int]` (`visual_reid.py:1188`), và câu `predict.message` khi
   * đó bỏ luôn vế "Sau N ngày". Đừng in `0` thay cho `null`: "cập nhật hôm nay"
   * và "không biết cập nhật bao giờ" là hai chuyện khác nhau.
   */
  days_since_update: number | null;
  n_views: number;
  /** 1 − cosine trung bình các cặp góc, theo từng kênh. Cao = biến thiên nhiều. */
  drift_per_channel: Partial<Record<DriftChannel, number>>;
  predict: DriftPredict;
}

/**
 * Ba nhánh tường minh. `not_enough_views` KHÔNG phải lỗi — nó là câu trả lời
 * thật: cây này chưa đủ góc để đo được gì.
 */
export type TreeDriftResult =
  | { kind: 'ok'; drift: TreeDrift }
  | { kind: 'not_enough_views'; reason: string }
  | { kind: 'error'; error: APIError };

// ---------------------------------------------------------------------------
// Đọc thân trả về
// ---------------------------------------------------------------------------

/**
 * Kênh biến thiên NHIỀU nhất, theo `drift_per_channel`.
 *
 * Trả `null` khi bảng rỗng hoặc không có kênh nào mang số — KHÔNG trả một kênh
 * bừa. Đây là cái "vỏ im lặng" dễ mọc nhất ở đây: trả `'CTX'` mặc định thì màn
 * vẽ ra một kết luận về cây mà chẳng có phép đo nào đứng sau.
 */
export function topDriftChannel(drift?: TreeDrift | null): DriftChannel | null {
  const table = drift?.drift_per_channel;
  if (!table) return null;
  let best: DriftChannel | null = null;
  let bestVal = -Infinity;
  for (const c of DRIFT_CHANNELS) {
    const v = table[c];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (v > bestVal) {
      bestVal = v;
      best = c;
    }
  }
  return best;
}

/**
 * Thân 400 này có phải ca "chưa đủ góc" không.
 *
 * Điều kiện là `ok === false` CHÍNH XÁC — không phải `!body.ok`. Thân
 * `{detail:"tree_id không hợp lệ"}` cũng cho `!body.ok === true`, mà đó là lỗi
 * lập trình của app chứ không phải cây thiếu ảnh.
 */
function isNotEnoughViews(body: unknown): body is { ok: false; error?: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { ok?: unknown }).ok === false
  );
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
 * `GET /api/tree_drift/{tree_id}`.
 *
 * Thử lại đúng một lần khi token hết hạn (401) hoặc khi rớt mạng — giống mọi
 * cửa OriLife khác. 403 (cây không thuộc mình / không tồn tại — máy chủ **cố ý
 * gộp**, `server.py:1692`) không thử lại.
 */
export async function getTreeDrift(
  baseUrl: string,
  treeId: string,
  attempt = 0,
): Promise<TreeDriftResult> {
  const url = `${baseUrl}/api/tree_drift/${encodeURIComponent(treeId)}`;

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
        return getTreeDrift(baseUrl, treeId, 1);
      }
      return {
        kind: 'error',
        error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 },
      };
    }

    if (resp.status === 400) {
      // Đọc thân TRƯỚC khi kết luận: xem khối chú thích đầu tệp, 400 hai nghĩa.
      const body = await resp.json().catch(() => null);
      if (isNotEnoughViews(body)) {
        return {
          kind: 'not_enough_views',
          reason: typeof body.error === 'string' ? body.error : 'Chưa đủ dữ liệu để đo.',
        };
      }
      return {
        kind: 'error',
        error: { type: 'validation_error', detail: 'Mã cây không hợp lệ', http_status: 400 },
      };
    }

    if (resp.status === 403 || resp.status === 404) {
      return {
        kind: 'error',
        error: {
          type: 'validation_error',
          detail: `Không xem được biến thiên của cây này (HTTP ${resp.status})`,
          http_status: resp.status,
        },
      };
    }

    if (!resp.ok) {
      return {
        kind: 'error',
        error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status },
      };
    }

    return { kind: 'ok', drift: (await resp.json()) as TreeDrift };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isConn = err instanceof TypeError && !isTimeout;
    if (isConn && attempt === 0) return getTreeDrift(baseUrl, treeId, 1);
    return {
      kind: 'error',
      error: { type: 'network_error', detail: String(err), http_status: 0 },
    };
  }
}
