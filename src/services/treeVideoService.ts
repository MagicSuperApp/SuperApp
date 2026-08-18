/**
 * treeVideoService — Thu video ĐỊNH DANH CÂY → bổ-sung góc cho 1 cây đã đăng-ký (OriLife).
 *
 * Theo MOBILE-API-CONTRACT (orilife-core MassTreeIdentify) + server.py:1415 `tree_video`:
 *   POST /api/tree/{tree_id}/video   (multipart, cần session field-reid)
 *     file   = clip .mp4 (bắt buộc) — full-res, KHÔNG crop client
 *     lat/lon = GPS lúc quay (tuỳ)
 *     source = "phone" (tuỳ, mặc định "phone")
 *     farm_id = vườn của cây (tuỳ) — thiếu thì bản ghi rơi khỏi truy vấn theo vườn
 *     client_event_id = khoá khử-trùng của client (tuỳ) — thiếu thì gửi lại đẻ bản ghi thừa
 *
 * ⚠ CHƯA ĐO trên máy chủ thật: hai trường `farm_id` / `client_event_id` ở route NÀY.
 * Chúng là nếp CHUNG của các cửa ghi khác cùng máy chủ (`enroll`, `verify_add`,
 * `tree/set_farm`, `care`, và `fruit_video` cho `client_event_id`), nên gửi kèm là
 * đúng chiều; nhưng route video cây thì chưa ai gọi thử để xác nhận máy chủ ĐỌC.
 * Gửi kèm không rủi ro (multipart thừa trường thì FastAPI bỏ qua), chỉ là chưa được
 * tuyên là "đã có tác dụng". Ai đo được thì sửa dòng này.
 *
 * Server: chắt-lọc khung-hình đại-diện (video_ingest, tự DOWNSCALE) → mỗi khung jpeg đẩy qua
 * ĐÚNG đường embed + verify_add ẢNH CŨ (bổ-sung góc cho cây, KHÔNG enroll-mới, chống nhiễm
 * gallery). Khác `fruit_video` (đếm quả): đây làm GIÀU góc nhìn của chính CÂY.
 *
 * Trần dung-lượng: **80MB**, KHÔNG phải 20MB. Máy chủ tách trần riêng cho đường video:
 *   _VIDEO_PATH_SUFFIXES = ("/video", "/fruit_video")
 *   _path_cap(path) → _is_video_path → MAX_VIDEO_BYTES = 80 * 1024 * 1024
 * Route này khớp hậu tố `/video` nên luôn nằm ở trần 80MB, và đã vậy TỪ TRƯỚC — con
 * số 20MB ở đây là MAX_UPLOAD_BYTES, trần chung cho request thường, không áp cho
 * đường video. (Nhà OriLife đo trên prod và xác nhận 2026-08-11.)
 *
 * Hệ quả của con số sai: app TỰ chặn ở 20MB rồi báo "Clip vượt 20MB" trong khi máy
 * chủ nhận thoải mái — nông dân bị bắt quay lại ngắn hơn mà không có lý do thật.
 *
 * Mã trả:
 *   200 {ok:true, tree_id, n_kept, n_rejected, status, rejected[], added, reason}
 *       - added=true & n_kept>0 : engine nhận, đã bổ-sung n_kept góc cho cây.
 *       - added=false           : khung không khớp cây (quay lẫn cây khác / quá mờ) — không bổ-sung.
 *   422 {ok:false, error, status, n_kept:0, n_rejected, rejected[]} : không chắt được khung dùng được.
 *   413 : clip vượt 80MB. 403 : cây không thuộc chủ (IDOR). 401 : phiên hết hạn.
 *
 * TIẾN HOÁ CONTRACT (OriLife PR #251 `claude/tree-video-lampnet`, chờ Lợi merge+deploy — prod
 * hiện `b38496f` CHƯA có): route sẽ đẩy byte gốc lên LampNet TRƯỚC khi chắt khung và trả thêm
 * `stored` / `video_cid` / `event_id` / `engine_verified` / `link_status` ở MỌI nhánh — KỂ CẢ 422
 * (clip không tách được khung VẪN có CID làm bằng-chứng LampNet). Đây là mục-tiêu đợt: video gắn
 * định-danh cây phải sống trên LampNet. Service này đọc các field đó khi CÓ (forward-compatible):
 * còn prod cũ chưa trả thì chúng undefined, không vỡ. Khi 422 mà có `video_cid` → coi là ĐÃ LƯU
 * bằng-chứng (chỉ chưa bổ-sung góc), KHÔNG phải thất-bại trắng.
 * Kiểm "đã deploy chưa": prod `openapi.json` có `video_cid` trong response schema của route này.
 *
 * Auth: Bearer `auth_token` (token field-reid DID — cùng treeReIDService/fruitVideoService).
 * Caller nên ensureOrilifeToken() trước (màn tự lo).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = 'auth_token';
const UPLOAD_TIMEOUT_MS = 180_000; // video + mạng yếu + server chắt khung → nới rộng

/**
 * Trần dung-lượng clip — KHỚP server (`MAX_VIDEO_BYTES` = 80MB). Quá là 413.
 * Bằng đúng `fruitVideoService.MAX_VIDEO_BYTES`: cùng một clip mà bấm nút này được,
 * bấm nút kia lại 413 là thứ không giải thích nổi cho người ngoài vườn.
 */
