// modules/chat/store/chatSlice.ts
//
// Trạng-thái module Trò chuyện. TOÀN BỘ dữ-liệu ở đây đến từ máy chủ ProofChat.
//
// LÝ DO BẢN NÀY BỎ HẲN DỮ-LIỆU MẪU: bản trước nạp `MOCK_ROOMS`/`MOCK_MESSAGES`
// vào `initialState`, nên khi máy chủ chưa mở hoặc gọi hỏng thì màn chat vẫn vẽ
// đủ phòng, đủ tin, đủ số chưa-đọc. Người dùng nhắn vào đó rồi ngồi đợi trả lời.
// Nay `initialState` RỖNG: chưa tải được thì màn hình nói chưa tải được.
//
// Bề mặt máy chủ dùng ở đây (`services/proofchat-api.ts`):
//   conversations   list · get · join · leave · update · participants · pins
//   memberRequests  pending · accept · decline · listForConversation · approve · reject · invite
//   messages        react · unreact · save · unsave · remove
//   readSignals     send        (báo đã-xem, KHÔNG kèm nội dung)
//
// NỘI DUNG tin không đi qua REST: gửi và nhận plaintext do `proofchatService` lo
// (mã hoá + socket). Máy chủ chỉ giữ phần vỏ. Vì vậy một tin có thể ở trạng-thái
// 'locked' — đã nhận nhưng máy này chưa mở được nội dung.

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type {
  Conversation,
  ConversationType,
  Invitation,
  JoinRequest,
  Message,
  Participant,
  Reaction,
  SyncState,
} from '../features/chat/types';
import type { MessageState, TrustState } from '../features/proof/types';
import {
  proofChatApi,
  isProofChatBackendEnabled,
  getDeviceId,
  type RemoteConversation,
  type RemoteMemberRequest,
  type RemoteMessage,
  type RemoteParticipant,
} from '../../../services/proofchat-api';

/** Trạng-thái tải của một danh sách. */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ChatState {
  /** Định danh của tôi phía máy chủ (did:phoenix). Rỗng khi chưa đăng nhập. */
  meId: string;

  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;

  /** Lời mời người khác gửi cho tôi. */
  invitations: Invitation[];
  /** Yêu-cầu xin vào phòng, theo từng phòng tôi quản. */
  joinRequestsByConversation: Record<string, JoinRequest[]>;

  /** ID tin đã ghim, theo phòng. */
  pinnedByConversation: Record<string, string[]>;
  /** Ai đang gõ, theo phòng. */
  typingByConversation: Record<string, string[]>;

  sync: SyncState;

  listStatus: LoadStatus;
  messagesStatus: Record<string, LoadStatus>;
  invitationsStatus: LoadStatus;
  /** Câu báo lỗi viết cho người dùng — KHÔNG chứa mã lỗi hay tên endpoint. */
  loadError?: string;
}

const initialState: ChatState = {
  meId: '',
  conversations: [],
  messagesByConversation: {},
  invitations: [],
  joinRequestsByConversation: {},
  pinnedByConversation: {},
  typingByConversation: {},
  sync: { online: true, syncing: false, queuedCount: 0 },
  listStatus: 'idle',
  messagesStatus: {},
  invitationsStatus: 'idle',
  loadError: undefined,
};

// ── Chuyển hình máy chủ → hình giao-diện ────────────────────────────────────

const toEpoch = (v: number | string | null | undefined): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
};

/** Rút gọn một định danh dài thành thứ đọc được khi máy chủ chưa cấp tên. */
export const shortId = (id: string): string =>
  id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;

const toParticipant = (p: RemoteParticipant): Participant => {
  const id = p.userId ?? p.userDid ?? '';
  return {
    id,
    name: p.nickname?.trim() || p.displayName?.trim() || shortId(id),
    avatar: p.avatar ?? undefined,
    isAdmin: (p.role ?? '').toUpperCase() === 'ADMIN',
  };
};

const CONVERSATION_TYPES: ConversationType[] = [
  'DIRECT',
  'GROUP',
  'THREAD',
  'JOB_NEGOTIATION',
];

