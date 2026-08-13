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
//
// `api.lampnet.cloud` là bề mặt CHUẨN giữ lâu dài (LampNet đã chốt). `lampnet.cloud`
// hôm nay trỏ cùng một node — đo 12/08, hai host trả cùng peer id — nhưng **không có
// cam kết nào rằng nó sẽ mãi như vậy**. Đổi mặc định sang `api.` để không dựa vào một
// sự trùng hợp; `.env` vẫn ghi đè được.
const BASE_URL = (LAMPNET_BASE_URL as string | undefined) ?? 'https://api.lampnet.cloud';

// ⚠ PROD ĐANG CHẠY BẢN CŨ HƠN `main` — thử end-to-end sẽ gãy ở bước phát nonce,
// và ĐÓ KHÔNG PHẢI LỖI APP. Đừng đi sửa app vì bài thử đỏ. Tự đo 13/08:
//
//   GET https://api.lampnet.cloud/v1/join/challenge   → 404   (route CÓ THẬT ở
//                                                     lampnet-node.rs:1990 @dc27fa9)
//   GET https://api.lampnet.cloud/v1/network_info     → 200
//   GET https://join-api.lampnet.cloud/health         → 502
//
// LampNet chứng minh nhị phân prod cũ bằng cách đối chiếu tên chỉ số `/metrics`:
// prod thiếu `lampnet_durability_blocked_cids`, `…_blocked_reason`,
// `…_peer_registry_size`, `…_chap_nhan_request_ky_dung`, `…_tu_choi_request_khong_ky`
// — đều là chỉ số sinh ra SAU sự cố 03/08.
//
// Gỡ ghi chú này khi LampNet báo đã deploy VÀ `join/challenge` trả khác 404.

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
    throw new JoinApiError('network', 0, 'Mất kết nối tới máy chủ.');
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
 *
 * Lý do né `/v1/peer_id` (trả plain text) **đã hết hiệu lực** từ PR #57 (`2e294b3`):
 * `/v1/peer_id?format=json` nay trả JSON thật. Cả hai đường đều sống, nên giữ
 * `network_info` không sai — ghi lại để người sau khỏi tưởng đây là ràng buộc còn đúng.
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

/**
 * Bước 2 — Kích hoạt ví: gắn địa chỉ nhận thưởng.
 *
 * ⚠ ĐỪNG NỐI VÀO UI TRƯỚC KHI LAMPNET BÁO ĐÃ SỬA. Hàm này **đúng hợp đồng**;
 * cửa phía máy chủ mới là chỗ hỏng, LampNet tự đo và báo 13/08 (`dc27fa9`):
 *
 * - `lampnet-node.rs:9708-9711` — `wallet_activate_handler` tra địa chỉ Cardano
 *   trong `join_node_states` bằng `state.peer_id`.
 * - Bảng đó chỉ có 2 writer: `:8014` ghi theo `body.subject_did` (client gửi) và
 *   `:9807` qua `/v1/dev/register_wallet` (chỉ khi `LAMPNET_DEV_MODE=true`).
 *   **Không writer nào ghi `peer_id`** ⇒ reader trượt 100%.
 * - Chú thích `:9706` khẳng định peer_id ĐƯỢC dùng làm `subject_did` — sai:
 *   cổng `/v1/peer/enroll:4739` gọi `is_valid_did` (`did_auth.rs:176-188`) đòi
 *   `did:phoenix:<13 base32>:<64 hex>`, `12D3Koo…` không lọt.
 *
 * Khác ca `getRewardEpoch` đã XOÁ 12/08 (ở đó hàm sai: GET vào route POST,
 * thiếu chữ ký P2P). Ở đây giữ hàm, vì sửa nằm phía máy chủ.
 */
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

/**
 * Quyết toán tích luỹ CỦA MỘT THIẾT BỊ — `GET /v1/mobile/settlement`.
 *
 * ĐÃ ĐO (12/08, curl thật 4/4 đường, nhà LampNet xác nhận): GET đúng, không phải POST.
 * Tranh cãi "GET hay POST" trước đây là câu hỏi sai — hai bên đọc hai tài liệu khác nhau
 * mà chưa ai gọi thật.
 *
 * ⚠️ `total_ulamp` là tích luỹ **per-verified-unit của một THIẾT BỊ**; nó KHÔNG phải
 * phần chia epoch của node (`magic_amount` ở `POST /v1/reward/epoch`). Hai con số sinh
 * ra ở hai đường mã không gặp nhau — **không cộng, không so, không vẽ chung một biểu đồ.**
 *
 * ⚠️ ĐƠN VỊ CHƯA CHỐT — đừng quy đổi, đừng gắn nhãn token. Bốn nguồn đang nói ba tên:
 * `Reward-Math.md` V1 nói MAGIC · V2 + `Reward-Tech.md §6.1` nói LAMP · rule toàn hệ +
 * `CARP-LampNet-Coordination.md` nói CARP · mã đang chạy chi µLAMP. Anh Đức chưa chốt.
 * Vì vậy màn "Đang đóng góp" giữ **dấu gạch**, không hiện số quy đổi.
 */
