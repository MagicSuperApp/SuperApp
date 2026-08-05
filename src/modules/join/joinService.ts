/**
 * joinService.ts — Client tiêu thụ endpoint LampNet cho module "Kết đèn" (SG8·F8.4).
 *
 * PHẠM VI KHUNG (spec §5): CHỈ dựng lớp gọi REST theo hợp đồng endpoint spec §2.
 *   - Nghiệp vụ Join/lease/verify/settlement do daemon LampNet sở hữu — app KHÔNG
 *     re-implement (spec §1). Ở đây chỉ khai chữ ký + gọi + phân loại lỗi.
 *   - FFI native `join_and_contribute(JoinConfig)` + lưu seed_hex ở Keystore/Keychain
 *     = phần của Thư (spec §1/§3). Ở service này CHỈ để CHỖ (joinViaNativeSdk) +
 *     comment TODO, KHÔNG tự viết native / KHÔNG chạm seed_hex plaintext (INV-3).
 *
 * Server: LAMPNET_BASE_URL (env). Wire format snake_case — dùng ĐÚNG key BE trả,
 * KHÔNG tự đổi (spec §2, INTEGRATION §3). Parser khoan cứng-hoá field lạ, log field
 * chưa biết (spec §6 — JSON /v1/mobile/* đang chuẩn hoá).
 *
 * Lỗi phân biệt 3 lớp (spec §2, §4, INTEGRATION §7.3):
 *   - network : mất mạng / timeout        → UI trạng thái "offline", có retry.
 *   - auth    : 4xx quyền/tier            → UI thông điệp quyền, có retry.
 *   - server  : 5xx daemon                → UI trạng thái "error", có retry.
 */

import { LAMPNET_BASE_URL } from '@env';

// ── Base URL ─────────────────────────────────────────────────────────
// LAMPNET_BASE_URL đã có sẵn trong .env (dùng chung với upload Mirage).
// TODO(backend LampNet): xác nhận daemon dev expose các path /v1/* dưới base này,
// hay có prefix riêng — đối chiếu message team LampNet trước khi bật thật.
const BASE_URL = (LAMPNET_BASE_URL as string | undefined) ?? 'https://lampnet.cloud';

// Timeout mặc định — quá hạn coi là lỗi mạng (spec §2: "timeout → error").
const DEFAULT_TIMEOUT_MS = 15000;

// ── Phân loại lỗi ────────────────────────────────────────────────────

export type JoinErrorKind = 'network' | 'auth' | 'server' | 'unsupported';

export class JoinApiError extends Error {
  constructor(
    public readonly kind: JoinErrorKind,
    /** HTTP status (0 nếu chưa tới được server). */
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'JoinApiError';
  }
}

// ── Kiểu dữ liệu (shape thô theo wire snake_case; optional để chịu field lạ) ──
// LƯU Ý (spec §6): JSON chuẩn /v1/mobile/* LampNet đang thêm. Giữ optional +
// không ép field lạ; khi chuẩn xong cập nhật parser tại đây (một chỗ).

export interface PeerIdResult {
  /** DID bootstrap của daemon — dùng làm JoinConfig.bootstrap_did (spec §3). */
  bootstrap_did: string;
  peer_id?: string;
}

/** Cấu hình Join truyền xuống SDK Rust (spec §3). App KHÔNG cầm seed_hex plaintext. */
export interface JoinConfig {
  /** PersonDID — bản NÀY chấp did:cardano; §6 ép did:phoenix sau (qua adapter). */
  subject_did: string;
  /** Địa chỉ Cardano nhận LAMP/MAGIC (addr_test1…/addr1…). */
  cardano_address: string;
  /** Từ bước 0 (peer_id). */
  bootstrap_did: string;
  /** Hardware = Keystore/Secure Enclave (mặc định điện thoại). */
  attestation_mode: 'Hardware' | 'Software';
  // seed_hex KHÔNG khai ở JS (INV-3) — native tự sinh/đọc trong Keystore/Keychain.
}

export interface JoinResult {
  /** Bậc đóng góp sau đăng ký. */
  tier?: string | number;
  node_id?: string;
  node_key?: string;
  status?: string;
}

export interface NodeStats {
  online?: boolean;
  /** Số việc đang chạy. */
  active_leases?: number;
  /** Tổng việc đã được daemon verify. */
  verified_jobs?: number;
  tier?: string | number;
  peer_id?: string;
}

