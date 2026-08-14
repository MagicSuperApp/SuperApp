import { fetchTimeline, sortNewestFirst, KIND_VI, KIND_ICON, KIND_FALLBACK_ICON, type TimelineEvent } from './timelineService';

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

// Thân mẫu dựng theo timeline_store.py:255-272 (mã máy chủ), không phải theo
// tưởng tượng về "một event timeline nên có gì".
const ownerEvent = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  event_id: 'e1',
  entity_id: TREE,
  entity_type: 'tree',
  kind: 'enroll',
  ts: '2026-08-01T03:00:00+00:00',
  author_did: 'did:phoenix:abcdefghijklm:' + '0'.repeat(64),
  payload: {},
  media: [],
  gps: null,
  quality: null,
  visibility: 'public',
  review: 'approved',
  anchor_now: false,
  prev_hash: '',
  leaf_hash: 'aa11',
  ...over,
});

describe('fetchTimeline — GET /api/{entity_type}/{entity_id}/timeline', () => {
  it('200 → đọc đủ events + chain_ok + is_owner', async () => {
    mockFetch(200, {
      ok: true,
      entity_type: 'tree',
      entity_id: TREE,
      events: [ownerEvent(), ownerEvent({ event_id: 'e2', kind: 'harvest', ts: '2026-08-05T03:00:00+00:00', prev_hash: 'aa11', leaf_hash: 'bb22' })],
      chain_ok: true,
      is_owner: true,
    });
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.ok).toBe(true);
    expect(r.data?.events).toHaveLength(2);
    expect(r.data?.chain_ok).toBe(true);
    expect(r.data?.is_owner).toBe(true);
  });

  it('ghép đúng đường gọi, có mã hoá phần trong đường', async () => {
    let calledUrl = '';
    globalThis.fetch = jest.fn(async (url: any) => {
      calledUrl = String(url);
      return { status: 200, ok: true, json: async () => ({ ok: true, events: [] }) } as any;
    }) as any;
    await fetchTimeline(BASE, 'fruit', 'quả/1');
    expect(calledUrl).toBe(`${BASE}/api/fruit/qu%E1%BA%A3%2F1/timeline`);
  });

  // Đây là ca phân biệt QUAN TRỌNG NHẤT của màn này: "máy chủ chưa bật dòng thời
  // gian" (router nạp có điều kiện, server.py:1072) khác hẳn "cây chưa có sự kiện
  // nào" (200 + mảng rỗng). Gộp hai cái làm một là nói với nông dân rằng cây của
  // họ chưa có lịch sử, trong khi thật ra máy chủ không trả lời câu hỏi đó.
  it('404 → lỗi "chưa bật", KHÔNG phải danh sách rỗng', async () => {
    mockFetch(404, { detail: 'Not Found' });
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.ok).toBe(false);
    expect(r.error?.error_code).toBe('timeline_off');
    expect(r.data).toBeUndefined();
  });

  it('200 + mảng rỗng → ok, events rỗng (cây thật sự chưa có sự kiện)', async () => {
    mockFetch(200, { ok: true, entity_type: 'tree', entity_id: TREE, events: [], chain_ok: true, is_owner: true });
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.ok).toBe(true);
    expect(r.data?.events).toEqual([]);
  });

  // HAI TẦNG `ok`: HTTP 200 mà thân báo ok:false. Chỉ đọc resp.ok là nuốt lỗi.
  it('HTTP 200 nhưng body.ok=false → coi là lỗi', async () => {
    mockFetch(200, { ok: false, error: 'Cần đăng nhập.' });
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.ok).toBe(false);
    expect(r.error?.detail).toContain('Cần đăng nhập');
  });

  it('401 → auth_error', async () => {
    mockFetch(401, { ok: false, error: 'Cần đăng nhập.' });
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.error?.type).toBe('auth_error');
  });

  it('mạng lỗi → network_error, KHÔNG ném', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('offline'); }) as any;
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('network_error');
  });

  // Góc nhìn KHÁCH: máy chủ lược prev_hash/leaf_hash (timeline_store.py:373-380).
  // App phải chịu được, và không được vì thiếu hai trường đó mà coi event là hỏng.
  it('thân góc-nhìn KHÁCH (thiếu prev_hash/leaf_hash) vẫn đọc được', async () => {
    mockFetch(200, {
      ok: true, entity_type: 'tree', entity_id: TREE, chain_ok: true, is_owner: false,
      events: [{ event_id: 'e9', kind: 'harvest', ts: '2026-08-05T03:00:00+00:00', visibility: 'public', review: 'approved' }],
    });
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.ok).toBe(true);
    expect(r.data?.is_owner).toBe(false);
    expect(r.data?.events[0].leaf_hash).toBeUndefined();
  });

  it('events không phải mảng → về mảng rỗng thay vì nổ', async () => {
    mockFetch(200, { ok: true, events: null });
    const r = await fetchTimeline(BASE, 'tree', TREE);
    expect(r.ok).toBe(true);
    expect(r.data?.events).toEqual([]);
  });
});

describe('sortNewestFirst', () => {
  it('mới nhất trước và KHÔNG sửa mảng gốc', async () => {
    const src = [
      ownerEvent({ event_id: 'cũ', ts: '2026-08-01T00:00:00Z' }),
      ownerEvent({ event_id: 'mới', ts: '2026-08-09T00:00:00Z' }),
    ];
    const out = sortNewestFirst(src);
    expect(out.map(e => e.event_id)).toEqual(['mới', 'cũ']);
    // Thứ tự gốc LÀ thứ tự móc-xích băm — đảo tại chỗ là phá khả năng đối chiếu.
    expect(src.map(e => e.event_id)).toEqual(['cũ', 'mới']);
  });

  it('ts hỏng/thiếu bị đẩy xuống cuối, không làm hỏng phép so sánh', async () => {
    const out = sortNewestFirst([
      ownerEvent({ event_id: 'hỏng', ts: 'không-phải-ngày' }),
      ownerEvent({ event_id: 'tốt', ts: '2026-08-09T00:00:00Z' }),
    ]);
    expect(out.map(e => e.event_id)).toEqual(['tốt', 'hỏng']);
  });
});

describe('KIND_VI', () => {
  it('phủ đủ 9 loại mà máy chủ khai (timeline_store.py:55-58)', () => {
    for (const k of ['enroll', 'care', 'flowering', 'fruiting', 'harvest', 'observe', 'note', 'media', 'transfer']) {
      expect(KIND_VI[k]).toBeTruthy();
    }
  });
});

describe('KIND_ICON', () => {
  // Tên ngoài bộ đã sinh render ra RỖNG và chỉ cảnh báo ở bản DEV — ở bản phát
  // hành nó là một ô trống câm. Nên khoá tên vào chính bộ đó, đừng tin trí nhớ.
  it('mọi tên biểu tượng phải có thật trong icons.generated', () => {
    const { ICONS } = require('../components/Icon/icons.generated');
    for (const [kind, icon] of Object.entries(KIND_ICON)) {
      expect(Object.prototype.hasOwnProperty.call(ICONS, icon)).toBe(true);
    }
    expect(Object.prototype.hasOwnProperty.call(ICONS, KIND_FALLBACK_ICON)).toBe(true);
  });

  it('phủ đúng 9 loại máy chủ khai', () => {
    expect(Object.keys(KIND_ICON).sort()).toEqual(Object.keys(KIND_VI).sort());
  });
});
