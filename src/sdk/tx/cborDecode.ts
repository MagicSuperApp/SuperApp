/**
 * Bộ giải mã CBOR tối thiểu — đủ cho THÂN GIAO DỊCH Cardano, không hơn.
 *
 * Vì sao tự viết thay vì thêm một gói: màn duyệt giao dịch phải đọc **đúng
 * chuỗi byte sắp được ký**. Mỗi lớp trung gian thêm vào giữa chuỗi byte đó và
 * thứ hiện lên màn hình là một chỗ nội dung có thể lệch mà không ai kêu. Một bộ
 * giải mã 200 dòng đọc hết được trong một lượt review; một gói phụ thuộc thì
 * không. (Ràng buộc phụ, không phải lý do chính: kho này cấm tự thêm gói.)
 *
 * PHẠM VI CỐ Ý HẸP. Không hỗ trợ: số thực, thẻ ngày tháng, chuỗi/mảng độ dài
 * không xác định LỒNG NHAU quá một tầng, và mọi thứ ngoài bảy kiểu chính. Gặp
 * thứ không đọc được thì **NÉM**, không trả một giá trị trông có lý — đây là
 * đường vào một màn hình nói cho người dùng biết họ đang ký cái gì, nên "đọc
 * nhầm một chút" tệ hơn hẳn "không đọc được".
 */

/** Một giá trị CBOR đã giải mã. Khoá của map giữ nguyên kiểu gốc. */
export type CborValue =
  | bigint
  | Uint8Array
  | string
  | CborValue[]
  | CborMap
  | boolean
  | null
  | undefined
  | CborTagged;

/** Map CBOR: khoá có thể là số hoặc chuỗi hoặc byte, nên không dùng object. */
export type CborMap = Map<CborValue, CborValue>;

/** Một giá trị mang thẻ (tag). Giữ nguyên số thẻ để bên trên tự quyết. */
export interface CborTagged {
  readonly tag: bigint;
  readonly value: CborValue;
}

/** Đầu đọc giữ vị trí hiện tại — tách ra để mọi hàm con dùng chung một con trỏ. */
interface Reader {
  readonly bytes: Uint8Array;
  pos: number;
}

const BREAK = Symbol('cbor-break');

function need(r: Reader, n: number): void {
  if (r.pos + n > r.bytes.length) {
    throw new Error(`CBOR hết byte: cần ${n} từ vị trí ${r.pos}, chỉ còn ${r.bytes.length - r.pos}`);
  }
}

function readUint(r: Reader, n: number): bigint {
  need(r, n);
  let v = 0n;
  for (let i = 0; i < n; i += 1) {
    v = (v << 8n) | BigInt(r.bytes[r.pos + i]);
  }
  r.pos += n;
  return v;
}

/**
 * Đọc phần "độ lớn" của một đầu mục. Trả `null` khi đó là dạng độ dài KHÔNG XÁC
 * ĐỊNH (additional info 31) — bên gọi phải tự xử, vì mỗi kiểu xử một khác.
 */
function readLength(r: Reader, info: number): bigint | null {
  if (info < 24) return BigInt(info);
  if (info === 24) return readUint(r, 1);
  if (info === 25) return readUint(r, 2);
  if (info === 26) return readUint(r, 4);
  if (info === 27) return readUint(r, 8);
  if (info === 31) return null;
  throw new Error(`CBOR additional info ${info} không hợp lệ ở vị trí ${r.pos - 1}`);
}

function toNumber(len: bigint, what: string): number {
  if (len > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`CBOR ${what} dài quá mức đọc được: ${len}`);
  }
  return Number(len);
}

function readItem(r: Reader): CborValue | typeof BREAK {
  need(r, 1);
  const head = r.bytes[r.pos];
  r.pos += 1;
  const major = head >> 5;
  const info = head & 0x1f;

  switch (major) {
    case 0: {
      const n = readLength(r, info);
      if (n === null) throw new Error('CBOR số nguyên không thể có độ dài không xác định');
      return n;
    }
    case 1: {
      const n = readLength(r, info);
      if (n === null) throw new Error('CBOR số âm không thể có độ dài không xác định');
      return -1n - n;
    }
    case 2:
      return readByteString(r, info);
    case 3:
      return decodeUtf8(readByteString(r, info));
    case 4:
      return readArray(r, info);
    case 5:
      return readMap(r, info);
    case 6: {
      const tag = readLength(r, info);
      if (tag === null) throw new Error('CBOR thẻ không thể có độ dài không xác định');
      const value = readItem(r);
      if (value === BREAK) throw new Error('CBOR thẻ rỗng');
      return { tag, value };
    }
    case 7: {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return undefined;
      if (info === 31) return BREAK;
      // Số thực và mọi giá trị đơn giản khác: thân giao dịch Cardano không dùng
      // tới, và đoán bừa ở đây là đoán bừa về một con số tiền.
      throw new Error(`CBOR giá trị đơn giản ${info} không nằm trong phạm vi đọc được`);
    }
    default:
      throw new Error(`CBOR major type ${major} không đọc được`);
  }
}

/**
 * Giải UTF-8 bằng tay thay vì gọi `TextDecoder`.
 *
 * Không phải để gọn hơn: Hermes **không** có sẵn `TextDecoder`, nên bản dùng nó
 * chạy êm trong jest (Node có) rồi ném `ReferenceError` trên máy người dùng —
 * đúng loại hỏng mà bộ kiểm không thấy được. Tự giải thì cùng một mã chạy ở cả
 * hai nơi.
 */
