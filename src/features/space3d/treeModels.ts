/**
 * space3d/treeModels — SỔ ĐĂNG KÝ MODEL CÂY.
 *
 * ► THÊM MODEL MỚI: chép tệp .glb vào `assets/models/`, rồi thêm ĐÚNG MỘT mục vào
 *   mảng `TREE_MODELS` bên dưới. Không phải sửa gì thêm ở màn hình, kho lưu hay
 *   phần nạp — mọi nơi đều đọc từ sổ này.
 *
 *   { id: 'tree2', label: 'Cây 2', source: require('../../../assets/models/tree2.glb') }
 *
 *   Lưu ý:
 *     · `id` phải DUY NHẤT và ỔN ĐỊNH — nó được lưu xuống máy theo từng cây;
 *       đổi id = mọi cây đang chọn model đó rơi về mặc định.
 *     · `source` phải là `require(...)` viết THẲNG (Metro cần thấy hằng chuỗi lúc
 *       đóng gói, không nhận biến).
 *     · `source: null` = cây dựng bằng hình học sẵn có, không cần tệp.
 *
 * Model nạp qua treeAsset.ts (tự đọc tệp + GLTFLoader.parse). Xem lý do không dùng
 * `useLoader` trong chú thích đầu tệp đó.
 */

export type TreeModelId = string;

/**
 * Cây đó lấy hình từ đâu:
 *   'points'     — ĐÁM MÂY ĐIỂM của chính cây đó, tải từ OriLife (xem `treePoints.ts`)
 *   'file'       — tệp .glb đóng gói trong app
 *   'procedural' — dựng bằng hình học sẵn có, không cần tệp và không cần mạng
 */
export type TreeModelKind = 'points' | 'file' | 'procedural';

export interface TreeModelDef {
  id: TreeModelId;
  /** Tên hiển thị trong bộ chọn. */
  label: string;
  /** Kết quả `require()` của tệp .glb; null = không có tệp đóng gói. */
  source: number | null;
  /** Bỏ trống → suy từ `source` (có tệp = 'file', không = 'procedural'). */
  kind?: TreeModelKind;
  /**
   * Nhân với TREE_HEIGHT ra chiều cao thật. Mặc định 1 (cây thân gỗ).
   * Chậu cảnh / cây bụi nên nhỏ hơn — nếu không mọi thứ đều cao bằng cây cổ thụ.
   */
  heightScale?: number;
  /** Ghi công tác giả model (hiện trong bộ chọn). */
  credit?: string;
}

/**
 * Cây ĐIỂM: dựng từ chính ảnh người dùng chụp cây đó, lấy về từ OriLife.
 * Đây là hình thật của cây, không phải một hình mẫu dùng chung.
 */
export const POINTS_TREE_MODEL_ID: TreeModelId = 'orilife_points';

/** Cây dựng bằng hình học — luôn hiện được, kể cả khi mất mạng. */
export const PROCEDURAL_TREE_MODEL_ID: TreeModelId = 'procedural';

/**
 * Model mặc định khi cây chưa được chọn gì.
 *
 * Trước đây là cây tự tạo — một hình nón giống hệt nhau cho mọi cây trong vườn.
 * Nó luôn hiện được, nhưng nó không nói gì về cây đang đứng đó. Nay mặc định là
 * ĐÁM MÂY ĐIỂM của chính cây ấy, cùng nguồn với ô 3D ở màn truy-xuất quả, nên
 * cây trong sơ-đồ vườn và cây trong hồ-sơ xuất-xứ là MỘT.
 *
 * Cây chưa dựng 3D (chưa chụp đủ ảnh) vẫn rơi về hình nón — xem `TreeModel.tsx`.
 * Đổi mặc định KHÔNG đụng tới cây người dùng đã tự chọn model: lựa chọn đó nằm
 * trong `treeModelStore`, và chỉ cây chưa có bản ghi mới đọc hằng này.
 */
export const DEFAULT_TREE_MODEL_ID: TreeModelId = POINTS_TREE_MODEL_ID;

/* eslint-disable @typescript-eslint/no-var-requires */
export const TREE_MODELS: TreeModelDef[] = [
  {
    id: POINTS_TREE_MODEL_ID,
    label: 'Cây thật',
    source: null,
    kind: 'points',
    credit: 'Dựng từ ảnh bạn đã chụp',
  },
  {
    id: PROCEDURAL_TREE_MODEL_ID,
    label: 'Cây tự tạo',
    source: null,
    kind: 'procedural',
    credit: 'Dựng sẵn trong app',
  },
  {
    id: 'tree1',
    label: 'Cây mẫu',
    source: require('../../../assets/models/tree1.glb'),
  },
  {
    id: 'tree_broadleaf',
    label: 'Cây tán rộng',
    source: require('../../../assets/models/tree_broadleaf.glb'),
    credit: 'Marc Solà',
  },
  {
    id: 'tree_zsky_a',
    label: 'Cây thân gỗ',
    source: require('../../../assets/models/tree_zsky_a.glb'),
    credit: 'Zsky',
  },
  {
    id: 'tree_zsky_b',
    label: 'Cây cổ thụ',
    source: require('../../../assets/models/tree_zsky_b.glb'),
    credit: 'Zsky',
  },
  {
    id: 'palm_tree',
    label: 'Cây cọ',
    source: require('../../../assets/models/palm_tree.glb'),
    credit: 'Quaternius',
  },
  {
    id: 'fiddle_leaf_plant',
    label: 'Bàng Singapore',
    source: require('../../../assets/models/fiddle_leaf_plant.glb'),
    heightScale: 0.75,
    credit: 'Poly by Google',
  },
  {
    id: 'yucca_plant',
    label: 'Yucca',
    source: require('../../../assets/models/yucca_plant.glb'),
    heightScale: 0.6,
    credit: 'Isa Lousberg',
  },
  {
    id: 'bush',
    label: 'Bụi cây',
    source: require('../../../assets/models/bush.glb'),
    heightScale: 0.32,
    credit: 'Quaternius',
  },
  {
    id: 'houseplant_bushy',
    label: 'Chậu cây tán xoè',
    source: require('../../../assets/models/houseplant_bushy.glb'),
    heightScale: 0.3,
    credit: 'Quaternius',
  },
  {
    id: 'houseplant_slim',
    label: 'Chậu cây thân cao',
    source: require('../../../assets/models/houseplant_slim.glb'),
    heightScale: 0.3,
    credit: 'Quaternius',
  },
];
/* eslint-enable @typescript-eslint/no-var-requires */

/** Tra model theo id. Id lạ / rỗng → rơi về mặc định (không bao giờ trả undefined). */
export function getTreeModel(id?: TreeModelId | null): TreeModelDef {
  const found = id ? TREE_MODELS.find((m) => m.id === id) : undefined;
  return found ?? TREE_MODELS.find((m) => m.id === DEFAULT_TREE_MODEL_ID)!;
}

/** Lấy loại của một model; bản ghi cũ không khai `kind` thì suy từ `source`. */
export function treeModelKind(def: TreeModelDef): TreeModelKind {
  return def.kind ?? (def.source != null ? 'file' : 'procedural');
}

/** Model này có cần nạp tệp .glb đóng gói không. */
export function isFileBacked(def: TreeModelDef): boolean {
  return def.source != null;
}

/** Model này lấy hình từ đám mây điểm của chính cây đó (cần mạng + tree_id). */
export function isPointCloud(def: TreeModelDef): boolean {
  return treeModelKind(def) === 'points';
}
