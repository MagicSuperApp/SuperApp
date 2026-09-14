/**
 * Đường ĐẦY ĐỦ: máy chủ trả `200 {"ok": false}` ⟹ store PHẢI nói là chưa đồng bộ.
 *
 * Bài này chạy `farmService.listFarms` THẬT (chỉ giả lập `fetch`) rồi chạy thunk
 * THẬT trên store thật — khác các bài anh em trong thư mục này, vốn giả lập luôn
 * `listFarms` nên không chạm được tầng đọc thân.
 *
 * Ca đo được trước bản vá: `listFarms` trả `{ok:true, farms:[]}` cho một lần bị
 * TỪ CHỐI ⟹ `source: 'server'`, `syncError: null` ⟹ màn vườn hiện *"chưa có
 * trang trại nào"* kèm lời mời tạo mới ⟹ người dùng tạo lại vườn đã tồn tại.
 *
 * Hai trạng thái phải RA HAI KẾT QUẢ KHÁC NHAU, và đó là toàn bộ điểm của bài.
 */
import { configureStore } from '@reduxjs/toolkit';

jest.mock('../../../services/orilifeDidAuth', () => ({
  __esModule: true,
  ensureOrilifeToken: jest.fn(async () => true),
  clearOrilifeToken: jest.fn(async () => undefined),
  clearOrilifeLoginCooldown: jest.fn(),
}));
jest.mock('../../../services/databaseManager', () => ({
  databaseManager: { ensureReady: jest.fn() },
}));
jest.mock('../../../utils/database', () => ({
  database: {
    saveFarm: jest.fn(async () => undefined),
    getFarms: jest.fn(async () => []),
  },
}));

import farmReducer, { syncFarmsFromBackend } from './farmSlice';

const REFUSAL = 'Tài khoản của bạn đang bị tạm khoá quyền xem vườn.';
const REFUSAL_EXACT = /^Tài khoản của bạn đang bị tạm khoá quyền xem vườn\.$/;

function makeStore() {
  return configureStore({
    reducer: { farm: farmReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

function serve(body: Record<string, unknown>): void {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  })) as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('syncFarmsFromBackend trước một lời từ chối đội lốt 200', () => {
  it('bị TỪ CHỐI ⟹ `farmsSyncError` mang NGUYÊN VĂN câu máy chủ', async () => {
    serve({ ok: false, error: REFUSAL });
    const store = makeStore();

    await store.dispatch(syncFarmsFromBackend('user-1') as never);

    const state = store.getState().farm;
    // Trước bản vá dòng này là `null` — app khẳng định đã đồng bộ xong.
    expect(state.farmsSyncError).toMatch(REFUSAL_EXACT);
  });

  it('danh sách rỗng THẬT ⟹ `farmsSyncError` là `null`, và đó là ca hợp lệ', async () => {
    serve({ ok: true, farms: [] });
    const store = makeStore();

    await store.dispatch(syncFarmsFromBackend('user-1') as never);

    const state = store.getState().farm;
    expect(state.farmsSyncError).toBeNull();
    expect(state.farms).toEqual([]);
  });

  it('hai ca trên cho ra HAI giá trị khác nhau — nếu không thì màn không tách được', async () => {
    serve({ ok: false, error: REFUSAL });
    const refused = makeStore();
    await refused.dispatch(syncFarmsFromBackend('user-1') as never);

    serve({ ok: true, farms: [] });
    const empty = makeStore();
    await empty.dispatch(syncFarmsFromBackend('user-1') as never);

    expect(refused.getState().farm.farmsSyncError).not.toEqual(
      empty.getState().farm.farmsSyncError,
    );
  });
});
