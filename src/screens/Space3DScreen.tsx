/**
 * Space3DScreen — KHÔNG-GIAN 3D DUY NHẤT của vườn · cây · quả.
 *
 * Mọi nút "sơ đồ / xem 3D" ở Trang trại, Chi tiết cây và Quả đều mở vào ĐÂY.
 * Một màn, hai chế độ xem, chuyển qua lại bằng chuyển cảnh bay:
 *
 *   TOÀN CẢNH VƯỜN  — mặt đất dựng từ điểm nối ranh giới + tất cả cây (tree1.glb).
 *                     Chạm 1 cây → bay sà vào cây đó (fly-in vòng cung).
 *   XEM 1 CÂY       — cây phóng to + chấm QUẢ phát sáng xuyên tán, có tên.
 *                     Chạm 1 quả → thẻ thông tin + đặt lại toạ-độ 3D.
 *
 * Cử chỉ: 1 ngón xoay · 2 ngón phóng · chạm nhanh để chọn.
 * Chọn đối-tượng bằng cách CHIẾU tâm vật ra px rồi so khoảng cách với điểm chạm —
 * chắc ăn hơn raycast với vật nhỏ (chấm quả) và không cần mesh ẩn để bắt tia.
 *
 * Đặt vị-trí cây thủ công: bật chế độ đặt → chạm mặt đất → cắt tia xuống mặt
 * phẳng y=0 → lưu (x,z) vào máy (server chưa có chỗ lưu vị-trí đặt tay).
 *
 * NỀN BẢN ĐỒ + hai kiểu xem (nút ở cạnh phải):
 *   3D — máy quay nghiêng, model cây dựng đứng, ảnh bản đồ trải dưới thửa đất.
 *   2D — nhìn thẳng từ trên xuống, BẮC HƯỚNG LÊN, khoá nghiêng, cây thu về chấm
 *        dẹt để không che ảnh; 1 ngón KÉO bản đồ thay vì xoay.
 * Ảnh nền lấy từ ô raster Web-Mercator và đặt theo đúng ĐIỂM NỐI ranh giới đã vẽ
 * lúc thêm vườn (xem `mapTiles.ts`) — không dùng thư-viện bản-đồ nào.
 *
 * Route params: { mode?, farmId?, treeId?, treeName?, fruitId? }
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  PanResponder, Modal, ScrollView, Image, StatusBar, useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Canvas, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';

import { ORILIFE_BASE } from '../services/orilifeBase';
import { getFruitViews, type FruitView } from '../services/fruitReIDService';
import { ringRadius, type Vec2 } from '../features/space3d/geo';
import { TREE_HEIGHT, coordToLocalMeters, coordToZone, ZONE_LABEL } from '../features/space3d/treeFrame';
import { SPACE_COLORS, fruitColor } from '../features/space3d/visuals';
import { PHI_MIN, SpaceController } from '../features/space3d/controller';
import { labelBus, type ScreenLabel } from '../features/space3d/labelBus';
import { CameraDriver, Projector, type LabelPoint } from '../features/space3d/scene/Rig';
import FarmGround from '../features/space3d/scene/FarmGround';
import MapGround, { type MapGroundStatus } from '../features/space3d/scene/MapGround';
import TreeMarkers from '../features/space3d/scene/TreeMarkers';
import { DEFAULT_MAP_SOURCE_ID } from '../features/space3d/mapTiles';
import TreeModel, {
  findTreeModelStatus, subscribeTreeModelStatus, type TreeModelStatus,
} from '../features/space3d/scene/TreeModel';
import { TREE_MODELS, getTreeModel } from '../features/space3d/treeModels';
import TreeModelPreview from '../features/space3d/scene/TreeModelPreview';
import FruitDots from '../features/space3d/scene/FruitDots';
import { useSpaceData, type SceneFruit, type SceneTree } from '../features/space3d/useSpaceData';
import { saveTreePosition } from '../features/space3d/positionStore';
import rLog from '../services/remoteLogger';
import GLErrorBoundary from '../components/GLErrorBoundary';
import RemoteImage from '../components/RemoteImage';

interface RouteParams {
  mode?: 'farm' | 'tree';
  farmId?: string;
  treeId?: string;
  treeName?: string;
  fruitId?: string;
  /** Mở thẳng vào chế độ ĐẶT VỊ TRÍ TAY cho cây này (từ Chi tiết cây). */
  placeTreeId?: string;
}

/** Bán kính chạm trúng (px) khi chọn cây / quả. */
const TAP_RADIUS_PX = 46;
/** Ngưỡng coi là "chạm" chứ không phải "kéo". */
const TAP_MOVE_PX = 10;
const TAP_MS = 320;

/** Số nhãn tối đa vẽ cùng lúc — vườn vài trăm cây thì chữ sẽ chồng thành cháo. */
const MAX_LABELS = 26;

/** Góc mở ống kính — khai ở đây vì vừa truyền cho <Canvas> vừa dùng để đổi px ⇄ mét. */
const CAMERA_FOV = 55;

/** Kiểu xem: cảnh 3D nghiêng hay bản đồ 2D nhìn thẳng từ trên xuống. */
type ViewMode = '3d' | '2d';

interface PickCtx { camera: THREE.Camera | null; width: number; height: number }

// ── Cầu nối lấy camera/kích-thước ra ngoài Canvas (để chọn & cắt tia) ─────────
const SceneBridge: React.FC<{ ctxRef: React.MutableRefObject<PickCtx> }> = ({ ctxRef }) => {
  const { camera, size } = useThree();
  useEffect(() => {
    ctxRef.current.camera = camera;
    ctxRef.current.width = size.width;
    ctxRef.current.height = size.height;
  }, [camera, size.width, size.height, ctxRef]);
  return null;
};

/** Chiếu 1 điểm thế-giới ra px canvas. */
function project(p: THREE.Vector3, ctx: PickCtx): { x: number; y: number; front: boolean } | null {
  if (!ctx.camera || !(ctx.width > 0)) return null;
  const v = p.clone().project(ctx.camera);
  return {
    x: (v.x * 0.5 + 0.5) * ctx.width,
    y: (-v.y * 0.5 + 0.5) * ctx.height,
    front: v.z > -1 && v.z < 1,
  };
}

