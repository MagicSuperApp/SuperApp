// services/sessionRefreshCoverage.test.ts
//
// MỘT THẺ PHIÊN, BỐN NHÀ TIÊU THỤ — ĐƯỜNG TỰ CHỮA PHẢI PHỦ CẢ BỐN.
//
// ── Ca thực địa sinh ra bộ kiểm này ─────────────────────────────────────────
//    Ảnh chụp màn `Organisation wallet` trên Android: phần "CREATE A NEW
//    ORGANISATION" bày ra bình thường, còn "YOUR ORGANISATIONS" hiện
//    `Unauthorized — Missing Bearer token (mã 1304)` kèm một nút "Try again".
//
//    Nút đó không bao giờ đổi được kết quả. `OrgDidScreen.load()` chỉ gọi lại
//    `listOrgs()`, mà `orgMint-api` đọc đúng cái thẻ cũ trong kho rồi gắn lại
//    vào `Authorization`. Thẻ sống 1 giờ; `ensurePhoenixSession()` chạy ĐÚNG một
//    lần mỗi phiên đăng nhập (`navigation/index.tsx:1562`) và trả thẳng thẻ đã
//    lưu ra mà không hỏi hạn. Nên sau giờ thứ nhất, mọi lượt "Thử lại" là một
//    vòng lặp đóng.
//
// ── Vì sao nó lọt ─────────────────────────────────────────────────────────
//    Đường tự chữa CÓ, và viết rất kỹ — nhưng nằm trong `phoenixKey-api.ts`,
//    gắn vào riêng client của tệp đó. Ba nhà tiêu thụ còn lại đọc CÙNG khoá
//    `phoenixkey_session_token`, gắn CÙNG một header, và không có nhánh 401 nào:
//
//      orgMint-api.ts:215 · phoenixWallet-api.ts:108 · cardanoTxService.ts:189
//
//    Tức cùng một thẻ chết cho ra hai hành vi khác nhau tuỳ người dùng bấm vào
//    màn nào — màn Danh tính tự hồi, màn Ví tổ chức và màn Ví chuỗi kẹt cứng.
//    Bài kiểm dưới đây ghim cả hành vi lẫn độ phủ, vì chỉ ghim hành vi thì nhà
//    tiêu thụ thứ năm ra đời vẫn lọt y như bốn nhà này.
//
// ── Chỗ CÒN HỞ, ghi ra để nó thôi im ────────────────────────────────────────
//    `orgMint-api.ts:373` mở luồng SSE chờ ký bằng `XMLHttpRequest` và gắn
//    `Bearer` thủ công — ngoài mọi interceptor, nên thẻ hết hạn vẫn giết luồng
//    đó trong im lặng. Chưa vá: màn đa-chủ-sở-hữu mà nó phục vụ còn đóng sau
//    cờ `ORG_MINT_ENABLED`. Mở cờ đó thì phải vá chỗ này trước.

import type { AxiosError, AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname);

const doc = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');

describe('độ phủ: mọi client gắn Bearer đều phải có đường tự chữa 401', () => {
  // Danh sách này là BẢN KHAI, không phải kết quả quét — thêm một nhà tiêu thụ
  // mới mà quên thêm vào đây thì bài kiểm cuối cùng bắt được.
  const clientsAxios = ['orgMint-api.ts', 'phoenixWallet-api.ts', 'phoenixKey-api.ts'];

  it.each(clientsAxios)('%s gọi attachSessionRefresh cho client của nó', f => {
    expect(doc(f)).toMatch(/attachSessionRefresh\(client\)/);
  });

  it('cardanoTxService (fetch thô, ngoài axios) dùng chung lớp gộp remintSessionOnce', () => {
    const s = doc('cardanoTxService.ts');
    expect(s).toMatch(/remintSessionOnce/);
    // Đúng MỘT vòng — cờ `retried` phải chặn vòng hai.
    expect(s).toMatch(/res\.status === 401 && !retried/);
  });

  it('KHÔNG có tệp nào khác đọc khoá thẻ mà đứng ngoài danh sách trên', () => {
    const khai = new Set([...clientsAxios, 'cardanoTxService.ts']);
    const doc_ = fs
      .readdirSync(SRC)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter(f => doc(f).includes("'phoenixkey_session_token'"));

    // Đối chứng: phép quét phải tìm được ÍT NHẤT bốn tệp, nếu không thì điều
    // kiện lọc đã hỏng và bài kiểm này đang đạt một cách rỗng.
    expect(doc_.length).toBeGreaterThanOrEqual(4);

    expect(doc_.filter(f => !khai.has(f))).toEqual([]);
  });
});

