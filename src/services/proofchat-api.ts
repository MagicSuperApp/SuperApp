/**
 * proofchat-api.ts — Client ProofChat cho app vỏ Aladin (v2.1, TRỤC 3).
 *
 * PHẠM VI v2.1 — bề mặt REST mà module chat đang dùng thật:
 *   · auth            cầu nối PhoenixKey → phiên ProofChat (access/refresh token)
 *   · conversations   liệt kê · chi tiết · tạo · đổi tên · thành viên · vào/rời · ghim
 *   · memberRequests  lời mời tới tôi (nhận/từ chối) + yêu-cầu vào phòng (duyệt/từ chối)
 *   · messages        cảm xúc · lưu · thu hồi
 *   · readSignals     tín hiệu đã-xem (Trackmess) — KHÔNG kèm nội dung
 *   · uploads         ảnh đính kèm (multipart)
 *   · users           tìm người theo DID/username
 *   · mls             KeyPackage + epoch-sync (tầng mật mã, không lộ ra UI)
 *
 * NỘI DUNG TIN vẫn đi đường riêng: gửi/nhận plaintext do `proofchatService` lo
 * (mã hoá MLS + socket). REST ở đây chỉ chở METADATA (danh sách phòng, cảm xúc,
 * ghim, đã-xem) nên dùng được ngay cả khi tầng giải mã chưa sẵn sàng. KHÔNG bao
 * giờ nhét plaintext vào `encryptedContent`.
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

/** 1 thành viên trong hội thoại (BE participants). */
export interface RemoteParticipant {
  userId?: string;
  userDid?: string;
  nickname?: string;
  displayName?: string;
  avatar?: string | null;
  role?: string; // ADMIN | MEMBER …
  joinedAt?: number | string;
}

