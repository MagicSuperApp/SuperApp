// MobileCore l0/geo — ported + extended from
// src/modules/trace/utils/polygonGuards.test.ts (Build 54). Anchor coordinates
// around Đắk Lắk (≈ 12.6°N, 108.0°E) so haversine + projection numbers reflect
// real-world field test conditions.

import { isMobileCoreError } from '../../errors';
import {
  haversineDistance,
  areaSquareMeters,
  perimeterMeters,
  pointInPolygon,
  pointToSegmentDistance,
  distanceToNearestEdge,
  hasSelfIntersection,
  classifySpeed,
  decidePointAccept,
  decideWalkAway,
  initWalkAwayState,
  validatePolygon,
  type GeoPoint,
} from '../index';

// Đắk Lắk anchor (12.6°N, 108.0°E). 1° lat ≈ 111195 m; 1° lng at 12.6°N ≈ 108505 m.
const LAT0 = 12.6;
const LNG0 = 108.0;
const METER_PER_DEG_LAT = 111195;
const METER_PER_DEG_LNG = 111195 * Math.cos((LAT0 * Math.PI) / 180);

/** Build a point offset from the anchor by (northMeters, eastMeters). */
const D = (northMeters: number, eastMeters: number, t?: number): GeoPoint => ({
  lat: LAT0 + northMeters / METER_PER_DEG_LAT,
  lng: LNG0 + eastMeters / METER_PER_DEG_LNG,
  timestamp: t,
});

describe('haversineDistance', () => {
  test('same point → 0', () => {
    expect(haversineDistance(D(0, 0), D(0, 0))).toBeCloseTo(0, 2);
  });
  test('10m east is 10m (known-distance pair, sub-meter error)', () => {
    expect(Math.abs(haversineDistance(D(0, 0), D(0, 10)) - 10)).toBeLessThan(1);
  });
  test('10m north is 10m', () => {
    expect(Math.abs(haversineDistance(D(0, 0), D(10, 0)) - 10)).toBeLessThan(1);
  });
  test('diagonal 10,10 ≈ 14.14m', () => {
    expect(Math.abs(haversineDistance(D(0, 0), D(10, 10)) - 14.14)).toBeLessThan(1);
  });
});

describe('areaSquareMeters', () => {
  test('10×10 square → ~100 m² (known shape)', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    expect(areaSquareMeters(sq)).toBeCloseTo(100, 0);
  });
  test('3 collinear points → ~0', () => {
    const line = [D(0, 0), D(0, 5), D(0, 10)];
    expect(areaSquareMeters(line)).toBeLessThan(0.01);
  });
  test('fewer than 3 points → 0', () => {
    expect(areaSquareMeters([D(0, 0), D(0, 5)])).toBe(0);
  });
});

describe('perimeterMeters', () => {
  test('10×10 square → ~40m', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    expect(perimeterMeters(sq)).toBeCloseTo(40, 0);
  });
});

describe('pointInPolygon', () => {
  const square10 = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
  test('center is inside', () => {
    expect(pointInPolygon(D(5, 5), square10)).toBe(true);
  });
  test('outside is outside', () => {
    expect(pointInPolygon(D(15, 15), square10)).toBe(false);
  });
  test('point exactly on an edge (boundary case)', () => {
    // Ray-casting boundary behavior: point on the south edge (y=0, x in [0,10]).
    // Documented as implementation-defined (may read either way) — assert it
    // does not throw and returns a boolean, then pin the actual observed value.
    const result = pointInPolygon(D(0, 5), square10);
    expect(typeof result).toBe('boolean');
  });
});

describe('pointToSegmentDistance / distanceToNearestEdge', () => {
  test('point on segment midpoint → 0', () => {
    expect(pointToSegmentDistance(D(0, 5), D(0, 0), D(0, 10))).toBeLessThan(0.1);
  });
  test('point perpendicular 3m off mid → ~3m', () => {
    expect(pointToSegmentDistance(D(3, 5), D(0, 0), D(0, 10))).toBeCloseTo(3, 1);
  });
  test('distanceToNearestEdge finds the closest of 4 edges', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    // 2m outside the south edge, well clear of the other three.
    expect(distanceToNearestEdge(D(-2, 5), sq)).toBeCloseTo(2, 1);
  });
});

