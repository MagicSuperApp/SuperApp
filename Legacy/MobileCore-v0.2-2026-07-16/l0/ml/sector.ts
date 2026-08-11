/**
 * MobileCore l0/ml — hình-học CUNG QUÉT (KHÔNG phải state-machine).
 *
 * Primitive THUẦN cho quét-vòng-quanh mục tiêu: heading→cung, tâm-cung, guidance
 * xoay-ngắn-nhất, và helper theo tập cung đã-chụp. KHÔNG bê CircularCaptureStateMachine
 * (advance/skip/markCaptured/complete/cooldown-scheduling) — đó là ORCHESTRATION của
 * OriLife tự ráp. Core CHỈ cấp hình-học + guidance + quyết-định-thuần.
 *
 * Nguồn: orilife-mobile-core @ review-mvp, coordinator/CircularCaptureState.kt:
 *   - Sector: TOTAL_SECTORS=8, SECTOR_SIZE_DEGREES=45, centerDegrees=index*45 (L77-88).
 *   - Guidance.fromHeadingToTarget (L154-174): CW=heading TĂNG, CCW=heading GIẢM,
 *     chọn chiều có delta nhỏ hơn (xoay ngắn nhất). Ở đây bỏ ngưỡng ARRIVED 5° (=orchestration).
 */

import { normalizeAngle, signedAngleDelta } from './heading';

const DEFAULT_SECTOR_COUNT = 8;
/** Dung-sai biên cung (độ) — Kotlin SECTOR_BOUNDARY_TOLERANCE=5 (chống lật cung khi rung). */
const DEFAULT_BOUNDARY_TOLERANCE = 5;

/**
 * heading tuyệt-đối (độ) → chỉ-số cung 0..sectorCount-1, TƯƠNG ĐỐI so referenceHeading.
 * Cung 0 = referenceHeading (KHÔNG neo cứng Bắc); cung i tâm = ref + i·s.
 * Nguồn: CircularCaptureStateMachine.kt — sector tương-đối từ hướng BẮT ĐẦU (ref),
 *   default 0 khi null. OriLife truyền referenceHeading = heading lúc bắt đầu phiên.
 * Phân-vùng-CỨNG (chỉ để hiển-thị "cung gần nhất"); kiểm "đã vào cung" dùng
 *   sectorContainsHeading (có overlap chống lật).
 * relative = normalizeAngle(heading - ref); floor((rel + s/2)/s) mod count.
 * Biên (ref=0): 337.5°→22.5° = cung 0; 22.5° → cung 1.
 */
export function headingToSector(
  heading: number,
  sectorCount = DEFAULT_SECTOR_COUNT,
  referenceHeading = 0,
): number {
  const size = 360 / sectorCount;
  const rel = normalizeAngle(heading - referenceHeading);
  return Math.floor((rel + size / 2) / size) % sectorCount;
}

/**
 * Tâm cung `index` theo heading TUYỆT-ĐỐI (độ), [0,360) = ref + index·(360/sectorCount).
 * Nguồn: Sector.centerDegrees (L77-81) = referenceHeading + index·45, normalize.
 */
export function sectorCenter(
  index: number,
  sectorCount = DEFAULT_SECTOR_COUNT,
  referenceHeading = 0,
): number {
  return normalizeAngle(referenceHeading + index * (360 / sectorCount));
}

/**
 * heading có nằm TRONG cung `index` không — DÙNG cái này để kiểm "đã vào cung mục-tiêu",
 * KHÔNG dùng headingToSector (phân-vùng-cứng lật cung mỗi lần rung qua biên).
 * Overlap = half-angle (s/2) + tolerance mỗi bên → hai cung kề CHỒNG nhau ở vùng biên,
 * heading rung sát 22.5° không nhấp-nháy guidance.
 * Nguồn: CircularCaptureState.containsHeading (L96-100): dist ≤ SECTOR_HALF_ANGLE(22.5)
 *   + SECTOR_BOUNDARY_TOLERANCE(5) = 27.5°.
 */
export function sectorContainsHeading(
  heading: number,
  index: number,
  opts?: { tolerance?: number; referenceHeading?: number; sectorCount?: number },
): boolean {
  const sectorCount = opts?.sectorCount ?? DEFAULT_SECTOR_COUNT;
  const tolerance = opts?.tolerance ?? DEFAULT_BOUNDARY_TOLERANCE;
  const referenceHeading = opts?.referenceHeading ?? 0;
  const halfAngle = 360 / sectorCount / 2;
  const center = sectorCenter(index, sectorCount, referenceHeading);
  const dist = Math.abs(signedAngleDelta(heading - center));
  return dist <= halfAngle + tolerance;
}

export interface Guidance {
  /** CW = tăng heading (xoay chiều dương); CCW = giảm heading. */
  direction: 'CW' | 'CCW';
  /** Độ-lớn góc phải xoay theo đường NGẮN NHẤT, [0,180]. */
  deltaDeg: number;
}

/**
 * Guidance xoay NGẮN NHẤT từ heading hiện-tại tới heading mục-tiêu; xử đúng wrap 0/360.
 * signed = signedAngleDelta(target-current) ∈ [-180,180]:
 *   signed ≥ 0 → CW (tăng heading), ngược lại CCW. deltaDeg = |signed|.
 * (Bỏ ngưỡng ARRIVED — đó là orchestration của OriLife; core trả góc thuần.)
 */
export function guidanceToTarget(current: number, target: number): Guidance {
  const signed = signedAngleDelta(target - current);
  return signed >= 0
    ? { direction: 'CW', deltaDeg: signed }
    : { direction: 'CCW', deltaDeg: -signed };
}

/**
 * Danh-sách cung CHƯA chụp (0..sectorCount-1 trừ tập đã-chụp), tăng dần theo index.
 */
export function remainingSectors(
  captured: Set<number> | number[],
  sectorCount = DEFAULT_SECTOR_COUNT,
): number[] {
  const set = captured instanceof Set ? captured : new Set(captured);
  const out: number[] = [];
  for (let i = 0; i < sectorCount; i++) {
    if (!set.has(i)) out.push(i);
  }
  return out;
}

/**
 * Cung CHƯA chụp có tâm gần heading hiện-tại nhất (đường ngắn nhất). Không còn cung
 * nào → -1. Hoà → chọn index nhỏ hơn (ổn định, tất-định).
 */
export function nearestUncapturedSector(
  current: number,
  captured: Set<number> | number[],
  sectorCount = DEFAULT_SECTOR_COUNT,
  referenceHeading = 0,
): number {
  const remaining = remainingSectors(captured, sectorCount);
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const idx of remaining) {
    const dist = Math.abs(signedAngleDelta(sectorCenter(idx, sectorCount, referenceHeading) - current));
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
  }
  return best;
}
