// services/fruitLookupService.ts
//
// TRA CỨU QUẢ CHO NGƯỜI MUA — `POST /api/fruit/lookup`.
//
// ── Ba đường quả, đừng lẫn ───────────────────────────────────────────────────
// Máy chủ khai ba cửa quả, mỗi cửa một PHẠM VI và một TIỀN ĐỀ khác hẳn
// (`OriLife-Core/MassTreeIdentify/core/server.py:8311-8319`):
//
//   /api/fruit/identify  NÔNG DÂN · cần đăng nhập · pool khoá cứng theo `owner`.
//                        Đường đọc nội bộ vườn mình → `fruitReIDService.ts`.
//   /api/fruit/scan      KHÁCH HỘI CHỢ · không đăng nhập · phạm vi = một phiên
//                        trưng bày; phiên đóng là mã chết.
//   /api/fruit/lookup    NGƯỜI LẠ ·  không đăng nhập · phạm vi = quả thuộc cây
//                        mà chính nông dân đã bật CÔNG KHAI.   ← TỆP NÀY
//
// Máy chủ ghi thẳng vào mã: *"TUYỆT ĐỐI KHÔNG nới `/api/fruit/identify` cho người
// lạ — nới nó là biến kho thành máy tra-cứu-ngược toàn bộ quả của mọi chủ."*
// Nên đừng bao giờ "gộp cho gọn" hai tệp service này lại.
//
// ── HAI THỨ KHÔNG ĐƯỢC GỬI, và vì sao ────────────────────────────────────────
//  1. `Authorization`. Đây là cửa của NGƯỜI MUA — người chưa có tài khoản. Kèm
//     token vào là (a) đổi ngữ cảnh phạm vi phía máy chủ, (b) buộc người mua phải
//     đăng nhập mới tra được xuất xứ, tức khoá cửa trước mặt đúng người cửa này
//     sinh ra để phục vụ. Bài kiểm khẳng định KHÔNG có header này.
//  2. `lat`/`lon`. Route CỐ Ý không nhận (`server.py:8337`): *"vị trí NGƯỜI MUA
//     không phải thứ hệ này cần, nên không thu"*. Đường nông dân thì ngược lại —
//     ở đó toạ độ là tín hiệu thu hẹp mạnh nhất. Đừng chép nhầm chiều.
//
// ── Nó KHÔNG hứa gì về độ chính xác, và đó là cố ý ───────────────────────────
// Số đo 04/08/2026 (`server.py:8321`): ở ngưỡng 0,72 có **73% (412/564)** cặp quả
// KHÁC NHAU trên cùng một cây bị nhận nhầm là cùng quả; siết tới mức hết nhận
// nhầm thì chỉ giữ 7,8% quả thật. *"Không có điểm hoạt động nào cứu được một đáp
// án đơn"* ⟹ route trả DANH SÁCH để người mua tự đối chiếu.
//
// Vì vậy: giao diện tiêu thụ tệp này **không được** dựng dấu tích xanh, không tự
// đi tiếp giùm người dùng, kể cả khi `verdict === 'SOLO'`. `SOLO` nghĩa là "chỉ
// có một ứng viên trong tầm", KHÔNG phải "chắc chắn là quả này".

import AsyncStorage from '@react-native-async-storage/async-storage';

const REQUEST_TIMEOUT_MS = 45_000;

/** Khoá lưu mã phiên. Máy chủ dùng nó cho lớp hạn tần suất CHẶT nhất (10 lượt/phút). */
const LOOKUP_SESSION_KEY = 'fruit_lookup_sess_v1';

// ── Kiểu theo hợp đồng ở `server.py:8495` ───────────────────────────────────
// Nguồn sự thật của hợp đồng này là docstring của chính route — không có tệp .md
// nào mô tả nó. Trường nào máy chủ chưa chắc chắn thì để `?`, KHÔNG bịa mặc định.

/** Neo chuỗi của cây mẹ. `anchored` là thứ người mua thật sự hỏi. */
export interface LookupProvenance {
  anchored?: boolean;
  status?: string;
  network?: string;
  explorer_url?: string;
  label?: string;
  means?: string;
}

/** Thẻ CÂY MẸ đính trong mỗi ứng viên. `code` = mã `ORI-…` công khai. */
export interface LookupTree {
  name?: string;
  code?: string;
  gps?: unknown;
  created_at?: string;
  public_url?: string;
  provenance?: LookupProvenance;
}

/**
 * Một ứng viên. CHÚ Ý phần máy chủ CỐ Ý giấu (`server.py` phòng thủ #3):
 * không điểm, không biên, không `fruit_id`, không `owner`. Đừng đi tìm chúng —
 * vắng mặt là thiết kế, không phải thiếu sót.
 */
