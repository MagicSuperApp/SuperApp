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
 * ⚠ ĐÍNH CHÍNH 2026-08-06 — ghi chú cũ ở đây SAI, và cái sai đó làm cả màn Pool chết.
 *
 * Ghi chú cũ viết "backend CHƯA CÓ controller pool" và dẫn ba lần curl 404. Đo lại hôm
 * nay thì backend **có đủ, dữ liệu thật**; ba lần đo kia 404 vì gõ thiếu tiền tố `/api`:
 *
 *   GET https://api.phoenixkey.me/v1/pools                 → 404   ← đường tệp này gọi
 *   GET https://api.phoenixkey.me/api/v1/pools?page=1      → 200   {code, result.pool_ids[]}
 *   GET https://api.phoenixkey.me/api/v1/pools/{pool_id}   → 200   ticker/name/live_stake/…
 *   GET https://api.phoenixkey.me/api/v1/delegation/status/{stake} → 200
 *
 * `src/services/phoenixKey-api.ts` gọi ĐÚNG đường ngay từ đầu (`pools` mục :594) —
 * nghĩa là trong repo có hai bản client Pool, một bản chạy được và một bản 404, và bản
 * 404 lại là bản nối vào màn Pool. Nay tệp này gọi lại đúng đường + đúng shape.
 *
 * BAO NHIÊU LÀ HẾT PHẦN NÀY: đây là phía NGƯỜI UỶ QUYỀN (xem pool, chọn pool, xem
 * trạng thái uỷ quyền). Phía NGƯỜI VẬN HÀNH pool — tạo pool, sinh và phân phát bộ khoá
 * (cold/VRF/KES + operational certificate), xoay khoá KES định kỳ — **chưa có gì cả**,
 * không ở app và cũng không ở backend. Xem issue trên PhoenixKey; đừng nhầm màn này là
 * công cụ cho SPO.
 */

// @ts-ignore — provided by react-native-dotenv at build time.
import { PHOENIXKEY_POOL_API_URL } from '@env';

// ── Base URL ─────────────────────────────────────────────────────────
// Mặc định api.phoenixkey.me (Phoenix chốt 2026-07-23); override qua env khi dev.
// Tiền tố `/api/v1` nằm TRONG hằng này, đúng như `phoenixKey-api.ts` — thiếu `/api`
// là 404 toàn bộ, và đó chính là lỗi đã làm màn Pool trắng suốt hai tuần.
const BASE_URL =
  (PHOENIXKEY_POOL_API_URL as string | undefined) ?? 'https://api.phoenixkey.me/api/v1';

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

// ── Endpoint THẬT (đo 2026-08-06, dữ liệu thật trên mạng pre-production) ──────
//
// Máy chủ bọc mọi phản hồi trong `{ code, result }`. Bóc ở ĐÚNG một chỗ để nơi gọi
// không phải biết lớp bọc đó.
function unwrap<T>(body: unknown): T | undefined {
  return (body as { result?: T } | undefined)?.result;
}

/** Số pool lấy chi tiết cho trang đầu. Xem ghi chú trong `listPools`. */
const DETAIL_PAGE_SIZE = 20;

/**
 * Danh sách pool để user chọn uỷ quyền.
 *
 * ⚠ `GET /pools` chỉ trả **mảng pool_id**, không có ticker/tên/stake — mà danh sách
 * toàn chuỗi `pool1wn6a6…` thì không ai chọn được cái nào. Nên phải gọi thêm chi tiết
 * từng pool. Bản này lấy chi tiết cho `DETAIL_PAGE_SIZE` pool đầu, chạy song song.
 *
 * Đây là chỗ CỐ Ý giới hạn, nói ra để không ai tưởng đã phủ hết: mạng có hàng nghìn
 * pool; lấy chi tiết tất cả là hàng nghìn request từ điện thoại. Việc đúng là backend
 * có một đường trả kèm chi tiết theo trang — đã hỏi Phoenix. Tới lúc đó, màn hiển thị
 * 20 pool đầu.
 */
