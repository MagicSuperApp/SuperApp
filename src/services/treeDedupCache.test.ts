// Unit tests cho treeDedupCache (Build 58 — AsyncStorage persistence).
//
// Mock AsyncStorage bằng in-memory implementation để test:
//  - load từ storage rỗng / có data / corrupted
//  - check duplicate với edge case GPS, time, distance
//  - cache scan + update canonical tree_id
//  - persist sau mỗi mutation

import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory mock cho AsyncStorage (tránh phụ thuộc real native module)
const storage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => storage[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      storage[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete storage[k];
    }),
  },
}));

// Reset storage + module state TRƯỚC mỗi test để không leak state giữa cases.
// KHÔNG dùng jest.resetModules vì sẽ tạo mock AsyncStorage mới — mất tracking
// gọi xuyên tests. Thay vào đó dùng _resetForTest() helper từ chính module.
beforeEach(() => {
  for (const k of Object.keys(storage)) delete storage[k];
  (AsyncStorage.getItem as jest.Mock).mockClear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
  (AsyncStorage.removeItem as jest.Mock).mockClear();
  require('./treeDedupCache')._resetForTest();
});

describe('loadTreeDedupCache', () => {
  it('load từ storage rỗng không crash', async () => {
    const { loadTreeDedupCache, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    expect(getCacheForDebug()).toEqual({});
  });

  it('load từ storage có data parse đúng', async () => {
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [
        { treeId: 'tree-1', farmId: 'farm-A', lat: 10.1, lng: 106.7, capturedAt: Date.now() },
      ],
    });
    const { loadTreeDedupCache, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    expect(getCacheForDebug()['farm-A']).toHaveLength(1);
    expect(getCacheForDebug()['farm-A'][0].treeId).toBe('tree-1');
  });

  it('storage corrupted JSON → fallback empty, không crash', async () => {
    storage['@aladin/treeDedupCache/v2'] = '{not valid json';
    const { loadTreeDedupCache, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    expect(getCacheForDebug()).toEqual({});
  });

  it('scans cũ hơn 30 ngày bị filter khi load', async () => {
    const oldTs = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const freshTs = Date.now() - 60_000;
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [
        { treeId: 'old', farmId: 'farm-A', lat: 10, lng: 106, capturedAt: oldTs },
        { treeId: 'fresh', farmId: 'farm-A', lat: 10, lng: 106, capturedAt: freshTs },
      ],
    });
    const { loadTreeDedupCache, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    expect(getCacheForDebug()['farm-A']).toHaveLength(1);
    expect(getCacheForDebug()['farm-A'][0].treeId).toBe('fresh');
  });

  it('idempotent — gọi 2 lần không double-load', async () => {
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [{ treeId: 't', farmId: 'farm-A', lat: 10, lng: 106, capturedAt: Date.now() }],
    });
    const { loadTreeDedupCache } = require('./treeDedupCache');
    await loadTreeDedupCache();
    await loadTreeDedupCache();
    // getItem chỉ gọi 1 lần
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });
});

describe('checkPotentialDuplicate', () => {
  it('trước khi load → return likelyDuplicate:false (safe default)', async () => {
    const { checkPotentialDuplicate } = require('./treeDedupCache');
    const result = checkPotentialDuplicate('farm-A', 10.1, 106.7);
    expect(result.likelyDuplicate).toBe(false);
  });

  it('GPS Null Island (0,0) → likelyDuplicate:false', async () => {
    const { loadTreeDedupCache, checkPotentialDuplicate } = require('./treeDedupCache');
    await loadTreeDedupCache();
    expect(checkPotentialDuplicate('farm-A', 0, 0).likelyDuplicate).toBe(false);
    expect(checkPotentialDuplicate('farm-A', 0, 106).likelyDuplicate).toBe(false);
    expect(checkPotentialDuplicate('farm-A', 10, 0).likelyDuplicate).toBe(false);
  });

  it('GPS out of range → likelyDuplicate:false', async () => {
    const { loadTreeDedupCache, checkPotentialDuplicate } = require('./treeDedupCache');
    await loadTreeDedupCache();
    expect(checkPotentialDuplicate('farm-A', 91, 106).likelyDuplicate).toBe(false);
    expect(checkPotentialDuplicate('farm-A', 10, 181).likelyDuplicate).toBe(false);
  });

  it('farm chưa có cache → likelyDuplicate:false', async () => {
    const { loadTreeDedupCache, checkPotentialDuplicate } = require('./treeDedupCache');
    await loadTreeDedupCache();
    expect(checkPotentialDuplicate('farm-empty', 10, 106).likelyDuplicate).toBe(false);
  });

  it('scan trong window + distance < 8m → likelyDuplicate:true', async () => {
    const now = Date.now();
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [
        { treeId: 'tree-1', farmId: 'farm-A', lat: 10.1, lng: 106.7, capturedAt: now - 60_000 },
      ],
    });
    const { loadTreeDedupCache, checkPotentialDuplicate } = require('./treeDedupCache');
    await loadTreeDedupCache();
    // 10.10001, 106.70001 cách ~1.4m
    const result = checkPotentialDuplicate('farm-A', 10.10001, 106.70001, now);
    expect(result.likelyDuplicate).toBe(true);
    if (result.likelyDuplicate) {
      expect(result.cachedTreeId).toBe('tree-1');
      expect(result.distanceM).toBeLessThan(8);
    }
  });

  it('scan ngoài window 5 phút → likelyDuplicate:false', async () => {
    const now = Date.now();
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [
        { treeId: 'tree-1', farmId: 'farm-A', lat: 10.1, lng: 106.7, capturedAt: now - 10 * 60_000 },
      ],
    });
    const { loadTreeDedupCache, checkPotentialDuplicate } = require('./treeDedupCache');
    await loadTreeDedupCache();
    const result = checkPotentialDuplicate('farm-A', 10.1, 106.7, now);
    expect(result.likelyDuplicate).toBe(false);
  });

  it('distance > 8m → likelyDuplicate:false', async () => {
    const now = Date.now();
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [
        { treeId: 'tree-1', farmId: 'farm-A', lat: 10.1, lng: 106.7, capturedAt: now - 60_000 },
      ],
    });
    const { loadTreeDedupCache, checkPotentialDuplicate } = require('./treeDedupCache');
    await loadTreeDedupCache();
    // 10.1001 cách ~11m
    const result = checkPotentialDuplicate('farm-A', 10.1001, 106.7, now);
    expect(result.likelyDuplicate).toBe(false);
  });

  it('chọn match gần nhất khi farm có nhiều scan trong range', async () => {
    const now = Date.now();
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [
        { treeId: 'far', farmId: 'farm-A', lat: 10.10005, lng: 106.7, capturedAt: now - 60_000 },
        { treeId: 'near', farmId: 'farm-A', lat: 10.10001, lng: 106.7, capturedAt: now - 60_000 },
      ],
    });
    const { loadTreeDedupCache, checkPotentialDuplicate } = require('./treeDedupCache');
    await loadTreeDedupCache();
    const result = checkPotentialDuplicate('farm-A', 10.10001, 106.7, now);
    expect(result.likelyDuplicate).toBe(true);
    if (result.likelyDuplicate) {
      expect(result.cachedTreeId).toBe('near');
    }
  });
});

