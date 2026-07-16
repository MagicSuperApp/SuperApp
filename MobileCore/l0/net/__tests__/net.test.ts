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
import { createHttpClient, phoenixKeyUnwrap, nestJsUnwrap } from '../index';
import { isMobileCoreError, MobileCoreError } from '../../errors';
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
      // Mock trả envelope NestJS {data,statusCode} → opt-in nestJsUnwrap (default
      // giờ là pass-through an toàn, không tự đoán envelope).
      unwrap: nestJsUnwrap,
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
    // CHỜ tới khi fetch thực sự được gọi (listener abort đã đăng ký ở bước ngay trước)
    // rồi mới abort — vững hơn đếm microtask thủ công (đường getToken nay qua
    // withTokenTimeout nên số microtask thay đổi; poll fetch tránh phụ thuộc con số).
    while (fetchMock.mock.calls.length === 0) {
      await Promise.resolve();
    }
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

  test('unwrap MẶC ĐỊNH = pass-through: KHÔNG đoán envelope, KHÔNG ném theo hình-dạng', async () => {
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    // Backend khác PhoenixKey: {code:4,message,data} = phân trang THÀNH CÔNG.
    // Default KHÔNG được coi code≠1000 là lỗi (false-positive) → trả nguyên body.
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { code: 4, message: 'page 4', data: [1, 2, 3] }),
    );
    const r1 = await client.request('/paged');
    expect(r1.data).toEqual({ code: 4, message: 'page 4', data: [1, 2, 3] });

    // {code:1000,data} (dùng `data` không `result`): default KHÔNG được nuốt payload.
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { code: 1000, message: 'ok', data: { kind: 'x' } }),
    );
    const r2 = await client.request('/other');
    expect(r2.data).toEqual({ code: 1000, message: 'ok', data: { kind: 'x' } });
  });

  test('nestJsUnwrap opt-in bóc {data,statusCode}; phoenixKeyUnwrap opt-in bóc {code,result}', async () => {
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken: jest.fn(async () => null),
    };

    const nestClient = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
      unwrap: nestJsUnwrap,
    });
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { data: { kind: 'nest' }, message: 'ok', statusCode: 200 }),
    );
    const r1 = await nestClient.request('/a');
    expect(r1.data).toEqual({ kind: 'nest' });

    const pkClient = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
      unwrap: phoenixKeyUnwrap,
    });
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { code: 1000, message: 'ok', result: { kind: 'phoenixkey' } }),
    );
    const r2 = await pkClient.request('/b');
    expect(r2.data).toEqual({ kind: 'phoenixkey' });
  });

  test('phoenixKeyUnwrap là hàm THUẦN: code≠1000 ném, code=1000 trả result', () => {
    expect(phoenixKeyUnwrap({ code: 1000, message: 'ok', result: { a: 1 } })).toEqual({ a: 1 });
    // code=1000 thiếu result → undefined (không ném).
    expect(phoenixKeyUnwrap({ code: 1000, message: 'ok' })).toBeUndefined();
    // không phải envelope PhoenixKey → pass-through.
    expect(phoenixKeyUnwrap({ hello: 'world' })).toEqual({ hello: 'world' });
    // code≠1000 → ném MobileCoreError net/validation retryable:false.
    let caught: unknown;
    try {
      phoenixKeyUnwrap({ code: 4001, message: 'DID không tồn tại' });
    } catch (err) {
      caught = err;
    }
    expect(isMobileCoreError(caught)).toBe(true);
    expect(caught).toMatchObject({ code: 'net/validation', retryable: false });
    expect((caught as { detail?: { envelopeCode?: number } }).detail?.envelopeCode).toBe(4001);
  });
});

