// modules/trace/utils/implicitParent.test.ts
//
// Unit tests for Build 54 V5 implicit-parent helpers (geohash, boundary builder,
// farm name formatter). The find-or-create flows (getOrCreateImplicitFarm /
// getOrCreateImplicitTree) depend on aladinAPI + SQLite database, so they are
// integration-tested separately on device — not unit-tested here.

import {
  computeGeohash,
  computeGeohash7,
  buildSquareBoundary,
  formatImplicitFarmName,
  IMPLICIT_FARM_HALF_SIDE_METERS,
} from './implicitParent';
import { haversineMeters, isPointInPolygon, areaSquareMeters } from './polygonGuards';

describe('computeGeohash', () => {
  test('precision 7 returns exactly 7 lowercase alphanumeric chars', () => {
    const gh = computeGeohash(12.6, 108.0, 7);
    expect(gh).toHaveLength(7);
    expect(gh).toMatch(/^[a-z0-9]+$/);
  });

  test('precision 5 returns 5 chars', () => {
    expect(computeGeohash(12.6, 108.0, 5)).toHaveLength(5);
  });

  test('Đắk Lắk anchor (12.6, 108.0) → w6m4ek (precision 6)', () => {
    // Reference: known geohash for (12.6, 108.0) is "w6m4ek..."
    expect(computeGeohash(12.6, 108.0, 6).startsWith('w6')).toBe(true);
  });

  test('Hanoi anchor (21.0, 105.85) → w7er... (geohash for Hanoi area)', () => {
    // Hanoi is in geohash region "w7" — northern Vietnam
    expect(computeGeohash(21.0, 105.85, 2)).toBe('w7');
  });

  test('equator + greenwich (0, 0) → s00000... (known anchor)', () => {
    expect(computeGeohash(0, 0, 6)).toBe('s00000');
  });

  test('nearby points share long geohash prefix', () => {
    const a = computeGeohash(12.6, 108.0, 7);
    const b = computeGeohash(12.6001, 108.0001, 7);
    // Should share at least 5 chars (~5km cell)
    let shared = 0;
    for (let i = 0; i < 7; i++) if (a[i] === b[i]) shared++; else break;
    expect(shared).toBeGreaterThanOrEqual(5);
  });

  test('throws on invalid lat', () => {
    expect(() => computeGeohash(91, 0, 7)).toThrow();
    expect(() => computeGeohash(-91, 0, 7)).toThrow();
  });

  test('throws on invalid lng', () => {
    expect(() => computeGeohash(0, 181, 7)).toThrow();
    expect(() => computeGeohash(0, -181, 7)).toThrow();
  });

  test('throws on invalid precision', () => {
    expect(() => computeGeohash(0, 0, 0)).toThrow();
    expect(() => computeGeohash(0, 0, 13)).toThrow();
  });
});

describe('computeGeohash7', () => {
  test('alias of computeGeohash with precision 7', () => {
    expect(computeGeohash7(12.6, 108.0)).toBe(computeGeohash(12.6, 108.0, 7));
  });

  test('matches backend pattern ^[a-z0-9]+$', () => {
    expect(computeGeohash7(12.6, 108.0)).toMatch(/^[a-z0-9]+$/);
  });

  test('always exactly 7 chars (regardless of coordinates)', () => {
    expect(computeGeohash7(0, 0)).toHaveLength(7);
    expect(computeGeohash7(89.9, 179.9)).toHaveLength(7);
    expect(computeGeohash7(-89.9, -179.9)).toHaveLength(7);
  });
});

