/**
 * Câu lỗi từ lõi bảo mật (Rust FFI) → câu cho người đọc (Issue #285).
 *
 * ── Vấn đề đang gỡ ────────────────────────────────────────────────────────
 * Trước đây tầng FFI trả `null` cho MỌI kiểu hỏng: đối số sai định dạng, seed
 * sai độ dài, UTxO không đủ, và cả những cửa chặn CÓ CHỦ Ý mà lõi đã viết sẵn
 * câu giải thích kèm điều kiện mở khoá. Không câu nào ra tới ngoài, nên người
 * nối cầu thấy một hàm im lặng trả rỗng và đi tìm lỗi ở tầng khác.
 *
 * Nay lõi giữ ô lỗi theo luồng (`taad_last_error`), cầu Kotlin/Swift đọc nó và
 * `reject` kèm đúng câu đó. Tệp này là chốt cuối trước khi câu ấy lên màn.
 *
 * ── Hai luật, và chúng kéo ngược chiều nhau ───────────────────────────────
 * 1. Lõi có câu thì HIỆN CÂU CỦA LÕI. "recovery builders disabled: … unblock by
 *    migrating to the recovery_timelock_ms ABI" nói được phải làm gì; "có lỗi
 *    xảy ra" thì không.
 * 2. Nhưng câu lỗi hệ thống THÔ — vết ngăn xếp, đường dẫn nội bộ, chuỗi hex
 *    dài — thì KHÔNG hiện. Đã có một lần một khoá đi ra ngoài theo vết ngăn xếp
 *    của một thư viện ngoài. Ca đó trả về MÃ TRA NGƯỢC, và bản đầy đủ chỉ nằm
 *    ở nhật ký.
 *
 * Ranh giới giữa hai luật là `isSafeToShow` bên dưới: nó đo DẤU HIỆU của câu
 * thô, không đoán ý. Không chắc thì rơi về mã tra ngược — sai theo chiều kín
 * miệng, vì chiều kia là chiều đã có giá phải trả.
 */

import { tk } from '../i18n/keys';

/** Vết ngăn xếp / thông điệp gỡ lỗi của máy — không bao giờ lên màn. */
const RAW_SYSTEM_MARKERS = [
  'panicked at',
  "thread '",
  'Traceback (most recent call last)',
  'stack backtrace',
  '\n    at ',
  '\n\tat ',
];

/** Đường dẫn tuyệt đối trong máy của người dựng — lộ cấu trúc máy chủ/máy build. */
const ABSOLUTE_PATH = /(?:^|[\s(])(?:\/Users\/|\/home\/|\/var\/|\/private\/|[A-Za-z]:\\)/;

/** Chuỗi hex ≥32 ký tự: khoá, seed, pubkey, CBOR giao dịch. */
const LONG_HEX = /\b[0-9a-fA-F]{32,}\b/g;

/** Cụm ≥12 từ thường liền nhau — hình dạng của một cụm khôi phục BIP39. */
const MNEMONIC_SHAPE = /\b(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\b/;

/** Quá dài thì gần như chắc chắn là kết xuất của máy, không phải câu cho người. */
const MAX_SHOWN_LENGTH = 300;

export interface EnclaveFailure {
  /** Câu đưa lên màn. Hoặc câu của lõi, hoặc câu kèm mã tra ngược. */
  message: string;
  /** Mã tra ngược ở nhật ký; `null` khi câu của lõi hiện thẳng được. */
  referenceCode: string | null;
  /** Bản ĐẦY ĐỦ để ghi nhật ký. Không bao giờ đưa lên màn khi có mã tra ngược. */
  raw: string;
}

/** Lấy chuỗi lỗi ra khỏi thứ mà `reject`/`throw` ném lên. */
export function rawEnclaveMessage(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err.trim();
  if (err instanceof Error) return String(err.message ?? '').trim();
  const maybe = err as { message?: unknown };
  if (typeof maybe.message === 'string') return maybe.message.trim();
  return '';
}

/** Thay mọi chuỗi hex dài bằng nhãn — giữ được câu, bỏ được giá trị. */
function redactLongHex(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const out = text.replace(LONG_HEX, () => {
    redacted = true;
    return '[đã lược]';
  });
  return { text: out, redacted };
}

/**
 * Câu này có phải câu VIẾT CHO NGƯỜI ĐỌC không?
 *
 * Đo dấu hiệu của kết xuất máy. Trả `false` là "không chắc", và không chắc thì
 * đi đường mã tra ngược.
 */
export function isSafeToShow(text: string): boolean {
  if (!text) return false;
  if (text.length > MAX_SHOWN_LENGTH) return false;
  if (RAW_SYSTEM_MARKERS.some((m) => text.includes(m))) return false;
  if (ABSOLUTE_PATH.test(text)) return false;
  if (MNEMONIC_SHAPE.test(text)) return false;
  return true;
}

/**
 * Mã tra ngược ổn định theo nội dung câu lỗi (FNV-1a 32-bit).
 *
 * Ổn định có chủ ý: cùng một lỗi thì cùng một mã, nên hai người báo cùng mã là
 * cùng một lỗi. Nó KHÔNG phải mã bí mật — chỉ là chỗ bấu để tra nhật ký.
 */
export function enclaveReferenceCode(raw: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `ENCLAVE-${h.toString(16).padStart(8, '0').toUpperCase()}`;
}

/**
 * `method` = tên hàm đã gọi (để người đọc nhật ký biết chỗ), `err` = thứ cầu
 * native ném lên.
 */
export function describeEnclaveFailure(method: string, err: unknown): EnclaveFailure {
  const raw = rawEnclaveMessage(err);

  if (!raw) {
    // Lõi im lặng. Nói thẳng là im lặng — đừng dựng một lý do nghe như thật,
    // vì người đọc sẽ đi sửa đúng cái lý do bịa đó.
    return {
      message: tk('identity.enclave.noReason', { method }),
      referenceCode: null,
      raw: '',
    };
  }

  const { text: scrubbed } = redactLongHex(raw);

  if (isSafeToShow(scrubbed)) {
    return { message: scrubbed, referenceCode: null, raw };
  }

  const referenceCode = enclaveReferenceCode(raw);
  return {
    message: tk('identity.enclave.systemError', { code: referenceCode }),
    referenceCode,
    raw,
  };
}