export interface LookupCandidate {
  /** Số thứ tự để người dùng chỉ ("quả số mấy"), KHÔNG phải `fruit_id`. */
  pick?: number;
  name?: string;
  status?: string;
  enrolled_at?: string;
  n_imgs?: number;
  /** Đường dẫn TƯƠNG ĐỐI, có mã hết hạn. Ghép bằng `lookupImageUrl`. */
  img_urls?: string[];
  tree?: LookupTree;
}

export type LookupVerdict = 'CHOICES' | 'SOLO' | 'EMPTY_SCOPE';

/** Vùng máy chủ gợi ý khi trong khung có nhiều quả. */
export interface LookupRegion {
  index: number;
  bbox: [number, number, number, number];
}

export interface FruitLookupResponse {
  ok?: boolean;
  /** true ⟹ CHƯA có kết quả: phải mời người dùng chỉ đúng một quả rồi gửi lại. */
  need_region?: boolean;
  regions?: LookupRegion[];
  lookup_id?: string;
  verdict?: LookupVerdict;
  verdict_label?: string;
  message?: string;
  candidates?: LookupCandidate[];
  /** Chỉ khác null khi `verdict === 'SOLO'`. */
  fruit?: LookupCandidate | null;
  match?: Record<string, unknown>;
  warnings?: string[];
  /** Câu tiếng Việt sẵn để hiện — ưu tiên dùng cái này hơn tự viết lại. */
  warning_messages?: string[];
}

export type LookupErrorKind =
  | 'image_unusable'   // 400 — không nhúng được ảnh (mờ/hỏng)
  | 'too_large'        // 413 — vượt trần riêng của lane khách (2 MB)
  | 'rate_limited'     // 429 — quá tần suất HOẶC vượt trần đồng thời
  | 'network'
  | 'server';

export interface LookupError {
  kind: LookupErrorKind;
  /** Câu CHO NGƯỜI ĐỌC. Ưu tiên câu của máy chủ nếu có. */
  message: string;
  http_status?: number;
  /** Chỉ có với `rate_limited`. Giây. */
  retry_after?: number;
}

export type LookupResult =
  | { ok: true; data: FruitLookupResponse }
  | { ok: false; error: LookupError };

/** Khoanh vùng quả — cùng khuôn với đường nông dân để hai bên không lệch. */
export interface LookupRegionInput {
  bbox: [number, number, number, number];
  shape?: 'rect' | 'poly';
  points?: Array<[number, number]>;
}

/** Báo cáo cổng-trên-máy. Máy chủ CHỈ dùng để ĐO, không đổi kết quả. */
export interface LookupGateReport {
  coarse_class?: string;
  frames_gated?: number;
  gate_available?: boolean;
}

function trimBase(base: string): string {
  return (base ?? '').trim().replace(/\/+$/, '');
}

/**
 * Mã phiên bền theo lần cài. Máy chủ nói rõ mã này GIẢ ĐƯỢC nên nó là lớp GIỮ
 * TRẢI NGHIỆM, không phải lớp an ninh — ta không cần bí mật, chỉ cần ỔN ĐỊNH:
 * đổi mã mỗi lượt thì lớp hạn tần suất chặt nhất (10/phút/phiên) mất tác dụng và
 * người dùng rơi thẳng xuống lớp địa chỉ gọi, nơi cả một quán cà phê sau NAT
 * dùng chung ngân sách.
 */
export async function getLookupSession(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(LOOKUP_SESSION_KEY);
    if (saved) return saved;
  } catch {
    // Đọc hỏng → dùng mã tạm cho lượt này. KHÔNG chặn người mua vì một lần đọc đĩa.
  }
  const fresh = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    await AsyncStorage.setItem(LOOKUP_SESSION_KEY, fresh);
  } catch {
    // Ghi hỏng cũng đi tiếp — mã tạm vẫn phục vụ được lượt này.
  }
  return fresh;
}

/**
 * Ghép URL ảnh ứng viên. `img_urls` máy chủ trả là đường dẫn TƯƠNG ĐỐI kèm mã
 * hết hạn và thu hồi được (`/api/fruit/lookup/img/{token}`) — đừng tự dựng đường
 * khác, mã nằm trong chính chuỗi đó.
 */
