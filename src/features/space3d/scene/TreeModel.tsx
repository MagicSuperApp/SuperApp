/**
 * space3d/scene/TreeModel — một cây trong không-gian 3D.
 *
 * Model nào hiển thị do `modelId` quyết định, tra trong sổ `treeModels.ts`.
 * Ba loại:
 *   · 'points'     — MẶC ĐỊNH. Đám mây điểm của CHÍNH cây đó, tải từ OriLife
 *                    (`treePoints.ts`) — cùng nguồn với ô 3D ở màn truy-xuất quả.
 *   · 'file'       — tệp .glb đóng gói, nạp qua `treeAsset.loadTreeTemplate()`.
 *   · 'procedural' — thân trụ + hai tầng tán nón, dựng bằng hình học sẵn có.
 *
 * Trong lúc đang nạp, hoặc nạp hỏng, hoặc cây CHƯA có bản dựng 3D, vẫn vẽ cây
 * tự tạo. Nhờ vậy:
 *   · Người dùng luôn thấy vườn có cây.
 *   · Phân biệt được sự cố: thấy cây tự tạo + thông báo lỗi = lỗi NẠP MODEL;
 *     không thấy gì cả = lỗi DỰNG HÌNH/ÁNH SÁNG/VỊ TRÍ — hướng sửa khác hẳn.
 *
 * ── Vì sao trạng-thái phải khoá theo CẢ tree_id ─────────────────────────────
 * Model .glb dùng chung cho mọi cây nên một dòng trạng-thái cho mỗi `modelId` là
 * đủ. Đám mây điểm thì mỗi cây một tệp: cây A dựng xong, cây B chưa chụp đủ ảnh.
 * Khoá chỉ theo `modelId` là câu của cây này đè lên câu của cây kia, và HUD sẽ
 * báo sai cây.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { TREE_HEIGHT, TREE_RADIUS } from '../treeFrame';
import { loadTreeTemplate } from '../treeAsset';
import {
  buildTreePoints, disposeTreePointsInstance, loadTreePoints,
} from '../treePoints';
import {
  DEFAULT_TREE_MODEL_ID, getTreeModel, isFileBacked, isPointCloud,
  type TreeModelId,
} from '../treeModels';

/** Trạng-thái nạp của MỘT model. `treeId` chỉ có ở cây điểm (mỗi cây một tệp). */
export interface TreeModelStatus {
  modelId: TreeModelId;
  /** Cây mà dòng này nói về. Bỏ trống = nói về model dùng chung cho mọi cây. */
  treeId?: string;
  /** 'missing' = cây chưa có bản dựng 3D — chuyện bình thường, KHÔNG phải lỗi. */
  state: 'loading' | 'ready' | 'failed' | 'missing';
  textured: boolean;
  message?: string;
  /**
   * Nguyên văn `meta.status` của máy chủ khi `state === 'missing'` (`none` /
   * `building` / `failed`). Chỉ có ở cây điểm. Màn hình đọc trường này để quyết
   * bày hay không bày nút "Dựng hình 3D" — `building` nghĩa là đã có lượt đang
   * chạy. KHÔNG suy từ `message`: câu chữ đổi là phép so sánh đó chết im lặng.
   */
  serverStatus?: string;
}

const statusKey = (modelId: TreeModelId, treeId?: string) => `${modelId}\u0000${treeId ?? ''}`;

const statuses = new Map<string, TreeModelStatus>();
const listeners = new Set<(all: TreeModelStatus[]) => void>();

function setStatus(next: TreeModelStatus) {
  statuses.set(statusKey(next.modelId, next.treeId), next);
  const all = Array.from(statuses.values());
  listeners.forEach((fn) => fn(all));
}

/** Theo dõi việc nạp MỌI model (Space3DScreen dùng để hiện lỗi lên HUD). */
export function subscribeTreeModelStatus(fn: (all: TreeModelStatus[]) => void): () => void {
  listeners.add(fn);
  fn(Array.from(statuses.values()));
  return () => { listeners.delete(fn); };
}

