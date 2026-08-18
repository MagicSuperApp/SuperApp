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
import chatSocket, { EpochSyncWire, MessagePayload } from './chatSocket';
import { proofChatApi, isProofChatBackendEnabled } from './proofchat-api';
import { connectProofChat } from './proofchatAuthBridge';
import { assembleOutgoing, processIncoming, needsMerkleVerification } from './proofchatMessage';
import { getDid, getMerkleSession } from './proofchatIdentity';
import type { ConversationType } from '../modules/chat/features/chat/types';

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
  /** Merkle tier-3: true/false nếu tin có leaf; null nếu không kèm (GROUP/thiếu session). */
  merkleVerified: boolean | null;
}

export interface InitResult {
  status: 'ready' | 'disabled' | 'no-phoenix-session' | 'error';
  message?: string;
}

type MessageHandler = (m: DecryptedMessage) => void;

let currentIdentity: string | null = null;
let messageHandler: MessageHandler | null = null;
const unsub: Array<() => void> = [];

// ── Welcome/Commit chưa đẩy được lên server ──────────────────────────────────
//
// VÌ SAO PHẢI CÓ: tạo nhóm gồm hai việc — dựng nhóm MLS CỤC BỘ và đẩy Welcome lên
// server cho thành viên join. Việc hai rớt mạng thì nhóm vẫn "tạo xong" trên máy
// người tạo, còn thành viên KHÔNG BAO GIỜ nhận được Welcome: không API nào phát
// lại (`syncConversation` chỉ KÉO về), và `chatMls.createGroup` gọi lại cũng không
// được vì state nhóm đã ghi. Kết quả: phòng câm vĩnh viễn, người tạo tưởng xong.
// Nên giữ lại bản ghi và đẩy lại ở nhịp sau.
//
// Cất qua `taad.secureStore` (mã hoá phần cứng) như state MLS: Welcome mang bí mật
// nhóm cho thành viên, không để trần trong AsyncStorage.
const PENDING_EPOCH_KEY = 'chat_mls_pending_epoch';
/** Hội thoại mà máy này ĐANG có nhóm MLS — quyết định Welcome hay Commit khi đồng bộ. */
const JOINED_KEY = 'chat_mls_joined_groups';
/** Sổ các bản đã RỜI hàng chờ mà chưa lên được server — để UI còn nói ra được. */
const DROPPED_EPOCH_KEY = 'chat_mls_dropped_epoch';

// ── Trần của hàng chờ ────────────────────────────────────────────────────────
//
// VÌ SAO PHẢI CÓ TRẦN: trước đây bản ghi chỉ rời hàng chờ khi đẩy THÀNH CÔNG.
// Một bản mà server từ chối vĩnh viễn (hội thoại đã xoá, epoch trùng, payload
// hỏng) thì ở lại mãi, và `flushPendingEpochs()` chạy ở MỌI lần init chat nên
// nó bị gọi lại mỗi lần mở chat, mãi mãi. Hàng chờ cũng không có trần kích
// thước: mất mạng dài ngày thì mảng phình, mà cả mảng được `JSON.stringify`
// vào secure store ở mỗi lượt lưu.
//
// Ba trần dưới đây độc lập nhau; chạm trần nào cũng CHỈ đưa bản ghi sang sổ
// `droppedEpochs` — KHÔNG xoá không dấu vết. Màn hình đọc `getEpochQueueStats()`
// để nói "N bản không gửi được".
const MAX_EPOCH_ATTEMPTS = 8;
const PENDING_EPOCH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const MAX_PENDING_EPOCHS = 50;
/** Sổ bản hỏng cũng phải có trần, nếu không nó thành chỗ phình mới. */
const MAX_DROPPED_EPOCHS = 50;

/** Phần ĐI LÊN SERVER — đúng những trường `createEpochSync` nhận. */
interface EpochRecord {
  conversationId: string;
  epoch: number;
  commitMessage: string;
  welcomeMessage: string;
}

