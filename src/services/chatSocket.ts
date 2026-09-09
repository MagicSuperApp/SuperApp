/**
 * chatSocket.ts — Realtime transport cho ProofChat qua socket.io (khớp WS server D:\WS).
 *
 * Kết nối namespace `/chat` tại PROOFCHAT_WS_URL, JWT ở query `?token=`. Sự kiện khớp
 * client web (D:\FE services/socketClient.ts):
 *   emit  contract:message.send  (ack {success,error?})   — gửi tin đã mã hoá MLS
 *   on    contract:message.new                             — nhận tin
 *   emit  mls:sync.epoch         (ack)                     — đẩy epoch-sync khi commit
 *   on    mls:sync.epoch                                   — nhận epoch-sync
 *   emit  chat.room.join                                    — join phòng thủ công (thường auto)
 *
 * Nội dung tin là envelope MLS (opkId:'mls', type:2, body). Mã hoá/giải mã ở tầng native
 * (src/sdk/chatMls.ts) — socket chỉ vận chuyển.
 */
import { io, Socket } from 'socket.io-client';
import { PROOFCHAT_WS_URL, PROOFCHAT_WS_PATH } from '@env';
import { getAccessToken } from './proofchat-api';

// ── Kiểu payload (khớp WS/FE) ────────────────────────────────────────

export interface EncryptedContent {
  opkId: 'mls';
  type: 2;
  /** base64(JSON tầng 2: {epoch,messageId,iv,ciphertext,tag}). */
  body: string;
  mlsMessageType: 'application' | 'epoch_sync' | 'welcome';
  mlsEpoch?: number;
  mlsWelcome?: string;
  mlsRatchetTree?: string;
  mlsCommit?: string;
}

export interface MessagePayload {
  id: string;
  senderId: string;
  conversationId: string;
  timestamp: number;
  messageType: 'text' | 'file';
  senderDeviceId: number | string;
  encryptedContent: EncryptedContent;
  variants: Array<{
    senderDeviceId: number | string;
    targetDeviceId: '*' | string;
    encryptedContent: EncryptedContent;
  }>;
  merkleLeaf?: Record<string, unknown>;
}

export interface EpochSyncWire {
  conversationId: string;
  id: string;
  epoch: number;
  mlsMessageType: 'application' | 'epoch_sync' | 'welcome';
  commitMessage: string;
  welcomeMessage: string;
  ratchetTree?: string;
  createdAt?: number;
  createdBy: string;
}

export interface SendAck {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
}

const ACK_TIMEOUT_MS = 8_000;

let socket: Socket | null = null;

// Chuẩn hoá base: bỏ '/' và '/chat' ở cuối nếu env lỡ kèm — code luôn tự nối '/chat'
// bên dưới. INTEGRATION.md §5 để PROOFCHAT_WS_URL KHÔNG kèm /chat; addendum A2 lại ghi
// kèm /chat → chuẩn hoá để cả hai cách dán env đều đúng, tránh 'wss://.../chat/chat'.
const wsBaseUrl = (): string =>
  ((PROOFCHAT_WS_URL as string | undefined) ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat$/, '')
    .replace(/\/+$/, '');
// Path socket.io. ĐÍNH CHÍNH 2026-09-08 — đo curl thẳng vào api.proofchat.me, KHÔNG
// chép lại INTEGRATION.md §5 (§5 dạy sai chỗ này):
//   GET /ws/socket.io/?EIO=4&transport=polling → 404 (nginx KHÔNG có route /ws/)
//   GET /socket.io/?EIO=4&transport=polling    → 200; POST `40/chat,` trên sid đó trả
//                                                error:auth {"error":"No token"}
// tức namespace /chat nằm ở path MẶC ĐỊNH. Đường lui cũ '/ws/socket.io/' khiến mọi
// bản dựng thiếu PROOFCHAT_WS_PATH gặp handshake 404 câm — và 404 đó hiện ra ngoài
// đúng như "máy chủ chưa sẵn sàng", không như cấu hình sai.
/**
 * Đường lui khi bản dựng KHÔNG khai biến đường socket.
 *
 * Tách thành hằng để ghim được. Gọi `wsPath()` trong một bài kiểm là đọc giá trị
 * môi trường CỦA MÁY đang chạy — bài đó đỏ ở máy này và xanh trên CI với cùng một
 * cây mã, đúng loại đỏ dạy người ta bỏ qua màu đỏ. Hằng này thì như nhau ở mọi máy.
 */
