/**
 * MobileCore l0/net — HTTP client hợp nhất.
 *
 * Gộp 3 kiểu xử lý 401 khác nhau đã harvest từ SuperApp (branch
 * claude/orilife-farm-sync-enroll-gate):
 *   1. proofchat-api.ts   — axios interceptor: refresh single-flight + retry 1 lần,
 *                            bỏ qua /auth/* (đây là kiểu ĐÚNG, ta hợp nhất theo kiểu này).
 *   2. treeReIDService.ts — fetch thô: 401 → trả thẳng lỗi auth_error, KHÔNG refresh
 *                            (không có single-flight, không retry).
 *   3. phoenixKey-api.ts  — axios interceptor: KHÔNG xử lý 401 gì cả, 401 rơi thẳng
 *                            xuống caller thành PhoenixKeyApiError.
 * → l0/net thống nhất về kiểu (1): single-flight refresh + retry đúng 1 lần, chặn
 *   vòng lặp ở /auth/*, dùng chung cho mọi request qua `TokenProvider` injected.
 *   Client PhoenixKey (không có refresh-token) đặt `disableAutoRefresh: true`.
 *
 * L0 THUẦN: không import react-native/AsyncStorage/axios. Dùng `fetch` toàn cục
 * (React Native cấp sẵn runtime). Token/storage do platform tầng trên INJECT qua
 * config (giữ contract `l0/types.ts` — KVStorage/TokenProvider/HttpRequestOptions
 * /HttpResponse ĐÓNG BĂNG, không đổi shape).
 *
 * GIỚI HẠN THIẾT KẾ (ghi rõ, KHÔNG phải bug):
 *   - Single-flight refresh có CỬA SỔ HẸP gây double-refresh: nếu refresh vừa xong và
 *     `refreshInFlight` reset về null ngay TRƯỚC khi một 401 song song kịp đọc nó, thì
 *     request đó kích refresh lần 2. Với refresh-token XOAY VÒNG, việc này có thể vô
 *     hiệu phiên. Chống triệt để (khoá/nonce/xoay-token-an-toàn) thuộc TokenProvider —
 *     NGOÀI tầm net (net chỉ gom trùng trong 1 tick JS, không sở hữu vòng đời token).
 *   - `isFormData` dựa `opts.body instanceof globalThis.FormData` — ĐÚNG trong runtime
 *     React Native (FormData toàn cục). Nếu tái dùng net NGOÀI RN (worker/Node không có
 *     global FormData tương thích) phải chuyển sang duck-type (`typeof body.append === 'function'`).
 *   - unwrap MẶC ĐỊNH = PASS-THROUGH an toàn (KHÔNG đoán envelope, không bao giờ ném
 *     theo hình-dạng). Backend có envelope PHẢI truyền unwrap tường minh:
 *     `phoenixKeyUnwrap` (PhoenixKey `{code,message,result}`) hoặc `nestJsUnwrap`
 *     (NestJS `{data,message,statusCode}`). Tránh false-positive ném/nuốt-payload khi
 *     tái dùng cùng client cho nhiều backend.
 */
import { MobileCoreError } from '../errors';
import type {
  TokenProvider,
  HttpRequestOptions,
  HttpResponse,
} from '../types';

/** Timeout mặc định khi request không tự set `opts.timeoutMs` (harvest: REQUEST_TIMEOUT_MS nhẹ). */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Timeout riêng cho TokenProvider (`getToken`/`refreshToken`). Hàm này do platform
 * INJECT — có thể treo (prompt sinh trắc không trả lời, mạng hang) mà fetch-timeout
 * KHÔNG bao được (nó nằm TRƯỚC/NGOÀI fetch). Không có timeout ở đây → sync `drain()`
 * kẹt `isProcessing=true` vĩnh viễn → đóng băng toàn outbox, mất dữ liệu lặng.
 * Ngắn hơn fetch-timeout vì cấp token phải nhanh.
 */
const DEFAULT_TOKEN_TIMEOUT_MS = 15_000;

