// services/walletRegisterLogScope.test.ts
//
// CÂU NHẬT KÝ PHẢI MANG ĐÚNG PHẠM VI CỦA PHÉP ĐO NÓ VỪA CHẠY.
//
// ── Lỗ đã đo 2026-09-19 trên máy ảo ────────────────────────────────────────
// Lượt đăng ký ví hỏng in ra:
//
//   [rLog:pk_wallet_error] { step: 'register', code: 1326, httpStatus: 403,
//     message: 'cả hai khuôn chuỗi ký đều bị từ chối: …' }
//
// Câu đó được in ở nhánh `if (lastRejection)`, mà nhánh ấy chạy được sau khi CHỈ
// MỘT khuôn đi tới máy chủ: vòng lặp có lối `if (!proof) continue` cho ca máy
// thiếu cửa ký hex, và lối đó không ghi gì vào `lastRejection`.
//
// Vì sao nó đắt chứ không chỉ là chữ nghĩa: "cả hai khuôn đều bị từ chối" đọc
// thành *"máy chủ đã đổi sang một khuôn thứ ba"* — một kết luận về NHÀ KHÁC, dẫn
// tới một lá thư và một vòng chờ. Sự thật có thể là *"máy này chưa bao giờ gửi
// được khuôn đóng khung"* — một việc nằm gọn trong nhà này. Cùng một dòng chữ,
// hai việc phải làm, và cái sai không đỏ ở đâu cả.
//
// ── Bài này KHÔNG ghim gì ─────────────────────────────────────────────────
// Nó không nói gì về việc khuôn nào ĐÚNG, và không chứng minh máy chủ thật đang
// dựng lại chuỗi ký theo khuôn nào. Nó chỉ ghim rằng câu app tự phát ra không
// rộng hơn thứ app vừa đo.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDid = 'did:phoenix:1:' + 'a'.repeat(64);
const DID = mockDid;

let mockRegister: jest.Mock;
const mockWalletError = jest.fn();
/** Cửa ký hex — bài đổi giá trị trả về theo từng ca. */
let mockSignHex: jest.Mock;

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDid),
}));

// Ghi lại đúng MỘT lời gọi cần đo; mọi lời gọi nhật ký khác nuốt im lặng.
jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: new Proxy(
    {},
    {
      get: (_t, group) =>
        new Proxy(
          {},
          {
            get: (_t2, fn) => (...args: unknown[]) => {
              if (group === 'phoenixWallet' && fn === 'walletError') {
                mockWalletError(...args);
              }
            },
          },
        ),
    },
  ),
}));

jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    isAvailable: () => true,
    deriveWalletAddress: jest.fn(async () => 'addr_test1_fixed'),
    deriveStakeAddress: jest.fn(async () => 'stake_test1'),
    generateSalt: jest.fn(async () => 'a'.repeat(32)),
    signWalletRegister: jest.fn(async () => ({
      paymentPublicKeyHex: '11'.repeat(32),
      signature: '22'.repeat(64),
    })),
    signWalletRegisterHex: (...a: unknown[]) => mockSignHex(...a),
  },
}));

jest.mock('./masterKekStore', () => ({
  getStoredMasterKek: jest.fn(async () => '33'.repeat(32)),
  getActiveAccountIndex: jest.fn(async () => 0),
}));

jest.mock('./phoenixKey-api', () => {
  const actual = jest.requireActual('./phoenixKey-api');
  return {
    ...actual,
    phoenixKeyApi: {
      wallet: { standardRegister: (...args: unknown[]) => mockRegister(...args) },
    },
  };
});

import { PhoenixKeyApiError, setSessionToken } from './phoenixKey-api';
import { ensureStandardWalletRegistered } from './standardWalletService';

const REFUSAL = () =>
  new PhoenixKeyApiError(1326, 403, 'Signature does not verify against paymentPublicKeyHex');

beforeEach(async () => {
  await AsyncStorage.clear();
  mockWalletError.mockClear();
  mockRegister = jest.fn(async () => {
    throw REFUSAL();
  });
  mockSignHex = jest.fn(async () => ({
    paymentPublicKeyHex: '11'.repeat(32),
    signature: '44'.repeat(64),
  }));
});

/** Câu cuối cùng app tự phát ra cho lượt đăng ký hỏng. */
const lastLoggedMessage = (): string => {
  const calls = mockWalletError.mock.calls;
  return String(calls[calls.length - 1]?.[3] ?? '');
};

describe('lượt đăng ký ví · câu nhật ký mang đúng phạm vi', () => {
  it('máy KHÔNG có cửa ký hex ⟹ KHÔNG được khai là "cả hai khuôn"', async () => {
    // `null` ở đây nghĩa là "máy này không dựng nổi khuôn đóng khung" — khác hẳn
    // "máy chủ từ chối khuôn đó". Chỉ một khuôn đi tới máy chủ.
    mockSignHex = jest.fn(async () => null);
    await setSessionToken('the-A', DID);

    expect(await ensureStandardWalletRegistered()).toBe(false);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const msg = lastLoggedMessage();
    expect(msg).not.toContain('cả hai khuôn');
    // Và phải nói ra con số, để người đọc biết vùng quét chứ không phải đoán nó.
    expect(msg).toContain('1/2');
  });

  it('CẢ HAI khuôn thật sự gửi đi và bị từ chối ⟹ được khai là "cả hai khuôn"', async () => {
    // Cực đối xứng. Thiếu nó thì một bản vá "không bao giờ nói cả hai" cũng xanh,
    // và câu nhật ký mất luôn khả năng khai đúng ca nó cần khai nhất.
    await setSessionToken('the-A', DID);

    expect(await ensureStandardWalletRegistered()).toBe(false);

    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(lastLoggedMessage()).toContain('cả hai khuôn');
  });
});
