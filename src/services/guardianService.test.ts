/**
 * GUARDIAN — khoá lại đúng hai chỗ đã làm chữ ký hỏng từ V30.
 *
 * Bản trước tệp nguồn tự khai: chữ ký "gần chắc không còn verify được", vì máy chủ
 * đổi sang đóng khung theo độ dài VÀ thêm field thứ tư `opSeq`, còn app thì thiếu
 * cả đường đọc mốc. Nay sửa được, và tệp này giữ cho nó đừng trôi lại.
 *
 * Điều đáng nói về mức chắc: cả bản sửa lẫn tệp kiểm này đều dựng theo MÃ NGUỒN
 * máy chủ, không theo một lượt chạy thật. Nên chúng chứng minh "app dựng đúng thứ
 * đã đọc", KHÔNG chứng minh "máy chủ nhận". Lượt chạy thật đầu tiên vẫn là phép đo
 * cuối cùng, và nếu nó đỏ thì chỗ sai nằm ở lời đọc hợp đồng, không ở đây.
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
const mockAdd = jest.fn();
const mockRemove = jest.fn();
jest.mock('./phoenixKey-api', () => ({
  phoenixKeyApi: {
    identity: { opSeq: (...a: unknown[]) => mockOpSeq(...a) },
    guardians: {
      add: (...a: unknown[]) => mockAdd(...a),
      remove: (...a: unknown[]) => mockRemove(...a),
    },
  },
}));

import { buildCanonicalHex } from './canonicalMessage';
import {
  addGuardian, removeGuardian, buildGuardianMessageHex,
  CHALLENGE_ADD, CHALLENGE_REMOVE,
} from './guardianService';

const DID = 'did:phoenix:aaaaaaahl4nn6:ccd1feb6';
const GDID = 'did:phoenix:bbbbbbbhl4nn6:99aa0011';

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUserDid.mockResolvedValue(DID);
  mockGenerateSalt.mockResolvedValue('cafe01');
  mockOpSeq.mockResolvedValue({ lastOpSeq: 4, nextOpSeq: 5, maxOpSeq: 104 });
  mockSignRaw.mockResolvedValue('DEADBEEF');
  mockAdd.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue(undefined);
});

describe('tiền tố mang sẵn dấu hai chấm', () => {
  it('khớp hằng máy chủ, không phải bản thiếu dấu như trước', () => {
    // Bản cũ dùng `'PHOENIXKEY_GUARDIAN_ADD'` rồi tự nối `':'` khi ghép chuỗi.
    // Với `CanonicalMessage.build` thì tiền tố đi vào NGUYÊN dạng byte thô, nên
    // dấu hai chấm phải nằm sẵn trong hằng.
    expect(CHALLENGE_ADD).toBe('PHOENIXKEY_GUARDIAN_ADD:');
    expect(CHALLENGE_REMOVE).toBe('PHOENIXKEY_GUARDIAN_REMOVE:');
  });
});

describe('bốn field, đóng khung theo độ dài — không còn nối bằng dấu hai chấm', () => {
  it('bằng đúng buildCanonicalHex(prefix, userDid, guardianDid, nonce, opSeq)', () => {
    expect(buildGuardianMessageHex(CHALLENGE_ADD, DID, GDID, 'cafe01', 5)).toBe(
      buildCanonicalHex(CHALLENGE_ADD, DID, GDID, 'cafe01', '5'),
    );
  });

  it('KHÔNG còn là chuỗi nối bằng dấu hai chấm', () => {
    // Khuôn cũ: `${prefix}:${userDid}:${guardianDid}:${nonce}` rồi utf8→hex. Bài
    // này đỏ nếu ai đó khôi phục lối cũ.
    const cu = [...`${CHALLENGE_ADD}:${DID}:${GDID}:cafe01`]
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
    expect(buildGuardianMessageHex(CHALLENGE_ADD, DID, GDID, 'cafe01', 5)).not.toBe(cu);
  });

  it('mốc khác nhau ⇒ chuỗi ký khác nhau (field thứ tư thật sự có mặt)', () => {
    expect(buildGuardianMessageHex(CHALLENGE_ADD, DID, GDID, 'cafe01', 5))
      .not.toBe(buildGuardianMessageHex(CHALLENGE_ADD, DID, GDID, 'cafe01', 6));
  });

  it('thêm và bớt ký trên hai miền KHÁC nhau — chữ ký không tái dùng chéo được', () => {
    expect(buildGuardianMessageHex(CHALLENGE_ADD, DID, GDID, 'cafe01', 5))
      .not.toBe(buildGuardianMessageHex(CHALLENGE_REMOVE, DID, GDID, 'cafe01', 5));
  });
});

describe('mốc opSeq đọc SÁT lúc gửi', () => {
  it('addGuardian hỏi mốc mỗi lượt, và gửi đúng mốc vừa nhận', () => {
    return addGuardian(GDID).then(() => {
      expect(mockOpSeq).toHaveBeenCalledWith(DID);
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ userDid: DID, guardianDid: GDID, opSeq: 5 }),
      );
    });
  });

  it('hai lượt liên tiếp đọc lại mốc, KHÔNG dùng lại giá trị cũ', async () => {
    // Ca thật: người dùng thêm hai người bảo hộ liền nhau. Lượt đầu nâng mốc lên,
    // nên lượt hai mà giữ mốc cũ là 409 `OP_SEQ_REPLAY` — một lỗi khó đọc cho việc
    // mà người dùng nghĩ là "thêm người".
    mockOpSeq
      .mockResolvedValueOnce({ lastOpSeq: 4, nextOpSeq: 5, maxOpSeq: 104 })
      .mockResolvedValueOnce({ lastOpSeq: 5, nextOpSeq: 6, maxOpSeq: 105 });
    await addGuardian(GDID);
    await addGuardian('did:phoenix:cccccccc:1234');
    expect(mockOpSeq).toHaveBeenCalledTimes(2);
    expect(mockAdd.mock.calls[0][0].opSeq).toBe(5);
    expect(mockAdd.mock.calls[1][0].opSeq).toBe(6);
  });

  it('mốc gửi đi VÀ mốc trong chuỗi ký là cùng một số', async () => {
    // Hai chỗ này lệch nhau thì máy chủ verify chữ ký trên mốc A rồi nâng mốc B —
    // và chữ ký hỏng câm. Đây là lỗi rất dễ mắc khi ai đó "tối ưu" bằng cách đọc
    // mốc hai lần.
    await addGuardian(GDID);
    const guiDi = mockAdd.mock.calls[0][0].opSeq;
    const daKy = mockSignRaw.mock.calls[0][0];
    expect(daKy).toBe(buildGuardianMessageHex(CHALLENGE_ADD, DID, GDID, 'cafe01', guiDi));
  });

  it('removeGuardian đi cùng đường, cùng luật', async () => {
    await removeGuardian(GDID);
    expect(mockOpSeq).toHaveBeenCalledWith(DID);
    expect(mockRemove).toHaveBeenCalledWith(
      expect.objectContaining({ opSeq: 5, proofSignature: 'DEADBEEF' }),
    );
    expect(mockSignRaw.mock.calls[0][0])
      .toBe(buildGuardianMessageHex(CHALLENGE_REMOVE, DID, GDID, 'cafe01', 5));
  });
});

describe('chưa có danh tính thì dừng TRƯỚC khi chạm mạng', () => {
  it('không hỏi mốc, không gọi máy chủ', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    await expect(addGuardian(GDID)).rejects.toThrow(/danh tính/i);
    expect(mockOpSeq).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