/** Bản ghi trong hàng chờ = phần đi lên server + sổ theo dõi lần thử/tuổi. */
interface PendingEpoch extends EpochRecord {
  /** Số lần đã thử đẩy và TRƯỢT. Bản ghi cũ thiếu trường → coi là 0. */
  attempts: number;
  /** Mốc vào hàng chờ (ms). Bản ghi cũ thiếu trường → gán lúc đọc (không tự hết hạn). */
  firstQueuedAt: number;
  /** Mốc thử gần nhất (ms). */
  lastAttemptAt: number;
}

export type EpochDropReason = 'attempts' | 'expired' | 'overflow';

/** Một bản đã rời hàng chờ mà chưa lên server. Giữ lại để ĐẾM ĐƯỢC. */
export interface DroppedEpoch {
  conversationId: string;
  epoch: number;
  attempts: number;
  firstQueuedAt: number;
  droppedAt: number;
  reason: EpochDropReason;
}

let pendingEpochs: PendingEpoch[] = [];
let droppedEpochs: DroppedEpoch[] = [];
let joinedGroups = new Set<string>();
let stateLoaded = false;

/** Chỉ lấy phần đi lên server — không đẩy trường sổ sách nội bộ ra API. */
const wireOf = (r: EpochRecord): EpochRecord => ({
  conversationId: r.conversationId,
  epoch: r.epoch,
  commitMessage: r.commitMessage,
  welcomeMessage: r.welcomeMessage,
});

const sameEpoch = (a: EpochRecord, b: EpochRecord): boolean =>
  a.conversationId === b.conversationId && a.epoch === b.epoch;

/**
 * Đọc một bản ghi đã lưu về đúng hình dạng mới. TƯƠNG THÍCH NGƯỢC: bản ghi lưu
 * trước bản vá này KHÔNG có `attempts`/`firstQueuedAt`/`lastAttemptAt` — thiếu
 * thì gán mặc định (0 lần thử, tuổi tính từ LÚC ĐỌC) chứ không loại bỏ, để bản
 * cũ không bị hết hạn oan ngay lần mở chat đầu tiên sau khi cập nhật app.
 */
function normalizePending(x: any, now: number): PendingEpoch | null {
  if (!x || typeof x.conversationId !== 'string') return null;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
  return {
    conversationId: x.conversationId,
    epoch: num(x.epoch, 0),
    commitMessage: typeof x.commitMessage === 'string' ? x.commitMessage : '',
    welcomeMessage: typeof x.welcomeMessage === 'string' ? x.welcomeMessage : '',
    attempts: num(x.attempts, 0),
    firstQueuedAt: num(x.firstQueuedAt, now),
    lastAttemptAt: num(x.lastAttemptAt, now),
  };
}

function normalizeDropped(x: any): DroppedEpoch | null {
  if (!x || typeof x.conversationId !== 'string') return null;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
  const reason: EpochDropReason =
    x.reason === 'attempts' || x.reason === 'expired' || x.reason === 'overflow'
      ? x.reason
      : 'attempts';
  return {
    conversationId: x.conversationId,
    epoch: num(x.epoch, 0),
    attempts: num(x.attempts, 0),
    firstQueuedAt: num(x.firstQueuedAt, 0),
    droppedAt: num(x.droppedAt, 0),
    reason,
  };
}

/** Chuyển 1 bản khỏi hàng chờ sang sổ hỏng. KHÔNG nuốt im: sổ này UI đọc được. */
function dropPending(rec: PendingEpoch, reason: EpochDropReason, now: number): void {
  droppedEpochs.push({
    conversationId: rec.conversationId,
    epoch: rec.epoch,
    attempts: rec.attempts,
    firstQueuedAt: rec.firstQueuedAt,
    droppedAt: now,
    reason,
  });
  if (droppedEpochs.length > MAX_DROPPED_EPOCHS) {
    droppedEpochs = droppedEpochs.slice(-MAX_DROPPED_EPOCHS);
  }
  console.warn('[proofchat] bản epoch rời hàng chờ chưa lên được server', {
    conversationId: rec.conversationId,
    epoch: rec.epoch,
    attempts: rec.attempts,
    reason,
  });
}

