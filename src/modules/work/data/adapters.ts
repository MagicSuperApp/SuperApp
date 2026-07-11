// modules/work/data/adapters.ts
//
// Chuyển đổi schema BACKEND AladinWork (services/types.ts, SPEC §5 v0.2.0) ⟶
// schema UI hiện dùng (data/mockData.ts). Giữ nguyên UI: screen vẫn nhận kiểu
// Job/Worker cũ, chỉ nguồn dữ liệu đổi từ mock sang API.
//
// LƯU Ý chênh lệch schema (đánh dấu để không tưởng nhầm là dữ liệu thật):
//   - Backend KHÔNG có district/location/postedAt tách riêng, rating người
//     đăng, applicantCount. Map default an toàn + suy ra từ trường có sẵn.
//   - budget = priceVND (off-chain, VND). deadline suy từ deadlineDays.
//   - DID người dùng LUÔN did:phoenix → `verified: true` (mọi account qua
//     PhoenixKey DID). KHÔNG để did:cardano rò vào UI (did:cardano chỉ cho
//     tài sản VeData, không cho danh tính người).
//   - 3 token: giá/Pledge/phí ĐỊNH GIÁ bằng MAGIC nhưng GIỮ/CHUYỂN bằng CARP;
//     số dư khả dụng để trả = walletCARP (xem toUiWallet).

import type { WorkJob, WorkAccount, JobType } from '../services/types';
import type { Job, Worker, JobCategory } from './mockData';

// Map skill/template.icon backend → categoryId UI (thô, đủ để render chip).
const SKILL_TO_CATEGORY: Record<string, string> = {
  video: 'creative',
  motion: 'creative',
  design: 'creative',
  tutoring: 'tutor',
  cooking: 'housekeeping',
  floral: 'creative',
  housekeeping: 'housekeeping',
  event_decoration: 'event',
  construction: 'construction',
  repair: 'repair',
  transport: 'transport',
  driver: 'driver',
  it: 'it',
  beauty: 'beauty',
};

const categoryIdFor = (job: WorkJob): string => {
  const skill = (job.skill || job.template?.key || '').toLowerCase();
  return SKILL_TO_CATEGORY[skill] || 'other';
};

const deadlineLabel = (deadlineDays?: number): string => {
  if (!deadlineDays || deadlineDays <= 0) return 'Không giới hạn';
  const d = new Date(Date.now() + deadlineDays * 24 * 3600 * 1000);
  return d.toLocaleDateString('vi-VN');
};

/** WorkJob (backend) → Job (UI). */
export const toUiJob = (j: WorkJob): Job => ({
  id: j.id,
  title: j.title,
  category: j.template?.label || j.skill || 'Việc',
  categoryId: categoryIdFor(j),
  budget: j.priceVND ?? 0,
  budgetUnit: 'VND',
  // Backend chưa tách địa điểm → để nhãn trung tính (KHÔNG bịa quận/thành phố).
  location: 'Việt Nam',
  district: j.template?.label || j.skill || '',
  postedAt: 'Vừa đăng',
  deadline: deadlineLabel(j.deadlineDays),
  postedBy: {
    name: j.ownerName || j.postedByName || 'Người đăng',
    avatar: j.ownerAvatar || 'https://i.pravatar.cc/150?u=' + encodeURIComponent(j.ownerDid),
    rating: 5,
    verified: true, // mọi tài khoản AladinWork đều qua PhoenixKey DID (SPEC §1)
  },
  description: j.desc || '',
  requirements: reqToList(j.req),
  applicantCount: 0,
  isUrgent: false,
  isFeatured: false,
});

const reqToList = (req?: Record<string, unknown>): string[] => {
  if (!req) return [];
  return Object.entries(req)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${String(v)}`);
};

/** WorkAccount (backend) → Worker (UI). Dùng khi hiển thị hồ sơ Genie. */
export const toUiWorker = (a: WorkAccount): Worker => ({
  id: a.did,
  name: a.name || 'Genie',
  avatar: a.avatar && a.avatar.startsWith('http')
    ? a.avatar
    : 'https://i.pravatar.cc/150?u=' + encodeURIComponent(a.did),
  title: a.title || (a.skills?.[0] ?? 'Cộng tác viên'),
  rating: 5,
  reviewCount: (a.jems?.length ?? 0),
  completedJobs: (a.jems?.length ?? 0),
  hourlyRate: 0,
  location: 'Việt Nam',
  skills: a.skills ?? [],
  verified: true,
  online: false,
  bio: a.title || '',
  yearsExperience: 0,
});

/** JobType (backend) → JobCategory (UI chip). */
export const toUiCategory = (t: JobType): JobCategory => ({
  id: t.key,
  name: t.label,
  icon: 'briefcase-outline',
  count: 0,
  color: '#3D7A5E',
});

// ── Ví 3 token (SPEC §5 v0.2.0) ──────────────────────────────────────
// Phơi 3 ví cho UI hồ sơ / hợp đồng. Quy tắc vàng: giá/Pledge/phí ĐỊNH GIÁ bằng
// MAGIC nhưng GIỮ/CHUYỂN bằng CARP. Số dư KHẢ DỤNG để trả (Pledge/phí) = CARP;
// thiếu CARP → backend trả 402 NO_FUNDS. MAGIC chỉ là đơn vị kế toán (không rời
// vault); LAMP là backing ẩn.
export interface UiWallet {
  /** Số dư khả dụng để trả Pledge/phí (đồng thanh toán thật). */
  carp: number;
  /** Đơn vị kế toán/định giá — phi-chuyển-nhượng, decay. Chỉ hiển thị định giá. */
  magic: number;
  /** Backing ẩn. */
  lamp: number;
}

/** WorkAccount (backend) → 3 ví UI. Dùng cho màn hồ sơ / hợp đồng / Pledge. */
export const toUiWallet = (a: WorkAccount): UiWallet => ({
  carp: a.walletCARP ?? 0,
  magic: a.walletMAGIC ?? 0,
  lamp: a.walletLAMP ?? 0,
});

/**
 * Nhãn tiền cho UI Pledge/phí: định giá bằng MAGIC, khóa/hoàn thật bằng CARP.
 * `magicAmount` là số ĐỊNH GIÁ (đơn vị kế toán MAGIC) lấy từ contract/job.
 */
export const pledgeLabel = (magicAmount: number): string =>
  `${magicAmount} MAGIC (định giá) · khóa/hoàn bằng CARP`;
