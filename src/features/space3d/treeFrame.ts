/**
 * space3d/treeFrame — HỆ TOẠ-ĐỘ RIÊNG CỦA MỖI CÂY (để đặt vị trí QUẢ).
 *
 * Trước đây quả chỉ chọn được 1 trong 3 vùng (Gốc / Thân giữa / Tán). Nay mỗi cây
 * có hệ trục riêng, gốc đặt tại GỐC CÂY:
 *
 *      y = 1  ┬ ngọn                x ∈ [−1, 1]  trái ⇄ phải  (Tây ⇄ Đông)
 *             │                     y ∈ [ 0, 1]  gốc  → ngọn
 *      y = 0  ┴ gốc cây             z ∈ [−1, 1]  trước ⇄ sau   (Bắc ⇄ Nam)
 *
 * 1 đơn-vị x/z = TREE_RADIUS mét, 1 đơn-vị y = TREE_HEIGHT mét.
 *
 * TƯƠNG-THÍCH SERVER: field-reid chỉ lưu `zone` + `pos_x` + `pos_h` (2 chiều).
 *   pos_x ⇄ x   ·   pos_h ⇄ y   ·   zone suy ra từ y   ·   z KHÔNG có chỗ lưu.
 * → z lưu cục bộ (positionStore). Thiếu z (quả cũ / máy khác) thì suy ra ổn-định
 * từ fruit_id, để quả không nằm dính hết trên một mặt phẳng.
 *
 * File THUẦN TÍNH (không import three/react) → test được bằng jest.
 */

import type { TreeZone } from '../../services/fruitReIDService';
import { hashSeed, makeRng } from './geo';

/** Kích-thước quy-ước của 1 cây trong không-gian 3D (mét). */
export const TREE_HEIGHT = 4.2;
export const TREE_RADIUS = 1.5;

/** Toạ-độ quả trong hệ riêng của cây. */
export interface FruitCoord { x: number; y: number; z: number }

export const DEFAULT_FRUIT_COORD: FruitCoord = { x: 0, y: 0.55, z: 0 };

/** Dải pos_h của từng zone — KHỚP `localH` của sơ-đồ 2D cũ (TreeMap2DScreen). */
const ZONE_RANGE: Record<TreeZone, [number, number]> = {
  base: [0, 0.34],
  mid: [0.34, 0.67],
  canopy: [0.67, 1],
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function clampCoord(c: FruitCoord): FruitCoord {
  return {
    x: clamp(Number.isFinite(c.x) ? c.x : 0, -1, 1),
    y: clamp(Number.isFinite(c.y) ? c.y : 0.5, 0, 1),
    z: clamp(Number.isFinite(c.z) ? c.z : 0, -1, 1),
  };
}

/** Hệ riêng của cây → offset MÉT so với gốc cây (dùng đặt mesh/chấm quả). */
export function coordToLocalMeters(c: FruitCoord): [number, number, number] {
  const k = clampCoord(c);
  return [k.x * TREE_RADIUS, k.y * TREE_HEIGHT, k.z * TREE_RADIUS];
}

/** y (0..1) → zone của server. */
export function coordToZone(c: FruitCoord): TreeZone {
  const y = clampCoord(c).y;
  if (y < ZONE_RANGE.base[1]) return 'base';
  if (y < ZONE_RANGE.mid[1]) return 'mid';
  return 'canopy';
}

/** zone → y giữa dải (khi người dùng chỉ chọn vùng thô, chưa kéo trong 3D). */
export function zoneToY(zone: TreeZone): number {
  const [lo, hi] = ZONE_RANGE[zone] ?? ZONE_RANGE.mid;
  return (lo + hi) / 2;
}

/** Toạ-độ 3D → payload gửi field-reid (giữ nguyên sơ-đồ 2D cũ vẫn đúng). */
export function coordToServer(c: FruitCoord): { zone: TreeZone; posX: number; posH: number } {
  const k = clampCoord(c);
  return {
    zone: coordToZone(k),
    posX: +((k.x + 1) / 2).toFixed(4), // [−1,1] → [0,1]
    posH: +k.y.toFixed(4),
  };
}

/** z suy ra ỔN-ĐỊNH từ fruit_id khi không có dữ-liệu z (quả cũ / máy khác). */
export function derivedZ(fruitId: string): number {
  return +(makeRng(hashSeed(`z:${fruitId}`))() * 1.4 - 0.7).toFixed(4);
}

export interface ServerFruitPos {
  fruit_id: string;
  zone?: TreeZone | null;
  pos_x?: number | null;
  pos_h?: number | null;
}

/**
 * Dữ-liệu quả từ server → toạ-độ 3D.
 * Thiếu pos_x/pos_h → rải ổn-định quanh dải của zone thay vì dồn cả đống vào giữa.
 */
export function coordFromServer(f: ServerFruitPos): FruitCoord {
  const zone: TreeZone = f.zone ?? 'mid';
  const rng = makeRng(hashSeed(`xy:${f.fruit_id}`));
  const x = f.pos_x != null && Number.isFinite(f.pos_x)
    ? clamp(f.pos_x, 0, 1) * 2 - 1
    : rng() * 1.6 - 0.8;
  const y = f.pos_h != null && Number.isFinite(f.pos_h)
    ? clamp(f.pos_h, 0, 1)
    : (() => {
        const [lo, hi] = ZONE_RANGE[zone] ?? ZONE_RANGE.mid;
        return lo + rng() * (hi - lo);
      })();
  return clampCoord({ x, y, z: derivedZ(f.fruit_id) });
}

/** Nhãn tiếng Việt của zone (dùng chung mọi màn 3D). */
export const ZONE_LABEL: Record<TreeZone, string> = {
  base: 'Gốc',
  mid: 'Thân giữa',
  canopy: 'Tán',
};