function decodeUtf8(b: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    let cp: number;
    let extra: number;
    if (c < 0x80) { cp = c; extra = 0; }
    else if ((c & 0xe0) === 0xc0) { cp = c & 0x1f; extra = 1; }
    else if ((c & 0xf0) === 0xe0) { cp = c & 0x0f; extra = 2; }
    else if ((c & 0xf8) === 0xf0) { cp = c & 0x07; extra = 3; }
    else throw new Error(`UTF-8 hỏng: byte đầu 0x${c.toString(16)} ở vị trí ${i}`);
    if (i + extra >= b.length) throw new Error(`UTF-8 hỏng: thiếu byte nối ở vị trí ${i}`);
    for (let k = 1; k <= extra; k += 1) {
      const n = b[i + k];
      if ((n & 0xc0) !== 0x80) throw new Error(`UTF-8 hỏng: byte nối sai ở vị trí ${i + k}`);
      cp = (cp << 6) | (n & 0x3f);
    }
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

function readByteString(r: Reader, info: number): Uint8Array {
  const len = readLength(r, info);
  if (len !== null) {
    const n = toNumber(len, 'chuỗi byte');
    need(r, n);
    const out = r.bytes.slice(r.pos, r.pos + n);
    r.pos += n;
    return out;
  }
  // Dạng nối từng mảnh: đọc tới khi gặp dấu ngắt.
  const parts: Uint8Array[] = [];
  for (;;) {
    const part = readItem(r);
    if (part === BREAK) break;
    if (!(part instanceof Uint8Array)) {
      throw new Error('CBOR chuỗi byte độ dài không xác định chứa mảnh không phải chuỗi byte');
    }
    parts.push(part);
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach((p) => {
    out.set(p, at);
    at += p.length;
  });
  return out;
}

function readArray(r: Reader, info: number): CborValue[] {
  const len = readLength(r, info);
  const out: CborValue[] = [];
  if (len !== null) {
    const n = toNumber(len, 'mảng');
    for (let i = 0; i < n; i += 1) {
      const item = readItem(r);
      if (item === BREAK) throw new Error('CBOR dấu ngắt nằm trong mảng có độ dài xác định');
      out.push(item);
    }
    return out;
  }
  for (;;) {
    const item = readItem(r);
    if (item === BREAK) break;
    out.push(item);
  }
  return out;
}

function readMap(r: Reader, info: number): CborMap {
  const len = readLength(r, info);
  const out: CborMap = new Map();
  const put = (k: CborValue, v: CborValue): void => {
    // Khoá trùng không phải chuyện nhỏ ở đây: hai mục cùng khoá thì mục sau đè
    // mục trước, và thứ hiện lên màn duyệt là một trong hai — người dùng không
    // có cách nào biết mình vừa xem cái nào.
    const key = normalizeKey(k);
    if (out.has(key)) throw new Error(`CBOR map có khoá trùng: ${String(key)}`);
    out.set(key, v);
  };
  if (len !== null) {
    const n = toNumber(len, 'map');
    for (let i = 0; i < n; i += 1) {
      const k = readItem(r);
      if (k === BREAK) throw new Error('CBOR dấu ngắt nằm ở vị trí khoá của map có độ dài xác định');
      const v = readItem(r);
      if (v === BREAK) throw new Error('CBOR dấu ngắt nằm ở vị trí giá trị');
      put(k, v);
    }
    return out;
  }
  for (;;) {
    const k = readItem(r);
    if (k === BREAK) break;
    const v = readItem(r);
    if (v === BREAK) throw new Error('CBOR map độ dài không xác định thiếu giá trị cho khoá cuối');
    put(k, v);
  }
  return out;
}

/**
 * Khoá dạng chuỗi byte phải so sánh theo NỘI DUNG, không theo tham chiếu — hai
 * `Uint8Array` cùng nội dung là hai object khác nhau với `Map`. Quy về chuỗi hex
 * có tiền tố để không đụng khoá chuỗi thật.
 */
function normalizeKey(k: CborValue): CborValue {
  if (k instanceof Uint8Array) return `#bytes:${toHex(k)}`;
  return k;
}

/** Tra một khoá dạng chuỗi byte trong map đã chuẩn hoá khoá. */
export function byteKey(hex: string): string {
  return `#bytes:${hex.toLowerCase()}`;
}

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 1) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`Chuỗi hex lẻ ký tự: dài ${clean.length}`);
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('Chuỗi hex chứa ký tự không phải hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/**
 * Giải mã MỘT giá trị CBOR và đòi hết byte.
 *
 * Byte thừa ở đuôi là lỗi, không phải rác bỏ qua được: một chuỗi byte "giải mã
 * xong vẫn còn đuôi" nghĩa là thứ vừa đọc không phải toàn bộ thứ sắp ký.
 */
export function decodeCbor(bytes: Uint8Array): CborValue {
  const r: Reader = { bytes, pos: 0 };
  const v = readItem(r);
  if (v === BREAK) throw new Error('CBOR bắt đầu bằng dấu ngắt');
  if (r.pos !== bytes.length) {
    throw new Error(`CBOR còn ${bytes.length - r.pos} byte thừa sau giá trị đầu tiên`);
  }
  return v;
}

export function decodeCborHex(hex: string): CborValue {
  return decodeCbor(fromHex(hex));
}
