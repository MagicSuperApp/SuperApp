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
  loadSyncQueue: () => ({ type: 'sync/loadSyncQueue/THUNK' }),
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

import { syncService, MAX_RETRY_COUNT, NEEDS_ATTENTION_PREFIX } from './syncService';

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
  // `store.dispatch` THẬT trả lại chính hành động đã phát (và với thunk thì trả
  // promise của nó). Mock phải giữ tính chất đó, vì `processSyncQueue` nay ĐỌC giá
  // trị trả về để biết lệnh xoá có bị từ chối không. Trả `undefined` như trước là
  // dựng một máy chủ giả LỎNG hơn máy thật — chỗ đó thì test nào cũng xanh.
  mockDispatch.mockImplementation((a: any) => a);
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

  /**
   * ⛔ Ca này thay cho một ca xanh-mà-sai: bản cũ gọi `pass()` ĐÚNG MỘT LẦN rồi
   * khẳng định mục còn `pending`. Mệnh đề nó khẳng định ("mất mạng → còn sống")
   * sai từ vòng thứ 6, và không có gì đỏ lên — vì trần `MAX_RETRY_COUNT` chỉ
   * chạm tới ở vòng thứ 5. Một ca kiểm chạy thiếu vòng là một ca kiểm nói dối
   * về đúng cái nó mang tên.
   *
   * Số vòng ở đây lấy từ chính hằng số, KHÔNG gõ cứng: đổi trần mà bài kiểm vẫn
   * chạy đủ vòng thì bài mới còn canh được.
   */
  it('mất mạng KÉO DÀI quá trần → VẪN không chết (mất sóng không phải mất dữ liệu)', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'network_error', detail: 'TypeError: Network request failed', http_status: 0 },
    });

    for (let i = 0; i < MAX_RETRY_COUNT + 3; i++) await pass();

    const seen = statusCalls().map(c => c.status);
    // Đủ vòng thật, không phải một vòng rồi khẳng định bừa.
    expect(seen.length).toBeGreaterThanOrEqual(MAX_RETRY_COUNT + 3);
    expect(seen).not.toContain('error');
    // `'sending'` là nhãn tạm mỗi vòng đặt trước khi gọi mạng; ngoài nó ra chỉ
    // được phép có `'pending'`.
    expect(seen.every(s => s === 'pending' || s === 'sending')).toBe(true);
    expect(lastStatus().status).toBe('pending');
    // Và mục KHÔNG bị gắn nhãn quá-trần: mất mạng không đếm lượt, nên nó chưa
    // từng chạm trần dù đã thử tám lần.
    expect(lastStatus().errorCode ?? '').not.toContain(NEEDS_ATTENTION_PREFIX);
    // Mất sóng không phải chuyện phiên đăng nhập → đừng bật hộp sinh trắc.
    expect(mockEnsureToken).not.toHaveBeenCalled();
    expect(mockShowWarning).not.toHaveBeenCalled();
  });

  /**
   * "KHÔNG đếm lượt" phải được đo ở chỗ con số ấy ĐƯỢC DÙNG, không phải ở chỗ nó
   * được ghi. Ca mất-mạng-kéo-dài phía trên KHÔNG canh được điều này: nhánh
   * `offline` trả về trước khi chạm trần, nên đổi `count: prev` thành `count:`
   * trong nhánh đó chẳng làm ca nào đỏ (đã đo bằng đột biến — bộ kiểm còn xanh
   * 52/52). Chỗ con số rò ra là lượt lỗi hạng KHÁC ngay sau đó.
   */
  it('mất mạng rồi máy chủ mới mệt → lượt 503 ĐẦU TIÊN vẫn là lượt đầu, không phải lượt thứ bảy', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'network_error', detail: 'Network request failed', http_status: 0 },
    });
    for (let i = 0; i < MAX_RETRY_COUNT + 1; i++) await pass();

    // Sóng về, nhưng máy chủ đang mệt.
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'HTTP 503', http_status: 503 },
    });
    await pass();

    // Sáu lượt mất sóng KHÔNG được tính vào ngân sách thử của máy chủ. Tính vào
    // thì mục bị gắn nhãn quá-trần ngay lượt 503 đầu — một lời khai sai về việc
    // máy chủ đã từ chối bao nhiêu lần.
    expect(lastStatus().status).toBe('pending');
    expect(lastStatus().errorCode).toBe('HTTP 503');
    expect(lastStatus().errorCode).not.toMatch(/^\[cần xem lại\] /);
  });

  /**
   * Máy chủ mệt (503) là hạng CÓ đếm lượt. Chạm trần thì mục phải HẠ NHỊP, không
   * được chết: `'error'` không nằm trong bộ lọc của `processSyncQueue`, nên nhãn
   * đó là xoá vĩnh viễn. Máy chủ mệt hai phút rưỡi không phải lý do xoá sổ tay
   * của nông dân.
   */
  it('503 kéo dài quá trần → hạ nhịp + gắn nhãn, KHÔNG đánh dấu chết', async () => {
    mockAddTimelineEvent.mockResolvedValue({
      ok: false,
      error: { type: 'server_error', detail: 'HTTP 503', http_status: 503 },
    });

    for (let i = 0; i < MAX_RETRY_COUNT + 3; i++) await pass();

    const seen = statusCalls().map(c => c.status);
    expect(seen).not.toContain('error');
    expect(lastStatus().status).toBe('pending');
    // Nhãn phải xuất hiện — nếu không thì mục quá hạn trông y hệt mục vừa xếp hàng.
    expect(lastStatus().errorCode).toMatch(/^\[cần xem lại\] /);
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

/**
 * ── Gửi trùng ───────────────────────────────────────────────────────────────
 * Hai đường dẫn tới hai dòng "phun thuốc" cho MỘT lần phun:
 *   · vòng quét CỐ Ý nhặt lại mục kẹt `'sending'` từ phiên trước, mà cửa ghi sự
 *     kiện không có khoá tự nhiên;
 *   · lệnh xoá mục đã gửi xong chạy mà không ai chờ và không ai soi kết quả.
 */
describe('không gửi trùng một sự việc', () => {
  it('gửi kèm `client_event_id` lấy từ ĐÚNG transaction_id của mục hàng đợi', async () => {
    mockQueueRows = [careRow('activity_1757000000000_zz9')];
    await pass();

    const body = mockAddTimelineEvent.mock.calls[0][3];
    expect(body.client_event_id).toBe('activity_1757000000000_zz9');
  });

  it('CHỜ lệnh xoá xong rồi mới kết thúc vòng — không để nó bay trong lúc vòng sau chạy', async () => {
    let release!: () => void;
    const pendingRemoval = new Promise<any>(resolve => {
      release = () => resolve({ type: 'sync/removeFromSyncQueue', payload: 'activity_1' });
    });
    mockDispatch.mockImplementation((a: any) =>
      a?.type === 'sync/removeFromSyncQueue' ? pendingRemoval : a);

    let finished = false;
    const round = syncService.syncOnce().then(() => { finished = true; });
    // Xả hết microtask đang chờ. Vòng quét chỉ còn kẹt ở đúng một chỗ: lệnh xoá.
    for (let i = 0; i < 50; i++) await Promise.resolve();

    // Bỏ `await` ở lời gọi xoá thì dòng này đỏ: vòng đã kết thúc trong khi lệnh
    // ghi xuống CSDL còn đang bay, và vòng kế đọc lại CSDL sẽ thấy mục vẫn còn.
    expect(finished).toBe(false);

    release();
    await round;
    expect(finished).toBe(true);
  });

  it('xếp mục mới → nạp lại hàng đợi bằng THUNK, không phát một chuỗi trần', async () => {
    // Chuỗi trần `'sync/loadSyncQueue'` không khớp `addCase` nào (xem
    // `syncSlice.test.ts`): nó đi qua store và không làm gì. Ghim ở đây vì đây mới
    // là nơi phát nó.
    await syncService.addSyncItem('activity', { activity: { type: 'watering', farmId: 'farm-1' } });

    const types = mockDispatch.mock.calls.map(c => c[0]?.type);
    expect(types).toContain('sync/loadSyncQueue/THUNK');
    expect(types).not.toContain('sync/loadSyncQueue');
  });

  it('lệnh xoá bị TỪ CHỐI → kêu lên; `createAsyncThunk` không ném nên không soi là nuốt trọn', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDispatch.mockImplementation((a: any) =>
      a?.type === 'sync/removeFromSyncQueue'
        ? { type: 'sync/removeFromSyncQueue/rejected', error: { message: 'database is locked' } }
        : a);

    await pass();

    const said = spy.mock.calls.map(c => String(c[0])).join('\n');
    expect(said).toMatch(/xoá activity_1 khỏi hàng đợi THẤT BẠI/);
    spy.mockRestore();
  });
});
