/**
 * Ghim MỘT ràng buộc: **vườn lấy từ máy chủ về phải NẰM TRONG store.**
 *
 * `syncTreesFromBackend` có `.fulfilled` đổ cây vào `state.farm.trees`
 * (`farmSlice.ts` — `addCase(syncTreesFromBackend.fulfilled, …)`), còn
 * `syncFarmsFromBackend` thì KHÔNG có nhánh nào. Hai thunk sinh đôi, một cái nối
 * dây, một cái không — và chỗ hụt không kêu lên: thunk vẫn `fulfilled`, vẫn trả
 * đúng mảng vườn, chỉ là mảng đó rơi xuống đất.
 *
 * Hai màn gọi nó đang tự bù bằng tay theo hai cách khác nhau:
 *   - `FarmListScreen.tsx:178` gọi thêm `loadFarms` trong `.finally`
 *   - `DashboardScreen.tsx:247` đọc thẳng giá trị trả về qua `.unwrap()`
 * Cả hai đều làm việc mà reducer phải làm. Màn thứ ba dispatch thunk này rồi đọc
 * `state.farm.farms` sẽ thấy danh sách CŨ mà không có gì báo.
 *
 * Bài này chạy THUNK THẬT trên store thật (chỉ giả lập lớp mạng + kho máy), rồi
 * đọc state — không đo mã nguồn bằng biểu thức chính quy.
 */
import { configureStore } from '@reduxjs/toolkit';

jest.mock('../../../services/orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/farmService', () => ({
  listFarms: jest.fn(),
}));
jest.mock('../../../services/databaseManager', () => ({
  databaseManager: { ensureReady: jest.fn() },
}));
jest.mock('../../../utils/database', () => ({
  database: {
    saveFarm: jest.fn().mockResolvedValue(undefined),
    getFarms: jest.fn().mockResolvedValue([]),
  },
}));

import { listFarms } from '../../../services/farmService';
import { database } from '../../../utils/database';
import farmReducer, { syncFarmsFromBackend, setFarms } from './farmSlice';

const mockListFarms = listFarms as jest.MockedFunction<any>;

function makeStore() {
  return configureStore({
    reducer: { farm: farmReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

const SERVER_FARM = { id: 'farm-from-server', name: 'Vườn Bưởi', coordinates: [] };

beforeEach(() => {
  jest.clearAllMocks();
  (database.getFarms as jest.Mock).mockResolvedValue([]);
});

describe('syncFarmsFromBackend đổ kết quả vào store', () => {
  it('máy chủ trả vườn → `state.farm.farms` mang đúng vườn đó', async () => {
    mockListFarms.mockResolvedValue({ ok: true, farms: [SERVER_FARM] });
    const store = makeStore();

    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    const farms = store.getState().farm.farms;
    expect(farms).toHaveLength(1);
    expect(farms[0].id).toBe('farm-from-server');
    // `userId` được gán từ tham số để `loadFarms(userId)` sau này khớp cache.
    expect((farms[0] as any).userId).toBe('user-1');
  });

  it('máy chủ hỏng → lùi về cache SQLite, và CHÍNH cache đó vào store', async () => {
    mockListFarms.mockResolvedValue({ ok: false, error: { type: 'server_error' } });
    (database.getFarms as jest.Mock).mockResolvedValue([
      { id: 'farm-from-cache', name: 'Vườn Cam', coordinates: [], userId: 'user-1' },
    ]);
    const store = makeStore();

    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    expect(store.getState().farm.farms.map((f: any) => f.id)).toEqual(['farm-from-cache']);
  });

  it('thay thế danh sách cũ, không cộng dồn thành vườn trùng', async () => {
    const store = makeStore();
    store.dispatch(setFarms([{ id: 'farm-from-server', name: 'Tên cũ', coordinates: [] } as any]));
    mockListFarms.mockResolvedValue({ ok: true, farms: [{ ...SERVER_FARM, name: 'Tên mới' }] });

    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    const farms = store.getState().farm.farms;
    expect(farms).toHaveLength(1);
    expect(farms[0].name).toBe('Tên mới');
  });
});
