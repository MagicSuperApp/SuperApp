/**
 * Một lần ĐỌC hỏng không được biến thành một lần XOÁ.
 *
 * ── Ca được ghim ───────────────────────────────────────────────────────────
 * `loadLocalState` bắt lỗi `taad.secureLoad` rồi gán `pendingEpochs = []`, đánh
 * dấu đã nạp, và lượt `saveLocalState` kế tiếp ghi `[]` ĐÈ lên kho. Kho khoá phần
 * cứng bận một nhịp — người dùng vừa đổi khoá màn hình, tiến trình bị treo giữa
 * chừng — là mất sạch hàng chờ Welcome/Commit, im lặng.
 *
 * Hậu quả KHÔNG lùi lại được: không API nào phát lại Welcome, nên thành viên
 * nhóm không bao giờ giải mã được tin, và người tạo nhóm tưởng đã xong.
 *
 * ── "Kho rỗng" và "không đọc được kho" là HAI trạng thái ──────────────────
 * Bài kiểm phải phân biệt đúng hai cái đó, không chỉ đếm số bản còn lại.
 */

jest.mock('../sdk/chatMls', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(() => true),
    importState: jest.fn(async () => undefined),
    exportState: jest.fn(async () => 'blob'),
    newIdentity: jest.fn(async () => undefined),
    generateKeyPackage: jest.fn(async () => 'kp-self'),
    createGroup: jest.fn(async () => ({ epoch: 1, epochSecret: 's', welcome: 'W', commit: 'C' })),
    joinFromWelcome: jest.fn(async () => undefined),
    processCommit: jest.fn(async () => undefined),
    freeIdentity: jest.fn(async () => undefined),
  },
}));

/**
 * Kho GIẢ có nhớ, và bật/tắt được lỗi ĐỌC riêng khỏi lỗi GHI. Tên biến phải bắt
 * đầu bằng `mock` thì jest mới cho factory tham chiếu ra ngoài.
 */
const mockStoreData: Record<string, string> = {};
const mockStoreFlags = { loadThrows: false };
const mockSecureStore = jest.fn(async (k: string, v: string) => {
  mockStoreData[k] = v;
  return true;
});
jest.mock('../sdk/taadEnclave', () => ({
  secureLoad: jest.fn(async (k: string) => {
    if (mockStoreFlags.loadThrows) throw new Error('kho khoá phần cứng đang bận');
    return Object.prototype.hasOwnProperty.call(mockStoreData, k) ? mockStoreData[k] : null;
  }),
  secureStore: (k: string, v: string) => mockSecureStore(k, v),
}));

const mockCreateEpochSync = jest.fn(async (_arg?: unknown) => undefined);
const mockConversationCreate = jest.fn(async (_body?: unknown) => ({ id: 'conv-moi' }));
const mockRoomKeyPackages = jest.fn(async (_c?: unknown, _d?: unknown) => [
  { stakeAddress: 'did:phoenix:preprod:ban', keyPackage: 'kp-ban' },
]);
jest.mock('./proofchat-api', () => ({
  __esModule: true,
  isProofChatBackendEnabled: jest.fn(() => true),
  proofChatApi: {
    conversations: { create: (b: unknown) => mockConversationCreate(b) },
    mls: {
      roomKeyPackages: (c: unknown, d: unknown) => mockRoomKeyPackages(c, d),
      createEpochSync: (arg: unknown) => mockCreateEpochSync(arg),
      keyPackageStatus: jest.fn(async () => ({ exists: true })),
      publishKeyPackage: jest.fn(async () => undefined),
    },
  },
}));

jest.mock('./chatSocket', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    sendMessage: jest.fn(async () => ({ ok: true })),
    onMessage: jest.fn(() => jest.fn()),
    onEpochSync: jest.fn(() => jest.fn()),
    isConnected: jest.fn(() => false),
  },
}));

jest.mock('./proofchatAuthBridge', () => ({
  connectProofChat: jest.fn(async () => ({ status: 'connected' })),
}));

jest.mock('./proofchatMessage', () => ({
  assembleOutgoing: jest.fn(),
  processIncoming: jest.fn(),
  needsMerkleVerification: jest.fn(() => false),
}));

jest.mock('./proofchatIdentity', () => ({
  getDid: jest.fn(async () => 'did:phoenix:preprod:abc'),
  getMerkleSession: jest.fn(),
}));

import {
  _resetForTest,
  init,
  createGroupConversation,
  flushPendingEpochs,
  getPendingEpochCount,
  getEpochQueueStats,
  isEpochQueueStorageReadable,
} from './proofchatService';

const PENDING_KEY = 'chat_mls_pending_epoch';

/** Một bản Welcome/Commit đang xếp hàng, đúng hình dạng đã lưu. */
const QUEUED = [
  {
    conversationId: 'conv-1',
    epoch: 3,
    commitMessage: 'C',
    welcomeMessage: 'W',
    attempts: 1,
    firstQueuedAt: Date.now(),
    lastAttemptAt: Date.now(),
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  _resetForTest();
  for (const k of Object.keys(mockStoreData)) delete mockStoreData[k];
  mockStoreFlags.loadThrows = false;
});

