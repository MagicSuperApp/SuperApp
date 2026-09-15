/**
 * Không có khoá dự phòng thì KHÔNG đăng ký — và KHÔNG động vào máy trước khi biết.
 *
 * ── Ca hỏng bộ kiểm này sinh ra để chặn ────────────────────────────────────────
 * Tới 2026-09-14, `deriveWalletRegisterFields()` trả `{}` ở cả ba nhánh hỏng rồi
 * lượt đăng ký **đi tiếp và thành công**. Máy chủ ghi khoá TAAD vào bảng
 * `taad_keys` ĐÚNG MỘT LẦN, trong chính giao dịch khai sinh của lượt đăng ký đó;
 * không có đường bổ sung về sau, và đường khôi phục bằng 24 từ đọc đúng bảng ấy
 * rồi từ chối khi không thấy. (Dữ kiện do nhà giữ máy chủ đo và gửi sang; nhà này
 * không có quyền đọc mã máy chủ để tự đo lại — nên đây là phần CHƯA KIỂM của bộ
 * kiểm này, và nó là tiền đề chứ không phải kết luận.)
 *
 * Nên một lượt như thế không phải "tài khoản thiếu một tính năng" — nó là một danh
 * tính không khôi phục được, vĩnh viễn, trao cho người dùng mà không ai báo.
 *
 * ── Bộ kiểm này ĐO CÁI GÌ, và cố ý KHÔNG đo cái gì ────────────────────────────
 * Đo HÀNH VI, không đo câu chữ: "máy chủ có bị gọi không", "chip có bị động vào
 * không", "khoá cũ có bị xoá không". Câu chữ đổi được mà không ai hỏng; ba thứ
 * trên đổi là có người mất danh tính.
 *
 * KHÔNG đo phần tầng màn hình dựng hộp thoại nào — chốt đó nằm ở
 * `SignUpBiometricScreen.tsx`, và bộ kiểm này không ghim nó. Nói ra để không ai
 * đọc màu xanh ở đây thành "cả đường đã được canh".
 */

const mockEnrollCalls: number[] = [];
const mockWipeCalls: number[] = [];
const mockRegisterBodies: any[] = [];

let mockKeypairEnrolled = false;
let mockTaadAvailable = true;
/** Hỏng bằng cách nào là do từng ca tự đặt. Mặc định: máy lành. */
let mockDeriveTaad: () => Promise<string> = async () => 'ab'.repeat(32);
let mockMasterKek: () => Promise<string> = async () => 'cd'.repeat(32);

jest.mock('../sdk/phoenixKey', () => ({
  __esModule: true,
  default: {},
  KEY_ALIAS_OWNER: 'owner',
  STORAGE_USER_DID: 'user_did',
  currentUserDid: jest.fn(async () => null),
  enrollKeypair: jest.fn(async () => {
    mockEnrollCalls.push(1);
    return { alias: 'owner', publicKeyHex: '04' + 'aa'.repeat(64) };
  }),
  isKeypairEnrolled: jest.fn(async () => mockKeypairEnrolled),
  ownerPublicKey: jest.fn(async () => '04' + 'aa'.repeat(64)),
  saveUserDid: jest.fn(async () => {}),
  signRaw: jest.fn(async () => 'deadbeef'),
  wipeIdentity: jest.fn(async () => {
    mockWipeCalls.push(1);
  }),
}));

jest.mock('./phoenixKey-api', () => {
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
      clearSessionToken: jest.fn(async () => {}),
      identity: {
        register: jest.fn(async (body: any) => {
          mockRegisterBodies.push(body);
          return {
            userDid:
              'did:phoenix:aaaaaaahomxng:07002c1ff14a746a996709f8b8d35b9ac24cb7fd06cdc3cfe614e1d27a76bc58',
            txHash: 'tx-mock',
          };
        }),
        lookupByKey: jest.fn(async () => {
          throw new Error('không dùng ở bài này');
        }),
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
  isCoreUnavailableError: (e: any) => !!e?.coreUnavailable,
  default: {
    isAvailable: () => mockTaadAvailable,
    deriveTaadPubkey: jest.fn(async () => mockDeriveTaad()),
    deriveWalletAddress: jest.fn(async () => 'addr_test1qmock'),
  },
}));

jest.mock('./masterKekStore', () => ({
  __esModule: true,
  getOrCreateMasterKek: jest.fn(async () => mockMasterKek()),
}));

beforeEach(() => {
  mockEnrollCalls.length = 0;
  mockWipeCalls.length = 0;
  mockRegisterBodies.length = 0;
  mockKeypairEnrolled = false;
  mockTaadAvailable = true;
  mockDeriveTaad = async () => 'ab'.repeat(32);
  mockMasterKek = async () => 'cd'.repeat(32);
});

/** Lỗi đúng hình dạng cầu native dựng khi `.so` không nạp được cho ABI của máy. */
const coreUnavailableError = () => {
  const e = new Error('deriveTaadPubkey: lõi chưa sẵn sàng') as Error & {
    coreUnavailable?: boolean;
  };
  e.coreUnavailable = true;
  return e;
};

