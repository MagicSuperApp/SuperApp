import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { latLngToMeters, metersToLatLng } from './geo';
import {
  DEFAULT_MAP_SOURCE_ID, MAP_SOURCES, MAX_TILES, MERCATOR_MAX_LAT, MIN_ZOOM,
  OSM_STREET_TILES,
  getMapSource, latToTileY, lngToTileX, planTiles, tileUrl, tileXToLng, tileYToLat,
  tilesPerAxis,
} from './mapTiles';

const ORIGIN = { lat: 10.762622, lng: 106.660172 }; // TP.HCM

/** Ô vuông quanh gốc, nửa-cạnh `half` mét. */
const square = (half: number) => [
  { x: -half, z: -half }, { x: half, z: -half },
  { x: half, z: half }, { x: -half, z: half },
];

describe('lưới Web-Mercator', () => {
  it('mức 0 chỉ có duy nhất 1 ô', () => {
    expect(tilesPerAxis(0)).toBe(1);
    expect(Math.floor(lngToTileX(179.9, 0))).toBe(0);
    expect(Math.floor(latToTileY(-84, 0))).toBe(0);
  });

  it('kinh tuyến gốc + xích đạo nằm đúng tâm lưới', () => {
    expect(lngToTileX(0, 1)).toBeCloseTo(1, 9);
    expect(latToTileY(0, 1)).toBeCloseTo(1, 9);
  });

  it('đi vòng kinh độ ⇄ ô', () => {
    for (const lng of [-180, -73.5, 0, 106.66, 179.99]) {
      expect(tileXToLng(lngToTileX(lng, 17), 17)).toBeCloseTo(lng, 9);
    }
  });

  it('đi vòng vĩ độ ⇄ ô', () => {
    for (const lat of [-60, -10.5, 0, 10.762622, 55, 84]) {
      expect(tileYToLat(latToTileY(lat, 17), 17)).toBeCloseTo(lat, 7);
    }
  });

  it('x TĂNG về phía Đông, y TĂNG về phía Nam', () => {
    expect(lngToTileX(20, 12)).toBeGreaterThan(lngToTileX(10, 12));
    expect(latToTileY(10, 12)).toBeGreaterThan(latToTileY(20, 12));
  });

  it('vĩ độ ngoài dải Mercator bị kẹp chứ không ra NaN/Infinity', () => {
    const y = latToTileY(89.9, 10);
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBeCloseTo(latToTileY(MERCATOR_MAX_LAT, 10), 9);
  });
});

describe('tileUrl', () => {
  it('Esri xếp {z}/{y}/{x} — đúng thứ tự trong mẫu, không phải z/x/y', () => {
    const sat = getMapSource('satellite');
    expect(tileUrl(sat, { z: 17, x: 105, y: 62 })).toMatch(/\/17\/62\/105$/);
  });

  it('OSM xếp {z}/{x}/{y}', () => {
    expect(tileUrl(getMapSource('street'), { z: 17, x: 105, y: 62 }))
      .toMatch(/\/17\/105\/62\.png$/);
  });

  it('x quấn vòng quanh Trái Đất, y bị kẹp trong lưới', () => {
    const osm = getMapSource('street');
    const n = tilesPerAxis(4);
    expect(tileUrl(osm, { z: 4, x: n + 3, y: 2 })).toBe(tileUrl(osm, { z: 4, x: 3, y: 2 }));
    expect(tileUrl(osm, { z: 4, x: -1, y: 2 })).toBe(tileUrl(osm, { z: 4, x: n - 1, y: 2 }));
    expect(tileUrl(osm, { z: 4, x: 1, y: n + 5 })).toBe(tileUrl(osm, { z: 4, x: 1, y: n - 1 }));
  });

  it('id lạ → rơi về nguồn đầu tiên chứ không nổ', () => {
    expect(getMapSource('không-có-nguồn-này')).toBe(MAP_SOURCES[0]);
    expect(getMapSource(DEFAULT_MAP_SOURCE_ID).id).toBe('satellite');
  });
});

