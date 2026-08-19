/**
 * priceHistoryDb — LỊCH SỬ GIÁ theo TỪNG GIỜ, lưu trong SQLite.
 *
 * ── Vì sao đổi từ "so với lần mở app trước" sang "so theo giờ" ──────────────
 * Bản trước nhớ đúng một con số: giá của lần mở app gần nhất. Hệ quả là mức
 * biến động phụ thuộc vào THÓI QUEN MỞ APP chứ không phụ thuộc thị trường —
 * người mở mỗi ngày một lần thấy "tăng 6%", người mở năm phút một lần thấy
 * "0%", cùng một thị trường. Con số đó không so sánh được với ai, kể cả với
 * chính mình hôm qua.
 *
 * Nay mỗi giờ là một Ô. Đọc được giá lúc nào thì ghi vào ô của giờ đó; mức biến
 * động là so với ô GẦN NHẤT TRƯỚC ĐÓ. Ai mở app lúc nào cũng thấy cùng một con
 * số, và con số ấy có nghĩa: "so với một giờ trước".
 *
 * ── Vì sao SQLite chứ không AsyncStorage ────────────────────────────────────
 * Đây là dữ liệu CÓ HÀNG: nhiều mặt hàng × nhiều giờ, cần truy vấn "ô ngay
 * trước ô này" và cần dọn ô cũ. AsyncStorage chỉ là một cặp khoá-giá trị; làm
 * việc đó trên nó nghĩa là tự đọc cả cục JSON ra rồi tự lọc, mỗi lần mỗi to dần.
 *
 * Vẫn giữ AsyncStorage làm LƯỚI AN TOÀN — cùng lối `featureUsageDb`: máy nào
 * SQLite không mở được thì phần biến động vẫn chạy ở mức tối thiểu, thay vì mục
 * giá chết câm.
 */

import SQLite from 'react-native-sqlite-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

SQLite.enablePromise(true);

const DB_NAME = 'OriLife-Price.db';
const FALLBACK_KEY = '@aladin/price/fallback';

/** Giữ lịch sử bao nhiêu ngày. Quá đó thì dọn — không ai xem giá tuần trước. */
const RETENTION_DAYS = 7;

const HOUR_MS = 3600_000;

export interface PricePoint {
  commodity: string;
  /** Mốc ĐẦU GIỜ (ms) — mọi lần đọc trong cùng một giờ rơi vào cùng ô này. */
  hourBucket: number;
  priceVnd: number;
}

// ---------------------------------------------------------------------------
// Phép tính thuần — kiểm được không cần SQLite
// ---------------------------------------------------------------------------

/** Mốc thời gian → đầu giờ chứa nó. 10:37 và 10:59 cùng rơi vào ô 10:00. */
export function hourBucket(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/**
 * Ô gần nhất TRƯỚC ô đang xét.
 *
 * Không đòi đúng "một giờ trước": app có thể không chạy suốt đêm, và ô trước đó
 * là ô 6 giờ trước. So với nó vẫn đúng và vẫn nói được, còn đòi đúng ô kề mà
 * không có thì cả ngày không hiện được biến động nào.
 */
export function previousPoint(rows: PricePoint[], currentBucket: number): PricePoint | null {
  let best: PricePoint | null = null;
  for (const r of rows ?? []) {
    if (!r || r.hourBucket >= currentBucket) continue;
    if (!best || r.hourBucket > best.hourBucket) best = r;
  }
  return best;
}

/** Ô này cách ô kia mấy giờ — để màn nói "so với 3 giờ trước" cho đúng. */
export function hoursBetween(a: number, b: number): number {
  return Math.max(1, Math.round(Math.abs(a - b) / HOUR_MS));
}

// ---------------------------------------------------------------------------
// Kho
// ---------------------------------------------------------------------------

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

function open(): Promise<SQLite.SQLiteDatabase | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
        await db.executeSql(
          `CREATE TABLE IF NOT EXISTS price_history (
             commodity   TEXT    NOT NULL,
             hour_bucket INTEGER NOT NULL,
             price_vnd   REAL    NOT NULL,
             PRIMARY KEY (commodity, hour_bucket)
           )`,
        );
        return db;
      } catch {
        return null;
      }
    })();
  }
  return dbPromise;
}

/**
 * Ghi giá vào ô của giờ hiện tại.
 *
 * `INSERT OR REPLACE`: đọc nhiều lần trong cùng một giờ thì lần cuối thắng. Đó
 * là điều muốn — ô giờ đại diện cho "giá ở giờ đó", không phải "lần đọc đầu".
 */
export async function recordPrice(commodity: string, priceVnd: number, atMs: number): Promise<void> {
  if (!commodity || !Number.isFinite(priceVnd) || priceVnd <= 0) return;
  const bucket = hourBucket(atMs);
  const db = await open();
  if (db) {
    try {
      await db.executeSql(
        'INSERT OR REPLACE INTO price_history (commodity, hour_bucket, price_vnd) VALUES (?, ?, ?)',
        [commodity, bucket, priceVnd],
      );
      await db.executeSql('DELETE FROM price_history WHERE hour_bucket < ?', [
        bucket - RETENTION_DAYS * 24 * HOUR_MS,
      ]);
      return;
    } catch {
      /* rơi xuống lưới an toàn */
    }
  }
  await recordFallback(commodity, bucket, priceVnd);
}

/** Mọi ô đã lưu của một mặt hàng, mới nhất trước. */
export async function historyOf(commodity: string, limit = 48): Promise<PricePoint[]> {
  const db = await open();
  if (db) {
    try {
      const [res] = await db.executeSql(
        `SELECT commodity, hour_bucket, price_vnd FROM price_history
          WHERE commodity = ? ORDER BY hour_bucket DESC LIMIT ?`,
        [commodity, limit],
      );
      const out: PricePoint[] = [];
      for (let i = 0; i < res.rows.length; i += 1) {
        const r = res.rows.item(i);
        out.push({
          commodity: r.commodity,
          hourBucket: Number(r.hour_bucket),
          priceVnd: Number(r.price_vnd),
        });
      }
      return out;
    } catch {
      /* rơi xuống lưới an toàn */
    }
  }
  return readFallback(commodity);
}

// ── Lưới an toàn: hai ô gần nhất mỗi mặt hàng, đủ để tính biến động ─────────

type FallbackMap = Record<string, PricePoint[]>;

async function readAllFallback(): Promise<FallbackMap> {
  try {
    const raw = await AsyncStorage.getItem(FALLBACK_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as FallbackMap) : {};
  } catch {
    return {};
  }
}

async function readFallback(commodity: string): Promise<PricePoint[]> {
  const all = await readAllFallback();
  return Array.isArray(all[commodity]) ? all[commodity] : [];
}

async function recordFallback(commodity: string, bucket: number, priceVnd: number): Promise<void> {
  try {
    const all = await readAllFallback();
    const rows = (all[commodity] ?? []).filter(r => r.hourBucket !== bucket);
    rows.unshift({ commodity, hourBucket: bucket, priceVnd });
    // Chỉ giữ HAI ô: lưới an toàn cần đủ để tính biến động, không cần lịch sử.
    all[commodity] = rows.sort((a, b) => b.hourBucket - a.hourBucket).slice(0, 2);
    await AsyncStorage.setItem(FALLBACK_KEY, JSON.stringify(all));
  } catch {
    /* hết chỗ → bỏ qua, lần sau ghi lại */
  }
}
