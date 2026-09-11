/**
 * fruitVideoService — Thu video quả → gắn vào CÂY (OriLife).
 *
 * Theo User-Action-Flow (OriLife-Mobile PR #2) + backend orilife-core PR #209:
 *   POST /api/tree/{tree_id}/fruit_video  (multipart, cần session field-reid)
 *     file   = clip .mp4 (bắt buộc, ≤ 80MB) — full-res, KHÔNG crop client
 *     lat/lon = GPS lúc quay (tuỳ)
 *     source = "phone" (tuỳ)
 *     note   = ghi-chú ngắn (tuỳ)
 *
 * Server: lưu byte gốc lên LampNet TRƯỚC → chắt keyframes → detect quả từng khung
 * (KHÔNG enroll, KHÔNG đụng gallery) → ghi 1 timeline event link_status="unconfirmed".
 * CHO PHÉP gắn SAI cây (chủ ý) — VeData sửa sau. Backend chỉ chặn nếu cây KHÔNG thuộc
 * chủ (403). LampNet lỗi / 0 khung → VẪN 200 (không mất buổi thực-địa).
 *
 * Auth: Bearer `auth_token` (token field-reid DID — cùng treeReIDService). Caller nên
 * ensureOrilifeToken() trước (màn tự lo).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = 'auth_token';
const UPLOAD_TIMEOUT_MS = 180_000; // video + mạng yếu → nới rộng (server chắt khung cũng lâu)

/** Giới hạn dung-lượng clip (spec: 80MB). */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

/**
 * Một quả trong 1 khung. LỒNG bên trong FrameDetection — KHÔNG phải phần-tử cấp trên.
 * (Sửa lệch schema OriLife báo 2026-07-24: backend server.py:2090-2105 trả detections[]
 *  theo KHUNG, quả nằm trong `fruits[]`. Bản cũ khai phẳng {bbox,confidence} ở cấp
 *  detection → luôn undefined; là mìn khi ai đó vẽ khung quả từ kết-quả video.)
 */
export interface VideoFruit {
  bbox: [number, number, number, number];
  confidence: number;
  /** Tỉ lệ diện tích quả trên khung. */
  area_frac: number;
}

/** Một KHUNG chắt từ clip; số quả trong khung = `fruits.length` (KHÔNG phải detections.length). */
export interface FruitDetection {
  frame_idx: number;
  t_offset_s: number | null;
  n_fruits: number;
  fruits: VideoFruit[];
}

/** Lý do lưu trữ do OriLife trả kèm `stored` (bảng ở `FruitVideoResult.store_reason`). */
export type StoreReason =
  | 'lampnet_unreachable'
  | 'lampnet_disabled'
  | 'lampnet_rejected'
  | 'empty_file'
  | null;

/** Gửi lại có ích không? `lampnet_disabled` / `empty_file` thì gửi lại chỉ đốt pin. */
export function isRetryableStoreReason(r: StoreReason | undefined): boolean {
  return r !== 'lampnet_disabled' && r !== 'empty_file';
}

export interface FruitVideoResult {
  ok: boolean;
  /** Số khung server chắt được từ clip. */
  n_frames?: number;
  /** Số quả nhiều nhất thấy trong 1 khung (ước-lượng HSV — hedge "khoảng ~N"). */
  n_fruits_max?: number;
  /** Ước-lượng sơ-bộ (detector HSV), KHÔNG phải đếm chính-xác. */
  fruit_count_method?: string;
  detections?: FruitDetection[];
  video_cid?: string;
  event_id?: string;
  /** "unconfirmed" khi mới gắn — chủ vườn/VeData xác nhận sau. */
  link_status?: string;
  /** false nếu LampNet lỗi (byte gốc chưa lưu được) — server vẫn trả 200. */
  stored?: boolean;
  /**
   * LÝ DO của `stored`, OriLife kèm ở MỌI nhánh (PR OriLife-Core #274).
   *
   * Tên là `store_reason` chứ KHÔNG phải `reason`, và đó là cố ý của bên OriLife:
   * `reason` trong cùng phản hồi đã mang nghĩa khác — phán quyết của engine về việc
   * khung có được gộp vào cây không. Dùng chung tên là đọc phán quyết engine mà tưởng
   * là lý do lưu trữ, một giá trị hợp lệ của nghĩa sai, không có cách nào biết mình
   * đọc nhầm. Vậy nên ở phía app cũng KHÔNG đặt biến trung gian tên `reason`.
   *
   *   null                  đã lưu
   *   'lampnet_unreachable' đẩy hỏng (mạng/kho/token) — gửi lại CÓ ích
   *   'lampnet_disabled'    LAMPNET_ENABLED=0, CID là GIẢ — gửi lại VÔ ích
   *   'lampnet_rejected'    kho trả về nhưng tự khai chưa lưu — đừng lặp vô hạn
   *   'empty_file'          tệp 0 byte (422) — lỗi phía app, xem lại đường ghi tệp tạm
   */
  store_reason?: StoreReason;
  error?: { type: string; detail: string; http_status: number };
}