describe('createHttpClient — multipart/FormData passthrough', () => {
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

  test('body FormData → KHÔNG stringify (truyền thẳng) + KHÔNG set Content-Type mặc định', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { data: { id: '1' }, statusCode: 200 }));

    const form = new FormData();
    form.append('field', 'value');

    const client = makeClient();
    await client.request('/upload', { method: 'POST', body: form });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Body phải là CHÍNH FormData (không bị JSON.stringify thành "{}").
    expect(init.body).toBe(form);
    expect(init.body instanceof FormData).toBe(true);
    // KHÔNG có Content-Type mặc định → RN tự gắn multipart boundary.
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  test('body object thường vẫn JSON.stringify + Content-Type application/json', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { data: { id: '1' }, statusCode: 200 }));

    const client = makeClient();
    await client.request('/json', { method: 'POST', body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('caller override Content-Type qua opts.headers THẮNG (kể cả với FormData)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { data: { id: '1' }, statusCode: 200 }));

    const form = new FormData();
    form.append('field', 'value');

    const client = makeClient();
    await client.request('/upload', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'multipart/form-data; boundary=CUSTOM' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('multipart/form-data; boundary=CUSTOM');
    expect(init.body).toBe(form);
  });
});

describe('createHttpClient — PhoenixKey envelope error (code≠1000 trong HTTP 200)', () => {
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
    // Client PhoenixKey opt-in phoenixKeyUnwrap (default là pass-through an toàn).
    return createHttpClient({ baseUrl: 'https://api.test', tokens, unwrap: phoenixKeyUnwrap });
  }

  test('code≠1000 (không có result) → NÉM net/validation, KHÔNG nuốt lỗi thành công', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(200, { code: 4001, message: 'DID không tồn tại' }),
    );

    const client = makeClient();
    let caught: unknown;
    try {
      await client.request('/identity/lookup');
    } catch (err) {
      caught = err;
    }
    expect(isMobileCoreError(caught)).toBe(true);
    expect(caught).toMatchObject({ code: 'net/validation' });
    // isRetryableError mặc định cho lỗi-envelope-lạ = false (chống retry vô hạn lỗi vĩnh viễn).
    expect((caught as { retryable: boolean }).retryable).toBe(false);
    expect((caught as { detail?: { envelopeCode?: number } }).detail?.envelopeCode).toBe(4001);
  });

  test('unwrap của caller ném lỗi THƯỜNG (không MobileCoreError) → net/unknown retryable:false', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { anything: true }));

    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
      unwrap: () => {
        throw new Error('boom in custom unwrap');
      },
    });

    await expect(client.request('/x')).rejects.toMatchObject({
      code: 'net/unknown',
      retryable: false,
    });
  });
});

describe('createHttpClient — bảng quyết định refresh-failure', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(fakeResponse(401, { message: 'expired' }));
  });

  test('refresh trả null (hết phiên thật) → net/unauthorized TERMINAL (retryable:false)', async () => {
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'expired-token'),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    await expect(client.request('/trees')).rejects.toMatchObject({
      code: 'net/unauthorized',
      retryable: false,
    });
  });

  test('refresh ném MobileCoreError retryable=true (5xx/mạng) → net/auth-transient (retryable:true)', async () => {
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'expired-token'),
      refreshToken: jest.fn(async () => {
        throw new MobileCoreError('net/server', 'refresh backend 503', { retryable: true });
      }),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    await expect(client.request('/trees')).rejects.toMatchObject({
      code: 'net/auth-transient',
      retryable: true,
    });
  });

  test('refresh ném lỗi KHÔNG phân loại được → MẶC ĐỊNH net/auth-transient (không mất dữ liệu)', async () => {
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'expired-token'),
      refreshToken: jest.fn(async () => {
        throw new Error('provider threw a plain error');
      }),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    await expect(client.request('/trees')).rejects.toMatchObject({
      code: 'net/auth-transient',
      retryable: true,
    });
  });
});

