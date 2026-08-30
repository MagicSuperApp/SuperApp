// services/proofchatTokenOwner.test.ts
//
// TOKEN PHIÊN CHAT PHẢI BIẾT NÓ LÀ CỦA AI.
//
// ⛔ Cùng LỚP lỗi đã đo ở đường OriLife (`orilifeTokenOwner.test.ts`, 2026-08-28),
//    lần này ở đường chat. Trước bản vá, hai chỗ ghép lại thành một đường đi thật:
//
//      `connectProofChat`  chỉ hỏi "CÓ token không", không hỏi "của AI"
//      `disconnectProofChat` thoát sớm khi cờ tính năng TẮT → token ở lại kho
//
//    Trên một máy dùng chung:
//      A đăng nhập (cờ bật) → tắt cờ → A đăng xuất, token KHÔNG bị xoá
//        → bật cờ → B mở app → thấy token (của A) → `alreadyHadSession: true`
//        → 42 phương thức trong `proofchat-api` gửi yêu cầu MANG DANH A
//
//    Đọc hội thoại của A, gửi tin dưới tên A. Không màn nào báo gì.
//
// Bài kiểm giữ năm điều, mỗi điều là một nửa của cái bẫy:
//   1. khớp DID   → KHÔNG đăng nhập lại (nếu không, mỗi lần mở app một lần ký);
//   2. lệch DID   → đăng nhập lại, và token cũ phải BIẾN MẤT khỏi kho;
//   3. token đời cũ (không rõ chủ) → coi như lệch. Mặc định ĐÓNG;
//   4. đăng xuất khi cờ TẮT → token vẫn bị xoá;
//   5. `logoutUser` thật sự gọi đường ngắt (canh bằng cách quét mã nguồn — bài
//      kiểm hàm thuần vẫn xanh sau khi ai đó gỡ lời gọi khỏi thunk).

import { readFileSync } from 'fs';
import { join } from 'path';

// ── Secure store giả (Keychain/Keystore) ─────────────────────────────
const enclave: Record<string, string> = {};
jest.mock('../sdk/taadEnclave', () => ({
  secureStore: jest.fn(async (k: string, v: string) => {
    enclave[k] = v;
    return true;
  }),
  secureLoad: jest.fn(async (k: string) =>
    Object.prototype.hasOwnProperty.call(enclave, k) ? enclave[k] : null,
  ),
  secureDelete: jest.fn(async (k: string) => {
    delete enclave[k];
    return true;
  }),
}));

// ── AsyncStorage in-memory ───────────────────────────────────────────
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
  },
}));

// ── axios giả ────────────────────────────────────────────────────────
const mockPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      post: (...a: any[]) => mockPost(...a),
      get: jest.fn(),
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    }),
  },
}));

// `@env` bị babel inline thành rỗng trong jest → `isProofChatBackendEnabled()`
// luôn false. Ghi đè để đo được logic cầu nối ở CẢ HAI trạng thái cờ.
jest.mock('./proofchat-api', () => {
  const actual = jest.requireActual('./proofchat-api');
  return { ...actual, isProofChatBackendEnabled: jest.fn(() => true) };
});

const DID_A = 'did:phoenix:1:' + 'a'.repeat(64);
const DID_B = 'did:phoenix:1:' + 'b'.repeat(64);
let mockDidHienTai: string | null = DID_A;

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDidHienTai),
}));

const mockPhoenixSession = jest.fn<Promise<string | null>, []>();
jest.mock('./phoenixKey-api', () => ({
  ...jest.requireActual('./phoenixKey-api'),
  __esModule: true,
  getSessionToken: () => mockPhoenixSession(),
}));
jest.mock('./phoenixSessionService', () => ({
  ensurePhoenixSession: jest.fn(async () => null),
}));

import {
  isProofChatBackendEnabled,
  getAccessToken,
  getTokenOwnerDid,
  setTokens,
  setTokenOwnerDid,
} from './proofchat-api';
import { connectProofChat, disconnectProofChat } from './proofchatAuthBridge';

const ACCESS = 'proofchat_access_token';
const TOKEN_DID = 'proofchat_token_did';
const mockedFlag = isProofChatBackendEnabled as jest.Mock;

/** Máy chủ trả token khác mỗi lượt — để phân biệt "đăng nhập lại" với "dùng token cũ". */
let tokenMayChuTra = 'tok-moi';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(enclave)) delete enclave[k];
  mockPost.mockReset();
  mockPhoenixSession.mockReset();
  mockedFlag.mockReturnValue(true);
  mockDidHienTai = DID_A;
  tokenMayChuTra = 'tok-moi';
  mockPost.mockImplementation(async () => ({
    data: { data: { accessToken: tokenMayChuTra, refreshToken: 'RR' }, statusCode: 201 },
  }));
});

/** Dựng trạng thái "trên máy đang có phiên của <did>". */
const daCoPhienCua = async (did: string | null, token: string) => {
  await setTokens({ accessToken: token, refreshToken: 'R-cu' } as any);
  if (did) await setTokenOwnerDid(did);
};

