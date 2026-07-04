/**
 * proofchat-api.ts — Client ProofChat cho app vỏ Aladin (v2.0, TRỤC 3).
 *
 * PHẠM VI v2.0 (anh chốt): CHỈ "cầu nối auth" + đọc danh sách hội thoại.
 *   - Đổi session token PhoenixKey → phiên ProofChat thật (accessToken/refreshToken).
 *   - Đọc danh sách hội thoại của tài khoản.
 * KHÔNG gửi/nhận tin trong v2.0: BE ProofChat bắt mọi tin là envelope mã hoá MLS
 * (CreateMessageDto.variants[].encryptedContent @IsNotEmpty), mà MLS/LampNet RN
 * client chưa publish. Gửi/nhận tin thật để v2.1 khi crypto stack lên. KHÔNG nhét
 * plaintext vào field encryptedContent (phản giá trị E2E của ProofChat).
 *
 * Server: PROOFCHAT_API_URL (env). Envelope NestJS: { data, message, statusCode }.
 * Auth: Bearer accessToken cho endpoint cần auth (JwtAuthGuard).
 */
import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROOFCHAT_API_URL, PROOFCHAT_BACKEND_ENABLED } from '@env';

// ── Kiểu dữ liệu ─────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Hội thoại trả về từ BE (đọc thô — chưa giải mã nội dung tin). */
export interface RemoteConversation {
  id: string;
  title?: string;
  type?: string;
  visibility?: string;
  ownerId?: string;
  memberCount?: number;
  createdAt?: number | string;
}

export interface ListConversationsOptions {
  type?: string;
  skip?: number;
  take?: number;
}

/**
 * Tin nhắn thô từ BE — envelope E2EE. Server KHÔNG thấy plaintext (spec §4/§6):
 * chỉ trả ciphertext (variants[].encryptedContent). Giải mã do crypto stack (MLS)
 * đảm nhiệm ở v2.1; tầng này chỉ vận chuyển.
 */
export interface RemoteMessage {
  id: string;
  conversationId: string;
  senderId?: string; // PhoenixKey DID người gửi (KHÔNG dùng stakeAddress — spec §6)
  senderDid?: string;
  /** Nội dung đã mã hoá. Có thể ở variants[].encryptedContent hoặc field phẳng. */
  ciphertext?: string;
  encryptedContent?: string;
  createdAt?: number | string; // do client tạo, KHÔNG override (ký MerkleLeaf)
}

export class ProofChatApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProofChatApiError';
  }
}

// ── Feature flag (Vận hành độc lập) ──────────────────────────────────
// Mặc định OFF: chat tab vẫn chạy mock nếu BE chưa cấu hình / chết.
export const isProofChatBackendEnabled = (): boolean =>
  String(PROOFCHAT_BACKEND_ENABLED) === 'true' &&
  !!(PROOFCHAT_API_URL as string | undefined);

// ── Lưu token ────────────────────────────────────────────────────────

// LƯU Ý TOKEN AN TOÀN (spec §4): production PHẢI lưu token ở Keychain (iOS) /
// Keystore (Android) — KHÔNG localStorage. AsyncStorage KHÔNG phải localStorage
// (không đi qua WebView JS bridge công khai) nhưng cũng CHƯA mã hoá cứng bằng
// Keychain. Nâng cấp sang react-native-keychain là việc còn treo — xem BLOCKER
// trong PR (cần thư viện Keychain + review bảo mật). Interface get/set giữ nguyên
// nên đổi backend lưu trữ KHÔNG phá caller.
const ACCESS_TOKEN_KEY = 'proofchat_access_token';
const REFRESH_TOKEN_KEY = 'proofchat_refresh_token';
const DEVICE_ID_KEY = 'proofchat_device_id';

export const setTokens = async (t: AuthTokens): Promise<void> => {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, t.accessToken],
    [REFRESH_TOKEN_KEY, t.refreshToken],
  ]);
};

export const getAccessToken = (): Promise<string | null> =>
  AsyncStorage.getItem(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): Promise<string | null> =>
  AsyncStorage.getItem(REFRESH_TOKEN_KEY);

export const clearTokens = (): Promise<void> =>
  AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]).then(() => undefined);

// ── deviceId (1 UUID / thiết bị, persistent) ─────────────────────────
// Spec §6: deviceId cần khi lấy tin nhắn + build variants + đăng KeyPackage MLS.
// Tạo 1 lần khi cài (lần gọi đầu), lưu persistent. UUID v4 tự sinh — KHÔNG thêm
// dependency `uuid` (chưa có trong package.json). Math.random đủ cho định danh
// thiết bị (KHÔNG dùng cho khoá mật mã — khoá MLS do crypto stack sinh riêng).
const genUuidV4 = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

let deviceIdCache: string | null = null;

/** Lấy (hoặc tạo lần đầu) deviceId persistent của thiết bị. */
export const getDeviceId = async (): Promise<string> => {
  if (deviceIdCache) return deviceIdCache;
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    deviceIdCache = existing;
    return existing;
  }
  const fresh = genUuidV4();
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  deviceIdCache = fresh;
  return fresh;
};

