import { getLampnetViewBase, resetLampnetViewCache } from './lampnetView';

const BASE = 'https://api.orilife.io';

function mockFetch(impl: (url: string) => Promise<any> | any) {
  (global as any).fetch = jest.fn((url: string) => Promise.resolve(impl(url)));
  return (global as any).fetch as jest.Mock;
}

const jsonOk = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => { resetLampnetViewCache(); });
afterEach(() => { delete (global as any).fetch; });

describe('getLampnetViewBase — cổng xem tệp theo CID đọc từ máy chủ, không đóng cứng', () => {
  it('đọc `lampnet_view` từ /api/health', async () => {
    const f = mockFetch(() => jsonOk({ lampnet_view: 'https://lampnet.cloud' }));
    await expect(getLampnetViewBase(BASE)).resolves.toBe('https://lampnet.cloud');
    expect(f).toHaveBeenCalledWith(`${BASE}/api/health`, expect.anything());
  });

  it('KHÔNG gửi Authorization — cổng trả về thường là HOST KHÁC, gắn token là rò', async () => {
    const f = mockFetch(() => jsonOk({ lampnet_view: 'https://lampnet.cloud' }));
    await getLampnetViewBase(BASE);
    const init = f.mock.calls[0][1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  it('cắt gạch chéo cuối, và base có gạch thừa cũng chỉ ra một /api/health', async () => {
    const f = mockFetch(() => jsonOk({ lampnet_view: 'https://v.io/c/' }));
    await expect(getLampnetViewBase(`${BASE}/`)).resolves.toBe('https://v.io/c');
    expect(f.mock.calls[0][0]).toBe(`${BASE}/api/health`);
  });

  it('hỏi MỘT lần cho cả phiên — một dải 8 ảnh không gọi mạng 8 lượt', async () => {
    const f = mockFetch(() => jsonOk({ lampnet_view: 'https://lampnet.cloud' }));
    await getLampnetViewBase(BASE);
    await getLampnetViewBase(BASE);
    await getLampnetViewBase(BASE);
    expect(f).toHaveBeenCalledTimes(1);
  });

  // Bốn ca dưới đây đều phải ra `null` = "CHƯA BIẾT". Nơi gọi đọc null thành "bỏ
  // phần tử cid", nên null sai hướng nào cũng chỉ mất ảnh, không dựng URL bịa.
  it('máy chủ không trả trường đó → null', async () => {
    mockFetch(() => jsonOk({ ok: true }));
    await expect(getLampnetViewBase(BASE)).resolves.toBeNull();
  });

  it('trường có nhưng KHÔNG phải http(s) → null, không dùng bừa', async () => {
    mockFetch(() => jsonOk({ lampnet_view: '/gimg' }));
    await expect(getLampnetViewBase(BASE)).resolves.toBeNull();
    resetLampnetViewCache();
    mockFetch(() => jsonOk({ lampnet_view: 'javascript:alert(1)' }));
    await expect(getLampnetViewBase(BASE)).resolves.toBeNull();
  });

  it('HTTP không 2xx → null', async () => {
    mockFetch(() => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(getLampnetViewBase(BASE)).resolves.toBeNull();
  });

  it('fetch NÉM → null, KHÔNG ném ra ngoài (một dải ảnh không được làm sập màn)', async () => {
    (global as any).fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    await expect(getLampnetViewBase(BASE)).resolves.toBeNull();
  });

  it('thân không phải JSON → null', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } }));
    await expect(getLampnetViewBase(BASE)).resolves.toBeNull();
  });

  it('base rỗng → null và KHÔNG chạm mạng', async () => {
    const f = mockFetch(() => jsonOk({ lampnet_view: 'https://lampnet.cloud' }));
    await expect(getLampnetViewBase('')).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('đệm ÂM hết hạn thì hỏi lại — mạng vườn chập chờn, đừng khoá cả phiên', async () => {
    const f = mockFetch(() => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(getLampnetViewBase(BASE)).resolves.toBeNull();
    expect(f).toHaveBeenCalledTimes(1);

    // Chưa quá hạn → không hỏi lại.
    await getLampnetViewBase(BASE);
    expect(f).toHaveBeenCalledTimes(1);

    // Quá 60 giây → hỏi lại, và lần này máy chủ đã sống.
    const real = Date.now;
    Date.now = () => real() + 61_000;
    try {
      mockFetch(() => jsonOk({ lampnet_view: 'https://lampnet.cloud' }));
      await expect(getLampnetViewBase(BASE)).resolves.toBe('https://lampnet.cloud');
    } finally {
      Date.now = real;
    }
  });
});