export function lookupImageUrl(base: string, relative: string): string | null {
  const b = trimBase(base);
  const r = (relative ?? '').trim();
  if (!b || !r) return null;
  // Máy chủ đã trả đường tuyệt đối (bản sau đổi ý) → dùng nguyên.
  if (/^https?:\/\//i.test(r)) return r;
  return `${b}${r.startsWith('/') ? '' : '/'}${r}`;
}

/**
 * `true` khi phản hồi là "chưa xong, hãy chỉ đúng một quả" — KHÔNG phải kết quả.
 * Tách thành hàm thuần để màn hình không phải tự đoán bằng cách dò trường.
 */
export function needsRegionPick(r: FruitLookupResponse | undefined | null): boolean {
  return !!r?.need_region;
}

/**
 * Danh sách ứng viên đã chuẩn hoá — gộp `fruit` của ca `SOLO` vào cùng một mảng.
 *
 * Vì sao gộp: `SOLO` chỉ nghĩa là "trong tầm chỉ có một ứng viên", KHÔNG phải
 * "đúng là quả này". Trả về hai hình dạng khác nhau cho hai ca sẽ dụ màn hình
 * vẽ hai kiểu — rồi ca một-ứng-viên trông như một câu khẳng định. Một hình dạng,
 * một cách vẽ, người mua tự đối chiếu ở cả hai ca.
 */
export function lookupCandidates(r: FruitLookupResponse | undefined | null): LookupCandidate[] {
  if (!r) return [];
  const list = Array.isArray(r.candidates) ? r.candidates : [];
  if (list.length > 0) return list;
  return r.fruit ? [r.fruit] : [];
}

/**
 * `EMPTY_SCOPE` = tầm tra cứu RỖNG, tức chưa nông dân nào bật công khai cây nào.
 *
 * Đây KHÔNG phải "không tìm thấy quả". Phân biệt hai câu này là bắt buộc: đo trên
 * kho sản xuất 08/2026 (`server.py:8325`) là **139 cây — 54 riêng tư, 85 chưa
 * đặt, 0 công khai**, nên hôm nay đây là câu trả lời THƯỜNG GẶP NHẤT. Hiện nó
 * thành "không tìm thấy" là đổ lỗi cho người mua về một việc họ không làm được gì.
 */
export function isEmptyScope(r: FruitLookupResponse | undefined | null): boolean {
  return r?.verdict === 'EMPTY_SCOPE';
}

/**
 * Người lạ chụp một quả → tối đa 5 ứng viên kèm ảnh trong tập quả CÔNG KHAI.
 *
 * KHÔNG ném. Mọi lỗi về `{ ok: false, error }` — màn này phục vụ người đứng giữa
 * chợ, không có ai bên cạnh để đọc stack trace.
 */
export async function lookupFruit(
  baseUrl: string,
  imagePath: string,
  opts?: {
    region?: LookupRegionInput;
    sess?: string;
    gate?: LookupGateReport;
  },
): Promise<LookupResult> {
  const b = trimBase(baseUrl);
  if (!b) {
    return { ok: false, error: { kind: 'server', message: 'Chưa cấu hình máy chủ.' } };
  }

  const form = new FormData();
  (form as unknown as { append: (k: string, v: unknown) => void }).append(
    'file', { uri: imagePath, type: 'image/jpeg', name: 'fruit.jpg' });

  const region = opts?.region;
  if (region) {
    form.append('bbox_x', String(region.bbox[0]));
    form.append('bbox_y', String(region.bbox[1]));
    form.append('bbox_w', String(region.bbox[2]));
    form.append('bbox_h', String(region.bbox[3]));
    if (region.shape) form.append('shape', region.shape);
    if (region.points) form.append('points', JSON.stringify(region.points));
  }

  const sess = opts?.sess ?? (await getLookupSession());
  form.append('sess', sess);

  const gate = opts?.gate;
  if (gate?.coarse_class) form.append('coarse_class', gate.coarse_class);
  if (gate?.frames_gated !== undefined) form.append('frames_gated', String(gate.frames_gated));
  if (gate?.gate_available !== undefined) form.append('gate_available', gate.gate_available ? '1' : '0');

  // KHÔNG `Authorization`, KHÔNG `lat`/`lon` — xem đầu tệp.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${b}/api/fruit/lookup`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
      signal: ctrl.signal,
    });

    if (resp.status === 413) {
      return {
        ok: false,
        error: { kind: 'too_large', message: 'Ảnh quá lớn, chụp lại nhỏ hơn.', http_status: 413 },
      };
    }

    if (resp.status === 429) {
      // Máy chủ trả `retry_after` trong THÂN; header `Retry-After` là đường lui.
      let retry: number | undefined;
      let msg = 'Máy chủ đang bận, thử lại sau.';
      try {
        const body = await resp.json();
        if (typeof body?.retry_after === 'number') retry = body.retry_after;
        if (typeof body?.message === 'string' && body.message) msg = body.message;
      } catch {
        /* thân không đọc được → dùng header */
      }
      if (retry === undefined) {
        const h = resp.headers.get('Retry-After');
        if (h) retry = parseInt(h, 10);
      }
      return { ok: false, error: { kind: 'rate_limited', message: msg, http_status: 429, retry_after: retry } };
    }

    if (resp.status === 400) {
      let msg = 'Ảnh không dùng được — chụp lại rõ hơn.';
      try {
        const body = await resp.json();
        if (typeof body?.message === 'string' && body.message) msg = body.message;
      } catch {
        /* giữ câu mặc định */
      }
      return { ok: false, error: { kind: 'image_unusable', message: msg, http_status: 400 } };
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: { kind: 'server', message: `Máy chủ trả HTTP ${resp.status}.`, http_status: resp.status },
      };
    }

    const data = (await resp.json()) as FruitLookupResponse;
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
