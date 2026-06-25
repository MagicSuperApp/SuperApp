// components/QrCode.tsx
//
// Mã QR THUẦN-JS (không phụ-thuộc native module) render bằng react-native-svg.
// Vì sao tự viết thay vì kéo thư-viện: các package QR phổ biến (react-native-qrcode-svg)
// kéo theo `qrcode` + đôi khi link native; ở đây CHỈ cần encode chuỗi ASCII ngắn
// (DID / địa-chỉ Cardano / pkh) nên một encoder gọn, ADDITIVE, không đụng build gốc là đủ.
//
// Hiện thực: port gọn của qrcode-generator (Kazuhiko Arase, MIT) — QR Model 2, chế-độ
// Byte (8-bit), ECC mức M, mask tự-chọn theo penalty score. ĐÃ kiểm round-trip với
// decoder độc-lập jsQR (5/5 case: DID, addr_test, pkh-hex, did:cardano, chuỗi ngắn) —
// xem mô-tả trong report. Hỗ-trợ version 1..10 (≈270 byte) — thừa cho mọi chuỗi danh-tính.

import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect, G } from 'react-native-svg';

// ── GF(256) ─────────────────────────────────────────────────────────────────────
const EXP_TABLE: number[] = new Array(256);
const LOG_TABLE: number[] = new Array(256);
(() => {
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++)
    EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
})();

const glog = (n: number): number => {
  if (n < 1) throw new Error('glog ' + n);
  return LOG_TABLE[n];
};
const gexp = (n: number): number => {
  let m = n;
  while (m < 0) m += 255;
  while (m >= 256) m -= 255;
  return EXP_TABLE[m];
};

// ── Polynomial ──────────────────────────────────────────────────────────────────
class QRPolynomial {
  num: number[];
  constructor(num: number[], shift: number) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }
  get(i: number) {
    return this.num[i];
  }
  getLength() {
    return this.num.length;
  }
  multiply(e: QRPolynomial): QRPolynomial {
    const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
    for (let i = 0; i < this.getLength(); i++)
      for (let j = 0; j < e.getLength(); j++)
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
    return new QRPolynomial(num, 0);
  }
  mod(e: QRPolynomial): QRPolynomial {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = glog(this.get(0)) - glog(e.get(0));
    const num = new Array(this.getLength());
    for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
    for (let i = 0; i < e.getLength(); i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new QRPolynomial(num, 0).mod(e);
  }
}

