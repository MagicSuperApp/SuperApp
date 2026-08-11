/**
 * space3d/treeModelStore — LƯU model 3D người dùng chọn cho từng cây.
 *
 * Server field-reid không có chỗ chứa lựa chọn này (chỉ có loài/GPS/quả), nên lưu
 * tại máy — cùng cơ chế AsyncStorage như `positionStore` (vị-trí cây đặt tay,
 * toạ-độ 3D của quả).
 *
 * Mọi hàm NUỐT lỗi: đây là tuỳ chọn hiển thị, đọc hỏng thì rơi về model mặc định,
 * tuyệt đối không được làm sập màn 3D.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_TREE_MODEL_ID, getTreeModel, type TreeModelId } from './treeModels';

const PREFIX = '@aladin/space3d/tree_model/';

export const treeModelKey = (treeId: string) => `${PREFIX}${treeId}`;

/** Model của 1 cây. Chưa chọn / id lạ (model đã bị gỡ khỏi sổ) → mặc định. */
export async function loadTreeModelId(treeId: string): Promise<TreeModelId> {
  try {
    const raw = await AsyncStorage.getItem(treeModelKey(treeId));
    if (raw) return getTreeModel(raw).id;
  } catch { /* hỏng → mặc định */ }
  return DEFAULT_TREE_MODEL_ID;
}

export async function saveTreeModelId(treeId: string, modelId: TreeModelId): Promise<void> {
  try {
    await AsyncStorage.setItem(treeModelKey(treeId), getTreeModel(modelId).id);
  } catch { /* hết chỗ / lỗi ghi → bỏ qua */ }
}

/**
 * Đọc HÀNG LOẠT (1 lần multiGet) — màn toàn cảnh có thể hàng trăm cây.
 * Chỉ trả về cây ĐÃ chọn; cây thiếu trong map = dùng mặc định.
 */
export async function loadTreeModelIds(treeIds: string[]): Promise<Record<string, TreeModelId>> {
  const out: Record<string, TreeModelId> = {};
  if (treeIds.length === 0) return out;
  try {
    const pairs = await AsyncStorage.multiGet(treeIds.map(treeModelKey));
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      out[key.slice(PREFIX.length)] = getTreeModel(raw).id;
    }
  } catch { /* ignore */ }
  return out;
}
