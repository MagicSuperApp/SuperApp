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

export interface MagicClaimResponse {
  claimId: string;
  amountMagic: number;
  cardanoTxHash: string;
  status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
}

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

const baseURL =
  (PHOENIXKEY_API_URL as string | undefined) ??
  'https://api.phoenixkey.me/api/v1';

const client: AxiosInstance = axios.create({
  baseURL,
  timeout: 90_000,
  headers: { 'Content-Type': 'application/json' },
});

const toSnakeCase = (s: string): string =>
  s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());

const toCamelCase = (s: string): string =>
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
};

export const session = {
  approve: (sessionId: string, body: ApproveSessionRequest) =>
    unwrap<{ status: string; linkedDeviceToken?: string }>(
      client.post(`/auth/session/${encodeURIComponent(sessionId)}/approve`, body),
    ),

  getStatus: (sessionId: string) =>
    unwrap<SessionStatusResponse>(
      client.get(`/auth/session/${encodeURIComponent(sessionId)}/status`),
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

  getBalance: (userDid: string) =>
    unwrap<BalanceResponse>(
      client.get(`/wallet/${encodeURIComponent(userDid)}/balance`),
    ),

  claimMagic: () =>
    unwrap<MagicClaimResponse>(
      client.post('/wallet/magic/claim', undefined, {
        needsAuth: true,
      } as AxiosRequestConfig),
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
};

export const phoenixKeyApi = {
  identity,
  session,
  signRequest,
  devices,
  seed,
  wallet,
  keys,
  setSessionToken,
  clearSessionToken,
  getSessionToken,
  baseURL,
};
