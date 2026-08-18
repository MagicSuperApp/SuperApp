/**
 * Tra cứu quả cho NGƯỜI MUA — `POST /api/fruit/lookup`.
 *
 * Bộ kiểm này khoá bốn thứ, cả bốn đều thuộc họ "hỏng mà không có gì báo":
 *
 *  1. **KHÔNG gửi `Authorization`.** Cửa này phục vụ người chưa có tài khoản.
 *     Kèm token vào là đổi phạm vi phía máy chủ VÀ khoá cửa trước mặt đúng người
 *     cửa này sinh ra để phục vụ. Lỗi kiểu này im hoàn toàn khi lập trình viên
 *     thử trên máy mình — vì máy mình lúc nào cũng đã đăng nhập.
 *
 *  2. **KHÔNG gửi `lat`/`lon`.** Route CỐ Ý không nhận (`server.py:8337`). Đường
 *     NÔNG DÂN thì ngược lại — ở đó toạ độ là tín hiệu thu hẹp mạnh nhất. Hai
 *     đường ngược chiều nhau nên chép nhầm là chuyện sẽ xảy ra; khoá lại ở đây.
 *
 *  3. **`EMPTY_SCOPE` ≠ "không tìm thấy".** Đo trên kho sản xuất 08/2026: 0 cây
 *     công khai ⟹ đây là câu trả lời THƯỜNG GẶP NHẤT hôm nay. Gộp nó vào "không
 *     tìm thấy" là đổ lỗi cho người mua về việc nông dân chưa bật công khai.
 *
 *  4. **`SOLO` phải ra CÙNG một hình dạng với `CHOICES`.** Trả hai hình dạng
 *     khác nhau sẽ dụ màn hình vẽ hai kiểu, rồi ca một-ứng-viên trông như một
 *     câu khẳng định — đúng thứ mà tỉ lệ nhận nhầm 73% cấm hứa.
 */
import {
  lookupFruit,
  lookupCandidates,
  lookupImageUrl,
  needsRegionPick,
  isEmptyScope,
  getLookupSession,
} from './fruitLookupService';

const BASE = 'https://api.orilife.io';
const IMG = 'file:///tmp/qua.jpg';

const realFetch = globalThis.fetch;

/** Bắt lại request cuối để soi header + thân. */
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
 * Ghi lại từng trường nạp vào `FormData`.
 *
 * KHÔNG đọc `_parts`/`getParts()` của bản polyfill React Native: hai thứ đó có
 * thể vắng, và khi vắng thì bài kiểm "KHÔNG gửi lat/lon" hoá thành một bài LUÔN
 * XANH dù mã có gửi hay không — đúng cái vỏ im lặng mà tệp này đi khoá. Theo dõi
 * thẳng `append` thì không có đường nào lọt. Khuôn lấy từ `grantService.test.ts`.
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

/** Mảng cặp → bảng, cho `toMatchObject` đọc được. */
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

describe('lookupFruit — hợp đồng đường dây', () => {
  it('KHÔNG gửi Authorization — người mua chưa có tài khoản', async () => {
    mockOnce(200, { ok: true, verdict: 'CHOICES', candidates: [] });
    await lookupFruit(BASE, IMG);

    const headers = (lastInit?.headers ?? {}) as Record<string, string>;
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
  });

  it('KHÔNG gửi lat/lon — vị trí người mua không phải thứ hệ này thu', async () => {
    mockOnce(200, { ok: true, verdict: 'CHOICES', candidates: [] });
    const sent = spyForm();
    await lookupFruit(BASE, IMG);

    const parts = asObject(sent);
    expect(parts).not.toHaveProperty('lat');
    expect(parts).not.toHaveProperty('lon');
  });

  it('gọi đúng đường và luôn kèm mã phiên cho lớp hạn tần suất chặt nhất', async () => {
    mockOnce(200, { ok: true, verdict: 'CHOICES', candidates: [] });
    const sent = spyForm();
    await lookupFruit(BASE, IMG);

    expect(lastUrl).toBe('https://api.orilife.io/api/fruit/lookup');
    expect(asObject(sent).sess).toEqual(expect.any(String));
  });

  it('gửi khung khoanh khi có, KHÔNG gửi khi không có', async () => {
    mockOnce(200, { ok: true });
    const withRegion = spyForm();
    await lookupFruit(BASE, IMG, { region: { bbox: [1, 2, 3, 4], shape: 'rect' } });
    expect(asObject(withRegion)).toMatchObject({
      bbox_x: '1', bbox_y: '2', bbox_w: '3', bbox_h: '4', shape: 'rect',
    });

    jest.restoreAllMocks();
    mockOnce(200, { ok: true });
    const without = spyForm();
    await lookupFruit(BASE, IMG);
    expect(asObject(without)).not.toHaveProperty('bbox_x');
  });

  it('cắt dấu / cuối của base — không sinh đường //api', async () => {
    mockOnce(200, { ok: true });
    await lookupFruit('https://api.orilife.io/', IMG);
    expect(lastUrl).toBe('https://api.orilife.io/api/fruit/lookup');
  });
});

