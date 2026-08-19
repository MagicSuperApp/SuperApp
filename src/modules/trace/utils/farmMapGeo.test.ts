import {
  FALLBACK_CENTER,
  MIN_SPAN_DEG,
  POLYGON_MIN_ZOOM,
  farmAnchor,
  farmAreaM2,
  farmsBounds,
  foldVi,
  formatFarmArea,
  pinFeatures,
  polygonFeatures,
  searchFarms,
} from './farmMapGeo';
import type { Farm } from '../types';

const farm = (over: Partial<Farm>): Farm => ({
  id: 'f1',
  name: 'Vườn thử',
  coordinates: [],
  userId: 'did:x',
  ...over,
});

/** Một mảnh vuông ~110m cạnh quanh (10.00, 105.00). */
const SQUARE = [
  { lat: 10.0000, lng: 105.0000 },
  { lat: 10.0000, lng: 105.0010 },
  { lat: 10.0010, lng: 105.0010 },
  { lat: 10.0010, lng: 105.0000 },
];

describe('farmAnchor — center của máy chủ thắng trọng tâm hình học', () => {
  it('dùng center khi máy chủ có gửi, KHÔNG tính lại từ ranh', () => {
    const f = farm({ coordinates: SQUARE, center: { lat: 9.5, lng: 104.5 } });
    expect(farmAnchor(f)).toEqual({ lat: 9.5, lng: 104.5 });
  });

  it('không có center → trọng tâm ranh', () => {
    const a = farmAnchor(farm({ coordinates: SQUARE }))!;
    expect(a.lat).toBeCloseTo(10.0005, 6);
    expect(a.lng).toBeCloseTo(105.0005, 6);
  });

  it('vườn chưa có toạ độ nào → null, KHÔNG cắm bừa vào 0,0', () => {
    expect(farmAnchor(farm({}))).toBeNull();
    expect(farmAnchor(null)).toBeNull();
  });

  it('bỏ qua center rác của máy chủ (NaN / ngoài dải) rồi lùi về ranh', () => {
    const nan = farm({ coordinates: SQUARE, center: { lat: NaN, lng: 105 } });
    expect(farmAnchor(nan)!.lat).toBeCloseTo(10.0005, 6);
    const wild = farm({ coordinates: SQUARE, center: { lat: 991, lng: 105 } });
    expect(farmAnchor(wild)!.lat).toBeCloseTo(10.0005, 6);
  });

  it('một điểm duy nhất vẫn cắm được ghim', () => {
    expect(farmAnchor(farm({ coordinates: [{ lat: 10, lng: 105 }] }))).toEqual({ lat: 10, lng: 105 });
  });
});

describe('farmAreaM2 — "chưa đo" khác "bằng không"', () => {
  it('dưới 3 điểm → null, KHÔNG phải 0', () => {
    expect(farmAreaM2(farm({ coordinates: [] }))).toBeNull();
    expect(farmAreaM2(farm({ coordinates: SQUARE.slice(0, 2) }))).toBeNull();
  });

  it('mảnh vuông ~110m cho ra khoảng 1,2 ha', () => {
    const a = farmAreaM2(farm({ coordinates: SQUARE }))!;
    expect(a).toBeGreaterThan(11_000);
    expect(a).toBeLessThan(13_000);
  });
});

describe('formatFarmArea — nhà vườn đọc bằng héc-ta, nhưng chỉ khi đủ lớn', () => {
  it('dưới 1 ha → mét vuông', () => {
    expect(formatFarmArea(800)).toBe('800 m²');
  });
  it('từ 1 ha → héc-ta, dấu phẩy thập phân kiểu Việt', () => {
    expect(formatFarmArea(12_300)).toBe('1,23 ha');
    expect(formatFarmArea(250_000)).toBe('25,0 ha');
  });
  it('không có số / số vô nghĩa → null để màn hiện "—"', () => {
    expect(formatFarmArea(null)).toBeNull();
    expect(formatFarmArea(0)).toBeNull();
    expect(formatFarmArea(NaN)).toBeNull();
  });
});

describe('farmsBounds', () => {
  it('ôm hết RANH chứ không chỉ tâm — vườn dài không bị cắt đầu', () => {
    const b = farmsBounds([farm({ coordinates: SQUARE })])!;
    expect(b.sw[1]).toBeLessThanOrEqual(10.0);
    expect(b.ne[1]).toBeGreaterThanOrEqual(10.001);
  });

  it('một vườn duy nhất vẫn được nới ra tối thiểu, không phóng tới vỡ hạt', () => {
    const b = farmsBounds([farm({ center: { lat: 10, lng: 105 } })])!;
    expect(b.ne[1] - b.sw[1]).toBeCloseTo(MIN_SPAN_DEG, 6);
    expect(b.ne[0] - b.sw[0]).toBeCloseTo(MIN_SPAN_DEG, 6);
  });

  it('không vườn nào định vị được → null (màn tự lùi về FALLBACK_CENTER)', () => {
    expect(farmsBounds([farm({})])).toBeNull();
    expect(farmsBounds([])).toBeNull();
    expect(farmsBounds(null)).toBeNull();
    expect(FALLBACK_CENTER).toHaveLength(2);
  });

  it('nhiều vườn → hộp ôm cả cụm', () => {
    const b = farmsBounds([
      farm({ id: 'a', center: { lat: 10, lng: 105 } }),
      farm({ id: 'b', center: { lat: 11, lng: 106 } }),
    ])!;
    expect(b.sw).toEqual([105, 10]);
    expect(b.ne).toEqual([106, 11]);
  });
});

