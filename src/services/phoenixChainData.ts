/**
 * ChainDataService — nguồn dữ liệu chuỗi cho luồng "tạo OrgDID + mint LAMP"
 * (`src/modules/phoenixOrgMint`). Port trực tiếp từ PhoenixKey-Core
 * `lib/services/chain_data_service.dart` (worktree `_wt-core-mint-b`, commit
 * `2c63ad7`) — GIỮ NGUYÊN logic/shape, chỉ đổi cú pháp Dart → TypeScript.
 *
 * Đọc Blockfrost trực tiếp (preprod/preview/mainnet) để app TỰ lấy dữ liệu mà
 * builder tx (Rust) cần: protocol params, slot tip, UTxO ví (phí+collateral),
 * và UTxO của MỌI NFT khoá-theo-DID (anchor/Registry/SupplyState/KHO — cùng
 * công thức tra cứu 2 bước: `/assets/{unit}/addresses` → `/addresses/{addr}/
 * utxos/{unit}`).
 *
 * CONTRACT SHAPE (verify từ rust_core, KHÔNG đoán — xem `src/sdk/taadEnclave.ts`):
 *   `UtxoInput` = {tx_hash, index, amount_lovelace(SỐ), assets:[{policy_id,
 *   asset_name_hex, quantity(SỐ)}]}. Shape NÀY riêng cho luồng mint/DID — KHÁC
 *   `TransferUtxo` (nếu app có luồng transfer khác dùng key `lovelace`/`name`).
 *
 * AN TOÀN SỐ: Blockfrost trả `quantity`/lovelace dạng CHUỖI thập phân. JS number
 * là double 53-bit an toàn (Number.MAX_SAFE_INTEGER = 2^53−1) — THẤP hơn u64 Rust
 * nhận (tối đa lý thuyết 2^64−1, nhưng Rust builder tự validate lại). Token rác
 * hiếm có thể vượt 2^53−1 ⇒ ném lỗi rõ thay vì tràn/mất-chính-xác âm thầm. Phí/
 * collateral chỉ cần ADA + State-NFT (quantity 1) nên ngưỡng này không cản thực tế.
 *
 * BẢO MẬT: BLOCKFROST_KEY KHÔNG bao giờ log. Lỗi mạng/HTTP → ném Error tiếng
 * Việt rõ ràng cho người dùng (khớp văn phong lỗi hiện có trong `services/`).
 */

import { getPhoenixOrgMintConfig } from '../config/phoenixOrgMint';
import type { UtxoInput } from '../sdk/taadEnclave';

const TIMEOUT_MS = 30_000;

/** Ngưỡng an toàn: JS Number double 53-bit (Number.MAX_SAFE_INTEGER). */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function baseUrlFor(network: 0 | 1 | 2): string {
  switch (network) {
    case 1:
      return 'https://cardano-mainnet.blockfrost.io/api/v0';
    case 2:
      return 'https://cardano-preview.blockfrost.io/api/v0';
    default: // 0 = preprod (mặc định testnet)
      return 'https://cardano-preprod.blockfrost.io/api/v0';
  }
}

/** Ép chuỗi thập phân Blockfrost sang number an toàn cho shape numeric của Rust. */
function parseQuantity(raw: string, ctx: string): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > MAX_SAFE) {
    throw new Error(
      `Số lượng "${raw}" (${ctx}) vượt ngưỡng an toàn ${MAX_SAFE} — token bất ` +
        `thường, không xử lý được trong luồng OrgDID/mint.`,
    );
  }
  return v;
}

export interface NftHolderUtxo {
  tx_hash: string;
  index: number;
  amount_lovelace: number;
  assets: Array<{ policy_id: string; asset_name_hex: string; quantity: number }>;
  /** A-DEST — địa chỉ đang giữ NFT (dùng cho KHO UTxO). */
  address: string;
  /** CBOR-hex nguyên bản Blockfrost trả — Registry/SupplyState decode Ở RUST. */
  inline_datum_hex: string;
}

export class PhoenixChainDataService {
  /** Network build tx cho: 0=preprod, 1=mainnet, 2=preview. PHẢI cùng nguồn với
   * network build tx (`rustNetworkId()`) — lệch mạng ⇒ fetch UTxO mạng KHÁC ⇒
   * tx vô hiệu. */
  private readonly network: 0 | 1 | 2;

  constructor(network: 0 | 1 | 2) {
    this.network = network;
  }

  private get baseUrl(): string {
    return baseUrlFor(this.network);
  }

  private get headers(): Record<string, string> {
    const key = getPhoenixOrgMintConfig().blockfrostKey;
    if (!key) {
      throw new Error('Thiếu BLOCKFROST_KEY trong cấu hình (.env)');
    }
    return { project_id: key };
  }

