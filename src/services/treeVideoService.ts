/**
 * treeVideoService — Thu video ĐỊNH DANH CÂY → bổ-sung góc cho 1 cây đã đăng-ký (OriLife).
 *
 * Theo MOBILE-API-CONTRACT (orilife-core MassTreeIdentify) + server.py:1415 `tree_video`:
 *   POST /api/tree/{tree_id}/video   (multipart, cần session field-reid)
 *     file   = clip .mp4 (bắt buộc) — full-res, KHÔNG crop client
 *     lat/lon = GPS lúc quay (tuỳ)
 *     source = "phone" (tuỳ, mặc định "phone")
 *     note   = ghi chú (tuỳ)
 *
 * ⛔ ĐÃ ĐO 2026-08-18 — ĐỪNG THÊM LẠI `farm_id` / `client_event_id` VÀO ROUTE NÀY.
 * Một bản trước đã gửi kèm hai trường đó theo nếp chung của các cửa ghi khác
 * (`enroll`, `verify_add`, `tree/set_farm`, `care`). Đo trên máy chủ thật: route
 * video cây KHÔNG khai `farm_id`, và chuỗi `client_event_id` KHÔNG tồn tại ở bất
 * kỳ đâu trong mã máy chủ. Gửi hai trường đó là gửi vào hư không.
 *   · `farm_id` ở cửa này còn THỪA về mặt thiết kế: video gắn vào cây, mà cây đã
 *     thuộc vườn rồi — không như `enroll`, nơi cây chưa có vườn nào.
 *   · `client_event_id` thì lý lẽ đúng (gửi lại sau khi mất sóng không khử trùng
 *     được là một lỗi thật) nhưng máy chủ chưa có cơ chế nào, chưa có thiết kế,
 *     nên chưa hứa. Ngày có thì nối, và nối cả `videoUploadQueue` (nó đã sẵn có
 *     `job.clientEventId` mà nhánh cây bỏ không truyền — nhánh quả thì có).
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
  /**
   * Byte clip CÒN trên máy chủ hay không (hàng đợi đĩa tính là còn).
   *
   * Đây là cờ máy chủ dùng làm `ok` của chính nó (`server.py:5015`). `false` ⇒ clip
   * đã mất, phải gửi lại. Xem khối chú thích ở nhánh 200 bên dưới.
   */
  retained?: boolean;
  /** Vì sao chưa cất được. Hàng đợi đọc để biết gửi lại có ích không. */
  store_reason?: string | null;
  /** Câu tiếng Việt CỦA MÁY CHỦ. Hiện thẳng, đừng tự soạn lại. */
  message?: string;
  error?: { type: string; detail: string; http_status: number };
}

export interface TreeVideoOptions {
  lat?: number;
  lon?: number;
  source?: string;
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
        // Đọc `store_reason` Ở CẢ NHÁNH LỖI, cùng lý do đã ghi ở `fruitVideoService`:
        // `empty_file` về dưới dạng 4xx, chỉ đọc ở nhánh 200 thì cờ "gửi lại vô ích"
        // không bao giờ tới được nơi quyết định gửi lại.
        store_reason: body?.store_reason ?? null,
      };
    }

    // ══ HTTP 200 CHƯA PHẢI LÀ THÀNH CÔNG ═══════════════════════════════════
    // Máy chủ đặt `ok = retained` chứ KHÔNG hằng `true` (`server.py:5015`), và chú
    // thích ngay trên dòng đó cảnh báo đúng lỗi này: *"app kiểm `if (res.ok)` sẽ vào
    // nhánh thành-công rồi bỏ qua chính câu 'vui lòng gửi lại' nằm cạnh"*. Bản trước
    // của tệp này làm y như vậy — trả `ok:true` cho mọi 200 — nên khi clip KHÔNG
    // được giữ, màn vẫn mở trang kết quả và nông dân yên tâm xoá clip trong máy.
    //
    // So sánh NGHIÊM NGẶT `=== false`: bản máy chủ cũ không trả trường này, và
    // `undefined` phải giữ nghĩa cũ ("đã nhận") chứ không được đọc thành thất bại.
    if (body?.ok === false) {
      return {
        ok: false,
        tree_id: body?.tree_id ?? treeId,
        retained: false,
        stored: body?.stored,
        store_reason: body?.store_reason ?? null,
        message: body?.message,
        error: {
          type: 'not_retained',
          // Câu Việt của máy chủ, không tự soạn lại: nó nói đúng việc phải làm tiếp.
          detail: body?.error ?? body?.message ?? 'Chưa lưu được video — gửi lại giúp.',
          http_status: resp.status,
        },
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
      retained: body?.retained,
      store_reason: body?.store_reason ?? null,
      message: body?.message,
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
