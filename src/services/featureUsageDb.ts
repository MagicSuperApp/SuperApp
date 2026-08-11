// services/featureUsageDb.ts
//
// Kho hành vi người dùng: mỗi lần MỞ một tính năng (route xuất hiện) ghi 1 dòng.
// Dữ liệu ở lại máy, KHÔNG gửi lên server.
//
// SQLite là kho chính (OriLife-Usage.db, handle RIÊNG — DB chính utils/database.ts
// chỉ mở khi databaseManager.initializeForUser() được gọi, mà hiện KHÔNG nơi nào
// gọi, nên không thể dựa vào nó).
//
// AsyncStorage là lưới an toàn: nếu SQLite không mở/ghi được (thư viện chưa link,
// máy lạ…), đếm vẫn chạy để Quick Action không chết câm. Trạng thái nào đang dùng
// được ghi rõ trong log — xem usageBackend().

import SQLite from 'react-native-sqlite-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

SQLite.enablePromise(true);

const DB_NAME = 'OriLife-Usage.db';
const FALLBACK_KEY = 'feature_usage_counts_fallback';
const RETENTION_DAYS = 90;

export type UsageCounts = Record<string, number>;

type Backend = 'sqlite' | 'asyncstorage' | 'unknown';
let backend: Backend = 'unknown';

export function usageBackend(): Backend {
  return backend;
}

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

/** Mở DB + tạo bảng. Trả null nếu SQLite không dùng được (→ rơi sang AsyncStorage). */
function open(): Promise<SQLite.SQLiteDatabase | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
        await db.executeSql(`
          CREATE TABLE IF NOT EXISTS feature_usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            feature_key TEXT NOT NULL,
            context TEXT,
            used_at DATETIME NOT NULL
          )
        `);
        await db.executeSql(`
          CREATE INDEX IF NOT EXISTS idx_feature_usage_key_time
            ON feature_usage_events (feature_key, used_at)
        `);
        // Chống phình bảng: giữ 90 ngày gần nhất.
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
        await db.executeSql('DELETE FROM feature_usage_events WHERE used_at < ?', [cutoff]);
        backend = 'sqlite';
        console.log('[featureUsageDb] SQLite sẵn sàng:', DB_NAME);
        return db;
      } catch (error) {
        backend = 'asyncstorage';
        console.warn(
          '[featureUsageDb] Không mở được SQLite — chuyển sang AsyncStorage:',
          error,
        );
        return null;
      }
    })();
  }
  return dbPromise;
}

async function readFallback(): Promise<UsageCounts> {
  try {
    const raw = await AsyncStorage.getItem(FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as UsageCounts) : {};
  } catch {
    return {};
  }
}

/** Ghi 1 lượt dùng. Không bao giờ ném lỗi — theo dõi hành vi không được chặn điều hướng. */
export async function insertUsage(
  featureKey: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const db = await open();
  if (db) {
    try {
      await db.executeSql(
        'INSERT INTO feature_usage_events (feature_key, context, used_at) VALUES (?, ?, ?)',
        [featureKey, context ? JSON.stringify(context) : null, new Date().toISOString()],
      );
      console.log(`[featureUsageDb] +1 lượt dùng: ${featureKey}`);
      return;
    } catch (error) {
      console.warn('[featureUsageDb] INSERT lỗi — dùng AsyncStorage:', error);
      backend = 'asyncstorage';
    }
  }
  try {
    const counts = await readFallback();
    counts[featureKey] = (counts[featureKey] ?? 0) + 1;
    await AsyncStorage.setItem(FALLBACK_KEY, JSON.stringify(counts));
    console.log(`[featureUsageDb] +1 lượt dùng (fallback): ${featureKey} = ${counts[featureKey]}`);
  } catch (error) {
    console.warn('[featureUsageDb] Ghi fallback lỗi:', error);
  }
}

/** Số lượt dùng của MỌI tính năng đã từng mở. Không có dữ liệu → {}. */
export async function getUsageCounts(): Promise<UsageCounts> {
  const db = await open();
  if (db) {
    try {
      const [results] = await db.executeSql(
        `SELECT feature_key, COUNT(*) AS use_count
           FROM feature_usage_events
          GROUP BY feature_key`,
      );
      const counts: UsageCounts = {};
      for (let i = 0; i < results.rows.length; i++) {
        const r = results.rows.item(i);
        counts[r.feature_key] = r.use_count;
      }
      return counts;
    } catch (error) {
      console.warn('[featureUsageDb] SELECT lỗi — đọc AsyncStorage:', error);
      backend = 'asyncstorage';
    }
  }
  return readFallback();
}

/** Xoá sạch lịch sử hành vi (dùng khi cần kiểm thử lại từ đầu). */
export async function resetUsage(): Promise<void> {
  const db = await open();
  if (db) {
    try {
      await db.executeSql('DELETE FROM feature_usage_events');
    } catch (error) {
      console.warn('[featureUsageDb] Xoá SQLite lỗi:', error);
    }
  }
  await AsyncStorage.removeItem(FALLBACK_KEY).catch(() => {});
}
