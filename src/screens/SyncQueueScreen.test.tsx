/**
 * SyncQueueScreen — bốn chốt, mỗi chốt là một đường đã hỏng hoặc đang hở.
 *
 * 1. **Ba nhóm phải tách bằng CHỮ.** "đang chờ sóng" · "máy chủ đang bận" ·
 *    "cần người xử" đều là `status: 'pending'` trong CSDL. Bày chung một câu là
 *    chỉ sai việc người dùng phải làm (tìm sóng · chờ · xem lại).
 * 2. **Một lần đọc hỏng KHÔNG được vẽ ra màn rỗng.** Màn rỗng nói "mọi thứ đã
 *    lên máy chủ" — với người vừa ghi mười mục ngoài vườn, đó là câu tệ nhất có
 *    thể nói, và nó không kèm dấu hiệu nào để họ biết mình đang bị nói sai.
 * 3. **Nút gửi lại phải gọi đúng đường gửi.** Một nút bấm mà không lệnh gửi nào
 *    chạy thì nó là một nút chết — và nút chết ở đây trông y hệt nút sống.
 * 4. **Lượt gửi lại trượt thì phải NÓI RA.** Bấm xong, hàng đợi vẫn nguyên, màn
 *    hình im lặng ⇒ người dùng tin là đã gửi được.
 *
 * Dùng `react-test-renderer` theo tiền lệ `MyDevicesScreen.test.tsx`
 * (`@testing-library/react-native` không có trong kho này).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() }; // ổn định qua mọi lượt dựng
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

/**
 * Hàng đợi trong Redux + kết quả lượt `loadSyncQueue`.
 *
 * Mock ở tầng `store/hooks` (theo tiền lệ `FruitVideoScreen.test.tsx`) để không
 * phải dựng store thật kèm SQLite. `mockDispatchResult` là thứ `dispatch(thunk)`
 * trả về: `createAsyncThunk` KHÔNG ném khi thân hỏng, nó trả một hành động mang
 * `error` — chính hình dạng đó là điều màn hình phải soi.
 */
let mockQueueRows: any[] = [];
let mockDispatchResult: any = { type: 'sync/loadSyncQueue/fulfilled' };
const mockDispatch = jest.fn(async () => mockDispatchResult);

jest.mock('../store/hooks', () => ({
  useAppSelector: (fn: (s: any) => unknown) =>
    fn({ sync: { queue: mockQueueRows, isLoading: false, error: null } }),
  useAppDispatch: () => mockDispatch,
}));

jest.mock('../store/syncSlice', () => ({
  __esModule: true,
  loadSyncQueue: () => ({ type: 'sync/loadSyncQueue/THUNK' }),
}));

/**
 * `syncService` giả — nhưng `syncQueueStatus` thì THẬT: nó là lớp đọc đang được
 * đo. Mock nó là mock mất đúng chỗ phải kiểm.
 */
const mockDiagnostics = jest.fn(() => ({}) as Record<string, any>);
const mockRetryItem = jest.fn(async () => ({ kind: 'cleared' }) as any);
const mockRetryAll = jest.fn(async () => ({ kind: 'done', before: 1, remaining: 0 }) as any);
jest.mock('../services/syncService', () => ({
  __esModule: true,
  syncService: {
    getQueueDiagnostics: () => mockDiagnostics(),
    retryItemNow: (...a: any[]) => mockRetryItem(...(a as [])),
    retryAllNow: () => mockRetryAll(),
  },
}));

import SyncQueueScreen from './SyncQueueScreen';
import { NEEDS_ATTENTION_PREFIX } from '../services/syncQueueStatus';

/** Một dòng đúng hình dạng `database.getSyncQueue()` trả về. */
const row = (txId: string, over: Record<string, unknown> = {}) => ({
  id: 1,
  transaction_id: txId,
  payload: JSON.stringify({ type: 'activity', data: { activity: { type: 'watering', farmId: 'f1' } } }),
  media_paths: [],
  status: 'pending',
  error_code: null,
  created_at: '2026-09-14 03:20:00',
  updated_at: '2026-09-14T03:20:00.000Z',
  ...over,
});

