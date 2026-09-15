// services/walletSigningFormatProbe.test.ts
//
// CỬA ĐĂNG KÝ VÍ — ĐO KHUÔN CHUỖI KÝ, ĐỪNG ĐOÁN NÓ
//
// Máy chủ chưa khai cửa `POST /wallet/standard/register` dựng lại chuỗi ký theo
// khuôn nào, và `403/1326` trả về GIỐNG NHAU cho hai nguyên nhân khác hẳn. Lật
// khuôn theo phỏng đoán là tung đồng xu trên một đường người dùng thật đang đi.
//
// Bài này canh sáu điều, và ba điều cuối mới là ba điều dễ mất:
//   1. khuôn đang chạy đi TRƯỚC — một lượt dò không được làm xấu hơn hiện trạng;
//   2. bị từ chối vì chữ ký ⟹ thử khuôn còn lại;
//   3. nhận được khuôn nào thì NHỚ, lượt sau đi thẳng;
//   4. nonce phải MỚI cho từng lượt — gửi lại nonce vừa bị từ chối thì lượt sau
//      chết vì trùng nonce, và ta đọc nó thành "khuôn này cũng sai";
//   5. `409 đã có ví` KHÔNG được ghi vào dòng nhớ — máy chủ có thể báo trùng
//      TRƯỚC khi verify chữ ký, nên lượt đó không chứng minh khuôn đúng;
//   6. lỗi KHÁC chữ ký (401, 5xx) thì DỪNG — đừng đốt thêm một lượt gọi để nhận
//      lại cùng một câu trả lời.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDid = 'did:phoenix:1:' + 'a'.repeat(64);
const DID = mockDid;
const FIXED_ADDRESS = 'addr_test1_fixed';
const REGISTER_PREFIX = 'PHOENIXKEY_WALLET_STANDARD_REGISTER:';

let mockRegister: jest.Mock;
let mockSignString: jest.Mock;
let mockSignHex: jest.Mock;
let mockSaltSeq: number;

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDid),
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
    // Nonce KHÁC nhau từng lượt — đúng như hàng thật, để bài 4 đo được thật.
    generateSalt: jest.fn(async () => {
      mockSaltSeq += 1;
      return String(mockSaltSeq).padStart(2, '0').repeat(16);
    }),
    signWalletRegister: (...args: unknown[]) => mockSignString(...args),
    signWalletRegisterHex: (...args: unknown[]) => mockSignHex(...args),
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
import { buildCanonicalHex } from './canonicalMessage';
import { getAcceptedFormat, rememberAcceptedFormat } from './signingFormatProbe';
import {
  ensureStandardWalletRegistered,
  getLastStandardWalletFailure,
} from './standardWalletService';

const PROOF_STRING = { paymentPublicKeyHex: '11'.repeat(32), signature: '22'.repeat(64) };
const PROOF_HEX = { paymentPublicKeyHex: '11'.repeat(32), signature: '44'.repeat(64) };

const rejectSignature = () => {
  throw new PhoenixKeyApiError(1326, 403, 'Signature does not verify against paymentPublicKeyHex');
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSaltSeq = 0;
  mockRegister = jest.fn(async () => undefined);
  mockSignString = jest.fn(async () => PROOF_STRING);
  mockSignHex = jest.fn(async () => PROOF_HEX);
  await setSessionToken('the-A', DID);
});

