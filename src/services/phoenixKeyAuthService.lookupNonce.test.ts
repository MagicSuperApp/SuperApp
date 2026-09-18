/**
 * Cổng cho chuỗi dùng-một-lần của cửa tra DID (`lookupDidByDeviceKey`).
 *
 * Vì sao có tệp này: một người dùng thực địa kẹt ở đúng cửa này, và bản 69 — bản đầu tiên
 * mang dòng mã tham chiếu ra màn hình — trả về nguyên văn
 *     `Mã tham chiếu: HTTP 409 · mã 3006 · Nonce already used`
 * tức chuỗi app sinh ra đã được tiêu trước đó cho cùng khoá công khai. Bản trước ghép nó
 * từ bốn lượt `Math.random`; tám nơi khác trong kho đã dùng CSPRNG bên Rust.
 *
 * Bốn chốt dưới đây, mỗi chốt hỏng theo một kiểu KHÁC NHAU và không kiểu nào tự kêu:
 *
 *   1. **Nguồn ngẫu nhiên.** Quay về `Math.random` thì bộ kiểm vẫn xanh ở mọi bài khác,
 *      vì hình dạng chuỗi không đổi — 32 ký tự hex ở cả hai đường.
 *   2. **Thiếu `await`.** `generateSalt()` trả Promise. Quên `await` thì thân yêu cầu mang
 *      một Promise và chuỗi được ký mang `[object Promise]`; máy chủ trả 404 và
 *      `phoenixKeyAuthService.ts:515` đã ghi rõ 404 ở đây KHÔNG nói vì sao. Chốt 4 canh nó.
 *   3. **Chuỗi gửi lệch chuỗi đã ký.** Hai chỗ đọc cùng một biến hôm nay; tách ra là 404 im.
 *   4. **Lấy một lần rồi dùng lại.** Nâng nonce lên hằng mô-đun cho "gọn" là dựng lại đúng
 *      cái hỏng đã đo, chỉ bằng một đường khác.
 */

const mockGenerateSalt = jest.fn();
jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    generateSalt: (...a: unknown[]) => mockGenerateSalt(...a),
    isAvailable: () => true,
  },
  isCoreUnavailableError: () => false,
}));

const mockOwnerPublicKey = jest.fn();
const mockSignRaw = jest.fn();
jest.mock('../sdk/phoenixKey', () => ({
  __esModule: true,
  default: {},
  KEY_ALIAS_OWNER: 'phoenixkey.owner',
  STORAGE_USER_DID: 'user_did',
  currentUserDid: jest.fn(),
  enrollKeypair: jest.fn(),
  isKeypairEnrolled: jest.fn(),
  ownerPublicKey: (...a: unknown[]) => mockOwnerPublicKey(...a),
  saveUserDid: jest.fn(),
  signRaw: (...a: unknown[]) => mockSignRaw(...a),
  wipeIdentity: jest.fn(),
}));

const mockLookupByKey = jest.fn();
jest.mock('./phoenixKey-api', () => {
  const actual = jest.requireActual('./phoenixKey-api');
  return {
    ...actual,
    phoenixKeyApi: {
      ...actual.phoenixKeyApi,
      identity: {
        ...actual.phoenixKeyApi.identity,
        lookupByKey: (body: unknown) => mockLookupByKey(body),
      },
    },
  };
});

import { LOOKUP_PREFIX, lookupDidByDeviceKey } from './phoenixKeyAuthService';

const PUB = '04' + 'cd'.repeat(64);
const DID = 'did:phoenix:aaaaaaahl4nn6:ccd1feb6';

/** Khuôn máy chủ ép, nguyên văn `IdentityLookupDtos.java`. */
const SERVER_NONCE_SHAPE = /^[0-9a-f]{16,128}$/;

/** Hai chuỗi CSPRNG khác nhau, đúng hình dạng `generate_salt` sinh ra (16 byte hex). */
const SALT_1 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SALT_2 = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

/**
 * Chính thuật toán của bản đã hỏng, giữ lại ở đây làm CỰC ĐỐI.
 *
 * Không có nó thì các ca dưới chỉ chứng minh "nonce là một chuỗi hex 32 ký tự" — điều mà
 * bản hỏng cũng thoả. Có nó thì đầu vào phân biệt được hai bên đột biến: cùng một
 * `Math.random` bị ghim, hai đường cho hai chuỗi khác nhau.
 */
