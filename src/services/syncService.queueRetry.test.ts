/**
 * KHOÁ LẠI: hai nút gửi lại bằng tay, và chẩn đoán mà màn hàng đợi dựa vào.
 *
 * ── Vì sao có tệp này ───────────────────────────────────────────────────────
 * Bộ kiểm của màn hàng đợi `jest.mock` cả ba hàm `retryItemNow` · `retryAllNow` ·
 * `getQueueDiagnostics`, nên nó xanh mà KHÔNG chạy qua một dòng nào của chúng.
 * Hàm được mock ở bộ kiểm của người gọi thì không ai kiểm nó cả. Tệp này chạy
 * đường THẬT: `syncService` thật, `classifySyncItem`/`classifySyncFailure` thật,
 * chỉ mock store · CSDL · mạng · hộp thoại.
 *
 * ── Bốn lỗi đã đo, mỗi lỗi một ca dưới đây ──────────────────────────────────
 * 1. `drainNow` dựng object mới liệt kê tay hai trường ⇒ xoá `lastFailure` của MỌI
 *    mục ngay lúc mạng phục hồi. Màn mất câu "cần đăng nhập lại" và tụt xuống câu
 *    "chưa có lượt gửi nào hỏng trong phiên này".
 * 2. Nhánh `permanent` `delete` chẩn đoán TRƯỚC lệnh ghi `'error'`. Lệnh ghi đó
 *    trượt được, và khi nó trượt thì mục rơi vào nhóm êm ái nhất kèm một nút bấm
 *    được, cho một mục sẽ không bao giờ gửi được.
 * 3. `retryAllNow` đo bằng SỐ DÒNG. Mục chết chỉ đổi `status`, dòng vẫn nằm ⇒ với
 *    hàng đợi chỉ còn mục chết, nút báo "không mục nào gửi được" mãi mãi cho thứ
 *    nó chưa từng thử.
 * 4. Cổng `isProcessing` của `retryAllNow` kiểm TRƯỚC `await` đầu tiên ⇒ một vòng
 *    quét chen vào khe đó thì hàm phát phán quyết về lượt nó không chạy.
 */

const mockDispatch = jest.fn();
jest.mock('../store', () => ({ store: { dispatch: (a: any) => mockDispatch(a) } }));

jest.mock('../store/syncSlice', () => ({
  __esModule: true,
  updateSyncStatus: (a: any) => ({ type: 'sync/updateSyncStatus', payload: a }),
  removeFromSyncQueue: (id: string) => ({ type: 'sync/removeFromSyncQueue', payload: id }),
  loadSyncQueue: () => ({ type: 'sync/loadSyncQueue/THUNK' }),
}));

let mockQueueRows: any[] = [];
/** Chạy trước MỖI lượt `getSyncQueue`. Dùng để dựng ca đua ở ca số 4. */
let mockOnReadQueue: (() => void) | null = null;
jest.mock('../utils/database', () => ({
  __esModule: true,
  database: {
    isInitialized: () => true,
    getSyncQueue: async () => {
      if (mockOnReadQueue) mockOnReadQueue();
      return mockQueueRows;
    },
    addToSyncQueue: jest.fn(),
    updateSyncStatus: jest.fn(),
    removeFromSyncQueue: jest.fn(),
  },
}));

jest.mock('./aladin-api', () => ({
  __esModule: true,
  default: { createFarm: jest.fn(async () => ({})), createTree: jest.fn(async () => ({})) },
}));

const mockAddTimelineEvent = jest.fn<Promise<any>, any[]>(async () => ({ ok: true }));
jest.mock('./timelineService', () => ({
  __esModule: true,
  addTimelineEvent: (...a: any[]) => mockAddTimelineEvent(...a),
}));

const mockEnsureToken = jest.fn<Promise<boolean>, any[]>(async () => false);
jest.mock('./orilifeDidAuth', () => ({
  __esModule: true,
  ensureOrilifeToken: (...a: any[]) => mockEnsureToken(...a),
}));

jest.mock('../utils/alert', () => ({
  __esModule: true,
  showWarning: jest.fn(),
  showError: jest.fn(),
  showSuccess: jest.fn(),
  showInfo: jest.fn(),
}));

import { syncService } from './syncService';
import { describeRetryAllOutcome } from './syncQueueStatus';

function careRow(txId = 'activity_1', status = 'pending') {
  return {
    transaction_id: txId,
    status,
    payload: JSON.stringify({
      type: 'activity',
      data: { activity: { type: 'watering', farmId: 'farm-1', treeId: 'tree-9' } },
      timestamp: '2026-09-10T01:00:00.000Z',
    }),
  };
}

const diagOf = (txId: string) => syncService.getQueueDiagnostics()[txId];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockDispatch.mockImplementation((a: any) => a);
  mockQueueRows = [careRow()];
  mockOnReadQueue = null;
  mockAddTimelineEvent.mockResolvedValue({ ok: true });
  mockEnsureToken.mockResolvedValue(false);
  syncService.resetForTest();
});

afterEach(() => {
  syncService.stop();
  jest.useRealTimers();
});

