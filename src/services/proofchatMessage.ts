/**
 * proofchatMessage.ts — Lớp keo (assemble/disassemble) nối crypto native `chatMls`
 * với wire payload socket.io ProofChat (`chatSocket.ts` / WS server D:\WS).
 *
 * ĐÂY LÀ PHẦN CLIENT-SIDE THUẦN, KHÔNG cần server: chỉ ghép/tháo envelope + gọi
 * Rust core. Nó là mảnh còn thiếu giữa `src/sdk/chatMls.ts` (3 tầng E2EE native)
 * và transport (`chatSocket.ts`).
 *
 * Hợp đồng khớp FE web (D:\FE hooks/useChat.ts doSend):
 *   encrypt → encryptedContent{opkId:'mls',type,body,mlsEpoch}
 *           → variants[{senderDeviceId, targetDeviceId:'*', encryptedContent}]
 *           → merkleLeaf (CHỈ DIRECT / JOB_NEGOTIATION)
 *           → MessagePayload (emit 'contract:message.send')
 * Server (D:\WS messaging.gateway.ts) đọc: conversationId,id,timestamp,mimeType,
 * merkleLeaf,variants,ciphertext,epoch — và TỰ gán senderId từ JWT (client gửi
 * senderId chỉ để tiện, server override). Nhận lại 'contract:message.new' (Message).
 *
 * ── ĐIỂM CHỜ SERVER/TEAM (không chặn lớp này, chỉ chặn NGƯỜI GỌI) ──────────────
 *  • `senderId` + `deviceId`: định danh MLS đa-thiết-bị — phụ thuộc quyết định
 *    stakeAddress+CIP-30 vs did:phoenix (câu hỏi định danh).
 *  • `session` (SessionDelegation): session key + COSE cert từ ví CIP-30 (web:
 *    useMerkleSession). VẮNG → bỏ qua Merkle, degrade mềm y hệt FE (createEmpty).
 */

import * as chatMls from '../sdk/chatMls';
import type { MessagePayload, EncryptedContent } from './chatSocket';
import type { ConversationType } from '../modules/chat/features/chat/types';

// ── Merkle scope: khớp FE needsMerkleVerification ──────────────────────────────

/** Chỉ hội thoại DIRECT / JOB_NEGOTIATION mới đính Merkle leaf (bằng chứng). */
export const needsMerkleVerification = (t: ConversationType): boolean =>
  t === 'DIRECT' || t === 'JOB_NEGOTIATION';

/**
 * Uỷ nhiệm session (từ ví CIP-30). Native tự ký leafHash bằng `seedHex`.
 * NGUỒN các trường này CHỜ chốt định danh — xem đầu file.
 */
export interface SessionDelegation {
  /** 32-byte Ed25519 seed của session key (hex) — native dùng để ký. */
  seedHex: string;
  /** delegationCert (base64) — ví ký uỷ nhiệm cho session key. */
  certificate: string;
  /** COSE key ví (base64). */
  walletCoseKey: string;
}

export interface OutgoingContext {
  conversationId: string;
  conversationType: ConversationType;
  /** stakeAddress/DID người gửi — server override bằng JWT, nhưng CẦN cho Merkle. */
  senderId: string;
  /** deviceId MLS (đa thiết bị). */
  deviceId: number | string;
  /** Uỷ nhiệm session — vắng ⇒ bỏ qua Merkle (degrade mềm). */
  session?: SessionDelegation;
  /** timestamp ms; mặc định Date.now(). Ký TRONG MerkleLeaf nên phải nhất quán. */
  timestamp?: number;
}

export interface AssembledOutgoing {
  /** Payload để `chatSocket.sendMessage()` (emit 'contract:message.send'). */
  payload: MessagePayload;
  /** salt tầng-2 (đã dùng cho cả Merkle) — tiện lưu plaintext-index cục bộ. */
  salt: string;
  epoch: number;
  /** Có đính Merkle leaf không (false khi không cần hoặc thiếu session). */
  merkleAttached: boolean;
}

export interface IncomingResult {
  messageId: string;
  conversationId: string;
  senderId: string;
  timestamp: number;
  /** Plaintext đã giải mã (tầng 2). */
  plaintext: string;
  epoch: number;
  /**
   * Kết quả verify Merkle: true/false nếu tin CÓ merkleLeaf; `null` nếu tin
   * không kèm Merkle (GROUP/THREAD hoặc gửi thiếu session).
   */
  merkleVerified: boolean | null;
}

// CiphertextMessageType cho MLS application — hằng số khớp EncryptedContent.type
// (chatSocket.ts) và FE (encrypted.type). MLS single-ciphertext fan-out.
const MLS_CIPHERTEXT_TYPE = 2 as const;

