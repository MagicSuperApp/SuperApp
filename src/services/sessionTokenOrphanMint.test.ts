// services/sessionTokenOrphanMint.test.ts
//
// LƯỢT ĐÚC MỒ CÔI KHÔNG ĐƯỢC TRỒNG LẠI THẺ CỦA NGƯỜI TRƯỚC.
//
// Bài anh em của `cooldownIdentitySwitch.test.ts`, nhưng đo một thứ ĐẮT HƠN HẲN
// và nằm ở tệp khác, nên tách ra để không ai tưởng bài kia đã canh cả hai.
//
// `cooldownIdentitySwitch` canh một BIẾN (đồng hồ nghỉ) bị ghi đè. Bài này canh
// một lần GHI XUỐNG KHO. Chuỗi:
//
//   1. màn Ví gặp 401 → mở lượt đúc thẻ phiên; lượt đó đi qua một hộp sinh trắc
//      rồi còn ba chặng mạng (`init` → `approve` → `getStatus`);
//   2. trong ba chặng đó màn hình lại bấm được → người dùng đăng xuất;
//      `logoutUser` gọi `clearSessionToken()` (nhổ thẻ) và `clearSessionMint-
//      Cooldown()` (mở van, tăng số hiệu thế);
//   3. lượt đúc về đích và gọi `setSessionToken(...)` — TRỒNG LẠI đúng cái thẻ
//      vừa bị nhổ.
//
// Vì sao nặng: thẻ phiên PhoenixKey KHÔNG mang dấu chủ. Không có
// `phoenixkey_token_did`, và mọi chỗ đọc nó đều gắn thẳng `Bearer ${token}`.
// Nên người đăng nhập sau trên cùng máy dùng luôn thẻ người trước, và những cửa
// ghi KHÔNG có `{did}` trên đường dẫn (đăng ký ví, dựng-nộp giao dịch, đúc tổ
// chức) lấy chủ thể từ THẺ ⟹ máy của người sau hành động mang danh người trước.
// Đó là ca mạo danh, không phải "vật liệu ở lại".
//
// Đây cũng là lý do phép canh dùng SỐ HIỆU THẾ chứ không so DID: đăng xuất
// không xoá cặp khoá (người cũ phải đăng nhập lại được bằng DID cũ), nên DID
// sau đăng xuất y hệt trước và một phép so DID sẽ im lặng cho qua đúng ca này.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDid = 'did:phoenix:1:' + 'a'.repeat(64);

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDid),
  ownerPublicKey: jest.fn(async () => '04' + '11'.repeat(64)),
  signRaw: jest.fn(async () => '3045'),
}));
jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => new Proxy(() => {}, { get: () => () => {} }) }),
}));

// Một lời hứa mở cho chặng `getStatus` — bài tự quyết lúc nào máy chủ trả lời.
let mockStatusGate: Promise<any> = Promise.resolve({});

// ⚠ Mock BỘ PHẬN, giữ nguyên phần còn lại của module.
// `sessionMintGeneration`, `clearSessionMintCooldown`, `setSessionToken`,
// `getSessionToken` phải là hàng THẬT và phải cùng MỘT thực thể module — bộ đếm
// thế là biến cấp module, mock nó đi là đo hai bộ đếm khác nhau rồi kết luận về
// một bộ đếm.
jest.mock('./phoenixKey-api', () => {
  const actual = jest.requireActual('./phoenixKey-api');
  return {
    ...actual,
    phoenixKeyApi: {
      session: {
        init: jest.fn(async () => ({
          sessionId: 'sid',
          challenge: 'ch',
          tempToken: 'tmp',
        })),
        approve: jest.fn(async () => ({ status: 'approved' })),
        getStatus: jest.fn(() => mockStatusGate),
      },
    },
  };
});

import {
  clearSessionMintCooldown,
  getSessionToken,
  setSessionToken,
} from './phoenixKey-api';
import { ensurePhoenixSession } from './phoenixSessionService';

const SESSION_TOKEN_KEY = 'phoenixkey_session_token';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const settle = () => new Promise((r) => setImmediate(r));

beforeEach(async () => {
  await AsyncStorage.clear();
  clearSessionMintCooldown();
});

describe('đăng xuất giữa lúc đang đúc thẻ', () => {
  it('lượt mồ côi KHÔNG ghi thẻ người trước xuống kho', async () => {
    const gate = deferred<any>();
    mockStatusGate = gate.promise;

    // Người trước đang có thẻ; màn Ví gặp 401 nên ép đúc mới.
    await setSessionToken('the-cu');
    const inFlight = ensurePhoenixSession({ force: true });
    await settle();

    // Người dùng bấm Đăng xuất: nhổ thẻ + mở van (đúng thứ tự `logoutUser` làm).
    await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
    clearSessionMintCooldown();
    expect(await getSessionToken()).toBeNull();

    // Bây giờ máy chủ mới trả thẻ — thẻ của NGƯỜI TRƯỚC.
    gate.resolve({ status: 'approved', sessionToken: 'the-nguoi-truoc' });
    await inFlight;

    // Kho phải còn SẠCH. Đây là cả nội dung của bài.
    expect(await getSessionToken()).toBeNull();
  });

  it('lượt mồ côi vẫn TRẢ thẻ cho lượt gọi đã mở nó', async () => {
    // Lượt đó thuộc về người trước và có quyền hoàn tất việc của mình; thứ bị
    // chặn là để lại dấu vết trên máy, không phải trả lời cho người đã hỏi.
    // Không có bài này thì một bản vá kiểu `return null` cũng làm bài trên xanh,
    // và nó dựng một cái vỏ im lặng ở tầng dưới.
    const gate = deferred<any>();
    mockStatusGate = gate.promise;

    const inFlight = ensurePhoenixSession({ force: true });
    await settle();
    clearSessionMintCooldown();
    gate.resolve({ status: 'approved', sessionToken: 'the-nguoi-truoc' });

    await expect(inFlight).resolves.toBe('the-nguoi-truoc');
  });

  it('KHÔNG đăng xuất giữa chừng thì thẻ VẪN được ghi — canh là canh, không phải chặn hết', async () => {
    // Ca đối xứng. Thiếu nó thì một bản vá không bao giờ ghi thẻ nữa cũng xanh,
    // và lúc đó không ai đăng nhập được vào ví.
    mockStatusGate = Promise.resolve({ status: 'approved', sessionToken: 'the-moi' });

    await expect(ensurePhoenixSession({ force: true })).resolves.toBe('the-moi');
    expect(await getSessionToken()).toBe('the-moi');
  });
});