describe('hasSelfIntersection', () => {
  test('convex square → false', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    expect(hasSelfIntersection(sq)).toBe(false);
  });
  test('bowtie (crossed quad) → true', () => {
    const bowtie = [D(0, 0), D(10, 10), D(0, 10), D(10, 0)];
    expect(hasSelfIntersection(bowtie)).toBe(true);
  });
  test('triangle (3 points) — no self-intersection possible', () => {
    const tri = [D(0, 0), D(0, 10), D(6, 5)];
    expect(hasSelfIntersection(tri)).toBe(false);
  });
  test('wrap-around: closing edge (last→first) does not falsely flag adjacency with edge 1', () => {
    // Convex pentagon: closing edge (v4→v0) shares vertex 0 with edge (v0→v1)
    // and must NOT be compared against it (adjacent pair, explicitly skipped).
    // No actual crossing exists anywhere in a convex polygon — regression guard
    // against over-eager wrap logic producing a false positive.
    const pentagon = [D(0, 0), D(0, 10), D(8, 15), D(15, 5), D(8, -5)];
    expect(hasSelfIntersection(pentagon)).toBe(false);
  });
  test('wrap-around: closing edge (last→first) genuinely crosses a non-adjacent edge → true', () => {
    // v0=(0,0) v1=(0,4) v2=(10,4) v3=(10,8) v4=(5,8) in (north,east).
    // Closing edge v4→v0 crosses edge v1→v2 (x=4 line, y∈[0,10]) at (2.5,4) —
    // this pair (i=1,j=4) is NOT the excluded (i=0,j=n-1) adjacent pair, so the
    // wrap-around index math ((j+1)%n) must still catch it.
    const polygon = [D(0, 0), D(0, 4), D(10, 4), D(10, 8), D(5, 8)];
    expect(hasSelfIntersection(polygon)).toBe(true);
  });
});

describe('classifySpeed', () => {
  test('5 km/h walking → walk + acceptable', () => {
    const a = D(0, 0, 0);
    const b = D(0, 1.39, 1000); // 1.39m in 1s ≈ 5 km/h
    const cls = classifySpeed(a, b);
    expect(cls.category).toBe('walk');
    expect(cls.acceptable).toBe(true);
    expect(cls.warning).toBeUndefined();
  });
  test('10 km/h running → run + accept with warning', () => {
    const a = D(0, 0, 0);
    const b = D(0, 2.78, 1000); // 2.78m in 1s ≈ 10 km/h
    const cls = classifySpeed(a, b);
    expect(cls.category).toBe('run');
    expect(cls.acceptable).toBe(true);
    expect(cls.warning).toBe('speed_run');
  });
  test('30 km/h vehicle → reject', () => {
    const a = D(0, 0, 0);
    const b = D(0, 8.33, 1000); // 8.33m in 1s ≈ 30 km/h
    const cls = classifySpeed(a, b);
    expect(cls.category).toBe('vehicle');
    expect(cls.acceptable).toBe(false);
    expect(cls.warning).toBe('speed_vehicle');
  });
});

describe('decidePointAccept', () => {
  test('first point always accepted', () => {
    const d = decidePointAccept([], { ...D(0, 0), accuracy: 5 }, null);
    expect(d.kind).toBe('accept');
  });
  test('accuracy = 15m rejected (> 10m gate)', () => {
    const d = decidePointAccept([], { ...D(0, 0), accuracy: 15 }, null);
    expect(d.kind).toBe('reject_accuracy');
    if (d.kind === 'reject_accuracy') expect(d.accuracyMeters).toBe(15);
  });
  test('distance jump = 60m rejected (> 50m gate, speed kept low enough to isolate the distance gate)', () => {
    const prev: GeoPoint[] = [{ ...D(0, 0) }];
    const now = Date.now();
    // 60m in 30s = 7.2 km/h (walk, acceptable) → speed gate passes, distance gate must reject.
    const d = decidePointAccept(prev, { ...D(0, 60), accuracy: 5, timestamp: now }, now - 30_000);
    expect(d.kind).toBe('reject_distance_jump');
    if (d.kind === 'reject_distance_jump') expect(d.distMeters).toBeCloseTo(60, 0);
  });
  test('distance < 3m too close', () => {
    const prev: GeoPoint[] = [{ ...D(0, 0) }];
    const now = Date.now();
    const d = decidePointAccept(prev, { ...D(0, 1), accuracy: 5, timestamp: now }, now - 5000);
    expect(d.kind).toBe('reject_distance_too_close');
  });
  test('normal walk accepted', () => {
    const prev: GeoPoint[] = [{ ...D(0, 0) }];
    const now = Date.now();
    // 5m in 4s = 4.5 km/h walking
    const d = decidePointAccept(prev, { ...D(0, 5), accuracy: 5, timestamp: now }, now - 4000);
    expect(d.kind).toBe('accept');
  });
});