/**
 * PhoenixKey envelope `{code,message,result}`: `code === 1000` = THÀNH CÔNG; mọi
 * `code` khác = lỗi ứng dụng NẰM TRONG HTTP 200. Nguồn: `src/services/phoenixKey-api.ts`
 * hàm `unwrap` (dòng 256-281 — `if (res.data.code !== 1000) throw PhoenixKeyApiError`).
 */
const PHOENIXKEY_SUCCESS_CODE = 1000;

/** Khoá nhạy cảm bị REDACT trước khi nhét vào `error.detail` (không log token/secret). */
const SENSITIVE_DETAIL_KEYS = new Set([
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'password',
  'secret',
  'apikey',
]);

export interface HttpClientConfig {
  /** Gốc URL, KHÔNG có dấu `/` cuối (net tự nối `path`). */
  baseUrl: string;
  /**
   * Cấp/làm-mới token — net bọc single-flight quanh `refreshToken()`.
   * `TokenProvider` sở hữu TRỌN việc lưu token (kể cả refresh-token xoay vòng),
   * nên `l0/net` KHÔNG cần `KVStorage` — không đọc/ghi storage ở tầng này.
   */
  tokens: TokenProvider;
  /**
   * Bóc envelope response thành payload thật. MẶC ĐỊNH = PASS-THROUGH an toàn
   * (trả nguyên body, KHÔNG đoán envelope, KHÔNG bao giờ ném theo hình-dạng) — để
   * TÁI DÙNG được cho mọi backend mà không false-positive. Backend có envelope
   * truyền hàm tường minh: `phoenixKeyUnwrap` hoặc `nestJsUnwrap` (export cùng file).
   * Unwrap ĐƯỢC PHÉP `throw MobileCoreError` khi envelope báo lỗi (vd PhoenixKey
   * code≠1000) — net bọc lời gọi unwrap trong try/catch và phân loại lại.
   */
  unwrap?: (raw: unknown) => unknown;
  /** Override timeout mặc định cho mọi request của client này (per-request: `opts.timeoutMs`). */
  timeoutMs?: number;
  /**
   * Timeout riêng cho `tokens.getToken()`/`tokens.refreshToken()` (mặc định 15s).
   * Chống TokenProvider treo làm đóng băng toàn outbox. Hết giờ → ném `net/timeout`
   * (retryable:true) thay vì chờ vô hạn.
   */
  tokenTimeoutMs?: number;
  /**
   * Tắt tự-động refresh khi gặp 401 cho client này. Dùng cho backend KHÔNG có
   * refresh-token (vd PhoenixKey): 401 rơi thẳng thành `net/unauthorized`, không
   * gọi `tokens.refreshToken()`. Mặc định `false` (bật single-flight refresh).
   */
  disableAutoRefresh?: boolean;
}

export interface HttpClient {
  request<T = unknown>(
    path: string,
    opts?: HttpRequestOptions,
  ): Promise<HttpResponse<T>>;
}

/**
 * Endpoint auth KHÔNG kích refresh (tránh vòng lặp refresh gọi chính route refresh).
 * Các route auth thật nằm ở TIỀN TỐ GỐC `/auth/` — nguồn `src/services/proofchat-api.ts`:
 * `/auth/refresh` (dòng 224), `/auth/phoenixkey/login` (248), `/auth/logout` (259);
 * baseURL chứa host nên `path` truyền vào bắt đầu bằng `/auth/`. Dùng `startsWith`
 * (chặt hơn `includes` cũ — không nhận nhầm `/x/auth/y`).
 */
function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/auth/');
}

/**
 * Lỗi-envelope (vd PhoenixKey code≠1000) mặc định KHÔNG retry — chống retry vô hạn
 * một lỗi ứng dụng VĨNH VIỄN (không tồn tại / trùng / sai nghiệp vụ). Chưa có bằng
 * chứng mã PhoenixKey nào là TẠM THỜI nên luôn `false`. [NEEDS-EVIDENCE] nếu sau này
 * cần map một số code sang retryable=true.
 * LƯU Ý: quy tắc "unknown→false" NÀY chỉ áp cho lỗi-envelope-response, KHÔNG áp cho
 * nhánh refresh-failure (nhánh đó mặc định `net/auth-transient` retryable=true).
 */
function isRetryableEnvelopeCode(_code: number): boolean {
  return false;
}