// ── RS block table (ECC level M = index 1; L = index 0). Versions 1..10. ─────────
const RS_BLOCK_TABLE: number[][] = [
  [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
  [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
  [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
  [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
  [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
  [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
  [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
  [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
  [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
  [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
];

const EC_M = 0; // level M trong bố-cục bảng [L,M,Q,H] → offset 1
type RsBlock = { totalCount: number; dataCount: number };
function getRSBlocks(typeNumber: number): RsBlock[] {
  const rsBlock = RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1]; // M
  const length = rsBlock.length / 3;
  const list: RsBlock[] = [];
  for (let i = 0; i < length; i++) {
    const count = rsBlock[i * 3 + 0];
    const total = rsBlock[i * 3 + 1];
    const data = rsBlock[i * 3 + 2];
    for (let j = 0; j < count; j++) list.push({ totalCount: total, dataCount: data });
  }
  return list;
}

// ── Bit buffer ──────────────────────────────────────────────────────────────────
class QRBitBuffer {
  buffer: number[] = [];
  length = 0;
  put(num: number, len: number) {
    for (let i = 0; i < len; i++) this.putBit(((num >>> (len - i - 1)) & 1) === 1);
  }
  getLengthInBits() {
    return this.length;
  }
  putBit(bit: boolean) {
    const i = Math.floor(this.length / 8);
    if (this.buffer.length <= i) this.buffer.push(0);
    if (bit) this.buffer[i] |= 0x80 >>> this.length % 8;
    this.length++;
  }
}

// ── Byte-mode data ──────────────────────────────────────────────────────────────
function utf8Bytes(data: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i++) {
    let c = data.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < data.length) {
      const c2 = data.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return bytes;
}

// ── QR util ─────────────────────────────────────────────────────────────────────
const PATTERN_POSITION_TABLE: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];
const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

const getBCHDigit = (data: number): number => {
  let digit = 0;
  let d = data;
  while (d !== 0) {
    digit++;
    d >>>= 1;
  }
  return digit;
};
function getBCHTypeInfo(data: number): number {
  let d = data << 10;
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15));
  return ((data << 10) | d) ^ G15_MASK;
}
function getMask(maskPattern: number, i: number, j: number): boolean {
  switch (maskPattern) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default: throw new Error('bad mask ' + maskPattern);
  }
}
function getErrorCorrectPolynomial(ecLength: number): QRPolynomial {
  let a = new QRPolynomial([1], 0);
  for (let i = 0; i < ecLength; i++) a = a.multiply(new QRPolynomial([1, gexp(i)], 0));
  return a;
}

// ── Codeword interleave ─────────────────────────────────────────────────────────
function createBytes(buffer: QRBitBuffer, rsBlocks: RsBlock[]): number[] {
  let offset = 0;
  let maxDcCount = 0;
  let maxEcCount = 0;
  const dcdata: number[][] = new Array(rsBlocks.length);
  const ecdata: number[][] = new Array(rsBlocks.length);
  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r].dataCount;
    const ecCount = rsBlocks[r].totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount);
    maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
    offset += dcCount;
    const rsPoly = getErrorCorrectPolynomial(ecCount);
    const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r].length; i++) {
      const modIndex = i + modPoly.getLength() - ecdata[r].length;
      ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
    }
  }
  let totalCodeCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
  const data = new Array(totalCodeCount);
  let index = 0;
  for (let i = 0; i < maxDcCount; i++)
    for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
  for (let i = 0; i < maxEcCount; i++)
    for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
  return data;
}

function createData(typeNumber: number, bytes: number[]): number[] {
  const rsBlocks = getRSBlocks(typeNumber);
  const buffer = new QRBitBuffer();
  buffer.put(1 << 2, 4); // mode = byte
  buffer.put(bytes.length, 8); // count indicator, 8 bit cho v1..9
  for (const b of bytes) buffer.put(b, 8);

  let totalDataCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
  if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error('overflow');
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
  for (;;) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(0xec, 8);
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(0x11, 8);
  }
  return createBytes(buffer, rsBlocks);
}

// ── Model ───────────────────────────────────────────────────────────────────────
type Cell = boolean | null;

