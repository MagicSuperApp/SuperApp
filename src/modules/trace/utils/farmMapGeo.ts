/**
 * farmMapGeo — hình học cho MÀN BẢN ĐỒ VƯỜN (tab "Bản đồ" ở trang Tổng quan).
 *
 * Tệp THUẦN TÍNH: không import react-native, không maplibre, không mạng — nên
 * `jest` chạy được thẳng. Mọi phép quyết định "vẽ gì, ở đâu, từ mức phóng nào"
 * nằm ở đây; tệp giao diện chỉ còn việc bày ra.
 *
 * ── Ba quyết định đáng ghi lại ──────────────────────────────────────────────
 *
 * 1. **GHIM lấy `center` của máy chủ TRƯỚC, trọng tâm ranh là dự phòng.** Chủ
 *    vườn có thể đặt tâm ở cổng vào hoặc nhà kho — chỗ người ta thật sự đi tới —
 *    còn trọng tâm hình học của một mảnh đất hình chữ L rơi vào giữa ruộng nhà
 *    hàng xóm. Máy chủ đã giữ `center` thì đừng tính lại.
 *
 * 2. **VÙNG vườn chỉ hiện từ mức phóng {@link POLYGON_MIN_ZOOM}.** Ở mức nhìn cả
 *    tỉnh, một mảnh vườn 2 ha nhỏ hơn đầu ghim — vẽ nó ra chỉ tạo một chấm màu
 *    thứ hai chồng lên ghim, và với vài chục vườn thì thành nhiễu. Phóng vào thì
 *    vùng mới có nghĩa: lúc đó người ta đang xem MỘT vườn, và hình thù mảnh đất
 *    là thông tin thật.
 *
 * 3. **Ranh dưới 3 điểm KHÔNG được vẽ thành vùng.** Hai điểm là một đoạn thẳng;
 *    ép nó thành đa giác là bịa ra một mảnh đất chưa ai đo. Vườn như vậy vẫn có
 *    ghim (biết nó ở đâu) nhưng không có vùng (chưa biết nó rộng tới đâu).
 */

import { areaSquareMeters, computeCentroid, type Coord } from './polygonGuards';
import { isValidLatLon } from '../../../features/wayfind/wayfind';
import type { Farm } from '../types';

// ---------------------------------------------------------------------------
// Hằng số
// ---------------------------------------------------------------------------

/**
 * Mức phóng bắt đầu vẽ VÙNG vườn. 13 ≈ nhìn thấy một xã.
 *
 * Thấp hơn thì vùng nhỏ hơn cái ghim đè lên nó; cao hơn thì người dùng phải
 * phóng thêm hai nhịp mới thấy hình mảnh đất, mà đó chính là thứ họ mở tab bản
 * đồ để xem.
 */
export const POLYGON_MIN_ZOOM = 13;

/** Mức phóng khi bay tới MỘT vườn cụ thể (chọn từ ô tìm kiếm hoặc từ ghim). */
export const FARM_FOCUS_ZOOM = 16;

/** Mức phóng lúc chưa có vườn nào để ngắm. */
export const FALLBACK_ZOOM = 5;

/**
 * Chỗ đứng khi CHƯA CÓ vườn nào có toạ độ: giữa đồng bằng sông Cửu Long.
 *
 * Không dùng [0, 0] — điểm đó ở giữa Đại Tây Dương và trông y hệt một bản đồ
 * hỏng. Một khung nhìn Việt Nam nói đúng rằng "chưa có gì để chỉ", mà vẫn là
 * một bản đồ có nghĩa.
 */
export const FALLBACK_CENTER: [number, number] = [105.78, 10.03];

/**
 * Nới tối thiểu của khung nhìn, tính bằng ĐỘ (~0,004° ≈ 440 m).
 *
 * Một vườn duy nhất cho ra hộp bao có bề rộng bằng 0. Đưa hộp đó cho camera thì
 * nó phóng tới mức lớn nhất và người dùng nhận một màn hình ảnh vệ tinh vỡ hạt.
 */
export const MIN_SPAN_DEG = 0.004;

/** Cạnh nhỏ nhất chấp nhận được của hộp bao — dùng chung cho lat và lng. */
const HALF_MIN_SPAN = MIN_SPAN_DEG / 2;

// ---------------------------------------------------------------------------
// Điểm neo của một vườn
// ---------------------------------------------------------------------------

export interface LatLng { lat: number; lng: number }

/**
 * ⛔ Bản trước ép dải nhưng KHÔNG loại `0/0`, nên một đỉnh ranh giới rỗng kéo
 *    hộp bao của vườn ra tận Vịnh Guinea và mọi ghim thật dồn về một điểm.
 *    Nay mượn nguyên `isValidLatLon` — cùng luật với hình thửa và với màn bản đồ.
 */
