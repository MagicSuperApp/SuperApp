// Build 52 (2026-05-17) — Mobile-side tree dedup cache
// Build 58 (2026-05-26) — Persist to AsyncStorage + per-farm history
//
// Root cause "1 cây ra 2 mã":
// - IDGenerator.swift dùng grid hash từ GPS để generate tree_id
// - LocationHelper desiredAccuracy = Best nhưng accuracy ~5-15m dưới tán cây
// - GPS jitter > grid → fall vào grid cell khác → 2 tree_id khác
// - Backend KHÔNG có spatial dedup — trusts mobile's tree_id is unique
//
// Strategy: client-side dedup cache với confirm dialog.
//
// Build 58 changes (field test 25/5 feedback):
// - Persist sang AsyncStorage thay vì in-memory only (app restart không mất)
// - Lưu N scan gần nhất mỗi farm thay vì chỉ 1 (Map<farmId, scans[]>)
// - Mở rộng dedup window 60s → 5 phút (test 6 cây mất thời gian hơn 60s)
// - Mở rộng distance 1.5m → 8m (khớp grid 8m mới + GPS jitter under canopy)
// - Expire scans cũ hơn 30 ngày khi load

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@aladin/treeDedupCache/v2';
const DEDUP_TIME_WINDOW_MS = 5 * 60_000; // 5 phút (was 60s)
const DEDUP_DISTANCE_M = 8.0; // 8m (was 1.5m) — match new IDGenerator grid
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày
const MAX_SCANS_PER_FARM = 100;

interface CachedTreeScan {
  treeId: string;
  farmId: string;
  lat: number;
  lng: number;
  capturedAt: number; // epoch ms
}

type CacheMap = Record<string, CachedTreeScan[]>; // farmId → scans

let cache: CacheMap = {};
let loaded = false;
let loadPromise: Promise<void> | null = null;

// ─────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────

/**
 * Load cache từ AsyncStorage. Gọi lần đầu app khởi động. Idempotent — calls
 * sau đều no-op nếu đã loaded.
 */
export async function loadTreeDedupCache(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: CacheMap = JSON.parse(raw);
        const cutoff = Date.now() - EXPIRY_MS;
        // Lọc bỏ scans hết hạn để cache không phình mãi
        cache = {};
        for (const [farmId, scans] of Object.entries(parsed)) {
          const fresh = scans.filter((s) => s.capturedAt >= cutoff);
          if (fresh.length > 0) cache[farmId] = fresh;
        }
      }
    } catch (err) {
      // Corrupted storage — start fresh, không crash app
      console.warn('[treeDedupCache] Load failed, starting empty:', err);
      cache = {};
    } finally {
      loaded = true;
    }
  })();
  return loadPromise;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    // Storage full or disk error — log nhưng không crash, in-memory cache
    // vẫn hoạt động hết phiên app.
    console.warn('[treeDedupCache] Persist failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Distance helper
// ─────────────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Check xem scan mới có khả năng là cây đã quét gần đây không.
 *
 * Trả `cachedTreeId` nếu duplicate (caller hỏi user xác nhận), hoặc
 * `likelyDuplicate: false` nếu chắc chắn là cây mới.
 *
 * Khác build 52: scan toàn bộ history của farm (không chỉ last 1), trong
 * khoảng thời gian + khoảng cách rộng hơn.
 */
export function checkPotentialDuplicate(
  farmId: string,
  lat: number,
  lng: number,
  now: number = Date.now(),
):
  | { likelyDuplicate: true; cachedTreeId: string; distanceM: number; ageS: number }
  | { likelyDuplicate: false } {
  if (!loaded) {
    // Caller quên gọi loadTreeDedupCache() lúc app start — không block,
    // chỉ trả "no duplicate" (safe default) và log để debug.
    console.warn('[treeDedupCache] check() called before load() — returning false');
    return { likelyDuplicate: false };
  }

  // GPS hỏng — không thể dedup
  if (lat === 0 || lng === 0 || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { likelyDuplicate: false };
  }

  const scans = cache[farmId];
  if (!scans || scans.length === 0) return { likelyDuplicate: false };

  let bestMatch: { scan: CachedTreeScan; distance: number } | null = null;
  for (const scan of scans) {
    const ageMs = now - scan.capturedAt;
    if (ageMs > DEDUP_TIME_WINDOW_MS) continue;

    const distM = haversineMeters(scan.lat, scan.lng, lat, lng);
    if (distM > DEDUP_DISTANCE_M) continue;

    if (!bestMatch || distM < bestMatch.distance) {
      bestMatch = { scan, distance: distM };
    }
  }

  if (!bestMatch) return { likelyDuplicate: false };

  return {
    likelyDuplicate: true,
    cachedTreeId: bestMatch.scan.treeId,
    distanceM: bestMatch.distance,
    ageS: Math.round((now - bestMatch.scan.capturedAt) / 1000),
  };
}

/**
 * Cache 1 scan mới. Gọi sau khi user confirm tree creation hoặc sau khi server
 * trả về tree_id canonical.
 */
export async function cacheTreeScan(
  treeId: string,
  farmId: string,
  lat: number,
  lng: number,
  now: number = Date.now(),
): Promise<void> {
  if (!loaded) await loadTreeDedupCache();

  const entry: CachedTreeScan = { treeId, farmId, lat, lng, capturedAt: now };
  const existing = cache[farmId] ?? [];

  // Dedup theo treeId: nếu đã có tree_id này, update GPS+time thay vì duplicate row
  const idx = existing.findIndex((s) => s.treeId === treeId);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }

  // Giữ N scans gần nhất, cũ nhất rớt
  existing.sort((a, b) => b.capturedAt - a.capturedAt);
  cache[farmId] = existing.slice(0, MAX_SCANS_PER_FARM);

  await persist();
}

/**
 * Khi backend trả về `matchedTreeId` khác local `tree_id`, mobile cần update
 * cache để lần sau quét cùng vị trí pick up tree_id canonical (server-side).
 */
export async function updateCanonicalTreeId(
  localTreeId: string,
  canonicalTreeId: string,
  farmId: string,
): Promise<void> {
  if (!loaded) await loadTreeDedupCache();
  if (localTreeId === canonicalTreeId) return;

  const scans = cache[farmId];
  if (!scans) return;

  let changed = false;
  for (const scan of scans) {
    if (scan.treeId === localTreeId) {
      scan.treeId = canonicalTreeId;
      changed = true;
    }
  }
  if (changed) await persist();
}

export async function clearTreeDedupCache(): Promise<void> {
  cache = {};
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function getCacheForDebug(): CacheMap {
  return cache;
}

/**
 * Test helper — reset toàn bộ module state (cache + loaded flag + pending
 * promise). KHÔNG dùng trong production code.
 */
export function _resetForTest(): void {
  cache = {};
  loaded = false;
  loadPromise = null;
}
