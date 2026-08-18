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
import * as taad from '../sdk/taadEnclave';
import { PROOFCHAT_API_URL, PROOFCHAT_BACKEND_ENABLED } from '@env';
import { isCapabilityLive } from '../config/runtimeGate';

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
// Nay do CỔNG RUNTIME quyết (config/runtimeGate.ts): có host + probe /health 2xx
// → tự bật khi backend sống, KHỎI build lại. Kill-switch thủ công:
// PROOFCHAT_BACKEND_ENABLED='off' cưỡng bức mock. Mặc định: chat tab chạy mock
// tới khi /health 2xx. (Trước đây cần ==='true' build-time — anh Aladin chốt
// 2026-07-22 chuyển tự động.)
export const isProofChatBackendEnabled = (): boolean =>
  !!(PROOFCHAT_API_URL as string | undefined) &&
  String(PROOFCHAT_BACKEND_ENABLED).toLowerCase() !== 'off' &&
  isCapabilityLive('proofchat');

// ── Lưu token ────────────────────────────────────────────────────────

// LƯU Ý TOKEN AN TOÀN (spec §4): production PHẢI lưu token ở Keychain (iOS) /
// Keystore (Android) — KHÔNG localStorage. Trước bản vá này token nằm THẲNG trong
// AsyncStorage: không mã hoá cứng, và trên máy đã root/jailbreak thì đọc được như
// tệp thường.
//
// Nay lưu qua `taad.secureStore` — CHÍNH cầu Keychain(iOS)/Keystore-AES(Android)
// mà `proofchatService.ts` đã dùng cho state MLS và hàng chờ Welcome
// (`proofchatService.ts:67`). KHÔNG thêm thư viện mới: cầu native đã có sẵn trong
// kho (`src/sdk/taadEnclave.ts:456-465`).
//
// DI TRÚ: máy đã cài bản cũ vẫn còn token nằm trần trong AsyncStorage. Lần ĐỌC đầu
// tiên sẽ chuyển giá trị đó sang secure store rồi XOÁ bản cũ — chỉ xoá khi ghi
// secure đã xác nhận thành công, để không làm mất phiên của người đang dùng.
//
// KHI CẦU NATIVE KHÔNG CÓ (jest node, hoặc nền tảng chưa build Rust core):
// `taad.secureStore` ném. Lúc đó rơi về AsyncStorage như cũ + `console.warn` một
// lần, chứ KHÔNG làm chết đăng nhập. Đây là suy giảm CÓ BÁO, không im lặng: đọc
// `getTokenStorageBackend()` để biết token thực tế đang nằm ở đâu.
const ACCESS_TOKEN_KEY = 'proofchat_access_token';
const REFRESH_TOKEN_KEY = 'proofchat_refresh_token';
const DEVICE_ID_KEY = 'proofchat_device_id';

/** 'secure' = Keychain/Keystore; 'async-storage' = suy giảm; null = chưa ghi lần nào. */
let tokenBackend: 'secure' | 'async-storage' | null = null;
let warnedInsecure = false;

/** Nơi token phiên THỰC SỰ nằm ở lượt ghi/đọc gần nhất (để đo, không đoán). */
export const getTokenStorageBackend = (): 'secure' | 'async-storage' | null => tokenBackend;

const secureWrite = async (key: string, value: string): Promise<boolean> => {
  try {
    // Cầu native trả boolean; coi `false` cũng là trượt.
    return (await taad.secureStore(key, value)) !== false;
  } catch {
    return false;
  }
};

const secureRead = async (key: string): Promise<string | null> => {
  try {
    return await taad.secureLoad(key);
  } catch {
    return null;
  }
};

const warnInsecureOnce = (): void => {
  tokenBackend = 'async-storage';
  if (warnedInsecure) return;
  warnedInsecure = true;
  console.warn(
    '[proofchat] TaadEnclave secure store không dùng được — token phiên đang nằm ' +
      'trong AsyncStorage (KHÔNG mã hoá phần cứng).',
  );
};

const writeToken = async (key: string, value: string): Promise<void> => {
  if (await secureWrite(key, value)) {
    tokenBackend = 'secure';
    // Dọn nốt bản cũ để trần nếu máy này từng chạy bản trước.
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return;
  }
  warnInsecureOnce();
  await AsyncStorage.setItem(key, value);
};

const readToken = async (key: string): Promise<string | null> => {
  const secure = await secureRead(key);
  if (secure) {
    tokenBackend = 'secure';
    return secure;
  }
  const legacy = await AsyncStorage.getItem(key);
  if (!legacy) return null;
  // Di trú một chiều: chỉ xoá bản trần SAU KHI ghi secure đã thành công.
  if (await secureWrite(key, legacy)) {
    tokenBackend = 'secure';
    await AsyncStorage.removeItem(key).catch(() => undefined);
  } else {
    warnInsecureOnce();
  }
  return legacy;
};

