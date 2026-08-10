/**
 * MobileCore l0/ml — chuẩn-hoá góc + quyết-định-chụp-theo-cung KHÔNG-TRẠNG-THÁI.
 *
 * ⚠️ VIẾT LẠI: bản cũ port nhầm HeadingCaptureManager (delta-đơn 25°/ pitch 18°) — mô-hình
 * SAI cho quét-vòng. Thay bằng mô-hình 8-cung + StabilitySampler. Đã BỎ:
 *   captureByHeading / initHeadingState / HeadingState / HeadingSample / HeadingResult.
 * GIỮ normalizeAngle + signedAngleDelta (sector.ts & orientation.ts import từ đây).
 *
 * SESSION FSM (giữ tập capturedSectors, lập lịch cooldown captureCooldownMs, advance/skip/
 * complete) là của OriLife — KHÔNG thuộc core. Core chỉ cho quyết-định 1-frame thuần.
 *
 * Nguồn hình-học/guidance: coordinator/CircularCaptureState.kt (xem sector.ts).
 */

import { headingToSector, sectorCenter, guidanceToTarget, nearestUncapturedSector } from './sector';
import type { Guidance } from './sector';

/**
 * Chuẩn-hoá góc về [0, 360). 370→10, -10→350, wrap qua 0. (( a % 360 ) + 360 ) % 360.
 * Tiện hiển-thị la-bàn; sector/orientation import hàm này.
 */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Góc-lệch có dấu, chuẩn-hoá về [-180, 180] (khoảng-cách góc ngắn nhất — dùng cho DELTA).
 * n = a % 360 ; n>180 → n-360 ; n<-180 → n+360.
 */
export function signedAngleDelta(angle: number): number {
  let n = angle % 360;
  if (n > 180) n -= 360;
  else if (n < -180) n += 360;
  return n;
}

export interface SectorCaptureInput {
  /** Heading la-bàn hiện-tại (độ). */
  heading: number;
  /** Thiết-bị đang đứng-yên chưa (từ stability.ts — core KHÔNG tự tính lại). */
  isStable: boolean;
  /** Có mục-tiêu YOLO trong khung chưa (từ gate.ts của consumer). */
  hasTarget: boolean;
  /** Tập cung ĐÃ chụp (OriLife giữ; core chỉ đọc). */
  capturedSectors: Set<number> | number[];
  /** Số cung (mặc định theo hình-học 8). */
  sectorCount?: number;
  /**
   * Heading tuyệt-đối lúc BẮT ĐẦU phiên (cung 0 = hướng này). Mặc định 0 (neo Bắc,
   * hành-vi cũ). OriLife truyền heading lúc mở phiên để KHÔNG ép user quét qua Bắc.
   */
  referenceHeading?: number;
}

export interface SectorCaptureDecision {
  /** Cung heading đang trỏ vào (headingToSector). */
  currentSector: number;
  /**
   * Cung nên nhắm tới: nếu cung hiện-tại CHƯA chụp → chính nó (đứng yên là chụp được);
   * nếu đã chụp → cung chưa-chụp gần nhất để guidance dẫn qua. -1 khi hết cung.
   */
  targetSector: number;
  /** Hướng + độ xoay tới tâm targetSector (null khi hết cung). */
  guidance: Guidance | null;
  /** isStable && hasTarget && cung hiện-tại CHƯA chụp. Quyết-định 1-frame, KHÔNG cooldown. */
  shouldCapture: boolean;
}

/**
 * Quyết-định-chụp KHÔNG-TRẠNG-THÁI cho 1 frame. OriLife giữ capturedSectors + cooldown
 * timing; core cho quyết-định thuần từ (heading, đứng-yên, có-mục-tiêu, tập-đã-chụp).
 * shouldCapture = isStable && hasTarget && cung hiện-tại chưa chụp.
 */
export function decideSectorCapture(input: SectorCaptureInput): SectorCaptureDecision {
  const { heading, isStable, hasTarget, capturedSectors, sectorCount, referenceHeading = 0 } = input;
  const captured = capturedSectors instanceof Set ? capturedSectors : new Set(capturedSectors);

  const currentSector = headingToSector(heading, sectorCount, referenceHeading);
  const isCurrentCaptured = captured.has(currentSector);

  const targetSector = isCurrentCaptured
    ? nearestUncapturedSector(heading, captured, sectorCount, referenceHeading)
    : currentSector;

  const guidance =
    targetSector < 0
      ? null
      : guidanceToTarget(heading, sectorCenter(targetSector, sectorCount, referenceHeading));

  const shouldCapture = isStable && hasTarget && !isCurrentCaptured;

  return { currentSector, targetSector, guidance, shouldCapture };
}