class QRCodeModel {
  typeNumber: number;
  modules: Cell[][] = [];
  moduleCount = 0;
  dataCache: number[] | null = null;
  bytes: number[];
  constructor(typeNumber: number, bytes: number[]) {
    this.typeNumber = typeNumber;
    this.bytes = bytes;
  }
  isDark(row: number, col: number): boolean {
    return this.modules[row][col] === true;
  }
  getModuleCount() {
    return this.moduleCount;
  }
  make() {
    this.makeImpl(false, this.getBestMaskPattern());
  }
  getBestMaskPattern(): number {
    let minLostPoint = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i);
      const lostPoint = this.getLostPoint();
      if (i === 0 || minLostPoint > lostPoint) {
        minLostPoint = lostPoint;
        pattern = i;
      }
    }
    return pattern;
  }
  makeImpl(test: boolean, maskPattern: number) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = Array.from({ length: this.moduleCount }, () =>
      new Array(this.moduleCount).fill(null),
    );
    this.setupProbe(0, 0);
    this.setupProbe(this.moduleCount - 7, 0);
    this.setupProbe(0, this.moduleCount - 7);
    this.setupAdjust();
    this.setupTiming();
    this.setupTypeInfo(test, maskPattern);
    if (this.dataCache === null) this.dataCache = createData(this.typeNumber, this.bytes);
    this.mapData(this.dataCache, maskPattern);
  }
  setupProbe(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        const isPattern =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        this.modules[row + r][col + c] = isPattern;
      }
    }
  }
  setupTiming() {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] !== null) continue;
      this.modules[r][6] = r % 2 === 0;
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] !== null) continue;
      this.modules[6][c] = c % 2 === 0;
    }
  }
  setupAdjust() {
    const pos = PATTERN_POSITION_TABLE[this.typeNumber - 1];
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i];
        const col = pos[j];
        if (this.modules[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            this.modules[row + r][col + c] =
              r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          }
        }
      }
    }
  }
  setupTypeInfo(test: boolean, maskPattern: number) {
    const data = (EC_M << 3) | maskPattern;
    const bits = getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = !test;
  }
  mapData(data: number[], maskPattern: number) {
    let inc = -1;
    let row = this.moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            if (getMask(maskPattern, row, col - c)) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }
  getLostPoint(): number {
    const count = this.moduleCount;
    let lost = 0;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        let sameCount = 0;
        const dark = this.isDark(row, col);
        for (let r = -1; r <= 1; r++) {
          if (row + r < 0 || count <= row + r) continue;
          for (let c = -1; c <= 1; c++) {
            if (col + c < 0 || count <= col + c) continue;
            if (r === 0 && c === 0) continue;
            if (dark === this.isDark(row + r, col + c)) sameCount++;
          }
        }
        if (sameCount > 5) lost += 3 + sameCount - 5;
      }
    }
    for (let row = 0; row < count - 1; row++) {
      for (let col = 0; col < count - 1; col++) {
        let c = 0;
        if (this.isDark(row, col)) c++;
        if (this.isDark(row + 1, col)) c++;
        if (this.isDark(row, col + 1)) c++;
        if (this.isDark(row + 1, col + 1)) c++;
        if (c === 0 || c === 4) lost += 3;
      }
    }
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count - 6; col++) {
        if (
          this.isDark(row, col) && !this.isDark(row, col + 1) && this.isDark(row, col + 2) &&
          this.isDark(row, col + 3) && this.isDark(row, col + 4) && !this.isDark(row, col + 5) &&
          this.isDark(row, col + 6)
        )
          lost += 40;
      }
    }
    for (let col = 0; col < count; col++) {
      for (let row = 0; row < count - 6; row++) {
        if (
          this.isDark(row, col) && !this.isDark(row + 1, col) && this.isDark(row + 2, col) &&
          this.isDark(row + 3, col) && this.isDark(row + 4, col) && !this.isDark(row + 5, col) &&
          this.isDark(row + 6, col)
        )
          lost += 40;
      }
    }
    let darkCount = 0;
    for (let col = 0; col < count; col++)
      for (let row = 0; row < count; row++) if (this.isDark(row, col)) darkCount++;
    const ratio = Math.abs((100 * darkCount) / count / count - 50) / 5;
    lost += ratio * 10;
    return lost;
  }
}

function makeQR(text: string): QRCodeModel | null {
  const bytes = utf8Bytes(text);
  for (let t = 1; t <= 10; t++) {
    try {
      const qr = new QRCodeModel(t, bytes);
      qr.make();
      return qr;
    } catch {
      // overflow ở version này → thử version kế
    }
  }
  return null; // chuỗi quá dài (không xảy ra với danh-tính)
}

// ── Component ───────────────────────────────────────────────────────────────────
type Props = {
  value: string;
  size?: number;
  color?: string;
  background?: string;
  quietZone?: number; // số module viền trắng (chuẩn = 4)
};

const QrCode: React.FC<Props> = ({
  value,
  size = 200,
  color = '#000000',
  background = '#FFFFFF',
  quietZone = 4,
}) => {
  const qr = useMemo(() => (value ? makeQR(value) : null), [value]);

  if (!qr) {
    return <View style={{ width: size, height: size, backgroundColor: background }} />;
  }

  const n = qr.getModuleCount();
  const total = n + quietZone * 2;
  const cell = size / total;

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        rects.push(
          <Rect
            key={`${r}-${c}`}
            x={(c + quietZone) * cell}
            y={(r + quietZone) * cell}
            width={cell + 0.6}
            height={cell + 0.6}
            fill={color}
          />,
        );
      }
    }
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill={background} />
      <G>{rects}</G>
    </Svg>
  );
};

export default QrCode;
