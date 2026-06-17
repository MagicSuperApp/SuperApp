// modules/trace/utils/implicitParent.ts
//
// Build 54 V5 (CPO Đức 2026-05-18, sau khi verify Tiger backend) — implicit
// parent auto-creation cho Quick Actions "Định danh cây" / "Quét quả".
//
// Tiger backend constraints (xác nhận từ test 2026-05-18):
//   - POST /farms: region_code REQUIRED (string max 20) — gửi 'auto' OK
//   - POST /trees: farm_id REQUIRED. Tree GPS phải NẰM TRONG farm boundary
//   - POST /fruits: KHÔNG tồn tại — fruits chỉ sinh qua /captures/3d + MeshGPU
//   - geohash_7 REQUIRED cho tree, 7 chars [a-z0-9]
//
// → Khi user tap "Định danh cây" hoặc "Quét quả" tại GPS X:
//   1. Tìm farm chứa GPS X trong local DB (point-in-polygon check)
//   2. Nếu không → tự tạo farm 22m × 22m centered tại X
//      (22m thay vì 20m chính xác CPO yêu cầu — buffer 1m mỗi cạnh để
//       tree GPS không rơi biên do GPS jitter sau khi farm save xong)
//   3. Tree GPS = X (centroid của farm) → guaranteed inside
//   4. Compute geohash_7 từ X
//
// References:
//   - docs/PRINCIPLES/01-INDEPENDENT-FEATURE-OPERATION.md §3.4
//   - /Users/ductiger/Products/Agents/BuildApp/field-test-build53/B54-AUDIT-V5-TREE-FRUIT.md

import { isPointInPolygon, haversineMeters, type Coord } from './polygonGuards';
import aladinAPI from '../../../services/aladin-api';
import { database } from '../../../utils/database';

// ── Constants ────────────────────────────────────────────────────────────────
/** CPO Đức ordered 20m × 20m. Em build 22m (+ 1m buffer mỗi cạnh) để tree GPS
 *  không rơi BIÊN boundary do GPS jitter sau khi farm save xong. */
export const IMPLICIT_FARM_HALF_SIDE_METERS = 11; // 22m total edge
export const IMPLICIT_FARM_REGION_CODE = 'auto';
export const GPS_ACCURACY_REQUIRED_FOR_IMPLICIT_M = 50;

/** Maximum distance from existing tree to consider "same tree" (dedup). Inside
 *  this radius we reuse the existing tree instead of creating implicit one. */
export const TREE_DEDUP_RADIUS_M = 5;

// ── Concurrency lock (audit fix A1: prevent double-tap creating dupes) ───────
let implicitCreationInFlight = false;
export function isImplicitCreationInFlight(): boolean {
  return implicitCreationInFlight;
}

// ── Geohash 7 encoder (standard base32) ──────────────────────────────────────
// Reference: https://en.wikipedia.org/wiki/Geohash
// Precision 7 ≈ 153m × 153m cell — comfortably contains a 22m × 22m farm.

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode GPS coordinates to a geohash string of the requested precision.
 * Standard interleaved-bit algorithm: alternate bisecting lng/lat ranges.
 */
export function computeGeohash(lat: number, lng: number, precision: number = 7): string {
  if (lat < -90 || lat > 90) throw new Error(`Invalid lat: ${lat}`);
  if (lng < -180 || lng > 180) throw new Error(`Invalid lng: ${lng}`);
  if (precision < 1 || precision > 12) throw new Error(`Invalid precision: ${precision}`);

  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let isLng = true;
  let bit = 0;
  let charBits = 0;
  let result = '';

  while (result.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        charBits |= (1 << (4 - bit));
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        charBits |= (1 << (4 - bit));
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) {
      result += BASE32[charBits];
      charBits = 0;
      bit = 0;
    }
  }
  return result;
}

export function computeGeohash7(lat: number, lng: number): string {
  return computeGeohash(lat, lng, 7);
}

// ── Square boundary builder ──────────────────────────────────────────────────

const R_EARTH = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Build a square boundary centered at `center` with the requested half-side
 * length (in meters). Returns the polygon as both app-format coordinates
 * (lat/lng pairs) and a GeoJSON Polygon ready for `aladinAPI.createFarm`.
 *
 * Winding order: CCW when viewed from above (south → east → north → west).
 * GeoJSON closes the polygon (first === last).
 */
