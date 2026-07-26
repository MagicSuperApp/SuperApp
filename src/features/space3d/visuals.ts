/**
 * space3d/visuals — BẢNG MÀU TỐI + texture PHÁT SÁNG cho chấm quả.
 *
 * Quả nằm ĐÈ TRONG tán cây nên bị model cây che. Cách xử lý (giống hiệu ứng
 * viền phát sáng xuyên khối của Minecraft):
 *   1. `depthTest: false` + `renderOrder` cao  → chấm luôn vẽ ĐÈ LÊN cây.
 *   2. quầng sáng `AdditiveBlending` bọc ngoài → cộng sáng, nổi bật trên nền tối.
 * Quầng sáng cần một texture gradient tròn; RN không có <canvas> nên dựng thẳng
 * bằng DataTexture (sinh pixel bằng tay, không phụ thuộc DOM).
 */

import * as THREE from 'three';
import type { FruitStatus } from '../../services/fruitReIDService';

/** Nền + mặt đất + lưới của không-gian 3D (tông tối, theo yêu cầu). */
export const SPACE_COLORS = {
  bg: '#05090c',
  fog: '#05090c',
  ground: '#0e1a13',
  groundEdge: '#3ddc84',
  grid: '#16302a',
  hudBg: 'rgba(6,12,10,0.82)',
  hudBorder: 'rgba(61,220,132,0.35)',
  accent: '#3ddc84',
  text: '#E8F5EC',
  textMuted: '#8FA79A',
} as const;

/** Màu chấm quả theo trạng-thái — khớp bảng màu sơ-đồ 2D để không lệch ngữ nghĩa. */
export const FRUIT_COLOR: Record<FruitStatus, string> = {
  on_tree: '#4ade80',
  harvested: '#fbbf24',
  lost: '#94a3b8',
};

export function fruitColor(status?: string | null): string {
  return FRUIT_COLOR[(status as FruitStatus)] ?? FRUIT_COLOR.on_tree;
}

let _glowTexture: THREE.DataTexture | null = null;

/**
 * Texture quầng sáng: gradient tròn từ tâm trắng → trong suốt ở mép.
 * Alpha giảm theo luỹ thừa để lõi đặc, rìa tan mềm (không thấy viền vuông).
 * Tạo 1 lần rồi dùng lại cho mọi chấm quả.
 */
export function getGlowTexture(): THREE.DataTexture {
  if (_glowTexture) return _glowTexture;

  const SIZE = 64;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const c = (SIZE - 1) / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.sqrt((x - c) ** 2 + (y - c) ** 2) / c; // 0 ở tâm → 1 ở mép
      const a = d >= 1 ? 0 : Math.pow(1 - d, 2.6);
      const i = (y * SIZE + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  _glowTexture = tex;
  return tex;
}

/** Nới lỏng dần (ease-in-out) — dùng cho chuyển cảnh bay tới cây. */
export function easeInOutCubic(t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}
