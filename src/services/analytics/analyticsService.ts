// services/analytics/analyticsService.ts
//
// Lõi hệ thống thu thập hành vi người dùng. Một singleton chịu trách nhiệm:
//   • Quản lý phiên (session) — mỗi lần mở/đưa app lên foreground là 1 phiên.
//   • Đo thời gian một màn hình được xem (screen_view.durationMs).
//   • Đo độ trễ mở màn hình: nhấn nút → màn hình hiển thị (screen_open_latency).
//   • Ghi nhận tap / input / sử dụng chức năng (tap, input, action).
//   • Đệm sự kiện vào hàng đợi bền (AsyncStorage) và đẩy theo batch lên server,
//     tự retry khi mất mạng (giữ nguyên trong hàng đợi tới khi gửi thành công).
//
// Thiết kế chịu lỗi: mọi lỗi nội bộ đều nuốt (swallow) — tracking KHÔNG bao giờ
// được phép làm crash hoặc chậm UI chính.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '../../store';
import analyticsApi from './analyticsApi';
import { ANALYTICS_CONFIG, SENSITIVE_FIELD_HINTS } from './config';
import { AnalyticsEvent, AnalyticsEventType, TrackOptions } from './types';

type PartialEvent = Partial<AnalyticsEvent> & { type: AnalyticsEventType };

