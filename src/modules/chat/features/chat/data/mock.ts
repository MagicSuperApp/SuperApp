// modules/chat/features/chat/data/mock.ts
//
// Dữ liệu mock cho UI ProofChat. Mọi token, địa chỉ, refId đều là chuỗi giả lập —
// không liên quan tới bất kỳ blockchain cụ thể nào.

import type {
  ChatRoom,
  Conversation,
  Invitation,
  JoinRequest,
  Message,
} from '../types';
import type { Escrow } from '../../escrow/types';
import type { Wallet, WalletTransaction, Identity } from '../../wallet/types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = Date.now();

export const MOCK_ME_ID = 'me';

// ── Helpers tạo proof giả lập ───────────────────────────────────────────────
const mockProof = (seed: string) => ({
  hash: `0x${seed}a1b2c3d4e5f6`,
  signature: `0xsig_${seed}_8a9b0c1d2e3f`,
  merkleProof: `[0x${seed}m1, 0x${seed}m2, 0x${seed}m3]`,
});

const mockCipher = (seed: string) =>
  `enc:${seed}:8f4a2b9e1c7d3a5b6f0e2c4d1a8b9e3f`;

// ── Escrows ─────────────────────────────────────────────────────────────────
const ESCROW_1: Escrow = {
  id: 'es-1', jobId: 'job-1', amount: 250,
  status: 'locked',
  createdAt: now - 2 * HOUR, updatedAt: now - 2 * HOUR,
};
const ESCROW_2: Escrow = {
  id: 'es-2', jobId: 'job-2', amount: 800,
  status: 'released',
  createdAt: now - 3 * DAY, updatedAt: now - 30 * MINUTE,
};
const ESCROW_3: Escrow = {
  id: 'es-3', jobId: 'job-3', amount: 450,
  status: 'pending',
  createdAt: now - 6 * HOUR, updatedAt: now - 6 * HOUR,
};
const ESCROW_5: Escrow = {
  id: 'es-5', jobId: 'job-5', amount: 1500,
  status: 'locked',
  createdAt: now - 5 * DAY, updatedAt: now - 5 * DAY,
};

// ── Rooms ───────────────────────────────────────────────────────────────────
export const MOCK_ROOMS: ChatRoom[] = [
  {
    id: 'room-1',
    jobTitle: 'Sửa máy giặt LG tại nhà',
    jobCategory: 'Sửa chữa',
    counterpartyId: 'u-1',
    counterpartyName: 'Anh Hoàng — Thợ điện lạnh',
    counterpartyAddress: '0x7a3fb1c2d4e5f608a9b0c1d2e3f4',
    counterpartyVerified: true,
    online: true,
    lastMessage: 'Em có thể qua lúc 3h chiều nay được không?',
    lastMessageAt: now - 4 * MINUTE,
    unreadCount: 2,
    escrow: ESCROW_1,
  },
  {
    id: 'room-2',
    jobTitle: 'Vận chuyển 20 thùng hàng — Hà Nội đi Hải Phòng',
    jobCategory: 'Vận chuyển',
    counterpartyId: 'u-2',
    counterpartyName: 'Chị Linh — Vận tải Phú An',
    counterpartyAddress: '0x4b9e7c2f77a8d1e3a5b6c0e2',
    counterpartyVerified: true,
    online: false,
    lastMessage: 'Chị xác nhận đã nhận hàng đầy đủ.',
    lastMessageAt: now - 1 * HOUR,
    unreadCount: 0,
    escrow: ESCROW_2,
  },
  {
    id: 'room-3',
    jobTitle: 'Thiết kế logo cho quán cà phê',
    jobCategory: 'Sáng tạo',
    counterpartyId: 'u-3',
    counterpartyName: 'Bạn Mai — Designer freelance',
    counterpartyAddress: '0x2e4d1a8b9e3f0c7d6a5b4f2c',
    counterpartyVerified: false,
    online: false,
    lastMessage: 'Tin nhắn được mã hóa',
    lastMessageAt: now - 5 * HOUR,
    unreadCount: 1,
    escrow: ESCROW_3,
  },
  {
    id: 'room-4',
    jobTitle: 'Dọn nhà cuối tuần — căn hộ 60m²',
    jobCategory: 'Dịch vụ',
    counterpartyId: 'u-4',
    counterpartyName: 'Cô Tâm — Dịch vụ vệ sinh',
    counterpartyAddress: '0xc1d2_90fe_a3b4_5e6f_7c8d',
    counterpartyVerified: true,
    online: true,
    lastMessage: 'Vâng, hẹn cô sáng thứ 7 nhé.',
    lastMessageAt: now - 1 * DAY,
    unreadCount: 0,
  },
  {
    id: 'room-5',
    jobTitle: 'Lập trình API tích hợp thanh toán',
    jobCategory: 'IT',
    counterpartyId: 'u-5',
    counterpartyName: 'Anh Tuấn — Backend Engineer',
    counterpartyAddress: '0xa002d88bc4f1e3a5b6c0d2e7',
    counterpartyVerified: true,
    online: false,
    lastMessage: 'Mình đã đẩy code lên repo, anh review giúp.',
    lastMessageAt: now - 2 * DAY,
    unreadCount: 0,
    escrow: ESCROW_5,
  },
];

