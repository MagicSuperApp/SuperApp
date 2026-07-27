/**
 * Ví tổ chức — REST client tạo OrgDID + mint LAMP bằng OrgDID.
 *
 * ⚠️ TRẠNG-THÁI (đối-chiếu PhoenixKey-API-Catalog.md + SuperApp-Reply-lamp-mint-orgdid.md, 2026-07-02):
 *   - `POST /identity/org/create` 🟢 live (single-owner; m-of-n founding = PR #40).
 *   - `POST /identity/org/{orgDid}/mint-lamp` → intent LAMP_MINT → /sign/request →
 *     trả {request_id} + SSE "signed". 🟢 shape đứng; CAP/AUTHORITY/REDEEMER còn
 *     CHỜ LAMP hợp nhất design lên main (đừng hardcode — xem TODO bên dưới).
 *   - `POST /identity/org/{orgDid}/mint-lamp/submit-tx {request_id, signed_tx_cbor}`
 *     → {tx_hash}. CBOR = dựng+ký ở Enclave NATIVE (Thư) — client chỉ chuyển tiếp.
 *
 * RÀNG BUỘC UX SỐNG CÒN: mint LAMP = vào KHO Distribution (dest_hash), KHÔNG ra
 * thẳng ví user. `recipient_address` KHÔNG áp cho bước mint → KHÔNG có trong
 * MintLampRequest. Ví nhận ở bước claim/vesting-release RIÊNG sau (endpoint CHƯA
 * cấp — xem orgMintService.ts / màn Mint bước 2).
 *
 * Tái-dùng cùng axios envelope của phoenixKey-api.ts: { code, message, result },
 * code 1000 == OK; request data snake_case, response camelCase; needsAuth gắn
 * Bearer session_token. KHÔNG tạo client mới — cấu hình y hệt để đồng nhất.
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

// ── Request / Response shapes ─────────────────────────────────────────────────

/**
 * Tạo OrgDID single-owner. m-of-n founding (nhiều owner + threshold) = PR #40,
 * để CHỖ: khi merge, thêm `owners[]` + `threshold` vào đây.
 */
/**
 * Body `POST /identity/org/create` — ĐỐI CHIẾU BACKEND THẬT (curl prod 2026-07-24
 * + đọc `OrgCreateRequest.java`). Trước đây app gửi `{owner_did, org_name}` →
 * backend trả 400: "name is required; ownerSignature is required; nonce is required".
 * Đã sửa cho khớp. Wire = snake_case (thực nghiệm: gửi snake_case thì bind được,
 * camelCase thì backend báo thiếu field).
 */
export interface CreateOrgRequest {
  /** PersonDID đứng tên — controller của org. Regex BE: `did:phoenix:<13>:<64 hex>`. */
  owner_did: string;
  /** Tên tổ chức, 1–100 ký tự. KHÔNG cần duy nhất (cùng tên khác nước là hợp lệ). */
  name: string;
  /** Mã số đăng ký kinh doanh (MST) — tuỳ chọn, ≤50 ký tự. */
  registration_number?: string;
  /** Chữ ký HW_Key của owner trên chuỗi challenge canonical (hex DER ECDSA P-256). */
  owner_signature: string;
  /** Nonce chống phát lại, 1–64 ký tự. Backend tiêu thụ 1 lần theo (owner_did, nonce). */
  nonce: string;
  // TODO(PR#40 m-of-n): luồng founding riêng = POST /identity/org/founding.
}

export interface CreateOrgResult {
  /** OrgDID mới tạo (did:phoenix:... hoặc did:cardano:<net>:...). */
  org_did: string;
  /** Tx tạo org (nếu backend trả). */
  tx_hash?: string;
  org_name?: string;
}

/** Một OrgDID user điều-khiển (dùng cho màn danh sách, nếu backend có list). */
export interface OrgSummary {
  org_did: string;
  org_name?: string;
  /** Vai người gọi trong org: owner | manager | viewer. */
  role?: string;
  /** Ngưỡng m-of-n (single = 1). */
  threshold?: number;
}

/**
 * Yêu cầu mint LAMP bằng OrgDID (bước 1 — vào KHO Distribution).
 *
 * KHÔNG có recipient_address (mint KHÔNG ra ví — ràng buộc sống còn).
 * KHÔNG có cap/authority/redeemer: CHỜ LAMP hợp nhất design lên main. Nếu design
 * canonical đòi thêm tham số (vd dist_authority, token_tag) → thêm vào đây SAU khi
 * LAMP chốt, KHÔNG đoán trước.
 */
