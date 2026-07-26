import {
  TextDecoderPolyfill, TextEncoderPolyfill, decodeUtf8, encodeUtf8,
  installTextCodecPolyfill,
} from './textCodec';

const enc = new TextEncoderPolyfill();
const dec = new TextDecoderPolyfill();

describe('encodeUtf8 / decodeUtf8', () => {
  const samples = [
    '',
    'hello',
    '{"asset":{"version":"2.0"}}',          // đúng dạng chunk JSON của glTF
    'Cây sầu riêng · vườn Tám Lợi',        // tiếng Việt có dấu (2–3 byte)
    'Ω≈ç√∫˜µ≤≥÷',
    '🍈🌳🎯',                                // ngoài BMP (4 byte, cặp thay thế)
    'trộn 🍈 lẫn ASCII và tiếng Việt',
  ];

  samples.forEach((s) => {
    it(`đi vòng nguyên vẹn: ${JSON.stringify(s.slice(0, 24))}`, () => {
      expect(decodeUtf8(encodeUtf8(s))).toBe(s);
    });
  });

  it('khớp ĐÚNG số byte UTF-8 chuẩn', () => {
    expect(encodeUtf8('a').length).toBe(1);
    expect(encodeUtf8('é').length).toBe(2);
    expect(encodeUtf8('ế').length).toBe(3);
    expect(encodeUtf8('🍈').length).toBe(4);
  });

  it('sinh đúng dãy byte cho ký tự nhiều byte', () => {
    // U+1F348 → F0 9F 8D 88
    expect(Array.from(encodeUtf8('🍈'))).toEqual([0xf0, 0x9f, 0x8d, 0x88]);
    // 'ế' U+1EBF → E1 BA BF
    expect(Array.from(encodeUtf8('ế'))).toEqual([0xe1, 0xba, 0xbf]);
  });

  it('chuỗi rất dài không tràn ngăn xếp (giải mã theo lô)', () => {
    const long = 'Cây '.repeat(20000);
    expect(decodeUtf8(encodeUtf8(long))).toBe(long);
  });

  it('byte hỏng → U+FFFD chứ không ném lỗi', () => {
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe]))).toContain('�');
  });
});

describe('TextDecoderPolyfill', () => {
  it('nhận Uint8Array, ArrayBuffer và DataView đều cho cùng kết quả', () => {
    const bytes = enc.encode('vườn 3D');
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(dec.decode(bytes)).toBe('vườn 3D');
    expect(dec.decode(ab as ArrayBuffer)).toBe('vườn 3D');
    expect(dec.decode(new DataView(ab as ArrayBuffer))).toBe('vườn 3D');
  });

  it('tôn trọng byteOffset của khung nhìn (đọc đúng lát cắt, không đọc cả buffer)', () => {
    const full = enc.encode('XXXXcây');
    const view = full.subarray(4);
    expect(dec.decode(view)).toBe('cây');
  });

  it('không đối số → chuỗi rỗng', () => {
    expect(dec.decode()).toBe('');
  });

  it('bỏ BOM ở đầu (nếu không JSON.parse sẽ nghẹn)', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('{"a":1}')]);
    expect(dec.decode(withBom)).toBe('{"a":1}');
    expect(() => JSON.parse(dec.decode(withBom))).not.toThrow();
  });

  it('utf8 / UTF-8 đều chấp nhận, bảng mã khác thì báo lỗi rõ ràng', () => {
    expect(new TextDecoderPolyfill('utf8').encoding).toBe('utf-8');
    expect(new TextDecoderPolyfill('UTF-8').encoding).toBe('utf-8');
    expect(() => new TextDecoderPolyfill('latin1')).toThrow(RangeError);
  });
});

describe('installTextCodecPolyfill', () => {
  it('KHÔNG giẫm lên bản dựng sẵn của môi trường', () => {
    const g = globalThis as any;
    const original = g.TextDecoder;
    const marker = function Existing() {} as any;
    g.TextDecoder = marker;
    installTextCodecPolyfill();
    expect(g.TextDecoder).toBe(marker);
    g.TextDecoder = original;
  });

  it('cài vào khi môi trường còn thiếu', () => {
    const g = globalThis as any;
    const original = g.TextDecoder;
    delete g.TextDecoder;
    installTextCodecPolyfill();
    expect(typeof g.TextDecoder).toBe('function');
    expect(new g.TextDecoder().decode(enc.encode('ổn'))).toBe('ổn');
    g.TextDecoder = original;
  });

  it('gọi nhiều lần vô hại', () => {
    expect(() => { installTextCodecPolyfill(); installTextCodecPolyfill(); }).not.toThrow();
  });
});