describe('lookupFruit — ba mã lỗi của hợp đồng', () => {
  it('400 → image_unusable, ưu tiên câu của máy chủ', async () => {
    mockOnce(400, { error_code: 'image_unusable', message: 'Ảnh mờ quá.' });
    const r = await lookupFruit(BASE, IMG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('image_unusable');
      expect(r.error.message).toBe('Ảnh mờ quá.');
    }
  });

  it('413 → too_large', async () => {
    mockOnce(413, {});
    const r = await lookupFruit(BASE, IMG);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('too_large');
  });

  it('429 → rate_limited, đọc retry_after từ THÂN', async () => {
    mockOnce(429, { error_code: 'rate_limited', retry_after: 42 });
    const r = await lookupFruit(BASE, IMG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('rate_limited');
      expect(r.error.retry_after).toBe(42);
    }
  });

  it('429 thiếu retry_after trong thân → lui về header Retry-After', async () => {
    mockOnce(429, {}, { 'Retry-After': '7' });
    const r = await lookupFruit(BASE, IMG);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.retry_after).toBe(7);
  });

  it('base rỗng → hỏng tại chỗ, KHÔNG bắn một request vô nghĩa', async () => {
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const r = await lookupFruit('', IMG);
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('đọc phản hồi — chỗ dễ hiểu ngược nhất', () => {
  it('need_region là "chưa xong", KHÔNG phải kết quả rỗng', () => {
    const r = { ok: true, need_region: true, regions: [{ index: 0, bbox: [0, 0, 1, 1] as [number, number, number, number] }] };
    expect(needsRegionPick(r)).toBe(true);
    expect(lookupCandidates(r)).toEqual([]);
  });

  it('SOLO gộp `fruit` vào cùng mảng ứng viên như CHOICES', () => {
    const solo = { ok: true, verdict: 'SOLO' as const, fruit: { pick: 1, name: 'Quả 3' }, candidates: [] };
    expect(lookupCandidates(solo)).toEqual([{ pick: 1, name: 'Quả 3' }]);

    const choices = { ok: true, verdict: 'CHOICES' as const, candidates: [{ pick: 1 }, { pick: 2 }] };
    expect(lookupCandidates(choices)).toHaveLength(2);
  });

  it('EMPTY_SCOPE nhận ra được — hôm nay là câu trả lời thường gặp nhất', () => {
    expect(isEmptyScope({ ok: true, verdict: 'EMPTY_SCOPE' })).toBe(true);
    expect(isEmptyScope({ ok: true, verdict: 'CHOICES' })).toBe(false);
    expect(isEmptyScope(null)).toBe(false);
  });

  it('phản hồi rỗng/thiếu trường không làm ngã hàm đọc', () => {
    expect(lookupCandidates(undefined)).toEqual([]);
    expect(lookupCandidates({})).toEqual([]);
    expect(needsRegionPick(undefined)).toBe(false);
  });
});

describe('lookupImageUrl', () => {
  it('ghép đường tương đối kèm mã hết hạn', () => {
    expect(lookupImageUrl(BASE, '/api/fruit/lookup/img/abc123'))
      .toBe('https://api.orilife.io/api/fruit/lookup/img/abc123');
  });

  it('giữ nguyên khi máy chủ đã trả đường tuyệt đối', () => {
    expect(lookupImageUrl(BASE, 'https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
  });

  it('thiếu vế nào cũng trả null, không dựng đường cụt', () => {
    expect(lookupImageUrl('', '/a')).toBeNull();
    expect(lookupImageUrl(BASE, '')).toBeNull();
  });
});

describe('mã phiên', () => {
  it('BỀN giữa hai lượt — đổi mã mỗi lượt là vô hiệu hoá lớp hạn tần suất chặt nhất', async () => {
    const a = await getLookupSession();
    const b = await getLookupSession();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(4);
  });
});