/**
 * Áp cả ba trần lên hàng chờ. Gọi sau MỌI thay đổi hàng chờ và trước mỗi lượt
 * đẩy lại. Trả về true nếu có bản bị loại (caller cần lưu lại state).
 */
function pruneQueue(now: number): boolean {
  const before = pendingEpochs.length;
  const kept: PendingEpoch[] = [];
  for (const rec of pendingEpochs) {
    if (rec.attempts >= MAX_EPOCH_ATTEMPTS) {
      dropPending(rec, 'attempts', now);
    } else if (now - rec.firstQueuedAt > PENDING_EPOCH_TTL_MS) {
      dropPending(rec, 'expired', now);
    } else {
      kept.push(rec);
    }
  }
  // Quá trần kích thước → bỏ bản VÀO SỚM NHẤT: nó đã có nhiều lượt thử nhất,
  // còn bản vừa xếp hàng là nhóm người dùng đang chờ ngay trên màn hình.
  while (kept.length > MAX_PENDING_EPOCHS) {
    dropPending(kept.shift() as PendingEpoch, 'overflow', now);
  }
  pendingEpochs = kept;
  return pendingEpochs.length !== before;
}

async function loadLocalState(): Promise<void> {
  if (stateLoaded) return;
  stateLoaded = true;
  const now = Date.now();
  try {
    const raw = await taad.secureLoad(PENDING_EPOCH_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      pendingEpochs = arr
        .map((x: any) => normalizePending(x, now))
        .filter((x): x is PendingEpoch => x !== null);
    }
  } catch {
    pendingEpochs = [];
  }
  try {
    const raw = await taad.secureLoad(DROPPED_EPOCH_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      droppedEpochs = arr
        .map((x: any) => normalizeDropped(x))
        .filter((x): x is DroppedEpoch => x !== null);
    }
  } catch {
    droppedEpochs = [];
  }
  try {
    const raw = await taad.secureLoad(JOINED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) joinedGroups = new Set(arr.filter((x: any) => typeof x === 'string'));
  } catch {
    joinedGroups = new Set();
  }
}

async function saveLocalState(): Promise<void> {
  try {
    await taad.secureStore(PENDING_EPOCH_KEY, JSON.stringify(pendingEpochs));
    await taad.secureStore(DROPPED_EPOCH_KEY, JSON.stringify(droppedEpochs));
    await taad.secureStore(JOINED_KEY, JSON.stringify(Array.from(joinedGroups)));
  } catch {
    /* không chặn luồng chat */
  }
}

async function markJoined(conversationId: string): Promise<void> {
  await loadLocalState();
  if (joinedGroups.has(conversationId)) return;
  joinedGroups.add(conversationId);
  await saveLocalState();
}

/**
 * Đẩy một bản epoch-sync lên server. Thất bại → xếp vào hàng chờ đẩy lại (đếm
 * lần thử) và trả false (KHÔNG nuốt lỗi rồi báo "đã tạo nhóm"). Chạm trần lần
 * thử/tuổi/kích thước thì bản ghi rời hàng chờ nhưng vào sổ `droppedEpochs`.
 */
async function publishEpoch(rec: EpochRecord): Promise<boolean> {
  await loadLocalState();
  const now = Date.now();
  try {
    await proofChatApi.mls.createEpochSync(wireOf(rec));
    pendingEpochs = pendingEpochs.filter(p => !sameEpoch(p, rec));
    await saveLocalState();
    return true;
  } catch {
    const existing = pendingEpochs.find(p => sameEpoch(p, rec));
    if (existing) {
      existing.attempts += 1;
      existing.lastAttemptAt = now;
    } else {
      pendingEpochs.push({
        ...wireOf(rec),
        attempts: 1,
        firstQueuedAt: now,
        lastAttemptAt: now,
      });
    }
    pruneQueue(now);
    await saveLocalState();
    return false;
  }
}