// ── Messages ────────────────────────────────────────────────────────────────
const buildMsg = (
  partial: Pick<Message, 'id' | 'roomId' | 'senderId' | 'isMine' | 'timestamp'> &
    Partial<Pick<Message, 'text' | 'verificationStatus' | 'stage'>>,
): Message => ({
  text: partial.text ?? '',
  ciphertext: mockCipher(partial.id),
  proof: mockProof(partial.id),
  verificationStatus: partial.verificationStatus ?? 'verified',
  stage: partial.stage ?? (partial.isMine ? 'read' : 'done'),
  ...partial,
});

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'room-1': [
    buildMsg({
      id: 'm1', roomId: 'room-1', senderId: 'u-1', isMine: false,
      text: 'Chào anh, em là thợ Hoàng. Em đã nhận job sửa máy giặt LG.',
      timestamp: now - 3 * HOUR,
    }),
    buildMsg({
      id: 'm2', roomId: 'room-1', senderId: MOCK_ME_ID, isMine: true,
      text: 'Chào em, em sửa được model WD-12G33 không?',
      timestamp: now - 3 * HOUR + 2 * MINUTE,
    }),
    buildMsg({
      id: 'm3', roomId: 'room-1', senderId: 'u-1', isMine: false,
      text: 'Dạ được anh. Phí công khoảng 250 MAGIC chưa tính vật tư.',
      timestamp: now - 3 * HOUR + 5 * MINUTE,
    }),
    buildMsg({
      id: 'm4', roomId: 'room-1', senderId: MOCK_ME_ID, isMine: true,
      text: 'OK em, anh đã nạp 250 MAGIC vào escrow rồi nhé.',
      timestamp: now - 2 * HOUR,
    }),
    buildMsg({
      id: 'm5', roomId: 'room-1', senderId: 'u-1', isMine: false,
      text: 'Em đã nhận thông báo escrow. Cảm ơn anh!',
      timestamp: now - 2 * HOUR + 1 * MINUTE,
    }),
    // Tin nhắn đến CHƯA giải mã — demo lifecycle nhận
    buildMsg({
      id: 'm6', roomId: 'room-1', senderId: 'u-1', isMine: false,
      text: '',
      timestamp: now - 30 * MINUTE,
      stage: 'encrypted',
      verificationStatus: 'pending',
    }),
    buildMsg({
      id: 'm7', roomId: 'room-1', senderId: 'u-1', isMine: false,
      text: 'Em có thể qua lúc 3h chiều nay được không?',
      timestamp: now - 4 * MINUTE,
      stage: 'done',
    }),
  ],
  'room-2': [
    buildMsg({
      id: 'm21', roomId: 'room-2', senderId: MOCK_ME_ID, isMine: true,
      text: 'Chị xác nhận đã nhận hàng đầy đủ và đúng thời gian.',
      timestamp: now - 1 * HOUR - 1 * MINUTE,
    }),
    buildMsg({
      id: 'm22', roomId: 'room-2', senderId: 'u-2', isMine: false,
      text: 'Cảm ơn anh đã sử dụng dịch vụ! Em đã nhận escrow.',
      timestamp: now - 1 * HOUR,
    }),
  ],
  'room-3': [
    buildMsg({
      id: 'm31', roomId: 'room-3', senderId: MOCK_ME_ID, isMine: true,
      text: 'Bạn báo giá thiết kế logo nhé.',
      timestamp: now - 6 * HOUR,
    }),
    // Demo: tin này verification fail → cảnh báo đỏ
    buildMsg({
      id: 'm32-fail', roomId: 'room-3', senderId: 'u-3', isMine: false,
      text: 'Bạn chuyển khoản trước cho mình 100% nhé!',
      timestamp: now - 5 * HOUR + 30 * MINUTE,
      stage: 'done',
      verificationStatus: 'failed',
    }),
    buildMsg({
      id: 'm33', roomId: 'room-3', senderId: 'u-3', isMine: false,
      text: '',
      timestamp: now - 5 * HOUR,
      stage: 'encrypted',
      verificationStatus: 'pending',
    }),
  ],
  'room-4': [
    buildMsg({
      id: 'm41', roomId: 'room-4', senderId: MOCK_ME_ID, isMine: true,
      text: 'Cô có thể qua sáng thứ 7 dọn căn hộ giúp em không?',
      timestamp: now - 1 * DAY - 30 * MINUTE,
    }),
    buildMsg({
      id: 'm42', roomId: 'room-4', senderId: 'u-4', isMine: false,
      text: 'Vâng, hẹn cô sáng thứ 7 nhé.',
      timestamp: now - 1 * DAY,
    }),
  ],
  'room-5': [
    buildMsg({
      id: 'm51', roomId: 'room-5', senderId: 'u-5', isMine: false,
      text: 'Em đã clone repo và setup xong môi trường.',
      timestamp: now - 4 * DAY,
    }),
    buildMsg({
      id: 'm52', roomId: 'room-5', senderId: 'u-5', isMine: false,
      text: 'Mình đã đẩy code lên repo, anh review giúp.',
      timestamp: now - 2 * DAY,
    }),
  ],
};