describe('drainNow giữ nguyên chẩn đoán (lỗi 1)', () => {
  it('mạng phục hồi KHÔNG được xoá hạng hỏng gần nhất của mục', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 },
    });
    await syncService.syncOnce();
    // Tiền đề của ca: lượt hỏng đã ghi được hạng. Không có dòng này thì ca dưới
    // xanh vì KHÔNG CÓ GÌ để mất.
    expect(diagOf('activity_1')?.lastFailure).toBe('auth');

    syncService.start();
    await syncService.drainNow();

    // Đây là dòng phân biệt hai bên của phép sửa: liệt kê tay `{ count, nextAttemptAt }`
    // thì trường này thành `undefined`, và màn xếp mục vào nhóm "đang chờ gửi".
    expect(diagOf('activity_1')?.lastFailure).toBe('auth');
  });

  it('và cửa sổ chờ VẪN được xoá — bản sửa không được làm mất việc chính của hàm', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'Máy chủ lỗi', http_status: 500 },
    });
    await syncService.syncOnce();
    expect(diagOf('activity_1')?.nextAttemptAt).toBeGreaterThan(0);

    syncService.start();
    await syncService.drainNow();

    expect(diagOf('activity_1')?.nextAttemptAt).toBe(0);
  });
});

describe('mục chết hẳn vẫn giữ chẩn đoán (lỗi 2)', () => {
  const badPayload = {
    ok: false,
    error: { type: 'validation_error', detail: 'Thiếu trường bắt buộc', http_status: 422 },
  };

  it('hạng permanent được GHI LẠI, không bị xoá', async () => {
    mockAddTimelineEvent.mockResolvedValue(badPayload);
    await syncService.syncOnce();

    expect(diagOf('activity_1')?.lastFailure).toBe('permanent');
  });

  it('và mục đó được đánh dấu chết trong CSDL', async () => {
    mockAddTimelineEvent.mockResolvedValue(badPayload);
    await syncService.syncOnce();

    const statuses = mockDispatch.mock.calls
      .map((c) => c[0])
      .filter((a) => a?.type === 'sync/updateSyncStatus')
      .map((a) => a.payload.status);
    expect(statuses[statuses.length - 1]).toBe('error');
  });
});

describe('retryAllNow đếm tập GỬI ĐƯỢC, không đếm số dòng (lỗi 3)', () => {
  it('hàng đợi chỉ còn mục đã chết ⇒ before = 0, và câu báo KHÔNG phải "không gửi được"', async () => {
    mockQueueRows = [careRow('activity_1', 'error'), careRow('activity_2', 'error')];

    const outcome = await syncService.retryAllNow();

    expect(outcome).toEqual({ kind: 'done', before: 0, remaining: 0, newlyStopped: 0 });
    // Không lượt mạng nào được phát — không có gì để gửi.
    expect(mockAddTimelineEvent).not.toHaveBeenCalled();

    const note = describeRetryAllOutcome(outcome);
    // Hai câu cùng phải bị loại: "đã gửi xong" là trấn an sai, còn "không mục nào
    // gửi được trong lượt này" là báo hỏng cho một việc chưa từng thử.
    expect(note.text).not.toBe('Đã gửi xong cả hàng đợi.');
    expect(note.text).not.toBe('Không mục nào gửi được trong lượt này.');
  });

  it('lượt gửi làm một mục chết ⇒ newlyStopped đếm đúng nó', async () => {
    mockQueueRows = [careRow('activity_1')];
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'validation_error', detail: 'Thiếu trường', http_status: 422 },
    });
    // CSDL giả: lượt ghi `'error'` phản chiếu vào bảng, đúng như SQLite thật làm.
    mockDispatch.mockImplementation((a: any) => {
      if (a?.type === 'sync/updateSyncStatus') {
        const row = mockQueueRows.find((r) => r.transaction_id === a.payload.transactionId);
        if (row) row.status = a.payload.status;
      }
      return a;
    });

    const outcome = await syncService.retryAllNow();

    expect(outcome).toMatchObject({ kind: 'done', before: 1, remaining: 0, newlyStopped: 1 });
    const note = describeRetryAllOutcome(outcome);
    expect(note.tone).toBe('bad');
    expect(note.detail).toContain('1 mục đã dừng hẳn');
  });
});

describe('retryAllNow không phát phán quyết về lượt nó không chạy (lỗi 4)', () => {
  it('một vòng quét chen vào giữa phép đo ⇒ trả notAttempted, KHÔNG trả done', async () => {
    mockQueueRows = [careRow('activity_1')];
    // Vòng quét nền khởi ĐÚNG trong khe `await` của phép đo `before`: `processSyncQueue`
    // đặt `isProcessing = true` đồng bộ ngay dòng đầu, nên tới lượt `retryAllNow`
    // kiểm lại thì cờ đã lên.
    mockOnReadQueue = () => {
      mockOnReadQueue = null;
      void syncService.syncOnce();
    };

    const outcome = await syncService.retryAllNow();

    expect(outcome).toEqual({ kind: 'notAttempted', reason: 'another-pass-running' });
    expect(describeRetryAllOutcome(outcome).tone).toBe('bad');
  });
});

describe('retryItemNow đo bằng CSDL, không suy từ việc không ném', () => {
  it('mục còn trong bảng ⇒ stillQueued kèm trạng thái thô và câu của máy chủ', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'Máy chủ đang bận', http_status: 503 },
    });

    const outcome = await syncService.retryItemNow('activity_1');

    expect(outcome.kind).toBe('stillQueued');
    if (outcome.kind === 'stillQueued') {
      expect(outcome.status).toBe('pending');
    }
  });

  it('mục đã rời bảng ⇒ cleared', async () => {
    mockQueueRows = [careRow('activity_1')];
    mockDispatch.mockImplementation((a: any) => {
      if (a?.type === 'sync/removeFromSyncQueue') {
        mockQueueRows = mockQueueRows.filter((r) => r.transaction_id !== a.payload);
      }
      return a;
    });

    const outcome = await syncService.retryItemNow('activity_1');

    expect(outcome).toEqual({ kind: 'cleared' });
  });
});