const toConversationType = (t?: string): ConversationType =>
  CONVERSATION_TYPES.includes((t ?? '') as ConversationType)
    ? (t as ConversationType)
    : 'GROUP';

/**
 * Đặt tên cho phòng khi máy chủ không trả `title` — hay gặp ở phòng 1-1, vì tên
 * phòng chính là tên người kia. Ghép từ danh sách thành viên, bỏ chính mình ra.
 */
const titleFor = (c: RemoteConversation, participants: Participant[], meId: string): string => {
  const given = c.title?.trim();
  if (given) return given;
  const others = participants.filter((p) => p.id && p.id !== meId);
  if (others.length === 0) return 'Cuộc trò chuyện';
  if (others.length <= 3) return others.map((p) => p.name).join(', ');
  return `${others.slice(0, 2).map((p) => p.name).join(', ')} và ${others.length - 2} người khác`;
};

const toConversation = (
  c: RemoteConversation,
  meId: string,
  previous?: Conversation,
): Conversation => {
  const participants = (c.participants ?? []).map(toParticipant);
  return {
    id: c.id,
    title: titleFor(c, participants, meId),
    avatar: c.avatar ?? undefined,
    type: toConversationType(c.type),
    visibility: c.visibility === 'public' ? 'public' : 'private',
    ownerId: c.ownerId ?? '',
    memberCount: c.memberCount ?? participants.length,
    createdAt: toEpoch(c.createdAt) || Date.now(),
    participants: participants.length > 0 ? participants : previous?.participants ?? [],
    iAmAdmin:
      c.ownerId === meId ||
      participants.some((p) => p.id === meId && p.isAdmin) ||
      (participants.length === 0 && (previous?.iAmAdmin ?? false)),
    // Tin gần nhất do tầng giải-mã đổ vào; máy chủ chỉ cấp mốc thời gian.
    lastMessage: previous?.lastMessage,
    lastMessageAt: toEpoch(c.lastMessageAt) || previous?.lastMessageAt || toEpoch(c.updatedAt) || undefined,
    unreadCount: c.unreadCount ?? previous?.unreadCount ?? 0,
  };
};

const toReactions = (
  raw: RemoteMessage['reactions'],
  meId: string,
): Reaction[] => {
  if (!raw?.length) return [];
  const byEmoji = new Map<string, Reaction>();
  raw.forEach((r) => {
    const cur = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId && r.userId === meId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  });
  return [...byEmoji.values()];
};

/**
 * Tin từ REST luôn ở dạng chưa mở được: máy chủ chỉ giữ phần vỏ mã hoá. Nội dung
 * thật tới sau qua `receiveDecryptedMessage`, khớp theo id.
 */
const toMessage = (m: RemoteMessage, conversationId: string, meId: string): Message => {
  const sender = m.senderDid ?? m.senderId ?? '';
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    conversationId,
    senderId: sender,
    isMine: sender === meId,
    timestamp: toEpoch(m.createdAt) || Date.now(),
    text: undefined,
    state: deleted ? 'delivered' : 'locked',
    trust: 'unknown',
    reactions: toReactions(m.reactions, meId),
    pinned: !!m.isPinned,
    saved: !!m.isSaved,
    deleted,
  };
};

const toInvitation = (r: RemoteMemberRequest): Invitation => ({
  id: r.id,
  conversationId: r.conversationId,
  conversationTitle: r.conversationTitle?.trim() || 'Cuộc trò chuyện',
  conversationType: toConversationType(undefined),
  inviterId: r.initiatorId ?? '',
  inviterName: r.initiatorName?.trim() || shortId(r.initiatorId ?? ''),
  message: r.message?.trim() || undefined,
  createdAt: toEpoch(r.createdAt) || Date.now(),
  status: 'pending',
});

const toJoinRequest = (r: RemoteMemberRequest): JoinRequest => ({
  id: r.id,
  conversationId: r.conversationId,
  conversationTitle: r.conversationTitle?.trim() || undefined,
  requesterId: r.targetUserId ?? r.initiatorId,
  requesterName:
    r.initiatorName?.trim() || shortId(r.targetUserId ?? r.initiatorId ?? ''),
  message: r.message?.trim() || undefined,
  createdAt: toEpoch(r.createdAt) || Date.now(),
  status: 'pending',
});

