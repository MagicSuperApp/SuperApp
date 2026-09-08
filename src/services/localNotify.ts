/**
 * localNotify — HIỆN thông báo trên điện thoại, từ chính máy (không qua máy chủ).
 *
 * Đây là "đường ra" mà `alertRules` thiếu bấy lâu: luật đã quyết định cái gì
 * đáng báo, nhưng chưa có gì đưa nó ra khỏi app. Tệp này là đoạn đó.
 *
 * ══ GIỚI HẠN PHẢI NÓI THẲNG ═══════════════════════════════════════════════
 * Thông báo cục bộ chỉ hiện được khi **mã JS của app có chạy** — tức lúc người
 * dùng mở app, hoặc quay lại app. App đóng hẳn thì không có gì chạy để đi hỏi
 * thời tiết, nên **không có cảnh báo lúc 3 giờ sáng**.
 *
 * Muốn báo khi app đóng thì phải do MÁY CHỦ đẩy xuống (FCM — `pushHandler` đã
 * nhận sẵn), hoặc phải dựng một tác vụ nền (WorkManager/BGTaskScheduler). Cả
 * hai đều là việc khác, và cả hai đều nằm ngoài tệp này. Đừng viết trong màn
 * Cài đặt câu "bật để nhận cảnh báo bão" như thể nó chạy 24/7.
 *
 * ══ VÌ SAO `require` MỀM ══════════════════════════════════════════════════
 * `@notifee/react-native` là mô-đun NATIVE. Nó có trong `package.json` nhưng
 * máy chưa dựng lại thì `require` NÉM. Bắt lỗi đó và trả `false` — mất thông
 * báo còn hơn màn hình trắng. `available()` cho nơi gọi biết đường lùi.
 */

import { DEFAULT_INSTANCE } from '../config/instance.config';

/**
 * Kênh Android. Tên hiện trong phần Cài đặt thông báo của máy, nên nói tiếng người.
 *
 * Mã kênh mang mã app: trước 2026-08-29 nó ghi cứng `'aladin-farm-alerts'`, nên
 * trên máy cài cả hai app, phần Cài đặt → Thông báo hiện hai mục mang cùng một
 * mã dưới hai app trông giống nhau. Hệ điều hành phân vùng kênh theo mã gói nên
 * không có tranh chấp kỹ thuật — nhưng ai đọc nhật ký máy để dò lỗi thông báo
 * trên máy CheckFarm sẽ thấy nhãn "aladin" và đi sai đường ngay từ bước đầu.
 */
export const CHANNEL_ID = `${DEFAULT_INSTANCE.instanceId}-farm-alerts`;
export const CHANNEL_NAME = 'Cảnh báo vườn';

export interface NotifyInput {
  /** Khoá ổn định — cùng khoá thì thông báo mới THAY thông báo cũ, không chồng. */
  id: string;
  title: string;
  body?: string;
  /**
   * Thời tiết dữ đi kênh ƯU TIÊN CAO (kêu + hiện đè lên màn); tin tức thì không.
   * Một tin nông sản rung máy giữa đêm là cách nhanh nhất để bị tắt thông báo.
   */
  urgent?: boolean;
}

type Notifee = {
  default?: unknown;
  requestPermission?: () => Promise<{ authorizationStatus: number }>;
  createChannel?: (c: Record<string, unknown>) => Promise<string>;
  displayNotification?: (n: Record<string, unknown>) => Promise<string>;
  AndroidImportance?: Record<string, number>;
  AuthorizationStatus?: Record<string, number>;
};

let _mod: Notifee | null | undefined;

/** Nạp notifee một lần, kiểu mềm. `null` = máy chưa có mô-đun native. */
function load(): Notifee | null {
  if (_mod !== undefined) return _mod ?? null;
  try {
    const raw = require('@notifee/react-native');
    // Gói này phát hành `export default` — lấy cả hai nhánh để không phụ thuộc
    // vào cách Metro nội-suy interop.
    const m = (raw?.default ?? raw) as Notifee;
    _mod = m?.displayNotification ? m : null;
    // `AndroidImportance` là named export, KHÔNG nằm trên `default`. Ghép lại
    // để phần dưới chỉ phải đọc một chỗ.
    if (_mod && raw?.AndroidImportance) _mod.AndroidImportance = raw.AndroidImportance;
    if (_mod && raw?.AuthorizationStatus) _mod.AuthorizationStatus = raw.AuthorizationStatus;
  } catch {
    _mod = null;
  }
  return _mod;
}

/** Máy này hiện được thông báo cục bộ không. */
export function available(): boolean {
  return load() !== null;
}

let _ready: Promise<boolean> | null = null;

/**
 * Xin quyền + dựng kênh. Gọi bao nhiêu lần cũng được, việc thật chỉ chạy một lần.
 *
 * Android 13+ và iOS đều đòi quyền, và **hỏi quyền là một hộp thoại cắt ngang**.
 * Nên nơi gọi phải gọi lúc người dùng đã ở trong app một lúc, đừng gọi ngay giây
 * đầu tiên khi họ còn chưa biết app này làm gì.
 */
export function ensureReady(): Promise<boolean> {
  if (_ready) return _ready;
  _ready = (async () => {
    const m = load();
    if (!m) return false;
    try {
      const res = await m.requestPermission?.();
      const denied = m.AuthorizationStatus?.DENIED;
      // Người dùng từ chối ⇒ DỪNG, không thử hiện rồi nuốt lỗi. Họ đã trả lời.
      if (typeof denied === 'number' && res?.authorizationStatus === denied) return false;
      await m.createChannel?.({
        id: CHANNEL_ID,
        name: CHANNEL_NAME,
        importance: m.AndroidImportance?.HIGH ?? 4,
      });
      return true;
    } catch {
      return false;
    }
  })();
  return _ready;
}

/**
 * Hiện MỘT thông báo. Trả `false` khi không hiện được (thiếu mô-đun, chưa có
 * quyền, lỗi native) — KHÔNG ném.
 *
 * `id` đi vào `id` của notifee: cùng khoá thì bản mới THAY bản cũ trên khay.
 * Nhờ vậy "dông trong 3 giờ" không nằm cạnh "dông trong 2 giờ" của cùng cơn.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  const m = load();
  if (!m) return false;
  if (!(await ensureReady())) return false;
  try {
    await m.displayNotification?.({
      id: input.id,
      title: input.title,
      body: input.body || undefined,
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: 'default' },
        importance: input.urgent
          ? (m.AndroidImportance?.HIGH ?? 4)
          : (m.AndroidImportance?.DEFAULT ?? 3),
        // KHÔNG khai `smallIcon`: dự án chưa có drawable `ic_notification`
        // (`android/app/src/main/res` không có tệp nào tên đó), và khai một tên
        // không tồn tại thì notifee ném "Icon not found" — mất luôn thông báo.
        // Bỏ trống ⇒ nó dùng icon ứng dụng.
        //
        // ⚠ Việc còn thiếu: Android vẽ icon thông báo dưới dạng MẶT NẠ ĐƠN SẮC,
        // nên icon ứng dụng nhiều màu sẽ ra một ô trắng vô nghĩa trên thanh
        // trạng thái. Cần một drawable trắng-trên-nền-trong `ic_notification`
        // rồi khai lại ở đây. Đó là việc của người có tệp thiết kế gốc.
      },
      ios: {
        // Thời tiết dữ thì kêu; tin tức thì im, chỉ nằm trên khay.
        sound: input.urgent ? 'default' : undefined,
      },
    });
    return true;
  } catch {
    return false;
  }
}
