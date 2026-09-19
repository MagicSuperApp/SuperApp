/**
 * Đọc THÂN GIAO DỊCH Cardano thành thứ người dùng duyệt được.
 *
 * Đây là nửa còn thiếu của đường ký: `wakeme_sign` (nhà Core) **cố ý không diễn
 * giải nội dung giao dịch** và uỷ thác việc đó cho một màn duyệt. Tệp này là
 * phần lõi của màn đó — thuần tuý, không màn hình, không mạng, nên kiểm được
 * bằng dữ liệu thật thay vì bằng ảnh chụp giao diện.
 *
 * ── Điều quan trọng nhất trong tệp này ─────────────────────────────────────
 * Phần KHÔNG đọc được phải kêu TO HƠN phần đọc được. Một bản tóm tắt bỏ qua
 * một trường lạ rồi hiện ra ba dòng gọn gàng là một màn hình nói *"tôi không
 * biết"* bằng giọng của *"không sao"* — và ở đây cái giá của nó là một chữ ký
 * lên một giao dịch tiêu sạch ví. Nên mọi khoá của thân giao dịch đều phải rơi
 * vào đúng một trong ba rổ có tên dưới đây, và khoá nào không rơi vào rổ nào
 * thì đi thẳng vào `unreadBodyKeys`, khiến `isFullyRead()` trả `false`.
 */

import {
  type CborMap,
  type CborValue,
  byteKey,
  decodeCborHex,
  toHex,
} from './cborDecode';
import { bech32Encode } from './bech32';

// ── Ba rổ khoá của thân giao dịch ────────────────────────────────────────────
// Nguồn: `conway.cddl` của ledger, mục `transaction_body`. Chia theo ĐỘNG TIỀN
// hay không, vì đó mới là trục mà màn duyệt quan tâm — không chia theo "hay
// gặp" hay "dễ đọc".

/** Đọc và HIỆN RA. Mỗi khoá ở đây phải có một trường tương ứng trong bản tóm tắt. */
const KEY_INTERPRETED = {
  inputs: 0,
  outputs: 1,
  fee: 2,
  certificates: 4,
  withdrawals: 5,
  mint: 9,
  collateral: 13,
  requiredSigners: 14,
  collateralReturn: 16,
  totalCollateral: 17,
} as const;

/**
 * Đọc rồi BỎ QUA CÓ CHỦ Ý — những khoá không di chuyển được giá trị nào.
 *
 * Danh sách này là chỗ dễ sai nhất trong tệp, nên mỗi mục ghi vì sao nó vô hại:
 * 3  ttl                     — hạn chót, chỉ làm giao dịch hết hiệu lực
 * 7  auxiliary_data_hash     — băm của metadata, không tiêu được gì
 * 8  validity_interval_start — mốc bắt đầu, cùng loại với ttl
 * 11 script_data_hash        — băm của redeemer+datum, hệ quả nằm ở nơi khác
 * 15 network_id              — số mạng, đã đối chiếu riêng ở `networkHrp`
 * 18 reference_inputs        — chỉ ĐỌC, không tiêu; UTxO vẫn nguyên sau giao dịch
 */
const KEY_HARMLESS: readonly number[] = [3, 7, 8, 11, 15, 18];

// Mọi khoá khác — kể cả khoá của một đời ledger sau — rơi vào rổ thứ ba:
// `unreadBodyKeys`. Không có danh sách cho rổ đó, và đó chính là điểm: rổ thứ
// ba phải bắt được thứ chưa ai nghĩ tới lúc viết tệp này.

export interface AssetAmount {
  /** 28 byte, dạng hex. */
  readonly policyId: string;
  /** Tên tài sản dạng hex — có thể rỗng, và rỗng là hợp lệ. */
  readonly assetNameHex: string;
  /** Âm nghĩa là ĐỐT, ở mục `mint`. */
  readonly quantity: bigint;
}

export interface TxOutputSummary {
  /** Địa chỉ dạng bech32 để người dùng đối chiếu bằng mắt. */
  readonly address: string;
  readonly lovelace: bigint;
  readonly assets: readonly AssetAmount[];
  readonly hasDatum: boolean;
  readonly hasScriptRef: boolean;
}

export interface TxSummary {
  readonly fee: bigint;
  readonly inputCount: number;
  readonly outputs: readonly TxOutputSummary[];
  readonly mint: readonly AssetAmount[];
  readonly certificateCount: number;
  readonly withdrawalCount: number;
  /** Băm khoá mà giao dịch đòi phải ký, dạng hex. */
  readonly requiredSignerHashes: readonly string[];
  readonly collateralCount: number;
  readonly collateralReturn: TxOutputSummary | null;
  readonly totalCollateral: bigint | null;
  /** `addr` hay `addr_test`, đọc từ chính byte đầu của địa chỉ đầu tiên. */
  readonly networkHrp: string | null;
  /** Khoá thân giao dịch mà bản này KHÔNG diễn giải. Rỗng mới được nói "đã đọc hết". */
  readonly unreadBodyKeys: readonly number[];
}

