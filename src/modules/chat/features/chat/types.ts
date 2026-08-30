// modules/chat/features/chat/types.ts
//
// Hình dạng dữ-liệu mà giao-diện Trò chuyện đọc. Mọi trường ở đây đều ĐẾN TỪ máy
// chủ ProofChat (`services/proofchat-api.ts`) hoặc từ tầng giải-mã
// (`services/proofchatService.ts`) — không còn trường nào do dữ-liệu mẫu dựng ra.
//
// Đã gỡ khỏi bản trước, vì máy chủ không hề cấp và trước đây chỉ dữ-liệu mẫu điền:
//   jobTitle · jobCategory · counterpartyAddress · counterpartyVerified · escrow
// Một phòng chat trên ProofChat là một *hội thoại* có tiêu-đề và danh-sách thành
// viên; nó không mang theo công việc, ví hay ký-quỹ.

import type { MessageState, TrustState } from '../proof/types';

// ── Hội thoại ───────────────────────────────────────────────────────────────

export type ConversationType =
  | 'DIRECT'
  | 'GROUP'
  | 'THREAD'
  | 'JOB_NEGOTIATION';

export type ConversationVisibility = 'public' | 'private';

export interface Participant {
  /** Định danh người dùng phía máy chủ. */
  id: string;
  /** Tên hiện ra màn hình: biệt danh trong phòng → tên hiển thị → rút gọn định danh. */
  name: string;
  avatar?: string;
  isAdmin: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  avatar?: string;
  type: ConversationType;
  visibility: ConversationVisibility;
  ownerId: string;
  memberCount: number;
  createdAt: number;
  /** Người trong phòng (máy chủ trả kèm ở `GET /conversations/:id`). */
  participants: Participant[];
  /** Tôi có quyền quản phòng không (mời, duyệt, đổi tên, gỡ người). */
  iAmAdmin: boolean;

  // ── Phần cập-nhật theo dòng tin ──
  /** Trích tin gần nhất. Trống khi máy này chưa mở được nội dung. */
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount: number;
}

// ── Tin nhắn ────────────────────────────────────────────────────────────────

export interface Reaction {
  emoji: string;
  count: number;
  /** Tôi đã thả cảm-xúc này chưa (để bấm lần nữa là gỡ). */
  mine: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  isMine: boolean;
  timestamp: number;

  /** Nội dung đã mở. `undefined` khi máy này chưa mở được (state = 'locked'). */
  text?: string;

  state: MessageState;
  trust: TrustState;

  reactions: Reaction[];
  pinned: boolean;
  saved: boolean;
  /** Tin đã thu hồi — giữ chỗ trong dòng, không giữ nội dung. */
  deleted: boolean;
}

// ── Lời mời & yêu-cầu vào phòng ─────────────────────────────────────────────

export type RequestStatus = 'pending' | 'accepted' | 'rejected';

/** Người khác mời TÔI vào một phòng. */
export interface Invitation {
  id: string;
  conversationId: string;
  conversationTitle: string;
  conversationType: ConversationType;
  inviterId: string;
  inviterName: string;
  message?: string;
  createdAt: number;
  status: RequestStatus;
}

/** Ai đó xin vào phòng TÔI quản, hoặc tôi xin vào phòng người khác. */
export interface JoinRequest {
  id: string;
  conversationId: string;
  conversationTitle?: string;
  requesterId?: string;
  requesterName?: string;
  message?: string;
  createdAt: number;
  status: RequestStatus;
}

// ── Trạng thái kết nối ──────────────────────────────────────────────────────

export interface SyncState {
  online: boolean;
  syncing: boolean;
  /** Số tin còn nằm chờ vì mất mạng. */
  queuedCount: number;
}

// ── Nhãn hiển thị cho từng loại phòng ───────────────────────────────────────
// Cố ý viết bằng lời thường: người dùng không cần đọc "JOB_NEGOTIATION".

export const CONVERSATION_TYPE_META: Record<
  ConversationType,
  { label: string; description: string; icon: string }
> = {
  DIRECT: {
    label: 'Trò chuyện riêng',
    description: 'Chỉ bạn và một người',
    icon: 'account-outline',
  },
  GROUP: {
    label: 'Nhóm',
    description: 'Nhiều người cùng trao đổi',
    icon: 'account-group-outline',
  },
  THREAD: {
    label: 'Chủ đề',
    description: 'Bàn quanh một chuyện cụ thể',
    icon: 'forum-outline',
  },
  JOB_NEGOTIATION: {
    label: 'Thoả thuận công việc',
    description: 'Chốt việc và điều kiện làm',
    icon: 'handshake-outline',
  },
};
