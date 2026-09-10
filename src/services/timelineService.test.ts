const mockEnsureToken = jest.fn<Promise<boolean>, any[]>(async () => false);
jest.mock('./orilifeDidAuth', () => ({
  __esModule: true,
  ensureOrilifeToken: (...a: any[]) => mockEnsureToken(...a),
}));

import {
  addTimelineEvent,
  anchorEvent, anchorState, fetchEventProof, fetchTimeline, safeExplorerUrl, sortNewestFirst,
  KIND_VI, KIND_ICON, KIND_FALLBACK_ICON, type TimelineEvent,
} from './timelineService';

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

// ═══════════════════════════════════════════════════════════════════════════
// BẰNG CHỨNG: proof + anchor
// ═══════════════════════════════════════════════════════════════════════════

describe('anchorState — ba giá trị, vì "chưa biết" không phải "chưa neo"', () => {
  it('có tx_hash là đã neo, dù status viết gì', () => {
    expect(anchorState({ tx_hash: 'ab12', status: 'pending' })).toBe(true);
  });
  it('suy từ status khi chưa có tx_hash', () => {
    expect(anchorState({ status: 'anchored' })).toBe(true);
    expect(anchorState({ status: 'pending' })).toBe(false);
  });
  it('không có anchor / status lạ → null, không được kết luận', () => {
    expect(anchorState(null)).toBeNull();
    expect(anchorState({})).toBeNull();
    expect(anchorState({ status: 'đang-gộp-lô' })).toBeNull();
    expect(anchorState({ tx_hash: '   ' })).toBeNull();
  });
});

describe('safeExplorerUrl — chỉ http/https mới được vào Linking.openURL', () => {
  it('cho qua https', () => {
    expect(safeExplorerUrl({ explorer_url: 'https://cardanoscan.io/tx/ab' }))
      .toBe('https://cardanoscan.io/tx/ab');
  });
  it('chặn javascript: và deep-link app khác', () => {
    expect(safeExplorerUrl({ explorer_url: 'javascript:alert(1)' })).toBeNull();
    expect(safeExplorerUrl({ explorer_url: 'lamp://pay' })).toBeNull();
    expect(safeExplorerUrl(null)).toBeNull();
  });
});