describe('buildSquareBoundary', () => {
  const center = { lat: 12.6, lng: 108.0 };

  test('22m × 22m boundary returns 4 corners + closed GeoJSON ring (5 points)', () => {
    const result = buildSquareBoundary(center, IMPLICIT_FARM_HALF_SIDE_METERS);
    expect(result.coords).toHaveLength(4);
    expect(result.geoJson.coordinates[0]).toHaveLength(5); // closed ring
    expect(result.geoJson.type).toBe('Polygon');
  });

  test('boundary contains the center point', () => {
    const result = buildSquareBoundary(center, IMPLICIT_FARM_HALF_SIDE_METERS);
    expect(isPointInPolygon(center, result.coords)).toBe(true);
  });

  test('22m × 22m has area ≈ 484 m²', () => {
    const result = buildSquareBoundary(center, IMPLICIT_FARM_HALF_SIDE_METERS);
    const area = areaSquareMeters(result.coords);
    expect(area).toBeCloseTo(484, -1); // within ±10m²
  });

  test('corners are ~half-side from center (in meters)', () => {
    const result = buildSquareBoundary(center, 11);
    // Distance from center to corner is sqrt(2) * halfSide ≈ 15.6m
    for (const corner of result.coords) {
      const d = haversineMeters(center, corner);
      expect(d).toBeGreaterThan(14);  // sqrt(2) * 11 ≈ 15.6m, allow ±1
      expect(d).toBeLessThan(17);
    }
  });

  test('CCW winding order (SW → SE → NE → NW)', () => {
    const result = buildSquareBoundary(center, 11);
    const [sw, se, ne, nw] = result.coords;
    expect(sw.lat).toBeLessThan(center.lat);   // S
    expect(sw.lng).toBeLessThan(center.lng);   // W
    expect(se.lat).toBeLessThan(center.lat);   // S
    expect(se.lng).toBeGreaterThan(center.lng); // E
    expect(ne.lat).toBeGreaterThan(center.lat); // N
    expect(ne.lng).toBeGreaterThan(center.lng); // E
    expect(nw.lat).toBeGreaterThan(center.lat); // N
    expect(nw.lng).toBeLessThan(center.lng);   // W
  });

  test('GeoJSON ring is closed (first === last)', () => {
    const result = buildSquareBoundary(center, 11);
    const ring = result.geoJson.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  test('GPS point with 5m jitter still inside 22m boundary (audit fix A4 buffer)', () => {
    const result = buildSquareBoundary(center, 11);
    // Simulate 5m jitter in any direction — should still be inside
    const jittered = [
      { lat: center.lat + 5 / 111195, lng: center.lng },                // 5m N
      { lat: center.lat - 5 / 111195, lng: center.lng },                // 5m S
      { lat: center.lat, lng: center.lng + 5 / (111195 * 0.976) },      // 5m E (cos 12.6° ≈ 0.976)
      { lat: center.lat, lng: center.lng - 5 / (111195 * 0.976) },      // 5m W
    ];
    for (const p of jittered) {
      expect(isPointInPolygon(p, result.coords)).toBe(true);
    }
  });

  test('extreme latitudes (high lat) compress lng correctly', () => {
    // At lat 80°, 1° lng ≈ 19km not 111km. Square should still be ~22m × 22m
    // in real-world distance (not degrees).
    const arctic = { lat: 80, lng: 0 };
    const result = buildSquareBoundary(arctic, 11);
    // East edge to west edge ≈ 22m in real distance
    const eastEdge = haversineMeters(result.coords[1], result.coords[0]); // SE to SW
    expect(eastEdge).toBeCloseTo(22, 0);
  });
});

describe('formatImplicitFarmName', () => {
  test('with normal name', () => {
    expect(formatImplicitFarmName('Cường')).toBe('Vườn của Cường');
    expect(formatImplicitFarmName('Quang Giang')).toBe('Vườn của Quang Giang');
    expect(formatImplicitFarmName('Oanh')).toBe('Vườn của Oanh');
  });

  test('default DID name "Người dùng" — accepted', () => {
    expect(formatImplicitFarmName('Người dùng')).toBe('Vườn của Người dùng');
  });

  test('empty / null / undefined → "Vườn của tôi" fallback', () => {
    expect(formatImplicitFarmName('')).toBe('Vườn của tôi');
    expect(formatImplicitFarmName(null)).toBe('Vườn của tôi');
    expect(formatImplicitFarmName(undefined)).toBe('Vườn của tôi');
  });

  test('whitespace-only name → fallback', () => {
    expect(formatImplicitFarmName('   ')).toBe('Vườn của tôi');
  });

  test('trims leading/trailing whitespace', () => {
    expect(formatImplicitFarmName('  Cường  ')).toBe('Vườn của Cường');
  });
});
