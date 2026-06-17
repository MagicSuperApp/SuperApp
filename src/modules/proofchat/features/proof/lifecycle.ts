// modules/proofchat/features/proof/lifecycle.ts
//
// State machine cho proof lifecycle (UI mô phỏng — không có crypto thật).
// Application Layer dispatch các stage theo timing dưới đây để hiển thị progress.

import type { MessageStage, VerificationStatus } from './types';

export interface StageStep {
  stage: MessageStage;
  /** Delay (ms) sau stage trước đó */
  delayMs: number;
  /** Nhãn hiển thị cho UI */
  label: string;
}

/** Pipeline khi user gửi 1 tin nhắn. */
export const OUTGOING_PIPELINE: StageStep[] = [
  { stage: 'encrypting', delayMs: 0,   label: 'Đang mã hóa…' },
  { stage: 'signing',    delayMs: 350, label: 'Đang ký…' },
  { stage: 'sending',    delayMs: 350, label: 'Đang gửi…' },
  { stage: 'sent',       delayMs: 400, label: 'Đã gửi' },
];

/** Pipeline khi nhận 1 tin nhắn (sau khi user chạm vào để giải mã). */
export const INCOMING_PIPELINE: StageStep[] = [
  { stage: 'decrypting',           delayMs: 0,   label: 'Đang giải mã…' },
  { stage: 'verifying_signature',  delayMs: 450, label: 'Đang xác thực chữ ký…' },
  { stage: 'checking_integrity',   delayMs: 450, label: 'Đang kiểm tra tính toàn vẹn…' },
  { stage: 'done',                 delayMs: 400, label: 'Hoàn tất' },
];

/** Nhãn ngắn cho stage — dùng trong bubble / chip. */
export const STAGE_LABEL: Record<MessageStage, string> = {
  composing:            'Đang soạn',
  encrypting:           'Mã hóa',
  signing:              'Ký số',
  sending:              'Đang gửi',
  queued:               'Chờ đồng bộ',
  sent:                 'Đã gửi',
  delivered:            'Đã chuyển',
  read:                 'Đã đọc',
  failed_send:          'Gửi thất bại',
  encrypted:            'Đã mã hóa',
  decrypting:           'Giải mã',
  verifying_signature:  'Xác thực chữ ký',
  checking_integrity:   'Kiểm tra toàn vẹn',
  done:                 'Hoàn tất',
};

/**
 * Khi pipeline chạy xong, suy ra verificationStatus.
 * Trong UI mock: đa số → 'verified'. Một số ít có thể fail để demo.
 */
export const finalStatusFor = (
  msgId: string,
): VerificationStatus => {
  // Demo: id kết thúc bằng "fail" → failed; còn lại verified.
  if (msgId.endsWith('-fail')) return 'failed';
  return 'verified';
};
