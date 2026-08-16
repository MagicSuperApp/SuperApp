// Unit tests cho syncDispatch — map sync item → API thật + phân loại lỗi.
//
// Mock aladin-api để tránh tạo axios client thật + gọi mạng. @env được babel
// react-native-dotenv inline thành rỗng trong jest → regionCode() rơi về
// fallback 'auto' (hành vi thật khi thiếu .env).

const mockCreateFarm = jest.fn<Promise<any>, any[]>(async () => ({}));
const mockCreateTree = jest.fn<Promise<any>, any[]>(async () => ({}));
jest.mock('./aladin-api', () => ({
  __esModule: true,
  default: {
    createFarm: (...a: any[]) => mockCreateFarm(...a),
    createTree: (...a: any[]) => mockCreateTree(...a),
  },
}));

const mockAddTimelineEvent = jest.fn<Promise<any>, any[]>(async () => ({ ok: true }));
jest.mock('./timelineService', () => ({
  __esModule: true,
  addTimelineEvent: (...a: any[]) => mockAddTimelineEvent(...a),
}));

import { classifySyncItem, isRetryableError } from './syncDispatch';

beforeEach(() => {
  mockCreateFarm.mockClear();
  mockCreateTree.mockClear();
  mockAddTimelineEvent.mockClear();
});