/** Gom mọi chuỗi Text trong cây dựng được. */
function texts(tree: renderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const n = node as { children?: unknown[] } | null;
    if (n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out;
}

const screenText = (t: renderer.ReactTestRenderer) => texts(t).join('\n');

const hasNode = (t: renderer.ReactTestRenderer, testID: string) =>
  t.root.findAll((n) => n.props?.testID === testID, { deep: true }).length > 0;

/** Bấm phần tử mang `testID` (lấy tầng ngoài cùng, tránh đếm lớp host bên trong). */
async function press(t: renderer.ReactTestRenderer, testID: string) {
  const found = t.root.findAll(
    (n) => n.props?.testID === testID && typeof n.props?.onPress === 'function',
    { deep: true },
  );
  expect(found.length).toBeGreaterThan(0);
  await act(async () => { found[0].props.onPress(); });
}

async function openScreen() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SyncQueueScreen />); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueueRows = [];
  mockDispatchResult = { type: 'sync/loadSyncQueue/fulfilled' };
  mockDiagnostics.mockReturnValue({});
  mockRetryItem.mockResolvedValue({ kind: 'cleared' } as any);
  mockRetryAll.mockResolvedValue({ kind: 'done', before: 1, remaining: 0 } as any);
});

// ---------------------------------------------------------------------------
// Chốt 1 — ba nhóm tách bằng CHỮ
// ---------------------------------------------------------------------------
describe('chốt 1 · ba nhóm trạng thái tách ra bằng chữ', () => {
  it('bày riêng "đang chờ sóng", "máy chủ đang bận", "cần người xử"', async () => {
    mockQueueRows = [
      row('a'),
      row('b', { error_code: 'Service Unavailable' }),
      row('c', { error_code: `${NEEDS_ATTENTION_PREFIX}Service Unavailable` }),
    ];
    mockDiagnostics.mockReturnValue({
      a: { retryCount: 0, nextAttemptAt: 0, lastFailure: 'offline' },
      b: { retryCount: 2, nextAttemptAt: 0, lastFailure: 'retryable' },
      c: { retryCount: 5, nextAttemptAt: 0, lastFailure: 'retryable' },
    });

    const t = await openScreen();
    const shown = screenText(t);

    expect(hasNode(t, 'sync-queue-group-waitingNetwork')).toBe(true);
    expect(hasNode(t, 'sync-queue-group-serverBusy')).toBe(true);
    expect(hasNode(t, 'sync-queue-group-needsAttention')).toBe(true);
    // Bằng CHỮ, không chỉ bằng màu hay bằng testID.
    expect(shown).toContain('Đang chờ sóng');
    expect(shown).toContain('Máy chủ đang bận');
    expect(shown).toContain('Cần người xử');
    expect(shown).toContain('3');
  });

  it('mục đã chết hẳn bày riêng, kèm câu "KHÔNG tự gửi lại nữa" và KHÔNG có nút gửi lại', async () => {
    mockQueueRows = [row('d', { status: 'error', error_code: 'payload sai' })];
    const t = await openScreen();
    expect(hasNode(t, 'sync-queue-group-stopped')).toBe(true);
    expect(screenText(t)).toContain('KHÔNG tự gửi lại nữa');
    expect(hasNode(t, 'sync-queue-retry-d')).toBe(false);
  });

  it('mỗi mục nói loại việc · thời điểm · số lần thử · nguyên văn câu máy chủ', async () => {
    mockQueueRows = [row('a', { error_code: 'uy tín 46,3 dưới ngưỡng 50,0' })];
    mockDiagnostics.mockReturnValue({ a: { retryCount: 3, nextAttemptAt: 0, lastFailure: 'retryable' } });
    const t = await openScreen();
    const shown = screenText(t);
    expect(shown).toContain('Nhật ký đồng áng');
    expect(shown).toContain('Ghi lúc');
    // Câu này phải nói đúng ĐẠI LƯỢNG: bộ đếm chỉ tăng ở hạng `retryable`, nên gọi
    // nó là "số lần thử" thì một mục đã gọi mạng 20 lượt vì mất sóng vẫn đọc ra
    // "đã thử 0 lần".
    expect(shown).toContain('Đã tính 3 lượt vào trần thử lại');
    expect(shown).not.toContain('Đã thử 3 lần');
    // Nguyên văn, không thay bằng "có lỗi xảy ra".
    expect(shown).toContain('uy tín 46,3 dưới ngưỡng 50,0');
  });

  it('không có số lần thử thì NÓI là không có, không hiện số 0', async () => {
    mockQueueRows = [row('a')];
    mockDiagnostics.mockReturnValue({});
    const t = await openScreen();
    const shown = screenText(t);
    expect(shown).toContain('Chưa có số liệu thử lại trong phiên này');
    expect(shown).not.toContain('Đã tính 0 lượt');
  });
});

