/**
 * space3d/geo — Toán ĐỊA-LÝ → KHÔNG-GIAN 3D của vườn.
 *
 * Quy ước hệ trục three.js dùng xuyên suốt hệ thống 3D:
 *   +X = Đông   ·   +Y = lên trời   ·   −Z = Bắc   (nên +Z = Nam)
 * Đơn vị = MÉT thật. Gốc (0,0,0) = tâm vườn (trọng-tâm đa-giác ranh giới).
 *
 * "Điểm nối của vườn" = `Farm.coordinates` ({lat,lng}[]) — chính là đa-giác ranh
 * giới người dùng đã vẽ khi tạo vườn. Ở đây quy về mét phẳng (equirectangular:
 * sai số < 0.1% với vườn cỡ vài km, thừa đủ cho nông trại).
 *
 * File THUẦN TÍNH (không import three/react) → test được bằng jest.
 */

export interface LatLng { lat: number; lng: number }

/** Điểm mặt đất trong hệ vườn (mét). y luôn = 0 nên không lưu. */
export interface Vec2 { x: number; z: number }

const EARTH_R = 6378137; // bán kính xích đạo WGS-84 (m)
const D2R = Math.PI / 180;

/** Vườn không có ranh giới → dựng ô vuông mặc định (nửa-cạnh, mét). */
export const FALLBACK_HALF_SIZE = 18;

/** lat/lng → mét trong hệ vườn, quanh `origin`. */
export function latLngToMeters(p: LatLng, origin: LatLng): Vec2 {
  const x = (p.lng - origin.lng) * D2R * EARTH_R * Math.cos(origin.lat * D2R);
  const north = (p.lat - origin.lat) * D2R * EARTH_R;
  return { x, z: -north }; // Bắc là −Z
}

/** Trọng-tâm đơn giản (trung bình các đỉnh) — đủ dùng làm gốc toạ-độ. */
export function centroidLatLng(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  let lat = 0, lng = 0;
  for (const p of points) { lat += p.lat; lng += p.lng; }
  return { lat: lat / points.length, lng: lng / points.length };
}

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

export function ringBounds(ring: Vec2[]): Bounds {
  if (ring.length === 0) {
    return { minX: -FALLBACK_HALF_SIZE, maxX: FALLBACK_HALF_SIZE, minZ: -FALLBACK_HALF_SIZE, maxZ: FALLBACK_HALF_SIZE };
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Bán kính bao (mét) từ tâm — dùng đặt camera toàn cảnh. */
export function ringRadius(ring: Vec2[]): number {
  const b = ringBounds(ring);
  return Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 || FALLBACK_HALF_SIZE;
}

/** Diện tích đa-giác (m², luôn ≥ 0) — dùng hiển thị + kiểm tra ranh giới hợp lệ. */
export function ringArea(ring: Vec2[]): number {
  if (ring.length < 3) return 0;
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j].x + ring[i].x) * (ring[j].z - ring[i].z);
  }
  return Math.abs(s / 2);
}

/** Ray-casting: điểm nằm TRONG đa-giác? (biên coi như trong, sai lệch không đáng kể). */
export function pointInRing(p: Vec2, ring: Vec2[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, zi = ring[i].z;
    const xj = ring[j].x, zj = ring[j].z;
    const hits = (zi > p.z) !== (zj > p.z) && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi || 1e-12) + xi;
    if (hits) inside = !inside;
  }
  return inside;
}

/** Ô vuông mặc định khi vườn chưa vẽ ranh giới (đủ chỗ cho `treeCount` cây). */
export function fallbackRing(treeCount: number): Vec2[] {
  // ~9 m² mỗi cây, tối thiểu 36×36 m để nhìn không quá chật.
  const half = Math.max(FALLBACK_HALF_SIZE, Math.sqrt(Math.max(1, treeCount) * 9) / 2 + 6);
  return [
    { x: -half, z: -half }, { x: half, z: -half },
    { x: half, z: half }, { x: -half, z: half },
  ];
}

/**
 * Ranh giới vườn → đa-giác mét + gốc lat/lng.
 * < 3 đỉnh (chưa vẽ ranh giới) → ô vuông mặc định, `hasBoundary = false`.
 */
export function buildFarmRing(
  boundary: LatLng[] | undefined | null,
  treeCount: number,
): { ring: Vec2[]; origin: LatLng | null; hasBoundary: boolean } {
  const pts = (boundary ?? []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  if (pts.length < 3) {
    return { ring: fallbackRing(treeCount), origin: pts.length ? centroidLatLng(pts) : null, hasBoundary: false };
  }
  const origin = centroidLatLng(pts);
  const ring = pts.map((p) => latLngToMeters(p, origin));
  // Ranh giới suy biến (mọi đỉnh gần trùng nhau) → vẫn phải có chỗ đặt cây.
  if (ringArea(ring) < 4) {
    return { ring: fallbackRing(treeCount), origin, hasBoundary: false };
  }
  return { ring, origin, hasBoundary: true };
}

/** Băm chuỗi → hạt số nguyên (FNV-1a) để "ngẫu nhiên" ỔN ĐỊNH theo id. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — PRNG nhỏ, cùng hạt → cùng dãy số. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Vị-trí NGẪU-NHIÊN nhưng ỔN-ĐỊNH của 1 cây trong vườn (mặc định khi cây chưa có
 * GPS và người dùng chưa đặt tay). Cùng `seed` (= tree_id) → LUÔN ra cùng chỗ,
 * nên cây không "nhảy" mỗi lần mở màn.
 * Rejection sampling trong hộp bao; quá 64 lần không trúng → lùi về tâm hộp.
 */
export function seededPointInRing(seed: string, ring: Vec2[]): Vec2 {
  const b = ringBounds(ring);
  const rng = makeRng(hashSeed(seed));
  const inset = 0.9; // co vào trong để cây không mọc ngay trên hàng rào
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  for (let i = 0; i < 64; i++) {
    const x = cx + (b.minX + rng() * (b.maxX - b.minX) - cx) * inset;
    const z = cz + (b.minZ + rng() * (b.maxZ - b.minZ) - cz) * inset;
    if (ring.length < 3 || pointInRing({ x, z }, ring)) return { x, z };
  }
  return { x: cx, z: cz };
}