/** Điểm chạm → giao điểm với mặt đất (y = 0). null nếu tia không cắt xuống đất. */
function groundHit(px: number, py: number, ctx: PickCtx): Vec2 | null {
  const cam = ctx.camera;
  if (!cam || !(ctx.width > 0)) return null;
  const ndc = new THREE.Vector3((px / ctx.width) * 2 - 1, -(py / ctx.height) * 2 + 1, 0.5);
  ndc.unproject(cam);
  const dir = ndc.sub(cam.position).normalize();
  if (Math.abs(dir.y) < 1e-4) return null;
  const t = -cam.position.y / dir.y;
  if (t <= 0) return null;
  const hit = cam.position.clone().addScaledVector(dir, t);
  return { x: hit.x, z: hit.z };
}

// ── Lớp nhãn (anh em của Canvas nên vẽ lại KHÔNG đụng tới cảnh 3D) ────────────
const SceneLabels: React.FC = () => {
  const [labels, setLabels] = useState<ScreenLabel[]>([]);
  useEffect(() => labelBus.subscribe(setLabels), []);

  const shown = useMemo(() => {
    const vis = labels.filter((l) => l.visible);
    vis.sort((a, b) => a.distance - b.distance);
    return vis.slice(0, MAX_LABELS);
  }, [labels]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {shown.map((l) => (
        <Text
          key={l.id}
          numberOfLines={1}
          style={[
            l.kind === 'tree' ? styles.treeLabel : styles.fruitLabel,
            {
              left: l.x - 70,
              top: l.y - (l.kind === 'tree' ? 30 : 26),
              // Xa dần thì mờ dần để lớp chữ không đè bẹp hình.
              opacity: Math.max(0.35, Math.min(1, 26 / Math.max(6, l.distance))),
            },
          ]}
        >
          {l.text}
        </Text>
      ))}
    </View>
  );
};