describe('createHttpClient — 409 conflict + disableAutoRefresh', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  test('HTTP 409 → net/conflict retryable:false, giữ body (existing_tree_id) để tách trùng', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(409, { code: 'duplicate_tree', existing_tree_id: 'tree-42', detail: 'Trùng' }),
    );

    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'tok'),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    let caught: unknown;
    try {
      await client.request('/tree/enroll', { method: 'POST' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: 'net/conflict', retryable: false });
    expect(
      (caught as { detail?: { body?: { existing_tree_id?: string } } }).detail?.body?.existing_tree_id,
    ).toBe('tree-42');
  });

  test('disableAutoRefresh: 401 KHÔNG gọi refresh → net/unauthorized thẳng', async () => {
    fetchMock.mockResolvedValue(fakeResponse(401, { message: 'expired' }));
    const refreshToken = jest.fn(async () => 'fresh');
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'expired-token'),
      refreshToken,
    };
    const client = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
      disableAutoRefresh: true,
    });

    await expect(client.request('/identity/me')).rejects.toMatchObject({
      code: 'net/unauthorized',
    });
    expect(refreshToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // không retry
  });
});

describe('createHttpClient — scrub token nhạy cảm khỏi error.detail', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  test('body lỗi có token/password → detail REDACT, không lộ giá trị', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(400, { message: 'bad', accessToken: 'secret-abc', password: 'p@ss' }),
    );

    const tokens: TokenProvider = {
      getToken: jest.fn(async () => null),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({ baseUrl: 'https://api.test', tokens });

    let caught: unknown;
    try {
      await client.request('/x', { method: 'POST' });
    } catch (err) {
      caught = err;
    }
    const body = (caught as { detail?: { body?: Record<string, unknown> } }).detail?.body;
    expect(body?.accessToken).toBe('[REDACTED]');
    expect(body?.password).toBe('[REDACTED]');
    expect(body?.message).toBe('bad');
  });
});

describe('createHttpClient — TokenProvider timeout (chống treo outbox)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('getToken() treo (không bao giờ resolve) → net/timeout, KHÔNG treo mãi', async () => {
    // getToken không bao giờ resolve → không chạm fetch. Không có token-timeout thì
    // request treo vĩnh viễn → drain() kẹt. Có timeout → net/timeout retryable:true.
    const tokens: TokenProvider = {
      getToken: jest.fn(() => new Promise<string | null>(() => {})),
      refreshToken: jest.fn(async () => null),
    };
    const client = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
      tokenTimeoutMs: 15_000,
    });

    const pending = client.request('/trees');
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'net/timeout',
      retryable: true,
    });
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('refreshToken() treo trong nhánh 401 → net/timeout (không remap auth-transient)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(401, { message: 'expired' }));
    const tokens: TokenProvider = {
      getToken: jest.fn(async () => 'expired-token'),
      refreshToken: jest.fn(() => new Promise<string | null>(() => {})),
    };
    const client = createHttpClient({
      baseUrl: 'https://api.test',
      tokens,
      tokenTimeoutMs: 15_000,
    });

    const pending = client.request('/trees');
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'net/timeout',
      retryable: true,
    });
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});

describe('createHttpClient — FormData footgun: strip Content-Type thiếu boundary', () => {
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

  test('caller set Content-Type multipart THIẾU boundary → XOÁ để RN tự set', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { ok: true }));

    const form = new FormData();
    form.append('file', 'blob');

    const client = makeClient();
    await client.request('/upload', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'multipart/form-data' }, // thói quen axios, thiếu boundary
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    // Đã xoá → RN tự gắn boundary. init.body vẫn là FormData nguyên.
    expect(headers['Content-Type']).toBeUndefined();
    expect(init.body).toBe(form);
  });

  test('caller set application/json cho FormData (nhầm) → cũng bị xoá', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { ok: true }));

    const form = new FormData();
    form.append('file', 'blob');

    const client = makeClient();
    await client.request('/upload', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'application/json' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  test('caller set Content-Type CÓ boundary → tôn trọng, giữ nguyên', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { ok: true }));

    const form = new FormData();
    form.append('file', 'blob');

    const client = makeClient();
    await client.request('/upload', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'multipart/form-data; boundary=EXPLICIT' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('multipart/form-data; boundary=EXPLICIT');
  });
});
