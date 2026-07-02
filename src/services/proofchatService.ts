/**
 * proofchatService.ts — Orchestration ProofChat: ghép 3 mảnh thành luồng gửi/nhận thật.
 *
 *   chatMls (native, src/sdk/chatMls.ts)  — crypto 3 tầng MLS/message/Merkle
 *   chatSocket (src/services/chatSocket)  — realtime socket.io /chat
 *   proofChatApi (src/services/proofchat-api) — REST BE (auth, keypackage, epoch-sync, lịch sử)
 *
 * Luồng:
 *   init(stakeAddress) → auth (PhoenixKey→JWT) → nạp/khởi tạo danh tính MLS → publish
 *     KeyPackage → connect socket → lắng nghe contract:message.new + mls:sync.epoch.
 *   sendText(convId, text) → chatMls.encrypt (tầng 2, epoch_secret của nhóm) → emit
 *     contract:message.send.
 *   nhận contract:message.new → chatMls.decrypt → callback ra UI.
 *   nhận mls:sync.epoch → chatMls.joinFromWelcome / processCommit → persist.
 *
 * ⚠️ Merkle (tầng 3) chưa nối ở đây: cần expose create/verify_merkle_leaf qua FFI +
 * session delegation COSE từ ví (CIP-30). Xem TODO bên dưới. Tin vẫn E2EE (tầng 1+2).
 */
import chatMls from '../sdk/chatMls';
import * as taad from '../sdk/taadEnclave';
import chatSocket, { EncryptedContent, EpochSyncWire, MessagePayload } from './chatSocket';
import { proofChatApi, isProofChatBackendEnabled } from './proofchat-api';
import { connectProofChat } from './proofchatAuthBridge';

const CIPHERSUITE = 'MLS_128_DHKEMP256_AES128GCM_SHA256_P256';
const DEVICE_ID = '1'; // MVP 1 thiết bị/tài khoản (như web MLSContext deviceId='1')
const STATE_KEY = 'chat_mls_state'; // blob export chatMls, cất qua TaadEnclave secureStore

/** Tin đã giải mã, đẩy ra UI. */
export interface DecryptedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  isMine: boolean;
  timestamp: number;
  plaintext: string;
  epoch: number;
}

export interface InitResult {
  status: 'ready' | 'disabled' | 'no-phoenix-session' | 'error';
  message?: string;
}

type MessageHandler = (m: DecryptedMessage) => void;

let currentStakeAddress: string | null = null;
let messageHandler: MessageHandler | null = null;
const unsub: Array<() => void> = [];

/** Đăng ký nơi nhận tin đã giải mã (Redux/Screen gọi trước init). */
export function onDecryptedMessage(cb: MessageHandler): void {
  messageHandler = cb;
}

/** Lưu trạng thái chatMls (chứa khoá) — mã hoá phần cứng qua TaadEnclave secureStore. */
async function persistState(): Promise<void> {
  try {
    const blob = await chatMls.exportState();
    await taad.secureStore(STATE_KEY, blob);
  } catch {
    /* không chặn luồng chat nếu persist lỗi */
  }
}

/** Nạp danh tính MLS: khôi phục state cũ nếu có, không thì tạo mới + publish KeyPackage. */
async function ensureIdentity(stakeAddress: string): Promise<void> {
  let restored = false;
  try {
    const blob = await taad.secureLoad(STATE_KEY);
    if (blob) {
      await chatMls.importState(blob);
      restored = true;
    }
  } catch {
    restored = false;
  }
  if (!restored) {
    await chatMls.newIdentity(stakeAddress);
    await persistState();
  }

  // Publish KeyPackage nếu server chưa có (hoặc luôn re-publish khi mới tạo).
  try {
    const status = await proofChatApi.mls.keyPackageStatus().catch(() => ({ exists: false }));
    if (!status?.exists || !restored) {
      const keyPackage = await chatMls.generateKeyPackage();
      await proofChatApi.mls.publishKeyPackage({ deviceId: DEVICE_ID, keyPackage, ciphersuite: CIPHERSUITE });
      await persistState();
    }
  } catch {
    /* publish lỗi không chặn — có thể publish lại sau */
  }
}

/** Khởi tạo phiên chat đầy đủ. Không throw — trả InitResult để UI hiển thị. */
export async function init(stakeAddress: string): Promise<InitResult> {
  if (!isProofChatBackendEnabled()) return { status: 'disabled' };
  if (!chatMls.isAvailable()) return { status: 'error', message: 'Native chat_mls chưa sẵn sàng' };

  const authRes = await connectProofChat();
  if (authRes.status === 'disabled') return { status: 'disabled' };
  if (authRes.status === 'no-phoenix-session') return { status: 'no-phoenix-session' };
  if (authRes.status === 'error') return { status: 'error', message: authRes.message };

  try {
    currentStakeAddress = stakeAddress;
    await ensureIdentity(stakeAddress);
    await chatSocket.connect();
    wireSocketHandlers();
    return { status: 'ready' };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'init thất bại' };
  }
}

export async function shutdown(): Promise<void> {
  unsub.forEach((fn) => fn());
  unsub.length = 0;
  chatSocket.disconnect();
  await chatMls.freeIdentity().catch(() => undefined);
  currentStakeAddress = null;
}

// ── Gửi tin ──────────────────────────────────────────────────────────

