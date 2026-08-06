/**
 * space3d/projection — 3 HƯỚNG CHIẾU để ĐẶT TOẠ-ĐỘ QUẢ bằng tay.
 *
 * Kéo trên màn hình chỉ cho 2 chiều, mà quả cần 3 (x, y, z). Nên màn đặt quả có
 * 3 hướng chiếu; mỗi hướng khoá 1 trục và cho kéo 2 trục còn lại:
 *
 *   Trước (nhìn từ Nam)  →  ngang = X   ·  dọc = Y      (khoá Z)
 *   Bên   (nhìn từ Đông) →  ngang = Z   ·  dọc = Y      (khoá X)
 *   Trên  (nhìn từ trời) →  ngang = X   ·  dọc = Z      (khoá Y)
 *
 * Kéo 2 trong 3 hướng là đủ khoá cả 3 trục.
 *
 * Camera dùng ORTHOGRAPHIC → phép chiếu TUYẾN TÍNH, nên px ⇄ mét là hằng số và
 * đảo ngược được chính xác. Nhờ vậy icon quả vẽ bằng View của RN đè lên canvas
 * (không phải object 3D) vẫn khớp tuyệt đối với cây phía dưới — và luôn kéo được,
 * không phụ thuộc raycast.
 *
 * File THUẦN TÍNH (không import three/react) → test được bằng jest.
 */

import { clampCoord, TREE_HEIGHT, TREE_RADIUS, type FruitCoord } from './treeFrame';

export type ViewDir = 'front' | 'side' | 'top';

export interface ViewDef {
  key: ViewDir;
  label: string;
  /** Nhắc người dùng đang kéo trục nào. */
  hint: string;
  /** Thứ tự trong luồng đặt vị trí (1-based) — hiện lên nhãn "Bước n/3". */
  step: number;
}

/**
 * Thứ tự cố định: Trước → Bên → Trên.
 * Hai hướng đầu đã đủ khoá cả 3 trục; hướng Trên là bước SOÁT LẠI (nhìn từ trời
 * thấy ngay quả nằm lệch trong/ngoài tán) rồi mới xác nhận.
 */
export const VIEW_DEFS: ViewDef[] = [
  { key: 'front', label: 'Front', hint: 'Kéo ngang = trái/phải · kéo dọc = cao/thấp', step: 1 },
  { key: 'side',  label: 'Side',   hint: 'Kéo ngang = trước/sau · kéo dọc = cao/thấp', step: 2 },
  { key: 'top',   label: 'Top',  hint: 'Nhìn từ trên xuống · kéo = trái/phải & trước/sau', step: 3 },
];

/** Hướng kế tiếp trong luồng. `null` = đang ở hướng CUỐI → bước xác nhận. */
export function nextView(view: ViewDir): ViewDir | null {
  const i = VIEW_DEFS.findIndex((v) => v.key === view);
  return VIEW_DEFS[i + 1]?.key ?? null;
}

/** Tâm ngắm của camera trong hệ MÉT của cây (giữa thân) — điểm này rơi vào giữa canvas. */
export const LOOK_AT_M: [number, number, number] = [0, TREE_HEIGHT / 2, 0];

/** Chiều cao khung nhìn (mét) của từng hướng — vừa khít cây + chừa lề. */
export function frustumHeightM(view: ViewDir): number {
  return view === 'top' ? TREE_RADIUS * 2 * 1.6 : TREE_HEIGHT * 1.3;
}

/** Khoảng cách camera (mét). Ortho nên chỉ cần đủ xa để không cắt vào cây. */
export const CAM_DIST_M = 20;

/** Vị-trí + vector "lên" của camera cho từng hướng chiếu. */
export function cameraPose(view: ViewDir): {
  position: [number, number, number];
  up: [number, number, number];
} {
  if (view === 'front') {
    // Đứng ở phía NAM (+Z) nhìn về Bắc.
    return { position: [0, LOOK_AT_M[1], CAM_DIST_M], up: [0, 1, 0] };
  }
  if (view === 'side') {
    // Đứng ở phía ĐÔNG (+X) nhìn về Tây → +Z hiện ra bên TRÁI màn hình.
    return { position: [CAM_DIST_M, LOOK_AT_M[1], 0], up: [0, 1, 0] };
  }
  // Nhìn thẳng từ trên xuống, Bắc (−Z) hướng LÊN đỉnh màn hình.
  return { position: [0, LOOK_AT_M[1] + CAM_DIST_M, 0], up: [0, 0, -1] };
}

/** Số mét ứng với 1 px, theo chiều cao canvas. */
export function metersPerPx(view: ViewDir, canvasHeightPx: number): number {
  if (!(canvasHeightPx > 0)) return 0;
  return frustumHeightM(view) / canvasHeightPx;
}

/**
 * Toạ-độ quả → vị-trí PX trên canvas (gốc là tâm canvas).
 * Trả offset so với TÂM canvas; dương = sang phải / xuống dưới (chuẩn RN).
 */
export function coordToScreenOffset(
  view: ViewDir,
  coord: FruitCoord,
  mpp: number,
): { dx: number; dy: number } {
  if (!(mpp > 0)) return { dx: 0, dy: 0 };
  const c = clampCoord(coord);
  const xm = c.x * TREE_RADIUS;
  const zm = c.z * TREE_RADIUS;
  const ym = c.y * TREE_HEIGHT - LOOK_AT_M[1]; // so với tâm ngắm

  if (view === 'front') return { dx: xm / mpp, dy: -ym / mpp };
  if (view === 'side') return { dx: -zm / mpp, dy: -ym / mpp };
  return { dx: xm / mpp, dy: zm / mpp }; // top: xuống màn hình = về Nam (+Z)
}

/** Offset PX (so với tâm canvas) → toạ-độ quả, giữ nguyên trục bị khoá. */
export function screenOffsetToCoord(
  view: ViewDir,
  base: FruitCoord,
  dx: number,
  dy: number,
  mpp: number,
): FruitCoord {
  if (!(mpp > 0)) return clampCoord(base);
  const c = clampCoord(base);
  if (view === 'front') {
    return clampCoord({
      x: (dx * mpp) / TREE_RADIUS,
      y: (-dy * mpp + LOOK_AT_M[1]) / TREE_HEIGHT,
      z: c.z,
    });
  }
  if (view === 'side') {
    return clampCoord({
      x: c.x,
      y: (-dy * mpp + LOOK_AT_M[1]) / TREE_HEIGHT,
      z: (-dx * mpp) / TREE_RADIUS,
    });
  }
  return clampCoord({
    x: (dx * mpp) / TREE_RADIUS,
    y: c.y,
    z: (dy * mpp) / TREE_RADIUS,
  });
}

/** Trục đang KHOÁ ở hướng chiếu này (hiển thị cho người dùng biết). */
export function lockedAxis(view: ViewDir): 'X' | 'Y' | 'Z' {
  return view === 'front' ? 'Z' : view === 'side' ? 'X' : 'Y';
}
