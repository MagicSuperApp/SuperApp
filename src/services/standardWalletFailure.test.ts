// services/standardWalletFailure.test.ts
//
// LƯỢT ĐĂNG KÝ VÍ HỎNG PHẢI CÓ CHỖ ĐỂ Ở.
//
// Hàm `ensureStandardWalletRegistered` trả `false` khi hỏng, và chỗ gọi nó
// (`navigation/index.tsx`) BỎ giá trị đó. Ngay sau đó màn chính hỏi
// `/wallet/{did}/all` — lượt ấy thành công, trả về ví custody, nên màn in một con
// số. Con số đó nghĩa là "chưa bao giờ đăng ký được" mà được vẽ bằng đúng hình
// dạng của "ví rỗng".
//
// Bài này canh hai điều, và điều thứ hai mới là điều dễ mất:
//   1. hỏng thì có chỗ đọc ra được lý do;
//   2. XONG thì chỗ đó phải SẠCH — một lời khai hỏng còn nằm lại sau khi việc đã
//      chạy được là một cảnh báo sai, và cảnh báo sai dạy người đọc bỏ qua ô đó.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Tiền tố `mock` là điều kiện của jest để nhà máy `jest.mock` được nhắc tới biến
// ngoài phạm vi — không phải một kiểu đặt tên tuỳ ý.
const mockDidA = 'did:phoenix:1:' + 'a'.repeat(64);
const mockDidB = 'did:phoenix:1:' + 'b'.repeat(64);
const DID_A = mockDidA;
const DID_B = mockDidB;

let mockRegister: jest.Mock;

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDidA),
}));

jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => new Proxy(() => {}, { get: () => () => {} }) }),
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
  },
}));

jest.mock('./masterKekStore', () => ({
  getStoredMasterKek: jest.fn(async () => '33'.repeat(32)),
  getActiveAccountIndex: jest.fn(async () => 0),
}));

// Mock BỘ PHẬN: `ensureSessionTokenBelongsTo`, `setSessionToken` và
// `PhoenixKeyApiError` phải là hàng THẬT và cùng MỘT thực thể module — phép kiểm
// dấu chủ đọc cùng kho AsyncStorage mà bài này ghi.
jest.mock('./phoenixKey-api', () => {
  const actual = jest.requireActual('./phoenixKey-api');
  return {
    ...actual,
    phoenixKeyApi: {
      wallet: { standardRegister: (...args: unknown[]) => mockRegister(...args) },
    },
  };
});

import { PhoenixKeyApiError, setSessionToken, getSessionToken } from './phoenixKey-api';
import {
  ensureStandardWalletRegistered,
  getLastStandardWalletFailure,
  describeStandardWalletFailure,
} from './standardWalletService';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRegister = jest.fn(async () => undefined);
});

describe('đăng ký ví Standard · lần hỏng có chỗ để ở', () => {
  it('máy chủ trả 403 ⟹ ghi lại bước, mã, và một câu người đọc được', async () => {
    await setSessionToken('the-A', DID_A);
    mockRegister = jest.fn(async () => {
      throw new PhoenixKeyApiError(
        1326, 403,
        'Wallet payment-key signature verification failed',
      );
    });

    expect(await ensureStandardWalletRegistered()).toBe(false);

    const failure = getLastStandardWalletFailure();
    expect(failure).not.toBeNull();
    expect(failure!.step).toBe('register');
    expect(failure!.code).toBe(1326);
    expect(failure!.httpStatus).toBe(403);
    expect(describeStandardWalletFailure()).toContain('chưa phải của ví bạn giữ khoá');
  });

  it('lượt sau XONG ⟹ chỗ đó phải sạch, không để lại cảnh báo sai', async () => {
    await setSessionToken('the-A', DID_A);
    mockRegister = jest.fn(async () => {
      throw new PhoenixKeyApiError(1326, 403, 'trượt');
    });
    await ensureStandardWalletRegistered();
    expect(getLastStandardWalletFailure()).not.toBeNull();

    mockRegister = jest.fn(async () => undefined);
    expect(await ensureStandardWalletRegistered()).toBe(true);
    expect(getLastStandardWalletFailure()).toBeNull();
    expect(describeStandardWalletFailure()).toBeNull();
  });

  it('409 "đã có ví" là XONG, không phải hỏng — và cũng xoá lời khai cũ', async () => {
    await setSessionToken('the-A', DID_A);
    mockRegister = jest.fn(async () => {
      throw new PhoenixKeyApiError(1326, 403, 'trượt');
    });
    await ensureStandardWalletRegistered();

    mockRegister = jest.fn(async () => {
      throw new PhoenixKeyApiError(3005, 409, 'already exists');
    });
    expect(await ensureStandardWalletRegistered()).toBe(true);
    expect(getLastStandardWalletFailure()).toBeNull();
  });
});

describe('đăng ký ví Standard · thẻ phiên của người khác', () => {
  it('thẻ mang dấu người khác ⟹ KHÔNG gửi lượt đăng ký nào cả', async () => {
    await setSessionToken('the-B', DID_B); // thẻ của tài khoản trước
    expect(await ensureStandardWalletRegistered()).toBe(false);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('và thẻ đó bị bỏ, để lượt sau lập phiên mới', async () => {
    await setSessionToken('the-B', DID_B);
    await ensureStandardWalletRegistered();
    expect(await getSessionToken()).toBeNull();
  });

  it('lý do ghi lại nói đúng bước — không đội lốt một lỗi máy chủ', async () => {
    await setSessionToken('the-B', DID_B);
    await ensureStandardWalletRegistered();
    const failure = getLastStandardWalletFailure();
    expect(failure!.step).toBe('session');
    expect(failure!.httpStatus).toBe(0); // chưa có lượt mạng nào để mà có mã HTTP
    expect(describeStandardWalletFailure()).toContain('không thuộc tài khoản này');
  });

  it('thẻ KHÔNG mang dấu (bản app cũ) cũng chặn, và nói ra là không kiểm được', async () => {
    await AsyncStorage.setItem('phoenixkey_session_token', 'the-ban-cu');
    expect(await ensureStandardWalletRegistered()).toBe(false);
    expect(mockRegister).not.toHaveBeenCalled();
    expect(getLastStandardWalletFailure()!.message).toContain('không mang dấu chủ');
  });

  it('thẻ đúng chủ ⟹ đi tiếp, lượt đăng ký được gửi', async () => {
    await setSessionToken('the-A', DID_A);
    expect(await ensureStandardWalletRegistered()).toBe(true);
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('CHƯA có thẻ nào ⟹ vẫn đi tiếp (máy chủ tự trả 401), không nhầm thành thẻ lạ', async () => {
    // Ca này phải phân biệt được với ca "thẻ lạ": chưa có thẻ là chuyện thường của
    // lần chạy đầu, chặn ở đây là chặn cả đường đi đúng.
    expect(await ensureStandardWalletRegistered()).toBe(true);
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });
});
