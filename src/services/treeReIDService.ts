/**
 * treeReIDService — Tree ReID client cho React Native
 *
 * API: POST /api/identify, /api/enroll, /api/verify_add, GET /api/trees,
 *      POST /api/delete, POST /api/rename
 * Auth: Bearer token từ AsyncStorage key 'auth_token'
 * Timeout: 45s, retry 1 lần cho lỗi mạng (không retry 4xx)
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureOrilifeToken } from './orilifeDidAuth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TreeDecision = 'MATCH' | 'UNCERTAIN' | 'NO_MATCH' | 'EMPTY_BUCKET' | 'MOVED';

export interface TreeCandidate {
  tree_id: string;
  name: string | null;
  code: string | null;
  /**
   * Độ giống của ứng viên này. Tên trên dây là `score` — `server.py:3879`
   * (`"score": round(float(s), 4)`). Máy chủ CÓ một trường `_sim` nhưng chỉ dùng
   * nội bộ để sắp xếp rồi `pop` đi trước khi trả (`server.py:3888`), nên `sim`
   * KHÔNG BAO GIỜ tới client. Bản trước đọc `sim` ⇒ huy hiệu % trong hộp thoại
   * xác nhận không bao giờ vẽ — đúng ở ca `UNCERTAIN`, tức ca duy nhất mà nông dân
   * phải tự chọn cây và cần con số đó nhất.
   */
  score: number;
  near_prev?: boolean;
  has3d?: boolean;
  anchor?: string | null;
}

export interface IdentifyFactors {
  CTX: number;
  PLANT: number;
  BASE: number;
  LEAF: number;
}

// Báo giá phí 3-bucket cho tác vụ identify — khai tập trung ở types/fee.ts.
import type { FeeQuote } from '../types/fee';
export type { FeeQuote };

/** Băng tin-cậy THÔ (không lộ điểm số) — PoC-Tree §4 M2. */
export type ConfidenceBand = 'cao' | 'vừa' | 'thấp';

export interface IdentifyResponse {
  ok: boolean;
  decision: TreeDecision;
  tree_id?: string;
  name?: string;
  code?: string;
  /**
   * Điểm top-1. Tên trên dây là `s_top1` — `server.py:3897`. `similarity` là tên
   * NỘI BỘ của máy chủ (`res.similarity`), không phải tên trường trả về; bản trước
   * đọc `similarity` nên con số % ở màn kết quả không bao giờ hiện, và nhật ký
   * chẩn đoán ghi `null` — tức đang đo mù.
   */
  s_top1: number;
  /**
   * `s_top1 − s_top2`. CHỈ tin khi `candidates.length >= 2`: bucket một ứng viên
   * trả margin GIẢ bằng chính `s_top1` vì chưa so với ai (`server.py:3893-3896`).
   */
  margin: number;
  factors: IdentifyFactors;
  /**
   * Câu giải thích của máy chủ, đã có tiếng Việt sẵn. Gồm cả lý do máy "khó tính
   * lên" với cây thiếu toạ độ (`visual_reid.py:1879`). Không hiện ra thì nông dân
   * chỉ thấy máy từ chối mà không biết vì sao.
   */
  warnings: string[];
  /**
   * Cây được chọn CHƯA có toạ độ (`server.py:3905`, vào từ #309 ngày 11/08). Đây là
   * TRẠNG THÁI THỨ BA — không phải "trong bán kính", cũng không phải "ngoài bán
   * kính". Cây thiếu toạ độ bị siết ngưỡng, và cách gỡ đúng là bổ sung vị trí qua
   * `POST /api/update_location`, KHÔNG phải bắt chụp lại cả lô ảnh.
   */
  needs_location_update?: boolean;
  /** Câu phẳng máy chủ dựng sẵn cho app (`server.py:3913`); `suggest` là dict. */
  suggest_text?: string | null;
  candidates: TreeCandidate[];
  moved_distance_m?: number;
  fee_quote?: FeeQuote;
  /**
   * ADDITIVE (Lợi PR #46): mã truy-vấn hex — GIỮ để gửi verdict.
   * Không có khi backend cũ → verdict UI ẩn.
   */
  query_id?: string;
  /** ADDITIVE (Lợi PR #46): băng tin-cậy thô (cao/vừa/thấp) — KHÔNG hiện điểm số. */
  confidence?: ConfidenceBand;
  /**
   * ADDITIVE: câu gợi ý hành-động do backend trả khi kết quả chưa chắc (vd
   * "đi vòng quanh cây, chụp thêm góc khác" / "kết quả chưa chắc, nhờ chủ vườn
   * xác nhận"). Hiện ở UNCERTAIN/NO_MATCH. Thiếu (backend cũ) → UI không hiện.
   * LƯU Ý: backend đôi khi trả OBJECT {message, channel, n_candidates} thay vì
   * string — UI phải coerce (ReidConfirmDialog) kẻo render object = crash React.
   */
  suggest?: string | { message?: string; channel?: string; n_candidates?: number };
  /**
   * ADDITIVE (B1/B2 owner_review): backend có CHO PHÉP tạo cây MỚI ở lần này
   * không. Thiếu/undefined (backend cũ) = true → GIỮ hành-vi cũ (cho tạo mới).
   * false → ẩn nút "Đăng ký cây mới" để chống tạo cây trùng khi cùng-loài mơ-hồ
   * (dải điểm sập, cần chủ vườn xác nhận trước).
   */
  allow_enroll_new?: boolean;
}