/**
 * Dòng trạng-thái đúng cho một cây: ưu tiên dòng nói riêng về cây đó, không có
 * thì lấy dòng chung của model. Gom vào đây để HUD khỏi tự dò.
 */
export function findTreeModelStatus(
  all: TreeModelStatus[],
  modelId: TreeModelId,
  treeId?: string,
): TreeModelStatus | undefined {
  return (
    all.find((s) => s.modelId === modelId && s.treeId === treeId)
    ?? all.find((s) => s.modelId === modelId && s.treeId == null)
  );
}

/** Template dùng chung theo model; mỗi cây chỉ `clone()` (chung geometry/material). */
function useTreeTemplate(modelId: TreeModelId): THREE.Object3D | null {
  const [template, setTemplate] = useState<THREE.Object3D | null>(null);
  const def = useMemo(() => getTreeModel(modelId), [modelId]);

  useEffect(() => {
    if (!isFileBacked(def)) {
      setTemplate(null); // cây tự tạo / cây điểm — không có tệp .glb để nạp
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

/**
 * Đám mây điểm của CHÍNH cây này.
 *
 * Khác `useTreeTemplate` ở chỗ không có gì để `clone()`: mỗi cây một tệp riêng,
 * nên bản dựng ở đây thuộc về đúng cây này và phải tự dọn khi tháo.
 */
function useTreePointCloud(
  enabled: boolean,
  modelId: TreeModelId,
  treeId?: string,
): THREE.Object3D | null {
  // Nhóm chứ không phải `Points`: bản dựng gồm HAI lớp — lưới nối và các điểm.
  const [points, setPoints] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    setPoints(null);
    if (!enabled || !treeId) return;

    let alive = true;
    let built: THREE.Object3D | null = null;
    setStatus({ modelId, treeId, state: 'loading', textured: false });

    loadTreePoints(treeId).then((r) => {
      if (r.kind === 'ok') {
        // `buildTreePoints` chỉ dựng vật liệu mới quanh hình học đã nhớ, nên gọi
        // sau khi màn đã tháo cũng chỉ tốn một vật liệu — dọn ngay là xong.
        const obj = buildTreePoints(r.template);
        if (!alive) {
          disposeTreePointsInstance(obj);
          return;
        }
        built = obj;
        setPoints(obj);
        setStatus({
          modelId,
          treeId,
          state: 'ready',
          textured: true,
          message: r.template.advice ?? undefined,
        });
        return;
      }
      if (!alive) return;
      setStatus({
        modelId,
        treeId,
        state: r.kind === 'unavailable' ? 'missing' : 'failed',
        textured: false,
        message: r.message,
        serverStatus: r.kind === 'unavailable' ? r.serverStatus : undefined,
      });
    });

    return () => {
      alive = false;
      disposeTreePointsInstance(built);
    };
  }, [enabled, modelId, treeId]);

  return points;
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
  /** Model muốn dùng; bỏ trống → mặc định (cây điểm từ OriLife). */
  modelId?: TreeModelId;
  /** Mã cây phía OriLife. BẮT BUỘC cho cây điểm — không có thì rơi về cây tự tạo. */
  treeId?: string;
  /** Xoay quanh trục đứng (radian) — mỗi cây lệch một chút cho đỡ giống hệt nhau. */
  rotationY?: number;
  scale?: number;
  /** Cây đang được chọn → thêm vòng sáng dưới gốc. */
  highlighted?: boolean;
}

export const TreeModel: React.FC<TreeModelProps> = ({
  position,
  modelId = DEFAULT_TREE_MODEL_ID,
  treeId,
  rotationY = 0,
  scale = 1,
  highlighted = false,
}) => {
  const def = useMemo(() => getTreeModel(modelId), [modelId]);
  const wantsPoints = isPointCloud(def);

  const template = useTreeTemplate(modelId);
  const cloud = useTreePointCloud(wantsPoints, def.id, treeId);

  const fileObject = useMemo(() => template?.clone(true) ?? null, [template]);
  const object = wantsPoints ? cloud : fileObject;

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