describe('hành vi attachSessionRefresh', () => {
  type Handler = (e: AxiosError) => Promise<unknown>;

  /** Client giả: chỉ giữ lại hàm lỗi được đăng ký + đếm số lượt phát lại. */
  function fakeClient() {
    let onError: Handler | undefined;
    const requested: unknown[] = [];
    const instance = {
      interceptors: {
        response: {
          use: (_ok: unknown, err: Handler) => {
            onError = err;
          },
        },
      },
      request: (cfg: unknown) => {
        requested.push(cfg);
        return Promise.resolve({ data: 'lượt phát lại' });
      },
    };
    return { instance: instance as unknown as AxiosInstance, get onError() { return onError!; }, requested };
  }

  const loi = (status: number, config: Record<string, unknown>): AxiosError =>
    ({ response: { status }, config } as unknown as AxiosError);

  let api: typeof import('./phoenixKey-api');

  beforeEach(() => {
    jest.resetModules();
    api = require('./phoenixKey-api');
  });

  it('401 trên lượt needsAuth → đúc thẻ rồi phát lại đúng lượt đó', async () => {
    const dúc = jest.fn().mockResolvedValue('thẻ-mới');
    api.registerSessionRefresher(dúc);
    const c = fakeClient();
    api.attachSessionRefresh(c.instance);

    const cfg: Record<string, unknown> = { needsAuth: true, url: '/org/list' };
    await expect(c.onError(loi(401, cfg))).resolves.toEqual({ data: 'lượt phát lại' });

    expect(dúc).toHaveBeenCalledTimes(1);
    expect(c.requested).toEqual([cfg]);
    expect(cfg.__sessionRetried).toBe(true);
  });

  it('401 trên cửa CÔNG KHAI (không needsAuth) → ném thẳng, không hỏi vân tay', async () => {
    const dúc = jest.fn().mockResolvedValue('thẻ-mới');
    api.registerSessionRefresher(dúc);
    const c = fakeClient();
    api.attachSessionRefresh(c.instance);

    await expect(c.onError(loi(401, { url: '/public' }))).rejects.toBeDefined();
    expect(dúc).not.toHaveBeenCalled();
  });

  it('đã thử một lần rồi thì thôi — không vòng hai', async () => {
    const dúc = jest.fn().mockResolvedValue('thẻ-mới');
    api.registerSessionRefresher(dúc);
    const c = fakeClient();
    api.attachSessionRefresh(c.instance);

    const cfg = { needsAuth: true, __sessionRetried: true };
    await expect(c.onError(loi(401, cfg))).rejects.toBeDefined();
    expect(dúc).not.toHaveBeenCalled();
    expect(c.requested).toEqual([]);
  });

  it('403 KHÔNG kích hoạt đúc lại — đó là caller_did != path_did', async () => {
    const dúc = jest.fn().mockResolvedValue('thẻ-mới');
    api.registerSessionRefresher(dúc);
    const c = fakeClient();
    api.attachSessionRefresh(c.instance);

    await expect(c.onError(loi(403, { needsAuth: true }))).rejects.toBeDefined();
    expect(dúc).not.toHaveBeenCalled();
  });

  it('đúc lại trượt (trả null) → ném nguyên lỗi cũ, không phát lại', async () => {
    const dúc = jest.fn().mockResolvedValue(null);
    api.registerSessionRefresher(dúc);
    const c = fakeClient();
    api.attachSessionRefresh(c.instance);

    await expect(c.onError(loi(401, { needsAuth: true }))).rejects.toBeDefined();
    expect(dúc).toHaveBeenCalledTimes(1);
    expect(c.requested).toEqual([]);
  });

  it('chưa ai đăng ký hàm đúc → hành vi y như trước bản này (ném lỗi cũ)', async () => {
    const c = fakeClient();
    api.attachSessionRefresh(c.instance);

    await expect(c.onError(loi(401, { needsAuth: true }))).rejects.toBeDefined();
    expect(c.requested).toEqual([]);
  });

  it('remintSessionOnce trả null khi chưa ai đăng ký hàm đúc', async () => {
    await expect(api.remintSessionOnce()).resolves.toBeNull();
  });
});
