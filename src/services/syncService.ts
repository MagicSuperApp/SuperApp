// services/syncService.ts

import { store } from '../store';
import { updateSyncStatus, removeFromSyncQueue, loadSyncQueue } from '../store/syncSlice';
import { database } from '../utils/database';
import { classifySyncItem, classifySyncFailure } from './syncDispatch';
import {
  NEEDS_ATTENTION_PREFIX,
  countRetriable,
  type SyncAttemptClass,
  type SyncQueueDiagnostic,
  type SyncRetryOutcome,
  type SyncRetryAllOutcome,
} from './syncQueueStatus';
import { ensureOrilifeToken } from './orilifeDidAuth';
import { ORILIFE_BASE } from './orilifeBase';
import { showWarning } from '../utils/alert';

// Hết số lần thử này thì item HẠ NHỊP thử xuống mức thấp nhất (xem nhánh chạm
// trần trong `handleSyncFailure`). Nó KHÔNG còn bị đánh dấu 'error' nữa: 'error'
// không nằm trong bộ lọc của `processSyncQueue`, nên nhãn đó là xoá vĩnh viễn chứ
// không phải "tạm ngừng".
//
// ⚠ Trần này CHỈ đếm hạng `retryable`. Mất mạng (`offline`), phiên hết hạn (`auth`)
// và điều kiện máy chủ chưa thoả (`blocked`) KHÔNG đếm vào đây: đếm chúng là quay
// lại đúng lỗi cũ, chỉ chậm hơn năm lượt.
export const MAX_RETRY_COUNT = 5;
/**
 * Gắn trước `errorCode` khi một mục đã quá trần. Mục vẫn sống và vẫn tự thử, chỉ
 * là ở nhịp thấp nhất — nhãn này để màn hàng đợi (`screens/SyncQueueScreen.tsx`)
 * lọc ra được ngay, và để nhật ký dev phân biệt "đang chờ bình thường" với "chờ
 * đã quá lâu".
 *
 * Định nghĩa đã dời sang `syncQueueStatus.ts` — tệp LÁ mà màn hình nhập được mà
 * không kéo theo store + CSDL. Xuất lại nguyên tên ở đây để mọi chỗ gọi cũ giữ
 * nguyên MỘT đường nhập.
 */
export { NEEDS_ATTENTION_PREFIX } from './syncQueueStatus';
export type {
  SyncQueueDiagnostic,
  SyncRetryOutcome,
  SyncRetryAllOutcome,
} from './syncQueueStatus';
// Backoff luỹ thừa, chặn trên để không chờ quá lâu giữa các lần thử.
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000; // 5 phút
// Vừa ký lại phiên xong thì thử lại sớm — không bắt người dùng chờ 5 phút cho một
// thứ đã sửa xong.
const AUTH_RETRY_BACKOFF_MS = 10_000;

/**
 * Câu người dùng đọc khi phiên hết hạn mà ký lại không được.
 *
 * Phải nói ĐỦ HAI vế: chưa gửi được, VÀ dữ liệu còn nguyên. Thiếu vế sau thì nông
 * dân tưởng mất công rồi ghi lại lần nữa — thành hai bản ghi cho một việc.
 */
const AUTH_BLOCKED_TITLE = 'Chưa gửi được nhật ký';
const AUTH_BLOCKED_BODY =
  'Phiên đăng nhập đã hết hạn nên nhật ký đồng áng còn nằm trong máy, chưa lên máy chủ. ' +
  'Hãy đăng nhập lại để gửi tiếp — dữ liệu KHÔNG mất.';

interface RetryState {
  count: number;
  nextAttemptAt: number; // epoch ms — chưa tới thì bỏ qua vòng này
  /**
   * Hạng của lượt hỏng GẦN NHẤT.
   *
   * Không có trường này thì màn hàng đợi không phân biệt nổi "đang chờ sóng" với
   * "máy chủ đang bận": cả hai đều để mục ở `'pending'`, và `error_code` là câu
   * của máy chủ chứ không phải tên hạng. Hai tình trạng ấy gỡ bằng hai việc khác
   * nhau, nên gộp chúng vào một câu là chỉ sai đường cho người dùng.
   *
   * Sống trong bộ nhớ như phần còn lại của `RetryState` — mở lại app là mất, và
   * màn hình phải nói đúng điều đó thay vì trình nó như số liệu trọn đời.
   */
  lastFailure?: SyncAttemptClass;
}