export interface FruitVideoOptions {
  lat?: number;
  lon?: number;
  note?: string;
  source?: string;
  /**
   * Khoá khử-trùng phía CLIENT, ỔN ĐỊNH theo clip (KHÔNG đổi qua các lần retry).
   * Cùng clip gửi lại N lần → cùng clientEventId. Gửi kèm multipart để BACKEND
   * dedup (chỉ tạo 1 event dù retry nhiều). Client chỉ bảo đảm gửi id không đổi;
   * dedup thực sự là việc của server.
   */
  clientEventId?: string;
}

/**
 * Upload clip video quả gắn vào 1 cây. `videoUri` = file:// từ launchCamera.
 * Trả { ok, ...detection } hoặc { ok:false, error }.
 */
export async function uploadFruitVideo(
  baseUrl: string,
  treeId: string,
  videoUri: string,
  opts: FruitVideoOptions = {},
): Promise<FruitVideoResult> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const form = new FormData();
  // React Native FormData file: {uri, name, type}. Tên .mp4 để server nhận đúng loại.
  form.append('file', {
    uri: videoUri,
    name: `fruit_${Date.now()}.mp4`,
    type: 'video/mp4',
  } as any);
  if (opts.lat != null) form.append('lat', String(opts.lat));
  if (opts.lon != null) form.append('lon', String(opts.lon));
  form.append('source', opts.source ?? 'phone');
  if (opts.note && opts.note.trim()) form.append('note', opts.note.trim());
  // Khoá khử-trùng ổn định theo clip — server dùng để dedup khi cùng clip retry
  // nhiều lần (mạng yếu / app-kill). Dedup thực sự là việc của BACKEND.
  if (opts.clientEventId) form.append('client_event_id', opts.clientEventId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `${baseUrl}/api/tree/${encodeURIComponent(treeId)}/fruit_video`,
      { method: 'POST', headers, body: form, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (resp.status === 401) {
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 403) {
      return { ok: false, error: { type: 'forbidden', detail: 'Cây này không thuộc bạn', http_status: 403 } };
    }

    const body = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      // Server dùng `error` cho lỗi nghiệp-vụ (413 quá trần, 422 "Video rỗng.") và `detail`
      // cho lỗi validate FastAPI. Ưu-tiên `error` để hiện đúng câu tiếng Việt của server
      // thay vì rơi về "HTTP 4xx" chung chung.
      const detail = body?.error ?? body?.detail ?? `HTTP ${resp.status}`;
      return {
        ok: false,
        error: { type: 'server_error', detail, http_status: resp.status },
        // ĐỌC `store_reason` Ở CẢ NHÁNH LỖI. `empty_file` (tệp 0 byte) về dưới dạng
        // 422 — tức nhánh này — nên nếu chỉ đọc ở nhánh 200 thì cờ "gửi lại vô ích"
        // không bao giờ tới được hàng đợi: app cứ thử đủ 5 lượt multipart trên 3G
        // giữa vườn cho một tệp lần nào cũng rỗng.
        store_reason: body?.store_reason ?? null,
      };
    }
    // Server trả 200 kể cả khi stored:false / 0 khung — vẫn coi là OK (đã nhận clip).
    return {
      ok: true,
      // KHÔNG `?? 0` — cùng lý do đã viết cho `stored` mười lăm dòng dưới, chỉ ở
      // chỗ đắt hơn: đây là hai con số người dùng ĐỌC. `0` mang hình dạng một số
      // đo, nên "máy chủ không nói gì" và "máy chủ đếm được không quả nào" ra cùng
      // một màn hình, và người ghi chép ngoài vườn chép `0` vào báo cáo.
      //
      // `FruitVideoScreen.tsx:516` ĐÃ có sẵn nhánh `n_frames === undefined` →
      // "chưa cho biết", và có cả bài kiểm cho nhánh đó. Chính hai dấu `?? 0` ở
      // đây làm nhánh ấy không bao giờ chạy được: bài kiểm xanh trên một con
      // đường mà mã thật không đi tới.
      n_frames: body?.n_frames,
      n_fruits_max: body?.n_fruits_max,
      // Nhãn phương-pháp đếm ("hsv_estimate") — surface để UI cảnh-báo đây là ước-lượng
      // sơ-bộ, KHÔNG phải ground-truth (khớp interface + doc mục 4).
      fruit_count_method: body?.fruit_count_method,
      detections: body?.detections ?? [],
      video_cid: body?.video_cid,
      event_id: body?.event_id,
      link_status: body?.link_status ?? 'unconfirmed',
      // KHÔNG mặc định `true`. Mặc định `true` nghĩa là "máy chủ không nói gì thì coi
      // như đã lưu", và hàng đợi đọc cờ này để quyết định XOÁ bản sao clip — nên một
      // bản máy chủ cũ (hoặc một nhánh trả thiếu trường) là đủ để xoá bằng chứng của
      // nông dân mà không ai thấy lỗi. Để `undefined` thì hàng đợi vẫn coi là gửi
      // xong nhưng GIỮ bản sao lại.
      stored: body?.stored,
      store_reason: body?.store_reason ?? null,
    };
  } catch (e: any) {
    clearTimeout(timeout);
    const isAbort = e?.name === 'AbortError';
    return {
      ok: false,
      error: {
        type: 'network_error',
        detail: isAbort ? 'Mạng chậm — tải lên quá lâu, thử lại nơi sóng tốt.' : 'Mất kết nối, thử lại.',
        http_status: 0,
      },
    };
  }
}
