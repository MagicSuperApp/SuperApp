/**
 * MỐC HOÃN SAO LƯU — người dùng bấm "Nhắc tôi sau" ở màn hoàn tất đăng ký.
 *
 * ── Vì sao có tệp này ───────────────────────────────────────────────────────
 * Cụm 24 từ là đường khôi phục DUY NHẤT, và trước bản này luồng đăng ký không
 * đi qua `SeedExportScreen` một lần nào (`SignUpBiometricScreen` → `SignUpComplete`
 * → `Main`). Phần lớn người dùng chưa từng nhìn thấy cụm từ của mình: đường
 * khôi phục có tồn tại mà họ không có vé vào.
 *
 * Màn hoàn tất nay hỏi một lần, KHÔNG ép. Chọn "Nhắc tôi sau" thì ghi mốc ở
 * đây.
 *
 * ── ⚠️ CHƯA CÓ NƠI ĐỌC MỐC NÀY — phần nhắc-lại chưa làm ────────────────────
 * Nói thẳng ra để không ai đọc tệp này rồi tưởng vòng nhắc đã khép. Hôm nay
 * chỉ có phần GHI (`markSeedBackupDeferred`) và phần XOÁ
 * (`clearSeedBackupDeferred`, gọi khi người dùng đã thật sự mở màn 24 từ).
 * Không có chỗ nào gọi `readSeedBackupDeferredAt` để bật lời nhắc thứ hai.
 *
 * Vì sao dừng ở đây thay vì móc đại vào một màn: chỗ nhắc hợp lý là lúc vườn
 * đủ lớn để mất là đau — "cây thứ 10" chẳng hạn — nhưng số cây hiện ra ở HAI
 * chỗ độc lập (`screens/TreeManagementScreen.tsx` và
 * `modules/trace/screens/DashboardScreen.tsx`), và cả hai đều không phải màn
 * mà người trồng vườn đi qua hằng ngày một cách chắc chắn. Chọn bừa một trong
 * hai là dựng một cái móc trông như đã xong mà phần lớn người dùng không bao
 * giờ chạm tới — tệ hơn là để trống và ghi rõ nó còn trống.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Một khoá, một nghĩa: "người dùng đã hoãn việc xem cụm 24 từ, lúc nào". */
export const SEED_BACKUP_DEFERRED_KEY = '@phoenixkey/seed_backup_deferred_at';

/** Ghi mốc hoãn. `now` truyền vào được để bài kiểm không phụ thuộc đồng hồ thật. */
export async function markSeedBackupDeferred(now: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(SEED_BACKUP_DEFERRED_KEY, String(now));
}

/**
 * Mốc hoãn, hoặc `null` khi chưa từng hoãn.
 *
 * Giá trị hỏng (chuỗi không phải số, số ≤ 0) trả `null` chứ KHÔNG trả `0`:
 * `0` là một mốc thời gian hợp lệ, nên trả nó là biến "đọc hỏng" thành "đã hoãn
 * từ năm 1970" — một dữ kiện sai đi tiếp được vào phép so sánh ở nơi khác.
 */
export async function readSeedBackupDeferredAt(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(SEED_BACKUP_DEFERRED_KEY);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Người dùng đã mở màn 24 từ ⇒ mốc hoãn hết nghĩa. */
export async function clearSeedBackupDeferred(): Promise<void> {
  await AsyncStorage.removeItem(SEED_BACKUP_DEFERRED_KEY);
}
