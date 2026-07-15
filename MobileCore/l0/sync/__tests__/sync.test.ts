/**
 * Test cho l0/sync — outbox bền, backoff, dedup, idempotency.
 *
 * `../geo` (haversineDistance) đã có thật lúc viết test này (B-geo hoàn
 * thành song song) — import THẬT trong index.ts, KHÔNG cần mock ảo ở đây.
 */

import type { KVStorage, HttpResponse, HttpRequestOptions } from '../../types';
import { MobileCoreError } from '../../errors';
import { createHttpClient } from '../../net';
import {
  createSyncOutbox,
  createDedupCache,
  computeBackoffMs,
  isRetryableError,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  MAX_RETRY_COUNT,
  type SyncQueueItem,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────
// KVStorage giả lập in-memory — thay SQLite/AsyncStorage thật (L0 không đụng).
// ─────────────────────────────────────────────────────────────────────────

function createMemoryStorage(): KVStorage {
  const store = new Map<string, string>();
  return {
    async getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async multiSet(pairs) {
      for (const [k, v] of pairs) store.set(k, v);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}

/**
 * KVStorage in-memory CÓ ĐỘ TRỄ — mỗi op nhả 1 microtask (await Promise.resolve)
 * để ép các thao tác async đan xen (interleave) như storage thật (AsyncStorage/
 * SQLite). Dùng cho test lost-update race.
 */
function createLatentStorage(): KVStorage {
  const store = new Map<string, string>();
  const yieldTick = () => Promise.resolve();
  return {
    async getItem(key) {
      await yieldTick();
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key, value) {
      await yieldTick();
      store.set(key, value);
    },
    async multiSet(pairs) {
      await yieldTick();
      for (const [k, v] of pairs) store.set(k, v);
    },
    async removeItem(key) {
      await yieldTick();
      store.delete(key);
    },
  };
}

function ok(data: unknown = {}): HttpResponse {
  return { status: 200, data };
}

// ─────────────────────────────────────────────────────────────────────────
// computeBackoffMs — dãy backoff 5s,10s,20s...cap 5min
// ─────────────────────────────────────────────────────────────────────────

describe('computeBackoffMs', () => {
  it('luỹ thừa cơ số 2, base 5s', () => {
    expect(computeBackoffMs(0)).toBe(5_000);
    expect(computeBackoffMs(1)).toBe(10_000);
    expect(computeBackoffMs(2)).toBe(20_000);
    expect(computeBackoffMs(3)).toBe(40_000);
    expect(computeBackoffMs(4)).toBe(80_000);
    expect(computeBackoffMs(5)).toBe(160_000);
  });

  it('chặn trên ở 5 phút (300_000ms)', () => {
    expect(computeBackoffMs(6)).toBe(300_000); // 320_000 lý thuyết → cap
    expect(computeBackoffMs(7)).toBe(300_000);
    expect(computeBackoffMs(20)).toBe(300_000);
  });

  it('khớp hằng số export BACKOFF_BASE_MS/BACKOFF_MAX_MS', () => {
    expect(BACKOFF_BASE_MS).toBe(5_000);
    expect(BACKOFF_MAX_MS).toBe(300_000);
    expect(MAX_RETRY_COUNT).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// isRetryableError
// ─────────────────────────────────────────────────────────────────────────

describe('isRetryableError', () => {
  it('MobileCoreError retryable:true (vd net/server) → retry', () => {
    const e = new MobileCoreError('net/server', '500', { retryable: true });
    expect(isRetryableError(e)).toBe(true);
  });

  it('MobileCoreError retryable:false (vd net/validation) → KHÔNG retry', () => {
    const e = new MobileCoreError('net/validation', '400', { retryable: false });
    expect(isRetryableError(e)).toBe(false);
  });

  it('lỗi thô có status 5xx/408/429 → retry', () => {
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ response: { status: 408 } })).toBe(true);
    expect(isRetryableError({ response: { status: 429 } })).toBe(true);
  });

  it('lỗi thô 4xx khác (400/422) → KHÔNG retry', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ response: { status: 422 } })).toBe(false);
  });

  it('lỗi không rõ dạng (network/timeout, không status) → retry', () => {
    expect(isRetryableError(new Error('Network Error'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// createSyncOutbox — drain loop, backoff, orphan recovery, dead-letter, idempotency
// ─────────────────────────────────────────────────────────────────────────

describe('createSyncOutbox', () => {
  it('enqueue gắn idempotencyKey === transactionId + dựng requestOptions mang key, trao cho send()', async () => {
    const storage = createMemoryStorage();
    let seenItem: SyncQueueItem | undefined;
    let seenOpts: HttpRequestOptions | undefined;
    const send = jest.fn(async (item: SyncQueueItem, requestOptions: HttpRequestOptions) => {
      seenItem = item;
      seenOpts = requestOptions;
      return ok();
    });
    const outbox = createSyncOutbox({ storage, send });

    const txId = await outbox.enqueue('tree_identification', { a: 1 });
    await outbox.drain();

    expect(send).toHaveBeenCalledTimes(1);
    expect(seenItem?.transactionId).toBe(txId);
    expect(seenItem?.idempotencyKey).toBe(txId);
    // Tham số thứ 2: requestOptions do sync tự dựng, ĐÃ mang idempotencyKey.
    expect(seenOpts?.idempotencyKey).toBe(txId);
  });

  it('gửi thành công → item bị xoá khỏi queue', async () => {
    const storage = createMemoryStorage();
    const send = jest.fn(async () => ok());
    const outbox = createSyncOutbox({ storage, send });

    await outbox.enqueue('farm_update', { b: 2 });
    await outbox.drain();

    expect(await outbox.getSnapshot()).toEqual([]);
  });

  it('re-entrancy guard: 2 lời gọi drain() chồng nhau chỉ xử lý 1 lượt', async () => {
    const storage = createMemoryStorage();
    let resolveSend: (() => void) | undefined;
    let notifySendCalled: (() => void) | undefined;
    const sendCalled = new Promise<void>((resolve) => {
      notifySendCalled = resolve;
    });
    const send = jest.fn(
      () =>
        new Promise<HttpResponse>((resolve) => {
          resolveSend = () => resolve(ok());
          notifySendCalled?.();
        }),
    );
    const outbox = createSyncOutbox({ storage, send });
    await outbox.enqueue('tree_identification', { c: 3 });

    const p1 = outbox.drain(); // bắt đầu xử lý, đang "chờ mạng" (send chưa resolve)
    const p2 = outbox.drain(); // gọi chồng khi đang chạy → phải no-op ngay (isProcessing guard)

    await p2; // p2 phải return NGAY — không tự mình gọi send()
    await sendCalled; // đợi tới khi p1 (lượt đang chạy) THỰC SỰ gọi tới send()
    expect(send).toHaveBeenCalledTimes(1); // chỉ p1 gọi — p2 không gọi thêm lần nào

    resolveSend?.();
    await p1;
    expect(send).toHaveBeenCalledTimes(1); // vẫn chỉ 1 lần — không gửi trùng
  });

  it('orphan status "sending" (app bị kill giữa lúc gửi phiên trước) được nhặt lại ở lần drain kế tiếp', async () => {
    const storage = createMemoryStorage();
    // Giả lập trạng thái để lại từ phiên trước: index có 1 id, item status 'sending'.
    const orphanId = 'tx_orphan_1';
    await storage.setItem('sync:queue:index', JSON.stringify([orphanId]));
    await storage.setItem(
      `sync:queue:item:${orphanId}`,
      JSON.stringify({
        transactionId: orphanId,
        idempotencyKey: orphanId,
        type: 'tree_identification',
        payload: { x: 1 },
        status: 'sending', // <-- orphan
        retryCount: 0,
        nextAttemptAt: 0,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const send = jest.fn(async (_item: SyncQueueItem) => ok());
    // Outbox mới = mô phỏng app restart (không còn state in-memory cũ).
    const outbox = createSyncOutbox({ storage, send });

    await outbox.drain(); // lần drain đầu tiên sau "restart" phải nhặt lại orphan

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].transactionId).toBe(orphanId);
    expect(await outbox.getSnapshot()).toEqual([]); // gửi thành công → đã xoá
  });

  it('lỗi vĩnh viễn (4xx, retryable:false) → dead-letter NGAY, không retry', async () => {
    const storage = createMemoryStorage();
    const send = jest.fn(async () => {
      throw new MobileCoreError('net/validation', 'bad payload', { retryable: false });
    });
    const outbox = createSyncOutbox({ storage, send });
    await outbox.enqueue('farm_update', { bad: true });

    await outbox.drain();
    let snap = await outbox.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].status).toBe('dead');
    expect(snap[0].deadLetterCode).toBe('sync/permanent');
    expect(send).toHaveBeenCalledTimes(1);

    // Vòng drain kế tiếp KHÔNG được gửi lại (đã chết).
    await outbox.drainNow();
    expect(send).toHaveBeenCalledTimes(1);
    snap = await outbox.getSnapshot();
    expect(snap[0].status).toBe('dead');
  });

  it('lỗi tạm thời (5xx, retryable:true) → retry đúng lịch backoff tới MAX_RETRY rồi dead-letter', async () => {
    const storage = createMemoryStorage();
    let clock = 1_000_000;
    const now = () => clock;
    const send = jest.fn(async () => {
      throw new MobileCoreError('net/server', '503', { retryable: true });
    });
    const outbox = createSyncOutbox({ storage, send, now });

    await outbox.enqueue('tree_identification', { y: 1 });

    const expectedBackoffs = [5_000, 10_000, 20_000, 40_000, 80_000]; // retryCount 1..5 (MAX=5)

    for (let attempt = 0; attempt < MAX_RETRY_COUNT; attempt++) {
      await outbox.drain(); // due ngay lần đầu (nextAttemptAt = createdAt = now hiện tại)
      const snap = await outbox.getSnapshot();
      expect(snap).toHaveLength(1);

      if (attempt < MAX_RETRY_COUNT - 1) {
        expect(snap[0].status).toBe('pending');
        expect(snap[0].retryCount).toBe(attempt + 1);
        expect(snap[0].nextAttemptAt).toBe(clock + expectedBackoffs[attempt]);
        // Nhảy đồng hồ tới đúng lúc due để lần drain sau xử lý được.
        clock = snap[0].nextAttemptAt;
      } else {
        // Lần thất bại thứ 5 (MAX_RETRY_COUNT) → dead-letter.
        expect(snap[0].status).toBe('dead');
        expect(snap[0].deadLetterCode).toBe('sync/retry-exhausted');
        expect(snap[0].retryCount).toBe(MAX_RETRY_COUNT);
      }
    }

    expect(send).toHaveBeenCalledTimes(MAX_RETRY_COUNT);

    // Vòng drain kế tiếp không gửi lại nữa (đã dead).
    await outbox.drain();
    expect(send).toHaveBeenCalledTimes(MAX_RETRY_COUNT);
  });

  it('item còn trong cửa sổ backoff (chưa due) bị bỏ qua ở vòng drain hiện tại', async () => {
    const storage = createMemoryStorage();
    let clock = 0;
    const now = () => clock;
    const send = jest.fn(async () => {
      throw new MobileCoreError('net/server', '503', { retryable: true });
    });
    const outbox = createSyncOutbox({ storage, send, now });

    await outbox.enqueue('tree_identification', { z: 1 });
    await outbox.drain(); // thất bại lần 1 → nextAttemptAt = 0 + 5000
    expect(send).toHaveBeenCalledTimes(1);

    clock = 2_000; // chưa tới 5000ms
    await outbox.drain();
    expect(send).toHaveBeenCalledTimes(1); // vẫn 1 — chưa due, bị bỏ qua

    clock = 5_001; // đã qua cửa sổ backoff
    await outbox.drain();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('drainNow() bỏ qua cửa sổ backoff — dùng cho reconnect', async () => {
    const storage = createMemoryStorage();
    let clock = 0;
    const now = () => clock;
    let shouldFail = true;
    const send = jest.fn(async () => {
      if (shouldFail) throw new MobileCoreError('net/server', '503', { retryable: true });
      return ok();
    });
    const outbox = createSyncOutbox({ storage, send, now });

    await outbox.enqueue('tree_identification', { w: 1 });
    await outbox.drain(); // thất bại → backoff 5000ms, due ở clock=5000
    expect(send).toHaveBeenCalledTimes(1);

    clock = 100; // còn rất xa cửa sổ backoff (due=5000)
    shouldFail = false; // giả lập mạng đã phục hồi
    await outbox.drainNow(); // phải gửi ngay, không chờ tới clock=5000
    expect(send).toHaveBeenCalledTimes(2);
    expect(await outbox.getSnapshot()).toEqual([]); // thành công → đã xoá
  });

  // ── Adversary red-team #1: lost-update race trên blob index ──────────────
  it('lost-update race: enqueue chen giữa lúc drain đang gửi → item mới KHÔNG mất khỏi index/getSnapshot', async () => {
    const storage = createLatentStorage(); // async có độ trễ → ép interleave
    // Cổng giữ send('A') treo lại để enqueue('B') chen vào GIỮA vòng drain,
    // rồi drain xoá A khỏi index SAU khi B đã append — đúng kịch bản lost-update.
    let releaseSend: (() => void) | undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const send = jest.fn(async () => {
      await sendGate;
      return ok();
    });
    const outbox = createSyncOutbox({ storage, send });

    await outbox.enqueue('tree_identification', { a: 1 }, 'A');

    const drainP = outbox.drain(); // đọc snapshot ['A'], gọi send('A') → treo tại gate
    // Chen enqueue B khi drain đang treo giữa chừng (chưa xoá A khỏi index).
    await outbox.enqueue('tree_identification', { b: 2 }, 'B');
    releaseSend?.(); // send('A') hoàn tất → drain xoá A khỏi index (đọc lại ['A','B'])
    await drainP;

    const snap = await outbox.getSnapshot();
    const ids = snap.map((i) => i.transactionId).sort();
    // A gửi xong → bị xoá; B (append giữa chừng) PHẢI còn reachable, không mất.
    expect(ids).toContain('B');
    expect(ids).not.toContain('A');

    // Chốt lại: drain vòng sau vẫn thấy B và gửi được (durability giữ nguyên).
    const send2 = jest.fn(async (_item: SyncQueueItem, _opts: HttpRequestOptions) => ok());
    const outbox2 = createSyncOutbox({ storage, send: send2 });
    await outbox2.drain();
    expect(send2).toHaveBeenCalledTimes(1);
    expect(send2.mock.calls[0][0].transactionId).toBe('B');
    expect(await outbox2.getSnapshot()).toEqual([]);
  });

  // ── Adversary red-team #2: idempotencyKey nối end-to-end tới net thật ────
  it('integration: header Idempotency-Key xuất hiện trên request net THẬT (createHttpClient + fetch mock)', async () => {
    // Response giả tối thiểu đủ cho l0/net (status + headers.get + text()).
    const fakeResponse = (status: number, body: unknown) =>
      ({
        status,
        headers: { get: () => null },
        text: async () => JSON.stringify(body),
      }) as unknown as Response;

    const originalFetch = (global as { fetch?: unknown }).fetch;
    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) =>
      fakeResponse(200, { statusCode: 200, data: { ok: true } }),
    );
    (global as { fetch?: unknown }).fetch = fetchMock;

    try {
      const client = createHttpClient({
        baseUrl: 'https://api.test',
        tokens: { getToken: async () => 'tok-123', refreshToken: async () => null },
      });

      const outbox = createSyncOutbox<{ id: string }>({
        storage: createMemoryStorage(),
        // Consumer cầu nối net: chỉ việc spread requestOptions (đã có idempotencyKey).
        send: (item, requestOptions) =>
          client.request('/trees', { ...requestOptions, method: 'POST', body: item.payload }),
      });

      const txId = await outbox.enqueue('tree_identification', { id: 't-1' });
      await outbox.drain();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0][1];
      const headers = init.headers as Record<string, string>;
      // Đây là bằng chứng end-to-end: key sync sinh ra → header net gửi đi.
      expect(headers['Idempotency-Key']).toBe(txId);
      expect(init.method).toBe('POST');
      // item gửi thành công → outbox rỗng.
      expect(await outbox.getSnapshot()).toEqual([]);
    } finally {
      (global as { fetch?: unknown }).fetch = originalFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// createDedupCache — TTL + khoảng cách địa lý
// ─────────────────────────────────────────────────────────────────────────

describe('createDedupCache', () => {
  it('trước khi load() → check() trả duplicate:false (an toàn)', () => {
    const storage = createMemoryStorage();
    const cache = createDedupCache({ storage });
    expect(cache.check('farm-A', { lat: 10, lng: 106 }).duplicate).toBe(false);
  });

  it('load() từ storage rỗng không crash', async () => {
    const storage = createMemoryStorage();
    const cache = createDedupCache({ storage });
    await cache.load();
    expect(cache.check('farm-A', { lat: 10, lng: 106 }).duplicate).toBe(false);
  });

  it('load() idempotent — chỉ đọc storage 1 lần dù gọi nhiều lần', async () => {
    const storage = createMemoryStorage();
    const getItemSpy = jest.spyOn(storage, 'getItem');
    const cache = createDedupCache({ storage });
    await cache.load();
    await cache.load();
    expect(getItemSpy).toHaveBeenCalledTimes(1);
  });

  it('storage JSON hỏng → fallback rỗng, không throw', async () => {
    const storage = createMemoryStorage();
    await storage.setItem('sync:dedup:v1', '{not valid json');
    const cache = createDedupCache({ storage });
    await expect(cache.load()).resolves.toBeUndefined();
    expect(cache.check('farm-A', { lat: 10, lng: 106 }).duplicate).toBe(false);
  });

  it('scan cách <8m trong <5 phút → nhận trùng (duplicate:true)', async () => {
    const storage = createMemoryStorage();
    const now0 = 1_700_000_000_000;
    const cache = createDedupCache({ storage, now: () => now0 });
    await cache.load();

    await cache.record('tree-1', 'farm-A', { lat: 10.1, lng: 106.7 }, now0);

    // ~1.4m cách điểm gốc, 60s sau — trong ngưỡng 8m / 5 phút.
    const result = cache.check('farm-A', { lat: 10.10001, lng: 106.70001 }, now0 + 60_000);
    expect(result.duplicate).toBe(true);
    if (result.duplicate) {
      expect(result.matchedId).toBe('tree-1');
      expect(result.distanceM).toBeLessThan(8);
      expect(result.ageMs).toBe(60_000);
    }
  });

  it('scan cách >8m → KHÔNG nhận trùng dù trong window thời gian', async () => {
    const storage = createMemoryStorage();
    const now0 = 1_700_000_000_000;
    const cache = createDedupCache({ storage, now: () => now0 });
    await cache.load();

    await cache.record('tree-1', 'farm-A', { lat: 10.1, lng: 106.7 }, now0);

    // 10.1001 cách gốc ~11m — vượt ngưỡng 8m.
    const result = cache.check('farm-A', { lat: 10.1001, lng: 106.7 }, now0 + 60_000);
    expect(result.duplicate).toBe(false);
  });

  it('scan trong 8m nhưng ngoài cửa sổ 5 phút → KHÔNG nhận trùng', async () => {
    const storage = createMemoryStorage();
    const now0 = 1_700_000_000_000;
    const cache = createDedupCache({ storage, now: () => now0 });
    await cache.load();

    await cache.record('tree-1', 'farm-A', { lat: 10.1, lng: 106.7 }, now0);

    const result = cache.check('farm-A', { lat: 10.10001, lng: 106.70001 }, now0 + 6 * 60_000);
    expect(result.duplicate).toBe(false);
  });

  it('chọn match gần nhất khi có nhiều scan trong range', async () => {
    const storage = createMemoryStorage();
    const now0 = 1_700_000_000_000;
    const cache = createDedupCache({ storage, now: () => now0 });
    await cache.load();

    await cache.record('far', 'farm-A', { lat: 10.10005, lng: 106.7 }, now0);
    await cache.record('near', 'farm-A', { lat: 10.10001, lng: 106.7 }, now0);

    const result = cache.check('farm-A', { lat: 10.10001, lng: 106.7 }, now0 + 1_000);
    expect(result.duplicate).toBe(true);
    if (result.duplicate) expect(result.matchedId).toBe('near');
  });

  it('GPS Null Island / một trục = 0 / ngoài dải hợp lệ → không dedup được', async () => {
    const storage = createMemoryStorage();
    const cache = createDedupCache({ storage });
    await cache.load();
    await cache.record('t', 'farm-A', { lat: 10, lng: 106 });

    expect(cache.check('farm-A', { lat: 0, lng: 0 }).duplicate).toBe(false);
    expect(cache.check('farm-A', { lat: 0, lng: 106 }).duplicate).toBe(false);
    expect(cache.check('farm-A', { lat: 10, lng: 0 }).duplicate).toBe(false);
    expect(cache.check('farm-A', { lat: 91, lng: 106 }).duplicate).toBe(false);
    expect(cache.check('farm-A', { lat: 10, lng: 181 }).duplicate).toBe(false);
  });

  it('record() cùng id 2 lần → ghi đè entry, không nhân đôi', async () => {
    const storage = createMemoryStorage();
    const cache = createDedupCache({ storage });
    await cache.load();
    await cache.record('tree-1', 'farm-A', { lat: 10.1, lng: 106.7 }, 1_000);
    await cache.record('tree-1', 'farm-A', { lat: 10.2, lng: 106.8 }, 2_000);

    // Kiểm tra qua persist: đọc lại storage, group chỉ có 1 entry.
    const raw = await storage.getItem('sync:dedup:v1');
    const parsed = JSON.parse(raw!);
    expect(parsed['farm-A']).toHaveLength(1);
    expect(parsed['farm-A'][0].capturedAt).toBe(2_000);
  });

  it('giữ tối đa maxPerGroup entry gần nhất', async () => {
    const storage = createMemoryStorage();
    const cache = createDedupCache({ storage, maxPerGroup: 3 });
    await cache.load();
    for (let i = 0; i < 5; i++) {
      await cache.record(`tree-${i}`, 'farm-A', { lat: 10 + i * 0.01, lng: 106 }, 1_000 + i);
    }
    const raw = await storage.getItem('sync:dedup:v1');
    const parsed = JSON.parse(raw!);
    expect(parsed['farm-A']).toHaveLength(3);
    expect(parsed['farm-A'][0].id).toBe('tree-4'); // mới nhất đứng đầu
  });

  it('entry cũ hơn expiryMs bị lọc bỏ lúc load()', async () => {
    const storage = createMemoryStorage();
    const now0 = 1_700_000_000_000;
    const oldTs = now0 - 31 * 24 * 60 * 60_000;
    await storage.setItem(
      'sync:dedup:v1',
      JSON.stringify({
        'farm-A': [
          { id: 'old', location: { lat: 10, lng: 106 }, capturedAt: oldTs },
          { id: 'fresh', location: { lat: 10, lng: 106 }, capturedAt: now0 - 60_000 },
        ],
      }),
    );
    const cache = createDedupCache({ storage, now: () => now0 });
    await cache.load();

    const result = cache.check('farm-A', { lat: 10, lng: 106 }, now0);
    expect(result.duplicate).toBe(true);
    if (result.duplicate) expect(result.matchedId).toBe('fresh');
  });

  it('clear() xoá cache + storage', async () => {
    const storage = createMemoryStorage();
    const cache = createDedupCache({ storage });
    await cache.load();
    await cache.record('tree-1', 'farm-A', { lat: 10, lng: 106 });
    await cache.clear();

    expect(cache.check('farm-A', { lat: 10, lng: 106 }).duplicate).toBe(false);
    expect(await storage.getItem('sync:dedup:v1')).toBeNull();
  });
});
