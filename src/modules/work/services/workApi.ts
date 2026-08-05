// modules/work/services/workApi.ts
//
// Lớp gọi API AladinWork — 34 endpoint (SPEC §4). Base <host>/api/v1.
// Auth = header Authorization: Bearer <session>. Response JSON THÔ (KHÔNG bọc
// envelope NestJS). Lỗi trả { error, code } + HTTP status theo bảng CODE_STATUS.
//
// THỰC DỤNG: file này chỉ là LỚP GỌI. Việc bật/tắt (mock ⟷ thật) do hook quyết
// qua isWorkBackendEnabled(). Khi chưa có host + credentials AladinWork dev,
// hook trả mock; các hàm dưới đây chỉ chạy khi flag ON.
//
// BLOCKER (chờ anh cấp): host AladinWork dev + tài khoản/DID test để verify
// bằng curl thật (challenge → verify → /me). Chưa có → chưa chạy được E2E.

import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import { resolveBaseURL, WORK_HTTP_TIMEOUT_MS } from './config';
import { getWorkSessionToken, clearWorkSession } from './session';
import type {
  WorkAccount, JobType, WorkJob, Offering, WorkContract, MatchResult, MatchCandidate,
  Credential, AvailabilityResult, Availability, ChallengeResult, VerifyResult,
  VerifyBody, HealthResult, ConversationRef, TaskersResult,
} from './types';

// ── Phân loại lỗi (mạng ⟂ quyền ⟂ server) — INTEGRATION §7.3 ─────────
export type WorkErrorKind = 'network' | 'auth' | 'client' | 'server';

/**
 * Lỗi chuẩn hoá cho UI. Giữ `code` gốc từ backend ({error, code}) để screen
 * phân nhánh (VD: NOT_QUALIFIED, JOB_CLOSED...). `kind` để StateView chọn
 * trạng thái (offline vs error vs cần đăng nhập lại).
 */
export class WorkApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly kind: WorkErrorKind,
  ) {
    super(message);
    this.name = 'WorkApiError';
  }
}

const classify = (httpStatus: number, code: string): WorkErrorKind => {
  if (httpStatus === 0) return 'network';
  // CHỈ 401/UNAUTH = phiên hỏng/hết hạn → đăng nhập lại. 403 (FORBIDDEN/
  // NOT_QUALIFIED) là thiếu quyền/điều kiện, KHÔNG phải hết phiên → 'client'
  // (UI đọc thêm `code` để hiện thông điệp đúng: chưa đủ điều kiện thuê...).
  if (httpStatus === 401 || code === 'UNAUTH') return 'auth';
  if (httpStatus >= 500) return 'server';
  return 'client';
};

// ── Axios client ─────────────────────────────────────────────────────
let _client: AxiosInstance | null = null;

// Provider phiên (lazy-login). Đăng ký ở bootstrap: setWorkSessionProvider(ensureWorkSession).
// Dùng setter thay vì import trực-tiếp để cắt vòng import workApi ⟷ workAuthService.
let _sessionProvider: (() => Promise<string | null>) | null = null;
export const setWorkSessionProvider = (fn: () => Promise<string | null>): void => {
  _sessionProvider = fn;
};

