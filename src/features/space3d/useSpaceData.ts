/**
 * space3d/useSpaceData — gom dữ-liệu cho KHÔNG-GIAN 3D.
 *
 * Nguồn:
 *   · Ranh giới vườn   ← redux `farm.farms[].coordinates` (điểm nối người dùng vẽ).
 *   · Cây              ← redux `farm.trees` (đã đồng bộ từ field-reid), lấy GPS.
 *   · Quả của 1 cây    ← `GET /api/tree/{id}/layout` (cùng nguồn màn Chi tiết cây).
 *   · Vị-trí đặt tay   ← positionStore (AsyncStorage).
 *
 * Quy tắc chọn vị-trí cây (ưu tiên giảm dần):
 *   1. Người dùng ĐẶT TAY trong sơ đồ 3D.
 *   2. GPS thật của cây, chiếu ra mét quanh tâm vườn.
 *   3. Ngẫu-nhiên ỔN-ĐỊNH trong ranh giới vườn (seed = tree_id) — mặc định.
 * Cây có GPS nhưng rơi NGOÀI ranh giới vẫn giữ nguyên chỗ thật (không kéo vào),
 * vì sai lệch đó là thông tin cho người dùng biết ranh giới hoặc GPS đang lệch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Farm, Tree } from '../../modules/trace/types';
import { ORILIFE_BASE } from '../../services/orilifeBase';
import { getTreeLayout, type TreeLayoutFruit } from '../../services/fruitReIDService';
import { formatTreeName } from '../../utils/treeNameFormatter';
import {
  buildFarmRing, hashSeed, latLngToMeters, makeRng, seededPointInRing,
  type LatLng, type Vec2,
} from './geo';
import { coordFromServer, hasServerZ, type FruitCoord } from './treeFrame';
import { loadFruitCoords, loadTreePositions } from './positionStore';
import { loadTreeModelIds, saveTreeModelId } from './treeModelStore';
import { DEFAULT_TREE_MODEL_ID, type TreeModelId } from './treeModels';

export interface SceneTree {
  id: string;
  name: string;
  /** Vị-trí gốc cây trong hệ vườn (mét). */
  pos: Vec2;
  /** Nguồn vị-trí — hiển thị cho người dùng biết cây đang đứng "thật" hay tạm. */
  posSource: 'manual' | 'gps' | 'auto';
  /** Xoay quanh trục đứng cho đỡ giống hệt nhau (ổn-định theo id). */
  rotationY: number;
  fruitCount: number;
  /** Model 3D người dùng chọn cho cây này (mặc định: cây tự tạo). */
  modelId: TreeModelId;
}

export interface SceneFruit {
  fruitId: string;
  name: string;
  status?: string | null;
  nViews: number;
  coord: FruitCoord;
  /**
   * Độ sâu (coord.z) là số ĐÃ ĐẶT hay chỉ là mặc-định "chưa đặt".
   * false → quả đang nằm ở mặt phẳng giữa vì chưa ai đặt sâu cho nó, KHÔNG phải
   * vì nó thật sự ở đó. Giao diện nên nói ra điều này thay vì vẽ như đã biết.
   */
  zPlaced: boolean;
  raw: TreeLayoutFruit;
}

export interface SpaceData {
  farm: Farm | null;
  ring: Vec2[];
  hasBoundary: boolean;
  origin: LatLng | null;
  trees: SceneTree[];
  /** Quả của cây đang mở (chỉ nạp ở chế độ xem 1 cây). */
  fruits: SceneFruit[];
  fruitsLoading: boolean;
  fruitsError: string | null;
  loading: boolean;
  /** Nạp lại quả (sau khi đặt lại toạ-độ / thêm quả). */
  reloadFruits: () => void;
  /** Ghi đè vị-trí 1 cây ngay tại chỗ sau khi người dùng đặt tay. */
  setTreePosLocal: (treeId: string, pos: Vec2) => void;
  /** Đổi model của 1 cây: hiện ngay trên cảnh + ghi xuống máy. */
  setTreeModel: (treeId: string, modelId: TreeModelId) => void;
}

