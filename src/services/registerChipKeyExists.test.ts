/**
 * Chip TỪ CHỐI ghi đè khoá cũ (`E_KEY_EXISTS`) — mã đó phải thành một CÂU.
 *
 * ── Ca hỏng bộ kiểm này sinh ra để chặn ───────────────────────────────────────
 * `services/phoenixKey-native.ts` khai hằng `PhoenixKeyNativeError.KEY_EXISTS`
 * kèm chú thích "switch on these in UI". Tới 2026-09-17, grep cả kho ra ĐÚNG 0
 * chỗ bắt mã ấy — cả hai cầu native từ chối sinh khoá đè
 * (`android/app/src/main/java/com/aladincontract/company/PhoenixKeyModule.kt`
 * nhánh `keyStore.containsAlias`, `ios/LocalPods/ScannerModule/UI/PhoenixKeyModule.swift`
 * nhánh `hasKeySync`) và người dùng nhận đúng chuỗi `E_KEY_EXISTS` lên màn hình.
 *
 * Đường đi tới đó có thật: con trỏ nhãn khoá chỉ nằm ở AsyncStorage
 * (`sdk/phoenixKey.ts` ▸ `getOwnerAlias`), nên mất AsyncStorage là `isKeypairEnrolled()`
 * đọc ra `false` cho một máy vẫn còn khoá dưới nhãn mặc định. App đo ra "máy trống
 * trơn", mời người dùng tạo mới, rồi chip từ chối ở bước sinh khoá.
 *
 * ── Đo CÁI GÌ ────────────────────────────────────────────────────────────────
 *  · `reason` gắn trên lỗi — màn hình phân nhánh theo nó, KHÔNG dò chuỗi tiếng Việt
 *    (dò chuỗi vỡ ngay khi đổi câu hoặc đổi ngôn ngữ);
 *  · lượt đăng ký KHÔNG được đi ra máy chủ;
 *  · khoá cũ KHÔNG bị xoá. Chốt này đắt nhất: khoá đó có thể là khoá owner của một
 *    danh tính đang sống, và `wipeIdentity` với khoá trong chip là bất khả hồi.
 *
 * ── KHÔNG đo cái gì ──────────────────────────────────────────────────────────
 * Không đo hộp thoại ở `SignUpBiometricScreen.tsx` — chốt đó có bộ kiểm riêng
 * (`SignUpBiometricScreen.chipKeyExists.test.tsx`).
 */

const mockWipeCalls: number[] = [];
const mockRegisterCalls: number[] = [];

/** Máy còn khoá dưới nhãn app đang dùng ⟹ cầu native từ chối sinh đè. */
let mockEnrollImpl: () => Promise<{ alias: string; publicKeyHex: string }> = async () => ({
  alias: 'owner',
  publicKeyHex: '04' + 'aa'.repeat(64),
});

