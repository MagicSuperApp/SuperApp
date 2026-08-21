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

client.interceptors.response.use(response => {
  if (response.data) {
    response.data = transformKeys(response.data, toCamelCase);
  }
  return response;
});

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

export const identity = {
  register: (body: RegisterRequest) =>
    unwrap<RegisterResponse>(client.post('/identity/register', body)),

  getPubkey: (did: string) =>
    unwrap<{ publicKeyHex: string; keyRole: string }>(
      client.get(`/identity/${encodeURIComponent(did)}/pubkey`),
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

export const keys = {
  /**
   * Xoay khoá owner — thay khoá cũ bằng khoá mới qua Cardano updateDID.
   * Backend verify oldKeySignature bằng khoá cũ rồi build + submit tx.
   * Trả về txHash + keyId của khoá mới.
   */
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
/** Bí danh cũ — giữ một đợt cho nơi gọi cũ. Dùng `wakeme` cho mã mới. */
export const getlamp = wakeme;

// ── Guardian (khôi-phục xã-hội) — ĐÃ đối-chiếu GuardianServiceImpl.java ────────
// POST /guardians/add · /guardians/remove, body { user_did, guardian_did, nonce,
// proof_signature }. proof_signature = owner-key ECDSA (SHA256withECDSA) ký canonical
// "PHOENIXKEY_GUARDIAN_ADD:"+userDid+":"+guardianDid+":"+nonce (remove: _REMOVE:). Chuỗi
// dựng trong guardianService.buildProof — KHỚP backend. Nonce TTL 5' (validateAndConsume).
export interface GuardianMutateRequest {
  userDid: string;
  guardianDid: string;
  nonce: string;
  proofSignature: string;
}
export const guardians = {
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
  /** Bí danh cũ của `wakeme` — giữ một đợt cho nơi gọi cũ. */
  getlamp,
  keys,
  activation,
  guardians,
  activityLogs,
  setSessionToken,
  clearSessionToken,
  getSessionToken,
  baseURL,
};
