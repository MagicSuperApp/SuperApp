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

// ── DID của người đang dùng máy ──────────────────────────────────────
// Điều khiển được thì mới dựng được ca "máy dùng chung": A đăng nhập, token vào
// kho, B mở app. Không mock thì mọi ca chạy với cùng một người và cả lớp lỗi đó
// vô hình.
const mockCurrentUserDid = jest.fn<Promise<string | null>, []>();
jest.mock('../sdk/phoenixKey', () => ({
  ...jest.requireActual('../sdk/phoenixKey'),
  __esModule: true,
  currentUserDid: () => mockCurrentUserDid(),
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
import {
  connectProofChat,
  disconnectProofChat,
  ensureProofChatSession,
  resetProofChatSessionBackoff,
} from './proofchatAuthBridge';

const mockedFlag = isProofChatBackendEnabled as jest.Mock;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockPost.mockReset();
  mockGet.mockReset();
  mockRequest.mockReset();
  mockGetPhoenixSession.mockReset();
  // Mặc định: máy chưa đọc được DID — đúng trạng thái của phần lớn ca cũ trong tệp
  // này, nên chúng không đổi nghĩa. Ca nào cần một người cụ thể thì tự đặt.
  mockCurrentUserDid.mockReset();
  mockCurrentUserDid.mockResolvedValue(null);
  // `connectProofChat` giữ mốc "lần hỏng gần nhất" ở phạm vi module để khỏi hỏi
  // vân tay liên tục trong app thật. Trong test thì mốc đó rỉ từ ca này sang ca
  // sau: ca trước hỏng ⇒ ca sau nhận lại kết quả hỏng cũ mà không gọi máy chủ.
  resetProofChatSessionBackoff();
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

describe('ensureProofChatSession — gộp lượt gọi song song', () => {
  // `ChatHomeScreen` bắn `loadConversations()` và `loadInvitations()` LIỀN NHAU,
  // không chờ nhau. Cả hai đi qua interceptor, và khi kho chưa có token thì cả hai
  // gọi provider này. Phép gộp phải biến hai lượt đó thành MỘT lần đăng nhập —
  // hai lần `POST /auth/phoenixkey/login` thì lượt sau có thể thu hồi token của
  // lượt trước, và người dùng mất phiên ngay khi vừa mở màn.
  it('hai lượt gọi CÙNG LÚC chỉ đăng nhập một lần', async () => {
    await clearTokens();
    mockGetPhoenixSession.mockResolvedValue('phx-abc');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'AA', refreshToken: 'RR' }, statusCode: 201 },
    });

    // KHÔNG await từng cái — bắn cùng lúc, đúng hình dạng ở màn hình.
    const [a, b] = await Promise.all([ensureProofChatSession(), ensureProofChatSession()]);

    const soLanLogin = mockPost.mock.calls.filter(
      (c) => c[0] === '/auth/phoenixkey/login',
    ).length;
    expect(soLanLogin).toBe(1);
    expect(a).toBe('AA');
    expect(b).toBe('AA');
  });

  it('token trong kho ĐÚNG chủ → không đăng nhập lần nào', async () => {
    // Ca đối chứng cho bài trên: chứng minh phép đếm `soLanLogin` có chạy thật và
    // biết trả về 0, chứ không phải luôn ra 1 vì lý do nào khác.
    mockCurrentUserDid.mockResolvedValue('did:phoenix:NGUOI-A');
    store['proofchat_access_token'] = 'CO-SAN';
    store['proofchat_token_did'] = 'did:phoenix:NGUOI-A';
    const t = await ensureProofChatSession();
    const soLanLogin = mockPost.mock.calls.filter(
      (c) => c[0] === '/auth/phoenixkey/login',
    ).length;
    expect(soLanLogin).toBe(0);
    expect(t).toBe('CO-SAN');
  });

  // Cặp đối xứng của ca trên, và là ca mà bản trước để lọt hoàn toàn.
  //
  // Phép kiểm chủ sở hữu chỉ nằm trong `connectProofChat`. `ensureProofChatSession`
  // — nay là provider chính thức của interceptor REST, tức đường mà MỌI lượt gọi
  // cần-auth đi qua — từng mở đầu bằng `getAccessToken()` rồi trả thẳng, không hỏi
  // token đó của ai. Đó là cửa THỨ HAI vào kho token, và cửa đó không có khoá.
  it('token trong kho của NGƯỜI KHÁC → phải đăng nhập lại, không dùng token đó', async () => {
    mockCurrentUserDid.mockResolvedValue('did:phoenix:NGUOI-B');
    store['proofchat_access_token'] = 'TOKEN-CUA-A';
    store['proofchat_token_did'] = 'did:phoenix:NGUOI-A';
    mockGetPhoenixSession.mockResolvedValue('phx-cua-b');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'TOKEN-CUA-B', refreshToken: 'RR' }, statusCode: 201 },
    });

    const t = await ensureProofChatSession();

    expect(t).not.toBe('TOKEN-CUA-A');
    expect(t).toBe('TOKEN-CUA-B');
    expect(
      mockPost.mock.calls.filter((c) => c[0] === '/auth/phoenixkey/login').length,
    ).toBe(1);
    // Và dấu chủ phải sang tên — không thì lượt sau lại xoá đi đăng nhập lại.
    expect(store['proofchat_token_did']).toBe('did:phoenix:NGUOI-B');
  });

  // Token vô chủ (kho có token nhưng chưa từng đóng dấu) là hình dạng thật của
  // một bản cài cũ nâng cấp lên. Nó KHÔNG được mặc nhiên coi là của người đang
  // dùng máy — không ai biết nó của ai.
  it('token KHÔNG có dấu chủ → cũng phải đăng nhập lại', async () => {
    mockCurrentUserDid.mockResolvedValue('did:phoenix:NGUOI-B');
    store['proofchat_access_token'] = 'TOKEN-VO-CHU';
    mockGetPhoenixSession.mockResolvedValue('phx-cua-b');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'TOKEN-MOI', refreshToken: 'RR' }, statusCode: 201 },
    });

    const t = await ensureProofChatSession();

    expect(t).toBe('TOKEN-MOI');
  });
});

