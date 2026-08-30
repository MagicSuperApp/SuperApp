// Unit test proofchat-api + proofchatAuthBridge (TRỤC 3 v2.0 — cầu nối auth).
//
// Mock axios.create để tránh client thật + mạng; mock AsyncStorage in-memory;
// mock @env để bật/tắt feature flag. Không gọi BE thật.

// ── In-memory AsyncStorage ───────────────────────────────────────────
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    multiSet: jest.fn(async (pairs: [string, string][]) => {
      pairs.forEach(([k, v]) => (store[k] = v));
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach((k) => delete store[k]);
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
  },
}));

// ── Mock axios client ────────────────────────────────────────────────
const mockPost = jest.fn();
const mockGet = jest.fn();
const mockRequest = jest.fn();
const requestInterceptors: Array<(c: any) => any> = [];
const responseOkHandlers: Array<(r: any) => any> = [];
const responseErrHandlers: Array<(e: any) => any> = [];
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      post: (...a: any[]) => mockPost(...a),
      get: (...a: any[]) => mockGet(...a),
      request: (...a: any[]) => mockRequest(...a),
      interceptors: {
        request: { use: (fn: any) => requestInterceptors.push(fn) },
        response: {
          use: (ok: any, err: any) => {
            responseOkHandlers.push(ok);
            responseErrHandlers.push(err);
          },
        },
      },
    }),
  },
}));

// @env bị babel react-native-dotenv inline thành rỗng trong jest → không mock
// được bằng jest.mock('@env'). Vì thế isProofChatBackendEnabled() luôn false
// theo mặc định jest. Ta override nó qua requireActual để test logic bridge.
jest.mock('./proofchat-api', () => {
  const actual = jest.requireActual('./proofchat-api');
  return { ...actual, isProofChatBackendEnabled: jest.fn(() => true) };
});

// ── Mock PhoenixKey session token ────────────────────────────────────
const mockGetPhoenixSession = jest.fn<Promise<string | null>, []>();
// GIỮ NGUYÊN phần còn lại của module. Thay CẢ module (không `requireActual`) làm
// `PhoenixKeyApiError` thành `undefined` trong sổ đăng ký; `phoenixSessionService.ts:119`
// chạy `err instanceof PhoenixKeyApiError` bên trong `catch` của một async KHÔNG ai
// await → unhandled rejection → jest worker chết, và thông điệp lỗi không hề trỏ về
// dòng mock này. Đó là lý do suite đỏ mà không test nào đỏ.
jest.mock('./phoenixKey-api', () => ({
  ...jest.requireActual('./phoenixKey-api'),
  __esModule: true,
  getSessionToken: () => mockGetPhoenixSession(),
}));

import {
  proofChatApi,
  isProofChatBackendEnabled,
  getAccessToken,
  getRefreshToken,
  getDeviceId,
  clearTokens,
  ProofChatApiError,
} from './proofchat-api';
import { connectProofChat } from './proofchatAuthBridge';

const mockedFlag = isProofChatBackendEnabled as jest.Mock;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockPost.mockReset();
  mockGet.mockReset();
  mockRequest.mockReset();
  mockGetPhoenixSession.mockReset();
});

describe('feature flag', () => {
  it('bật khi cờ true + có URL', () => {
    expect(isProofChatBackendEnabled()).toBe(true);
  });
});

