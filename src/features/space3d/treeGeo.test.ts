import { buildFarmRing, latLngToMeters } from './geo';
import { farmOrigin, parseGps, treeGeoPoint } from './treeGeo';

/** Ranh giới vuông ~40 m quanh một điểm ở đồng bằng sông Cửu Long. */
const BOUNDARY = [
  { lat: 10.5000, lng: 106.5000 },
  { lat: 10.5004, lng: 106.5000 },
  { lat: 10.5004, lng: 106.5004 },
  { lat: 10.5000, lng: 106.5004 },
];

describe('farmOrigin — phải khớp gốc của sơ đồ 3D', () => {
  it('cùng một gốc với buildFarmRing, không phải một công thức thứ hai', () => {
    const mine = farmOrigin(BOUNDARY);
    const theirs = buildFarmRing(BOUNDARY, 4).origin;
    expect(mine!.lat).toBeCloseTo(theirs!.lat, 10);
    expect(mine!.lng).toBeCloseTo(theirs!.lng, 10);
  });

  it('nhận cả {lat, lon} lẫn {lat, lng}', () => {
    const a = farmOrigin(BOUNDARY);
    const b = farmOrigin(BOUNDARY.map(p => ({ lat: p.lat, lon: p.lng })));
    expect(b!.lat).toBeCloseTo(a!.lat, 10);
    expect(b!.lng).toBeCloseTo(a!.lng, 10);
  });

  it('dưới 3 đỉnh thì không có gốc — không bịa ra một điểm', () => {
    expect(farmOrigin(BOUNDARY.slice(0, 2))).toBeNull();
    expect(farmOrigin([])).toBeNull();
    expect(farmOrigin(undefined)).toBeNull();
  });
});

describe('treeGeoPoint — đặt tay thắng GPS', () => {
  const origin = farmOrigin(BOUNDARY)!;
  const serverGps = { lat: 10.4990, lng: 106.4990 }; // GPS lệch hẳn ra ngoài vườn

  it('chưa đặt tay → dùng GPS máy chủ', () => {
    const p = treeGeoPoint({ serverGps, origin });
    expect(p).toEqual({ lat: 10.4990, lon: 106.4990 });
  });

  it('ĐÃ đặt tay → dùng chỗ đặt, BỎ QUA GPS máy chủ', () => {
    const p = treeGeoPoint({ serverGps, localPos: { x: 0, z: 0 }, origin })!;
    // (0,0) mét chính là gốc hệ vườn — tức tâm ranh giới, không phải điểm GPS.
    expect(p.lat).toBeCloseTo(origin.lat, 9);
    expect(p.lon).toBeCloseTo(origin.lng, 9);
    expect(p.lat).not.toBeCloseTo(serverGps.lat, 4);
  });

  it('đổi mét sang độ rồi ngược lại thì về đúng chỗ cũ', () => {
    const local = { x: 12.5, z: -7.25 };
    const p = treeGeoPoint({ localPos: local, origin })!;
    const back = latLngToMeters({ lat: p.lat, lng: p.lon }, origin);
    expect(back.x).toBeCloseTo(local.x, 6);
    expect(back.z).toBeCloseTo(local.z, 6);
  });

  it('Bắc là −Z: đặt cây về phía bắc thì vĩ độ TĂNG', () => {
    const p = treeGeoPoint({ localPos: { x: 0, z: -20 }, origin })!;
    expect(p.lat).toBeGreaterThan(origin.lat);
  });

  it('đặt tay nhưng CHƯA biết gốc vườn → lùi về GPS, không đoán bừa', () => {
    const p = treeGeoPoint({ serverGps, localPos: { x: 5, z: 5 }, origin: null });
    expect(p).toEqual({ lat: 10.4990, lon: 106.4990 });
  });

  it('không có gì dùng được → null, để màn bỏ qua cây đó', () => {
    expect(treeGeoPoint({})).toBeNull();
    expect(treeGeoPoint({ serverGps: { lat: 'x' }, origin })).toBeNull();
  });
});

describe('parseGps — ba dạng đang cùng tồn tại trong app', () => {
  it('{lat, lng}', () => expect(parseGps({ lat: 1, lng: 2 })).toEqual({ lat: 1, lon: 2 }));
  it('{lat, lon}', () => expect(parseGps({ lat: 1, lon: 2 })).toEqual({ lat: 1, lon: 2 }));
  it('[lat, lng]', () => expect(parseGps([1, 2])).toEqual({ lat: 1, lon: 2 }));
  it('rác → null', () => {
    expect(parseGps(null)).toBeNull();
    expect(parseGps('1,2')).toBeNull();
    expect(parseGps([1])).toBeNull();
  });
});
