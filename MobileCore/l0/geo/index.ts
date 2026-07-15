/**
 * MobileCore l0/geo — pure geometry/GPS helpers for polygon-based farm tracing.
 *
 * Harvested from src/modules/trace/utils/polygonGuards.ts (Build 54, CPO Đức,
 * 2026-05-18). L0 rule: pure TS, no react-native/OS imports, Jest-testable.
 *
 * Scope kept to what l0/sync (haversineDistance) and the recording/save flow
 * (speed filter, walk-away auto-stop, polygon sanity) need. Edit-mode helpers
 * (tap-to-insert segment lookup, distance/area display formatting) were left
 * behind — they're UI-facing, not geometry, and no listed consumer needs them.
 */

import type { LatLng } from '../types';
import { MobileCoreError } from '../errors';

/** LatLng plus the optional GPS metadata speed/accept/walk-away decisions need. */
export interface GeoPoint extends LatLng {
  timestamp?: number;
  accuracy?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
export const MAX_VERTICES = 200; // Hard cap to prevent UI lag
export const MIN_POINTS_TO_DEFINE = 3; // Triangle minimum
export const MIN_FARM_AREA_SQM = 4; // Min ~2m × 2m (allows jitter on a 5m × 5m square)
export const MIN_FARM_DIMENSION_METERS = 5; // Min bounding-box edge for a valid farm
export const ACCURACY_REJECT_METERS = 10; // decidePointAccept: reject samples worse than this
export const GPS_ACCURACY_GATE_METERS = 15; // Skip walk-away outside-check if GPS worse than this
export const GPS_BAD_HARD_TIMEOUT_MS = 5 * 60 * 1000; // 5 min bad GPS → geo/gps-lost
export const WALK_AWAY_CONSEC_SAMPLES = 3; // Need this many consecutive outside samples
export const WALK_AWAY_IDLE_MS = 15_000; // No new accepted point in 15s before stopping
export const VEHICLE_SPEED_KMH = 15; // > this → reject point
export const RUN_SPEED_KMH = 8; // > this but ≤ VEHICLE → accept with warning
export const POINT_DISTANCE_FILTER_M = 3; // Min distance between consecutive accepted points
export const POINT_DISTANCE_MAX_JUMP_M = 50; // GPS jump rejection threshold

const R_EARTH = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

// ── Haversine distance (meters) ──────────────────────────────────────────────
/**
 * Chữ ký ĐÓNG BĂNG (l0/types.ts): haversineDistance(a: LatLng, b: LatLng): number — mét.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

// ── Local equirectangular projection (accurate for < 10 km polygons) ─────────
function projectXY(coord: LatLng, lat0: number, cosLat0: number) {
  return {
    x: toRad(coord.lng) * R_EARTH * cosLat0,
    y: toRad(coord.lat) * R_EARTH,
  };
}

// ── Bounding box (internal — feeds validatePolygon stats + walk-away gates) ──
interface BBox { minLat: number; maxLat: number; minLng: number; maxLng: number; }

function bbox(coords: LatLng[]): BBox {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function boundingBoxMaxEdge(coords: LatLng[]): number {
  if (coords.length < 2) return 0;
  const b = bbox(coords);
  const midLat = (b.minLat + b.maxLat) / 2;
  const midLng = (b.minLng + b.maxLng) / 2;
  const heightM = haversineDistance({ lat: b.minLat, lng: midLng }, { lat: b.maxLat, lng: midLng });
  const widthM = haversineDistance({ lat: midLat, lng: b.minLng }, { lat: midLat, lng: b.maxLng });
  return Math.max(heightM, widthM);
}

// ── Centroid (arithmetic mean of lat/lng — good enough for small polygons) ───
function computeCentroid(coords: LatLng[]): LatLng {
  const n = coords.length;
  if (n === 0) return { lat: 0, lng: 0 };
  const lat = coords.reduce((s, c) => s + c.lat, 0) / n;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / n;
  return { lat, lng };
}

// ── Area (shoelace via local equirectangular projection) ─────────────────────
export function areaSquareMeters(coords: LatLng[]): number {
  if (coords.length < 3) return 0;
  const latCenter = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const cosLat = Math.cos(toRad(latCenter));
  const pts = coords.map(c => projectXY(c, latCenter, cosLat));
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

// ── Perimeter (haversine over consecutive points + closing edge) ─────────────
export function perimeterMeters(coords: LatLng[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1], coords[i]);
  }
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) {
    total += haversineDistance(last, first);
  }
  return total;
}

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────
export function pointInPolygon(p: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > p.lat) !== (yj > p.lat)) &&
      (p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Point-to-segment distance ────────────────────────────────────────────────
export function pointToSegmentDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const lat0 = (a.lat + b.lat) / 2;
  const cosLat = Math.cos(toRad(lat0));
  const pa = projectXY(a, lat0, cosLat);
  const pb = projectXY(b, lat0, cosLat);
  const pp = projectXY(p, lat0, cosLat);
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineDistance(p, a);
  const t = Math.max(0, Math.min(1, ((pp.x - pa.x) * dx + (pp.y - pa.y) * dy) / lenSq));
  const projX = pa.x + t * dx;
  const projY = pa.y + t * dy;
  return Math.sqrt((pp.x - projX) ** 2 + (pp.y - projY) ** 2);
}

/** Minimum distance from point p to any edge of the polygon. */
export function distanceToNearestEdge(p: LatLng, polygon: LatLng[]): number {
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const d = pointToSegmentDistance(p, a, b);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ── Self-intersection check (O(n²) — fine for n < ~500) ──────────────────────
function ccw(a: LatLng, b: LatLng, c: LatLng): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function segmentsIntersect(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);
  return (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)));
}

