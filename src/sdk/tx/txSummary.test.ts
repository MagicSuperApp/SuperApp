/**
 * Phép canh cho màn duyệt giao dịch.
 *
 * Hai chỗ tệp này cố ý làm khác thói quen, vì cả hai đều là chỗ một bài kiểm dễ
 * tự chứng minh chính mình:
 *
 * 1. **Dữ liệu mẫu CBOR viết TAY theo từng byte**, không sinh bằng một bộ mã
 *    hoá của chính kho này. Sinh bằng bộ mã hoá của mình thì bài kiểm chỉ chứng
 *    minh hai nửa của cùng một hiểu lầm khớp nhau.
 * 2. **bech32 neo vào chuỗi đã công bố** (BIP-173 và CIP-19), không neo vào
 *    kết quả của chính bộ mã hoá. Bộ giải mã dùng trong tệp này chỉ sống ở đây
 *    và nhiệm vụ chính của nó là **kiểm tổng kiểm tra của chuỗi đã công bố** —
 *    nếu `polymod` sai thì bước đó đỏ, trước cả khi tới phép so chuỗi.
 *
 * Giới hạn còn lại, nói thẳng: phép quay vòng ở bài CIP-19 (giải rồi mã lại)
 * sẽ vẫn xanh nếu bộ giải mã trong tệp này sai đúng chiều ngược với bộ mã hoá.
 * Bước kiểm tổng thu hẹp khe đó chứ không bịt kín được nó; bịt kín thì cần một
 * bản bech32 của bên thứ ba, mà máy này không có.
 */

import { decodeCborHex, fromHex, toHex } from './cborDecode';
import { bech32Encode } from './bech32';
import {
  extractTxBody,
  hasNonAdaEffect,
  isFullyRead,
  summarizeTxBody,
  summarizeUnsignedTxHex,
} from './txSummary';

// ───────────────────────────────────────────────────────────────────────────
// Bộ giải bech32 CHỈ DÙNG TRONG BÀI KIỂM — để biến chuỗi đã công bố thành byte.
// ───────────────────────────────────────────────────────────────────────────
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  values.forEach((v) => {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i += 1) if ((top >> i) & 1) chk ^= GEN[i];
  });
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const a: number[] = [];
  for (let i = 0; i < hrp.length; i += 1) a.push(hrp.charCodeAt(i) >> 5);
  a.push(0);
  for (let i = 0; i < hrp.length; i += 1) a.push(hrp.charCodeAt(i) & 31);
  return a;
}

/** Trả byte của phần dữ liệu, và NÉM nếu tổng kiểm tra của chuỗi công bố không đúng. */
function bech32DecodeForTest(s: string): { hrp: string; bytes: Uint8Array } {
  const sep = s.lastIndexOf('1');
  const hrp = s.slice(0, sep);
  const words = [...s.slice(sep + 1)].map((c) => {
    const w = CHARSET.indexOf(c);
    if (w < 0) throw new Error(`ký tự ngoài bảng bech32: ${c}`);
    return w;
  });
  if (polymod([...hrpExpand(hrp), ...words]) !== 1) {
    throw new Error(`tổng kiểm tra bech32 sai cho chuỗi công bố: ${s}`);
  }
  const data = words.slice(0, -6);
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  data.forEach((w) => {
    acc = (acc << 5) | w;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  });
  return { hrp, bytes: new Uint8Array(out) };
}

// ───────────────────────────────────────────────────────────────────────────
// Dữ liệu mẫu — viết tay theo `conway.cddl`, mỗi mảnh ghi rõ nó là byte gì
// ───────────────────────────────────────────────────────────────────────────
const rep = (byte: string, n: number): string => byte.repeat(n);

/** Địa chỉ cơ sở kiểu 0, mạng thử: 1 byte đầu + 28 băm thanh toán + 28 băm cọc. */
const ADDR_A = `00${rep('11', 28)}${rep('22', 28)}`;
const ADDR_B = `00${rep('33', 28)}${rep('44', 28)}`;
const POLICY = rep('55', 28);
/** "tCARP" — 5 byte ASCII: 74 43 41 52 50. */
const ASSET_TCARP = '7443415250';

const INPUTS = [
  'd90102', //           thẻ 258 = tập hợp (đời Conway)
  '81', //               mảng 1 phần tử
  '82', //               mảng 2: [mã giao dịch, số thứ tự]
  `5820${rep('aa', 32)}`, // chuỗi byte 32
  '00', //               số thứ tự 0
].join('');

