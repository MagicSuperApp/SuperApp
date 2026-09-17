/**
 * config/magicVault.ts — cấu hình lớp ĐỌC-THÔI vault MAGIC (`VaultReadAPI`, nhà MAGIC).
 *
 * Ba giá trị đều do nhà MAGIC cấp, và CHƯA có lúc viết tệp này (2026-09-17): thư
 * `MAGIC-dang-mo-InstantGen-tren-Preprod-dung-man-hinh-ngay-2026-09-17.md` hứa gửi
 * `owner_pkh` "kèm tx trong thư sau", còn địa chỉ + thẻ bài (`VAULT_READ_API_TOKEN`,
 * bắt buộc khi mặt tiền bind ra ngoài loopback — `VaultReadAPI/README.md §5`) chưa hẹn
 * ngày. Đọc cả ba qua `@env`, đúng lối `phoenixWallet.ts`/`orilifeBase.ts`.
 *
 * KHÁC `orilifeBase.ts` ở một điểm cố ý: orilifeBase lui về `https://api.orilife.io`
 * khi biến trống, vì có một PROD THẬT để lui về. VaultReadAPI trên Preprod không có
 * địa chỉ mặc định nào an toàn — lui về bất cứ đâu là tự bịa một số dư. Nên thiếu biến
 * ở đây phải ra `null` (⇒ màn hiện "chưa cấu hình"), KHÔNG phải một URL đoán chừng.
 */

// @ts-ignore — react-native-dotenv nạp lúc build, không phải lúc biên dịch TS.
import { MAGIC_VAULT_API_URL, MAGIC_VAULT_OWNER_PKH, MAGIC_VAULT_API_TOKEN } from '@env';

/**
 * 56 ký tự hex thường — khoá băm thanh toán 28 byte của chủ vault. Cùng luật với phía
 * máy chủ (`VaultReadAPI/src/service.ts` hằng `PKH_HEX`): lệch luật ở đây thì một
 * `owner_pkh` mà app coi là "hợp lệ" có thể bị máy chủ trả `400 BAD_REQUEST`.
 */
const PKH_HEX = /^[0-9a-f]{56}$/;

export interface MagicVaultConfig {
  /** Gốc VaultReadAPI, KHÔNG có dấu `/` cuối. */
  baseUrl: string;
  /** `owner_pkh`, đã chuẩn hoá lowercase, đã kiểm đúng 56 hex. */
  ownerPkh: string;
  /**
   * Thẻ `Authorization: Bearer …`. Chuỗi rỗng = KHÔNG gửi header — hợp lệ khi mặt tiền
   * bind loopback; bind ra ngoài mà rỗng thì máy chủ tự trả 401, và đó đúng là lỗi cấu
   * hình cần THẤY, không phải lỗi lớp đọc nên tự che.
   */
  apiToken: string;
}

/**
 * Vế THUẦN — không đụng `@env`, để bài kiểm gọi thẳng mà không phải giả một module ảo.
 *
 * Trả `null` khi THIẾU địa chỉ HOẶC `ownerPkh` sai định dạng. Gộp hai lý do vào một kết
 * quả là cố ý: tầng UI chỉ cần biết "dùng được hay không", tầng gọi (service) mới cần
 * phân biệt "chưa cấu hình" khỏi các lỗi-mạng khác — và nó phân biệt được, vì `null` ở
 * đây luôn đi vào đúng một nhánh `not_configured`, không lẫn với lỗi HTTP nào.
 */
export function parseMagicVaultConfig(raw: {
  baseUrl?: string;
  ownerPkh?: string;
  apiToken?: string;
}): MagicVaultConfig | null {
  const baseUrl = (raw.baseUrl ?? '').trim().replace(/\/+$/, '');
  const ownerPkh = (raw.ownerPkh ?? '').trim().toLowerCase();
  const apiToken = (raw.apiToken ?? '').trim();
  if (!baseUrl || !PKH_HEX.test(ownerPkh)) return null;
  return { baseUrl, ownerPkh, apiToken };
}

/** Đọc cấu hình thật từ `@env`. `null` = chưa dùng được (thiếu, hoặc `owner_pkh` sai dạng). */
export function getMagicVaultConfig(): MagicVaultConfig | null {
  return parseMagicVaultConfig({
    baseUrl: MAGIC_VAULT_API_URL as string | undefined,
    ownerPkh: MAGIC_VAULT_OWNER_PKH as string | undefined,
    apiToken: MAGIC_VAULT_API_TOKEN as string | undefined,
  });
}
