/**
 * treeGeo — TOẠ ĐỘ ĐỊA LÝ CHÍNH THỨC của một cây.
 *
 * ── Vấn đề ──────────────────────────────────────────────────────────────────
 * Một cây có thể có HAI vị trí, và chúng không phải lúc nào cũng khớp:
 *
 *   GPS máy chủ   ghi lúc đăng ký cây, bằng GPS điện thoại đứng cạnh gốc. Dưới
 *                 tán rậm, sai số 15–25 m là bình thường — đủ để cây rơi sang
 *                 hàng bên cạnh, hoặc ra ngoài cả ranh giới vườn.
 *   ĐẶT TAY       người dùng kéo cây vào đúng chỗ trong sơ đồ 3D. Đây là thứ họ
 *                 nhìn tận mắt và tự tay chỉnh, nên nó ĐÚNG HƠN.
 *
 * Trước tệp này, hai vị trí sống ở hai nơi và không nơi nào biết nơi kia: đặt
 * lại cây trong sơ đồ 3D xong, mở màn dẫn đường thì cây vẫn nằm chỗ cũ. Người
 * dùng đã sửa, hệ thống vẫn chỉ sai — kiểu lỗi làm mất niềm tin nhanh nhất.
 *
 * ── Luật ────────────────────────────────────────────────────────────────────
 * ĐẶT TAY THẮNG. Nó là hành động có chủ ý của người biết rõ mảnh vườn; GPS chỉ
 * là một phép đo có sai số. Chưa đặt tay thì mới lấy GPS máy chủ.
 *
 * ── Vì sao suy ra chứ không lưu thêm một bản lat/lng ────────────────────────
 * Vị trí đặt tay đã lưu sẵn dạng (x, z) mét trong hệ vườn (`positionStore`).
 * Lưu thêm một bản lat/lng là hai bản ghi cho cùng một sự thật, và chúng sẽ
 * lệch nhau ngay lần đầu ai đó sửa một bên. Ở đây đổi đơn vị lúc ĐỌC, gốc toạ
 * độ suy từ chính ranh giới vườn — cùng công thức `buildFarmRing` mà sơ đồ 3D
 * dùng, nên hai màn không thể hiểu khác nhau về "gốc" ở đâu.
 */

import { centroidLatLng, isUsableLatLng, metersToLatLng, type LatLng, type Vec2 } from './geo';
import { isValidLatLon } from '../wayfind/wayfind';

/** `{lat, lon}` của module dẫn đường ⟂ `{lat, lng}` của sơ đồ 3D — nối ở đây. */
export interface GeoPoint { lat: number; lon: number }

/**
 * Gốc hệ toạ độ của vườn: trọng tâm ranh giới.
 *
 * PHẢI khớp `buildFarmRing` (`geo.ts`) — nơi sơ đồ 3D lấy gốc. Lệch gốc là mọi
 * cây đặt tay dịch đi cùng một quãng, đều đặn, và không ai nghĩ ra là do đâu.
 */
export function farmOrigin(boundary: unknown): LatLng | null {
  const pts: LatLng[] = [];
  for (const raw of (Array.isArray(boundary) ? boundary : [])) {
    const o = raw as Record<string, unknown> | null;
    if (!o) continue;
    const lat = Number(o.lat);
    const lng = Number(o.lng ?? o.lon);
    // `isUsableLatLng` chứ không `Number.isFinite`: một đỉnh `0/0` lọt vào là
    // kéo gốc hệ toạ độ ra giữa Đại Tây Dương, và MỌI cây đặt tay dịch theo.
    if (isUsableLatLng({ lat, lng })) pts.push({ lat, lng });
  }
  if (pts.length < 3) return null;
  return centroidLatLng(pts);
}

/**
 * Toạ độ địa lý dùng được của một cây, theo luật "đặt tay thắng".
 *
 * `serverGps` nhận cả `{lat, lng}` lẫn `{lat, lon}` lẫn `[lat, lng]` — ba dạng
 * đang cùng tồn tại trong app. Không có gì dùng được → `null`, và màn gọi có
 * nhiệm vụ bỏ qua cây đó chứ không vẽ nó ở toạ độ 0,0 giữa Đại Tây Dương.
 */
export function treeGeoPoint(input: {
  serverGps?: unknown;
  localPos?: Vec2 | null;
  origin?: LatLng | null;
}): GeoPoint | null {
  const { serverGps, localPos, origin } = input;

  // 1) Đặt tay — chỉ dùng được khi biết gốc hệ vườn để đổi mét sang độ.
  if (localPos && origin
      && Number.isFinite(localPos.x) && Number.isFinite(localPos.z)) {
    const p = metersToLatLng(localPos, origin);
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      return { lat: p.lat, lon: p.lng };
    }
  }

  // 2) GPS máy chủ.
  return parseGps(serverGps);
}

/**
 * Ba dạng `gps` đang tồn tại → `{lat, lon}`. Không đọc được thì `null`.
 *
 * ⛔ Bản trước chỉ hỏi `Number.isFinite`, trong khi chú thích của `treeGeoPoint`
 *    ngay trên đã hứa "không vẽ nó ở toạ độ 0,0 giữa Đại Tây Dương". Lời hứa
 *    nằm ở chú thích, ràng buộc thì không ở đâu cả — nên `0/0` đi thẳng ra bản
 *    đồ dẫn đường. Nay dùng chung `isValidLatLon` với mọi chỗ khác.
 */
export function parseGps(gps: unknown): GeoPoint | null {
  if (!gps) return null;

  if (Array.isArray(gps) && gps.length >= 2) {
    const p = { lat: Number(gps[0]), lon: Number(gps[1]) };
    return isValidLatLon(p) ? p : null;
  }
  if (typeof gps === 'object') {
    const o = gps as Record<string, unknown>;
    const p = { lat: Number(o.lat), lon: Number(o.lon ?? o.lng) };
    return isValidLatLon(p) ? p : null;
  }
  return null;
}