class SyncService {
  private isRunning = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  // Theo dõi retry/backoff in-memory (schema sync_queue không có cột retry).
  // Mất khi app restart là chấp nhận được: item vẫn 'pending' trong DB nên sẽ
  // được thử lại sạch — KHÔNG mất dữ liệu.
  private retryState = new Map<string, RetryState>();
  // P1-2: chống re-entrancy — interval 30s và drainNow (mạng phục hồi) có thể
  // gọi processSyncQueue chồng nhau khi API chậm → gửi trùng. Cờ này khoá lại.
  private isProcessing = false;
  // Một vòng quét chỉ ký lại phiên MỘT lần, dù có 20 mục cùng dính 401. Ký lại là
  // thao tác sinh trắc — hỏi 20 lần liên tiếp là cách chắc chắn nhất để người dùng
  // bấm Huỷ và không bao giờ gỡ được.
  private authRefreshTriedThisPass = false;
  // Đã báo người dùng về chuyện phiên hết hạn trong ĐỢT này chưa. Đặt lại khi có
  // một mục gửi thành công (tức phiên đã sống lại).
  private authWarned = false;

  // P1-1: queue nạp từ SQLite trả raw row (cột snake_case `transaction_id`),
  // KHÔNG map camelCase. Đọc `item.transactionId` trực tiếp sẽ ra undefined →
  // removeFromSyncQueue(undefined) không xoá được item đã sync → gửi trùng vô
  // hạn. Chuẩn hoá về string id ở một chỗ duy nhất.
  private txIdOf(item: any): string {
    return item.transaction_id ?? item.transactionId;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('Sync service started');

    // Check sync queue every 30 seconds
    this.syncInterval = setInterval(() => {
      this.processSyncQueue();
    }, 30000);

    // Also check immediately
    this.processSyncQueue();
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log('Sync service stopped');
  }