export interface EnrollResponse {
  ok: boolean;
  tree_id: string;
  n_views_added?: number;
  total_trees?: number;
  /**
   * Kênh MCR thứ 2 (vỏ-thân) tách được cây này khỏi cây rất giống nó (#235). Đăng ký
   * VẪN cho qua, nhưng backend gửi kèm cảnh-báo nhẹ để chủ vườn tự đối chiếu — đúng
   * ca "2 cây mai trắng" ngoài thực địa, nơi DINOv2 toàn cục báo trùng còn vỏ-thân
   * thì phân biệt được.
   */
  dup_suspect?: {
    tree_id?: string;
    name?: string;
    resolved_by?: string;
    message_vi?: string;
  };
  /**
   * Số góc máy chủ GIỮ sau khi lọc, và số góc bị bỏ vì trùng với góc đã có
   * (`server.py:1900`). Khác `n_views_added` ở chỗ nó nói cho nông dân biết
   * công đi vòng quanh cây có được ăn hay không.
   */
  views_kept?: number;
  views_dropped_dup?: number;
  /** Câu tiếng Việt: CÒN THIẾU góc nào (`server.py:1902`). Thứ nông dân cần nhất. */
  coverage_hint_vi?: string;
  /**
   * Ảnh bị loại vì mờ/thiếu sáng. Shape ĐỌC TỪ MÁY CHỦ (`server.py:562`, dùng lại ở
   * `:1925`): mỗi mục là `{idx, reasons[], messages[]}` — câu tiếng Việt nằm trong
   * `messages`, KHÔNG có trường `message_vi`.
   */
  quality_warnings?: Array<{ idx?: number; reasons?: string[]; messages?: string[] }>;
  /**
   * Vùng khoanh chưa đạt (quá nhỏ, hoặc một vùng dùng chung cho nhiều ảnh).
   * `server.py:1769` khai `list[str]` — **chuỗi trần**, không phải đối tượng.
   */
  region_warnings?: string[];
  /**
   * Cây bị rơi khỏi vườn đang chọn. Nếu nuốt trường này thì cây biến mất khỏi vườn
   * mà không ai được báo — người dùng tưởng đăng ký hỏng và làm lại từ đầu.
   */
  farm_dropped?: boolean;
  provenance?: {
    code?: string;
    has3d?: boolean;
    anchor?: string | null;
    record_cid?: string;
    record_hash?: string;
    lampnet_view?: string;
  };
}

export interface VerifyAddResponse {
  ok: boolean;
  added?: boolean;
  n_added?: number;
  total_trees?: number;
  reason?: string;
  per_image?: Array<{
    sim_chosen: number;
    sim_other: number;
    other_name?: string;
    ok: boolean;
  }>;
}

export interface TreeInfo {
  tree_id: string;
  name: string;
  n_views: number;
  has3d: boolean;
  anchor: string | null;
  /** Mã cây công khai (PROV.code) — field-reid trả kèm ở /api/trees. */
  code?: string | null;
  /** [lat, lon] hoặc null — field-reid GAL.list_trees. */
  gps?: [number, number] | null;
  species?: string | null;
}

export interface TreeListResponse {
  trees: TreeInfo[];
}

export interface APIError {
  type: 'network_error' | 'auth_error' | 'validation_error' | 'duplicate' | 'rate_limited' | 'server_error';
  detail: string;
  http_status: number;
  retry_after_seconds?: number;
  /** Mã lỗi máy chủ trả về (vd: 'duplicate_tree' | 'heterogeneous' | 'flat'). Ưu tiên dùng trường này thay vì phân tích chuỗi detail. */
  error_code?: string;
  /** Câu gợi ý hành-động từ backend (vd "hãy đi vòng quanh cây, chụp góc khác"). */
  reason?: string;
  /** tree_id của cây trùng — backend trả khi 409 duplicate_tree */
  existing_tree_id?: string;
}

/**
 * Rút các câu cảnh báo tiếng Việt từ phản hồi đăng ký cây, gộp trùng, giữ thứ tự.
 *
 * Tồn tại vì HAI trường này có shape KHÁC NHAU và trước đây bị đọc nhầm thành một:
 *   • `quality_warnings` = `[{idx, reasons[], messages[]}]` — câu nằm trong `messages`
 *   • `region_warnings`  = `[string]` — chuỗi trần
 * Đọc nhầm không làm app sập; nó chỉ khiến MỌI cảnh báo biến mất im lặng, nên phải có
 * test canh. Tin phòng thủ vì đây là dữ liệu từ mạng: mảng có thể vắng hoặc sai kiểu.
 */
