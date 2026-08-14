/**
 * needle — PHÉP TÍNH của kim la bàn. Thuần tính, không import react-native.
 *
 * ── Vì sao tách riêng khỏi màn ──────────────────────────────────────────────
 * Ba thứ dưới đây là chỗ kim chỉ đường hay sai mà nhìn màn thì không thấy: kim
 * quay vòng dài thay vì vòng ngắn, kim giật vì la bàn nhiễu, và kim "về 0" mỗi
 * lần góc vượt 360. Cả ba đều kiểm được bằng số, nên chúng ở đây và có bài kiểm.
 *
 * ── Vòng ngắn: vì sao phải cộng dồn thay vì gán thẳng ───────────────────────
 * Góc la bàn chạy 0…360 rồi nhảy về 0. Gán thẳng góc đó cho phép quay thì lúc
 * kim đi từ 350° sang 10° nó quay NGƯỢC gần trọn một vòng — mắt đọc thành "kim
 * loạn". Nên ta giữ một góc CỘNG DỒN (có thể là 730°, có thể là −120°) và mỗi
 * lần chỉ cộng thêm phần lệch ngắn nhất. Trục quay không quan tâm số lớn hay
 * nhỏ, nó chỉ quan tâm hiệu số — nên cộng dồn là an toàn.
 *
 * ── Lọc nhiễu: vì sao không lấy thẳng số la bàn ─────────────────────────────
 * La bàn từ trong điện thoại rung ±3–8° ngay cả khi máy nằm yên trên bàn, và
 * rung mạnh hơn hẳn khi ở gần kim loại — mà nhà vườn thì hay đứng cạnh hàng
 * rào, máy bơm, xe máy. Lấy thẳng thì kim rung liên tục, người dùng đọc thành
 * "máy hỏng". Lọc trung bình trượt theo VÒNG TRÒN (không phải theo số thường,
 * vì trung bình của 350 và 10 phải ra 0 chứ không phải 180).
 */

import { normalizeDeg, signedDeltaDeg } from './wayfind';

/**
 * Góc kế tiếp của một trục quay CỘNG DỒN, đi theo đường ngắn nhất.
 *
 * `current` là góc cộng dồn đang giữ (không giới hạn 0…360). `targetDeg` là góc
 * la bàn mới (bất kỳ). Trả về góc cộng dồn mới, luôn cách `current` không quá
 * 180° — tức kim không bao giờ quay vòng dài.
 *
 *     shortestTurn(350, 10)   →  370   (đi tới 10° bằng cách +20)
 *     shortestTurn(0, 350)    →  -10   (đi tới 350° bằng cách −10)
 *     shortestTurn(730, 0)    →  720
 */
export function shortestTurn(current: number, targetDeg: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(targetDeg)) return current;
  return current + signedDeltaDeg(targetDeg - current);
}

/**
 * Trung bình trượt theo vòng tròn — dùng để lọc nhiễu la bàn.
 *
 * `alpha` 0…1: càng nhỏ càng mượt nhưng càng chậm bám. 0,15 là chỗ kim hết rung
 * mà vẫn theo kịp người xoay người. `prev` là `null` (lần đọc đầu) thì nhận
 * thẳng số mới — không có gì để trung bình, mà bắt đầu từ 0° sẽ khiến kim quét
 * một cú dài vô nghĩa ngay khi mở màn.
 */
export function smoothHeading(prev: number | null, raw: number, alpha = 0.15): number {
  if (!Number.isFinite(raw)) return prev ?? 0;
  if (prev === null || !Number.isFinite(prev)) return normalizeDeg(raw);
  const a = Math.min(1, Math.max(0, alpha));
  return normalizeDeg(prev + a * signedDeltaDeg(raw - prev));
}

/**
 * Góc QUAY của mũi tên trên màn: hướng cần đi, trừ đi hướng máy đang chĩa.
 *
 * Máy chĩa Bắc (heading 0) và đích ở Đông (bearing 90) → mũi tên chỉ sang phải
 * (90). Người xoay người sang Đông (heading 90) → mũi tên chỉ thẳng lên (0).
 * Đó là toàn bộ phép tính; cái khó nằm ở chỗ lấy được `headingDeg` tin được.
 */
export function needleAngle(bearingDeg: number, headingDeg: number | null): number {
  if (headingDeg === null || !Number.isFinite(headingDeg)) return normalizeDeg(bearingDeg);
  return normalizeDeg(bearingDeg - headingDeg);
}

/**
 * Làm mượt VỊ TRÍ ĐANG ĐỨNG trước khi tính góc.
 *
 * ── Vì sao không đóng băng vị trí ───────────────────────────────────────────
 * ĐÍCH thì cố định — nó là toạ độ đã chốt của vườn/cây, không bao giờ tính lại.
 * Nhưng CHỖ ĐANG ĐỨNG thì phải theo người: kim có nhiệm vụ luôn chỉ về đích, mà
 * góc từ chỗ đứng tới đích đổi theo từng bước chân. Đóng băng chỗ đứng là kim
 * chỉ theo một góc CŨ — đi chệch mười mét là nó chỉ trượt qua đích, mà nhìn màn
 * thì không có gì báo.
 *
 * Cái cần chữa không phải là "tính lại", mà là NHIỄU: GPS lắc vài mét mỗi giây,
 * ở cự ly gần thì vài mét đó xoay góc hàng chục độ. Nên lọc vị trí, rồi tính góc
 * từ vị trí đã lọc — kim vẫn luôn chỉ đúng đích mà thôi rung.
 *
 * `snapM`: nhảy xa hơn ngần này thì nhận thẳng, không bò từ từ. Nhảy lớn là
 * người thật sự đã đi (hoặc GPS vừa bắt lại được) — bò theo trung bình trượt ở
 * đó sẽ khiến kim đuổi theo mãi mới tới nơi.
 */
export function smoothPosition(
  prev: { lat: number; lon: number } | null,
  raw: { lat: number; lon: number },
  opts: { alpha?: number; snapM?: number; distanceM?: number } = {},
): { lat: number; lon: number } {
  if (!Number.isFinite(raw?.lat) || !Number.isFinite(raw?.lon)) return prev ?? raw;
  if (!prev || !Number.isFinite(prev.lat) || !Number.isFinite(prev.lon)) return raw;

  const snapM = opts.snapM ?? 25;
  if (typeof opts.distanceM === 'number' && opts.distanceM >= snapM) return raw;

  const a = Math.min(1, Math.max(0, opts.alpha ?? 0.3));
  return {
    lat: prev.lat + a * (raw.lat - prev.lat),
    lon: prev.lon + a * (raw.lon - prev.lon),
  };
}
