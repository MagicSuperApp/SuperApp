/**
 * Ví Phượng hoàng (did_payment) — REST client BUILD/SUBMIT giao dịch.
 *
 * ⚠️ TRẠNG-THÁI: backend did_payment = **Phase 2, CHƯA deploy** (team PhoenixKey
 * đang triển khai, 2026-06-23). Toàn bộ endpoint + shape dưới đây là DỰ-KIẾN, gắn
 * cờ [CHỜ team PhoenixKey chốt]. Khi backend deploy: đối-chiếu shape thật, sửa ở
 * ĐÚNG file này (interface + path), phần SDK/UI không phải đổi.
 *
 * Tái-dùng cùng axios envelope của phoenixKey-api.ts: { code, message, result },
 * code 1000 == OK; request data snake_case, response camelCase; needsAuth gắn
 * Bearer session_token. KHÔNG tạo client mới — gọi lại helpers đã export.
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
import { PhoenixKeyApiError } from './phoenixKey-api';

// ── Request / Response shapes [CHỜ team PhoenixKey chốt] ──────────────────────

export interface BuildTxRequest {
  userDid: string;
  intent: {
    type: string;
    body: Record<string, unknown>;
  };
}

export interface BuildTxResult {
  /** Định danh yêu cầu ký (dùng lại khi submit). */
  requestId: string;
  /** Text người-đọc-được (BACKEND sinh) để user duyệt trước khi ký. */
  displayText: string;
  /** Mạng tx được build cho ('preprod' | 'preview' | 'mainnet'). */
  network: string;
  /** Digest hex client cần ký (KHÔNG phải toàn bộ CBOR tx). */
  signingDigestHex: string;
  /** Tx chưa-ký (CBOR hex) — giữ để hiển thị/đối chiếu nếu cần, không bắt buộc. */
  unsignedTxCbor?: string;
  /** Phí ước-tính (lovelace). */
  feeLovelace?: number;
  /** Mốc hết-hạn (epoch ms). Client từ chối ký sau mốc này. */
  expiresAt: number;
}

export interface SubmitTxRequest {
  requestId: string;
  /** Chữ-ký DER ECDSA (secp256r1) của signingDigestHex, ký bằng khoá owner. */
  signatureHex: string;
  /** Khoá công khai owner (uncompressed hex) để backend xác thực. */
  publicKeyHex: string;
}

export interface SubmitTxResult {
  txHash: string;
  status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
}

// ── Axios client (cùng cấu hình phoenixKey-api.ts) ────────────────────────────

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

export const phoenixWalletApi = {
  /**
   * [CHỜ team PhoenixKey chốt] POST /wallet/did-payment/build-tx
   * Backend build tx did_payment cho intent → trả digest + displayText + network.
   */
  buildTx: (body: BuildTxRequest) =>
    unwrap<BuildTxResult>(
      client.post('/wallet/did-payment/build-tx', body, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  /**
   * [CHỜ team PhoenixKey chốt] POST /wallet/did-payment/submit
   * Backend ráp witness từ chữ-ký rồi submit lên Cardano → trả txHash.
   */
  submitTx: (body: SubmitTxRequest) =>
    unwrap<SubmitTxResult>(
      client.post('/wallet/did-payment/submit', body, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  baseURL,
};
