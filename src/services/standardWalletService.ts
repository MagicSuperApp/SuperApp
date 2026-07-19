/**
 * Đăng-ký ví Standard (CIP-1852) lên PhoenixKey backend — API.md §7
 * `POST /wallet/standard/register`.
 *
 * VÌ SAO: `GET /wallet/{did}/all` chỉ trả ví Standard SAU khi client đăng-ký địa-chỉ.
 * Chưa đăng-ký thì user không thấy ví tự-kiểm-soát (chỉ có Phoenix custody nếu backend
 * derive sẵn) — đây là mảnh còn thiếu khiến màn Tài-khoản trống địa-chỉ.
 *
 * Client derive địa-chỉ TỪ Master_KEK (không rời khoá): fixed = account 0 (bắt buộc),
 * active = account N (nếu user đã xoay), stake = role 2 CIP-1852 (m/1852'/1815'/0'/2/0)
 * — cho staking/delegate sau này. Idempotent — gọi lại cập-nhật active/stake; backend
 * KHÔNG cho đổi fixed. Best-effort: nuốt lỗi (chưa có session/offline) → thử lại lần sau.
 */

import taad from '../sdk/taadEnclave';
import { currentUserDid } from '../sdk/phoenixKey';
import { getStoredMasterKek, getActiveAccountIndex } from './masterKekStore';
import { phoenixKeyApi, PhoenixKeyApiError } from './phoenixKey-api';
import rLog from './remoteLogger';

// 0 = preprod (testnet), khớp WALLET_NETWORK bên register + AccountScreen + PhoenixWalletScreen.
const WALLET_NETWORK = 0;

// Prefix challenge proof-of-ownership — KHỚP backend WalletV2ServiceImpl.REGISTER_PREFIX.
// Đổi ở đây mà không đổi backend → chữ ký fail (WALLET_PAYMENT_SIGNATURE_INVALID).
const REGISTER_CHALLENGE_PREFIX = 'PHOENIXKEY_WALLET_STANDARD_REGISTER:';

/**
 * Bảo đảm ví Standard đã đăng-ký với backend. Trả `true` nếu gọi register thành công
 * (hoặc đã có — idempotent), `false` nếu bỏ qua (thiếu native/KEK/session). Không ném.
 */
export async function ensureStandardWalletRegistered(): Promise<boolean> {
  let step = 'available';
  try {
    const available = taad.isAvailable();
    rLog.phoenixWallet.walletStart(available);
    if (!available) return false;

    step = 'kek';
    const kek = await getStoredMasterKek();
    rLog.phoenixWallet.walletKek(!!kek);
    if (!kek) return false;

    step = 'derive';
    const fixedAddress = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
    if (!fixedAddress) {
      rLog.phoenixWallet.walletDerive(false, false, false);
      return false;
    }

    const activeIdx = await getActiveAccountIndex();
    const activeAddress =
      activeIdx > 0
        ? await taad.deriveWalletAddress(kek, activeIdx, WALLET_NETWORK)
        : undefined;

    // stake_address (role 2, CIP-1852) — cùng account với ví cố-định. Best-effort:
    // máy chưa cập-nhật native (thiếu deriveStakeAddress) → bỏ qua, backend cho optional.
    let stakeAddress: string | undefined;
    try {
      stakeAddress = (await taad.deriveStakeAddress(kek, 0, WALLET_NETWORK)) || undefined;
    } catch {
      stakeAddress = undefined;
    }
    rLog.phoenixWallet.walletDerive(!!fixedAddress, !!activeAddress, !!stakeAddress);

    // ── Proof-of-ownership (Issue #47) ────────────────────────────────────────
    // Backend đòi ký challenge canonical bằng PAYMENT key của fixedAddress (account
    // 0). Thiếu → 400 code 9800. userDid cần cho challenge; nonce dùng-1-lần (reuse
    // generateSalt = 16 byte hex = khớp regex ^[0-9a-fA-F]{32,}$).
    step = 'proof';
    const userDid = await currentUserDid();
    if (!userDid) {
      rLog.phoenixWallet.walletProof(false, false);
      return false;
    }
    const nonce = await taad.generateSalt();
    const challenge = `${REGISTER_CHALLENGE_PREFIX}${userDid}:${fixedAddress}:${nonce}`;
    // fixedAddress = account 0 → ký bằng payment key account 0.
    const proof = await taad.signWalletRegister(kek, 0, challenge);
    rLog.phoenixWallet.walletProof(!!proof.paymentPublicKeyHex, !!proof.signature);

    step = 'register';
    await phoenixKeyApi.wallet.standardRegister({
      fixedAddress,
      ...(activeAddress ? { activeAddress } : {}),
      ...(stakeAddress ? { stakeAddress } : {}),
      paymentPublicKeyHex: proof.paymentPublicKeyHex,
      signature: proof.signature,
      nonce,
    });
    rLog.phoenixWallet.walletRegisterDone(true);
    return true;
  } catch (err) {
    // Best-effort: chưa có session token / offline / backend chưa bật → thử lại lần sau.
    // Log lỗi THẬT để biết bước nào hỏng (thường là register → 401 thiếu session token).
    if (err instanceof PhoenixKeyApiError) {
      rLog.phoenixWallet.walletError(step, err.code, err.httpStatus, err.message);
    } else {
      rLog.phoenixWallet.walletError(step, -1, 0, err instanceof Error ? err.message : String(err));
    }
    return false;
  }
}
