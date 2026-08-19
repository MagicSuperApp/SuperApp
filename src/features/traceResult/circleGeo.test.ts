import { circleRing, circleShape, zoomForRadius } from './circleGeo';

/** Khoảng cách hai điểm theo Haversine, mét — dùng để ĐO lại vòng đã dựng. */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6_378_137;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const HANOI: [number, number] = [105.944, 20.989];

describe('circleRing', () => {
  it('mọi đỉnh cách tâm đúng bán kính (sai số dưới 1%)', () => {
    const ring = circleRing({ lon: HANOI[0], lat: HANOI[1] }, 111);
    for (const pt of ring) {
      expect(Math.abs(haversine(HANOI, pt) - 111)).toBeLessThan(1.11);
    }
  });

  it('KHÔNG bị dẹt theo chiều đông-tây ở vĩ độ Việt Nam', () => {
    // Bỏ `cos(lat)` là lỗi kinh điển, và ở vĩ độ 21 nó làm vòng hụt ~7% bề ngang.
    // Đo trực tiếp: điểm đông (t=0) và điểm bắc (t=π/2) phải cách tâm bằng nhau.
    const ring = circleRing({ lon: HANOI[0], lat: HANOI[1] }, 500, 64);
    const east = haversine(HANOI, ring[0]);
    const north = haversine(HANOI, ring[16]);
    expect(Math.abs(east - north) / east).toBeLessThan(0.01);
  });

  it('vòng ĐÓNG — thiếu điểm cuối thì MapLibre vẽ ra hình khuyết một múi', () => {
    const ring = circleRing({ lon: HANOI[0], lat: HANOI[1] }, 200, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
  });

  it('số cạnh quá nhỏ bị nâng lên 8, bán kính 0 bị nâng lên 1', () => {
    expect(circleRing({ lon: 0, lat: 0 }, 0, 2)).toHaveLength(9);
  });
});

describe('circleShape', () => {
  it('ra đúng FeatureCollection một Polygon, sẵn cho ShapeSource', () => {
    const s = circleShape({ lon: HANOI[0], lat: HANOI[1] }, 111);
    expect(s.type).toBe('FeatureCollection');
    expect(s.features).toHaveLength(1);
    expect(s.features[0].geometry.type).toBe('Polygon');
    expect(s.features[0].geometry.coordinates[0].length).toBeGreaterThan(8);
  });
});

describe('zoomForRadius', () => {
  it('vòng rộng hơn ⇒ phóng nhỏ hơn', () => {
    const near = zoomForRadius(21, 50, 360);
    const far = zoomForRadius(21, 5000, 360);
    expect(near).toBeGreaterThan(far);
  });

  it('kẹp trong dải raster còn có ảnh (3…18) — trên 19 là ô trắng', () => {
    expect(zoomForRadius(21, 0.001, 360)).toBeLessThanOrEqual(18);
    expect(zoomForRadius(21, 20_000_000, 360)).toBeGreaterThanOrEqual(3);
  });
});