describe('1+2+3 — chỉ dùng lại token CỦA CHÍNH MÌNH', () => {
  it('khớp DID → dùng lại, KHÔNG gọi máy chủ', async () => {
    await daCoPhienCua(DID_A, 'tok-cua-A');

    const r = await connectProofChat();

    expect(r).toEqual({ status: 'connected', alreadyHadSession: true });
    expect(mockPost).not.toHaveBeenCalled();
    expect(await getAccessToken()).toBe('tok-cua-A');
  });

  it('lệch DID → đăng nhập lại, và token của người trước BIẾN MẤT', async () => {
    await daCoPhienCua(DID_A, 'tok-cua-A');
    mockDidHienTai = DID_B; // người B cầm máy
    tokenMayChuTra = 'tok-cua-B';
    mockPhoenixSession.mockResolvedValue('phx-cua-B');

    const r = await connectProofChat();

    expect(r).toEqual({ status: 'connected', alreadyHadSession: false });
    expect(mockPost).toHaveBeenCalledTimes(1);
    // Không chỉ "bỏ qua" — phải sạch khỏi kho. 42 phương thức đọc thẳng token
    // qua interceptor, không đi qua cầu nối này.
    expect(await getAccessToken()).toBe('tok-cua-B');
    expect(await getTokenOwnerDid()).toBe(DID_B);
  });

  it('token đời cũ (không rõ chủ) → coi như lệch, đăng nhập lại', async () => {
    await daCoPhienCua(null, 'tok-vo-chu'); // token lưu trước bản vá
    mockPhoenixSession.mockResolvedValue('phx-abc');

    const r = await connectProofChat();

    expect(r).toEqual({ status: 'connected', alreadyHadSession: false });
    expect(await getAccessToken()).toBe('tok-moi');
  });

  it('lệch DID mà KHÔNG lấy được phiên PhoenixKey → token cũ vẫn phải sạch', async () => {
    // Ca xấu nhất: xoá xong thì đăng nhập trượt. Thà không có phiên còn hơn để
    // lại một phiên mang danh người khác.
    await daCoPhienCua(DID_A, 'tok-cua-A');
    mockDidHienTai = DID_B;
    mockPhoenixSession.mockResolvedValue(null);

    const r = await connectProofChat();

    expect(r.status).toBe('no-phoenix-session');
    expect(await getAccessToken()).toBeNull();
  });
});

describe('4 — đăng xuất xoá token, KHÔNG phụ thuộc cờ tính năng', () => {
  it('cờ BẬT → gọi máy chủ + kho sạch', async () => {
    await daCoPhienCua(DID_A, 'tok-cua-A');

    await disconnectProofChat();

    expect(mockPost).toHaveBeenCalledWith('/auth/logout', {}, expect.anything());
    expect(await getAccessToken()).toBeNull();
    expect(await getTokenOwnerDid()).toBeNull();
  });

  it('cờ TẮT → KHÔNG gọi máy chủ, nhưng kho vẫn phải sạch', async () => {
    await daCoPhienCua(DID_A, 'tok-cua-A');
    mockedFlag.mockReturnValue(false);

    await disconnectProofChat();

    expect(mockPost).not.toHaveBeenCalled();
    expect(await getAccessToken()).toBeNull();
    expect(await getTokenOwnerDid()).toBeNull();
  });

  it('máy chủ lỗi lúc đăng xuất → kho VẪN sạch (không ném)', async () => {
    await daCoPhienCua(DID_A, 'tok-cua-A');
    mockPost.mockRejectedValue(new Error('mất mạng'));

    await expect(disconnectProofChat()).resolves.toBeUndefined();
    expect(await getAccessToken()).toBeNull();
  });

  it('xoá cả bản nằm trần trong AsyncStorage lẫn bản trong secure store', async () => {
    // Máy cài bản cũ còn token trần; máy mới có token trong Keychain. Đăng xuất
    // phải dọn CẢ HAI — sót một bên là còn đường cho token ra khỏi máy.
    store[ACCESS] = 'tran-doi-cu';
    enclave[TOKEN_DID] = DID_A;

    await disconnectProofChat();

    expect(store[ACCESS]).toBeUndefined();
    expect(enclave[TOKEN_DID]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 — canh DÂY NỐI, không canh hàm thuần.
//
// Mọi bài trên vẫn XANH nếu ai đó gỡ `disconnectProofChat()` khỏi `logoutUser`,
// hoặc trả cầu nối về câu hỏi thiếu vế "có token không". Ba phép dưới đọc thẳng
// mã nguồn nên gỡ dây là đỏ.
// ─────────────────────────────────────────────────────────────────────────────
describe('5 — dây nối còn nguyên', () => {
  const doc = (p: string) => readFileSync(join(__dirname, p), 'utf8');

  it('logoutUser gọi disconnectProofChat', () => {
    const src = doc('../store/userSlice.ts');
    expect(src).toContain("import { disconnectProofChat } from '../services/proofchatAuthBridge';");
    expect(src).toContain('await disconnectProofChat();');
  });

  it('connectProofChat KHÔNG quay lại hỏi mỗi "có token không"', () => {
    const fn = doc('./proofchatAuthBridge.ts');
    const than = fn.slice(fn.indexOf('export const connectProofChat'));
    expect(than).toContain('getTokenOwnerDid()');
    expect(than).toContain('clearTokens()');
  });

  it('disconnectProofChat KHÔNG thoát sớm trước khi xoá token', () => {
    const src = doc('./proofchatAuthBridge.ts');
    const than = src.slice(src.indexOf('export const disconnectProofChat'));
    // Đường thoát sớm cũ. Có lại nó là token ở lại máy sau khi đăng xuất.
    expect(than).not.toContain('if (!isProofChatBackendEnabled()) return;');
    expect(than).toContain('await clearTokens()');
  });
});