describe('auth.phoenixKeyLogin', () => {
  it('bóc envelope {data} + lưu access/refresh token', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        data: { accessToken: 'acc-1', refreshToken: 'ref-1' },
        message: 'ok',
        statusCode: 201,
      },
    });

    const tokens = await proofChatApi.auth.phoenixKeyLogin('phx-session-xyz');

    expect(mockPost).toHaveBeenCalledWith('/auth/phoenixkey/login', {
      sessionToken: 'phx-session-xyz',
    });
    expect(tokens).toEqual({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    expect(await getAccessToken()).toBe('acc-1');
    expect(await getRefreshToken()).toBe('ref-1');
  });

  it('chấp nhận body không bọc envelope (fallback)', async () => {
    mockPost.mockResolvedValueOnce({
      data: { accessToken: 'acc-2', refreshToken: 'ref-2' },
    });
    const tokens = await proofChatApi.auth.phoenixKeyLogin('s');
    expect(tokens.accessToken).toBe('acc-2');
  });

  it('lỗi HTTP → ProofChatApiError với status + message', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Invalid session' } },
      message: 'Request failed with status code 401',
    });
    await expect(proofChatApi.auth.phoenixKeyLogin('bad')).rejects.toMatchObject({
      name: 'ProofChatApiError',
      httpStatus: 401,
      message: 'Invalid session',
    });
  });

  it('lỗi mạng (không response) → ProofChatApiError status 0', async () => {
    mockPost.mockRejectedValueOnce({ message: 'Network Error' });
    await expect(proofChatApi.auth.phoenixKeyLogin('x')).rejects.toMatchObject({
      httpStatus: 0,
    });
  });
});

describe('auth.refresh', () => {
  it('không có refresh token → lỗi rõ ràng', async () => {
    await expect(proofChatApi.auth.refresh()).rejects.toBeInstanceOf(
      ProofChatApiError,
    );
  });

  it('có refresh token → gọi /auth/refresh + cập nhật token', async () => {
    store['proofchat_refresh_token'] = 'r0';
    mockPost.mockResolvedValueOnce({
      data: { data: { accessToken: 'a1', refreshToken: 'r1' }, statusCode: 200 },
    });
    const t = await proofChatApi.auth.refresh();
    expect(mockPost).toHaveBeenLastCalledWith('/auth/refresh', {
      refreshToken: 'r0',
    });
    expect(t.accessToken).toBe('a1');
    expect(await getAccessToken()).toBe('a1');
    expect(await getRefreshToken()).toBe('r1');
  });

  it('single-flight: nhiều refresh song song chỉ gọi BE 1 lần', async () => {
    store['proofchat_refresh_token'] = 'r0';
    let resolve!: (v: any) => void;
    mockPost.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const p1 = proofChatApi.auth.refresh();
    const p2 = proofChatApi.auth.refresh();
    resolve({ data: { data: { accessToken: 'a1', refreshToken: 'r1' }, statusCode: 200 } });
    const [t1, t2] = await Promise.all([p1, p2]);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(t1.accessToken).toBe('a1');
    expect(t2.accessToken).toBe('a1');
  });
});

describe('conversations.list', () => {
  it('gắn needsAuth + bóc envelope mảng', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: [{ id: 'c1', title: 'Phòng 1' }], message: 'ok', statusCode: 200 },
    });
    const list = await proofChatApi.conversations.list({ take: 10 });
    expect(list).toEqual([{ id: 'c1', title: 'Phòng 1' }]);
    const [path, cfg] = mockGet.mock.calls[0];
    expect(path).toBe('/conversations');
    expect(cfg.needsAuth).toBe(true);
    expect(cfg.params).toMatchObject({ take: 10 });
  });

  it('HÌNH THẬT của BE: envelope bọc { data, total } → vẫn ra mảng', async () => {
    // `findAll` khai `Promise<{ data: Array<…>; total: number }>`
    // (BE conversations.service.ts:111), controller trả thẳng (:73) → hai lớp bọc.
    // Trước bản vá, hàm này trả object `{data,total}` trong khi kiểu khai là mảng,
    // và `chatSlice.ts:174` có `Array.isArray(x) ? x : []` nên danh sách LUÔN rỗng.
    mockGet.mockResolvedValueOnce({
      data: {
        data: { data: [{ id: 'c1', title: 'Phòng 1' }], total: 1 },
        message: 'ok',
        statusCode: 200,
      },
    });
    const list = await proofChatApi.conversations.list();
    expect(list).toEqual([{ id: 'c1', title: 'Phòng 1' }]);
  });

  it('envelope data=[] → trả mảng rỗng (KHÔNG trả nhầm object envelope)', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: [], message: 'ok', statusCode: 200 },
    });
    const list = await proofChatApi.conversations.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toEqual([]);
  });

  it('envelope data=null → NÉM, không trả [] (không nuốt thành "chưa có hội thoại")', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: null, message: 'ok', statusCode: 200 },
    });
    await expect(proofChatApi.conversations.list()).rejects.toThrow(/hình lạ/);
  });

  it('body thiếu hẳn data + không có statusCode → NÉM (hình không đọc được)', async () => {
    // handler void: NestJS JSON bỏ field undefined → client nhận {message,...}
    mockGet.mockResolvedValueOnce({ data: { message: 'no data' } });
    await expect(proofChatApi.conversations.list()).rejects.toThrow(/hình lạ/);
  });
});

