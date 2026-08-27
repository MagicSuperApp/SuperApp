import { buildCanonicalHex, utf8Bytes } from './canonicalMessage';

describe('buildCanonicalHex — đối ứng CanonicalMessage.build của PhoenixKey', () => {
  it('dựng lại ĐÚNG vector cố định nhà PhoenixKey ghim', () => {
    // build("P:", "ab") = 50 3a 00 00 00 02 61 62
    //                     └P┘└:┘└─ len=2 ─┘└ab┘
    // Lệch một byte ở đây là hỏng chữ ký của người dùng thật ở luồng thật. Bài này
    // phải đỏ TRƯỚC, ở đây, chứ không đỏ ngoài vườn.
    expect(buildCanonicalHex('P:', 'ab')).toBe('503a000000026162');
  });

  it('độ dài là 4 byte BIG-endian, không little-endian', () => {
    // 256 byte ⇒ 00 00 01 00. Little-endian sẽ ra 00 01 00 00.
    const f = 'x'.repeat(256);
    expect(buildCanonicalHex('', f).startsWith('00000100')).toBe(true);
  });

  it('KHÔNG phải varint/LEB128 — field 1 byte vẫn tốn đủ 4 byte độ dài', () => {
    expect(buildCanonicalHex('', 'a')).toBe('0000000161');
  });

  it('đếm BYTE UTF-8, không đếm ký tự — chỗ tên tiếng Việt tách hai con số', () => {
    // 'ê' là 2 byte UTF-8 nhưng 1 ký tự. Đếm ký tự sẽ ghi len=1 ⇒ máy chủ đọc lệch.
    expect(utf8Bytes('ê')).toEqual([0xc3, 0xaa]);
    expect(buildCanonicalHex('', 'ê')).toBe('00000002c3aa');
  });

  it('emoji ngoài BMP (cặp surrogate) ⇒ 4 byte, đếm một lần', () => {
    expect(utf8Bytes('🌳')).toEqual([0xf0, 0x9f, 0x8c, 0xb3]);
    expect(buildCanonicalHex('', '🌳')).toBe('00000004f09f8cb3');
  });

  it('field RỖNG vẫn là một field — 00 00 00 00, khác hẳn với bỏ field đi', () => {
    // `/org/lamp-grant` khai `granteeDid|""`. Bỏ qua field rỗng là dựng một chuỗi
    // ngắn hơn máy chủ chờ ⇒ chữ ký không verify.
    expect(buildCanonicalHex('', '')).toBe('00000000');
    expect(buildCanonicalHex('', '', 'a')).toBe('000000000000000161');
    expect(buildCanonicalHex('', 'a')).not.toBe(buildCanonicalHex('', '', 'a'));
  });

  describe('đóng khung KHỬ được va chạm mà nối ":" sinh ra', () => {
    it('va chạm /org/create có thật ở khuôn cũ', () => {
      const cu = (name: string, reg: string) => `PRE:did:${name}:${reg}:nonce`;
      expect(cu('A', 'B:C')).toBe(cu('A:B', 'C'));   // ĐÚNG cùng chuỗi — đây là lỗ
    });

    it('và biến mất ở khuôn đóng khung', () => {
      const moi = (name: string, reg: string) =>
        buildCanonicalHex('PHOENIXKEY_ORG_MINT:', 'did', name, reg, 'nonce');
      expect(moi('A', 'B:C')).not.toBe(moi('A:B', 'C'));
    });
  });

  it('tiền tố đi vào dạng byte THÔ, không bị đóng khung', () => {
    // Tiền tố là tên miền, không phải một field. Đóng khung nó là lệch ngay byte đầu.
    expect(buildCanonicalHex('P:').startsWith('503a')).toBe(true);
    expect(buildCanonicalHex('P:')).toBe('503a');
  });
});
