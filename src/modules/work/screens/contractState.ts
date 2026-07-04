// modules/work/screens/contractState.ts
// Logic hiển thị state machine Pledge (SG8 §3 cụm D): nhãn/màu trạng thái + nút
// hành động khả dụng theo (state, vai). Backend là NGƯỜI QUYẾT ĐỊNH cuối (trả
// 409 ESCROW_RULE nếu sai bước) — hàm này chỉ ĐỀ XUẤT nút cho UI.

import type { ContractState, WorkContract } from '../services/types';
import type { ContractAction } from '../services/workApi';

export interface StateMeta { label: string; color: string; glow: string }

export const STATE_META: Record<ContractState, StateMeta> = {
  INIT:      { label: 'Khởi tạo',       color: '#8A8F98', glow: 'rgba(138,143,152,0.12)' },
  PENDING:   { label: 'Chờ khoá cọc',   color: '#C7862E', glow: 'rgba(199,134,46,0.12)' },
  COMMITTED: { label: 'Đã khoá cọc',    color: '#3B6EA8', glow: 'rgba(59,110,168,0.12)' },
  ACTIVE:    { label: 'Đang thực hiện', color: '#3B6EA8', glow: 'rgba(59,110,168,0.12)' },
  DELIVERED: { label: 'Đã giao việc',   color: '#C7862E', glow: 'rgba(199,134,46,0.12)' },
  RELEASED:  { label: 'Đã giải phóng',  color: '#2E7D46', glow: 'rgba(46,125,70,0.12)' },
  SETTLED:   { label: 'Hoàn tất',       color: '#2E7D46', glow: 'rgba(46,125,70,0.12)' },
  FORFEITED: { label: 'Mất cọc',        color: '#C0533A', glow: 'rgba(192,83,58,0.12)' },
  DISPUTED:  { label: 'Tranh chấp',     color: '#C0533A', glow: 'rgba(192,83,58,0.12)' },
  FROZEN:    { label: 'Tạm khoá',       color: '#8A8F98', glow: 'rgba(138,143,152,0.12)' },
};

/** Các mốc chính để vẽ tiến trình (bỏ qua nhánh lỗi/tranh chấp). */
export const PLEDGE_STEPS: Array<{ state: ContractState; label: string }> = [
  { state: 'PENDING',   label: 'Khoá cọc' },
  { state: 'COMMITTED', label: 'Kích hoạt' },
  { state: 'ACTIVE',    label: 'Thực hiện' },
  { state: 'DELIVERED', label: 'Giao việc' },
  { state: 'RELEASED',  label: 'Giải phóng' },
];

const ORDER: ContractState[] = ['INIT', 'PENDING', 'COMMITTED', 'ACTIVE', 'DELIVERED', 'RELEASED', 'SETTLED'];
/** Vị trí trên trục tiến trình (−1 nếu là nhánh lỗi). */
export const stateIndex = (s: ContractState): number => ORDER.indexOf(s);

export interface PledgeActionBtn {
  action: ContractAction;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
  body?: Record<string, unknown>;
}

/**
 * Nút hành động khả dụng theo (state, vai). Đúng thứ tự máy trạng thái:
 * lockPledge → activate → deliver → confirmPayment → mutualRelease.
 */
export function availableActions(c: WorkContract): PledgeActionBtn[] {
  const role = c.myRole ?? 'aladin';
  const me = c.parties[role];
  const btns: PledgeActionBtn[] = [];

  switch (c.state) {
    case 'INIT':
    case 'PENDING':
      if (me && me.pledgeLocked < (me.pledgeAsk || 1)) {
        btns.push({
          action: 'lockPledge',
          label: `Khoá cọc ${me.pledgeAsk} MAGIC`,
          tone: 'primary',
          body: { side: role, amount: me.pledgeAsk },
        });
      }
      break;
    case 'COMMITTED':
      if (role === 'aladin') {
        btns.push({ action: 'activate', label: 'Kích hoạt hợp đồng', tone: 'primary' });
      }
      break;
    case 'ACTIVE':
      if (role === 'genie') {
        btns.push({ action: 'deliver', label: 'Giao việc (kèm bằng chứng)', tone: 'primary' });
      }
      break;
    case 'DELIVERED':
      if (role === 'aladin') {
        btns.push({ action: 'confirmPayment', label: 'Xác nhận đã thanh toán', tone: 'primary' });
      }
      btns.push({ action: 'mutualRelease', label: 'Giải phóng cọc', tone: 'secondary' });
      break;
    default:
      break;
  }

  if (['COMMITTED', 'ACTIVE', 'DELIVERED'].includes(c.state)) {
    btns.push({ action: 'dispute', label: 'Tranh chấp', tone: 'danger' });
  }
  return btns;
}