describe('cacheTreeScan', () => {
  it('insert tree mới + persist', async () => {
    const { loadTreeDedupCache, cacheTreeScan, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    await cacheTreeScan('tree-1', 'farm-A', 10.1, 106.7);
    expect(getCacheForDebug()['farm-A']).toHaveLength(1);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('cache cùng tree_id 2 lần → chỉ 1 entry (update GPS+time)', async () => {
    const { loadTreeDedupCache, cacheTreeScan, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    await cacheTreeScan('tree-1', 'farm-A', 10.1, 106.7, 1000);
    await cacheTreeScan('tree-1', 'farm-A', 10.2, 106.8, 2000);
    const scans = getCacheForDebug()['farm-A'];
    expect(scans).toHaveLength(1);
    expect(scans[0].lat).toBe(10.2);
    expect(scans[0].capturedAt).toBe(2000);
  });

  it('giữ MAX 100 scans, cũ nhất rớt', async () => {
    const { loadTreeDedupCache, cacheTreeScan, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    for (let i = 0; i < 105; i++) {
      await cacheTreeScan(`tree-${i}`, 'farm-A', 10 + i * 0.001, 106, 1000 + i);
    }
    expect(getCacheForDebug()['farm-A']).toHaveLength(100);
    // Mới nhất nằm đầu (sort desc)
    expect(getCacheForDebug()['farm-A'][0].treeId).toBe('tree-104');
  });
});

describe('updateCanonicalTreeId', () => {
  it('rename local treeId thành canonical (server-returned)', async () => {
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [
        { treeId: 'local-X', farmId: 'farm-A', lat: 10, lng: 106, capturedAt: Date.now() },
      ],
    });
    const { loadTreeDedupCache, updateCanonicalTreeId, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    await updateCanonicalTreeId('local-X', 'canonical-Y', 'farm-A');
    expect(getCacheForDebug()['farm-A'][0].treeId).toBe('canonical-Y');
  });

  it('noop nếu local == canonical', async () => {
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [{ treeId: 't', farmId: 'farm-A', lat: 10, lng: 106, capturedAt: Date.now() }],
    });
    const { loadTreeDedupCache, updateCanonicalTreeId } = require('./treeDedupCache');
    await loadTreeDedupCache();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    await updateCanonicalTreeId('t', 't', 'farm-A');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('noop nếu farm không tồn tại', async () => {
    const { loadTreeDedupCache, updateCanonicalTreeId } = require('./treeDedupCache');
    await loadTreeDedupCache();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    await updateCanonicalTreeId('a', 'b', 'farm-không-có');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('clearTreeDedupCache', () => {
  it('clear xong cache rỗng + xóa storage', async () => {
    storage['@aladin/treeDedupCache/v2'] = JSON.stringify({
      'farm-A': [{ treeId: 't', farmId: 'farm-A', lat: 10, lng: 106, capturedAt: Date.now() }],
    });
    const { loadTreeDedupCache, clearTreeDedupCache, getCacheForDebug } = require('./treeDedupCache');
    await loadTreeDedupCache();
    await clearTreeDedupCache();
    expect(getCacheForDebug()).toEqual({});
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@aladin/treeDedupCache/v2');
  });
});
