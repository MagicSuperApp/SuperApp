/**
 * wayfind — TOÁN DẪN ĐƯỜNG ngoài thực địa: từ chỗ đang đứng tới VƯỜN hoặc tới CÂY.
 *
 * File THUẦN TÍNH (không import react-native / three) → test được bằng jest.
 * Màn `WayfindScreen` chỉ lo GPS + vẽ; mọi phép tính hướng/khoảng cách nằm ở đây.
 *
 * ── Vì sao không nhúng thư-viện bản đồ ──────────────────────────────────────
 * Chặng XA (từ nhà tới cổng vườn) là việc của Google/Apple Maps — có đường sá,
 * có giao thông, ta không làm lại. Ta chỉ dựng URL rồi giao cho họ.
 * Chặng GẦN (trong vườn, từ cổng tới đúng gốc cây) thì KHÔNG bản đồ nào chỉ
 * được: không có đường, cây cách nhau vài mét. Chặng này ta tự làm bằng
 * khoảng-cách + góc phương-vị, đúng kiểu la bàn.
 *
 * ── Quy ước góc ─────────────────────────────────────────────────────────────
 * Mọi góc là ĐỘ, hệ phương-vị: 0 = Bắc, 90 = Đông, 180 = Nam, 270 = Tây.
 * "course" (hướng đi) lấy từ `position.coords.heading` của GPS — đó là hướng
 * DI CHUYỂN, không phải hướng máy đang chĩa. Đứng yên thì nó vô nghĩa (xem
 * `isCourseUsable`), nên lúc đó ta nói hướng tuyệt đối ("Đông Bắc") chứ không
 * quay mũi tên — quay bừa là chỉ sai đường giữa vườn.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Bán kính Trái Đất trung bình (IUGG mean radius), mét. */
export const EARTH_RADIUS_M = 6371008.8;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Toạ-độ hợp lệ? Chặn NaN, chặn (0,0) — "Null Island" gần như luôn là dữ liệu rỗng. */
export function isValidLatLon(p: unknown): p is LatLon {
  if (!p || typeof p !== 'object') return false;
  const { lat, lon } = p as LatLon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
}

/** `[lat, lon]` của field-reid → LatLon. Mảng thiếu/hỏng → null (KHÔNG bịa số). */
export function fromGpsPair(gps: unknown): LatLon | null {
  if (!Array.isArray(gps) || gps.length < 2) return null;
  const p = { lat: Number(gps[0]), lon: Number(gps[1]) };
  return isValidLatLon(p) ? p : null;
}

/** Đưa góc về [0, 360). */
export function normalizeDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/** Đưa hiệu hai góc về (−180, 180] — dùng để quay mũi tên. */
export function signedDeltaDeg(deg: number): number {
  const n = normalizeDeg(deg);
  return n > 180 ? n - 360 : n;
}

/**
 * Khoảng cách mặt cầu (haversine), mét.
 *
 * Vườn chỉ cỡ trăm mét nên công thức phẳng cũng đủ, nhưng haversine không đắt
 * hơn đáng kể mà lại đúng cả khi anh còn ở nhà cách vườn 40 km.
 */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * D2R;
  const dLon = (b.lon - a.lon) * D2R;
  const la1 = a.lat * D2R;
  const la2 = b.lat * D2R;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Góc phương-vị ĐẦU CHẶNG từ `from` tới `to`, [0, 360).
 *
 * "Đầu chặng" vì trên mặt cầu góc này đổi dần dọc đường; ở cự-ly vườn thì thay
 * đổi không đo được, còn ở cự-ly liên tỉnh thì cũng chỉ dùng để biết hướng lớn.
 */
export function initialBearingDeg(from: LatLon, to: LatLon): number {
  const la1 = from.lat * D2R;
  const la2 = to.lat * D2R;
  const dLon = (to.lon - from.lon) * D2R;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return normalizeDeg(Math.atan2(y, x) * R2D);
}

