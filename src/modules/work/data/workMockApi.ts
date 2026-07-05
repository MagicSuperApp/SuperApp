// modules/work/data/workMockApi.ts
//
// Mock cho các thực thể API-typed (WorkContract / MatchResult / Availability) —
// dùng khi WORK_BACKEND_ENABLED=false để UI Pha 2/4 chạy được mà không cần host.
// KHÁC data/mockData.ts (shape UI Job/Worker): file này dùng THẲNG schema backend
// (services/types.ts) vì các màn Hợp đồng/Khớp/Sẵn sàng tiêu thụ trực tiếp.

import type {
  WorkContract,
  MatchResult,
  Availability,
  AvailabilityResult,
} from '../services/types';

/** DID mock của "tôi" (Aladin) — khớp did:phoenix format cho validate không vỡ. */
export const MOCK_MY_DID =
  'did:phoenix:aaaaaaaaaaaaa:0000000000000000000000000000000000000000000000000000000000000001';

const now = 1_720_000_000_000; // mốc cố định (KHÔNG Date.now để mock ổn định)

export const MOCK_CONTRACTS: WorkContract[] = [
  {
    id: 'ct-1001',
    createdAt: now - 3 * 86_400_000,
    service: 'Phun thuốc 2ha lúa — ĐBSCL',
    jobId: 'job-1',
    serviceFeeVND: 1_800_000,
    floor: 300,
    platformFeeMagic: 60,
    state: 'COMMITTED',
    parties: {
      aladin: { accId: 'me', name: 'Nông trại Bảy Núi', role: 'aladin', pledgeLocked: 300, pledgeAsk: 300 },
      genie: { accId: 'g1', name: 'Đội bay Minh Khôi', role: 'genie', pledgeLocked: 300, pledgeAsk: 300 },
    },
    conversationId: null,
    myRole: 'aladin',
    otherName: 'Đội bay Minh Khôi',
    log: [
      { ts: now - 3 * 86_400_000, kind: 'create', msg: 'Tạo hợp đồng' },
      { ts: now - 2 * 86_400_000, kind: 'lockPledge', msg: 'Aladin khoá cọc 300' },
      { ts: now - 1 * 86_400_000, kind: 'lockPledge', msg: 'Genie khoá cọc 300' },
    ],
  },
  {
    id: 'ct-1002',
    createdAt: now - 6 * 86_400_000,
    service: 'Thiết kế logo hợp tác xã',
    jobId: 'job-2',
    serviceFeeVND: 2_500_000,
    floor: 200,
    state: 'ACTIVE',
    parties: {
      aladin: { accId: 'a2', name: 'HTX Tân Phú', role: 'aladin', pledgeLocked: 200, pledgeAsk: 200 },
      genie: { accId: 'me', name: 'Bạn (Genie)', role: 'genie', pledgeLocked: 200, pledgeAsk: 200 },
    },
    conversationId: null,
    myRole: 'genie',
    otherName: 'HTX Tân Phú',
    log: [{ ts: now - 5 * 86_400_000, kind: 'activate', msg: 'Kích hoạt — bắt đầu làm việc' }],
  },
  {
    id: 'ct-1003',
    createdAt: now - 9 * 86_400_000,
    service: 'Khảo sát sâu bệnh vườn sầu riêng',
    serviceFeeVND: 1_200_000,
    floor: 150,
    state: 'DELIVERED',
    parties: {
      aladin: { accId: 'me', name: 'Vườn Chín Muồi', role: 'aladin', pledgeLocked: 150, pledgeAsk: 150, delivered: true },
      genie: { accId: 'g3', name: 'KS. Thu Hà', role: 'genie', pledgeLocked: 150, pledgeAsk: 150, delivered: true },
    },
    conversationId: null,
    myRole: 'aladin',
    otherName: 'KS. Thu Hà',
    log: [{ ts: now - 1 * 86_400_000, kind: 'deliver', msg: 'Genie đã giao việc kèm bằng chứng' }],
  },
];

export const getMockContract = (id: string): WorkContract | undefined =>
  MOCK_CONTRACTS.find((c) => c.id === id);

export const MOCK_MATCH: MatchResult = {
  jobId: 'job-1',
  weights: { skill: 0.5, availability: 0.3, price: 0.2 },
  candidates: [
    { did: 'did:phoenix:bbbbbbbbbbbbb:' + '2'.repeat(64), name: 'Đội bay Minh Khôi', qualityTier: 'A', score: 0.92, qualified: true, available: true, priceVND: 1_800_000 },
    { did: 'did:phoenix:ccccccccccccc:' + '3'.repeat(64), name: 'HTX Drone Sáu Miền', qualityTier: 'B', score: 0.78, qualified: true, available: false, priceVND: 1_600_000 },
    { did: 'did:phoenix:ddddddddddddd:' + '4'.repeat(64), name: 'Trần Văn Lâm', qualityTier: 'C', score: 0.61, qualified: false, available: true, priceVND: 1_400_000 },
  ],
};

export const MOCK_AVAILABILITY: AvailabilityResult = {
  did: MOCK_MY_DID,
  availableFrom: now,
  availableUntil: now + 7 * 86_400_000,
  skills: ['drone-spray', 'survey'],
  note: 'Nhận việc quanh ĐBSCL, bán kính 50km.',
  updatedAt: now,
} as Availability;