export function enrollWarningMessages(res?: {
  quality_warnings?: EnrollResponse['quality_warnings'];
  region_warnings?: EnrollResponse['region_warnings'];
}): { quality: string[]; region: string[] } {
  const clean = (xs: unknown[]): string[] => {
    const out: string[] = [];
    for (const x of xs) {
      if (typeof x === 'string' && x.trim() && !out.includes(x)) out.push(x);
    }
    return out;
  };
  const q = Array.isArray(res?.quality_warnings) ? res!.quality_warnings! : [];
  const r = Array.isArray(res?.region_warnings) ? res!.region_warnings! : [];
  return {
    quality: clean(q.flatMap(w => (Array.isArray(w?.messages) ? w.messages : []))),
    region: clean(r),
  };
}

/**
 * Đổi lỗi API (field-reid) thành câu tiếng Việt DỄ HIỂU cho nông dân — hiện thay vì
 * "lỗi" chung chung (Lỗi field #3). Ưu tiên `reason` (server đã trả câu gợi ý), rồi map
 * theo `error_code`, cuối cùng fallback `detail`.
 */
export function fieldErrorMessage(err?: APIError): string {
  if (!err) return 'Có lỗi xảy ra. Bạn thử lại nhé.';
  if (err.reason && err.reason.trim()) return err.reason;

  switch (err.error_code) {
    case 'flat':
      return 'Các góc chụp gần như giống nhau. Hãy ĐI VÒNG QUANH cây thật và chụp các góc khác nhau (đừng đứng yên một chỗ).';
    case 'heterogeneous':
      return 'Ảnh lẫn nhiều vật khác nhau — hãy chụp tập trung vào MỘT cây, cùng một thân.';
    case 'need_gps':
      return 'Cần bật định vị (GPS) để tạo/nhận diện cây. Hãy bật Vị trí rồi thử lại.';
    case 'duplicate_tree':
      return 'Cây này có thể đã được tạo trước đó.';
    default:
      break;
  }

  switch (err.type) {
    case 'network_error':
      return 'Mất kết nối mạng. Kiểm tra sóng/Wi-Fi rồi thử lại.';
    case 'auth_error':
      return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.';
    case 'rate_limited':
      return 'Thao tác quá nhanh. Chờ một chút rồi thử lại.';
    case 'server_error':
      return 'Máy chủ đang bận. Thử lại sau ít phút.';
    default:
      return err.detail || 'Có lỗi xảy ra. Bạn thử lại nhé.';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_TOKEN_KEY = 'auth_token';
// Timeout mặc-định cho request nhẹ (trees / verdict / delete).
const REQUEST_TIMEOUT_MS = 45_000;

// Timeout cho tác-vụ NẶNG ẢNH (identify / enroll / verify_add): upload 20–30+ ảnh
// rồi backend chạy match vỏ-thân (sift/xfeat/loftr) thường >45s → 45s bị AbortError.
// Nâng lên 120s để không tự huỷ giữa chừng. (Xem log: tree_identity_api_error =
// "AbortError: Aborted" đúng ~45s mỗi lần.)
const IMAGE_REQUEST_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Shared internal helper
// ---------------------------------------------------------------------------

async function _getAuthHeader(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/** Cắt phần gốc (https://host) khỏi URL đầy đủ để truyền cho ensureOrilifeToken. */
function _baseOf(url: string): string {
  const i = url.indexOf('/api/');
  return i > 0 ? url.slice(0, i) : url;
}

async function _apiCall<T>(
  url: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: FormData,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  attempt = 0,
): Promise<{ ok: boolean; data?: T; error?: APIError }> {
  // Đảm bảo có token DID trước khi gọi (mở app vào thẳng luồng cây chưa ký DID → 401 oan).
  // Cùng auth_token field-reid với fruitReIDService — dùng chung cơ chế ký lại.
  await ensureOrilifeToken(_baseOf(url));
  const authHeader = await _getAuthHeader();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutHandle);

    if (resp.status === 401) {
      // Token hết hạn GIỮA BUỔI → ký lại bằng DID 1 lần rồi thử lại (khớp fruitReIDService).
      // Trước đây trả thẳng auth_error → getTrees/identify câm giữa thực địa, không tự hồi:
      // nông dân không chọn được cây để quay video dù mạng vẫn tốt.
      if (attempt === 0 && (await ensureOrilifeToken(_baseOf(url), { force: true }))) {
        return _apiCall<T>(url, method, body, timeoutMs, 1);
      }
      return {
        ok: false,
        error: { type: 'auth_error', detail: 'Token hết hạn hoặc không hợp lệ', http_status: 401 },
      };
    }

    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      return {
        ok: false,
        error: {
          type: 'rate_limited',
          detail: 'Quá nhiều yêu cầu',
          http_status: 429,
          retry_after_seconds: retryAfter ? parseInt(retryAfter, 10) : 60,
        },
      };
    }

    if (resp.status === 409) {
      let detail = 'Trùng lặp';
      let errorCode: string | undefined;
      let existingTreeId: string | undefined;
      try {
        const body409 = await resp.json();
        // Đọc CẢ HAI dạng thân lỗi. Backend field-reid trả `error` + `similar.tree_id`;
        // `detail` + `existing_tree_id` là bí danh bắc cầu thêm ở #235 cho bản app cũ.
        // Chỉ đọc một dạng là nút "Gộp vào cây cũ" báo "Không xác định được cây trùng"
        // đúng lúc người ta đang đứng ngoài vườn — lỗi field-test 26/07 mục 1(c).
        detail = body409.detail ?? body409.error ?? detail;
        // `code`/`error_code` là hợp-đồng bên này TƯỞNG có — máy chủ CHƯA BAO GIỜ gửi.
        // `grep -rn "duplicate_tree" OriLifeTrace` = rỗng. Thứ máy chủ thật sự gửi là
        // ba CỜ BOOLEAN, mỗi loại 409 một cờ:
        //   server.py:2115  {"ok":false,"error":…,"heterogeneous":true}
        //   server.py:2120  {"ok":false,"error":…,"flat":true}
        //   server.py:2128  {"ok":false,"error":…,"detail":…,"duplicate":true,"existing_tree_id":…}
        // Thiếu ba dòng dưới thì `error_code` luôn undefined, màn đăng-ký phải đoán loại
        // 409 bằng cách dò chữ trong câu tiếng Việt — và nó đoán trượt (xem classify409).
        errorCode = body409.code ?? body409.error_code
          ?? (body409.duplicate ? 'duplicate_tree'
            : body409.flat ? 'flat'
              : body409.heterogeneous ? 'heterogeneous' : undefined);
        existingTreeId = body409.existing_tree_id ?? body409.similar?.tree_id ?? undefined;
      } catch { /* bỏ qua */ }
      return {
        ok: false,
        error: { type: 'duplicate', detail, http_status: 409, error_code: errorCode, existing_tree_id: existingTreeId },
      };
    }

    if (resp.status === 400 || resp.status === 422) {
      let detail = 'Dữ liệu không hợp lệ';
      let errorCode: string | undefined;
      let reason: string | undefined;
      try {
        const body = await resp.json();
        detail = body.detail ?? detail;
        // Backend field-reid trả mã lỗi chất-lượng ảnh ở code/error_code + câu gợi ý ở reason.
        errorCode = body.code ?? body.error_code ?? undefined;
        reason = body.reason ?? undefined;
      } catch { /* bỏ qua */ }
      return {
        ok: false,
        error: { type: 'validation_error', detail, http_status: resp.status, error_code: errorCode, reason },
      };
    }

    if (resp.status >= 500) {
      return {
        ok: false,
        error: { type: 'server_error', detail: `Lỗi máy chủ: HTTP ${resp.status}`, http_status: resp.status },
      };
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: { type: 'server_error', detail: `HTTP ${resp.status}`, http_status: resp.status },
      };
    }

    const data = await resp.json() as T;
    return { ok: true, data };

  } catch (err: unknown) {
    clearTimeout(timeoutHandle);
    const isTimeoutErr = err instanceof Error && err.name === 'AbortError';
    const isConnErr = err instanceof TypeError && !isTimeoutErr;

    if (isConnErr && attempt === 0) {
      return _apiCall<T>(url, method, body, timeoutMs, 1);
    }

    return {
      ok: false,
      error: { type: 'network_error', detail: String(err), http_status: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Identify options
// ---------------------------------------------------------------------------

/** Matcher vỏ-thân (PoC-Tree §4 M4) — override ENV backend, CHỈ cho tester. */
export type ShellMatcher = 'sift' | 'xfeat' | 'loftr';

/**
 * Hướng máy lúc chụp MỘT ảnh, song song với `files[]`.
 *
 * ⚠ TÊN TRƯỜNG TRÊN DÂY LÀ `view_poses`, KHÔNG PHẢI `captures`.
 * `captures` là tên của khái niệm phía app (phiên chụp trong Redux). Máy chủ khai
 * receiver dưới tên khác — `server.py:2382` (enroll) và `:2734` (verify_add),
 * `view_poses: str = Form(None)`, parser `_parse_view_poses` (`:339`). Grep
 * `captures|heading_ref` trên `server.py` nhánh main: **0 khớp**.
 *
 * Bản trước gửi `captures`. FastAPI bỏ im lặng trường không khai ⇒ toàn bộ tư thế
 * theo từng ảnh rơi mất, không một lỗi nào in ra — đúng thứ mà chính máy chủ ghi
 * trong chú thích của họ: *"Trước đây server KHÔNG có receiver nào cho `view_poses`
 * → mảng pose rơi ÂM-THẦM"* (`server.py:297`). Họ đã dựng receiver; app thì vẫn gõ
 * tên cũ. Hai bên cùng sửa một lỗi, ở hai phía, mà không gặp nhau.
 *
 * Khuôn dữ liệu KHÔNG đổi — mảng song song `files[]`, ảnh không có số để `null` —
 * và nó vốn đã khớp `_view_pose_item` (`server.py:318`) từng trường một.
 *
 * Đơn vị (OriLife đề nghị 2026-07-29): `heading` độ [0,360), `pitch` độ [-90,90]
 * dương là ngẩng lên, `roll` độ [-180,180] dương là nghiêng phải.
 */
export interface CaptureOrientation {
  heading?: number | null;
  pitch?: number | null;
  roll?: number | null;
}

/**
 * Gốc quy chiếu của `heading` — gửi kèm để server lọc được, vì hai nền tảng KHÔNG
 * cùng gốc và app chưa sửa được điều đó:
 *   · `ios_true_or_magnetic` — `HeadingCaptureManager.swift:278` lấy `trueHeading`
 *     khi hợp lệ, ÂM THẦM rơi về `magneticHeading` khi không. Không phân biệt được
 *     từng mẫu ở tầng JS.
 *   · `android_magnetic` — `HeadingSensorReader.kt:27` đọc `TYPE_ROTATION_VECTOR`
 *     và KHÔNG cộng độ lệch từ (`GeomagneticField`), nên là Bắc TỪ.
 *
 * OriLife yêu cầu Bắc THẬT. App CHƯA đạt, và sửa là việc native (Thư) — đã báo.
 * Trong lúc đó thà khai đúng gốc quy chiếu còn hơn dán nhãn "true" cho số Bắc từ.
 *
 * ⚠ MÁY CHỦ CHƯA CÓ CHỖ NHẬN. `grep heading_ref` toàn `MassTreeIdentify/core/` nhánh
 * main: 0 khớp. Trường này đang bị bỏ im lặng. Vẫn gửi (không tốn gì, sẵn sàng cho
 * ngày họ thêm), nhưng KHÔNG được coi là "đã khai báo gốc quy chiếu" — trên máy chủ
 * hiện mọi số heading vẫn không có nguồn gốc. Đã xin OriLife thêm receiver.
 * Nó cũng không nhét được vào từng phần tử `view_poses`: parser chỉ giữ field SỐ
 * (`_view_pose_item`, `server.py:325-336`), mà đây là chuỗi.
 */
export type HeadingRef = 'ios_true_or_magnetic' | 'android_magnetic';

export interface IdentifyOptions {
  lat?: number;
  lon?: number;
  acc?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  /** Hướng THEO TỪNG ẢNH, song song `files[]`. Có `captures` thì nó thắng cấp request. */
  captures?: CaptureOrientation[];
  /** Gốc quy chiếu của mọi con số heading trong lần gửi này. */
  headingRef?: HeadingRef;
  /** Khi true: bỏ qua kiểm tra trùng lặp, tạo cây mới bất kể. Dùng cho handleForceEnroll. */
  force?: boolean;
  /**
   * ADDITIVE (PoC-Tree §4 M4): ép matcher vỏ-thân (sift|xfeat|loftr) qua
   * ?matcher=. Mặc-định KHÔNG gửi → backend dùng đường ENV. Chỉ tester bật.
   */
  matcher?: ShellMatcher;
  /**
   * Vườn của cây. `enrollTree` đã gửi `farm_id` từ lâu (xem chú thích ở đó), còn
   * `verifyAddTree` thì không — nên GỘP ảnh vào cây cũ làm backend gán
   * `farm_id = null`, và `/api/trees?farm_id=X` lọc bỏ chính cây đó. Nông dân
   * thấy cây "biến mất khỏi vườn" ngay sau khi bổ sung ảnh cho nó.
   */
  farmId?: string;
}

export type IdentifyVerdict = 'correct' | 'wrong' | 'other';

export interface IdentifyVerdictResponse {
  ok: boolean;
  query_id: string;
  verdict: IdentifyVerdict;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Gắn GPS + hướng máy vào form. Dùng chung cho identify / enroll / verify_add để ba
 * route không lệch nhau — trước đây enroll không gửi hướng nào, mà enroll lại chính
 * là nguồn dựng 3D, tức chỗ mất dữ liệu nặng nhất.
 *
 * Quy tắc bỏ trường (OriLife chốt): thiếu số thì **KHÔNG gửi khoá đó**. Đừng gửi
 * chuỗi rỗng, đừng gửi "null" — server ép kiểu không nổ nhưng nhật ký lưu rác.
 *
 * XUẤT ra chỉ để bài kiểm khoá được TÊN TRƯỜNG TRÊN DÂY. Tên sai ở đây không làm
 * gãy gì cả — máy chủ bỏ im lặng — nên không có cách nào khác để bắt.
 */
export function appendGeoAndOrientation(form: FormData, options: IdentifyOptions): void {
  if (options.lat !== undefined) form.append('lat', String(options.lat));
  if (options.lon !== undefined) form.append('lon', String(options.lon));
  if (options.acc !== undefined) form.append('acc', String(options.acc));
  if (options.heading !== undefined) form.append('heading', String(options.heading));
  if (options.pitch !== undefined) form.append('pitch', String(options.pitch));
  if (options.roll !== undefined) form.append('roll', String(options.roll));
  if (options.headingRef) form.append('heading_ref', options.headingRef);

  // Chỉ gửi khi có ÍT NHẤT một ảnh có số thật — mảng toàn null chỉ làm nặng request
  // và làm nhật ký server bẩn thêm.
  // Tên trường trên dây là `view_poses` (xem chú thích `CaptureOrientation`). KHÔNG
  // đổi lại thành `captures`: máy chủ không khai tên đó, và trường không khai bị bỏ
  // im lặng chứ không báo lỗi.
  if (options.captures?.length) {
    const anyReal = options.captures.some(
      c => c && (c.heading != null || c.pitch != null || c.roll != null),
    );
    if (anyReal) form.append('view_poses', JSON.stringify(options.captures));
  }
}

/** Dựng mảng `captures` từ ảnh native đã chụp (đã song song với `files[]`). */
export function toCaptureOrientations(
  caps: Array<{ heading?: number | null; pitch?: number | null; roll?: number | null }>,
): CaptureOrientation[] {
  return caps.map(c => ({
    heading: Number.isFinite(c?.heading as number) ? (c.heading as number) : null,
    pitch: Number.isFinite(c?.pitch as number) ? (c.pitch as number) : null,
    roll: Number.isFinite(c?.roll as number) ? (c.roll as number) : null,
  }));
}

/** Gốc quy chiếu heading của nền tảng đang chạy. Xem chú thích `HeadingRef`. */
export function platformHeadingRef(): HeadingRef {
  return Platform.OS === 'ios' ? 'ios_true_or_magnetic' : 'android_magnetic';
}

export async function identifyTree(
  baseUrl: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
): Promise<{ ok: boolean; data?: IdentifyResponse; error?: APIError }> {
  const form = new FormData();

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  appendGeoAndOrientation(form, options);
  form.append('source', 'phone');

  // M4: chỉ nối ?matcher= khi tester ép — mặc-định để backend dùng ENV.
  const qs = options.matcher ? `?matcher=${encodeURIComponent(options.matcher)}` : '';
  return _apiCall<IdentifyResponse>(`${baseUrl}/api/identify${qs}`, 'POST', form, IMAGE_REQUEST_TIMEOUT_MS);
}

/**
 * submitIdentifyVerdict — gửi phán-quyết người dùng cho 1 lần identify (PoC-Tree §4 M3).
 *
 * POST /api/identify_verdict (form): query_id (bắt-buộc), verdict (bắt-buộc),
 * correct_tid? (khi verdict='other', mã cây đúng lấy từ /api/trees).
 * Auth Bearer (qua _apiCall). Trả { ok, query_id, verdict }; 400 nếu thiếu/sai.
 */
export async function submitIdentifyVerdict(
  baseUrl: string,
  params: { queryId: string; verdict: IdentifyVerdict; correctTid?: string },
): Promise<{ ok: boolean; data?: IdentifyVerdictResponse; error?: APIError }> {
  const form = new FormData();
  form.append('query_id', params.queryId);
  form.append('verdict', params.verdict);
  if (params.correctTid) form.append('correct_tid', params.correctTid);

  return _apiCall<IdentifyVerdictResponse>(`${baseUrl}/api/identify_verdict`, 'POST', form);
}

export async function enrollTree(
  baseUrl: string,
  name: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
  farmId?: string,
): Promise<{ ok: boolean; data?: EnrollResponse; error?: APIError }> {
  const form = new FormData();

  form.append('name', name);
  form.append('source', 'phone');

  // Gắn cây vào vườn hiện-hành — nếu thiếu, backend gán farm_id=null và
  // /api/trees?farm_id=X sẽ lọc bỏ cây (cây không hiện trong vườn nào).
  if (farmId) form.append('farm_id', farmId);

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  appendGeoAndOrientation(form, options);
  // Gửi CẢ HAI tên trường: `dup` là hợp-đồng sạch OriLife chốt ở #235
  // (`_Agents/inbox/_done/OriLife-to-SuperApp-fieldtest-12-fixes-API-handoff-2026-07-26.md` mục 1),
  // `force` là bí danh backend bắc cầu cho bản app cũ. Gửi cả hai để app chạy đúng
  // dù backend đã hay chưa deploy #235 — đây từng là vòng 409 lặp vô tận ngoài đồng.
  if (options.force) {
    form.append('force', 'true');
    form.append('dup', 'true');
  }

  return _apiCall<EnrollResponse>(`${baseUrl}/api/enroll`, 'POST', form, IMAGE_REQUEST_TIMEOUT_MS);
}

export async function verifyAddTree(
  baseUrl: string,
  treeId: string,
  imagePaths: string[],
  options: IdentifyOptions = {},
): Promise<{ ok: boolean; data?: VerifyAddResponse; error?: APIError }> {
  const form = new FormData();

  form.append('tree_id', treeId);
  form.append('source', 'phone');

  // Gửi `farm_id` NHẤT QUÁN với `enrollTree`. Thiếu nó thì backend gán null và cây
  // rơi khỏi bộ lọc `/api/trees?farm_id=X` — bổ sung ảnh xong là cây mất khỏi vườn.
  if (options.farmId) form.append('farm_id', options.farmId);

  for (let i = 0; i < imagePaths.length; i++) {
    (form as any).append('files', { uri: imagePaths[i], type: 'image/jpeg', name: `img_${i}.jpg` });
  }

  // verify_add cũng nhận heading/pitch/roll (`server.py:1941`) — gộp ảnh vào cây đã
  // có mà không gửi hướng thì ảnh mới kém giá trị hơn ảnh cũ.
  appendGeoAndOrientation(form, options);

  return _apiCall<VerifyAddResponse>(`${baseUrl}/api/verify_add`, 'POST', form, IMAGE_REQUEST_TIMEOUT_MS);
}

export async function getTrees(
  baseUrl: string,
  farmId?: string,
): Promise<{ ok: boolean; trees?: TreeInfo[]; error?: APIError }> {
  // Lọc theo vườn khi có farm_id (contract field-reid: GET /api/trees?farm_id=X).
  const qs = farmId ? `?farm_id=${encodeURIComponent(farmId)}` : '';
  const result = await _apiCall<TreeListResponse>(`${baseUrl}/api/trees${qs}`, 'GET');
  if (result.ok && result.data) {
    return { ok: true, trees: result.data.trees };
  }
  return { ok: false, error: result.error };
}

/**
 * Map TreeInfo (field-reid) → shape mà UI/Redux farmSlice kỳ-vọng (Tree-like).
 *
 * Vì cây giờ đến TỪ field-reid, cờ 3D phải vào ĐÚNG field UI đọc.
 * TreeCard (FarmDetailScreen) gate chip "Xem 3D" theo:
 *   item.has_3d ?? item.has3DModel ?? item.latest_mesh_cid ?? item.meshCid
 * → ta đặt `has_3d` = field-reid `has3d`. Sửa lỗi cũ "chip 3D không bao giờ
 *   hiện vì cây đến từ Lợi" (Lợi không trả cờ 3D).
 *
 * gps field-reid là [lat, lon] → tách ra latitude/longitude cho dedup GPS + map.
 */
export function mapTreeInfoToUI(t: TreeInfo, farmId: string): any {
  const gps = Array.isArray(t.gps) && t.gps.length >= 2 ? t.gps : null;
  return {
    id: t.tree_id,
    farmId,
    code: t.code ?? t.tree_id,
    name: t.name,
    farmer_name: t.name,
    species: t.species ?? undefined,
    latitude: gps ? gps[0] : undefined,
    longitude: gps ? gps[1] : undefined,
    images: [],
    estimatedFruits: 0,
    fruitCount: 0,
    // Cờ 3D field-reid → field UI đang đọc (làm sáng chip "Xem 3D").
    has_3d: !!t.has3d,
    anchor: t.anchor ?? null,
    n_views: t.n_views,
  };
}

export async function deleteTree(
  baseUrl: string,
  treeId: string,
): Promise<{ ok: boolean; error?: APIError }> {
  const form = new FormData();
  form.append('tree_id', treeId);

  const result = await _apiCall<{ ok: boolean }>(`${baseUrl}/api/delete`, 'POST', form);
  return { ok: result.ok, error: result.error };
}

export async function renameTree(
  baseUrl: string,
  treeId: string,
  name: string,
): Promise<{ ok: boolean; error?: APIError }> {
  const form = new FormData();
  form.append('tree_id', treeId);
  form.append('name', name);

  const result = await _apiCall<{ ok: boolean }>(`${baseUrl}/api/rename`, 'POST', form);
  return { ok: result.ok, error: result.error };
}

/**
 * buildTree3D — YÊU CẦU máy chủ dựng mô hình 3D cho cây (H-11/H-25).
 * POST /api/build3d/{tree_id} (auth chủ cây):
 *   200 { ok:true, building:true } → đã nhận vào làn dựng.
 *   404 { ok:false, error:"không có xuất xứ" } → cây chưa có provenance (chưa đăng ký xong).
 *
 * QUAN TRỌNG (H-25): server chỉ chạy 3D khi làn provenance RẢNH → `building:true` KHÔNG
 * đồng nghĩa "đang dựng ngay", thường là "đã xếp hàng, chờ hạ tầng rảnh". UI phải nói
 * "đã xếp hàng" thay vì "đang dựng" quay mãi. `_apiCall` không đọc body 404 nên phân biệt
 * "chưa có xuất xứ" qua `error.http_status === 404`.
 */
export async function buildTree3D(
  baseUrl: string,
  treeId: string,
): Promise<{ ok: boolean; building?: boolean; noProvenance?: boolean; error?: APIError }> {
  const result = await _apiCall<{ ok: boolean; building?: boolean }>(
    `${baseUrl}/api/build3d/${encodeURIComponent(treeId)}`,
    'POST',
  );
  if (result.ok && result.data) {
    return { ok: !!result.data.ok, building: result.data.building };
  }
  return { ok: false, noProvenance: result.error?.http_status === 404, error: result.error };
}

/**
 * setTreeFarm — GÁN/ĐỔI vườn cho cây ĐÃ đăng ký. `POST /api/tree/set_farm`.
 *
 * Đây là đường vá lỗi thực địa 11/07 "tạo vườn nhưng cây không vào vườn": sửa
 * link SAU khi enroll, thay vì phải xoá cây rồi tạo lại. Máy chủ có đường này từ
 * lúc đó; app chưa từng gọi.
 *
 * `farmId` rỗng/`null` → GỠ cây khỏi vườn (về mồ côi). Cây vẫn truy được bình
 * thường — đây là hành vi cố ý, không phải mất dữ liệu.
 *
 * Hai mã lỗi có nghĩa khác nhau, đừng gộp:
 *   `403` — cây không thuộc chủ (chống IDOR).
 *   `404` — vườn không tồn tại **hoặc** không thuộc tài khoản này. Máy chủ CỐ Ý
 *           gộp hai ca vào một mã để không lộ sự tồn tại vườn của người khác, nên
 *           app cũng không được đoán ra ca nào.
 *
 * Máy chủ nói rõ vì sao cửa này báo lỗi tường minh thay vì bỏ qua âm thầm như
 * `enroll`: đây là cửa SỬA LINK chuyên trách — gán hụt mà im lặng thì việc vá vô nghĩa.
 */
export async function setTreeFarm(
  baseUrl: string,
  treeId: string,
  farmId: string | null,
): Promise<{ ok: boolean; farmId?: string | null; notOwner?: boolean; farmNotFound?: boolean; error?: APIError }> {
  const form = new FormData();
  form.append('tree_id', treeId);
  // Gửi chuỗi rỗng = gỡ khỏi vườn (`Form(None)` phía máy chủ nhận rỗng → mồ côi).
  form.append('farm_id', farmId ?? '');

  const result = await _apiCall<{ ok: boolean; tree_id?: string; farm_id?: string | null }>(
    `${baseUrl}/api/tree/set_farm`,
    'POST',
    form,
  );
  if (result.ok && result.data) {
    // `data.ok === false` là máy chủ nói KHÔNG gán được (cây không có trong kho ảnh)
    // — HTTP vẫn 200. Đọc cờ, đừng đọc mỗi tầng vận chuyển.
    return { ok: result.data.ok === true, farmId: result.data.farm_id ?? null };
  }
  return {
    ok: false,
    notOwner: result.error?.http_status === 403,
    farmNotFound: result.error?.http_status === 404,
    error: result.error,
  };
}

/**
 * removeTreeViews — XOÁ các góc ảnh đã chụp nhầm. `POST /api/remove_views`.
 *
 * Đây chính là nút mà `capture/plan` trỏ tới khi trả `next.action = "recheck"`.
 * Không có nó thì `recheck` là một lời khuyên **không làm được**, và một tấm chụp
 * nhầm cây bên cạnh nằm lại trong chữ ký cây vĩnh viễn.
 *
 * `indices` là VỊ TRÍ trong danh sách góc của cây (`/api/tree_views`), không phải
 * id. ⚠ Xoá xong thì các vị trí phía sau DỒN LÊN — gọi lại `/api/tree_views` sau
 * mỗi lượt xoá, đừng xoá nhiều lượt liên tiếp theo một danh sách vị trí cũ.
 *
 * Máy chủ bỏ qua vị trí không phải số và trả `removed` = số ảnh THẬT SỰ bị xoá.
 * Đọc `removed`, đừng suy từ `indices.length`: hai số đó lệch nhau là dấu hiệu
 * app đang đếm theo một danh sách đã cũ.
 */
export async function removeTreeViews(
  baseUrl: string,
  treeId: string,
  indices: number[],
): Promise<{ ok: boolean; removed?: number; notOwner?: boolean; error?: APIError }> {
  const clean = indices.filter((i) => Number.isInteger(i) && i >= 0);
  if (clean.length === 0) {
    // Không gọi máy chủ với danh sách rỗng: `indices` là `Form(...)` bắt buộc, gửi
    // rỗng ra 422 — một lỗi do app tự tạo, không phải lỗi của người dùng.
    return { ok: false, removed: 0, error: { type: 'validation_error', detail: 'Chưa chọn ảnh nào để xoá', http_status: 0 } };
  }
  const form = new FormData();
  form.append('tree_id', treeId);
  form.append('indices', clean.join(','));

  const result = await _apiCall<{ ok: boolean; removed?: number }>(
    `${baseUrl}/api/remove_views`,
    'POST',
    form,
  );
  if (result.ok && result.data) {
    return { ok: result.data.ok === true, removed: result.data.removed ?? 0 };
  }
  return { ok: false, notOwner: result.error?.http_status === 403, error: result.error };
}
