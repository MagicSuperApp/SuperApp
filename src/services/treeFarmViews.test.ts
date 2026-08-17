/**
 * `set_farm` + `remove_views` — hai cửa sửa dữ liệu cây, và hai chỗ chúng dễ nói
 * dối mà không ai thấy.
 *
 *   1. `set_farm` trả 404 GỘP "vườn không tồn tại" với "vườn của người khác".
 *      Máy chủ cố ý không tách (không cho lộ vườn người khác) ⇒ app KHÔNG được
 *      biến 404 thành một trong hai câu chắc nịch.
 *   2. `remove_views` trả `ok:true` kèm `removed:0` khi chỉ số ngoài phạm vi.
 *      Suy số ảnh đã xoá từ `indices.length` là bịa — ảnh vẫn còn nguyên trên
 *      máy chủ trong khi app đã báo xoá xong.
 */
import { removeTreeViews, setTreeFarm } from './treeReIDService';

jest.mock('./orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn().mockResolvedValue(true),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue('tok'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const BASE = 'https://x.test';

/** Bắt FormData thật: môi trường test không duyệt lại được nội dung. */
const sent: Array<[string, string]> = [];
beforeAll(() => {
  (global as any).FormData = class {
    append(k: string, v: string) { sent.push([k, String(v)]); }
  };
});

function mockResp(status: number, body: unknown) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => { sent.length = 0; });

describe('setTreeFarm', () => {
  it('gửi `tree_id` + `farm_id` đúng tên trường của máy chủ', async () => {
    mockResp(200, { ok: true, tree_id: 't1', farm_id: 'f9' });
    const r = await setTreeFarm(BASE, 't1', 'f9');
    expect(r.ok).toBe(true);
    expect(r.farmId).toBe('f9');
    expect(sent).toEqual([['tree_id', 't1'], ['farm_id', 'f9']]);
  });

  it('gỡ khỏi vườn = gửi `farm_id` RỖNG, không phải bỏ hẳn khoá', async () => {
    // Bỏ khoá thì FastAPI đọc ra "không truyền" chứ không phải "xoá" — cây vẫn ở
    // vườn cũ và màn hình vẫn vẽ như đã gỡ.
    mockResp(200, { ok: true, tree_id: 't1', farm_id: null });
    const r = await setTreeFarm(BASE, 't1', null);
    expect(r.ok).toBe(true);
    expect(r.farmId).toBeNull();
    expect(sent.find(e => e[0] === 'farm_id')).toEqual(['farm_id', '']);
  });

  it('403 = cây không phải của mình; 404 = KHÔNG đoán vườn thiếu hay vườn người khác', async () => {
    mockResp(403, { detail: 'not owner' });
    const a = await setTreeFarm(BASE, 't1', 'f9');
    expect(a.ok).toBe(false);
    expect(a.notOwner).toBe(true);
    expect(a.farmNotFound).toBeFalsy();

    mockResp(404, { detail: 'farm not found' });
    const b = await setTreeFarm(BASE, 't1', 'f9');
    expect(b.ok).toBe(false);
    expect(b.farmNotFound).toBe(true);
    expect(b.notOwner).toBeFalsy();
  });

  it('máy chủ 200 nhưng `ok:false` thì KHÔNG được đọc thành thành công', async () => {
    mockResp(200, { ok: false });
    const r = await setTreeFarm(BASE, 't1', 'f9');
    expect(r.ok).toBe(false);
  });
});

describe('removeTreeViews', () => {
  it('gửi `indices` là chuỗi phân cách bằng dấu phẩy', async () => {
    mockResp(200, { ok: true, removed: 2 });
    const r = await removeTreeViews(BASE, 't1', [0, 3]);
    expect(r.ok).toBe(true);
    expect(r.removed).toBe(2);
    expect(sent.find(e => e[0] === 'indices')).toEqual(['indices', '0,3']);
  });

  it('đọc `removed` của máy chủ, KHÔNG suy từ số chỉ số đã gửi', async () => {
    mockResp(200, { ok: true, removed: 0 });
    const r = await removeTreeViews(BASE, 't1', [7]);
    expect(r.ok).toBe(true);
    expect(r.removed).toBe(0);
  });

  it('danh sách rỗng / chỉ số rác → chặn tại chỗ, không gọi máy chủ', async () => {
    mockResp(200, { ok: true, removed: 9 });
    const r = await removeTreeViews(BASE, 't1', [-1, 1.5, NaN]);
    expect(r.ok).toBe(false);
    expect(r.removed).toBe(0);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('403 = cây không phải của mình', async () => {
    mockResp(403, { detail: 'not owner' });
    const r = await removeTreeViews(BASE, 't1', [0]);
    expect(r.ok).toBe(false);
    expect(r.notOwner).toBe(true);
  });
});
