// modules/trace/utils/polygonGuards.test.ts
//
// Unit tests for Build 54 polygon helpers. Anchor coordinates around Đắk Lắk
// (≈ 12.6°N, 108.0°E) so haversine + projection numbers reflect real-world
// field test conditions.

import {
  haversineMeters,
  computeCentroid,
  boundingBoxMaxEdge,
  boundingBoxDiagonal,
  areaSquareMeters,
  isPointInPolygon,
  pointToSegmentDistance,
  distanceToNearestEdge,
  findNearestSegment,
  hasSelfIntersection,
  classifySpeed,
  decidePointAccept,
  decideWalkAway,
  initWalkAwayState,
  validatePolygon,
  decideTapInsert,
  type Coord,
} from './polygonGuards';

// Đắk Lắk anchor (12.6°N, 108.0°E). 1° lat ≈ 111195 m; 1° lng at 12.6°N ≈ 108505 m.
const LAT0 = 12.6;
const LNG0 = 108.0;
const METER_PER_DEG_LAT = 111195;
const METER_PER_DEG_LNG = 111195 * Math.cos((LAT0 * Math.PI) / 180);

/** Build a coord offset from the anchor by (northMeters, eastMeters). */
const D = (northMeters: number, eastMeters: number, t?: number): Coord => ({
  lat: LAT0 + northMeters / METER_PER_DEG_LAT,
  lng: LNG0 + eastMeters / METER_PER_DEG_LNG,
  timestamp: t,
});

describe('haversineMeters', () => {
  test('same point → 0', () => {
    expect(haversineMeters(D(0, 0), D(0, 0))).toBeCloseTo(0, 2);
  });
  test('10m east is 10m', () => {
    expect(haversineMeters(D(0, 0), D(0, 10))).toBeCloseTo(10, 1);
  });
  test('10m north is 10m', () => {
    expect(haversineMeters(D(0, 0), D(10, 0))).toBeCloseTo(10, 1);
  });
  test('diagonal 10,10 ≈ 14.14m', () => {
    expect(haversineMeters(D(0, 0), D(10, 10))).toBeCloseTo(14.14, 0);
  });
});

describe('computeCentroid', () => {
  test('centroid of 10×10 square is at center', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    const cen = computeCentroid(sq);
    expect(haversineMeters(cen, D(5, 5))).toBeLessThan(0.5);
  });
});

describe('boundingBoxMaxEdge / boundingBoxDiagonal', () => {
  test('10×10 square → maxEdge 10m, diagonal ~14.14m', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    expect(boundingBoxMaxEdge(sq)).toBeCloseTo(10, 0);
    expect(boundingBoxDiagonal(sq)).toBeCloseTo(14.14, 0);
  });
  test('100×5 thin rectangle → maxEdge 100m', () => {
    const rect = [D(0, 0), D(0, 100), D(5, 100), D(5, 0)];
    expect(boundingBoxMaxEdge(rect)).toBeCloseTo(100, 0);
  });
});

describe('areaSquareMeters', () => {
  test('10×10 → 100 m²', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    expect(areaSquareMeters(sq)).toBeCloseTo(100, 0);
  });
  test('3 collinear points → ~0', () => {
    const line = [D(0, 0), D(0, 5), D(0, 10)];
    expect(areaSquareMeters(line)).toBeLessThan(0.01);
  });
  test('triangle base 10, height 6 → 30 m²', () => {
    const tri = [D(0, 0), D(0, 10), D(6, 5)];
    expect(areaSquareMeters(tri)).toBeCloseTo(30, 0);
  });
});

describe('isPointInPolygon', () => {
  const square10 = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
  test('center is inside', () => {
    expect(isPointInPolygon(D(5, 5), square10)).toBe(true);
  });
  test('outside is outside', () => {
    expect(isPointInPolygon(D(15, 15), square10)).toBe(false);
  });
  test('concave L-shape: south arm and main corner inside; notch outside', () => {
    // L-shape: rectangle 10×10 with a 5×5 chunk removed from the NE corner.
    // CCW: SW → SE → midpoint of east edge → inner NE corner → midpoint of
    // north edge → NW → SW. The "notch" is the missing NE quadrant.
    const L = [D(0, 0), D(0, 10), D(5, 10), D(5, 5), D(10, 5), D(10, 0)];
    expect(isPointInPolygon(D(2, 2), L)).toBe(true);    // SW area — inside
    expect(isPointInPolygon(D(3, 8), L)).toBe(true);    // S arm of L — inside
    expect(isPointInPolygon(D(8, 3), L)).toBe(true);    // W arm of L — inside
    expect(isPointInPolygon(D(7, 7), L)).toBe(false);   // in the missing NE notch — outside
  });
});

