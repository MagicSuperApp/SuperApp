/**
 * space3d/scene/TreeModelPreview — ô xem trước 3D, dùng làm ICON cho nút chọn model.
 *
 * Mỗi ô là một <Canvas> riêng, quay chậm để thấy được dáng cây. Model tự canh khung:
 * đo hộp bao rồi đặt camera lùi đủ xa, nên model nào cũng vừa khít ô, không phải
 * chỉnh tay từng cái khi thêm model mới.
 *
 * LƯU Ý HIỆU NĂNG: mỗi Canvas = một ngữ-cảnh GL riêng. Vì vậy component này chỉ
 * được gắn khi bộ chọn ĐANG MỞ (hộp thoại), và tắt khử răng cưa cho nhẹ.
 *
 * Ô "Cây thật" xem trước ĐÚNG đám mây điểm của cây đang mở, không phải một hình
 * minh-hoạ chung: bộ chọn luôn mở cho một cây cụ thể, nên `treeId` có sẵn. Cây
 * chưa dựng 3D thì ô hiện cây tự tạo — đúng thứ sẽ hiện ra ngoài vườn nếu chọn.
 * Hình học đã được `treePoints` nhớ sẵn từ lượt dựng cảnh, nên ô này gần như
 * không tốn thêm lượt mạng nào.
 *
 * ── NƠI DÙNG THỨ HAI: ô "3D" ở màn chi tiết cây ────────────────────────────
 * Ô đó từng vẽ một hình cây bằng SVG — một khung tán tự nghĩ ra, KHÔNG phải cây
 * này. Yêu cầu của chủ dự án nói thẳng: *"sử dụng 3D từ 3D place luôn, không tạo
 * thêm 1 model giả"*. Nên ô đó nay gắn CHÍNH component này, với CHÍNH `modelId`
 * mà người dùng đã chọn ở màn đặt cây 3D — cùng một đám mây điểm, cùng một bộ
 * nhớ đệm (`treePoints` giữ cache ở tầng module), cùng một đường lùi.
 *
 * Hai tham số thêm vào cho nơi dùng đó, cả hai đều TUỲ CHỌN nên bộ chọn model
 * không phải đổi một dòng nào:
 *   `fruits`      chấm quả phát sáng — CÙNG `FruitDots` mà cảnh 3D thật dùng.
 *   `fill`        trải kín khối cha thay vì ô vuông cạnh `size`.
 *   `background`  màu nền của khung vẽ. `<Canvas>` tô nền ĐẶC, nên nơi nào đặt ô
 *                 lên một nền tối khác phải truyền đúng màu nền đó vào, nếu
 *                 không sẽ thấy một ô gần-đen nằm trong một khối xanh đậm.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import FruitDots, { type FruitDot } from './FruitDots';
import { loadTreeTemplate } from '../treeAsset';
import {
  buildTreePoints, disposeTreePointsInstance, loadTreePoints,
} from '../treePoints';
import { getTreeModel, isFileBacked, isPointCloud, type TreeModelId } from '../treeModels';
import { SPACE_COLORS } from '../visuals';
import { TREE_HEIGHT, TREE_RADIUS } from '../treeFrame';

/** Cây tự tạo thu nhỏ — bản xem trước của model mặc định (không có tệp). */
function buildProceduralPreview(): THREE.Object3D {
  const g = new THREE.Group();
  const trunkH = TREE_HEIGHT * 0.42;
  const crownH = TREE_HEIGHT * 0.42;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(TREE_RADIUS * 0.1, TREE_RADIUS * 0.16, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4b2f, roughness: 1 }),
  );
  trunk.position.y = trunkH / 2;

  const crownLow = new THREE.Mesh(
    new THREE.ConeGeometry(TREE_RADIUS * 0.92, crownH * 1.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x3f7f45, roughness: 1 }),
  );
  crownLow.position.y = trunkH + crownH * 0.38;

  const crownTop = new THREE.Mesh(
    new THREE.ConeGeometry(TREE_RADIUS * 0.66, crownH * 0.95, 10),
    new THREE.MeshStandardMaterial({ color: 0x4f8f4a, roughness: 1 }),
  );
  crownTop.position.y = trunkH + crownH * 0.95;

  g.add(trunk, crownLow, crownTop);
  return g;
}

