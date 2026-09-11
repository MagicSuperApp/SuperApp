/**
 * `waitMintSigned` — NHÀ TIÊU THỤ THỨ NĂM của `phoenixkey_session_token`.
 *
 * ── Vì sao tệp này tồn tại ───────────────────────────────────────────────────
 * Bốn nhà tiêu thụ kia (`phoenixKey-api`, `orgMint-api` nhánh axios,
 * `phoenixWallet-api`, `cardanoTxService`) đã được ghim đường tự chữa 401 ở
 * `sessionRefreshCoverage.test.ts` và `phoenixKeyApiAuthRetry.test.ts`. Luồng
 * SSE chờ ký (`waitMintSigned`, `orgMint-api.ts:373`) đọc CÙNG khoá kho, gắn
 * CÙNG header `Bearer`, nhưng đi thẳng `XMLHttpRequest` — ngoài mọi interceptor
 * axios — nên trước bản vá này không đường nào đúc lại thẻ cho nó. Phiên ký
 * m-of-n có thể treo hàng phút chờ người đồng ký khác; thẻ hết hạn giữa lúc chờ
 * biến màn hình chờ ký thành lỗi chết không có đường tự sửa.
 *
 * Hai ca dưới đây PHẢI cho ra hai kết quả KHÁC NHAU — nếu không thì bài kiểm
 * không kiểm gì (xem `_rules/Forall.md` §Kỷ luật phát ngôn, mục "ca xanh ở cả
 * hai cực"): "thẻ hết hạn rồi đúc lại được" phải mở lại được luồng và nghe hết
 * sự kiện `signed`; "thẻ hết hạn và đúc lại cũng hỏng" phải báo lỗi HTTP 401
 * đúng MỘT lần, không lặp vô hạn.
 */

// Kho giả có TRẠNG THÁI: `remintSessionOnce` không trả token qua giá trị hàm mà
// qua tác dụng phụ ghi lại kho (đúng hành vi `refreshSessionOnce` thật — xem
// `cardanoTxService.rawGet`, nó cũng gọi lại `AsyncStorage.getItem` sau khi đúc
// chứ không dùng thẳng giá trị trả về). Mock hằng số ở đây sẽ khiến lượt phát
// lại vẫn đọc token CŨ — xanh giả.
let mockKhoToken = 'thẻ-cũ';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (k === 'phoenixkey_session_token' ? mockKhoToken : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    if (k === 'phoenixkey_session_token') mockKhoToken = v;
  }),
  removeItem: jest.fn(async () => undefined),
}));

/** XHR giả — đủ bề mặt cho `waitMintSigned`, điều khiển được từ bài kiểm. */
class FakeXHR {
  static instances: FakeXHR[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  readyState = 0;
  status = 0;
  responseText = '';
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  aborted = false;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send() {
    // Bài kiểm tự đẩy trạng thái bằng respond()/fail() — send() không tự chạy gì.
  }
  abort() {
    this.aborted = true;
  }

  /** Đẩy một phản hồi HTTP xong hẳn (readyState 4) kèm thân SSE tuỳ ý. */
  respond(status: number, body = '') {
    this.status = status;
    this.responseText = body;
    this.readyState = 4;
    this.onreadystatechange?.();
  }
}

(global as any).XMLHttpRequest = FakeXHR;

describe('waitMintSigned: 401 giữa lúc chờ ký thì đúc lại thẻ rồi mở lại luồng', () => {
  beforeEach(() => {
    jest.resetModules();
    FakeXHR.instances = [];
    mockKhoToken = 'thẻ-cũ';
  });

  it('đúc lại THÀNH CÔNG ⇒ mở luồng thứ hai bằng thẻ mới, và nghe được sự kiện signed', async () => {
    const api = require('./phoenixKey-api');
    const storage = require('@react-native-async-storage/async-storage');
    // Refresher THẬT ghi thẻ mới vào kho làm tác dụng phụ — mock phải mô phỏng
    // đúng cái đó, không chỉ trả về một chuỗi.
    const refresher = jest.fn(async () => {
      await storage.setItem('phoenixkey_session_token', 'thẻ-mới');
      return 'thẻ-mới';
    });
    api.registerSessionRefresher(refresher);

    const { waitMintSigned } = require('./orgMint-api');
    const onSigned = jest.fn();
    const onError = jest.fn();

    waitMintSigned('req-1', { onSigned, onError });

    // AsyncStorage.getItem là async — nhả hàng đợi vi tác vụ để send() thật sự chạy.
    await new Promise(r => setImmediate(r));
    expect(FakeXHR.instances).toHaveLength(1);

    // Lượt đầu: 401.
    FakeXHR.instances[0].respond(401);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(FakeXHR.instances).toHaveLength(2);
    expect(FakeXHR.instances[1].headers.Authorization).toBe('Bearer thẻ-mới');

    // Lượt hai (thẻ mới): server trả sự kiện đã ký.
    FakeXHR.instances[1].respond(200, 'data: {"type":"signed"}\n\n');
    expect(onSigned).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('đúc lại CŨNG HỎNG ⇒ báo lỗi HTTP 401 đúng MỘT lần, không mở luồng thứ ba', async () => {
    const api = require('./phoenixKey-api');
    const refresher = jest.fn(async () => null);
    api.registerSessionRefresher(refresher);

    const { waitMintSigned } = require('./orgMint-api');
    const onSigned = jest.fn();
    const onError = jest.fn();

    waitMintSigned('req-2', { onSigned, onError });
    await new Promise(r => setImmediate(r));
    expect(FakeXHR.instances).toHaveLength(1);

    FakeXHR.instances[0].respond(401);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/401/);
    expect(onSigned).not.toHaveBeenCalled();
    // Không mở lượt thứ hai — thẻ mới mà vẫn không có thì không có gì để thử lại.
    expect(FakeXHR.instances).toHaveLength(1);
  });

  it('thẻ mới mà VẪN 401 thì dừng — không đúc vòng hai', async () => {
    const api = require('./phoenixKey-api');
    const storage = require('@react-native-async-storage/async-storage');
    const refresher = jest.fn(async () => {
      await storage.setItem('phoenixkey_session_token', 'thẻ-mới');
      return 'thẻ-mới';
    });
    api.registerSessionRefresher(refresher);

    const { waitMintSigned } = require('./orgMint-api');
    const onError = jest.fn();

    waitMintSigned('req-3', { onSigned: jest.fn(), onError });
    await new Promise(r => setImmediate(r));

    FakeXHR.instances[0].respond(401);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(FakeXHR.instances).toHaveLength(2);

    // Lượt hai cũng 401 — không được đúc thêm lần nữa.
    FakeXHR.instances[1].respond(401);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(FakeXHR.instances).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
