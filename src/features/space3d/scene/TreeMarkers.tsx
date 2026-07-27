/**
 * space3d/scene/TreeMarkers — CHẤM CÂY DẸT cho chế độ bản đồ 2D.
 *
 * Nhìn thẳng từ trên xuống, model cây 3D chỉ còn là những mảng tán chồng lên nhau
 * và che gần hết ảnh bản đồ. Ở chế độ 2D ta thay chúng bằng chấm tròn dẹt: đọc
 * được vị trí ngay, thấy rõ nền bản đồ, và bỏ hẳn phần dựng model nên nhẹ hơn
 * nhiều với vườn đông cây.
 *
 * Dùng CHUNG một hình tròn cho mọi cây (`circleGeometry` tạo 1 lần) — mỗi cây chỉ
 * khác vị trí và tỉ lệ.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { SPACE_COLORS } from '../visuals';
import type { Vec2 } from '../geo';

/** Bán kính chấm (mét) — cỡ một tán cây nhìn từ trên xuống. */
const DOT_RADIUS = 1.1;

/** Nhô khỏi mặt đất vài cm để không tranh chấp độ sâu với thửa đất / bản đồ. */
const DOT_Y = 0.08;

export interface TreeMarkersProps {
  trees: { id: string; pos: Vec2 }[];
  /** Cây đang mở / đang chờ đặt lại vị trí → tô nổi. */
  highlightIds?: (string | null | undefined)[];
}

export const TreeMarkers: React.FC<TreeMarkersProps> = ({ trees, highlightIds }) => {
  const geometry = useMemo(() => {
    const g = new THREE.CircleGeometry(DOT_RADIUS, 20);
    g.rotateX(-Math.PI / 2); // CircleGeometry nằm ở mặt XY → xoay thành mặt đất
    return g;
  }, []);

  const hot = useMemo(
    () => new Set((highlightIds ?? []).filter(Boolean) as string[]),
    [highlightIds],
  );

  return (
    <group>
      {trees.map((t) => {
        const on = hot.has(t.id);
        return (
          <group key={t.id} position={[t.pos.x, DOT_Y, t.pos.z]}>
            {/* Quầng ngoài mờ — tách chấm khỏi nền ảnh vệ tinh nhiều chi tiết. */}
            <mesh geometry={geometry} scale={on ? 2.1 : 1.6}>
              <meshBasicMaterial
                color={SPACE_COLORS.accent}
                transparent
                opacity={on ? 0.38 : 0.2}
                depthWrite={false}
              />
            </mesh>
            <mesh geometry={geometry} position={[0, 0.01, 0]}>
              <meshBasicMaterial
                color={on ? '#ffffff' : SPACE_COLORS.accent}
                transparent
                opacity={0.95}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

export default TreeMarkers;
