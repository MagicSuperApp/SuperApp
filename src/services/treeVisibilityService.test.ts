/**
 * Bật công khai cho cây — `POST /api/tree/set_visibility`.
 *
 * Ba thứ bộ kiểm này khoá:
 *
 *  1. **429 ở cửa này là HẾT SUẤT, không phải "máy chủ bận".** `PUBLISH_RL` là
 *     cửa sổ trượt 50 cây / 24 giờ / tài khoản (`server.py:866`). Hiện câu "thử
 *     lại sau" là mời nông dân bấm lại 50 lần vô ích — và câu đó là mặc định mà
 *     mọi lớp gọi API khác trong kho đang dùng cho 429, nên rất dễ chép nhầm sang.
 *
 *  2. **Mức lạ phải chặn TẠI MÁY.** Máy chủ trả 400 cho enum lạ; bắn một vòng
 *     mạng để nhận câu trả lời đã biết trước là phí, và trên sóng yếu ngoài vườn
 *     thì nó biểu hiện thành "bấm xong không thấy gì".
 *
 *  3. **Trường tuỳ chọn KHÔNG được tự điền.** Không gửi = máy chủ giữ nguyên giá
 *     trị đang có. Gửi kèm một mặc định mà người dùng không chọn là âm thầm đổi
 *     hộ họ mức lộ vị trí — đúng thứ không được phép làm sau lưng chủ vườn.
 */
import { setTreeVisibility, isPublicVisibility, VISIBILITY_VALUES } from './treeVisibilityService';

jest.mock('./orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn(async () => true),
}));

const BASE = 'https://api.orilife.io';
const TID = 'tree_abc';

const realFetch = globalThis.fetch;
let lastInit: RequestInit | undefined;
let lastUrl: string | undefined;

function mockOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  globalThis.fetch = jest.fn(async (url: unknown, init?: unknown) => {
    lastUrl = String(url);
    lastInit = init as RequestInit;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      headers: { get: (k: string) => headers[k] ?? null },
    };
  }) as unknown as typeof fetch;
}

/**
 * Ghi lại từng trường nạp vào `FormData`. Theo dõi thẳng `append` thay vì đọc
 * `_parts`/`getParts()`: hai thứ đó có thể vắng ở bản polyfill, và khi vắng thì
 * bài kiểm "KHÔNG tự điền expose_location" hoá thành bài LUÔN XANH. Khuôn lấy từ
 * `grantService.test.ts`.
 */
const spyForm = () => {
  const sent: Array<[string, unknown]> = [];
  jest
    .spyOn(FormData.prototype, 'append')
    .mockImplementation(function (this: FormData, k: string, v: unknown) {
      sent.push([k, v]);
    } as never);
  return sent;
};

function asObject(sent: Array<[string, unknown]>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  sent.forEach(([k, v]) => { out[k] = v; });
  return out;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
  jest.clearAllMocks();
  lastInit = undefined;
  lastUrl = undefined;
});

describe('setTreeVisibility', () => {
  it('gửi đúng cửa + đúng hai trường bắt buộc', async () => {
    mockOnce(200, { ok: true });
    const sent = spyForm();
    const r = await setTreeVisibility(BASE, TID, 'public_readonly');

    expect(r.ok).toBe(true);
    expect(lastUrl).toBe('https://api.orilife.io/api/tree/set_visibility');
    expect(asObject(sent)).toMatchObject({
      tree_id: TID,
      visibility: 'public_readonly',
    });
  });

  it('KHÔNG tự điền expose_location / public_card khi người dùng không chọn', async () => {
    mockOnce(200, { ok: true });
    const sent = spyForm();
    await setTreeVisibility(BASE, TID, 'public_readonly');

    const parts = asObject(sent);
    expect(parts).not.toHaveProperty('expose_location');
    expect(parts).not.toHaveProperty('public_card');
  });

  it('gửi hai trường đó khi ĐƯỢC chọn, public_card thành 1/0', async () => {
    mockOnce(200, { ok: true });
    const sent = spyForm();
    await setTreeVisibility(BASE, TID, 'public_contributable', {
      exposeLocation: 'geohash_coarse',
      publicCard: false,
    });

    expect(asObject(sent)).toMatchObject({
      expose_location: 'geohash_coarse',
      public_card: '0',
    });
  });

  it('mức lạ → chặn tại máy, KHÔNG bắn request', async () => {
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    const r = await setTreeVisibility(BASE, TID, 'cong_khai' as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid');
    expect(spy).not.toHaveBeenCalled();
  });

  it('thiếu mã cây → chặn tại máy', async () => {
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    const r = await setTreeVisibility(BASE, '', 'private');
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('429 → HẾT SUẤT 24 giờ, KHÔNG phải "máy chủ bận"', async () => {
    mockOnce(429, { retry_after: 3600 });
    const r = await setTreeVisibility(BASE, TID, 'public_readonly');

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('quota');
      expect(r.error.message).toMatch(/24 giờ/);
      expect(r.error.message).not.toMatch(/bận/i);
      expect(r.error.retry_after).toBe(3600);
    }
  });

  it('400 → dùng câu `detail` của máy chủ', async () => {
    mockOnce(400, { detail: 'Cây không thuộc tài khoản này.' });
    const r = await setTreeVisibility(BASE, TID, 'public_readonly');

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('invalid');
      expect(r.error.message).toBe('Cây không thuộc tài khoản này.');
    }
  });

  it('200 mà thân rỗng vẫn là THÀNH CÔNG — cửa này trả trạng thái, không trả dữ liệu', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error('không phải JSON'); },
      headers: { get: () => null },
    })) as unknown as typeof fetch;

    const r = await setTreeVisibility(BASE, TID, 'private');
    expect(r.ok).toBe(true);
  });
});

describe('isPublicVisibility', () => {
  it('chỉ hai mức public mới là công khai', () => {
    expect(isPublicVisibility('public_readonly')).toBe(true);
    expect(isPublicVisibility('public_contributable')).toBe(true);
    expect(isPublicVisibility('private')).toBe(false);
    // Cây "chưa đặt" (85/139 trên kho sản xuất) KHÔNG được đọc thành công khai.
    expect(isPublicVisibility(undefined)).toBe(false);
    expect(isPublicVisibility(null)).toBe(false);
  });

  it('enum khớp đúng ba mức máy chủ nhận', () => {
    expect([...VISIBILITY_VALUES]).toEqual(['private', 'public_readonly', 'public_contributable']);
  });
});
