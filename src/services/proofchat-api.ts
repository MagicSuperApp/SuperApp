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

const ACCESS_TOKEN_KEY = 'proofchat_access_token';
const REFRESH_TOKEN_KEY = 'proofchat_refresh_token';

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

  /** Tạo hội thoại. BE: POST /conversations (Bearer). */
  create: (p: {
    type: 'DIRECT' | 'GROUP' | 'JOB_NEGOTIATION';
    participantIds: string[];
    title?: string;
    proposalId?: string;
  }): Promise<RemoteConversation> =>
    unwrap<RemoteConversation>(
      client.post('/conversations', p, { needsAuth: true } as AuthableConfig),
    ),
};

// ── Tin nhắn (lịch sử — realtime đi qua WS) ──────────────────────────
// Tin trả về là envelope MLS: giải mã nội dung ở tầng native (chatMls), không phải ở đây.
export interface RemoteMessage {
  id: string;
  conversationId: string;
  senderId: string;
  createdAt?: number | string;
  epoch?: number;
  /** Envelope MLS (opkId:'mls', type:2, body base64...). Giải mã ở chatMls. */
  encryptedContent?: Record<string, unknown>;
  variants?: Array<Record<string, unknown>>;
  merkleLeaf?: Record<string, unknown>;
}

export const messages = {
  /** Lịch sử tin của hội thoại. BE: GET /conversations/:id/messages?deviceId&limit&offset (Bearer). */
  history: (
    conversationId: string,
    deviceId: string,
    limit = 30,
    offset = 0,
  ): Promise<RemoteMessage[]> =>
    unwrap<RemoteMessage[]>(
      client.get(`/conversations/${conversationId}/messages`, {
        needsAuth: true,
        params: { deviceId, limit, offset },
      } as AuthableConfig),
    ),
};

// ── MLS key management + epoch-sync ──────────────────────────────────

export interface KeyPackageResponse {
  stakeAddress: string;
  deviceId: string;
  keyPackage: string; // base64 wire
  ciphersuite: string;
  expiresAt?: number | string;
  createdAt?: number | string;
}

export interface EpochSyncRecord {
  conversationId: string;
  id: string;
  epoch: number;
  mlsMessageType: 'application' | 'epoch_sync' | 'welcome';
  commitMessage: string; // base64
  welcomeMessage: string; // base64
  ratchetTree?: string; // base64
  createdAt?: number;
  createdBy: string; // stakeAddress admin
}

export const mls = {
  /** Publish KeyPackage của thiết bị. BE: POST /mls/keypackage (Bearer). */
  publishKeyPackage: (p: {
    deviceId: string;
    keyPackage: string;
    ciphersuite: string;
    expiresAt?: number;
  }): Promise<{ success?: boolean }> =>
    unwrap<{ success?: boolean }>(
      client.post('/mls/keypackage', p, { needsAuth: true } as AuthableConfig),
    ),

  /** KeyPackage của mọi thành viên trong phòng (để add vào nhóm). */
  roomKeyPackages: (conversationId: string, deviceId?: string): Promise<KeyPackageResponse[]> =>
    unwrap<KeyPackageResponse[]>(
      client.get(`/mls/keypackages/room/${conversationId}`, {
        needsAuth: true,
        params: { deviceId },
      } as AuthableConfig),
    ),

  /** KeyPackage theo danh sách stakeAddress. BE: POST /mls/keypackages/batch. */
  batchKeyPackages: (stakeAddresses: string[]): Promise<KeyPackageResponse[]> =>
    unwrap<KeyPackageResponse[]>(
      client.post('/mls/keypackages/batch', { stakeAddresses }, { needsAuth: true } as AuthableConfig),
    ),

  /** Trạng thái KeyPackage của mình trên server (đã publish chưa). */
  keyPackageStatus: (): Promise<{ exists?: boolean }> =>
    unwrap<{ exists?: boolean }>(
      client.get('/mls/keypackage/status', { needsAuth: true } as AuthableConfig),
    ),

  /** Epoch hiện tại của nhóm. BE: GET /mls/epoch-sync/:conversationId/current. */
  epochCurrent: (
    conversationId: string,
  ): Promise<{ conversationId: string; currentEpoch?: number; epoch?: number; lastUpdated?: number }> =>
    unwrap(
      client.get(`/mls/epoch-sync/${conversationId}/current`, { needsAuth: true } as AuthableConfig),
    ),

  /** Bản ghi epoch-sync trong khoảng [fromEpoch, toEpoch]. */
  epochRange: (conversationId: string, fromEpoch = 0, toEpoch = 999999): Promise<EpochSyncRecord[]> =>
    unwrap<EpochSyncRecord[]>(
      client.get(`/mls/epoch-sync/${conversationId}`, {
        needsAuth: true,
        params: { fromEpoch, toEpoch },
      } as AuthableConfig),
    ),

  /** Ghi bản epoch-sync (ADMIN — khi tạo nhóm/thêm thành viên). */
  createEpochSync: (rec: {
    conversationId: string;
    epoch: number;
    commitMessage: string;
    welcomeMessage: string;
    ratchetTree?: string;
  }): Promise<EpochSyncRecord> =>
    unwrap<EpochSyncRecord>(
      client.post('/mls/epoch-sync', rec, { needsAuth: true } as AuthableConfig),
    ),
};

export const proofChatApi = { auth, conversations, messages, mls };
export default proofChatApi;