describe('planTiles', () => {
  it('vườn nhỏ → dùng mức phóng NÉT NHẤT cho phép', () => {
    const plan = planTiles(square(30), ORIGIN, { maxZoom: 19 });
    expect(plan.zoom).toBe(19);
    expect(plan.tiles.length).toBeGreaterThan(0);
    expect(plan.tiles.length).toBeLessThanOrEqual(MAX_TILES);
  });

  it('vườn RẤT rộng → tự hạ mức phóng để không vượt trần số ô', () => {
    const plan = planTiles(square(4000), ORIGIN, { maxZoom: 19 });
    expect(plan.zoom).toBeLessThan(19);
    expect(plan.tiles.length).toBeLessThanOrEqual(MAX_TILES);
  });

  it('trần số ô nhỏ hơn thì mức phóng phải thấp hơn', () => {
    const many = planTiles(square(300), ORIGIN, { maxZoom: 19, maxTiles: 36 });
    const few = planTiles(square(300), ORIGIN, { maxZoom: 19, maxTiles: 4 });
    expect(few.zoom).toBeLessThan(many.zoom);
  });

  it('không bao giờ tụt dưới MIN_ZOOM dù trần số ô = 1', () => {
    const plan = planTiles(square(9000), ORIGIN, { maxZoom: 19, maxTiles: 1 });
    expect(plan.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(plan.tiles.length).toBeGreaterThan(0);
  });

  it('các ô PHỦ KÍN ranh giới vườn', () => {
    const half = 40;
    const plan = planTiles(square(half), ORIGIN, { maxZoom: 19 });
    const minX = Math.min(...plan.tiles.map((t) => t.cx - t.width / 2));
    const maxX = Math.max(...plan.tiles.map((t) => t.cx + t.width / 2));
    const minZ = Math.min(...plan.tiles.map((t) => t.cz - t.depth / 2));
    const maxZ = Math.max(...plan.tiles.map((t) => t.cz + t.depth / 2));
    expect(minX).toBeLessThanOrEqual(-half);
    expect(maxX).toBeGreaterThanOrEqual(half);
    expect(minZ).toBeLessThanOrEqual(-half);
    expect(maxZ).toBeGreaterThanOrEqual(half);
  });

  it('ô KỀ NHAU khít cạnh — không hở đường ke', () => {
    const plan = planTiles(square(60), ORIGIN, { maxZoom: 19 });
    const byKey = new Map(plan.tiles.map((t) => [`${t.x},${t.y}`, t]));
    let checked = 0;
    for (const t of plan.tiles) {
      const right = byKey.get(`${t.x + 1},${t.y}`);
      if (right) {
        expect(t.cx + t.width / 2).toBeCloseTo(right.cx - right.width / 2, 6);
        checked++;
      }
      const below = byKey.get(`${t.x},${t.y + 1}`);
      if (below) {
        expect(t.cz + t.depth / 2).toBeCloseTo(below.cz - below.depth / 2, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('kích thước ô luôn dương và xấp xỉ nhau (vườn nhỏ, cùng vĩ độ)', () => {
    const plan = planTiles(square(60), ORIGIN, { maxZoom: 19 });
    for (const t of plan.tiles) {
      expect(t.width).toBeGreaterThan(0);
      expect(t.depth).toBeGreaterThan(0);
      expect(t.depth / t.width).toBeCloseTo(1, 2); // Mercator vuông ở mọi vĩ độ
    }
    const widths = plan.tiles.map((t) => t.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.05);
  });

  it('ô ở mức 19 rộng cỡ 70–80 m tại vĩ độ ~10°', () => {
    const plan = planTiles(square(20), ORIGIN, { maxZoom: 19 });
    expect(plan.tiles[0].width).toBeGreaterThan(65);
    expect(plan.tiles[0].width).toBeLessThan(85);
  });

  it('ranh giới rỗng → vẫn ra ô (dùng hộp bao mặc định)', () => {
    const plan = planTiles([], ORIGIN, { maxZoom: 19 });
    expect(plan.tiles.length).toBeGreaterThan(0);
  });

  it('vườn ở NAM bán cầu vẫn đúng chiều Bắc–Nam', () => {
    const south = { lat: -23.5, lng: 133.8 };
    const plan = planTiles(square(50), south, { maxZoom: 19 });
    // Ô có y nhỏ hơn phải nằm về phía BẮC, tức cz nhỏ hơn (−Z là Bắc).
    const sorted = [...plan.tiles].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y > sorted[i - 1].y) expect(sorted[i].cz).toBeGreaterThan(sorted[i - 1].cz);
    }
  });
});

describe('metersToLatLng (geo)', () => {
  it('đi vòng mét ⇄ lat/lng', () => {
    for (const p of [{ x: 0, z: 0 }, { x: 120, z: -80 }, { x: -450, z: 900 }]) {
      const back = latLngToMeters(metersToLatLng(p, ORIGIN), ORIGIN);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.z).toBeCloseTo(p.z, 6);
    }
  });

  it('z ÂM (Bắc) → vĩ độ TĂNG', () => {
    expect(metersToLatLng({ x: 0, z: -100 }, ORIGIN).lat).toBeGreaterThan(ORIGIN.lat);
  });

  it('x DƯƠNG (Đông) → kinh độ TĂNG', () => {
    expect(metersToLatLng({ x: 100, z: 0 }, ORIGIN).lng).toBeGreaterThan(ORIGIN.lng);
  });
});

/**
 * Tên miền ô bản đồ — cổng cho một lỗi ĐÃ SỐNG SÓT QUA MỘT LẦN VÁ.
 *
 * ⛔ Báo từ thực địa: lớp vệ tinh chạy bình thường, lớp "Bản đồ" ra một mảng
 *    xanh dương trống, và MapLibre in:
 *
 *      failed to load … for source osm-tiles-detail: Unable to resolve host
 *      "a.tile.openstreetmap.org": no address associated with hostname
 *
 * `a.` / `b.` / `c.tile.openstreetmap.org` là dạng subdomain OSM đã ngưng —
 * chúng không còn phân giải. Vệ tinh không dính vì nó trỏ máy chủ ArcGIS.
 *
 * ── Vì sao đáng một cổng, chứ không chỉ một lần sửa ─────────────────────────
 * URL này bị chép tay ở BA chỗ. Ai đó đã phát hiện và vá — nhưng chỉ vá được
 * chỗ họ đang mở, rồi viết hẳn một chú thích giải thích ngay cạnh. Hai chỗ kia
 * ở lại tên miền chết, và một trong hai nằm CÙNG TỆP, cách vài trăm dòng.
 *
 * Một bản vá chỉ tới được nơi người sửa đang nhìn. Cổng này tới được cả kho.
 */
describe('không tệp nào còn trỏ vào tên miền OSM đã ngưng', () => {
  const GOC = join(__dirname, '..', '..');

  /** Mọi tệp nguồn dưới `src/`, trừ bài kiểm. */
  const moiTepNguon = (thuMuc: string, ra: string[] = []): string[] => {
    for (const ten of readdirSync(thuMuc)) {
      const duong = join(thuMuc, ten);
      if (statSync(duong).isDirectory()) moiTepNguon(duong, ra);
      else if (/\.tsx?$/.test(ten) && !ten.includes('.test.')) ra.push(duong);
    }
    return ra;
  };

  /**
   * Bỏ chú thích KHỐI, rồi bỏ chú thích DÒNG theo cách khác hẳn thường lệ.
   *
   * ⛔ Bộ lọc quen dùng ở các cổng khác — cắt từ `//` tới hết dòng — ĂN MẤT
   *    CHÍNH THỨ CỔNG NÀY ĐI TÌM: `https://a.tile…` có hai dấu gạch chéo ở
   *    giữa, nên nó bị cắt từ đó, để lại `'https:` vô hại. Cổng xanh trong khi
   *    tên miền chết còn nguyên trong mã.
   *
   *    Đã đo, không phải lo xa: chèn một dòng URL chết vào `FarmDetailScreen`
   *    rồi chạy bản cũ của cổng này → 3/3 xanh. Nó im lặng đúng ở ca duy nhất
   *    nó sinh ra để bắt.
   *
   * Nên chú thích dòng bị loại theo DÒNG: chỉ bỏ dòng mà phần đầu đã là chú
   * thích. URL nằm giữa một dòng mã thì không bao giờ khớp.
   */
  const maChay = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((d) => {
        const t = d.trim();
        return !t.startsWith('//') && !t.startsWith('*');
      })
      .join('\n');

  it('`a|b|c.tile.openstreetmap.org` KHÔNG còn ở đâu trong `src/`', () => {
    const dinh: string[] = [];
    for (const tep of moiTepNguon(GOC)) {
      if (/[abc]\.tile\.openstreetmap\.org/.test(maChay(readFileSync(tep, 'utf8')))) {
        dinh.push(tep.slice(GOC.length + 1));
      }
    }
    expect(dinh).toEqual([]);
  });

  it('nguồn "Bản đồ" dùng đúng hằng chung', () => {
    const street = MAP_SOURCES.find((s) => s.id === 'street');
    expect(street?.urlTemplate).toBe(OSM_STREET_TILES);
    expect(OSM_STREET_TILES).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  it('phép lọc chú thích KHÔNG được ăn mất URL', () => {
    // Đối chứng cho chính phép đo. Đây là ca đã làm cổng bản cũ mù.
    expect(maChay("const u = 'https://a.tile.openstreetmap.org/x';"))
      .toContain('a.tile.openstreetmap.org');
    // Mà vẫn phải bỏ được chú thích thật — nếu không, chính khối chú thích ở
    // trên đầu tệp này sẽ làm cổng tự đỏ vì chính nó.
    expect(maChay('  // a.tile.openstreetmap.org')).not.toContain('openstreetmap');
  });

  it('phép đo này có thật sự quét được tệp', () => {
    // Một `moiTepNguon` trả mảng rỗng vẫn cho ca đầu xanh, và lúc đó cổng chỉ là
    // đồ trang trí.
    expect(moiTepNguon(GOC).length).toBeGreaterThan(100);
  });
});
