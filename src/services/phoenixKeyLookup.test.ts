/**
 * Khôi phục danh tính bằng SINH TRẮC — `POST /identity/lookup` (PhoenixKey #192).
 *
 * Ca thật gây ra bộ kiểm này: người thử cài lại app từ TestFlight (19/08). Keychain
 * giữ khoá qua lần cài lại, còn AsyncStorage — nơi lưu tên đăng nhập — bị xoá sạch.
 * App không còn gì để tra nên rơi xuống đường đăng ký lại, nhận
 * `KEY_ALREADY_REGISTERED`, rồi hiện câu "đây là lỗi phía máy chủ" — đổ tội cho đúng
 * cái cổng máy chủ dựng để chống một máy khác cướp khoá của DID khác.
 *
 * Ba thứ khoá ở đây, cả ba đều thuộc họ "sai mà không có gì báo":
 *
 *  1. **MIỀN KÝ phải là `PHOENIXKEY_LOOKUP:`.** DTO máy chủ đặt nhãn riêng để chống
 *     ký nhầm miền — `PHOENIXKEY_GENESIS:` là của đường đăng ký. Ký nhầm tiền tố thì
 *     máy chủ trả 404 giống hệt ca "khoá chưa đăng ký", và KHÔNG có gì phân biệt được
 *     hai chuyện đó từ phía app. Đây là chỗ dễ chép nhầm nhất vì hai đoạn mã nằm cách
 *     nhau vài chục dòng trong cùng một hàm.
 *
 *  2. **Phân loại lỗi theo MÃ SỐ, không theo chuỗi.** `KEY_ALREADY_REGISTERED` = mã
 *     3005 (`ErrorCode.java:215`), câu kèm theo là tiếng Anh "Public key already
 *     registered". Phép dò chuỗi cũ bắt trúng chữ `registered` rồi rơi vào nhánh
 *     "lỗi máy chủ". Đổi ngôn ngữ máy chủ trả về là phép dò chuỗi lại lệch tiếp.
 *
 *  3. **Hex LOWERCASE.** Máy chủ ép `^(0[23][0-9a-f]{64}|04[0-9a-f]{128})$` cho khoá
 *     và `^[0-9a-f]+$` cho chữ ký. Gửi HOA thì 400 — mà 400 ở giữa vườn trông y hệt
 *     "mất sóng".
 */
import { PhoenixKeyApiError } from './phoenixKey-api';

// ── Bộ ghi lại thứ đã ký + thứ đã gửi ────────────────────────────────────────
const mockSigned: string[] = [];
const mockLookupCalls: Array<{ publicKeyHex: string; nonce: string; signatureHex: string }> = [];

let mockLookupImpl: () => Promise<{ userDid: string }> = async () => ({
  userDid: 'did:phoenix:aaaaaaahomxng:07002c1ff14a746a996709f8b8d35b9ac24cb7fd06cdc3cfe614e1d27a76bc58',
});

/** Đường 3 (đăng ký lại). Mặc định hỏng, vì bài nào tới được đây cũng là bài hỏng. */
let mockRegisterImpl: () => Promise<unknown> = async () => {
  throw new Error('không dùng ở bài này');
};

jest.mock('../sdk/phoenixKey', () => ({
  __esModule: true,
  default: {},
  KEY_ALIAS_OWNER: 'owner',
  STORAGE_USER_DID: 'user_did',
  currentUserDid: jest.fn(async () => null),
  enrollKeypair: jest.fn(),
  isKeypairEnrolled: jest.fn(async () => true),
  // Khoá HOA có chủ ý — bài kiểm 3 đòi mã phải tự hạ chữ trước khi gửi.
  ownerPublicKey: jest.fn(async () => '04AABBCCDDEEFF' + 'A'.repeat(116)),
  saveUserDid: jest.fn(async () => {}),
  signRaw: jest.fn(async (messageHex: string) => {
    mockSigned.push(messageHex);
    return 'DEADBEEF';
  }),
  wipeIdentity: jest.fn(async () => {}),
}));

jest.mock('./phoenixKey-api', () => {
  // Gán thường, KHÔNG dùng thuộc-tính-tham-số của TypeScript: nhà máy `jest.mock`
  // bị babel soi biến ngoài phạm vi và `public readonly code` bị đọc thành một biến
  // ngoài, làm cả bộ kiểm không chạy được.
  class ApiError extends Error {
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
    __esModule: true,
    PhoenixKeyApiError: ApiError,
    phoenixKeyApi: {
      identity: {
        lookupByKey: jest.fn(async (body: any) => {
          mockLookupCalls.push(body);
          return mockLookupImpl();
        }),
        resolveUsername: jest.fn(async () => { throw new Error('không dùng ở bài này'); }),
        getPubkey: jest.fn(async () => { throw new Error('không dùng ở bài này'); }),
        register: jest.fn(async () => mockRegisterImpl()),
      },
    },
  };
});

jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: { isAvailable: () => false },
}));

/** Hex UTF-8 → chuỗi, để đọc lại đúng thứ đã đưa cho `signRaw`. */
const hexToUtf8 = (hex: string): string => {
  const bytes = hex.match(/.{2}/g) ?? [];
  return decodeURIComponent(bytes.map((b) => '%' + b).join(''));
};

beforeEach(() => {
  mockSigned.length = 0;
  mockLookupCalls.length = 0;
  mockLookupImpl = async () => ({
    userDid: 'did:phoenix:aaaaaaahomxng:07002c1ff14a746a996709f8b8d35b9ac24cb7fd06cdc3cfe614e1d27a76bc58',
  });
  mockRegisterImpl = async () => { throw new Error('không dùng ở bài này'); };
});

describe('miền ký của lookup', () => {
  it('ký ĐÚNG nhãn PHOENIXKEY_LOOKUP, KHÔNG phải PHOENIXKEY_GENESIS', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');
    await registerIdentity('strong', 'resume');

    expect(mockSigned.length).toBeGreaterThan(0);
    const msg = hexToUtf8(mockSigned[0]);
    expect(msg.startsWith('PHOENIXKEY_LOOKUP:')).toBe(true);
    expect(msg).not.toMatch(/PHOENIXKEY_GENESIS/);
  });

  it('chuỗi ký đúng khuôn `PHOENIXKEY_LOOKUP:<pubkey>:<nonce>` với ĐÚNG nonce đã gửi', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');
    await registerIdentity('strong', 'resume');

    const sent = mockLookupCalls[0];
    expect(hexToUtf8(mockSigned[0])).toBe(
      `PHOENIXKEY_LOOKUP:${sent.publicKeyHex}:${sent.nonce}`,
    );
  });
});

describe('khuôn dữ liệu máy chủ ép', () => {
  it('khoá và chữ ký gửi đi đều LOWERCASE', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');
    await registerIdentity('strong', 'resume');

    const sent = mockLookupCalls[0];
    expect(sent.publicKeyHex).toBe(sent.publicKeyHex.toLowerCase());
    expect(sent.signatureHex).toBe(sent.signatureHex.toLowerCase());
  });

  it('nonce khớp `^[0-9a-f]{16,128}$` của DTO', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');
    await registerIdentity('strong', 'resume');

    expect(mockLookupCalls[0].nonce).toMatch(/^[0-9a-f]{16,128}$/);
  });

  it('hai lượt liền nhau KHÔNG trùng nonce', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');
    await registerIdentity('strong', 'resume');
    await registerIdentity('strong', 'resume');

    expect(mockLookupCalls[0].nonce).not.toBe(mockLookupCalls[1].nonce);
  });
});

describe('lookup thành công thì KHÔNG đi tiếp xuống đường đăng ký lại', () => {
  it('trả về DID máy chủ cho, txHash rỗng (đường này không ghi chuỗi)', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const res = await registerIdentity('strong', 'resume');

    expect(res.user.did).toMatch(/^did:phoenix:/);
    // Bịa một mã giao dịch ở đây là nói dối về một việc chưa xảy ra.
    expect(res.txHash).toBe('');
  });
});

describe('mã 3005 KHÔNG được đọc thành "lỗi phía máy chủ"', () => {
  it('KEY_ALREADY_REGISTERED → câu hướng dẫn nhập tên đăng nhập, không đổ tội máy chủ', async () => {
    // Lỗi phải ném từ ĐƯỜNG 3 (đăng ký lại), không phải từ lookup: lookup hỏng thì
    // đường 1 nuốt và đi tiếp — đúng thiết kế, vì máy chủ trả 404 giống nhau cho ba ca
    // khác hẳn nhau. Lý do cuối cùng người dùng thấy luôn đến từ đường 3.
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(404, 404, 'not found'); };
    // Máy chủ trả ĐÚNG như thật: mã 3005, HTTP 409, câu TIẾNG ANH chứa "registered".
    // Chính chữ đó làm phép dò chuỗi cũ bắt nhầm sang nhánh "lỗi phía máy chủ".
    mockRegisterImpl = async () => { throw new PhoenixKeyApiError(3005, 409, 'Public key already registered'); };

    const { registerIdentity } = require('./phoenixKeyAuthService');
    await expect(registerIdentity('strong', 'resume')).rejects.toThrow(
      /tên đăng nhập/i,
    );
    await expect(registerIdentity('strong', 'resume')).rejects.not.toThrow(
      /lỗi phía máy chủ/i,
    );
  });
});
