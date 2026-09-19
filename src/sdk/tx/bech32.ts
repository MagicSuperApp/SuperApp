/**
 * Mã hoá bech32 — chỉ chiều ĐI RA, đủ để hiện một địa chỉ Cardano cho người đọc.
 *
 * Không có chiều giải mã ở đây, và đó là cố ý: chỗ duy nhất cần bech32 trên
 * đường này là biến chuỗi byte trong giao dịch thành chuỗi người dùng đối chiếu
 * được bằng mắt. Thêm chiều ngược lại là thêm bề mặt không ai gọi.
 *
 * Cardano dùng bech32 (BIP-173), KHÔNG phải bech32m — hằng số cuối là 1.
 * Địa chỉ Cardano dài hơn 90 ký tự nên giới hạn độ dài của BIP-173 không áp;
 * CIP-5 nói rõ điều đó.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  values.forEach((v) => {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= GENERATOR[i];
    }
  });
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i += 1) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i += 1) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/** 8 bit → 5 bit, có đệm. Chỉ dùng chiều này nên không cần tham số `pad`. */
function toWords(bytes: Uint8Array): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  bytes.forEach((b) => {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >> bits) & 31);
    }
  });
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

export function bech32Encode(hrp: string, data: Uint8Array): string {
  if (hrp.length === 0) throw new Error('bech32 thiếu phần tiền tố');
  const words = toWords(data);
  const chk = polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const sum: number[] = [];
  for (let i = 0; i < 6; i += 1) sum.push((chk >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...sum].map((w) => CHARSET[w]).join('')}`;
}
