/**
 * Cửa PhoenixKey gặp 401 thì ĐÚC LẠI THẺ rồi phát lại, không chết câm.
 *
 * ── Ca hỏng bài này sinh ra để chặn ─────────────────────────────────────────
 * Thẻ phiên PhoenixKey sống 1 giờ. `ensurePhoenixSession` trả thẳng thẻ đã lưu
 * ra mà KHÔNG hỏi hạn, và nó chỉ được gọi đúng một lần mỗi phiên đăng nhập
 * (`navigation/index.tsx:1562`). Tới 2026-09-10, `phoenixKey-api.ts` không có
 * nhánh lỗi nào trong bộ chặn phản hồi.
 *
 * Hệ quả ngoài thực địa: đăng nhập lúc 7h rồi đi ruộng; 8h05 thẻ hết hạn; từ đó
 * `/wallet/{did}/all`, `/wallet/{did}/utxos`, `/devices/register`,
 * `/seed/export-request`, `/guardians/*`, `/keys/*` đều 401. Màn Ví hiện ba dấu
 * "—". Kéo xuống làm mới: y hệt. Tắt app mở lại: y hệt — thẻ chết vẫn nằm trong
 * kho và vẫn được trả ra. Lối thoát duy nhất là đăng xuất rồi đăng nhập lại, và
 * không câu nào trên màn gợi ý điều đó.
 *
 * ── Vì sao ba ca dưới đây, không phải một ───────────────────────────────────
 * Một bài chỉ kiểm "401 thì thử lại" xanh y hệt ở bản đúng và ở bản thử lại VÔ
 * HẠN, hay bản đúc thẻ cho cả cửa công khai (bật hộp sinh trắc hỏi người chỉ
 * đang quét mã trên thùng hàng). Ba ràng buộc là ba cách hỏng khác nhau, nên
 * mỗi cái một ca.
 */
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * Bộ chặn phản hồi được lấy ra từ chính lượt đăng ký của module, không dựng lại
 * bản sao. Dựng bản sao là kiểm một thứ khác mang cùng hình dạng.
 */
type ErrorHandler = (error: AxiosError) => Promise<unknown>;
let onError: ErrorHandler;
let requestSpy: jest.Mock;
let refresher: jest.Mock;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => 'the-token'),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('axios', () => {
  const request = jest.fn(async () => ({ data: { code: 1000 } }));
  const instance = {
    request,
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
  };
  return { __esModule: true, default: { create: jest.fn(() => instance) }, create: jest.fn(() => instance) };
});

beforeEach(() => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const axios = require('axios').default;
  const instance = axios.create();
  requestSpy = instance.request;
  requestSpy.mockClear();
  instance.interceptors.response.use.mockClear();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const api = require('./phoenixKey-api');

  // TÌM hàm lỗi, không lấy theo VỊ TRÍ. Bản trước đăng ký một lượt
  // `use(thành-công, lỗi)` nên `calls[0][1]` trúng; nay nhánh 401 đã tách thành
  // `attachSessionRefresh()` dùng chung cho bốn client, và nó đăng ký một lượt
  // RIÊNG `use(undefined, lỗi)` sau lượt đổi khoá camelCase. Lấy theo vị trí thì
  // bộ kiểm đỏ vì THỨ TỰ ĐĂNG KÝ đổi, trong khi hành vi nó canh không đổi gì —
  // đúng loại đỏ giả dạy người ta sửa bộ kiểm cho vừa mã.
  const calls = instance.interceptors.response.use.mock.calls as unknown[][];
  const coHamLoi = calls.find(c => typeof c[1] === 'function');
  if (!coHamLoi) throw new Error('Không client nào đăng ký nhánh lỗi 401 — đường tự chữa đã mất.');
  onError = coHamLoi[1] as ErrorHandler;

  refresher = jest.fn(async () => 'fresh-token');
  api.registerSessionRefresher(refresher);
});