export function buildSquareBoundary(
  center: Coord,
  halfSideMeters: number,
): {
  coords: Coord[];
  geoJson: { type: 'Polygon'; coordinates: number[][][] };
} {
  // Convert meters to degrees at this latitude
  const dLat = halfSideMeters / 111195; // degrees of latitude per meter
  const cosLat = Math.cos(toRad(center.lat));
  const dLng = halfSideMeters / (111195 * Math.max(cosLat, 0.01));

  // Four corners (CCW from south-west)
  const sw = { lat: center.lat - dLat, lng: center.lng - dLng };
  const se = { lat: center.lat - dLat, lng: center.lng + dLng };
  const ne = { lat: center.lat + dLat, lng: center.lng + dLng };
  const nw = { lat: center.lat + dLat, lng: center.lng - dLng };

  const coords: Coord[] = [sw, se, ne, nw];

  // GeoJSON Polygon: [lng, lat] pairs, closed ring
  const ring = [
    [sw.lng, sw.lat],
    [se.lng, se.lat],
    [ne.lng, ne.lat],
    [nw.lng, nw.lat],
    [sw.lng, sw.lat], // close
  ];

  return {
    coords,
    geoJson: { type: 'Polygon', coordinates: [ring] },
  };
}

// ── Friendly farm name from user.name ────────────────────────────────────────

/**
 * Format farm name from user's name. Pattern: "Vườn của {name}".
 *
 * Examples:
 *   "Cường"       → "Vườn của Cường"
 *   "Quang Giang" → "Vườn của Quang Giang"
 *   undefined     → "Vườn của tôi"  (graceful fallback for missing name)
 *   "Người dùng"  → "Vườn của Người dùng" (default DID name — acceptable)
 */
export function formatImplicitFarmName(userName: string | null | undefined): string {
  const name = (userName ?? '').trim();
  if (!name) return 'Vườn của tôi';
  return `Vườn của ${name}`;
}

// ── Implicit farm: find-or-create ────────────────────────────────────────────

export interface GetOrCreateFarmArgs {
  userDid: string;
  userName: string | null | undefined;
  gps: { lat: number; lng: number };
  accuracyMeters?: number | null;
}

export interface ImplicitFarmResult {
  farmId: string;
  name: string;
  created: boolean;     // true if a new implicit farm was created
  boundary: Coord[];
}

/**
 * Find an existing farm (in local DB) whose boundary contains `gps`, or
 * auto-create a new implicit 22m × 22m square farm centered at `gps`.
 *
 * Audit fix A2: rejects if GPS accuracy is worse than
 * GPS_ACCURACY_REQUIRED_FOR_IMPLICIT_M (50m) — better to fail loud than
 * pin a farm to a wildly wrong location.
 *
 * Audit fix A1: a module-level in-flight lock prevents double-tap from
 * spawning two implicit farms at the same GPS.
 */
export async function getOrCreateImplicitFarm(
  args: GetOrCreateFarmArgs,
): Promise<ImplicitFarmResult> {
  // Audit A2: GPS accuracy gate
  if (
    args.accuracyMeters != null &&
    args.accuracyMeters > GPS_ACCURACY_REQUIRED_FOR_IMPLICIT_M
  ) {
    throw new Error(
      `GPS accuracy too poor (~${Math.round(args.accuracyMeters)}m). ` +
      `Stand in an open area and try again.`,
    );
  }

  // Audit A1: concurrency lock
  if (implicitCreationInFlight) {
    throw new Error('Another implicit-parent creation is already in progress');
  }
  implicitCreationInFlight = true;

  try {
    // 1. Search existing farms in local DB
    const localFarms = await database.getFarms(args.userDid);
    for (const farm of localFarms) {
      const coords = farm.coordinates as Coord[] | undefined;
      if (!coords || coords.length < 3) continue;
      if (isPointInPolygon(args.gps, coords)) {
        return {
          farmId: farm.id,
          name: farm.name,
          created: false,
          boundary: coords,
        };
      }
    }

    // 2. None contains GPS → create a new implicit farm
    const farmId = `farm-auto-${Date.now()}`;
    const farmName = formatImplicitFarmName(args.userName);
    const boundary = buildSquareBoundary(args.gps, IMPLICIT_FARM_HALF_SIDE_METERS);

    // Save local FIRST (offline-first)
    await database.saveFarm({
      id: farmId,
      name: farmName,
      coordinates: boundary.coords,
      userId: args.userDid,
    });

    // POST to backend (best-effort)
    try {
      await aladinAPI.createFarm({
        farm_id: farmId,
        owner_did: args.userDid,
        region_code: IMPLICIT_FARM_REGION_CODE,
        farm_name: farmName,
        boundary: boundary.geoJson,
      });
    } catch (err: any) {
      console.warn('[implicitParent] backend createFarm failed → đẩy sync queue:', err?.message);
      // Local save đã xong; backend lỗi → ĐẨY VÀO QUEUE để retry thật (trước đây chỉ
      // console.warn "will retry" mà KHÔNG có queue → mất dữ liệu khi offline/backend down).
      // import động tránh vòng phụ-thuộc: implicitParent → syncService → syncDispatch → implicitParent.
      try {
        const { syncService } = await import('../../../services/syncService');
        await syncService.addSyncItem('farm_update', {
          farm: { id: farmId, userId: args.userDid, coordinates: boundary.coords, name: farmName },
        });
      } catch (e: any) {
        console.warn('[implicitParent] enqueue farm_update failed:', e?.message);
      }
    }

    return {
      farmId,
      name: farmName,
      created: true,
      boundary: boundary.coords,
    };
  } finally {
    implicitCreationInFlight = false;
  }
}

