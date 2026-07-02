/**
 * proofchatWs.ts — Client WebSocket real-time ProofChat (TRỤC 3, wiring API thật).
 *
 * Dùng WebSocket gốc của React Native (global.WebSocket) — KHÔNG thêm dependency
 * (socket.io-client chưa có trong package.json). Giao thức khung JSON đơn giản
 * theo spec §6 (05-SuperApp-spec.md):
 *   - connect: auth.token = accessToken (KHÔNG nhét token vào URL/query — spec §6)
 *   - join room: { event: 'chat.room.join', data: { roomId: conversationId } }
 *   - nhận tin: { event: 'contract:message.send', data: {...} }
 *
 * RÀNG BUỘC TOKEN AN TOÀN (spec §4/§6 — KHÔNG vi phạm):
 *   - accessToken CHỈ đi trong khung `auth` sau khi socket mở (giống postMessage
 *     origin-checked của WebView), TUYỆT ĐỐI KHÔNG trên query-string của wss URL.
 *   - Server không thấy plaintext: mọi tin là ciphertext E2EE. Lớp này chỉ vận
 *     chuyển envelope; giải mã do crypto stack (MLS) đảm nhiệm ở v2.1.
 *
 * Vận hành độc lập: nếu accessToken chưa có / WS chết → im lặng degrade, KHÔNG
 * ném lỗi làm sập chat tab. UI tiếp tục dựa REST (list/messages) + mock fallback.
 */
import { getAccessToken } from './proofchat-api';
// PROOFCHAT_WS_URL chưa khai báo trong src/types/env.d.ts (file ngoài ranh giới
// module này — do agent khác/owner sở hữu). Import qua alias có ép kiểu mềm để
// không phải sửa env.d.ts; thiếu biến → fallback hằng số spec §6.
import * as Env from '@env';

// WS URL: ưu tiên biến env PROOFCHAT_WS_URL nếu có, mặc định theo spec §6.
const resolveWsUrl = (): string => {
  const url = (Env as Record<string, string | undefined>).PROOFCHAT_WS_URL;
  return url || 'wss://ws.proofchat.app';
};

// ── Kiểu khung nhận về ────────────────────────────────────────────────

/** Envelope tin nhắn nhận từ WS (ciphertext E2EE — server không thấy plaintext). */
export interface WsIncomingMessage {
  id?: string;
  conversationId: string;
  senderId?: string; // PhoenixKey DID người gửi
  senderDid?: string;
  /** Nội dung đã mã hoá (variants[].encryptedContent). Chưa giải mã ở tầng này. */
  ciphertext?: string;
  createdAt?: number | string; // do client tạo, KHÔNG override (ký trong MerkleLeaf)
}

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';

interface WsFrame {
  event: string;
  data?: unknown;
}

export interface ProofChatWsHandlers {
  onMessage?: (msg: WsIncomingMessage) => void;
  onStatus?: (status: WsStatus) => void;
}

/**
 * Client WS ProofChat cho 1 phiên. Tự gửi khung auth khi mở, join room, và
 * đẩy tin `contract:message.send` lên handler. Reconnect có backoff nhẹ.
 */
export class ProofChatWsClient {
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private handlers: ProofChatWsHandlers;
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(handlers: ProofChatWsHandlers = {}) {
    this.handlers = handlers;
  }

  /** Kết nối + join room (conversationId). Idempotent với cùng roomId. */
  async connect(conversationId: string): Promise<void> {
    this.manualClose = false;
    this.roomId = conversationId;

    const token = await getAccessToken();
    if (!token) {
      // Chưa có phiên ProofChat → không mở WS (degrade, KHÔNG throw).
      this.handlers.onStatus?.('closed');
      return;
    }

    // KHÔNG nhét token vào URL — chỉ dùng trong khung auth sau khi mở.
    const url = resolveWsUrl();
    this.handlers.onStatus?.('connecting');

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.handlers.onStatus?.('error');
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      // Khung 1: auth.token = accessToken (giống postMessage origin-checked).
      this.send({ event: 'auth', data: { token } });
      // Khung 2: join room theo spec — chat.room.join { roomId }.
      if (this.roomId) {
        this.send({ event: 'chat.room.join', data: { roomId: this.roomId } });
      }
      this.handlers.onStatus?.('open');
    };

    this.socket.onmessage = (evt: WebSocketMessageEvent) => {
      this.handleFrame(evt.data);
    };

    this.socket.onerror = () => {
      this.handlers.onStatus?.('error');
    };

    this.socket.onclose = () => {
      this.handlers.onStatus?.('closed');
      if (!this.manualClose) this.scheduleReconnect();
    };
  }

  /** Đóng chủ động (rời phòng / unmount). Không reconnect. */
  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    this.socket = null;
    this.roomId = null;
  }

  private send(frame: WsFrame): void {
    if (this.socket?.readyState === 1 /* OPEN */) {
      try {
        this.socket.send(JSON.stringify(frame));
      } catch {
        // ignore — onclose/reconnect sẽ xử lý
      }
    }
  }

  private handleFrame(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let frame: WsFrame;
    try {
      frame = JSON.parse(raw) as WsFrame;
    } catch {
      return; // khung không hợp lệ → bỏ qua
    }
    if (frame.event === 'contract:message.send' && frame.data) {
      const d = frame.data as Record<string, unknown>;
      const conversationId =
        (d.conversationId as string) ?? (d.roomId as string) ?? this.roomId ?? '';
      if (!conversationId) return;
      this.handlers.onMessage?.({
        id: d.id as string | undefined,
        conversationId,
        senderId: (d.senderId as string) ?? (d.senderDid as string),
        senderDid: d.senderDid as string | undefined,
        ciphertext:
          (d.ciphertext as string) ??
          (d.encryptedContent as string) ??
          undefined,
        createdAt: (d.createdAt as number | string) ?? undefined,
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.manualClose || !this.roomId) return;
    if (this.reconnectTimer) return;
    // Backoff nhẹ: 1s, 2s, 4s… tối đa 15s. Tránh bão reconnect khi BE chết.
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const room = this.roomId;
      // connect() tự nuốt lỗi (degrade mềm) → chỉ cần catch để tránh unhandled.
      if (room) this.connect(room).catch(() => undefined);
    }, delay);
  }
}

/** Factory tiện dụng. */
export const createProofChatWs = (
  handlers?: ProofChatWsHandlers,
): ProofChatWsClient => new ProofChatWsClient(handlers);
