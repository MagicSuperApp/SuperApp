/**
 * utils/magicVaultFormat.ts — hàm THUẦN dựng chữ hiển thị cho màn số dư MAGIC.
 * Không mạng, không `@env`, không React — tách riêng để bài kiểm không phải dựng
 * cả màn hình cho một phép quy đổi số.
 */

/** 1 MAGIC = 1 000 000 000 nanogic. Nguồn: `ProtocolUtils/src/index.ts` hằng
 *  `NANOGIC_PER_MAGIC` (kho `MagicLampEco/MAGIC`, đọc 2026-09-17). */
const NANOGIC_PER_MAGIC = 1_000_000_000n;

/**
 * nanogic (bigint) → chuỗi MAGIC thập phân, KHÔNG qua `Number` — tránh làm tròn nổi
 * (đúng luật server đã dặn ở `VaultReadAPI/README.md`: "mọi trường tiền là CHUỖI chữ
 * số", lý do là oildrop/nanogic có thể vượt ngưỡng an toàn 2^53 của IEEE-754).
 * Bỏ số 0 thừa ở phần thập phân; số dư đúng 0 nanogic ⇒ "0", không phải "0.".
 */
export function formatNanogicAsMagic(nanogic: bigint): string {
  const negative = nanogic < 0n;
  const abs = negative ? -nanogic : nanogic;
  const whole = abs / NANOGIC_PER_MAGIC;
  const frac = abs % NANOGIC_PER_MAGIC;
  const sign = negative ? '-' : '';
  if (frac === 0n) return `${sign}${whole.toString()}`;
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}.${fracStr}`;
}

/**
 * ms mỗi epoch GIAO THỨC trên Preprod (và Preview): đúng 1 ngày, KHÔNG trừ genesis.
 * Nguồn: `MagicLampEco/MAGIC/ProtocolUtils/src/index.ts` — `MS_PER_EPOCH_BY_NETWORK`
 * + hàm `posixMsToEpoch` (`epoch = posix_ms / ms_per_epoch(network)`), đọc 2026-09-17.
 *
 * Đây là apply-param của validator ở PHÍA KHÁC (đổi nó là đổi script hash bên đó) —
 * app chỉ SAO CHÉP CÓ NHÃN, không suy ra được từ phản hồi API. Mainnet dùng nhịp
 * khác (5 ngày); hằng số dưới đây CHỈ đúng cho Preprod/Preview — nơi hai cửa sinh
 * MAGIC (InstantGen/ScheduleGen) đang mở theo đúng thư nhà MAGIC 2026-09-17.
 */
export const MAGIC_PROTOCOL_MS_PER_EPOCH_PREPROD = 86_400_000;

/** Epoch GIAO THỨC → mốc POSIX ms. Ngược của `posixMsToEpoch` — không trừ genesis. */
export function protocolEpochToPosixMs(
  epoch: number,
  msPerEpoch: number = MAGIC_PROTOCOL_MS_PER_EPOCH_PREPROD,
): number {
  return epoch * msPerEpoch;
}

/** Giờ Việt Nam = UTC+7 quanh năm (không có giờ mùa hè). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface VnExpiryMoment {
  /** `'07:00'` — giờ:phút theo giờ VN, hai chữ số. */
  hhmm: string;
  /** Ngày trong tháng theo giờ VN (1–31). */
  day: number;
  /** Tháng theo giờ VN (1–12, KHÔNG lệch 0 như `Date#getMonth`). */
  month: number;
  /** Năm theo giờ VN. */
  year: number;
}

/**
 * `expires_at_epoch` của một batch (epoch GIAO THỨC, KHÔNG phải giây/mili-giây Unix)
 * → mốc hết hạn hiển thị theo giờ Việt Nam.
 *
 * Dùng trick "dịch mili-giây rồi đọc bằng getUTC*" để không phụ thuộc dữ liệu múi giờ
 * đầy đủ của ICU trên máy — Hermes trên RN không luôn có bộ ICU đủ cho
 * `Intl.DateTimeFormat` với `timeZone: 'Asia/Ho_Chi_Minh'`. `getUTCHours` trên một mốc
 * đã cộng sẵn UTC+7 cho ra đúng giờ VN, bất kể múi giờ của thiết bị.
 */
export function expiresAtEpochToVnMoment(expiresAtEpoch: number): VnExpiryMoment {
  const posixMs = protocolEpochToPosixMs(expiresAtEpoch);
  const vnShifted = new Date(posixMs + VN_OFFSET_MS);
  return {
    hhmm: `${pad2(vnShifted.getUTCHours())}:${pad2(vnShifted.getUTCMinutes())}`,
    day: vnShifted.getUTCDate(),
    month: vnShifted.getUTCMonth() + 1,
    year: vnShifted.getUTCFullYear(),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
