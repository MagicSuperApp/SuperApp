/**
 * Máy chủ chết KHÁC "chưa có vườn nào" — ghim ở tầng store.
 *
 * ── Lỗi được vá ────────────────────────────────────────────────────────────
 * `syncFarmsFromBackend` bắt mọi lỗi rồi lùi về bộ nhớ đệm, và đệm rỗng thì trả
 * `[]`. Hàm KHÔNG có đường nào trả về trạng thái từ chối — nó chỉ `fulfilled`.
 * Nên `farms.length === 0`, `offline === false` (máy VẪN có mạng: Wi-Fi cổng
 * đăng nhập, sóng yếu có IP nhưng không có tuyến, máy chủ 5xx), `error === null`
 * (trường đó chỉ được đặt từ đường đọc SQLite cục bộ) — cả ba điều kiện đều im,
 * và màn rơi thẳng vào "chưa có trang trại nào" kèm lời mời tạo vườn mới.
 *
 * ── Ca bắt buộc của bài này ────────────────────────────────────────────────
 * Hai lượt gọi cùng cho ra `farms === []`, nhưng vì hai lý do khác nhau, và
 * store phải PHÂN BIỆT được chúng. Thiếu ca đó thì mọi ca còn lại chỉ đang đo
 * rằng mảng rỗng vẫn là mảng rỗng.
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
    saveTree: jest.fn().mockResolvedValue(undefined),
    getTrees: jest.fn().mockResolvedValue([]),
  },
}));

import { listFarms } from '../../../services/farmService';
import { database } from '../../../utils/database';
import farmReducer, { syncFarmsFromBackend, syncTreesFromBackend } from './farmSlice';

const mockListFarms = listFarms as jest.MockedFunction<any>;

function makeStore() {
  return configureStore({
    reducer: { farm: farmReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (database.getFarms as jest.Mock).mockResolvedValue([]);
  (database.getTrees as jest.Mock).mockResolvedValue([]);
});

describe('danh sách rỗng — HAI lý do, HAI trạng thái', () => {
  it('máy chủ trả lời "không có vườn nào" → rỗng, và KHÔNG có lỗi đồng bộ', () => {
    mockListFarms.mockResolvedValue({ ok: true, farms: [] });
    const store = makeStore();
    return store.dispatch(syncFarmsFromBackend('user-1') as any).then(() => {
      expect(store.getState().farm.farms).toEqual([]);
      // `null` ở đây là thứ cho phép màn nói "chưa có vườn nào" — và nó chỉ
      // đúng vì app ĐÃ hỏi được.
      expect(store.getState().farm.farmsSyncError).toBeNull();
    });
  });

  it('máy chủ chết + đệm rỗng → cũng rỗng, NHƯNG mang lý do', async () => {
    mockListFarms.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'HTTP 503', http_status: 503 },
    });
    const store = makeStore();

    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    expect(store.getState().farm.farms).toEqual([]);
    expect(store.getState().farm.farmsSyncError).toBeTruthy();
  });

  it('HAI ca trên cho ra HAI trạng thái khác nhau — đây là cả điểm của bản vá', async () => {
    // Cùng một `farms: []`. Nếu hai giá trị dưới đây bằng nhau thì màn hình
    // không có cách nào phân biệt, và nó sẽ lại chọn câu nguy hiểm hơn.
    mockListFarms.mockResolvedValue({ ok: true, farms: [] });
    const a = makeStore();
    await a.dispatch(syncFarmsFromBackend('user-1') as any);

    mockListFarms.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'HTTP 503', http_status: 503 },
    });
    const b = makeStore();
    await b.dispatch(syncFarmsFromBackend('user-1') as any);

    expect(a.getState().farm.farms).toEqual(b.getState().farm.farms);
    expect(a.getState().farm.farmsSyncError).not.toEqual(b.getState().farm.farmsSyncError);
  });
});

describe('lý do đi kèm là câu DÀNH CHO NGƯỜI DÙNG', () => {
  it('máy chủ có câu riêng thì giữ NGUYÊN câu đó', async () => {
    // `reason` là câu máy chủ viết cho người dùng. Thay nó bằng câu chung chung
    // của app là ném đi thứ duy nhất nói được người dùng phải làm gì.
    mockListFarms.mockResolvedValue({
      ok: false,
      error: {
        type: 'validation_error',
        detail: 'bad request',
        http_status: 400,
        reason: 'Tài khoản này chưa được duyệt để xem vườn.',
      },
    });
    const store = makeStore();

    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    expect(store.getState().farm.farmsSyncError).toBe('Tài khoản này chưa được duyệt để xem vườn.');
  });

  it('lỗi tầng kết nối thì kèm MÃ THAM CHIẾU, không kèm nguyên văn lỗi hệ thống', async () => {
    mockListFarms.mockRejectedValue(new TypeError('Network request failed'));
    const store = makeStore();

    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    const loi = store.getState().farm.farmsSyncError ?? '';
    expect(loi).toContain('mã:');
    // Cực đối xứng: câu KHÔNG được chứa nguyên văn thông điệp thô của hệ thống.
    expect(loi).not.toContain('Network request failed');
  });
});

describe('lý do KHÔNG được dính lại sau khi máy chủ trả lời được', () => {
  it('hỏng rồi tới nơi → `farmsSyncError` về `null`', async () => {
    mockListFarms.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'HTTP 503', http_status: 503 },
    });
    const store = makeStore();
    await store.dispatch(syncFarmsFromBackend('user-1') as any);
    expect(store.getState().farm.farmsSyncError).toBeTruthy();

    mockListFarms.mockResolvedValue({
      ok: true,
      farms: [{ id: 'farm-1', name: 'Vườn Bưởi', coordinates: [] }],
    });
    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    expect(store.getState().farm.farmsSyncError).toBeNull();
    expect(store.getState().farm.farms).toHaveLength(1);
  });
});

describe('máy chủ chết VÀ đệm cũng hỏng → TỪ CHỐI, không trả mảng rỗng', () => {
  it('thunk đi vào `.rejected`, và lý do tới được store', async () => {
    // Đây là ca app KHÔNG BIẾT người dùng có bao nhiêu vườn. Trả `[]` ở đây là
    // bịa ra câu trả lời "không có vườn nào".
    mockListFarms.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'HTTP 503', http_status: 503 },
    });
    (database.getFarms as jest.Mock).mockRejectedValue(new Error('database is locked'));
    const store = makeStore();

    const ket = await store.dispatch(syncFarmsFromBackend('user-1') as any);

    expect(ket.type).toBe('farm/syncFarmsFromBackend/rejected');
    expect(store.getState().farm.farmsSyncError).toBeTruthy();
    expect(store.getState().farm.error).toBeTruthy();
  });

  it('danh sách đang cầm KHÔNG bị xoá vì một lượt đồng bộ hỏng', async () => {
    mockListFarms.mockResolvedValue({
      ok: true,
      farms: [{ id: 'farm-1', name: 'Vườn Bưởi', coordinates: [] }],
    });
    const store = makeStore();
    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    mockListFarms.mockRejectedValue(new Error('sập'));
    (database.getFarms as jest.Mock).mockRejectedValue(new Error('database is locked'));
    await store.dispatch(syncFarmsFromBackend('user-1') as any);

    // Bản cũ ở đây thay danh sách bằng `[]` — tức một lượt mạng hỏng xoá sạch
    // màn hình của người đang đứng ngoài vườn.
    expect(store.getState().farm.farms).toHaveLength(1);
    expect(store.getState().farm.farmsSyncError).toBeTruthy();
  });
});

describe('`syncTreesFromBackend` hỏng CÙNG kiểu, nên vá cùng kiểu', () => {
  it('máy chủ nói "vườn này không có cây" ≠ không hỏi được máy chủ', async () => {
    const { getTrees } = require('../../../services/treeReIDService');
    const spy = jest.spyOn(require('../../../services/treeReIDService'), 'getTrees');

    spy.mockResolvedValue({ ok: true, trees: [] });
    const a = makeStore();
    await a.dispatch(syncTreesFromBackend('farm-1') as any);

    spy.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'HTTP 502', http_status: 502 },
    });
    const b = makeStore();
    await b.dispatch(syncTreesFromBackend('farm-1') as any);

    expect(a.getState().farm.trees).toEqual(b.getState().farm.trees);
    expect(a.getState().farm.treesSyncError).toBeNull();
    expect(b.getState().farm.treesSyncError).toBeTruthy();

    spy.mockRestore();
    expect(typeof getTrees).toBe('function');
  });
});