  private async processSyncQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.authRefreshTriedThisPass = false;
    try {
      // Skip if database not initialized (user not logged in yet)
      if (!database.isInitialized()) {
        return;
      }

      // Get pending items from database.
      // Gồm cả 'sending' KẸT từ phiên trước: app bị kill giữa lúc gửi → item kẹt 'sending',
      // mà processSyncQueue luôn await xong từng item (isProcessing chống chồng) nên trong-phiên
      // KHÔNG bao giờ thấy 'sending' lúc bắt đầu vòng → mọi 'sending' ở đây là orphan, xử lý lại
      // an toàn (chống mất-đồng-bộ vĩnh viễn).
      const queue = await database.getSyncQueue();
      const pendingItems = queue.filter(item => item.status === 'pending' || item.status === 'sending');

      if (pendingItems.length === 0) {
        return;
      }

      const now = Date.now();
      // Bỏ qua item đang trong cửa sổ backoff (chưa tới giờ thử lại).
      const dueItems = pendingItems.filter((item) => {
        const rs = this.retryState.get(this.txIdOf(item));
        return !rs || rs.nextAttemptAt <= now;
      });

      if (dueItems.length === 0) {
        return;
      }

      console.log(`Processing ${dueItems.length} sync items`);

      for (const item of dueItems) {
        const txId = this.txIdOf(item);
        try {
          // Update status to sending
          store.dispatch(updateSyncStatus({
            transactionId: txId,
            status: 'sending'
          }));

          // Gọi API THẬT tới backend
          await this.syncItem(item);

          // Thành công → xoá khỏi queue + dọn retry state.
          //
          // PHẢI `await`: `removeFromSyncQueue` là một thunk ghi xuống SQLite. Bỏ
          // `await` thì vòng lặp chạy tiếp (và cả `processSyncQueue` kết thúc, cờ
          // `isProcessing` hạ) trong khi lệnh xoá còn đang bay — vòng quét sau đọc
          // lại CSDL thấy mục vẫn còn và gửi lần hai.
          const removal: any = await store.dispatch(removeFromSyncQueue(txId));
          // `createAsyncThunk` KHÔNG ném khi thân hỏng: nó trả một hành động
          // `…/rejected` mang `error`. Không soi chỗ này thì lần xoá hỏng im lặng
          // hoàn toàn — và mục đã tới máy chủ sẽ được gửi lại ở vòng sau.
          if (removal?.error) {
            console.error(
              `[SyncService] xoá ${txId} khỏi hàng đợi THẤT BẠI — vòng sau sẽ gửi lại mục đã tới máy chủ; ` +
              `chống trùng lúc này chỉ còn dựa vào client_event_id:`,
              removal.error,
            );
          }
          this.retryState.delete(txId);
          // Gửi được nghĩa là phiên đang sống → đợt cảnh báo cũ đã hết hiệu lực.
          this.authWarned = false;

        } catch (error: any) {
          await this.handleSyncFailure(item, error);
        }
      }
    } catch (error) {
      console.error('Error processing sync queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Đẩy MỘT item lên backend qua API thật (map type → endpoint trong
   * syncDispatch). Item chưa có contract (fruit/activity) → throw lỗi
   * NON-retryable đặc biệt để giữ trong queue mà không spam retry.
   */
  private async syncItem(item: any): Promise<void> {
    const envelope = JSON.parse(item.payload);
    // `transaction_id` đi kèm để cửa GHI không có khoá tự nhiên gửi được khoá
    // khử-trùng ổn định (xem `client_event_id` ở `syncDispatch`).
    const dispatch = classifySyncItem(envelope, this.txIdOf(item));

    if (dispatch.kind === 'unsupported') {
      const err: any = new Error(dispatch.reason);
      err.__unsupported = true; // đánh dấu: giữ queue, không retry, không chết
      throw err;
    }

    await dispatch.run();
  }

  /**
   * Ký lại phiên OriLife — dùng LẠI đúng đường mà 5 dịch vụ ReID đang dùng
   * (`treeReIDService._apiCall` 401 → `ensureOrilifeToken(base, {force:true})`),
   * KHÔNG dựng cơ chế thứ hai.
   *
   * Một vòng quét chỉ thử một lần: xem `authRefreshTriedThisPass`.
   */
  private async tryRefreshSession(): Promise<boolean> {
    if (this.authRefreshTriedThisPass) return false;
    this.authRefreshTriedThisPass = true;
    try {
      return await ensureOrilifeToken(ORILIFE_BASE, { force: true });
    } catch {
      // Ký hỏng (người dùng bấm Huỷ hộp sinh trắc, mất mạng giữa chừng…) là một
      // câu trả lời hợp lệ: chưa gỡ được. KHÔNG được để nó ném lên và biến thành
      // một lỗi khác hạng, vì hạng khác thì mục có thể bị giết.
      return false;
    }
  }

  /** Báo MỘT lần cho mỗi đợt phiên hết hạn — không dội hộp thoại mỗi 30 giây. */
  private warnAuthOnce(): void {
    if (this.authWarned) return;
    this.authWarned = true;
    showWarning(AUTH_BLOCKED_TITLE, AUTH_BLOCKED_BODY);
  }

  /**
   * Xử lý 1 lần sync thất bại — KHÔNG mất item.
   *  - unsupported (chưa có contract): đưa lại 'pending', backoff dài, KHÔNG
   *    tăng retry count → item nằm chờ contract, không bị đánh dấu chết.
   *  - `auth` (401, phiên hết hạn): ký lại rồi thử lại sớm. Ký lại không được thì
   *    mục vẫn 'pending' (SỐNG) và người dùng được báo. KHÔNG đếm lượt, KHÔNG chết.
   *  - `blocked` (403/404, điều kiện máy chủ chưa thoả): 'pending' + backoff dài,
   *    KHÔNG ký lại (ký lại không gỡ được), KHÔNG đếm lượt, KHÔNG chết.
   *  - `offline` (không có phản hồi HTTP nào): 'pending' + chờ dài, KHÔNG đếm
   *    lượt, KHÔNG chết. Gỡ bằng việc có sóng lại, không bằng việc thử thêm.
   *  - `retryable` (408/429/5xx): 'pending' + backoff luỹ thừa, tăng count tới
   *    MAX_RETRY_COUNT rồi hạ nhịp xuống mức thấp nhất — vẫn 'pending', vẫn sống.
   *  - `permanent` (400/422 payload sai): đánh dấu 'error' ngay — hạng DUY NHẤT
   *    được phép chết.
   */
  private async handleSyncFailure(item: any, error: any): Promise<void> {
    const txId = this.txIdOf(item);

    if (error?.__unsupported) {
      // Chưa có contract → giữ trong queue, thử lại sau (backoff dài cố định).
      // Log MỘT lần (lần đầu gặp, trước khi có retryState) để dev thấy queue đang chờ
      // contract, không kẹt âm thầm.
      if (!this.retryState.has(txId)) {
        console.warn(`[SyncService] ${txId} chưa có contract backend — giữ queue chờ: ${error.message}`);
      }
      this.retryState.set(txId, {
        count: this.retryState.get(txId)?.count ?? 0,
        nextAttemptAt: Date.now() + BACKOFF_MAX_MS,
        lastFailure: 'unsupported',
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode: error.message,
      }));
      return;
    }

    const failure = classifySyncFailure(error);
    const prev = this.retryState.get(txId)?.count ?? 0;
    const count = prev + 1;
    const errorCode = error?.message || 'Unknown error';

    // ── Phiên hết hạn ────────────────────────────────────────────────────────
    // Mục KHÔNG BAO GIỜ được chết vì lý do này: cái hỏng là phiên, không phải dữ
    // liệu. Giữ 'pending' để vòng sau quét lại, và KHÔNG tăng `count` — nếu tăng
    // thì sau 5 lượt nó lại rơi vào nhánh chết, tức lỗi cũ chỉ chậm đi 5 lượt.
    if (failure === 'auth') {
      const refreshed = await this.tryRefreshSession();
      if (!refreshed) this.warnAuthOnce();
      console.warn(`[SyncService] ${txId} phiên hết hạn (ký lại: ${refreshed ? 'được' : 'chưa được'}) — giữ hàng đợi`);
      this.retryState.set(txId, {
        count: prev,
        nextAttemptAt: Date.now() + (refreshed ? AUTH_RETRY_BACKOFF_MS : BACKOFF_MAX_MS),
        lastFailure: 'auth',
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode: refreshed ? errorCode : AUTH_BLOCKED_TITLE,
      }));
      return;
    }