describe('fetchEventProof', () => {
  it('đọc được thân gói trong `proof`', async () => {
    mockFetch(200, { ok: true, proof: { event_id: 'e1', merkle_root: 'root', anchor: { tx_hash: 'tx1' } } });
    const r = await fetchEventProof(BASE, 'tree', TREE, 'e1');
    expect(r.ok).toBe(true);
    expect(r.data?.merkle_root).toBe('root');
    expect(anchorState(r.data?.anchor)).toBe(true);
  });

  it('đọc được thân TRẢI PHẲNG (không có khoá `proof`)', async () => {
    mockFetch(200, { ok: true, event_id: 'e1', leaf_hash: 'leaf' });
    const r = await fetchEventProof(BASE, 'tree', TREE, 'e1');
    expect(r.data?.leaf_hash).toBe('leaf');
  });

  it('thiếu `path` → undefined, KHÔNG dựng mảng rỗng trông như đã kiểm', async () => {
    mockFetch(200, { ok: true, event_id: 'e1' });
    const r = await fetchEventProof(BASE, 'tree', TREE, 'e1');
    expect(r.data?.path).toBeUndefined();
    expect(r.data?.anchor).toBeNull();
  });

  it('bẫy hai tầng ok: {ok:false} kèm HTTP 200 vẫn là lỗi', async () => {
    mockFetch(200, { ok: false, error: 'Không có quyền' });
    const r = await fetchEventProof(BASE, 'tree', TREE, 'e1');
    expect(r.ok).toBe(false);
    expect(r.error?.detail).toBe('Không có quyền');
  });

  it('404 không khẳng định sự kiện không tồn tại', async () => {
    mockFetch(404, {});
    const r = await fetchEventProof(BASE, 'tree', TREE, 'e1');
    expect(r.error?.error_code).toBe('proof_not_available');
    expect(r.error?.detail).not.toMatch(/không tồn tại/i);
  });

  it('thiếu mã sự kiện → lỗi ngay, không gọi mạng', async () => {
    const spy = jest.fn();
    globalThis.fetch = spy as any;
    const r = await fetchEventProof(BASE, 'tree', TREE, '  ');
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('anchorEvent', () => {
  it('chưa đăng nhập → chặn TẠI MÁY, không đụng tới mạng (neo là việc tốn tiền)', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.removeItem('auth_token');
    const spy = jest.fn();
    globalThis.fetch = spy as any;
    const r = await anchorEvent(BASE, 'tree', TREE, 'e1');
    expect(r.error?.type).toBe('auth_error');
    expect(spy).not.toHaveBeenCalled();
  });

  it('409 "đã neo rồi" là THÀNH CÔNG kèm cờ, không phải lỗi đỏ', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('auth_token', 'tok');
    mockFetch(409, { anchor: { status: 'anchored', tx_hash: 'tx9' } });
    const r = await anchorEvent(BASE, 'tree', TREE, 'e1');
    expect(r.ok).toBe(true);
    expect(r.data?.already_anchored).toBe(true);
    expect(r.data?.tx_hash).toBe('tx9');
  });

  it('403 nói đúng chuyện: không phải chủ', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('auth_token', 'tok');
    mockFetch(403, {});
    const r = await anchorEvent(BASE, 'tree', TREE, 'e1');
    expect(r.error?.error_code).toBe('not_owner');
  });

  it('lượt neo mới thường về `pending`, và đó KHÔNG phải lỗi', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('auth_token', 'tok');
    mockFetch(200, { ok: true, anchor: { status: 'pending', network: 'cardano-preprod' } });
    const r = await anchorEvent(BASE, 'tree', TREE, 'e1');
    expect(r.ok).toBe(true);
    expect(r.data?.already_anchored).toBe(false);
    expect(anchorState(r.data)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHIÊN HẾT HẠN — nút "Thử lại" phải gỡ được, không quay vòng 401
// ═══════════════════════════════════════════════════════════════════════════
//
// Tệp này trước đây đọc `auth_token` thẳng từ kho và trả `auth_error` ngay khi
// gặp 401, KHÔNG có đường ký lại. Token field-reid sống 12 giờ, nên hết buổi là
// mọi dòng thời gian câm, và bấm "Thử lại" chỉ lặp lại đúng lời gọi hỏng đó.
// Năm dịch vụ ReID đã có sẵn đường gỡ (`treeReIDService._apiCall`: 401 →
// `ensureOrilifeToken(base, {force:true})` → gọi lại MỘT lần). Đây là cùng đường
// đó, không phải cơ chế thứ hai.
describe('401 giữa buổi → ký lại DID rồi thử lại MỘT lần', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');

  /** Lần gọi thứ n trả status khác nhau — để đo "có gọi lại không". */
  const mockFetchSeq = (statuses: number[], bodies: any[] = []) => {
    let i = 0;
    globalThis.fetch = jest.fn(async () => {
      const s = statuses[Math.min(i, statuses.length - 1)];
      const b = bodies[Math.min(i, bodies.length - 1)] ?? {};
      i++;
      return { status: s, ok: s >= 200 && s < 300, json: async () => b } as any;
    }) as any;
    return () => i;
  };

  beforeEach(() => { mockEnsureToken.mockReset(); mockEnsureToken.mockResolvedValue(false); });

  it('fetchTimeline: có token + 401 → ký lại, gọi lại, trả kết quả THẬT', async () => {
    await AsyncStorage.setItem('auth_token', 'tok-cu');
    mockEnsureToken.mockResolvedValue(true);
    const calls = mockFetchSeq([401, 200], [{}, { ok: true, events: [], chain_ok: true, is_owner: true }]);

    const r = await fetchTimeline(BASE, 'tree', TREE);

    expect(mockEnsureToken).toHaveBeenCalledWith(BASE, { force: true });
    expect(calls()).toBe(2);
    expect(r.ok).toBe(true);
  });

  it('fetchTimeline: ký lại thất bại → đúng một lời gọi lại rồi dừng, KHÔNG quay vòng', async () => {
    await AsyncStorage.setItem('auth_token', 'tok-cu');
    mockEnsureToken.mockResolvedValue(false);
    const calls = mockFetchSeq([401]);

    const r = await fetchTimeline(BASE, 'tree', TREE);

    expect(calls()).toBe(1);
    expect(r.error?.type).toBe('auth_error');
  });

  it('fetchTimeline: KHÔNG có token → 401 là "phải đăng nhập", KHÔNG bật hộp sinh trắc', async () => {
    // Khách quét mã trên thùng hàng cũng đi qua cửa này. Ký DID là thao tác sinh
    // trắc — bật nó cho một người chưa hề đăng nhập là hỏi một câu vô nghĩa.
    await AsyncStorage.removeItem('auth_token');
    mockFetchSeq([401]);

    const r = await fetchTimeline(BASE, 'tree', TREE);

    expect(mockEnsureToken).not.toHaveBeenCalled();
    expect(r.error?.type).toBe('auth_error');
  });

  it('addTimelineEvent: 401 → ký lại rồi ghi lại, sự kiện KHÔNG rơi mất', async () => {
    await AsyncStorage.setItem('auth_token', 'tok-cu');
    mockEnsureToken.mockResolvedValue(true);
    const calls = mockFetchSeq([401, 200], [{}, { ok: true, event_id: 'ev-9' }]);

    const r = await addTimelineEvent(BASE, 'farm', 'farm-1', { kind: 'care' });

    expect(mockEnsureToken).toHaveBeenCalledWith(BASE, { force: true });
    expect(calls()).toBe(2);
    expect(r.ok).toBe(true);
    expect(r.event_id).toBe('ev-9');
  });

  it('addTimelineEvent: ký lại thất bại → trả 401 để hàng đợi giữ mục lại', async () => {
    await AsyncStorage.setItem('auth_token', 'tok-cu');
    mockEnsureToken.mockResolvedValue(false);
    const calls = mockFetchSeq([401]);

    const r = await addTimelineEvent(BASE, 'farm', 'farm-1', { kind: 'care' });

    expect(calls()).toBe(1);
    expect(r.error?.http_status).toBe(401);
  });

  it('addTimelineEvent: 401 LẦN HAI cũng không gọi lần ba (chặn vòng lặp)', async () => {
    await AsyncStorage.setItem('auth_token', 'tok-cu');
    mockEnsureToken.mockResolvedValue(true);
    const calls = mockFetchSeq([401, 401]);

    const r = await addTimelineEvent(BASE, 'farm', 'farm-1', { kind: 'care' });

    expect(calls()).toBe(2);
    expect(mockEnsureToken).toHaveBeenCalledTimes(1);
    expect(r.error?.http_status).toBe(401);
  });
});
