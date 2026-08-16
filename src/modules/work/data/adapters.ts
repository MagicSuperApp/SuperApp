// modules/work/data/adapters.ts
//
// Chuyển đổi schema BACKEND AladinWork (services/types.ts, SPEC §5 v0.2.0) ⟶
// schema UI hiện dùng (data/mockData.ts). Giữ nguyên UI: screen vẫn nhận kiểu
// Job/Worker cũ, chỉ nguồn dữ liệu đổi từ mock sang API.
//
// LƯU Ý chênh lệch schema (đánh dấu để không tưởng nhầm là dữ liệu thật):
//   - Backend KHÔNG có district/location/postedAt tách riêng, rating người
//     đăng, applicantCount. Trường nào dây không có thì để RỖNG/0 và màn ẩn đi
//     — KHÔNG điền giá trị vẽ ra (đã từng gán cứng `rating: 5`,
//     `postedAt: 'Vừa đăng'`, khiến mọi việc trông như vừa đăng bởi người 5 sao).
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

/**
 * Ảnh đại diện: CHỈ nhận đường dẫn http(s) do dây trả về, không có thì trả rỗng
 * và để `PosterAvatar` vẽ vòng chữ cái đầu tại máy.
 *
 * Bản trước dựng `https://i.pravatar.cc/150?u=<DID>` làm ảnh thay thế ⇒ DID
 * PhoenixKey của người dùng bị gửi sang máy chủ bên thứ ba trong query string
 * mỗi lần mở danh sách việc, và nằm lại trong log của họ. DID là định danh gắn
 * với sinh trắc, không được rời máy theo đường này.
 */
const httpAvatar = (url?: string): string =>
  url && /^https?:\/\//.test(url) ? url : '';

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
  // `WorkJob` KHÔNG có trường thời gian nào (xem `services/types.ts`) ⇒ không
  // suy ra được lúc đăng. Trả rỗng để màn ẩn dòng, thay vì viết cứng
  // "Vừa đăng" cho MỌI việc — kể cả việc đăng từ tháng trước.
  postedAt: '',
  deadline: deadlineLabel(j.deadlineDays),
  postedBy: {
    name: j.ownerName || j.postedByName || 'Người đăng',
    avatar: httpAvatar(j.ownerAvatar),
    // Dây AladinWork không cấp trường `rating` nào (nhà đó xác nhận 11/08) —
    // giống hệt `toUiWorker` bên dưới. Gán cứng 5 là vẽ ra điểm chưa ai chấm.
    // 0 = "chưa có", màn phải hiểu 0 là chưa có chứ không phải điểm kém.
    rating: 0,
    verified: true, // mọi tài khoản AladinWork đều qua PhoenixKey DID (SPEC §1)
  },
  description: j.desc || '',
  requirements: reqToList(j.req),
  // Cũng không có thật: dây không trả số người ứng tuyển. 0 = "chưa biết",
  // màn ẩn dòng này khi bằng 0 thay vì báo "0 ứng tuyển".
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
  avatar: httpAvatar(a.avatar),
  title: a.title || (a.skills?.[0] ?? 'Cộng tác viên'),
  // `rating` KHÔNG có thật: dây AladinWork không hề cấp trường nào tên `rating`
  // (nhà đó xác nhận 11/08). Gán cứng 5 là vẽ ra một điểm đánh giá chưa ai chấm.
  // 0 = "chưa có", và màn phải hiểu số 0 là chưa có chứ không phải điểm kém.
  rating: 0,
  // Cũng không có thật — `jems` là việc NHẬN, không phải lượt đánh giá.
  reviewCount: 0,
  // Số THẬT từ dây: hợp đồng đã tất toán mà người này đứng vai Genie
  // (`Core/server.js:2339`). `jems.length` là việc nhận — sai nghĩa hoàn toàn.
  completedJobs: a.completedJobs ?? 0,
  hourlyRate: 0,
  location: 'Việt Nam',
  skills: a.skills ?? [],
  // `verified` đúng theo SPEC §1 (mọi tài khoản AladinWork đều qua PhoenixKey DID)
  // — đây là suy ra từ điều kiện tạo tài khoản, KHÔNG phải trường dây trả về.
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
