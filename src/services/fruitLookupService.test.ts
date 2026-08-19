/**
 * Bài kiểm viết theo HỢP ĐỒNG THẬT của máy chủ đang chạy — mục
 * `/api/fruit/lookup` trong `https://api.orilife.io/openapi.json` (đo 2026-08-18),
 * KHÔNG theo bản tóm tắt bằng lời.
 *
 * Bản trước của tệp này kiểm một hợp đồng tưởng tượng (`detections`, `fruit_id`,
 * `thumbnail_url`) và xanh hết — đó là bài học: bài kiểm chỉ chắc bằng nguồn mà
 * nó chép lại.
 */
import {
  LOOKUP_MAX_BYTES,
  LOOKUP_MAX_CANDIDATES,
  _resetLookupSession,
  candidateImageUrl,
  isAnchored,
  lookupFruit,
  lookupSession,
  parseLookupBody,
  provenanceOf,
  safeExplorerUrl,
  safeHttpUrl,
} from './fruitLookupService';

jest.mock(
  'expo-file-system/legacy',
  () => ({ getInfoAsync: jest.fn(async () => ({ exists: true, size: 1000 })) }),
  { virtual: true },
);

const BASE = 'https://api.test';

/** Thẻ đúng hình dạng máy chủ trả: `pick`, `img_urls`, `tree.provenance`. */
const card = (over: Record<string, unknown> = {}) => ({
  pick: 'p1',
  name: 'Quả số 3',
  status: 'on_tree',
  enrolled_at: '2026-07-01T00:00:00Z',
  n_imgs: 4,
  img_urls: ['/api/fruit/lookup/img/tok1'],
  tree: {
    name: 'Cây đầu hàng',
    code: 'ORI-w3gvdcs-AB12CD34',
    gps: [10.03, 105.78],
    public_url: 'https://orilife.io/t/ORI-w3gvdcs-AB12CD34',
    provenance: {
      anchored: true, status: 'anchored', network: 'cardano-mainnet',
      explorer_url: 'https://cardanoscan.io/tx/ab', label: 'Đã ghi lên chuỗi',
    },
  },
  ...over,
});