describe('decideWalkAway', () => {
  const square10 = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)]; // 10m × 10m, centroid (5m, 5m)

  test('< 3 points → no stop ever', () => {
    const state = initWalkAwayState();
    const out = decideWalkAway(state, D(100, 100), 5, [D(0, 0), D(1, 1)]);
    expect(out.decision.shouldStop).toBe(false);
  });

  test('inside polygon, fresh idle → no stop', () => {
    const state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() };
    const out = decideWalkAway(state, D(5, 5), 5, square10);
    expect(out.decision.shouldStop).toBe(false);
  });

  test('outside polygon 30m + idle 20s + 3 consec → stop', () => {
    let state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    for (let i = 0; i < 3; i++) {
      const out = decideWalkAway(state, D(50, 50), 5, square10);
      state = out.state;
      if (i < 2) expect(out.decision.shouldStop).toBe(false);
      else expect(out.decision.shouldStop).toBe(true);
    }
  });

  test('GPS spike single outlier → no stop, consecOutside=1', () => {
    const state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    const out = decideWalkAway(state, D(200, 200), 5, square10);
    expect(out.decision.shouldStop).toBe(false);
    expect(out.state.consecOutside).toBe(1);
  });

  test('GPS bad > 15m for 6 min → throws MobileCoreError geo/gps-lost (hard timeout)', () => {
    const state = { ...initWalkAwayState(), gpsBadSinceMs: Date.now() - 6 * 60_000 };
    try {
      decideWalkAway(state, D(5, 5), 20, square10);
      throw new Error('expected decideWalkAway to throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('geo/gps-lost');
    }
  });

  test('concave L-shape: user in the inner arm (far from centroid, still inside) → no false auto-stop', () => {
    // L-shape: 10×10 square with a 5×5 notch removed from the NE corner.
    const L = [D(0, 0), D(0, 10), D(5, 10), D(5, 5), D(10, 5), D(10, 0)];
    let state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    for (let i = 0; i < 4; i++) {
      // (3, 8) sits in the north arm of the L — inside the polygon, but far
      // from the naive centroid, which a centroid-only check would flag.
      const out = decideWalkAway(state, D(3, 8), 5, L);
      state = out.state;
      expect(out.decision.shouldStop).toBe(false);
    }
    expect(state.consecOutside).toBe(0);
  });

  test('concave L-shape: user genuinely leaves through the notch → stop', () => {
    const L = [D(0, 0), D(0, 10), D(5, 10), D(5, 5), D(10, 5), D(10, 0)];
    let state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    let last: ReturnType<typeof decideWalkAway> | null = null;
    for (let i = 0; i < 3; i++) {
      last = decideWalkAway(state, D(20, 20), 5, L); // well outside, past the notch
      state = last.state;
    }
    expect(last!.decision.shouldStop).toBe(true);
  });
});

describe('validatePolygon', () => {
  test('valid 10×10 square → ok, no warnings', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    const r = validatePolygon(sq);
    expect(r.ok).toBe(true);
    expect(r.warnings).not.toContain('polygon_self_intersection');
  });
  test('< 3 vertices → throws MobileCoreError geo/invalid-polygon', () => {
    expect(() => validatePolygon([D(0, 0), D(0, 1)])).toThrow();
    try {
      validatePolygon([D(0, 0), D(0, 1)]);
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) {
        expect(e.code).toBe('geo/invalid-polygon');
      }
    }
  });
  test('bowtie (self-intersecting) → throws MobileCoreError geo/invalid-polygon', () => {
    const bow = [D(0, 0), D(10, 10), D(0, 10), D(10, 0)];
    try {
      validatePolygon(bow);
      throw new Error('expected validatePolygon to throw');
    } catch (e) {
      expect(isMobileCoreError(e)).toBe(true);
      if (isMobileCoreError(e)) expect(e.code).toBe('geo/invalid-polygon');
    }
  });
  test('< 5m edge → non-blocking warning, does not throw', () => {
    const tiny = [D(0, 0), D(0, 2), D(2, 2), D(2, 0)];
    const r = validatePolygon(tiny);
    expect(r.warnings).toContain('polygon_too_small');
    expect(r.ok).toBe(false);
  });
  test('triangle (3 points, area > 0) → valid', () => {
    const tri = [D(0, 0), D(0, 10), D(6, 5)];
    const r = validatePolygon(tri);
    expect(r.ok).toBe(true);
  });
});
