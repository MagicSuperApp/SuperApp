/**
 * LUỒNG uỷ quyền máy — khoá phần mà `keyAuthorizeService.test.ts` không chạm tới.
 *
 * Tệp kia ghim CHUỖI KÝ từng byte. Tệp này ghim những gì xảy ra QUANH nó: mốc đọc
 * lúc nào, mốc nào được ký, vai nào được gửi, và dừng ở đâu khi chưa đủ điều kiện.
 * Tách hai tệp vì tệp kia cố ý KHÔNG giả lập gì — nó phải so được với hàm dựng
 * chuỗi thật.
 */

const mockGenerateSalt = jest.fn();
jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: { generateSalt: (...a: unknown[]) => mockGenerateSalt(...a) },
}));

const mockSignRaw = jest.fn();
const mockCurrentUserDid = jest.fn();
jest.mock('../sdk/phoenixKey', () => ({
  signRaw: (...a: unknown[]) => mockSignRaw(...a),
  currentUserDid: (...a: unknown[]) => mockCurrentUserDid(...a),
}));

const mockOpSeq = jest.fn();
const mockAuthorize = jest.fn();
jest.mock('./phoenixKey-api', () => {
  class PhoenixKeyApiError extends Error {
    code: number;
    httpStatus: number;
    constructor(code: number, httpStatus: number, message: string) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
      this.name = 'PhoenixKeyApiError';
    }
  }
  return {
    PhoenixKeyApiError,
    phoenixKeyApi: {
      identity: { opSeq: (...a: unknown[]) => mockOpSeq(...a) },
      keys: { authorize: (...a: unknown[]) => mockAuthorize(...a) },
    },
  };
});

import { buildCanonicalHex } from './canonicalMessage';
import { authorizeDeviceKey, AUTHORIZE_PREFIX } from './keyAuthorizeService';

const DID = 'did:phoenix:aaaaaaahl4nn6:ccd1feb6';
const PUB = '04' + 'cd'.repeat(64);

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUserDid.mockResolvedValue(DID);
  mockGenerateSalt.mockResolvedValue('beef77');
  mockOpSeq.mockResolvedValue({ lastOpSeq: 2, nextOpSeq: 3, maxOpSeq: 102 });
  mockSignRaw.mockResolvedValue('30450221AA');
  mockAuthorize.mockResolvedValue(undefined);
});

describe('thân gửi đúng hợp đồng máy chủ', () => {
  it('đủ bảy trường, và `keyOrigin` mặc định là SECURE_ENCLAVE', async () => {
    await authorizeDeviceKey(PUB);
    expect(mockAuthorize).toHaveBeenCalledWith({
      userDid: DID,
      publicKeyHex: PUB,
      keyOrigin: 'SECURE_ENCLAVE',
      keyRole: 'manager',
      nonce: 'beef77',
      opSeq: 3,
      addedBySignature: '30450221AA',
    });
  });

  it('vai LUÔN là `manager`, không mở đường cho `owner`', async () => {
    // Luật V36 cho tối đa MỘT owner-key active mỗi DID, nên `owner` qua cửa này
    // chắc chắn nhận 3011. Không mở tham số ra để khỏi ai đó thử rồi tưởng máy chủ
    // hỏng. Đổi owner đi qua `/keys/rotate`.
    await authorizeDeviceKey(PUB);
    expect(mockAuthorize.mock.calls[0][0].keyRole).toBe('manager');
  });

  it('gọi nơi khác truyền được nguồn gốc khoá khác', async () => {
    await authorizeDeviceKey(PUB, { keyOrigin: 'IMPORTED_BIP39' });
    expect(mockAuthorize.mock.calls[0][0].keyOrigin).toBe('IMPORTED_BIP39');
  });
});

describe('mốc ký và mốc gửi là CÙNG một số', () => {
  it('chuỗi được ký dựng từ đúng mốc nằm trong thân gửi', async () => {
    // Lệch hai chỗ này thì máy chủ verify chữ ký trên mốc A rồi nâng mốc B, và
    // chữ ký hỏng câm — chỉ hiện ra bằng một con 403 không nói gì.
    await authorizeDeviceKey(PUB);
    const than = mockAuthorize.mock.calls[0][0];
    expect(mockSignRaw.mock.calls[0][0]).toBe(
      buildCanonicalHex(
        AUTHORIZE_PREFIX, than.userDid, than.publicKeyHex, than.keyRole,
        than.nonce, String(than.opSeq),
      ),
    );
  });

  it('nonce được ký cũng là nonce được gửi', async () => {
    await authorizeDeviceKey(PUB);
    const than = mockAuthorize.mock.calls[0][0];
    expect(than.nonce).toBe('beef77');
    expect(mockSignRaw.mock.calls[0][0]).toContain(
      // "beef77" trong hex UTF-8: 62 65 65 66 37 37
      '626565663737',
    );
  });

  it('hai lượt liên tiếp đọc lại mốc, không dùng lại giá trị cũ', async () => {
    mockOpSeq
      .mockResolvedValueOnce({ lastOpSeq: 2, nextOpSeq: 3, maxOpSeq: 102 })
      .mockResolvedValueOnce({ lastOpSeq: 3, nextOpSeq: 4, maxOpSeq: 103 });
    await authorizeDeviceKey(PUB);
    await authorizeDeviceKey('04' + 'ef'.repeat(64));
    expect(mockOpSeq).toHaveBeenCalledTimes(2);
    expect(mockAuthorize.mock.calls[0][0].opSeq).toBe(3);
    expect(mockAuthorize.mock.calls[1][0].opSeq).toBe(4);
  });

  it('mốc đọc TRƯỚC khi ký — ký xong mới đọc thì mốc có thể đã cũ', async () => {
    const thuTu: string[] = [];
    mockOpSeq.mockImplementation(async () => {
      thuTu.push('opSeq');
      return { lastOpSeq: 2, nextOpSeq: 3, maxOpSeq: 102 };
    });
    mockSignRaw.mockImplementation(async () => { thuTu.push('sign'); return 'sig'; });
    await authorizeDeviceKey(PUB);
    expect(thuTu).toEqual(['opSeq', 'sign']);
  });
});

describe('chưa có danh tính thì dừng TRƯỚC khi chạm mạng', () => {
  it('không hỏi mốc, không gọi uỷ quyền, và nói rõ vì sao', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    await expect(authorizeDeviceKey(PUB)).rejects.toThrow(/danh tính/i);
    expect(mockOpSeq).not.toHaveBeenCalled();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });
});

describe('kết quả trả về đủ để nơi gọi nói lại cho người dùng', () => {
  it('trả khoá, vai và mốc đã dùng', async () => {
    await expect(authorizeDeviceKey(PUB)).resolves.toEqual({
      publicKeyHex: PUB, keyRole: 'manager', opSeq: 3,
    });
  });
});
