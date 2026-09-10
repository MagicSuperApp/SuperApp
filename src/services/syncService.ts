// services/syncService.ts

import { store } from '../store';
import { updateSyncStatus, removeFromSyncQueue } from '../store/syncSlice';
import { database } from '../utils/database';
import { classifySyncItem, classifySyncFailure } from './syncDispatch';
import { ensureOrilifeToken } from './orilifeDidAuth';
import { ORILIFE_BASE } from './orilifeBase';
import { showWarning } from '../utils/alert';

// Hết số lần thử này thì item bị đánh dấu 'error' (chết) để khỏi kẹt vòng lặp
// vô hạn. Trước đó item ở 'pending' + backoff để tự retry.
//
// ⚠ Trần này CHỈ áp cho hạng `retryable`. Phiên hết hạn (`auth`) và điều kiện máy
// chủ chưa thoả (`blocked`) KHÔNG đếm vào đây: đếm chúng là quay lại đúng lỗi cũ,
// chỉ chậm hơn năm lượt.
const MAX_RETRY_COUNT = 5;
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

          // Thành công → xoá khỏi queue + dọn retry state
          store.dispatch(removeFromSyncQueue(txId));
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
    const dispatch = classifySyncItem(envelope);

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
   *  - `retryable` (mạng/408/429/5xx): 'pending' + backoff luỹ thừa, tăng count
   *    tới MAX_RETRY_COUNT rồi mới đánh dấu 'error'.
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
      });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode: refreshed ? errorCode : AUTH_BLOCKED_TITLE,
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
      this.retryState.set(txId, { count: prev, nextAttemptAt: Date.now() + BACKOFF_MAX_MS });
      store.dispatch(updateSyncStatus({
        transactionId: txId,
        status: 'pending',
        errorCode,
      }));
      return;
    }

    if (failure === 'permanent' || count >= MAX_RETRY_COUNT) {
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