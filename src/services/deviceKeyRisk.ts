// services/deviceKeyRisk.ts
//
// AI ĐANG ĐỨNG TRÊN ĐƯỜNG KHÔNG CÓ LỐI VỀ — và nói với đúng người đó.
//
// ══ Diện phải nhận ra ═════════════════════════════════════════════════════════
// `hasDeviceKey === true && guardianCount === 0`: người đã bật "Bảo mật 2 lớp"
// (khoá thiết bị) mà chưa có ai khôi phục hộ. Mất máy lúc này thì hôm nay còn gỡ
// được — nhưng đường gỡ đó chính là lỗ tự-ký ở `IdentityServiceImpl:441-443`, và
// ngày lỗ được bịt thì đường gỡ mất theo (nhà Phoenix đo và chốt thứ tự 26/08).
//
// Nút bật đã đóng từ PR #216, nên KHÔNG ai mới vào diện này nữa. Nhưng người đã
// bật TRƯỚC đó vẫn đang ở trong đó **và họ không biết**. Lập người khôi phục là
// thứ gỡ họ ra, và nó không phụ thuộc lỗ tự-ký, không phụ thuộc validator, không
// phụ thuộc quyết định nào đang treo.
//
// ══ Vì sao có tệp này thay vì gọi thẳng API ở màn ═════════════════════════════
// Ba trạng thái, không phải hai. "Chưa hỏi được" KHÔNG phải "an toàn", và cũng
// KHÔNG phải "đang gặp nguy". Gộp nó vào một trong hai đầu là hoặc doạ người
// dùng vì một lần rớt sóng, hoặc giấu một rủi ro thật sau một lần 500.
//
// ⚠ CHƯA CHỐT: `IdentityHealthResponse.java:8-18` gợi ý mốc "7 ngày" trước khi
// nhắc. Chưa rõ mốc đó do máy chủ tính hay app tự tính từ `exportedAt` — đã hỏi
// nhà Phoenix, chưa có đáp. Nên bản này KHÔNG tự đặt mốc: có rủi ro thì nói ngay,
// và để người dùng tạm ẩn. Tự chọn một mốc rồi hai bên đếm ngày khác nhau thì tệ
// hơn không có mốc.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { identity, PhoenixKeyApiError } from './phoenixKey-api';

export type DeviceKeyRisk =
  /** Đã bật khoá thiết bị mà chưa có ai khôi phục hộ. */
  | { state: 'at-risk' }
  /** Hỏi được, và không ở trong diện đó. */
  | { state: 'safe' }
  /** CHƯA HỎI ĐƯỢC. Không hiện cảnh báo, cũng KHÔNG hiện lời trấn an. */
  | { state: 'unknown'; why: 'no-session' | 'server' };

/** Khoá tạm ẩn. Người dùng ẩn thì im tới mốc này. */
const SNOOZE_KEY = 'device_key_risk_snoozed_until';

/** Tạm ẩn 7 ngày. Đủ dài để không phiền, đủ ngắn để không quên. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Người này có đang ở diện "đã bật khoá thiết bị, chưa có người khôi phục" không.
 *
 * KHÔNG ném trong mọi trường hợp — một dải nhắc không được làm sập màn tài khoản.
 */
export async function checkDeviceKeyRisk(): Promise<DeviceKeyRisk> {
  try {
    const h = await identity.getHealth();
    // So sánh NGHIÊM NGẶT. `guardianCount` là `long` phía máy chủ nên nó là số,
    // không bao giờ null (nhà Phoenix xác nhận 26/08 cho cùng lớp trường ở
    // `VaultStatusResponse`). Nhưng một bản máy chủ cũ có thể vắng trường —
    // vắng thì là "chưa hỏi được", không phải "bằng không".
    if (typeof h?.hasDeviceKey !== 'boolean' || typeof h?.guardianCount !== 'number') {
      return { state: 'unknown', why: 'server' };
    }
    return h.hasDeviceKey && h.guardianCount === 0
      ? { state: 'at-risk' }
      : { state: 'safe' };
  } catch (e: unknown) {
    // 401/403 = chưa có phiên. Đó không phải lỗi cần kêu — người chưa đăng nhập
    // thì cũng chưa có khoá thiết bị nào để mà lo.
    //
    // ĐỌC `httpStatus`, KHÔNG đọc `response.status`. `getHealth` đi qua `unwrap`,
    // và MỌI lối ra của `unwrap` đều ném `PhoenixKeyApiError` — kể cả lối mạng
    // rớt, kể cả lối phong bì có `code !== 1000`. Lớp đó mang `code` +
    // `httpStatus`; nó KHÔNG có `response`, cũng KHÔNG có `status`. Đọc theo hình
    // dạng lỗi thô của axios là đọc một thứ không bao giờ tới, nên mọi 401 rơi
    // xuống nhánh 'server' — im lặng, không ngoại lệ, không dấu vết.
    //
    // Thêm `code === 1304` bên cạnh mã HTTP: `AuthRequiredInterceptor.java:164,177`
    // ném `UNAUTHORIZED(1304)` cho cả "thiếu Bearer" lẫn "Bearer hỏng". Hôm nay nó
    // kèm HTTP 401 nên hai phép đo trùng nhau; nhưng `unwrap` còn một lối dựng lỗi
    // với `httpStatus: 200` khi phong bì báo hỏng trên một phản hồi 200, và mã
    // nghiệp vụ mới là thứ đứng vững ở lối đó.
    const code = e instanceof PhoenixKeyApiError ? e.code : undefined;
    const status = e instanceof PhoenixKeyApiError ? e.httpStatus : undefined;
    const noSession = status === 401 || status === 403 || code === 1304;
    return { state: 'unknown', why: noSession ? 'no-session' : 'server' };
  }
}

/** Người dùng đã tạm ẩn lời nhắc và mốc ẩn còn hiệu lực chưa. */
export async function isRiskSnoozed(now: number = Date.now()): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    const until = raw ? Number(raw) : 0;
    return Number.isFinite(until) && until > now;
  } catch {
    // Đọc kho hỏng → coi như CHƯA ẩn. Thà hiện thừa một lần còn hơn nuốt mất
    // lời nhắc về một thứ mất được thì không lấy lại.
    return false;
  }
}

/** Tạm ẩn lời nhắc 7 ngày kể từ bây giờ. */
export async function snoozeRisk(now: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_MS));
  } catch {
    // Ghi hỏng → lần sau hiện lại. Không nổ.
  }
}

/** Xoá mốc ẩn — gọi khi đăng xuất / đổi tài khoản. */
export async function resetRiskSnooze(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SNOOZE_KEY);
  } catch { /* bỏ qua */ }
}