export const MAX_TREE_VIDEO_BYTES = 80 * 1024 * 1024;

/** Một khung bị loại + lý-do (mã máy đọc + câu Việt cho người dùng). */
export interface TreeVideoRejected {
  reason: string;
  messages: string[];
}

export interface TreeVideoResult {
  ok: boolean;
  tree_id?: string;
  /** Số khung server GIỮ và bổ-sung vào cây (0 nếu engine không nhận). */
  n_kept?: number;
  /** Số khung bị loại ở cổng chất-lượng. */
  n_rejected?: number;
  /** Trạng-thái đọc clip (phân-biệt 'clip hỏng' vs 'đọc được nhưng không khung đẹp'). */
  status?: string;
  rejected?: TreeVideoRejected[];
  /** Engine verify_add có nhận khung (khung khớp đúng cây) không. */
  added?: boolean;
  /** Lý-do engine (khi added=false). */
  reason?: string;
  // ── Bằng-chứng LampNet (OriLife PR #251, forward-compatible — undefined trên prod cũ) ──
  /** Byte gốc đã lưu LampNet chưa (false nếu LampNet lỗi — server vẫn trả 200/422). */
  stored?: boolean;
  /** CID bằng-chứng video trên LampNet (có cả ở nhánh 422 khi PR #251 deploy). */
  video_cid?: string;
  /** ID sự-kiện timeline (append-only) của lần nạp video này. */
  event_id?: string;
  /** Phán-quyết máy (tách khỏi link_status = lời khai người gửi). */
  engine_verified?: boolean;
  /** "unconfirmed" khi mới gắn — chủ vườn/VeData xác nhận sau. */
  link_status?: string;
  error?: { type: string; detail: string; http_status: number };
}

export interface TreeVideoOptions {
  lat?: number;
  lon?: number;
  source?: string;
  /**
   * Vườn của cây. Mọi đường GHI khác của cùng máy chủ đều gửi `farm_id`
   * (`treeReIDService` enroll/verify_add/set_farm, `careService`), nên bản ghi
   * từ đường video mà thiếu nó thì rơi khỏi truy vấn theo vườn: nông dân quay
   * clip xong, mở vườn ra không thấy đâu. Nhà OriLife đã cảnh báo đúng hậu quả
   * này cho cửa cây (xem chú thích `treeReIDService.ts:520`).
   */
  farmId?: string;
  /**
   * Khoá khử-trùng phía CLIENT, ỔN ĐỊNH theo clip (KHÔNG đổi qua các lần gửi
   * lại). Cùng nếp với `fruitVideoService`: hàng đợi sinh id bằng
   * `computeClientEventId(treeId, mốc-quay, kích-thước, uri)` — xem
   * `videoUploadQueue.ts`. Thiếu nó thì gửi lại sau khi mất sóng đẻ ra nhiều
   * bản ghi cho cùng một clip, vì máy chủ không có gì để khử trùng.
   * Client chỉ bảo đảm gửi id KHÔNG đổi; dedup thật là việc của backend.
   */
  clientEventId?: string;
}

