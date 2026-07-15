/**
 * MobileCore l0/sync — outbox bền (durable), backoff luỹ thừa, dead-letter,
 * dedup (TTL + địa lý) cho ghi offline-first.
 *
 * Ranh giới (council-gate): sync CHỈ lo durability/thứ-tự/dedup/idempotency +
 * LỊCH retry. Transport/HTTP/refresh token là việc của `net` — sync gọi
 * xuống qua callback `send()` được INJECT, KHÔNG tự làm HTTP.
 *
 * Harvest nguồn (branch claude/orilife-farm-sync-enroll-gate):
 *  - src/services/syncService.ts   → vòng lặp drain, backoff, re-entrancy,
 *    orphan 'sending' recovery, dead-letter sau MAX_RETRY, drainNow().
 *  - src/services/syncDispatch.ts  → isRetryableError (4xx≠408/429 không retry).
 *  - src/services/treeDedupCache.ts→ dedup cache TTL + khoảng cách địa lý.
 * BỎ khỏi bản port: mọi phần đụng SQLite/AsyncStorage/Redux/axios thật (đó là
 * app-layer cụ thể của OriLife) — thay bằng `KVStorage` injectable + callback
 * `send` injectable, giữ nguyên các con số/luật nghiệp vụ đã xác minh field.
 */

import type { KVStorage, HttpResponse, HttpRequestOptions, LatLng } from '../types';
import { MobileCoreError, isMobileCoreError, type MobileCoreErrorCode } from '../errors';
import { haversineDistance } from '../geo';

// ─────────────────────────────────────────────────────────────────────────
// Retry / backoff policy (khớp syncService.ts: BASE=5s, MAX=5min, MAX_RETRY=5)
// ─────────────────────────────────────────────────────────────────────────

export const MAX_RETRY_COUNT = 5;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000; // 5 phút

/** Backoff luỹ thừa: base * 2^retryCount, chặn trên ở maxMs. */
export function computeBackoffMs(
  retryCount: number,
  baseMs: number = BACKOFF_BASE_MS,
  maxMs: number = BACKOFF_MAX_MS,
): number {
  return Math.min(baseMs * 2 ** retryCount, maxMs);
}

/**
 * Phân loại lỗi gửi → có nên retry không.
 *  - `MobileCoreError` (net ném ra): tin thẳng field `retryable` đã được net
 *    phân loại (net/timeout, net/server, net/rate-limited → true; net/validation,
 *    net/unauthorized (sau refresh thất bại) → false).
 *  - Lỗi thô có `status`/`response.status` (fallback khi send() ném lỗi không
 *    bọc MobileCoreError): 408/429/5xx → retry; 4xx khác → KHÔNG retry.
 *  - Không rõ dạng (lỗi mạng/timeout không có status) → retry (an toàn hơn).
 */
