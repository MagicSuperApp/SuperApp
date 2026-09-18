/**
 * Cổng cho lượt thử LẠI khi máy chủ báo chuỗi kiểm tra đã dùng (409 · 3006).
 *
 * Vì sao có tệp này: bản 70 mang bản vá CSPRNG của `#399`, và ngoài thực địa VẪN có hai
 * người kẹt ở đúng cửa `lookupDidByDeviceKey` với nguyên văn
 *     `Mã tham chiếu: HTTP 409 · mã 3006 · Nonce already used`
 * Bấm lại bao nhiêu lần cũng ra đúng thế ⇒ với họ cả màn khôi phục là một ngõ cụt.
 *
 * Bốn nguyên nhân phía app đã bị LOẠI bằng phép đo (ghi đủ ở `phoenixKeyAuthService.ts`,
 * khối chú thích của `lookupDidByDeviceKey`), nên bản vá cố ý KHÔNG dựa vào việc chọn
 * đúng cơ chế: nó gửi một chuỗi MỚI thêm một lần.
 *
 * ⚠ Chốt dễ trượt nhất ở đây KHÔNG phải "có thử lại không" — mà là **thử lại ĐÚNG MỘT
 * LẦN, và chỉ cho ĐÚNG mã 409**. Một vòng lặp, hay một phép thử lại bắt mọi lỗi, biến
 * cửa này thành đúng cái "vỏ im lặng" mà kho này cấm: người dùng thấy máy quay mãi và
 * không bao giờ đọc được số đo thật. Nên bộ ca này đi thành CẶP ở cả hai chiều.
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

import { PhoenixKeyApiError } from './phoenixKey-api';
import {
  classifyDeviceKeyLookupFailure,
  DEVICE_KEY_LANE_SHOWS_REFERENCE,
  DEVICE_KEY_LOOKUP_MESSAGE,
  lookupDidByDeviceKey,
  type DeviceKeyLookupFailure,
} from './phoenixKeyAuthService';

const PUB = '04' + 'cd'.repeat(64);
const DID = 'did:phoenix:aaaaaaahl4nn6:ccd1feb6';
const SALT_1 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SALT_2 = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

/** Lỗi máy chủ đúng hình dạng cửa này trả về (`PhoenixKeyApiError(code, httpStatus, message)`). */
const loiMayChu = (httpStatus: number, code: number, message: string) =>
  new PhoenixKeyApiError(code, httpStatus, message);

const nonceDaGui = (i: number): string =>
  (mockLookupByKey.mock.calls[i][0] as { nonce: string }).nonce;

beforeEach(() => {
  jest.clearAllMocks();
  mockOwnerPublicKey.mockResolvedValue(PUB);
  mockSignRaw.mockResolvedValue('ff'.repeat(32));
  // Hai chuỗi KHÁC NHAU theo thứ tự: nếu bản vá dùng lại chuỗi cũ thay vì xin chuỗi mới
  // thì hai lượt gửi sẽ mang cùng một giá trị, và ca 1 đỏ.
  mockGenerateSalt.mockResolvedValueOnce(SALT_1).mockResolvedValueOnce(SALT_2);
});

describe('409 nonce đã dùng — thử lại đúng một lần với chuỗi MỚI', () => {
  it('409 rồi thành công: gửi HAI lượt, và chuỗi lượt hai KHÁC lượt một', async () => {
    mockLookupByKey
      .mockRejectedValueOnce(loiMayChu(409, 3006, 'Nonce already used'))
      .mockResolvedValueOnce({ userDid: DID });

    await expect(lookupDidByDeviceKey('Tiêu đề', 'Phụ đề')).resolves.toBe(DID);

    expect(mockLookupByKey).toHaveBeenCalledTimes(2);
    expect(nonceDaGui(0)).toBe(SALT_1);
    expect(nonceDaGui(1)).toBe(SALT_2);
    expect(nonceDaGui(1)).not.toBe(nonceDaGui(0));
  });

  it('chuỗi mới phải được KÝ LẠI — chữ ký cũ không dùng lại được vì nonce nằm trong chuỗi ký', async () => {
    mockLookupByKey
      .mockRejectedValueOnce(loiMayChu(409, 3006, 'Nonce already used'))
      .mockResolvedValueOnce({ userDid: DID });

    await lookupDidByDeviceKey('Tiêu đề', 'Phụ đề');

    expect(mockSignRaw).toHaveBeenCalledTimes(2);
    const ky1 = Buffer.from(String(mockSignRaw.mock.calls[0][0]), 'hex').toString('utf8');
    const ky2 = Buffer.from(String(mockSignRaw.mock.calls[1][0]), 'hex').toString('utf8');
    expect(ky1).toContain(SALT_1);
    expect(ky2).toContain(SALT_2);
    expect(ky2).not.toBe(ky1);
  });

  it('CỰC ĐỐI — thành công ngay lượt đầu thì KHÔNG hỏi sinh trắc lần hai', async () => {
    mockLookupByKey.mockResolvedValueOnce({ userDid: DID });

    await expect(lookupDidByDeviceKey('Tiêu đề', 'Phụ đề')).resolves.toBe(DID);

    expect(mockLookupByKey).toHaveBeenCalledTimes(1);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
  });

  it('409 HAI lượt: dừng ở hai, KHÔNG có lượt ba, và lỗi ném ra còn nguyên mã', async () => {
    mockGenerateSalt.mockResolvedValue('bb'.repeat(16)); // mọi lượt sau đều có chuỗi
    mockLookupByKey.mockRejectedValue(loiMayChu(409, 3006, 'Nonce already used'));

    await expect(lookupDidByDeviceKey('Tiêu đề', 'Phụ đề')).rejects.toMatchObject({
      httpStatus: 409,
    });
    expect(mockLookupByKey).toHaveBeenCalledTimes(2);
  });

  it('CỰC ĐỐI — 404 thì KHÔNG thử lại: phép thử lại gắn vào mã 409, không gắn vào "lỗi bất kỳ"', async () => {
    mockLookupByKey.mockRejectedValue(loiMayChu(404, 2002, 'User with this DID not found'));

    await expect(lookupDidByDeviceKey('Tiêu đề', 'Phụ đề')).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(mockLookupByKey).toHaveBeenCalledTimes(1);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
  });

  it('CỰC ĐỐI — lỗi chip (không phải lỗi máy chủ) cũng KHÔNG thử lại', async () => {
    mockSignRaw.mockRejectedValue(Object.assign(new Error('chip'), { code: 'E_KEY_INVALIDATED' }));

    await expect(lookupDidByDeviceKey('Tiêu đề', 'Phụ đề')).rejects.toThrow();
    expect(mockLookupByKey).not.toHaveBeenCalled();
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
  });
});

