/**
 * Mã truy xuất công khai + ảnh QR của cây.
 *
 * Hai thứ bộ kiểm này khoá:
 *
 *  1. **Mã sai khuôn KHÔNG được bắn lên máy chủ.** Cùng lý lẽ với `parseTraceCode`:
 *     nới phép kiểm ra là mang chuỗi quét được TÙY Ý (mã của người khác, chuỗi
 *     độc) ra khỏi máy người dùng. Chặn phải xảy ra TRƯỚC `fetch`, và bài kiểm
 *     khẳng định `fetch` không hề được gọi.
 *
 *  2. **200 mà thân không phải SVG là HỎNG.** Máy chủ có thể trả trang lỗi HTML
 *     kèm mã 200. Đưa chuỗi đó thẳng cho `<SvgXml>` thì nó ném ở tầng vẽ — nơi
 *     không còn ngữ cảnh để nói câu tử tế. Bắt tại tầng dịch vụ.
 *
 * Ghi chú: cửa `/qr/{code}` được đọc từ mã nguồn máy chủ (`server.py:5440`) và
 * CHƯA từng gọi thật từ app. Nên `fetchTreeQrSvg` phải hỏng ÊM — mã chữ vẫn hiện
 * được để người dùng tự dựng QR bằng công cụ khác.
 */
import { publicTraceUrl, qrSvgUrl, fetchTreeQrSvg } from './treeQrService';

const BASE = 'https://api.orilife.io';
// Khuôn thật: ORI-{geohash7}-{crockford8}. geohash bỏ a,i,l,o (thường);
// crockford bỏ I,L,O,U (hoa).
const CODE = 'ORI-w3gvk2q-8F4KMNPQ';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe('dựng URL', () => {
  it('mã hợp lệ → trang công khai + cửa ảnh QR', () => {
    expect(publicTraceUrl(BASE, CODE)).toBe(`${BASE}/t/${CODE}`);
    expect(qrSvgUrl(BASE, CODE)).toBe(`${BASE}/qr/${CODE}`);
  });

  it('cắt dấu / cuối của base — không sinh //t/', () => {
    expect(publicTraceUrl('https://api.orilife.io/', CODE)).toBe(`${BASE}/t/${CODE}`);
  });

  it('nhận cả dạng URL trang công khai làm đầu vào', () => {
    expect(publicTraceUrl(BASE, `https://api.orilife.io/t/${CODE}`)).toBe(`${BASE}/t/${CODE}`);
  });

  it('mã sai khuôn → null, không dựng đường cụt', () => {
    expect(publicTraceUrl(BASE, 'ORI-xxx')).toBeNull();
    // `l` và `o` không có trong bảng geohash; `I` không có trong crockford.
    expect(publicTraceUrl(BASE, 'ORI-w3lvk2q-8F4KMNPQ')).toBeNull();
    expect(publicTraceUrl(BASE, 'ORI-w3gvk2q-8F4KMNPI')).toBeNull();
    expect(qrSvgUrl(BASE, '')).toBeNull();
  });

  it('base rỗng → null', () => {
    expect(publicTraceUrl('', CODE)).toBeNull();
  });
});

describe('fetchTreeQrSvg', () => {
  it('mã sai khuôn → hỏng TẠI MÁY, không bắn chuỗi lạ lên máy chủ', async () => {
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    const r = await fetchTreeQrSvg(BASE, 'ORI-hack; DROP');
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('trả SVG khi máy chủ trả SVG', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true, status: 200,
      text: async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    })) as unknown as typeof fetch;

    const r = await fetchTreeQrSvg(BASE, CODE);
    expect(r.ok).toBe(true);
    expect(r.svg).toContain('<svg');
  });

  it('200 mà thân là HTML → HỎNG, đừng đẩy sang tầng vẽ', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true, status: 200,
      text: async () => '<!doctype html><html><body>502</body></html>',
    })) as unknown as typeof fetch;

    const r = await fetchTreeQrSvg(BASE, CODE);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('HTTP lỗi → câu cho người đọc, không phải stack', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false, status: 404, text: async () => '',
    })) as unknown as typeof fetch;

    const r = await fetchTreeQrSvg(BASE, CODE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/404/);
  });

  it('mất mạng → KHÔNG ném, trả lỗi êm', async () => {
    globalThis.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;

    await expect(fetchTreeQrSvg(BASE, CODE)).resolves.toMatchObject({ ok: false });
  });

  it('thân quá lớn → từ chối vẽ', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true, status: 200,
      text: async () => `<svg>${'x'.repeat(300 * 1024)}</svg>`,
    })) as unknown as typeof fetch;

    const r = await fetchTreeQrSvg(BASE, CODE);
    expect(r.ok).toBe(false);
  });
});