export async function listPools(): Promise<{ pools?: PoolSummary[] }> {
  const body = await request<unknown>('/pools?page=1&count=100', { method: 'GET' });
  const ids = unwrap<{ pool_ids?: string[] }>(body)?.pool_ids ?? [];
  if (ids.length === 0) return { pools: [] };

  const details = await Promise.all(
    ids.slice(0, DETAIL_PAGE_SIZE).map(id =>
      // Một pool lỗi KHÔNG được làm trắng cả danh sách — bỏ qua đúng pool đó.
      getPool(id).catch(() => null),
    ),
  );
  return { pools: details.filter((p): p is PoolSummary => p !== null) };
}

/** Chi tiết 1 pool. */
export async function getPool(poolId: string): Promise<PoolSummary> {
  const body = await request<unknown>(`/pools/${encodeURIComponent(poolId)}`, {
    method: 'GET',
  });
  const r = unwrap<Record<string, unknown>>(body);
  if (!r) throw new PoolApiError('server', 200, 'Máy chủ Pool trả dữ liệu trống.');
  // Đổi tên trường của máy chủ sang tên UI đang dùng. Giữ `live_stake`/`fixed_cost`
  // NGUYÊN CHUỖI: lovelace của một pool lớn vượt 2^53, parse sang number là sai số.
  return {
    pool_id: String(r.pool_id ?? poolId),
    ticker: r.ticker as string | undefined,
    name: r.name as string | undefined,
    description: r.description as string | undefined,
    live_stake: r.live_stake as string | undefined,
    saturation: r.live_saturation as number | undefined,
    fixed_cost: r.fixed_cost as string | undefined,
    // `margin_cost` là PHÂN SỐ 0..1, không phải phần trăm — `phoenixKey-api.ts` (bản
    // client Pool vẫn chạy được) ghi rõ điều đó. UI in `${margin}%`, nên không nhân
    // 100 ở đây thì pool phí 3% hiện thành "0.03%": mọi pool trông như phí bằng 0 và
    // người uỷ quyền chọn sai. Nhân ở ĐÚNG một chỗ này, cùng thang với `saturation`.
    margin: r.margin_cost != null ? (r.margin_cost as number) * 100 : undefined,
  };
}

/**
 * Trạng thái uỷ quyền của một stake address.
 *
 * Máy chủ đánh theo ĐỊA CHỈ STAKE, không theo phiên đăng nhập — nên nơi gọi phải đưa
 * địa chỉ vào. Chưa có ví thì chưa có địa chỉ, và câu trả lời đúng lúc đó là "chưa
 * uỷ quyền", không phải một lỗi đỏ.
 */
export async function getDelegationStatus(
  // BẮT BUỘC, cố ý. Trước đây để `?` cho tiện, và nơi gọi duy nhất gọi rỗng
  // `getDelegationStatus()` — tsc im lặng, còn banner "Đang uỷ quyền" thì không bao
  // giờ hiện. Tham số bắt buộc để trình biên dịch bắt hộ lần sau.
  stakeAddress: string,
): Promise<DelegationStatus> {
  if (!stakeAddress) return { delegated_pool_id: null };
  const body = await request<unknown>(
    `/delegation/status/${encodeURIComponent(stakeAddress)}`,
    { method: 'GET' },
  );
  const r = unwrap<Record<string, unknown>>(body);
  return {
    delegated_pool_id: (r?.pool_id as string | null | undefined) ?? null,
    active_stake: r?.controlled_amount as string | undefined,
    available_rewards: r?.withdrawable_amount as string | undefined,
  };
}

// ── Uỷ quyền — KÝ CLIENT-SIDE (non-custodial), CHỖ CHỜ nối ví ─────────
// KHÔNG ký/nộp tx ở service này. Khi nối ví: dựng tx delegation, ký bằng khoá
// trong Keystore/Enclave (KHÔNG lộ khoá ra JS), submit qua đường ví thống nhất.
// TODO(ví + Phoenix): thay bằng luồng ký thật; nay chỉ khai chữ ký cho UI khung.
export async function delegateToPool(_poolId: string): Promise<never> {
  throw new PoolApiError(
    'server',
    0,
    'Uỷ quyền chưa nối ví ký — đang chờ hợp đồng ví + endpoint Pool.',
  );
}