/** 16 hướng la bàn, tiếng Việt. Chỉ số = round(bearing / 22.5) % 16. */
export const COMPASS_16_VI = [
  'Bắc', 'Bắc Đông Bắc', 'Đông Bắc', 'Đông Đông Bắc',
  'Đông', 'Đông Đông Nam', 'Đông Nam', 'Nam Đông Nam',
  'Nam', 'Nam Tây Nam', 'Tây Nam', 'Tây Tây Nam',
  'Tây', 'Tây Tây Bắc', 'Tây Bắc', 'Bắc Tây Bắc',
] as const;

/** Góc phương-vị → tên hướng tiếng Việt ("Đông Bắc"). */
export function compassPointVi(bearingDeg: number): string {
  const i = Math.round(normalizeDeg(bearingDeg) / 22.5) % 16;
  return COMPASS_16_VI[i];
}

/**
 * `coords.heading` của GPS dùng được không?
 *
 * Android trả 0 khi đứng yên, iOS trả −1; cả hai chỉ đúng khi đang DI CHUYỂN.
 * Ngưỡng 0.6 m/s ≈ đi bộ chậm — dưới mức đó thì hướng nhiễu loạn, thà nói
 * hướng tuyệt đối còn hơn quay mũi tên sai.
 */
export function isCourseUsable(heading: number | null | undefined, speed: number | null | undefined): boolean {
  if (typeof heading !== 'number' || !Number.isFinite(heading) || heading < 0) return false;
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return false;
  return speed >= 0.6;
}

/**
 * Góc quay MŨI TÊN trên màn: lệch giữa hướng-tới-đích và hướng đang đi.
 * 0 = thẳng trước mặt, +90 = bên phải, −90 = bên trái, 180 = sau lưng.
 */
export function relativeBearingDeg(targetBearing: number, courseDeg: number): number {
  return signedDeltaDeg(targetBearing - courseDeg);
}

/** Góc lệch → mặt đồng hồ 1..12 ("2 giờ" = chếch phải phía trước). */
export function clockHourOf(relativeDeg: number): number {
  const h = Math.round(normalizeDeg(relativeDeg) / 30);
  return h === 0 ? 12 : h;
}

/** Câu chỉ hướng ngắn cho nông dân: "chếch phải, 2 giờ". */
export function relativeHintVi(relativeDeg: number): string {
  const d = signedDeltaDeg(relativeDeg);
  const hour = clockHourOf(d);
  const abs = Math.abs(d);
  if (abs <= 20) return 'đi thẳng';
  if (abs >= 160) return `quay lại phía sau (${hour} giờ)`;
  const side = d > 0 ? 'phải' : 'trái';
  return abs >= 70 ? `rẽ ${side} (${hour} giờ)` : `chếch ${side} (${hour} giờ)`;
}

/**
 * Khoảng cách → chữ. Dưới 1 km đọc theo mét (làm tròn 1 m dưới 100 m, 5 m trên
 * 100 m — GPS không hơn thế), từ 1 km trở lên đọc km 1 số lẻ, dấu phẩy kiểu Việt.
 */
export function formatDistanceVi(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 100) return `${Math.round(meters)} m`;
  if (meters < 1000) return `${Math.round(meters / 5) * 5} m`;
  const km = meters / 1000;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Thời gian đi bộ ước lượng (phút), 1,25 m/s. Trả tối thiểu 1 phút. */
export function walkMinutes(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return Math.max(1, Math.round(meters / 1.25 / 60));
}

export type ArrivalState = 'arrived' | 'near' | 'far';

/**
 * Đã tới chưa?
 *
 * Ngưỡng "tới" phải NỚI THEO SAI SỐ GPS, không cố định: máy rẻ giữa tán cây hay
 * báo sai số 15–25 m, chốt cứng 5 m thì mũi tên quay vòng vòng ngay tại gốc cây
 * mà không bao giờ chịu nói "tới rồi". Trần 25 m để sai số thảm hoạ không biến
 * cả vườn thành "đã tới".
 */
export function arrivalStateOf(distanceM: number, accuracyM?: number | null): ArrivalState {
  const acc = typeof accuracyM === 'number' && Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 0;
  const arrive = Math.min(25, Math.max(6, acc));
  if (distanceM <= arrive) return 'arrived';
  if (distanceM <= arrive * 3) return 'near';
  return 'far';
}