export function useSpaceData(farmIdParam?: string, focusTreeId?: string): SpaceData {
  const farms = useSelector((s: RootState) => s.farm.farms);
  const allTrees = useSelector((s: RootState) => s.farm.trees);

  // farmId có thể không được truyền (mở thẳng từ chi tiết cây) → suy từ cây.
  //
  // BÁM DÍNH khi đã biết: mở màn từ Chi tiết cây / Danh sách quả thì route KHÔNG
  // có farmId, vườn chỉ suy ra được qua cây đang mở. Bỏ chọn cây (bấm "xem toàn
  // cảnh", quay về từ màn đặt vị trí…) mà để farmId rơi về undefined thì:
  //   · `farm` = null → mất RANH GIỚI → mặt đất tụt về ô vuông mặc định,
  //   · `origin` = null → LỚP BẢN ĐỒ biến mất,
  //   · `farmTrees` hoá thành TẤT CẢ cây của mọi vườn.
  // Triệu chứng thấy được: ra toàn cảnh thì không có bản đồ, chạm một cây thì bản
  // đồ hiện lại. Vườn không tự đổi giữa chừng, nên nhớ lại là đúng.
  const lastFarmId = useRef<string | undefined>(undefined);
  const farmId = useMemo(() => {
    if (farmIdParam) { lastFarmId.current = farmIdParam; return farmIdParam; }
    const t = allTrees.find((x: Tree) => x.id === focusTreeId);
    if (t?.farmId) { lastFarmId.current = t.farmId; return t.farmId; }
    return lastFarmId.current;
  }, [farmIdParam, allTrees, focusTreeId]);

  const farm = useMemo(
    () => farms.find((f: Farm) => f.id === farmId) ?? null,
    [farms, farmId],
  );

  const farmTrees = useMemo(
    () => (farmId ? allTrees.filter((t: Tree) => t.farmId === farmId) : allTrees),
    [allTrees, farmId],
  );

  const { ring, origin, hasBoundary } = useMemo(
    () => buildFarmRing(farm?.coordinates, farmTrees.length),
    [farm?.coordinates, farmTrees.length],
  );

  const [manualPos, setManualPos] = useState<Record<string, Vec2>>({});
  const [posLoaded, setPosLoaded] = useState(false);

  // Khoá theo DANH SÁCH id chứ không theo mảng object: store cập nhật (đổi tên,
  // đếm quả…) sinh mảng mới mỗi lần, nhưng không cần đọc lại AsyncStorage.
  const treeIdsKey = useMemo(() => farmTrees.map((t: Tree) => t.id).join(','), [farmTrees]);

  const [modelIds, setModelIds] = useState<Record<string, TreeModelId>>({});

  useEffect(() => {
    let alive = true;
    const ids = treeIdsKey ? treeIdsKey.split(',') : [];
    Promise.all([loadTreePositions(ids), loadTreeModelIds(ids)]).then(([pos, models]) => {
      if (!alive) return;
      setManualPos(pos);
      setModelIds(models);
      setPosLoaded(true);
    });
    return () => { alive = false; };
  }, [treeIdsKey]);

  const setTreePosLocal = useCallback((treeId: string, pos: Vec2) => {
    setManualPos((m) => ({ ...m, [treeId]: pos }));
  }, []);

  // Cập nhật cảnh NGAY rồi mới ghi xuống máy — đổi model phải thấy liền, việc ghi
  // là chuyện nền (hỏng thì lần mở sau về mặc định, không đáng chặn giao diện).
  const setTreeModel = useCallback((treeId: string, modelId: TreeModelId) => {
    setModelIds((m) => ({ ...m, [treeId]: modelId }));
    saveTreeModelId(treeId, modelId);
  }, []);

  const trees: SceneTree[] = useMemo(() => {
    return farmTrees.map((t: Tree) => {
      const manual = manualPos[t.id];
      let pos: Vec2;
      let posSource: SceneTree['posSource'];
      if (manual) {
        pos = manual;
        posSource = 'manual';
      } else {
        const lat = t.latitude ?? t.location?.lat;
        const lng = t.longitude ?? t.location?.lng;
        if (origin && Number.isFinite(lat) && Number.isFinite(lng)) {
          pos = latLngToMeters({ lat: lat as number, lng: lng as number }, origin);
          posSource = 'gps';
        } else {
          pos = seededPointInRing(t.id, ring);
          posSource = 'auto';
        }
      }
      return {
        id: t.id,
        name: formatTreeName(t, farm ?? undefined),
        pos,
        posSource,
        rotationY: makeRng(hashSeed(`rot:${t.id}`))() * Math.PI * 2,
        fruitCount: t.fruitCount ?? 0,
        modelId: modelIds[t.id] ?? DEFAULT_TREE_MODEL_ID,
      };
    });
  }, [farmTrees, manualPos, origin, ring, farm, modelIds]);

  // ── Quả của cây đang mở ────────────────────────────────────────────────────
  const [fruits, setFruits] = useState<SceneFruit[]>([]);
  const [fruitsLoading, setFruitsLoading] = useState(false);
  const [fruitsError, setFruitsError] = useState<string | null>(null);
  const [fruitNonce, setFruitNonce] = useState(0);

  const reloadFruits = useCallback(() => setFruitNonce((n) => n + 1), []);

  useEffect(() => {
    if (!focusTreeId) {
      setFruits([]);
      setFruitsError(null);
      return;
    }
    let alive = true;
    setFruitsLoading(true);
    (async () => {
      const r = await getTreeLayout(ORILIFE_BASE, focusTreeId);
      if (!alive) return;
      if (r.ok && r.data) {
        const list = r.data.fruits ?? [];
        // Toạ-độ đặt tay đè lên toạ-độ từ server. Còn cần đè vì FruitPlace3D chỉnh
        // vị-trí quả ĐÃ CÓ vẫn không đẩy lên được (máy chủ không có endpoint sửa
        // toạ-độ rời — xem ghi chú ở FruitPlace3DScreen), nên bản cục bộ là chỗ duy
        // nhất giữ chỉnh-sửa đó. Máy khác sẽ thấy giá trị của máy chủ.
        const overrides = await loadFruitCoords(list.map((f) => f.fruit_id));
        if (!alive) return;
        setFruits(list.map((f) => ({
          fruitId: f.fruit_id,
          name: f.name || '(chưa đặt tên)',
          status: f.status,
          nViews: f.n_views ?? 0,
          coord: overrides[f.fruit_id] ?? coordFromServer(f),
          // Đặt tay trên máy này cũng là ĐÃ ĐẶT — chỉ là mới đặt ở một chỗ.
          zPlaced: overrides[f.fruit_id] != null || hasServerZ(f),
          raw: f,
        })));
        setFruitsError(null);
      } else {
        setFruitsError(r.error?.detail ?? 'Không tải được quả của cây.');
      }
      setFruitsLoading(false);
    })();
    return () => { alive = false; };
  }, [focusTreeId, fruitNonce]);

  return {
    farm,
    ring,
    hasBoundary,
    origin,
    trees,
    fruits,
    fruitsLoading,
    fruitsError,
    loading: !posLoaded,
    reloadFruits,
    setTreePosLocal,
    setTreeModel,
  };
}
