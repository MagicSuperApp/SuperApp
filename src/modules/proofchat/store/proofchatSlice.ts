// modules/proofchat/store/proofchatSlice.ts
//
// Slice tổng hợp cho module ProofChat. Mặc dù state được tổ chức theo feature
// (chat / wallet / escrow), ta gộp vào 1 slice để giảm boilerplate cho MVP.
// Proof System (features/proof/) KHÔNG có state — nó chỉ là pure functions/types.

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  ChatRoom,
  Conversation,
  ConversationType,
  Invitation,
  JoinRequest,
  Message,
  SyncState,
} from '../features/chat/types';
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
};

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
  },
});

export const {
  sendMessage,
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
} = slice.actions;

export default slice.reducer;
