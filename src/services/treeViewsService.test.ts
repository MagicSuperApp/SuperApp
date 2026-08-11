import { fetchTreeViews, treeViewImageUrls, TreeViewsResult } from './treeViewsService';

// AsyncStorage mock ở jest.setup.js (getItem → null → không token, vẫn gửi được).
const BASE = 'https://api.orilife.io';
const TREE = 'tree-abc-123';

const realFetch = globalThis.fetch;
const mockFetch = (status: number, body: any) => {
  globalThis.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as any);
};

afterEach(() => { globalThis.fetch = realFetch; jest.clearAllMocks(); });

describe('fetchTreeViews — GET /api/tree_views', () => {
  it('200 → ok + views đủ trường (không describe)', async () => {
    mockFetch(200, {
      tree_id: TREE, n: 2,
      views: [
        { idx: 0, score: 0.91, ts: 111, img: `${TREE}/imgs/000.jpg`, url: `/gimg/${TREE}/imgs/000.jpg` },
        { idx: 1, score: 0.42, ts: 222, img: `${TREE}/imgs/001.jpg`, url: `/gimg/${TREE}/imgs/001.jpg` },
      ],
    });
    const r = await fetchTreeViews(BASE, TREE);
    expect(r.ok).toBe(true);
    expect(r.data?.n).toBe(2);
    expect(r.data?.views[1].score).toBe(0.42);
    expect(r.data?.views[0].features_vi).toBeUndefined();
  });

  it('describe=1 → gửi query describe + đọc features_vi', async () => {
    let calledUrl = '';
    globalThis.fetch = jest.fn(async (url: any) => {
      calledUrl = String(url);
      return {
        status: 200, ok: true,
        json: async () => ({ tree_id: TREE, n: 1, views: [{ idx: 0, url: `/gimg/${TREE}/imgs/000.jpg`, features_vi: ['Cành nghiêng trái', '3 quả góc phải'] }] }),
      } as any;
    }) as any;
    const r = await fetchTreeViews(BASE, TREE, { describe: true });
    expect(calledUrl).toContain('describe=1');
    expect(r.data?.views[0].features_vi).toEqual(['Cành nghiêng trái', '3 quả góc phải']);
  });

  it('403 → forbidden (IDOR, cây không thuộc chủ)', async () => {
    mockFetch(403, { detail: 'không thuộc bạn' });
    const r = await fetchTreeViews(BASE, TREE);
    expect(r.ok).toBe(false);
    expect(r.error?.http_status).toBe(403);
    expect(r.error?.error_code).toBe('forbidden');
  });

  it('401 → auth_error', async () => {
    mockFetch(401, {});
    const r = await fetchTreeViews(BASE, TREE);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('auth_error');
  });

  it('500 → server_error', async () => {
    mockFetch(500, {});
    const r = await fetchTreeViews(BASE, TREE);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('server_error');
  });

  it('mạng lỗi (fetch throw) → network_error, không ném', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('boom'); }) as any;
    const r = await fetchTreeViews(BASE, TREE);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('network_error');
  });

  it('body thiếu views → mảng rỗng, không vỡ', async () => {
    mockFetch(200, { tree_id: TREE });
    const r = await fetchTreeViews(BASE, TREE);
    expect(r.ok).toBe(true);
    expect(r.data?.views).toEqual([]);
    expect(r.data?.n).toBe(0);
  });
});

describe('treeViewImageUrls — ghép URL tuyệt-đối, bỏ view thiếu ảnh', () => {
  it('ghép baseUrl + giữ thứ-tự + bỏ url null', () => {
    const res: TreeViewsResult = {
      tree_id: TREE, n: 3,
      views: [
        { idx: 0, url: `/gimg/${TREE}/imgs/000.jpg` },
        { idx: 1, url: null },
        { idx: 2, url: `/gimg/${TREE}/imgs/002.jpg` },
      ],
    };
    expect(treeViewImageUrls(res, BASE)).toEqual([
      `${BASE}/gimg/${TREE}/imgs/000.jpg`,
      `${BASE}/gimg/${TREE}/imgs/002.jpg`,
    ]);
  });

  it('undefined → mảng rỗng', () => {
    expect(treeViewImageUrls(undefined, BASE)).toEqual([]);
  });
});
