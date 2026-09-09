/**
 * Mốc hoãn sao lưu — ghi, đọc, xoá.
 *
 * Thứ đáng canh nhất ở đây không phải đường ghi, mà là cách ĐỌC HỎNG được trả
 * về. Trả `0` cho một giá trị hỏng là biến "đọc hỏng" thành "đã hoãn từ năm
 * 1970": một dữ kiện sai vẫn đi tiếp được vào phép so sánh ở nơi khác, và ở đó
 * nó không còn tự khai được là thiếu.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SEED_BACKUP_DEFERRED_KEY,
  markSeedBackupDeferred,
  readSeedBackupDeferredAt,
  clearSeedBackupDeferred,
} from './seedBackupReminder';

beforeEach(async () => { await AsyncStorage.clear(); });

describe('mốc hoãn sao lưu', () => {
  it('chưa hoãn lần nào ⇒ null, KHÔNG phải 0', async () => {
    await expect(readSeedBackupDeferredAt()).resolves.toBeNull();
  });

  it('ghi rồi đọc lại đúng mốc', async () => {
    await markSeedBackupDeferred(1_757_000_000_000);
    await expect(readSeedBackupDeferredAt()).resolves.toBe(1_757_000_000_000);
  });

  it('xoá ⇒ về lại null', async () => {
    await markSeedBackupDeferred(1_757_000_000_000);
    await clearSeedBackupDeferred();
    await expect(readSeedBackupDeferredAt()).resolves.toBeNull();
  });

  it('giá trị hỏng trong máy ⇒ null, không phải một mốc thời gian bịa ra', async () => {
    for (const rac of ['', 'hom-qua', 'NaN', '-1', '0']) {
      await AsyncStorage.setItem(SEED_BACKUP_DEFERRED_KEY, rac);
      await expect(readSeedBackupDeferredAt()).resolves.toBeNull();
    }
  });
});