export interface RewardEpoch {
  epoch?: number;
  /** Thưởng tích luỹ epoch (µLAMP in-memory — spec §5: thử nghiệm, chưa MAGIC thật). */
  accrued_micro_lamp?: string | number;
  settled?: boolean;
}

// ── Feature flag: chỉ bật khi có base URL (offline-first, không vỡ nếu BE chết) ──
export const isLampNetBackendEnabled = (): boolean =>
  !!(LAMPNET_BASE_URL as string | undefined);

// ── fetch helper: timeout + phân loại lỗi 3 lớp ──────────────────────

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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
    // Abort (timeout) hoặc mất mạng → lớp network. KHÔNG lộ chi tiết kỹ thuật ra UI.
    console.warn(`[joinService] network lỗi khi gọi ${path}:`, e?.message ?? e);
    throw new JoinApiError('network', 0, 'Mất kết nối tới mạng LampNet.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // CHỈ 401/403 mới là chuyện quyền. Gộp cả 4xx vào 'auth' như trước là đổ lỗi cho
    // người dùng: 405 (sai phương thức) và 422 (app gửi thiếu trường) là lỗi của app,
    // mà giao diện lại bảo "chưa đủ bậc tham gia" — đúng cách để không ai tìm ra lỗi.
    const kind: JoinErrorKind =
      res.status === 401 || res.status === 403 ? 'auth' : 'server';
    console.warn(`[joinService] ${path} trả HTTP ${res.status} (${kind}).`);
    throw new JoinApiError(
      kind,
      res.status,
      kind === 'auth'
        ? 'Chưa đủ quyền hoặc chưa đủ bậc tham gia.'
        : `Mạng LampNet chưa nhận yêu cầu này (mã ${res.status}).`,
    );
  }

  // Body có thể rỗng (204) — trả về object rỗng an toàn.
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // JSON parse thất bại → ném để tầng trên hiện lỗi (không nuốt thành {}).
    console.warn(`[joinService] ${path} body không phải JSON hợp lệ:`, text.slice(0, 80));
    throw new JoinApiError('server', res.status, 'Phản hồi server không hợp lệ.');
  }
}

// ── Endpoint theo hợp đồng spec §2 ───────────────────────────────────

/**
 * Bước 0 — Bootstrap: lấy bootstrap_did từ /v1/network_info (trả JSON).
 * Không dùng /v1/peer_id vì endpoint đó trả plain text, không phải JSON.
 */
export const getPeerId = async (): Promise<PeerIdResult> => {
  const info = await request<{ bootstrap_peer_id?: string }>('/v1/network_info', { method: 'GET' });
  if (!info.bootstrap_peer_id) {
    throw new JoinApiError('server', 0, 'network_info thiếu bootstrap_peer_id.');
  }
  return { bootstrap_did: info.bootstrap_peer_id };
};

/**
 * Bước 1 — Đăng ký (đường REST).
 * ƯU TIÊN dùng SDK Rust `join_and_contribute` (joinViaNativeSdk) khi native sẵn
 * sàng; endpoint này là đường REST tương đương (spec §2 bước 1) cho KHUNG UI.
 */
export const requestJoin = (config: JoinConfig): Promise<JoinResult> =>
  request<JoinResult>('/v1/join/v2/request', {
    method: 'POST',
    body: JSON.stringify(config),
  });

/** Bước 2 — Kích hoạt ví: gắn địa chỉ nhận thưởng. */
export const activateWallet = (cardanoAddress: string): Promise<void> =>
  request<void>('/v1/wallet/activate', {
    method: 'POST',
    body: JSON.stringify({ cardano_address: cardanoAddress }),
  });

/** Bước 3 — Nhận lease: daemon giao workload. */
export const requestLease = (nodeId: string): Promise<Record<string, unknown>> =>
  request('/v1/mobile/lease', {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  });

/** Bước 4 — Tải payload (ký lease_id). Chữ ký thật do native lo (Thư). */
export const fetchPayload = (leaseId: string): Promise<Record<string, unknown>> =>
  request(`/v1/mobile/payload/${encodeURIComponent(leaseId)}`, { method: 'POST' });