export const WS_PATH_FALLBACK = '/socket.io';
export const wsPath = (): string =>
  (PROOFCHAT_WS_PATH as string | undefined) || WS_PATH_FALLBACK;

/** Kết nối (idempotent). Lấy JWT ProofChat từ AsyncStorage, gắn vào auth handshake. */
export async function connect(): Promise<void> {
  if (socket?.connected) return;
  const url = wsBaseUrl();
  if (!url) throw new Error('PROOFCHAT_WS_URL chưa cấu hình');
  const token = (await getAccessToken()) ?? '';

  socket = io(`${url}/chat`, {
    path: wsPath(),
    // Chỉ websocket theo contract ProofChat (INTEGRATION.md §4.1) — nginx /ws/ chỉ
    // định tuyến WS upgrade; polling long-poll không đi đúng gateway.
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
    forceNew: true,
    // Token CHỈ ở `auth` handshake, KHÔNG dùng query `?token=` (addendum A1): query
    // string bị ghi vào nginx access log → JWT TTL 24h nằm trong log server. `extractToken`
    // của WS nhận cả hai, auth an toàn hơn.
    auth: { token },
  });

  await new Promise<void>((resolve, reject) => {
    if (!socket) return reject(new Error('socket null'));
    const s = socket;
    const onOk = () => { cleanup(); resolve(); };
    const onErr = (e: Error) => { cleanup(); reject(e); };
    const cleanup = () => {
      s.off('connect', onOk);
      s.off('connect_error', onErr);
      s.off('error:auth', onErr);
    };
    s.once('connect', onOk);
    s.once('connect_error', onErr);
    s.once('error:auth', onErr);
  });
}

export function isConnected(): boolean {
  return !!socket?.connected;
}

export function disconnect(): void {
  socket?.disconnect();
  socket = null;
}

// ── Nhận ─────────────────────────────────────────────────────────────

export function onMessage(cb: (m: MessagePayload) => void): () => void {
  socket?.on('contract:message.new', cb);
  return () => socket?.off('contract:message.new', cb);
}

export function onEpochSync(cb: (r: EpochSyncWire) => void): () => void {
  socket?.on('mls:sync.epoch', cb);
  return () => socket?.off('mls:sync.epoch', cb);
}

// LƯU Ý (đối chiếu ProofChat INTEGRATION.md §7.2 + PR#15): tên ĐÚNG hiện tại là
// `contract:message.typing`. Tên `chat:*` (bản FE#6/WS#2 gốc) là SAI và ĐÃ được
// sửa thành `contract:message.*` — KHÔNG migrate ngược về `chat:typing`. (send/new
// · read · mls:sync.epoch · chat.room.join đều giữ nguyên theo contract.)
export function onTyping(cb: (t: { userId: string; isTyping: boolean }) => void): () => void {
  socket?.on('contract:message.typing', cb);
  return () => socket?.off('contract:message.typing', cb);
}

// ── Gửi (ack) ────────────────────────────────────────────────────────

function requireSocket(): Socket {
  if (!socket) throw new Error('chatSocket: chưa connect()');
  return socket;
}

export function sendMessage(payload: MessagePayload): Promise<SendAck> {
  return requireSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('contract:message.send', payload);
}

export function syncEpoch(rec: EpochSyncWire): Promise<unknown> {
  return requireSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('mls:sync.epoch', rec);
}

export function joinRoom(roomId: string): Promise<unknown> {
  // Event `chat.room.join` theo contract WS (INTEGRATION.md §4.2) — KHÔNG phải
  // `contract:room.join`. Thường auto-join server-side; hàm này cho join thủ công.
  return requireSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('chat.room.join', { roomId });
}

export function sendTyping(roomId: string, isTyping: boolean): void {
  socket?.emit('contract:message.typing', { roomId, isTyping });
}

export default {
  connect,
  disconnect,
  isConnected,
  onMessage,
  onEpochSync,
  onTyping,
  sendMessage,
  syncEpoch,
  joinRoom,
  sendTyping,
};
