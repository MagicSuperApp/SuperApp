/**
 * PhoenixKey backend REST client.
 *
 * Server: `api.phoenixkey.me` (or dev override via env PHOENIXKEY_API_URL).
 * Response envelope:  { code, message, result? }   — code 1000 == OK.
 * Auth: Bearer session_token from AsyncStorage for endpoints that need it.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore — provided by react-native-dotenv at build time.
import { PHOENIXKEY_API_URL } from '@env';

export interface RegisterRequest {
  publicKeyHex: string;
  keyOrigin: 'SECURE_ENCLAVE' | 'IMPORTED_BIP39' | 'DERIVED_CHILD';
  keyRole: 'owner' | 'manager' | 'viewer';
  addedBySignature: string;
  // ── PhoenixKey Enclave (ADDITIVE, optional) — gắn ví Master_KEK vào DID. ──
  // Interceptor axios tự đổi camelCase → snake_case (taad_public_key_hex,
  // wallet_address, entity_type) đúng hợp đồng backend Java (khớp Enclave
  // PhoenixApi.registerIdentity). HW_Key (publicKeyHex) VẪN là DID owner +
  // genesis signature — KHÔNG đổi → did_auth không bị ảnh hưởng.
  taadPublicKeyHex?: string; // TAAD_Key Ed25519 derive từ Master_KEK
  walletAddress?: string;    // địa chỉ Cardano account-0 (cố định) derive từ KEK
  // Backend DidType enum CHỮ HOA: PERSON/ORG/... (gửi 'person' → 400 malformed).
  entityType?: 'PERSON' | 'ORG';
}

export interface RegisterResponse {
  userId: string;
  userDid: string;
  txHash: string;
}

export interface ApproveSessionRequest {
  userDid: string;
  publicKeyHex: string;
  signature: string;
  domain: string;
  timestamp: number;
}

export interface SessionStatusResponse {
  sessionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  sessionToken?: string;
  linkedDeviceToken?: string;
  userDid?: string;
}

export interface SignRequestPayload {
  requestId: string;
  userDid: string;
  sessionId: string;
  intent: {
    type: string;
    body: Record<string, unknown>;
    domain: string;
    appId: string;
    nonce: string;
    timestamp: number;
    displayText: string;
  };
  status: 'pending' | 'approved' | 'cancelled' | 'expired';
  expiresAt: number;
}

export interface ApproveSignRequest {
  publicKeyHex: string;
  signature: string;
}

export interface DeviceRegisterRequest {
  platform: 'ios' | 'android';
  fcmToken?: string;
  apnsToken?: string;
}

export interface BalanceResponse {
  address: string | null;
  balanceLovelace: number;
  balanceLamp: number;
  balanceMagic: number;
  magicAccrued: number;
  magicRatePerSlot: string;
  lastAccrualSlot: number;
  currentSlot: number;
}

/**
 * GET /wallet/{did}/all — endpoint GỘP (thay `/balance` đã deprecated, API.md §7).
 * `wallets[]` chỉ chứa ví ĐÃ có: `phoenix` (custody, từ User.walletAddress) và/hoặc
 * `standard` (CIP-1852, sau khi mobile register). `magic` là số kế-toán Vault (không
 * mint vào ví). Keys đã single-word nên interceptor camelCase giữ nguyên.
 */
export type WalletKind = 'phoenix' | 'standard';
export interface WalletEntry {
  kind: WalletKind;
  addresses: { fixed?: string; active?: string; stake?: string };
  balances: { lovelace: number; lamp: number; carp: number };
}
export interface WalletAllResponse {
  wallets: WalletEntry[];
  magic: { source: string; available: number; accrued: number };
}

/**
 * POST /wallet/standard/register — client derive CIP-1852 rồi đăng-ký (API.md §7).
 *
 * Issue #47/#45: proof-of-ownership BẮT BUỘC. Client ký challenge canonical
 *   "PHOENIXKEY_WALLET_STANDARD_REGISTER:" + userDid + ":" + fixedAddress + ":" + nonce
 * bằng PAYMENT key của `fixedAddress`; server verify Ed25519 + Blake2b224(pubkey)
 * == payment credential. Thiếu 3 trường dưới → 400 (code 9800). Interceptor tự
 * đổi camelCase → snake_case (payment_public_key_hex/signature/nonce).
 */
export interface StandardWalletRegisterRequest {
  fixedAddress: string;        // account 0 base (bắt buộc)
  activeAddress?: string;      // account N base
  stakeAddress?: string;       // stake credential role 2
  paymentPublicKeyHex: string; // Ed25519 pubkey (64 hex) của payment key fixedAddress
  signature: string;           // Ed25519 raw (128 hex) ký challenge
  nonce: string;               // hex ≥16 byte (≥32 hex), dùng-1-lần, TTL 5 phút
}

/**
 * Rút gọn WalletAllResponse về địa-chỉ + số dư để HIỂN THỊ. Một nguồn chuẩn cho mọi
 * màn (Account, PhoenixWallet, SDK) — ưu tiên ví Standard (user tự kiểm-soát), fallback
 * Phoenix custody. Ví rỗng → address null + số dư 0 (KHÔNG bịa).
 */
export function summarizeWalletAll(all: WalletAllResponse): {
  address: string | null;
  lovelace: number;
  lamp: number;
  carp: number;
  magicAvailable: number;
  magicAccrued: number;
} {
  const standard = all.wallets.find(w => w.kind === 'standard');
  const phoenix = all.wallets.find(w => w.kind === 'phoenix');
  const primary = standard ?? phoenix ?? null;
  const b = primary?.balances ?? { lovelace: 0, lamp: 0, carp: 0 };
  return {
    address: primary?.addresses.active ?? primary?.addresses.fixed ?? null,
    // lovelace + lamp trả ĐƠN-VỊ-CON THÔ (lovelace, oildrop) — cả hai decimals=6.
    // Nơi hiển thị chia 1e6 (fmtAda / fmtLamp). KHÔNG chia ở đây để giữ số nguyên chính-xác.
    lovelace: b.lovelace,
    lamp: b.lamp,
    carp: b.carp,
    magicAvailable: all.magic.available,
    magicAccrued: all.magic.accrued,
  };
}

// [GỠ] MagicClaimResponse + wallet.claimMagic đã xoá: /wallet/magic/claim nay trả
// 410 Gone (1324 MAGIC_CLAIM_DEPRECATED, API.md §Wallet). MAGIC là số KẾ-TOÁN trong
// Vault (sinh từ LAMP, tiêu cho dịch-vụ), KHÔNG mint ra ví → không có bước "claim".
// Đọc số MAGIC hiện tại qua GET /wallet/{did}/all → `magic`. ĐỪNG thêm lại endpoint claim.

/**
 * Nguồn gốc khoá. Khoá sinh trong Android Keystore/TEE → SECURE_ENCLAVE.
 */
export type KeyOrigin = 'SECURE_ENCLAVE' | 'IMPORTED_BIP39' | 'DERIVED_CHILD';

/**
 * Request xoay khoá owner (POST /keys/rotate — spec §11).
 *
 * Hợp đồng ký (đối chiếu backend KeyServiceImpl.ROTATE_PREFIX):
 *   message = "PHOENIXKEY_ROTATE:" + newPublicKeyHex + ":" + nonce   (UTF-8)
 *   oldKeySignature = DER-encoded ECDSA (SHA256withECDSA, secp256r1) của
 *   message đó, ký bằng KHOÁ CŨ. Chứng minh người gọi sở hữu private key cũ.
 *
 * Nonce do client tự sinh (mỗi lần một giá trị mới, dùng 1 lần); backend chỉ
 * chống trùng trong 5 phút — KHÔNG có endpoint cấp nonce.
 */
export interface KeyRotateRequest {
  userDid: string;
  newPublicKeyHex: string;
  keyOrigin: KeyOrigin;
  nonce: string;
  oldKeySignature: string;
}