export function hasSelfIntersection(coords: LatLng[]): boolean {
  const n = coords.length;
  if (n < 4) return false;
  // Closed polygon — edge i goes from vertex i to vertex (i+1) mod n.
  // Two edges are "adjacent" iff they share a vertex. For a closed polygon
  // that means: edge i is adjacent to edge i+1, AND edge 0 is adjacent to
  // edge n-1 (both share vertex 0). All other pairs may legally intersect.
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Skip the wrap-around adjacent pair: edges 0 and n-1 share vertex 0
      if (i === 0 && j === n - 1) continue;
      const a1 = coords[i];
      const a2 = coords[(i + 1) % n];
      const b1 = coords[j];
      const b2 = coords[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

// ── Speed classification ─────────────────────────────────────────────────────
export interface SpeedClassification {
  speedKmh: number;
  category: 'still' | 'walk' | 'run' | 'vehicle';
  acceptable: boolean;
  warning?: 'speed_run' | 'speed_vehicle';
}

export function classifySpeed(prev: GeoPoint, next: GeoPoint): SpeedClassification {
  const tPrev = prev.timestamp ?? 0;
  const tNext = next.timestamp ?? Date.now();
  const dtSec = Math.max(0.001, (tNext - tPrev) / 1000);
  const distMeters = haversineDistance(prev, next);
  const speedKmh = (distMeters / dtSec) * 3.6;

  if (speedKmh < 1) return { speedKmh, category: 'still', acceptable: true };
  if (speedKmh <= RUN_SPEED_KMH) return { speedKmh, category: 'walk', acceptable: true };
  if (speedKmh <= VEHICLE_SPEED_KMH) {
    return { speedKmh, category: 'run', acceptable: true, warning: 'speed_run' };
  }
  return { speedKmh, category: 'vehicle', acceptable: false, warning: 'speed_vehicle' };
}

// ── Point-accept decision (extracted so refs can be mutated outside setState) ─
export type PointAcceptDecision =
  | { kind: 'accept' }
  | { kind: 'reject_accuracy'; accuracyMeters: number }
  | { kind: 'reject_distance_too_close'; distMeters: number }
  | { kind: 'reject_distance_jump'; distMeters: number }
  | { kind: 'reject_vehicle'; speedKmh: number }
  | { kind: 'warn_run'; speedKmh: number };

/**
 * Pure function: decide whether to append a GPS sample to the polygon. Caller
 * is responsible for committing state changes and updating refs based on the
 * decision. Keeps setCoordinates updaters pure (no ref mutation side-effects).
 */
export function decidePointAccept(
  prev: GeoPoint[],
  candidate: GeoPoint,
  lastAcceptedTimestampMs: number | null,
): PointAcceptDecision {
  // 1. Accuracy gate
  if (candidate.accuracy != null && candidate.accuracy > ACCURACY_REJECT_METERS) {
    return { kind: 'reject_accuracy', accuracyMeters: candidate.accuracy };
  }

  // 2. Speed gate (requires a previous point + its timestamp)
  if (prev.length > 0 && lastAcceptedTimestampMs != null) {
    const last = prev[prev.length - 1];
    const cls = classifySpeed(
      { lat: last.lat, lng: last.lng, timestamp: lastAcceptedTimestampMs },
      { lat: candidate.lat, lng: candidate.lng, timestamp: candidate.timestamp ?? Date.now() },
    );
    if (!cls.acceptable) return { kind: 'reject_vehicle', speedKmh: cls.speedKmh };
    if (cls.warning === 'speed_run') {
      // Fall through (still accept), but caller may want to show "slow down" hint
      // We'll re-evaluate distance gates below; warn handled by caller via separate check.
    }
  }

  // 3. Distance gate
  if (prev.length > 0) {
    const last = prev[prev.length - 1];
    const d = haversineDistance(last, candidate);
    if (d < POINT_DISTANCE_FILTER_M) return { kind: 'reject_distance_too_close', distMeters: d };
    if (d > POINT_DISTANCE_MAX_JUMP_M) return { kind: 'reject_distance_jump', distMeters: d };
  }

  // 4. Run-speed warn (informational — still accept)
  if (prev.length > 0 && lastAcceptedTimestampMs != null) {
    const last = prev[prev.length - 1];
    const cls = classifySpeed(
      { lat: last.lat, lng: last.lng, timestamp: lastAcceptedTimestampMs },
      { lat: candidate.lat, lng: candidate.lng, timestamp: candidate.timestamp ?? Date.now() },
    );
    if (cls.warning === 'speed_run') return { kind: 'warn_run', speedKmh: cls.speedKmh };
  }

  return { kind: 'accept' };
}

// ── Walk-away decision ───────────────────────────────────────────────────────
export interface WalkAwayState {
  consecOutside: number;
  lastAcceptedAtMs: number;
  gpsBadSinceMs: number | null;
}

export function initWalkAwayState(): WalkAwayState {
  return { consecOutside: 0, lastAcceptedAtMs: Date.now(), gpsBadSinceMs: null };
}

export type WalkAwayReason = 'walk_away_centroid' | 'walk_away_boundary';

export interface WalkAwayDecision {
  shouldStop: boolean;
  reason?: WalkAwayReason;
  debug?: {
    distFromCentroid: number;
    distToBoundary: number;
    inside: boolean;
    centroidThreshold: number;
    boundaryThreshold: number;
    idleMs: number;
  };
}

/**
 * Decide whether to auto-stop recording based on user's current GPS position.
 *
 * Pure function: returns updated state + decision; caller mutates the ref.
 * Takes the current position + accuracy + the recorded polygon so far — it
 * never reads GPS itself (caller supplies every sample).
 *
 * Outside criteria (hybrid — handles concave shapes like 'L' or 'U'):
 *   1. distFromCentroid > maxEdge × 1.5  (works for convex polygons)
 *   2. NOT inside polygon AND distToBoundary > maxEdge × 0.3  (handles concave)
 *
 * Trigger requires:
 *   - ≥ WALK_AWAY_CONSEC_SAMPLES consecutive samples meeting criterion
 *     (filters GPS spike outliers)
 *   - ≥ WALK_AWAY_IDLE_MS with no new accepted point
 *     (user has stopped actively expanding the polygon)
 *
 * Hard timeout: if GPS accuracy worse than GPS_ACCURACY_GATE_METERS for more
 * than GPS_BAD_HARD_TIMEOUT_MS continuously, throws MobileCoreError('geo/gps-lost')
 * to save battery — this is an exceptional condition, distinct from the
 * graceful shouldStop=true walk-away decisions below.
 */
export function decideWalkAway(
  state: WalkAwayState,
  currentGPS: GeoPoint,
  currentAccuracy: number | null,
  coordinates: GeoPoint[],
): { state: WalkAwayState; decision: WalkAwayDecision } {
  const now = Date.now();

  // Gate 1: not enough data to define a polygon
  if (coordinates.length < MIN_POINTS_TO_DEFINE) {
    return {
      state: { ...state, consecOutside: 0 },
      decision: { shouldStop: false },
    };
  }

  // Gate 2: polygon too small (collinear or below MIN_FARM_AREA_SQM)
  const area = areaSquareMeters(coordinates);
  if (area < MIN_FARM_AREA_SQM) {
    return {
      state: { ...state, consecOutside: 0 },
      decision: { shouldStop: false },
    };
  }

  // Gate 3: GPS too noisy — skip outside check but track bad-GPS duration
  if (currentAccuracy != null && currentAccuracy > GPS_ACCURACY_GATE_METERS) {
    const gpsBadSinceMs = state.gpsBadSinceMs ?? now;
    if (now - gpsBadSinceMs > GPS_BAD_HARD_TIMEOUT_MS) {
      throw new MobileCoreError(
        'geo/gps-lost',
        `GPS accuracy worse than ${GPS_ACCURACY_GATE_METERS}m for over ${GPS_BAD_HARD_TIMEOUT_MS / 60000} minutes`,
        { detail: { gpsBadSinceMs, currentAccuracy }, retryable: false },
      );
    }
    return {
      state: { ...state, gpsBadSinceMs },
      decision: { shouldStop: false },
    };
  }

  // GPS good — reset bad-since timer
  const newGpsBadSince = null;

  // Compute polygon stats
  const centroid = computeCentroid(coordinates);
  const maxEdge = boundingBoxMaxEdge(coordinates);
  const acc = currentAccuracy ?? 5;

  const distFromCentroid = haversineDistance(centroid, currentGPS);
  const centroidThreshold = Math.max(maxEdge * 1.5, acc * 2 + 3);

  const inside = pointInPolygon(currentGPS, coordinates);
  const distToBoundary = distanceToNearestEdge(currentGPS, coordinates);
  const boundaryThreshold = Math.max(maxEdge * 0.3, acc * 2 + 3);

  const outsideByCentroid = distFromCentroid > centroidThreshold;
  const outsideByBoundary = !inside && distToBoundary > boundaryThreshold;
  const isOutside = outsideByCentroid || outsideByBoundary;

  const newConsec = isOutside ? state.consecOutside + 1 : 0;
  const idleMs = now - state.lastAcceptedAtMs;

  const debug = {
    distFromCentroid,
    distToBoundary,
    inside,
    centroidThreshold,
    boundaryThreshold,
    idleMs,
  };

  if (newConsec >= WALK_AWAY_CONSEC_SAMPLES && idleMs > WALK_AWAY_IDLE_MS) {
    return {
      state: { ...state, consecOutside: newConsec, gpsBadSinceMs: newGpsBadSince },
      decision: {
        shouldStop: true,
        reason: outsideByCentroid ? 'walk_away_centroid' : 'walk_away_boundary',
        debug,
      },
    };
  }

  return {
    state: { ...state, consecOutside: newConsec, gpsBadSinceMs: newGpsBadSince },
    decision: { shouldStop: false, debug },
  };
}

// ── Polygon sanity validation (run before save) ──────────────────────────────
export interface SanityResult {
  ok: boolean;
  warnings: string[]; // i18n keys, not localized strings
  stats: {
    pointCount: number;
    perimeterMeters: number;
    areaSquareMeters: number;
    maxEdgeMeters: number;
  };
}

/**
 * Validates a polygon before save. Blocking-level problems (too few points,
 * self-intersection) throw MobileCoreError('geo/invalid-polygon') so callers
 * can't silently persist a broken shape. Non-blocking issues (too small, too
 * large) are returned as warnings — the platform UI decides whether to let
 * the user override.
 */
export function validatePolygon(coords: LatLng[]): SanityResult {
  const warnings: string[] = [];
  const stats = {
    pointCount: coords.length,
    perimeterMeters: perimeterMeters(coords),
    areaSquareMeters: areaSquareMeters(coords),
    maxEdgeMeters: boundingBoxMaxEdge(coords),
  };

  const tooFewPoints = coords.length < MIN_POINTS_TO_DEFINE;
  if (tooFewPoints) warnings.push('polygon_too_few_points');

  const selfIntersects = !tooFewPoints && hasSelfIntersection(coords);
  if (selfIntersects) warnings.push('polygon_self_intersection');

  if (stats.maxEdgeMeters > 0 && stats.maxEdgeMeters < MIN_FARM_DIMENSION_METERS) {
    // Not blocking — let user override; defer hard limit to a future build
    warnings.push('polygon_too_small');
  }
  if (stats.areaSquareMeters > 10_000_000) {
    warnings.push('polygon_too_large');
  }

  if (tooFewPoints || selfIntersects) {
    throw new MobileCoreError('geo/invalid-polygon', `Polygon invalid: ${warnings.join(', ')}`, {
      detail: { warnings, stats },
    });
  }

  return { ok: warnings.length === 0, warnings, stats };
}
