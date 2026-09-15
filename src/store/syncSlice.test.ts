/**
 * syncSlice — hai lỗ im lặng, đo trên store THẬT (không mock reducer).
 *
 * 1. Một hành động mang chuỗi `'sync/loadSyncQueue'` TRẦN đi qua store mà không
 *    làm gì cả. `createAsyncThunk` chỉ phát `…/pending|fulfilled|rejected`, nên
 *    không `addCase` nào khớp chuỗi trần — `syncService.addSyncItem` đã phát đúng
 *    chuỗi đó suốt và hàng đợi trong Redux chưa bao giờ được nạp.
 * 2. Ba cửa GHI (`addToSyncQueue`/`updateSyncStatus`/`removeFromSyncQueue`) hỏng
 *    thì `createAsyncThunk` KHÔNG ném — nó phát `…/rejected`. Không bắt nhánh đó
 *    thì lần xoá hỏng biến mất không dấu vết, và mục ĐÃ gửi lên máy chủ sẽ được
 *    gửi lại ở vòng sau.
 */

let mockQueueRows: any[] = [];
let mockRemoveShouldFail = false;
let mockUpdateShouldFail = false;

jest.mock('../utils/database', () => ({
  __esModule: true,
  database: {
    isInitialized: () => true,
    getSyncQueue: async () => mockQueueRows,
    addToSyncQueue: jest.fn(async () => {}),
    updateSyncStatus: jest.fn(async () => {
      if (mockUpdateShouldFail) throw new Error('database is locked');
    }),
    removeFromSyncQueue: jest.fn(async () => {
      if (mockRemoveShouldFail) throw new Error('database is locked');
    }),
  },
}));

import { configureStore } from '@reduxjs/toolkit';
import syncReducer, {
  loadSyncQueue,
  removeFromSyncQueue,
  updateSyncStatus,
  setSyncQueue,
} from './syncSlice';

function freshStore() {
  return configureStore({ reducer: { sync: syncReducer } });
}

/** Một dòng hàng đợi đúng hình dạng slice giữ. */
function row(transactionId: string) {
  return {
    id: 1,
    transactionId,
    payload: '{}',
    mediaPaths: [],
    status: 'pending' as const,
    createdAt: '2026-09-10T01:00:00.000Z',
    updatedAt: '2026-09-10T01:00:00.000Z',
  };
}

beforeEach(() => {
  mockQueueRows = [row('activity_1'), row('activity_2')];
  mockRemoveShouldFail = false;
  mockUpdateShouldFail = false;
});

describe('nạp hàng đợi', () => {
  it('chuỗi TRẦN `sync/loadSyncQueue` KHÔNG khớp reducer nào — nó là mã chết', async () => {
    const store = freshStore();
    store.dispatch({ type: 'sync/loadSyncQueue' } as any);
    // Xả mọi microtask: nếu chuỗi trần có gọi được gì thì nó đã kịp chạy.
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(store.getState().sync.queue).toEqual([]);
    expect(store.getState().sync.isLoading).toBe(false);
  });

  it('thunk THẬT thì nạp đủ — đây là chỗ khác nhau giữa hai lời gọi trông y hệt', async () => {
    const store = freshStore();
    await store.dispatch(loadSyncQueue());

    expect(store.getState().sync.queue.map(q => q.transactionId))
      .toEqual(['activity_1', 'activity_2']);
  });
});

describe('cửa ghi hỏng thì phải để lại dấu', () => {
  it('xoá hỏng → `state.error` có chữ, và mục KHÔNG bị coi như đã xoá', async () => {
    const store = freshStore();
    store.dispatch(setSyncQueue([row('activity_1')]));
    mockRemoveShouldFail = true;

    const action: any = await store.dispatch(removeFromSyncQueue('activity_1'));

    // Thunk KHÔNG ném — nó trả một hành động rejected. Đây chính là chỗ lời từ
    // chối biến mất nếu slice không bắt.
    expect(action.type).toBe('sync/removeFromSyncQueue/rejected');
    expect(store.getState().sync.error).toMatch(/database is locked|xoá được/);
    // Và hàng đợi phải còn nguyên: xoá hỏng mà state rỗng đi là nói dối về CSDL.
    expect(store.getState().sync.queue.map(q => q.transactionId)).toEqual(['activity_1']);
  });

  it('cập nhật trạng thái hỏng → `state.error` có chữ', async () => {
    const store = freshStore();
    mockUpdateShouldFail = true;

    const action: any = await store.dispatch(
      updateSyncStatus({ transactionId: 'activity_1', status: 'pending' }),
    );

    expect(action.type).toBe('sync/updateSyncStatus/rejected');
    expect(store.getState().sync.error).toMatch(/database is locked|cập nhật được/);
  });

  it('xoá THÀNH CÔNG thì không để lại lỗi giả', async () => {
    const store = freshStore();
    store.dispatch(setSyncQueue([row('activity_1')]));

    await store.dispatch(removeFromSyncQueue('activity_1'));

    expect(store.getState().sync.error).toBeNull();
    expect(store.getState().sync.queue).toEqual([]);
  });
});