export interface KeyRotationResponse {
  txHash: string;
  keyId: string;
}

export interface IdentityStatusResponse {
  status: 'ACTIVE' | 'RECOVERING' | 'MIGRATED';
  currentControllerPkh: string;
  sequence: number;
  recoveryDeadline?: number;
}

export class PhoenixKeyApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'PhoenixKeyApiError';
  }
}

const SESSION_TOKEN_KEY = 'phoenixkey_session_token';

// Export để cổng runtime (config/runtimeGateBootstrap) dùng CHUNG một nguồn host,
// không khai lại chuỗi mặc định ở nơi thứ hai (tránh lệch khi đổi host).
export const baseURL =
  (PHOENIXKEY_API_URL as string | undefined) ??
  'https://api.phoenixkey.me/api/v1';

const client: AxiosInstance = axios.create({
  baseURL,
  timeout: 90_000,
  headers: { 'Content-Type': 'application/json' },
});

// Xuất ra để bài kiểm chạy đúng bộ chuyển đổi THẬT, không phải một bản chép lại —
// bản chép lại sẽ trôi khỏi bản thật đúng vào lúc cần nó nhất.
export const toSnakeCase = (s: string): string =>
  s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());

export const toCamelCase = (s: string): string =>
  s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

const transformKeys = (
  value: unknown,
  rename: (key: string) => string,
): unknown => {
  if (Array.isArray(value)) return value.map(v => transformKeys(v, rename));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[rename(k)] = transformKeys(v, rename);
    }
    return out;
  }
  return value;
};

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const needsAuth = (config as AxiosRequestConfig & { needsAuth?: boolean }).needsAuth;
  if (needsAuth) {
    const token = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  if (config.data) {
    config.data = transformKeys(config.data, toSnakeCase);
  }
  return config;
});

/**
 * Hàm đúc lại thẻ phiên, do `phoenixSessionService` đăng ký lúc nạp module.
 *
 * ── Vì sao TIÊM chứ không nhập thẳng ────────────────────────────────────────
 * `phoenixSessionService` đã nhập từ tệp này (`phoenixKeyApi`, `setSessionToken`,
 * `getSessionToken`, `PhoenixKeyApiError`). Nhập chiều ngược lại là một vòng
 * nhập, và ở Metro vòng nhập không báo lỗi — nó cho ra `undefined` tại thời điểm
 * nạp module. Tức đường tự chữa sẽ chết câm đúng ở ca nó cần chạy.
 */
type SessionRefresher = () => Promise<string | null>;
let refreshSession: SessionRefresher | null = null;

/** Gọi MỘT lần lúc nạp `phoenixSessionService`. */
export function registerSessionRefresher(fn: SessionRefresher): void {
  refreshSession = fn;
}

/** Đánh dấu lượt gọi đã thử đúc thẻ một lần rồi — không thử vòng hai. */
type RetriableConfig = InternalAxiosRequestConfig & {
  needsAuth?: boolean;
  __sessionRetried?: boolean;
};

client.interceptors.response.use(response => {
  if (response.data) {
    response.data = transformKeys(response.data, toCamelCase);
  }
  return response;
});

/**
 * Gắn đường tự chữa 401 vào MỘT client axios bất kỳ.
 *
 * ── Vì sao là hàm dùng chung, không phải đoạn mã chép ra bốn chỗ ───────────
 * Thẻ phiên nằm chung một khoá kho (`phoenixkey_session_token`) cho **bốn**
 * nhà tiêu thụ: tệp này, `orgMint-api`, `phoenixWallet-api` và lối `fetch` thô
 * trong `cardanoTxService`. Cả bốn gắn `Bearer` y hệt nhau, nhưng tới trước bản
 * này chỉ tệp này có nhánh 401. Nên cùng một thẻ chết cho ra hai hành vi khác
 * nhau tuỳ người dùng bấm vào màn nào: màn Danh tính tự hồi, màn Ví tổ chức và
 * màn Ví chuỗi thì kẹt vĩnh viễn ở `Unauthorized — Missing Bearer token (mã
 * 1304)` với một nút "Thử lại" không bao giờ đổi được kết quả, vì nó chỉ phát
 * lại đúng lượt gọi cũ bằng đúng cái thẻ cũ.
 *
 * ── Ca hỏng nhánh này sinh ra để chặn ──────────────────────────────────────
 * Thẻ phiên PhoenixKey sống 1 giờ. `ensurePhoenixSession` trả thẳng thẻ đã lưu
 * ra mà KHÔNG hỏi hạn (`phoenixSessionService.ts:126-130`), và nó chỉ được gọi
 * đúng một lần mỗi phiên đăng nhập (`navigation/index.tsx:1562`).
 *
 * Hệ quả đo được: hai người thử đăng nhập lúc 7h rồi đi ruộng; 8h05 thẻ hết
 * hạn; từ đó `/wallet/{did}/all`, `/wallet/{did}/utxos`, `/devices/register`,
 * `/seed/export-request`, `/guardians/*`, `/keys/*` đều 401. Màn Ví hiện ba dấu
 * "—", kéo xuống làm mới y hệt, tắt app mở lại y hệt — vì thẻ chết vẫn nằm
 * trong kho và vẫn được trả ra. Lối thoát duy nhất là đăng xuất rồi đăng nhập
 * lại, và không câu nào trên màn gợi ý điều đó.
 *
 * Đường tự chữa từng tồn tại nhưng chỉ ở MỘT nhà tiêu thụ —
 * `proofchatAuthBridge.ts:187-190`. Ai không mở ProofChat thì không bao giờ
 * chạm tới nó. Đặt ở tầng chặn là đặt vào chỗ mọi cửa đều đi qua.
 *
 * ── Ba ràng buộc, mỗi cái chặn một ca hỏng khác nhau ───────────────────────
 * 1. CHỈ lượt gọi khai `needsAuth`. Cửa công khai trả 401 là chuyện của máy
 *    chủ, không phải thẻ sai — đúc lại ở đó là bật hộp sinh trắc hỏi một câu
 *    vô nghĩa với người chỉ đang quét mã trên thùng hàng.
 * 2. ĐÚNG MỘT lần mỗi lượt gọi (`__sessionRetried`). Thẻ mới mà vẫn 401 nghĩa
 *    là máy chủ từ chối vì lý do khác; thử tiếp là vòng lặp vô hạn có kèm hộp
 *    vân tay.
 * 3. KHÔNG áp cho 403. Ở các cửa ví, 403 nghĩa là `caller_did != path_did` —
 *    ký lại bằng chính khoá đó cho ra đúng kết quả cũ. (Khác `proofchatAuthBridge`,
 *    nơi 403 mang nghĩa khác nên nó gộp hai mã là đúng với nó.)
 *
 * Chưa ai đăng ký hàm đúc thì nhánh này ném nguyên lỗi cũ ra — đúng hành vi
 * trước bản này, không xấu thêm.
 *
 * ⚠ Phải gọi SAU khi client đã đăng ký interceptor phản hồi thành công của
 * riêng nó (đổi khoá sang camelCase), vì axios chạy theo thứ tự đăng ký.
 */
export function attachSessionRefresh(target: AxiosInstance): void {
  target.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status !== 401 || !config?.needsAuth || config.__sessionRetried || !refreshSession) {
      throw error;
    }

    config.__sessionRetried = true;
    const fresh = await refreshSessionOnce();
    if (!fresh) throw error;
    return target.request(config);
  });
}

attachSessionRefresh(client);

/**
 * Đúc lại thẻ phiên MỘT lượt, cho nhà tiêu thụ KHÔNG đi qua axios.
 *
 * `cardanoTxService.rawGet` gọi thẳng `fetch` (cố ý: nó phải giữ nguyên khoá
 * snake_case của JSON Cardano, không cho interceptor đổi sang camelCase), nên
 * `attachSessionRefresh` không với tới nó. Xuất hàm này để lối đó dùng CHUNG
 * lớp gộp `inflightRefresh` — nếu nó tự đúc riêng thì màn Ví lại có hai hộp
 * sinh trắc song song, đúng cái mà lớp gộp sinh ra để chặn.
 */
