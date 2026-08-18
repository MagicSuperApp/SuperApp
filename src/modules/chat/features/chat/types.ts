// modules/chat/features/chat/types.ts
//
// Application Layer types — quản lý chat, phòng, sync.
// Proof-specific types nằm ở `features/proof/types.ts`.

import type {
  MessageProof,
  MessageStage,
  VerificationStatus,
} from '../proof/types';
import type { Escrow } from '../escrow/types';

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  isMine: boolean;
  timestamp: number;

  /** Nội dung đã giải mã (UI). Có thể trống khi `stage === 'encrypted'`. */
  text?: string;

  /** Nội dung đã mã hóa — Application giữ, Proof System ký/xác thực. */
  ciphertext: string;

  /** Bằng chứng từ Proof System (hash + signature + Merkle proof). */
  proof: MessageProof;

  /** Kết quả kiểm chứng cuối cùng. */
  verificationStatus: VerificationStatus;

  /** Stage hiện tại trong lifecycle (UI animation). */
  stage: MessageStage;
}

export interface ChatRoom {
  id: string;
  jobTitle: string;
  jobCategory: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyAvatar?: string;
  counterpartyAddress: string;     // địa chỉ ví rút gọn dùng cho identity
  counterpartyVerified: boolean;
  online: boolean;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount: number;
  /** Liên kết tới escrow của job (sống trong feature/escrow). */
  escrow?: Escrow;
}

export interface SyncState {
  online: boolean;
  syncing: boolean;
  queuedCount: number;
}

// ── Conversation management ────────────────────────────────────────────────

export type ConversationType =
  | 'DIRECT'
  | 'GROUP'
  | 'THREAD'
  | 'JOB_NEGOTIATION';

export type ConversationVisibility = 'public' | 'private';

export interface Conversation {
  id: string;
  title: string;
  avatar?: string;
  type: ConversationType;
  visibility: ConversationVisibility;
  ownerId: string;
  memberCount: number;
  createdAt: number;
}

export type InvitationStatus = 'pending' | 'accepted' | 'rejected';

export interface Invitation {
  id: string;
  conversationId: string;
  conversationTitle: string;
  conversationAvatar?: string;
  conversationType: ConversationType;
  inviterId: string;
  inviterName: string;
  inviterAvatar?: string;
  message?: string;
  createdAt: number;
  status: InvitationStatus;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface JoinRequest {
  id: string;
  conversationId: string;
  conversationTitle?: string;
  message?: string;
  createdAt: number;
  status: JoinRequestStatus;
}

export const CONVERSATION_TYPE_META: Record<
  ConversationType,
  { label: string; description: string; icon: string }
> = {
  DIRECT: {
    label: 'Tin nhắn trực tiếp',
    description: '1-1 giữa bạn và một người',
    icon: 'account-outline',
  },
  GROUP: {
    label: 'Nhóm',
    description: 'Nhiều thành viên cùng trao đổi',
    icon: 'account-group-outline',
  },
  THREAD: {
    label: 'Chủ đề',
    description: 'Trao đổi theo một chủ đề cụ thể',
    icon: 'forum-outline',
  },
  JOB_NEGOTIATION: {
    label: 'Đàm phán công việc',
    description: 'Thoả thuận điều khoản cho một job',
    icon: 'handshake-outline',
  },
};
