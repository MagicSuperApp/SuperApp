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
  error?: { type: string; detail: string; http_status: number };
}

export interface FruitVideoOptions {
  lat?: number;
  lon?: number;
  note?: string;
  source?: string;
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
      return {
        ok: false,
        error: { type: 'server_error', detail: body?.detail ?? `HTTP ${resp.status}`, http_status: resp.status },
      };
    }
    // Server trả 200 kể cả khi stored:false / 0 khung — vẫn coi là OK (đã nhận clip).
    return {
      ok: true,
      n_frames: body?.n_frames ?? 0,
      n_fruits_max: body?.n_fruits_max ?? 0,
      detections: body?.detections ?? [],
      video_cid: body?.video_cid,
      event_id: body?.event_id,
      link_status: body?.link_status ?? 'unconfirmed',
      stored: body?.stored ?? true,
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
