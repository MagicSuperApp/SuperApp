/**
 * wakemeService — WakeMe / Activation Vault 2 pha (trước đây gọi là GetLAMP).
 *
 * ĐỌC (dùng được ngay):
 *   - `getPot()`         : D một người mới sẽ nhận nếu WakeMe bây giờ.
 *   - `isFeatureOpen()`  : tính năng đã mở trên máy chủ chưa (đầu dò tầng 2).
 *   - `getVaultStatus()` : bảng vault — máy chủ hiện ném 501 vô điều kiện.
 *
 * GHI (build → ký → submit): CHƯA CHẠY ĐƯỢC. Xem `getLamp()` bên dưới — chặn nằm ở
 * lớp native, không phải ở TypeScript.
 *
 * Thay cho `getlampService.ts` (tệp đó không nơi nào import — mã chết từ lâu).
 */

import taad from '../sdk/taadEnclave';
import {
  phoenixKeyApi,
  PhoenixKeyApiError,
  type PotStatusResponse,
  type VaultStatusResponse,
  type WakeMeSubmitResponse,
} from './phoenixKey-api';

/** Mã lỗi backend: tính năng chưa cấu hình trên máy chủ (HTTP 501). */
export const WAKEME_NOT_CONFIGURED = 9501;

/** Sức khoẻ pot (công khai, không cần đăng nhập). */
export async function getPot(): Promise<PotStatusResponse> {
  return phoenixKeyApi.wakeme.pot();
}

export type FeatureProbe =
  | { open: true; pot: PotStatusResponse }
  | { open: false; code: number; message: string };

/**
 * Máy chủ SỐNG khác với tính năng ĐÃ MỞ.
 *
 * `useCapabilityLive('phoenix')` chỉ thăm `/actuator/health` — cửa đó trả 200 kể cả
 * khi ba biến môi trường activation-vault còn trống. Đầu dò đúng là `/wakeme/pot`:
 * công khai, không cần Bearer, không đụng ví của ai, và ném đúng 9501 khi máy chủ
 * chưa cấu hình (`ActivationVaultServiceImpl.java:192-195`).
 *
 * KHÔNG ném — trả trạng thái, để màn hình nói thật thay vì hiện một con số bịa.
 */
export async function isFeatureOpen(): Promise<FeatureProbe> {
  try {
    return { open: true, pot: await getPot() };
  } catch (e) {
    const err = e as PhoenixKeyApiError;
    return {
      open: false,
      code: typeof err?.code === 'number' ? err.code : -1,
      message: typeof err?.message === 'string' ? err.message : 'Không rõ lỗi.',
    };
  }
}

/**
 * Bảng vault của một DID (công khai).
 * ⚠️ Máy chủ ném 501 KHÔNG ĐIỀU KIỆN ở đường thật
 * (`ActivationVaultServiceImpl.java:158-159`, lý do: chưa có UTxO vault nào trên
 * preprod). Nơi gọi phải chuẩn bị sẵn nhánh "chưa mở", đừng vẽ ô rỗng đầy số 0.
 */
export async function getVaultStatus(did: string): Promise<VaultStatusResponse> {
  return phoenixKeyApi.wakeme.vaultStatus(did);
}

/**
 * ⛔ CHƯA DÙNG ĐƯỢC — chặn ở lớp native, không phải ở đây.
 *
 * Máy chủ dựng tx đòi HAI chữ ký bắt buộc (`GetLampTxBuilder.java:148-157`):
 *   · `controller_pkh` = băm TAAD_Key (suy từ Master_KEK)
 *   · `device_pkh`     = khoá thiết bị 2FA
 * Cả hai đọc từ datum neo TAAD trên chuỗi. Nhưng `taad.witnessUnsignedTx`
 * (`rust/taad_enclave_core/src/transfer.rs:319-322`) ký bằng khoá THANH TOÁN
 * CIP-1852 — một khoá thứ ba, không phải hai khoá trên. Rà hết cầu nối ở
 * `src/sdk/taadEnclave.ts:22-60`: không hàm nào tạo được hai chữ ký đó.
 *
 * Nếu cứ chạy, `build` sẽ thành công, người dùng bấm xác nhận, ký xong, rồi
 * `submit` mới bị chuỗi từ chối vì thiếu chữ ký bắt buộc — hỏng ở bước cuối, sau
 * khi đã hứa. Đó là kiểu hỏng tệ nhất, nên chặn NGAY ĐẦU HÀM, trước mọi lời gọi mạng.
 *
 * Mã dựng/nộp bên dưới đã đúng và được giữ nguyên: mở khoá = thêm hai hàm FFI Rust
 * + cầu nối Swift/Kotlin + dựng lại native. Không xoá hàm này.
 */
export async function getLamp(args: {
  kekHex: string;
  account: number;
  walletAddress: string;
  network: number;
}): Promise<WakeMeSubmitResponse> {
  throw new Error(
    'WakeMe chưa nhận được: bản ứng dụng này chưa ký được bằng khoá TAAD và khoá thiết bị. '
    + 'Chờ bản cập nhật.',
  );

  // eslint-disable-next-line no-unreachable
  const built = await phoenixKeyApi.wakeme.build({ walletAddress: args.walletAddress });
  const signed = await taad.witnessUnsignedTx(
    args.kekHex,
    args.account,
    built.unsignedTxCbor,
    args.network,
  );
  return phoenixKeyApi.wakeme.submit(signed);
}
