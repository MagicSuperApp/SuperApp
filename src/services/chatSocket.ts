/**
 * chatSocket.ts — Realtime transport cho ProofChat qua socket.io (khớp WS server D:\WS).
 *
 * Kết nối namespace `/chat` tại PROOFCHAT_WS_URL, JWT ở query `?token=`. Sự kiện khớp
 * client web (D:\FE services/socketClient.ts):
 *   emit  contract:message.send  (ack {success,error?})   — gửi tin đã mã hoá MLS
 *   on    contract:message.new                             — nhận tin
 *   emit  mls:sync.epoch         (ack)                     — đẩy epoch-sync khi commit
 *   on    mls:sync.epoch                                   — nhận epoch-sync
 *   emit  contract:room.join                               — join phòng thủ công (thường auto)
 *
 * Nội dung tin là envelope MLS (opkId:'mls', type:2, body). Mã hoá/giải mã ở tầng native
 * (src/sdk/chatMls.ts) — socket chỉ vận chuyển.
 */
import { io, Socket } from 'socket.io-client';
import { PROOFCHAT_WS_URL } from '@env';
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

const wsBaseUrl = (): string => (PROOFCHAT_WS_URL as string | undefined) ?? '';

/** Kết nối (idempotent). Lấy JWT ProofChat từ AsyncStorage, gắn vào query handshake. */
export async function connect(): Promise<void> {
  if (socket?.connected) return;
  const url = wsBaseUrl();
  if (!url) throw new Error('PROOFCHAT_WS_URL chưa cấu hình');
  const token = (await getAccessToken()) ?? '';

  socket = io(`${url}/chat`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
    forceNew: true,
    query: { token },
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
  return requireSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('contract:room.join', { roomId });
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