describe('kho hàng chờ epoch — đọc hỏng KHÁC kho rỗng', () => {
  it('đọc HỎNG ⟹ KHÔNG ghi đè kho, bản đang xếp hàng còn nguyên trên đĩa', async () => {
    mockStoreData[PENDING_KEY] = JSON.stringify(QUEUED);
    mockStoreFlags.loadThrows = true;

    // Máy chủ nhận được thì `publishEpoch` sẽ gọi `saveLocalState` — đúng đường
    // mà bản trước dùng để ghi `[]` xuống kho.
    await flushPendingEpochs();

    // Kho vẫn giữ nguyên bản cũ: KHÔNG lượt ghi nào chạm vào khoá hàng chờ.
    expect(mockSecureStore).not.toHaveBeenCalledWith(PENDING_KEY, expect.anything());
    expect(JSON.parse(mockStoreData[PENDING_KEY])).toHaveLength(1);
    // Và app tự khai là đang mù, chứ không im.
    expect(isEpochQueueStorageReadable()).toBe(false);
  });

  it('đọc HỎNG rồi TẠO NHÓM ⟹ lượt ghi KHÔNG đè lên hàng chờ đang nằm trên đĩa', async () => {
    // Đây là đường đã gây hại thật: `markJoined()` trong `createGroupConversation`
    // gọi `saveLocalState()`, nên bản trước ghi `pendingEpochs: []` (mảng rỗng do
    // lượt đọc hỏng để lại) ĐÈ lên hàng chờ Welcome/Commit có thật trên đĩa.
    mockStoreData[PENDING_KEY] = JSON.stringify(QUEUED);
    const onDisk = mockStoreData[PENDING_KEY];
    mockStoreFlags.loadThrows = true;

    expect((await init('did:phoenix:preprod:toi')).status).toBe('ready');
    const res = await createGroupConversation('Nhóm vườn', ['did:phoenix:preprod:ban']);

    expect(res.ok).toBe(true);
    expect(mockSecureStore).not.toHaveBeenCalledWith(PENDING_KEY, expect.anything());
    expect(mockStoreData[PENDING_KEY]).toBe(onDisk);
  });

  it('đọc HỎNG rồi lành ⟹ đọc lại được, bản cũ quay về đủ', async () => {
    mockStoreData[PENDING_KEY] = JSON.stringify(QUEUED);
    mockStoreFlags.loadThrows = true;
    expect(await getPendingEpochCount()).toBe(0); // mù, chưa biết gì

    mockStoreFlags.loadThrows = false;
    // Lượt sau phải THỬ LẠI — đánh dấu "đã nạp" ở lượt hỏng là biến một sự cố
    // tạm thời thành trạng thái vĩnh viễn của phiên.
    expect(await getPendingEpochCount()).toBe(1);
    expect(isEpochQueueStorageReadable()).toBe(true);
  });

  it('bản xếp hàng TRONG LÚC kho mù không bị lượt đọc-lại-được vứt đi', async () => {
    // Lượt đọc lại thành công phải GỘP, không ĐÈ. Đè là vứt đúng những bản vừa
    // xếp trong lúc mù — và chúng là bản MỚI NHẤT, tức bản người dùng đang chờ.
    mockStoreData[PENDING_KEY] = JSON.stringify(QUEUED);
    mockStoreFlags.loadThrows = true;
    mockCreateEpochSync.mockRejectedValue(new Error('mất sóng'));

    expect((await init('did:phoenix:preprod:toi')).status).toBe('ready');
    const res = await createGroupConversation('Nhóm vườn', ['did:phoenix:preprod:ban']);
    expect(res.ok).toBe(true);
    expect(res.welcomePublished).toBe(false); // đã vào hàng chờ TRONG BỘ NHỚ

    mockStoreFlags.loadThrows = false;

    // 1 bản trên đĩa + 1 bản vừa xếp. Ra 1 nghĩa là một trong hai đã bốc hơi.
    expect(await getPendingEpochCount()).toBe(2);
    const stats = await getEpochQueueStats();
    expect(stats.pending).toBe(2);
  });

  it('kho RỖNG THẬT ⟹ hàng chờ rỗng, và kho vẫn đọc được — trạng thái KHÁC hẳn', async () => {
    const stats = await getEpochQueueStats();

    expect(stats.pending).toBe(0);
    expect(stats.dropped).toBe(0);
    expect(isEpochQueueStorageReadable()).toBe(true);
  });

  it('đọc được ⟹ đường GHI mở lại như thường', async () => {
    mockStoreData[PENDING_KEY] = JSON.stringify(QUEUED);
    mockCreateEpochSync.mockResolvedValue(undefined);

    const res = await flushPendingEpochs();

    expect(res.sent).toBe(1);
    expect(mockSecureStore).toHaveBeenCalledWith(PENDING_KEY, expect.any(String));
    expect(JSON.parse(mockStoreData[PENDING_KEY])).toHaveLength(0);
  });
});