// ── Implicit tree: find-or-create ────────────────────────────────────────────

export interface GetOrCreateTreeArgs {
  farmId: string;
  userDid: string;
  gps: { lat: number; lng: number };
  accuracyMeters?: number | null;
}

export interface ImplicitTreeResult {
  treeId: string;
  created: boolean;  // true if a new tree was created (vs reused nearby)
}

/**
 * Find an existing tree within TREE_DEDUP_RADIUS_M (5m) of `gps`, or auto-create
 * a new tree at `gps` linked to `farmId`. Used by the "Quét quả" quick action
 * where the user wants to capture a fruit but no tree exists yet.
 *
 * Tree is created as a "blank" record (no DINO vector / no image evidence) —
 * the proper Bio-ID image upload happens later via ScannerSDK or evidence
 * endpoints. This blank tree gives the user something to attach 3D captures
 * and fruits to immediately.
 */
export async function getOrCreateImplicitTree(
  args: GetOrCreateTreeArgs,
): Promise<ImplicitTreeResult> {
  if (
    args.accuracyMeters != null &&
    args.accuracyMeters > GPS_ACCURACY_REQUIRED_FOR_IMPLICIT_M
  ) {
    throw new Error(
      `GPS accuracy too poor (~${Math.round(args.accuracyMeters)}m). ` +
      `Stand in an open area and try again.`,
    );
  }

  // 1. Check local trees for a nearby one (dedup)
  const localTrees = await database.getTrees(args.farmId);
  for (const tree of localTrees) {
    if (tree.latitude == null || tree.longitude == null) continue;
    const dist = haversineMeters(
      { lat: tree.latitude, lng: tree.longitude },
      args.gps,
    );
    if (dist < TREE_DEDUP_RADIUS_M) {
      return { treeId: tree.id, created: false };
    }
  }

  // 2. Create new implicit tree
  const treeId = `tree-auto-${Date.now()}`;
  const geohash7 = computeGeohash7(args.gps.lat, args.gps.lng);

  // Save local FIRST
  await database.saveTree({
    id: treeId,
    farmId: args.farmId,
    code: treeId,
    images: [],
    estimatedFruits: 0,
    fruitCount: 0,
    latitude: args.gps.lat,
    longitude: args.gps.lng,
  });

  // POST to backend (best-effort)
  try {
    await aladinAPI.createTree({
      id: treeId,
      region_code: IMPLICIT_FARM_REGION_CODE,
      farm_id: args.farmId,
      geohash_7: geohash7,
      latitude: args.gps.lat,
      longitude: args.gps.lng,
      metadata: { implicit: true, created_via: 'quick_action' },
    });
  } catch (err: any) {
    console.warn('[implicitParent] backend createTree failed → đẩy sync queue:', err?.message);
    // Như createFarm: đẩy vào queue để retry thật thay vì nuốt lỗi (chống mất cây khi offline).
    try {
      const { syncService } = await import('../../../services/syncService');
      await syncService.addSyncItem('tree_identification', {
        tree: { id: treeId, farmId: args.farmId, latitude: args.gps.lat, longitude: args.gps.lng },
      });
    } catch (e: any) {
      console.warn('[implicitParent] enqueue tree_identification failed:', e?.message);
    }
  }

  return { treeId, created: true };
}