describe('pointToSegmentDistance', () => {
  test('point on segment endpoint → 0', () => {
    expect(pointToSegmentDistance(D(0, 0), D(0, 0), D(0, 10))).toBeLessThan(0.1);
  });
  test('point on segment midpoint → 0', () => {
    expect(pointToSegmentDistance(D(0, 5), D(0, 0), D(0, 10))).toBeLessThan(0.1);
  });
  test('point perpendicular 3m off mid → ~3m', () => {
    expect(pointToSegmentDistance(D(3, 5), D(0, 0), D(0, 10))).toBeCloseTo(3, 1);
  });
  test('point beyond segment end → distance to nearest endpoint', () => {
    // Tap at (0, 15) — beyond segment [(0,0)..(0,10)] → distance ≈ 5m
    expect(pointToSegmentDistance(D(0, 15), D(0, 0), D(0, 10))).toBeCloseTo(5, 1);
  });
});

describe('findNearestSegment', () => {
  test('tap on south edge of square finds segment 0', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    const result = findNearestSegment(D(0, 5), sq);
    expect(result.segmentIndex).toBe(0);
    expect(result.distance).toBeLessThan(0.5);
  });
  test('tap on east edge finds segment 1', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    const result = findNearestSegment(D(5, 10), sq);
    expect(result.segmentIndex).toBe(1);
  });
});

describe('hasSelfIntersection', () => {
  test('square is fine', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    expect(hasSelfIntersection(sq)).toBe(false);
  });
  test('bowtie self-intersects', () => {
    const bowtie = [D(0, 0), D(10, 10), D(0, 10), D(10, 0)];
    expect(hasSelfIntersection(bowtie)).toBe(true);
  });
  test('triangle (3 points) — no self-intersection possible', () => {
    const tri = [D(0, 0), D(0, 10), D(6, 5)];
    expect(hasSelfIntersection(tri)).toBe(false);
  });
});

describe('classifySpeed', () => {
  test('5 km/h walking → walk + acceptable', () => {
    // 5 km/h = 1.39 m/s → 1.39 m in 1000 ms
    const a = D(0, 0, 0);
    const b = D(0, 1.39, 1000);
    const cls = classifySpeed(a, b);
    expect(cls.category).toBe('walk');
    expect(cls.acceptable).toBe(true);
    expect(cls.warning).toBeUndefined();
  });
  test('10 km/h running → run + accept with warning', () => {
    const a = D(0, 0, 0);
    const b = D(0, 2.78, 1000);
    const cls = classifySpeed(a, b);
    expect(cls.category).toBe('run');
    expect(cls.acceptable).toBe(true);
    expect(cls.warning).toBe('speed_run');
  });
  test('30 km/h vehicle → reject', () => {
    const a = D(0, 0, 0);
    const b = D(0, 8.33, 1000);
    const cls = classifySpeed(a, b);
    expect(cls.category).toBe('vehicle');
    expect(cls.acceptable).toBe(false);
    expect(cls.warning).toBe('speed_vehicle');
  });
  test('standing still → still + acceptable', () => {
    const a = D(0, 0, 0);
    const b = D(0, 0.1, 1000); // 0.1 m in 1 s = 0.36 km/h
    const cls = classifySpeed(a, b);
    expect(cls.category).toBe('still');
  });
});

