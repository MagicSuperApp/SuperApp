/**
 * Đăng ký mới bị chặn vì VÍ trên máy đã thuộc một danh tính khác (3005).
 *
 * ── Ca hỏng bộ kiểm này sinh ra để chặn ───────────────────────────────────────
 * Tới 2026-09-15, mã `3005` trên đường ĐĂNG KÝ MỚI rơi vào `default` của
 * `friendlyRegisterError` và người dùng đọc "Tạo danh tính thất bại. Thử lại."
 * Câu đó mời họ làm một việc KHÔNG BAO GIỜ khác đi: trở ngại là chiếc ví nằm sẵn
 * trong kho khoá của máy, không phải lần bấm này. Đo được trên máy ảo 15/09 —
 * `wipeIdentity()` rồi đăng ký lại cho ra 3005/409, đổi sang `wipeLocalIdentity()`
 * (thêm `clearMasterKek()`) thì hết; biến duy nhất khác nhau giữa hai lượt là
 * Master_KEK.
 *
 * ── Đo CÁI GÌ ────────────────────────────────────────────────────────────────
 * Đo `reason` gắn trên lỗi, KHÔNG đo câu chữ tiếng Việt: màn hình phân nhánh theo
 * `reason`, và dò chuỗi thì vỡ ngay khi đổi câu hoặc đổi ngôn ngữ. Đúng lập luận
 * đã viết ở `SignUpBiometricScreen.tsx` cho nhánh `khoa_bi_thu_hoi`.
 *
 * Đo thêm rằng khoá VẪN bị xoá. Chốt đó nghe như chuyện cũ không liên quan, nhưng
 * nó là chốt đắt nhất ở đây: giữ khoá lại thì lần mở app sau, đường khôi phục nhận
 * đúng cặp (lookup 404) + (register 3005) và suy ra `khoa_bi_thu_hoi`
 * (`phoenixKeyAuthService.ts` ▸ khối "SUY RA KHOÁ ĐÃ BỊ THU HỒI") — một câu chuyện
 * bịa về một lần khôi phục ở nơi khác chưa từng xảy ra.
 *
 * ── KHÔNG đo cái gì ──────────────────────────────────────────────────────────
 * Không đo tầng màn hình. Hộp thoại và cái nút dẫn sang màn Khôi phục nằm ở
 * `SignUpBiometricScreen.tsx`; bộ kiểm này không ghim chúng. Nói ra để không ai
 * đọc màu xanh ở đây thành "cả đường đã được canh".
 */

// `export {}` ở cuối tệp biến nó thành MODULE. Không có dòng đó, tệp kiểm là một
// script và `mockWipeCalls` dưới đây nằm chung phạm vi toàn cục với biến trùng tên
// ở `taadKeyRequiredAtRegister.test.ts` — `tsc` báo TS2451 cho CẢ HAI tệp, kể cả
// tệp không ai sửa. Jest vẫn chạy bình thường nên chỉ `tsc` bắt được.
const mockWipeCalls: number[] = [];

let mockRegisterImpl: (body: any) => Promise<any> = async () => ({
  userDid:
    'did:phoenix:aaaaaaahomxng:07002c1ff14a746a996709f8b8d35b9ac24cb7fd06cdc3cfe614e1d27a76bc58',
  txHash: 'tx-mock',
});

jest.mock('../sdk/phoenixKey', () => ({
  __esModule: true,
  default: {},
  KEY_ALIAS_OWNER: 'owner',
  STORAGE_USER_DID: 'user_did',
  currentUserDid: jest.fn(async () => null),
  enrollKeypair: jest.fn(async () => ({
    alias: 'owner',
    publicKeyHex: '04' + 'aa'.repeat(64),
  })),
  isKeypairEnrolled: jest.fn(async () => false),
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
        register: jest.fn(async (body: any) => mockRegisterImpl(body)),
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
    isAvailable: () => true,
    deriveTaadPubkey: jest.fn(async () => 'ab'.repeat(32)),
    deriveWalletAddress: jest.fn(async () => 'addr_test1qmock'),
  },
}));

jest.mock('./masterKekStore', () => ({
  __esModule: true,
  getOrCreateMasterKek: jest.fn(async () => 'cd'.repeat(32)),
}));

beforeEach(() => {
  mockWipeCalls.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Đúng hình dạng máy chủ trả: mã 3005, HTTP 409, câu TIẾNG ANH. */
const keyAlreadyRegistered = () => {
  const { PhoenixKeyApiError } = require('./phoenixKey-api');
  return new PhoenixKeyApiError(
    3005,
    409,
    'Public key already registered',
  );
};

describe('ví trên máy đã thuộc một DID khác ⟹ nói đúng nguyên nhân, không mời thử lại', () => {
  it('3005 lúc đăng ký mới ⟹ lỗi mang reason `wallet_bound_to_other_did`', async () => {
    mockRegisterImpl = async () => {
      throw keyAlreadyRegistered();
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');

    const err: any = await registerIdentity('strong', 'new-person', 'nguoi-moi').then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeTruthy();
    expect(err.reason).toBe('wallet_bound_to_other_did');
  });

  it('câu hiện lên KHÔNG phải câu "Thử lại" chung chung', async () => {
    mockRegisterImpl = async () => {
      throw keyAlreadyRegistered();
    };
    const {
      registerIdentity,
      WALLET_BOUND_ELSEWHERE_MESSAGE,
    } = require('./phoenixKeyAuthService');

    const err: any = await registerIdentity('strong', 'new-person', 'nguoi-moi').then(
      () => null,
      (e: unknown) => e,
    );

    expect(err.message).toBe(WALLET_BOUND_ELSEWHERE_MESSAGE);
    // Chốt đối xứng: câu cũ phải THẬT SỰ biến mất, không chỉ "có câu mới ở đâu đó".
    expect(err.message).not.toContain('Tạo danh tính thất bại');
  });

  it('KHOÁ VẪN BỊ XOÁ — giữ lại là đầu độc phép suy "khoá đã bị thu hồi"', async () => {
    mockRegisterImpl = async () => {
      throw keyAlreadyRegistered();
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');

    await registerIdentity('strong', 'new-person', 'nguoi-moi').catch(() => {});

    expect(mockWipeCalls).toHaveLength(1);
  });

  it('mã lỗi KHÁC vẫn đi đường cũ — nhánh mới không nuốt của ai', async () => {
    const { PhoenixKeyApiError } = require('./phoenixKey-api');
    mockRegisterImpl = async () => {
      throw new PhoenixKeyApiError(5101, 503, 'chain busy');
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');

    const err: any = await registerIdentity('strong', 'new-person', 'nguoi-moi').then(
      () => null,
      (e: unknown) => e,
    );

    expect(err.reason).toBeUndefined();
    expect(err.message).toBe('Blockchain bận. Thử lại sau vài phút.');
    expect(mockWipeCalls).toHaveLength(1);
  });

  it('đường lành không đổi', async () => {
    mockRegisterImpl = async () => ({
      userDid:
        'did:phoenix:aaaaaaahomxng:07002c1ff14a746a996709f8b8d35b9ac24cb7fd06cdc3cfe614e1d27a76bc58',
      txHash: 'tx-mock',
    });
    const { registerIdentity } = require('./phoenixKeyAuthService');

    const res = await registerIdentity('strong', 'new-person', 'nguoi-moi');

    expect(res.txHash).toBe('tx-mock');
    expect(mockWipeCalls).toHaveLength(0);
  });
});

export {};