export function isRetryableError(error: unknown): boolean {
  if (isMobileCoreError(error)) return error.retryable;
  const status: unknown =
    (error as { status?: unknown })?.status ??
    (error as { response?: { status?: unknown } })?.response?.status;
  if (typeof status === 'number') {
    if (status === 408 || status === 429) return true;
    if (status >= 500) return true;
    if (status >= 400) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Outbox — queue bền trên KVStorage injected
// ─────────────────────────────────────────────────────────────────────────

export type SyncItemStatus = 'pending' | 'sending' | 'dead';

/** Mã dead-letter — khớp `MobileCoreErrorCode` (nhóm sync/*, l0/errors.ts). */
export type DeadLetterCode = Extract<MobileCoreErrorCode, 'sync/permanent' | 'sync/retry-exhausted'>;

export interface SyncQueueItem<T = unknown> {
  /** ID nghiệp vụ, sinh 1 lần lúc enqueue — cũng dùng làm `idempotencyKey`. */
  transactionId: string;
  /** === transactionId. sync KHÔNG chỉ gắn field này lên item mà còn tự dựng
   * `HttpRequestOptions` (đã set `idempotencyKey`) rồi trao cho callback `send`
   * (tham số thứ 2) — buộc key phải nối tới `net` (council gap 2: net trước đây
   * THIẾU idempotency key; nay đường nối được đóng end-to-end, consumer chỉ việc
   * spread `requestOptions` vào `client.request`). */
  idempotencyKey: string;
  type: string;
  payload: T;
  status: SyncItemStatus;
  retryCount: number;
  /** epoch ms — chưa tới thì `drain()` bỏ qua vòng này (backoff window). */
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  /** Gắn khi status chuyển 'dead'. */
  deadLetterCode?: DeadLetterCode;
}

/**
 * Callback gửi 1 item xuống backend — net sở hữu transport/auth/refresh thật.
 * sync trao 2 tham số:
 *  - `item`          : item outbox (payload + metadata).
 *  - `requestOptions`: `HttpRequestOptions` ĐÃ có `idempotencyKey` (= item.idempotencyKey).
 * Consumer chỉ việc: `client.request(path, { ...requestOptions, method, body: item.payload })`
 * → header `Idempotency-Key` chắc chắn tới server, retry KHÔNG tạo ghi trùng.
 */
export type SendFn<T = unknown> = (
  item: SyncQueueItem<T>,
  requestOptions: HttpRequestOptions,
) => Promise<HttpResponse>;

export interface SyncOutboxOptions<T = unknown> {
  /** Kho khoá-giá-trị bất đồng bộ — INJECT (SQLite/AsyncStorage do platform). */
  storage: KVStorage;
  /** Gửi 1 item xuống backend — INJECT (net sở hữu HTTP/auth/refresh thật). */
  send: SendFn<T>;
  /** Clock injectable — test dùng để điều khiển thời gian không cần fake timers thật. */
  now?: () => number;
  maxRetry?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Tiền tố khoá lưu trữ — đổi khi cần nhiều outbox độc lập trên cùng storage. */
  storageKeyPrefix?: string;
}

export interface SyncOutbox<T = unknown> {
  /** Thêm item vào outbox, trả `transactionId` (dùng làm idempotencyKey). */
  enqueue(type: string, payload: T, transactionId?: string): Promise<string>;
  /**
   * 1 vòng xử lý: tôn trọng backoff window (`nextAttemptAt`). Item còn ở
   * 'sending' từ phiên trước (app bị kill giữa lúc gửi) được coi là orphan và
   * xử lý lại y như 'pending' — KHÔNG có bước phục hồi riêng, vì lần drain kế
   * tiếp (restart) tự nhiên gặp lại nó trong index. Re-entrancy guard: gọi
   * chồng khi đang chạy → no-op.
   */
  drain(): Promise<void>;
  /**
   * Dùng khi mạng vừa phục hồi (NetInfo reconnect...): xoá backoff window của
   * mọi item đang chờ rồi `drain()` ngay, không chờ tới lượt định kỳ.
   */
  drainNow(): Promise<void>;
  /** Trạng thái hiện tại của toàn bộ queue — chủ yếu phục vụ test/inspect. */
  getSnapshot(): Promise<SyncQueueItem<T>[]>;
}

const INDEX_SUFFIX = ':queue:index';
const ITEM_SUFFIX = ':queue:item:';

export function createSyncOutbox<T = unknown>(options: SyncOutboxOptions<T>): SyncOutbox<T> {
  const {
    storage,
    send,
    now = () => Date.now(),
    maxRetry = MAX_RETRY_COUNT,
    backoffBaseMs = BACKOFF_BASE_MS,
    backoffMaxMs = BACKOFF_MAX_MS,
    storageKeyPrefix = 'sync',
  } = options;

  const indexKey = `${storageKeyPrefix}${INDEX_SUFFIX}`;
  const itemKey = (id: string): string => `${storageKeyPrefix}${ITEM_SUFFIX}${id}`;

  // P1-2 (khớp syncService.isProcessing): chống re-entrancy — 2 lời gọi
  // drain chồng nhau (interval + drainNow reconnect) có thể gửi trùng item
  // khi API chậm. Cờ in-memory này khoá lại; KHÔNG cần bền qua restart vì
  // restart tự có isProcessing=false mới.
  let isProcessing = false;

  // ── Async-mutex cho MỌI read-modify-write trên blob `index` ──────────────
  // Adversary red-team #1 (lost-update race): `isProcessing` chỉ chặn
  // drain↔drain, KHÔNG chặn enqueue↔drain. Trước đây drain đọc index rồi ghi
  // đè trọn `remainingIds` ở cuối → item enqueue chen vào giữa (append B) bị
  // clobber, nằm trên storage nhưng mất khỏi index vĩnh viễn (không drain,
  // không getSnapshot). Sửa 2 lớp:
  //   (a) mutex promise-chain serialize mọi append/remove index (dưới đây);
  //   (b) drain KHÔNG còn ghi đè trọn index — chỉ XOÁ đúng id vừa gửi xong qua
  //       `removeFromIndex` (atomic). Item còn lại (pending/dead) vẫn nằm sẵn
  //       trong index, không cần ghi. → append của enqueue không bao giờ mất.
  let indexLock: Promise<void> = Promise.resolve();
  function withIndexLock<R>(fn: () => Promise<R>): Promise<R> {
    const run = indexLock.then(fn, fn);
    // Nối chuỗi bất kể fn thành công hay ném — lock không bao giờ kẹt.
    indexLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readIndex(): Promise<string[]> {
    const raw = await storage.getItem(indexKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  async function writeIndex(ids: string[]): Promise<void> {
    await storage.setItem(indexKey, JSON.stringify(ids));
  }

  /** Append id vào index — atomic dưới mutex (không mất khi drain chạy song song). */
  async function appendToIndex(id: string): Promise<void> {
    await withIndexLock(async () => {
      const ids = await readIndex();
      if (!ids.includes(id)) {
        ids.push(id);
        await writeIndex(ids);
      }
    });
  }

  /** Xoá đúng 1 id khỏi index — atomic dưới mutex; giữ nguyên các id khác. */
  async function removeFromIndex(id: string): Promise<void> {
    await withIndexLock(async () => {
      const ids = await readIndex();
      const next = ids.filter((x) => x !== id);
      if (next.length !== ids.length) {
        await writeIndex(next);
      }
    });
  }

  async function readItem(id: string): Promise<SyncQueueItem<T> | null> {
    const raw = await storage.getItem(itemKey(id));
    return raw ? (JSON.parse(raw) as SyncQueueItem<T>) : null;
  }

  async function writeItem(item: SyncQueueItem<T>): Promise<void> {
    await storage.setItem(itemKey(item.transactionId), JSON.stringify(item));
  }

  async function enqueue(type: string, payload: T, transactionId?: string): Promise<string> {
    const id = transactionId ?? `${type}_${now()}_${Math.random().toString(36).slice(2, 9)}`;
    const t = now();
    const item: SyncQueueItem<T> = {
      transactionId: id,
      idempotencyKey: id,
      type,
      payload,
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: t,
      createdAt: t,
      updatedAt: t,
    };
    await writeItem(item);
    await appendToIndex(id); // atomic — an toàn kể cả khi drain đang chạy
    return id;
  }

  async function drain(): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;
    try {
      // Chỉ đọc SNAPSHOT id để duyệt. KHÔNG ghi đè trọn index ở cuối nữa —
      // item mới enqueue chen vào giữa vòng chỉ đơn giản không nằm trong
      // snapshot này (vòng drain kế tiếp nhặt), và KHÔNG bao giờ bị xoá nhầm.
      const ids = await readIndex();

      for (const id of ids) {
        const item = await readItem(id);
        if (!item) continue; // đã bị xoá (thành công) giữa chừng

        if (item.status === 'dead') continue; // dead-letter: giữ trong index, không retry

        const t = now();
        if (item.nextAttemptAt > t) continue; // còn trong cửa sổ backoff — bỏ qua vòng này

        // Item 'pending' HOẶC orphan 'sending' (app bị kill giữa lúc gửi lần
        // trước) đều tới đây và được thử lại — không phân biệt, an toàn vì
        // isProcessing chống chồng lượt trong-phiên nên mọi 'sending' đọc
        // được ở đầu vòng chắc chắn là orphan từ phiên trước.
        item.status = 'sending';
        item.updatedAt = now();
        await writeItem(item);

        // Dựng HttpRequestOptions MANG idempotencyKey rồi trao cho net (gap 2
        // đóng end-to-end: consumer spread requestOptions vào client.request).
        const requestOptions: HttpRequestOptions = { idempotencyKey: item.idempotencyKey };

        try {
          await send(item, requestOptions);
          // Thành công → xoá item + gỡ id khỏi index (atomic, chỉ id này).
          await storage.removeItem(itemKey(id));
          await removeFromIndex(id);
        } catch (err) {
          const retryable = isRetryableError(err);
          const nextRetryCount = item.retryCount + 1;
          const message = err instanceof Error ? err.message : String(err);

          if (!retryable) {
            item.status = 'dead';
            item.deadLetterCode = 'sync/permanent';
            item.lastError = message;
            item.retryCount = nextRetryCount;
            item.updatedAt = now();
            await writeItem(item); // id vẫn nằm sẵn trong index, không ghi index
            continue;
          }

          if (nextRetryCount >= maxRetry) {
            item.status = 'dead';
            item.deadLetterCode = 'sync/retry-exhausted';
            item.lastError = message;
            item.retryCount = nextRetryCount;
            item.updatedAt = now();
            await writeItem(item);
            continue;
          }

          item.status = 'pending';
          item.retryCount = nextRetryCount;
          item.nextAttemptAt = now() + computeBackoffMs(nextRetryCount - 1, backoffBaseMs, backoffMaxMs);
          item.lastError = message;
          item.updatedAt = now();
          await writeItem(item);
        }
      }
    } finally {
      isProcessing = false;
    }
  }

  async function drainNow(): Promise<void> {
    // Mạng vừa phục hồi → xoá cửa sổ backoff của mọi item chưa dead, thử ngay.
    const ids = await readIndex();
    const t = now();
    for (const id of ids) {
      const item = await readItem(id);
      if (item && item.status !== 'dead' && item.nextAttemptAt > t) {
        item.nextAttemptAt = t;
        await writeItem(item);
      }
    }
    await drain();
  }

  async function getSnapshot(): Promise<SyncQueueItem<T>[]> {
    const ids = await readIndex();
    const items: SyncQueueItem<T>[] = [];
    for (const id of ids) {
      const item = await readItem(id);
      if (item) items.push(item);
    }
    return items;
  }

  return { enqueue, drain, drainNow, getSnapshot };
}

// ─────────────────────────────────────────────────────────────────────────
// Dedup cache — TTL + khoảng cách địa lý (harvest treeDedupCache.ts, tổng
// quát hoá khỏi domain "cây/farm": groupId thay farmId, id thay treeId).
// ─────────────────────────────────────────────────────────────────────────

/** Cấu hình khớp Build 58 (field test 2026-05): window 5 phút, 8m, TTL 30 ngày. */
const DEDUP_WINDOW_MS = 5 * 60_000;
const DEDUP_DISTANCE_M = 8;
const DEDUP_EXPIRY_MS = 30 * 24 * 60 * 60_000;
const DEDUP_MAX_PER_GROUP = 100;

interface DedupEntry {
  id: string;
  location: LatLng;
  capturedAt: number;
}

export type DedupCheckResult =
  | { duplicate: true; matchedId: string; distanceM: number; ageMs: number }
  | { duplicate: false };

export interface DedupCacheOptions {
  /** Kho khoá-giá-trị bất đồng bộ — INJECT. */
  storage: KVStorage;
  now?: () => number;
  /** Cửa sổ thời gian coi là "gần đây" (ms). Mặc định 5 phút. */
  windowMs?: number;
  /** Ngưỡng khoảng cách coi là trùng (mét). Mặc định 8m. */
  distanceM?: number;
  /** TTL — entry cũ hơn bị lọc bỏ khi `load()`. Mặc định 30 ngày. */
  expiryMs?: number;
  /** Giữ tối đa N entry gần nhất mỗi group. Mặc định 100. */
  maxPerGroup?: number;
  storageKey?: string;
}

export interface DedupCache {
  /** Nạp cache từ storage (idempotent — gọi nhiều lần chỉ load 1 lần). */
  load(): Promise<void>;
  /**
   * Check xem `location` có khả năng trùng 1 entry đã ghi gần đây (cùng
   * group, trong window, trong bán kính distanceM) không. Trước khi `load()`
   * xong → trả `duplicate:false` (an toàn, không block caller).
   */
  check(groupId: string, location: LatLng, at?: number): DedupCheckResult;
  /** Ghi 1 lần quan sát mới — cùng `id` trong group sẽ ghi đè entry cũ. */
  record(id: string, groupId: string, location: LatLng, at?: number): Promise<void>;
  clear(): Promise<void>;
}

export function createDedupCache(options: DedupCacheOptions): DedupCache {
  const {
    storage,
    now = () => Date.now(),
    windowMs = DEDUP_WINDOW_MS,
    distanceM = DEDUP_DISTANCE_M,
    expiryMs = DEDUP_EXPIRY_MS,
    maxPerGroup = DEDUP_MAX_PER_GROUP,
    storageKey = 'sync:dedup:v1',
  } = options;

  let cache: Record<string, DedupEntry[]> = {};
  let loaded = false;
  let loadPromise: Promise<void> | null = null;

  async function load(): Promise<void> {
    if (loaded) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const raw = await storage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, DedupEntry[]>;
          const cutoff = now() - expiryMs;
          const fresh: Record<string, DedupEntry[]> = {};
          for (const [groupId, entries] of Object.entries(parsed)) {
            const kept = entries.filter((e) => e.capturedAt >= cutoff);
            if (kept.length > 0) fresh[groupId] = kept;
          }
          cache = fresh;
        }
      } catch {
        // Storage hỏng/JSON lỗi — bắt đầu rỗng, không crash caller.
        cache = {};
      } finally {
        loaded = true;
      }
    })();
    return loadPromise;
  }

  async function persist(): Promise<void> {
    await storage.setItem(storageKey, JSON.stringify(cache));
  }

  function check(groupId: string, location: LatLng, at: number = now()): DedupCheckResult {
    if (!loaded) return { duplicate: false };

    // GPS hỏng (Null Island hoặc 1 trục =0, hoặc ngoài dải hợp lệ) — không dedup được.
    if (
      location.lat === 0 ||
      location.lng === 0 ||
      Math.abs(location.lat) > 90 ||
      Math.abs(location.lng) > 180
    ) {
      return { duplicate: false };
    }

    const entries = cache[groupId];
    if (!entries || entries.length === 0) return { duplicate: false };

    let best: { entry: DedupEntry; distance: number } | null = null;
    for (const entry of entries) {
      const ageMs = at - entry.capturedAt;
      if (ageMs > windowMs || ageMs < 0) continue;
      const distance = haversineDistance(entry.location, location);
      if (distance > distanceM) continue;
      if (!best || distance < best.distance) best = { entry, distance };
    }

    if (!best) return { duplicate: false };
    return {
      duplicate: true,
      matchedId: best.entry.id,
      distanceM: best.distance,
      ageMs: at - best.entry.capturedAt,
    };
  }

  async function record(id: string, groupId: string, location: LatLng, at: number = now()): Promise<void> {
    if (!loaded) await load();
    const entry: DedupEntry = { id, location, capturedAt: at };
    const existing = cache[groupId] ?? [];
    const idx = existing.findIndex((e) => e.id === id);
    if (idx >= 0) existing[idx] = entry;
    else existing.push(entry);
    existing.sort((a, b) => b.capturedAt - a.capturedAt);
    cache[groupId] = existing.slice(0, maxPerGroup);
    await persist();
  }

  async function clear(): Promise<void> {
    cache = {};
    await storage.removeItem(storageKey);
  }

  return { load, check, record, clear };
}