export interface MintLampRequest {
  /** Số LAMP mint vào kho (đơn vị nhỏ nhất — theo backend quy ước). */
  amount: string;
  // TODO(chờ LAMP): cap/authority/redeemer — vd dist_authority?, token_tag?
}

export interface MintLampResult {
  /** ID yêu cầu ký intent LAMP_MINT — dùng lại khi submit + để mở SSE chờ signed. */
  request_id: string;
  /** Mạng mint được build cho ('preprod' | 'preview' | 'mainnet'). */
  network?: string;
  /** Số chữ ký cần gom (m-of-n threshold; single = 1). */
  threshold?: number;
  /** Mốc hết-hạn yêu cầu ký (epoch ms) nếu backend trả. */
  expires_at?: number;
}

export interface SubmitMintTxRequest {
  request_id: string;
  /** CBOR tx ĐÃ ký (hex) — dựng + ký ở Enclave NATIVE (Thư), client chuyển tiếp. */
  signed_tx_cbor: string;
}

export interface SubmitMintTxResult {
  tx_hash: string;
  status?: 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
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

// NOTE: response interceptor đổi key sang camelCase, nên result nhận về ở đây là
// camelCase. Các interface trên khai snake_case cho ĐÚNG shape WIRE (tài-liệu-hoá
// hợp-đồng API); tầng service (orgMintService.ts) map sang camel khi tiêu thụ —
// giống cách phoenixWallet-api.ts trả camel dù khai theo wire. Để nhất-quán với
// pattern có sẵn, ta ép kiểu qua unknown ở tầng gọi khi cần.

// ── SSE: chờ intent LAMP_MINT được ký ("signed") ──────────────────────────────

/** Sự-kiện SSE tối-thiểu app quan tâm khi chờ ký intent. */
export type MintSignEvent =
  | { type: 'signed'; signaturesCollected?: number; threshold?: number }
  | { type: 'pending'; signaturesCollected?: number; threshold?: number }
  | { type: 'cancelled' }
  | { type: 'expired' };

export interface WaitSignedHandle {
  abort: () => void;
}

/**
 * Mở luồng SSE chờ trạng-thái ký của yêu-cầu mint (mẫu SEED_EXPORT / /sign/request).
 *
 * Đọc dần qua XHR readyState 3/4 (fetch().body.getReader() chưa ổn trên RN 0.84 —
 * xem aladinChat.ts). Parse dòng `data:` → JSON. Khi type='signed' (m-of-n đã gom
 * đủ m chữ ký; single = đủ 1) → gọi onSigned rồi dừng.
 *
 * [CHỜ đối-chiếu shape SSE thật] — event name + field có thể khác; khi backend chốt,
 * sửa parseSseChunk ở ĐÚNG đây, tầng service/UI không phải đổi.
 */
export function waitMintSigned(
  requestId: string,
  handlers: {
    onSigned: (ev: Extract<MintSignEvent, { type: 'signed' }>) => void;
    onProgress?: (ev: MintSignEvent) => void;
    onError?: (err: Error) => void;
  },
): WaitSignedHandle {
  const xhr = new XMLHttpRequest();
  let lastIndex = 0;
  let aborted = false;
  let done = false;

  const url =
    `${baseURL}/sign/request/${encodeURIComponent(requestId)}/stream`;

  const finish = () => {
    done = true;
    try {
      xhr.abort();
    } catch {}
  };

  const handleEvent = (ev: MintSignEvent) => {
    handlers.onProgress?.(ev);
    if (ev.type === 'signed') {
      handlers.onSigned(ev);
      finish();
    } else if (ev.type === 'cancelled' || ev.type === 'expired') {
      handlers.onError?.(
        new Error(
          ev.type === 'cancelled'
            ? 'Yêu cầu ký đã bị huỷ.'
            : 'Yêu cầu ký đã hết hạn.',
        ),
      );
      finish();
    }
  };

  const parseSseChunk = (raw: string): void => {
    // SSE: các event tách nhau bằng dòng trống; mỗi event có ≥1 dòng `data:`.
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload) as Record<string, unknown>;
        const type = String(obj.type ?? obj.status ?? '').toLowerCase();
        const ev: MintSignEvent =
          type === 'signed' || type === 'approved'
            ? {
                type: 'signed',
                signaturesCollected: obj.signaturesCollected as number | undefined,
                threshold: obj.threshold as number | undefined,
              }
            : type === 'cancelled'
            ? { type: 'cancelled' }
            : type === 'expired'
            ? { type: 'expired' }
            : {
                type: 'pending',
                signaturesCollected: obj.signaturesCollected as number | undefined,
                threshold: obj.threshold as number | undefined,
              };
        handleEvent(ev);
        if (done) return;
      } catch {
        // Dòng data không phải JSON hợp lệ → bỏ qua (keep-alive/comment).
      }
    }
  };

  xhr.open('GET', url, true);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  // Gắn Bearer thủ công (XHR không đi qua axios interceptor).
  AsyncStorage.getItem(SESSION_TOKEN_KEY)
    .then(token => {
      if (aborted) return;
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      try {
        xhr.send();
      } catch (e: any) {
        handlers.onError?.(new Error(e?.message || 'Không mở được luồng chờ ký.'));
      }
    })
    .catch(() => {
      if (!aborted) {
        try {
          xhr.send();
        } catch {}
      }
    });

  xhr.onreadystatechange = () => {
    if (aborted || done) return;
    if (xhr.readyState === 3 || xhr.readyState === 4) {
      const text = xhr.responseText || '';
      if (text.length > lastIndex) {
        const delta = text.slice(lastIndex);
        lastIndex = text.length;
        parseSseChunk(delta);
      }
      if (xhr.readyState === 4 && !done) {
        if (xhr.status < 200 || xhr.status >= 300) {
          handlers.onError?.(
            new Error(`Luồng chờ ký lỗi HTTP ${xhr.status}.`),
          );
        } else {
          // Stream đóng mà chưa thấy 'signed' → coi như chưa đủ chữ ký.
          handlers.onError?.(
            new Error('Luồng chờ ký đóng trước khi gom đủ chữ ký.'),
          );
        }
      }
    }
  };

  xhr.onerror = () => {
    if (!aborted && !done) handlers.onError?.(new Error('Lỗi mạng khi chờ ký.'));
  };

  return {
    abort: () => {
      aborted = true;
      try {
        xhr.abort();
      } catch {}
    },
  };
}

