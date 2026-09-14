/**
 * radar — PHÉP CHIẾU cây quanh chỗ đứng lên màn hình. Thuần tính, có bài kiểm.
 *
 * ── Việc của tệp này ────────────────────────────────────────────────────────
 * Tới được vườn rồi thì câu hỏi đổi hẳn: không còn là "vườn ở hướng nào" mà là
 * "cây nào đang ở quanh tôi". Bản đồ đường sá vô dụng ở đây — trong vườn không
 * có đường, và cây cách nhau vài mét. Thứ dùng được là một mặt phẳng nhỏ, lấy
 * chính chỗ người đứng làm gốc.
 *
 * ── Vì sao "hướng máy quay lên" chứ không "Bắc quay lên" ────────────────────
 * Bắc-quay-lên bắt người dùng tự xoay bản đồ trong đầu: thấy chấm ở bên trái màn
 * rồi phải tự tính xem trái đó là trái của mình hay trái của hướng Bắc. Giữa
 * vườn, tay bẩn, nắng chói, không ai làm phép xoay đó đúng.
 *
 * Hướng-máy-quay-lên thì chấm nằm bên trái màn nghĩa là cây ở bên trái NGƯỜI.
 * Xoay người là cả mặt phẳng xoay theo. Đây là lý do phép chiếu phải nhận
 * `headingDeg`, chứ không chỉ nhận toạ độ.
 *
 * ── Đơn vị ──────────────────────────────────────────────────────────────────
 * Mọi thứ trong tệp: mét cho khoảng cách, độ cho góc, pixel cho màn. Không trộn.
 */

import {
  haversineMeters, initialBearingDeg, isValidLatLon, normalizeDeg, type LatLon,
} from './wayfind';

/** Mét trên một độ vĩ. Trái Đất không tròn đều nhưng ở cự ly 20 m thì sai số này không đo được. */
const M_PER_DEG_LAT = 111_320;

export interface LocalOffset {
  /** Mét về phía ĐÔNG (âm = tây). */
  east: number;
  /** Mét về phía BẮC (âm = nam). */
  north: number;
}

/**
 * Toạ độ địa lý → mét đông/bắc so với gốc.
 *
 * Phép xấp xỉ mặt phẳng: chỉ đúng ở cự ly ngắn, mà ở đây cự ly là vài chục mét
 * nên nó đúng hơn nhiều so với sai số GPS. Đừng dùng cho khoảng cách km.
 */
export function localOffset(origin: LatLon, p: LatLon): LocalOffset {
  const latRad = (origin.lat * Math.PI) / 180;
  return {
    east: (p.lon - origin.lon) * M_PER_DEG_LAT * Math.cos(latRad),
    north: (p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

export interface RadarPoint {
  /** Pixel trên màn, gốc toạ độ ở góc trên-trái như mọi hệ toạ độ giao diện. */
  x: number;
  y: number;
  distanceM: number;
  /** Góc phương-vị TUYỆT ĐỐI (0 = Bắc) — dùng cho chữ "hướng Đông Bắc". */
  bearingDeg: number;
  /** Nằm trong bán kính đang hiển thị không. Ngoài thì màn cho vào danh sách. */
  inRange: boolean;
}

/**
 * Chiếu một điểm lên màn, mặt phẳng XOAY THEO HƯỚNG MÁY.
 *
 * `headingDeg` là `null` (chưa có la bàn) → coi như 0, tức Bắc quay lên. Kém hơn
 * nhưng vẫn đúng; màn hình có nhiệm vụ nói rõ cho người dùng biết đang ở chế độ
 * nào, đừng để họ tưởng chấm đang xoay theo mình.
 */
export function radarPoint(
  origin: LatLon,
  p: LatLon,
  opts: {
    headingDeg: number | null;
    pxPerM: number;
    center: { x: number; y: number };
    radiusM: number;
  },
): RadarPoint {
  const distanceM = haversineMeters(origin, p);
  const bearingDeg = initialBearingDeg(origin, p);

  // Góc trên MÀN = góc phương-vị trừ hướng máy. Cùng một phép trừ với kim chỉ
  // đường (`needleAngle`) — hai chỗ phải nhất quán, nếu không kim chỉ một đằng
  // mà chấm nằm một nẻo trên cùng một màn.
  const screenDeg = normalizeDeg(bearingDeg - (opts.headingDeg ?? 0));
  const rad = (screenDeg * Math.PI) / 180;
  const r = distanceM * opts.pxPerM;

  return {
    // Trục y của màn hướng XUỐNG, nên phía trước (góc 0) là TRỪ y.
    x: opts.center.x + r * Math.sin(rad),
    y: opts.center.y - r * Math.cos(rad),
    distanceM,
    bearingDeg,
    inRange: distanceM <= opts.radiusM,
  };
}

/**
 * Chuẩn hoá một điểm về `{lat, lon}`.
 *
 * Ranh giới vườn trong app lưu là `{lat, lng}` (kiểu `Farm`), còn phép chiếu ở
 * đây nhận `{lat, lon}`. Hai chữ cái khác nhau, và `p.lon` trên một điểm `{lng}`
 * ra `undefined` → `NaN` → đa-giác biến mất mà không có lỗi nào. Nên chỗ nối
 * giữa hai cách viết phải nằm ở một hàm, có bài kiểm.
 */
export function asLatLon(p: unknown): LatLon | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  // `isValidLatLon` chứ không `Number.isFinite`: `0/0` là giá trị máy sinh ra
  // khi chưa bắt được GPS, và một đỉnh như thế kéo cả ranh giới ra khỏi màn.
  const q = { lat: Number(o.lat), lon: Number(o.lon ?? o.lng) };
  return isValidLatLon(q) ? q : null;
}

/**
 * Cả một đường ranh giới → mảng điểm màn hình.
 *
 * KHÔNG lọc theo bán kính: đỉnh nằm ngoài tầm nhìn vẫn quyết định hình dạng của
 * cạnh đi qua tầm nhìn. Bỏ chúng đi là vẽ ra một mảnh vườn méo mó không có thật.
 */
export function projectBoundary(
  origin: LatLon,
  points: unknown[],
  opts: {
    headingDeg: number | null;
    pxPerM: number;
    center: { x: number; y: number };
    radiusM: number;
  },
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const raw of points ?? []) {
    const p = asLatLon(raw);
    if (!p) continue;
    const q = radarPoint(origin, p, opts);
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

export type Zone = 'here' | 'near' | 'far';

/**
 * Chia cây thành từng CỤM theo khoảng cách, để danh sách bên dưới đọc được.
 *
 * Ngưỡng không phải số tròn cho đẹp: 5 m là trong tầm với — đứng đó là chạm được
 * thân cây. 12 m là còn nhìn thấy rõ giữa tán. Xa hơn thì phải đi, và lúc đó
 * người ta cần kim chỉ chứ không cần chấm.
 */
export function zoneOf(distanceM: number): Zone {
  if (!Number.isFinite(distanceM)) return 'far';
  if (distanceM <= 5) return 'here';
  if (distanceM <= 12) return 'near';
  return 'far';
}

/**
 * Số pixel cho một mét, sao cho `radiusM` vừa khít NỬA CẠNH NGẮN của màn.
 *
 * Lấy cạnh ngắn để bán kính yêu cầu luôn được thấy đủ theo cả hai chiều; chiều
 * dài hơn chỉ đơn giản là thấy xa hơn, không méo hình.
 */
export function pxPerMeter(width: number, height: number, radiusM: number): number {
  if (radiusM <= 0) return 0;
  return Math.min(width, height) / 2 / radiusM;
}
