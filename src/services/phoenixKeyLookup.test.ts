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

const mockKeyAuthCalls: any[][] = [];
let mockKeyAuthImpl: () => Promise<{ authorized: boolean }> = async () => ({ authorized: true });
let mockResolveImpl: () => Promise<{ userDid: string }> = async () => {
  throw new Error('không dùng ở bài này');
};

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
        resolveUsername: jest.fn(async () => mockResolveImpl()),
        keyAuthorized: jest.fn(async (...a: any[]) => { mockKeyAuthCalls.push(a); return mockKeyAuthImpl(); }),
        getPubkey: jest.fn(async () => { throw new Error('KHÔNG được dùng nữa — xem bài kiểm đường 2'); }),
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
  mockKeyAuthCalls.length = 0;
  mockKeyAuthImpl = async () => ({ authorized: true });
  mockResolveImpl = async () => { throw new Error('không dùng ở bài này'); };
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
    //
    // Lookup hỏng vì MẠNG (httpStatus 0), cố ý KHÔNG dùng 404: 404 + 3005 là cặp suy
    // ra "khoá đã bị thu hồi" (bài riêng phía dưới). Bài này chỉ khoá đúng một việc —
    // 3005 không được đọc thành "lỗi phía máy chủ".
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(-1, 0, 'Network error'); };
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

describe('suy ra "khoá đã bị thu hồi" — ngõ cụt cần một lối ra', () => {
  /**
   * Hai cửa máy chủ dùng hai truy vấn khác nhau trên CÙNG một chuỗi khoá:
   *   lookup   findByPublicKeyHexAndStatus(hex, "active")  → rỗng ⟹ 404
   *   register existsByPublicKeyHex(hex)  — không lọc status → có ⟹ 3005
   * Một cửa không thấy, cửa kia thấy. Khác biệt duy nhất là `status` ⟹ khoá CÓ
   * trong kho nhưng không còn active, tức đã bị thu hồi (Mode B `revokeOwnersByUserDid`).
   */
  it('lookup 404 + register 3005 → khoa_bi_thu_hoi, và câu chỉ đúng lối ra 24 từ', async () => {
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(404, 404, 'Không tìm thấy DID'); };
    mockRegisterImpl = async () => { throw new PhoenixKeyApiError(3005, 409, 'This public key is already registered'); };

    const { registerIdentity } = require('./phoenixKeyAuthService');
    await expect(registerIdentity('strong', 'resume')).rejects.toThrow(/24 từ/);
    // Phải nói thẳng cài lại app không cứu được — nếu không người dùng cài lần nữa.
    await expect(registerIdentity('strong', 'resume')).rejects.toThrow(/[Cc]ài lại/);
  });

  it('gắn `reason` lên lỗi để màn hình mở đúng lối thoát, KHÔNG bắt nó dò chuỗi', async () => {
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(404, 404, 'Không tìm thấy DID'); };
    mockRegisterImpl = async () => { throw new PhoenixKeyApiError(3005, 409, 'This public key is already registered'); };

    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'resume').catch((e: any) => e);
    expect(err.reason).toBe('khoa_bi_thu_hoi');
  });

  it('register 3005 mà lookup KHÔNG nói 404 → vẫn là can_ten_dang_nhap, không suy bừa', async () => {
    // Lookup hỏng vì mạng (httpStatus 0) chứ không phải máy chủ bảo không thấy.
    // Suy ra "bị thu hồi" ở đây là bịa một chẩn đoán từ một phép đo hỏng.
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(-1, 0, 'Network error'); };
    mockRegisterImpl = async () => { throw new PhoenixKeyApiError(3005, 409, 'This public key is already registered'); };

    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'resume').catch((e: any) => e);
    expect(err.reason).toBe('can_ten_dang_nhap');
    expect(String(err.message)).not.toMatch(/thu hồi/);
  });
});

describe('đường 2 hỏi `key-authorized`, KHÔNG so với /pubkey nữa', () => {
  /**
   * `/pubkey` trả owner-key MỚI NHẤT và **không lọc trạng thái** — máy chủ ghi thẳng
   * (`IdentityController.java:422-433`). Nó cũng chỉ trả MỘT khoá. Nên phép so cũ sai
   * theo hai chiều, và cả hai đều im lặng:
   *   khớp  → không chứng minh khoá còn dùng được (có thể đã thu hồi)
   *   lệch  → không chứng minh khoá của người khác (có thể là khoá hợp lệ thứ hai)
   * Bài dưới đây khoá lại rằng app hỏi đúng câu, chứ không suy.
   */
  const DID = 'did:phoenix:aaaaaaahomxng:07002c1ff14a746a996709f8b8d35b9ac24cb7fd06cdc3cfe614e1d27a76bc58';

  it('lookup hỏng + tên đăng nhập đúng + khoá ĐƯỢC uỷ quyền → vào được', async () => {
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(-1, 0, 'Network error'); };
    mockResolveImpl = async () => ({ userDid: DID });
    mockKeyAuthImpl = async () => ({ authorized: true });

    const { registerIdentity } = require('./phoenixKeyAuthService');
    const res = await registerIdentity('strong', 'resume', 'nong-dan-a');
    expect(res.user.did).toBe(DID);

    // Hỏi ĐÚNG DID vừa tra ra, và bằng khoá của máy ở dạng lowercase.
    const [did, key] = mockKeyAuthCalls[0];
    expect(did).toBe(DID);
    expect(key).toBe(key.toLowerCase());
  });

  it('khoá KHÔNG được uỷ quyền → nói đúng "tên này thuộc danh tính khác"', async () => {
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(-1, 0, 'Network error'); };
    mockResolveImpl = async () => ({ userDid: DID });
    mockKeyAuthImpl = async () => ({ authorized: false });

    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'resume', 'ten-nguoi-khac').catch((e: any) => e);
    expect(err.reason).toBe('ten_khong_khop_khoa');
  });

  it('KHÔNG còn gọi `/pubkey` ở đường này — mock của nó ném nếu bị gọi', async () => {
    mockLookupImpl = async () => { throw new PhoenixKeyApiError(-1, 0, 'Network error'); };
    mockResolveImpl = async () => ({ userDid: DID });
    mockKeyAuthImpl = async () => ({ authorized: true });

    const { registerIdentity } = require('./phoenixKeyAuthService');
    await expect(registerIdentity('strong', 'resume', 'nong-dan-a')).resolves.toBeTruthy();
  });
});
