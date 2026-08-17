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
 *
 * Hợp đồng net↔sync về AUTH (tên mã lỗi CỐ ĐỊNH, khớp l0/errors.ts):
 *  - send() ném MobileCoreError `net/auth-transient` (refresh chết TẠM THỜI:
 *    5xx/mạng lúc refresh) → item vào trạng thái **'blocked-on-auth'**: KHÔNG
 *    bump retryCount, KHÔNG tính MAX_RETRY, KHÔNG dead-letter (chống mất dữ
 *    liệu nông dân offline). Có backoff RIÊNG (authBlockCount) để không gọi dồn
 *    dập endpoint đang hỏng-tạm-thời. Thoát trạng thái khi: (a) `unblockAuth()`
 *    (tầng trên báo auth phục hồi) → về 'pending' ngay; HOẶC (b) hết cửa sổ
 *    backoff → drain tự thử lại send(): thành công → xoá; lại auth-transient →
 *    quay lại 'blocked-on-auth' (backoff tăng); lỗi khác → nhánh retry/terminal.
 *  - send() ném `net/unauthorized` (phiên THẬT hết) → item vào **'auth-expired'**:
 *    TERMINAL cho pipeline tự động (drain KHÔNG tự thử lại — tránh spam 401),
 *    NHƯNG KHÔNG âm thầm dead-letter/huỷ dữ liệu — giữ nguyên item + surface qua
 *    `onItemStatus(id,'auth-expired')` cho tầng trên (Redux → prompt re-login).
 *    Sau khi user đăng nhập lại, tầng trên gọi `unblockAuth()` → về 'pending'.
 *
 * Idempotency (council chốt: CSPRNG chuyển từ net sang sync): id sinh mặc định
 * bằng CSPRNG `globalThis.crypto.randomUUID()` (KHÔNG Math.random), injectable
 * qua `genId` để test deterministic. 1 id DÙNG CHUNG cho cả `transactionId` LẪN
 * `idempotencyKey`. Contract server: server scope idempotency theo auth-subject.
 *
 * ⚠️ Idempotency NGHIỆP-VỤ THẬT (chống double-submit khi app crash SAU enqueue
 * nhưng TRƯỚC khi tầng trên kịp lưu id, rồi user bấm lại) đòi CALLER truyền
 * `transactionId` BỀN — derive tất định từ chính hành động user (vd hash của
 * {userId, formId, nội dung}) — KHÔNG dựa vào `genId` của sync. Lý do: genId chỉ
 * là FALLBACK cho trường hợp caller không có id nghiệp vụ; mỗi lần enqueue lại
 * genId sinh id MỚI → 2 lần bấm = 2 bản ghi khác id = double-submit. Khi caller
 * truyền transactionId ổn định, lần enqueue thứ 2 trùng id → guard coi là trùng,
 * bỏ bản thứ 2 (đúng ý). BẮT BUỘC genId dùng CSPRNG: nếu genId yếu (đụng id) thì
 * 2 hành động KHÁC nhau vô tình trùng id → enqueue coi là trùng → bản ghi thứ 2
 * bị BỎ LẶNG (mất write). Đó là lý do default khoá cứng CSPRNG, cấm Math.random.
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
/** TTL mặc định cho dead-letter trước khi drain() purge (7 ngày). */
export const DEAD_LETTER_TTL_MS = 7 * 24 * 60 * 60_000;

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

/**
 * Trạng thái item outbox:
 *  - 'pending'         : chờ gửi (hoặc chờ hết backoff).
 *  - 'sending'         : đang gửi (đọc lại được lúc drain = orphan phiên trước).
 *  - 'blocked-on-auth' : refresh chết TẠM THỜI (net/auth-transient) — giữ dữ
 *    liệu, backoff riêng, drain tự thử lại + unblockAuth() resume.
 *  - 'auth-expired'    : phiên THẬT hết (net/unauthorized) — giữ dữ liệu, KHÔNG
 *    tự thử lại; chỉ unblockAuth() (sau re-login) mới resume.
 *  - 'dead'            : dead-letter (lỗi vĩnh viễn / cạn retry).
 */
export type SyncItemStatus = 'pending' | 'sending' | 'blocked-on-auth' | 'auth-expired' | 'dead';

