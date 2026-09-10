/**
 * space3d/mapTiles — RANH GIỚI VƯỜN → các Ô BẢN ĐỒ (raster tile) đặt dưới nền.
 *
 * Ý tưởng: không nhúng cả một thư-viện bản-đồ vào cảnh 3D. Ô bản đồ vốn chỉ là
 * ảnh 256×256 lấy theo lưới Web-Mercator chuẩn (z/x/y) — ta tự tính xem cần
 * những ô nào và mỗi ô nằm ở đâu (mét) trong hệ toạ-độ vườn, rồi trải chúng
 * thành các mặt phẳng ngay dưới mặt đất. Không thêm phụ-thuộc mới.
 *
 * ── Hai phép chiếu khác nhau, vì sao vẫn khớp ────────────────────────────────
 * `geo.ts` quy lat/lng ra mét kiểu EQUIRECTANGULAR (phẳng, đơn giản), còn ô bản
 * đồ theo MERCATOR. Hai phép chiếu chỉ lệch nhau ở hệ-số giãn theo vĩ độ, mà hệ
 * số đó gần như KHÔNG đổi trong phạm vi vài km (đạo hàm bậc hai rất nhỏ) → với
 * một nông trại thì sai lệch dưới mức chục cm, nhỏ hơn sai số GPS nhiều lần.
 * Quan trọng hơn: MỌI ô đều quy đổi qua cùng một hàm nên các cạnh chung KHỚP
 * TUYỆT ĐỐI (góc Đông-Nam của ô này = góc Tây-Bắc của ô kia) → không hở đường ke.
 *
 * File THUẦN TÍNH (không import three/RN) → test được bằng jest.
 */

import { latLngToMeters, metersToLatLng, ringBounds, type LatLng, type Vec2 } from './geo';

/** Ô bản đồ chuẩn là ảnh 256×256. */
export const TILE_PX = 256;

/** Mercator không biểu diễn được hai cực — mọi lưới tile đều cắt ở vĩ độ này. */
export const MERCATOR_MAX_LAT = 85.05112878;

export const MIN_ZOOM = 3;

/**
 * Trần số ô tải về. Mỗi ô = 1 lượt tải mạng + 1 texture trên GPU, nên phải chặn:
 * vườn quá rộng thì hạ mức phóng (ô to hơn, nét kém hơn) chứ không tải thêm ô.
 */
export const MAX_TILES = 36;

export interface MapSource {
  id: string;
  label: string;
  /**
   * Mẫu URL. Thứ tự {z}/{x}/{y} nằm NGAY TRONG mẫu vì mỗi nhà cung cấp xếp một
   * kiểu (Esri là {z}/{y}/{x}) — nhét thứ tự vào đây thì thêm nguồn mới không
   * phải sửa code sinh URL.
   */
  urlTemplate: string;
  /** Mức phóng lớn nhất nguồn này thật sự có ảnh; vượt qua là ô trống/404. */
  maxZoom: number;
  attribution: string;
}

/**
 * SỔ ĐĂNG KÝ nguồn ảnh nền. Thêm nguồn mới = thêm đúng 1 mục ở đây.
 * Mặc định là ẢNH VỆ TINH: vườn cây ở nông thôn nhìn ảnh vệ tinh mới thấy được
 * tán cây / luống / bờ ranh thật, còn bản đồ đường phố thường trắng trơn.
 */
/**
 * URL ô bản đồ đường phố — MỘT nguồn duy nhất cho cả kho.
 *
 * ⛔ Tên miền `a.` / `b.` / `c.tile.openstreetmap.org` là dạng subdomain OSM ĐÃ
 *    NGƯNG. Chúng không còn phân giải được, và MapLibre báo đúng như vậy:
 *    *"Unable to resolve host a.tile.openstreetmap.org: no address associated
 *    with hostname"*. Lớp vệ tinh vẫn chạy vì nó trỏ máy chủ ArcGIS, nên nhìn ra
 *    thành "vệ tinh thì được, bản đồ thì một màu xanh dương".
 *
 *    Kho đã vá một lần, ở MỘT trong ba chỗ chép cùng một URL. Hai chỗ kia ở lại
 *    tên miền chết. Đó là lý do hằng này tồn tại: URL chép tay ở ba chỗ thì bản
 *    vá cũng chỉ tới được chỗ người sửa đang mở.
 */
export const OSM_STREET_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_SOURCES: readonly MapSource[] = [
  {
    id: 'satellite',
    label: 'Vệ tinh',
    urlTemplate:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'street',
    label: 'Bản đồ',
    urlTemplate: OSM_STREET_TILES,
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
] as const;

export const DEFAULT_MAP_SOURCE_ID = 'satellite';

export function getMapSource(id: string): MapSource {
  return MAP_SOURCES.find((s) => s.id === id) ?? MAP_SOURCES[0];
}

// ── Lưới Web-Mercator ────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Số ô trên một cạnh ở mức phóng z. */
export const tilesPerAxis = (z: number) => Math.pow(2, z);

/** Kinh độ → toạ-độ ô (số THỰC; phần nguyên là chỉ số ô). */
export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * tilesPerAxis(z);
}

