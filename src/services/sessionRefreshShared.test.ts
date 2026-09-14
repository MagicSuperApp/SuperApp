/**
 * `farmService` và `treeProfileService` phải ĐI CHUNG đường làm mới phiên với bản gốc.
 *
 * ── Ca được ghim ───────────────────────────────────────────────────────────
 * `treeReIDService` gặp 401 thì ký lại phiên (`ensureOrilifeToken(base,
 * {force:true})`) rồi thử lại MỘT lần. Hai tệp trên thì chép riêng một
 * `_getAuthHeader` đọc thẳng `auth_token`, và chú thích của bản sao TỰ KHAI mục
 * đích: *"bản sao gọn của treeReIDService — giữ cô lập"*. Cô lập khỏi cả bản vá:
 * thẻ hết hạn giữa buổi ⟹ danh sách vườn câm, hồ sơ cây không lưu được, trong khi
 * mạng vẫn tốt và người dùng vẫn đứng trong vườn của chính mình.
 *
 * ── Hai điều mỗi bài phải chứng minh ──────────────────────────────────────
 * 1. Có gọi ký lại với `{ force: true }` (ký lại KHÔNG force thì thẻ cũ còn khớp
 *    DID nên `ensureOrilifeToken` trả `true` ngay mà không đổi gì).
 * 2. Lượt thử lại gửi đi bằng THẺ MỚI. `orilifeAuthHeaderValue` giữ đệm 30 giây,
 *    nên quên ép đọc lại là gửi lại đúng cái thẻ vừa bị từ chối — và bài kiểm nào
 *    chỉ đếm số lần `fetch` sẽ không thấy chỗ đó.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockEnsureOrilifeToken = jest.fn(async (_base: string, _opts?: { force?: boolean }) => true);
jest.mock('./orilifeDidAuth', () => ({
  __esModule: true,
  ensureOrilifeToken: (base: string, opts?: { force?: boolean }) =>
    mockEnsureOrilifeToken(base, opts),
  clearOrilifeToken: jest.fn(async () => undefined),
  clearOrilifeLoginCooldown: jest.fn(),
}));

import { listFarms } from './farmService';
import { getTreeProfile } from './treeProfileService';
import { resetOrilifeAuthHeaderCache } from './orilifeAuthHeader';

const BASE = 'https://field.test';

/** Thẻ máy chủ chấp nhận, do lượt ký lại đặt vào kho. */
const FRESH = 'the-moi';
const STALE = 'the-cu';

function authOf(call: unknown): string | undefined {
  const init = (call as [string, { headers?: Record<string, string> }])[1];
  return init?.headers?.Authorization;
}

/**
 * Máy chủ từ chối lượt ĐẦU bằng 401, chấp nhận lượt sau. `ensureOrilifeToken`
 * giả lập lượt ký lại bằng cách ghi thẻ mới vào kho — đúng như bản thật làm.
 */
function serveExpiredThenFresh(okBody: Record<string, unknown>): jest.Mock {
  const fetchMock = jest.fn(async () => {
    const served = (await AsyncStorage.getItem('auth_token')) ?? '';
    if (served !== `${FRESH}`) {
      return { ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) };
    }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => okBody };
  });
  global.fetch = fetchMock as never;
  return fetchMock;
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetOrilifeAuthHeaderCache();
  await AsyncStorage.setItem('auth_token', STALE);
  mockEnsureOrilifeToken.mockImplementation(async (_base, opts) => {
    if (opts?.force) await AsyncStorage.setItem('auth_token', FRESH);
    return true;
  });
});

describe('farmService dùng chung đường làm mới phiên', () => {
  it('401 ⟹ ký lại có `force` rồi thử lại, và lượt thử lại mang THẺ MỚI', async () => {
    const fetchMock = serveExpiredThenFresh({ ok: true, farms: [] });

    const res = await listFarms(BASE);

    expect(res.ok).toBe(true);
    expect(mockEnsureOrilifeToken).toHaveBeenCalledWith(BASE, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${STALE}`);
    // Đệm 30 giây: quên ép đọc lại thì dòng dưới vẫn là thẻ cũ, và lượt hai
    // trượt y hệt lượt một — nhưng số lần gọi vẫn là 2, nên chỉ phép so này bắt được.
    expect(authOf(fetchMock.mock.calls[1])).toBe(`Bearer ${FRESH}`);
  });

  it('ký lại KHÔNG được ⟹ dừng ở `auth_error`, không thử lại vô hạn', async () => {
    mockEnsureOrilifeToken.mockResolvedValue(false);
    const fetchMock = serveExpiredThenFresh({ ok: true, farms: [] });

    const res = await listFarms(BASE);

    expect(res.ok).toBe(false);
    expect(res.error?.type).toBe('auth_error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('treeProfileService dùng chung đường làm mới phiên', () => {
  it('401 ⟹ ký lại có `force` rồi thử lại, và lượt thử lại mang THẺ MỚI', async () => {
    const fetchMock = serveExpiredThenFresh({ ok: true, profile: { variety: 'bưởi' } });

    const res = await getTreeProfile(BASE, 'tree-1');

    expect(res.ok).toBe(true);
    expect(mockEnsureOrilifeToken).toHaveBeenCalledWith(BASE, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${STALE}`);
    expect(authOf(fetchMock.mock.calls[1])).toBe(`Bearer ${FRESH}`);
  });

  it('ký lại KHÔNG được ⟹ dừng ở `auth_error`', async () => {
    mockEnsureOrilifeToken.mockResolvedValue(false);
    const fetchMock = serveExpiredThenFresh({ ok: true, profile: {} });

    const res = await getTreeProfile(BASE, 'tree-1');

    expect(res.ok).toBe(false);
    expect(res.error?.type).toBe('auth_error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
