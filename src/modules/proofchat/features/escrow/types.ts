// modules/proofchat/features/escrow/types.ts
//
// Escrow đơn giản hóa cho MVP — chỉ 3 trạng thái + 3 action.
// KHÔNG đề cập tới chi tiết blockchain ở UI.

export type EscrowStatus = 'pending' | 'locked' | 'released';

export interface Escrow {
  id: string;
  jobId: string;
  amount: number;            // MAGIC
  status: EscrowStatus;
  createdAt: number;
  updatedAt: number;
}

export type EscrowAction = 'fund' | 'approve' | 'cancel';
