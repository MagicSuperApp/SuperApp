/**
 * MobileCore — lỗi chuẩn dùng chung cho toàn bộ L0.
 * Mọi module L0 ném `MobileCoreError` với `code` ổn định (không đổi text để phân loại).
 * Text người-đọc để riêng ở tầng UI của platform, KHÔNG nhét vào đây (L0 không chạm UI/UX).
 */

/** Mã lỗi ổn định, phân nhóm theo domain E1–E4. Thêm mã mới ở cuối nhóm, KHÔNG đổi mã cũ. */
export type MobileCoreErrorCode =
  // net (E3)
  // Ghi chú phân loại auth (hợp đồng net↔sync, KHÔNG đổi tên):
  //   net/unauthorized     = phiên THẬT hết / credential vô hiệu → TERMINAL (retryable:false).
  //   net/auth-transient   = refresh chết TẠM THỜI (5xx/mạng) → RETRYABLE, sync KHÔNG dead-letter.
  //   net/conflict         = 409 (idempotency trùng / bản đã tồn tại) → retryable:false.
  | 'net/timeout'
  | 'net/aborted'
  | 'net/offline'
  | 'net/unauthorized'
  | 'net/auth-transient'
  | 'net/conflict'
  | 'net/rate-limited'
  | 'net/validation'
  | 'net/server'
  | 'net/unknown'
  // sync (E3)
  | 'sync/permanent'
  | 'sync/retry-exhausted'
  | 'sync/no-csprng'
  // geo (E4)
  | 'geo/invalid-polygon'
  | 'geo/gps-lost'
  // ml (E2)
  | 'ml/invalid-mask'
  | 'ml/invalid-input'
  | 'ml/no-target';

export class MobileCoreError extends Error {
  readonly code: MobileCoreErrorCode;
  /** Ngữ cảnh máy-đọc (không phải câu cho người dùng). */
  readonly detail?: Readonly<Record<string, unknown>>;
  /** true nếu tầng gọi CÓ THỂ thử lại (net/sync dùng để quyết retry). */
  readonly retryable: boolean;

  constructor(
    code: MobileCoreErrorCode,
    message: string,
    opts?: { detail?: Record<string, unknown>; retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = 'MobileCoreError';
    this.code = code;
    this.detail = opts?.detail;
    this.retryable = opts?.retryable ?? false;
    if (opts?.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

export function isMobileCoreError(e: unknown): e is MobileCoreError {
  return e instanceof MobileCoreError;
}