function _valid(p: { lat?: unknown; lng?: unknown } | null | undefined): p is LatLng {
  return !!p && isValidLatLon({ lat: p.lat as number, lon: p.lng as number });
}

/**
 * Chỗ cắm ghim của một vườn. `null` = vườn này CHƯA CÓ toạ độ nào.
 *
 * `null` phải được tôn trọng: vườn tạo bằng tay mà chưa đi ranh thì không có
 * chỗ nào để cắm ghim, và cắm bừa vào giữa màn hình là chỉ sai chỗ cho người đi
 * tìm. Danh sách bên tab "Vườn của tôi" vẫn hiện nó — đó mới là chỗ của nó.
 */
export function farmAnchor(farm: Farm | null | undefined): LatLng | null {
  if (!farm) return null;
  if (_valid(farm.center)) return { lat: farm.center.lat, lng: farm.center.lng };
  const ring = (farm.coordinates ?? []).filter(_valid);
  if (ring.length === 0) return null;
  if (ring.length === 1) return { lat: ring[0].lat, lng: ring[0].lng };
  const c = computeCentroid(ring as Coord[]);
  return _valid(c) ? { lat: c.lat, lng: c.lng } : null;
}

/**
 * Diện tích vườn, m². `null` = chưa đủ dữ liệu để nói.
 *
 * Dưới 3 điểm thì không có hình để đo — trả `null`, đừng trả 0. "0 m²" đọc ra
 * là "vườn rỗng", còn sự thật là "chưa đo ranh".
 */
export function farmAreaM2(farm: Farm | null | undefined): number | null {
  const ring = (farm?.coordinates ?? []).filter(_valid);
  if (ring.length < 3) return null;
  const a = areaSquareMeters(ring as Coord[]);
  return Number.isFinite(a) && a > 0 ? a : null;
}

/**
 * Diện tích cho người đọc: dưới 1 ha thì mét vuông, từ 1 ha thì HÉC-TA.
 *
 * Nhà vườn nói chuyện bằng héc-ta và công, không bằng "24.000 m²". Dưới 1 ha thì
 * ngược lại — "0,08 ha" khó hình dung hơn "800 m²".
 */
export function formatFarmArea(m2: number | null | undefined): string | null {
  if (typeof m2 !== 'number' || !Number.isFinite(m2) || m2 <= 0) return null;
  if (m2 < 10_000) return `${Math.round(m2).toLocaleString('vi-VN')} m²`;
  const ha = m2 / 10_000;
  return `${ha.toFixed(ha < 10 ? 2 : 1).replace('.', ',')} ha`;
}

// ---------------------------------------------------------------------------
// Khung nhìn
// ---------------------------------------------------------------------------

/** Hộp bao theo quy ước MapLibre: `[lng, lat]`. */
export interface MapBounds { ne: [number, number]; sw: [number, number] }

/**
 * Hộp bao ôm hết các vườn CÓ toạ độ. `null` = không vườn nào định vị được.
 *
 * Hộp luôn được nới ra ít nhất {@link MIN_SPAN_DEG} — xem lý do ở chú thích hằng
 * số đó.
 */
export function farmsBounds(farms: readonly Farm[] | null | undefined): MapBounds | null {
  const pts: LatLng[] = [];
  for (const f of farms ?? []) {
    // Lấy CẢ ranh chứ không chỉ điểm neo: một vườn dài 1 km mà chỉ ôm tâm thì
    // camera cắt mất hai đầu, và người dùng tưởng bản đồ tải thiếu.
    const ring = (f?.coordinates ?? []).filter(_valid);
    if (ring.length > 0) pts.push(...(ring as LatLng[]));
    else {
      const a = farmAnchor(f);
      if (a) pts.push(a);
    }
  }
  if (pts.length === 0) return null;

  let minLat = pts[0].lat, maxLat = pts[0].lat;
  let minLng = pts[0].lng, maxLng = pts[0].lng;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  if (maxLat - minLat < MIN_SPAN_DEG) {
    const mid = (maxLat + minLat) / 2;
    minLat = mid - HALF_MIN_SPAN;
    maxLat = mid + HALF_MIN_SPAN;
  }
  if (maxLng - minLng < MIN_SPAN_DEG) {
    const mid = (maxLng + minLng) / 2;
    minLng = mid - HALF_MIN_SPAN;
    maxLng = mid + HALF_MIN_SPAN;
  }

  return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}

// ---------------------------------------------------------------------------
// GeoJSON cho MapLibre
// ---------------------------------------------------------------------------

/**
 * Thuộc tính đi kèm mỗi feature.
 *
 * CHỈ mang `farm_id` và `name`: `name` để `SymbolLayer` in nhãn cạnh ghim, còn
 * `farm_id` để lúc chạm thì tra ngược ra vườn. Nhồi cả bản ghi vườn vào đây là
 * nhân bản dữ liệu vào một chỗ không ai nghĩ tới khi sửa.
 */
export interface FarmFeatureProps { farm_id: string; name: string }

