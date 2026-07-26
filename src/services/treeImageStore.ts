/**
 * treeImageStore — lưu ĐƯỜNG DẪN ảnh cây (local) theo tree_id.
 *
 * Vì server /api/trees KHÔNG trả URL ảnh (mapTreeInfoToUI luôn images:[]), ảnh đã
 * enroll không có đường lấy về để hiển thị. Ở đây ta giữ lại đường dẫn file ảnh
 * (do native camera đã ghi ra đĩa) ngay lúc enroll/gộp, keyed theo tree_id, để màn
 * chi tiết cây hiển thị lại được — và TÍCH LUỸ thêm qua mỗi lần chụp (không ghi đè).
 *
 * Lưu ý: chỉ lưu đường dẫn, không copy byte. File native thường sống trong thư mục
 * app; nếu bị dọn cache thì <Image> sẽ tự bỏ qua (đã lọc khi hiển thị là tuỳ UI).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'tree_images:';
const MAX_PER_TREE = 60; // trần an-toàn, tránh phình vô hạn khi chụp nhiều lần

function keyFor(treeId: string): string {
  return `${KEY_PREFIX}${treeId}`;
}

/** Chuẩn-hoá về dạng có scheme để <Image source={{uri}}> đọc được. */
function normalizeUri(uri: string): string {
  if (!uri) return uri;
  if (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('http')) {
    return uri;
  }
  return `file://${uri}`;
}

/** Đọc danh sách ảnh đã lưu của cây (mảng URI). Không có → []. */
export async function loadTreeImages(treeId: string): Promise<string[]> {
  if (!treeId) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(treeId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Tích luỹ thêm ảnh cho cây (gộp + khử trùng, giữ tối đa MAX_PER_TREE ảnh MỚI nhất).
 * Trả về danh sách sau khi gộp.
 */
export async function appendTreeImages(treeId: string, uris: string[]): Promise<string[]> {
  if (!treeId || !uris?.length) return loadTreeImages(treeId);
  const incoming = uris.map(normalizeUri).filter(Boolean);
  try {
    const existing = await loadTreeImages(treeId);
    // Ảnh mới đứng trước để "gần đây nhất" hiện đầu; khử trùng theo URI.
    const merged = Array.from(new Set([...incoming, ...existing])).slice(0, MAX_PER_TREE);
    await AsyncStorage.setItem(keyFor(treeId), JSON.stringify(merged));
    return merged;
  } catch {
    return loadTreeImages(treeId);
  }
}

/** Xoá ảnh đã lưu của cây (khi xoá cây). */
export async function clearTreeImages(treeId: string): Promise<void> {
  if (!treeId) return;
  try {
    await AsyncStorage.removeItem(keyFor(treeId));
  } catch {
    /* bỏ qua */
  }
}
