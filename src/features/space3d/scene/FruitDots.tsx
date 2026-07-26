/**
 * space3d/scene/FruitDots — CHẤM QUẢ PHÁT SÁNG XUYÊN CÂY.
 *
 * Quả nằm trong tán nên bị model cây che. Mỗi quả vẽ 2 lớp, đều `depthTest:false`
 * + `renderOrder` cao nên LUÔN hiện đè lên cây (giống viền phát sáng của Minecraft):
 *   · lõi đặc  — MeshBasicMaterial, màu theo trạng-thái quả.
 *   · quầng sáng — Sprite AdditiveBlending, đập nhẹ theo nhịp thở.
 * Quả ĐANG CHỌN đập mạnh và to hơn để dễ bắt mắt.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { coordToLocalMeters, type FruitCoord } from '../treeFrame';
import { fruitColor, getGlowTexture } from '../visuals';

export interface FruitDot {
  fruitId: string;
  name: string;
  status?: string | null;
  coord: FruitCoord;
}

export interface FruitDotsProps {
  fruits: FruitDot[];
  /** Gốc cây trong hệ vườn (mét). */
  origin: [number, number, number];
  selectedId?: string | null;
}

const CORE_R = 0.075;
const GLOW_SCALE = 0.62;

const FruitDotMesh: React.FC<{ dot: FruitDot; selected: boolean; phase: number }> = ({
  dot, selected, phase,
}) => {
  const glowRef = useRef<THREE.Sprite>(null);
  const color = useMemo(() => fruitColor(dot.status), [dot.status]);
  const texture = useMemo(() => getGlowTexture(), []);
  const pos = useMemo(() => coordToLocalMeters(dot.coord), [dot.coord]);

  // Nhịp "thở": quả thường đập nhẹ, quả đang chọn đập rõ.
  useFrame(({ clock }) => {
    const s = glowRef.current;
    if (!s) return;
    const amp = selected ? 0.3 : 0.12;
    const k = GLOW_SCALE * (1 + amp * Math.sin(clock.elapsedTime * 2.2 + phase)) * (selected ? 1.5 : 1);
    s.scale.set(k, k, k);
  });

  return (
    <group position={pos}>
      <sprite ref={glowRef} renderOrder={998}>
        <spriteMaterial
          map={texture}
          color={color}
          blending={THREE.AdditiveBlending}
          transparent
          depthTest={false}
          depthWrite={false}
          opacity={selected ? 1 : 0.85}
        />
      </sprite>
      <mesh renderOrder={999}>
        <sphereGeometry args={[selected ? CORE_R * 1.35 : CORE_R, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
};

export const FruitDots: React.FC<FruitDotsProps> = ({ fruits, origin, selectedId }) => (
  <group position={origin}>
    {fruits.map((f, i) => (
      <FruitDotMesh
        key={f.fruitId}
        dot={f}
        selected={selectedId === f.fruitId}
        // Lệch pha theo thứ tự → cả chùm không đập cùng lúc, nhìn tự nhiên hơn.
        phase={i * 0.7}
      />
    ))}
  </group>
);

export default FruitDots;