/** Bước 5 — Báo kết quả: daemon recompute-verify. */
export const reportResult = (
  leaseId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> =>
  request('/v1/mobile/report', {
    method: 'POST',
    body: JSON.stringify({ lease_id: leaseId, ...payload }),
  });

/** Bước 6 — Quyết toán: sổ thưởng của cả epoch. Daemon khai **GET** (gọi POST → 405). */
export const settlement = (): Promise<Record<string, unknown>> =>
  request('/v1/mobile/settlement', { method: 'GET' });

/** Bước 7 — Trạng thái node (online, việc đang chạy, việc đã verify). Màn "Đang đóng góp". */
export const getNodeStats = (): Promise<NodeStats> =>
  request<NodeStats>('/v1/node/stats', { method: 'GET' });

/**
 * Thưởng tích luỹ CỦA MỘT THIẾT BỊ — `GET /v1/mobile/rewards/{device_pubkey}`.
 * Đây là đường đúng cho màn "Đang đóng góp". Chưa gọi được vì `device_pubkey` do SDK
 * native sinh (Keystore/Keychain), mà cầu native chưa có — xem `joinViaNativeSdk`.
 */
export const getDeviceRewards = (
  devicePubkeyHex: string,
): Promise<{ device_pubkey_hex: string; units: number; ulamp: number }> =>
  request(`/v1/mobile/rewards/${encodeURIComponent(devicePubkeyHex)}`, { method: 'GET' });

/**
 * ⛔ KHÔNG dùng từ ứng dụng. `/v1/reward/epoch` là đường **POST** phía vận hành: nó nhận
 * đóng góp của TẤT CẢ node + `total_pool` và đòi header `X-LampNet-Sig`. Gọi bằng GET
 * trả 405 — chính chỗ này làm màn "Đang đóng góp" chưa bao giờ hiện được số nào.
 * Giữ lại để không ai dựng lại nhầm; thưởng theo thiết bị dùng `getDeviceRewards`.
 * @deprecated
 */
export const getRewardEpoch = (): Promise<RewardEpoch> =>
  request<RewardEpoch>('/v1/reward/epoch', { method: 'GET' });

// ── DID adapter (spec §6 — cô lập did:cardano sau 1 lớp, INV-2) ───────
// UI/logic KHÔNG đọc thẳng did:cardano. Bản sau ép did:phoenix → CHỈ đổi hàm này,
// KHÔNG đụng màn. Nay: nhận DID từ store user và trả nguyên (bản NÀY chấp cả hai).
// TODO(§6): khi PhoenixKey lên, map did:cardano → did:phoenix ở ĐÂY.
export function resolvePersonDid(rawDid: string | null | undefined): string | null {
  if (typeof rawDid !== 'string' || !rawDid) return null;
  // Bản NÀY: truyền nguyên. Bản sau: chèn bước resolve issuer PhoenixKey tại đây.
  return rawDid;
}

// ── FFI native — CHỖ CHỜ THƯ (spec §1/§3) ────────────────────────────
// KHÔNG tự viết binding. Hàm Rust ĐÃ CÓ SẴN phía LampNet
// (`lampnet-mobile-sdk/src/join.rs:166` — `#[uniffi::export] join_and_contribute`),
// nó tự dựng đủ 22 trường + 2 chữ ký Ed25519 + benchmark thiết bị và trả `request_json`.
// Thiếu đúng khâu đóng gói: build uniffi → .aar/.xcframework + TurboModule.
// ⚠ ĐỪNG dựng lại 22 trường ở JS — seed không được ra khỏi Secure Element (INV-3).

/** Cầu native đã gắn chưa. Dùng để trả lời NGAY, không tốn một vòng mạng. */
export function isNativeJoinAvailable(): boolean {
  return false; // TODO(Thư): !!NativeModules.LampNetJoin
}

export async function joinViaNativeSdk(_config: JoinConfig): Promise<JoinResult> {
  // TODO(Thư): thay bằng NativeModules.LampNetJoin.joinAndContribute(_config).
  //   - native lo attestation Hardware + seed_hex ở Secure Element.
  //   - KHÔNG log, KHÔNG trả seed_hex ra JS bridge (INV-3, spec §3).
  // Đường REST KHÔNG thay thế được: daemon đòi 22 trường kèm 2 chữ ký Ed25519 mà
  // chỉ SDK native mới dựng được — gọi REST với 4 trường luôn trả 422.
  throw new JoinApiError('unsupported', 0, 'Kết đèn qua SDK native chưa hỗ trợ trên bản này.');
}
