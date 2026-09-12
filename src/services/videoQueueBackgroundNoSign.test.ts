// services/videoQueueBackgroundNoSign.test.ts
//
// LƯỢT CHẠY DO SỰ KIỆN KÍCH HOẠT KHÔNG ĐƯỢC BẬT HỘP SINH TRẮC.
//
// ⛔ Ca hỏng bài này dựng ra từ đó — đội thực địa báo trên iOS: "đơ, không thoát
// được màn hình ở trang chi tiết vườn". Android thì ổn định. Vòng lặp:
//
//   màn nạp dữ liệu → `signRaw` → iOS dựng hộp Face ID (alert HỆ ĐIỀU HÀNH, phủ
//   kín app, nút quay lại không ăn) → hộp hiện ⇒ `AppState` đi `active → inactive`,
//   đóng hộp ⇒ `active` → `App.tsx` nghe `active` và gọi `flushVideoUploadQueue()`
//   → flush gọi `ensureToken()` → `signRaw` → HỘP MỚI → …
//
// Mỗi lần quét mặt xong lại đẻ ra đúng một hộp để quét tiếp, không có điểm dừng và
// không cú chạm nào thoát ra được. Android không dính vì hộp sinh trắc ở đó là
// dialog TRONG app, không đẩy `AppState` qua `inactive`.
//
// Hai ca, đo hai nửa khác nhau của cách sửa:
//   1. HÀNH VI — bộ phụ thuộc nền không gọi `signRaw` lần nào;
//   2. NỐI DÂY — `App.tsx` thật sự dùng bộ đó ở nhánh `AppState`. Thiếu ca 2 thì ai
//      đó gỡ lời gọi khỏi `App.tsx` mà bài kiểm vẫn xanh, vì ca 1 chỉ kiểm cái hàm.

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDidA = 'did:phoenix:1:' + 'a'.repeat(64);
const mockSignRaw = jest.fn(async () => '3045');

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDidA),
  ownerPublicKey: jest.fn(async () => '04' + '11'.repeat(64)),
  signRaw: (...args: unknown[]) => (mockSignRaw as any)(...args),
  isKeypairEnrolled: jest.fn(async () => true),
}));
jest.mock('./phoenixKey-native', () => ({ isAvailable: () => true }));
jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { backgroundFlushDeps } from './videoUploadQueue';

const AUTH_TOKEN_KEY = 'auth_token';
const TOKEN_DID_KEY = 'orilife_token_did';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSignRaw.mockClear();
  // Máy chủ phải có mặt để ca "không ký" không xanh chỉ vì mạng chết.
  (global as any).fetch = jest.fn(async (url: string) =>
    String(url).includes('/challenge')
      ? ({ ok: true, json: async () => ({ ok: true, challenge: 'Y2g', ttl: 300 }) } as any)
      : ({ ok: true, json: async () => ({ ok: true, token: 'tok', owner: 'acct:x' }) } as any),
  );
});

describe('flush nền KHÔNG ký', () => {
  it('chưa có token → trả false, và KHÔNG gọi signRaw lần nào', async () => {
    await expect(backgroundFlushDeps().ensureToken()).resolves.toBe(false);
    expect(mockSignRaw).not.toHaveBeenCalled();
  });

  it('`force` cũng không ký — lượt tự động không ký kể cả khi máy chủ trả 401', async () => {
    await expect(backgroundFlushDeps().ensureToken(true)).resolves.toBe(false);
    expect(mockSignRaw).not.toHaveBeenCalled();
  });

  it('đã có token đúng chủ → trả true (vẫn gửi được clip, không ký thêm)', async () => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'tok-cu');
    await AsyncStorage.setItem(TOKEN_DID_KEY, mockDidA);

    await expect(backgroundFlushDeps().ensureToken()).resolves.toBe(true);
    expect(mockSignRaw).not.toHaveBeenCalled();
  });
});

describe('App.tsx nối đúng dây', () => {
  // Đọc thẳng mã nguồn: vòng lặp `AppState` chỉ xảy ra trên máy iOS thật, bộ kiểm
  // chạy trên Node nên không dựng lại được. Cách đo này yếu hơn bài kiểm hành vi và
  // nói rõ ở đây: nó KHÔNG chứng minh app hết đơ, nó chỉ chặn đúng cách viết đã gây ra.
  const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'App.tsx'), 'utf8');
  const code = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('không còn lời gọi `flushVideoUploadQueue()` TRỐNG nào', () => {
    expect(code).not.toMatch(/flushVideoUploadQueue\(\s*\)/);
  });

  it('mọi lời gọi flush trong App.tsx đều truyền `backgroundFlushDeps()`', () => {
    const calls = code.match(/flushVideoUploadQueue\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/backgroundFlushDeps\(\)/);
  });
});