// ---------------------------------------------------------------------------
// Chốt 2 — đọc hỏng ≠ rỗng
// ---------------------------------------------------------------------------
describe('chốt 2 · một lần đọc hỏng KHÔNG ra màn rỗng', () => {
  it('lượt nạp bị từ chối ⇒ màn "không đọc được", KHÔNG phải màn rỗng', async () => {
    mockQueueRows = [];
    mockDispatchResult = {
      type: 'sync/loadSyncQueue/rejected',
      error: { message: 'database is locked' },
    };

    const t = await openScreen();

    expect(hasNode(t, 'sync-queue-read-failed')).toBe(true);
    expect(hasNode(t, 'sync-queue-empty')).toBe(false);
    const shown = screenText(t);
    expect(shown).toContain('Không đọc được hàng đợi');
    expect(shown).toContain('KHÔNG phải là hàng đợi rỗng');
    // Lý do thật hiện ra để người dùng báo lại được, không bị thay bằng câu chung.
    expect(shown).toContain('database is locked');
  });

  it('hàng đợi rỗng THẬT ⇒ màn rỗng, và nó nói khác hẳn màn đọc hỏng', async () => {
    mockQueueRows = [];
    const t = await openScreen();
    expect(hasNode(t, 'sync-queue-empty')).toBe(true);
    expect(hasNode(t, 'sync-queue-read-failed')).toBe(false);
    const shown = screenText(t);
    expect(shown).toContain('Không có mục nào đang chờ');
    expect(shown).not.toContain('Không đọc được hàng đợi');
  });

  it('một dòng hàng đợi hỏng (thiếu mã giao dịch) cũng KHÔNG ra màn rỗng', async () => {
    mockQueueRows = [{ id: 1, status: 'pending', payload: '{}' }];
    const t = await openScreen();
    expect(hasNode(t, 'sync-queue-unreadable-banner')).toBe(true);
    // Và TUYỆT ĐỐI không được ra màn "mọi thứ đã lên máy chủ": kho đang giữ dữ liệu
    // chưa gửi mà không dòng nào đọc được thành một mục.
    expect(hasNode(t, 'sync-queue-empty')).toBe(false);
    expect(hasNode(t, 'sync-queue-only-unreadable')).toBe(true);
    const shown = screenText(t);
    expect(shown).toContain('1 dòng trong kho không đọc được');
    expect(shown).not.toContain('Mọi thứ bạn ghi đã lên máy chủ');
  });

  /**
   * Chiều khó hơn, và là chiều lỗi đã đo: một dòng rác KHÔNG được xoá những dòng
   * lành khỏi màn. Xoá chúng là lấy mất đường gửi tay duy nhất mà người dùng có —
   * vì cả nút "gửi lại tất cả" lẫn nút của từng mục đều nằm trong phần chỉ vẽ khi
   * còn mục.
   */
  it('dòng hỏng KHÔNG được xoá những dòng LÀNH khỏi màn', async () => {
    mockQueueRows = [
      row('a'),
      { id: 2, status: 'pending', payload: '{}' },
      row('b'),
    ];
    const t = await openScreen();
    expect(hasNode(t, 'sync-queue-item-a')).toBe(true);
    expect(hasNode(t, 'sync-queue-item-b')).toBe(true);
    // Và đường gửi tay còn nguyên.
    expect(hasNode(t, 'sync-queue-retry-all')).toBe(true);
    expect(hasNode(t, 'sync-queue-retry-a')).toBe(true);
    // Bỏ qua thì phải ĐẾM, không được im: băng phải nói đúng MỘT dòng bị loại.
    expect(screenText(t)).toContain('1 dòng trong kho không đọc được');
  });

  it('hàng đợi chỉ còn mục đã dừng hẳn ⇒ nút "gửi lại tất cả" phải vô hiệu và nói vì sao', async () => {
    mockQueueRows = [row('a', { status: 'error', error_code: 'payload sai' })];
    const t = await openScreen();
    expect(hasNode(t, 'sync-queue-nothing-retriable')).toBe(true);
    expect(screenText(t)).toContain('Không mục nào còn tự gửi lại được');
  });
});