/**
 * Redact 1-tầng-sâu các khoá nhạy cảm trước khi đưa body vào `error.detail`
 * (đừng để token/Authorization/mật khẩu lọt vào log qua detail).
 */
function scrubForDetail(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrubForDetail);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_DETAIL_KEYS.has(key.toLowerCase())
      ? '[REDACTED]'
      : scrubForDetail(val);
  }
  return out;
}

/**
 * Unwrap MẶC ĐỊNH — PASS-THROUGH an toàn: trả NGUYÊN body làm payload, KHÔNG đoán
 * envelope, KHÔNG bao giờ ném theo hình-dạng. Nhờ vậy 1 client tái dùng được cho
 * MỌI backend mà không false-positive (backend trả `{code:4,message:"page 4",data}`
 * KHÔNG bị coi là lỗi; `{code:1000,data}` KHÔNG bị nuốt payload). Backend có envelope
 * PHẢI chọn `phoenixKeyUnwrap`/`nestJsUnwrap` tường minh.
 */
function defaultUnwrap(raw: unknown): unknown {
  return raw;
}

/**
 * Unwrap PhoenixKey (`{code,message,result}`) — OPT-IN: client PhoenixKey PHẢI truyền
 * `unwrap: phoenixKeyUnwrap`. `code === 1000` → trả `result` (undefined nếu thiếu);
 * `code ≠ 1000` → NÉM `MobileCoreError` (lỗi ứng dụng ẩn trong HTTP 200, KHÔNG được
 * coi là thành công lặng). Nguồn: `src/services/phoenixKey-api.ts:256-281`.
 * Body không phải envelope PhoenixKey (thiếu `code` số) → trả nguyên (pass-through).
 */
export function phoenixKeyUnwrap(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') {
    const body = raw as Record<string, unknown>;
    if ('code' in body && typeof body.code === 'number') {
      if (body.code !== PHOENIXKEY_SUCCESS_CODE) {
        throw new MobileCoreError(
          'net/validation',
          `PhoenixKey application error in HTTP 200 (code ${body.code})`,
          {
            detail: {
              envelopeCode: body.code,
              envelopeMessage:
                typeof body.message === 'string' ? body.message : undefined,
            },
            retryable: isRetryableEnvelopeCode(body.code),
          },
        );
      }
      return 'result' in body ? body.result : undefined;
    }
  }
  return raw;
}

/**
 * Unwrap NestJS TransformInterceptor (`{data,message,statusCode}`) — OPT-IN. Chỉ bóc
 * khi CÓ CẢ `statusCode` + `data` (chữ ký envelope), ngược lại pass-through. KHÔNG ném.
 * Nguồn: `src/services/proofchat-api.ts`.
 */
export function nestJsUnwrap(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') {
    const body = raw as Record<string, unknown>;
    if ('statusCode' in body && 'data' in body) {
      return body.data;
    }
  }
  return raw;
}

/** Bọc Promise của TokenProvider bằng timeout riêng → hết giờ ném `net/timeout` (retryable). */
function withTokenTimeout<T>(
  promise: Promise<T>,
  ms: number,
  op: 'getToken' | 'refreshToken',
  path: string,
): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => {
      reject(
        new MobileCoreError('net/timeout', `Token ${op} timed out after ${ms}ms: ${path}`, {
          detail: { path, op, tokenTimeoutMs: ms },
          retryable: true,
        }),
      );
    }, ms);
  });
  // Promise gốc KHÔNG huỷ được (raw promise) — nếu provider treo nó rò rỉ ngầm nhưng
  // ta KHÔNG chặn luồng (đã reject bằng net/timeout). Đánh đổi chấp nhận: không treo.
  return Promise.race([promise, timeoutP]).finally(() => {
    if (handle !== undefined) clearTimeout(handle);
  });
}