describe('cửa đăng ký ví · thứ tự dò khuôn', () => {
  it('chưa biết gì ⟹ lượt đầu đi khuôn ĐANG CHẠY, không đi khuôn đóng khung', async () => {
    expect(await ensureStandardWalletRegistered()).toBe(true);

    expect(mockSignString).toHaveBeenCalledTimes(1);
    expect(mockSignHex).not.toHaveBeenCalled();
    // Và chuỗi ký là đúng chuỗi nối `':'` như trước, không đổi một byte.
    const [, , challenge] = mockSignString.mock.calls[0];
    expect(challenge).toBe(`${REGISTER_PREFIX}${DID}:${FIXED_ADDRESS}:${'01'.repeat(16)}`);
  });

  it('403/1326 ⟹ thử khuôn ĐÓNG KHUNG, và gửi đi chữ ký của khuôn đó', async () => {
    mockRegister = jest.fn(async (body: { signature: string }) => {
      if (body.signature === PROOF_STRING.signature) rejectSignature();
    }) as jest.Mock;

    expect(await ensureStandardWalletRegistered()).toBe(true);

    expect(mockSignHex).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[1][0].signature).toBe(PROOF_HEX.signature);
  });

  it('lượt thứ hai dùng NONCE MỚI, không gửi lại nonce vừa bị từ chối', async () => {
    mockRegister = jest.fn(async (body: { signature: string }) => {
      if (body.signature === PROOF_STRING.signature) rejectSignature();
    }) as jest.Mock;

    await ensureStandardWalletRegistered();

    const nonceLan1 = mockRegister.mock.calls[0][0].nonce;
    const nonceLan2 = mockRegister.mock.calls[1][0].nonce;
    expect(nonceLan2).not.toBe(nonceLan1);
    // Và chuỗi đóng khung phải dựng trên ĐÚNG nonce vừa gửi — không phải nonce cũ.
    const [, , messageHex] = mockSignHex.mock.calls[0];
    expect(messageHex).toBe(
      buildCanonicalHex(REGISTER_PREFIX, DID, FIXED_ADDRESS, nonceLan2),
    );
  });

  it('cả hai khuôn đều bị từ chối ⟹ trả false và ghi lại lý do', async () => {
    mockRegister = jest.fn(async () => rejectSignature());

    expect(await ensureStandardWalletRegistered()).toBe(false);
    expect(mockRegister).toHaveBeenCalledTimes(2);
    const failure = getLastStandardWalletFailure();
    expect(failure!.step).toBe('register');
    expect(failure!.code).toBe(1326);
  });
});

describe('cửa đăng ký ví · dòng nhớ', () => {
  it('máy chủ nhận khuôn đóng khung ⟹ NHỚ, và lượt sau đi thẳng khuôn đó', async () => {
    mockRegister = jest.fn(async (body: { signature: string }) => {
      if (body.signature === PROOF_STRING.signature) rejectSignature();
    }) as jest.Mock;
    await ensureStandardWalletRegistered();
    expect(await getAcceptedFormat('walletStandardRegister')).toBe('length-framed');

    mockSignString = jest.fn(async () => PROOF_STRING);
    mockSignHex = jest.fn(async () => PROOF_HEX);
    mockRegister = jest.fn(async () => undefined);
    expect(await ensureStandardWalletRegistered()).toBe(true);
    expect(mockSignHex).toHaveBeenCalledTimes(1);
    expect(mockSignString).not.toHaveBeenCalled();
  });

  it('khuôn đã nhớ thôi được nhận ⟹ vẫn thử được khuôn còn lại', async () => {
    // Máy chủ đổi khuôn SAU ngày app nhớ. Dòng đã nhớ giờ là một lời khai sai, và
    // đây là ca nó phải tự chữa được chứ không kẹt.
    await rememberAcceptedFormat('walletStandardRegister', 'length-framed');
    mockRegister = jest.fn(async (body: { signature: string }) => {
      if (body.signature === PROOF_HEX.signature) rejectSignature();
    }) as jest.Mock;

    expect(await ensureStandardWalletRegistered()).toBe(true);
    expect(await getAcceptedFormat('walletStandardRegister')).toBe('legacy-colon');
  });

  it('409 "đã có ví" là XONG nhưng KHÔNG chứng minh khuôn ⟹ không ghi dòng nhớ', async () => {
    mockRegister = jest.fn(async () => {
      throw new PhoenixKeyApiError(3005, 409, 'already exists');
    });

    expect(await ensureStandardWalletRegistered()).toBe(true);
    expect(await getAcceptedFormat('walletStandardRegister')).toBeNull();
  });
});

describe('cửa đăng ký ví · ba trạng thái, không phải hai', () => {
  it('máy KHÔNG CÓ cửa ký hex ⟹ bỏ khuôn đó, KHÔNG tính là chữ ký sai', async () => {
    // Bản dựng cũ hơn 2026-09-15 không có cửa hex; cầu TS trả `null`. Đọc `null`
    // thành "chữ ký sai" là báo cho người dùng một lý do không có thật.
    mockSignHex = jest.fn(async () => null);
    mockRegister = jest.fn(async () => rejectSignature());

    expect(await ensureStandardWalletRegistered()).toBe(false);
    // Chỉ MỘT lượt gọi máy chủ: khuôn đóng khung không dựng được nên không gửi đi.
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(getLastStandardWalletFailure()!.code).toBe(1326);
  });

  it('lỗi KHÁC chữ ký ⟹ DỪNG, không đốt thêm một lượt gọi', async () => {
    mockRegister = jest.fn(async () => {
      throw new PhoenixKeyApiError(1001, 401, 'Missing session token');
    });

    expect(await ensureStandardWalletRegistered()).toBe(false);
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockSignHex).not.toHaveBeenCalled();
    const failure = getLastStandardWalletFailure();
    expect(failure!.httpStatus).toBe(401);
  });
});