describe('pinFeatures', () => {
  it('mỗi vườn định vị được một ghim, mang theo tên để in nhãn', () => {
    const fc = pinFeatures([
      farm({ id: 'a', name: 'Vườn Bà Tư', center: { lat: 10, lng: 105 } }),
      farm({ id: 'b', name: 'Chưa đi ranh' }),
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({ farm_id: 'a', name: 'Vườn Bà Tư' });
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [105, 10] });
  });

  it('vườn không tên vẫn có nhãn (rơi về mã) — không để nhãn rỗng trên bản đồ', () => {
    const fc = pinFeatures([farm({ id: 'zz', name: '', center: { lat: 1, lng: 2 } })]);
    expect(fc.features[0].properties.name).toBe('zz');
  });
});

describe('polygonFeatures — dựng lại vùng vườn từ các điểm nối', () => {
  it('ĐÓNG vòng: điểm cuối trùng điểm đầu', () => {
    const fc = polygonFeatures([farm({ coordinates: SQUARE })]);
    const ring = (fc.features[0].geometry as any).coordinates[0];
    expect(ring).toHaveLength(SQUARE.length + 1);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('không nhân đôi điểm khi máy chủ đã gửi vòng đóng sẵn', () => {
    const closed = [...SQUARE, { lat: SQUARE[0].lat, lng: SQUARE[0].lng }];
    const ring = (polygonFeatures([farm({ coordinates: closed })]).features[0].geometry as any).coordinates[0];
    expect(ring).toHaveLength(closed.length);
  });

  it('dưới 3 điểm KHÔNG thành vùng — không bịa ra mảnh đất chưa ai đo', () => {
    expect(polygonFeatures([farm({ coordinates: SQUARE.slice(0, 2) })]).features).toHaveLength(0);
  });

  it('toạ độ ra đúng thứ tự GeoJSON [lng, lat], không lệch trục', () => {
    const ring = (polygonFeatures([farm({ coordinates: SQUARE })]).features[0].geometry as any).coordinates[0];
    expect(ring[0]).toEqual([105.0, 10.0]);
  });

  it('vùng chỉ hiện từ mức phóng thấy được một xã', () => {
    expect(POLYGON_MIN_ZOOM).toBeGreaterThanOrEqual(11);
    expect(POLYGON_MIN_ZOOM).toBeLessThanOrEqual(15);
  });
});

describe('foldVi / searchFarms — gõ không dấu vẫn tìm ra', () => {
  it('bỏ dấu đủ cả năm thanh và chữ đ', () => {
    expect(foldVi('Vườn Bà Tư')).toBe('vuon ba tu');
    expect(foldVi('ĐẤT ĐỎ')).toBe('dat do');
    expect(foldVi('Ổi · Xoài  Cát')).toBe('oi · xoai cat');
  });

  it('không dùng normalize() — chạy được cả khi Hermes thiếu ICU', () => {
    const spy = jest.spyOn(String.prototype, 'normalize');
    foldVi('Vườn Bà Tư');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('gõ "vuon ba" ra "Vườn Bà Tư"', () => {
    const list = [farm({ id: 'a', name: 'Vườn Bà Tư' }), farm({ id: 'b', name: 'Rẫy Ông Sáu' })];
    expect(searchFarms(list, 'vuon ba').map((f) => f.id)).toEqual(['a']);
  });

  it('ô rỗng → trả nguyên danh sách', () => {
    const list = [farm({ id: 'a' }), farm({ id: 'b' })];
    expect(searchFarms(list, '')).toHaveLength(2);
    expect(searchFarms(list, '   ')).toHaveLength(2);
  });

  it('dán mã vườn cũng tìm ra, nhưng một chữ cái thì KHÔNG khớp bừa vào uuid', () => {
    const list = [farm({ id: '9f3c1a22-dead', name: 'Rẫy Ông Sáu' })];
    expect(searchFarms(list, '9f3c')).toHaveLength(1);
    // "d" có trong uuid ("dead") nhưng không có trong "ray ong sau" → không khớp.
    expect(searchFarms(list, 'd')).toHaveLength(0);
  });

  it('không sửa mảng gốc', () => {
    const list = [farm({ id: 'a', name: 'Vườn Bà Tư' }), farm({ id: 'b', name: 'Rẫy' })];
    searchFarms(list, 'vuon');
    expect(list).toHaveLength(2);
  });
});