  private async getJson(path: string, notFoundOk = false): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      res = await fetch(url, { headers: this.headers, signal: controller.signal });
    } catch (e) {
      throw new Error(`Lỗi mạng khi gọi Blockfrost (${path}): ${String(e)}`);
    } finally {
      clearTimeout(timer);
    }
    if (notFoundOk && res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Blockfrost lỗi HTTP ${res.status} khi gọi ${path}`);
    }
    return res.json();
  }

  /** Protocol params hiện hành (epoch mới nhất), nguyên trạng. */
  async fetchProtocolParams(): Promise<Record<string, unknown>> {
    const decoded = await this.getJson('/epochs/latest/parameters');
    if (typeof decoded !== 'object' || decoded === null) {
      throw new Error('Phản hồi protocol params Blockfrost không hợp lệ');
    }
    return decoded as Record<string, unknown>;
  }

  /** Slot tip hiện tại (block mới nhất → .slot). TTL = slot + 7200 (Rust builder). */
  async fetchSlotTip(): Promise<number> {
    const decoded = (await this.getJson('/blocks/latest')) as { slot?: number } | null;
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('Phản hồi /blocks/latest không hợp lệ');
    }
    if (typeof decoded.slot !== 'number') {
      throw new Error('/blocks/latest thiếu trường slot (tip chưa sẵn sàng?)');
    }
    return decoded.slot;
  }

  private normalizeUtxoInput(u: Record<string, unknown>): UtxoInput {
    const txHash = u.tx_hash as string;
    const index = Number(u.output_index);
    let lovelace = 0;
    const assets: UtxoInput['assets'] = [];
    const amount = (u.amount as Array<{ unit: string; quantity: string | number }>) ?? [];
    for (const a of amount) {
      const unit = a.unit;
      const qtyStr = String(a.quantity);
      if (unit === 'lovelace') {
        lovelace = parseQuantity(qtyStr, 'lovelace UTxO');
      } else {
        const policy = unit.slice(0, 56);
        const name = unit.length > 56 ? unit.slice(56) : '';
        assets.push({
          policy_id: policy,
          asset_name_hex: name,
          quantity: parseQuantity(qtyStr, `asset ${unit}`),
        });
      }
    }
    return { tx_hash: txHash, index, amount_lovelace: lovelace, assets };
  }

  /**
   * UTxO ví [address] cho phí + collateral, ĐÚNG shape `UtxoInput`. Phân trang
   * 100/trang. 404 = ví chưa có giao dịch → trả [].
   */
  async fetchWalletUtxos(address: string): Promise<UtxoInput[]> {
    const out: UtxoInput[] = [];
    let page = 1;
    for (;;) {
      const decoded = await this.getJson(
        `/addresses/${address}/utxos?count=100&page=${page}`,
        true,
      );
      if (decoded === null) return [];
      if (!Array.isArray(decoded)) {
        throw new Error('Phản hồi UTxO Blockfrost không hợp lệ');
      }
      if (decoded.length === 0) break;
      for (const item of decoded) {
        out.push(this.normalizeUtxoInput(item as Record<string, unknown>));
      }
      if (decoded.length < 100) break;
      page += 1;
    }
    return out;
  }

  /**
   * Resolve UTxO ĐANG GIỮ NFT (policyHex+nameHex) — dùng chung cho anchor TAAD,
   * Registry UTxO, SupplyState UTxO, KHO UTxO. 2 bước:
   *   1. unit = policyHex+nameHex → GET /assets/{unit}/addresses → .address[0]
   *   2. GET /addresses/{addr}/utxos/{unit} → UTxO[0] → map NftHolderUtxo
   * `address` (A-DEST cho KHO) + `inline_datum_hex` (Registry/SupplyState decode
   * Ở RUST, KHÔNG tự decode CBOR/Plutus-Data phía JS — LẤY ATOMIC từ CÙNG 1 query
   * bước 2, KHÔNG ghép từ 2 lần gọi khác nhau, tránh race giữa address và
   * tx_hash/index (audit finding: "address + tx_hash/index của KHO phải lấy
   * ATOMIC từ cùng 1 query").
   */
  async fetchNftHolderUtxo(
    policyHex: string,
    nameHex: string,
    errLabel: string,
  ): Promise<NftHolderUtxo> {
    const unit = `${policyHex}${nameHex}`;

    const addrList = await this.getJson(`/assets/${unit}/addresses`, true);
    if (addrList === null || (Array.isArray(addrList) && addrList.length === 0)) {
      throw new Error(
        `${errLabel} chưa có on-chain: không tìm thấy NFT (unit ${unit}). ` +
          `Kiểm tra policy/name đã cấu hình đúng + đã deploy/genesis chưa.`,
      );
    }
    if (!Array.isArray(addrList)) {
      throw new Error(`Phản hồi /assets/${unit}/addresses không hợp lệ (${errLabel})`);
    }
    const addr = (addrList[0] as { address?: string })?.address;
    if (!addr) {
      throw new Error(`Không đọc được địa chỉ giữ NFT ${errLabel} (unit ${unit})`);
    }

    // Bước 2 — CÙNG request lấy cả UTxO + address (atomic, không ghép 2 nguồn).
    const utxoList = await this.getJson(`/addresses/${addr}/utxos/${unit}`, true);
    if (utxoList === null || (Array.isArray(utxoList) && utxoList.length === 0)) {
      throw new Error(
        `Không tìm thấy UTxO ${errLabel} mang NFT tại ${addr} (unit ${unit}). ` +
          `Có thể vừa bị tiêu/đang đồng bộ — thử lại sau.`,
      );
    }
    if (!Array.isArray(utxoList)) {
      throw new Error(`Phản hồi UTxO ${errLabel} không hợp lệ`);
    }
    const raw = utxoList[0] as Record<string, unknown>;
    const normalized = this.normalizeUtxoInput(raw);
    return {
      ...normalized,
      address: addr,
      inline_datum_hex: (raw.inline_datum as string | null) ?? '',
    };
  }

  /** Alias tiện dụng: resolve anchor UTxO OrgDID (State-NFT policy=TAAD script hash). */
  async fetchAnchorUtxo(anchorPolicyHex: string, anchorNameHex: string): Promise<NftHolderUtxo> {
    return this.fetchNftHolderUtxo(anchorPolicyHex, anchorNameHex, 'Anchor OrgDID');
  }
}
