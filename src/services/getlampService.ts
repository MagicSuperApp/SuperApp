/**
 * getlampService — GetLAMP / Activation Vault 2-pha (Wakeme v5, Issue #67/#92).
 *
 * ĐỌC (chạy được ngay với stub happy-path của BE):
 *   - getPot(): D một user mới sẽ nhận nếu GetLAMP ngay.
 *   - getVaultStatus(did): dashboard vault (phase/conditional_lamp/vested/MAGIC…).
 *
 * GHI (build → ký → submit): `getLamp()` build unsigned tx ở BE → WITNESS bằng Enclave
 *   (`taad.witnessUnsignedTx`, thêm vkey witness payment key) → submit.
 *
 * ⚠️ BE hiện STUB/501 (bật qua PHOENIXKEY_ACTIVATION_MOCK_MODE). Client sẵn sàng.
 */

import taad from '../sdk/taadEnclave';
import { phoenixKeyApi, type PotStatusResponse, type VaultStatusResponse, type GetLampSubmitResponse } from './phoenixKey-api';

/** Sức khoẻ pot (public). */
export async function getPot(): Promise<PotStatusResponse> {
  return phoenixKeyApi.getlamp.pot();
}

/** Dashboard vault của user (public). Ném lỗi nếu BE trả 501 (chưa nối logic). */
export async function getVaultStatus(did: string): Promise<VaultStatusResponse> {
  return phoenixKeyApi.getlamp.vaultStatus(did);
}

/**
 * Thực hiện GetLAMP (nạp D LAMP vào vault): build → ký (Enclave witness) → submit.
 *   1) BE build unsigned tx (spend pot → D LAMP vào vault user) cho `walletAddress`.
 *   2) Enclave witness bằng payment key `account` (seed không rời native).
 *   3) submit → txHash.
 * Trả GetLampSubmitResponse. Ném lỗi nếu BE 501 (chưa nối logic) / build / ký / submit lỗi.
 */
export async function getLamp(args: {
  kekHex: string;
  account: number;
  walletAddress: string;
  network: number;
}): Promise<GetLampSubmitResponse> {
  const built = await phoenixKeyApi.getlamp.build({ walletAddress: args.walletAddress });
  const signed = await taad.witnessUnsignedTx(
    args.kekHex,
    args.account,
    built.unsignedTxCbor,
    args.network,
  );
  return phoenixKeyApi.getlamp.submit(signed);
}
