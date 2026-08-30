/**
 * circleGeo — vẽ một VÒNG lên bản đồ khi toạ độ chỉ tới KHU VỰC, không tới cây.
 *
 * MapLibre raster không có sẵn hình tròn theo mét: `CircleLayer` vẽ theo PIXEL,
 * tức phóng to thu nhỏ thì vòng giữ nguyên cỡ trên màn và KHÔNG còn nghĩa gì về
 * khoảng cách thật. Vòng ở đây phải nói "cây nằm đâu đó trong bán kính chừng này
 * mét", nên nó phải là một ĐA GIÁC theo toạ độ — phóng vào thì nó to ra theo.
 *
 * Vòng này KHÔNG thay cho ghim, nó nằm DƯỚI ghim. Bản đồ luôn cắm ghim ở toạ độ
 * máy chủ trả về (người mua cần một chỗ đi tới được), còn vòng chỉ vẽ thêm khi
 * máy chủ TỰ KHAI là đã làm thô — `gps_precision='coarse'` kèm `gps_precision_m`
 * (`_coarsen_public_gps`, mặc định `geohash_coarse`). Máy chủ không khai gì thì
 * không có bán kính nào để vẽ, và vẽ đại một vòng còn tệ hơn không vẽ: nó trông
 * y như một phép đo.
 */

/** Bán kính Trái Đất, mét. Dùng cầu tròn — sai số vài phần nghìn, quá đủ cho một vòng minh hoạ. */
const EARTH_R = 6_378_137;

export interface LonLat { lon: number; lat: number }

/**
 * Đa giác xấp xỉ hình tròn quanh một điểm, trả về theo thứ tự GeoJSON `[lon, lat]`.
 *
 * `steps` mặc định 64 — đủ để mắt đọc ra hình tròn ở mọi mức phóng thực dụng, mà
 * vẫn nhẹ. Vòng ĐÓNG (điểm cuối trùng điểm đầu) vì GeoJSON `Polygon` đòi vậy;
 * thiếu nó thì MapLibre vẽ ra một hình khuyết một múi.
 */
export function circleRing(
  center: LonLat,
  radiusM: number,
  steps = 64,
): [number, number][] {
  const n = Math.max(8, Math.floor(steps));
  const r = Math.max(1, radiusM);
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = (r / EARTH_R) * (180 / Math.PI);
  // Một độ kinh tuyến hẹp dần về hai cực. Bỏ `cos(lat)` thì ở vĩ độ 21 (Việt Nam)
  // vòng bị dẹt mất ~7% theo chiều đông-tây — nhìn ra ngay là hình bầu dục.
  const dLon = dLat / Math.max(Math.cos(latRad), 1e-6);

  const ring: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    ring.push([center.lon + dLon * Math.cos(t), center.lat + dLat * Math.sin(t)]);
  }
  ring.push(ring[0]);
  return ring;
}

/** `FeatureCollection` một vòng, sẵn cho `ShapeSource`. */
export function circleShape(center: LonLat, radiusM: number, steps = 64) {
  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [circleRing(center, radiusM, steps)] },
    }],
  };
}

/**
 * Mức phóng để vòng bán kính `radiusM` vừa lọt một ô rộng `widthPx`.
 *
 * Công thức Web Mercator: một pixel ở zoom z, vĩ độ φ, ứng với
 * `156543.03 · cos(φ) / 2^z` mét. Giải ngược ra z sao cho đường kính vòng chiếm
 * chừng 55% bề ngang ô — chừa lề để người ta thấy vòng NẰM TRONG một khung cảnh,
 * chứ không phải một mảng màu tràn kín ô.
 */
export function zoomForRadius(lat: number, radiusM: number, widthPx: number): number {
  const w = Math.max(80, widthPx);
  const r = Math.max(1, radiusM);
  const targetMetersPerPx = (r * 2) / (w * 0.55);
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / targetMetersPerPx);
  // Kẹp vào khoảng bản đồ raster còn có ảnh. Trên 19 là ô trắng (xem `FarmsMap`).
  return Math.min(18, Math.max(3, z));
}
