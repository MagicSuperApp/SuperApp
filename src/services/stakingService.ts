/**
 * stakingService — đọc thông tin staking/SPO (Issue #74). Backend relay Blockfrost.
 *
 * READ-ONLY ở pha này:
 *   - listPools/getPool: duyệt & xem chi tiết pool.
 *   - getUserDelegation: derive stake address của user từ Master_KEK rồi hỏi trạng-thái
 *     delegation hiện tại (đang uỷ quyền pool nào, số dư stake, reward).
 *
 * DELEGATE (write): dựng cert delegation bằng Rust `staking.rs`
 * (`taad_kek_build_stake_delegation`) → ký Enclave → `phoenixKeyApi.wallet.txSubmit`.
 * Hai endpoint UTXO/params ĐÃ CÓ (đo 2026-08-11): `/wallet/params` 200,
 * `/wallet/{did}/utxos` 401 (tồn tại, đòi phiên). Còn lại: rebuild native cho FFI mới.
 */

import taad from '../sdk/taadEnclave';
import { fetchWalletUtxosAndParams } from './cardanoTxService';
import { currentUserDid } from '../sdk/phoenixKey';
import {
  phoenixKeyApi,
  type PoolDetail,
  type DelegationStatus,
} from './phoenixKey-api';

/** Chi tiết 1 pool (số + metadata off-chain). */
export async function getPool(poolId: string): Promise<PoolDetail> {
  return phoenixKeyApi.pools.get(poolId);
}

/**
 * Trạng-thái delegation của ví user (theo stake address derive từ Master_KEK).
 * Trả kèm `stakeAddress` đã derive để UI hiển thị. Account chưa activate →
 * active=false, poolId=null (KHÔNG lỗi 404).
 */
export async function getUserDelegation(
  kekHex: string,
  account: number,
  network: number,
): Promise<DelegationStatus> {
  const net = network === 1 ? 1 : 0;
  const stakeAddress = await taad.deriveStakeAddress(kekHex, account, net);
  if (!stakeAddress) {
    throw new Error('Không derive được địa chỉ stake (KEK sai?).');
  }
  return phoenixKeyApi.delegation.status(stakeAddress);
}

/** Tiện ích: chỉ lấy stake address (không gọi mạng) — dùng cho màn hiển thị. */
export async function deriveStakeAddress(
  kekHex: string,
  account: number,
  network: number,
): Promise<string> {
  return taad.deriveStakeAddress(kekHex, account, network === 1 ? 1 : 0);
}

/**
 * UỶ THÁC stake của account vào 1 pool (single-pool). Dựng+ký cert trong Enclave
 * (StakeRegistration nếu chưa + StakeDelegation) → submit qua /wallet/tx/submit.
 * Trả txHash. Ném lỗi nếu thiếu UTXO / build lỗi / submit từ chối.
 *
 * ⏳ Còn chặn: rebuild native cho FFI mới. Hai endpoint UTXO/params KHÔNG còn chặn —
 * ghi chú cũ nói thiếu là do bên này gọi sai hình đường (`/wallet/utxos?address=`
 * thay vì `/wallet/{did}/utxos`), không phải backend thiếu.
 */
export async function delegateToPool(args: {
  kekHex: string;
  account: number;
  poolBech32: string;
  network: number;
}): Promise<{ txHash: string }> {
  const net = args.network === 1 ? 1 : 0;

  // Địa chỉ ví nguồn (để hỏi UTXO chi phí + deposit stake key).
  const senderAddress = await taad.deriveWalletAddress(args.kekHex, args.account, net);
  if (!senderAddress) {
    throw new Error('Không derive được địa chỉ ví (KEK sai?).');
  }

  // UTXO khoá theo DID, không theo địa chỉ: một DID có nhiều địa chỉ chi được cùng
  // lúc (Phoenix + Standard), mà dựng cert uỷ thác cần TOÀN BỘ chứ không một mảnh.
  // Chi tiết + bằng chứng đo ở `cardanoTxService.UTXOS_PATH`.
  const did = await currentUserDid();
  if (!did) {
    throw new Error('Chưa đăng nhập PhoenixKey — không lấy được UTXO của ví.');
  }
  const { utxosJson, protocolParamsJson } = await fetchWalletUtxosAndParams(did);

  const cbor = await taad.buildStakeDelegation({
    kekHex: args.kekHex,
    account: args.account,
    poolBech32: args.poolBech32,
    utxosJson,
    protocolParamsJson,
    network: net,
  });

  const { cardanoTxHash } = await phoenixKeyApi.wallet.txSubmit(cbor);
  return { txHash: cardanoTxHash };
}
