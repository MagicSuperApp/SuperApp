/**
 * CHUỖI KÝ UỶ QUYỀN — ghim từng byte.
 *
 * Vì sao tệp này đáng có: một chữ ký dựng sai KHÔNG nói được nó sai ở đâu. Máy chủ
 * trả đúng một con `403`, giống hệt con `403` của "ký bằng khoá không phải owner"
 * và của "chữ ký bị cắt". Nên nếu không ghim ở đây thì phép đo duy nhất còn lại là
 * cầm hai cái điện thoại thật và thử — và khi nó hỏng, không có gì chỉ ra chỗ hỏng.
 *
 * Ba nhóm dưới đây khoá ba thứ khác nhau, và nhóm cuối mới là nhóm đắt: hai nhóm
 * đầu chỉ nói "hàm chạy như tôi vừa viết", nhóm cuối nói "hàm chạy như MÁY CHỦ".
 */
import { buildCanonicalHex, utf8Bytes } from './canonicalMessage';
import {
  AUTHORIZE_PREFIX,
  buildAuthorizeMessageHex,
  describeAuthorizeFailure,
} from './keyAuthorizeService';
import { PhoenixKeyApiError } from './phoenixKey-api';

const ARGS = {
  userDid: 'did:phoenix:aaaaaaahl4nn6:ccd1feb6',
  publicKeyHex: '04' + 'ab'.repeat(64),
  keyRole: 'manager' as const,
  nonce: 'f00dcafe',
  opSeq: 7,
};

describe('tiền tố miền đúng bằng hằng máy chủ', () => {
  it('mang sẵn dấu hai chấm — nó là tiền tố, không phải field', () => {
    // `KeyServiceImpl.AUTHORIZE_PREFIX = "PHOENIXKEY_AUTHORIZE:"`. Tiền tố đi vào
    // dạng byte THÔ, không đóng khung. Bỏ dấu hai chấm ở đây thì chuỗi ký lệch
    // đúng một byte — và một byte cũng đủ để chữ ký không verify.
    expect(AUTHORIZE_PREFIX).toBe('PHOENIXKEY_AUTHORIZE:');
  });

  it('chuỗi ký MỞ ĐẦU bằng byte thô của tiền tố, không đóng khung nó', () => {
    const hex = buildAuthorizeMessageHex(ARGS);
    const prefixHex = utf8Bytes(AUTHORIZE_PREFIX)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(hex.startsWith(prefixHex)).toBe(true);
    // Ngay sau tiền tố phải là 4 byte độ dài của field ĐẦU, không phải một 4-byte
    // độ dài của chính tiền tố.
    const sau = hex.slice(prefixHex.length, prefixHex.length + 8);
    const lenDid = ARGS.userDid.length; // ASCII ⇒ số byte = số ký tự
    expect(sau).toBe(lenDid.toString(16).padStart(8, '0'));
  });
});

describe('năm field, đúng thứ tự, và KHÔNG có keyOrigin', () => {
  it('bằng đúng buildCanonicalHex với năm field theo thứ tự máy chủ', () => {
    // `KeyServiceImpl:176` — userDid, publicKeyHex, keyRole, nonce, opSeq.
    expect(buildAuthorizeMessageHex(ARGS)).toBe(
      buildCanonicalHex(
        'PHOENIXKEY_AUTHORIZE:',
        ARGS.userDid,
        ARGS.publicKeyHex,
        ARGS.keyRole,
        ARGS.nonce,
        '7',
      ),
    );
  });

  it('`keyOrigin` KHÔNG nằm trong chuỗi ký, dù nó nằm trong thân gửi', () => {
    // Đây là cái bẫy dễ sập nhất: `keyOrigin` là trường bắt buộc của thân gửi,
    // nên thêm nó vào chuỗi ký trông rất hợp lý. Máy chủ không ký nó.
    const hex = buildAuthorizeMessageHex(ARGS);
    const origin = utf8Bytes('SECURE_ENCLAVE')
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(hex).not.toContain(origin);
  });

  it('đổi thứ tự hai field là ra chuỗi KHÁC — thứ tự thật sự có nghĩa', () => {
    const daoThuTu = buildCanonicalHex(
      'PHOENIXKEY_AUTHORIZE:',
      ARGS.publicKeyHex, ARGS.userDid, ARGS.keyRole, ARGS.nonce, '7',
    );
    expect(buildAuthorizeMessageHex(ARGS)).not.toBe(daoThuTu);
  });
});

