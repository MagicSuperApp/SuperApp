/**
 * space3d/markerStore — MỐC VƯỜN do người dùng tự đặt, lưu TRONG MÁY.
 *
 * ── Mốc là gì ───────────────────────────────────────────────────────────────
 * Cây thì máy chủ biết. Nhưng "cổng vườn", "chỗ để máy bơm", "gốc cây to đầu
 * hàng 3" thì không có bảng nào chứa, mà đó lại đúng là những chỗ người ta cần
 * tìm lại giữa vườn. Mốc = một cái tên + một chỗ đứng có GPS, thế thôi.
 *
 * ── Vì sao chỉ nằm trong máy ────────────────────────────────────────────────
 * Máy chủ CHƯA CÓ chỗ nhận. Đo được: trong 146 đường của `openapi.json`, đường
 * duy nhất tên là "marker" — `POST /api/tree/marker` — chỉ nhận
 * `{tree_id, label, side}` với `side ∈ {left,right,front,back}`: không toạ-độ,
 * không ảnh. Chỗ trống duy nhất còn lại là ô `note` (chuỗi tự do) của vườn, và
 * nhét JSON vào ô ghi chú của người dùng là hỏng ô đó vĩnh viễn.
 *
 * Hệ quả PHẢI NÓI RA TRÊN MÀN, không để người dùng tự đoán: mất máy là mất mốc,
 * và người khác trong nhà không thấy mốc của nhau. Xem `map.marker.localOnly`.
 *
 * ── Khuôn ───────────────────────────────────────────────────────────────────
 * Đúng lối `positionStore.ts`: AsyncStorage, tiền tố `@aladin/space3d/`, và MỌI
 * hàm NUỐT lỗi — mốc là dữ-liệu phụ, đọc hỏng thì coi như chưa có, không được
 * phép làm sập màn dẫn đường giữa vườn.
 *
 * Khác `positionStore` một điểm: mỗi VƯỜN một khoá chứa cả MẢNG mốc, không phải
 * mỗi mốc một khoá. Vì mốc không có id sẵn từ máy chủ để mà tra ngược — muốn
 * liệt kê mốc của một vườn thì phải quét toàn bộ khoá, việc mà AsyncStorage làm
 * rất chậm khi máy dùng lâu.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeUri } from '../../services/treeImageStore';
import { isValidLatLon } from '../wayfind/wayfind';

const MARKER_PREFIX = '@aladin/space3d/farm_markers/';

export const farmMarkersKey = (farmId: string) => `${MARKER_PREFIX}${farmId}`;

/**
 * Trần số mốc mỗi vườn. Không phải để tiết kiệm chỗ (mỗi mốc vài trăm byte) mà
 * để một vòng lặp lỗi ở nơi gọi không âm thầm nhồi hàng nghìn bản ghi vào máy.
 */
export const MAX_MARKERS_PER_FARM = 200;

export interface FarmMarker {
  id: string;
  farmId: string;
  name: string;
  lat: number;
  lon: number;
  /**
   * Sai số GPS (mét) LÚC ĐẶT. Giữ lại chứ không vứt: dưới tán cây sai số 15–25 m
   * là thường, và một mốc "cổng vườn" đặt với sai số 25 m thì nó chỉ nói được
   * "cổng nằm đâu đó trong vòng 25 m". Không lưu con số này là mốc nào cũng
   * trông chắc như nhau. Máy không báo sai số → `null`, và đó cũng là một tin.
   */
  accuracyM: number | null;
  /** Đường dẫn ảnh trong máy (không phải URL máy chủ). Xem `treeImageStore`. */
  photoPath?: string;
  /** Mốc thời gian đặt (epoch ms). Số chứ không chuỗi ISO: còn để xếp thứ tự. */
  createdAt: number;
}

/**
 * Sinh mã mốc. Không dùng `uuid` (kho chưa có) — thời điểm + một đoạn ngẫu nhiên
 * là đủ duy nhất cho thứ chỉ sống trong một máy, và còn tự sắp theo thứ tự đặt.
 */