/** Vĩ độ → toạ-độ ô (số THỰC). Vĩ độ ngoài dải Mercator bị kẹp về mép. */
export function latToTileY(lat: number, z: number): number {
  const rad = clamp(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT) * (Math.PI / 180);
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  return y * tilesPerAxis(z);
}

/** Toạ-độ ô → kinh độ của MÉP TÂY ô. */
export function tileXToLng(x: number, z: number): number {
  return (x / tilesPerAxis(z)) * 360 - 180;
}

/** Toạ-độ ô → vĩ độ của MÉP BẮC ô. */
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / tilesPerAxis(z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Ô bản đồ + chỗ đứng của nó trong hệ vườn (mét). */
export interface TilePlacement {
  z: number;
  x: number;
  y: number;
  /** Khoá ổn-định để cache texture / làm key React. */
  key: string;
  /** Tâm ô trong hệ vườn (mét). */
  cx: number;
  cz: number;
  /** Bề rộng Đông-Tây và bề sâu Bắc-Nam của ô (mét, luôn > 0). */
  width: number;
  depth: number;
}

export interface TilePlan {
  zoom: number;
  tiles: TilePlacement[];
}

export interface PlanTilesOptions {
  /** Trần mức phóng (thường lấy từ `MapSource.maxZoom`). */
  maxZoom?: number;
  maxTiles?: number;
  /** Nới hộp bao ra ngoài ranh giới cho đỡ cụt (tỉ lệ theo cạnh hộp). */
  padRatio?: number;
}

/** Ghép URL thật của một ô. Chỉ số x được quấn vòng quanh Trái Đất, y thì kẹp. */
export function tileUrl(src: MapSource, t: { z: number; x: number; y: number }): string {
  const n = tilesPerAxis(t.z);
  const x = ((t.x % n) + n) % n;
  const y = clamp(t.y, 0, n - 1);
  return src.urlTemplate
    .replace('{z}', String(t.z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Chọn ô bản đồ phủ kín vườn.
 *
 * Cách chọn mức phóng: bắt đầu từ mức NÉT NHẤT rồi hạ dần cho tới khi số ô nằm
 * trong trần cho phép — vườn nhỏ được ảnh nét, vườn lớn tự lùi ra chứ không nổ
 * số lượt tải.
 */
export function planTiles(
  ring: Vec2[],
  origin: LatLng,
  opts: PlanTilesOptions = {},
): TilePlan {
  const maxZoom = Math.min(opts.maxZoom ?? 19, 22);
  const maxTiles = Math.max(1, opts.maxTiles ?? MAX_TILES);
  const padRatio = opts.padRatio ?? 0.35;

  const b = ringBounds(ring);
  // Tối thiểu 8 m để vườn suy biến (mọi đỉnh gần trùng) vẫn có nền để nhìn.
  const padX = Math.max(8, (b.maxX - b.minX) * padRatio);
  const padZ = Math.max(8, (b.maxZ - b.minZ) * padRatio);

  // −Z là Bắc → góc Tây-Bắc dùng (minX, minZ), Đông-Nam dùng (maxX, maxZ).
  const nw = metersToLatLng({ x: b.minX - padX, z: b.minZ - padZ }, origin);
  const se = metersToLatLng({ x: b.maxX + padX, z: b.maxZ + padZ }, origin);

  let zoom = MIN_ZOOM;
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (let z = maxZoom; z >= MIN_ZOOM; z--) {
    const ax0 = Math.floor(lngToTileX(nw.lng, z));
    const ax1 = Math.floor(lngToTileX(se.lng, z));
    const ay0 = Math.floor(latToTileY(nw.lat, z));
    const ay1 = Math.floor(latToTileY(se.lat, z));
    const count = (ax1 - ax0 + 1) * (ay1 - ay0 + 1);
    if (count <= maxTiles || z === MIN_ZOOM) {
      zoom = z; x0 = ax0; x1 = ax1; y0 = ay0; y1 = ay1;
      break;
    }
  }

  const tiles: TilePlacement[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Góc Tây-Bắc và Đông-Nam của CHÍNH ô này → hình chữ nhật trong hệ vườn.
      const a = latLngToMeters({ lat: tileYToLat(y, zoom), lng: tileXToLng(x, zoom) }, origin);
      const c = latLngToMeters({ lat: tileYToLat(y + 1, zoom), lng: tileXToLng(x + 1, zoom) }, origin);
      tiles.push({
        z: zoom, x, y,
        key: `${zoom}/${x}/${y}`,
        cx: (a.x + c.x) / 2,
        cz: (a.z + c.z) / 2,
        width: Math.abs(c.x - a.x),
        depth: Math.abs(c.z - a.z),
      });
    }
  }
  return { zoom, tiles };
}
