/**
 * `cardanoTxService.rawGet` — 401 giữa lúc lấy UTXO/protocol-params thì đúc lại
 * thẻ rồi phát lại, không phải chỉ ĐƯỢC KHAI báo bằng regex.
 *
 * ── Vì sao tệp này tồn tại ───────────────────────────────────────────────────
 * `sessionRefreshCoverage.test.ts` (PR "Máy đã có danh tính thì phải có lối
 * ra…") chỉ kiểm bằng cách ĐỌC MÃ NGUỒN dưới dạng chuỗi
 * (`expect(s).toMatch(/res\.status === 401 && !retried/)`), không hề CHẠY hàm.
 * Một lỗi lô-gíc thật — ví dụ quên `return` trước lượt gọi đệ quy, hay đọc
 * nhầm biến — vẫn khớp đúng regex đó và bài kiểm vẫn xanh. Tệp này chạy thẳng
 * `fetchWalletUtxosAndParams` (hàm công khai duy nhất dùng `rawGet`) qua một
 * `global.fetch` giả, để hai ca dưới đây THẬT SỰ phân biệt được nhau — không
 * chỉ đọc chữ trong mã.
 */

// `export {}` ép tệp này thành MODULE riêng — xem chú thích cùng dòng ở
// `orgMintWaitSigned401.test.ts` (cùng tên biến `mockKhoToken`, khác tệp).
export {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (k === 'phoenixkey_session_token' ? mockKhoToken : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    if (k === 'phoenixkey_session_token') mockKhoToken = v;
  }),
  removeItem: jest.fn(async () => undefined),
}));

let mockKhoToken = 'thẻ-cũ';

const jsonRes = (status: number, body: unknown): Response =>
  ({
    status,
    json: async () => body,
  } as unknown as Response);

describe('fetchWalletUtxosAndParams: 401 giữa lúc lấy UTXO thì đúc lại thẻ rồi phát lại', () => {
  beforeEach(() => {
    jest.resetModules();
    mockKhoToken = 'thẻ-cũ';
  });

  it('đúc lại THÀNH CÔNG ⇒ lượt phát lại dùng thẻ mới, trả đúng UTXO', async () => {
    const api = require('./phoenixKey-api');
    const storage = require('@react-native-async-storage/async-storage');
    api.registerSessionRefresher(async () => {
      await storage.setItem('phoenixkey_session_token', 'thẻ-mới');
      return 'thẻ-mới';
    });

    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    // Lượt 1 (UTXO, thẻ cũ) → 401.
    fetchMock.mockResolvedValueOnce(jsonRes(401, { code: 1304, message: 'Unauthorized' }));
    // Lượt 2 (UTXO, thẻ mới sau đúc) → 200.
    fetchMock.mockResolvedValueOnce(
      jsonRes(200, { code: 1000, result: { items: [] } }),
    );
    // Lượt 3 (params, thẻ mới — KHÔNG 401 nữa vì thẻ đã mới) → 200.
    fetchMock.mockResolvedValueOnce(
      jsonRes(200, { code: 1000, result: { min_fee_a: 44 } }),
    );

    const { fetchWalletUtxosAndParams } = require('./cardanoTxService');
    const out = await fetchWalletUtxosAndParams('did:phoenix:abc');

    expect(JSON.parse(out.protocolParamsJson)).toEqual({ min_fee_a: 44 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Lượt phát lại (thứ hai) phải gắn Bearer THẺ MỚI, không phải thẻ cũ vừa hỏng.
    const lanPhatLai = fetchMock.mock.calls[1];
    expect((lanPhatLai[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer thẻ-mới',
    });
  });

  it('đúc lại CŨNG HỎNG ⇒ ném đúng lỗi 401 của máy chủ, KHÔNG âm thầm trả rỗng', async () => {
    const api = require('./phoenixKey-api');
    api.registerSessionRefresher(async () => null);

    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    fetchMock.mockResolvedValue(
      jsonRes(401, { code: 1304, message: 'Unauthorized — Missing Bearer token' }),
    );

    const { fetchWalletUtxosAndParams } = require('./cardanoTxService');
    await expect(fetchWalletUtxosAndParams('did:phoenix:abc')).rejects.toMatchObject({
      httpStatus: 401,
      message: 'Unauthorized — Missing Bearer token',
    });
    // Đúc lại thất bại (`fresh` rỗng) ⇒ rawGet KHÔNG phát lại — chỉ đúng MỘT
    // lượt gọi mạng, thân 401 gốc được bóc ra thành lỗi ném thẳng.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('thẻ mới mà VẪN 401 thì dừng — không đúc vòng hai, ném lỗi thật', async () => {
    const api = require('./phoenixKey-api');
    const storage = require('@react-native-async-storage/async-storage');
    const refresher = jest.fn(async () => {
      await storage.setItem('phoenixkey_session_token', 'thẻ-mới');
      return 'thẻ-mới';
    });
    api.registerSessionRefresher(refresher);

    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    fetchMock.mockResolvedValue(jsonRes(401, { code: 1304, message: 'Unauthorized' }));

    const { fetchWalletUtxosAndParams } = require('./cardanoTxService');
    await expect(fetchWalletUtxosAndParams('did:phoenix:abc')).rejects.toMatchObject({
      httpStatus: 401,
    });
    expect(refresher).toHaveBeenCalledTimes(1);
    // Đúng hai lượt gọi mạng cho path UTXO (gốc + một lần phát lại) — không vòng ba.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
