/**
 * Biến thiên chữ ký cây — cửa `GET /api/tree_drift/{tree_id}`.
 *
 * Bài kiểm này khoá đúng một chỗ dễ hỏng mà không có gì báo: máy chủ trả **HTTP
 * 400 cho ca BÌNH THƯỜNG** "cây mới có 1 góc, chưa đủ cặp để đo"
 * (`server.py:5135-5138`). Đọc 400 thành lỗi là hiện câu "có gì đó sai" cho một
 * cây hoàn toàn khoẻ mạnh; mà trên cùng route đó, 400 CŨNG là mã của "mã cây sai
 * khuôn" (`_vid`, `server.py:684`). Hai ca cùng mã, khác thân — phân biệt bằng
 * thân hay không phân biệt được gì cả.
 */
import {
  getTreeDrift,
  topDriftChannel,
  DRIFT_LABEL_VI,
  DRIFT_CHANNELS,
  type TreeDrift,
} from './treeDriftService';

jest.mock('./orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn(async () => false),
}));

const BASE = 'https://api.orilife.io';
const TREE = '11111111-2222-4333-8444-555555555555';

const realFetch = globalThis.fetch;
const mockFetch = (status: number, body: unknown) => {
  globalThis.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.clearAllMocks();
});

// Thân mẫu dựng theo `visual_reid.py:1198` + `_drift_predict` (`:380`), không
// theo tưởng tượng về "một bản đo biến thiên nên có gì".
const driftBody = (over: Partial<TreeDrift> = {}): TreeDrift => ({
  ok: true,
  tree_id: TREE,
  days_since_update: 42,
  n_views: 6,
  drift_per_channel: { CTX: 0.3112, PLANT: 0.1004, BASE: 0.0871, LEAF: 0.4210 },
  predict: {
    fast: ['tán lá', 'bối cảnh'],
    stable: ['vỏ-gốc/sẹo', 'thân'],
    message: 'Sau 42 ngày, TÁN LÁ dễ đổi nhất; VỎ-GỐC/SẸO bền nhất — là mỏ-neo định-danh.',
  },
  ...over,
});

describe('getTreeDrift — ba nhánh, không phải hai', () => {
  it('200 → nhánh ok, đọc đủ bốn kênh + câu dự đoán', async () => {
    mockFetch(200, driftBody());
    const r = await getTreeDrift(BASE, TREE);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.drift.n_views).toBe(6);
    expect(Object.keys(r.drift.drift_per_channel)).toHaveLength(4);
    expect(r.drift.predict.stable[0]).toBe('vỏ-gốc/sẹo');
  });

  it('400 + `ok:false` → KHÔNG phải lỗi, là "chưa đủ góc"', async () => {
    mockFetch(400, { ok: false, error: 'chưa đủ dữ liệu (cần ≥2 góc để đo biến thiên)' });
    const r = await getTreeDrift(BASE, TREE);
    expect(r.kind).toBe('not_enough_views');
    if (r.kind !== 'not_enough_views') return;
    expect(r.reason).toContain('chưa đủ dữ liệu');
  });

  it('400 KHÔNG có `ok:false` (mã cây sai khuôn) → lỗi thật, không nhận nhầm thành thiếu góc', async () => {
    mockFetch(400, { detail: 'tree_id không hợp lệ' });
    const r = await getTreeDrift(BASE, 'khong-phai-uuid');
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error.http_status).toBe(400);
  });

  it('thân 400 hỏng (không parse được) → lỗi, KHÔNG âm thầm thành "chưa đủ góc"', async () => {
    globalThis.fetch = jest.fn(async () => ({
      status: 400,
      ok: false,
      json: async () => {
        throw new Error('không phải JSON');
      },
    })) as unknown as typeof fetch;
    const r = await getTreeDrift(BASE, TREE);
    expect(r.kind).toBe('error');
  });

  it('403 (cây không thuộc mình — máy chủ CỐ Ý gộp với "không tồn tại") → lỗi, không thử lại', async () => {
    mockFetch(403, { detail: 'Cây này không thuộc tài khoản của bạn.' });
    const r = await getTreeDrift(BASE, TREE);
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error.http_status).toBe(403);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('401 mà làm mới token không được → auth_error, chỉ gọi một lượt', async () => {
    mockFetch(401, { detail: 'unauthorized' });
    const r = await getTreeDrift(BASE, TREE);
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error.type).toBe('auth_error');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('mã cây được mã hoá vào đường dẫn', async () => {
    mockFetch(200, driftBody());
    await getTreeDrift(BASE, 'a b/c');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE}/api/tree_drift/a%20b%2Fc`,
      expect.anything(),
    );
  });

  it('`days_since_update: null` đi qua nguyên vẹn — KHÔNG được hoá thành 0', async () => {
    mockFetch(200, driftBody({ days_since_update: null }));
    const r = await getTreeDrift(BASE, TREE);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.drift.days_since_update).toBeNull();
    expect(r.drift.days_since_update).not.toBe(0);
  });
});

describe('topDriftChannel — không đoán khi không đo được', () => {
  it('chọn đúng kênh biến thiên nhiều nhất', () => {
    expect(topDriftChannel(driftBody())).toBe('LEAF');
  });

  it('bảng rỗng → null, KHÔNG trả một kênh mặc định', () => {
    expect(topDriftChannel(driftBody({ drift_per_channel: {} }))).toBeNull();
  });

  it('không có bản đo → null', () => {
    expect(topDriftChannel(null)).toBeNull();
    expect(topDriftChannel(undefined)).toBeNull();
  });

  it('giá trị không phải số → bỏ qua, không lọt vào kết quả', () => {
    const bad = driftBody({
      drift_per_channel: { CTX: NaN, LEAF: 'nhiều' as unknown as number, PLANT: 0.2 },
    });
    expect(topDriftChannel(bad)).toBe('PLANT');
  });
});

describe('bảng nhãn — khoá theo `_DRIFT_LABEL` của máy chủ', () => {
  it('đủ bốn kênh, không thừa không thiếu', () => {
    expect(DRIFT_CHANNELS).toHaveLength(4);
    expect(Object.keys(DRIFT_LABEL_VI).sort()).toEqual(['BASE', 'CTX', 'LEAF', 'PLANT']);
  });

  it('chữ khớp ĐÚNG `visual_reid.py:363` — lệch là màn nói khác máy chủ', () => {
    expect(DRIFT_LABEL_VI.LEAF).toBe('tán lá');
    expect(DRIFT_LABEL_VI.PLANT).toBe('thân');
    expect(DRIFT_LABEL_VI.BASE).toBe('vỏ-gốc/sẹo');
    expect(DRIFT_LABEL_VI.CTX).toBe('bối cảnh');
  });
});