/** Một đích đã tính sẵn khoảng cách + hướng. */
export interface Fix<T> {
  item: T;
  pos: LatLon;
  distanceM: number;
  bearingDeg: number;
}

/**
 * Xếp danh sách theo khoảng cách tăng dần, bỏ mục không có toạ-độ hợp lệ.
 * `maxMeters` / `limit` là tuỳ chọn — không truyền thì lấy hết.
 */
export function nearestFixes<T>(
  from: LatLon,
  items: readonly T[],
  getPos: (item: T) => LatLon | null,
  opts?: { maxMeters?: number; limit?: number },
): Fix<T>[] {
  const out: Fix<T>[] = [];
  for (const item of items) {
    const pos = getPos(item);
    if (!pos || !isValidLatLon(pos)) continue;
    const distanceM = haversineMeters(from, pos);
    if (opts?.maxMeters !== undefined && distanceM > opts.maxMeters) continue;
    out.push({ item, pos, distanceM, bearingDeg: initialBearingDeg(from, pos) });
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return opts?.limit !== undefined ? out.slice(0, opts.limit) : out;
}

/**
 * Đích "tới VƯỜN" = TRỌNG TÂM đa-giác ranh giới người dùng đã vẽ.
 *
 * Không lấy đỉnh đầu tiên: đỉnh đầu là một GÓC vườn, thường là chỗ khuất, và
 * dẫn người ta tới góc rào thay vì lối vào. Trọng tâm ít sai nhất trong những
 * thứ tính được mà không cần thêm dữ liệu.
 *
 * Nhận cả `{lat,lng}` (kiểu `Farm.coordinates` của module trace) lẫn
 * `{lat,lon}`. Vườn chưa vẽ ranh giới → null, và nơi gọi phải ẩn nút dẫn đường
 * chứ đừng dẫn tới (0,0).
 */
export function polygonCenter(
  points: ReadonlyArray<{ lat: number; lng?: number; lon?: number }> | null | undefined,
): { lat: number; lng: number } | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  let lat = 0, lon = 0, n = 0;
  for (const p of points) {
    const pl = p?.lng ?? p?.lon;
    if (typeof p?.lat !== 'number' || typeof pl !== 'number') continue;
    if (!Number.isFinite(p.lat) || !Number.isFinite(pl)) continue;
    lat += p.lat; lon += pl; n += 1;
  }
  if (n === 0) return null;
  const c = { lat: lat / n, lon: lon / n };
  return isValidLatLon(c) ? { lat: c.lat, lng: c.lon } : null;
}

/**
 * URL giao cho ứng-dụng bản-đồ ngoài lo chặng XA.
 *
 * Dùng liên-kết https chính-tắc của Google Maps cho CẢ HAI nền tảng: iOS coi
 * đây là universal link nên mở thẳng app Google Maps nếu máy có cài, Android
 * cũng vậy; máy không cài thì rơi về trình duyệt — vẫn chỉ được đường. Chọn
 * cách này để KHỎI phải khai `comgooglemaps` trong `LSApplicationQueriesScheme`
 * (đụng Info.plist = đụng native = một vòng build nữa cho thứ không cần).
 */
export function directionsUrl(dest: LatLon, opts?: { travelMode?: 'driving' | 'walking' | 'two-wheeler' }): string {
  const mode = opts?.travelMode ?? 'driving';
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lon}&travelmode=${mode}`;
}

/**
 * URL dự-phòng khi `Linking.openURL` từ chối liên-kết https (máy không có
 * trình duyệt mặc-định, hoặc Android chặn intent web). `geo:` thì mọi máy có
 * bản đồ đều nhận.
 */
export function geoUri(dest: LatLon, label?: string): string {
  const q = label ? `${dest.lat},${dest.lon}(${encodeURIComponent(label)})` : `${dest.lat},${dest.lon}`;
  return `geo:${dest.lat},${dest.lon}?q=${q}`;
}