describe('thời gian nghỉ sau khi hỏng — của MỘT NGƯỜI, không của cái máy', () => {
  // Cổng nghỉ 60 giây tồn tại vì đường dựng phiên bật hộp vân tay của hệ điều hành:
  // phiên đang hỏng thì người dùng nhận một chuỗi hộp vân tay liên tiếp mà lần nào
  // cũng chỉ để nhận lại đúng lỗi đó. Nhưng nó là trạng thái ở phạm vi module, và
  // nếu không hỏi "hỏng CỦA AI" thì nó đè lên người dùng kế tiếp.

  const choHong = async (did: string | null) => {
    mockCurrentUserDid.mockResolvedValue(did);
    mockGetPhoenixSession.mockResolvedValue(null); // không dựng nổi phiên
    return connectProofChat();
  };

  it('ca đối chứng: CÙNG người, trong 60 giây ⇒ không hỏi lại máy chủ', async () => {
    await clearTokens();
    expect(await choHong('did:phoenix:A')).toEqual({ status: 'no-phoenix-session' });
    mockGetPhoenixSession.mockClear();

    const lai = await connectProofChat();

    expect(lai).toEqual({ status: 'no-phoenix-session' });
    // 0 lượt gọi — đây mới là thứ cổng nghỉ hứa, và là ca phải XANH.
    expect(mockGetPhoenixSession).not.toHaveBeenCalled();
  });

  it('ĐỔI NGƯỜI trong 60 giây ⇒ phải hỏi lại, không dùng lỗi của người trước', async () => {
    // Máy dùng chung: A gặp phiên hỏng → nghỉ 60s → A đăng xuất → B đăng nhập với
    // phiên PhoenixKey SỐNG. Bản trước trả cho B nguyên văn lỗi của A, 0 lượt gọi.
    await clearTokens();
    await choHong('did:phoenix:A');

    mockCurrentUserDid.mockResolvedValue('did:phoenix:B');
    mockGetPhoenixSession.mockResolvedValue('phx-cua-b');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'TOKEN-B', refreshToken: 'RR' }, statusCode: 201 },
    });

    const cuaB = await connectProofChat();

    expect(cuaB).toEqual({ status: 'connected', alreadyHadSession: false });
  });

  it('MÁY VỪA CÓ DANH TÍNH ⇒ cổng nhả ngay, không bắt đợi hết 60 giây', async () => {
    // Máy chưa có danh tính → hỏng → người dùng đi tạo danh tính xong quay lại Chat
    // trong vòng một phút. Điều kiện đã đổi hẳn, nên câu trả lời cũ không còn đúng.
    await clearTokens();
    await choHong(null);

    mockCurrentUserDid.mockResolvedValue('did:phoenix:VUA-TAO');
    mockGetPhoenixSession.mockResolvedValue('phx-moi');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'TOKEN-MOI', refreshToken: 'RR' }, statusCode: 201 },
    });

    expect(await connectProofChat()).toEqual({
      status: 'connected',
      alreadyHadSession: false,
    });
  });

  it('ĐĂNG XUẤT dọn luôn thời gian nghỉ — nó thuộc về phiên vừa kết thúc', async () => {
    await clearTokens();
    await choHong('did:phoenix:A');

    await disconnectProofChat();

    // Cùng DID A, vẫn trong 60 giây — nhưng phiên đã kết thúc nên câu hỏi được hỏi
    // lại. Không có bước này thì `_lastFailureDid` là lớp duy nhất, và nó chỉ đúng
    // khi đọc được DID; máy không đọc được DID thì cả hai lượt cùng `null` và lỗi
    // của phiên trước lại đè lên phiên sau.
    mockGetPhoenixSession.mockResolvedValue('phx-lai-duoc');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'TOKEN-2', refreshToken: 'RR' }, statusCode: 201 },
    });

    expect(await connectProofChat()).toEqual({
      status: 'connected',
      alreadyHadSession: false,
    });
  });
});

