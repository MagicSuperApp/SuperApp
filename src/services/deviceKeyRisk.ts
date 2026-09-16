// services/deviceKeyRisk.ts
//
// AI ĐANG ĐỨNG TRÊN ĐƯỜNG KHÔNG CÓ LỐI VỀ — và nói với đúng người đó.
//
// ══ Đại lượng được đo: ĐÃ LƯU 24 TỪ HAY CHƯA ═════════════════════════════════
// Rủi ro ở đây là "mất máy thì mất luôn danh tính và ví". Thứ duy nhất gỡ được
// người dùng khỏi rủi ro đó là **cụm 24 từ đã nằm ngoài máy** — đó là đường
// khôi phục DUY NHẤT đang chạy được đầu-tới-cuối trong app này.
//
// ── ⛔ Vì sao KHÔNG còn đo bằng số người bảo hộ (sửa 15/09/2026) ─────────────
// Bản trước đo `hasDeviceKey && guardianCount === 0`, tức **ghi danh một người
// bảo hộ là tắt lời nhắc**. Đó là phép đo SAI ĐẠI LƯỢNG, vì đường khôi phục
// bằng người bảo hộ CHƯA chạy được đầu-tới-cuối — chính màn ghi danh tự khai
// điều đó với người dùng (`screens/GuardianScreen.tsx:181`, nguyên văn):
//
//     "Đường dùng người bảo hộ để khôi phục chưa chạy tới cuối — cụm 24 từ vẫn
//      là bản dự phòng duy nhất."
//
// Hệ quả của phép đo cũ: người vừa ghi danh một người bảo hộ thì lời nhắc TẮT,
// kể cả khi họ chưa bao giờ nhìn thấy 24 từ của mình. Tức nó tắt cảnh báo cho
// đúng nhóm đang ở chỗ nguy hiểm nhất — họ tin mình đã an toàn vì app vừa im.
//
// Người bảo hộ vẫn là việc nên làm, nhưng **một mình nó KHÔNG hạ được mức rủi
// ro**. Ngày nào đường khôi phục bằng người bảo hộ chạy được đầu-tới-cuối thì
// sửa ở ĐÂY, và sửa kèm một phép đo, đừng sửa vì nó nghe hợp lý.
//
// ── ⚠ Giới hạn của phép đo hôm nay — đọc trước khi dựa vào nó ────────────────
// `seedExported` do MÁY CHỦ giữ (`users.seed_exported_at`), và máy chủ chỉ ghi
// nó khi đi qua cửa `/seed/export-request`. Đo 15/09/2026 trong kho này:
// `seed.exportRequest` (`services/phoenixKey-api.ts:815`) có định nghĩa mà
// **0 nơi gọi** — `SeedExportScreen.tsx` sinh 24 từ hoàn toàn trên máy
// (`getOrCreateMasterKek` → `masterKekToMnemonic`), không báo gì cho máy chủ.
//
// ⇒ Với người CHỈ dùng app này, `seedExported` hôm nay luôn `false`, nên trạng
//   thái trả về luôn là `at-risk`. Đó là hướng ĐÚNG (chưa chứng minh được là đã
//   lưu ⟹ coi như chưa lưu), không phải một lỗi cần "chữa" bằng cách nới điều
//   kiện. Nhánh `safe` KHÔNG chết: cùng một tài khoản đi qua app PhoenixKey Core
//   thì máy chủ có ghi vết, và `/identity/health` trả `true` cho app này.
//
// Việc phải làm để lời nhắc tắt được từ chính app này: nối `SeedExportScreen`
// vào `seed.exportRequest` (hoặc một dấu cục bộ tương đương) sau khi người dùng
// đã thật sự xem 24 từ. Việc đó nằm NGOÀI tệp này — nói ra ở đây để không ai
// đọc tệp này rồi tưởng vòng đo đã khép.
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
  /**
   * Chưa chứng minh được là đã lưu 24 từ ⟹ mất máy là mất danh tính.
   *
   * `why` mang theo ĐẠI LƯỢNG đã đo. Nó có mặt để nơi gọi không phải đoán —
   * bản trước `at-risk` nghĩa là "chưa có người bảo hộ", và một nơi gọi đọc
   * nhãn cũ theo nghĩa cũ sẽ chỉ người dùng đi sai cửa.
   */
  | { state: 'at-risk'; why: 'seed-not-saved' }
  /** Hỏi được, và máy chủ có ghi vết đã xuất 24 từ. */
  | { state: 'safe' }
  /** CHƯA HỎI ĐƯỢC. Không hiện cảnh báo, cũng KHÔNG hiện lời trấn an. */
  | { state: 'unknown'; why: 'no-session' | 'server' };

/** Khoá tạm ẩn. Người dùng ẩn thì im tới mốc này. */
const SNOOZE_KEY = 'device_key_risk_snoozed_until';

/** Tạm ẩn 7 ngày. Đủ dài để không phiền, đủ ngắn để không quên. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Người này đã có 24 từ nằm ngoài máy chưa.
 *
 * KHÔNG ném trong mọi trường hợp — một dải nhắc không được làm sập màn tài khoản.
 */
export async function checkDeviceKeyRisk(): Promise<DeviceKeyRisk> {
  try {
    const h = await identity.getHealth();
    // Kiểm ĐÚNG trường được đọc, không kiểm rộng hơn. Một bản máy chủ cũ vắng
    // `seedExported` thì đây là "chưa hỏi được" — vắng KHÔNG được đọc thành
    // `false`, vì `false` ở đây là một khẳng định về người dùng chứ không phải
    // một giá trị mặc định.
    //
    // Cố ý KHÔNG đòi `hasDeviceKey`/`guardianCount` có mặt nữa: chúng không còn
    // đi vào quyết định, nên bắt chúng có mặt là biến một trường không dùng
    // thành cái cớ trả 'unknown' — im lặng ở đúng ca cần nói.
    if (typeof h?.seedExported !== 'boolean') {
      return { state: 'unknown', why: 'server' };
    }
    // Một điều kiện, một đại lượng. `guardianCount` KHÔNG có mặt ở đây, và đó
    // là chỗ sửa: người bảo hộ không thay được cụm 24 từ chừng nào đường khôi
    // phục bằng người bảo hộ chưa chạy tới cuối (lý do đầy đủ ở đầu tệp).
    return h.seedExported
      ? { state: 'safe' }
      : { state: 'at-risk', why: 'seed-not-saved' };
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