// ---------------------------------------------------------------------------
// Chốt 3 — nút gửi lại gọi đúng hàm
// ---------------------------------------------------------------------------
describe('chốt 3 · nút gửi lại gọi đúng đường gửi', () => {
  it('nút của một mục gọi retryItemNow với ĐÚNG mã giao dịch đó', async () => {
    mockQueueRows = [row('activity_7'), row('activity_8')];
    const t = await openScreen();

    await press(t, 'sync-queue-retry-activity_8');

    expect(mockRetryItem).toHaveBeenCalledTimes(1);
    expect(mockRetryItem).toHaveBeenCalledWith('activity_8');
  });

  it('nút cả hàng đợi gọi retryAllNow', async () => {
    mockQueueRows = [row('activity_7')];
    const t = await openScreen();

    await press(t, 'sync-queue-retry-all');

    expect(mockRetryAll).toHaveBeenCalledTimes(1);
  });

  it('bấm xong thì nạp lại hàng đợi để trạng thái trên màn đổi theo', async () => {
    mockQueueRows = [row('activity_7')];
    const t = await openScreen();
    const loadCallsBefore = mockDispatch.mock.calls.length;

    await press(t, 'sync-queue-retry-activity_7');

    expect(mockDispatch.mock.calls.length).toBeGreaterThan(loadCallsBefore);
  });
});

