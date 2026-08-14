/**
 * wayfind.test — toán dẫn đường.
 *
 * Mốc kiểm dùng toạ-độ THẬT quanh Đắk Lắk (vùng sầu riêng) để số liệu có nghĩa
 * với người đọc, và một cặp mốc chuẩn (xích đạo) để kiểm công thức.
 */

import {
  isValidLatLon, fromGpsPair, normalizeDeg, signedDeltaDeg,
  haversineMeters, initialBearingDeg, compassPointVi,
  isCourseUsable, relativeBearingDeg, clockHourOf, relativeHintVi,
  formatDistanceVi, walkMinutes, arrivalStateOf, nearestFixes, polygonCenter,
  directionsUrl, geoUri, EARTH_RADIUS_M,
} from './wayfind';

const GARDEN = { lat: 12.6667, lon: 108.0382 }; // Buôn Ma Thuột

describe('isValidLatLon / fromGpsPair', () => {
  it('nhận toạ-độ thật', () => {
    expect(isValidLatLon(GARDEN)).toBe(true);
  });

  it('loại NaN, ngoài dải, và (0,0)', () => {
    expect(isValidLatLon({ lat: NaN, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: 181 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: 0 })).toBe(false); // Null Island = dữ liệu rỗng
    expect(isValidLatLon(null)).toBe(false);
    expect(isValidLatLon('12,108')).toBe(false);
  });

  it('fromGpsPair đọc [lat, lon] của field-reid, hỏng thì trả null', () => {
    expect(fromGpsPair([12.6667, 108.0382])).toEqual(GARDEN);
    expect(fromGpsPair([0, 0])).toBeNull();
    expect(fromGpsPair([12.6])).toBeNull();
    expect(fromGpsPair(null)).toBeNull();
    expect(fromGpsPair(undefined)).toBeNull();
  });
});

describe('góc', () => {
  it('normalizeDeg đưa về [0,360)', () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
    expect(normalizeDeg(NaN)).toBe(0);
  });

  it('signedDeltaDeg đưa về (−180, 180]', () => {
    expect(signedDeltaDeg(10)).toBe(10);
    expect(signedDeltaDeg(350)).toBe(-10);
    expect(signedDeltaDeg(180)).toBe(180);
    expect(signedDeltaDeg(-190)).toBe(170);
  });
});