/** Quay chậm quanh trục đứng + tự canh camera cho model vừa khung. */
const Spinner: React.FC<{ object: THREE.Object3D; fruits?: FruitDot[] }> = ({ object, fruits }) => {
  const ref = useRef<THREE.Group>(null);

  // Camera đặt theo kích-thước THẬT của MODEL → model nào cũng vừa ô.
  //
  // Cố ý KHÔNG tính chấm quả vào hộp bao: quả nằm trong tán nên chúng không nới
  // hộp ra, mà một quả đặt lệch (toạ độ chưa ai chỉnh) thì lại nới rất nhiều —
  // và lúc đó cả cây bị đẩy xa ra chỉ vì một chấm.
  const { distance, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const c = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(c);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    return { distance: radius * 3.1, center: c };
  }, [object]);

  useFrame((state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.55;
    const cam = state.camera;
    cam.position.set(distance * 0.55, center.y + distance * 0.32, distance * 0.9);
    cam.lookAt(center.x, center.y, center.z);
  });

  return (
    <group ref={ref}>
      <primitive object={object} />
      {/* Chấm quả nằm TRONG nhóm quay, nên chúng quay cùng cây — quả ở mặt sau
          đi khuất rồi hiện lại đúng nhịp với tán. Gốc `[0,0,0]` vì ở đây cây
          đứng ngay tại gốc toạ độ; ngoài cảnh vườn thì `FruitDots` nhận vị trí
          gốc cây trong hệ vườn. */}
      {fruits && fruits.length > 0 ? <FruitDots fruits={fruits} origin={[0, 0, 0]} /> : null}
    </group>
  );
};

export interface TreeModelPreviewProps {
  modelId: TreeModelId;
  /** Cây đang mở. Cần cho ô "Cây thật"; bỏ trống thì ô đó hiện cây tự tạo. */
  treeId?: string;
  /** Cạnh ô (px). Ô vuông. Bỏ qua khi `fill`. */
  size?: number;
  /** Trải kín khối cha thay vì ô vuông — dùng cho ô Bento không vuông. */
  fill?: boolean;
  /** Chấm quả phát sáng, cùng `FruitDots` mà cảnh 3D thật dùng. */
  fruits?: FruitDot[];
  /** Màu nền khung vẽ. `<Canvas>` tô nền ĐẶC — xem chú thích đầu tệp. */
  background?: string;
}

export const TreeModelPreview: React.FC<TreeModelPreviewProps> = ({
  modelId, treeId, size = 72, fill, fruits, background = '#0b1512',
}) => {
  const def = useMemo(() => getTreeModel(modelId), [modelId]);
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let points: THREE.Object3D | null = null;
    setObject(null);
    setFailed(false);

    if (isPointCloud(def)) {
      if (!treeId) {
        setObject(buildProceduralPreview());
        return;
      }
      loadTreePoints(treeId).then((r) => {
        if (r.kind === 'ok') {
          const built = buildTreePoints(r.template);
          if (!alive) { disposeTreePointsInstance(built); return; }
          points = built;
          setObject(built);
          return;
        }
        // Chưa dựng 3D, hoặc hỏng: hiện cây tự tạo — đúng thứ sẽ ra ngoài vườn.
        // Chỉ chấm vàng khi HỎNG; cây chưa chụp đủ ảnh không phải sự cố.
        if (!alive) return;
        setObject(buildProceduralPreview());
        if (r.kind === 'error') setFailed(true);
      });
      return () => { alive = false; disposeTreePointsInstance(points); };
    }

    if (!isFileBacked(def)) {
      setObject(buildProceduralPreview());
      return;
    }
    loadTreeTemplate(def)
      .then((tpl) => { if (alive) setObject(tpl.object.clone(true)); })
      .catch(() => {
        // Nạp hỏng → hiện cây tự tạo để ô không trống trơn; lỗi chi tiết đã được
        // TreeModel báo lên HUD rồi, không nhân đôi thông báo ở đây.
        if (alive) { setObject(buildProceduralPreview()); setFailed(true); }
      });
    return () => { alive = false; };
  }, [def, treeId]);

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: background },
        fill ? StyleSheet.absoluteFill : { width: size, height: size },
      ]}
    >
      {object ? (
        <Canvas
          style={StyleSheet.absoluteFill}
          camera={{ fov: 40, near: 0.05, far: 200 }}
          gl={{ antialias: false }}
        >
          <color attach="background" args={[background]} />
          {/* Điểm dùng `PointsMaterial` (không nhận sáng) nên đèn dưới đây chỉ
              phục vụ model .glb và cây tự tạo — để nguyên, không hại gì. */}
          <hemisphereLight args={['#bfe8cf', '#0a1410', 1.1]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[3, 6, 4]} intensity={1.2} color="#e6fff0" />
          <Spinner object={object} fruits={fruits} />
        </Canvas>
      ) : (
        <ActivityIndicator size="small" color={SPACE_COLORS.accent} />
      )}
      {failed && <View style={styles.failedDot} />}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    // 8px bo góc theo yêu cầu của bộ chọn. Nơi dùng `fill` nằm trong một khối đã
    // bo góc và đã `overflow: 'hidden'`, nên 8 ở đây bị khối cha cắt lại — không
    // hại gì, và không phải thêm một tham số nữa chỉ để tắt nó.
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedDot: {
    position: 'absolute', top: 5, right: 5,
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#fbbf24',
  },
});

export default TreeModelPreview;
