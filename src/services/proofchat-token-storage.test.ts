// Nơi CẤT token phiên ProofChat — Keychain/Keystore, không phải AsyncStorage trần.
//
// Tệp riêng (không nhét vào `proofchat-api.test.ts`) vì các ca dưới đây cần
// `jest.resetModules()` để lấy lại module sạch: `proofchat-api.ts` giữ state
// module (`tokenBackend`, cờ cảnh báo một lần) mà ca sau không được ăn theo ca trước.

// ── Secure store giả (Keychain/Keystore) ─────────────────────────────
// `mockEnclave.fail = true` mô phỏng máy KHÔNG có cầu native (jest node, hoặc
// nền tảng chưa build Rust core) — lúc đó wrapper thật sẽ ném.
const mockEnclave: { data: Record<string, string>; fail: boolean } = { data: {}, fail: false };
jest.mock('../sdk/taadEnclave', () => ({
  secureStore: jest.fn(async (k: string, v: string) => {
    if (mockEnclave.fail) throw new Error('TaadEnclave native module not available');
    mockEnclave.data[k] = v;
    return true;
  }),
  secureLoad: jest.fn(async (k: string) => {
    if (mockEnclave.fail) throw new Error('TaadEnclave native module not available');
    return Object.prototype.hasOwnProperty.call(mockEnclave.data, k) ? mockEnclave.data[k] : null;
  }),
  secureDelete: jest.fn(async (k: string) => {
    if (mockEnclave.fail) throw new Error('TaadEnclave native module not available');
    delete mockEnclave.data[k];
    return true;
  }),
}));

// axios thật sẽ dựng client + interceptor lúc import module — không cần cho ca này.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      post: jest.fn(),
      get: jest.fn(),
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    }),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS = 'proofchat_access_token';
const REFRESH = 'proofchat_refresh_token';

type TokenApi = typeof import('./proofchat-api');

/** Lấy module SẠCH (state trong module bị reset theo). */
const freshApi = (): TokenApi => {
  let mod!: TokenApi;
  jest.isolateModules(() => {
    mod = require('./proofchat-api') as TokenApi;
  });
  return mod;
};

let warnSpy: jest.SpyInstance;

beforeEach(async () => {
  mockEnclave.data = {};
  mockEnclave.fail = false;
  await AsyncStorage.clear();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => warnSpy.mockRestore());

describe('token phiên nằm ở secure store, KHÔNG để trần trong AsyncStorage', () => {
  it('setTokens ghi vào Keychain/Keystore; AsyncStorage không giữ bản nào', async () => {
    const api = freshApi();
    await api.setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' });

    expect(mockEnclave.data[ACCESS]).toBe('acc-1');
    expect(mockEnclave.data[REFRESH]).toBe('ref-1');
    expect(await AsyncStorage.getItem(ACCESS)).toBeNull();
    expect(await AsyncStorage.getItem(REFRESH)).toBeNull();
    expect(api.getTokenStorageBackend()).toBe('secure');

    expect(await api.getAccessToken()).toBe('acc-1');
    expect(await api.getRefreshToken()).toBe('ref-1');
  });

  it('DI TRÚ: bản cũ nằm trần trong AsyncStorage → lần đọc đầu chuyển sang secure rồi xoá bản cũ', async () => {
    await AsyncStorage.setItem(ACCESS, 'acc-cũ');
    const api = freshApi();

    // Phiên KHÔNG được mất trong lúc di trú.
    expect(await api.getAccessToken()).toBe('acc-cũ');
    expect(mockEnclave.data[ACCESS]).toBe('acc-cũ');
    expect(await AsyncStorage.getItem(ACCESS)).toBeNull();

    // Lần đọc sau lấy thẳng từ secure store.
    expect(await api.getAccessToken()).toBe('acc-cũ');
  });

  it('di trú TRƯỢT (không có cầu native) → GIỮ bản cũ, không làm mất phiên', async () => {
    await AsyncStorage.setItem(REFRESH, 'ref-cũ');
    mockEnclave.fail = true;
    const api = freshApi();

    expect(await api.getRefreshToken()).toBe('ref-cũ');
    expect(await AsyncStorage.getItem(REFRESH)).toBe('ref-cũ'); // KHÔNG xoá khi chưa ghi được
    expect(api.getTokenStorageBackend()).toBe('async-storage');
    expect(warnSpy).toHaveBeenCalled(); // suy giảm CÓ BÁO, không im lặng
  });

  it('không có cầu native → rơi về AsyncStorage, đăng nhập vẫn chạy (không ném)', async () => {
    mockEnclave.fail = true;
    const api = freshApi();

    await api.setTokens({ accessToken: 'a', refreshToken: 'r' });
    expect(await AsyncStorage.getItem(ACCESS)).toBe('a');
    expect(await api.getAccessToken()).toBe('a');
    expect(api.getTokenStorageBackend()).toBe('async-storage');
  });

  it('clearTokens xoá CẢ HAI nơi (kể cả bản cũ còn sót)', async () => {
    await AsyncStorage.setItem(ACCESS, 'trần');
    const api = freshApi();
    await api.setTokens({ accessToken: 'a', refreshToken: 'r' });
    await AsyncStorage.setItem(REFRESH, 'sót-lại');

    await api.clearTokens();

    expect(mockEnclave.data[ACCESS]).toBeUndefined();
    expect(mockEnclave.data[REFRESH]).toBeUndefined();
    expect(await AsyncStorage.getItem(ACCESS)).toBeNull();
    expect(await AsyncStorage.getItem(REFRESH)).toBeNull();
    expect(await api.getAccessToken()).toBeNull();
    expect(await api.getRefreshToken()).toBeNull();
  });

  it('chưa từng đăng nhập → trả null, không ném', async () => {
    const api = freshApi();
    await expect(api.getAccessToken()).resolves.toBeNull();
    await expect(api.getRefreshToken()).resolves.toBeNull();
  });
});