describe('parseLookupBody — đọc đúng tên trường máy chủ dùng', () => {
  it('dạng (b): candidates + lookup_id + verdict', () => {
    const r = parseLookupBody({
      ok: true, lookup_id: 'lk1', verdict: 'CHOICES', verdict_label: 'Chọn giúp',
      message: 'Năm quả gần giống', candidates: [card()], fruit: null,
    }, BASE);
    expect(r.kind).toBe('candidates');
    if (r.kind !== 'candidates') return;
    expect(r.candidates).toHaveLength(1);
    expect(r.lookupId).toBe('lk1');
    expect(r.verdict).toBe('CHOICES');
    expect(r.verdictLabel).toBe('Chọn giúp');
    expect(r.solo).toBeNull();
  });

  it('KHÔNG đòi `fruit_id` — máy chủ cố ý không trả, khoá chọn là `pick`', () => {
    const r = parseLookupBody({ candidates: [card()] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates[0].pick).toBe('p1');
  });

  /**
   * Mẫu thử ở trên viết `pick: 'p1'` — máy chủ THẬT trả `"pick": 1`, một con SỐ.
   * Chép nguyên một thẻ đo được từ `POST https://api.orilife.io/api/fruit/lookup`
   * (commit máy chủ `e5ffa3d`, 19/08/2026) để mẫu không còn lỏng hơn thật.
   */
  const cardFromServer = {
    pick: 1,
    name: 'Quả 111',
    status: 'on_tree',
    enrolled_at: '2026-08-18T13:01:56.339239+00:00',
    n_imgs: 1,
    img_urls: ['/api/fruit/lookup/img/8uHeY0whPRqjGLJC'],
    tree: {
      name: 'Cây',
      code: 'ORI-w7er6vb-953ZAZMN',
      gps: [20.994, 105.942],
      created_at: '2026-08-18T13:00:56.080213+00:00',
      public_url: '/t/ORI-w7er6vb-953ZAZMN',
      provenance: { anchored: true, status: 'confirmed', network: 'preview' },
    },
  };

  it('`pick` dạng SỐ vẫn nhận — đây là hình dạng máy chủ đang trả', () => {
    const r = parseLookupBody({ candidates: [cardFromServer] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].pick).toBe('1');
  });

  it('CHOICES đủ thẻ KHÔNG được rơi xuống `empty_scope` — lỗi người mua gặp thật', () => {
    const r = parseLookupBody({
      ok: true,
      lookup_id: '7f44523148244413b6ebaddbd103da59',
      verdict: 'CHOICES',
      verdict_label: 'Mời bạn đối chiếu',
      message: 'Đây là những quả ĐÃ ĐĂNG KÝ CÔNG KHAI giống ảnh bạn vừa chụp nhất.',
      candidates: [cardFromServer, { ...cardFromServer, pick: 2, name: 'hrt' }],
    }, BASE);
    expect(r.kind).toBe('candidates');
    if (r.kind !== 'candidates') return;
    expect(r.candidates.map((c) => c.pick)).toEqual(['1', '2']);
  });

  it('`pick: 0` là mã hợp lệ, không phải "thiếu" — chớ để rơi vào bẫy giá trị giả', () => {
    const r = parseLookupBody({ candidates: [{ ...cardFromServer, pick: 0 }] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates[0].pick).toBe('0');
  });

  it('thẻ thiếu `pick` bị bỏ — một dòng không bấm được là một dòng bấm hụt', () => {
    const r = parseLookupBody({ candidates: [{ name: 'không mã' }, card()] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates).toHaveLength(1);
  });

  it('ảnh `img_urls` tương đối được quy về URL tuyệt đối ngay lúc đọc', () => {
    const r = parseLookupBody({ candidates: [card()] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates[0].img_urls).toEqual([`${BASE}/api/fruit/lookup/img/tok1`]);
    expect(candidateImageUrl(r.candidates[0])).toBe(`${BASE}/api/fruit/lookup/img/tok1`);
  });

  it('ảnh đã tuyệt đối thì giữ nguyên, không ghép hai lần', () => {
    const r = parseLookupBody({ candidates: [card({ img_urls: ['https://cdn/x.jpg'] })] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates[0].img_urls).toEqual(['https://cdn/x.jpg']);
  });

  it('verdict SOLO: `fruit` được đưa vào danh sách để màn chỉ biết MỘT hình dạng', () => {
    const r = parseLookupBody({ verdict: 'SOLO', candidates: [], fruit: card() }, BASE);
    expect(r.kind).toBe('candidates');
    if (r.kind !== 'candidates') return;
    expect(r.candidates).toHaveLength(1);
    expect(r.solo?.pick).toBe('p1');
  });

  it('cắt lại 5 ứng viên dù máy chủ trả nhiều hơn', () => {
    const many = Array.from({ length: 9 }, (_, i) => card({ pick: `p${i}` }));
    const r = parseLookupBody({ candidates: many }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates).toHaveLength(LOOKUP_MAX_CANDIDATES);
  });

  it('`warning_messages` (câu tiếng Việt) được giữ, không phải mã `warnings`', () => {
    const r = parseLookupBody({
      candidates: [card()], warnings: ['low_light'], warning_messages: ['Ảnh hơi tối'],
    }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.warnings).toEqual(['Ảnh hơi tối']);
  });

  it('dạng (a): `regions` — KHÔNG phải `detections`', () => {
    const r = parseLookupBody({
      ok: true, need_region: true,
      regions: [{ index: 0, bbox: [1, 2, 3, 4] }, { index: 1, bbox: 'rác' }],
      message: 'Trong khung có nhiều quả',
    }, BASE);
    expect(r.kind).toBe('need_region');
    if (r.kind !== 'need_region') return;
    expect(r.regions).toEqual([{ index: 0, bbox: [1, 2, 3, 4] }]);
    expect(r.message).toBe('Trong khung có nhiều quả');
  });

  it('`regions` thiếu `index` thì lấy theo thứ tự, không rơi mất hộp', () => {
    const r = parseLookupBody({ need_region: true, regions: [{ bbox: [0, 0, 5, 5] }] }, BASE);
    if (r.kind !== 'need_region') throw new Error('sai nhánh');
    expect(r.regions[0].index).toBe(0);
  });

  it('need_region xét TRƯỚC candidates', () => {
    const r = parseLookupBody({ need_region: true, regions: [], candidates: [card()] }, BASE);
    expect(r.kind).toBe('need_region');
  });

  it('EMPTY_SCOPE / danh sách rỗng → empty_scope, một câu trả lời chứ không phải lỗi', () => {
    expect(parseLookupBody({ verdict: 'EMPTY_SCOPE', candidates: [] }, BASE).kind).toBe('empty_scope');
    expect(parseLookupBody({ ok: true, candidates: [] }, BASE).kind).toBe('empty_scope');
    expect(parseLookupBody({}, BASE).kind).toBe('empty_scope');
  });

  it('bẫy hai tầng ok: {ok:false} kèm HTTP 200 vẫn là lỗi', () => {
    const r = parseLookupBody({ ok: false, error: 'Ảnh mờ quá' }, BASE);
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error.detail).toBe('Ảnh mờ quá');
  });

  it('giữ nguyên trường lạ của máy chủ thay vì nuốt mất', () => {
    const r = parseLookupBody({ candidates: [card({ grade: 'A' })] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(r.candidates[0].grade).toBe('A');
  });
});

describe('provenanceOf — bằng chứng nằm trong `tree`, không ở gốc thẻ', () => {
  it('lấy đúng chỗ', () => {
    const r = parseLookupBody({ candidates: [card()] }, BASE);
    if (r.kind !== 'candidates') throw new Error('sai nhánh');
    expect(provenanceOf(r.candidates[0])?.network).toBe('cardano-mainnet');
  });
  it('thẻ không có cây → null, không nổ', () => {
    expect(provenanceOf({ pick: 'x', img_urls: [] })).toBeNull();
    expect(provenanceOf(null)).toBeNull();
  });
});

describe('isAnchored — ba giá trị, vì "chưa biết" không phải "chưa neo"', () => {
  it('máy chủ nói rõ thì theo lời máy chủ', () => {
    expect(isAnchored({ anchored: true })).toBe(true);
    expect(isAnchored({ anchored: false })).toBe(false);
  });
  it('suy từ status khi thiếu cờ anchored', () => {
    expect(isAnchored({ status: 'anchored' })).toBe(true);
    expect(isAnchored({ status: 'pending' })).toBe(false);
  });
  it('không có provenance / status lạ → null, không được kết luận', () => {
    expect(isAnchored(null)).toBeNull();
    expect(isAnchored({})).toBeNull();
    expect(isAnchored({ status: 'đang-gộp-lô' })).toBeNull();
  });
});

describe('safeExplorerUrl / safeHttpUrl — chỉ http(s) mới vào Linking.openURL', () => {
  it('cho qua https và http', () => {
    expect(safeExplorerUrl({ explorer_url: 'https://cardanoscan.io/tx/ab' })).toBe('https://cardanoscan.io/tx/ab');
    expect(safeHttpUrl('http://x/t/ORI-1')).toBe('http://x/t/ORI-1');
  });
  it('chặn javascript:, deep-link app khác, và chuỗi rỗng', () => {
    expect(safeExplorerUrl({ explorer_url: 'javascript:alert(1)' })).toBeNull();
    expect(safeExplorerUrl({ explorer_url: 'JavaScript:alert(1)' })).toBeNull();
    expect(safeHttpUrl('lamp://pay?to=kẻ-lạ')).toBeNull();
    expect(safeHttpUrl('  ')).toBeNull();
    expect(safeExplorerUrl(null)).toBeNull();
  });
});

describe('lookupSession', () => {
  it('ổn định trong một lần chạy — mỗi người một ngân sách hạn tần suất', () => {
    _resetLookupSession();
    const a = lookupSession();
    expect(lookupSession()).toBe(a);
    expect(a.length).toBeGreaterThan(6);
  });
});

describe('lookupFruit — cửa công khai', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.clearAllMocks(); });

  const resp = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  });

  const formKeys = (spy: jest.Mock): string[] => {
    const form = (spy.mock.calls[0] as any[])[1].body;
    return form._parts ? form._parts.map((p: any[]) => p[0]) : Array.from(form.keys());
  };

  it('KHÔNG gửi Authorization — người mua không có tài khoản', async () => {
    const spy = jest.fn(async () => resp({ candidates: [card()] }));
    global.fetch = spy as any;
    await lookupFruit(BASE, 'file:///a.jpg');
    const headers = (spy.mock.calls[0] as any[])[1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });

  it('KHÔNG có đường nào nhét lat/lon vào thân gửi đi', async () => {
    const spy = jest.fn(async () => resp({ candidates: [card()] }));
    global.fetch = spy as any;
    await lookupFruit(BASE, 'file:///a.jpg', { bbox: [1, 2, 3, 4] });
    const keys = formKeys(spy);
    expect(keys).toContain('bbox_x');
    expect(keys).not.toContain('lat');
    expect(keys).not.toContain('lon');
    expect(keys).not.toContain('gps');
  });

  it('gửi `sess` — thiếu nó thì cả quán cà phê chung một ngân sách hạn tần suất', async () => {
    const spy = jest.fn(async () => resp({ candidates: [card()] }));
    global.fetch = spy as any;
    await lookupFruit(BASE, 'file:///a.jpg');
    expect(formKeys(spy)).toContain('sess');
  });

  it('gửi `points` thì kèm `shape` — máy chủ mặc định `rect`', async () => {
    const spy = jest.fn(async () => resp({ candidates: [card()] }));
    global.fetch = spy as any;
    await lookupFruit(BASE, 'file:///a.jpg', { points: [[1, 2], [3, 4]] });
    const keys = formKeys(spy);
    expect(keys).toContain('points');
    expect(keys).toContain('shape');
  });

  it('400 image_unusable là NHÁNH RIÊNG — có cách xử rõ ràng, không phải "lỗi không rõ"', async () => {
    global.fetch = (async () => resp({ error_code: 'image_unusable' }, 400)) as any;
    const r = await lookupFruit(BASE, 'file:///a.jpg');
    expect(r.kind).toBe('image_unusable');
  });

  it('429 đọc `retry_after` TỪ THÂN trước, rồi mới tới header', async () => {
    global.fetch = (async () => resp({ error_code: 'rate_limited', retry_after: 12 }, 429, { 'Retry-After': '99' })) as any;
    const r = await lookupFruit(BASE, 'file:///a.jpg');
    expect(r.kind).toBe('rate_limited');
    if (r.kind !== 'rate_limited') return;
    expect(r.retryAfterSec).toBe(12);
  });

  it('429 không nói gì → rơi về header, rồi mới tới mặc định', async () => {
    global.fetch = (async () => resp({}, 429, { 'Retry-After': '30' })) as any;
    const a = await lookupFruit(BASE, 'file:///a.jpg');
    expect(a.kind === 'rate_limited' && a.retryAfterSec).toBe(30);

    global.fetch = (async () => resp({}, 429)) as any;
    const b = await lookupFruit(BASE, 'file:///a.jpg');
    expect(b.kind === 'rate_limited' && b.retryAfterSec).toBeGreaterThan(0);
  });

  it('ảnh quá 2MB bị chặn TẠI MÁY — không tốn một byte tải lên', async () => {
    const legacy = require('expo-file-system/legacy');
    legacy.getInfoAsync.mockResolvedValueOnce({ exists: true, size: LOOKUP_MAX_BYTES + 1 });
    const spy = jest.fn();
    global.fetch = spy as any;
    const r = await lookupFruit(BASE, 'file:///big.jpg');
    expect(r.kind).toBe('too_large');
    expect(spy).not.toHaveBeenCalled();
  });

  it('cân KHÔNG được thì vẫn gửi — thà để máy chủ nói không, còn hơn chặn oan', async () => {
    const spy = jest.fn(async () => resp({ candidates: [card()] }));
    global.fetch = spy as any;
    const r = await lookupFruit(BASE, 'content://media/1');
    expect(spy).toHaveBeenCalled();
    expect(r.kind).toBe('candidates');
  });

  it('413 của máy chủ về chung nhánh too_large', async () => {
    global.fetch = (async () => resp({}, 413)) as any;
    expect((await lookupFruit(BASE, 'file:///a.jpg')).kind).toBe('too_large');
  });

  it('422 của FastAPI trả `detail` là MẢNG — nối lại, đừng in [object Object]', async () => {
    global.fetch = (async () => resp({ detail: [{ msg: 'field required' }, { msg: 'thiếu file' }] }, 422)) as any;
    const r = await lookupFruit(BASE, 'file:///a.jpg');
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error.detail).toBe('field required · thiếu file');
  });

  it('404 = máy chủ CHƯA BẬT cửa này, khác hẳn "không tìm thấy quả nào"', async () => {
    global.fetch = (async () => resp({}, 404)) as any;
    const r = await lookupFruit(BASE, 'file:///a.jpg');
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error.http_status).toBe(404);
    expect(r.error.detail).toMatch(/chưa bật/i);
  });

  it('thiếu ảnh → lỗi ngay, không gọi mạng', async () => {
    const spy = jest.fn();
    global.fetch = spy as any;
    expect((await lookupFruit(BASE, '  ')).kind).toBe('error');
    expect(spy).not.toHaveBeenCalled();
  });

  it('mạng hỏng → nhánh error KÈM câu lỗi thật, KHÔNG ném', async () => {
    global.fetch = (async () => { throw new TypeError('Network request failed'); }) as any;
    const r = await lookupFruit(BASE, 'file:///a.jpg');
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error.type).toBe('network_error');
    expect(r.error.detail).toMatch(/Network request failed/);
  });
});