const client = (): AxiosInstance => {
  if (_client) return _client;
  _client = axios.create({
    baseURL: resolveBaseURL(),
    timeout: WORK_HTTP_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });
  // Gắn Bearer cho request cần auth (đánh dấu qua config.needsAuth). Thiếu token →
  // tự đăng nhập lazy qua provider (đăng ký ở bootstrap: ensureWorkSession). Provider
  // đặt bằng setter để TRÁNH circular import (workAuthService import ngược workApi).
  _client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    if ((config as InternalAuthableConfig).needsAuth) {
      let token = await getWorkSessionToken();
      if (!token && _sessionProvider) token = await _sessionProvider();
      if (token) {
        (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });
  return _client;
};

type AuthableConfig = AxiosRequestConfig & { needsAuth?: boolean };
type InternalAuthableConfig = InternalAxiosRequestConfig & { needsAuth?: boolean };

/**
 * Gọi + bóc lỗi { error, code } chuẩn AladinWork. Response body là JSON thô →
 * trả res.data trực tiếp. 401 UNAUTH → xoá phiên (điều hướng đăng nhập lại do
 * lớp UI xử lý khi bắt WorkApiError kind='auth').
 */
async function call<T>(p: Promise<{ data: T }>): Promise<T> {
  try {
    const res = await p;
    return res.data;
  } catch (err) {
    const ax = err as AxiosError<{ error?: string; code?: string }>;
    if (ax.response) {
      const httpStatus = ax.response.status;
      const code = ax.response.data?.code ?? 'UNKNOWN';
      const msg = ax.response.data?.error ?? ax.message ?? 'Request failed';
      const kind = classify(httpStatus, code);
      if (kind === 'auth' && (httpStatus === 401 || code === 'UNAUTH')) {
        await clearWorkSession();
      }
      throw new WorkApiError(httpStatus, code, msg, kind);
    }
    // Không có response → lỗi mạng / timeout.
    throw new WorkApiError(0, 'NETWORK', ax.message ?? 'Network error', 'network');
  }
}

const authCfg: AuthableConfig = { needsAuth: true };

// ── Hai BẤT BIẾN ghi (AladinWork SPEC) ────────────────────────────────
// Idempotency-Key: BẮT BUỘC trên mọi lời gọi GHI. Gửi lại CÙNG key → server trả
// kết quả cũ, KHÔNG chạy lần hai (không trừ CARP 2 lần / không tạo 2 hợp đồng).
// Mạng di động chập chờn → luôn gửi. Không có uuid lib → sinh khoá đủ-ngẫu tại chỗ.
// (Date.now/Math.random chạy được trên thiết-bị; chỉ cấm trong workflow-script.)
export const newIdempotencyKey = (): string =>
  `wk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

// If-Version: gửi kèm khi chạy hành-động HỢP ĐỒNG. Server so với version đang giữ,
// LỆCH → 409 CONFLICT (chặn double-apply khi user bấm lại sau khi action đã chạy).
export type WriteOpts = { idempotencyKey?: string; ifVersion?: string };

const writeCfg = (opts: WriteOpts = {}): AuthableConfig => ({
  needsAuth: true,
  headers: {
    'Idempotency-Key': opts.idempotencyKey ?? newIdempotencyKey(),
    ...(opts.ifVersion ? { 'If-Version': opts.ifVersion } : {}),
  },
});

// ─────────────────────────────────────────────────────────────────────
// 1. HEALTH (không auth) — luôn gọi để biết tích hợp nào sống (§8)
// ─────────────────────────────────────────────────────────────────────
export const getHealth = (): Promise<HealthResult> =>
  call(client().get('/health'));

// ─────────────────────────────────────────────────────────────────────
// 2–3. AUTH (không auth). PHẦN KÝ signature = việc Thư / native.
// ─────────────────────────────────────────────────────────────────────
export const authChallenge = (did: string): Promise<ChallengeResult> =>
  call(client().post('/auth/challenge', { did }));

/**
 * Nộp challenge + signature (Thư ký P-256 / secp256r1, DER hex) → nhận session
 * Bearer. Lớp gọi này KHÔNG tự ký; caller truyền signature + timestamp (GIÂY epoch).
 */
export const authVerify = (body: VerifyBody): Promise<VerifyResult> =>
  call(client().post('/auth/verify', body));

// ─────────────────────────────────────────────────────────────────────
// 4–8. TEMPLATES (JobType). GET không auth; POST/PATCH/DELETE cần admin.
// ─────────────────────────────────────────────────────────────────────
export const getTemplates = (): Promise<JobType[]> =>
  call(client().get('/templates'));

export const getTemplate = (key: string): Promise<JobType> =>
  call(client().get(`/templates/${encodeURIComponent(key)}`));

export const createTemplate = (t: JobType): Promise<JobType> =>
  call(client().post('/templates', t, writeCfg()));

export const updateTemplate = (key: string, patch: Partial<JobType>): Promise<JobType> =>
  call(client().patch(`/templates/${encodeURIComponent(key)}`, patch, writeCfg()));

export const deleteTemplate = (key: string): Promise<{ key: string; removed: boolean }> =>
  call(client().delete(`/templates/${encodeURIComponent(key)}`, writeCfg()));

// ─────────────────────────────────────────────────────────────────────
// 9–10. ACCOUNTS / ME
// ─────────────────────────────────────────────────────────────────────
export const getAccounts = (): Promise<
  Array<Pick<WorkAccount, 'did' | 'name' | 'avatar' | 'title' | 'kind'> & { delegate?: unknown }>
> => call(client().get('/accounts'));

export const getMe = (): Promise<WorkAccount> =>
  call(client().get('/me', authCfg));

// ─────────────────────────────────────────────────────────────────────
// 11–14. AVAILABILITY (khai sẵn sàng — Genie). epoch MS.
// ─────────────────────────────────────────────────────────────────────
export const getMyAvailability = (): Promise<AvailabilityResult> =>
  call(client().get('/availability', authCfg));

export interface SetAvailabilityBody {
  availableFrom: number; // epoch ms
  availableUntil: number; // epoch ms
  skills?: string[];
  note?: string;
}
export const setAvailability = (body: SetAvailabilityBody): Promise<Availability> =>
  call(client().post('/availability', body, writeCfg()));

export const clearAvailability = (): Promise<{ did: string; removed: boolean }> =>
  call(client().delete('/availability', writeCfg()));

export const getAvailabilityOf = (did: string): Promise<AvailabilityResult> =>
  call(client().get(`/availability/${encodeURIComponent(did)}`));

// ─────────────────────────────────────────────────────────────────────
// 15–16. CAPABILITIES (khai năng lực + xác minh Stamp)
// ─────────────────────────────────────────────────────────────────────
export interface CapabilityBody {
  templateKey: string;
  metric: Record<string, number>;
  evidence?: unknown;
}
export const createCapability = (body: CapabilityBody, opts?: WriteOpts): Promise<Credential> =>
  call(client().post('/capabilities', body, writeCfg(opts)));

export const verifyCapability = (
  id: string,
  body: { templateKey?: string } = {},
  opts?: WriteOpts,
): Promise<{ verified: boolean; credential: Credential; stamp: unknown }> =>
  call(client().post(`/capabilities/${encodeURIComponent(id)}/verify`, body, writeCfg(opts)));

// ─────────────────────────────────────────────────────────────────────
// 17. OFFERINGS (dịch vụ — phía cung)
// ─────────────────────────────────────────────────────────────────────
export const getOfferings = (params?: { ownerDid?: string; activeOnly?: boolean }): Promise<Offering[]> =>
  call(client().get('/offerings', { params }));

// ── Danh bạ thợ (H-02) — GET /taskers, CÔNG KHAI (không auth), an-toàn hiện trước
// khi đăng-nhập. availableOnly lọc cứng theo cửa-sổ thời-gian; now=<epoch ms> để
// dựng lại đúng 1 cảnh (kéo làm mới không nhảy — server thứ-tự tất-định).
export interface TaskersQuery {
  templateKey?: string;
  availableOnly?: boolean;
  limit?: number;
  now?: number; // epoch ms
}
export const getTaskers = (q: TaskersQuery = {}): Promise<TaskersResult> =>
  call(client().get('/taskers', {
    params: {
      ...(q.templateKey ? { templateKey: q.templateKey } : {}),
      ...(q.availableOnly ? { availableOnly: 1 } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
      ...(q.now ? { now: q.now } : {}),
    },
  }));

// ── Ghi CUNG (H-28): tạo/sửa/đóng dịch vụ. Chủ gắn theo DID của PHIÊN — `ownerDid`
// gửi trong thân bị server BỎ QUA (không cho mạo chủ). `templateKey` cố định sau khi
// tạo (PATCH không đổi được). `fields` chỉ nhận key khai trong mẫu (GET /templates →
// fields[]); sai enum/số → 400 BAD_INPUT. `mode:'online'` server ép `radiusKm=0`.
export interface CreateOfferingBody {
  templateKey: string;
  name?: string;
  minPriceVND?: number;
  mode?: 'online' | 'offline' | 'ca-hai';
  radiusKm?: number;
  schedule?: string;
  desc?: string;
  fields?: Record<string, unknown>;
}
export const createOffering = (body: CreateOfferingBody, opts?: WriteOpts): Promise<Offering> =>
  call(client().post('/offerings', body, writeCfg(opts)));

// PATCH — chỉ chủ; KHÔNG đổi được `templateKey` (bỏ khỏi kiểu để tránh gửi nhầm).
export type UpdateOfferingBody = Partial<Omit<CreateOfferingBody, 'templateKey'>>;
export const updateOffering = (
  id: string,
  patch: UpdateOfferingBody,
  opts?: WriteOpts,
): Promise<Offering> =>
  call(client().patch(`/offerings/${encodeURIComponent(id)}`, patch, writeCfg(opts)));

// DELETE = đóng MỀM (không xoá cứng) → { id, status: 'closed' }.
export const deleteOffering = (
  id: string,
  opts?: WriteOpts,
): Promise<{ id: string; status: string }> =>
  call(client().delete(`/offerings/${encodeURIComponent(id)}`, writeCfg(opts)));

// ─────────────────────────────────────────────────────────────────────
// 18–21. JOBS (tin tuyển)
// ─────────────────────────────────────────────────────────────────────
export const getJobs = (openOnly = false): Promise<WorkJob[]> =>
  call(client().get('/jobs', { params: openOnly ? { openOnly: 1 } : undefined }));

export const getJob = (id: string): Promise<WorkJob> =>
  call(client().get(`/jobs/${encodeURIComponent(id)}`));

export interface PostJobBody {
  templateKey: string;
  title: string;
  desc?: string;
  priceVND?: number;
  quantity?: number;
  deadlineDays?: number;
  req?: Record<string, unknown>;
  aladinPledge?: number;
  geniePledge?: number;
  postedByName?: string;
  postedByRole?: string;
}
export const postJob = (body: PostJobBody, opts?: WriteOpts): Promise<WorkJob> =>
  call(client().post('/jobs', body, writeCfg(opts)));

// walletAddress còn LỌT trong candidates (backend sẽ gỡ — SPEC "Còn nợ"). Bóc NGAY
// tại biên để không bao giờ tới UI/log: privacy (địa-chỉ ví ứng-viên) + tránh vô-tình
// render. Bỏ ở 1 chokepoint → mọi consumer (useMatch, screen) đều sạch.
const stripWalletAddress = (c: MatchCandidate): MatchCandidate => {
  const { walletAddress: _drop, ...rest } = c as MatchCandidate & { walletAddress?: unknown };
  return rest;
};
// ⚠ CẦN Bearer. Đường này chỉ chủ tin xem được (người khác → 403). Thiếu `authCfg`
// thì máy chủ trả 401 UNAUTH — đo thật 2026-08-05 — và màn Ghép việc luôn hiện lỗi,
// nghĩa là người đăng KHÔNG BAO GIỜ thấy ứng viên, nên thợ không bao giờ nhận được việc.
export const getJobMatch = async (id: string): Promise<MatchResult> => {
  const r = await call<MatchResult>(
    client().get(`/jobs/${encodeURIComponent(id)}/match`, authCfg),
  );
  return { ...r, candidates: (r.candidates ?? []).map(stripWalletAddress) };
};

// ─────────────────────────────────────────────────────────────────────
// 22–24. CONTRACTS
// ─────────────────────────────────────────────────────────────────────
export type CreateContractBody =
  | { jobId: string; candidateDid: string }
  | { offeringId: string; priceVND?: number; aladinPledge?: number; geniePledge?: number };

export const createContract = (body: CreateContractBody, opts?: WriteOpts): Promise<WorkContract> =>
  call(client().post('/contracts', body, writeCfg(opts)));

export const getMyContracts = (): Promise<WorkContract[]> =>
  call(client().get('/contracts', authCfg));

export const getContract = (id: string): Promise<WorkContract> =>
  call(client().get(`/contracts/${encodeURIComponent(id)}`, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 25–26. CONVERSATION (ProofChat ref). Chưa cấu hình → status:'unconfigured'.
// ─────────────────────────────────────────────────────────────────────
export const openConversation = (contractId: string): Promise<ConversationRef> =>
  call(client().post(`/contracts/${encodeURIComponent(contractId)}/conversation`, {}, writeCfg()));

export const getConversation = (contractId: string): Promise<ConversationRef> =>
  call(client().get(`/contracts/${encodeURIComponent(contractId)}/conversation`, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 27–28. EVIDENCE (VeData — Genie neo bằng chứng)
// ─────────────────────────────────────────────────────────────────────
export interface EvidenceItem {
  type: 'note' | 'link' | string;
  content: string;
}
export const registerEvidence = (
  contractId: string,
  items: EvidenceItem[],
  opts?: WriteOpts,
): Promise<unknown> =>
  call(client().post(`/contracts/${encodeURIComponent(contractId)}/evidence/register`, { items }, writeCfg(opts)));

export const getEvidence = (
  contractId: string,
): Promise<{ items: EvidenceItem[]; allAnchored: boolean; status: string }> =>
  call(client().get(`/contracts/${encodeURIComponent(contractId)}/evidence`, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 29. STATE MACHINE Pledge — POST /contracts/:id/:action
//     action ∈ lockPledge {side,amount} / activate / deliver /
//              confirmPayment / mutualRelease / forfeit {side} / dispute
// ─────────────────────────────────────────────────────────────────────
export type ContractAction =
  | 'lockPledge' | 'activate' | 'deliver' | 'confirmPayment'
  | 'mutualRelease' | 'forfeit' | 'dispute';

// opts.ifVersion = version hợp-đồng đang cầm (chặn double-apply qua 409 CONFLICT).
// opts.idempotencyKey = khoá ỔN ĐỊNH theo 1 lần bấm (retry mạng không chạy 2 lần).
export const contractAction = (
  contractId: string,
  action: ContractAction,
  body: Record<string, unknown> = {},
  opts: WriteOpts = {},
): Promise<WorkContract> =>
  call(
    client().post(
      `/contracts/${encodeURIComponent(contractId)}/${action}`,
      body,
      writeCfg(opts),
    ),
  );

// Tiện ích tường minh cho từng bước (đọc dễ ở UI). opts đẩy xuống để gửi If-Version.
export const lockPledge = (id: string, side: 'aladin' | 'genie', amount: number, opts?: WriteOpts) =>
  contractAction(id, 'lockPledge', { side, amount }, opts);
export const activateContract = (id: string, opts?: WriteOpts) => contractAction(id, 'activate', {}, opts);
export const deliverContract = (id: string, opts?: WriteOpts) => contractAction(id, 'deliver', {}, opts);
export const confirmPayment = (id: string, opts?: WriteOpts) => contractAction(id, 'confirmPayment', {}, opts);
export const mutualRelease = (id: string, opts?: WriteOpts) => contractAction(id, 'mutualRelease', {}, opts);
export const forfeitContract = (id: string, side: 'aladin' | 'genie', opts?: WriteOpts) =>
  contractAction(id, 'forfeit', { side }, opts);
export const disputeContract = (id: string, opts?: WriteOpts) => contractAction(id, 'dispute', {}, opts);

// ─────────────────────────────────────────────────────────────────────
// 30. ONCHAIN escrow (Cardano Preview) — 503 CARDANO_OFF nếu chưa cấu hình.
// ─────────────────────────────────────────────────────────────────────
export const contractOnchain = (
  contractId: string,
  body: { op: string; lovelace?: number; lockTxHash?: string },
): Promise<unknown> =>
  call(client().post(`/contracts/${encodeURIComponent(contractId)}/onchain`, body, writeCfg()));

// ─────────────────────────────────────────────────────────────────────
// 31–34. TREASURY + TEAM (điểm trách nhiệm nội bộ)
// ─────────────────────────────────────────────────────────────────────
export const getTreasury = (): Promise<unknown> =>
  call(client().get('/treasury', authCfg));

export const treasurySnapshot = (): Promise<unknown> =>
  call(client().post('/treasury/snapshot', {}, writeCfg()));

// ⛔ GỠ 2026-08-05: `/team/members` và `/team/tasks` trả hồ sơ nhân sự thật kèm
// `baseSalaryVND`/`bonusVND` của người có tên. Máy chủ sẽ đóng lại thành 401/403
// (AladinWork `Core#16`), nhưng bản đang chạy vẫn mở — nên gỡ ở phía ứng dụng
// TRƯỚC, đừng chờ bản vá máy chủ. Không màn nào gọi hai hàm này (grep 0).
// ĐỪNG dựng lại: lương người thật không phải dữ liệu của ứng dụng nông dân.

// ── Gom lại 1 object cho tiện import ─────────────────────────────────
export const workApi = {
  getHealth,
  authChallenge, authVerify,
  getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
  getAccounts, getMe,
  getMyAvailability, setAvailability, clearAvailability, getAvailabilityOf,
  createCapability, verifyCapability,
  getOfferings,
  getJobs, getJob, postJob, getJobMatch,
  createContract, getMyContracts, getContract,
  openConversation, getConversation,
  registerEvidence, getEvidence,
  contractAction, lockPledge, activateContract, deliverContract,
  confirmPayment, mutualRelease, forfeitContract, disputeContract,
  contractOnchain,
  getTreasury, treasurySnapshot,
};

export default workApi;
