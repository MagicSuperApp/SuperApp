/**
 * space3d/scene/Rig — hai mảnh chạy TRONG <Canvas>:
 *   · CameraDriver — mỗi khung hình đẩy SpaceController vào camera.
 *   · Projector    — chiếu điểm 3D ra px màn hình cho lớp nhãn RN (qua labelBus).
 *
 * Projector chỉ chạy 1 lần mỗi 4 khung (~15 lần/giây): mắt không phân biệt được
 * nhanh hơn, mà tiết kiệm hẳn công chiếu + cập nhật chữ.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import type { SpaceController } from '../controller';
import { labelBus, type LabelKind, type ScreenLabel } from '../labelBus';

export const CameraDriver: React.FC<{ controller: SpaceController }> = ({ controller }) => {
  const { camera } = useThree();
  useFrame((_, delta) => {
    // delta có thể vọt lớn khi app vừa quay lại từ nền → chặn để không "nhảy cóc".
    controller.applyTo(camera, Math.min(delta, 0.05));
  });
  return null;
};

export interface LabelPoint {
  id: string;
  kind: LabelKind;
  text: string;
  position: [number, number, number];
}

export const Projector: React.FC<{ points: LabelPoint[] }> = ({ points }) => {
  const { camera, size } = useThree();
  const frame = useRef(0);
  const vec = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => labelBus.reset(), []);

  useFrame(() => {
    frame.current += 1;
    if (frame.current % 4 !== 0) return;
    if (points.length === 0) {
      labelBus.publish([]);
      return;
    }

    const out: ScreenLabel[] = [];
    for (const p of points) {
      vec.set(p.position[0], p.position[1], p.position[2]);
      const distance = vec.distanceTo(camera.position);
      vec.project(camera);
      const x = (vec.x * 0.5 + 0.5) * size.width;
      const y = (-vec.y * 0.5 + 0.5) * size.height;
      // vec.z ngoài [−1,1] = sau camera hoặc quá xa mặt cắt → ẩn.
      const visible =
        vec.z > -1 && vec.z < 1 &&
        x > -60 && x < size.width + 60 &&
        y > -40 && y < size.height + 40;
      out.push({ id: p.id, kind: p.kind, text: p.text, x, y, visible, distance });
    }
    labelBus.publish(out);
  });

  return null;
};
