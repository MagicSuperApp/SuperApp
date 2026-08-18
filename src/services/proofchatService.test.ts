// Test createGroupConversation — tạo nhóm THẬT (không mock reducer).
// Mock toàn bộ dependency của proofchatService để cô lập logic ráp nhóm MLS.

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

// Secure store GIẢ có nhớ: cần đọc lại được thứ vừa ghi để test hàng chờ epoch
// (trần lần thử, quá hạn, bản ghi định dạng cũ). Tên biến phải bắt đầu bằng
// `mock` thì jest mới cho factory tham chiếu ra ngoài.
const mockSecureStoreData: Record<string, string> = {};
jest.mock('../sdk/taadEnclave', () => ({
  secureLoad: jest.fn(async (k: string) =>
    Object.prototype.hasOwnProperty.call(mockSecureStoreData, k) ? mockSecureStoreData[k] : null,
  ),
  secureStore: jest.fn(async (k: string, v: string) => {
    mockSecureStoreData[k] = v;
    return true;
  }),
}));

const mockCreate: jest.Mock = jest.fn();
const mockRoomKeyPackages: jest.Mock = jest.fn();
const mockCreateEpochSync: jest.Mock = jest.fn(async () => undefined);
jest.mock('./proofchat-api', () => ({
  __esModule: true,
  isProofChatBackendEnabled: jest.fn(() => true),
  proofChatApi: {
    conversations: { create: (body: unknown) => mockCreate(body) },
    mls: {
      roomKeyPackages: (convId: unknown, deviceId: unknown) => mockRoomKeyPackages(convId, deviceId),
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
  getDid: jest.fn(async () => 'did:phoenix:me'),
  getMerkleSession: jest.fn(async () => null),
}));

import chatMls from '../sdk/chatMls';
import * as svc from './proofchatService';

const ME = 'did:phoenix:me';

beforeEach(() => {
  jest.clearAllMocks();
  // State module (danh tính, hàng chờ Welcome, nhóm đã vào) dùng chung giữa các ca —
  // không reset thì ca "chưa init" chỉ đúng nhờ MAY MẮN là nó chạy trước ca gọi init.
  svc._resetForTest();
  // Secure store giả cũng phải dọn: `_resetForTest()` chỉ xoá biến trong module,
  // còn state ĐÃ LƯU thì ca sau nạp lại và ăn theo ca trước.
  for (const k of Object.keys(mockSecureStoreData)) delete mockSecureStoreData[k];
  // `clearAllMocks` KHÔNG gỡ implementation → `mockRejectedValue` của ca trước còn
  // sống sang ca sau. Đặt lại mặc định "đẩy thành công" ở đây.
  mockCreateEpochSync.mockReset().mockResolvedValue(undefined);
  mockCreate.mockResolvedValue({ id: 'conv-1' });
  mockRoomKeyPackages.mockResolvedValue([
    { stakeAddress: ME, keyPackage: 'kp-me' }, // chính mình — phải bị loại
    { stakeAddress: 'did:phoenix:bob', keyPackage: 'kp-bob' },
    { stakeAddress: 'did:phoenix:kim', keyPackage: 'kp-kim' },
  ]);
});

describe('createGroupConversation', () => {
  it('chưa init → trả lỗi "chưa init", không gọi API', async () => {
    const r = await svc.createGroupConversation('Nhóm', ['did:phoenix:bob']);
    expect(r).toEqual({ ok: false, error: 'chưa init' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('init đặt danh tính = did (identityOverride cho test)', async () => {
    const r = await svc.init(ME);
    expect(r.status).toBe('ready');
  });

  it('tạo nhóm THẬT: create → roomKeyPackages → createGroup(loại self) → epochSync', async () => {
    await svc.init(ME);
    const r = await svc.createGroupConversation('Đội kỹ thuật', ['did:phoenix:bob', 'did:phoenix:kim']);
    expect(r.ok).toBe(true);
    expect(r.conversationId).toBe('conv-1');
    expect(mockCreate).toHaveBeenCalledWith({
      type: 'GROUP',
      title: 'Đội kỹ thuật',
      participantIds: ['did:phoenix:bob', 'did:phoenix:kim'],
    });
    // KeyPackage của chính mình (kp-me) bị loại; chỉ gửi kp-bob + kp-kim vào nhóm.
    expect(chatMls.createGroup).toHaveBeenCalledWith('conv-1', ['kp-bob', 'kp-kim']);
    expect(mockCreateEpochSync).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', welcomeMessage: 'W', commitMessage: 'C' }),
    );
  });

  it('loại trùng + tự loại mình khỏi participantIds gửi lên server', async () => {
    await svc.init(ME);
    await svc.createGroupConversation('X', ['did:phoenix:bob', 'did:phoenix:bob', ME, '  ']);
    expect(mockCreate).toHaveBeenCalledWith({
      type: 'GROUP',
      title: 'X',
      participantIds: ['did:phoenix:bob'],
    });
  });

  it('không còn thành viên nào (chỉ mình/rỗng) → lỗi, KHÔNG gọi API', async () => {
    await svc.init(ME);
    const r = await svc.createGroupConversation('X', [ME, '   ']);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/thành viên/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('thiếu tiêu đề → lỗi, KHÔNG gọi API', async () => {
    await svc.init(ME);
    const r = await svc.createGroupConversation('   ', ['did:phoenix:bob']);
    expect(r.ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('lỗi mạng khi create → trả ok:false + message, không ném', async () => {
    await svc.init(ME);
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    const r = await svc.createGroupConversation('Nhóm', ['did:phoenix:bob']);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });
});

// ── Nợ sau merge #95: Welcome kẹt + loại hội thoại + nhánh join ──────────────

describe('Welcome chưa lên được server', () => {
  it('đẩy epoch-sync lỗi → BÁO welcomePublished:false thay vì im lặng báo đã tạo', async () => {
    await svc.init(ME);
    mockCreateEpochSync.mockRejectedValueOnce(new Error('rớt mạng'));
    const r = await svc.createGroupConversation('Nhóm', ['did:phoenix:bob']);
    expect(r.ok).toBe(true);
    expect(r.welcomePublished).toBe(false);
    expect(await svc.getPendingEpochCount()).toBe(1);
  });

  it('lượt sau có mạng → flushPendingEpochs đẩy nốt, hàng chờ về rỗng', async () => {
    await svc.init(ME);
    mockCreateEpochSync.mockRejectedValueOnce(new Error('rớt mạng'));
    await svc.createGroupConversation('Nhóm', ['did:phoenix:bob']);
    expect(await svc.getPendingEpochCount()).toBe(1);

    const res = await svc.flushPendingEpochs();
    expect(res.sent).toBe(1);
    expect(res.remaining).toBe(0);
    expect(await svc.getPendingEpochCount()).toBe(0);
  });

  it('đẩy được ngay → welcomePublished:true, không có gì kẹt', async () => {
    await svc.init(ME);
    const r = await svc.createGroupConversation('Nhóm', ['did:phoenix:bob']);
    expect(r.welcomePublished).toBe(true);
    expect(await svc.getPendingEpochCount()).toBe(0);
  });
});

describe('loại hội thoại đi theo lựa chọn người dùng', () => {
  it('JOB_NEGOTIATION KHÔNG bị ép thành GROUP', async () => {
    await svc.init(ME);
    await svc.createGroupConversation('Đàm phán', ['did:phoenix:bob'], 'JOB_NEGOTIATION');
    expect(mockCreate).toHaveBeenCalledWith({
      type: 'JOB_NEGOTIATION',
      title: 'Đàm phán',
      participantIds: ['did:phoenix:bob'],
    });
  });

  it('không truyền loại → mặc định GROUP (giữ hành vi cũ)', async () => {
    await svc.init(ME);
    await svc.createGroupConversation('Nhóm', ['did:phoenix:bob']);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'GROUP' }));
  });
});

// ── Trần của hàng chờ epoch ─────────────────────────────────────────────────
//
// Trước bản vá: bản ghi CHỈ rời hàng chờ khi đẩy thành công. Server từ chối vĩnh
// viễn một bản ⇒ nó được gọi lại ở MỌI lần mở chat, mãi mãi; hàng chờ cũng không
// có trần kích thước. Các ca dưới đây khoá ba trần lại.

const PENDING_KEY = 'chat_mls_pending_epoch';
const MAX_ATTEMPTS = 8; // khớp MAX_EPOCH_ATTEMPTS trong proofchatService.ts
const MAX_QUEUE = 50; // khớp MAX_PENDING_EPOCHS
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // khớp PENDING_EPOCH_TTL_MS

/** Nạp sẵn hàng chờ vào secure store giả (như thể lần chạy trước để lại). */
const seedPending = (recs: unknown[]): void => {
  mockSecureStoreData[PENDING_KEY] = JSON.stringify(recs);
};

describe('hàng chờ epoch có trần', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    // dropPending() cố tình console.warn — đúng ý đồ (không nuốt im), nhưng đừng
    // để nó lấp đầy đầu ra test.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warnSpy.mockRestore());

  it('bản ghi định dạng CŨ (thiếu attempts/thời gian) vẫn đọc được, không sập', async () => {
    seedPending([
      { conversationId: 'conv-cũ', epoch: 3, commitMessage: 'C', welcomeMessage: 'W' },
    ]);
    expect(await svc.getPendingEpochCount()).toBe(1);

    const res = await svc.flushPendingEpochs();
    expect(res).toEqual({ sent: 1, remaining: 0, dropped: 0 });
    // Chỉ 4 trường đi lên server — sổ sách nội bộ KHÔNG rò ra API.
    expect(mockCreateEpochSync).toHaveBeenCalledWith({
      conversationId: 'conv-cũ',
      epoch: 3,
      commitMessage: 'C',
      welcomeMessage: 'W',
    });
  });

  it('bản ghi cũ KHÔNG bị coi là quá hạn ngay lần mở đầu tiên', async () => {
    // Thiếu firstQueuedAt → tuổi tính từ LÚC ĐỌC, không phải mốc 0 (1970).
    seedPending([{ conversationId: 'c', epoch: 1, commitMessage: '', welcomeMessage: 'W' }]);
    mockCreateEpochSync.mockRejectedValue(new Error('rớt mạng'));

    const res = await svc.flushPendingEpochs();
    expect(res.remaining).toBe(1);
    expect(res.dropped).toBe(0);
  });

  it('server hỏng vĩnh viễn → sau đúng 8 lần thử thì RỜI hàng chờ, không gọi lại nữa', async () => {
    seedPending([{ conversationId: 'conv-hỏng', epoch: 1, commitMessage: 'C', welcomeMessage: 'W' }]);
    mockCreateEpochSync.mockRejectedValue(new Error('server từ chối vĩnh viễn'));

    for (let i = 0; i < 20; i += 1) await svc.flushPendingEpochs();

    expect(mockCreateEpochSync).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const stats = await svc.getEpochQueueStats();
    expect(stats.pending).toBe(0);
    expect(stats.dropped).toBe(1);
    expect(stats.drops[0]).toMatchObject({
      conversationId: 'conv-hỏng',
      epoch: 1,
      attempts: MAX_ATTEMPTS,
      reason: 'attempts',
    });
  });

  it('bản quá 7 ngày → rời hàng chờ, KHÔNG gọi server lần nào nữa', async () => {
    seedPending([
      {
        conversationId: 'conv-hết-hạn',
        epoch: 2,
        commitMessage: 'C',
        welcomeMessage: 'W',
        attempts: 2,
        firstQueuedAt: Date.now() - TTL_MS - 60_000,
        lastAttemptAt: Date.now() - 60_000,
      },
    ]);

    const res = await svc.flushPendingEpochs();
    expect(mockCreateEpochSync).not.toHaveBeenCalled();
    expect(res).toEqual({ sent: 0, remaining: 0, dropped: 1 });
    const stats = await svc.getEpochQueueStats();
    expect(stats.drops[0]).toMatchObject({ conversationId: 'conv-hết-hạn', reason: 'expired' });
  });

  it('hàng chờ vượt trần 50 → bỏ bản VÀO SỚM NHẤT, giữ bản mới', async () => {
    const now = Date.now();
    seedPending(
      Array.from({ length: 55 }, (_, i) => ({
        conversationId: `conv-${i}`,
        epoch: 1,
        commitMessage: 'C',
        welcomeMessage: 'W',
        attempts: 0,
        firstQueuedAt: now - (55 - i) * 1000,
        lastAttemptAt: now,
      })),
    );
    mockCreateEpochSync.mockRejectedValue(new Error('rớt mạng'));

    const res = await svc.flushPendingEpochs();
    expect(res.remaining).toBe(MAX_QUEUE);
    expect(res.dropped).toBe(5);
    const stats = await svc.getEpochQueueStats();
    // 5 bản vào sớm nhất là conv-0..conv-4.
    expect(stats.drops.map((d) => d.conversationId)).toEqual([
      'conv-0', 'conv-1', 'conv-2', 'conv-3', 'conv-4',
    ]);
    expect(stats.drops.every((d) => d.reason === 'overflow')).toBe(true);
  });

  it('sổ bản hỏng SỐNG QUA lần mở lại (đọc từ secure store), rồi xoá được', async () => {
    seedPending([
      {
        conversationId: 'conv-hết-hạn',
        epoch: 9,
        commitMessage: '',
        welcomeMessage: 'W',
        attempts: 1,
        firstQueuedAt: Date.now() - TTL_MS - 1,
        lastAttemptAt: Date.now(),
      },
    ]);
    await svc.flushPendingEpochs();
    expect((await svc.getEpochQueueStats()).dropped).toBe(1);

    // Mở lại app: state module trắng, nhưng sổ đã lưu → UI vẫn nói được "1 bản hỏng".
    svc._resetForTest();
    expect((await svc.getEpochQueueStats()).dropped).toBe(1);

    await svc.acknowledgeDroppedEpochs();
    expect((await svc.getEpochQueueStats()).dropped).toBe(0);
    svc._resetForTest();
    expect((await svc.getEpochQueueStats()).dropped).toBe(0);
  });

  it('secureLoad hỏng → hàng chờ về rỗng chứ không ném ra luồng chat', async () => {
    const taadMock = jest.requireMock('../sdk/taadEnclave') as { secureLoad: jest.Mock };
    taadMock.secureLoad.mockRejectedValueOnce(new Error('keystore lỗi'));
    await expect(svc.getPendingEpochCount()).resolves.toBe(0);
  });
});
