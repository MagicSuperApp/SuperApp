/**
 * l0/net — test THẬT cho createHttpClient (mock `fetch`, không gọi mạng thật).
 * Ca biên bắt buộc (theo spec hợp nhất 3 kiểu xử lý 401 cũ):
 *   - 2 request 401 đồng thời → tokens.refreshToken() gọi ĐÚNG 1 LẦN, cả 2 retry thành công.
 *   - request tới /auth/* khi 401 → KHÔNG kích refresh (chặn vòng lặp).
 *   - abort (opts.signal) → net/aborted.
 *   - 429 kèm Retry-After → net/rate-limited, đọc đúng giá trị retry-after.
 *   - 5xx → net/server, retryable=true.
 *   - opts.idempotencyKey → header `Idempotency-Key` xuất hiện trên request thật.
 */
import { createHttpClient } from '../index';
import { isMobileCoreError } from '../../errors';
import type { TokenProvider } from '../../types';

/** Response giả tối thiểu — chỉ cần status/headers.get/text (net/index chỉ dùng 3 thứ này). */
function fakeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    status,
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

describe('createHttpClient — 401 single-flight refresh', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  test('2 request 401 đồng thời → refreshToken gọi đúng 1 lần, cả 2 retry thành công', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      if (headers.Authorization === 'Bearer expired-token') {
        return Promise.resolve(fakeResponse(401, { message: 'expired' }));
      }
      if (headers.Authorization === 'Bearer fresh-token') {
        return Promise.resolve(
          fakeResponse(200, { data: { ok: true }, statusCode: 200 }),
        );
      }
      throw new Error(`unexpected Authorization header: ${headers.Authorization}`);
    });

    const refreshToken = jest.fn(async () => 'fresh-token');
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'expired-token'),
      refreshToken,
    };

    const client = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
    });

    const [r1, r2] = await Promise.all([
      client.request('/trees'),
      client.request('/trees'),
    ]);

    expect(r1).toEqual({ status: 200, data: { ok: true } });
    expect(r2).toEqual({ status: 200, data: { ok: true } });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    // 2 request gốc (401) + 2 retry (200) = 4 lần gọi fetch.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('request tới /auth/login khi 401 KHÔNG gọi refresh', async () => {
    fetchMock.mockResolvedValue(fakeResponse(401, { message: 'bad credentials' }));

    const refreshToken = jest.fn(async () => 'fresh-token');
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken,
    };

    const client = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
    });

    await expect(client.request('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      code: 'net/unauthorized',
    });
    expect(refreshToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // không retry
  });

  test('refresh trả null (thất bại) → net/unauthorized, không lặp vô hạn', async () => {
    fetchMock.mockResolvedValue(fakeResponse(401, { message: 'expired' }));
    const refreshToken = jest.fn(async () => null);
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'expired-token'),
      refreshToken,
    };

    const client = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
    });

    await expect(client.request('/trees')).rejects.toMatchObject({ code: 'net/unauthorized' });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // không retry vì không có token mới
  });
});

describe('createHttpClient — phân loại lỗi', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  function makeClient() {
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken: jest.fn(async () => null),
    };
    return createHttpClient({ baseUrl: 'https://api.test', tokens });
  }

  test('abort (opts.signal) → net/aborted', async () => {
    // Mô phỏng hành vi fetch thật: nếu signal ĐÃ abort trước khi fetch bắt đầu,
    // reject ngay (addEventListener sau khi event đã bắn sẽ không bao giờ chạy).
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        const rejectAborted = () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (signal.aborted) {
          rejectAborted();
          return;
        }
        signal.addEventListener('abort', rejectAborted);
      });
    });

    const client = makeClient();
    const controller = new AbortController();
    const pending = client.request('/slow', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'net/aborted', retryable: false });
  });

  test('abort giữa chừng (sau khi fetch đã bắt đầu) → vẫn net/aborted', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const client = makeClient();
    const controller = new AbortController();
    const pending = client.request('/slow', { signal: controller.signal });
    // Nhường vài microtask để requestInternal chạy tới đoạn đăng ký listener
    // (sau `await tokens.getToken()`) rồi mới abort — khác nhánh so với test trên.
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'net/aborted', retryable: false });
  });

  test('429 kèm Retry-After → net/rate-limited, đọc đúng giá trị retry-after', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(429, { message: 'too many requests' }, { 'Retry-After': '30' }),
    );

    const client = makeClient();
    let caught: unknown;
    try {
      await client.request('/trees');
    } catch (err) {
      caught = err;
    }

    expect(isMobileCoreError(caught)).toBe(true);
    expect(caught).toMatchObject({ code: 'net/rate-limited', retryable: true });
    expect((caught as { detail?: { retryAfterSeconds?: number } }).detail?.retryAfterSeconds).toBe(
      30,
    );
  });

  test('5xx → net/server, retryable=true', async () => {
    fetchMock.mockResolvedValue(fakeResponse(503, { message: 'db down' }));

    const client = makeClient();
    await expect(client.request('/trees')).rejects.toMatchObject({
      code: 'net/server',
      retryable: true,
    });
  });

  test('4xx (không phải 401/429) → net/validation, retryable=false', async () => {
    fetchMock.mockResolvedValue(fakeResponse(422, { message: 'invalid payload' }));

    const client = makeClient();
    await expect(client.request('/trees', { method: 'POST' })).rejects.toMatchObject({
      code: 'net/validation',
      retryable: false,
    });
  });

  test('lỗi mạng (fetch reject không phải AbortError) → net/offline, retryable=true', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const client = makeClient();
    await expect(client.request('/trees')).rejects.toMatchObject({
      code: 'net/offline',
      retryable: true,
    });
  });

  test('lỗi không phân loại được (không AbortError, không TypeError) → net/unknown', async () => {
    // vd bug trong runtime fetch ném RangeError — KHÔNG được gán nhầm là offline.
    fetchMock.mockRejectedValue(new RangeError('something odd'));

    const client = makeClient();
    await expect(client.request('/trees')).rejects.toMatchObject({
      code: 'net/unknown',
      retryable: false,
    });
  });
});

describe('createHttpClient — idempotencyKey + unwrap', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  test('opts.idempotencyKey → header Idempotency-Key xuất hiện trên request', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { data: { id: '1' }, statusCode: 200 }));

    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    await client.request('/sync/batch', {
      method: 'POST',
      body: { foo: 'bar' },
      idempotencyKey: 'batch-key-123',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('batch-key-123');
  });

  test('unwrap mặc định bóc cả envelope {data,statusCode} lẫn {code,result}', async () => {
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { data: { kind: 'nest' }, message: 'ok', statusCode: 200 }),
    );
    const r1 = await client.request('/a');
    expect(r1.data).toEqual({ kind: 'nest' });

    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { code: 1000, message: 'ok', result: { kind: 'phoenixkey' } }),
    );
    const r2 = await client.request('/b');
    expect(r2.data).toEqual({ kind: 'phoenixkey' });
  });
});