describe('haversineMeters', () => {
  it('cùng một điểm → 0', () => {
    expect(haversineMeters(GARDEN, GARDEN)).toBe(0);
  });

  it('1 độ vĩ ≈ 111,2 km', () => {
    const d = haversineMeters({ lat: 0, lon: 0.0001 }, { lat: 1, lon: 0.0001 });
    expect(d).toBeCloseTo((Math.PI / 180) * EARTH_RADIUS_M, 0);
  });

  it('cây cách nhau ~11 m trong vườn', () => {
    // 0.0001° vĩ ≈ 11,1 m
    const d = haversineMeters(GARDEN, { lat: GARDEN.lat + 0.0001, lon: GARDEN.lon });
    expect(d).toBeGreaterThan(10.5);
    expect(d).toBeLessThan(11.5);
  });

  it('đối xứng', () => {
    const a = GARDEN;
    const b = { lat: 12.68, lon: 108.05 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe('initialBearingDeg', () => {
  it('đi lên phía Bắc = 0°', () => {
    expect(initialBearingDeg(GARDEN, { lat: GARDEN.lat + 0.01, lon: GARDEN.lon })).toBeCloseTo(0, 3);
  });

  // Đông/Tây chỉ XẤP XỈ 90/270: đi theo vòng lớn thì kinh tuyến hội tụ, nên góc
  // đầu chặng lệch ~0,001° ở cự-ly 1 km. Sai lệch thật, không phải lỗi — kiểm ở
  // độ chính xác 2 số lẻ thay vì ép bằng đúng.
  it('sang Đông ≈ 90°', () => {
    expect(initialBearingDeg(GARDEN, { lat: GARDEN.lat, lon: GARDEN.lon + 0.01 })).toBeCloseTo(90, 2);
  });

  it('xuống Nam = 180°', () => {
    expect(initialBearingDeg(GARDEN, { lat: GARDEN.lat - 0.01, lon: GARDEN.lon })).toBeCloseTo(180, 3);
  });

  it('sang Tây ≈ 270°', () => {
    expect(initialBearingDeg(GARDEN, { lat: GARDEN.lat, lon: GARDEN.lon - 0.01 })).toBeCloseTo(270, 2);
  });

  it('Đông Bắc ≈ 45° (bù co vĩ độ)', () => {
    const dLat = 0.01;
    const dLon = dLat / Math.cos(GARDEN.lat * Math.PI / 180);
    const b = initialBearingDeg(GARDEN, { lat: GARDEN.lat + dLat, lon: GARDEN.lon + dLon });
    expect(b).toBeGreaterThan(44);
    expect(b).toBeLessThan(46);
  });

  it('luôn nằm trong [0,360)', () => {
    const b = initialBearingDeg(GARDEN, { lat: GARDEN.lat - 0.01, lon: GARDEN.lon - 0.01 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('compassPointVi', () => {
  it.each([
    [0, 'Bắc'], [45, 'Đông Bắc'], [90, 'Đông'], [135, 'Đông Nam'],
    [180, 'Nam'], [225, 'Tây Nam'], [270, 'Tây'], [315, 'Tây Bắc'],
  ])('%d° → %s', (deg, name) => {
    expect(compassPointVi(deg)).toBe(name);
  });

  it('359° vòng về Bắc chứ không tràn mảng', () => {
    expect(compassPointVi(359)).toBe('Bắc');
    expect(compassPointVi(360)).toBe('Bắc');
  });
});

describe('isCourseUsable', () => {
  it('đứng yên → không dùng được (Android trả heading 0, iOS trả −1)', () => {
    expect(isCourseUsable(0, 0)).toBe(false);
    expect(isCourseUsable(-1, 0)).toBe(false);
    expect(isCourseUsable(90, 0.1)).toBe(false);
  });

  it('đang đi bộ → dùng được', () => {
    expect(isCourseUsable(90, 1.2)).toBe(true);
  });

  it('thiếu dữ liệu → không dùng được', () => {
    expect(isCourseUsable(null, 2)).toBe(false);
    expect(isCourseUsable(90, null)).toBe(false);
    expect(isCourseUsable(NaN, 2)).toBe(false);
  });
});

describe('hướng tương đối', () => {
  it('relativeBearingDeg: đích Bắc mà đang đi hướng Đông → lệch trái 90°', () => {
    expect(relativeBearingDeg(0, 90)).toBe(-90);
  });

  it('clockHourOf: 0° = 12 giờ, 60° = 2 giờ, −90° = 9 giờ', () => {
    expect(clockHourOf(0)).toBe(12);
    expect(clockHourOf(60)).toBe(2);
    expect(clockHourOf(-90)).toBe(9);
  });

  it('relativeHintVi nói được cả bốn ca', () => {
    expect(relativeHintVi(5)).toBe('đi thẳng');
    expect(relativeHintVi(45)).toContain('chếch phải');
    expect(relativeHintVi(-100)).toContain('rẽ trái');
    expect(relativeHintVi(175)).toContain('phía sau');
  });
});

describe('formatDistanceVi', () => {
  it.each([
    [0, '0 m'], [7.4, '7 m'], [99, '99 m'],
    [123, '125 m'], [999, '1000 m'],
    [1000, '1,0 km'], [12340, '12,3 km'],
  ])('%p → %s', (m, s) => {
    expect(formatDistanceVi(m)).toBe(s);
  });

  it('số hỏng → gạch ngang, không "NaN m"', () => {
    expect(formatDistanceVi(NaN)).toBe('—');
    expect(formatDistanceVi(-5)).toBe('—');
  });
});

describe('walkMinutes', () => {
  it('75 m ≈ 1 phút, 1,5 km ≈ 20 phút', () => {
    expect(walkMinutes(75)).toBe(1);
    expect(walkMinutes(1500)).toBe(20);
  });

  it('quãng 0 → 0 phút (không bịa "1 phút" khi đã đứng tại chỗ)', () => {
    expect(walkMinutes(0)).toBe(0);
  });
});

describe('arrivalStateOf', () => {
  it('sai số tốt: 4 m là tới, 40 m là còn xa', () => {
    expect(arrivalStateOf(4, 5)).toBe('arrived');
    expect(arrivalStateOf(40, 5)).toBe('far');
  });

  it('NỚI theo sai số GPS — máy rẻ báo 20 m thì 18 m vẫn là tới', () => {
    expect(arrivalStateOf(18, 20)).toBe('arrived');
    expect(arrivalStateOf(18, 3)).toBe('near');
  });

  it('sai số thảm hoạ vẫn bị chặn ở 25 m, không biến cả vườn thành "đã tới"', () => {
    expect(arrivalStateOf(60, 200)).toBe('near');
    expect(arrivalStateOf(100, 200)).toBe('far');
  });

  it('thiếu sai số → dùng sàn 6 m', () => {
    expect(arrivalStateOf(5, null)).toBe('arrived');
    expect(arrivalStateOf(10, undefined)).toBe('near');
  });
});

describe('nearestFixes', () => {
  const trees = [
    { id: 'xa', gps: [GARDEN.lat + 0.002, GARDEN.lon] },      // ~222 m
    { id: 'gan', gps: [GARDEN.lat + 0.0001, GARDEN.lon] },    // ~11 m
    { id: 'giua', gps: [GARDEN.lat + 0.0005, GARDEN.lon] },   // ~55 m
    { id: 'khonggps', gps: null },
    { id: 'gpshong', gps: [0, 0] },
  ];
  const getPos = (t: (typeof trees)[number]) => fromGpsPair(t.gps);

  it('xếp gần → xa và bỏ mục không có toạ-độ', () => {
    const out = nearestFixes(GARDEN, trees, getPos);
    expect(out.map(f => f.item.id)).toEqual(['gan', 'giua', 'xa']);
  });

  it('kèm khoảng cách + góc phương-vị của từng mục', () => {
    const [first] = nearestFixes(GARDEN, trees, getPos);
    expect(first.distanceM).toBeGreaterThan(10);
    expect(first.distanceM).toBeLessThan(12);
    expect(first.bearingDeg).toBeCloseTo(0, 3);
  });

  it('cắt theo bán kính và theo số lượng', () => {
    expect(nearestFixes(GARDEN, trees, getPos, { maxMeters: 100 }).map(f => f.item.id))
      .toEqual(['gan', 'giua']);
    expect(nearestFixes(GARDEN, trees, getPos, { limit: 1 }).map(f => f.item.id))
      .toEqual(['gan']);
  });

  it('danh sách rỗng → mảng rỗng, không ném', () => {
    expect(nearestFixes(GARDEN, [], getPos)).toEqual([]);
  });
});

describe('polygonCenter', () => {
  it('trọng tâm ô vuông là tâm ô', () => {
    expect(polygonCenter([
      { lat: 10, lng: 100 }, { lat: 10, lng: 102 },
      { lat: 12, lng: 102 }, { lat: 12, lng: 100 },
    ])).toEqual({ lat: 11, lng: 101 });
  });

  it('nhận cả khoá `lon` lẫn `lng`', () => {
    expect(polygonCenter([{ lat: 12, lon: 108 }])).toEqual({ lat: 12, lng: 108 });
  });

  it('bỏ qua đỉnh hỏng, vẫn tính trên các đỉnh còn lại', () => {
    expect(polygonCenter([
      { lat: 10, lng: 100 },
      { lat: NaN, lng: 100 },
      { lat: 12, lng: 100 },
      { lat: 11 },
    ])).toEqual({ lat: 11, lng: 100 });
  });

  it('vườn chưa vẽ ranh giới → null, KHÔNG rơi về (0,0)', () => {
    expect(polygonCenter([])).toBeNull();
    expect(polygonCenter(null)).toBeNull();
    expect(polygonCenter(undefined)).toBeNull();
    expect(polygonCenter([{ lat: 0, lng: 0 }])).toBeNull();
    expect(polygonCenter([{ lat: NaN, lng: NaN }])).toBeNull();
  });
});

describe('URL bản đồ ngoài', () => {
  it('directionsUrl là liên-kết chính-tắc của Google Maps, mặc định đi xe', () => {
    expect(directionsUrl(GARDEN)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12.6667,108.0382&travelmode=driving',
    );
    expect(directionsUrl(GARDEN, { travelMode: 'walking' })).toContain('travelmode=walking');
  });

  it('geoUri kèm nhãn đã mã-hoá (tên vườn có dấu/khoảng trắng không phá URL)', () => {
    expect(geoUri(GARDEN)).toBe('geo:12.6667,108.0382?q=12.6667,108.0382');
    expect(geoUri(GARDEN, 'Vườn nhà Tư')).toBe(
      `geo:12.6667,108.0382?q=12.6667,108.0382(${encodeURIComponent('Vườn nhà Tư')})`,
    );
  });
});