// ── Gửi: plaintext → MessagePayload ────────────────────────────────────────────

/**
 * Mã hoá + ráp 1 tin văn bản thành `MessagePayload` sẵn sàng gửi qua socket.
 * Yêu cầu: đã `chatMls.createGroup/joinFromWelcome` cho `conversationId` trước đó
 * (native giữ nhóm nội bộ). Ném nếu native chưa sẵn / chưa có nhóm.
 */
export async function assembleOutgoing(
  ctx: OutgoingContext,
  plaintext: string,
): Promise<AssembledOutgoing> {
  // Tầng 2: mã hoá (native tự sinh salt + messageId, trả kèm epoch).
  const enc = await chatMls.encrypt(ctx.conversationId, plaintext);
  const timestamp = ctx.timestamp ?? Date.now();

  const encryptedContent: EncryptedContent = {
    opkId: 'mls',
    type: MLS_CIPHERTEXT_TYPE,
    body: enc.body,
    mlsMessageType: 'application',
    mlsEpoch: enc.epoch,
  };
  const variants: MessagePayload['variants'] = [
    { senderDeviceId: ctx.deviceId, targetDeviceId: '*', encryptedContent },
  ];

  // Tầng 3: Merkle (chỉ DIRECT/JOB_NEGOTIATION + có session). Cùng salt với tầng 2.
  let merkleLeaf: Record<string, unknown> | undefined;
  if (needsMerkleVerification(ctx.conversationType) && ctx.session) {
    const leaf = await chatMls.createMerkleLeaf({
      conversationId: ctx.conversationId,
      senderId: ctx.senderId,
      timestampMs: timestamp,
      plaintext,
      saltHex: enc.salt,
      sessionSeedHex: ctx.session.seedHex,
      delegationCert: ctx.session.certificate,
      walletCoseKey: ctx.session.walletCoseKey,
    });
    merkleLeaf = leaf as unknown as Record<string, unknown>;
  }

  const payload: MessagePayload = {
    id: enc.messageId,
    senderId: ctx.senderId,
    conversationId: ctx.conversationId,
    timestamp,
    messageType: 'text',
    senderDeviceId: ctx.deviceId,
    encryptedContent,
    variants,
    merkleLeaf,
  };

  return { payload, salt: enc.salt, epoch: enc.epoch, merkleAttached: !!merkleLeaf };
}

// ── Nhận: MessagePayload → plaintext (+ verify Merkle) ─────────────────────────

/** Lấy envelope MLS: ưu tiên encryptedContent, rồi variant '*', rồi variant đầu. */
function pickEncryptedContent(m: MessagePayload): EncryptedContent | undefined {
  if (m.encryptedContent) return m.encryptedContent;
  const star = m.variants?.find((v) => v.targetDeviceId === '*');
  return star?.encryptedContent ?? m.variants?.[0]?.encryptedContent;
}

/** True khi merkleLeaf có nội dung thật (không phải rỗng/empty-leaf). */
function hasRealMerkle(leaf: Record<string, unknown> | undefined): boolean {
  if (!leaf) return false;
  const sig = leaf.signature;
  return typeof sig === 'string' && sig.length > 0;
}

/**
 * Giải mã + (nếu có) verify Merkle 1 tin nhận từ socket.
 * Yêu cầu: đã có nhóm native cho `conversationId` (đúng epoch — nếu tin ở epoch
 * mới hơn, xử lý `mls:sync.epoch`/`processCommit` trước rồi mới decrypt).
 */
export async function processIncoming(m: MessagePayload): Promise<IncomingResult> {
  const ec = pickEncryptedContent(m);
  if (!ec) {
    throw new Error('proofchatMessage: tin thiếu encryptedContent/variants');
  }
  const dec = await chatMls.decrypt(m.conversationId, ec.body);

  let merkleVerified: boolean | null = null;
  if (hasRealMerkle(m.merkleLeaf)) {
    try {
      merkleVerified = await chatMls.verifyMerkleLeaf({
        leaf: m.merkleLeaf as unknown as chatMls.MerkleLeaf,
        conversationId: m.conversationId,
        senderId: m.senderId,
        timestampMs: m.timestamp,
        plaintext: dec.plaintext,
        saltHex: dec.salt,
      });
    } catch {
      // Leaf hỏng/không hợp lệ → coi như KHÔNG xác thực (không ném, vẫn hiện tin).
      merkleVerified = false;
    }
  }

  return {
    messageId: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    timestamp: m.timestamp,
    plaintext: dec.plaintext,
    epoch: dec.epoch,
    merkleVerified,
  };
}

export default { needsMerkleVerification, assembleOutgoing, processIncoming };