/**
 * Đẩy lại mọi Welcome/Commit còn kẹt. Gọi lúc init (mỗi lần mở chat) và từ UI khi
 * người dùng bấm thử lại.
 *
 * Trước khi thử, áp trần lên hàng chờ: bản quá hạn / quá số lần thử KHÔNG được
 * gọi lại nữa (trước bản vá này chúng được gọi lại ở mọi lần mở chat, vĩnh viễn).
 * `dropped` = số bản bị loại trong CHÍNH lượt này.
 */
export async function flushPendingEpochs(): Promise<{
  sent: number;
  remaining: number;
  dropped: number;
}> {
  await loadLocalState();
  const droppedBefore = droppedEpochs.length;
  if (pruneQueue(Date.now())) await saveLocalState();

  const snapshot = [...pendingEpochs];
  let sent = 0;
  for (const rec of snapshot) {
    if (await publishEpoch(rec)) sent += 1;
  }
  return {
    sent,
    remaining: pendingEpochs.length,
    dropped: droppedEpochs.length - droppedBefore,
  };
}

/** Số Welcome/Commit đang kẹt (UI hiện cảnh báo "nhóm chưa mời được ai"). */
export async function getPendingEpochCount(): Promise<number> {
  await loadLocalState();
  return pendingEpochs.length;
}

/**
 * Số liệu hàng chờ cho UI: bao nhiêu bản còn đang thử lại, bao nhiêu bản đã BỎ
 * CUỘC (kèm lý do + hội thoại nào) để màn hình nói được "N bản không gửi được"
 * thay vì im lặng.
 */
export async function getEpochQueueStats(): Promise<{
  pending: number;
  dropped: number;
  drops: DroppedEpoch[];
}> {
  await loadLocalState();
  return {
    pending: pendingEpochs.length,
    dropped: droppedEpochs.length,
    drops: [...droppedEpochs],
  };
}

/** Người dùng đã đọc cảnh báo → xoá sổ bản hỏng (chỉ xoá SỔ, không đẩy lại gì). */
export async function acknowledgeDroppedEpochs(): Promise<void> {
  await loadLocalState();
  if (droppedEpochs.length === 0) return;
  droppedEpochs = [];
  await saveLocalState();
}

/**
 * CHỈ dùng trong test: xoá state module (danh tính, hàng chờ Welcome, nhóm đã vào).
 * State module dùng chung giữa các ca test → không reset thì ca sau ăn theo ca trước.
 */
export function _resetForTest(): void {
  currentIdentity = null;
  pendingEpochs = [];
  droppedEpochs = [];
  joinedGroups = new Set();
  stateLoaded = false;
}

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

/**
 * Khởi tạo phiên chat đầy đủ. Không throw — trả InitResult để UI hiển thị.
 * Danh tính MLS = **did:phoenix** (mobile dẫn đầu). Truyền `identityOverride` chỉ
 * để test; mặc định lấy `getDid()`.
 */
