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

jest.mock('../sdk/taadEnclave', () => ({
  secureLoad: jest.fn(async () => null),
  secureStore: jest.fn(async () => undefined),
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