describe('decidePointAccept', () => {
  test('first point always accepted', () => {
    const d = decidePointAccept([], { ...D(0, 0), accuracy: 5 }, null);
    expect(d.kind).toBe('accept');
  });
  test('accuracy > 10m rejected', () => {
    const d = decidePointAccept([], { ...D(0, 0), accuracy: 15 }, null);
    expect(d.kind).toBe('reject_accuracy');
  });
  test('distance < 3m too close', () => {
    const prev = [{ ...D(0, 0) }];
    const now = Date.now();
    // 1m in 5s = 0.72 km/h walking → speed gate passes, distance gate rejects
    const d = decidePointAccept(prev, { ...D(0, 1), accuracy: 5, timestamp: now }, now - 5000);
    expect(d.kind).toBe('reject_distance_too_close');
  });
  test('distance > 50m jump', () => {
    const prev = [{ ...D(0, 0) }];
    const d = decidePointAccept(prev, { ...D(0, 100), accuracy: 5, timestamp: Date.now() }, Date.now() - 10_000);
    // 100m in 10s = 36 km/h → speed gate triggers first
    expect(d.kind).toBe('reject_vehicle');
  });
  test('30 km/h vehicle rejected', () => {
    const prev = [{ ...D(0, 0) }];
    const now = Date.now();
    const d = decidePointAccept(prev, { ...D(0, 8.33), accuracy: 5, timestamp: now }, now - 1000);
    expect(d.kind).toBe('reject_vehicle');
  });
  test('normal walk accepted', () => {
    const prev = [{ ...D(0, 0) }];
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

  test('GPS bad > 15m for 6 min → hard timeout stop', () => {
    const state = { ...initWalkAwayState(), gpsBadSinceMs: Date.now() - 6 * 60_000 };
    const out = decideWalkAway(state, D(5, 5), 20, square10);
    expect(out.decision.shouldStop).toBe(true);
    expect(out.decision.reason).toBe('gps_lost_5min');
  });

  test('U-shape concave: user in arm far from centroid → no stop', () => {
    const u = [D(0, 0), D(10, 0), D(10, 10), D(7, 10), D(7, 3), D(3, 3), D(3, 10), D(0, 10)];
    let state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    for (let i = 0; i < 4; i++) {
      const out = decideWalkAway(state, D(1.5, 5), 5, u); // in left arm — inside polygon
      state = out.state;
    }
    expect(state.consecOutside).toBe(0); // never outside
  });

  test('thin rectangle (5m × 100m): lateral exit 50m → stop via boundary', () => {
    // Rectangle 5m wide (lat) × 100m long (lng). maxEdge = 100m.
    // centroidThreshold = max(100*1.5, 13) = 150m
    // boundaryThreshold = max(100*0.3, 13) = 30m
    // Tap 50m north: 45m from north edge > 30m → outsideByBoundary triggers
    const rect = [D(0, 0), D(0, 100), D(5, 100), D(5, 0)];
    let state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    let last: ReturnType<typeof decideWalkAway> | null = null;
    for (let i = 0; i < 3; i++) {
      last = decideWalkAway(state, D(50, 50), 5, rect);
      state = last.state;
    }
    expect(last!.decision.shouldStop).toBe(true);
    expect(last!.decision.reason).toBe('walk_away_boundary');
  });

  test('5m × 5m mushroom shed: user stands 1m off-center inside → no stop', () => {
    const shed = [D(0, 0), D(0, 5), D(5, 5), D(5, 0)];
    let state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    for (let i = 0; i < 5; i++) {
      const out = decideWalkAway(state, D(2.5, 3.5), 5, shed); // jitter ~1m off center
      state = out.state;
    }
    expect(state.consecOutside).toBe(0);
  });

  test('5m × 5m mushroom shed: user walks 20m out → stop', () => {
    const shed = [D(0, 0), D(0, 5), D(5, 5), D(5, 0)];
    let state = { ...initWalkAwayState(), lastAcceptedAtMs: Date.now() - 20_000 };
    let last: ReturnType<typeof decideWalkAway> | null = null;
    for (let i = 0; i < 3; i++) {
      last = decideWalkAway(state, D(25, 25), 5, shed);
      state = last.state;
    }
    expect(last!.decision.shouldStop).toBe(true);
  });
});

describe('decideTapInsert', () => {
  // Larger 20m×20m square so midpoint is comfortably >5m from any vertex.
  const big = [D(0, 0), D(0, 20), D(20, 20), D(20, 0)];

  test('tap on south-edge midpoint → insert at segment 0', () => {
    // Tap at (0, 10) — 10m from each end vertex → > 5m threshold → insert
    const d = decideTapInsert(D(0, 10), big);
    expect(d.kind).toBe('insert');
    if (d.kind === 'insert') {
      expect(d.segmentIndex).toBe(0);
    }
  });
  test('tap near vertex → skip', () => {
    // 2m from vertex (0,0) → < 5m threshold → skip
    const d = decideTapInsert(D(0, 2), big);
    expect(d.kind).toBe('skip_near_vertex');
  });
  test('tap far from polygon → skip', () => {
    const d = decideTapInsert(D(200, 200), big);
    expect(d.kind).toBe('skip_far_from_polygon');
  });
  test('200+ vertices → skip', () => {
    const huge = Array.from({ length: 200 }, (_, i) => D(i, 0));
    const d = decideTapInsert(D(0, 50), huge);
    expect(d.kind).toBe('skip_max_vertices');
  });
});

describe('validatePolygon', () => {
  test('valid 10×10 square', () => {
    const sq = [D(0, 0), D(0, 10), D(10, 10), D(10, 0)];
    const r = validatePolygon(sq);
    expect(r.blocking).toBe(false);
    expect(r.warnings).not.toContain('polygon_self_intersection');
  });
  test('2 points → blocking too_few_points', () => {
    const r = validatePolygon([D(0, 0), D(0, 1)]);
    expect(r.blocking).toBe(true);
    expect(r.warnings).toContain('polygon_too_few_points');
  });
  test('bowtie → blocking self_intersection', () => {
    const bow = [D(0, 0), D(10, 10), D(0, 10), D(10, 0)];
    const r = validatePolygon(bow);
    expect(r.blocking).toBe(true);
    expect(r.warnings).toContain('polygon_self_intersection');
  });
  test('< 5m edge → warning, not blocking', () => {
    const tiny = [D(0, 0), D(0, 2), D(2, 2), D(2, 0)];
    const r = validatePolygon(tiny);
    expect(r.warnings).toContain('polygon_too_small');
    expect(r.blocking).toBe(false);
  });
  test('triangle (3 points, area > 0) → valid', () => {
    const tri = [D(0, 0), D(0, 10), D(6, 5)];
    const r = validatePolygon(tri);
    expect(r.blocking).toBe(false);
  });
});