describe('câu nói với người dùng — 409 thôi rơi vào làn "chưa rõ vì sao"', () => {
  it('409 phân loại thành `nonce_conflict`, KHÔNG phải `unknown`', () => {
    expect(classifyDeviceKeyLookupFailure(loiMayChu(409, 3006, 'Nonce already used'))).toBe(
      'nonce_conflict',
    );
  });

  it('CỰC ĐỐI — 404 vẫn là `key_not_linked`, làn cũ không bị bản vá kéo theo', () => {
    expect(classifyDeviceKeyLookupFailure(loiMayChu(404, 2002, 'not found'))).toBe(
      'key_not_linked',
    );
  });

  it('câu của làn mới KHÔNG mời người dùng thử lại — máy đã thử giúp rồi', () => {
    const cau = DEVICE_KEY_LOOKUP_MESSAGE.nonce_conflict;
    expect(cau).not.toMatch(/Thử lại một lần/);
    // và nó phải nói ra được hai điều người dùng cần: không mất gì, và lối 24 từ.
    expect(cau).toMatch(/không mất gì|còn nguyên/i);
    expect(cau).toMatch(/24 từ/);
  });

  /**
   * Ca này KHÔNG neo vào danh sách làn, nó neo vào chính CÂU CHỮ — nên nó còn đúng với
   * làn chưa ai viết. Một câu hứa *"gồm cả dòng mã bên dưới"* mà làn đó không bật số đo
   * thì màn hình chỉ vào một dòng không tồn tại: người dùng làm đúng y lời, gửi về một
   * bức ảnh không tra được gì, và cả hai phía tin là đã đo.
   */
  it('mọi làn HỨA "dòng mã bên dưới" đều phải bật số đo — và ngược lại', () => {
    const lanes = Object.keys(DEVICE_KEY_LOOKUP_MESSAGE) as DeviceKeyLookupFailure[];
    expect(lanes.length).toBeGreaterThanOrEqual(6); // tập không rỗng thì phép so mới nói gì

    const hua = lanes.filter(l => /dòng mã bên dưới/.test(DEVICE_KEY_LOOKUP_MESSAGE[l])).sort();
    const bat = lanes.filter(l => DEVICE_KEY_LANE_SHOWS_REFERENCE[l]).sort();

    // `unknown` bật số đo mà câu của nó không dùng đúng cụm trên — nên so theo chiều
    // BẮT BUỘC: hứa ⟹ bật. Chiều kia lỏng hơn có chủ ý, và ca dưới ghim phần chặt.
    expect(bat).toEqual(expect.arrayContaining(hua));
    expect(hua).toContain('nonce_conflict');
    expect(hua).toContain('key_unusable');

    // CỰC ĐỐI — làn KHÔNG mời gửi ảnh thì KHÔNG được bật, nếu không dòng mã hiện ở chỗ
    // người dùng chẳng cần, và nó dạy người đọc lướt qua đúng dòng sau này cần đọc.
    expect(DEVICE_KEY_LANE_SHOWS_REFERENCE.network_down).toBe(false);
    expect(DEVICE_KEY_LANE_SHOWS_REFERENCE.biometric_not_done).toBe(false);
    expect(DEVICE_KEY_LANE_SHOWS_REFERENCE.key_not_linked).toBe(false);
  });
});