/**
 * Bản tóm tắt đã đọc hết mọi thứ có trong giao dịch chưa.
 *
 * Tách thành hàm chứ không thành một trường `complete` trong cấu trúc: một
 * trường lưu sẵn là một bản sao của `unreadBodyKeys.length === 0`, và hai nguồn
 * cho một sự thật thì có ngày lệch nhau.
 */
export function isFullyRead(s: TxSummary): boolean {
  return s.unreadBodyKeys.length === 0;
}

/** Giao dịch có di chuyển thứ gì ngoài ADA thuần không — dùng để chọn mức cảnh báo. */
export function hasNonAdaEffect(s: TxSummary): boolean {
  return (
    s.mint.length > 0
    || s.certificateCount > 0
    || s.withdrawalCount > 0
    || s.outputs.some((o) => o.assets.length > 0)
  );
}

function asMap(v: CborValue, what: string): CborMap {
  if (!(v instanceof Map)) throw new Error(`${what}: mong đợi map CBOR, nhận ${typeName(v)}`);
  return v;
}

function asArray(v: CborValue, what: string): CborValue[] {
  if (!Array.isArray(v)) throw new Error(`${what}: mong đợi mảng CBOR, nhận ${typeName(v)}`);
  return v;
}

function asBigint(v: CborValue, what: string): bigint {
  if (typeof v !== 'bigint') throw new Error(`${what}: mong đợi số nguyên, nhận ${typeName(v)}`);
  return v;
}

function asBytes(v: CborValue, what: string): Uint8Array {
  if (!(v instanceof Uint8Array)) {
    throw new Error(`${what}: mong đợi chuỗi byte, nhận ${typeName(v)}`);
  }
  return v;
}

function typeName(v: CborValue): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (v instanceof Uint8Array) return 'chuỗi byte';
  if (Array.isArray(v)) return 'mảng';
  if (v instanceof Map) return 'map';
  return typeof v;
}

/**
 * Chuỗi byte của một tập hợp CBOR. Ledger đời Conway bọc tập hợp trong thẻ 258;
 * bản cũ thì để mảng trần. Hai hình dạng, cùng một nghĩa.
 */
function asSet(v: CborValue, what: string): CborValue[] {
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Map)
      && !(v instanceof Uint8Array) && 'tag' in v) {
    if (v.tag !== 258n) throw new Error(`${what}: thẻ CBOR ${v.tag} không phải thẻ tập hợp`);
    return asArray(v.value, what);
  }
  return asArray(v, what);
}

/** Tiền tố bech32 suy từ byte đầu của địa chỉ: bit 0 của nibble thấp là số mạng. */
function addressHrp(raw: Uint8Array): string {
  if (raw.length === 0) throw new Error('Địa chỉ rỗng');
  const header = raw[0];
  const kind = header >> 4;
  const mainnet = (header & 0x0f) === 1;
  // Kiểu 14 và 15 là địa chỉ nhận thưởng; còn lại là địa chỉ thanh toán.
  const base = kind === 14 || kind === 15 ? 'stake' : 'addr';
  return mainnet ? base : `${base}_test`;
}

function readMultiasset(v: CborValue, what: string): AssetAmount[] {
  const out: AssetAmount[] = [];
  asMap(v, what).forEach((names, policyKey) => {
    if (typeof policyKey !== 'string' || !policyKey.startsWith('#bytes:')) {
      throw new Error(`${what}: khoá policy không phải chuỗi byte`);
    }
    const policyId = policyKey.slice('#bytes:'.length);
    asMap(names, `${what} · policy ${policyId}`).forEach((qty, nameKey) => {
      if (typeof nameKey !== 'string' || !nameKey.startsWith('#bytes:')) {
        throw new Error(`${what}: tên tài sản không phải chuỗi byte`);
      }
      out.push({
        policyId,
        assetNameHex: nameKey.slice('#bytes:'.length),
        quantity: asBigint(qty, `${what} · số lượng`),
      });
    });
  });
  return out;
}

/** Giá trị của một đầu ra: hoặc lovelace trần, hoặc `[lovelace, đa tài sản]`. */
function readValue(v: CborValue, what: string): { lovelace: bigint; assets: AssetAmount[] } {
  if (typeof v === 'bigint') return { lovelace: v, assets: [] };
  const pair = asArray(v, what);
  if (pair.length !== 2) throw new Error(`${what}: giá trị phải có đúng 2 phần, có ${pair.length}`);
  return {
    lovelace: asBigint(pair[0], `${what} · lovelace`),
    assets: readMultiasset(pair[1], `${what} · tài sản`),
  };
}

