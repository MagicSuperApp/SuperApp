/**
 * `init()` gọi lần hai phải là việc RẺ, không phải việc HẠI.
 *
 * ── Vì sao bài này tồn tại ──────────────────────────────────────────────────
 * Tới 2026-09-14, đúng MỘT màn gọi `init()`: màn danh sách phòng. Nên người vào
 * phòng từ đường khác — nút nhắn tin ở tin tuyển việc, ở hồ sơ thợ, hay một
 * thông báo đẩy — chưa bao giờ có phiên: gõ xong bấm gửi thì nhận chuỗi nội bộ
 * `'chưa init'`, và tin người kia gửi sang cũng không tới vì chưa ai nghe socket.
 *
 * Bản vá cho màn phòng cùng gọi `init()`. Nhưng chính bản vá đó mở ra một hỏng
 * NẶNG HƠN nếu `init()` không tự chặn: `chatSocket.connect()` đã bỏ qua khi
 * socket còn sống, còn `wireSocketHandlers()` thì KHÔNG — gọi lại là đăng ký
 * thêm một tay nghe nữa trên cùng socket, mỗi tin tới được xử hai lần, và người
 * dùng thấy mọi tin nhân đôi. Không có `catch` nào bắt được, không có kiểu nào
 * đỏ: cả hai lần gọi đều "thành công".
 *
 * Bài này đo đúng một đại lượng: SỐ LẦN `onMessage` được đăng ký.
 */

jest.mock('../sdk/chatMls', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(() => true),
    importState: jest.fn(async () => undefined),
    exportState: jest.fn(async () => 'blob'),
    newIdentity: jest.fn(async () => undefined),
    generateKeyPackage: jest.fn(async () => 'kp-self'),
    freeIdentity: jest.fn(async () => undefined),
  },
}));

jest.mock('../sdk/taadEnclave', () => ({
  secureLoad: jest.fn(async () => null),
  secureStore: jest.fn(async () => true),
}));

jest.mock('./proofchat-api', () => ({
  __esModule: true,
  isProofChatBackendEnabled: jest.fn(() => true),
  proofChatApi: {
    mls: {
      keyPackageStatus: jest.fn(async () => ({ exists: true })),
      publishKeyPackage: jest.fn(async () => undefined),
    },
  },
}));

jest.mock('./proofchatAuthBridge', () => ({
  connectProofChat: jest.fn(async () => ({ status: 'connected' })),
}));

jest.mock('./proofchatIdentity', () => ({
  getDid: jest.fn(async () => 'did:phoenix:nguoi-dung-mot'),
  getMerkleSession: jest.fn(async () => undefined),
}));

jest.mock('./proofchatMessage', () => ({
  assembleOutgoing: jest.fn(),
  processIncoming: jest.fn(),
  needsMerkleVerification: jest.fn(() => false),
}));

/**
 * Socket giả có TRẠNG THÁI: `isConnected()` phải phản ánh việc `connect()` đã
 * chạy hay chưa. Một mock luôn trả `false` sẽ làm bài này xanh vì lý do sai —
 * nó đo mất chính cái cổng đang cần ghim.
 */
let mockSocketConnected = false;
const mockOnMessage = jest.fn(() => jest.fn());
jest.mock('./chatSocket', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(async () => {
      mockSocketConnected = true;
    }),
    disconnect: jest.fn(() => {
      mockSocketConnected = false;
    }),
    isConnected: jest.fn(() => mockSocketConnected),
    sendMessage: jest.fn(async () => ({ success: true, messageId: 'm1' })),
    onMessage: (...args: unknown[]) => mockOnMessage(...(args as [])),
    onEpochSync: jest.fn(() => jest.fn()),
  },
}));

import { init, shutdown } from './proofchatService';

describe('init() gọi nhiều lần', () => {
  beforeEach(async () => {
    await shutdown().catch(() => undefined);
    mockSocketConnected = false;
    mockOnMessage.mockClear();
  });

  it('lần đầu mở phiên và đăng ký đúng MỘT tay nghe tin', async () => {
    const res = await init();

    expect(res.status).toBe('ready');
    expect(mockOnMessage).toHaveBeenCalledTimes(1);
  });

  it('lần thứ hai KHÔNG đăng ký thêm tay nghe nào — tin không bị xử hai lần', async () => {
    await init();
    mockOnMessage.mockClear();

    const res = await init();

    expect(res.status).toBe('ready');
    // Đây là phép đo của cả bài: thêm một lần đăng ký nữa nghĩa là mỗi tin tới
    // sẽ hiện hai lần trên màn của người dùng.
    expect(mockOnMessage).not.toHaveBeenCalled();
  });

  it('đổi sang danh tính KHÁC thì phải mở phiên lại, không dùng phiên cũ', async () => {
    await init('did:phoenix:nguoi-dung-mot');
    mockOnMessage.mockClear();

    // Máy đổi chủ (đăng xuất rồi người khác đăng nhập). Giữ phiên cũ ở đây là
    // để tin của người này đi ra dưới tên người kia — hỏng nặng hơn nhân đôi.
    const res = await init('did:phoenix:nguoi-dung-hai');

    expect(res.status).toBe('ready');
    expect(mockOnMessage).toHaveBeenCalledTimes(1);
  });

  it('socket rụng thì lần gọi sau phải nối lại, không im lặng coi là còn sống', async () => {
    await init();
    mockOnMessage.mockClear();

    mockSocketConnected = false; // mạng rớt

    const res = await init();

    expect(res.status).toBe('ready');
    expect(mockOnMessage).toHaveBeenCalledTimes(1);
  });
});