/**
 * Upload clip video bổ-sung góc cho 1 cây. `videoUri` = file:// từ launchCamera.
 * Trả { ok, ...kết-quả } hoặc { ok:false, error }.
 */
export async function uploadTreeVideo(
  baseUrl: string,
  treeId: string,
  videoUri: string,
  opts: TreeVideoOptions = {},
): Promise<TreeVideoResult> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const form = new FormData();
  // React Native FormData file: {uri, name, type}. Tên .mp4 để server nhận đúng loại.
  form.append('file', {
    uri: videoUri,
    name: `tree_${Date.now()}.mp4`,
    type: 'video/mp4',
  } as any);
  if (opts.lat != null) form.append('lat', String(opts.lat));
  if (opts.lon != null) form.append('lon', String(opts.lon));
  form.append('source', opts.source ?? 'phone');
  // Chỉ gửi khi CÓ: gửi chuỗi rỗng là nói với máy chủ "cây này không thuộc vườn
  // nào", khác hẳn với "lần gửi này không biết vườn".
  if (opts.farmId) form.append('farm_id', opts.farmId);
  if (opts.clientEventId) form.append('client_event_id', opts.clientEventId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `${baseUrl}/api/tree/${encodeURIComponent(treeId)}/video`,
      { method: 'POST', headers, body: form, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (resp.status === 401) {
      return { ok: false, error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 } };
    }
    if (resp.status === 403) {
      return { ok: false, error: { type: 'forbidden', detail: 'Cây này không thuộc bạn', http_status: 403 } };
    }
    if (resp.status === 413) {
      return { ok: false, error: { type: 'too_large', detail: 'Clip vượt 80MB — quay ngắn hơn.', http_status: 413 } };
    }

    const body = await resp.json().catch(() => ({} as any));

    // 422: chắt được clip nhưng không khung dùng được để bổ-sung góc.
    // PR #251: byte gốc VẪN lên LampNet → body có `video_cid`. Khi có CID ⇒ coi là ĐÃ LƯU
    // bằng-chứng (ok:true, added:false), màn hiện "đã lưu, chưa bổ-sung góc". Prod cũ không có
    // CID ⇒ thất-bại mềm (ok:false) để màn hướng-dẫn quay lại.
    if (resp.status === 422) {
      if (body?.video_cid) {
        return {
          ok: true,
          tree_id: body?.tree_id ?? treeId,
          n_kept: 0,
          n_rejected: body?.n_rejected ?? 0,
          status: body?.status,
          rejected: body?.rejected ?? [],
          added: false,
          reason: body?.reason ?? 'no_usable_frames',
          // KHÔNG `?? true`. Đây đúng là nhánh "prod cũ" mà chú thích trên nói tới —
          // máy chủ cũ không trả `stored`, mà mặc định `true` thì app ghi vĩnh viễn
          // một dòng `stored:true` vào sổ chỉ-ghi-thêm cho một CID có thể là
          // `local_<sha16>_…` giả, rồi hiện "Đã lưu video cây". Im lặng ≠ đã lưu.
          stored: body?.stored,
          video_cid: body?.video_cid,
          event_id: body?.event_id,
          engine_verified: body?.engine_verified ?? false,
          link_status: body?.link_status,
        };
      }
      return {
        ok: false,
        n_kept: 0,
        n_rejected: body?.n_rejected ?? 0,
        status: body?.status,
        rejected: body?.rejected ?? [],
        error: {
          type: 'no_usable_frames',
          detail: body?.error ?? 'Chưa trích được khung-hình dùng được từ video.',
          http_status: 422,
        },
      };
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: { type: 'server_error', detail: body?.error ?? body?.detail ?? `HTTP ${resp.status}`, http_status: resp.status },
      };
    }

    return {
      ok: true,
      tree_id: body?.tree_id ?? treeId,
      n_kept: body?.n_kept ?? 0,
      n_rejected: body?.n_rejected ?? 0,
      status: body?.status,
      rejected: body?.rejected ?? [],
      added: body?.added ?? false,
      reason: body?.reason,
      stored: body?.stored,
      video_cid: body?.video_cid,
      event_id: body?.event_id,
      engine_verified: body?.engine_verified,
      link_status: body?.link_status,
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