// ── API surface ───────────────────────────────────────────────────────────────

export const orgMintApi = {
  /**
   * Tạo OrgDID single-owner. 🟢 live. (m-of-n founding = PR #40 — để chỗ.)
   */
  createOrg: (body: CreateOrgRequest) =>
    unwrap<CreateOrgResult>(
      client.post('/identity/org/create', body, {
        needsAuth: true,
      } as AxiosRequestConfig),
    ),

  /**
   * Danh sách OrgDID người gọi điều-khiển.
   * [CHỜ PhoenixKey xác nhận có endpoint list] — nếu chưa có, màn OrgDID rơi về
   * lưu local (xem orgMintService.listOrgs). Path dự-kiến, gắn cờ.
   */
  listOrgs: () =>
    unwrap<OrgSummary[]>(
      client.get('/identity/org', { needsAuth: true } as AxiosRequestConfig),
    ),

  /**
   * BƯỚC 1 mint: tạo intent LAMP_MINT → trả {request_id} (chờ SSE "signed").
   * Mint vào KHO Distribution, KHÔNG ra ví (không có recipient_address).
   * Cap/authority/redeemer CHỜ LAMP — KHÔNG hardcode.
   */
  mintLamp: (orgDid: string, body: MintLampRequest) =>
    unwrap<MintLampResult>(
      client.post(
        `/identity/org/${encodeURIComponent(orgDid)}/mint-lamp`,
        body,
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),

  /**
   * Submit CBOR đã ký (dựng+ký ở Enclave native — Thư). Backend submit lên chuỗi.
   */
  submitMintTx: (orgDid: string, body: SubmitMintTxRequest) =>
    unwrap<SubmitMintTxResult>(
      client.post(
        `/identity/org/${encodeURIComponent(orgDid)}/mint-lamp/submit-tx`,
        body,
        { needsAuth: true } as AxiosRequestConfig,
      ),
    ),

  waitMintSigned,
  baseURL,
};