// ── Axios setup ──────────────────────────────────────────────────────

const baseURL =
  (PROOFCHAT_API_URL as string | undefined) ?? 'http://localhost:3000';

const client: AxiosInstance = axios.create({
  baseURL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

type AuthableConfig = (AxiosRequestConfig | InternalAxiosRequestConfig) & {
  needsAuth?: boolean;
};

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if ((config as AuthableConfig).needsAuth) {
    const token = await getAccessToken();
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor: access token hết hạn (401) → refresh single-flight rồi
// retry 1 lần. Bỏ qua chính các endpoint /auth/* (tránh vòng lặp refresh).
type RetriableConfig = InternalAxiosRequestConfig & {
  needsAuth?: boolean;
  _retried?: boolean;
};

client.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/');
    if (status === 401 && original?.needsAuth && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      try {
        await refreshSingleFlight();
        return client.request(original); // request interceptor gắn token mới
      } catch {
        await clearTokens();
      }
    }
    return Promise.reject(error);
  },
);

/**
 * BE ProofChat dùng TransformInterceptor GLOBAL → mọi response thành công đều
 * bọc { data, message, statusCode, timestamp }. Bóc lấy `data` khi nhận diện
 * envelope (có `statusCode`); `data` có thể là [] / null hợp lệ và vẫn trả đúng.
 */
async function unwrap<T>(
  promise: Promise<{ data: { data?: T; statusCode?: number } | T }>,
): Promise<T> {
  try {
    const res = await promise;
    const body = res.data as Record<string, unknown>;
    const isEnvelope =
      body !== null && typeof body === 'object' && 'statusCode' in body && 'data' in body;
    return (isEnvelope ? (body as { data: T }).data : (body as T)) as T;
  } catch (err) {
    const axiosErr = err as AxiosError<{ message?: string }>;
    if (axiosErr.response) {
      const msg =
        axiosErr.response.data?.message ?? axiosErr.message ?? 'Request failed';
      throw new ProofChatApiError(axiosErr.response.status, msg);
    }
    throw new ProofChatApiError(0, axiosErr.message ?? 'Network error');
  }
}

// Refresh single-flight: nhiều request 401 song song chỉ kích hoạt 1 lần refresh
// (refresh token thường xoay vòng — gọi nhiều lần sẽ vô hiệu phiên).
let refreshInFlight: Promise<AuthTokens> | null = null;

const refreshTokens = async (): Promise<AuthTokens> => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new ProofChatApiError(0, 'Chưa có refresh token — cần đăng nhập lại');
  }
  const tokens = await unwrap<AuthTokens>(
    client.post('/auth/refresh', { refreshToken }),
  );
  await setTokens(tokens);
  return tokens;
};

const refreshSingleFlight = (): Promise<AuthTokens> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

// ── Auth (cầu nối PhoenixKey → ProofChat) ────────────────────────────

export const auth = {
  /**
   * Đổi session token PhoenixKey lấy phiên ProofChat. Lưu token vào AsyncStorage.
   * BE: POST /auth/phoenixkey/login { sessionToken } → { accessToken, refreshToken }.
   */
  phoenixKeyLogin: async (sessionToken: string): Promise<AuthTokens> => {
    const tokens = await unwrap<AuthTokens>(
      client.post('/auth/phoenixkey/login', { sessionToken }),
    );
    await setTokens(tokens);
    return tokens;
  },

  /** Làm mới access token bằng refresh token đã lưu (single-flight). */
  refresh: (): Promise<AuthTokens> => refreshSingleFlight(),

  logout: async (): Promise<void> => {
    try {
      await client.post('/auth/logout', {}, { needsAuth: true } as AuthableConfig);
    } finally {
      await clearTokens();
    }
  },
};

// ── Hội thoại (chỉ đọc cho v2.0) ─────────────────────────────────────

export const conversations = {
  /** Danh sách hội thoại của tài khoản. BE: GET /conversations (Bearer). */
  list: (opts: ListConversationsOptions = {}): Promise<RemoteConversation[]> =>
    unwrap<RemoteConversation[]>(
      client.get('/conversations', {
        needsAuth: true,
        params: {
          type: opts.type,
          skip: opts.skip,
          take: opts.take,
        },
      } as AuthableConfig),
    ),

  /** Danh sách ID hội thoại. BE: GET /conversations/ids (Bearer). */
  listIds: (): Promise<string[]> =>
    unwrap<string[]>(
      client.get('/conversations/ids', { needsAuth: true } as AuthableConfig),
    ),

  /** 1 hội thoại theo ID. BE: GET /conversations/:id (Bearer). */
  get: (id: string): Promise<RemoteConversation> =>
    unwrap<RemoteConversation>(
      client.get(`/conversations/${encodeURIComponent(id)}`, {
        needsAuth: true,
      } as AuthableConfig),
    ),

  /** Tạo hội thoại. BE: POST /conversations { type, participantIds, title?, proposalId? }. */
  create: (body: {
    type: string;
    participantIds: string[];
    title?: string;
    proposalId?: string;
  }): Promise<RemoteConversation> =>
    unwrap<RemoteConversation>(
      client.post('/conversations', body, { needsAuth: true } as AuthableConfig),
    ),

  /**
   * Tin nhắn (ciphertext E2EE) của 1 hội thoại. BE: GET /conversations/:id/messages
   * (Bearer) — query `deviceId` (chọn variant), `limit`/`offset` (phân trang).
   */
  getMessages: (
    conversationId: string,
    deviceId: string,
    opts: { take?: number; offset?: number } = {},
  ): Promise<RemoteMessage[]> =>
    unwrap<RemoteMessage[]>(
      client.get(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
        needsAuth: true,
        params: { deviceId, limit: opts.take, offset: opts.offset },
      } as AuthableConfig),
    ),
};