// ---------------------------------------------------------------------------
// Chốt 4 — lượt gửi lại trượt thì nói ra
// ---------------------------------------------------------------------------
describe('chốt 4 · lượt gửi lại trượt thì NÓI RA', () => {
  it('mục vẫn còn trong hàng đợi ⇒ hiện câu báo kèm nguyên văn máy chủ', async () => {
    mockQueueRows = [row('activity_7')];
    mockRetryItem.mockResolvedValue({
      kind: 'stillQueued',
      status: 'pending',
      message: 'Service Unavailable',
    } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-activity_7');

    expect(hasNode(t, 'sync-queue-retry-note')).toBe(true);
    const shown = screenText(t);
    expect(shown).toContain('Chưa gửi được');
    expect(shown).toContain('Service Unavailable');
  });

  it('lượt gửi lại NÉM cũng phải hiện câu, không im', async () => {
    mockQueueRows = [row('activity_7')];
    mockRetryItem.mockRejectedValue(new Error('database is locked'));

    const t = await openScreen();
    await press(t, 'sync-queue-retry-activity_7');

    expect(hasNode(t, 'sync-queue-retry-note')).toBe(true);
    const shown = screenText(t);
    expect(shown).toContain('Không chạy được lượt gửi lại');
    expect(shown).toContain('database is locked');
  });

  it('chưa thử được lượt nào thì nói ĐÚNG chừng đó, không nói "đã gửi"', async () => {
    mockQueueRows = [row('activity_7')];
    mockRetryItem.mockResolvedValue({ kind: 'notAttempted', reason: 'another-pass-running' } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-activity_7');

    const shown = screenText(t);
    expect(shown).toContain('Chưa thử gửi được');
    expect(shown).not.toContain('Đã gửi xong');
  });

  it('gửi được thì cũng nói ra', async () => {
    mockQueueRows = [row('activity_7')];
    mockRetryItem.mockResolvedValue({ kind: 'cleared' } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-activity_7');

    expect(screenText(t)).toContain('Đã gửi xong');
  });

  it('gửi cả hàng đợi mà còn mục sót thì KHÔNG báo là xong', async () => {
    mockQueueRows = [row('a'), row('b')];
    mockRetryAll.mockResolvedValue({ kind: 'done', before: 2, remaining: 1 } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-all');

    const shown = screenText(t);
    expect(shown).toContain('vẫn còn mục chưa gửi được');
    expect(shown).not.toContain('Đã gửi xong cả hàng đợi');
  });
});

// ---------------------------------------------------------------------------
// Chốt 5 — ba chỗ đo được trên máy ảo 15/09/2026, sau khi màn đã lên bản dựng
// ---------------------------------------------------------------------------
describe('chốt 5 · ba chỗ lộ ra khi chạy thật', () => {
  it('mục đã dừng phải cho XEM lại thứ người dùng đã ghi', async () => {
    // Màn bảo "hãy ghi lại việc này". Không mở được nội dung ra thì đó là một
    // lời khuyên không thực hiện được — đúng chỗ người dùng vừa mất một việc.
    mockQueueRows = [
      row('a', {
        status: 'error',
        error_code: 'Vườn không thuộc tài khoản này',
        payload: JSON.stringify({ type: 'activity', note: 'Bón phân lô B2', farmId: 'vuon-doi' }),
      }),
    ];

    const t = await openScreen();
    // Đóng lúc mới mở: nội dung không được tự bày ra, nó là thứ người dùng CHỌN xem.
    expect(hasNode(t, 'sync-queue-payload-a')).toBe(false);

    await press(t, 'sync-queue-open-payload-a');
    const shown = screenText(t);
    expect(shown).toContain('Bón phân lô B2');
    expect(shown).toContain('vuon-doi');
    // `type` đã nằm ở nhãn loại phía trên thẻ — in lại là bắt người đọc tự lọc.
    expect(shown).not.toContain('activity\n');
  });

  it('nội dung KHÔNG mở ra được phải khác hẳn nội dung KHÔNG có', async () => {
    // Hai câu này nói hai chuyện: "bạn không ghi gì" và "bạn có ghi, ở đây mở
    // không ra". Gộp chúng là báo mất trắng cho người vẫn còn dữ liệu.
    mockQueueRows = [
      row('a', { status: 'error', payload: 'KHÔNG-PHẢI-JSON' }),
      row('b', { status: 'error', payload: null }),
    ];

    const t = await openScreen();
    await press(t, 'sync-queue-open-payload-a');
    await press(t, 'sync-queue-open-payload-b');

    const shown = screenText(t);
    expect(shown).toContain('KHÔNG-PHẢI-JSON');
    expect(shown).toContain('nguyên văn thứ máy đang giữ');
    expect(shown).toContain('Máy không giữ nội dung nào cho mục này.');
  });

  it('câu kết quả gửi lại phải mang PHẠM VI khi có dòng không đọc được', async () => {
    // Đo thật: kho 6 dòng chờ, 1 dòng thiếu mã giao dịch ⇒ câu này in "còn 6 mục"
    // ngay trên một danh sách cộng lại bằng 5. Hai số đếm hai tập, không gì nối.
    mockQueueRows = [row('a'), row('b'), { ...row('c'), transaction_id: undefined }];
    mockRetryAll.mockResolvedValue({ kind: 'done', before: 3, remaining: 3 } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-all');

    const shown = screenText(t);
    expect(shown).toContain('1 dòng không đọc được');
    expect(shown).toContain('đếm theo dòng trong kho');
  });

  it('không có dòng hỏng thì KHÔNG gắn thêm câu phạm vi', async () => {
    // Ca đối xứng: câu cảnh báo phải vắng mặt đúng lúc nó không đúng. Thiếu ca
    // này thì một bản đột biến in câu đó vô điều kiện vẫn xanh.
    mockQueueRows = [row('a'), row('b')];
    mockRetryAll.mockResolvedValue({ kind: 'done', before: 2, remaining: 2 } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-all');

    expect(screenText(t)).not.toContain('đếm theo dòng trong kho');
  });

  it('kéo xuống làm mới thì BỎ phán quyết của lượt gửi trước', async () => {
    // Đo thật: dải "còn 6 mục" đứng nguyên trên một hàng đợi vừa đọc lại còn 2
    // mục. Phán quyết cũ nói về một hàng đợi không còn tồn tại.
    mockQueueRows = [row('a'), row('b')];
    mockRetryAll.mockResolvedValue({ kind: 'done', before: 2, remaining: 2 } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-all');
    expect(screenText(t)).toContain('Không mục nào gửi được trong lượt này');

    const list = t.root.findAll((n) => typeof n.props?.onRefresh === 'function', { deep: true });
    expect(list.length).toBeGreaterThan(0);
    await act(async () => { await list[0].props.onRefresh(); });

    expect(screenText(t)).not.toContain('Không mục nào gửi được trong lượt này');
  });

  it('lượt gửi lại MỘT mục thì phán quyết phải SỐNG qua lần đọc lại ngay sau đó', async () => {
    // Ca đối xứng của bài trên: `load` chạy ngay sau mỗi lượt gửi. Xoá phán quyết
    // trong `load` sẽ giết đúng câu trả lời mà người dùng vừa bấm nút để nghe.
    mockQueueRows = [row('a')];
    mockRetryItem.mockResolvedValue({ kind: 'cleared' } as any);

    const t = await openScreen();
    await press(t, 'sync-queue-retry-a');

    expect(screenText(t)).toContain('Đã gửi xong');
  });
});