export const remintSessionOnce = (): Promise<string | null> =>
  refreshSession ? refreshSessionOnce() : Promise.resolve(null);

/**
 * Gộp mọi lượt đúc thẻ đang bay làm MỘT — nếu không thì mỗi lượt gọi hỏng là một
 * hộp sinh trắc.
 *
 * ⚠ Khoá chống chạy trùng của `ensurePhoenixSession` KHÔNG che được ca này:
 * `phoenixSessionService.ts:111` viết `if (!opts.force && inflightSession)`, tức
 * `force: true` **cố ý** đi vòng qua khoá đó — đúng như nó phải thế, vì `force`
 * sinh ra để ép đúc thẻ mới khi thẻ cũ hỏng. Mà nhánh 401 thì bắt buộc dùng
 * `force`: không có nó, `ensurePhoenixSession` trả lại đúng cái thẻ chết vừa bị
 * máy chủ từ chối.
 *
 * Hệ quả nếu bỏ lớp gộp này: màn Ví phát nhiều lượt gọi song song
 * (`/wallet/{did}/all`, `/utxos`, `/params`…), tất cả 401 cùng lúc, mỗi lượt một
 * hộp Face ID. Người dùng bấm Huỷ ở hộp thứ ba và không bao giờ gỡ được.
 */
let inflightRefresh: Promise<string | null> | null = null;

/**
 * NGHỈ SAU MỘT LẦN ĐÚC HỎNG — lớp gộp ở trên KHÔNG che được ca này.
 *
 * `inflightRefresh` chỉ gộp các lượt đúc chạy CHỒNG NHAU. Lượt đúc hỏng xong là
 * nó tự xoá, nên lượt gọi 401 TIẾP THEO — người dùng bấm "Thử lại", một màn khác
 * vừa gắn, một `useEffect` chạy lại — mở một lượt đúc MỚI, và mỗi lượt đúc là
 * một hộp sinh trắc chặn toàn màn hình.
 *
 * Đo từ thực địa 2026-09-12 (bản dựng 99, quay màn hình): sau khi máy chủ từ
 * chối dựng phiên, hộp Face ID bật lại ở giây thứ 19 · 23 · 26 · 30 · 38 — năm
 * lần trong hai mươi giây, lần nào cũng quét xong rồi vẫn hiện y câu lỗi cũ.
 * Người dùng mô tả đúng cái nhìn thấy: *"không thoát ra được, không điều khiển
 * các chức năng"*. Không phải app treo — là một chuỗi hộp hệ thống nối đuôi nhau.
 *
 * Máy chủ từ chối một lượt đúc thì lượt sau bằng ĐÚNG khoá đó cho ĐÚNG câu trả
 * lời đó. Nghỉ một phút không làm mất gì, và nó đổi một vòng lặp không lối ra
 * thành một câu lỗi đứng yên đọc được.
 */
const MINT_COOLDOWN_MS = 60_000;
let mintCooldownUntil = 0;

/**
 * Số hiệu THẾ của danh tính, cùng cơ chế và cùng lý do với `loginGeneration`
 * trong `orilifeDidAuth.ts` — đọc khối chú thích ở đó để khỏi chép lại.
 *
 * Ghi ở đây đúng một điều riêng: van này bị bỏ quên lâu hơn van kia. Van đăng
 * nhập OriLife có hai chỗ gọi mở; van đúc thẻ PhoenixKey thì `clearSessionMint-
 * Cooldown` được viết ra rồi **không nơi nào gọi** — tức người đăng xuất xong
 * đăng nhập bằng danh tính khác vẫn gánh nguyên đồng hồ nghỉ của người trước, và
 * không màn nào nói vì sao. Cùng hình dạng với `clearSessionToken` ở
 * `store/userSlice.ts` (viết sẵn, nối vào đúng một đường, đường đăng xuất bỏ
 * trống) — hàm có, đường không có.
 */
let mintGeneration = 0;

/** Cho phép đúc lại ngay — dùng khi người dùng vừa tự xác thực lại. */
export function clearSessionMintCooldown(): void {
  mintGeneration += 1;
  mintCooldownUntil = 0;
  inflightRefresh = null;
}

/** Còn bao nhiêu mili-giây nữa mới được đúc lại; 0 nghĩa là đúc được ngay. */
export const sessionMintCooldownLeft = (): number =>
  Math.max(0, mintCooldownUntil - Date.now());

function refreshSessionOnce(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;
  if (Date.now() < mintCooldownUntil) return Promise.resolve(null);
  // Chốt thế NGAY lúc dựng lượt, trước mọi `await` — xem `mintGeneration`.
  const generationAtStart = mintGeneration;
  const run = (async () => {
    // KHÔNG xoá thẻ đang lưu trước khi có thẻ mới. `ensurePhoenixSession({force:true})`
    // đã bỏ qua thẻ đã lưu rồi, nên lệnh xoá ở đây không giúp gì cho lượt đúc — nó
    // chỉ bảo đảm rằng một lượt đúc HỎNG để máy lại **không còn thẻ nào**, tức mọi
    // lượt gọi sau đó chắc chắn 401 kể cả khi thẻ cũ vẫn còn sống và cái 401 ban
    // đầu đến từ chuyện khác.
    const fresh = refreshSession ? await refreshSession() : null;
    // Van đã mở giữa chừng ⟹ lượt này nói về danh tính CŨ. Trả thẻ cho người đã
    // gọi, nhưng thôi đặt đồng hồ nghỉ lên danh tính mới. Xem `mintGeneration`.
    if (generationAtStart === mintGeneration) {
      mintCooldownUntil = fresh ? 0 : Date.now() + MINT_COOLDOWN_MS;
    }
    return fresh;
  })();
  inflightRefresh = run;
  run.finally(() => {
    if (inflightRefresh === run) inflightRefresh = null;
  });
  return run;
}

async function unwrap<T>(
  promise: Promise<{ data: { code: number; message: string; result?: T } }>,
): Promise<T> {
  try {
    const res = await promise;
    if (res.data.code !== 1000) {
      throw new PhoenixKeyApiError(res.data.code, 200, res.data.message);
    }
    const result = res.data.result;
    if (result === undefined) {
      throw new PhoenixKeyApiError(-1, 200, 'Empty response body');
    }
    return result;
  } catch (err) {
    if (err instanceof PhoenixKeyApiError) throw err;
    const axiosErr = err as AxiosError<{ code: number; message: string }>;
    if (axiosErr.response?.data) {
      throw new PhoenixKeyApiError(
        axiosErr.response.data.code ?? -1,
        axiosErr.response.status,
        axiosErr.response.data.message ?? axiosErr.message,
      );
    }
    throw new PhoenixKeyApiError(-1, 0, axiosErr.message ?? 'Network error');
  }
}

/**
 * unwrap cho endpoint trả VOID (chỉ envelope { code, message }, KHÔNG có `result`).
 * `/wallet/standard/register` là loại này — trả code 1000 rỗng khi OK. Dùng `unwrap`
 * thường sẽ ném nhầm "Empty response body" dù server nhận thành công (HTTP 200).
 * Chỉ kiểm code === 1000; lỗi HTTP (4xx/5xx) vẫn ném PhoenixKeyApiError có httpStatus.
 */