const nonceKieuMathRandomCu = (): string => {
  let out = '';
  while (out.length < 32) {
    out += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  }
  return out.slice(0, 32);
};

/** Thân yêu cầu đã gửi lên máy chủ ở lượt gọi thứ `i`. */
const bodyDaGui = (i = 0) => mockLookupByKey.mock.calls[i][0] as {
  publicKeyHex: string;
  nonce: string;
  signatureHex: string;
};

/** Chuỗi đã đưa cho chip ký, giải từ hex về lại UTF-8, ở lượt gọi thứ `i`. */
const chuoiDaKy = (i = 0): string =>
  Buffer.from(String(mockSignRaw.mock.calls[i][0]), 'hex').toString('utf8');

let randomSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  jest.clearAllMocks();
  mockOwnerPublicKey.mockResolvedValue(PUB);
  mockSignRaw.mockResolvedValue('ff'.repeat(32));
  mockLookupByKey.mockResolvedValue({ userDid: DID });
  mockGenerateSalt.mockResolvedValue(SALT_1);
  // Ghim `Math.random` vào MỘT giá trị: đường cũ trở thành tất định, nên ca nào còn đi qua
  // nó sẽ lộ ra bằng một chuỗi đoán trước được, chứ không lẫn vào đám ngẫu nhiên.
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('nguồn của chuỗi dùng-một-lần', () => {
  it('nonce gửi lên là chuỗi CSPRNG bên Rust', async () => {
    await lookupDidByDeviceKey('Xác thực', 'Tìm lại danh tính');

    expect(mockGenerateSalt).toHaveBeenCalledTimes(1);
    expect(bodyDaGui().nonce).toBe(SALT_1);
  });

  it('KHÔNG đi qua `Math.random` một lượt nào', async () => {
    await lookupDidByDeviceKey('Xác thực', 'Tìm lại danh tính');

    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('nonce KHÁC hẳn chuỗi thuật toán cũ sinh ra từ cùng `Math.random` đã ghim', async () => {
    // Cực đối. `Math.random` trả hằng ⇒ đường cũ cho ra đúng một chuỗi, tính được ngay đây.
    const chuoiDuongCu = nonceKieuMathRandomCu();
    randomSpy.mockClear();

    await lookupDidByDeviceKey('Xác thực', 'Tìm lại danh tính');

    expect(chuoiDuongCu).toMatch(SERVER_NONCE_SHAPE); // đường cũ ĐÚNG hình dạng — nên hình
    expect(bodyDaGui().nonce).toMatch(SERVER_NONCE_SHAPE); // dạng không phân biệt được hai bên
    expect(bodyDaGui().nonce).not.toBe(chuoiDuongCu); // nguồn thì phân biệt được
  });

  it('mỗi lượt gọi lấy một chuỗi MỚI, không dùng lại chuỗi lượt trước', async () => {
    mockGenerateSalt.mockResolvedValueOnce(SALT_1).mockResolvedValueOnce(SALT_2);

    await lookupDidByDeviceKey('Xác thực', 'Tìm lại danh tính');
    await lookupDidByDeviceKey('Xác thực', 'Tìm lại danh tính');

    expect(mockGenerateSalt).toHaveBeenCalledTimes(2);
    expect(bodyDaGui(0).nonce).toBe(SALT_1);
    expect(bodyDaGui(1).nonce).toBe(SALT_2);
  });
});

describe('chuỗi đã ký và thân yêu cầu phải nói cùng một nonce', () => {
  it('chuỗi ký đúng khuôn miền, mang đúng nonce đã gửi', async () => {
    await lookupDidByDeviceKey('Xác thực', 'Tìm lại danh tính');

    expect(chuoiDaKy()).toBe(`${LOOKUP_PREFIX}${PUB}:${SALT_1}`);
    expect(chuoiDaKy()).toContain(bodyDaGui().nonce);
  });

  it('nonce đã GIẢI ra giá trị, không phải một Promise', async () => {
    // Ca này canh đúng chỗ dễ hỏng nhất khi `generateSalt` là hàm bất đồng bộ: quên `await`
    // vẫn biên dịch được, vẫn gửi đi được, và máy chủ trả 404 chứ không nói "sai kiểu".
    await lookupDidByDeviceKey('Xác thực', 'Tìm lại danh tính');

    expect(typeof bodyDaGui().nonce).toBe('string');
    expect(bodyDaGui().nonce).toMatch(SERVER_NONCE_SHAPE);
    expect(chuoiDaKy()).not.toContain('[object Promise]');
  });
});