/** Hội thoại trả về từ BE (đọc thô — chưa giải mã nội dung tin). */
export interface RemoteConversation {
  id: string;
  title?: string;
  avatar?: string | null;
  type?: string;
  visibility?: string;
  ownerId?: string;
  memberCount?: number;
  createdAt?: number | string;
  updatedAt?: number | string;
  /** Thời điểm tin gần nhất — BE đặt tên khác nhau tuỳ endpoint, nhận cả hai. */
  lastMessageAt?: number | string;
  unreadCount?: number;
  participants?: RemoteParticipant[];
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
  /** Metadata KHÔNG mã hoá — server giữ được và trả kèm. */
  reactions?: Array<{ emoji: string; userId?: string }>;
  isPinned?: boolean;
  isSaved?: boolean;
  deletedAt?: number | string | null;
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

/**
 * DID PhoenixKey đã đổi ra cặp token đang nằm trong kho.
 *
 * ⛔ Vì sao khoá này phải có — cùng LỚP lỗi đã đo được ở đường OriLife 2026-08-28
 *    (`services/orilifeDidAuth.ts`, khoá `orilife_token_did`), lần này ở đường chat:
 *
 *    `connectProofChat` cũ chỉ hỏi "CÓ token không", không hỏi "token CỦA AI" — thấy
 *    có là trả `alreadyHadSession: true` ngay, không đăng nhập lại. Trên một máy dùng
 *    chung (máy bảng ngoài đồng, máy công ty), người A đăng xuất → người B đăng nhập
 *    → mọi lời gọi chat của người B đi ra máy chủ MANG DANH NGƯỜI A cho tới khi token
 *    hết hạn. Đọc hội thoại của người A, gửi tin dưới tên người A, và không màn nào
 *    báo gì.
 *
 * Nên từ nay token luôn đi kèm DID đã ký ra nó. Không khớp — hoặc không rõ của ai —
 * là XOÁ và đăng nhập lại. Mặc định ĐÓNG: token đời cũ (lưu trước bản này) không có
 * khoá này nên bị coi là vô chủ, và người dùng chịu MỘT lượt đăng nhập lại sau khi
 * cập nhật. Đó là cái giá cố ý.
 */
const TOKEN_DID_KEY = 'proofchat_token_did';

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

/**
 * Đóng dấu "cặp token này là của DID nào". Gọi NGAY SAU `phoenixKeyLogin` thành công.
 *
 * `refresh` KHÔNG gọi hàm này, và đúng như vậy: làm mới token giữ nguyên chủ, nên
 * dấu cũ vẫn đúng. Chỉ lần đổi session PhoenixKey lấy phiên mới mới đổi chủ.
 */
export const setTokenOwnerDid = (did: string): Promise<void> =>
  writeToken(TOKEN_DID_KEY, did);

/** DID đã ký ra cặp token đang lưu, hoặc `null` nếu không rõ (token đời cũ / chưa có). */
export const getTokenOwnerDid = async (): Promise<string | null> => {
  const v = await readToken(TOKEN_DID_KEY);
  return v && v.trim() ? v.trim() : null;
};

export const getAccessToken = (): Promise<string | null> => readToken(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): Promise<string | null> => readToken(REFRESH_TOKEN_KEY);

export const clearTokens = async (): Promise<void> => {
  await deleteToken(ACCESS_TOKEN_KEY);
  await deleteToken(REFRESH_TOKEN_KEY);
  // Xoá CÙNG LÚC với token. Để dấu chủ sót lại một mình thì lượt đăng nhập kế
  // tiếp của người khác sẽ thấy "token rỗng nhưng chủ là người cũ" — một trạng
  // thái không ai đọc đúng.
  await deleteToken(TOKEN_DID_KEY);
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

// `??` KHÔNG đủ: `@env` inline biến chưa đặt thành CHUỖI RỖNG, không phải
// `undefined`, nên chuỗi rỗng lọt qua và `baseURL` thành ''. Hậu quả không nằm ở
// axios (mọi lượt gọi đã bị `isProofChatBackendEnabled()` chặn từ trước) mà ở
// `uploads.absoluteUrl`: nó ghép base rỗng với '/media/…' rồi trả về một đường
// TƯƠNG ĐỐI, và thẻ ảnh im lặng không hiện gì. Cắt khoảng trắng rồi mới xét.
const baseURL =
  ((PROOFCHAT_API_URL as string | undefined) ?? '').trim() || 'http://localhost:3000';

// ── Lazy-login: tự lấy phiên khi có lượt gọi cần-auth mà kho chưa có token ──
//
// VÌ SAO CÓ: `ChatHomeScreen` bắn `loadConversations()` ngay khi đọc xong DID
// (việc cục bộ, xong trong mấy mili-giây), trong khi `proofchatService.init()`
// mới đang đi vòng PhoenixKey → POST /auth/phoenixkey/login (mấy trăm mili-giây
// tới vài giây). Lượt GET /conversations vì thế ra khỏi máy KHÔNG có Bearer, máy
// chủ trả 401, và màn hiện "Chưa tải được — kéo xuống để thử lại" trong khi máy
// chủ vẫn sống. Đo trên máy thật 2026-09-08.
//
// Đây ĐÚNG hình dạng mà AladinWork đã giải xong: `setWorkSessionProvider`
// (`modules/work/services/workApi.ts:64`). Dùng setter thay vì import thẳng
// `proofchatAuthBridge` để cắt vòng import (bridge import ngược tệp này).
let _sessionProvider: (() => Promise<string | null>) | null = null;
export const setProofChatSessionProvider = (
  fn: (() => Promise<string | null>) | null,
): void => {
  _sessionProvider = fn;
};

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
    let token = await getAccessToken();
    // Chưa có token → dựng phiên NGAY tại đây rồi mới đi tiếp, thay vì để lượt gọi
    // ra ngoài trần và nhận 401. Provider tự gộp các lượt song song vào một lần
    // đăng nhập, nên hai thunk bắn cùng lúc không thành hai lần login.
    if (!token && _sessionProvider) token = await _sessionProvider();
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

  /** Đổi tên / ảnh hội thoại. BE: PATCH /conversations/:id. */
  update: (
    id: string,
    body: { title?: string; avatar?: string },
  ): Promise<RemoteConversation> =>
    unwrap<RemoteConversation>(
      client.patch(`/conversations/${encodeURIComponent(id)}`, body, {
        needsAuth: true,
      } as AuthableConfig),
    ),

  /** Thêm thành viên. BE: POST /conversations/:id/participants. */
  addParticipants: (id: string, participantIds: string[]): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/conversations/${encodeURIComponent(id)}/participants`,
        { participantIds },
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Đặt biệt danh cho 1 thành viên. BE: PATCH /conversations/:id/participants/:userId. */
  updateParticipant: (
    id: string,
    userId: string,
    body: { nickname?: string },
  ): Promise<unknown> =>
    unwrap<unknown>(
      client.patch(
        `/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}`,
        body,
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Gỡ 1 thành viên. BE: DELETE /conversations/:id/participants/:userId. */
  removeParticipant: (id: string, userId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.delete(
        `/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}`,
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /**
   * Vào một hội thoại theo ID. BE: POST /conversations/:id/join.
   * Trả `{ action: 'JOINED' | 'REQUESTED', conversationId, requestId?, createdAt }`
   * — phòng mở thì vào thẳng, phòng kín thì thành yêu-cầu chờ duyệt.
   */
  join: (id: string, message?: string): Promise<JoinConversationResult> =>
    unwrap<JoinConversationResult>(
      client.post(
        `/conversations/${encodeURIComponent(id)}/join`,
        message ? { message } : {},
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Rời hội thoại. BE: POST /conversations/:id/leave. */
  leave: (id: string): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/conversations/${encodeURIComponent(id)}/leave`,
        {},
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Tin đã ghim của hội thoại. BE: GET /conversations/:id/pins. */
  listPins: (id: string): Promise<RemotePin[]> =>
    unwrapList<RemotePin>(
      client.get(`/conversations/${encodeURIComponent(id)}/pins`, {
        needsAuth: true,
      } as AuthableConfig),
    ),

  /** Ghim 1 tin. BE: POST /conversations/:id/pins { messageId }. */
  pin: (id: string, messageId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/conversations/${encodeURIComponent(id)}/pins`,
        { messageId },
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Bỏ ghim. BE: DELETE /conversations/:id/pins/:msgId. */
  unpin: (id: string, messageId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.delete(
        `/conversations/${encodeURIComponent(id)}/pins/${encodeURIComponent(messageId)}`,
        { needsAuth: true } as AuthableConfig,
      ),
    ),
};

/** Kết quả vào phòng (BE JoinConversationResponseDto). */
export interface JoinConversationResult {
  action: 'JOINED' | 'REQUESTED' | string;
  conversationId: string;
  requestId?: string;
  createdAt?: number;
}

/** 1 tin đã ghim (BE trả kèm bản ghi tin gốc — chỉ lấy phần cần cho UI). */
export interface RemotePin {
  id?: string;
  messageId: string;
  conversationId?: string;
  pinnedBy?: string;
  createdAt?: number | string;
}

// ── Lời mời / yêu-cầu vào phòng (BE Member Requests) ─────────────────
// Thay hoàn toàn danh sách lời mời MOCK cũ trong store. Hai chiều:
//   · người khác mời TÔI      → `pending()` → chấp nhận / từ chối
//   · người khác xin VÀO phòng tôi quản → `listForConversation()` → duyệt / từ chối

/** 1 lời mời hoặc yêu-cầu vào phòng (BE MemberRequestResponseDto). */
export interface RemoteMemberRequest {
  id: string;
  conversationId: string;
  targetUserId?: string;
  initiatorId?: string;
  type?: string; // INVITE | JOIN | ADD_DEVICE …
  status?: string; // PENDING | APPROVED | REJECTED | EXPIRED | CANCELLED
  message?: string;
  rejectReason?: string;
  createdAt?: number | string;
  processedAt?: number | string;
  expiresAt?: number | string;
  conversationTitle?: string;
  initiatorName?: string;
}

export const memberRequests = {
  /** Lời mời đang chờ TÔI trả lời. BE: GET /member-requests/pending. */
  pending: (): Promise<RemoteMemberRequest[]> =>
    unwrapList<RemoteMemberRequest>(
      client.get('/member-requests/pending', { needsAuth: true } as AuthableConfig),
    ),

  /** Nhận lời mời. BE: POST /member-requests/:id/accept. */
  accept: (requestId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/member-requests/${encodeURIComponent(requestId)}/accept`,
        {},
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Từ chối lời mời. BE: POST /member-requests/:id/decline. */
  decline: (requestId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/member-requests/${encodeURIComponent(requestId)}/decline`,
        {},
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Yêu-cầu vào phòng đang chờ duyệt của 1 phòng. BE: GET /conversations/:cid/member-requests. */
  listForConversation: (
    conversationId: string,
    status = 'PENDING',
  ): Promise<RemoteMemberRequest[]> =>
    unwrapList<RemoteMemberRequest>(
      client.get(
        `/conversations/${encodeURIComponent(conversationId)}/member-requests`,
        { needsAuth: true, params: { status } } as AuthableConfig,
      ),
    ),

  /** Mời 1 người vào phòng. BE: POST /conversations/:cid/member-requests/invite. */
  invite: (
    conversationId: string,
    targetUserId: string,
    message?: string,
  ): Promise<RemoteMemberRequest> =>
    unwrap<RemoteMemberRequest>(
      client.post(
        `/conversations/${encodeURIComponent(conversationId)}/member-requests/invite`,
        { targetUserId, message },
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Trạng thái yêu-cầu vào phòng của chính tôi. BE: GET …/member-requests/my-status. */
  myStatus: (conversationId: string): Promise<RemoteMemberRequest | null> =>
    unwrap<RemoteMemberRequest | null>(
      client.get(
        `/conversations/${encodeURIComponent(conversationId)}/member-requests/my-status`,
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Duyệt 1 yêu-cầu vào phòng. BE: POST …/member-requests/:rid/approve. */
  approve: (
    conversationId: string,
    requestId: string,
    body: { welcomeMessage?: string; ratchetTree?: string; epoch?: number } = {},
  ): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/conversations/${encodeURIComponent(conversationId)}/member-requests/${encodeURIComponent(requestId)}/approve`,
        body,
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Từ chối 1 yêu-cầu vào phòng. BE: POST …/member-requests/:rid/reject. */
  reject: (
    conversationId: string,
    requestId: string,
    reason?: string,
  ): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/conversations/${encodeURIComponent(conversationId)}/member-requests/${encodeURIComponent(requestId)}/reject`,
        { reason },
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Huỷ lời mời / yêu-cầu đang chờ. BE: DELETE …/member-requests/:rid. */
  cancel: (conversationId: string, requestId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.delete(
        `/conversations/${encodeURIComponent(conversationId)}/member-requests/${encodeURIComponent(requestId)}`,
        { needsAuth: true } as AuthableConfig,
      ),
    ),
};

// ── Thao tác trên 1 tin nhắn (cảm xúc, ghim, lưu, thu hồi) ───────────
// Những đường này KHÔNG chạm nội dung tin — nội dung vẫn mã hoá đầu-cuối, server
// chỉ giữ metadata (emoji, cờ đã-lưu, danh sách ghim). Vì thế dùng được NGAY cả
// khi tầng giải mã chưa sẵn sàng.

/** 1 cảm xúc trên tin (BE reactions). */
export interface RemoteReaction {
  emoji: string;
  userId?: string;
  createdAt?: number | string;
}

/** 1 tin đã lưu (BE /users/me/saved-messages). */
export interface RemoteSavedMessage {
  messageId: string;
  conversationId?: string;
  conversationTitle?: string;
  savedAt?: number | string;
}

export const messages = {
  /** Thả cảm xúc. BE: POST /messages/:id/reactions { emoji }. */
  react: (messageId: string, emoji: string): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/messages/${encodeURIComponent(messageId)}/reactions`,
        { emoji },
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Danh sách cảm xúc của 1 tin. BE: GET /messages/:id/reactions. */
  reactions: (messageId: string): Promise<RemoteReaction[]> =>
    unwrapList<RemoteReaction>(
      client.get(`/messages/${encodeURIComponent(messageId)}/reactions`, {
        needsAuth: true,
      } as AuthableConfig),
    ),

  /** Gỡ cảm xúc của mình. BE: DELETE /messages/:id/reactions/:emoji. */
  unreact: (messageId: string, emoji: string): Promise<unknown> =>
    unwrap<unknown>(
      client.delete(
        `/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Thu hồi tin. BE: POST /messages/:id/delete { forEveryone }. */
  remove: (messageId: string, forEveryone = false): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/messages/${encodeURIComponent(messageId)}/delete`,
        { forEveryone },
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Lưu tin vào mục của tôi. BE: POST /messages/:id/saved. */
  save: (messageId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        `/messages/${encodeURIComponent(messageId)}/saved`,
        {},
        { needsAuth: true } as AuthableConfig,
      ),
    ),

  /** Bỏ lưu. BE: DELETE /messages/:id/saved. */
  unsave: (messageId: string): Promise<unknown> =>
    unwrap<unknown>(
      client.delete(`/messages/${encodeURIComponent(messageId)}/saved`, {
        needsAuth: true,
      } as AuthableConfig),
    ),

  /** Mục "đã lưu" của tôi. BE: GET /users/me/saved-messages. */
  saved: (opts: { cursor?: string; limit?: number } = {}): Promise<RemoteSavedMessage[]> =>
    unwrapList<RemoteSavedMessage>(
      client.get('/users/me/saved-messages', {
        needsAuth: true,
        params: { cursor: opts.cursor, limit: opts.limit },
      } as AuthableConfig),
    ),
};

// ── Tín hiệu đã-xem (Trackmess) ──────────────────────────────────────
// Báo cho server biết tin nào đã thực sự hiện trên màn hình, KHÔNG kèm nội dung.
// Dùng để bên kia thấy "đã xem" và để đếm chưa-đọc đúng giữa nhiều thiết bị.

export const readSignals = {
  /** BE: POST /trackmess/signals { conversationId, items[] }. */
  send: (
    conversationId: string,
    items: Array<{ messageId: string; dwellMs?: number; ts?: number }>,
  ): Promise<unknown> =>
    unwrap<unknown>(
      client.post(
        '/trackmess/signals',
        {
          conversationId,
          items: items.map((i) => ({
            messageId: i.messageId,
            dwellMs: i.dwellMs ?? 0,
            ts: i.ts ?? Date.now(),
          })),
        },
        { needsAuth: true } as AuthableConfig,
      ),
    ),
};

// ── Tệp đính kèm (ảnh) ───────────────────────────────────────────────

/** Kết quả tải ảnh lên (BE SupportUploadResponseDto / media upload). */
export interface RemoteUpload {
  id: string;
  url: string;
  mimeType?: string;
  filename?: string;
  sizeBytes?: number;
}

export const uploads = {
  /**
   * Tải 1 ảnh lên. BE: POST /support/uploads (multipart `file`, tối đa 10MB).
   * Trả `{ id, url, … }` — `url` là đường tương đối, ghép với baseURL khi hiển thị.
   */
  image: (file: { uri: string; name: string; type: string }): Promise<RemoteUpload> => {
    const form = new FormData();
    // RN FormData nhận { uri, name, type } — không đọc tệp vào bộ nhớ.
    form.append('file', file as unknown as Blob);
    return unwrap<RemoteUpload>(
      client.post('/support/uploads', form, {
        needsAuth: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      } as AuthableConfig),
    );
  },

  /** Đường xem tệp đã tải lên (BE trả path tương đối). */
  absoluteUrl: (url: string): string =>
    /^https?:\/\//i.test(url) ? url : `${baseURL.replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`,
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
   * Route SỐNG. Đo lại 2026-09-02 trên prod:
   *
   *   GET /api/v1/users/search?q=a            → 401   (có route, thiếu token)
   *   GET /api/v1/users/search-khong-co-that  → 404   (đường bịa, để đối chứng)
   *
   * 401 cho đường thật và 404 cho đường bịa ⇒ route tồn tại. Ghi chú cũ ở đây kết luận
   * "TẮT ở BE" từ `users/user.controller.ts:95`, nơi khối `@Get('search')` đúng là còn bị
   * bình luận — nhưng route thật nằm LẠC ở module khác:
   * `BE/src/modules/messages/messages.controller.ts:203` khai `@Get('users/search')`.
   * Đo một tệp rồi kết luận cho cả hệ là đúng hình dạng lỗi "số đúng, sai nơi đo"; giữ
   * đoạn này làm ví dụ, vì cái giá của nó là một tính năng bị coi là chết suốt nhiều tuần.
   *
   * ⚠️ CÁI CÒN CHẶN THẬT thì khác: `BE/src/modules/users/users.service.ts:381-396` tra
   * bằng `did: { contains: query }`. Người gõ TÊN NGƯỜI luôn nhận mảng rỗng — route chạy,
   * không lỗi, không làm được việc nó khai. Tìm được chỉ khi dán nguyên chuỗi DID.
   * Bản vá là ProofChat/BE#105 (tra theo tên PhoenixKey).
   *
   * Nên chỗ dùng PHẢI phân biệt "rỗng vì không ai khớp" với "rỗng vì máy chủ chỉ biết tra
   * DID" — nuốt cả hai thành "không tìm thấy ai" là giấu đúng cái đang hỏng.
   *
   * KHÔNG dựng đường tìm người song song ở phía app: hai đường tìm người là hai bảng
   * định danh trôi khỏi nhau.
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

export const proofChatApi = {
  auth,
  conversations,
  memberRequests,
  messages,
  readSignals,
  uploads,
  users,
  mls,
};
export default proofChatApi;