// ── MLS (bootstrap: KeyPackage + epoch-sync) ─────────────────────────
// Khớp D:\BE modules/mls (controller `mls`) + modules/mls/epoch-sync. Dùng cho
// proofchatService (lập nhóm, publish KeyPackage, đồng bộ epoch). Prefix baseURL
// đã gồm `/api` như các route hiện có.

/** 1 KeyPackage thành viên (BE KeyPackageResponse). */
export interface RemoteKeyPackage {
  stakeAddress: string;
  deviceId: string;
  keyPackage: string;
  ciphersuite: string;
  expiresAt: number | null;
  createdAt: number;
}

/** Trạng thái KeyPackage của tôi (BE KeyPackageStatusResponse). */
export interface KeyPackageStatus {
  exists: boolean;
  devices: Array<{ deviceId: string; expiresAt: number | null }>;
}

/** 1 bản ghi epoch-sync (BE MlsEpochSyncRecordDto). `mlsMessageType` không có ở BE
 * hiện tại — để optional; phân biệt welcome/commit theo trường tương ứng khác rỗng. */
export interface RemoteEpochRecord {
  id?: string;
  conversationId: string;
  epoch: number;
  commitMessage: string;
  welcomeMessage: string;
  ratchetTree: string | null;
  createdAt: number;
  createdBy: string;
  mlsMessageType?: 'application' | 'epoch_sync' | 'welcome';
}

export const mls = {
  /** Trạng thái KeyPackage của tôi. BE: GET /mls/keypackage/status (Bearer). */
  keyPackageStatus: (): Promise<KeyPackageStatus> =>
    unwrap<KeyPackageStatus>(
      client.get('/mls/keypackage/status', { needsAuth: true } as AuthableConfig),
    ),

  /** Publish KeyPackage của thiết bị. BE: POST /mls/keypackage. */
  publishKeyPackage: (body: {
    deviceId: string;
    keyPackage: string;
    ciphersuite: string;
  }): Promise<{ success: boolean; message: string }> =>
    unwrap<{ success: boolean; message: string }>(
      client.post('/mls/keypackage', body, { needsAuth: true } as AuthableConfig),
    ),

  /** KeyPackage các thành viên 1 phòng. BE: GET /mls/keypackages/room/:conversationId. */
  roomKeyPackages: (
    conversationId: string,
    deviceId: string,
  ): Promise<RemoteKeyPackage[]> =>
    unwrap<RemoteKeyPackage[]>(
      client.get(`/mls/keypackages/room/${encodeURIComponent(conversationId)}`, {
        needsAuth: true,
        params: { deviceId },
      } as AuthableConfig),
    ),

  /** Tạo bản ghi epoch-sync (ADMIN). BE: POST /mls/epoch-sync. */
  createEpochSync: (body: {
    conversationId: string;
    epoch: number;
    commitMessage: string;
    welcomeMessage: string;
    ratchetTree?: string;
  }): Promise<unknown> =>
    unwrap<unknown>(
      client.post('/mls/epoch-sync', body, { needsAuth: true } as AuthableConfig),
    ),

  /** Epoch hiện tại của phòng. BE: GET /mls/epoch-sync/:conversationId/current. */
  epochCurrent: (
    conversationId: string,
  ): Promise<{ conversationId: string; currentEpoch: number; epoch?: number }> =>
    unwrap<{ conversationId: string; currentEpoch: number; epoch?: number }>(
      client.get(
        `/mls/epoch-sync/${encodeURIComponent(conversationId)}/current`,
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Các bản ghi epoch trong khoảng [from,to]. BE: GET /mls/epoch-sync/:conversationId. */
  epochRange: (
    conversationId: string,
    fromEpoch: number,
    toEpoch: number,
  ): Promise<RemoteEpochRecord[]> =>
    unwrap<RemoteEpochRecord[]>(
      client.get(`/mls/epoch-sync/${encodeURIComponent(conversationId)}`, {
        needsAuth: true,
        params: { fromEpoch, toEpoch },
      } as AuthableConfig),
    ),
};

export const proofChatApi = { auth, conversations, mls };
export default proofChatApi;
