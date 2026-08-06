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

export interface TreeModelDef {
  id: TreeModelId;
  /** Tên hiển thị trong bộ chọn. */
  label: string;
  /** Kết quả `require()` của tệp .glb; null = cây dựng bằng hình học. */
  source: number | null;
  /**
   * Nhân với TREE_HEIGHT ra chiều cao thật. Mặc định 1 (cây thân gỗ).
   * Chậu cảnh / cây bụi nên nhỏ hơn — nếu không mọi thứ đều cao bằng cây cổ thụ.
   */
  heightScale?: number;
  /** Ghi công tác giả model (hiện trong bộ chọn). */
  credit?: string;
}

/** Model mặc định khi cây chưa được chọn gì — cây tự tạo, luôn có sẵn, không cần tệp. */
export const DEFAULT_TREE_MODEL_ID: TreeModelId = 'procedural';

/* eslint-disable @typescript-eslint/no-var-requires */
export const TREE_MODELS: TreeModelDef[] = [
  {
    id: DEFAULT_TREE_MODEL_ID,
    label: 'Cây tự tạo',
    source: null,
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

/** Model này có cần nạp tệp không (false = cây dựng bằng hình học). */
export function isFileBacked(def: TreeModelDef): boolean {
  return def.source != null;
}