const OUT_ADA_ONLY = ['a2', `005839${ADDR_A}`, '011a002dc6c0'].join(''); // 3.000.000
const OUT_WITH_ASSET = [
  'a2',
  `005839${ADDR_B}`,
  '01',
  '82', //               [lovelace, đa tài sản]
  '1a00155cc0', //       1.400.000
  'a1', //               map 1 policy
  `581c${POLICY}`,
  'a1', //               map 1 tên tài sản
  `45${ASSET_TCARP}`, // chuỗi byte 5
  '1a3b9aca00', //       1.000.000.000 = 1 tCARP ở 9 chữ số thập phân
].join('');

/** Thân giao dịch chỉ gồm khoá ĐÃ DIỄN GIẢI và khoá VÔ HẠI. */
const BODY_KNOWN = [
  'a4', //               map 4 cặp
  '00', INPUTS,
  '01', '82', OUT_ADA_ONLY, OUT_WITH_ASSET,
  '02', '1a0002bf20', //  phí 180.000
  '03', '1a04c4b400', //  ttl 80.000.000
].join('');

const wrapTx = (body: string): string => `84${body}a0f5f6`;

// ───────────────────────────────────────────────────────────────────────────
describe('bech32 — neo vào chuỗi đã công bố, không neo vào chính nó', () => {
  it('BIP-173: tiền tố "a", dữ liệu rỗng → "a12uel5l"', () => {
    // Vector này không có byte dữ liệu nào, nên nó cô lập đúng phần dễ sai nhất:
    // `polymod`, bảng ký tự, và cách trải tiền tố. Sai một bit ở bất cứ chỗ nào
    // trong ba chỗ đó là sáu ký tự cuối đổi.
    expect(bech32Encode('a', new Uint8Array(0))).toBe('a12uel5l');
  });

  it('CIP-19: địa chỉ cơ sở kiểu 0 trên mạng thử dựng lại ĐÚNG NGUYÊN VĂN', () => {
    // Nguồn: CIP-0019 §Test vectors, lấy 19/09/2026.
    const CONG_BO =
      'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq'
      + '835lu7drv2xwl2wywfgs68faae';
    const { hrp, bytes } = bech32DecodeForTest(CONG_BO); // ném nếu tổng kiểm tra sai
    expect(hrp).toBe('addr_test');
    expect(bytes.length).toBe(57); // 1 + 28 + 28
    expect(bytes[0]).toBe(0x00); // kiểu 0, mạng thử
    expect(bech32Encode(hrp, bytes)).toBe(CONG_BO);
  });

  it('CIP-19: bản mạng chính khác bản mạng thử ở ĐÚNG byte đầu', () => {
    const CONG_BO_MAIN =
      'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq'
      + '835lu7drv2xwl2wywfgse35a3x';
    const main = bech32DecodeForTest(CONG_BO_MAIN);
    const test = bech32DecodeForTest(
      'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq'
      + '835lu7drv2xwl2wywfgs68faae',
    );
    expect(main.bytes[0]).toBe(0x01);
    expect(toHex(main.bytes.slice(1))).toBe(toHex(test.bytes.slice(1)));
    expect(bech32Encode('addr', main.bytes)).toBe(CONG_BO_MAIN);
  });
});

describe('giải mã CBOR — thứ không đọc được thì NÉM', () => {
  it('byte thừa ở đuôi là lỗi, không phải rác bỏ qua được', () => {
    expect(() => decodeCborHex('01ff')).toThrow(/byte thừa/);
  });

  it('map có khoá trùng thì NÉM — không để mục sau đè mục trước', () => {
    // `a2 00 01 00 02` = map hai cặp, cùng khoá 0. Nuốt cái này thì màn duyệt
    // hiện một trong hai giá trị và người dùng không biết mình xem cái nào.
    expect(() => decodeCborHex('a200010002')).toThrow(/khoá trùng/);
  });

  it('số thực bị từ chối thay vì làm tròn', () => {
    expect(() => decodeCborHex('f93c00')).toThrow(/không nằm trong phạm vi đọc được/);
  });

  it('chuỗi hex lẻ ký tự bị từ chối', () => {
    expect(() => fromHex('abc')).toThrow(/lẻ ký tự/);
  });

  it('đọc đúng số nguyên 8 byte — không rơi qua số thực của JS', () => {
    // 1b ffffffffffffffff = 18.446.744.073.709.551.615, quá `Number.MAX_SAFE_INTEGER`.
    expect(decodeCborHex('1bffffffffffffffff')).toBe(18446744073709551615n);
  });
});