describe('classifySyncItem — farm_update', () => {
  const farm = {
    id: 'farm-1',
    name: 'Vườn A',
    userId: 'did:user:1',
    coordinates: [
      { lat: 10.0, lng: 106.0 },
      { lat: 10.0, lng: 106.1 },
      { lat: 10.1, lng: 106.1 },
    ],
  };

  it('map đủ field → gọi mockCreateFarm với GeoJSON ring đóng', async () => {
    const d = classifySyncItem({ type: 'farm_update', data: { farm } });
    expect(d.kind).toBe('api');
    if (d.kind !== 'api') return;
    await d.run();
    expect(mockCreateFarm).toHaveBeenCalledTimes(1);
    const arg = mockCreateFarm.mock.calls[0][0];
    expect(arg.farm_id).toBe('farm-1');
    expect(arg.owner_did).toBe('did:user:1');
    // region_code: từ ALADIN_REGION_CODE, fallback 'auto' khi env rỗng (jest).
    expect(typeof arg.region_code).toBe('string');
    expect(arg.region_code.length).toBeGreaterThan(0);
    expect(arg.boundary.type).toBe('Polygon');
    const ring = arg.boundary.coordinates[0];
    // [lng, lat] và ring phải đóng (first === last)
    expect(ring[0]).toEqual([106.0, 10.0]);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it('chấp nhận payload phẳng (data = farm trực tiếp)', async () => {
    const d = classifySyncItem({ type: 'farm_update', data: farm });
    expect(d.kind).toBe('api');
  });

  it('thiếu boundary → unsupported, KHÔNG gọi API', () => {
    const d = classifySyncItem({
      type: 'farm_update',
      data: { farm: { id: 'f', userId: 'u', coordinates: [] } },
    });
    expect(d.kind).toBe('unsupported');
    expect(mockCreateFarm).not.toHaveBeenCalled();
  });
});

describe('classifySyncItem — tree_identification', () => {
  it('map đủ field → gọi mockCreateTree với geohash_7 hợp lệ', async () => {
    const d = classifySyncItem({
      type: 'tree_identification',
      data: { tree: { id: 't-1', farmId: 'farm-1', latitude: 10.77, longitude: 106.69, species: 'durian' } },
    });
    expect(d.kind).toBe('api');
    if (d.kind !== 'api') return;
    await d.run();
    expect(mockCreateTree).toHaveBeenCalledTimes(1);
    const arg = mockCreateTree.mock.calls[0][0];
    expect(arg.id).toBe('t-1');
    expect(arg.farm_id).toBe('farm-1');
    expect(arg.geohash_7).toHaveLength(7);
    expect(arg.metadata).toEqual({ species: 'durian' });
  });

  it('chấp nhận GPS dạng location {lat,lng}', async () => {
    const d = classifySyncItem({
      type: 'tree_identification',
      data: { id: 't-2', farmId: 'farm-1', location: { lat: 1, lng: 2 } },
    });
    expect(d.kind).toBe('api');
    if (d.kind !== 'api') return;
    await d.run();
    expect(mockCreateTree.mock.calls[0][0].latitude).toBe(1);
  });

  it('thiếu farmId → unsupported, KHÔNG gọi API', () => {
    const d = classifySyncItem({
      type: 'tree_identification',
      data: { id: 't-3', latitude: 1, longitude: 2 },
    });
    expect(d.kind).toBe('unsupported');
    expect(mockCreateTree).not.toHaveBeenCalled();
  });
});

describe('classifySyncItem — loại chưa có contract (giữ queue, không bịa)', () => {
  it.each(['fruit_identification', 'unknown_xyz'])(
    '%s → unsupported',
    (type) => {
      const d = classifySyncItem({ type, data: {} });
      expect(d.kind).toBe('unsupported');
      expect(mockCreateFarm).not.toHaveBeenCalled();
      expect(mockCreateTree).not.toHaveBeenCalled();
    },
  );

  it('fruit_identification nêu rõ [CẦN XÁC NHẬN CONTRACT]', () => {
    const d = classifySyncItem({ type: 'fruit_identification', data: {} });
    if (d.kind !== 'unsupported') throw new Error('expected unsupported');
    expect(d.reason).toContain('CẦN XÁC NHẬN CONTRACT');
  });
});

describe('classifySyncItem — activity ghi vào dòng thời gian THẬT', () => {
  const act = {
    id: 'activity_1',
    type: 'watering',
    farmId: 'farm-9',
    materials: [],
    timestamp: '2026-08-15T01:00:00.000Z',
    creditsUsed: 1,
  };

  it('tưới → POST sự kiện `care` lên đúng vườn', async () => {
    const d = classifySyncItem({ type: 'activity', data: { activity: act } });
    expect(d.kind).toBe('api');
    if (d.kind !== 'api') return;
    await d.run();
    expect(mockAddTimelineEvent).toHaveBeenCalledTimes(1);
    const [, entityType, entityId, body] = mockAddTimelineEvent.mock.calls[0];
    expect(entityType).toBe('farm');
    expect(entityId).toBe('farm-9');
    expect(body.kind).toBe('care');
    expect(body.ts).toBe(act.timestamp);
    expect(body.payload.activity_type).toBe('watering');
  });

  it('thu hoạch → `harvest`, KHÔNG phải `care`', async () => {
    const d = classifySyncItem({ type: 'activity_log', data: { activity: { ...act, type: 'harvesting' } } });
    if (d.kind !== 'api') throw new Error('expected api');
    await d.run();
    expect(mockAddTimelineEvent.mock.calls[0][3].kind).toBe('harvest');
  });

  it('máy chủ từ chối → NÉM, để hàng đợi giữ lại chứ không báo đã gửi', async () => {
    mockAddTimelineEvent.mockResolvedValueOnce({
      ok: false,
      error: { type: 'validation_error', detail: 'Vườn chưa đăng ký', http_status: 403 },
    });
    const d = classifySyncItem({ type: 'activity', data: { activity: act } });
    if (d.kind !== 'api') throw new Error('expected api');
    await expect(d.run()).rejects.toThrow('Vườn chưa đăng ký');
  });

  it('thiếu farmId → unsupported, KHÔNG gọi mạng', () => {
    const d = classifySyncItem({ type: 'activity', data: { activity: { type: 'watering' } } });
    expect(d.kind).toBe('unsupported');
    expect(mockAddTimelineEvent).not.toHaveBeenCalled();
  });

  it('việc lạ chưa có trong bảng → `observe`, KHÔNG bịa `kind` mới', async () => {
    const d = classifySyncItem({ type: 'activity', data: { activity: { ...act, type: 'pruning' } } });
    if (d.kind !== 'api') throw new Error('expected api');
    await d.run();
    expect(mockAddTimelineEvent.mock.calls[0][3].kind).toBe('observe');
  });
});

describe('isRetryableError', () => {
  it('lỗi mạng (không có response) → retry', () => {
    expect(isRetryableError(new Error('Network Error'))).toBe(true);
  });
  it('5xx → retry', () => {
    expect(isRetryableError({ response: { status: 503 } })).toBe(true);
  });
  it('408/429 → retry', () => {
    expect(isRetryableError({ response: { status: 408 } })).toBe(true);
    expect(isRetryableError({ response: { status: 429 } })).toBe(true);
  });
  it('4xx khác (400/422) → KHÔNG retry', () => {
    expect(isRetryableError({ response: { status: 400 } })).toBe(false);
    expect(isRetryableError({ response: { status: 422 } })).toBe(false);
  });
});
