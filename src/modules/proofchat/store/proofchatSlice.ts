// modules/proofchat/store/proofchatSlice.ts
//
// Slice tổng hợp cho module ProofChat. Mặc dù state được tổ chức theo feature
// (chat / wallet / escrow), ta gộp vào 1 slice để giảm boilerplate cho MVP.
// Proof System (features/proof/) KHÔNG có state — nó chỉ là pure functions/types.

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type {
  ChatRoom,
  Conversation,
  ConversationType,
  Invitation,
  JoinRequest,
  Message,
  SyncState,
} from '../features/chat/types';
import {
  proofChatApi,
  isProofChatBackendEnabled,
  getDeviceId,
  type RemoteConversation,
  type RemoteMessage,
} from '../../../services/proofchat-api';
/**
 * Envelope tin đến từ realtime (ciphertext E2EE — server KHÔNG thấy plaintext).
 * Trước ở `proofchatWs.ts` (raw WS đã bỏ); giữ tại đây để reducer `receiveWsMessage`
 * dùng chung, độc lập transport. Đường thật hiện là socket.io (`chatSocket.ts`) →
 * `proofchatService`; khi nối UI vào service sẽ map `MessagePayload` về shape này.
 */
export interface WsIncomingMessage {
  id?: string;
  conversationId: string;
  senderId?: string;
  senderDid?: string;
  ciphertext?: string;
  createdAt?: number | string;
}
import type {
  Wallet,
  WalletTransaction,
  Identity,
} from '../features/wallet/types';
import type { EscrowStatus } from '../features/escrow/types';
import type { MessageStage, VerificationStatus } from '../features/proof/types';
import {
  MOCK_ROOMS,
  MOCK_MESSAGES,
  MOCK_WALLET,
  MOCK_IDENTITY,
  MOCK_TRANSACTIONS,
  MOCK_ME_ID,
  MOCK_CONVERSATIONS,
  MOCK_INVITATIONS,
  MOCK_JOIN_REQUESTS,
  MOCK_PUBLIC_CONVERSATION_IDS,
} from '../features/chat/data/mock';

/** Trạng thái tải dữ liệu THẬT (chỉ có ý nghĩa khi feature flag ON). */
export type ProofChatLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProofChatState {
  meId: string;
  // chat
  rooms: ChatRoom[];
  messagesByRoom: Record<string, Message[]>;
  sync: SyncState;
  // conversation management
  conversations: Conversation[];
  invitations: Invitation[];
  joinRequests: JoinRequest[];
  publicConversationIds: string[];
  // wallet
  wallet: Wallet;
  identity: Identity;
  transactions: WalletTransaction[];
  // ── Backend thật (feature flag) ────────────────────────────────────
  /** Nguồn dữ liệu đang dùng: 'mock' (flag OFF/fallback) | 'backend' (flag ON). */
  source: 'mock' | 'backend';
  /** Trạng thái tải danh sách hội thoại từ BE. */
  roomsStatus: ProofChatLoadStatus;
  /** Trạng thái tải tin nhắn theo phòng (conversationId → status). */
  messagesStatus: Record<string, ProofChatLoadStatus>;
  /** Thông điệp lỗi thân thiện (KHÔNG lộ chi tiết kỹ thuật ra UI). */
  loadError?: string;
}

const initialState: ProofChatState = {
  meId: MOCK_ME_ID,
  rooms: MOCK_ROOMS,
  messagesByRoom: MOCK_MESSAGES,
  sync: { online: true, syncing: false, queuedCount: 0 },
  conversations: MOCK_CONVERSATIONS,
  invitations: MOCK_INVITATIONS,
  joinRequests: MOCK_JOIN_REQUESTS,
  publicConversationIds: MOCK_PUBLIC_CONVERSATION_IDS,
  wallet: MOCK_WALLET,
  identity: MOCK_IDENTITY,
  transactions: MOCK_TRANSACTIONS,
  source: 'mock',
  roomsStatus: 'idle',
  messagesStatus: {},
  loadError: undefined,
};

// ── Mappers: RemoteConversation/RemoteMessage → shape UI ─────────────
// UI ChatRoom giàu trường (jobTitle, counterparty…) mà BE hội thoại thô chưa cấp.
// Map an toàn: giữ id thật, đổ trường còn thiếu bằng giá trị trung tính (UI KHÔNG
// vỡ). Khi BE bổ sung metadata job/participant, chỉ cần mở rộng mapper này.

const toEpoch = (v: number | string | undefined): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? Date.now() : t;
  }
  return Date.now();
};