/** Trạng thái báo cho tầng UI (thêm 'sent' = gửi xong, item đã rời queue). */
export type SyncItemNotifyStatus = SyncItemStatus | 'sent';

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
  /**
   * Số lần liên tiếp bị 'blocked-on-auth' (net/auth-transient). Dùng RIÊNG cho
   * backoff của nhánh auth — TÁCH khỏi `retryCount` (auth-transient KHÔNG bump
   * retryCount, KHÔNG tính MAX_RETRY). Reset về 0 khi unblockAuth()/gửi thành công.
   */
  authBlockCount?: number;
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

/**
 * Bọc 1 hàm gọi-xuống-net thô thành `SendFn` ĐẢM BẢO `idempotencyKey` luôn
 * được ép = `item.idempotencyKey` trước khi tới net — không để lọt request
 * thiếu key (kể cả khi consumer vô tình bỏ/ghi đè). Consumer:
 *   const send = buildSyncSend((item, opts) =>
 *     client.request('/trees', { ...opts, method: 'POST', body: item.payload }));
 */
export function buildSyncSend<T = unknown>(request: SendFn<T>): SendFn<T> {
  return (item, requestOptions) =>
    request(item, { ...requestOptions, idempotencyKey: item.idempotencyKey });
}

/**
 * Sinh id mặc định = CSPRNG. Ưu tiên `crypto.randomUUID()`; fallback dựng UUID
 * v4 từ `crypto.getRandomValues`. TUYỆT ĐỐI KHÔNG Math.random. Thiếu cả hai →
 * ném lỗi rõ ràng (không âm thầm rơi về nguồn yếu → trùng id → mất write).
 */
export function defaultGenId(): string {
  // Type cấu trúc tối thiểu (tsconfig L0 KHÔNG nạp DOM lib nên không có `Crypto`).
  interface CryptoLike {
    randomUUID?: () => string;
    getRandomValues?: (array: Uint8Array) => Uint8Array;
  }
  const c: CryptoLike | undefined = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    /* eslint-disable no-bitwise */ // dựng UUID v4 buộc mask bit version/variant
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    /* eslint-enable no-bitwise */
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
  }
  throw new MobileCoreError(
    'sync/no-csprng',
    'CSPRNG unavailable: globalThis.crypto thiếu randomUUID/getRandomValues',
    { retryable: false },
  );
}