/** Đọc body response an toàn: rỗng/không phải JSON → trả `undefined` thay vì ném. */
async function safeReadJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { baseUrl, tokens, timeoutMs: clientTimeoutMs, disableAutoRefresh } = config;
  const unwrap = config.unwrap ?? defaultUnwrap;
  const defaultTimeoutMs = clientTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tokenTimeoutMs = config.tokenTimeoutMs ?? DEFAULT_TOKEN_TIMEOUT_MS;

  // Refresh single-flight: nhiều request 401 song song chỉ kích hoạt ĐÚNG 1 lần
  // refresh (harvest proofchat-api.ts ~216-237 — refresh token thường xoay vòng,
  // gọi nhiều lần đồng thời có thể vô hiệu phiên). Không có `await` giữa lúc kiểm
  // tra `refreshInFlight` và lúc gán nó bên dưới — atomic trong 1 tick JS.
  let refreshInFlight: Promise<string | null> | null = null;
  function refreshSingleFlight(): Promise<string | null> {
    if (!refreshInFlight) {
      refreshInFlight = tokens.refreshToken().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function requestInternal<T>(
    path: string,
    opts: HttpRequestOptions,
    tokenOverride: string | null | undefined,
    retried: boolean,
  ): Promise<HttpResponse<T>> {
    // multipart/FormData: KHÔNG stringify, KHÔNG set Content-Type mặc định — để RN
    // tự gắn `multipart/form-data; boundary=...`. Body object thường mới JSON hoá.
    const isFormData =
      typeof FormData !== 'undefined' && opts.body instanceof FormData;

    const headers: Record<string, string> = {};
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    // Caller override (opts.headers) THẮNG mặc định — kể cả tự set Content-Type cho FormData.
    Object.assign(headers, opts.headers);

    if (isFormData) {
      // Footgun phòng thủ: caller (thói quen axios) có thể set 'Content-Type:
      // multipart/form-data' THIẾU `boundary=` → server không parse được, upload ảnh
      // lỗi CÂM. Xoá mọi Content-Type thiếu boundary để RN tự set kèm boundary.
      // (Content-Type CÓ boundary do caller cấp → tôn trọng, giữ nguyên.)
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-type' && !/boundary=/i.test(headers[key])) {
          delete headers[key];
        }
      }
    }

    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    // TokenProvider do platform inject — bọc timeout để provider TREO không đóng băng
    // outbox (fetch-timeout bên dưới KHÔNG bao được getToken vì nó chạy TRƯỚC fetch).
    const token =
      tokenOverride !== undefined
        ? tokenOverride
        : await withTokenTimeout(tokens.getToken(), tokenTimeoutMs, 'getToken', path);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body: string | FormData | undefined;
    if (opts.body === undefined) {
      body = undefined;
    } else if (isFormData) {
      body = opts.body as FormData; // passthrough — giữ nguyên file + boundary
    } else if (typeof opts.body === 'string') {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
    }

    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const externalSignal = opts.signal;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort);
      }
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      const isAbortError = err instanceof Error && err.name === 'AbortError';
      if (isAbortError && timedOut) {
        throw new MobileCoreError(
          'net/timeout',
          `Request timed out after ${timeoutMs}ms: ${path}`,
          { detail: { path, timeoutMs }, retryable: true, cause: err },
        );
      }
      if (isAbortError) {
        throw new MobileCoreError('net/aborted', `Request aborted: ${path}`, {
          detail: { path },
          retryable: false,
          cause: err,
        });
      }
      // fetch ném TypeError cho hỏng-tầng-mạng thật (DNS/mất sóng/connection refused).
      if (err instanceof TypeError) {
        throw new MobileCoreError('net/offline', `Network request failed: ${path}`, {
          detail: { path },
          retryable: true,
          cause: err,
        });
      }
      // Không phân loại được (không timeout/abort/mất-mạng) → net/unknown thay vì
      // rơi lặng hoặc gán nhầm là offline (vd lỗi trong chính runtime fetch).
      throw new MobileCoreError('net/unknown', `Unexpected network error: ${path}`, {
        detail: { path },
        retryable: false,
        cause: err,
      });
    } finally {
      clearTimeout(timeoutHandle);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }

    // 401 — single-flight refresh + retry đúng 1 lần (cờ `retried` chặn lặp vô
    // hạn); /auth/* KHÔNG kích refresh; client `disableAutoRefresh` cũng bỏ qua.
    if (res.status === 401) {
      if (!retried && !disableAutoRefresh && !isAuthEndpoint(path)) {
        let newToken: string | null;
        try {
          newToken = await withTokenTimeout(
            refreshSingleFlight(),
            tokenTimeoutMs,
            'refreshToken',
            path,
          );
        } catch (err) {
          // Provider TREO → withTokenTimeout ném net/timeout: GIỮ NGUYÊN (retryable:true),
          // KHÔNG remap sang auth-transient — đây là "provider không phản hồi", không phải
          // "phiên chết". (Cả 2 đều retryable nên sync retry được; giữ net/timeout để chẩn đoán.)
          if (err instanceof MobileCoreError && err.code === 'net/timeout') {
            throw err;
          }
          // Bảng quyết định refresh-failure (chống MẤT DỮ LIỆU nông dân):
          //   - refresh CHẾT TẠM THỜI (MobileCoreError retryable=true do 5xx/mạng) → auth-transient.
          //   - refresh ném lỗi KHÔNG phân loại được (TokenProvider là interface platform
          //     inject, không đảm bảo ném đúng loại) → MẶC ĐỊNH net/auth-transient.
          // Cả 2 nhánh → auth-transient: chỉ khi refresh trả `null` (hợp đồng "hết phiên
          // thật") mới coi là TERMINAL net/unauthorized bên dưới. auth-transient có TTL
          // riêng ở sync (không retry vô hạn), nên default-transient an toàn hơn mất dữ liệu.
          // (Rule "unknown→false" ở việc unwrap KHÔNG áp cho nhánh này.)
          throw new MobileCoreError(
            'net/auth-transient',
            `Token refresh failed transiently: ${path}`,
            { detail: { path }, retryable: true, cause: err },
          );
        }
        if (newToken) {
          return requestInternal<T>(path, opts, newToken, true);
        }
        // newToken === null → hết phiên THẬT → rơi xuống net/unauthorized TERMINAL.
      }
      throw new MobileCoreError('net/unauthorized', `Unauthorized: ${path}`, {
        detail: { path, status: 401 },
        retryable: false,
      });
    }

    if (res.status === 409) {
      const body409 = await safeReadJson(res);
      // treeReID: 409 duplicate kèm `existing_tree_id`/`code` (treeReIDService.ts:242-255).
      // Giữ body (đã scrub) để caller tách cây trùng; retryable:false (ghi lại = trùng tiếp).
      throw new MobileCoreError('net/conflict', `Conflict HTTP 409: ${path}`, {
        detail: { path, status: 409, body: scrubForDetail(body409) },
        retryable: false,
      });
    }

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader === null ? undefined : Number(retryAfterHeader);
      throw new MobileCoreError('net/rate-limited', `Rate limited: ${path}`, {
        detail: {
          path,
          retryAfterSeconds:
            retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)
              ? retryAfterSeconds
              : undefined,
        },
        retryable: true,
      });
    }

    if (res.status >= 400 && res.status < 500) {
      const body400 = await safeReadJson(res);
      throw new MobileCoreError('net/validation', `Validation error HTTP ${res.status}: ${path}`, {
        detail: { path, status: res.status, body: scrubForDetail(body400) },
        retryable: false,
      });
    }

    if (res.status >= 500) {
      const body500 = await safeReadJson(res);
      throw new MobileCoreError('net/server', `Server error HTTP ${res.status}: ${path}`, {
        detail: { path, status: res.status, body: scrubForDetail(body500) },
        retryable: true,
      });
    }

    const raw = await safeReadJson(res);
    // unwrap ĐƯỢC PHÉP ném (vd PhoenixKey code≠1000). Bọc try/catch để phân loại:
    //   - MobileCoreError từ unwrap → giữ nguyên (đã phân loại retryable đúng).
    //   - lỗi lạ từ unwrap của caller → net/unknown retryable:false (chống retry vô hạn).
    let data: T;
    try {
      data = unwrap(raw) as T;
    } catch (err) {
      if (err instanceof MobileCoreError) {
        throw err;
      }
      throw new MobileCoreError('net/unknown', `Response unwrap failed: ${path}`, {
        detail: { path },
        retryable: false,
        cause: err,
      });
    }
    return { status: res.status, data };
  }

  return {
    request<T = unknown>(path: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
      return requestInternal<T>(path, opts, undefined, false);
    },
  };
}
