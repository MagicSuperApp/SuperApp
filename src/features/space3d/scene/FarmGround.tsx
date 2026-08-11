/**
 * space3d/scene/FarmGround — MẶT ĐẤT VƯỜN dựng từ "điểm nối" ranh giới.
 *
 * Đa-giác ranh giới (Farm.coordinates, đã quy về mét ở geo.ts) → THREE.Shape →
 * mặt phẳng nằm ngang tại y=0, tông tối. Viền vườn là đường phát sáng để nhìn rõ
 * hình thửa đất trên nền tối. Thêm lưới mờ làm mốc khoảng cách.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ringBounds, type Vec2 } from '../geo';
import { SPACE_COLORS } from '../visuals';

export interface FarmGroundProps {
  ring: Vec2[];
  /** Ranh giới thật hay ô vuông mặc định (chưa vẽ ranh giới) → vẽ viền nét khác. */
  hasBoundary: boolean;
  /**
   * Có lớp BẢN ĐỒ nằm dưới hay không. Có thì thửa đất chuyển thành lớp phủ MỜ
   * (chỉ còn nhuộm nhẹ để phân biệt trong/ngoài ranh giới) và tắt lưới mốc —
   * nếu giữ nguyên mặt đất đặc thì bản đồ bên dưới không thấy được gì.
   */
  mapUnder?: boolean;
}

export const FarmGround: React.FC<FarmGroundProps> = ({ ring, hasBoundary, mapUnder = false }) => {
  const { geometry, outline, gridSize } = useMemo(() => {
    const shape = new THREE.Shape();
    ring.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, p.z);
      else shape.lineTo(p.x, p.z);
    });
    shape.closePath();

    // ShapeGeometry nằm trên mặt XY → xoay −90° quanh X để thành mặt XZ (mặt đất).
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);

    // Viền: nâng nhẹ khỏi mặt đất để không bị z-fighting.
    const pts = ring.map((p) => new THREE.Vector3(p.x, 0.05, p.z));
    const line = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);

    const b = ringBounds(ring);
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.6;
    return { geometry: geo, outline: line, gridSize: size };
  }, [ring]);

  return (
    <group>
      {/* Lưới mốc — mờ, chỉ để cảm nhận khoảng cách. */}
      {!mapUnder && (
        <gridHelper
          args={[gridSize, Math.max(8, Math.round(gridSize / 5)), SPACE_COLORS.grid, SPACE_COLORS.grid]}
          position={[0, -0.02, 0]}
        />
      )}

      {/* Thửa đất */}
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color={SPACE_COLORS.ground}
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
          transparent={mapUnder}
          // depthWrite tắt khi trong suốt: nếu vẫn ghi độ sâu, lớp phủ này sẽ
          // che các chấm/nhãn vẽ sau nó dù mắt không nhìn thấy nó.
          depthWrite={!mapUnder}
          opacity={mapUnder ? 0.16 : 1}
        />
      </mesh>

      {/* Viền vườn phát sáng */}
      <lineLoop geometry={outline}>
        <lineBasicMaterial
          color={SPACE_COLORS.groundEdge}
          transparent
          opacity={hasBoundary ? 0.9 : 0.35}
        />
      </lineLoop>
    </group>
  );
};

export default FarmGround;
