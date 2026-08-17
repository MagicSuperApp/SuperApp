/**
 * Xuất xứ · tra mã · chi tiết quả.
 *
 * Ba chỗ bài kiểm này khoá, cả ba thuộc họ "hỏng mà không có gì báo":
 *
 *   1. **404 ở cửa công khai là CÂU TRẢ LỜI, không phải lỗi.** Máy chủ cố ý gộp
 *      *cây riêng tư* với *cây không có* (rọc-phách §18). Đọc nó thành lỗi thì
 *      màn hình mời người dùng "thử lại" một việc không có gì để thử.
 *   2. **GPS có thể đã bị làm thô ~111m mà không trường nào nói.** Vẽ ghim nhọn
 *      lên toạ độ đó là nói dối bằng đồ hoạ. Bài kiểm khoá đúng ranh: chứng minh
 *      được "chưa bị làm tròn", KHÔNG chứng minh được "chính xác".
 *   3. **200 mà thiếu thân.** Không được dựng một hồ sơ rỗng trông như hồ sơ thật.
 *
 * Bài kiểm gọi thẳng cửa công khai và khẳng định **không có `Authorization`** —
 * người mua chưa có tài khoản; ép lấy token là khoá cửa trước mặt đúng người cửa
 * này sinh ra để phục vụ.
 */
import {
  getProvenance,
  getTreeByCode,
  getFruitDetail,
  gpsPrecision,
  gpsPrecisionLabelVi,
  isAnchored,
  evidenceCount,
  imageViewUrl,
  type Provenance,
} from './provenanceService';

// Tên bắt buộc bắt đầu bằng `mock`: nhà máy của `jest.mock` bị nâng lên đầu tệp và
// không được đọc biến ngoài phạm vi, trừ biến có tiền tố đó.
const mockEnsureToken = jest.fn(async () => false);
jest.mock('./orilifeDidAuth', () => ({
  ensureOrilifeToken: (...a: unknown[]) => mockEnsureToken(...(a as [])),
}));

const BASE = 'https://api.orilife.io';
const realFetch = globalThis.fetch;

/** Ghi lại từng lượt gọi để khẳng định được cả URL lẫn header. */
type Call = { url: string; init: RequestInit | undefined };
let calls: Call[] = [];

const mockFetch = (status: number, body: unknown) => {
  calls = [];
  globalThis.fetch = jest.fn(async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit | undefined });
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    };
  }) as unknown as typeof fetch;
};

const headersOf = (c: Call): Record<string, string> =>
  (c.init?.headers ?? {}) as Record<string, string>;

const PROV: Provenance = {
  tree_id: 'T-1',
  code: 'ORI-w3gvk0q-7f2',
  name: 'Sầu riêng gốc 12',
  gps: [12.678, 108.123],
  n_views: 6,
  record_cid: 'bafy-record',
  record_hash: 'abc123',
  lampnet_view: 'https://view.lampnet.io/cid',
  images: [{ cid: 'bafy-1' }, { cid: 'bafy-2' }],
  anchor: { status: 'anchored', tx_hash: '0xdead' },
};

