/**
 * space3d/textCodec — polyfill TextEncoder / TextDecoder (UTF-8) cho Hermes.
 *
 * Vì sao cần: Hermes (máy JS của React Native) KHÔNG có `TextDecoder`/`TextEncoder`.
 * Thiết bị thật báo `ReferenceError: Property 'TextDecoder' doesn't exist`.
 * Không chỉ code của mình cần: `GLTFLoader.parse()` của three gọi
 * `new TextDecoder()` ngay dòng đầu để đọc chunk JSON của tệp .glb → thiếu nó thì
 * KHÔNG nạp được model nào, dù phần còn lại đúng hết.
 *
 * Chỉ cài khi môi trường CHƯA có (Hermes bản mới hoặc JSC có thể đã hỗ trợ sẵn) →
 * không giẫm lên bản dựng sẵn, vốn nhanh hơn vì chạy native.
 *
 * Phạm vi: đúng UTF-8, đủ cho glTF/JSON. Không làm các bảng mã khác (không cần).
 * Phần mã hoá/giải mã là hàm THUẦN → test được bằng jest.
 */

/** Chuỗi → byte UTF-8. Xử lý đúng cặp thay thế (emoji, ký tự ngoài BMP). */
export function encodeUtf8(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let cp = input.charCodeAt(i);
    // Ghép cặp thay thế thành 1 điểm mã.
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = (cp - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/** Byte UTF-8 → chuỗi. Byte hỏng → U+FFFD, KHÔNG ném (khớp hành vi WHATWG mặc định). */
export function decodeUtf8(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let buf: number[] = [];
  const flush = () => {
    if (buf.length) {
      chunks.push(String.fromCharCode.apply(null, buf as never));
      buf = [];
    }
  };

  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++];
    let cp: number;

    if (b0 < 0x80) {
      cp = b0;
    } else if ((b0 & 0xe0) === 0xc0) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else if ((b0 & 0xf8) === 0xf0) {
      cp = ((b0 & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12)
        | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp = 0xfffd; // byte mở đầu không hợp lệ
    }

    if (cp > 0x10ffff || Number.isNaN(cp)) cp = 0xfffd;

    if (cp > 0xffff) {
      const v = cp - 0x10000;
      buf.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else {
      buf.push(cp);
    }

    // Xả theo lô: String.fromCharCode với mảng quá dài sẽ tràn ngăn xếp.
    if (buf.length >= 4096) flush();
  }

  flush();
  return chunks.join('');
}

/** Chuẩn hoá mọi dạng đầu vào của TextDecoder.decode() về Uint8Array. */
function toBytes(input?: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (!input) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(input as ArrayBuffer);
}

class TextEncoderPolyfill {
  readonly encoding = 'utf-8';
  encode(input = ''): Uint8Array {
    return encodeUtf8(input);
  }
}

class TextDecoderPolyfill {
  readonly encoding: string;
  readonly fatal = false;
  readonly ignoreBOM = false;

  constructor(encoding = 'utf-8') {
    const enc = String(encoding).toLowerCase();
    if (enc !== 'utf-8' && enc !== 'utf8') {
      throw new RangeError(`TextDecoder (polyfill) chỉ hỗ trợ utf-8, nhận: ${encoding}`);
    }
    this.encoding = 'utf-8';
  }

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    const bytes = toBytes(input);
    // Bỏ BOM nếu có — JSON.parse sẽ nghẹn nếu chuỗi mở đầu bằng U+FEFF.
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return decodeUtf8(bytes.subarray(3));
    }
    return decodeUtf8(bytes);
  }
}

/** Cài polyfill nếu môi trường thiếu. Gọi nhiều lần vô hại. */
export function installTextCodecPolyfill(): void {
  const g = globalThis as any;
  if (typeof g.TextEncoder === 'undefined') g.TextEncoder = TextEncoderPolyfill;
  if (typeof g.TextDecoder === 'undefined') g.TextDecoder = TextDecoderPolyfill;
}

export { TextDecoderPolyfill, TextEncoderPolyfill };