/** Ý định điều hướng đang chờ: dùng để tính độ trễ mở màn hình. */
interface PendingNavIntent {
  target: string | null;
  action: string | null;
  ts: number;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class AnalyticsService {
  private initialized = false;
  private queue: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private persistScheduled = false;
  private flushing = false;

  private sessionId: string | null = null;

  // Trạng thái màn hình hiện tại để đo thời gian xem.
  private currentScreen: string | null = null;
  private screenEnterTs = 0;

  // Ý định điều hướng gần nhất (cho screen_open_latency).
  private pendingNavIntent: PendingNavIntent | null = null;

  // ──────────────────────────────────────────────────────────────────────────
  // Vòng đời
  // ──────────────────────────────────────────────────────────────────────────

  /** Gọi 1 lần khi app khởi động (App.tsx). */
  async init(): Promise<void> {
    if (this.initialized || !ANALYTICS_CONFIG.ENABLED) return;
    this.initialized = true;

    try {
      const raw = await AsyncStorage.getItem(ANALYTICS_CONFIG.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.queue = parsed;
      }
    } catch (e) {
      console.warn('[Analytics] Không đọc được hàng đợi đã lưu:', e);
    }

    this.startSession();

    this.flushTimer = setInterval(
      () => void this.flush(),
      ANALYTICS_CONFIG.FLUSH_INTERVAL_MS,
    );

    // Đẩy thử ngay những gì còn tồn từ phiên trước.
    void this.flush();
  }

  /** Bắt đầu một phiên mới (mở app / quay lại foreground). */
  startSession(): void {
    if (!ANALYTICS_CONFIG.ENABLED) return;
    this.sessionId = genId('sess');
    this.screenEnterTs = Date.now();
    this.enqueue({
      type: 'session_start',
      metadata: { platform: Platform.OS },
    });
  }

  /** Kết thúc phiên (app vào background) — chốt thời gian xem màn hình cuối. */
  endSession(): void {
    if (!ANALYTICS_CONFIG.ENABLED || !this.sessionId) return;
    this.flushCurrentScreenView();
    this.enqueue({ type: 'session_end' });
    void this.flush();
  }

  /** Dọn dẹp khi app thoát. */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Theo dõi MÀN HÌNH (tự động qua navigation)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Gọi mỗi khi route đang hiển thị thay đổi (từ NavigationContainer).
   * Tự động: (1) chốt thời gian xem màn hình trước, (2) tính độ trễ mở màn hình
   * mới nếu vừa có một lần nhấn nút điều hướng.
   */
  onNavigationStateChange(routeName: string | undefined): void {
    if (!ANALYTICS_CONFIG.ENABLED || !routeName) return;
    if (routeName === this.currentScreen) return;

    const now = Date.now();

    // (1) Chốt thời gian xem màn hình trước đó.
    this.flushCurrentScreenView(now);

    // (2) Độ trễ mở màn hình: nếu vừa nhấn nút điều hướng trong cửa sổ cho phép.
    const intent = this.pendingNavIntent;
    if (intent && now - intent.ts <= ANALYTICS_CONFIG.NAV_INTENT_TTL_MS) {
      this.enqueue({
        type: 'screen_open_latency',
        screen: routeName,
        target: intent.target,
        action: intent.action,
        latencyMs: now - intent.ts,
        metadata: { from: this.currentScreen },
      });
    }
    this.pendingNavIntent = null;

    // Bắt đầu đo màn hình mới.
    this.currentScreen = routeName;
    this.screenEnterTs = now;
  }

  /** Phát screen_view cho màn hình hiện tại kèm thời lượng đã xem. */
  private flushCurrentScreenView(now: number = Date.now()): void {
    if (!this.currentScreen || !this.screenEnterTs) return;
    const durationMs = now - this.screenEnterTs;
    if (durationMs <= 0) return;
    this.enqueue({
      type: 'screen_view',
      screen: this.currentScreen,
      durationMs,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Theo dõi THAO TÁC (thủ công)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Ghi nhận một lần nhấn nút / phần tử. target = null nghĩa là "không có nút"
   * (vd tap vào vùng nền). Truyền screen rõ ràng để biết thao tác ở màn nào.
   */
  trackTap(screen: string, target: string | null, opts: TrackOptions = {}): void {
    this.enqueue({
      type: 'tap',
      screen,
      target,
      action: opts.action ?? null,
      value: this.sanitizeValue(target, opts.value),
      metadata: opts.metadata ?? null,
    });
  }

  /**
   * Ghi nhận người dùng nhập dữ liệu. Giá trị nhạy cảm (password/otp/seed…) sẽ
   * tự động được ẩn, chỉ giữ độ dài.
   */
  trackInput(screen: string, target: string, value: unknown, opts: TrackOptions = {}): void {
    this.enqueue({
      type: 'input',
      screen,
      target,
      action: opts.action ?? null,
      value: this.sanitizeValue(target, value as any),
      metadata: opts.metadata ?? null,
    });
  }

  /** Ghi nhận một chức năng được sử dụng (vd "start_3d_scan", "send_payment"). */
  trackAction(screen: string, action: string, opts: TrackOptions = {}): void {
    this.enqueue({
      type: 'action',
      screen,
      target: opts.metadata?.target ?? null,
      action,
      value: this.sanitizeValue(action, opts.value),
      metadata: opts.metadata ?? null,
    });
  }

  /**
   * Tiện ích cho nút điều hướng: vừa ghi nhận tap, vừa đánh dấu ý định điều
   * hướng để màn hình kế tiếp tự tính độ trễ mở (screen_open_latency).
   */
  trackPress(screen: string, target: string, opts: TrackOptions = {}): void {
    this.markNavIntent(target, opts.action ?? null);
    this.trackTap(screen, target, opts);
  }

  /** Đánh dấu "vừa nhấn nút dẫn tới mở màn hình" (mốc bắt đầu đo độ trễ). */
  markNavIntent(target: string | null, action: string | null = null): void {
    if (!ANALYTICS_CONFIG.ENABLED) return;
    this.pendingNavIntent = { target, action, ts: Date.now() };
  }

  /** Cho phép gửi một event tuỳ biến hoàn toàn. */
  track(event: PartialEvent): void {
    this.enqueue(event);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hàng đợi & đồng bộ
  // ──────────────────────────────────────────────────────────────────────────

  private enqueue(partial: PartialEvent): void {
    if (!ANALYTICS_CONFIG.ENABLED) return;
    try {
      const event: AnalyticsEvent = {
        eventId: genId('evt'),
        sessionId: this.sessionId ?? 'unknown',
        userId: this.getUserId(),
        type: partial.type,
        screen: partial.screen ?? this.currentScreen ?? null,
        target: partial.target ?? null,
        action: partial.action ?? null,
        value: partial.value ?? null,
        durationMs: partial.durationMs ?? null,
        latencyMs: partial.latencyMs ?? null,
        metadata: partial.metadata ?? null,
        platform: Platform.OS,
        appVersion: ANALYTICS_CONFIG.APP_VERSION,
        osVersion: String(Platform.Version),
        clientTs: Date.now(),
      };

      this.queue.push(event);
      if (this.queue.length > ANALYTICS_CONFIG.MAX_QUEUE_SIZE) {
        // Drop event cũ nhất để tránh phình bộ nhớ.
        this.queue.splice(0, this.queue.length - ANALYTICS_CONFIG.MAX_QUEUE_SIZE);
      }

      this.schedulePersist();

      if (this.queue.length >= ANALYTICS_CONFIG.FLUSH_THRESHOLD) {
        void this.flush();
      }
    } catch (e) {
      console.warn('[Analytics] enqueue lỗi:', e);
    }
  }

  /** Đẩy hàng đợi lên server theo batch; giữ lại nếu thất bại. */
  async flush(): Promise<void> {
    if (!ANALYTICS_CONFIG.ENABLED || this.flushing) return;
    if (this.queue.length === 0) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, ANALYTICS_CONFIG.MAX_BATCH_SIZE);
        await analyticsApi.sendBatch(batch);
        // Gửi thành công → xóa đúng số đã gửi (các event mới có thể đã được
        // push thêm vào cuối hàng đợi trong lúc chờ network).
        this.queue.splice(0, batch.length);
        this.schedulePersist();
      }
    } catch (e) {
      // Mất mạng / server lỗi → giữ nguyên hàng đợi, thử lại ở chu kỳ sau.
      console.warn('[Analytics] flush thất bại, sẽ thử lại sau:', (e as any)?.message);
    } finally {
      this.flushing = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Tiện ích nội bộ
  // ──────────────────────────────────────────────────────────────────────────

  private getUserId(): string | null {
    try {
      const u = store.getState().user;
      return u.phoenixKey?.did || u.currentUser?.did || u.currentUser?.id || null;
    } catch {
      return null;
    }
  }

  /** Ẩn dữ liệu nhạy cảm; rút gọn giá trị quá dài. */
  private sanitizeValue(label: string | null, value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const str = typeof value === 'string' ? value : JSON.stringify(value);

    const hay = (label || '').toLowerCase();
    if (SENSITIVE_FIELD_HINTS.some(h => hay.includes(h))) {
      return `[ẩn:${str.length} ký tự]`;
    }

    if (str.length > ANALYTICS_CONFIG.MAX_VALUE_LENGTH) {
      return str.slice(0, ANALYTICS_CONFIG.MAX_VALUE_LENGTH) + '…';
    }
    return str;
  }

  private schedulePersist(): void {
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    // Gộp nhiều lần ghi liên tiếp thành 1 lần ghi AsyncStorage.
    setTimeout(() => {
      this.persistScheduled = false;
      void this.persistNow();
    }, 500);
  }

  private async persistNow(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        ANALYTICS_CONFIG.STORAGE_KEY,
        JSON.stringify(this.queue),
      );
    } catch (e) {
      console.warn('[Analytics] không lưu được hàng đợi:', e);
    }
  }
}

const analyticsService = new AnalyticsService();
export default analyticsService;
