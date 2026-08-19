/**
 * Ráp `buildAndSignTx` cho mint LAMP bằng OrgDID — nối `orgMintService` xuống
 * Enclave native (`taadEnclave.buildMintLampViaDid` → Rust `mint_lamp.rs`).
 *
 * Vì sao có tệp này thay vì viết thẳng trong màn:
 *
 * Rust cần 13 tham số; app hiện CHỈ tự có 3 (UTxO ví, protocol params, seed ví).
 * Sáu tham số còn lại là dữ-kiện chuỗi do LAMP/PhoenixKey chốt, chưa ai cấp. Viết
 * thẳng trong màn thì chỗ thiếu tan vào giao diện và không test được. Tách ra đây
 * thì thiếu cái gì gọi tên được cái đó, và ngày có số thật chỉ phải sửa MỘT chỗ.
 *
 * ⚠️ Giới hạn phải biết trước khi dùng: Rust nhận `authority_keks_json` = MẢNG
 * Master_KEK, tức là mọi khoá ký phải nằm trên CHÍNH máy này. Với m-of-n mà mỗi
 * người giữ khoá riêng thì đường này KHÔNG chạy được — cần tầng gom witness rời,
 * chưa dựng. `resolveAuthorityKeks` trả về nhiều hơn 1 khoá chỉ hợp lệ khi cả nhóm
 * cùng mở khoá trên một thiết bị.
 */

import taad from '../sdk/taadEnclave';
import type { BuildAndSignMintTx } from './orgMintService';

/**
 * Sáu dữ-kiện chuỗi phải có mới mint được. Tên trùng đúng tham số Rust
 * (`lib.rs::taad_build_mint_lamp_via_did`) để đối chiếu không phải dịch.
 */
export interface OrgMintChainInputs {
  /** JSON {tx_hash,index,inline_datum_hex} — Registry UTxO (reference input). */
  registryUtxoJson: string;
  /** hex token_tag tra bảng registry (param bake trong lamp_mint). */
  tokenTagHex: string;
  /** JSON {tx_hash,index,amount_lovelace,assets,inline_datum_hex} — SupplyState (SPEND). */
  supplyStateUtxoJson: string;
  /** Plutus V3 supply_state script (CBOR hex). */
  supplyStateScriptCbor: string;
  /** JSON {tx_hash,index,address} — KHO UTxO; `address` = đích rót LAMP. */
  khoUtxoJson: string;
  /** Plutus V3 lamp_mint script (CBOR hex); hash = LAMP policy id. */
  lampPolicyCborHex: string;
}

/** Thứ tự dùng cho thông điệp lỗi — giữ ổn định để log đọc được. */
export const ORG_MINT_CHAIN_FIELDS: ReadonlyArray<keyof OrgMintChainInputs> = [
  'registryUtxoJson',
  'tokenTagHex',
  'supplyStateUtxoJson',
  'supplyStateScriptCbor',
  'khoUtxoJson',
  'lampPolicyCborHex',
];

/** Tên tiếng Việt để hiện cho người dùng, không bắt họ đọc tên biến. */
const FIELD_LABEL: Record<keyof OrgMintChainInputs, string> = {
  registryUtxoJson: 'UTxO Registry (ai được mint)',
  tokenTagHex: 'token_tag của LAMP trong Registry',
  supplyStateUtxoJson: 'UTxO SupplyState (đã mint bao nhiêu / trần)',
  supplyStateScriptCbor: 'script supply_state (CBOR)',
  khoUtxoJson: 'UTxO KHO Distribution (đích rót LAMP)',
  lampPolicyCborHex: 'script lamp_mint (CBOR)',
};

/** Trả về danh sách trường còn thiếu/rỗng. Rỗng = đủ. */
export function missingChainInputs(
  chain: Partial<OrgMintChainInputs> | null | undefined,
): Array<keyof OrgMintChainInputs> {
  if (!chain) return [...ORG_MINT_CHAIN_FIELDS];
  return ORG_MINT_CHAIN_FIELDS.filter(k => {
    const v = chain[k];
    return typeof v !== 'string' || v.trim() === '';
  });
}

/**
 * Ném khi chưa đủ dữ-kiện chuỗi. Kèm danh sách thiếu để màn hiện thẳng ra —
 * "tính năng sẽ mở ở bản sau" không nói cho ai biết đang chờ CÁI GÌ.
 */
