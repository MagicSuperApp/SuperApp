/**
 * Đăng xuất KHÔNG được báo thành công khi máy vẫn giữ giấy uỷ nhiệm người trước.
 *
 * ── Ca được ghim ───────────────────────────────────────────────────────────
 * `logoutUser` bọc từng bước dọn trong `try/catch` riêng rồi nuốt lỗi bằng một
 * dòng `console.warn`. Với bước DỌN thì đúng. Với `clearOrilifeToken()` thì sai,
 * và chú thích liền kề đã tự gọi tên nó là *"⛔ Đường RÒ LỚN NHẤT"*: 17 chỗ trong
 * app đọc thẳng `auth_token`.
 *
 * Kịch bản: `AsyncStorage.multiRemove` hỏng (đĩa đầy, kho khoá bận) ⟹ `warn` ⟹
 * `logoutUser.fulfilled` ⟹ màn về Login ⟹ **người sau đăng nhập trên cùng máy,
 * mọi lời gọi vẫn đi ra mang danh người trước tới 12 giờ.**
 * Kèm theo: `clearOrilifeLoginCooldown()` đứng SAU dòng hỏng nên KHÔNG chạy, tức
 * người sau vừa gánh thẻ người trước vừa phải ngồi hết đồng hồ nghỉ của người trước.
 *
 * ── Ba điều bài này chứng minh ────────────────────────────────────────────
 * 1. Bước thu hồi được THỬ LẠI, không bỏ cuộc sau một lần trượt.
 * 2. Trượt hẳn thì người dùng ĐỌC ĐƯỢC — `state.user.error` mang câu cảnh báo.
 * 3. Mở van đăng nhập chạy BẤT KỂ bước thu hồi có trượt hay không.
 */
import { configureStore } from '@reduxjs/toolkit';

const mockClearOrilifeToken = jest.fn(async () => undefined);
const mockClearOrilifeLoginCooldown = jest.fn();
const mockClearSessionToken = jest.fn(async () => undefined);
const mockClearSessionMintCooldown = jest.fn();

jest.mock('../services/orilifeDidAuth', () => ({
  clearOrilifeToken: () => mockClearOrilifeToken(),
  clearOrilifeLoginCooldown: () => mockClearOrilifeLoginCooldown(),
}));
jest.mock('../services/phoenixKey-api', () => ({
  phoenixKeyApi: { wallet: { getAll: jest.fn() }, identity: { getDocument: jest.fn(), getStatus: jest.fn() } },
  clearSessionToken: () => mockClearSessionToken(),
  clearSessionMintCooldown: () => mockClearSessionMintCooldown(),
  summarizeWalletAll: jest.fn(),
}));
jest.mock('../services/phoenixDid', () => ({ parseDidNetwork: jest.fn(() => null) }));
jest.mock('../modules/work/services/session', () => ({ clearWorkSession: jest.fn(async () => undefined) }));
jest.mock('../services/proofchatAuthBridge', () => ({ disconnectProofChat: jest.fn(async () => undefined) }));
jest.mock('../services/proofchatIdentity', () => ({ clearMerkleSession: jest.fn(async () => undefined) }));
jest.mock('../services/proofchatService', () => ({ shutdown: jest.fn(async () => undefined) }));
jest.mock('../services/treeDedupCache', () => ({ clearTreeDedupCache: jest.fn(async () => undefined) }));
jest.mock('../services/deviceKeyRisk', () => ({ resetRiskSnooze: jest.fn(async () => undefined) }));
jest.mock('../services/treeDraftStore', () => ({ clearAllDrafts: jest.fn(async () => undefined) }));
jest.mock('../services/videoUploadQueue', () => ({
  setVideoQueueOwner: jest.fn(),
  flushVideoUploadQueue: jest.fn(),
}));
jest.mock('../services/databaseManager', () => ({
  databaseManager: { ensureReady: jest.fn(), closeDatabase: jest.fn(async () => undefined) },
}));
jest.mock('../utils/database', () => ({
  database: { getWallet: jest.fn(), getPhoenixKey: jest.fn(), saveWallet: jest.fn() },
}));

import userReducer, { logoutUser, logoutRevokeWarning } from './userSlice';