// ── Thunk ───────────────────────────────────────────────────────────────────
// Mọi thunk đều tự kiểm cổng backend trước. Cổng đóng ⇒ trả 'disabled' và
// reducer KHÔNG đụng vào state — không có nhánh nào dựng dữ-liệu thay thế.

const OFF = 'disabled' as const;
type Off = typeof OFF;

/** Danh sách phòng của tôi. */
export const loadConversations = createAsyncThunk<
  { conversations: RemoteConversation[]; meId: string } | Off
>('chat/loadConversations', async (_arg, { getState }) => {
  if (!isProofChatBackendEnabled()) return OFF;
  const meId = (getState() as { chat: ChatState }).chat.meId;
  const list = await proofChatApi.conversations.list({ take: 100 });
  return { conversations: list, meId };
});

/** Chi tiết 1 phòng — cần cho danh sách thành viên và quyền quản. */
export const loadConversationDetail = createAsyncThunk<
  RemoteConversation | Off,
  string
>('chat/loadConversationDetail', async (conversationId) => {
  if (!isProofChatBackendEnabled()) return OFF;
  return proofChatApi.conversations.get(conversationId);
});

/** Tin cũ của 1 phòng (phần vỏ; nội dung mở sau). */
export const loadMessages = createAsyncThunk<
  { conversationId: string; messages: RemoteMessage[] } | Off,
  string
>('chat/loadMessages', async (conversationId) => {
  if (!isProofChatBackendEnabled()) return OFF;
  const deviceId = await getDeviceId();
  const messages = await proofChatApi.conversations.getMessages(
    conversationId,
    deviceId,
    { take: 200 },
  );
  return { conversationId, messages };
});

/** Lời mời đang chờ tôi trả lời. */
export const loadInvitations = createAsyncThunk<RemoteMemberRequest[] | Off>(
  'chat/loadInvitations',
  async () => {
    if (!isProofChatBackendEnabled()) return OFF;
    return proofChatApi.memberRequests.pending();
  },
);

export const acceptInvitation = createAsyncThunk<string, string>(
  'chat/acceptInvitation',
  async (requestId) => {
    await proofChatApi.memberRequests.accept(requestId);
    return requestId;
  },
);

export const declineInvitation = createAsyncThunk<string, string>(
  'chat/declineInvitation',
  async (requestId) => {
    await proofChatApi.memberRequests.decline(requestId);
    return requestId;
  },
);

/** Yêu-cầu xin vào 1 phòng tôi quản. */
export const loadJoinRequests = createAsyncThunk<
  { conversationId: string; requests: RemoteMemberRequest[] } | Off,
  string
>('chat/loadJoinRequests', async (conversationId) => {
  if (!isProofChatBackendEnabled()) return OFF;
  const requests = await proofChatApi.memberRequests.listForConversation(conversationId);
  return { conversationId, requests };
});

export const approveJoinRequest = createAsyncThunk<
  { conversationId: string; requestId: string },
  { conversationId: string; requestId: string }
>('chat/approveJoinRequest', async ({ conversationId, requestId }) => {
  await proofChatApi.memberRequests.approve(conversationId, requestId);
  return { conversationId, requestId };
});

export const rejectJoinRequest = createAsyncThunk<
  { conversationId: string; requestId: string },
  { conversationId: string; requestId: string; reason?: string }
>('chat/rejectJoinRequest', async ({ conversationId, requestId, reason }) => {
  await proofChatApi.memberRequests.reject(conversationId, requestId, reason);
  return { conversationId, requestId };
});

/**
 * Vào một phòng theo ID. Phòng mở → vào ngay; phòng kín → thành yêu-cầu chờ duyệt.
 * Máy chủ tự quyết, app KHÔNG đoán trước (bản cũ đoán bằng một danh sách ID mẫu).
 */