// ── Wallet + Identity ───────────────────────────────────────────────────────
export const MOCK_WALLET: Wallet = {
  address: '0x9a3f7c2e1d4b0a8f6e5c2d1b9e7a3f4c8d2e1b9a',
  balance: 12450,
  lockedInEscrow: 1750,
  connected: true,
};

export const MOCK_IDENTITY: Identity = {
  address: MOCK_WALLET.address,
  displayName: 'Nguyễn Văn A',
  sessionStatus: 'active',
  sessionExpiresAt: now + 12 * HOUR,
  verified: true,
};

export const MOCK_TRANSACTIONS: WalletTransaction[] = [
  {
    id: 'tx-1',
    type: 'escrow_release',
    amount: 800,
    counterparty: 'Chị Linh — Vận tải Phú An',
    jobTitle: 'Vận chuyển hàng Hà Nội đi Hải Phòng',
    timestamp: now - 30 * MINUTE,
    refId: 'TX-4B9E…77A8',
    status: 'confirmed',
  },
  {
    id: 'tx-2',
    type: 'escrow_lock',
    amount: 250,
    counterparty: 'Anh Hoàng — Thợ điện lạnh',
    jobTitle: 'Sửa máy giặt LG',
    timestamp: now - 2 * HOUR,
    refId: 'TX-8A3F…C2E1',
    status: 'confirmed',
  },
  {
    id: 'tx-3',
    type: 'in',
    amount: 5000,
    counterparty: 'Nạp từ ví ngoài',
    timestamp: now - 1 * DAY,
    refId: 'TX-A002…88BC',
    status: 'confirmed',
  },
  {
    id: 'tx-4',
    type: 'escrow_lock',
    amount: 1500,
    counterparty: 'Anh Tuấn — Backend Engineer',
    jobTitle: 'Lập trình API thanh toán',
    timestamp: now - 5 * DAY,
    refId: 'TX-C1D2…90FE',
    status: 'confirmed',
  },
  {
    id: 'tx-5',
    type: 'out',
    amount: 120,
    counterparty: 'Phí giao dịch',
    timestamp: now - 7 * DAY,
    refId: 'TX-7E6F…4321',
    status: 'confirmed',
  },
];

// ── Conversation management ────────────────────────────────────────────────

/**
 * "Directory" giả lập các conversationId mà người khác đã tạo.
 * Khi user nhập ID nằm trong tập public → join ngay,
 * còn lại → coi như private → tạo join request chờ duyệt.
 */
export const MOCK_PUBLIC_CONVERSATION_IDS: string[] = [
  'conv-public-aladin-news',
  'conv-public-freelancer-vn',
  'conv-public-design-talk',
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-public-aladin-news',
    title: 'Aladin · Tin tức cộng đồng',
    type: 'GROUP',
    visibility: 'public',
    ownerId: 'admin-1',
    memberCount: 1284,
    createdAt: now - 30 * DAY,
  },
];

export const MOCK_INVITATIONS: Invitation[] = [
  {
    id: 'inv-1',
    conversationId: 'conv-101',
    conversationTitle: 'Đội kỹ thuật — sửa máy giặt LG',
    conversationType: 'GROUP',
    inviterId: 'u-1',
    inviterName: 'Anh Hoàng — Thợ điện lạnh',
    message: 'Mời bạn vào nhóm trao đổi kỹ thuật cùng anh em nhé.',
    createdAt: now - 20 * MINUTE,
    status: 'pending',
  },
  {
    id: 'inv-2',
    conversationId: 'conv-102',
    conversationTitle: 'Đàm phán job: Vận chuyển HN → HP',
    conversationType: 'JOB_NEGOTIATION',
    inviterId: 'u-2',
    inviterName: 'Chị Linh — Vận tải Phú An',
    message: 'Em mời anh vào phòng để chốt giá và lịch trình.',
    createdAt: now - 3 * HOUR,
    status: 'pending',
  },
  {
    id: 'inv-3',
    conversationId: 'conv-103',
    conversationTitle: 'Chủ đề: Mẹo bảo mật ví',
    conversationType: 'THREAD',
    inviterId: 'u-5',
    inviterName: 'Anh Tuấn — Backend Engineer',
    createdAt: now - 1 * DAY,
    status: 'pending',
  },
];

export const MOCK_JOIN_REQUESTS: JoinRequest[] = [];