describe('conversations.getMessages — deviceId trong query, token ở header', () => {
  it('truyền deviceId qua params (KHÔNG token trong URL) + needsAuth', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: [{ id: 'm1', conversationId: 'c1' }], statusCode: 200 },
    });
    const list = await proofChatApi.conversations.getMessages('c1', 'dev-uuid', {
      take: 50,
    });
    expect(list).toEqual([{ id: 'm1', conversationId: 'c1' }]);
    const [path, cfg] = mockGet.mock.calls[0];
    expect(path).toBe('/conversations/c1/messages');
    expect(cfg.needsAuth).toBe(true);
    // BE messages endpoint phân trang bằng `limit`/`offset` (D:\BE conversations
    // controller @Query('limit')). Client nhận `take` cho tiện rồi map → `limit`.
    expect(cfg.params).toMatchObject({ deviceId: 'dev-uuid', limit: 50 });
    // Bất biến an toàn: KHÔNG có token trong path/query.
    expect(path).not.toMatch(/token/i);
  });

  it('HÌNH THẬT của BE: envelope bọc { data, total, hasMore, limit, offset }', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          data: [{ id: 'm1', conversationId: 'c1' }],
          total: 1,
          hasMore: false,
          limit: 50,
          offset: 0,
        },
        statusCode: 200,
      },
    });
    const list = await proofChatApi.conversations.getMessages('c1', 'dev-uuid');
    expect(list).toEqual([{ id: 'm1', conversationId: 'c1' }]);
  });

  it('encode id có ký tự đặc biệt', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [], statusCode: 200 } });
    await proofChatApi.conversations.get('a/b c');
    const [path] = mockGet.mock.calls[0];
    expect(path).toBe('/conversations/a%2Fb%20c');
  });
});

describe('getDeviceId — UUID persistent 1/thiết bị', () => {
  it('tạo UUID v4 lần đầu, tái dùng lần sau (persistent)', async () => {
    const id1 = await getDeviceId();
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const id2 = await getDeviceId();
    expect(id2).toBe(id1); // cùng thiết bị → cùng deviceId
  });
});