export const joinConversation = createAsyncThunk<
  { action: string; conversationId: string },
  { conversationId: string; message?: string }
>('chat/joinConversation', async ({ conversationId, message }) => {
  const res = await proofChatApi.conversations.join(conversationId, message);
  return { action: res.action ?? 'REQUESTED', conversationId };
});

export const leaveConversation = createAsyncThunk<string, string>(
  'chat/leaveConversation',
  async (conversationId) => {
    await proofChatApi.conversations.leave(conversationId);
    return conversationId;
  },
);

export const renameConversation = createAsyncThunk<
  { conversationId: string; title: string },
  { conversationId: string; title: string }
>('chat/renameConversation', async ({ conversationId, title }) => {
  await proofChatApi.conversations.update(conversationId, { title });
  return { conversationId, title };
});

export const inviteMember = createAsyncThunk<
  void,
  { conversationId: string; userId: string; message?: string }
>('chat/inviteMember', async ({ conversationId, userId, message }) => {
  await proofChatApi.memberRequests.invite(conversationId, userId, message);
});

export const removeMember = createAsyncThunk<
  { conversationId: string; userId: string },
  { conversationId: string; userId: string }
>('chat/removeMember', async ({ conversationId, userId }) => {
  await proofChatApi.conversations.removeParticipant(conversationId, userId);
  return { conversationId, userId };
});

/**
 * Thả / gỡ cảm-xúc. Sửa ngay trên máy trước rồi mới gọi máy chủ (bấm là thấy);
 * gọi hỏng thì `rejected` lật lại đúng trạng-thái cũ.
 */
export const toggleReaction = createAsyncThunk<
  void,
  { conversationId: string; messageId: string; emoji: string; had: boolean }
>('chat/toggleReaction', async ({ messageId, emoji, had }) => {
  if (had) await proofChatApi.messages.unreact(messageId, emoji);
  else await proofChatApi.messages.react(messageId, emoji);
});

export const togglePin = createAsyncThunk<
  void,
  { conversationId: string; messageId: string; pinned: boolean }
>('chat/togglePin', async ({ conversationId, messageId, pinned }) => {
  if (pinned) await proofChatApi.conversations.unpin(conversationId, messageId);
  else await proofChatApi.conversations.pin(conversationId, messageId);
});

export const toggleSave = createAsyncThunk<
  void,
  { conversationId: string; messageId: string; saved: boolean }
>('chat/toggleSave', async ({ messageId, saved }) => {
  if (saved) await proofChatApi.messages.unsave(messageId);
  else await proofChatApi.messages.save(messageId);
});

export const deleteMessage = createAsyncThunk<
  void,
  { conversationId: string; messageId: string; forEveryone: boolean }
>('chat/deleteMessage', async ({ messageId, forEveryone }) => {
  await proofChatApi.messages.remove(messageId, forEveryone);
});

export const loadPins = createAsyncThunk<
  { conversationId: string; messageIds: string[] } | Off,
  string
>('chat/loadPins', async (conversationId) => {
  if (!isProofChatBackendEnabled()) return OFF;
  const pins = await proofChatApi.conversations.listPins(conversationId);
  return { conversationId, messageIds: pins.map((p) => p.messageId).filter(Boolean) };
});

/**
 * Báo "đã xem" cho những tin vừa hiện trên màn. Gửi kèm mốc thời gian, KHÔNG kèm
 * nội dung. Lỗi ở đây không được làm phiền người dùng — nuốt tại chỗ.
 */
export const reportSeen = createAsyncThunk<
  string,
  { conversationId: string; messageIds: string[] }
>('chat/reportSeen', async ({ conversationId, messageIds }) => {
  if (isProofChatBackendEnabled() && messageIds.length > 0) {
    await proofChatApi.readSignals
      .send(conversationId, messageIds.map((id) => ({ messageId: id })))
      .catch(() => undefined);
  }
  return conversationId;
});

// ── Slice ───────────────────────────────────────────────────────────────────

const findMessage = (
  state: ChatState,
  conversationId: string,
  messageId: string,
): Message | undefined =>
  state.messagesByConversation[conversationId]?.find((m) => m.id === messageId);