describe('opSeq đi vào chuỗi ký dạng CHUỖI THẬP PHÂN', () => {
  it('7 vào thành "7", không phải 8 byte số', () => {
    // Máy chủ: `String.valueOf(request.opSeq())`. Nếu ai đó đổi sang mã hoá số thì
    // độ dài field từ 1 thành 8 và chữ ký hỏng câm.
    const hex = buildAuthorizeMessageHex(ARGS);
    // field cuối: 4 byte độ dài = 1, rồi byte '7' = 0x37.
    expect(hex.endsWith('0000000137')).toBe(true);
  });

  it('mốc nhiều chữ số vào đúng số byte của chuỗi, không phải bề rộng cố định', () => {
    const hex = buildAuthorizeMessageHex({ ...ARGS, opSeq: 1234 });
    // độ dài 4, rồi "1234" = 31 32 33 34.
    expect(hex.endsWith('0000000431323334')).toBe(true);
  });

  it('mốc khác nhau ⇒ chuỗi ký khác nhau (mốc thật sự được buộc vào)', () => {
    expect(buildAuthorizeMessageHex({ ...ARGS, opSeq: 7 }))
      .not.toBe(buildAuthorizeMessageHex({ ...ARGS, opSeq: 8 }));
  });
});

describe('vector cố định — khoá lại khuôn, không chỉ khoá cách gọi', () => {
  /**
   * Ba nhóm trên vẫn XANH nếu `buildCanonicalHex` tự nó đổi khuôn (vd đổi sang
   * varint), vì chúng so hàm này với hàm kia. Bài dưới đây so với một chuỗi hex
   * dựng bằng tay theo đặc tả, nên nó đỏ đúng lúc khuôn đổi.
   */
  it('dựng tay từng byte cho một ca nhỏ', () => {
    const hex = buildAuthorizeMessageHex({
      userDid: 'a', publicKeyHex: 'b', keyRole: 'manager', nonce: 'c', opSeq: 1,
    });
    const mong =
      // "PHOENIXKEY_AUTHORIZE:" byte thô
      '50484f454e49584b45595f415554484f52495a453a' +
      '0000000161' +                    // len=1 "a"
      '0000000162' +                    // len=1 "b"
      '000000076d616e61676572' +        // len=7 "manager"
      '0000000163' +                    // len=1 "c"
      '0000000131';                     // len=1 "1"
    expect(hex).toBe(mong);
  });

  it('độ dài đếm BYTE UTF-8, không đếm ký tự', () => {
    // DID là ASCII nên chỗ này không bao giờ lộ ở luồng thật — nhưng nếu khuôn
    // đổi sang đếm ký tự thì nó sẽ lộ ở một luồng KHÁC dùng chung `buildCanonicalHex`
    // (tên tổ chức tiếng Việt). Ghim ở đây cho rẻ.
    const hex = buildAuthorizeMessageHex({
      userDid: 'ơ', publicKeyHex: 'b', keyRole: 'manager', nonce: 'c', opSeq: 1,
    });
    // "ơ" = U+01A1 → 2 byte UTF-8 (c6 a1), nên độ dài là 2 chứ không phải 1.
    expect(hex).toContain('00000002c6a1');
  });
});

describe('mã lỗi máy chủ thành câu người đọc được', () => {
  const loi = (code: number, http: number) => new PhoenixKeyApiError(code, http, 'x');

  it('3009 (mốc lùi) bảo thử lại — vì thử lại THẬT SỰ khỏi', () => {
    // Mốc bị một thao tác khác nâng giữa lúc đọc và lúc gửi. Lượt sau đọc lại mốc
    // mới nên nó qua. Nói "lỗi hệ thống" ở đây là đẩy người dùng đi sai hướng.
    expect(describeAuthorizeFailure(loi(3009, 409))).toContain('Thử lại');
  });

  it('404 nói ra ĐIỀU KIỆN chưa đủ, không nói "thất bại"', () => {
    expect(describeAuthorizeFailure(loi(-1, 404))).toContain('khoá chủ');
  });

  it('403 chỉ ra rằng có thể đang đứng nhầm máy', () => {
    expect(describeAuthorizeFailure(loi(-1, 403))).toContain('đúng máy');
  });

  it('3011 nói rõ máy thêm vào chỉ nhận vai phụ', () => {
    expect(describeAuthorizeFailure(loi(3011, 409))).toContain('vai phụ');
  });

  it('lỗi lạ không nuốt mất câu của máy chủ', () => {
    expect(describeAuthorizeFailure(new Error('mạng rớt'))).toBe('mạng rớt');
  });
});
