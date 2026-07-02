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
  WorkAccount, JobType, WorkJob, Offering, WorkContract, MatchResult,
  Credential, AvailabilityResult, Availability, ChallengeResult, VerifyResult,
  VerifyBody, HealthResult, ConversationRef,
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

const client = (): AxiosInstance => {
  if (_client) return _client;
  _client = axios.create({
    baseURL: resolveBaseURL(),
    timeout: WORK_HTTP_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });
  // Gắn Bearer cho request cần auth (đánh dấu qua config.needsAuth).
  _client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    if ((config as InternalAuthableConfig).needsAuth) {
      const token = await getWorkSessionToken();
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
 * Nộp challenge + signature (Thư ký secp256k1) → nhận session Bearer.
 * Lớp gọi này KHÔNG tự ký; caller truyền signature + timestamp (GIÂY epoch).
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
  call(client().post('/templates', t, authCfg));

export const updateTemplate = (key: string, patch: Partial<JobType>): Promise<JobType> =>
  call(client().patch(`/templates/${encodeURIComponent(key)}`, patch, authCfg));

export const deleteTemplate = (key: string): Promise<{ key: string; removed: boolean }> =>
  call(client().delete(`/templates/${encodeURIComponent(key)}`, authCfg));

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
  call(client().post('/availability', body, authCfg));

export const clearAvailability = (): Promise<{ did: string; removed: boolean }> =>
  call(client().delete('/availability', authCfg));

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
export const createCapability = (body: CapabilityBody): Promise<Credential> =>
  call(client().post('/capabilities', body, authCfg));

export const verifyCapability = (
  id: string,
  body: { templateKey?: string } = {},
): Promise<{ verified: boolean; credential: Credential; stamp: unknown }> =>
  call(client().post(`/capabilities/${encodeURIComponent(id)}/verify`, body, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 17. OFFERINGS (dịch vụ — phía cung)
// ─────────────────────────────────────────────────────────────────────
export const getOfferings = (params?: { ownerDid?: string; activeOnly?: boolean }): Promise<Offering[]> =>
  call(client().get('/offerings', { params }));

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
export const postJob = (body: PostJobBody): Promise<WorkJob> =>
  call(client().post('/jobs', body, authCfg));

export const getJobMatch = (id: string): Promise<MatchResult> =>
  call(client().get(`/jobs/${encodeURIComponent(id)}/match`));

// ─────────────────────────────────────────────────────────────────────
// 22–24. CONTRACTS
// ─────────────────────────────────────────────────────────────────────
export type CreateContractBody =
  | { jobId: string; candidateDid: string }
  | { offeringId: string; priceVND?: number; aladinPledge?: number; geniePledge?: number };

export const createContract = (body: CreateContractBody): Promise<WorkContract> =>
  call(client().post('/contracts', body, authCfg));

export const getMyContracts = (): Promise<WorkContract[]> =>
  call(client().get('/contracts', authCfg));

export const getContract = (id: string): Promise<WorkContract> =>
  call(client().get(`/contracts/${encodeURIComponent(id)}`, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 25–26. CONVERSATION (ProofChat ref). Chưa cấu hình → status:'unconfigured'.
// ─────────────────────────────────────────────────────────────────────
export const openConversation = (contractId: string): Promise<ConversationRef> =>
  call(client().post(`/contracts/${encodeURIComponent(contractId)}/conversation`, {}, authCfg));

export const getConversation = (contractId: string): Promise<ConversationRef> =>
  call(client().get(`/contracts/${encodeURIComponent(contractId)}/conversation`, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 27–28. EVIDENCE (VeData — Genie neo bằng chứng)
// ─────────────────────────────────────────────────────────────────────
export const registerEvidence = (
  contractId: string,
  items: unknown[],
): Promise<unknown> =>
  call(client().post(`/contracts/${encodeURIComponent(contractId)}/evidence/register`, { items }, authCfg));

export const getEvidence = (
  contractId: string,
): Promise<{ items: unknown[]; allAnchored: boolean; status: string }> =>
  call(client().get(`/contracts/${encodeURIComponent(contractId)}/evidence`, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 29. STATE MACHINE Pledge — POST /contracts/:id/:action
//     action ∈ lockPledge {side,amount} / activate / deliver /
//              confirmPayment / mutualRelease / forfeit {side} / dispute
// ─────────────────────────────────────────────────────────────────────
export type ContractAction =
  | 'lockPledge' | 'activate' | 'deliver' | 'confirmPayment'
  | 'mutualRelease' | 'forfeit' | 'dispute';

export const contractAction = (
  contractId: string,
  action: ContractAction,
  body: Record<string, unknown> = {},
): Promise<WorkContract> =>
  call(
    client().post(
      `/contracts/${encodeURIComponent(contractId)}/${action}`,
      body,
      authCfg,
    ),
  );

// Tiện ích tường minh cho từng bước (đọc dễ ở UI):
export const lockPledge = (id: string, side: 'aladin' | 'genie', amount: number) =>
  contractAction(id, 'lockPledge', { side, amount });
export const activateContract = (id: string) => contractAction(id, 'activate');
export const deliverContract = (id: string) => contractAction(id, 'deliver');
export const confirmPayment = (id: string) => contractAction(id, 'confirmPayment');
export const mutualRelease = (id: string) => contractAction(id, 'mutualRelease');
export const forfeitContract = (id: string, side: 'aladin' | 'genie') =>
  contractAction(id, 'forfeit', { side });
export const disputeContract = (id: string) => contractAction(id, 'dispute');

// ─────────────────────────────────────────────────────────────────────
// 30. ONCHAIN escrow (Cardano Preview) — 503 CARDANO_OFF nếu chưa cấu hình.
// ─────────────────────────────────────────────────────────────────────
export const contractOnchain = (
  contractId: string,
  body: { op: string; lovelace?: number; lockTxHash?: string },
): Promise<unknown> =>
  call(client().post(`/contracts/${encodeURIComponent(contractId)}/onchain`, body, authCfg));

// ─────────────────────────────────────────────────────────────────────
// 31–34. TREASURY + TEAM (điểm trách nhiệm nội bộ)
// ─────────────────────────────────────────────────────────────────────
export const getTreasury = (): Promise<unknown> =>
  call(client().get('/treasury', authCfg));

export const treasurySnapshot = (): Promise<unknown> =>
  call(client().post('/treasury/snapshot', {}, authCfg));

export const getTeamMembers = (): Promise<unknown[]> =>
  call(client().get('/team/members'));

export const getTeamTasks = (): Promise<unknown[]> =>
  call(client().get('/team/tasks'));

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
  getTreasury, treasurySnapshot, getTeamMembers, getTeamTasks,
};

export default workApi;
