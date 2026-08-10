/**
 * poolService.ts — Client tiêu thụ endpoint POOL (stake pool / SPO) cho module "Pool".
 *
 * PHẠM VI KHUNG: CHỈ dựng lớp gọi REST + kiểu dữ liệu + phân loại lỗi để UI trỏ vào.
 *   - Nội dung hiển thị (danh sách pool, chỉ số, trạng thái uỷ quyền) THUỘC backend
 *     PhoenixKey `api.phoenixkey.me` — app KHÔNG tự tính, chỉ render đúng key BE trả.
 *   - Uỷ quyền (delegate) là giao dịch KÝ CLIENT-SIDE (non-custodial) → KHÔNG ký ở đây;
 *     để CHỖ + TODO, nối ví sau (giống ranh giới seed_hex của joinService, INV-3).
 *
 * HOST — ĐÃ CHỐT (Phoenix agent trả lời 2026-07-23, câu 4): dùng `.me`, KHÔNG phải `.io`.
 * Nhất quán với `phoenixKey-api.ts`. (Trước đây để `.io` theo ghi chú ban đầu.)
 *
 * BACKEND — CHƯA CÓ (curl 2026-07-24, đo thật):
 *   `GET /api/v1/pools` → 404 · `/api/v1/delegation/status` → 404 · `/api/v1/v1/pools` → 404
 * Phoenix xác nhận backend KHÔNG có controller pool; đã inbox yêu cầu Long build.
 * Mọi path dưới đây là ĐỀ XUẤT, khoá sau feature-flag → UI chạy khung không vỡ
 * (offline-first). Khi backend có contract thật → cập nhật parser tại 1 chỗ.
 */

// @ts-ignore — provided by react-native-dotenv at build time.
import { PHOENIXKEY_POOL_API_URL } from '@env';

// ── Base URL ─────────────────────────────────────────────────────────
// Mặc định api.phoenixkey.me (Phoenix chốt 2026-07-23); override qua env khi dev.
const BASE_URL =
  (PHOENIXKEY_POOL_API_URL as string | undefined) ?? 'https://api.phoenixkey.me';

// Timeout mặc định — quá hạn coi là lỗi mạng.
const DEFAULT_TIMEOUT_MS = 15000;

// ── Phân loại lỗi 3 lớp (network / auth / server) — khớp joinService ─────
export type PoolErrorKind = 'network' | 'auth' | 'server';

export class PoolApiError extends Error {
  constructor(
    public readonly kind: PoolErrorKind,
    /** HTTP status (0 nếu chưa tới được server). */
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'PoolApiError';
  }
}

// ── Kiểu dữ liệu (shape thô, optional để chịu field lạ tới khi contract chốt) ──
// TODO(Phoenix): thay bằng shape THẬT khi backend có controller pool (hiện 404).

/** Một stake pool (SPO) hiển thị cho user chọn uỷ quyền. */
export interface PoolSummary {
  pool_id: string;
  ticker?: string;
  name?: string;
  description?: string;
  /** Tổng stake đang uỷ quyền (lovelace hoặc đơn vị BE quy định — GIỮ chuỗi, KHÔNG parse number >2^53). */
  live_stake?: string;
  /** Mức bão hoà 0..1 (BE tính). */
  saturation?: number;
  /** Lợi suất ước tính (BE tính, %). */
  roa?: number;
  /** Phí cố định + biên (BE trả nguyên chuỗi/định dạng). */
  fixed_cost?: string;
  margin?: number;
}

/** Trạng thái uỷ quyền hiện tại của user. */
export interface DelegationStatus {
  /** pool_id đang uỷ quyền, null nếu chưa uỷ quyền. */
  delegated_pool_id?: string | null;
  /** Stake đang hoạt động của user. */
  active_stake?: string;
  /** Thưởng chưa rút. */
  available_rewards?: string;
}

// ── Feature flag: chỉ bật khi có base URL (offline-first, không vỡ nếu BE chết) ──
export const isPoolBackendEnabled = (): boolean =>
  !!(PHOENIXKEY_POOL_API_URL as string | undefined);

// ── fetch helper: timeout + phân loại lỗi 3 lớp ──────────────────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (e: any) {
    console.warn(`[poolService] network lỗi khi gọi ${path}:`, e?.message ?? e);
    throw new PoolApiError('network', 0, 'Mất kết nối tới máy chủ Pool.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const kind: PoolErrorKind = res.status >= 500 ? 'server' : 'auth';
    console.warn(`[poolService] ${path} trả HTTP ${res.status} (${kind}).`);
    throw new PoolApiError(
      kind,
      res.status,
      kind === 'auth'
        ? 'Chưa đủ quyền xem/uỷ quyền Pool.'
        : 'Máy chủ Pool đang trục trặc.',
    );
  }

  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    console.warn(`[poolService] ${path} body không phải JSON hợp lệ — trả rỗng.`);
    return {} as T;
  }
}

// ── Endpoint ĐỀ XUẤT (TODO Phoenix chốt path/shape thật) ─────────────

/** Danh sách pool để user chọn uỷ quyền. */
export const listPools = (): Promise<{ pools?: PoolSummary[] }> =>
  request<{ pools?: PoolSummary[] }>('/v1/pools', { method: 'GET' });

/** Chi tiết 1 pool. */
export const getPool = (poolId: string): Promise<PoolSummary> =>
  request<PoolSummary>(`/v1/pools/${encodeURIComponent(poolId)}`, { method: 'GET' });

/** Trạng thái uỷ quyền của user hiện tại (cần Bearer — nối sau). */
export const getDelegationStatus = (): Promise<DelegationStatus> =>
  request<DelegationStatus>('/v1/delegation/status', { method: 'GET' });

// ── Uỷ quyền — KÝ CLIENT-SIDE (non-custodial), CHỖ CHỜ nối ví ─────────
// KHÔNG ký/nộp tx ở service này. Khi nối ví: dựng tx delegation, ký bằng khoá
// trong Keystore/Enclave (KHÔNG lộ khoá ra JS), submit qua đường ví thống nhất.
// TODO(ví + Phoenix): thay bằng luồng ký thật; nay chỉ khai chữ ký cho UI khung.
export async function delegateToPool(_poolId: string): Promise<never> {
  throw new PoolApiError(
    'server',
    0,
    'Uỷ quyền chưa nối được ví ký — tính năng sẽ mở ở bản sau.',
  );
}
