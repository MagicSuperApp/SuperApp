/**
 * KHOÁ LẠI: phiên hết hạn KHÔNG được giết một mục trong hàng đợi đồng bộ.
 *
 * ── Lỗi đã đo ───────────────────────────────────────────────────────────────
 * `isRetryableError` cũ xếp mọi 4xx (trừ 408/429) là "không retry", nên 401 —
 * phiên hết hạn — đi thẳng vào nhánh `status:'error'` NGAY lần gửi đầu. Mà vòng
 * quét chỉ lấy `'pending' | 'sending'`, nên mục đó chết vĩnh viễn, kể cả sau khi
 * mở lại app. Người dùng thì vừa đọc "Đã lưu vào sổ — Sẽ gửi lên máy chủ khi có
 * mạng". Đó là mất dữ liệu đồng ruộng, và nó im lặng.
 *
 * ── Bài này đo gì ───────────────────────────────────────────────────────────
 * Đi qua ĐƯỜNG THẬT: `classifySyncItem` thật dựng lời gọi `addTimelineEvent`,
 * `addTimelineEvent` giả trả đúng hình dạng máy chủ trả, rồi soi xem
 * `updateSyncStatus` được gọi với trạng thái nào. Không mock `syncDispatch` —
 * mock nó là mock mất chính chỗ đã hỏng.
 */

// ── Mock hạ tầng: store · CSDL · kho khoá · hộp thoại ───────────────────────

const mockDispatch = jest.fn();
jest.mock('../store', () => ({ store: { dispatch: (a: any) => mockDispatch(a) } }));

jest.mock('../store/syncSlice', () => ({
  __esModule: true,
  updateSyncStatus: (a: any) => ({ type: 'sync/updateSyncStatus', payload: a }),
  removeFromSyncQueue: (id: string) => ({ type: 'sync/removeFromSyncQueue', payload: id }),
}));

let mockQueueRows: any[] = [];
jest.mock('../utils/database', () => ({
  __esModule: true,
  database: {
    isInitialized: () => true,
    getSyncQueue: async () => mockQueueRows,
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

const mockShowWarning = jest.fn();
jest.mock('../utils/alert', () => ({
  __esModule: true,
  showWarning: (...a: any[]) => mockShowWarning(...a),
  showError: jest.fn(),
  showSuccess: jest.fn(),
  showInfo: jest.fn(),
}));

import { syncService } from './syncService';

/** Một mục nhật ký chăm sóc đúng hình dạng `addSyncItem` ghi xuống CSDL. */
function careRow(txId = 'activity_1') {
  return {
    transaction_id: txId,
    status: 'pending',
    payload: JSON.stringify({
      type: 'activity',
      data: { activity: { type: 'watering', farmId: 'farm-1', treeId: 'tree-9' } },
      timestamp: '2026-09-10T01:00:00.000Z',
    }),
  };
}

/** Mọi lượt `updateSyncStatus` đã phát ra, theo thứ tự. */
function statusCalls(): { transactionId: string; status: string; errorCode?: string }[] {
  return mockDispatch.mock.calls
    .map(c => c[0])
    .filter(a => a?.type === 'sync/updateSyncStatus')
    .map(a => a.payload);
}

const lastStatus = () => statusCalls()[statusCalls().length - 1];

/**
 * MỘT vòng xử lý, sau khi đã qua mọi cửa sổ chờ.
 *
 * Không nhảy đồng hồ thì vòng thứ hai bị `nextAttemptAt` chặn và bài kiểm hoá ra
 * chỉ đo đúng vòng đầu — xanh vì không chạy, không phải vì đúng.
 */
async function pass(): Promise<void> {
  jest.advanceTimersByTime(10 * 60_000);
  await syncService.syncOnce();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockQueueRows = [careRow()];
  mockAddTimelineEvent.mockResolvedValue({ ok: true });
  mockEnsureToken.mockResolvedValue(false);
  syncService.resetForTest();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('401 phiên hết hạn', () => {
  const expired = {
    ok: false,
    error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 },
  };

  it('KHÔNG đánh dấu `error` — mục phải còn sống để vòng sau quét lại', async () => {
    mockAddTimelineEvent.mockResolvedValue(expired);
    await pass();

    const seen = statusCalls().map(c => c.status);
    expect(seen).not.toContain('error');
    expect(lastStatus().status).toBe('pending');
  });

  it('thử LÀM MỚI PHIÊN bằng đúng cơ chế sẵn có (ensureOrilifeToken force)', async () => {
    mockAddTimelineEvent.mockResolvedValue(expired);
    await pass();

    expect(mockEnsureToken).toHaveBeenCalled();
    expect(mockEnsureToken.mock.calls[0][1]).toEqual({ force: true });
  });

  it('làm mới KHÔNG được → người dùng THẤY, không nuốt im', async () => {
    mockEnsureToken.mockResolvedValue(false);
    mockAddTimelineEvent.mockResolvedValue(expired);
    await pass();

    expect(mockShowWarning).toHaveBeenCalledTimes(1);
    const [title, body] = mockShowWarning.mock.calls[0];
    expect(`${title} ${body}`).toMatch(/đăng nhập lại/i);
    // Và câu đó phải nói rõ dữ liệu còn nguyên — nếu không nông dân sẽ ghi lại.
    expect(`${title} ${body}`).toMatch(/không mất/i);
  });

  it('làm mới ĐƯỢC → gửi lại ở vòng kế và mục biến khỏi hàng đợi', async () => {
    mockEnsureToken.mockResolvedValue(true);
    mockAddTimelineEvent.mockResolvedValue(expired);
    await pass();
    expect(lastStatus().status).toBe('pending');

    // Vòng sau: phiên đã mới, máy chủ nhận.
    mockAddTimelineEvent.mockResolvedValue({ ok: true, event_id: 'ev-1' });
    await pass();

    const removed = mockDispatch.mock.calls
      .map(c => c[0])
      .filter(a => a?.type === 'sync/removeFromSyncQueue');
    expect(removed).toHaveLength(1);
  });

  it('hết 5 lượt vẫn 401 thì VẪN không chết — đó là phiên, không phải payload', async () => {
    mockAddTimelineEvent.mockResolvedValue(expired);
    for (let i = 0; i < 8; i++) await pass();

    expect(statusCalls().map(c => c.status)).not.toContain('error');
  });
});

describe('các hạng lỗi khác vẫn giữ nguyên hành vi', () => {
  it('400 payload sai → vẫn đánh dấu `error` (mục này gửi lại bao nhiêu lần cũng hỏng)', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'validation_error', detail: 'HTTP 400', http_status: 400 },
    });
    await pass();
    expect(lastStatus().status).toBe('error');
  });

  it('mất mạng (http_status 0) → còn sống, và KHÔNG mời đăng nhập lại', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'network_error', detail: 'TypeError: Network request failed', http_status: 0 },
    });
    await pass();

    expect(lastStatus().status).toBe('pending');
    expect(mockShowWarning).not.toHaveBeenCalled();
    expect(mockEnsureToken).not.toHaveBeenCalled();
  });

  it('403 "cây chưa đăng ký" → còn sống, và KHÔNG ký lại (ký lại không gỡ được)', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'validation_error', detail: 'Thực thể này chưa đăng ký', http_status: 403 },
    });
    await pass();

    expect(lastStatus().status).toBe('pending');
    expect(mockEnsureToken).not.toHaveBeenCalled();
  });
});