export interface SyncOutboxOptions<T = unknown> {
  /** Kho khoá-giá-trị bất đồng bộ — INJECT (SQLite/AsyncStorage do platform). */
  storage: KVStorage;
  /** Gửi 1 item xuống backend — INJECT (net sở hữu HTTP/auth/refresh thật). */
  send: SendFn<T>;
  /** Clock injectable — test dùng để điều khiển thời gian không cần fake timers thật. */
  now?: () => number;
  /**
   * Sinh id (dùng CHUNG cho transactionId + idempotencyKey) — INJECT để test
   * deterministic. Mặc định `defaultGenId` (CSPRNG). KHÔNG dùng Math.random.
   */
  genId?: () => string;
  maxRetry?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /**
   * TTL (ms) cho item 'dead': hết hạn thì drain() purge (xoá storage + index).
   * <=0 = giữ mãi (không purge). Mặc định 7 ngày — đủ để tầng trên surface/soi
   * dead-letter trước khi dọn.
   */
  deadLetterTtlMs?: number;
  /**
   * Callback báo đổi trạng thái từng item cho tầng UI (Redux consumer). Gọi khi
   * item chuyển 'sending'/'pending'/'blocked-on-auth'/'auth-expired'/'dead' và
   * 'sent' (gửi xong, đã rời queue). Lỗi trong callback được nuốt — không phá drain.
   */
  onItemStatus?: (id: string, status: SyncItemNotifyStatus) => void;
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
  /**
   * Tầng trên báo "auth đã phục hồi" (refresh xong / user re-login xong): chuyển
   * NGAY mọi item đang 'blocked-on-auth' HOẶC 'auth-expired' về 'pending'
   * (nextAttemptAt=now, reset authBlockCount) rồi drain() — giống drainNow nhưng
   * cho nhánh auth. Đây là TIÊU CHÍ THOÁT tường minh của 2 trạng thái auth.
   */
  unblockAuth(): Promise<void>;
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
    genId = defaultGenId,
    maxRetry = MAX_RETRY_COUNT,
    backoffBaseMs = BACKOFF_BASE_MS,
    backoffMaxMs = BACKOFF_MAX_MS,
    deadLetterTtlMs = DEAD_LETTER_TTL_MS,
    onItemStatus,
    storageKeyPrefix = 'sync',
  } = options;

  const indexKey = `${storageKeyPrefix}${INDEX_SUFFIX}`;
  const itemKey = (id: string): string => `${storageKeyPrefix}${ITEM_SUFFIX}${id}`;

  /** Báo trạng thái cho UI — nuốt lỗi callback để không phá vòng drain. */
  function notify(id: string, status: SyncItemNotifyStatus): void {
    if (!onItemStatus) return;
    try {
      onItemStatus(id, status);
    } catch {
      // callback consumer ném — không để lan ra phá durability/loop.
    }
  }

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
    // Guard chống trùng transactionId đang-xử-lý (chống mất write): nếu id được
    // chỉ định TRÙNG 1 item chưa 'dead' → KHÔNG ghi đè (giữ nguyên state đang
    // gửi / đang blocked), trả lại id cũ. Item 'dead' thì cho enqueue lại (hồi sinh).
    if (transactionId !== undefined) {
      const existing = await readItem(transactionId);
      if (existing && existing.status !== 'dead') {
        return existing.transactionId;
      }
    }

    // id CSPRNG (genId injectable, mặc định crypto.randomUUID) — DÙNG CHUNG cho
    // transactionId LẪN idempotencyKey (1 nguồn duy nhất, không lệch).
    const id = transactionId ?? genId();
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
        if (!item) {
          // Orphan-id: id còn trong index nhưng item đã biến mất khỏi storage
          // (xoá dở / storage bị dọn ngoài) → gỡ id khỏi index cho sạch.
          await removeFromIndex(id);
          continue;
        }

        if (item.status === 'dead') {
          // Dead-letter: giữ trong index, không retry. Purge sau TTL để queue
          // không phình mãi (tầng trên đã có cửa sổ surface/soi trước đó).
          if (deadLetterTtlMs > 0 && now() - item.updatedAt >= deadLetterTtlMs) {
            await storage.removeItem(itemKey(id));
            await removeFromIndex(id);
          }
          continue;
        }

        // 'auth-expired' (phiên THẬT hết): TERMINAL cho pipeline tự động — drain
        // KHÔNG tự thử lại (tránh spam 401). Chỉ unblockAuth() (sau re-login)
        // mới đưa về 'pending'. Dữ liệu vẫn giữ nguyên trong queue.
        if (item.status === 'auth-expired') continue;

        const t = now();
        if (item.nextAttemptAt > t) continue; // còn trong cửa sổ backoff — bỏ qua vòng này

        // Tới đây: 'pending' | orphan 'sending' | 'blocked-on-auth' đã hết
        // backoff. Đều thử gửi lại — an toàn vì isProcessing chống chồng lượt.
        item.status = 'sending';
        item.updatedAt = now();
        await writeItem(item);
        notify(id, 'sending');

        // Dựng HttpRequestOptions MANG idempotencyKey rồi trao cho net (gap 2
        // đóng end-to-end: consumer spread requestOptions vào client.request).
        const requestOptions: HttpRequestOptions = { idempotencyKey: item.idempotencyKey };

        try {
          await send(item, requestOptions);
          // Thành công → xoá item + gỡ id khỏi index (atomic, chỉ id này).
          await storage.removeItem(itemKey(id));
          await removeFromIndex(id);
          notify(id, 'sent');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);

          // RE-READ chống lost-update (adversary re-attack #1): item KHÔNG có
          // lock/version per-record. Giữa read→set-'sending'→send()(inflight
          // vài giây)→catch, tầng trên có thể đã ghi đè item qua storage — vd
          // unblockAuth() reset về 'pending'/authBlockCount=0. Nếu ta ghi state
          // mới tính từ bản CŨ trong bộ nhớ (item), reset đó bị XOÁ lặng lẽ.
          // Sửa: đọc lại bản mới nhất; nếu item KHÔNG còn 'sending' (ai đó đã cố
          // ý chuyển trạng thái) hoặc đã biến mất → TÔN TRỌNG bản mới, bỏ qua,
          // KHÔNG ghi đè. Nếu vẫn 'sending' (không ai đụng) → tính state mới từ
          // `cur` (không phải `item` cũ) để mọi field bám bản đã persist.
          const cur = await readItem(id);
          if (!cur || cur.status !== 'sending') continue;

          // ── Nhánh AUTH-TRANSIENT: refresh chết TẠM THỜI → 'blocked-on-auth' ──
          // KHÔNG bump retryCount, KHÔNG tính MAX_RETRY, KHÔNG dead-letter (chống
          // mất write của nông dân offline). Có backoff RIÊNG (authBlockCount).
          if (isMobileCoreError(err) && err.code === 'net/auth-transient') {
            const authBlockCount = (cur.authBlockCount ?? 0) + 1;
            cur.status = 'blocked-on-auth';
            cur.authBlockCount = authBlockCount;
            cur.nextAttemptAt =
              now() + computeBackoffMs(authBlockCount - 1, backoffBaseMs, backoffMaxMs);
            cur.lastError = message;
            cur.updatedAt = now();
            await writeItem(cur);
            notify(id, 'blocked-on-auth');
            continue;
          }

          // ── Nhánh AUTH-EXPIRED: phiên THẬT hết → 'auth-expired' (terminal tự
          // động, KHÔNG dead-letter). Giữ dữ liệu + surface cho tầng trên re-login.
          if (isMobileCoreError(err) && err.code === 'net/unauthorized') {
            cur.status = 'auth-expired';
            cur.lastError = message;
            cur.updatedAt = now();
            await writeItem(cur);
            notify(id, 'auth-expired');
            continue;
          }

          const retryable = isRetryableError(err);
          const nextRetryCount = cur.retryCount + 1;

          if (!retryable) {
            cur.status = 'dead';
            cur.deadLetterCode = 'sync/permanent';
            cur.lastError = message;
            cur.retryCount = nextRetryCount;
            cur.updatedAt = now();
            await writeItem(cur); // id vẫn nằm sẵn trong index, không ghi index
            notify(id, 'dead');
            continue;
          }

          if (nextRetryCount >= maxRetry) {
            cur.status = 'dead';
            cur.deadLetterCode = 'sync/retry-exhausted';
            cur.lastError = message;
            cur.retryCount = nextRetryCount;
            cur.updatedAt = now();
            await writeItem(cur);
            notify(id, 'dead');
            continue;
          }

          cur.status = 'pending';
          cur.retryCount = nextRetryCount;
          cur.nextAttemptAt = now() + computeBackoffMs(nextRetryCount - 1, backoffBaseMs, backoffMaxMs);
          cur.lastError = message;
          cur.updatedAt = now();
          await writeItem(cur);
          notify(id, 'pending');
        }
      }
    } finally {
      isProcessing = false;
    }
  }

  async function drainNow(): Promise<void> {
    // Mạng vừa phục hồi (NetInfo reconnect) → xoá cửa sổ backoff MẠNG để thử
    // NGAY. CHỈ áp cho 'pending' (backoff sau lỗi 5xx/timeout) và orphan 'sending'.
    // TUYỆT ĐỐI KHÔNG đụng backoff của:
    //  - 'blocked-on-auth' (adversary re-attack #2): vùng sóng yếu nông thôn
    //    bật/tắt NetInfo liên tục → mỗi reconnect reset nextAttemptAt=now sẽ gọi
    //    lại refresh ngay, phá đúng mục đích chống-hammer của authBlockCount.
    //    Tôn trọng nextAttemptAt hiện có; drain() chỉ thử khi backoff auth đã hết.
    //  - 'auth-expired' (phiên thật hết — mạng phục hồi không cứu được, cần re-login).
    //  - 'dead'.
    // unblockAuth() là API reset tường minh DUY NHẤT cho nhánh auth.
    const ids = await readIndex();
    const t = now();
    for (const id of ids) {
      const item = await readItem(id);
      if (
        item &&
        (item.status === 'pending' || item.status === 'sending') &&
        item.nextAttemptAt > t
      ) {
        item.nextAttemptAt = t;
        await writeItem(item);
      }
    }
    await drain();
  }

  async function unblockAuth(): Promise<void> {
    // Tầng trên báo auth đã phục hồi → mọi item đang chờ auth
    // ('blocked-on-auth' | 'auth-expired') về 'pending' ngay (reset backoff auth),
    // rồi drain(). Đây là tiêu chí thoát tường minh của 2 trạng thái auth.
    const ids = await readIndex();
    const t = now();
    for (const id of ids) {
      const item = await readItem(id);
      if (item && (item.status === 'blocked-on-auth' || item.status === 'auth-expired')) {
        item.status = 'pending';
        item.nextAttemptAt = t;
        item.authBlockCount = 0;
        item.updatedAt = t;
        await writeItem(item);
        notify(id, 'pending');
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

  return { enqueue, drain, drainNow, unblockAuth, getSnapshot };
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