    // ── Mất mạng (không có phản hồi HTTP nào) ────────────────────────────────
    // KHÔNG đếm lượt, KHÔNG BAO GIỜ chết. Cái hỏng là cái sóng, không phải dữ liệu
    // — và nó gỡ bằng một việc nằm ngoài tầm cả app lẫn máy chủ.
    //
    // Đây là chỗ đã mất dữ liệu đồng ruộng: mất sóng ba phút thì hẹn giờ 30 giây
    // tiêu hết 5 lượt, mục chuyển `'error'`, mà vòng quét chỉ nhặt
    // `'pending' | 'sending'` nên không đường nào hồi sinh — kể cả cài lại app.
    // `showWarning` chạy 0 lần. Nếp đúng đã có sẵn trong cùng thư mục:
    // `videoUploadQueue.flushVideoUploadQueue` gặp offline thì trả `skipped:true`
    // và KHÔNG tăng `attempts`.
    //
    // Chờ dài (BACKOFF_MAX_MS) là CÓ CHỦ Ý và không làm chậm người dùng: mạng phục
    // hồi thì `drainNow()` (NetInfo, `navigation/index.tsx`) xoá sạch cửa sổ chờ và
    // quét ngay. Thử dồn lúc không có sóng chỉ đốt pin giữa vườn.
    if (failure === 'offline') {
      if (!this.retryState.has(txId)) {
        console.warn(`[SyncService] ${txId} chưa nối được máy chủ (mất mạng) — giữ hàng đợi, KHÔNG đếm lượt: ${errorCode}`);
      }
      this.retryState.set(txId, {
        count: prev,
        nextAttemptAt: Date.now() + BACKOFF_MAX_MS,
        lastFailure: 'offline',
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode,
      }));
      return;
    }

    // ── Điều kiện máy chủ chưa thoả (403 chưa đăng ký · 404 chưa bật cửa) ────
    // Ký lại KHÔNG gỡ được, nên đừng bật hộp sinh trắc; thử dồn cũng vô ích, nên
    // chờ dài. Nhưng nó CÓ THỂ thoả về sau (cây được đăng ký, máy chủ bật cửa),
    // nên mục phải nằm chờ chứ không được chết.
    if (failure === 'blocked') {
      if (!this.retryState.has(txId)) {
        console.warn(`[SyncService] ${txId} máy chủ chưa nhận (điều kiện chưa thoả) — giữ hàng đợi: ${errorCode}`);
      }
      this.retryState.set(txId, {
        count: prev,
        nextAttemptAt: Date.now() + BACKOFF_MAX_MS,
        lastFailure: 'blocked',
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode,
      }));
      return;
    }

    if (failure === 'permanent') {
      // Payload sai — gửi lại bao nhiêu lần cũng hỏng. Hạng DUY NHẤT được chết.
      console.error(`Sync gave up for ${txId} (retry=${count}):`, errorCode);
      // GIỮ chẩn đoán, đừng `delete`. Hai lý do, lý do thứ hai mới là lý do chính:
      //   1. Nhãn `'permanent'` là thứ DUY NHẤT nói được "mục này chết vì dữ liệu
      //      sai", và `delete` xoá đúng nó.
      //   2. `delete` chạy TRƯỚC lệnh ghi `'error'` ngay dưới. Lệnh ghi đó trượt được
      //      (nó đi qua store, không phải lời gọi CSDL trực tiếp) — và khi nó trượt,
      //      mục mất sạch chẩn đoán nên màn hàng đợi xếp nó vào nhóm êm ái nhất
      //      ("Đang chờ gửi — chưa có lượt gửi nào hỏng trong phiên này") kèm một nút
      //      gửi lại bấm được, cho một mục sẽ không bao giờ gửi được.
      this.retryState.set(txId, {
        count,
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        lastFailure: 'permanent',
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'error',
        errorCode,
      }));
      return;
    }

    if (count >= MAX_RETRY_COUNT) {
      // ── Chạm trần: HẠ NHỊP, không giết ─────────────────────────────────────
      // Trần cũ đưa mục sang `'error'`, mà `'error'` không nằm trong bộ lọc của
      // `processSyncQueue` ⇒ chết vĩnh viễn. Với hạng `retryable` (408/429/5xx) thì
      // đó là: máy chủ mệt khoảng hai phút rưỡi (5s+10s+20s+40s+80s) là nhật ký
      // đồng áng mất hẳn. Máy chủ mệt không phải lỗi của dữ liệu.
      //
      // Vì sao KHÔNG chép nguyên nếp `needsManual` của `videoUploadQueue` (chạm
      // trần thì ngừng tự thử, giữ job chờ người bấm): bên đó CÓ nút gửi lại tay.
      // Ở đây KHÔNG có màn nào bày hàng đợi, cũng không có nút nào — ngừng tự thử
      // là chết im, chỉ đổi tên. Nên trần ở đây đổi vai: từ "giết" thành "hạ nhịp
      // xuống mức thấp nhất" (BACKOFF_MAX_MS, tức 5 phút/lượt) và gắn nhãn vào
      // `errorCode` để màn hàng đợi — khi có — lọc ra được ngay.
      //
      // Đánh đổi đã cân: một mục hỏng dai dẳng sẽ gửi lại mãi ở nhịp 5 phút thay vì
      // tắt hẳn. Đó là lưu lượng nhỏ và đo được; chiều ngược lại là mất dữ liệu của
      // người dùng và không đo được. `permanent` (400/422) vẫn chết ngay ở nhánh
      // trên, nên mục payload-sai KHÔNG nằm trong vòng này.
      if (this.retryState.get(txId)?.count !== count) {
        console.warn(`[SyncService] ${txId} quá ${MAX_RETRY_COUNT} lượt — hạ nhịp thử còn ${BACKOFF_MAX_MS}ms/lượt, KHÔNG bỏ mục: ${errorCode}`);
      }
      this.retryState.set(txId, {
        count,
        nextAttemptAt: Date.now() + BACKOFF_MAX_MS,
        lastFailure: 'retryable',
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode: `${NEEDS_ATTENTION_PREFIX}${errorCode}`,
      }));
      return;
    }

    // Lỗi tạm thời → backoff luỹ thừa, đưa lại 'pending' để vòng sau retry.
    const backoff = Math.min(BACKOFF_BASE_MS * 2 ** prev, BACKOFF_MAX_MS);
    console.warn(`Sync retry ${count}/${MAX_RETRY_COUNT} for ${txId} in ${backoff}ms:`, errorCode);
    this.retryState.set(txId, {
      count,
      nextAttemptAt: Date.now() + backoff,
      lastFailure: 'retryable',
    });
    store.dispatch(updateSyncStatus({
      transactionId: txId,
      status: 'pending',
      errorCode,
    }));
  }

  /**
   * Chạy MỘT vòng xử lý và ĐỢI nó xong.
   *
   * `start()` gọi `processSyncQueue()` mà không chờ (nó chạy theo hẹn giờ), nên
   * không có chỗ nào bên ngoài chờ được một vòng. Hàm này lấp chỗ đó: dùng cho
   * lệnh đồng bộ tay và cho bài kiểm — bài kiểm không chờ được một vòng thì nó
   * chỉ đo được thời điểm chưa có gì xảy ra.
   */
  async syncOnce(): Promise<void> {
    await this.processSyncQueue();
  }

  /**
   * Xoá trạng thái trong bộ nhớ (cửa sổ chờ, cờ đã-báo). Dịch vụ này là một thể
   * duy nhất sống suốt phiên, nên bài kiểm phải có đường đưa nó về vạch xuất phát
   * giữa hai ca; không có thì ca sau thừa hưởng cửa sổ chờ của ca trước và xanh
   * vì KHÔNG CHẠY.
   */
  resetForTest(): void {
    this.retryState.clear();
    this.isProcessing = false;
    this.authRefreshTriedThisPass = false;
    this.authWarned = false;
  }

  /**
   * Chạy ngay 1 vòng xử lý queue. Gọi khi mạng phục hồi (NetInfo listener)
   * để không phải chờ tới interval 30s tiếp theo.
   */
  async drainNow(): Promise<void> {
    if (!this.isRunning) return;
    // Mạng vừa lên lại → xoá cửa sổ backoff để thử ngay tất cả item.
    //
    // Trải `...rs`, ĐỪNG liệt kê tay từng trường: liệt kê tay thì mỗi lần thêm một
    // trường vào `RetryState` là một lần trường đó bị xoá ở đây mà không gì báo.
    // Đã xảy ra đúng thế với `lastFailure` — hàm này xoá hạng hỏng của MỌI mục ngay
    // lúc mạng phục hồi, rồi nếu một vòng quét đang chạy thì `processSyncQueue`
    // thoát ngay và không nhánh nào ghi lại. Màn hàng đợi mất câu "cần đăng nhập
    // lại" và tụt xuống câu "chưa có lượt gửi nào hỏng trong phiên này".
    for (const [txId, rs] of this.retryState) {
      this.retryState.set(txId, { ...rs, nextAttemptAt: 0 });
    }
    await this.processSyncQueue();
  }

  /**
   * Chụp lại số liệu trong bộ nhớ của từng mục, cho màn hàng đợi đọc.
   *
   * Trả BẢN SAO: `retryState` là ruột của vòng đồng bộ, đưa thẳng ra ngoài thì
   * một màn hình sửa nhầm một ô là đổi hành vi gửi.
   *
   * ⚠ Mục KHÔNG có mặt ở đây không có nghĩa là mục ấy chưa hỏng lần nào — nó
   * cũng có thể là app vừa mở lại (bộ nhớ trắng, mục vẫn `'pending'` trong CSDL).
   * Chỗ gọi phải nói đúng chừng đó, đừng đọc thành "đã thử 0 lần".
   */
  getQueueDiagnostics(): Record<string, SyncQueueDiagnostic> {
    const out: Record<string, SyncQueueDiagnostic> = {};
    for (const [txId, rs] of this.retryState) {
      out[txId] = { retryCount: rs.count, nextAttemptAt: rs.nextAttemptAt, lastFailure: rs.lastFailure };
    }
    return out;
  }

  /**
   * Gửi lại NGAY một mục do người dùng bấm.
   *
   * Xoá cửa sổ chờ của đúng mục đó rồi chạy một vòng quét. Vòng quét vẫn xử mọi
   * mục ĐÃ TỚI HẠN chứ không riêng mục này — cố ý, vì dựng một đường gửi thứ hai
   * chỉ để gửi một mục là nhân đôi chỗ phải nuôi (và nhân đôi đường gửi trùng).
   *
   * Kết quả ĐO bằng cách đọc lại CSDL: mục còn nằm đó nghĩa là lượt này chưa
   * xong. KHÔNG suy "thành công" từ việc không có ngoại lệ nào ném ra —
   * `processSyncQueue` bắt hết lỗi bên trong, nên "không ném" ở đây chứng minh
   * đúng con số không.
   */
  async retryItemNow(transactionId: string): Promise<SyncRetryOutcome> {
    if (!database.isInitialized()) {
      return { kind: 'notAttempted', reason: 'database-not-ready' };
    }
    if (this.isProcessing) {
      return { kind: 'notAttempted', reason: 'another-pass-running' };
    }
    const rs = this.retryState.get(transactionId);
    if (rs) this.retryState.set(transactionId, { ...rs, nextAttemptAt: 0 });

    await this.processSyncQueue();

    const queue = await database.getSyncQueue();
    const row = queue.find((r) => this.txIdOf(r) === transactionId);
    if (!row) return { kind: 'cleared' };
    const message = row.error_code ?? row.errorCode;
    return {
      kind: 'stillQueued',
      status: typeof row.status === 'string' ? row.status : '',
      message: typeof message === 'string' && message !== '' ? message : null,
    };
  }

  /**
   * Gửi lại cả hàng đợi.
   *
   * Cố ý KHÔNG dùng `drainNow()`: hàm đó thoát sớm khi dịch vụ chưa `start()`, và
   * một nút người dùng bấm mà im lặng không làm gì là đúng cái vỏ im lặng phải
   * tránh. Ở đây thiếu điều kiện thì trả `notAttempted` kèm lý do.
   */
  async retryAllNow(): Promise<SyncRetryAllOutcome> {
    if (!database.isInitialized()) {
      return { kind: 'notAttempted', reason: 'database-not-ready' };
    }
    if (this.isProcessing) {
      return { kind: 'notAttempted', reason: 'another-pass-running' };
    }
    const rowsBefore = await database.getSyncQueue();
    const before = countRetriable(rowsBefore);
    const stoppedBefore = rowsBefore.length - before;
    // Cổng `isProcessing` ở trên được kiểm TRƯỚC `await` đầu tiên. Trong khe await đó
    // hẹn giờ 30 giây hoặc NetInfo khởi được một vòng quét — lúc ấy `processSyncQueue`
    // dưới đây thoát ngay ở cổng của nó, và nếu cứ đo tiếp thì hàm này phát một phán
    // quyết ("không mục nào gửi được") về một lượt nó KHÔNG chạy. Kiểm lại ở đây.
    if (this.isProcessing) {
      return { kind: 'notAttempted', reason: 'another-pass-running' };
    }
    for (const [txId, rs] of this.retryState) {
      this.retryState.set(txId, { ...rs, nextAttemptAt: 0 });
    }
    await this.processSyncQueue();
    const after = await database.getSyncQueue();
    // `remaining` đếm mục CÒN GỬI ĐƯỢC, không đếm số dòng. Hai đại lượng khác nhau:
    // mục chết chỉ đổi `status` thành `'error'`, dòng vẫn nằm trong bảng — đếm theo
    // dòng thì một mục vừa chết trong đúng lượt này được báo là "còn chờ", và với
    // hàng đợi chỉ còn mục chết thì nút báo "không mục nào gửi được" mãi mãi cho thứ
    // nó chưa từng thử.
    const remaining = countRetriable(after);
    return {
      kind: 'done',
      before,
      remaining,
      // Số mục CHUYỂN sang chết trong đúng lượt này. Tách khỏi số mục chết sẵn từ
      // trước, vì chỉ số này là hệ quả của lần bấm vừa rồi.
      newlyStopped: Math.max(0, after.length - remaining - stoppedBefore),
    };
  }

  // Public method to add items to sync queue
  async addSyncItem(type: string, data: any, mediaPaths: string[] = []): Promise<string> {
    const transactionId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const payload = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString()
    });

    await database.addToSyncQueue(transactionId, payload, mediaPaths);

    // Nạp lại hàng đợi vào Redux.
    //
    // Dòng cũ ở đây là `store.dispatch({ type: 'sync/loadSyncQueue' })` — một chuỗi
    // TRẦN. `createAsyncThunk('sync/loadSyncQueue', …)` chỉ phát
    // `…/pending|fulfilled|rejected`, nên không `addCase` nào khớp chuỗi trần: lệnh
    // đó đi qua store và không làm gì cả, im lặng. Gọi đúng thunk thì `state.sync.queue`
    // mới có thật — đó là điều kiện cần cho một màn bày hàng đợi, thứ người dùng
    // đang KHÔNG có (xem nhánh chạm trần: mục sống nhưng không ai nhìn thấy nó).
    await store.dispatch(loadSyncQueue());

    return transactionId;
  }
}

export const syncService = new SyncService();