jest.mock('../sdk/phoenixKey', () => ({
  __esModule: true,
  default: {},
  KEY_ALIAS_OWNER: 'owner',
  STORAGE_USER_DID: 'user_did',
  currentUserDid: jest.fn(async () => null),
  enrollKeypair: jest.fn(async () => mockEnrollImpl()),
  // `false` = đúng ca đang đo: phép đo nói máy trống, chip nói ngược lại.
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
        register: jest.fn(async () => {
          mockRegisterCalls.push(1);
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
    isAvailable: () => true,
    deriveTaadPubkey: jest.fn(async () => 'ab'.repeat(32)),
    deriveWalletAddress: jest.fn(async () => 'addr_test1qmock'),
  },
}));

jest.mock('./masterKekStore', () => ({
  __esModule: true,
  getOrCreateMasterKek: jest.fn(async () => 'cd'.repeat(32)),
}));

/** Lỗi đúng hình dạng cầu native dựng khi nhãn đã có khoá. */
const keyExistsError = () =>
  Object.assign(new Error("Keypair with alias 'phoenixkey_owner_v1' already exists"), {
    code: 'E_KEY_EXISTS',
  });

beforeEach(() => {
  mockWipeCalls.length = 0;
  mockRegisterCalls.length = 0;
  mockEnrollImpl = async () => ({ alias: 'owner', publicKeyHex: '04' + 'aa'.repeat(64) });
});

describe('`E_KEY_EXISTS` lúc đăng ký — chặn đúng, và NÓI được việc phải làm', () => {
  it('chip từ chối ⟹ `reason` riêng, KHÔNG gọi máy chủ, KHÔNG xoá khoá cũ', async () => {
    mockEnrollImpl = async () => {
      throw keyExistsError();
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'nguoi-moi').catch((e: any) => e);

    expect(err.reason).toBe('chip_key_exists');
    expect(mockRegisterCalls).toHaveLength(0);
    // Khoá cũ có thể đang là khoá owner của một danh tính sống. Xoá nó để "đi tiếp"
    // là bất khả hồi, và không có gì trên màn hình nói cho người dùng biết.
    expect(mockWipeCalls).toHaveLength(0);
  });

  it('câu hiện ra nói đủ BA vế, và không mời thử lại suông', async () => {
    mockEnrollImpl = async () => {
      throw keyExistsError();
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    // Vế 1 — trở ngại là KHOÁ trong máy, không phải sóng hay vân tay. Hai thứ đó là
    // thứ duy nhất người dùng ngoài vườn biết tự sửa; không loại trừ thì họ đi kiểm
    // sóng và quẹt lại vân tay hàng chục lần cho một việc không liên quan.
    expect(err.message).toMatch(/không phải lỗi sóng/i);
    // Vế 2 — thử lại KHÔNG khác.
    expect(err.message).toMatch(/đúng kết quả này|sẽ không khác/i);
    // Vế 3 — lối ra là màn Khôi phục, và nói rõ nó KHÔNG đòi 24 từ. Đúng nhóm kẹt ở
    // đây là nhóm không có 24 từ: `SeedExportScreen` tự nguyện và nằm SAU đăng nhập.
    expect(err.message).toMatch(/Khôi phục danh tính/);
    expect(err.message).toMatch(/không cần 24 từ/i);
    // Và KHÔNG được mang chuỗi mã native lên màn hình.
    expect(err.message).not.toMatch(/E_KEY_EXISTS/);
  });

  it('ĐỐI CHỨNG — chip KHÔNG từ chối thì lượt đăng ký vẫn đi ra máy chủ', async () => {
    // Thiếu ca này, hai bài trên xanh y hệt khi ai đó chặn cứng mọi lượt đăng ký.
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const res = await registerIdentity('strong', 'new-person', 'nguoi-moi');

    expect(res.txHash).toBe('tx-mock');
    expect(mockRegisterCalls).toHaveLength(1);
  });

  it('lỗi native KHÁC ⟹ KHÔNG mượn câu này, để nhánh chung nói', async () => {
    // Cực đối của bài đầu. Không có nó thì một phép bắt `catch` quét-tất-cả cũng
    // xanh, và mọi lỗi sinh khoá đều được kể thành "máy còn khoá cũ" — một câu
    // chuyện bịa, đúng họ lỗi mà `chonLyDoKhoiPhuc` được viết ra để tránh.
    mockEnrollImpl = async () => {
      throw Object.assign(new Error('chip hỏng'), { code: 'E_KEYGEN_FAILED' });
    };
    const { registerIdentity } = require('./phoenixKeyAuthService');
    const err = await registerIdentity('strong', 'new-person', 'x').catch((e: any) => e);

    expect(err.reason).not.toBe('chip_key_exists');
    expect(err.message).not.toMatch(/Khôi phục danh tính/);
    expect(mockRegisterCalls).toHaveLength(0);
  });
});

describe('`classifyDeviceKeyLookupFailure` — ba ca, ba lối đi', () => {
  /**
   * Vì sao ba ca này KHÔNG gộp được: việc người dùng phải làm tiếp trái ngược nhau.
   * Huỷ hộp sinh trắc thì làm lại là xong · mất sóng thì đợi sóng · khoá chưa thuộc
   * danh tính nào thì bấm mãi cũng thế, phải đổi sang 24 từ. Một câu chung cho cả ba
   * là đẩy hai nhóm đi sai đường, và đẩy nhóm thứ ba vào vòng bấm lại vô tận.
   */
  const apiError = (httpStatus: number) => {
    const { PhoenixKeyApiError } = require('./phoenixKey-api');
    return new PhoenixKeyApiError(0, httpStatus, 'lỗi giả');
  };

  it('người dùng huỷ hộp sinh trắc ⟹ `biometric_not_done`', () => {
    const { classifyDeviceKeyLookupFailure } = require('./phoenixKeyAuthService');
    expect(
      classifyDeviceKeyLookupFailure(
        Object.assign(new Error('user cancelled'), { code: 'E_USER_CANCELED' }),
      ),
    ).toBe('biometric_not_done');
  });

  it('404 ⟹ `key_not_linked` — KHÔNG dịch thành một nguyên nhân cụ thể', () => {
    // Máy chủ CỐ Ý gộp ba ca vào cùng một 404 (chữ ký sai · chưa đăng ký · đã thu
    // hồi). Câu đưa ra vì thế chỉ nói đúng thứ đo được.
    const { classifyDeviceKeyLookupFailure } = require('./phoenixKeyAuthService');
    expect(classifyDeviceKeyLookupFailure(apiError(404))).toBe('key_not_linked');
  });

  it('lời gọi không tới được máy chủ ⟹ `network_down`, không phải 404', () => {
    const { classifyDeviceKeyLookupFailure } = require('./phoenixKeyAuthService');
    expect(classifyDeviceKeyLookupFailure(apiError(0))).toBe('network_down');
    expect(classifyDeviceKeyLookupFailure(new Error('Network Error'))).toBe('network_down');
  });

  it('lỗi không nhận ra ⟹ `unknown`, không đội lốt một ca đã biết', () => {
    const { classifyDeviceKeyLookupFailure } = require('./phoenixKeyAuthService');
    expect(classifyDeviceKeyLookupFailure(apiError(500))).toBe('unknown');
  });

  it('BỐN câu KHÁC NHAU — gộp hai ca là bài này đỏ', () => {
    const { DEVICE_KEY_LOOKUP_MESSAGE } = require('./phoenixKeyAuthService');
    const cau = Object.values(DEVICE_KEY_LOOKUP_MESSAGE) as string[];
    expect(new Set(cau).size).toBe(cau.length);
    // Và mỗi câu phải nói được BƯỚC TIẾP THEO, không phải chỉ mô tả cái hỏng.
    expect(DEVICE_KEY_LOOKUP_MESSAGE.key_not_linked).toMatch(/24 từ/);
    expect(DEVICE_KEY_LOOKUP_MESSAGE.network_down).toMatch(/sóng/);
    expect(DEVICE_KEY_LOOKUP_MESSAGE.biometric_not_done).toMatch(/vân tay|khuôn mặt/);
  });
});

export {};