function makeStore() {
  return configureStore({
    reducer: { user: userReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

/** Kho hỏng đúng `times` lượt đầu rồi lành — để đo lượt thử lại có thật không. */
function failFirst(mock: jest.Mock, times: number): void {
  let seen = 0;
  mock.mockImplementation(async () => {
    seen += 1;
    if (seen <= times) throw new Error('kho khoá đang bận');
    return undefined;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClearOrilifeToken.mockImplementation(async () => undefined);
  mockClearSessionToken.mockImplementation(async () => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('logoutUser — thu hồi giấy uỷ nhiệm KHÔNG còn là best-effort', () => {
  it('đăng xuất sạch ⟹ `error` là `null` như cũ', async () => {
    const store = makeStore();

    await store.dispatch(logoutUser() as never);

    expect(store.getState().user.error).toBeNull();
    expect(mockClearOrilifeToken).toHaveBeenCalledTimes(1);
  });

  it('kho hỏng MỘT nhịp ⟹ THỬ LẠI và thu hồi được, không báo động oan', async () => {
    failFirst(mockClearOrilifeToken, 1);
    const store = makeStore();

    await store.dispatch(logoutUser() as never);

    expect(mockClearOrilifeToken).toHaveBeenCalledTimes(2);
    expect(store.getState().user.error).toBeNull();
  });

  it('kho hỏng HẲN ⟹ người dùng ĐỌC ĐƯỢC là máy còn thẻ của họ', async () => {
    mockClearOrilifeToken.mockRejectedValue(new Error('đĩa đầy'));
    const store = makeStore();

    await store.dispatch(logoutUser() as never);

    const err = store.getState().user.error;
    // Trước bản vá dòng này là `null`: một `console.warn` không ai đọc.
    expect(err).not.toBeNull();
    expect(err).toMatch(/thẻ đăng nhập OriLife/);
    expect(err).toMatch(/mang danh bạn/);
  });

  it('thẻ phiên PhoenixKey trượt hẳn ⟹ cũng vào câu cảnh báo', async () => {
    mockClearSessionToken.mockRejectedValue(new Error('đĩa đầy'));
    const store = makeStore();

    await store.dispatch(logoutUser() as never);

    expect(store.getState().user.error).toMatch(/thẻ phiên PhoenixKey/);
  });

  it('hai thẻ cùng trượt ⟹ câu nói ra CẢ HAI, không chỉ cái đầu', async () => {
    mockClearOrilifeToken.mockRejectedValue(new Error('đĩa đầy'));
    mockClearSessionToken.mockRejectedValue(new Error('đĩa đầy'));
    const store = makeStore();

    await store.dispatch(logoutUser() as never);

    const err = store.getState().user.error ?? '';
    expect(err).toMatch(/thẻ đăng nhập OriLife/);
    expect(err).toMatch(/thẻ phiên PhoenixKey/);
  });

  it('thu hồi thẻ OriLife trượt ⟹ van đăng nhập VẪN mở', async () => {
    // Bản trước hai lệnh chung một `try`: dòng đầu ném là van không mở, nên
    // người sau vừa gánh thẻ người trước vừa phải chờ hết đồng hồ nghỉ của họ.
    mockClearOrilifeToken.mockRejectedValue(new Error('đĩa đầy'));
    const store = makeStore();

    await store.dispatch(logoutUser() as never);

    expect(mockClearOrilifeLoginCooldown).toHaveBeenCalledTimes(1);
  });

  it('vẫn `fulfilled` ⟹ các slice khác vẫn dọn dữ liệu người vừa đăng xuất', async () => {
    // `rejected` sẽ giữ nguyên vườn/cây/hàng chờ của người trước trong bộ nhớ —
    // vá một đường rò bằng cách mở một đường rò to hơn.
    mockClearOrilifeToken.mockRejectedValue(new Error('đĩa đầy'));
    const store = makeStore();

    const action = await store.dispatch(logoutUser() as never);

    expect((action as { type: string }).type).toBe('user/logoutUser/fulfilled');
    expect(store.getState().user.currentUser).toBeNull();
  });
});

describe('logoutRevokeWarning', () => {
  it('không có gì sót ⟹ `null`, đừng dựng cảnh báo rỗng', () => {
    expect(logoutRevokeWarning([])).toBeNull();
  });

  it('có tên ⟹ câu nêu ĐÍCH DANH thứ còn sót', () => {
    const s = logoutRevokeWarning(['thẻ đăng nhập OriLife']) ?? '';
    expect(s).toMatch(/thẻ đăng nhập OriLife/);
  });
});