const remoteConvToRoom = (c: RemoteConversation): ChatRoom => ({
  id: c.id,
  jobTitle: c.title ?? 'Cuộc trò chuyện',
  jobCategory: c.type ?? 'JOB_NEGOTIATION',
  // Participants định danh bằng PhoenixKey DID (spec §6) — chưa có tên hiển thị
  // từ BE hội thoại thô; để ownerId/DID làm định danh, UI hiển thị rút gọn.
  counterpartyId: c.ownerId ?? c.id,
  counterpartyName: c.title ?? 'Thành viên',
  counterpartyAddress: c.ownerId ?? '',
  counterpartyVerified: false,
  online: false,
  lastMessage: undefined,
  lastMessageAt: c.createdAt ? toEpoch(c.createdAt) : undefined,
  unreadCount: 0,
});

const remoteMsgToMessage = (
  m: RemoteMessage,
  roomId: string,
  meId: string,
): Message => {
  const ciphertext = m.ciphertext ?? m.encryptedContent ?? '';
  const sender = m.senderDid ?? m.senderId ?? 'peer';
  return {
    id: m.id,
    roomId,
    senderId: sender,
    isMine: sender === meId,
    timestamp: toEpoch(m.createdAt),
    // Ciphertext E2EE — server KHÔNG thấy plaintext. text để trống tới khi crypto
    // stack (MLS) giải mã (v2.1); UI hiển thị stage 'encrypted'.
    text: undefined,
    ciphertext,
    proof: { hash: '', signature: '', merkleProof: '' },
    verificationStatus: 'pending',
    stage: 'encrypted',
  };
};

// ── Async thunks: dữ liệu THẬT (chỉ chạy khi feature flag ON) ────────
// Khi flag OFF → thunk trả về sớm với marker 'disabled'; reducer GIỮ mock, UI
// không đổi. Khi ON nhưng chưa có phiên/BE lỗi → rejected, reducer giữ dữ liệu
// hiện có + set trạng thái error (fallback mềm, KHÔNG vỡ UI).

interface LoadConversationsResult {
  rooms: ChatRoom[];
  conversations: Conversation[];
}

/** Tải danh sách hội thoại thật từ BE ProofChat. */
export const loadConversations = createAsyncThunk<
  LoadConversationsResult | 'disabled'
>('proofchat/loadConversations', async () => {
  if (!isProofChatBackendEnabled()) return 'disabled';
  const remote = await proofChatApi.conversations.list({ take: 100 });
  const list = Array.isArray(remote) ? remote : [];
  const rooms = list.map(remoteConvToRoom);
  const conversations: Conversation[] = list.map((c) => ({
    id: c.id,
    title: c.title ?? 'Cuộc trò chuyện',
    type: (c.type as ConversationType) ?? 'JOB_NEGOTIATION',
    visibility: (c.visibility as 'public' | 'private') ?? 'private',
    ownerId: c.ownerId ?? c.id,
    memberCount: c.memberCount ?? 2,
    createdAt: c.createdAt ? toEpoch(c.createdAt) : Date.now(),
  }));
  return { rooms, conversations };
});

interface LoadMessagesResult {
  roomId: string;
  messages: Message[];
}

/** Tải tin nhắn (ciphertext E2EE) thật của 1 phòng. */
export const loadRoomMessages = createAsyncThunk<
  LoadMessagesResult | 'disabled',
  { roomId: string; meId: string }
>('proofchat/loadRoomMessages', async ({ roomId, meId }) => {
  if (!isProofChatBackendEnabled()) return 'disabled';
  const deviceId = await getDeviceId();
  const remote = await proofChatApi.conversations.getMessages(roomId, deviceId, {
    take: 200,
  });
  const list = Array.isArray(remote) ? remote : [];
  const messages = list.map((m) => remoteMsgToMessage(m, roomId, meId));
  return { roomId, messages };
});