export class OrgMintChainNotConfiguredError extends Error {
  readonly missing: Array<keyof OrgMintChainInputs>;

  constructor(missing: Array<keyof OrgMintChainInputs>) {
    super(
      'Chưa mint được — còn thiếu dữ liệu chuỗi do LAMP/PhoenixKey cấp: ' +
        missing.map(k => FIELD_LABEL[k]).join(', ') +
        '.',
    );
    this.name = 'OrgMintChainNotConfiguredError';
    this.missing = missing;
  }
}

/** Ví trả phí + nhận tiền thừa. `walletSeedHex` KHÔNG log, KHÔNG lưu. */
export interface OrgMintWallet {
  utxosJson: string;
  protocolParamsJson: string;
  walletSeedHex: string;
}

export interface OrgMintTxDeps {
  /** Sáu dữ-kiện chuỗi. `null` = chưa cấu hình gì cả. */
  chain: Partial<OrgMintChainInputs> | null;
  /** 0 = preprod/preview, 1 = mainnet. */
  network: number;
  /** Master_KEK của các authority. SinglePkh = đúng 1 phần tử. */
  resolveAuthorityKeks: (orgDid: string) => Promise<string[]>;
  resolveWallet: () => Promise<OrgMintWallet>;
  /** Slot tip hiện tại — TTL = slot + 7200. */
  resolveTipSlot: () => Promise<number>;
  /** Số LAMP (đơn vị nhỏ nhất, chuỗi thập phân) + tên token hex. */
  resolveMint: (args: { orgDid: string; requestId: string }) => Promise<{
    tokenNameHex: string;
    amount: string;
  }>;
  /** Tiêm được để test không cần native. Mặc định = cầu thật. */
  buildMint?: typeof taad.buildMintLampViaDid;
}

/**
 * Trả về hàm `buildAndSignTx` để đưa vào `submitMintTx`.
 *
 * Kiểm dữ-kiện chuỗi NGAY khi dựng (không đợi người dùng bấm rồi mới báo), rồi
 * lấy nốt phần động lúc gọi. Thứ tự đó có chủ ý: cái thiếu vĩnh viễn thì báo sớm,
 * cái thay đổi theo thời điểm (UTxO, slot) thì lấy muộn cho tươi.
 */
export function makeBuildAndSignMintTx(deps: OrgMintTxDeps): BuildAndSignMintTx {
  const missing = missingChainInputs(deps.chain);
  if (missing.length > 0) {
    const err = new OrgMintChainNotConfiguredError(missing);
    return async () => {
      throw err;
    };
  }
  const chain = deps.chain as OrgMintChainInputs;
  const buildMint = deps.buildMint ?? taad.buildMintLampViaDid;

  return async ({ orgDid, requestId }) => {
    const authorityKeksHex = await deps.resolveAuthorityKeks(orgDid);
    if (!Array.isArray(authorityKeksHex) || authorityKeksHex.length === 0) {
      throw new Error('Không mở được khoá ký của tổ chức — thử mở khoá lại rồi mint.');
    }

    const [wallet, currentSlot, mint] = await Promise.all([
      deps.resolveWallet(),
      deps.resolveTipSlot(),
      deps.resolveMint({ orgDid, requestId }),
    ]);

    if (!/^\d+$/.test(mint.amount) || mint.amount === '0') {
      throw new Error(`Số LAMP mint không hợp lệ: "${mint.amount}"`);
    }

    const signedTxCbor = await buildMint({
      authorityKeksHex,
      registryUtxoJson: chain.registryUtxoJson,
      tokenTagHex: chain.tokenTagHex,
      supplyStateUtxoJson: chain.supplyStateUtxoJson,
      supplyStateScriptCbor: chain.supplyStateScriptCbor,
      khoUtxoJson: chain.khoUtxoJson,
      lampPolicyCborHex: chain.lampPolicyCborHex,
      // Rust đọc {token_name_hex, amount} — amount là CHUỖI thập phân vì oil
      // vượt 2^53, đưa qua number là mất chữ số cuối mà không ai thấy.
      mintJson: JSON.stringify({ token_name_hex: mint.tokenNameHex, amount: mint.amount }),
      utxosJson: wallet.utxosJson,
      protocolParamsJson: wallet.protocolParamsJson,
      walletSeedHex: wallet.walletSeedHex,
      network: deps.network,
      currentSlot,
    });

    return { signedTxCbor };
  };
}
