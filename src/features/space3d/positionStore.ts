/**
 * space3d/positionStore — LƯU vị-trí 3D mà server field-reid chưa có chỗ chứa.
 *
 * Vì sao cần:
 *   · Cây: server chỉ có GPS. Cây chưa bật GPS / người dùng muốn ĐẶT TAY trong sơ
 *     đồ thì không có endpoint nào nhận. → lưu (x,z) mét trong hệ vườn tại máy.
 *   · Quả: server chỉ lưu `zone` + `pos_x` + `pos_h` (2 chiều). Trục z (trước/sau)
 *     không có chỗ. → lưu đủ (x,y,z) tại máy; x,y vẫn ĐƯỢC ĐẨY LÊN server qua
 *     pos_x/pos_h nên sơ-đồ 2D cũ và máy khác vẫn thấy đúng, chỉ mất chiều sâu.
 *
 * Cùng cơ chế AsyncStorage như `treeMetadataKey` / `treeImageStore` sẵn có.
 * Mọi hàm đều NUỐT lỗi (đọc hỏng → coi như chưa đặt) — vị-trí là dữ-liệu phụ,
 * không được phép làm sập màn 3D.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Vec2 } from './geo';
import { clampCoord, type FruitCoord } from './treeFrame';

const TREE_POS_PREFIX = '@aladin/space3d/tree_pos/';
const FRUIT_POS_PREFIX = '@aladin/space3d/fruit_pos/';

export const treePosKey = (treeId: string) => `${TREE_POS_PREFIX}${treeId}`;
export const fruitPosKey = (fruitId: string) => `${FRUIT_POS_PREFIX}${fruitId}`;

// ── Cây ──────────────────────────────────────────────────────────────────────

/** Vị-trí cây do người dùng đặt tay (mét, hệ vườn). null = chưa đặt. */
export async function loadTreePosition(treeId: string): Promise<Vec2 | null> {
  try {
    const raw = await AsyncStorage.getItem(treePosKey(treeId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (Number.isFinite(v?.x) && Number.isFinite(v?.z)) return { x: v.x, z: v.z };
  } catch { /* hỏng → coi như chưa đặt */ }
  return null;
}

export async function saveTreePosition(treeId: string, pos: Vec2): Promise<void> {
  try {
    await AsyncStorage.setItem(treePosKey(treeId), JSON.stringify({ x: pos.x, z: pos.z }));
  } catch { /* hết chỗ / lỗi ghi → bỏ qua, lần sau đặt lại */ }
}

export async function clearTreePosition(treeId: string): Promise<void> {
  try { await AsyncStorage.removeItem(treePosKey(treeId)); } catch { /* ignore */ }
}

/** Đọc HÀNG LOẠT (1 lần multiGet) — màn toàn cảnh có thể có hàng trăm cây. */
export async function loadTreePositions(treeIds: string[]): Promise<Record<string, Vec2>> {
  const out: Record<string, Vec2> = {};
  if (treeIds.length === 0) return out;
  try {
    const pairs = await AsyncStorage.multiGet(treeIds.map(treePosKey));
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      try {
        const v = JSON.parse(raw);
        if (Number.isFinite(v?.x) && Number.isFinite(v?.z)) {
          out[key.slice(TREE_POS_PREFIX.length)] = { x: v.x, z: v.z };
        }
      } catch { /* bỏ qua bản ghi hỏng */ }
    }
  } catch { /* ignore */ }
  return out;
}

// ── Quả ──────────────────────────────────────────────────────────────────────

export async function loadFruitCoord(fruitId: string): Promise<FruitCoord | null> {
  try {
    const raw = await AsyncStorage.getItem(fruitPosKey(fruitId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (Number.isFinite(v?.x) && Number.isFinite(v?.y) && Number.isFinite(v?.z)) {
      return clampCoord(v as FruitCoord);
    }
  } catch { /* ignore */ }
  return null;
}

export async function saveFruitCoord(fruitId: string, coord: FruitCoord): Promise<void> {
  try {
    await AsyncStorage.setItem(fruitPosKey(fruitId), JSON.stringify(clampCoord(coord)));
  } catch { /* ignore */ }
}

export async function loadFruitCoords(fruitIds: string[]): Promise<Record<string, FruitCoord>> {
  const out: Record<string, FruitCoord> = {};
  if (fruitIds.length === 0) return out;
  try {
    const pairs = await AsyncStorage.multiGet(fruitIds.map(fruitPosKey));
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      try {
        const v = JSON.parse(raw);
        if (Number.isFinite(v?.x) && Number.isFinite(v?.y) && Number.isFinite(v?.z)) {
          out[key.slice(FRUIT_POS_PREFIX.length)] = clampCoord(v as FruitCoord);
        }
      } catch { /* bỏ qua bản ghi hỏng */ }
    }
  } catch { /* ignore */ }
  return out;
}