const slice = createSlice({
  name: 'proofchat',
  initialState,
  reducers: {
    // ── Chat ────────────────────────────────────────────────────────────────
    sendMessage: (
      state,
      action: PayloadAction<{ roomId: string; text: string }>,
    ) => {
      const { roomId, text } = action.payload;
      const list = state.messagesByRoom[roomId] ?? [];
      const isOnline = state.sync.online;
      const id = `m-${Date.now()}`;

      const msg: Message = {
        id,
        roomId,
        senderId: state.meId,
        isMine: true,
        timestamp: Date.now(),
        text,
        ciphertext: `enc:${id}:${Math.random().toString(16).slice(2, 18)}`,
        proof: {
          hash: `0x${id}_h`,
          signature: `0xsig_${id}`,
          merkleProof: `[…]`,
        },
        verificationStatus: 'pending',
        stage: isOnline ? 'encrypting' : 'queued',
      };

      state.messagesByRoom[roomId] = [...list, msg];
      const room = state.rooms.find(r => r.id === roomId);
      if (room) {
        room.lastMessage = text;
        room.lastMessageAt = msg.timestamp;
      }
      if (!isOnline) state.sync.queuedCount += 1;
    },

    /** Cập nhật stage của 1 tin nhắn (do lifecycle simulator gọi). */
    setMessageStage: (
      state,
      action: PayloadAction<{
        roomId: string;
        messageId: string;
        stage: MessageStage;
        verificationStatus?: VerificationStatus;
      }>,
    ) => {
      const m = state.messagesByRoom[action.payload.roomId]?.find(
        x => x.id === action.payload.messageId,
      );
      if (!m) return;
      m.stage = action.payload.stage;
      if (action.payload.verificationStatus) {
        m.verificationStatus = action.payload.verificationStatus;
      }
    },

    /** Khi giải mã xong, gán plaintext + chuyển stage 'done'. */
    decryptMessage: (
      state,
      action: PayloadAction<{
        roomId: string;
        messageId: string;
        text: string;
        verificationStatus?: VerificationStatus;
      }>,
    ) => {
      const m = state.messagesByRoom[action.payload.roomId]?.find(
        x => x.id === action.payload.messageId,
      );
      if (!m) return;
      m.text = action.payload.text;
      m.stage = 'done';
      m.verificationStatus = action.payload.verificationStatus ?? 'verified';
    },

    markRoomRead: (state, action: PayloadAction<string>) => {
      const room = state.rooms.find(r => r.id === action.payload);
      if (room) room.unreadCount = 0;
    },

    // ── Sync ────────────────────────────────────────────────────────────────
    setSync: (state, action: PayloadAction<Partial<SyncState>>) => {
      state.sync = { ...state.sync, ...action.payload };
    },

    flushQueue: (state) => {
      state.sync.queuedCount = 0;
      state.sync.syncing = false;
      Object.values(state.messagesByRoom).forEach(list => {
        list.forEach(m => {
          if (m.stage === 'queued') m.stage = 'sending';
        });
      });
    },

    // ── Escrow ──────────────────────────────────────────────────────────────
    setEscrowStatus: (
      state,
      action: PayloadAction<{ roomId: string; status: EscrowStatus }>,
    ) => {
      const room = state.rooms.find(r => r.id === action.payload.roomId);
      if (room?.escrow) {
        room.escrow.status = action.payload.status;
        room.escrow.updatedAt = Date.now();
      }
    },

    // ── Identity ────────────────────────────────────────────────────────────
    expireSession: (state) => {
      state.identity.sessionStatus = 'expired';
    },
    refreshSession: (state, action: PayloadAction<number | undefined>) => {
      state.identity.sessionStatus = 'active';
      state.identity.sessionExpiresAt =
        action.payload ?? Date.now() + 12 * 60 * 60 * 1000;
    },

    // ── Conversation management ────────────────────────────────────────────
    createConversation: (
      state,
      action: PayloadAction<{
        title: string;
        avatar?: string;
        type: ConversationType;
        visibility?: 'public' | 'private';
      }>,
    ) => {
      const { title, avatar, type, visibility } = action.payload;
      const id = `conv-${Date.now()}`;
      const v =
        visibility ??
        (type === 'DIRECT' || type === 'JOB_NEGOTIATION' ? 'private' : 'public');
      const conv: Conversation = {
        id,
        title: title.trim(),
        avatar: avatar?.trim() || undefined,
        type,
        visibility: v,
        ownerId: state.meId,
        memberCount: 1,
        createdAt: Date.now(),
      };
      state.conversations.unshift(conv);
      if (v === 'public') state.publicConversationIds.push(id);
    },

    /**
     * Tham gia một conversation đã có sẵn theo ID.
     * - Public → join ngay (memberCount += 1, push vào conversations nếu chưa có).
     * - Private → tạo join request 'pending' chờ admin duyệt.
     */
    joinConversation: (
      state,
      action: PayloadAction<{ conversationId: string; message?: string }>,
    ) => {
      const { conversationId, message } = action.payload;
      const isPublic = state.publicConversationIds.includes(conversationId);

      if (isPublic) {
        const existing = state.conversations.find(c => c.id === conversationId);
        if (existing) {
          existing.memberCount += 1;
        } else {
          state.conversations.unshift({
            id: conversationId,
            title: `Conversation ${conversationId}`,
            type: 'GROUP',
            visibility: 'public',
            ownerId: 'unknown',
            memberCount: 1,
            createdAt: Date.now(),
          });
        }
        return;
      }

      const dup = state.joinRequests.find(
        r => r.conversationId === conversationId && r.status === 'pending',
      );
      if (dup) return;

      state.joinRequests.unshift({
        id: `jr-${Date.now()}`,
        conversationId,
        message: message?.trim() || undefined,
        createdAt: Date.now(),
        status: 'pending',
      });
    },

    acceptInvitation: (state, action: PayloadAction<{ invitationId: string }>) => {
      const inv = state.invitations.find(i => i.id === action.payload.invitationId);
      if (!inv || inv.status !== 'pending') return;
      inv.status = 'accepted';
      const exists = state.conversations.some(c => c.id === inv.conversationId);
      if (!exists) {
        state.conversations.unshift({
          id: inv.conversationId,
          title: inv.conversationTitle,
          avatar: inv.conversationAvatar,
          type: inv.conversationType,
          visibility: 'private',
          ownerId: inv.inviterId,
          memberCount: 2,
          createdAt: Date.now(),
        });
      }
    },

    rejectInvitation: (state, action: PayloadAction<{ invitationId: string }>) => {
      const inv = state.invitations.find(i => i.id === action.payload.invitationId);
      if (!inv || inv.status !== 'pending') return;
      inv.status = 'rejected';
    },

    dismissInvitation: (state, action: PayloadAction<{ invitationId: string }>) => {
      state.invitations = state.invitations.filter(
        i => i.id !== action.payload.invitationId,
      );
    },

    // ── WS real-time: tin đến từ contract:message.send ──────────────────────
    // Envelope ciphertext E2EE — server KHÔNG thấy plaintext. Chèn vào phòng ở
    // stage 'encrypted' (chờ crypto stack giải mã v2.1). Chống trùng theo id.
    receiveWsMessage: (state, action: PayloadAction<WsIncomingMessage>) => {
      const { conversationId, id, senderId, senderDid, ciphertext, createdAt } =
        action.payload;
      if (!conversationId) return;
      const list = state.messagesByRoom[conversationId] ?? [];
      const msgId = id ?? `ws-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      if (list.some(m => m.id === msgId)) return; // đã có → bỏ qua
      const sender = senderDid ?? senderId ?? 'peer';
      const ts =
        typeof createdAt === 'number'
          ? createdAt
          : typeof createdAt === 'string'
          ? Date.parse(createdAt) || Date.now()
          : Date.now();
      const msg: Message = {
        id: msgId,
        roomId: conversationId,
        senderId: sender,
        isMine: sender === state.meId,
        timestamp: ts,
        text: undefined,
        ciphertext: ciphertext ?? '',
        proof: { hash: '', signature: '', merkleProof: '' },
        verificationStatus: 'pending',
        stage: 'encrypted',
      };
      state.messagesByRoom[conversationId] = [...list, msg];
      const room = state.rooms.find(r => r.id === conversationId);
      if (room) {
        room.lastMessageAt = ts;
        if (!msg.isMine) room.unreadCount += 1;
      }
    },

    // ── Tin ĐÃ GIẢI MÃ từ proofchatService (MLS tầng-2 + Merkle tầng-3) ──────
    // Khác receiveWsMessage (ciphertext thô): tin này đã có PLAINTEXT + kết-quả
    // verify. Nguồn: onDecryptedMessage → dispatch. Chống trùng theo id (echo tin
    // mình gửi cũng tới qua đây → 1 nguồn duy nhất, không optimistic để tránh nhân đôi).
    receiveDecryptedMessage: (
      state,
      action: PayloadAction<{
        id: string;
        conversationId: string;
        senderId: string;
        isMine: boolean;
        timestamp: number;
        plaintext: string;
        merkleVerified: boolean | null;
      }>,
    ) => {
      const { id, conversationId, senderId, isMine, timestamp, plaintext, merkleVerified } =
        action.payload;
      const list = state.messagesByRoom[conversationId] ?? [];
      const verificationStatus: VerificationStatus =
        merkleVerified === false ? 'failed' : 'verified';
      const existing = list.find(m => m.id === id);
      if (existing) {
        // Đã có (vd optimistic tương lai) → cập-nhật plaintext + verify, không nhân đôi.
        existing.text = plaintext;
        existing.stage = 'delivered';
        existing.verificationStatus = verificationStatus;
        return;
      }
      const msg: Message = {
        id,
        roomId: conversationId,
        senderId,
        isMine,
        timestamp,
        text: plaintext,
        ciphertext: '',
        proof: { hash: '', signature: '', merkleProof: '' },
        verificationStatus,
        stage: 'delivered',
      };
      state.messagesByRoom[conversationId] = [...list, msg];
      const room = state.rooms.find(r => r.id === conversationId);
      if (room) {
        room.lastMessage = plaintext;
        room.lastMessageAt = timestamp;
        if (!isMine) room.unreadCount += 1;
      }
    },
  },

  // ── extraReducers: kết quả thunk dữ liệu THẬT ─────────────────────────────
  extraReducers: (builder) => {
    builder
      .addCase(loadConversations.pending, (state) => {
        if (!isProofChatBackendEnabled()) return;
        state.roomsStatus = 'loading';
        state.loadError = undefined;
      })
      .addCase(loadConversations.fulfilled, (state, action) => {
        if (action.payload === 'disabled') {
          // Flag OFF → giữ nguyên mock, không đổi gì.
          state.source = 'mock';
          state.roomsStatus = 'idle';
          return;
        }
        state.source = 'backend';
        state.roomsStatus = 'ready';
        state.rooms = action.payload.rooms;
        state.conversations = action.payload.conversations;
        state.loadError = undefined;
      })
      .addCase(loadConversations.rejected, (state) => {
        // THẤT BẠI PHẢI XOÁ, KHÔNG ĐƯỢC GIỮ.
        //
        // Bản cũ "giữ dữ liệu hiện có (fallback mềm)". Nghe thì hiền, nhưng dữ liệu
        // "hiện có" lúc đó chính là MOCK trong `initialState` — nên mạng hỏng lại
        // hiện ra một danh sách hội thoại đầy đủ, có tin nhắn, có tích đã-xác-minh.
        // Người dùng KHÔNG có cách nào biết mình đang nhìn dữ liệu bịa:
        //   · nhãn DEMO ở `ChatScreen.tsx:205` hỏi CỜ (`!isProofChatBackendEnabled()`),
        //     mà cờ đang BẬT ⇒ nhãn không hiện;
        //   · câu báo lỗi dưới đây nằm trong `ListEmptyComponent`
        //     (`ProofChatHomeScreen.tsx:346`), mà mock giữ danh sách KHÔNG rỗng
        //     ⇒ câu báo lỗi không bao giờ được vẽ.
        // Tức là mock vừa giả làm thật, vừa bịt luôn lời cảnh báo về chính nó.
        //
        // Xoá rỗng thì `ListEmptyComponent` mới chạy và người dùng mới thấy sự thật.
        // Chế độ demo (cờ TẮT) không đi qua đây — nhánh `fulfilled` trả 'disabled'.
        state.rooms = [];
        state.conversations = [];
        state.messagesByRoom = {};
        state.roomsStatus = 'error';
        state.loadError = 'Không tải được danh sách trò chuyện. Kéo để thử lại.';
      })
      .addCase(loadRoomMessages.pending, (state, action) => {
        if (!isProofChatBackendEnabled()) return;
        state.messagesStatus[action.meta.arg.roomId] = 'loading';
      })
      .addCase(loadRoomMessages.fulfilled, (state, action) => {
        if (action.payload === 'disabled') return; // giữ mock
        const { roomId, messages } = action.payload;
        state.messagesStatus[roomId] = 'ready';
        state.messagesByRoom[roomId] = messages;
      })
      .addCase(loadRoomMessages.rejected, (state, action) => {
        // Cùng lý do như `loadConversations.rejected`: không xoá thì phòng chat hiện
        // ra tin nhắn mock kèm tích "đã xác minh chữ ký" trong khi chưa hề tải được
        // gì. Thà trống và báo lỗi còn hơn đầy và sai.
        const { roomId } = action.meta.arg;
        state.messagesByRoom[roomId] = [];
        state.messagesStatus[roomId] = 'error';
      });
  },
});

export const {
  sendMessage,
  receiveDecryptedMessage,
  setMessageStage,
  decryptMessage,
  markRoomRead,
  setSync,
  flushQueue,
  setEscrowStatus,
  expireSession,
  refreshSession,
  createConversation,
  joinConversation,
  acceptInvitation,
  rejectInvitation,
  dismissInvitation,
  receiveWsMessage,
} = slice.actions;

export default slice.reducer;
