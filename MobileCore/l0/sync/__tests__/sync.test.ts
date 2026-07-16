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
  buildSyncSend,
  defaultGenId,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  MAX_RETRY_COUNT,
  type SyncQueueItem,
  type SendFn,
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

  // ── Việc 1: blocked-on-auth (net/auth-transient) — chống mất dữ liệu ──────
  it('net/auth-transient → blocked-on-auth: KHÔNG dead-letter, KHÔNG bump retryCount, có nextAttemptAt backoff riêng', async () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const now = () => clock;
    const send = jest.fn(async () => {
      throw new MobileCoreError('net/auth-transient', 'refresh 503', { retryable: true });
    });
    const outbox = createSyncOutbox({ storage, send, now });

    await outbox.enqueue('tree_identification', { a: 1 });
    await outbox.drain();

    let snap = await outbox.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].status).toBe('blocked-on-auth');
    expect(snap[0].retryCount).toBe(0); // KHÔNG bump retryCount
    expect(snap[0].authBlockCount).toBe(1); // đếm riêng cho nhánh auth
    expect(snap[0].nextAttemptAt).toBe(clock + 5_000); // backoff riêng (không dồn dập mỗi tick)
    expect(snap[0].deadLetterCode).toBeUndefined(); // KHÔNG dead-letter

    // Kẹt auth kéo dài: dù lặp nhiều lần vẫn KHÔNG BAO GIỜ dead-letter, dữ liệu còn nguyên.
    for (let i = 0; i < 10; i++) {
      clock = snap[0].nextAttemptAt; // nhảy tới lúc due
      await outbox.drain();
      snap = await outbox.getSnapshot();
      expect(snap).toHaveLength(1);
      expect(snap[0].status).toBe('blocked-on-auth');
      expect(snap[0].retryCount).toBe(0);
    }
    expect(send).toHaveBeenCalledTimes(11);
  });

  it('unblockAuth() → item blocked-on-auth về pending, drain gửi lại thành công', async () => {
    const storage = createMemoryStorage();
    let clock = 0;
    const now = () => clock;
    let mode: 'auth' | 'ok' = 'auth';
    const send = jest.fn(async () => {
      if (mode === 'auth') throw new MobileCoreError('net/auth-transient', 'refresh 503', { retryable: true });
      return ok();
    });
    const outbox = createSyncOutbox({ storage, send, now });

    await outbox.enqueue('farm_update', { b: 2 });
    await outbox.drain();
    expect((await outbox.getSnapshot())[0].status).toBe('blocked-on-auth');

    mode = 'ok'; // tầng trên báo auth phục hồi
    await outbox.unblockAuth(); // → pending → drain → gửi lại thành công
    expect(await outbox.getSnapshot()).toEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('net/unauthorized → auth-expired: terminal (KHÔNG dead-letter, drain/drainNow KHÔNG tự retry), chỉ unblockAuth resume', async () => {
    const storage = createMemoryStorage();
    let clock = 0;
    const now = () => clock;
    let mode: 'unauth' | 'ok' = 'unauth';
    const send = jest.fn(async () => {
      if (mode === 'unauth') throw new MobileCoreError('net/unauthorized', 'session expired', { retryable: false });
      return ok();
    });
    const outbox = createSyncOutbox({ storage, send, now });

    await outbox.enqueue('tree_identification', { z: 1 });
    await outbox.drain();

    const snap = await outbox.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].status).toBe('auth-expired');
    expect(snap[0].status).not.toBe('dead'); // KHÔNG âm thầm dead-letter dữ liệu
    expect(snap[0].deadLetterCode).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);

    // Pipeline tự động KHÔNG thử lại (tránh spam 401) — kể cả sau backoff dài / reconnect.
    clock = 10 * 60_000;
    await outbox.drain();
    await outbox.drainNow();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await outbox.getSnapshot())[0].status).toBe('auth-expired');

    // Chỉ unblockAuth() (sau re-login) mới resume → gửi lại thành công.
    mode = 'ok';
    await outbox.unblockAuth();
    expect(await outbox.getSnapshot()).toEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  // ── Việc 2: CSPRNG idempotency, genId injectable ─────────────────────────
  it('genId injectable → id deterministic, DÙNG CHUNG transactionId + idempotencyKey + requestOptions', async () => {
    const storage = createMemoryStorage();
    const genId = jest.fn(() => 'fixed-id-123');
    let seenOpts: HttpRequestOptions | undefined;
    const send = jest.fn(async (_item: SyncQueueItem, opts: HttpRequestOptions) => {
      seenOpts = opts;
      return ok();
    });
    const outbox = createSyncOutbox({ storage, send, genId });

    const txId = await outbox.enqueue('tree_identification', { a: 1 });
    expect(txId).toBe('fixed-id-123');
    expect(genId).toHaveBeenCalledTimes(1);

    const snap = await outbox.getSnapshot();
    expect(snap[0].transactionId).toBe('fixed-id-123');
    expect(snap[0].idempotencyKey).toBe('fixed-id-123'); // 1 nguồn, không lệch

    await outbox.drain();
    expect(seenOpts?.idempotencyKey).toBe('fixed-id-123');
  });

  it('default genId = CSPRNG (crypto.randomUUID shape), TUYỆT ĐỐI KHÔNG Math.random', async () => {
    const spy = jest.spyOn(Math, 'random');
    const storage = createMemoryStorage();
    const send = jest.fn(async () => ok());
    const outbox = createSyncOutbox({ storage, send });

    const id1 = await outbox.enqueue('t', { a: 1 });
    const id2 = await outbox.enqueue('t', { a: 2 });

    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(id1).toMatch(uuidV4);
    expect(id2).toMatch(uuidV4);
    expect(id1).not.toBe(id2);
    expect(spy).not.toHaveBeenCalled(); // không dùng Math.random ở bất kỳ đâu
    spy.mockRestore();
  });

  it('defaultGenId ném lỗi rõ ràng khi thiếu crypto (không âm thầm rơi về nguồn yếu)', () => {
    const original = (globalThis as { crypto?: unknown }).crypto;
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
      expect(() => defaultGenId()).toThrow(/CSPRNG unavailable/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });

  // ── Việc 3: buildSyncSend() ép idempotencyKey ────────────────────────────
  it('buildSyncSend() ép idempotencyKey = item.idempotencyKey, ghi đè key sai, giữ field khác', async () => {
    let seen: HttpRequestOptions | undefined;
    const raw: SendFn = async (_item, opts) => {
      seen = opts;
      return ok();
    };
    const send = buildSyncSend(raw);
    const item: SyncQueueItem = {
      transactionId: 'X',
      idempotencyKey: 'X',
      type: 't',
      payload: {},
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    // requestOptions vào mang key SAI + field khác → phải ép key đúng, giữ method.
    await send(item, { idempotencyKey: 'WRONG', method: 'POST' });
    expect(seen?.idempotencyKey).toBe('X');
    expect(seen?.method).toBe('POST');
  });

  // ── Việc 4a: guard enqueue trùng transactionId đang-gửi ──────────────────
  it('enqueue trùng transactionId đang-xử-lý → KHÔNG ghi đè payload/state (chống mất write)', async () => {
    const storage = createMemoryStorage();
    const send = jest.fn(async () => ok());
    const outbox = createSyncOutbox({ storage, send });

    const id1 = await outbox.enqueue('t', { v: 1 }, 'FIX');
    const id2 = await outbox.enqueue('t', { v: 2 }, 'FIX'); // trùng, item cũ chưa 'dead'
    expect(id1).toBe('FIX');
    expect(id2).toBe('FIX');

    const snap = await outbox.getSnapshot();
    expect(snap).toHaveLength(1); // không nhân đôi
    expect((snap[0].payload as { v: number }).v).toBe(1); // payload GỐC giữ nguyên
  });

  // ── Việc 4b: orphan-id cleanup + purge dead sau TTL ──────────────────────
  it('orphan-id (item null nhưng id còn trong index) → drain gỡ id khỏi index', async () => {
    const storage = createMemoryStorage();
    await storage.setItem('sync:queue:index', JSON.stringify(['ghost']));
    // KHÔNG có key item:ghost → readItem trả null.
    const send = jest.fn(async () => ok());
    const outbox = createSyncOutbox({ storage, send });

    await outbox.drain();
    expect(await outbox.getSnapshot()).toEqual([]);
    expect(await storage.getItem('sync:queue:index')).toBe('[]');
    expect(send).not.toHaveBeenCalled();
  });

  it('dead-letter quá TTL → drain() purge khỏi storage + index', async () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const now = () => clock;
    const send = jest.fn(async () => {
      throw new MobileCoreError('net/validation', 'bad', { retryable: false });
    });
    const outbox = createSyncOutbox({ storage, send, now, deadLetterTtlMs: 1_000, genId: () => 'DEADID' });

    await outbox.enqueue('t', { a: 1 });
    await outbox.drain(); // → dead (updatedAt = 1_000)
    expect((await outbox.getSnapshot())[0].status).toBe('dead');

    clock = 1_000 + 999; // chưa hết TTL
    await outbox.drain();
    expect(await outbox.getSnapshot()).toHaveLength(1); // vẫn giữ

    clock = 1_000 + 1_000; // tới hạn TTL
    await outbox.drain();
    expect(await outbox.getSnapshot()).toEqual([]); // đã purge
    expect(await storage.getItem('sync:queue:item:DEADID')).toBeNull();
    expect(await storage.getItem('sync:queue:index')).toBe('[]');
  });

  // ── Việc 4c: onItemStatus callback ───────────────────────────────────────
  it('onItemStatus báo chuyển trạng thái cho UI: sending→sent (thành công) và sending→dead (lỗi)', async () => {
    const storage = createMemoryStorage();
    const events: Array<[string, string]> = [];
    const onItemStatus = (id: string, status: string): void => {
      events.push([id, status]);
    };
    const sendOk = jest.fn(async () => ok());
    const outboxOk = createSyncOutbox({ storage, send: sendOk, onItemStatus, genId: () => 'ID1' });
    await outboxOk.enqueue('t', { a: 1 });
    await outboxOk.drain();
    expect(events).toEqual([
      ['ID1', 'sending'],
      ['ID1', 'sent'],
    ]);

    events.length = 0;
    const sendBad = jest.fn(async () => {
      throw new MobileCoreError('net/validation', 'bad', { retryable: false });
    });
    const outboxBad = createSyncOutbox({ storage, send: sendBad, onItemStatus, genId: () => 'ID2' });
    await outboxBad.enqueue('t', { a: 2 });
    await outboxBad.drain();
    expect(events).toEqual([
      ['ID2', 'sending'],
      ['ID2', 'dead'],
    ]);
  });

  it('onItemStatus báo blocked-on-auth và auth-expired cho UI', async () => {
    const events: Array<[string, string]> = [];
    const onItemStatus = (id: string, status: string): void => {
      events.push([id, status]);
    };

    // net/auth-transient → 'blocked-on-auth'
    const storage1 = createMemoryStorage();
    const sendTransient = jest.fn(async () => {
      throw new MobileCoreError('net/auth-transient', 'refresh 503', { retryable: true });
    });
    const outbox1 = createSyncOutbox({ storage: storage1, send: sendTransient, onItemStatus, genId: () => 'A1' });
    await outbox1.enqueue('t', { a: 1 });
    await outbox1.drain();
    expect(events).toEqual([
      ['A1', 'sending'],
      ['A1', 'blocked-on-auth'],
    ]);

    // net/unauthorized → 'auth-expired' (surface cho tầng trên re-login)
    events.length = 0;
    const storage2 = createMemoryStorage();
    const sendUnauth = jest.fn(async () => {
      throw new MobileCoreError('net/unauthorized', 'session expired', { retryable: false });
    });
    const outbox2 = createSyncOutbox({ storage: storage2, send: sendUnauth, onItemStatus, genId: () => 'A2' });
    await outbox2.enqueue('t', { a: 2 });
    await outbox2.drain();
    expect(events).toEqual([
      ['A2', 'sending'],
      ['A2', 'auth-expired'],
    ]);
  });

  it('onItemStatus ném lỗi KHÔNG phá drain (nuốt lỗi callback)', async () => {
    const storage = createMemoryStorage();
    const onItemStatus = (): void => {
      throw new Error('UI boom');
    };
    const send = jest.fn(async () => ok());
    const outbox = createSyncOutbox({ storage, send, onItemStatus });
    await outbox.enqueue('t', { a: 1 });

    await expect(outbox.drain()).resolves.toBeUndefined();
    expect(await outbox.getSnapshot()).toEqual([]); // vẫn gửi thành công
  });

  // ── Adversary re-attack #1: unblockAuth ↔ drain race (lost-update) ────────
  it('unblockAuth chen giữa lúc send() inflight → reset authBlockCount SỐNG SÓT (re-read chống lost-update)', async () => {
    const storage = createMemoryStorage();
    const itemK = 'sync:queue:item:X';
    let clock = 1_000;
    const now = () => clock;

    // send() mô phỏng unblockAuth() chạy song song GIỮA read→catch: ghi thẳng
    // storage item X về pending/authBlockCount=0 (đúng hệ quả của unblockAuth),
    // rồi ném net/auth-transient. Nếu catch dùng bản CŨ trong bộ nhớ
    // (authBlockCount=3) → sẽ ghi đè thành blocked-on-auth/4, xoá sạch reset.
    const send = jest.fn(async () => {
      const raw = await storage.getItem(itemK);
      const it = JSON.parse(raw!);
      it.status = 'pending';
      it.authBlockCount = 0;
      it.nextAttemptAt = clock;
      it.updatedAt = clock;
      await storage.setItem(itemK, JSON.stringify(it));
      throw new MobileCoreError('net/auth-transient', 'refresh 503', { retryable: true });
    });

    const outbox = createSyncOutbox({ storage, send, now });
    await outbox.enqueue('t', { a: 1 }, 'X');
    // Đặt trạng thái xuất phát: blocked-on-auth, authBlockCount=3, đã due.
    await storage.setItem(
      itemK,
      JSON.stringify({
        transactionId: 'X',
        idempotencyKey: 'X',
        type: 't',
        payload: { a: 1 },
        status: 'blocked-on-auth',
        retryCount: 0,
        authBlockCount: 3,
        nextAttemptAt: clock,
        createdAt: clock,
        updatedAt: clock,
      }),
    );

    await outbox.drain();

    const snap = await outbox.getSnapshot();
    expect(snap).toHaveLength(1);
    // Bản mới (reset của unblockAuth) phải THẮNG — KHÔNG bị bản cũ ghi đè.
    expect(snap[0].status).toBe('pending');
    expect(snap[0].authBlockCount).toBe(0);
    expect(snap[0].status).not.toBe('blocked-on-auth');
  });

  // ── Adversary re-attack #2: drainNow không được hammer refresh ────────────
  it('drainNow KHÔNG reset backoff của blocked-on-auth (sóng chập chờn không đập refresh); vẫn thử khi backoff auth đã hết', async () => {
    const storage = createMemoryStorage();
    let clock = 0;
    const now = () => clock;
    const send = jest.fn(async () => {
      throw new MobileCoreError('net/auth-transient', 'refresh 503', { retryable: true });
    });
    const outbox = createSyncOutbox({ storage, send, now });

    await outbox.enqueue('t', { a: 1 });
    await outbox.drain(); // → blocked-on-auth, nextAttemptAt = 0 + 5000
    expect(send).toHaveBeenCalledTimes(1);
    let snap = await outbox.getSnapshot();
    expect(snap[0].status).toBe('blocked-on-auth');
    expect(snap[0].nextAttemptAt).toBe(5_000);

    // NetInfo reconnect liên tục khi backoff auth CHƯA hết → KHÔNG được thử sớm.
    for (const tick of [50, 100, 1_000, 4_999]) {
      clock = tick;
      await outbox.drainNow();
      expect(send).toHaveBeenCalledTimes(1); // vẫn 1 — không hammer refresh
      snap = await outbox.getSnapshot();
      expect(snap[0].nextAttemptAt).toBe(5_000); // backoff KHÔNG bị reset về now
    }

    // Khi backoff auth đã hết → drain/drainNow mới thử lại bình thường.
    clock = 5_000;
    await outbox.drainNow();
    expect(send).toHaveBeenCalledTimes(2);
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