const touchConversation = (
  state: ChatState,
  conversationId: string,
  patch: Partial<Conversation>,
): void => {
  const c = state.conversations.find((x) => x.id === conversationId);
  if (c) Object.assign(c, patch);
};

const slice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    /** Định danh của tôi — đặt một lần khi phiên chat sẵn sàng. */
    setMeId: (state, action: PayloadAction<string>) => {
      if (state.meId === action.payload) return;
      const me = action.payload;
      state.meId = me;
      // Ai là "tôi" đổi thì mọi tin phải tính lại phía nào của màn hình…
      Object.values(state.messagesByConversation).forEach((list) =>
        list.forEach((m) => {
          m.isMine = m.senderId === me;
        }),
      );
      // …và mọi phòng phải tính lại tôi có quyền quản hay không. Bỏ bước này thì
      // phòng nào nạp TRƯỚC lúc biết danh tính sẽ vĩnh viễn ẩn hết nút quản lý.
      state.conversations.forEach((c) => {
        c.iAmAdmin =
          c.ownerId === me || c.participants.some((p) => p.id === me && p.isAdmin);
      });
    },

    setSync: (state, action: PayloadAction<Partial<SyncState>>) => {
      state.sync = { ...state.sync, ...action.payload };
    },

    /**
     * Tin ĐÃ MỞ ĐƯỢC NỘI DUNG, từ `proofchatService`. Đây là nguồn DUY NHẤT của
     * nội dung tin — kể cả tin của chính mình cũng quay về qua đường này, nên
     * không có bản "gửi lạc quan" nào để nhân đôi.
     */
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
      const trust: TrustState = merkleVerified === false ? 'broken' : merkleVerified === true ? 'ok' : 'unknown';
      const list = state.messagesByConversation[conversationId] ?? [];
      const existing = list.find((m) => m.id === id);

      if (existing) {
        existing.text = plaintext;
        existing.state = existing.isMine ? 'sent' : 'delivered';
        existing.trust = trust;
      } else {
        list.push({
          id,
          conversationId,
          senderId,
          isMine,
          timestamp,
          text: plaintext,
          state: isMine ? 'sent' : 'delivered',
          trust,
          reactions: [],
          pinned: false,
          saved: false,
          deleted: false,
        });
        list.sort((a, b) => a.timestamp - b.timestamp);
        state.messagesByConversation[conversationId] = list;
      }

      const c = state.conversations.find((x) => x.id === conversationId);
      if (c) {
        c.lastMessage = plaintext;
        c.lastMessageAt = timestamp;
        if (!isMine) c.unreadCount += 1;
      }
    },

    /** Ai đó đang gõ trong phòng. */
    setTyping: (
      state,
      action: PayloadAction<{ conversationId: string; userId: string; isTyping: boolean }>,
    ) => {
      const { conversationId, userId, isTyping } = action.payload;
      const cur = state.typingByConversation[conversationId] ?? [];
      state.typingByConversation[conversationId] = isTyping
        ? cur.includes(userId)
          ? cur
          : [...cur, userId]
        : cur.filter((u) => u !== userId);
    },

    /** Xoá dấu chưa-đọc khi mở phòng (phần đối chiếu với máy chủ do `reportSeen` lo). */
    markConversationRead: (state, action: PayloadAction<string>) => {
      touchConversation(state, action.payload, { unreadCount: 0 });
    },

    clearError: (state) => {
      state.loadError = undefined;
    },
  },

  extraReducers: (builder) => {
    builder
      // ── Danh sách phòng ──
      .addCase(loadConversations.pending, (state) => {
        state.listStatus = 'loading';
        state.loadError = undefined;
      })
      .addCase(loadConversations.fulfilled, (state, action) => {
        if (action.payload === OFF) {
          state.listStatus = 'idle';
          return;
        }
        const { conversations, meId } = action.payload;
        const previous = new Map(state.conversations.map((c) => [c.id, c]));
        state.conversations = conversations.map((c) =>
          toConversation(c, meId, previous.get(c.id)),
        );
        state.listStatus = 'ready';
        state.loadError = undefined;
      })
      .addCase(loadConversations.rejected, (state) => {
        // Tải hỏng thì để TRỐNG. Giữ lại danh sách cũ ở đây chính là cái bẫy của
        // bản trước: người dùng nhìn thấy phòng nhưng không có gì đang chạy.
        state.conversations = [];
        state.listStatus = 'error';
        state.loadError = 'Chưa tải được danh sách trò chuyện. Kéo xuống để thử lại.';
      })

      // ── Chi tiết phòng ──
      .addCase(loadConversationDetail.fulfilled, (state, action) => {
        if (action.payload === OFF) return;
        const remote = action.payload;
        const idx = state.conversations.findIndex((c) => c.id === remote.id);
        const mapped = toConversation(remote, state.meId, state.conversations[idx]);
        if (idx >= 0) state.conversations[idx] = mapped;
        else state.conversations.unshift(mapped);
      })

      // ── Tin nhắn ──
      .addCase(loadMessages.pending, (state, action) => {
        state.messagesStatus[action.meta.arg] = 'loading';
      })
      .addCase(loadMessages.fulfilled, (state, action) => {
        if (action.payload === OFF) return;
        const { conversationId, messages } = action.payload;
        // Giữ lại nội dung đã mở được ở lượt trước: REST chỉ trả phần vỏ, ghi đè
        // thẳng sẽ làm cả phòng "đóng" lại mỗi lần mở màn.
        const opened = new Map(
          (state.messagesByConversation[conversationId] ?? [])
            .filter((m) => m.text !== undefined)
            .map((m) => [m.id, m]),
        );
        state.messagesByConversation[conversationId] = messages
          .map((m) => {
            const fresh = toMessage(m, conversationId, state.meId);
            const known = opened.get(m.id);
            return known
              ? { ...fresh, text: known.text, state: known.state, trust: known.trust }
              : fresh;
          })
          .sort((a, b) => a.timestamp - b.timestamp);
        state.messagesStatus[conversationId] = 'ready';
      })
      .addCase(loadMessages.rejected, (state, action) => {
        state.messagesByConversation[action.meta.arg] = [];
        state.messagesStatus[action.meta.arg] = 'error';
      })

      // ── Lời mời tới tôi ──
      .addCase(loadInvitations.pending, (state) => {
        state.invitationsStatus = 'loading';
      })
      .addCase(loadInvitations.fulfilled, (state, action) => {
        if (action.payload === OFF) {
          state.invitationsStatus = 'idle';
          return;
        }
        state.invitations = action.payload.map(toInvitation);
        state.invitationsStatus = 'ready';
      })
      .addCase(loadInvitations.rejected, (state) => {
        state.invitations = [];
        state.invitationsStatus = 'error';
      })
      .addCase(acceptInvitation.fulfilled, (state, action) => {
        state.invitations = state.invitations.filter((i) => i.id !== action.payload);
      })
      .addCase(declineInvitation.fulfilled, (state, action) => {
        state.invitations = state.invitations.filter((i) => i.id !== action.payload);
      })

      // ── Yêu-cầu xin vào phòng ──
      .addCase(loadJoinRequests.fulfilled, (state, action) => {
        if (action.payload === OFF) return;
        const { conversationId, requests } = action.payload;
        state.joinRequestsByConversation[conversationId] = requests.map(toJoinRequest);
      })
      .addCase(approveJoinRequest.fulfilled, (state, action) => {
        const { conversationId, requestId } = action.payload;
        state.joinRequestsByConversation[conversationId] =
          (state.joinRequestsByConversation[conversationId] ?? []).filter(
            (r) => r.id !== requestId,
          );
      })
      .addCase(rejectJoinRequest.fulfilled, (state, action) => {
        const { conversationId, requestId } = action.payload;
        state.joinRequestsByConversation[conversationId] =
          (state.joinRequestsByConversation[conversationId] ?? []).filter(
            (r) => r.id !== requestId,
          );
      })

      // ── Vào / rời / đổi tên / thành viên ──
      .addCase(leaveConversation.fulfilled, (state, action) => {
        state.conversations = state.conversations.filter((c) => c.id !== action.payload);
        delete state.messagesByConversation[action.payload];
        delete state.messagesStatus[action.payload];
      })
      .addCase(renameConversation.fulfilled, (state, action) => {
        touchConversation(state, action.payload.conversationId, {
          title: action.payload.title,
        });
      })
      .addCase(removeMember.fulfilled, (state, action) => {
        const c = state.conversations.find((x) => x.id === action.payload.conversationId);
        if (!c) return;
        c.participants = c.participants.filter((p) => p.id !== action.payload.userId);
        c.memberCount = Math.max(0, c.memberCount - 1);
      })

      // ── Cảm-xúc · ghim · lưu · thu hồi (sửa trước, lật lại nếu hỏng) ──
      .addCase(toggleReaction.pending, (state, action) => {
        const { conversationId, messageId, emoji, had } = action.meta.arg;
        const m = findMessage(state, conversationId, messageId);
        if (!m) return;
        applyReaction(m, emoji, !had);
      })
      .addCase(toggleReaction.rejected, (state, action) => {
        const { conversationId, messageId, emoji, had } = action.meta.arg;
        const m = findMessage(state, conversationId, messageId);
        if (!m) return;
        applyReaction(m, emoji, had);
      })
      .addCase(togglePin.pending, (state, action) => {
        const { conversationId, messageId, pinned } = action.meta.arg;
        const m = findMessage(state, conversationId, messageId);
        if (m) m.pinned = !pinned;
        setPinList(state, conversationId, messageId, !pinned);
      })
      .addCase(togglePin.rejected, (state, action) => {
        const { conversationId, messageId, pinned } = action.meta.arg;
        const m = findMessage(state, conversationId, messageId);
        if (m) m.pinned = pinned;
        setPinList(state, conversationId, messageId, pinned);
      })
      .addCase(toggleSave.pending, (state, action) => {
        const m = findMessage(state, action.meta.arg.conversationId, action.meta.arg.messageId);
        if (m) m.saved = !action.meta.arg.saved;
      })
      .addCase(toggleSave.rejected, (state, action) => {
        const m = findMessage(state, action.meta.arg.conversationId, action.meta.arg.messageId);
        if (m) m.saved = action.meta.arg.saved;
      })
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const m = findMessage(state, action.meta.arg.conversationId, action.meta.arg.messageId);
        if (!m) return;
        m.deleted = true;
        m.text = undefined;
        m.reactions = [];
      })

      // ── Ghim ──
      .addCase(loadPins.fulfilled, (state, action) => {
        if (action.payload === OFF) return;
        const { conversationId, messageIds } = action.payload;
        state.pinnedByConversation[conversationId] = messageIds;
        const list = state.messagesByConversation[conversationId];
        if (list) {
          const set = new Set(messageIds);
          list.forEach((m) => {
            m.pinned = set.has(m.id);
          });
        }
      });
  },
});

function applyReaction(m: Message, emoji: string, add: boolean): void {
  const found = m.reactions.find((r) => r.emoji === emoji);
  if (add) {
    if (found) {
      if (found.mine) return;
      found.count += 1;
      found.mine = true;
    } else {
      m.reactions.push({ emoji, count: 1, mine: true });
    }
    return;
  }
  if (!found) return;
  found.count -= 1;
  found.mine = false;
  if (found.count <= 0) m.reactions = m.reactions.filter((r) => r.emoji !== emoji);
}

function setPinList(
  state: ChatState,
  conversationId: string,
  messageId: string,
  pinned: boolean,
): void {
  const cur = state.pinnedByConversation[conversationId] ?? [];
  state.pinnedByConversation[conversationId] = pinned
    ? cur.includes(messageId)
      ? cur
      : [...cur, messageId]
    : cur.filter((id) => id !== messageId);
}

export const {
  setMeId,
  setSync,
  receiveDecryptedMessage,
  setTyping,
  markConversationRead,
  clearError,
} = slice.actions;

export type { ChatState, MessageState };
export default slice.reducer;