export async function init(identityOverride?: string): Promise<InitResult> {
  if (!isProofChatBackendEnabled()) return { status: 'disabled' };
  if (!chatMls.isAvailable()) return { status: 'error', message: 'Native chat_mls chưa sẵn sàng' };

  const identity = identityOverride ?? (await getDid());
  if (!identity) return { status: 'no-phoenix-session' };

  const authRes = await connectProofChat();
  if (authRes.status === 'disabled') return { status: 'disabled' };
  if (authRes.status === 'no-phoenix-session') return { status: 'no-phoenix-session' };
  if (authRes.status === 'error') return { status: 'error', message: authRes.message };

  try {
    currentIdentity = identity;
    await ensureIdentity(identity);
    await chatSocket.connect();
    wireSocketHandlers();
    // Mở chat lại = có mạng lại → đẩy nốt Welcome/Commit còn kẹt từ lần trước,
    // nếu không nhóm đã tạo vẫn câm mãi mãi.
    void flushPendingEpochs().catch(() => undefined);
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
  currentIdentity = null;
}

// ── Gửi tin ──────────────────────────────────────────────────────────

/**
 * Mã hoá + gửi 1 tin văn bản. Trả messageId khi ack thành công.
 * `conversationType` quyết định có đính Merkle tier-3 không (DIRECT/JOB_NEGOTIATION);
 * bỏ trống ⇒ không Merkle (an toàn cho GROUP/THREAD).
 */
export async function sendText(
  conversationId: string,
  text: string,
  conversationType?: ConversationType,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!currentIdentity) return { ok: false, error: 'chưa init' };
  try {
    // Uỷ nhiệm session cho Merkle chỉ khi hội thoại cần (tránh bật sinh trắc học thừa).
    const session =
      conversationType && needsMerkleVerification(conversationType)
        ? await getMerkleSession()
        : undefined;

    const { payload } = await assembleOutgoing(
      {
        conversationId,
        conversationType: conversationType ?? 'GROUP',
        senderId: currentIdentity,
        deviceId: DEVICE_ID,
        session,
      },
      text,
    );

    const ack = await chatSocket.sendMessage(payload);
    if (!ack?.success) return { ok: false, error: ack?.error ?? 'gửi thất bại' };
    return { ok: true, messageId: ack.messageId ?? payload.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'lỗi gửi' };
  }
}

// ── Nhận tin + epoch-sync ────────────────────────────────────────────