export interface MobileSettlementView {
  /** Xem cảnh báo đơn vị ở trên. Tên trường giữ NGUYÊN như máy chủ trả. */
  total_ulamp?: number;
  [k: string]: unknown;
}
export const settlement = (): Promise<MobileSettlementView> =>
  request<MobileSettlementView>('/v1/mobile/settlement', { method: 'GET' });

/** Bước 7 — Trạng thái node (online, việc đang chạy, việc đã verify). Màn "Đang đóng góp". */
export const getNodeStats = (): Promise<NodeStats> =>
  request<NodeStats>('/v1/node/stats', { method: 'GET' });

/**
 * Thưởng tích luỹ CỦA MỘT THIẾT BỊ — `GET /v1/mobile/rewards/{device_pubkey}`.
 *
 * ⚠ CHƯA KIỂM, và đường này KHÔNG có trong `Join-Integration.md` (grep `mobile/rewards`
 * = 0). Nó là ĐỀ NGHỊ của bên này, chưa phải hợp đồng đã chốt. Đã hỏi Join xác nhận.
 * Dù sao cũng chưa gọi được: `device_pubkey` do phần native sinh, mà cầu native chưa có.
 *
 * ⚠️ VÀ KỂ CẢ KHI CÓ CẦU NATIVE, "suất theo thiết bị" vẫn chưa có nền (LampNet xác nhận
 * 12/08): phía máy chủ `device_pubkey` **không neo vào bất cứ danh tính nào** —
 * `verify_lease_request` chỉ đòi chữ ký Ed25519 của chính thiết bị trên field của chính
 * nó, mà sinh keypair mới là miễn phí. Nên "một thiết bị" hiện chỉ có nghĩa "một khoá",
 * không phải "một máy", càng không phải "một người". Chống một người khai nhiều thiết bị
 * thì phải neo vào PhoenixKey DID. Đừng hứa với người dùng nhiều hơn thế.
 */
export const getDeviceRewards = (
  devicePubkeyHex: string,
): Promise<{ device_pubkey_hex: string; units: number; ulamp: number }> =>
  request(`/v1/mobile/rewards/${encodeURIComponent(devicePubkeyHex)}`, { method: 'GET' });

/**
 * ⛔ `/v1/reward/epoch` — ĐÃ ĐO 12/08, ĐÃ XOÁ hàm gọi. Đừng viết lại.
 *
 * Trước đây chỗ này ghi "chưa đo được". Nay đo trên mã daemon `main@c89da10`, hai lý do
 * độc lập, mỗi lý do đủ để chặn:
 * - `lampnet-node.rs:1504` đăng ký đường này là **POST**, không có nhánh GET ⇒ gọi GET
 *   được 405.
 * - `lampnet-node.rs:6354-6355` gọi `require_p2p_sig(…, "POST", "/v1/reward/epoch", &raw_body)`
 *   — chữ ký P2P daemon-to-daemon **buộc theo thân yêu cầu**. Điện thoại không có khoá
 *   P2P của daemon nên không ký được, kể cả gọi đúng POST.
 *
 * Tức `Join-Integration.md:71` (khai `GET`) và `superapp-api.md:13` (xếp đường này vào ô
 * "Bearer JWT") **đều sai**. Nhà LampNet đã nhận là lỗi tài liệu bên họ (thư 12/08) và
 * cảnh báo đúng đường này là chỗ đáng nghi kế tiếp — đo ra thì đúng thật.
 *
 * Luật: với LampNet, đối chiếu `require_p2p_sig` / `require_bearer_auth` trong
 * `lampnet-node.rs` theo đúng chuỗi route, ĐỪNG suy loại xác thực từ bảng trong tài liệu.
 *
 * Thưởng theo thiết bị thì dùng `getDeviceRewards` (đường `/v1/mobile/*`, không đòi sig P2P).
 */

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
  throw new JoinApiError('unsupported', 0, 'Bản này chưa hỗ trợ Góp máy.');
}