export function newMarkerId(): string {
  return `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Bản ghi thô từ máy → mốc dùng được, hoặc `null`.
 *
 * Lọc ở ĐƯỜNG ĐỌC chứ không tin bản đã ghi: bản cũ do bản app trước ghi ra có
 * thể thiếu trường, và một mốc toạ-độ 0/0 lọt lên mặt phẳng tìm cây sẽ hiện
 * thành một chấm cách người dùng vài nghìn km.
 */
export function normalizeMarker(raw: unknown, farmId: string): FarmMarker | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat);
  const lon = Number(o.lon);
  if (!isValidLatLon({ lat, lon })) return null;
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  if (!id) return null;
  const acc = Number(o.accuracyM);
  const created = Number(o.createdAt);
  return {
    id,
    farmId: typeof o.farmId === 'string' && o.farmId ? o.farmId : farmId,
    // Mốc không tên vẫn là mốc có thật — giữ lại, để lớp giao diện đặt tên thay.
    name: typeof o.name === 'string' ? o.name : '',
    lat,
    lon,
    accuracyM: Number.isFinite(acc) && acc > 0 ? acc : null,
    photoPath: typeof o.photoPath === 'string' && o.photoPath
      ? normalizeUri(o.photoPath)
      : undefined,
    createdAt: Number.isFinite(created) && created > 0 ? created : 0,
  };
}

/** Mốc của một vườn, mới đặt đứng trước. Chưa có / đọc hỏng → `[]`. */
export async function loadFarmMarkers(farmId: string): Promise<FarmMarker[]> {
  if (!farmId) return [];
  try {
    const raw = await AsyncStorage.getItem(farmMarkersKey(farmId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: FarmMarker[] = [];
    for (const item of arr) {
      const m = normalizeMarker(item, farmId);
      // Bỏ bản ghi hỏng chứ không bỏ CẢ danh sách: một mốc lỗi không được kéo
      // theo mấy chục mốc lành mà người ta đã đi bộ ngoài vườn để đặt.
      if (m) out.push(m);
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  } catch {
    // Chuỗi trong máy không phải JSON (bản app cũ / ghi dở) → coi như chưa có.
    return [];
  }
}

/**
 * Thêm một mốc. Trả về danh sách SAU khi thêm để nơi gọi vẽ lại ngay, khỏi phải
 * đọc lại đĩa (cùng lối `appendTreeImages`).
 *
 * Ghi hỏng (hết chỗ) thì trả về danh sách cũ — nơi gọi thấy mốc mới KHÔNG có
 * trong đó thì biết là chưa lưu được, thay vì tin nhầm rằng đã lưu.
 */
export async function saveFarmMarker(
  farmId: string,
  marker: FarmMarker,
): Promise<FarmMarker[]> {
  if (!farmId) return [];
  const clean = normalizeMarker(marker, farmId);
  if (!clean) return loadFarmMarkers(farmId);
  try {
    const existing = await loadFarmMarkers(farmId);
    const merged = [clean, ...existing.filter(m => m.id !== clean.id)]
      .slice(0, MAX_MARKERS_PER_FARM);
    await AsyncStorage.setItem(farmMarkersKey(farmId), JSON.stringify(merged));
    return merged;
  } catch {
    return loadFarmMarkers(farmId);
  }
}

/** Xoá một mốc (đặt nhầm chỗ). Trả về danh sách còn lại. */
export async function removeFarmMarker(
  farmId: string,
  markerId: string,
): Promise<FarmMarker[]> {
  if (!farmId || !markerId) return loadFarmMarkers(farmId);
  try {
    const rest = (await loadFarmMarkers(farmId)).filter(m => m.id !== markerId);
    await AsyncStorage.setItem(farmMarkersKey(farmId), JSON.stringify(rest));
    return rest;
  } catch {
    return loadFarmMarkers(farmId);
  }
}