function wireSocketHandlers(): void {
  unsub.push(
    chatSocket.onMessage(async (m: MessagePayload) => {
      try {
        // Giải mã tầng 2 + (nếu có) verify Merkle tầng 3.
        const res = await processIncoming(m);
        messageHandler?.({
          id: res.messageId,
          conversationId: res.conversationId,
          senderId: res.senderId,
          isMine: res.senderId === currentIdentity,
          timestamp: res.timestamp,
          plaintext: res.plaintext,
          epoch: res.epoch,
          merkleVerified: res.merkleVerified,
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

export interface CreateConversationResult {
  ok: boolean;
  conversationId?: string;
  /**
   * false = nhóm đã dựng trên máy NHƯNG Welcome chưa lên server → thành viên chưa
   * join được. Bản ghi đã xếp hàng đẩy lại; UI phải nói thật thay vì báo "đã tạo".
   */
  welcomePublished?: boolean;
  error?: string;
}

/**
 * Tạo hội thoại DIRECT với 1 người + khởi tạo nhóm MLS.
 * Lấy KeyPackage của đối phương → chatMls.createGroup → publish epoch-sync (Welcome)
 * để đối phương join. Trả conversationId.
 */
export async function createDirectConversation(peerStakeAddress: string): Promise<CreateConversationResult> {
  if (!currentIdentity) return { ok: false, error: 'chưa init' };
  try {
    const conv = await proofChatApi.conversations.create({
      type: 'DIRECT',
      participantIds: [peerStakeAddress],
    });
    const conversationId = conv.id;

    // Lấy KeyPackage các thành viên phòng (trừ mình) rồi tạo nhóm + Welcome.
    const kps = await proofChatApi.mls.roomKeyPackages(conversationId, DEVICE_ID);
    const memberKps = kps.filter((k) => k.stakeAddress !== currentIdentity).map((k) => k.keyPackage);
    const group = await chatMls.createGroup(conversationId, memberKps);
    await markJoined(conversationId);

    // Đẩy Welcome/Commit lên server để đối phương đồng bộ epoch (nếu có thành viên).
    let welcomePublished = true;
    if (group.welcome || group.commit) {
      welcomePublished = await publishEpoch({
        conversationId,
        epoch: group.epoch,
        commitMessage: group.commit ?? '',
        welcomeMessage: group.welcome ?? '',
      });
    }
    await persistState();
    return { ok: true, conversationId, welcomePublished };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'tạo hội thoại thất bại' };
  }
}

/**
 * Tạo hội thoại GROUP với N thành viên (DID) + khởi tạo nhóm MLS.
 * Giống createDirectConversation nhưng type='GROUP' và participantIds là mảng DID.
 * participantIds = danh sách did:phoenix (từ users.search) — KHÔNG gồm chính mình.
 */
export async function createGroupConversation(
  title: string,
  participantIds: string[],
  type: Exclude<ConversationType, 'DIRECT'> = 'GROUP',
): Promise<CreateConversationResult> {
  if (!currentIdentity) return { ok: false, error: 'chưa init' };
  const members = Array.from(
    new Set(participantIds.map((s) => s.trim()).filter((s) => s && s !== currentIdentity)),
  );
  if (members.length === 0) return { ok: false, error: 'cần ít nhất 1 thành viên' };
  const name = title.trim();
  if (!name) return { ok: false, error: 'thiếu tiêu đề nhóm' };
  try {
    // Loại hội thoại đi THEO lựa chọn của người dùng. Trước đây ép cứng 'GROUP' nên
    // chọn "Đàm phán công việc" xong server vẫn ghi GROUP — mọi lọc/hiển thị theo
    // loại sai từ gốc mà không báo gì.
    const conv = await proofChatApi.conversations.create({
      type,
      title: name,
      participantIds: members,
    });
    const conversationId = conv.id;

    // Lấy KeyPackage các thành viên phòng (trừ mình) → tạo nhóm MLS + Welcome.
    const kps = await proofChatApi.mls.roomKeyPackages(conversationId, DEVICE_ID);
    const memberKps = kps.filter((k) => k.stakeAddress !== currentIdentity).map((k) => k.keyPackage);
    const group = await chatMls.createGroup(conversationId, memberKps);
    await markJoined(conversationId);

    // Đẩy Welcome/Commit để thành viên đồng bộ epoch (nếu có KeyPackage).
    let welcomePublished = true;
    if (group.welcome || group.commit) {
      welcomePublished = await publishEpoch({
        conversationId,
        epoch: group.epoch,
        commitMessage: group.commit ?? '',
        welcomeMessage: group.welcome ?? '',
      });
    }
    await persistState();
    return { ok: true, conversationId, welcomePublished };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'tạo nhóm thất bại' };
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
      await loadLocalState();
      for (const rec of records) {
        // KHÔNG khoá theo `rec.mlsMessageType`: `proofchat-api.ts:375` tự ghi rằng
        // backend hiện KHÔNG trả trường này, mà `createEpochSync` cũng không có chỗ
        // để đặt nó — nên người vừa được thêm sẽ rơi xuống `processCommit` trong khi
        // chưa ở trong nhóm, ném lỗi, bị nuốt im, và không bao giờ join được.
        // Quy tắc đúng: CHƯA có nhóm trên máy + bản ghi có Welcome → join bằng Welcome.
        const haveGroup = joinedGroups.has(conversationId);
        try {
          if (!haveGroup && rec.welcomeMessage) {
            await chatMls.joinFromWelcome(rec.welcomeMessage);
            await markJoined(conversationId);
          } else if (rec.commitMessage) {
            await chatMls.processCommit(conversationId, rec.commitMessage);
          }
        } catch (e) {
          // Một bản ghi hỏng không được giết cả vòng đồng bộ — bản sau vẫn phải chạy.
          console.warn('[proofchat] bỏ qua bản epoch lỗi', conversationId, rec.epoch, e);
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
  createGroupConversation,
  syncConversation,
  flushPendingEpochs,
  getPendingEpochCount,
  getEpochQueueStats,
  acknowledgeDroppedEpochs,
};