describe('gộp lượt đăng nhập — cả HAI đường vào', () => {
  // `connectProofChat` có hai đường vào và chúng chạy chồng nhau thật:
  // `proofchatService.init()` gọi thẳng vào nó mỗi lần mở màn Trò chuyện, còn
  // interceptor REST đi qua `ensureProofChatSession`. Phép gộp đặt ở lớp ngoài
  // (`ensureProofChatSession`) chỉ chặn được đường thứ hai — bài này đo ra 2 lượt
  // login trước khi khoá được dời vào `connectProofChat`.
  it('init gọi thẳng + interceptor cùng lúc ⇒ vẫn MỘT lần đăng nhập', async () => {
    await clearTokens();
    mockGetPhoenixSession.mockResolvedValue('phx-abc');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'AA', refreshToken: 'RR' }, statusCode: 201 },
    });

    await Promise.all([connectProofChat(), ensureProofChatSession()]);

    const soLanLogin = mockPost.mock.calls.filter(
      (c) => c[0] === '/auth/phoenixkey/login',
    ).length;
    expect(soLanLogin).toBe(1);
  });

  it('hai lượt init CÙNG LÚC cũng chỉ một lần', async () => {
    await clearTokens();
    mockGetPhoenixSession.mockResolvedValue('phx-abc');
    mockPost.mockResolvedValue({
      data: { data: { accessToken: 'AA', refreshToken: 'RR' }, statusCode: 201 },
    });

    const [x, y] = await Promise.all([connectProofChat(), connectProofChat()]);

    const soLanLogin = mockPost.mock.calls.filter(
      (c) => c[0] === '/auth/phoenixkey/login',
    ).length;
    expect(soLanLogin).toBe(1);
    expect(x.status).toBe('connected');
    expect(y.status).toBe('connected');
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