async function unwrapVoid(
  promise: Promise<{ data: { code: number; message: string } }>,
): Promise<void> {
  try {
    const res = await promise;
    if (res.data.code !== 1000) {
      throw new PhoenixKeyApiError(res.data.code, 200, res.data.message);
    }
  } catch (err) {
    if (err instanceof PhoenixKeyApiError) throw err;
    const axiosErr = err as AxiosError<{ code: number; message: string }>;
    if (axiosErr.response?.data) {
      throw new PhoenixKeyApiError(
        axiosErr.response.data.code ?? -1,
        axiosErr.response.status,
        axiosErr.response.data.message ?? axiosErr.message,
      );
    }
    throw new PhoenixKeyApiError(-1, 0, axiosErr.message ?? 'Network error');
  }
}

export const setSessionToken = (token: string): Promise<void> =>
  AsyncStorage.setItem(SESSION_TOKEN_KEY, token);

export const clearSessionToken = (): Promise<void> =>
  AsyncStorage.removeItem(SESSION_TOKEN_KEY);

export const getSessionToken = (): Promise<string | null> =>
  AsyncStorage.getItem(SESSION_TOKEN_KEY);

/**
 * `GET /identity/health` — sức khoẻ danh tính CỦA NGƯỜI ĐANG ĐĂNG NHẬP.
 *
 * Đối chiếu `IdentityController.java:573-578` + `IdentityServiceImpl.java:246-262`
 * + `IdentityHealthResponse.java`. Per-user, đòi phiên (`userDidFromBearer`), trả
 * `403` khi token hỏng — KHÔNG nhận `did` làm tham số.
 *
 * `requiresDeviceCosign` được TÍNH thật (`IdentityServiceImpl.java:258-259`:
 * `hasDeviceKey && keyVersion >= 1`), không phải hằng — bản ghi này sửa lại một
 * phép đo cũ nói ngược.
 */
export interface IdentityHealthResponse {
  seedExported: boolean;
  exportedAt?: string | null;
  activeKeyCount: number;
  /** Số guardian ĐANG hoạt động (`guardianRepository.countActiveByUserId`). */
  guardianCount: number;
  /** `device_pkh != null` — máy này đã bật khoá thiết bị chưa. */
  hasDeviceKey: boolean;
  requiresDeviceCosign: boolean;
}

