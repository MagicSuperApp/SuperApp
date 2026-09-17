/**
 * stakingService — đọc thông tin staking/SPO (Issue #74). Backend relay Blockfrost.
 *
 * READ-ONLY ở pha này:
 *   - getPool: xem chi tiết một pool. (`listPools` đã gỡ — không màn nào duyệt
 *     danh sách pool; máy chủ relay không có cửa liệt kê rẻ để dựa vào.)
 *   - getUserDelegation: derive stake address của user từ Master_KEK rồi hỏi trạng-thái
 *     delegation hiện tại (đang uỷ quyền pool nào, số dư stake, reward).
 *
 * DELEGATE (write): dựng cert delegation bằng Rust `staking.rs`
 * (`taad_kek_build_stake_delegation`) → ký Enclave → `phoenixKeyApi.wallet.txSubmit`.
 * Hai endpoint UTXO/params ĐÃ CÓ (đo 2026-08-11): `/wallet/params` 200,
 * `/wallet/{did}/utxos` 401 (tồn tại, đòi phiên). Còn lại: rebuild native cho FFI mới.
 */

import taad from '../sdk/taadEnclave';
import { assertSigningNetworkAllowed } from '../config/cardanoNetwork';
import { fetchWalletUtxosAndParams } from './cardanoTxService';
import { currentUserDid } from '../sdk/phoenixKey';
import { GATE_PREFIX, requireUserPresence } from './sensitiveActionGate';
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
  // Cổng mạng fail-closed — lý do đầy đủ ở `config/cardanoNetwork.ts`
  // (`MAINNET_SIGNING_ALLOWED`). Uỷ thác vẫn là đường ra tiền: cert
  // StakeRegistration đặt cọc lấy từ chính ví.
  assertSigningNetworkAllowed(args.network);
  const net = args.network;

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

  // ── CỔNG XÁC THỰC ──────────────────────────────────────────────────────────
  // Uỷ thác KHÔNG chuyển tiền đi, nhưng nó vẫn là thao tác ra tiền: cert
  // StakeRegistration đặt cọc khoá stake (deposit lấy từ chính ví), và từ lúc
  // này phần thưởng chảy về pool người dùng vừa chọn. Ai cầm máy đang mở mà đổi
  // được pool là đổi được nơi nhận thưởng của người khác.
  // Vì sao cổng tồn tại + ranh giới: `sensitiveActionGate.ts` đầu tệp.
  //
  // Đặt SAU khi đã có UTXO/params, TRƯỚC bước dựng+ký cert — cùng lý do thứ tự
  // ở `cardanoTxService.sendCardano`.
  await requireUserPresence({
    prefix: GATE_PREFIX.delegate,
    fields: [args.poolBech32, String(args.account), String(net)],
    title: 'Xác nhận uỷ thác stake',
    subtitle: 'Quét khuôn mặt hoặc vân tay để xác nhận pool bạn chọn',
  });

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