/** Mã hoá + gửi 1 tin văn bản. Trả messageId khi ack thành công. */
export async function sendText(conversationId: string, text: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!currentStakeAddress) return { ok: false, error: 'chưa init' };
  try {
    const enc = await chatMls.encrypt(conversationId, text);
    const encryptedContent: EncryptedContent = {
      opkId: 'mls',
      type: 2,
      body: enc.body,
      mlsMessageType: 'application',
      mlsEpoch: enc.epoch,
    };
    const payload: MessagePayload = {
      id: enc.messageId,
      senderId: currentStakeAddress,
      conversationId,
      timestamp: Date.now(),
      messageType: 'text',
      senderDeviceId: DEVICE_ID,
      encryptedContent,
      variants: [{ senderDeviceId: DEVICE_ID, targetDeviceId: '*', encryptedContent }],
      // TODO(Merkle tầng 3): với hội thoại DIRECT/JOB_NEGOTIATION, gắn merkleLeaf =
      // chatMls.createMerkleLeaf(...) (cần expose FFI + session delegation COSE từ ví).
    };
    const ack = await chatSocket.sendMessage(payload);
    if (!ack?.success) return { ok: false, error: ack?.error ?? 'gửi thất bại' };
    return { ok: true, messageId: ack.messageId ?? enc.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'lỗi gửi' };
  }
}

// ── Nhận tin + epoch-sync ────────────────────────────────────────────

function wireSocketHandlers(): void {
  unsub.push(
    chatSocket.onMessage(async (m: MessagePayload) => {
      try {
        const body = m.encryptedContent?.body;
        if (!body) return;
        const dec = await chatMls.decrypt(m.conversationId, body);
        messageHandler?.({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          isMine: m.senderId === currentStakeAddress,
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
          plaintext: dec.plaintext,
          epoch: dec.epoch,
        });
      } catch {
        /* tin không giải mã được (trước khi join / thiếu epoch_secret) — bỏ qua */
      }
    }),
  );

  unsub.push(
    chatSocket.onEpochSync(async (r: EpochSyncWire) => {
      try {
        if (r.mlsMessageType === 'welcome' && r.welcomeMessage) {
          await chatMls.joinFromWelcome(r.welcomeMessage);
        } else if (r.commitMessage) {
          await chatMls.processCommit(r.conversationId, r.commitMessage);
        }
        await persistState();
      } catch {
        /* epoch-sync lỗi — sẽ đồng bộ lại khi mở hội thoại */
      }
    }),
  );
}

// ── Tạo / mở hội thoại (DIRECT) ──────────────────────────────────────

/**
 * Tạo hội thoại DIRECT với 1 người + khởi tạo nhóm MLS.
 * Lấy KeyPackage của đối phương → chatMls.createGroup → publish epoch-sync (Welcome)
 * để đối phương join. Trả conversationId.
 */
export async function createDirectConversation(peerStakeAddress: string): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
  if (!currentStakeAddress) return { ok: false, error: 'chưa init' };
  try {
    const conv = await proofChatApi.conversations.create({
      type: 'DIRECT',
      participantIds: [peerStakeAddress],
    });
    const conversationId = conv.id;

    // Lấy KeyPackage các thành viên phòng (trừ mình) rồi tạo nhóm + Welcome.
    const kps = await proofChatApi.mls.roomKeyPackages(conversationId, DEVICE_ID);
    const memberKps = kps.filter((k) => k.stakeAddress !== currentStakeAddress).map((k) => k.keyPackage);
    const group = await chatMls.createGroup(conversationId, memberKps);

    // Đẩy Welcome/Commit lên server để đối phương đồng bộ epoch (nếu có thành viên).
    if (group.welcome || group.commit) {
      await proofChatApi.mls.createEpochSync({
        conversationId,
        epoch: group.epoch,
        commitMessage: group.commit ?? '',
        welcomeMessage: group.welcome ?? '',
      }).catch(() => undefined);
    }
    await persistState();
    return { ok: true, conversationId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'tạo hội thoại thất bại' };
  }
}

/** Đồng bộ epoch cho 1 hội thoại: kéo các bản epoch-sync còn thiếu và xử lý. */
export async function syncConversation(conversationId: string): Promise<void> {
  try {
    const local = await currentEpochLocal(conversationId);
    const server = await proofChatApi.mls.epochCurrent(conversationId).catch(() => null);
    const serverEpoch = server?.currentEpoch ?? server?.epoch ?? 0;
    if (serverEpoch > local) {
      const records = await proofChatApi.mls.epochRange(conversationId, local + 1, serverEpoch);
      for (const rec of records) {
        if (rec.mlsMessageType === 'welcome' && rec.welcomeMessage) {
          await chatMls.joinFromWelcome(rec.welcomeMessage);
        } else if (rec.commitMessage) {
          await chatMls.processCommit(conversationId, rec.commitMessage);
        }
      }
      await persistState();
    }
  } catch {
    /* không chặn — thử lại lần mở sau */
  }
}

async function currentEpochLocal(_conversationId: string): Promise<number> {
  // chatMls chưa expose current_epoch qua JS wrapper; tạm coi 0 (kéo full range).
  // TODO: thêm chatMls.currentEpoch(convId) vào FFI + wrapper để tối ưu.
  return 0;
}

export default {
  init,
  shutdown,
  onDecryptedMessage,
  sendText,
  createDirectConversation,
  syncConversation,
};