const failWith = (
  status: number,
  config: Partial<InternalAxiosRequestConfig> & { needsAuth?: boolean },
): AxiosError =>
  ({
    config: { headers: {}, ...config },
    response: { status },
    isAxiosError: true,
    message: `HTTP ${status}`,
  }) as unknown as AxiosError;

describe('401 ở cửa PhoenixKey thì đúc lại thẻ rồi phát lại', () => {
  it('lượt gọi cần phiên gặp 401 ⇒ đúc thẻ MỘT lần rồi phát lại đúng lượt đó', async () => {
    await onError(failWith(401, { needsAuth: true, url: '/wallet/did/all' }));
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0].url).toEqual('/wallet/did/all');
  });

  it('cửa CÔNG KHAI gặp 401 thì KHÔNG đúc thẻ — đừng hỏi vân tay người đang quét mã', async () => {
    // Không có ca này, một bản "cứ 401 là đúc" vẫn xanh ở ca trên, và người quét
    // mã trên thùng hàng lĩnh một hộp Face ID cho thứ họ không cần đăng nhập.
    await expect(onError(failWith(401, { url: '/public/thing' }))).rejects.toBeDefined();
    expect(refresher).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('thẻ mới mà VẪN 401 thì dừng — không vòng lặp vô hạn kèm hộp sinh trắc', async () => {
    const again = failWith(401, { needsAuth: true, url: '/keys/list' });
    await onError(again);
    // Lượt phát lại cũng hỏng: bộ chặn nhận lại CHÍNH cấu hình đã đánh dấu.
    await expect(onError(failWith(401, again.config as never))).rejects.toBeDefined();
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('403 KHÔNG kích đúc thẻ — ở cửa ví nó nghĩa là sai chủ thể, ký lại ra y hệt', async () => {
    await expect(onError(failWith(403, { needsAuth: true, url: '/wallet/x/all' }))).rejects.toBeDefined();
    expect(refresher).not.toHaveBeenCalled();
  });

  it('nhiều lượt hỏng cùng lúc chỉ đúc thẻ MỘT lần — không phải mỗi lượt một hộp Face ID', async () => {
    // `ensurePhoenixSession({force:true})` cố ý đi vòng qua khoá chống chạy trùng
    // của chính nó, nên lớp gộp phải nằm ở phía này. Màn Ví phát ba lượt song song.
    let release: (v: string) => void = () => {};
    refresher.mockImplementation(() => new Promise<string>((r) => (release = r)));
    const flying = [
      onError(failWith(401, { needsAuth: true, url: '/wallet/d/all' })),
      onError(failWith(401, { needsAuth: true, url: '/wallet/d/utxos' })),
      onError(failWith(401, { needsAuth: true, url: '/wallet/params' })),
    ];
    // `refresher` chỉ được gọi SAU một `await` trong `refreshSessionOnce`, nên
    // lúc này `release` vẫn còn là hàm rỗng. Nhả hàng đợi vi tác vụ trước đã —
    // không có dòng này thì ca treo tới hết giờ và đọc như một lỗi khác hẳn.
    await new Promise((r) => setImmediate(r));
    release('fresh-token');
    await Promise.all(flying);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledTimes(3);
  });

  it('chưa ai đăng ký hàm đúc thì ném nguyên lỗi cũ — không xấu hơn bản trước', async () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios').default;
    const instance = axios.create();
    instance.interceptors.response.use.mockClear();
    instance.request.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./phoenixKey-api');
    // Tìm theo hình dạng, không theo vị trí — xem chú thích ở `beforeEach`.
    const handler = (instance.interceptors.response.use.mock.calls as unknown[][]).find(
      c => typeof c[1] === 'function',
    )![1] as ErrorHandler;
    await expect(handler(failWith(401, { needsAuth: true }))).rejects.toBeDefined();
    expect(instance.request).not.toHaveBeenCalled();
  });
});
