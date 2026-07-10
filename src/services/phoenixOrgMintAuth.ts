/**
 * PhoenixOrgMintAuth — gate sinh trắc + mở Master_KEK cho luồng "tạo OrgDID +
 * mint LAMP" (`src/modules/phoenixOrgMint`).
 *
 * GAP KIẾN TRÚC ĐƯỢC GHI RÕ (khảo sát trước khi code — xem báo cáo agent):
 * SuperApp CHƯA có vault lưu Master_KEK có bảo vệ (Keystore/Secure Enclave
 * symmetric wrap). `SeedExportScreen`/`RestoreIdentityScreen` hiện chỉ generate/
 * validate Master_KEK trong RAM rồi bỏ — KHÔNG persist. Xây vault thật (native
 * Keystore AES key + `taad_pbkdf2_derive`/`taad_aes_gcm_encrypt` đã có sẵn ở
 * Rust nhưng CHƯA bridge) là việc lớn, cần thiết bị thật để verify — NGOÀI
 * PHẠM VI đợt này (xem báo cáo). MVP ở đây dùng 2 lớp:
 *
 *   1. GATE SINH TRẮC THẬT (KHÔNG native code mới): tái dùng
 *      `PhoenixKeyModule` (Android Keystore / iOS Secure Enclave, ĐÃ build +
 *      dùng ở `phoenixKeyAuthService.ts`) — ký 1 challenge ngẫu nhiên bằng 1
 *      khoá alias riêng `requireBiometric=true`. Keystore/Secure Enclave TỰ
 *      chặn nếu sinh trắc thất bại/huỷ (ném lỗi `USER_CANCELED`/
 *      `BIOMETRIC_LOCKOUT`...) — đây là biometric gate THẬT, không giả lập.
 *   2. NHẬP LẠI 24 TỪ mỗi phiên ký (dùng `taadEnclave.mnemonicToMasterKek`,
 *      ĐÃ bridge sẵn) — Master_KEK chỉ tồn tại trong RAM lúc ráp tx, XOÁ ngay
 *      sau khi dùng. An toàn (không có gì để rò rỉ ở rest) nhưng UX kém (nhập
 *      lại mỗi lần) — nâng cấp lên vault lưu là việc kế tiếp.
 */

import { generateKeypair, hasKey, sign, isAvailable as isHwKeyAvailable } from './phoenixKey-native';
import taadEnclave from '../sdk/taadEnclave';

/** Alias khoá Keystore/Secure Enclave DÀNH RIÊNG cho gate sinh trắc OrgMint —
 * KHÔNG dùng chung alias với ví Phượng hoàng (mỗi mục đích 1 alias, tránh
 * nhầm lẫn/side-effect chéo giữa các luồng ký). */
const BIOMETRIC_GATE_ALIAS = 'phoenixOrgMint.biometricGate.v1';

export class OrgMintBiometricUnavailableError extends Error {
  constructor() {
    super(
      'Thiết bị chưa hỗ trợ gate sinh trắc (PhoenixKeyModule không khả dụng trên nền tảng này).',
    );
    this.name = 'OrgMintBiometricUnavailableError';
  }
}

/**
 * Buộc BiometricPrompt/Face ID xuất hiện TRƯỚC khi cho nhập Master_KEK/24 từ.
 * Ký 1 challenge ngẫu nhiên (nội dung KHÔNG quan trọng, KHÔNG verify lại —
 * mục đích DUY NHẤT là để Keystore/Secure Enclave tự chặn nếu sinh trắc thất
 * bại). Ném lỗi nếu người dùng huỷ/sinh trắc thất bại/khoá bị lockout.
 */
export async function ensureBiometricGate(
  promptTitle: string,
  promptSubtitle?: string,
): Promise<void> {
  if (!isHwKeyAvailable()) {
    throw new OrgMintBiometricUnavailableError();
  }
  const has = await hasKey(BIOMETRIC_GATE_ALIAS).catch(() => false);
  if (!has) {
    // requireBiometric=true — SAU bước này, mọi sign() bằng alias này đều đòi
    // sinh trắc (Android Keystore setUserAuthenticationRequired / iOS Secure
    // Enclave .biometryCurrentSet).
    await generateKeypair(BIOMETRIC_GATE_ALIAS, true);
  }
  // Challenge ngẫu nhiên: mượn taad_generate_master_kek (đã bridge, RNG mật ở
  // Rust) làm nguồn 32-byte hex — KHÔNG dùng làm KEK thật, chỉ làm payload ký.
  const challengeHex = await taadEnclave.generateMasterKek();
  await sign(BIOMETRIC_GATE_ALIAS, challengeHex, promptTitle, promptSubtitle);
}

/**
 * Mở Master_KEK từ 24 từ BIP39 do người dùng nhập lại MỖI PHIÊN ký (KHÔNG có
 * vault lưu — xem doc đầu file). Caller PHẢI gọi `ensureBiometricGate` trước
 * khi hiện ô nhập 24 từ (che màn nhập bằng sinh trắc), rồi gọi hàm này để lấy
 * Master_KEK, dùng NGAY để build tx, rồi để biến đó ra khỏi scope (không giữ
 * lại/cache).
 */
export async function unlockMasterKekFromMnemonic(words: string): Promise<string> {
  return taadEnclave.mnemonicToMasterKek(words);
}