afterEach(() => {
  globalThis.fetch = realFetch;
  mockEnsureToken.mockClear();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Cửa công khai — 404 là câu trả lời
// ---------------------------------------------------------------------------

describe('getProvenance', () => {
  it('200 có thân → kind ok, giữ nguyên hồ sơ', async () => {
    mockFetch(200, { ok: true, provenance: PROV });
    const r = await getProvenance(BASE, 'T-1');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('nhánh sai');
    expect(r.provenance.record_cid).toBe('bafy-record');
  });

  it('404 → not_public, KHÔNG phải error', async () => {
    mockFetch(404, { ok: false, error: 'không có xuất xứ' });
    const r = await getProvenance(BASE, 'T-khong-co');
    expect(r.kind).toBe('not_public');
  });

  it('cửa công khai KHÔNG gửi Authorization và KHÔNG xin token', async () => {
    mockFetch(200, { ok: true, provenance: PROV });
    await getProvenance(BASE, 'T-1');
    expect(calls).toHaveLength(1);
    // Khẳng định trên chính đối tượng header đã gửi đi, không suy từ việc
    // AsyncStorage có được gọi hay không.
    expect(headersOf(calls[0])).not.toHaveProperty('Authorization');
    expect(mockEnsureToken).not.toHaveBeenCalled();
  });

  it('mã cây được mã hoá vào URL', async () => {
    mockFetch(200, { ok: true, provenance: PROV });
    await getProvenance(BASE, 'a/b c');
    expect(calls[0].url).toBe(`${BASE}/api/provenance/a%2Fb%20c`);
  });

  it('mã rỗng → từ chối tại chỗ, KHÔNG gọi mạng', async () => {
    mockFetch(200, { ok: true, provenance: PROV });
    const r = await getProvenance(BASE, '   ');
    expect(r.kind).toBe('error');
    expect(calls).toHaveLength(0);
  });

  it('200 mà THIẾU provenance → error, không dựng hồ sơ rỗng', async () => {
    mockFetch(200, { ok: true });
    const r = await getProvenance(BASE, 'T-1');
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') throw new Error('nhánh sai');
    expect(r.error.http_status).toBe(200);
  });

  it('500 → error, phân biệt được với not_public', async () => {
    mockFetch(500, {});
    const r = await getProvenance(BASE, 'T-1');
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') throw new Error('nhánh sai');
    expect(r.error.type).toBe('server_error');
  });
});

describe('getTreeByCode', () => {
  it('200 → ok, cùng kiểu Provenance', async () => {
    mockFetch(200, { ok: true, provenance: PROV });
    const r = await getTreeByCode(BASE, 'ORI-w3gvk0q-7f2');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('nhánh sai');
    expect(r.provenance.code).toBe('ORI-w3gvk0q-7f2');
  });

  it('404 → not_public (cây riêng tư HOẶC không có — không phân biệt được)', async () => {
    mockFetch(404, { ok: false, error: 'không tìm thấy mã' });
    const r = await getTreeByCode(BASE, 'ORI-khong-co');
    expect(r.kind).toBe('not_public');
  });

  it('gọi đúng đường /api/tree_by_code, không gửi Authorization', async () => {
    mockFetch(200, { ok: true, provenance: PROV });
    await getTreeByCode(BASE, 'ORI-1');
    expect(calls[0].url).toBe(`${BASE}/api/tree_by_code/ORI-1`);
    expect(headersOf(calls[0])).not.toHaveProperty('Authorization');
  });
});

// ---------------------------------------------------------------------------
// 2. GPS — ranh giới giữa "chưa bị làm tròn" và "chính xác"
// ---------------------------------------------------------------------------

describe('gpsPrecision', () => {
  it('4 chữ số trở lên → chứng minh được là chưa làm tròn', () => {
    expect(gpsPrecision([12.67812, 108.12345])).toBe('exact_not_coarsened');
  });

  it('đúng 3 chữ số → maybe_coarsened, KHÔNG được gọi là chính xác', () => {
    expect(gpsPrecision([12.678, 108.123])).toBe('maybe_coarsened');
  });

  it('một trục lẻ chữ số cũng đủ chứng minh chưa làm tròn', () => {
    // `_coarsen_public_gps` làm tròn CẢ HAI trục cùng lúc, nên chỉ cần một trục
    // còn chữ số thứ 4 là biết chắc chưa qua bộ làm thô.
    expect(gpsPrecision([12.678, 108.12345])).toBe('exact_not_coarsened');
  });

  it('số nguyên → maybe_coarsened (nghiêng về thận trọng)', () => {
    expect(gpsPrecision([12, 108])).toBe('maybe_coarsened');
  });

  it('null / thiếu / sai kiểu → hidden', () => {
    expect(gpsPrecision(null)).toBe('hidden');
    expect(gpsPrecision(undefined)).toBe('hidden');
    expect(gpsPrecision([NaN, 108.1] as unknown as [number, number])).toBe('hidden');
    expect(gpsPrecision(['12.6', '108.1'] as unknown as [number, number])).toBe('hidden');
  });

  it('câu tiếng Việt: hidden không có câu nào, thô nói rõ là VÙNG', () => {
    expect(gpsPrecisionLabelVi('hidden')).toBeNull();
    expect(gpsPrecisionLabelVi('maybe_coarsened')).toContain('vùng');
    expect(gpsPrecisionLabelVi('exact_not_coarsened')).toContain('chính xác');
  });
});

// ---------------------------------------------------------------------------
// 3. Chi tiết quả — 403 và 404 là hai câu khác nhau
// ---------------------------------------------------------------------------

describe('getFruitDetail', () => {
  it('200 → ok', async () => {
    mockFetch(200, { ok: true, fruit: { fruit_id: 'F-1', n_views: 3, views_by_type: { side: 2 } } });
    const r = await getFruitDetail(BASE, 'F-1');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('nhánh sai');
    expect(r.fruit.views_by_type).toEqual({ side: 2 });
  });

  it('404 → not_found', async () => {
    mockFetch(404, { detail: 'Không tìm thấy quả.' });
    const r = await getFruitDetail(BASE, 'F-khong-co');
    expect(r.kind).toBe('not_found');
  });

  it('403 → forbidden, GIỮ NGUYÊN câu của máy chủ', async () => {
    mockFetch(403, { detail: 'Cây này không thuộc tài khoản của bạn.' });
    const r = await getFruitDetail(BASE, 'F-nguoi-khac');
    expect(r.kind).toBe('forbidden');
    if (r.kind !== 'forbidden') throw new Error('nhánh sai');
    expect(r.detail).toBe('Cây này không thuộc tài khoản của bạn.');
  });

  it('cửa này CÓ xin token (khác hai cửa công khai)', async () => {
    mockFetch(200, { ok: true, fruit: { fruit_id: 'F-1' } });
    await getFruitDetail(BASE, 'F-1');
    expect(mockEnsureToken).toHaveBeenCalled();
  });

  it('200 mà thiếu fruit → error, không dựng bản ghi rỗng', async () => {
    mockFetch(200, { ok: true });
    const r = await getFruitDetail(BASE, 'F-1');
    expect(r.kind).toBe('error');
  });

  it('mã rỗng → từ chối tại chỗ, KHÔNG gọi mạng', async () => {
    mockFetch(200, { ok: true, fruit: {} });
    const r = await getFruitDetail(BASE, '');
    expect(r.kind).toBe('error');
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Đọc hồ sơ — "không biết" khác "không có"
// ---------------------------------------------------------------------------

describe('isAnchored', () => {
  it('có tx_hash → true', () => {
    expect(isAnchored({ anchor: { tx_hash: '0xabc' } })).toBe(true);
  });

  it('status pending → false', () => {
    expect(isAnchored({ anchor: { status: 'pending' } })).toBe(false);
  });

  it('KHÔNG có anchor → null, không phải false', () => {
    expect(isAnchored({})).toBeNull();
    expect(isAnchored(null)).toBeNull();
  });

  it('anchor có mặt nhưng không đọc được → null', () => {
    expect(isAnchored({ anchor: { ghi_chu: 'gì đó' } as Record<string, unknown> })).toBeNull();
  });
});

describe('evidenceCount', () => {
  it('lấy n_views khi có', () => {
    expect(evidenceCount({ n_views: 6, images: [{ cid: 'a' }] })).toBe(6);
  });

  it('không có n_views → đếm images', () => {
    expect(evidenceCount({ images: [{ cid: 'a' }, { cid: 'b' }] })).toBe(2);
  });

  it('không có gì → null, KHÔNG phải 0', () => {
    expect(evidenceCount({})).toBeNull();
    expect(evidenceCount(null)).toBeNull();
  });

  it('n_views = 0 vẫn là 0 thật, không rơi xuống null', () => {
    expect(evidenceCount({ n_views: 0 })).toBe(0);
  });
});

describe('imageViewUrl', () => {
  it('ghép base + cid', () => {
    expect(imageViewUrl(PROV, 'bafy-1')).toBe('https://view.lampnet.io/cid/bafy-1');
  });

  it('base đã có dấu / cuối thì không nhân đôi', () => {
    expect(imageViewUrl({ lampnet_view: 'https://v.io/c/' }, 'x')).toBe('https://v.io/c/x');
  });

  it('thiếu base hoặc thiếu cid → null, KHÔNG ghép ra URL hỏng', () => {
    expect(imageViewUrl({}, 'bafy-1')).toBeNull();
    expect(imageViewUrl(PROV, '')).toBeNull();
    expect(imageViewUrl(PROV, null)).toBeNull();
  });
});