const deleteToken = async (key: string): Promise<void> => {
  try {
    await taad.secureDelete(key);
  } catch {
    /* không có cầu native → chỉ còn bản AsyncStorage bên dưới */
  }
  await AsyncStorage.removeItem(key).catch(() => undefined);
};

export const setTokens = async (t: AuthTokens): Promise<void> => {
  await writeToken(ACCESS_TOKEN_KEY, t.accessToken);
  await writeToken(REFRESH_TOKEN_KEY, t.refreshToken);
};

export const getAccessToken = (): Promise<string | null> => readToken(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): Promise<string | null> => readToken(REFRESH_TOKEN_KEY);

export const clearTokens = async (): Promise<void> => {
  await deleteToken(ACCESS_TOKEN_KEY);
  await deleteToken(REFRESH_TOKEN_KEY);
};

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

/**
 * Bóc danh sách cho các endpoint PHÂN TRANG — nơi BE bọc HAI lớp.
 *
 * Lớp ngoài là TransformInterceptor global (`{ data, message, statusCode,
 * timestamp }`), lớp trong là chính service: `findAll` khai
 * `Promise<{ data: Array<…>; total: number }>` (`BE conversations.service.ts:111`)
 * và `getMessages` trả `{ data, total, hasMore, limit, offset }`. Controller trả
 * thẳng kết quả service (`conversations.controller.ts:73`, `:245`), không dàn phẳng.
 *
 * `unwrap` chỉ biết lớp ngoài, nên trước bản vá này caller nhận `{ data, total }`
 * trong khi kiểu khai là mảng. Mọi chỗ gọi đều có `Array.isArray(x) ? x : []`
 * (`chatSlice.ts:174`, `:203`) nên hỏng biểu hiện thành **danh sách luôn
 * rỗng, không một dòng lỗi**.
 *
 * Hình lạ thì NÉM chứ không trả `[]`: trả `[]` là dựng lại đúng cái vỏ im lặng
 * vừa gỡ — người dùng đọc "chưa có hội thoại" trong khi thật ra là gọi hỏng.
 */
async function unwrapList<T>(
  promise: Promise<{ data: unknown }>,
): Promise<T[]> {
  const body = await unwrap<unknown>(promise);
  if (Array.isArray(body)) return body as T[];
  if (body !== null && typeof body === 'object') {
    const inner = (body as { data?: unknown }).data;
    if (Array.isArray(inner)) return inner as T[];
  }
  throw new ProofChatApiError(
    0,
    'BE trả hình lạ cho danh sách — không phải mảng, cũng không phải { data: [...] }',
  );
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
   * Đổi session token PhoenixKey lấy phiên ProofChat. Lưu token qua secure store
   * (Keychain/Keystore) — xem khối "Lưu token" bên trên.
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
  /**
   * Danh sách hội thoại của tài khoản. BE: GET /conversations (Bearer).
   * Trả `{ data, total }` BÊN TRONG envelope → dùng `unwrapList` (xem chú thích ở đó).
   */
  list: (opts: ListConversationsOptions = {}): Promise<RemoteConversation[]> =>
    unwrapList<RemoteConversation>(
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
   * Trả `{ data, total, hasMore, limit, offset }` BÊN TRONG envelope → `unwrapList`.
   */
  getMessages: (
    conversationId: string,
    deviceId: string,
    opts: { take?: number; offset?: number } = {},
  ): Promise<RemoteMessage[]> =>
    unwrapList<RemoteMessage>(
      client.get(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
        needsAuth: true,
        params: { deviceId, limit: opts.take, offset: opts.offset },
      } as AuthableConfig),
    ),
};

// ── Người dùng (tìm người để bắt đầu chat cá nhân / thêm vào nhóm) ────

/** 1 người dùng từ tìm-kiếm (BE /users/search). Chỉ field tối-thiểu để lập hội-thoại. */
export interface RemoteUser {
  userDid: string;
  username?: string;
  displayName?: string;
  avatar?: string | null;
}

export const users = {
  /**
   * Tìm người theo DID hoặc username để bắt đầu chat 1-1 / thêm vào nhóm.
   * BE: GET /users/search?q=<did_or_username> (Bearer). Trả mảng RemoteUser.
   *
   * ⚠️ Đường này hiện **TẮT ở BE**: `ProofChat/BE/src/modules/users/user.controller.ts:95`
   * — cả khối `@Get('search')` bị bình luận (`// @Get('search')` … `// }`), cùng 8 route
   * GET khác của `users`. `usersService.searchUsers` vẫn còn, chỉ controller không mở.
   * Nên mọi lượt gọi ở đây trả 404 cho tới khi bên ProofChat mở lại. Giữ nguyên mã gọi
   * (mở lại là chạy, không phải sửa app), nhưng chỗ dùng PHẢI hiện lỗi chứ không được
   * nuốt thành "không tìm thấy ai".
   */
  search: (q: string): Promise<RemoteUser[]> =>
    unwrapList<RemoteUser>(
      client.get('/users/search', {
        needsAuth: true,
        params: { q },
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

export const proofChatApi = { auth, conversations, users, mls };
export default proofChatApi;
