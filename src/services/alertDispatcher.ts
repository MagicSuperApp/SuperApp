/**
 * alertDispatcher — nối LUẬT (`alertRules`) với ĐƯỜNG RA (`localNotify`).
 *
 * Ba việc, đúng thứ tự: chạy luật → bỏ cái vừa báo → hiện thông báo và ghi nhớ.
 *
 * ══ VÌ SAO KHÔNG TỰ ĐI LẤY DỮ LIỆU ════════════════════════════════════════
 * Hàm này nhận thời tiết và tin đã tải sẵn, không tự gọi mạng. Trang Tổng quan
 * vốn đã tải cả hai để vẽ màn; bắt tệp này tải lại là **nhân đôi lượt mạng của
 * người dùng** cho đúng một dữ liệu, trên đúng những cái máy dùng 3G.
 *
 * Hệ quả phải nói thẳng: cảnh báo chỉ được XÉT khi trang Tổng quan có dữ liệu
 * mới — tức lúc người dùng mở app hoặc quay lại app. Cộng thêm giới hạn của
 * thông báo cục bộ (xem đầu `localNotify`), nghĩa là **app đóng hẳn thì không có
 * cảnh báo**. Muốn báo lúc nửa đêm thì phải để máy chủ đẩy push.
 *
 * ══ HAI CÁI CHỐT, VÀ VÌ SAO CẦN CẢ HAI ════════════════════════════════════
 * 1. `dropRecent` (ở `alertRules`) — cùng MỘT chuyện không báo lại trong 12 giờ.
 * 2. {@link MIN_RUN_GAP_MS} — cả LƯỢT XÉT cũng có nhịp tối thiểu.
 *
 * Chốt 1 không thay được chốt 2: người dùng mở app 20 lần trong buổi sáng thì
 * chốt 1 vẫn im, nhưng ta đã chạy 20 lượt đọc/ghi AsyncStorage cho không. Và
 * chốt 2 không thay được chốt 1: qua 30 phút là được xét lại, nhưng cơn dông thì
 * vẫn là cơn dông cũ.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { tk } from '../i18n/keys';
import { dropRecent, trendAlerts, weatherAlerts, type Alert } from './alertRules';
import { notify } from './localNotify';
import type { NewsItem } from './agriNewsService';
import type { WeatherReport } from './weatherService';

/** Bảng `id → lúc đã báo`. */
export const SENT_KEY = '@aladin/alerts/sentAt';
/** Mốc lần xét gần nhất. */
export const LAST_RUN_KEY = '@aladin/alerts/lastRun';

/** Hai lượt XÉT cách nhau ít nhất bấy nhiêu. */
export const MIN_RUN_GAP_MS = 30 * 60_000;

/**
 * Giữ sổ "đã báo" trong bao lâu rồi quên.
 *
 * Phải quên, nếu không bảng chỉ có lớn lên — mỗi ngày thêm vài khoá, và sau một
 * năm là một chuỗi JSON vài chục KB đọc/ghi mỗi lần mở app. 7 ngày là dư: chốt
 * không-lặp chỉ dài 12 giờ.
 */
export const SENT_TTL_MS = 7 * 24 * 3600_000;

/** Nhiều nhất bấy nhiêu thông báo một lượt. */
export const MAX_PER_RUN = 3;

// ---------------------------------------------------------------------------
// Sổ "đã báo" — thuần, test được
// ---------------------------------------------------------------------------

/** Bỏ mục quá hạn. Trả bảng MỚI, không sửa bảng gốc. */
export function pruneSent(
  sent: Record<string, number>,
  now: number,
  ttl: number = SENT_TTL_MS,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(sent ?? {})) {
    if (typeof at === 'number' && Number.isFinite(at) && now - at < ttl) out[id] = at;
  }
  return out;
}

/**
 * Xếp cảnh báo theo mức đáng cắt ngang, rồi cắt còn {@link MAX_PER_RUN}.
 *
 * Thời tiết dữ đứng trước tin tức: một cơn dông đổi việc người ta đang làm trong
 * mười phút tới, còn một tin thị trường thì đọc lúc nào cũng được. Bắn năm thông
 * báo cùng lúc thì cái quan trọng nhất bị đẩy khuất, nên phải cắt.
 */
export function rank(alerts: Alert[], max: number = MAX_PER_RUN): Alert[] {
  const weight = (a: Alert) => (a.kind === 'weather' ? 0 : a.kind === 'price' ? 1 : 2);
  return [...alerts].sort((x, y) => weight(x) - weight(y)).slice(0, max);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Một lượt xét
// ---------------------------------------------------------------------------

export interface AlertInput {
  now: number;
  weather: WeatherReport | null;
  news: NewsItem[];
  /** Bỏ qua nhịp tối thiểu — chỉ dùng khi người dùng CHỦ ĐỘNG bấm làm mới. */
  force?: boolean;
}

export interface AlertRunResult {
  /** Cảnh báo đã hiện lên máy. */
  sent: Alert[];
  /** Vì sao không có gì được gửi. `null` = có chạy đủ. */
  skipped: 'too_soon' | 'no_alerts' | 'notify_unavailable' | null;
}

/**
 * Chạy một lượt xét cảnh báo. KHÔNG ném.
 *
 * Ghi `sentAt` **sau khi** thông báo hiện thành công. Ghi trước là tự khoá mình:
 * lượt gửi hỏng (thiếu quyền, mô-đun chưa dựng) vẫn tính là "đã báo", và cơn dông
 * đó im lặng suốt 12 giờ.
 */
export async function runAlertCheck(input: AlertInput): Promise<AlertRunResult> {
  const { now, weather, news, force } = input;

  if (!force) {
    const lastRun = await readJson<number>(LAST_RUN_KEY, 0);
    if (typeof lastRun === 'number' && now - lastRun < MIN_RUN_GAP_MS) {
      return { sent: [], skipped: 'too_soon' };
    }
  }
  try { await AsyncStorage.setItem(LAST_RUN_KEY, JSON.stringify(now)); } catch { /* sổ nhịp hỏng thì thôi */ }

  const candidates: Alert[] = [
    ...weatherAlerts(weather, { now }),
    ...trendAlerts(news ?? [], { now }),
  ];
  if (candidates.length === 0) return { sent: [], skipped: 'no_alerts' };

  const sentAt = pruneSent(await readJson<Record<string, number>>(SENT_KEY, {}), now);
  const fresh = rank(dropRecent(candidates, sentAt, now));
  if (fresh.length === 0) return { sent: [], skipped: 'no_alerts' };

  const sent: Alert[] = [];
  for (const a of fresh) {
    const ok = await notify({
      id: a.id,
      // `tk` là hàm thuần (không phải hook) nên gọi được ở tầng service. Dịch Ở
      // ĐÂY chứ không lưu sẵn chữ: người dùng đổi ngôn ngữ thì cảnh báo lần sau
      // phải đổi theo, mà sổ `sentAt` thì chỉ giữ khoá.
      title: tk(a.titleKey, a.vars),
      body: a.bodyKey ? tk(a.bodyKey, a.vars) : a.body,
      urgent: a.kind === 'weather',
    });
    if (ok) {
      sent.push(a);
      sentAt[a.id] = now;
    }
  }

  if (sent.length > 0) {
    try { await AsyncStorage.setItem(SENT_KEY, JSON.stringify(sentAt)); } catch { /* lần sau báo lại, không sao */ }
    return { sent, skipped: null };
  }
  return { sent: [], skipped: 'notify_unavailable' };
}