const Space3DScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const params = (route.params ?? {}) as RouteParams;

  // Trace vòng đời Space3D — nếu app crash khi mở 3D, log mount là mốc cuối cùng
  // (crash TRƯỚC 'space3d_canvas_focus' = lỗi dựng cảnh/GL; sau = trong lúc render).
  useEffect(() => {
    rLog.viewer3d.spaceMount({ mode: params.mode, farmId: params.farmId, treeId: params.treeId });
    return () => rLog.viewer3d.spaceUnmount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (isFocused) rLog.viewer3d.spaceCanvasFocus();
  }, [isFocused]);

  const [focusTreeId, setFocusTreeId] = useState<string | null>(params.treeId ?? null);
  const [selectedFruitId, setSelectedFruitId] = useState<string | null>(params.fruitId ?? null);
  const [placingTreeId, setPlacingTreeId] = useState<string | null>(params.placeTreeId ?? null);
  const [placeToast, setPlaceToast] = useState<string | null>(null);

  // Trạng-thái nạp model — hiện thẳng lên HUD thay vì chỉ nằm trong console,
  // để lỗi model không còn là "cây không hiện, không rõ vì sao".
  const [modelStatuses, setModelStatuses] = useState<TreeModelStatus[]>([]);
  useEffect(() => subscribeTreeModelStatus(setModelStatuses), []);

  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // ── Bản đồ nền + kiểu xem ──────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [mapOn, setMapOn] = useState(true);
  // Nút đổi nguồn ảnh đang được tắt (xem khối chú thích ở phần HUD) → chỉ đọc.
  const [mapSourceId] = useState<string>(DEFAULT_MAP_SOURCE_ID);
  const [mapStatus, setMapStatus] = useState<MapGroundStatus | null>(null);

  const data = useSpaceData(params.farmId, focusTreeId ?? undefined);
  const { ring, hasBoundary, trees, fruits, fruitsLoading, fruitsError } = data;

  const focusTree = useMemo(
    () => trees.find((t) => t.id === focusTreeId) ?? null,
    [trees, focusTreeId],
  );
  const selectedFruit = useMemo(
    () => fruits.find((f) => f.fruitId === selectedFruitId) ?? null,
    [fruits, selectedFruitId],
  );

  const ctxRef = useRef<PickCtx>({ camera: null, width: 0, height: 0 });
  const farmRadius = useMemo(() => ringRadius(ring), [ring]);

  // ── Máy quay ───────────────────────────────────────────────────────────────
  const controllerRef = useRef<SpaceController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new SpaceController({
      target: new THREE.Vector3(0, 1, 0),
      theta: 0.7,
      phi: 0.95,
      radius: 40,
    });
  }
  const controller = controllerRef.current;

  const farmPose = useCallback(() => ({
    target: new THREE.Vector3(0, 1, 0),
    theta: controller.pose.theta,
    phi: 0.92,
    radius: Math.max(14, farmRadius * 2.3),
  }), [controller, farmRadius]);

  const treePose = useCallback((t: SceneTree) => ({
    target: new THREE.Vector3(t.pos.x, TREE_HEIGHT * 0.5, t.pos.z),
    // Lệch góc nhẹ so với hiện tại → cảnh bay có chuyển động ngang, đỡ "trượt thẳng".
    theta: controller.pose.theta + 0.55,
    phi: 1.12,
    radius: 6.4,
  }), [controller]);

  // Vào màn: luôn bắt đầu ở khung rộng rồi BAY vào cây (nếu mở thẳng từ 1 cây).
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current || data.loading) return;
    bootedRef.current = true;
    controller.snapTo({ ...farmPose(), radius: Math.max(20, farmRadius * 3.4) });
    const t = focusTreeId ? trees.find((x) => x.id === focusTreeId) : null;
    if (t) controller.flyTo(treePose(t), 1.9, 0.3);
    else controller.flyTo(farmPose(), 1.4, 0.15);
  }, [data.loading, trees, focusTreeId, controller, farmPose, treePose, farmRadius]);

  useFocusEffect(useCallback(() => () => labelBus.reset(), []));

  // `modeRef`: các hàm dưới đây được tạo TRƯỚC khi biết kiểu xem hiện tại (chuỗi
  // useCallback phụ thuộc lẫn nhau). Đọc qua ref để không phải xáo lại thứ tự.
  const modeRef = useRef<ViewMode>('3d');

  const flyToTree = useCallback((t: SceneTree) => {
    setFocusTreeId(t.id);
    setSelectedFruitId(null);
    // Ở chế độ 2D thì "vào xem cây" = kéo bản đồ về giữa cây và phóng lại gần,
    // KHÔNG được nghiêng máy quay (nghiêng là hết 2D).
    if (modeRef.current === '2d') {
      controller.flyTo({
        target: new THREE.Vector3(t.pos.x, 0, t.pos.z),
        theta: 0, phi: PHI_MIN, radius: 14,
      }, 1.0, 0);
      return;
    }
    controller.flyTo(treePose(t), 1.6, 0.34);
  }, [controller, treePose]);

  const flyToFarm = useCallback(() => {
    setFocusTreeId(null);
    setSelectedFruitId(null);
    if (modeRef.current === '2d') {
      controller.flyTo({
        target: new THREE.Vector3(0, 0, 0),
        theta: 0, phi: PHI_MIN, radius: Math.max(16, farmRadius * 2.6),
      }, 1.0, 0);
      return;
    }
    controller.flyTo(farmPose(), 1.3, 0.28);
  }, [controller, farmPose, farmRadius]);

  // ── Chuyển 3D ⇄ 2D ─────────────────────────────────────────────────────────
  // 2D = nhìn thẳng từ trên xuống + BẮC HƯỚNG LÊN (theta = 0). Không hạ hẳn phi
  // về 0: khi máy quay dựng đúng trục đứng thì `lookAt` suy biến (hướng nhìn song
  // song với vector "lên") và cảnh lật lung tung — PHI_MIN là mức nghiêng tối
  // thiểu an toàn, mắt gần như không phân biệt được với chính diện.
  const map2DPose = useCallback(() => ({
    target: focusTree
      ? new THREE.Vector3(focusTree.pos.x, 0, focusTree.pos.z)
      : new THREE.Vector3(0, 0, 0),
    theta: 0,
    phi: PHI_MIN,
    radius: focusTree ? 14 : Math.max(16, farmRadius * 2.6),
  }), [focusTree, farmRadius]);

  const changeViewMode = useCallback((next: ViewMode) => {
    setViewMode(next);
    modeRef.current = next;
    controller.phiLocked = next === '2d';
    if (next === '2d') {
      controller.flyTo(map2DPose(), 0.9, 0);
    } else {
      controller.flyTo(focusTree ? treePose(focusTree) : farmPose(), 0.9, 0.1);
    }
  }, [controller, map2DPose, focusTree, treePose, farmPose]);

  /**
   * Bao nhiêu MÉT trên mặt đất ứng với 1 px màn — dùng để kéo bản đồ ở chế độ 2D
   * đi đúng bằng quãng ngón tay đi. Suy từ chiều cao khung nhìn tại khoảng cách
   * hiện tại: 2·r·tan(fov/2) mét trải trên `height` px.
   */
  const metersPerPixel = useCallback(() => {
    const h = ctxRef.current.height || 1;
    return (2 * controller.pose.radius * Math.tan((CAMERA_FOV * Math.PI) / 360)) / h;
  }, [controller]);

  /** Có ảnh bản đồ để đặt không — vườn chưa có toạ-độ GPS thì chịu. */
  const mapVisible = mapOn && data.origin != null;

  // ── Chọn đối-tượng bằng phép chiếu ────────────────────────────────────────
  const handleTap = useCallback((px: number, py: number) => {
    const ctx = ctxRef.current;

    // Chế độ đặt vị-trí cây: chạm đất = đặt cây xuống đó.
    if (placingTreeId) {
      const hit = groundHit(px, py, ctx);
      if (hit) {
        data.setTreePosLocal(placingTreeId, hit);
        saveTreePosition(placingTreeId, hit);
        const name = trees.find((t) => t.id === placingTreeId)?.name ?? 'Cây';
        setPlacingTreeId(null);
        setPlaceToast(`Đã đặt ${name} vào vị trí mới`);
        setTimeout(() => setPlaceToast(null), 2600);
      }
      return;
    }

    // Xem 1 cây: ưu tiên bắt QUẢ (vật nhỏ, người dùng nhắm vào nó).
    if (focusTree) {
      let best: { id: string; d: number } | null = null;
      const base = new THREE.Vector3(focusTree.pos.x, 0, focusTree.pos.z);
      for (const f of fruits) {
        const [lx, ly, lz] = coordToLocalMeters(f.coord);
        const p = project(base.clone().add(new THREE.Vector3(lx, ly, lz)), ctx);
        if (!p?.front) continue;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d <= TAP_RADIUS_PX && (!best || d < best.d)) best = { id: f.fruitId, d };
      }
      if (best) {
        setSelectedFruitId(best.id);
        return;
      }
      setSelectedFruitId(null);
    }

    // Toàn cảnh: bắt cây. Chỗ ngắm phải khớp thứ đang VẼ — 3D thì nhắm vào thân
    // (~nửa chiều cao), 2D thì cây chỉ còn chấm dẹt nằm sát mặt đất.
    const pickY = viewMode === '2d' ? 0.1 : TREE_HEIGHT * 0.45;
    let bestTree: { tree: SceneTree; d: number } | null = null;
    for (const t of trees) {
      if (t.id === focusTreeId) continue;
      const p = project(new THREE.Vector3(t.pos.x, pickY, t.pos.z), ctx);
      if (!p?.front) continue;
      const d = Math.hypot(p.x - px, p.y - py);
      if (d <= TAP_RADIUS_PX && (!bestTree || d < bestTree.d)) bestTree = { tree: t, d };
    }
    if (bestTree) flyToTree(bestTree.tree);
  }, [placingTreeId, focusTree, focusTreeId, fruits, trees, data, flyToTree, viewMode]);

  // ── Cử chỉ: 1 ngón xoay · 2 ngón phóng · chạm nhanh chọn ──────────────────
  // startedAt/moved: phân biệt CHẠM (chọn) với KÉO (xoay).
  // lastDx/lastDy: gestureState.dx là TỔNG từ lúc đặt ngón, nên phải trừ giá trị
  // khung trước mới ra phần dịch chuyển của khung này.
  const gesture = useRef({ startedAt: 0, moved: 0, pinch: 0, lastDx: 0, lastDy: 0 }).current;

  const resetGesture = useCallback(() => {
    gesture.pinch = 0;
    gesture.lastDx = 0;
    gesture.lastDy = 0;
  }, [gesture]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      gesture.startedAt = Date.now();
      gesture.moved = 0;
      gesture.lastDx = 0;
      gesture.lastDy = 0;
      gesture.pinch = t.length >= 2
        ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY)
        : 0;
    },
    onPanResponderMove: (e, g) => {
      const t = e.nativeEvent.touches;
      gesture.moved = Math.max(gesture.moved, Math.hypot(g.dx, g.dy));
      if (t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (gesture.pinch > 0 && d > 0) controller.zoomBy(d / gesture.pinch);
        gesture.pinch = d;
        gesture.lastDx = g.dx;
        gesture.lastDy = g.dy;
        return;
      }
      gesture.pinch = 0;
      const stepX = g.dx - gesture.lastDx;
      const stepY = g.dy - gesture.lastDy;
      // 2D là bản đồ: 1 ngón phải KÉO nền chứ không xoay quanh tâm — và vì góc
      // nghiêng bị khoá, kéo dọc mà gọi orbit() sẽ không có phản hồi gì cả.
      if (viewMode === '2d') controller.panBy(stepX, stepY, metersPerPixel());
      else controller.orbit(stepX, stepY);
      gesture.lastDx = g.dx;
      gesture.lastDy = g.dy;
    },
    onPanResponderRelease: (e) => {
      const quick = Date.now() - gesture.startedAt < TAP_MS && gesture.moved < TAP_MOVE_PX;
      resetGesture();
      if (quick) handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
    },
    onPanResponderTerminate: resetGesture,
  }), [controller, gesture, handleTap, resetGesture, viewMode, metersPerPixel]);

  // ── Nhãn cần chiếu ────────────────────────────────────────────────────────
  // Ở 2D, treo nhãn trên ngọn cây là vô nghĩa (nhìn từ trên xuống thì ngọn nằm
  // ngay chồng lên gốc) → hạ nhãn xuống sát chấm cây.
  const treeLabelY = viewMode === '2d' ? 0.3 : TREE_HEIGHT * 1.05;

  const labelPoints: LabelPoint[] = useMemo(() => {
    if (focusTree) {
      const base = new THREE.Vector3(focusTree.pos.x, 0, focusTree.pos.z);
      const pts: LabelPoint[] = [{
        id: `tree:${focusTree.id}`,
        kind: 'tree',
        text: focusTree.name,
        position: [base.x, treeLabelY, base.z],
      }];
      for (const f of fruits) {
        const [lx, ly, lz] = coordToLocalMeters(f.coord);
        pts.push({
          id: `fruit:${f.fruitId}`,
          kind: 'fruit',
          text: f.name,
          position: [base.x + lx, base.y + ly, base.z + lz],
        });
      }
      return pts;
    }
    // `posSource === 'auto'` nghĩa là cây KHÔNG có toạ độ, và chỗ nó đang đứng là
    // do `seededPointInRing()` rắc ngẫu nhiên trong ranh giới (`useSpaceData.ts:167`).
    // Cờ đó sinh ra từ đầu nhưng CHƯA nơi nào đọc — nên tới hôm nay, cây bịa vị trí
    // trông y hệt cây có GPS thật. Người thực địa nhìn sơ đồ, đi 60m tới góc vườn,
    // và ở đó không có cây nào. Đây đúng cơ chế "giá trị hợp lý thay cho giá trị
    // vắng": không có gì báo lỗi, chỉ có một vị trí sai trông rất thuyết phục.
    // Dấu `~` là mức rẻ nhất để nói thật; nó không sửa được vị trí, nhưng nó thôi
    // hứa một thứ app không biết.
    return trees.map((t) => ({
      id: `tree:${t.id}`,
      kind: 'tree' as const,
      text: t.posSource === 'auto' ? `~ ${t.name}` : t.name,
      position: [t.pos.x, treeLabelY, t.pos.z] as [number, number, number],
    }));
  }, [focusTree, fruits, trees, treeLabelY]);

  // ── Ảnh các góc của 1 quả ─────────────────────────────────────────────────
  const [viewsModal, setViewsModal] = useState<{ fruit: SceneFruit; views: FruitView[]; loading: boolean; error: string | null } | null>(null);

  const openFruitViews = useCallback(async (f: SceneFruit) => {
    setViewsModal({ fruit: f, views: [], loading: true, error: null });
    const r = await getFruitViews(ORILIFE_BASE, f.fruitId);
    setViewsModal((m) => (m && m.fruit.fruitId === f.fruitId
      ? { ...m, loading: false, views: r.ok && r.data ? r.data.views ?? [] : [], error: r.ok ? null : (r.error?.detail ?? 'Không tải được ảnh quả.') }
      : m));
  }, []);

  const openFruitPlacer = useCallback((f: SceneFruit) => {
    if (!focusTree) return;
    navigation.navigate('FruitPlace3D', {
      treeId: focusTree.id,
      treeName: focusTree.name,
      fruitId: f.fruitId,
      fruitName: f.name,
      initial: f.coord,
      returnTo: 'Space3D',
    });
  }, [navigation, focusTree]);

  // Quay lại từ màn đặt toạ-độ → nạp lại để thấy quả ở chỗ mới.
  useFocusEffect(useCallback(() => {
    data.reloadFruits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTreeId]));

  // Đặt vị trí xong phải đứng NGUYÊN ở cây vừa làm việc, chọn lại đúng quả đó —
  // rơi về toàn cảnh là mất mạch thao tác (và người dùng phải tự bay vào lại).
  // Đọc xong thì XOÁ tham số, nếu không mỗi lần màn này vẽ lại nó sẽ ép chọn lại.
  useEffect(() => {
    const p = route.params as (RouteParams & { placedTreeId?: string; placedFruitId?: string }) | undefined;
    if (!p?.placedTreeId) return;
    setFocusTreeId(p.placedTreeId);
    if (p.placedFruitId) setSelectedFruitId(p.placedFruitId);
    navigation.setParams({
      placedTreeId: undefined, placedFruitId: undefined, pickedFruitCoord: undefined,
    } as any);
  }, [route.params, navigation]);

  const treeCountLabel = `${trees.length} cây`;

  /** Câu nhắc về lớp bản đồ — chỉ hiện khi có chuyện đáng nói. */
  const mapNote = useMemo(() => {
    if (!mapOn) return null;
    if (!data.origin) {
      return 'Vườn chưa có điểm nối GPS nào nên không đặt được ảnh bản đồ. Vẽ ranh giới ở màn Trang trại rồi mở lại.';
    }
    if (mapStatus && mapStatus.failed > 0) {
      return mapStatus.loaded === 0
        ? `Không tải được ảnh bản đồ (${mapStatus.error ?? 'lỗi mạng'}). Kiểm tra kết nối rồi bật lại lớp bản đồ.`
        : `Thiếu ${mapStatus.failed}/${mapStatus.total} ô ảnh bản đồ.`;
    }
    return null;
  }, [mapOn, data.origin, mapStatus]);

  /** Cử chỉ khác nhau giữa hai kiểu xem → nói đúng cái đang dùng được. */
  const gestureHint = viewMode === '2d'
    ? '1 ngón kéo bản đồ · 2 ngón phóng'
    : '1 ngón xoay · 2 ngón phóng';

  // Chỉ báo trạng-thái của MODEL cây đang mở (mỗi cây có thể dùng model khác nhau).
  // Cây điểm có dòng riêng theo mã cây — `findTreeModelStatus` ưu tiên dòng đó rồi
  // mới tới dòng chung, nếu không câu của cây khác sẽ hiện dưới tên cây này.
  const focusModelStatus = useMemo(
    () => (focusTree
      ? findTreeModelStatus(modelStatuses, focusTree.modelId, focusTree.id)
      : undefined),
    [modelStatuses, focusTree],
  );

  const pickModel = useCallback((modelId: string) => {
    if (focusTree) data.setTreeModel(focusTree.id, modelId);
    setModelPickerOpen(false);
  }, [focusTree, data]);

  // Lưới 3 cột, ô VUÔNG. Tính theo bề rộng màn thay vì số cứng để máy nhỏ/tablet
  // đều chia đều, không bị tràn hàng.
  const { width: winW } = useWindowDimensions();
  const MODAL_PAD = 16, GRID_GAP = 10, COLS = 3;
  const tileOuter = Math.floor((winW - MODAL_PAD * 2 - GRID_GAP * (COLS - 1)) / COLS);
  const tileInner = tileOuter - 12; // trừ lề trong của ô

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={SPACE_COLORS.bg} />

      {/* CHỈ dựng canvas khi màn đang hiển thị.
          Stack navigator GIỮ NGUYÊN màn bên dưới khi mở màn mới, nên khi sang
          FruitPlace3D (cũng có <Canvas>) sẽ có HAI ngữ-cảnh expo-gl cùng sống và
          cùng vẽ mỗi khung hình — quay về là cảnh giật. Tháo canvas lúc mất tiêu
          điểm vừa cắt hẳn tình trạng đó, vừa bảo đảm lần quay lại luôn là một
          ngữ-cảnh GL SẠCH (đúng thứ mà "back ra rồi vào lại" đang làm thủ công).
          Tư-thế máy quay không mất: nó nằm ở `controller` ngoài canvas, khung đầu
          tiên sau khi dựng lại là CameraDriver ghi lại ngay. */}
      {isFocused ? (
      <GLErrorBoundary tag="space3d">
      <Canvas
        style={styles.canvas}
        camera={{ fov: CAMERA_FOV, near: 0.1, far: 2000, position: [0, 20, 40] }}
        gl={{ antialias: true }}
        onCreated={() => rLog.viewer3d.spaceGlCreated()}
      >
        <color attach="background" args={[SPACE_COLORS.bg]} />
        {/* Có bản đồ thì đẩy sương ra XA: sương vốn để tạo chiều sâu trên nền tối,
            nhưng nó cũng nhuộm đen ảnh vệ tinh ở rìa, làm bản đồ như bị cháy góc. */}
        <fog
          attach="fog"
          args={mapVisible
            ? [SPACE_COLORS.fog, farmRadius * 3.4, farmRadius * 14 + 240]
            : [SPACE_COLORS.fog, farmRadius * 1.6, farmRadius * 7 + 60]}
        />

        <hemisphereLight args={['#9fd8bb', '#0a1410', 0.75]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[18, 30, 12]} intensity={1.1} color="#dff5e6" />

        <SceneBridge ctxRef={ctxRef} />
        <CameraDriver controller={controller} />
        <Projector points={labelPoints} />

        {/* Ảnh bản đồ nằm DƯỚI thửa đất; thửa đất chuyển thành lớp nhuộm mờ. */}
        {mapVisible && (
          <MapGround
            ring={ring}
            origin={data.origin}
            sourceId={mapSourceId}
            onStatus={setMapStatus}
          />
        )}

        <FarmGround ring={ring} hasBoundary={hasBoundary} mapUnder={mapVisible} />

        {/* 2D: cây thu về chấm dẹt để không che ảnh bản đồ (và nhẹ hơn nhiều).
            3D: model thật. Không bọc Suspense — TreeModel tự trả null khi model
            chưa nạp xong / lỗi, nên mặt đất, ranh giới, chấm quả vẫn hiện. */}
        {viewMode === '2d' ? (
          <TreeMarkers trees={trees} highlightIds={[focusTreeId, placingTreeId]} />
        ) : (
          trees.map((t) => (
            <TreeModel
              key={t.id}
              position={[t.pos.x, 0, t.pos.z]}
              modelId={t.modelId}
              /* Cây điểm tải bản dựng 3D theo ĐÚNG mã cây này (mỗi cây một tệp). */
              treeId={t.id}
              rotationY={t.rotationY}
              highlighted={t.id === focusTreeId || t.id === placingTreeId}
            />
          ))
        )}

        {focusTree && (
          <FruitDots
            fruits={fruits.map((f) => ({
              fruitId: f.fruitId, name: f.name, status: f.status, coord: f.coord,
            }))}
            origin={[focusTree.pos.x, 0, focusTree.pos.z]}
            selectedId={selectedFruitId}
          />
        )}
      </Canvas>
      </GLErrorBoundary>
      ) : (
        <View style={styles.canvas} />
      )}

      {/* Lớp bắt cử chỉ — nằm trên canvas, dưới HUD */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />

      <SceneLabels />

      {/* ── HUD ───────────────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => (focusTree ? flyToFarm() : navigation.goBack())}
        >
          <Icon name={focusTree ? 'arrow-expand-all' : 'chevron-left'} size={22} color={SPACE_COLORS.text} />
        </TouchableOpacity>

        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.titleEyebrow}>
            {focusTree ? 'XEM CÂY' : 'TOÀN CẢNH VƯỜN'}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {focusTree ? focusTree.name : (data.farm?.name || 'Vườn')}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {focusTree
              ? `${fruits.length} quả${fruitsLoading ? ' · đang tải…' : ''}`
              : `${treeCountLabel}${hasBoundary ? '' : ' · chưa vẽ ranh giới'}`}
          </Text>
        </View>

        {focusTree ? (
          <>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setModelPickerOpen(true)}>
              <Icon name="shape-outline" size={20} color={SPACE_COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => { setPlacingTreeId(focusTree.id); flyToFarm(); }}
            >
              <Icon name="map-marker-plus" size={20} color={SPACE_COLORS.text} />
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.iconBtnGhost} />
        )}
      </View>

      {/* ── Bảng điều khiển cạnh phải: kiểu xem + lớp bản đồ ──────────────────
          Đặt ở giữa cạnh phải để không đụng thanh tiêu đề (trên), thẻ quả và
          dòng gợi ý (dưới), băng "đang đặt vị trí" (top: 108). */}
      <View style={styles.sideDock} pointerEvents="box-none">
        <View style={styles.modeSwitch}>
          {(['3d', '2d'] as ViewMode[]).map((m) => {
            const on = viewMode === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, on && styles.modeBtnOn]}
                onPress={() => changeViewMode(m)}
                activeOpacity={0.85}
              >
                <Text style={[styles.modeTxt, on && styles.modeTxtOn]}>{m.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.dockBtn, mapVisible && styles.dockBtnOn]}
          onPress={() => setMapOn((v) => !v)}
          activeOpacity={0.85}
        >
          <Icon
            name={mapOn ? 'layers' : 'layers-off'}
            size={19}
            color={mapVisible ? '#06120c' : SPACE_COLORS.text}
          />
        </TouchableOpacity>

        {/* Đổi nguồn ảnh nền — chỉ có nghĩa khi lớp bản đồ đang bật.
        {mapVisible && MAP_SOURCES.length > 1 && (
          <TouchableOpacity
            style={styles.dockBtn}
            onPress={() => {
              const i = MAP_SOURCES.findIndex((s) => s.id === mapSourceId);
              setMapSourceId(MAP_SOURCES[(i + 1) % MAP_SOURCES.length].id);
            }}
            activeOpacity={0.85}
          >
            <Icon
              name={mapSourceId === 'satellite' ? 'satellite-variant' : 'map-outline'}
              size={18}
              color={SPACE_COLORS.text}
            />
            <Text style={styles.dockBtnTxt} numberOfLines={1}>
              {getMapSource(mapSourceId).label}
            </Text>
          </TouchableOpacity>
        )} */}
      </View>

      {/* Hướng dẫn / trạng thái */}
      {placingTreeId ? (
        <View style={styles.placingBanner} pointerEvents="box-none">
          <Icon name="map-marker-radius" size={18} color="#0b1f14" />
          <Text style={styles.placingText}>
            Chạm vào mặt đất để đặt {trees.find((t) => t.id === placingTreeId)?.name ?? 'cây'}
          </Text>
          <TouchableOpacity onPress={() => setPlacingTreeId(null)} style={styles.placingCancel}>
            <Text style={styles.placingCancelTxt}>Huỷ</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {placeToast ? (
        <View style={styles.toast} pointerEvents="none">
          <Icon name="check-circle" size={16} color={SPACE_COLORS.accent} />
          <Text style={styles.toastTxt}>{placeToast}</Text>
        </View>
      ) : null}

      {/* Model cây hỏng → nói RÕ lý do ngay trên màn, kèm dấu hiệu đang dùng cây
          dự phòng. Không có khối này thì lỗi chỉ nằm trong console, người dùng
          chỉ thấy "cây trông lạ" mà không biết vì sao. */}
      {focusModelStatus?.message ? (
        <View style={styles.modelWarn} pointerEvents="none">
          <Icon
            name={focusModelStatus.state === 'failed' ? 'alert-circle' : 'information'}
            size={15}
            color={focusModelStatus.state === 'failed' ? '#fbbf24' : SPACE_COLORS.accent}
          />
          <Text style={styles.modelWarnTxt} numberOfLines={3}>
            {/* Ba câu khác nhau, vì ba chuyện khác nhau:
                  failed  — trục trặc, đáng thử lại
                  missing — cây CHƯA có bản dựng 3D: chuyện bình thường của cây mới,
                            gọi nó là "lỗi" thì người dùng đi tìm cách sửa một thứ
                            không hỏng
                  còn lại — câu của máy chủ về độ phủ ảnh, hiện nguyên văn */}
            {focusModelStatus.state === 'failed'
              ? `Đang dùng cây tự tạo — không nạp được "${getTreeModel(focusModelStatus.modelId).label}": ${focusModelStatus.message}`
              : focusModelStatus.state === 'missing'
              ? `Đang dùng cây tự tạo. ${focusModelStatus.message}`
              : focusModelStatus.message}
          </Text>
        </View>
      ) : null}

      {/* Lớp bản đồ trống thì phải nói RÕ vì sao — nếu không người dùng chỉ thấy
          nền tối và tưởng nút bản đồ bị hỏng. */}
      {mapNote ? (
        <View style={styles.mapNote} pointerEvents="none">
          <Icon name="map-marker-off" size={15} color="#fbbf24" />
          <Text style={styles.modelWarnTxt} numberOfLines={3}>{mapNote}</Text>
        </View>
      ) : null}

      {data.loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={SPACE_COLORS.accent} />
          <Text style={styles.loadingTxt}>Đang dựng không gian 3D…</Text>
        </View>
      )}

      {/* Thẻ thông tin quả đang chọn */}
      {selectedFruit && focusTree ? (
        <View style={[styles.fruitCard, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.fruitCardTop}>
            <View style={[styles.fruitSwatch, { backgroundColor: fruitColor(selectedFruit.status) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fruitName} numberOfLines={1}>{selectedFruit.name}</Text>
              <Text style={styles.fruitMeta}>
                {selectedFruit.nViews} pictures · {ZONE_LABEL[coordToZone(selectedFruit.coord)]}
                {`  ·  x ${selectedFruit.coord.x.toFixed(2)} / y ${selectedFruit.coord.y.toFixed(2)} / z ${selectedFruit.coord.z.toFixed(2)}`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedFruitId(null)} style={styles.fruitClose}>
              <Icon name="close" size={18} color={SPACE_COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.fruitActions}>
            <TouchableOpacity style={styles.fruitBtn} onPress={() => openFruitViews(selectedFruit)}>
              <Icon name="image-multiple" size={16} color={SPACE_COLORS.text} />
              <Text style={styles.fruitBtnTxt}>Pictures</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fruitBtn, styles.fruitBtnPrimary]}
              onPress={() => openFruitPlacer(selectedFruit)}
            >
              <Icon name="axis-arrow" size={16} color="#06120c" />
              <Text style={[styles.fruitBtnTxt, styles.fruitBtnTxtPrimary]}>Đặt lại vị trí</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : focusTree ? (
        <View style={[styles.hintBar, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <Text style={styles.hintTxt}>
            {fruitsError
              ? `⚠️ ${fruitsError}`
              : fruits.length === 0 && !fruitsLoading
                ? 'Cây này chưa có quả nào — thêm quả ở màn Chi tiết cây.'
                : `Chạm 1 chấm sáng để xem quả · ${gestureHint}`}
          </Text>
        </View>
      ) : (
        <View style={[styles.hintBar, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <Text style={styles.hintTxt}>
            {trees.length === 0
              ? 'Vườn chưa có cây nào.'
              : `Chạm 1 cây để ${viewMode === '2d' ? 'xem quả' : 'bay vào xem quả'} · ${gestureHint}`}
          </Text>
        </View>
      )}

      {/* Chọn model 3D cho cây đang mở. Danh sách đọc từ sổ `treeModels.ts` —
          thêm model mới ở đó là tự hiện ra đây, không phải sửa màn này. */}
      <Modal
        visible={modelPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModelPickerOpen(false)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                🌳 Model cho {focusTree?.name ?? 'cây'}
              </Text>
              <TouchableOpacity onPress={() => setModelPickerOpen(false)}>
                <Icon name="close" size={22} color={SPACE_COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modelGrid}
            >
              {TREE_MODELS.map((m) => {
                const active = focusTree?.modelId === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.modelTile, { width: tileOuter }, active && styles.modelTileOn]}
                    onPress={() => pickModel(m.id)}
                    activeOpacity={0.85}
                  >
                    <View style={{
                      width: "100%",
                      height: "100%",
                      position: "absolute",
                      zIndex: 1,
                      top: 0,
                      left: 0,
                    }}></View>
                    {/* Icon nút = chính model đó, dựng 3D và quay chậm. */}
                    <TreeModelPreview modelId={m.id} treeId={focusTree?.id} size={tileInner} />
                    <Text style={styles.modelLabel} numberOfLines={1}>{m.label}</Text>
                    {m.credit ? (
                      <Text style={styles.modelHint} numberOfLines={1}>{m.credit}</Text>
                    ) : null}
                    {active && (
                      <View style={styles.modelCheck}>
                        <Icon name="check" size={13} color="#06120c" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.modelFootnote}>
              Lựa chọn lưu tại máy theo từng cây (máy chủ chưa có chỗ chứa mục này).
            </Text>
          </View>
        </View>
      </Modal>

      {/* Ảnh các góc của quả */}
      <Modal
        visible={viewsModal != null}
        transparent
        animationType="slide"
        onRequestClose={() => setViewsModal(null)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                🍈 {viewsModal?.fruit.name}
              </Text>
              <TouchableOpacity onPress={() => setViewsModal(null)}>
                <Icon name="close" size={22} color={SPACE_COLORS.text} />
              </TouchableOpacity>
            </View>
            {viewsModal?.loading ? (
              <ActivityIndicator color={SPACE_COLORS.accent} style={{ marginVertical: 24 }} />
            ) : viewsModal?.error ? (
              <Text style={styles.modalMuted}>{viewsModal.error}</Text>
            ) : (viewsModal?.views.length ?? 0) === 0 ? (
              <Text style={styles.modalMuted}>Chưa có ảnh góc nào cho quả này.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalStrip}>
                {viewsModal?.views.map((v, i) => (
                  v.url ? (
                    // Nền ô trùng nền màn tối (#12211b) → ảnh hỏng thành ô ĐEN TÀNG
                    // HÌNH, người dùng không nhận ra là đáng lẽ có ảnh. Tệ hơn ô trắng.
                    <RemoteImage
                      key={`${v.url}-${i}`}
                      uri={/^https?:\/\//i.test(v.url) ? v.url : `${ORILIFE_BASE}${v.url}`}
                      style={styles.modalThumb}
                      containerStyle={[styles.modalThumb, styles.modalThumbPh]}
                      resizeMode="cover"
                      placeholder={<Icon name="image" size={26} color="#6f8f7e" />}
                    />
                  ) : null
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_COLORS.bg },
  canvas: { flex: 1 },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SPACE_COLORS.hudBg,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
  },
  iconBtnGhost: { width: 42, height: 42 },
  titleWrap: { flex: 1 },
  titleEyebrow: {
    fontSize: 9, fontWeight: '800', letterSpacing: 2.4,
    color: SPACE_COLORS.accent,
  },
  title: { fontSize: 19, fontWeight: '800', color: SPACE_COLORS.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: SPACE_COLORS.textMuted, marginTop: 1 },

  // Bảng điều khiển cạnh phải (kiểu xem + lớp bản đồ)
  sideDock: {
    position: 'absolute', right: 12, top: '38%',
    alignItems: 'flex-end', gap: 10,
  },
  modeSwitch: {
    backgroundColor: SPACE_COLORS.hudBg,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
    borderRadius: 14, padding: 3, gap: 3,
  },
  modeBtn: {
    width: 38, height: 32, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  modeBtnOn: { backgroundColor: SPACE_COLORS.accent },
  modeTxt: { color: SPACE_COLORS.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  modeTxtOn: { color: '#06120c' },
  dockBtn: {
    minWidth: 44, height: 38, borderRadius: 13, paddingHorizontal: 9,
    alignItems: 'center', justifyContent: 'center', gap: 1,
    backgroundColor: SPACE_COLORS.hudBg,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
  },
  dockBtnOn: { backgroundColor: SPACE_COLORS.accent, borderColor: SPACE_COLORS.accent },
  dockBtnTxt: { color: SPACE_COLORS.textMuted, fontSize: 8, fontWeight: '700' },

  treeLabel: {
    position: 'absolute', width: 140, textAlign: 'center',
    fontSize: 12, fontWeight: '700', color: SPACE_COLORS.text,
    textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  fruitLabel: {
    position: 'absolute', width: 140, textAlign: 'center',
    fontSize: 10, fontWeight: '600', color: '#d9ffe9',
    textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  placingBanner: {
    position: 'absolute', left: 14, right: 14, top: 108,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: SPACE_COLORS.accent, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  placingText: { flex: 1, color: '#06150d', fontSize: 13, fontWeight: '700' },
  placingCancel: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.18)' },
  placingCancelTxt: { color: '#06150d', fontSize: 12, fontWeight: '800' },

  toast: {
    position: 'absolute', left: 20, right: 20, top: 112,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: SPACE_COLORS.hudBg, borderRadius: 12,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  toastTxt: { color: SPACE_COLORS.text, fontSize: 13, fontWeight: '600' },

  modelWarn: {
    position: 'absolute', left: 14, right: 14, bottom: 92,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: SPACE_COLORS.hudBg, borderRadius: 12,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  modelWarnTxt: { flex: 1, color: SPACE_COLORS.textMuted, fontSize: 11, lineHeight: 15 },

  // Nằm TRÊN modelWarn để hai câu nhắc không đè lên nhau khi cùng xuất hiện.
  mapNote: {
    position: 'absolute', left: 14, right: 70, bottom: 136,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: SPACE_COLORS.hudBg, borderRadius: 12,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
    paddingHorizontal: 12, paddingVertical: 9,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: 'rgba(5,9,12,0.72)',
  },
  loadingTxt: { color: SPACE_COLORS.textMuted, fontSize: 13 },

  hintBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 18, paddingTop: 10, alignItems: 'center',
  },
  hintTxt: {
    color: SPACE_COLORS.textMuted, fontSize: 12, textAlign: 'center',
    backgroundColor: SPACE_COLORS.hudBg, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden',
  },

  fruitCard: {
    position: 'absolute', left: 12, right: 12, bottom: 0,
    backgroundColor: SPACE_COLORS.hudBg,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
    paddingHorizontal: 14, paddingTop: 14, gap: 12,
  },
  fruitCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fruitSwatch: { width: 12, height: 12, borderRadius: 6 },
  fruitName: { color: SPACE_COLORS.text, fontSize: 16, fontWeight: '800' },
  fruitMeta: { color: SPACE_COLORS.textMuted, fontSize: 11, marginTop: 2 },
  fruitClose: { padding: 6 },
  fruitActions: { flexDirection: 'row', gap: 10 },
  fruitBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
  },
  fruitBtnPrimary: { backgroundColor: SPACE_COLORS.accent, borderColor: SPACE_COLORS.accent },
  fruitBtnTxt: { color: SPACE_COLORS.text, fontSize: 13, fontWeight: '700' },
  fruitBtnTxtPrimary: { color: '#06120c' },

  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#0a1512', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, gap: 12, borderTopWidth: 1, borderColor: SPACE_COLORS.hudBorder,
    // Chặn chiều cao: 11 model × ô vuông sẽ vượt màn nếu để tự do.
    maxHeight: '82%',
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { flex: 1, color: SPACE_COLORS.text, fontSize: 16, fontWeight: '800' },
  modalMuted: { color: SPACE_COLORS.textMuted, fontSize: 13, paddingVertical: 18, textAlign: 'center' },
  modalStrip: { gap: 10, paddingBottom: 18 },
  modalThumb: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#12211b' },
  // Nền ô ảnh trùng nền màn tối → ảnh hỏng thành ô đen tàng hình. Nền sáng hơn +
  // viền nét đứt để người dùng thấy "chỗ này đáng lẽ có ảnh", không phải khoảng trống.
  modalThumbPh: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c3129',
    borderWidth: 1,
    borderColor: '#31554699',
    borderStyle: 'dashed',
  },

  modelGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 4,
  },
  modelTile: {
    // Ô VUÔNG bo góc 8px theo yêu cầu.
    borderRadius: 8,
    borderWidth: 1.5, borderColor: SPACE_COLORS.hudBorder,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 6, gap: 4, alignItems: 'center',
  },
  modelTileOn: { borderColor: SPACE_COLORS.accent, backgroundColor: 'rgba(61,220,132,0.12)' },
  modelLabel: {
    color: SPACE_COLORS.text, fontSize: 12, fontWeight: '700',
    textAlign: 'center', alignSelf: 'stretch',
  },
  modelHint: {
    color: SPACE_COLORS.textMuted, fontSize: 10,
    textAlign: 'center', alignSelf: 'stretch',
  },
  modelCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SPACE_COLORS.accent,
  },
  modelFootnote: {
    color: SPACE_COLORS.textMuted, fontSize: 11, lineHeight: 15,
    paddingBottom: 16, paddingTop: 6,
  },
});

export default Space3DScreen;