describe('tóm tắt thân giao dịch', () => {
  const s = summarizeUnsignedTxHex(wrapTx(BODY_KNOWN));

  it('đọc đúng phí, số đầu vào và hai đầu ra', () => {
    expect(s.fee).toBe(180000n);
    expect(s.inputCount).toBe(1);
    expect(s.outputs).toHaveLength(2);
  });

  it('đầu ra thứ nhất là ADA thuần', () => {
    expect(s.outputs[0].lovelace).toBe(3000000n);
    expect(s.outputs[0].assets).toEqual([]);
    expect(s.outputs[0].address.startsWith('addr_test1')).toBe(true);
  });

  it('đầu ra thứ hai mang tài sản, và số lượng giữ nguyên độ chính xác', () => {
    expect(s.outputs[1].lovelace).toBe(1400000n);
    expect(s.outputs[1].assets).toEqual([
      { policyId: POLICY, assetNameHex: ASSET_TCARP, quantity: 1000000000n },
    ]);
  });

  it('địa chỉ dựng ra khớp với chính byte trong giao dịch', () => {
    // Không tin bản tóm tắt tự khai: mã lại từ byte gốc rồi so.
    expect(s.outputs[0].address).toBe(bech32Encode('addr_test', fromHex(ADDR_A)));
    expect(s.outputs[1].address).toBe(bech32Encode('addr_test', fromHex(ADDR_B)));
  });

  it('`networkHrp` nói đúng mạng thử', () => {
    expect(s.networkHrp).toBe('addr_test');
  });

  it('có tài sản ngoài ADA thì `hasNonAdaEffect` bật', () => {
    expect(hasNonAdaEffect(s)).toBe(true);
  });
});

describe('🔴 CHỐT — khoá KHÔNG đọc được phải kêu, không được lặng lẽ biến mất', () => {
  it('một khoá lạ trong thân giao dịch ⟹ `unreadBodyKeys` có nó và `isFullyRead` FALSE', () => {
    // Khoá 19 là `voting_procedures` đời Conway. Bản này chưa diễn giải nó, và
    // đó chính là ca phải kêu: một giao dịch bỏ phiếu đi qua màn duyệt mà chỉ
    // hiện "phí 0,18 ₳, hai đầu ra" là một màn hình nói sai bằng cách nói thiếu.
    const body = `a5${BODY_KNOWN.slice(2)}13a0`; // đổi a4 → a5, thêm khoá 19 (0x13)
    const s = summarizeTxBody(extractTxBody(decodeCborHex(wrapTx(body))));
    expect(s.unreadBodyKeys).toEqual([19]);
    expect(isFullyRead(s)).toBe(false);
  });

  it('ca đối chứng — thân chỉ có khoá đã biết thì `isFullyRead` TRUE', () => {
    // Không có ca này thì bài trên xanh y hệt khi `isFullyRead` trả `false` cho
    // mọi đầu vào, tức nó không phân biệt được gì.
    const s = summarizeUnsignedTxHex(wrapTx(BODY_KNOWN));
    expect(s.unreadBodyKeys).toEqual([]);
    expect(isFullyRead(s)).toBe(true);
  });

  it('khoá VÔ HẠI được nhận là vô hại, không bị đẩy nhầm sang rổ chưa đọc', () => {
    // ttl (3) đã có trong mẫu. Thêm `reference_inputs` (18) — chỉ đọc, không tiêu.
    const body = `a5${BODY_KNOWN.slice(2)}12d9010280`;
    const s = summarizeTxBody(extractTxBody(decodeCborHex(wrapTx(body))));
    expect(s.unreadBodyKeys).toEqual([]);
  });
});

describe('đường ra tiền phải hiện ra, không được gộp vào một dòng "phí"', () => {
  it('đốt tài sản hiện thành số ÂM, không thành 0', () => {
    // mint (khoá 9) với số lượng -1.000.000.000: `3b 3b9ac9ff` = -(0x3B9AC9FF + 1).
    const body = `a5${BODY_KNOWN.slice(2)}09a1581c${POLICY}a145${ASSET_TCARP}3b000000003b9ac9ff`;
    const s = summarizeTxBody(extractTxBody(decodeCborHex(wrapTx(body))));
    expect(s.mint).toEqual([
      { policyId: POLICY, assetNameHex: ASSET_TCARP, quantity: -1000000000n },
    ]);
    expect(hasNonAdaEffect(s)).toBe(true);
  });

  it('rút thưởng được ĐẾM — đó là tiền rời khỏi tài khoản cọc', () => {
    const rewardAddr = `e0${rep('66', 28)}`; // kiểu 14, mạng thử
    const body = `a5${BODY_KNOWN.slice(2)}05a1581d${rewardAddr}1a000f4240`;
    const s = summarizeTxBody(extractTxBody(decodeCborHex(wrapTx(body))));
    expect(s.withdrawalCount).toBe(1);
    expect(hasNonAdaEffect(s)).toBe(true);
  });

  it('thân thiếu phí thì NÉM — không đoán là 0', () => {
    const body = ['a3', '00', INPUTS, '01', '81', OUT_ADA_ONLY, '03', '1a04c4b400'].join('');
    expect(() => summarizeTxBody(extractTxBody(decodeCborHex(wrapTx(body)))))
      .toThrow(/không khai phí/);
  });
});
