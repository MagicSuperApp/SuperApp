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
 *
 * L0 THUẦN: không import react-native/AsyncStorage/axios. Dùng `fetch` toàn cục
 * (React Native cấp sẵn runtime). Token/storage do platform tầng trên INJECT qua
 * config (giữ contract `l0/types.ts` — KVStorage/TokenProvider/HttpRequestOptions
 * /HttpResponse ĐÓNG BĂNG, không đổi shape).
 */
import { MobileCoreError } from '../errors';
import type {
  TokenProvider,
  HttpRequestOptions,
  HttpResponse,
} from '../types';

/** Timeout mặc định khi request không tự set `opts.timeoutMs` (harvest: REQUEST_TIMEOUT_MS nhẹ). */
const DEFAULT_TIMEOUT_MS = 45_000;

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
   * Bóc envelope response thành payload thật. Mặc định nhận diện cả 2 kiểu đã
   * harvest: NestJS TransformInterceptor `{ data, message, statusCode }` và
   * PhoenixKey `{ code, message, result }`. Override khi BE khác 2 kiểu này.
   */
  unwrap?: (raw: unknown) => unknown;
  /** Override timeout mặc định cho mọi request của client này (per-request: `opts.timeoutMs`). */
  timeoutMs?: number;
}

export interface HttpClient {
  request<T = unknown>(
    path: string,
    opts?: HttpRequestOptions,
  ): Promise<HttpResponse<T>>;
}

/** Endpoint /auth/* KHÔNG kích refresh (tránh vòng lặp refresh gọi chính route refresh). */
function isAuthEndpoint(path: string): boolean {
  return path.includes('/auth/');
}

/**
 * Bóc envelope mặc định — nhận diện 2 kiểu đã harvest:
 *   - `{ data, message, statusCode }` (NestJS TransformInterceptor, proofchat-api.ts)
 *   - `{ code, message, result }` (PhoenixKey, phoenixKey-api.ts)
 * Không nhận diện được → trả nguyên `raw` (BE không bọc envelope).
 */
function defaultUnwrap(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') {
    const body = raw as Record<string, unknown>;
    if ('statusCode' in body && 'data' in body) {
      return body.data;
    }
    if ('code' in body && 'result' in body) {
      return body.result;
    }
  }
  return raw;
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
  const { baseUrl, tokens, timeoutMs: clientTimeoutMs } = config;
  const unwrap = config.unwrap ?? defaultUnwrap;
  const defaultTimeoutMs = clientTimeoutMs ?? DEFAULT_TIMEOUT_MS;

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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...opts.headers,
    };
    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    const token = tokenOverride !== undefined ? tokenOverride : await tokens.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
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
        body:
          opts.body === undefined
            ? undefined
            : typeof opts.body === 'string'
              ? opts.body
              : JSON.stringify(opts.body),
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
    // hạn); /auth/* KHÔNG kích refresh (tránh vòng lặp refresh chính route refresh).
    if (res.status === 401) {
      if (!retried && !isAuthEndpoint(path)) {
        let newToken: string | null;
        try {
          newToken = await refreshSingleFlight();
        } catch (err) {
          throw new MobileCoreError('net/unauthorized', `Token refresh failed: ${path}`, {
            detail: { path },
            retryable: false,
            cause: err,
          });
        }
        if (newToken) {
          return requestInternal<T>(path, opts, newToken, true);
        }
      }
      throw new MobileCoreError('net/unauthorized', `Unauthorized: ${path}`, {
        detail: { path, status: 401 },
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
      const body = await safeReadJson(res);
      throw new MobileCoreError('net/validation', `Validation error HTTP ${res.status}: ${path}`, {
        detail: { path, status: res.status, body },
        retryable: false,
      });
    }

    if (res.status >= 500) {
      const body = await safeReadJson(res);
      throw new MobileCoreError('net/server', `Server error HTTP ${res.status}: ${path}`, {
        detail: { path, status: res.status, body },
        retryable: true,
      });
    }

    const raw = await safeReadJson(res);
    const data = unwrap(raw) as T;
    return { status: res.status, data };
  }

  return {
    request<T = unknown>(path: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
      return requestInternal<T>(path, opts, undefined, false);
    },
  };
}
