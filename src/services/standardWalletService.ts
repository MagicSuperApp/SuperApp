/**
 * Đăng-ký ví Standard (CIP-1852) lên PhoenixKey backend — API.md §7
 * `POST /wallet/standard/register`.
 *
 * VÌ SAO: `GET /wallet/{did}/all` chỉ trả ví Standard SAU khi client đăng-ký địa-chỉ.
 * Chưa đăng-ký thì user không thấy ví tự-kiểm-soát (chỉ có Phoenix custody nếu backend
 * derive sẵn) — đây là mảnh còn thiếu khiến màn Tài-khoản trống địa-chỉ.
 *
 * Client derive địa-chỉ TỪ Master_KEK (không rời khoá): fixed = account 0 (bắt buộc),
 * active = account N (nếu user đã xoay). `stake_address`: native CHƯA có deriveStakeAddress
 * → bỏ qua (spec cho optional). Idempotent — gọi lại chỉ cập-nhật active; backend KHÔNG
 * cho đổi fixed. Best-effort: nuốt lỗi (chưa có session/offline) → thử lại lần vào sau.
 */

import taad from '../sdk/taadEnclave';
import { getStoredMasterKek, getActiveAccountIndex } from './masterKekStore';
import { phoenixKeyApi } from './phoenixKey-api';

// 0 = preprod (testnet), khớp WALLET_NETWORK bên register + AccountScreen + PhoenixWalletScreen.
const WALLET_NETWORK = 0;

/**
 * Bảo đảm ví Standard đã đăng-ký với backend. Trả `true` nếu gọi register thành công
 * (hoặc đã có — idempotent), `false` nếu bỏ qua (thiếu native/KEK/session). Không ném.
 */
export async function ensureStandardWalletRegistered(): Promise<boolean> {
  try {
    if (!taad.isAvailable()) return false;
    const kek = await getStoredMasterKek();
    if (!kek) return false;

    const fixedAddress = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
    if (!fixedAddress) return false;

    const activeIdx = await getActiveAccountIndex();
    const activeAddress =
      activeIdx > 0
        ? await taad.deriveWalletAddress(kek, activeIdx, WALLET_NETWORK)
        : undefined;

    await phoenixKeyApi.wallet.standardRegister({
      fixedAddress,
      ...(activeAddress ? { activeAddress } : {}),
    });
    return true;
  } catch {
    // Best-effort: chưa có session token / offline / backend chưa bật → thử lại lần sau.
    return false;
  }
}