export const identity = {
  /**
   * Sức khoẻ danh tính của chính người đang đăng nhập. Đòi phiên.
   *
   * Dùng để nhận ra diện `hasDeviceKey && guardianCount === 0` — người đã bật khoá
   * thiết bị mà chưa có ai khôi phục hộ. Xem `services/deviceKeyRisk.ts`.
   */
  getHealth: () =>
    unwrap<IdentityHealthResponse>(
      client.get('/identity/health', { needsAuth: true } as AxiosRequestConfig),
    ),

  register: (body: RegisterRequest) =>
    unwrap<RegisterResponse>(client.post('/identity/register', body)),

  /**
   * Owner-key MỚI NHẤT của một DID — **kể cả khi đã thu hồi**.
   *
   * ⚠ Máy chủ khai thẳng: *"Trả owner-key MỚI NHẤT theo `created_at`, KHÔNG lọc
   * trạng thái… Phải đọc `status` và chỉ chấp nhận `active`"*
   * (`IdentityController.java:422-433`). Trước bản này kiểu trả về ở đây KHÔNG có
   * `status`, nên chỗ gọi không đọc được thứ máy chủ bảo phải đọc.
   *
   * Và nó chỉ trả MỘT khoá. Từ khi `POST /keys/authorize` cho một DID giữ nhiều
   * khoá, "so khoá máy với khoá mà cửa này trả về" là phép so SAI: khoá của máy
   * có thể hợp lệ mà vẫn khác khoá mới nhất. Muốn hỏi "khoá này có được uỷ quyền
   * không" thì dùng `keyAuthorized` bên dưới — nó trả lời đúng câu đó.
   */
  getPubkey: (did: string) =>
    unwrap<{ publicKeyHex: string; keyRole: string; status?: string }>(
      client.get(`/identity/${encodeURIComponent(did)}/pubkey`),
    ),

  /**
   * `GET /identity/{did}/key-authorized?key=&at=` — khoá X có được uỷ quyền cho
   * DID tại thời điểm `at` không. CÔNG KHAI.
   *
   * Đây là câu hỏi mà trước nay app phải SUY: nó so khoá máy với khoá duy nhất mà
   * `/pubkey` trả về, trong khi cửa đó không lọc trạng thái và chỉ trả một khoá.
   * Cửa này trả lời thẳng, không suy.
   *
   * ⚠ CẢ HAI tham số đều BẮT BUỘC phía máy chủ (`@RequestParam`, không có giá trị
   * mặc định) — thiếu `at` là 400, không phải "lấy hiện tại".
   *
   * `rotationGapViolation` giai đoạn 1 LUÔN null (máy chủ chưa theo dõi epoch);
   * hợp đồng ghi rõ "consumer nhận null coi như OK". Đừng đọc null thành cảnh báo.
   */
  /**
   * `GET /identity/{did}/op-seq` — mốc chống phát lại của DID.
   *
   * `opSeq` là bộ đếm đơn điệu mỗi DID (bảng `did_op_watermarks`, không bao giờ
   * dọn). Năm luồng GHI đều đòi nó VÀ buộc nó vào chuỗi ký: `/keys/authorize`,
   * `/keys/revoke`, `/keys/rotate`, `/guardians/add`, `/guardians/remove`. Máy
   * chủ nhận iff `opSeq > lastOpSeq`, sai thì 409 `OP_SEQ_REPLAY`.
   *
   * Trước bản này app KHÔNG có đường nào đọc mốc — `grep opSeq src/` ra 0, và đó
   * chính là lý do `guardianService` nằm đó kèm lời khai "chữ ký gần chắc không
   * còn verify được": nửa đầu (đóng khung theo độ dài) app dựng được, nửa sau
   * (field `opSeq`) thì không có nguồn. Mốc chỉ lộ qua CÂU CHỮ trong thông báo
   * lỗi, tức phải gửi sai một lần rồi đọc lỗi để biết phải gửi gì.
   *
   * Public — không đòi Bearer, cùng mức lộ với `/pubkey` và `/status`. Đúng thế:
   * năm luồng ghi kia cũng không có phiên vào lúc cần `opSeq`, chúng xác thực
   * bằng chữ ký ECDSA chứ không bằng phiếu.
   *
   * ⚠ Đọc SÁT lúc gửi, đừng nhớ lại. Hai thao tác liên tiếp trên cùng một DID thì
   * cái thứ hai phải dùng mốc ĐÃ nâng; giữ lại giá trị cũ là tự chuốc 409.
   */
  opSeq: (did: string) =>
    unwrap<{ lastOpSeq: number; nextOpSeq: number; maxOpSeq: number }>(
      client.get(`/identity/${encodeURIComponent(did)}/op-seq`),
    ),

  keyAuthorized: (did: string, publicKeyHex: string, at: Date = new Date()) =>
    unwrap<{ authorized: boolean; rotationGapViolation: boolean | null }>(
      client.get(`/identity/${encodeURIComponent(did)}/key-authorized`, {
        params: { key: publicKeyHex, at: at.toISOString() },
      }),
    ),

  /**
   * `GET /identity/{did}/active?at=` — DID có hiệu lực tại `at` không. CÔNG KHAI.
   *
   * BA trạng thái, không phải hai (`IdentityPointInTimeDtos.java`):
   *   neverExisted=true            DID chưa từng đăng ký
   *   active=true                  còn ≥1 khoá hiệu lực; `revokedAt` luôn null
   *   active=false & !neverExisted mọi khoá đã thu hồi; `revokedAt` = lần gần nhất
   *
   * Gộp "chưa từng có" với "đã bị thu hồi" là mất đúng phần thông tin người dùng
   * cần để biết phải làm gì tiếp.
   */
  isActiveAt: (did: string, at: Date = new Date()) =>
    unwrap<{ active: boolean; revokedAt: string | null; neverExisted: boolean }>(
      client.get(`/identity/${encodeURIComponent(did)}/active`, {
        params: { at: at.toISOString() },
      }),
    ),

  getStatus: (did: string) =>
    unwrap<IdentityStatusResponse>(
      client.get(`/identity/${encodeURIComponent(did)}/status`),
    ),

  getDocument: (did: string) =>
    unwrap<Record<string, unknown>>(
      client.get(`/identity/${encodeURIComponent(did)}/document`),
    ),

  setUsername: (username: string) =>
    unwrap<{ username: string; cooldownUntil?: number }>(
      client.put(
        '/identity/username',
        { username },
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),

  resolveUsername: (username: string) =>
    unwrap<{ userDid: string; username: string }>(
      client.get(`/identity/by-username/${encodeURIComponent(username)}`),
    ),

  /**
   * Tra DID theo KHOÁ phần cứng — cứu ca CÀI LẠI APP (PhoenixKey-Database #192,
   * `IdentityLookupDtos.java`). CÔNG KHAI, KHÔNG cần Bearer.
   *
   * Cài lại app / xoá dữ liệu app ⟹ DID mất khỏi storage nhưng khoá HW còn nguyên
   * trong Secure Enclave. Đây là chiều NGƯỢC của `getPubkey` (did→khoá).
   *
   * VÌ SAO BẮT KÝ chứ không làm cửa GET trần — DTO nói thẳng: `GET /{did}/pubkey`
   * đã công khai chiều xuôi, mở chiều ngược mà không ký thì "ai nhặt được một khoá
   * công khai ở đâu đó cũng tra ra danh tính chủ". Bắt ký challenge ⟹ chỉ người
   * ĐANG GIỮ khoá tra được — mà giữ khoá nghĩa là mở được bằng vân tay/khuôn mặt.
   *
   * ⚠ MIỀN KÝ RIÊNG: `PHOENIXKEY_LOOKUP:` — KHÁC `PHOENIXKEY_GENESIS:` của
   * `register`. DTO đặt nhãn riêng để chống ký nhầm miền; chép nhầm tiền tố thì
   * máy chủ trả 404 và không có gì nói cho biết vì sao.
   *
   * ⚠ MỌI ca hỏng đều 404 — chữ ký sai · khoá chưa đăng ký · khoá đã thu hồi, ba
   * thứ trả về giống hệt nhau, CỐ Ý để không rò rỉ. Nên chỗ gọi KHÔNG được dịch
   * 404 thành một nguyên nhân cụ thể nào.
   */
  lookupByKey: (body: { publicKeyHex: string; nonce: string; signatureHex: string }) =>
    unwrap<{ userDid: string }>(client.post('/identity/lookup', body)),

  /**
   * Khôi-phục mất-máy (Mode B): gắn HW_Key MỚI (thiết bị này) vào DID đã có, sau khi
   * user khôi phục Master_KEK từ 24 từ. `signature` = Ed25519 của TAAD_Key khôi phục
   * ký lên challenge (bind userDid+newHwPublicKeyHex+nonce). Backend verify với
   * controller pubkey on-chain (không đổi khi restore) rồi chèn HW_Key mới.
   * BE: POST /identity/recover-device (body snake_case — interceptor tự đổi).
   */
  recoverDevice: (body: {
    userDid: string;
    newHwPublicKeyHex: string;
    taadPublicKeyHex: string;
    signature: string;
    nonce: string;
  }) =>
    unwrap<{ userDid: string; txHash?: string }>(
      client.post('/identity/recover-device', {
        ...body,
        keyOrigin: 'SECURE_ENCLAVE',
      }),
    ),

  /**
   * Bật 2-Factor DeviceKey (Issue #28, BE 07-23). Mobile sinh Ed25519 NGẪU NHIÊN
   * (KHÔNG derive từ Seed), ký challenge canonical:
   *   "PHOENIXKEY_DEVICE_KEY_OPTIN:" + userDid + ":" + devicePublicKeyHex + ":" + nonce
   * bằng CHÍNH device private key đó (proof-of-ownership). Backend hash blake2b_224 →
   * device_pkh (field 14 TAADDatum), bump key_version. Path `did` bị ép khớp `sub` của
   * session token → cần Bearer session. Idempotent theo pubkey.
   */
  deviceKeyOptIn: (
    did: string,
    body: { devicePublicKeyHex: string; signature: string; nonce: string },
  ) =>
    unwrap<{ devicePkh?: string; keyVersion?: number }>(
      client.post(
        `/identity/${encodeURIComponent(did)}/device-key`,
        body,
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),
};

export const session = {
  /**
   * Tạo session (API.md §3). Body rỗng OK — backend KHÔNG bind domain lúc init
   * (domain chỉ tham-gia chuỗi ký ở approve, không bị validate allowlist). Nhờ vậy
   * MOBILE tự init được để self-pairing lấy session_token cho chính nó.
   */
  init: () =>
    unwrap<{ sessionId: string; challenge: string; tempToken: string; expiresAt: number }>(
      client.post('/auth/session/init', {}),
    ),

  /**
   * Approve — mint session/linked token. ⚠️ Response HTTP CHỈ trả { status,
   * linkedDeviceToken } (backend SessionApproveResponse) — `sessionToken` KHÔNG
   * có trong response này (chỉ đẩy qua SSE cho web). Muốn lấy sessionToken →
   * gọi getStatus() sau approve (self-pairing dùng cách này).
   */
  approve: (sessionId: string, body: ApproveSessionRequest) =>
    unwrap<{ status: string; sessionToken?: string; linkedDeviceToken?: string }>(
      client.post(`/auth/session/${encodeURIComponent(sessionId)}/approve`, body),
    ),

  /**
   * Trạng-thái session. Khi `approved` → trả kèm `sessionToken`. Cần Bearer `temp`
   * (tempToken từ init) — truyền vào để gắn header trực-tiếp (KHÔNG dùng session
   * token đã lưu, vì lúc self-pair chưa có).
   */
  getStatus: (sessionId: string, tempToken?: string) =>
    unwrap<SessionStatusResponse>(
      client.get(
        `/auth/session/${encodeURIComponent(sessionId)}/status`,
        tempToken
          ? ({ headers: { Authorization: `Bearer ${tempToken}` } } as AxiosRequestConfig)
          : undefined,
      ),
    ),
};

export const signRequest = {
  get: (requestId: string) =>
    unwrap<SignRequestPayload>(
      client.get(`/sign/request/${encodeURIComponent(requestId)}`),
    ),

  approve: (requestId: string, body: ApproveSignRequest) =>
    unwrap<{ status: string }>(
      client.post(`/sign/${encodeURIComponent(requestId)}/approve`, body),
    ),

  cancel: (requestId: string) =>
    unwrap<void>(
      client.post(`/sign/${encodeURIComponent(requestId)}/cancel`, undefined, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),
};

export const devices = {
  register: (body: DeviceRegisterRequest) =>
    unwrap<{ deviceId: string }>(
      client.post('/devices/register', body, { needsAuth: true } as AxiosRequestConfig),
    ),
};

export const seed = {
  exportRequest: (sessionId: string, displayText?: string) =>
    unwrap<{ requestId: string; expiresAt: number }>(
      client.post(
        '/seed/export-request',
        { sessionId, displayText },
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),
};

export const wallet = {
  register: (walletAddress: string) =>
    unwrap<void>(
      client.post(
        '/wallet/register',
        { walletAddress },
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),

  /**
   * Ví GỘP: Phoenix custody + Standard CIP-1852 + MAGIC vault trong 1 lần gọi.
   * Đây là nguồn ĐÚNG cho địa-chỉ + số dư (thay getBalance đã deprecated).
   */
  getAll: (userDid: string) =>
    unwrap<WalletAllResponse>(
      // Bearer session BẮT BUỘC: production ép auth cho /wallet/{did}/all (trả 1304
      // "Missing Bearer token" nếu thiếu) → refreshWallet reject → chainWallets rỗng →
      // ví Phượng Hoàng KHÔNG hiện (chỉ còn ví cơ bản từ localAddr fallback). Thiếu cờ
      // này là lý do phoenix mất dù server đã có địa-chỉ custody cho DID.
      client.get(`/wallet/${encodeURIComponent(userDid)}/all`, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  /**
   * Đăng-ký ví Standard (CIP-1852) — client derive địa-chỉ rồi gửi lên. Idempotent:
   * gọi lại cập-nhật active/stake, KHÔNG cho đổi fixed. Bearer session.
   */
  standardRegister: (body: StandardWalletRegisterRequest) =>
    unwrapVoid(
      client.post('/wallet/standard/register', body, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  /**
   * ⚠ CẦN Bearer. PR #116 (merged 2026-07-31) siết đường này: đòi Bearer **và**
   * `caller_did == path_did`. Thiếu `needsAuth` thì interceptor không gắn token
   * (`:247-255`) ⇒ 401. Hiện chưa có nơi nào gọi nên chưa nổ, nhưng để nguyên là gài
   * bẫy cho người dựng màn ví sau này.
   */
  getStandard: (userDid: string) =>
    unwrap<{
      addresses: { fixed?: string; active?: string; stake?: string };
      balances: { lovelace: number; lamp: number; carp: number };
    }>(
      client.get(`/wallet/standard/${encodeURIComponent(userDid)}`, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  /**
   * Relay giao-dịch Cardano ĐÃ KÝ (Issue #74, BE 07-23). Mô-hình MỚI: CLIENT tự
   * dựng + ký CBOR (Rust enclave), backend chỉ relay STATELESS lên Blockfrost và
   * dedupe theo tx_hash. Thay cho luồng did_payment build-tx cũ (BE KHÔNG làm).
   * `signedTxCbor` = hex CBOR của tx đã witness đầy đủ.
   */
  txSubmit: (signedTxCbor: string) =>
    unwrap<{ cardanoTxHash: string }>(
      client.post(
        '/wallet/tx/submit',
        { signedTxCbor },
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),

  /** @deprecated API.md §7 — dùng getAll. Backend ép MAGIC = 0, có thể thiếu address. */
  getBalance: (userDid: string) =>
    unwrap<BalanceResponse>(
      client.get(`/wallet/${encodeURIComponent(userDid)}/balance`),
    ),

  // [GỠ] claimMagic: /wallet/magic/claim → 410 Gone (deprecated). MAGIC không claim
  // được (kế-toán Vault, đọc qua /wallet/{did}/all → magic). Xem chú-thích ở khối
  // MagicClaimResponse phía trên. KHÔNG thêm lại.
};

// ── Pool / Staking (SPO) — Issue #74, BE 07-23 (relay Blockfrost + cache) ────
// Shape khớp ĐÚNG DTO backend: PoolListResponse / PoolDetailResponse /
// DelegationStatusResponse (dto/pool/PoolDtos.java). Số dư stake là CHUỖI thập
// phân (u64 Cardano — mainnet whales vượt Number.MAX_SAFE_INTEGER).
export interface PoolDetail {
  poolId: string;
  hex: string;
  blocksMinted: number;
  liveStake: string;
  liveSaturation: number;
  activeStake: string;
  declaredPledge: string;
  livePledge: string;
  /** Fraction 0..1 (không phải %). */
  marginCost: number;
  /** Lovelace cố định mỗi epoch (chuỗi thập phân). */
  fixedCost: string;
  rewardAccount: string;
  ticker?: string | null;
  name?: string | null;
  description?: string | null;
  homepage?: string | null;
}
export interface DelegationStatus {
  stakeAddress: string;
  /** Account đã activate (staking key register) chưa. inactive → active=false, poolId=null (KHÔNG 404). */
  active: boolean;
  /** Pool đang delegate; null nếu chưa. */
  poolId: string | null;
  controlledAmount: string;
  rewardsSum: string;
  withdrawableAmount: string;
}
export const pools = {
  /** Danh sách pool_id (100/trang, trang bắt đầu từ 1). BE: GET /pools?page&count (public). */
  list: (params?: { page?: number; count?: number }) =>
    unwrap<{ poolIds: string[]; page: number; count: number }>(
      client.get('/pools', { params } as AxiosRequestConfig),
    ),

  /** Chi tiết 1 pool + metadata off-chain. BE: GET /pools/{poolId} (public). */
  get: (poolId: string) =>
    unwrap<PoolDetail>(client.get(`/pools/${encodeURIComponent(poolId)}`)),
};
export const delegation = {
  /** Trạng-thái delegation của 1 stake address. BE: GET /delegation/status/{stake} (public). */
  status: (stakeAddress: string) =>
    unwrap<DelegationStatus>(
      client.get(`/delegation/status/${encodeURIComponent(stakeAddress)}`),
    ),
};

/** Một thiết bị/khoá như máy chủ hiển thị cho chính chủ (`DeviceListResponse.DeviceView`). */
export interface DeviceView {
  keyId: string;
  deviceName: string | null;
  keyRole: string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** Đúng cái máy đang cầm. Máy chủ tự chấm theo `keyId` trong phiên. */
  current: boolean;
}

/**
 * Vòng đời thiết bị tự-quản — `/keys/devices/**` (`DeviceLifecycleController`, V47).
 *
 * ⚠ KHÁC HẲN `keys.rotate`/`keys.revoke` bên dưới. `KeyController` là đường
 * Zero-Trust: mọi thao tác kèm chữ ký ECDSA của owner-key, vì nó gọi được từ NGOÀI
 * một phiên. Ba đường ở đây CHỈ dùng phiên, KHÔNG có tham số chữ ký nào — tiện ích
 * tự-quản nhẹ cho người đã đăng nhập, không thay thế lớp kia.
 *
 * ⚠ CẢ BA đòi vai **OWNER** (`EndpointRolePolicy.OWNER_ONLY`, mẫu `/keys/devices/**`).
 * Phiên vai `manager` gọi vào nhận **403 `KEY_ROLE_FORBIDDEN`** trước khi chạm
 * service. Máy chủ nêu lý do: quản cả đội thiết bị là quyền của CHỦ DID — một khoá
 * `manager` bị lộ không được dùng để do thám, cũng không được dùng để tự chống lại
 * việc bị chủ đá ra.
 *
 * DID luôn lấy từ claim trong JWT, KHÔNG từ path/query/body — không có cách nào
 * truyền DID người khác vào để đọc lịch sử đăng nhập của họ.
 */
export const deviceLifecycle = {
  /**
   * Danh sách thiết bị đang giữ khoá của chính mình.
   *
   * KHÔNG trả `publicKeyHex` — cố ý. Máy chủ ghi lý do: kho đã có một lỗ nghiêm
   * trọng vì một giá trị vừa công khai vừa là khoá tra cứu (Issue #192 —
   * `findByPublicKeyHexAndStatus` dùng pubkey làm khoá khôi phục DID). Nên đừng
   * đi tìm pubkey ở đây để đối chiếu; muốn hỏi "khoá này còn hiệu lực không" thì
   * dùng `identity.keyAuthorized`.
   */
  list: () =>
    unwrap<{ devices: DeviceView[] }>(
      client.get('/keys/devices', { needsAuth: true } as AxiosRequestConfig),
    ),

  /** Đặt tên máy. Máy chủ ép `@NotBlank` + tối đa 100 ký tự → cắt/chặn TRƯỚC khi gửi. */
  rename: (keyId: string, deviceName: string) =>
    unwrap<DeviceView>(
      client.post(
        `/keys/devices/${encodeURIComponent(keyId)}/name`,
        { deviceName },
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),

  /**
   * Đá một máy ra. Trả rỗng khi xong.
   *
   * Đây là đường DUY NHẤT đá được một máy mà KHÔNG đụng các máy còn lại — khác
   * `identity.recoverDevice` (24 từ), vốn thu hồi TOÀN BỘ khoá owner cùng lúc.
   */
  revoke: (keyId: string) =>
    unwrapVoid(
      client.post(
        `/keys/devices/${encodeURIComponent(keyId)}/revoke`,
        {},
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),
};

/** Vai khoá. ⚠ `owner` KHÔNG đi qua `/keys/authorize` — xem chú thích ở đó. */
export type KeyRole = 'owner' | 'manager' | 'viewer';

export interface KeyAuthorizeRequest {
  userDid: string;
  publicKeyHex: string;
  keyOrigin: KeyOrigin;
  keyRole: KeyRole;
  nonce: string;
  opSeq: number;
  addedBySignature: string;
}

export const keys = {
  /**
   * Xoay khoá owner — thay khoá cũ bằng khoá mới qua Cardano updateDID.
   * Backend verify oldKeySignature bằng khoá cũ rồi build + submit tx.
   * Trả về txHash + keyId của khoá mới.
   */
  /**
   * `POST /keys/authorize` — gắn thêm một khoá thiết bị vào DID đã có.
   *
   * Đây là đường cho MỘT PhoenixKey dùng ở NHIỀU app. App A (đang giữ owner-key)
   * ký uỷ quyền cho khoá của app B; khoá app B vào `authorized_keys` với
   * `status='active'`, rồi app B tự đăng nhập được — `approveByMobile` chỉ lọc
   * `status`, KHÔNG lọc vai:
   *
   * ```java
   * authorizedKeyRepository.existsByUserDidAndPublicKeyHexAndStatus(
   *         request.userDid(), request.publicKeyHex(), "active");
   * ```
   *
   * ⚠ Cửa này PUBLIC ở tầng Spring (không Bearer). Zero-Trust nằm ở tầng service:
   * `KeyServiceImpl.authorize()` bắt buộc DID phải sẵn có một owner-key ACTIVE
   * (`findOwnerByUserDid`, thiếu là 404) và verify `addedBySignature` bằng chính
   * khoá đó TRƯỚC khi ghi. App B không tự thêm mình vào được — app A phải ký.
   *
   * ⚠ `keyRole: 'owner'` bị chặn thẳng: luật V36 cho tối đa MỘT owner-key active
   * mỗi DID (`OWNER_KEY_ALREADY_ACTIVE`). Đổi owner đi qua `/keys/rotate`.
   *
   * ⚠ Vai `manager` HÔM NAY không hạn chế gì ngoài vòng đời khoá. Phiếu phiên
   * không mang claim vai (`mintSessionToken` chỉ có `userDid` + loại + hạn +
   * `tokenEpoch`), và không cửa nghiệp vụ nào đọc `keyRole` — nên tầng dưới không
   * phân biệt được vai kể cả khi muốn. Giao diện ĐỪNG hứa với người dùng rằng máy
   * này "quyền hạn chế"; hôm nay nói vậy là nói sai. Ngoại lệ duy nhất đã đo:
   * `/keys/devices/**` là `OWNER_ONLY`, phiên `manager` gọi vào nhận 403.
   *
   * Mã lỗi: 403 chữ ký sai · 404 DID chưa có owner-key active · 409
   * `OP_SEQ_REPLAY` mốc lùi/bằng · 400 `KEY_FORMAT_INVALID` / `ENUM_INVALID_VALUE`.
   *
   * Dùng `keyAuthorizeService.authorizeDeviceKey` thay vì gọi thẳng — chuỗi ký
   * canonical dễ dựng sai, và dựng sai thì chỉ hiện ra bằng một con 403.
   */
  authorize: (body: KeyAuthorizeRequest) =>
    unwrapVoid(client.post('/keys/authorize', body)),

  rotate: (body: KeyRotateRequest) =>
    unwrap<KeyRotationResponse>(client.post('/keys/rotate', body)),

  /**
   * Khoá/vô-hiệu-hoá 1 khoá của DID (mất trộm/nghi lộ). Đối-chiếu KeyRevokeRequest.java:
   * body { userDid, publicKeyHex, nonce, signature } (interceptor → snake_case). Backend
   * validate+consume nonce (TTL 5'), soft-revoke key. `signature` bắt buộc NotBlank —
   * hiện BE chưa verify (chưa có REVOKE_PREFIX) nhưng client vẫn ký owner-key trên
   * canonical "PHOENIXKEY_REVOKE:"+userDid+":"+publicKeyHex+":"+nonce cho forward-compat.
   * Response VOID (envelope rỗng khi OK).
   */
  revoke: (body: {
    userDid: string;
    publicKeyHex: string;
    nonce: string;
    signature: string;
  }) =>
    unwrapVoid(client.post('/keys/revoke', body)),
};

// ── Activation (mua gói → LAMP + ADA vào ví; app KHÔNG tự mint) ───────
// Contract khớp client Dart tham chiếu (Enclave/lib/bridge/phoenix_api.dart).
export const activation = {
  /** Chi tiết + trạng thái 1 lượt activation. BE: GET /activation/:id/status (Bearer). */
  getStatus: (activationId: string) =>
    unwrap<Record<string, unknown>>(
      client.get(`/activation/${encodeURIComponent(activationId)}/status`, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  /** Nộp tx đã ký (CBOR hex) cho lượt activation. BE: POST /activation/:id/submit-tx. */
  submitTx: (activationId: string, signedTxCbor: string) =>
    unwrap<{ cardanoTxHash: string }>(
      client.post(
        `/activation/${encodeURIComponent(activationId)}/submit-tx`,
        { signedTxCbor },
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),
};

// ── Wakeme / Activation Vault 2-pha — WakemeController ────────────────────────
// Đối-chiếu `ActivationVaultDtos.java`. Luồng: build (BE trả unsigned tx) → CLIENT ký
// → submit. vault/pot là ĐỌC.
//
// ĐƯỜNG DẪN: `/wakeme/*`, KHÔNG phải `/activation/*`. `WakemeController.java:43-44`
// nói rõ `ActivationVaultController` là bí danh cũ và sẽ bị XOÁ sau khi mobile
// chuyển sang đường mới. Hai đường hiện dùng chung một service, đổi không phá gì.
//
// ⚠️ CHỮ HOA LIỀN CHỮ HOA — ĐỌC TRƯỚC KHI "SỬA CHÍNH TẢ" MẤY TÊN DƯỚI ĐÂY.
// Jackson `SNAKE_CASE` gặp hai chữ hoa liền nhau thì chỉ chèn MỘT gạch dưới:
//   `initialDLamp` → `initial_dlamp` ·  `currentDLamp` → `current_dlamp`
// còn `toCamelCase` của app (`:226-230`) chỉ viết hoa chữ ngay sau gạch dưới:
//   `initial_dlamp` → `initialDlamp` ·  `current_dlamp` → `currentDlamp`
// Nên tên ĐÚNG ở phía này là `initialDlamp`/`currentDlamp` (chữ l thường).
// Khai `initialDLamp` như bản cũ thì trường VĨNH VIỄN `undefined` và KHÔNG BÁO LỖI —
// cùng đúng một họ với sáu tên trường lệch của OriLife. Có test khoá ở
// `wakemeService.test.ts`; sửa tên ở đây là test đỏ ngay.
export interface WakemeBuildResponse {
  unsignedTxCbor: string;
  /** = controller_pkh (băm TAAD_Key), KHÔNG phải khoá ví. Xem `getLamp()`. */
  requiredSignerKeyHash: string;
  vaultAddress: string;
  dLamp: number;
  /** CHUỖI trên dây (`@JsonSerialize(ToStringSerializer)` — `ActivationVaultDtos.java:65`). */
  dOildrop: string;
  /** CHUỖI, và đơn vị là OILDROP dù tên là `_lamp` (`ActivationVaultServiceImpl.java:199-202`). */
  potBalanceLamp: string;
  vestStartSlot: number;
  phase1Days: number;
  ttlSlot: number;
}
export interface WakemeSubmitResponse {
  cardanoTxHash: string;
  /**
   * ⚠️ LUÔN RỖNG ở đường thật (`ActivationVaultServiceImpl.java:145-147`) — đây là
   * chủ ý của BE, không phải lỗi. Giữ `vaultAddress` lấy từ bước build mà dùng.
   */
  vaultAddress: string;
  status: string;
}
export interface WakemeActivityGate {
  usedThisPeriod?: boolean | null;
  graceActive?: boolean | null;
  graceDaysLeft?: number | null;
  epochUsed?: boolean | null;
  atRiskLamp?: number | null;
  minMagicConsume?: string | null;
  warning?: string | null;
  note?: string | null;
}
export interface VaultStatusResponse {
  did: string;
  vaultAddress: string;
  /** 1 = Daily | 2 = Epochy. */
  phase: number;
  daysElapsed: number;
  phase1DaysTotal: number;
  daysToPhase2: number;
  /** `initial_dlamp` trên dây — l THƯỜNG. Xem khối chú thích ở trên. */
  initialDlamp: number;
  conditionalLamp: number;
  reclaimedToPotLamp: number;
  vestStartSlot: number;
  magicGeneratedTotal?: string | null;
  magicBalanceCurrent?: string | null;
  vestedUnlocked?: number | null;
  idleEpochsP2?: number | null;
  lastTickDay?: number | null;
  lastTickEpoch?: number | null;
  p2Epoch?: number | null;
  activityGate?: WakemeActivityGate | null;
  // KHÔNG khai `[k: string]: unknown`. Chỉ mục đó nuốt mọi tên lạ — kể cả tên SAI —
  // nên nó chính là thứ đã che lỗi `initialDLamp` suốt thời gian qua.
}
export interface PotStatusResponse {
  /** CHUỖI trên dây, đơn vị oildrop. */
  potBalanceLamp: string;
  /** `current_dlamp` — l THƯỜNG. Đây là con số "bạn sẽ nhận bao nhiêu LAMP". */
  currentDlamp: number;
  dCap: number;
  scale: number;
  saturated: boolean;
}
export const wakeme = {
  /** Bước 1: BE build unsigned tx nạp D LAMP vào vault user. Cần Bearer. */
  build: (body: { walletAddress: string; didCommit?: string }) =>
    unwrap<WakemeBuildResponse>(
      client.post('/wakeme/build', body, { needsAuth: true } as AxiosRequestConfig),
    ),
  /** Bước 2: submit tx đã ký. Cần Bearer. */
  submit: (signedTxCbor: string) =>
    unwrap<WakemeSubmitResponse>(
      client.post('/wakeme/submit', { signedTxCbor }, { needsAuth: true } as AxiosRequestConfig),
    ),
  /**
   * Bảng vault 2-pha (công khai).
   * ⚠️ Ném 501 KHÔNG ĐIỀU KIỆN ở đường thật (`ActivationVaultServiceImpl.java:158-159`).
   */
  vaultStatus: (did: string) =>
    unwrap<VaultStatusResponse>(client.get(`/wakeme/vault/${encodeURIComponent(did)}`)),
  /**
   * Sức khoẻ pot (công khai, KHÔNG cần Bearer). Endpoint DUY NHẤT của cụm này
   * chạy thật hôm nay (`ActivationVaultServiceImpl.java:199-202`, đọc Blockfrost).
   * Ném 9501/501 khi máy chủ chưa set biến môi trường activation-vault (`:192-195`).
   * Vì vậy nó cũng là ĐẦU DÒ "tính năng đã mở chưa" — xem `wakemeService.isFeatureOpen`.
   */
  pot: () => unwrap<PotStatusResponse>(client.get('/wakeme/pot')),
};

// ── Guardian (khôi-phục xã-hội) ───────────────────────────────────────────────
// POST /guardians/add · /guardians/remove, body { user_did, guardian_did, nonce,
// proof_signature }. proof_signature = owner-key ECDSA (SHA256withECDSA).
//
// ⛔ Chú thích cũ ở đây ghi "ĐÃ đối-chiếu … KHỚP backend" cho khuôn nối `':'`. Máy
// chủ đổi khuôn đó từ V30 (đóng khung theo độ dài + thêm field `opSeq`) — nhà
// PhoenixKey báo 2026-08-27, dẫn `GuardianServiceImpl.java:84`. Lý do vì sao chưa
// tự sửa một phía, và mức chắc của lời khai này, nằm ở đầu `guardianService.ts`.
// Đừng chép lại nhãn "KHỚP backend" vào đây khi chưa tự chạy được luồng thật.
export interface GuardianMutateRequest {
  userDid: string;
  guardianDid: string;
  nonce: string;
  proofSignature: string;
  /**
   * Moc chong phat lai — BAT BUOC tu V30 (`@NotNull @Positive` trong
   * `GuardianAddRequest`). Thieu la 400 truoc khi cham toi chu ky.
   */
  opSeq: number;
}
export const guardians = {
  /**
   * `GET /guardians/{userDid}` — danh sách người bảo hộ CỦA CHÍNH NGƯỜI GỌI.
   *
   * Máy chủ chặn tra DID khác: `if (!auth.userDid().equals(userDid)) → UNAUTHORIZED`
   * (`GuardianController`). Nên `userDid` truyền vào phải là DID của phiên hiện tại.
   *
   * Trước bản này app THÊM và XOÁ được người bảo hộ nhưng KHÔNG liệt kê được — đặt
   * xong rồi thì không có cách nào xem lại mình đã đặt ai.
   *
   * `count` máy chủ tách riêng có chủ đích ("client hiển thị ngay không phải count
   * list"), và `status` trong từng dòng LUÔN là 'active' vì bảng chỉ trả active.
   */
  list: (userDid: string) =>
    unwrap<{
      guardians: Array<{ guardianDid: string; status: string; createdAt: string }>;
      count: number;
    }>(
      client.get(`/guardians/${encodeURIComponent(userDid)}`, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  add: (body: GuardianMutateRequest) =>
    unwrap<void>(
      client.post('/guardians/add', body, { needsAuth: true } as AxiosRequestConfig),
    ),

  remove: (body: GuardianMutateRequest) =>
    unwrap<void>(
      client.post('/guardians/remove', body, { needsAuth: true } as AxiosRequestConfig),
    ),
};

// ── Nhật-ký hoạt-động (ký/xoay khoá/export) ──────────────────────────
// Đối-chiếu ActivityLogController + ActivityLogPage.java (Issue #78 #2):
// GET /activity-logs?limit(1-100,def 20)&cursor(opaque base64)&filter(action)&range(7d|30d|all).
// result = { logs: ActivityLogItem[], nextCursor: string|null }. nextCursor=null → hết.
export interface ActivityLogItem {
  id: string;
  /** 8 ký tự đầu UUID (Zero-PII). */
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
  /** ISO createdAt. */
  createdAt: string;
}
export interface ActivityLogPage {
  logs: ActivityLogItem[];
  /** Truyền vào ?cursor= của trang kế; null = hết data. */
  nextCursor: string | null;
}
export const activityLogs = {
  list: (params?: { limit?: number; cursor?: string; filter?: string; range?: '7d' | '30d' | 'all' }) =>
    unwrap<ActivityLogPage>(
      client.get('/activity-logs', {
        needsAuth: true,
        params,
      } as AxiosRequestConfig),
    ),
};

export const phoenixKeyApi = {
  identity,
  session,
  signRequest,
  devices,
  seed,
  wallet,
  pools,
  delegation,
  wakeme,
  keys,
  /** Vòng đời thiết bị tự-quản (`/keys/devices/**`) — KHÁC `keys`, xem chú thích ở đó. */
  deviceLifecycle,
  activation,
  guardians,
  activityLogs,
  setSessionToken,
  clearSessionToken,
  getSessionToken,
  baseURL,
};