export interface FarmFeature {
  type: 'Feature';
  id: string;
  properties: FarmFeatureProps;
  geometry:
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'Polygon'; coordinates: [number, number][][] };
}

export interface FarmFeatureCollection {
  type: 'FeatureCollection';
  features: FarmFeature[];
}

const EMPTY: FarmFeatureCollection = { type: 'FeatureCollection', features: [] };

/** Ghim của từng vườn định vị được. Vườn không có toạ độ bị bỏ qua (xem `farmAnchor`). */
export function pinFeatures(farms: readonly Farm[] | null | undefined): FarmFeatureCollection {
  const features: FarmFeature[] = [];
  for (const f of farms ?? []) {
    const a = farmAnchor(f);
    if (!a || !f?.id) continue;
    features.push({
      type: 'Feature',
      id: f.id,
      properties: { farm_id: f.id, name: f.name || f.id },
      geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
    });
  }
  return features.length ? { type: 'FeatureCollection', features } : EMPTY;
}

/**
 * Vùng vườn — dựng lại từ CHÍNH các điểm nối máy chủ lưu.
 *
 * Vòng được ĐÓNG KÍN ở đây (điểm cuối = điểm đầu) vì GeoJSON đòi vậy, còn máy chủ
 * lưu vòng mở. Thiếu bước đóng thì `FillLayer` của MapLibre vẫn vẽ, nhưng cạnh
 * cuối do nó tự nối — và ở vườn hình chữ L thì cạnh tự nối đó cắt ngang mảnh đất.
 */
export function polygonFeatures(farms: readonly Farm[] | null | undefined): FarmFeatureCollection {
  const features: FarmFeature[] = [];
  for (const f of farms ?? []) {
    const ring = (f?.coordinates ?? []).filter(_valid);
    if (ring.length < 3 || !f?.id) continue;
    const coords: [number, number][] = ring.map((c) => [c.lng, c.lat]);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);
    features.push({
      type: 'Feature',
      id: f.id,
      properties: { farm_id: f.id, name: f.name || f.id },
      geometry: { type: 'Polygon', coordinates: [coords] },
    });
  }
  return features.length ? { type: 'FeatureCollection', features } : EMPTY;
}

// ---------------------------------------------------------------------------
// Tìm vườn theo tên
// ---------------------------------------------------------------------------

/**
 * Bảng bỏ dấu tiếng Việt.
 *
 * ⚠ KHÔNG dùng `String.prototype.normalize('NFD')`: Hermes (máy JS của app) chỉ
 * có `normalize` khi bản dựng bật ICU, và bản Android rút gọn thì không — hàm
 * biến mất lặng lẽ và ô tìm kiếm ngừng khớp chữ có dấu mà không ai thấy lỗi.
 * Bảng tra thì chạy ở mọi bản dựng.
 *
 * Bảng viết theo NHÓM để không phải đếm tay hai chuỗi song song cho khớp độ dài
 * — chính chỗ đó là nơi lỗi hay nằm.
 */
const VI_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['a', 'àáạảãâầấậẩẫăằắặẳẵ'],
  ['e', 'èéẹẻẽêềếệểễ'],
  ['i', 'ìíịỉĩ'],
  ['o', 'òóọỏõôồốộổỗơờớợởỡ'],
  ['u', 'ùúụủũưừứựửữ'],
  ['y', 'ỳýỵỷỹ'],
  ['d', 'đ'],
];

const FOLD_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [plain, marked] of VI_GROUPS) {
    for (const ch of marked) m.set(ch, plain);
  }
  return m;
})();

/** Chữ thường, bỏ dấu, gom khoảng trắng — dạng dùng để SO SÁNH, không để hiện. */
export function foldVi(s: string | null | undefined): string {
  if (!s) return '';
  let out = '';
  for (const ch of s.toLowerCase()) out += FOLD_MAP.get(ch) ?? ch;
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Lọc vườn theo chữ người dùng gõ. Chuỗi rỗng → trả NGUYÊN danh sách.
 *
 * So sánh sau khi bỏ dấu, vì bàn phím tiếng Việt trên điện thoại chậm và người
 * ta gõ "vuon ba tu" để tìm "Vườn Bà Tư". Bắt gõ đúng dấu là bắt họ gõ hai lần.
 * Có tra cả `farm_id` để dán mã vào cũng ra — nhưng chỉ khi người dùng gõ ≥ 4 ký
 * tự, tránh một chữ cái khớp bừa vào giữa một chuỗi uuid.
 */
export function searchFarms(farms: readonly Farm[] | null | undefined, query: string): Farm[] {
  const list = (farms ?? []).slice();
  const q = foldVi(query);
  if (!q) return list;
  return list.filter((f) => {
    if (foldVi(f?.name).includes(q)) return true;
    return q.length >= 4 && foldVi(f?.id).includes(q);
  });
}