describe('khoá dự phòng là ĐIỀU KIỆN của lượt đăng ký', () => {
  it('đường lành vẫn đi qua, và gửi ĐỦ hai trường lên máy chủ', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const res = await registerIdentity('strong', 'new-person', 'nguoi-moi');

    expect(res.txHash).toBe('tx-mock');
    expect(mockRegisterBodies).toHaveLength(1);
    expect(mockRegisterBodies[0].taadPublicKeyHex).toBe('ab'.repeat(32));
    expect(mockRegisterBodies[0].walletAddress).toBe('addr_test1qmock');
  });

  it('suy khoá TRƯỢT ⟹ KHÔNG gọi máy chủ, và KHÔNG động vào chip', async () => {
    mockDeriveTaad = async () => {
      throw new Error('lõi trượt một lần');
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    expect(err.reason).toBe('derive_failed');
    // Chốt đắt nhất của tệp: không lượt đăng ký nào được đi ra ngoài.
    expect(mockRegisterBodies).toHaveLength(0);
    // Và chốt về THỨ TỰ: `enrollKeypair` xoá khoá cũ trong chip rồi ghi khoá mới.
    // Chạy nó trước phép đo là để lại một máy mất khoá cũ mà chưa có danh tính mới,
    // và lần bấm sau app hỏi "máy này đã có một danh tính" về một danh tính chưa
    // từng tồn tại.
    expect(mockEnrollCalls).toHaveLength(0);
  });

  it('cầu native báo THIẾU LÕI ⟹ `core_missing`, không phải `derive_failed`', async () => {
    // Hai mã này dẫn tới hai lời khuyên trái ngược — "thử lại" với một lần trượt,
    // "cập nhật app hoặc đổi máy" với một máy không bao giờ chạy được. Trộn hai ca
    // là đưa lời khuyên vô dụng cho đúng nhóm bị chặn nặng nhất.
    mockDeriveTaad = async () => {
      throw coreUnavailableError();
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    expect(err.reason).toBe('core_missing');
    expect(mockRegisterBodies).toHaveLength(0);
  });

  it('`isAvailable()` false ⟹ chặn, và chặn TRƯỚC mọi thứ khác', async () => {
    mockTaadAvailable = false;
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    expect(err.reason).toBe('core_missing');
    expect(mockRegisterBodies).toHaveLength(0);
    expect(mockEnrollCalls).toHaveLength(0);
  });

  it('cầu trả về CHUỖI RỖNG mà không ném ⟹ vẫn chặn', async () => {
    // Nhánh riêng vì nó đi lọt mọi `catch`: không có lỗi nào để mà bắt.
    mockDeriveTaad = async () => '';
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    expect(err.reason).toBe('derive_failed');
    expect(mockRegisterBodies).toHaveLength(0);
  });

  it('kho khoá không mở được ⟹ chặn, không đăng ký bằng một KEK chỉ sống trong RAM', async () => {
    mockMasterKek = async () => {
      throw new Error('secureLoad hỏng');
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    expect(err.reason).toBe('derive_failed');
    expect(mockRegisterBodies).toHaveLength(0);
  });

  it('câu hiện cho người dùng KHÁC nhau ở hai mã, và đều nói ra việc phải làm', async () => {
    const { registerIdentity } = require('./phoenixKeyAuthService');

    mockDeriveTaad = async () => {
      throw new Error('trượt');
    };
    const errTransient = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    mockTaadAvailable = false;
    const errNoCore = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    expect(errTransient.message).not.toBe(errNoCore.message);
    // Ca trượt mời thử lại; ca thiếu lõi thì KHÔNG được mời, vì thử lại không đổi gì.
    expect(errTransient.message).toMatch(/thử lần nữa|thử lại/i);
    expect(errNoCore.message).toMatch(/cập nhật/i);
    expect(errNoCore.message).not.toMatch(/thử lại một lần|hãy thử lại/i);
    // Ca trượt phải loại trừ hai thứ duy nhất người dùng ngoài vườn biết tự sửa —
    // không loại trừ thì họ đi kiểm sóng và quẹt lại vân tay cho một việc không
    // liên quan. (Ca thiếu lõi nói thẳng "thử lại sẽ không khác" nên đủ rõ.)
    expect(errTransient.message).toMatch(/không phải lỗi sóng/i);
    expect(errTransient.message).toMatch(/vân tay/i);
  });
});

describe('`reRegisterIdentity` — đo TRƯỚC khi xoá', () => {
  it('thiếu khoá dự phòng ⟹ KHÔNG xoá khoá cũ trong chip', async () => {
    // Luồng gọi hàm này là màn nhận diện cây: người dùng đang đứng ngoài vườn giữa
    // một việc khác hẳn. Thứ tự cũ (xoá → đăng ký → phát hiện thiếu khoá) để lại
    // một máy vừa mất khoá cũ vừa không có khoá mới, và `wipeIdentity` với khoá
    // trong chip là bất khả hồi.
    mockTaadAvailable = false;
    const { reRegisterIdentity } = require('./phoenixKeyAuthService');
    const err = await reRegisterIdentity('strong').catch((e: any) => e);

    expect(err.reason).toBe('core_missing');
    expect(mockWipeCalls).toHaveLength(0);
    expect(mockRegisterBodies).toHaveLength(0);
  });

  it('ĐỐI CHỨNG — máy lành thì hàm này VẪN xoá rồi đăng ký lại', async () => {
    // Không có ca này, bài trên xanh y hệt khi ai đó gỡ hẳn `wipeIdentity()` khỏi
    // `reRegisterIdentity` — tức bài trên sẽ ghim một hàm đã mất việc chính của nó.
    const { reRegisterIdentity } = require('./phoenixKeyAuthService');
    await reRegisterIdentity('strong');

    expect(mockWipeCalls).toHaveLength(1);
    expect(mockRegisterBodies).toHaveLength(1);
  });
});