function readOutput(v: CborValue, what: string): TxOutputSummary {
  // Hai hình dạng cùng tồn tại trên chuỗi: mảng đời cũ và map đời Babbage.
  if (Array.isArray(v)) {
    const [addr, val, datumHash] = v;
    const raw = asBytes(addr, `${what} · địa chỉ`);
    const { lovelace, assets } = readValue(val, what);
    return {
      address: bech32Encode(addressHrp(raw), raw),
      lovelace,
      assets,
      hasDatum: datumHash !== undefined,
      hasScriptRef: false,
    };
  }
  const m = asMap(v, what);
  const addrV = m.get(0n);
  if (addrV === undefined) throw new Error(`${what}: đầu ra thiếu địa chỉ`);
  const raw = asBytes(addrV, `${what} · địa chỉ`);
  const valV = m.get(1n);
  if (valV === undefined) throw new Error(`${what}: đầu ra thiếu giá trị`);
  const { lovelace, assets } = readValue(valV, what);
  return {
    address: bech32Encode(addressHrp(raw), raw),
    lovelace,
    assets,
    hasDatum: m.has(2n),
    hasScriptRef: m.has(3n),
  };
}

/**
 * Giao dịch Cardano là mảng `[thân, tập chữ ký, hợp lệ, dữ liệu phụ]`. Chỉ thân
 * mới là thứ được ký, nên chỉ thân mới là thứ được duyệt.
 */
export function extractTxBody(tx: CborValue): CborMap {
  const arr = asArray(tx, 'giao dịch');
  if (arr.length < 3) {
    throw new Error(`Giao dịch phải có ít nhất 3 phần, có ${arr.length}`);
  }
  return asMap(arr[0], 'thân giao dịch');
}

export function summarizeTxBody(body: CborMap): TxSummary {
  const interpreted = new Set<number>(Object.values(KEY_INTERPRETED));
  const harmless = new Set<number>(KEY_HARMLESS);
  const unread: number[] = [];
  body.forEach((_v, k) => {
    if (typeof k !== 'bigint') {
      throw new Error(`Thân giao dịch có khoá không phải số: ${String(k)}`);
    }
    const n = Number(k);
    if (!interpreted.has(n) && !harmless.has(n)) unread.push(n);
  });
  unread.sort((a, b) => a - b);

  const feeV = body.get(BigInt(KEY_INTERPRETED.fee));
  if (feeV === undefined) throw new Error('Thân giao dịch không khai phí — không duyệt được');
  const outputsV = body.get(BigInt(KEY_INTERPRETED.outputs));
  if (outputsV === undefined) throw new Error('Thân giao dịch không có đầu ra nào');
  const inputsV = body.get(BigInt(KEY_INTERPRETED.inputs));
  if (inputsV === undefined) throw new Error('Thân giao dịch không có đầu vào nào');

  const outputs = asArray(outputsV, 'đầu ra').map((o, i) => readOutput(o, `đầu ra #${i}`));
  const mintV = body.get(BigInt(KEY_INTERPRETED.mint));
  const certsV = body.get(BigInt(KEY_INTERPRETED.certificates));
  const wdlV = body.get(BigInt(KEY_INTERPRETED.withdrawals));
  const signersV = body.get(BigInt(KEY_INTERPRETED.requiredSigners));
  const collV = body.get(BigInt(KEY_INTERPRETED.collateral));
  const collRetV = body.get(BigInt(KEY_INTERPRETED.collateralReturn));
  const totalCollV = body.get(BigInt(KEY_INTERPRETED.totalCollateral));

  return {
    fee: asBigint(feeV, 'phí'),
    inputCount: asSet(inputsV, 'đầu vào').length,
    outputs,
    mint: mintV === undefined ? [] : readMultiasset(mintV, 'đúc/đốt'),
    certificateCount: certsV === undefined ? 0 : asSet(certsV, 'chứng chỉ').length,
    withdrawalCount: wdlV === undefined ? 0 : asMap(wdlV, 'rút thưởng').size,
    requiredSignerHashes:
      signersV === undefined
        ? []
        : asSet(signersV, 'khoá bắt buộc ký').map((h, i) =>
            toHex(asBytes(h, `khoá bắt buộc ký #${i}`))),
    collateralCount: collV === undefined ? 0 : asSet(collV, 'tài sản thế chân').length,
    collateralReturn:
      collRetV === undefined ? null : readOutput(collRetV, 'trả lại thế chân'),
    totalCollateral:
      totalCollV === undefined ? null : asBigint(totalCollV, 'tổng thế chân'),
    networkHrp: outputs.length > 0 ? outputs[0].address.split('1')[0] : null,
    unreadBodyKeys: unread,
  };
}

/** Đường vào duy nhất cho màn duyệt: nhận đúng chuỗi hex sắp được ký. */
export function summarizeUnsignedTxHex(hex: string): TxSummary {
  return summarizeTxBody(extractTxBody(decodeCborHex(hex)));
}

/** Dùng trong bài kiểm và khi tra tay một map có khoá dạng byte. */
export { byteKey };
