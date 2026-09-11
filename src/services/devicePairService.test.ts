/**
 * Luồng GHÉP MÁY — phần dịch vụ (issue #233).
 *
 * Ba thứ ở đây hỏng IM LẶNG nếu không có bài canh:
 *
 *   1. **Khuôn chuỗi QR.** Hai bên dựng và đọc ở hai máy khác nhau, thường là hai
 *      bản app khác nhau. Lệch một ký tự thì máy quét coi như "QR lạ" và cứ quét
 *      tiếp — không lỗi, không màn đỏ, chỉ là một cái khung không bao giờ bắt được.
 *   2. **`thisDevicePublicKey` gọi `enrollKeypair` khi máy ĐÃ có khoá.**
 *      `enrollKeypair` XOÁ khoá cũ trong chip và khoá đó không có bản sao. Đây là
 *      ca mất-danh-tính, và trên máy dev nó không bao giờ lộ ra vì máy dev hay ở
 *      trạng thái chưa có khoá.
 *   3. **404 bị dịch nhầm.** "Máy kia chưa duyệt xong" là chuyện bình thường của
 *      một luồng hai máy; gộp nó vào lỗi chung là bắt người dùng quét lại từ đầu
 *      vì họ bấm sớm một nhịp.
 */

const mockIsEnrolled = jest.fn();
const mockEnroll = jest.fn();
const mockOwnerPub = jest.fn();
const mockSaveDid = jest.fn();
jest.mock('../sdk/phoenixKey', () => ({
  isKeypairEnrolled: (...a: unknown[]) => mockIsEnrolled(...a),
  enrollKeypair: (...a: unknown[]) => mockEnroll(...a),
  ownerPublicKey: (...a: unknown[]) => mockOwnerPub(...a),
  saveUserDid: (...a: unknown[]) => mockSaveDid(...a),
}));

const mockLookup = jest.fn();
jest.mock('./phoenixKeyAuthService', () => ({
  lookupDidByDeviceKey: (...a: unknown[]) => mockLookup(...a),
}));

import {
  buildPairPayload,
  claimAuthorizedIdentity,
  NotAuthorizedYetError,
  PAIR_QR_PREFIX,
  parsePairPayload,
  thisDevicePublicKey,
} from './devicePairService';
import { PhoenixKeyApiError } from './phoenixKey-api';

const PUB = '04' + 'cd'.repeat(64);
const DID = 'did:phoenix:aaaaaaahl4nn6:ccd1feb6';

beforeEach(() => { jest.clearAllMocks(); });

describe('khuôn chuỗi QR — dựng và đọc phải khớp nhau', () => {
  it('đọc lại được đúng khoá vừa dựng', () => {
    expect(parsePairPayload(buildPairPayload(PUB))).toBe(PUB.toLowerCase());
  });

  it('chuỗi mang đúng tiền tố miền', () => {
    expect(buildPairPayload(PUB).startsWith(PAIR_QR_PREFIX)).toBe(true);
  });

  it('KHÔNG đụng khuôn của QR đăng nhập web — hai màn quét đứng cạnh nhau', () => {
    // QR đăng nhập web là base64url của một JSON. Dấu `:` không nằm trong bảng
    // chữ base64url, nên bộ giải bên kia trả `null` ngay khi gặp chuỗi này. Ca
    // này ghim đúng tính chất đó: còn dấu `:` thì hai khuôn còn phân biệt được.
    expect(buildPairPayload(PUB)).toContain(':');
  });

  const xau: Array<[string, string]> = [
    ['chuỗi rỗng', ''],
    ['QR của việc khác', 'https://example.org/abc'],
    ['đúng tiền tố nhưng khoá rỗng', PAIR_QR_PREFIX],
    ['đúng tiền tố nhưng không phải hex', `${PAIR_QR_PREFIX}xin-chao-day-la-mot-chuoi-dai-khong-phai-hex-dung-de-thu`],
    ['hex quá ngắn', `${PAIR_QR_PREFIX}04abcd`],
  ];
  it.each(xau)('%s → null, không đoán tiếp', (_ten, raw) => {
    expect(parsePairPayload(raw)).toBeNull();
  });

  it('chấp nhận hex CHỮ HOA và trả về chữ thường', () => {
    // Cực đối của các ca `null` ở trên: một bộ đọc từ chối mọi thứ cũng qua được
    // chúng. Máy quét ở đầu kia có thể trả hex viết hoa.
    expect(parsePairPayload(`${PAIR_QR_PREFIX}${PUB.toUpperCase()}`)).toBe(PUB.toLowerCase());
  });
});

describe('thisDevicePublicKey — KHÔNG được phá khoá đang có', () => {
  it('máy ĐÃ có khoá ⟹ đọc khoá đó, KHÔNG sinh mới', async () => {
    mockIsEnrolled.mockResolvedValue(true);
    mockOwnerPub.mockResolvedValue(PUB.toUpperCase());

    await expect(thisDevicePublicKey()).resolves.toBe(PUB.toLowerCase());
    // Dòng dưới là toàn bộ nội dung của bài này: gọi `enrollKeypair` ở đây là
    // xoá khoá chủ của một máy đang đăng nhập.
    expect(mockEnroll).not.toHaveBeenCalled();
  });

  it('máy CHƯA có khoá ⟹ sinh mới — cực đối của ca trên', async () => {
    mockIsEnrolled.mockResolvedValue(false);
    mockEnroll.mockResolvedValue({ alias: 'a', publicKeyHex: PUB.toUpperCase() });

    await expect(thisDevicePublicKey()).resolves.toBe(PUB.toLowerCase());
    expect(mockEnroll).toHaveBeenCalledTimes(1);
    expect(mockOwnerPub).not.toHaveBeenCalled();
  });
});

describe('claimAuthorizedIdentity — "chưa duyệt" KHÁC "hỏng"', () => {
  it('tra được DID ⟹ lưu lại và trả về', async () => {
    mockLookup.mockResolvedValue(DID);
    await expect(claimAuthorizedIdentity()).resolves.toBe(DID);
    expect(mockSaveDid).toHaveBeenCalledWith(DID);
  });

  it('404 ⟹ NotAuthorizedYetError, và KHÔNG lưu gì', async () => {
    mockLookup.mockRejectedValue(new PhoenixKeyApiError(2001, 404, 'not found'));
    await expect(claimAuthorizedIdentity()).rejects.toBeInstanceOf(NotAuthorizedYetError);
    expect(mockSaveDid).not.toHaveBeenCalled();
  });

  it('mất sóng ⟹ ném NGUYÊN lỗi, KHÔNG đội lốt "chưa duyệt"', async () => {
    // Cực đối của ca 404. Gộp hai ca thì người mất sóng được bảo đi giục máy kia
    // duyệt — một việc đã xong rồi.
    const mang = new PhoenixKeyApiError(-1, 0, 'network down');
    mockLookup.mockRejectedValue(mang);
    await expect(claimAuthorizedIdentity()).rejects.toBe(mang);
    expect(mockSaveDid).not.toHaveBeenCalled();
  });

  it('người dùng huỷ sinh trắc ⟹ cũng ném nguyên, không nuốt', async () => {
    const huy = Object.assign(new Error('user canceled'), { code: 'E_USER_CANCELED' });
    mockLookup.mockRejectedValue(huy);
    await expect(claimAuthorizedIdentity()).rejects.toBe(huy);
  });
});