describe('response interceptor — auto-refresh 401 (single-flight)', () => {
  it('401 ở endpoint cần auth → refresh rồi retry request gốc', async () => {
    store['proofchat_refresh_token'] = 'r-old';
    // refresh trả token mới
    mockPost.mockResolvedValueOnce({
      data: { data: { accessToken: 'a-new', refreshToken: 'r-new' }, statusCode: 200 },
    });
    mockRequest.mockResolvedValueOnce({ data: { data: [], statusCode: 200 } });

    const errHandler = responseErrHandlers.find(Boolean)!;
    const result = await errHandler({
      response: { status: 401 },
      config: { url: '/conversations', needsAuth: true },
    });

    expect(mockPost).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'r-old' });
    expect(mockRequest).toHaveBeenCalledTimes(1); // retry 1 lần
    expect(await getAccessToken()).toBe('a-new');
    expect(result).toEqual({ data: { data: [], statusCode: 200 } });
  });

  it('401 ở chính /auth/* → KHÔNG refresh (tránh vòng lặp), reject', async () => {
    const errHandler = responseErrHandlers.find(Boolean)!;
    await expect(
      errHandler({
        response: { status: 401 },
        config: { url: '/auth/phoenixkey/login', needsAuth: false },
      }),
    ).rejects.toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('401 nhưng đã _retried → không retry nữa, reject', async () => {
    const errHandler = responseErrHandlers.find(Boolean)!;
    await expect(
      errHandler({
        response: { status: 401 },
        config: { url: '/conversations', needsAuth: true, _retried: true },
      }),
    ).rejects.toBeDefined();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('request interceptor — bearer', () => {
  it('gắn Authorization khi needsAuth + có access token', async () => {
    store['proofchat_access_token'] = 'ACCESS123';
    const fn = requestInterceptors[0];
    expect(fn).toBeDefined();
    const cfg = await fn({ needsAuth: true, headers: {} });
    expect(cfg.headers.Authorization).toBe('Bearer ACCESS123');
  });

  it('KHÔNG gắn khi không needsAuth', async () => {
    store['proofchat_access_token'] = 'ACCESS123';
    const fn = requestInterceptors[0];
    const cfg = await fn({ headers: {} });
    expect(cfg.headers.Authorization).toBeUndefined();
  });
});

describe('connectProofChat — bridge', () => {
  it('chưa có session PhoenixKey → no-phoenix-session (không throw)', async () => {
    mockGetPhoenixSession.mockResolvedValueOnce(null);
    const r = await connectProofChat();
    expect(r.status).toBe('no-phoenix-session');
  });

  it('có session PhoenixKey → đổi lấy phiên ProofChat → connected', async () => {
    mockGetPhoenixSession.mockResolvedValueOnce('phx-abc');
    mockPost.mockResolvedValueOnce({
      data: { data: { accessToken: 'AA', refreshToken: 'RR' }, statusCode: 201 },
    });
    const r = await connectProofChat();
    expect(r).toEqual({ status: 'connected', alreadyHadSession: false });
    expect(await getAccessToken()).toBe('AA');
  });

  // ⚠ Bài này TRƯỚC ĐÂY viết là "có access token → connected, không gọi login lại"
  // — tức nó khoá đúng cái lỗi: câu hỏi "CÓ token không" thiếu vế "của AI". Một
  // token không rõ chủ nay bị coi là của người khác, và đường xử là XOÁ rồi đăng
  // nhập lại. Ca "khớp DID thì dùng lại" nằm ở `proofchatTokenOwner.test.ts`, nơi
  // có mock DID đầy đủ.
  it('token không rõ chủ → KHÔNG dùng lại, xoá và đăng nhập lại', async () => {
    store['proofchat_access_token'] = 'EXIST';
    mockGetPhoenixSession.mockResolvedValueOnce('phx-abc');
    mockPost.mockResolvedValueOnce({
      data: { data: { accessToken: 'MOI', refreshToken: 'RR' }, statusCode: 201 },
    });
    const r = await connectProofChat();
    expect(r).toEqual({ status: 'connected', alreadyHadSession: false });
    expect(await getAccessToken()).toBe('MOI');
  });

  it('login lỗi → trạng thái error (không throw)', async () => {
    await clearTokens();
    mockGetPhoenixSession.mockResolvedValueOnce('phx-abc');
    mockPost.mockRejectedValueOnce({
      response: { status: 503, data: { message: 'PhoenixKey disabled' } },
    });
    const r = await connectProofChat();
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toBe('PhoenixKey disabled');
  });

  it('feature flag OFF → disabled, không gọi PhoenixKey/BE', async () => {
    mockedFlag.mockReturnValueOnce(false);
    const r = await connectProofChat();
    expect(r).toEqual({ status: 'disabled' });
    expect(mockGetPhoenixSession).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
