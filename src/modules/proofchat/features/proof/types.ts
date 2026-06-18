// modules/proofchat/features/proof/types.ts
//
// Proof System types — ISOLATED layer.
//
// Trách nhiệm DUY NHẤT: kiểm chứng tin nhắn (hash, signature, Merkle proof).
// KHÔNG đụng tới blockchain, storage, transport — đó là việc của Application Layer.

/**
 * Trạng thái cuối cùng của quá trình kiểm chứng một tin nhắn.
 * - pending:  chưa kiểm chứng xong
 * - verified: hash + signature + Merkle proof đều khớp
 * - failed:   ít nhất một bước không khớp → không tin được
 */
export type VerificationStatus = 'pending' | 'verified' | 'failed';

/**
 * Bằng chứng (proof) đính kèm mỗi tin nhắn.
 * Đây là DTO mà Proof System đọc/ghi — UI chỉ hiển thị, không tự sinh.
 */
export interface MessageProof {
  hash: string;          // SHA-256 của plaintext (hex)
  signature: string;     // chữ ký số của hash bằng khóa người gửi
  merkleProof: string;   // bằng chứng Merkle (root + siblings, encoded)
}

/**
 * Lifecycle stage cho UI — granular hơn `VerificationStatus`.
 * Dùng để animate progress khi gửi / nhận.
 *
 * Outgoing pipeline:  encrypting → signing → sending → sent/delivered/read
 * Incoming pipeline:  encrypted → decrypting → verifying_signature → checking_integrity → done
 */
export type MessageStage =
  // Outgoing
  | 'composing'
  | 'encrypting'
  | 'signing'
  | 'sending'
  | 'queued'              // offline, chờ flush
  | 'sent'                // server ack
  | 'delivered'           // peer device ack
  | 'read'                // peer đã đọc
  | 'failed_send'
  // Incoming
  | 'encrypted'           // mới nhận, chưa giải mã
  | 'decrypting'
  | 'verifying_signature'
  | 'checking_integrity'
  | 'done';               // pipeline xong → xem verificationStatus

/**
 * Các stage thuộc giai đoạn “đang xử lý” — UI hiển thị spinner / progress chip.
 */
export const PROCESSING_STAGES: MessageStage[] = [
  'composing',
  'encrypting',
  'signing',
  'sending',
  'decrypting',
  'verifying_signature',
  'checking_integrity',
];

export const isProcessing = (stage: MessageStage) =>
  PROCESSING_STAGES.includes(stage);

export const isOutgoingStage = (stage: MessageStage) =>
  [
    'composing',
    'encrypting',
    'signing',
    'sending',
    'queued',
    'sent',
    'delivered',
    'read',
    'failed_send',
  ].includes(stage);
