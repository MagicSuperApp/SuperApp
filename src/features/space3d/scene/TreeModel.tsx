/**
 * space3d/scene/TreeModel — một cây trong không-gian 3D.
 *
 * Model nào hiển thị do `modelId` quyết định, tra trong sổ `treeModels.ts`.
 * MẶC ĐỊNH là "cây tự tạo" — dựng bằng hình học sẵn có, không cần tệp nên luôn
 * hiện được. Model có tệp (.glb) nạp qua `treeAsset.loadTreeTemplate()`.
 *
 * Trong lúc model đang nạp, hoặc nạp hỏng, vẫn vẽ cây tự tạo. Nhờ vậy:
 *   · Người dùng luôn thấy vườn có cây.
 *   · Phân biệt được sự cố: thấy cây tự tạo + thông báo lỗi = lỗi NẠP MODEL;
 *     không thấy gì cả = lỗi DỰNG HÌNH/ÁNH SÁNG/VỊ TRÍ — hướng sửa khác hẳn.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { TREE_HEIGHT, TREE_RADIUS } from '../treeFrame';
import { loadTreeTemplate } from '../treeAsset';
import {
  DEFAULT_TREE_MODEL_ID, getTreeModel, isFileBacked, type TreeModelId,
} from '../treeModels';

/** Trạng-thái nạp của MỘT model (theo id) — dùng cho HUD báo lỗi. */
export interface TreeModelStatus {
  modelId: TreeModelId;
  state: 'loading' | 'ready' | 'failed';
  textured: boolean;
  message?: string;
}

const statuses = new Map<TreeModelId, TreeModelStatus>();
const listeners = new Set<(all: TreeModelStatus[]) => void>();

function setStatus(next: TreeModelStatus) {
  statuses.set(next.modelId, next);
  const all = Array.from(statuses.values());
  listeners.forEach((fn) => fn(all));
}

/** Theo dõi việc nạp MỌI model (Space3DScreen dùng để hiện lỗi lên HUD). */
export function subscribeTreeModelStatus(fn: (all: TreeModelStatus[]) => void): () => void {
  listeners.add(fn);
  fn(Array.from(statuses.values()));
  return () => { listeners.delete(fn); };
}

/** Template dùng chung theo model; mỗi cây chỉ `clone()` (chung geometry/material). */
function useTreeTemplate(modelId: TreeModelId): THREE.Object3D | null {
  const [template, setTemplate] = useState<THREE.Object3D | null>(null);
  const def = useMemo(() => getTreeModel(modelId), [modelId]);

  useEffect(() => {
    if (!isFileBacked(def)) {
      setTemplate(null); // cây tự tạo — không có gì để nạp
      return;
    }
    let alive = true;
    setTemplate(null); // đổi model → bỏ hình cũ ngay, tránh nháy sai model
    setStatus({ modelId: def.id, state: 'loading', textured: false });

    loadTreeTemplate(def)
      .then((tpl) => {
        if (!alive) return;
        setTemplate(tpl.object);
        setStatus({ modelId: def.id, state: 'ready', textured: tpl.textured, message: tpl.warning });
      })
      .catch((err) => {
        // Không ném tiếp: rơi về cây tự tạo, phần còn lại của cảnh vẫn chạy.
        // Gộp cả tên lớp lỗi — nhiều lỗi runtime của RN có message rỗng.
        const message = [err?.name, err?.message ?? String(err)].filter(Boolean).join(': ');
        console.warn(`[space3d] Không nạp được model "${def.id}":`, message, err?.stack);
        if (alive) setStatus({ modelId: def.id, state: 'failed', textured: false, message });
      });

    return () => { alive = false; };
  }, [def]);

  return template;
}

/** Cây tự tạo: thân trụ + 2 tầng tán nón. Cùng tỉ-lệ với model có tệp. */
const ProceduralTree: React.FC = () => {
  const trunkH = TREE_HEIGHT * 0.42;
  const crownH = TREE_HEIGHT * 0.42;
  return (
    <group>
      <mesh position={[0, trunkH / 2, 0]}>
        <cylinderGeometry args={[TREE_RADIUS * 0.1, TREE_RADIUS * 0.16, trunkH, 8]} />
        <meshStandardMaterial color="#6b4b2f" roughness={1} />
      </mesh>
      <mesh position={[0, trunkH + crownH * 0.38, 0]}>
        <coneGeometry args={[TREE_RADIUS * 0.92, crownH * 1.1, 10]} />
        <meshStandardMaterial color="#3f7f45" roughness={1} />
      </mesh>
      <mesh position={[0, trunkH + crownH * 0.95, 0]}>
        <coneGeometry args={[TREE_RADIUS * 0.66, crownH * 0.95, 10]} />
        <meshStandardMaterial color="#4f8f4a" roughness={1} />
      </mesh>
    </group>
  );
};

export interface TreeModelProps {
  position: [number, number, number];
  /** Model muốn dùng; bỏ trống → cây tự tạo. */
  modelId?: TreeModelId;
  /** Xoay quanh trục đứng (radian) — mỗi cây lệch một chút cho đỡ giống hệt nhau. */
  rotationY?: number;
  scale?: number;
  /** Cây đang được chọn → thêm vòng sáng dưới gốc. */
  highlighted?: boolean;
}

export const TreeModel: React.FC<TreeModelProps> = ({
  position,
  modelId = DEFAULT_TREE_MODEL_ID,
  rotationY = 0,
  scale = 1,
  highlighted = false,
}) => {
  const template = useTreeTemplate(modelId);
  const object = useMemo(() => template?.clone(true) ?? null, [template]);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {object ? <primitive object={object} /> : <ProceduralTree />}
      {highlighted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.85, 1.15, 40]} />
          <meshBasicMaterial color="#3ddc84" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

export default TreeModel;
