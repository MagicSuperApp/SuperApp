// services/syncService.ts

import { store } from '../store';
import { updateSyncStatus, removeFromSyncQueue } from '../store/syncSlice';
import { database } from '../utils/database';
import { classifySyncItem, isRetryableError } from './syncDispatch';

// Hết số lần thử này thì item bị đánh dấu 'error' (chết) để khỏi kẹt vòng lặp
// vô hạn. Trước đó item ở 'pending' + backoff để tự retry.
const MAX_RETRY_COUNT = 5;
// Backoff luỹ thừa, chặn trên để không chờ quá lâu giữa các lần thử.
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000; // 5 phút

interface RetryState {
  count: number;
  nextAttemptAt: number; // epoch ms — chưa tới thì bỏ qua vòng này
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

          // Thành công → xoá khỏi queue + dọn retry state
          store.dispatch(removeFromSyncQueue(txId));
          this.retryState.delete(txId);

        } catch (error: any) {
          this.handleSyncFailure(item, error);
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
    const dispatch = classifySyncItem(envelope);

    if (dispatch.kind === 'unsupported') {
      const err: any = new Error(dispatch.reason);
      err.__unsupported = true; // đánh dấu: giữ queue, không retry, không chết
      throw err;
    }

    await dispatch.run();
  }

  /**
   * Xử lý 1 lần sync thất bại — KHÔNG mất item.
   *  - unsupported (chưa có contract): đưa lại 'pending', backoff dài, KHÔNG
   *    tăng retry count → item nằm chờ contract, không bị đánh dấu chết.
   *  - lỗi tạm thời (mạng/5xx): 'pending' + backoff luỹ thừa, tăng count tới
   *    MAX_RETRY_COUNT rồi mới đánh dấu 'error'.
   *  - lỗi vĩnh viễn (4xx payload sai): đánh dấu 'error' ngay.
   */
  private handleSyncFailure(item: any, error: any): void {
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
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode: error.message,
      }));
      return;
    }

    const retryable = isRetryableError(error);
    const prev = this.retryState.get(txId)?.count ?? 0;
    const count = prev + 1;
    const errorCode = error?.message || 'Unknown error';

    if (!retryable || count >= MAX_RETRY_COUNT) {
      // Lỗi vĩnh viễn hoặc hết lượt thử → đánh dấu chết để khỏi kẹt vòng lặp.
      console.error(`Sync gave up for ${txId} (retry=${count}):`, errorCode);
      this.retryState.delete(txId);
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'error',
        errorCode,
      }));
      return;
    }

    // Lỗi tạm thời → backoff luỹ thừa, đưa lại 'pending' để vòng sau retry.
    const backoff = Math.min(BACKOFF_BASE_MS * 2 ** prev, BACKOFF_MAX_MS);
    console.warn(`Sync retry ${count}/${MAX_RETRY_COUNT} for ${txId} in ${backoff}ms:`, errorCode);
    this.retryState.set(txId, { count, nextAttemptAt: Date.now() + backoff });
    store.dispatch(updateSyncStatus({
      transactionId: txId,
      status: 'pending',
      errorCode,
    }));
  }

  /**
   * Chạy ngay 1 vòng xử lý queue. Gọi khi mạng phục hồi (NetInfo listener)
   * để không phải chờ tới interval 30s tiếp theo.
   */
  async drainNow(): Promise<void> {
    if (!this.isRunning) return;
    // Mạng vừa lên lại → xoá cửa sổ backoff để thử ngay tất cả item.
    for (const [txId, rs] of this.retryState) {
      this.retryState.set(txId, { count: rs.count, nextAttemptAt: 0 });
    }
    await this.processSyncQueue();
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

    // Refresh sync queue in Redux
    store.dispatch({ type: 'sync/loadSyncQueue' });

    return transactionId;
  }
}

export const syncService = new SyncService();