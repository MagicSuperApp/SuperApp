// modules/chat/features/wallet/types.ts

export type SessionStatus = 'active' | 'expired';

/**
 * Identity nhẹ — đại diện cho người dùng tại Application Layer.
 * Proof System chỉ dùng `address` làm khóa công khai.
 */
export interface Identity {
  address: string;          // địa chỉ ví (rút gọn hiển thị)
  displayName: string;
  sessionStatus: SessionStatus;
  sessionExpiresAt?: number;
  verified: boolean;        // đã xác thực danh tính
}

export interface Wallet {
  address: string;
  balance: number;          // MAGIC khả dụng
  lockedInEscrow: number;   // MAGIC đang khóa
  connected: boolean;
}

export type WalletTxType =
  | 'in'
  | 'out'
  | 'escrow_lock'
  | 'escrow_release'
  | 'escrow_refund';

export interface WalletTransaction {
  id: string;
  type: WalletTxType;
  amount: number;            // MAGIC
  counterparty?: string;
  jobTitle?: string;
  timestamp: number;
  refId: string;             // mã giao dịch nội bộ (rút gọn)
  status: 'confirmed' | 'pending' | 'failed';
}

/** Đơn vị token nội bộ của Aladin. KHÔNG đặt theo bất kỳ blockchain cụ thể nào. */
export const TOKEN_SYMBOL = 'MAGIC';
