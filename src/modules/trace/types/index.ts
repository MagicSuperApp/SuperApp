// modules/trace/types/index.ts
//
// Domain types thuộc về module Trace (truy xuất nông nghiệp).

/**
 * Một vườn.
 *
 * `coordinates` là RANH GIỚI — danh sách điểm nối, đúng thứ tự đi vòng. Đây là
 * thứ dựng lại được vùng vườn trên bản đồ, nên nó luôn có mặt (mảng rỗng khi
 * chủ vườn chưa đi ranh).
 *
 * ── Mọi trường dưới `userId` đều TUỲ CHỌN, và có lý do ──────────────────────
 * Chúng đến từ `GET /api/farms` (xem `mapFieldReidFarm` ở `services/farmService`),
 * nhưng đường CACHE không mang chúng qua được: `database.saveFarm` chỉ ghi 4 cột
 * `id · name · coordinates · user_id`. Cùng một vườn đọc từ máy chủ thì có tâm,
 * sai số ranh và số con vật; đọc lại từ SQLite lúc mất mạng thì mất sạch — chỉ
 * `treeCount`/`fruitCount` còn, vì `database.getFarms` tự đếm lấy từ bảng cây/quả
 * trong máy (đếm CỤC BỘ, có thể khác số của máy chủ).
 *
 * ⇒ Màn hình phải chịu được chỗ vắng và hiện "—", KHÔNG được hiện số 0: "0 cây"
 * là một khẳng định sai, còn "—" là sự thật ("chưa biết").
 */
export interface Farm {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number }[];
  userId: string;

  /** Tâm vườn do máy chủ giữ. Vắng → tự tính từ `coordinates`. */
  center?: { lat: number; lng: number } | null;
  /** Cách lấy ranh (`gps_walk` · `map_draw` · `mixed` · `unknown`) — xem `BOUNDARY_METHOD`. */
  boundaryMethod?: string | null;
  /** Sai số GPS lúc đi ranh, mét. Vắng = KHÔNG BIẾT, khác với 0. */
  boundaryAccM?: number | null;
  /**
   * Diện tích do MÁY CHỦ tính (`area_sqm`) — ưu tiên hơn phép tính phía app.
   * Cùng một vòng ranh mà hai bên ra hai con số thì không ai biết tin cái nào.
   */
  areaM2?: number | null;
  perimeterM?: number | null;
  /**
   * Máy chủ CHẤM lời khai `boundaryMethod` (nó đo hình dạng ranh rồi đối chiếu).
   * `null` = máy chủ chưa chấm. Trường DẪN-XUẤT, client không gửi lên được.
   */
  methodVerified?: boolean | null;
  /** Cảnh báo của máy chủ về vòng ranh (tự cắt, quá nhỏ…). */
  boundaryWarnings?: string[];
  kind?: string | null;
  note?: string | null;
  ownerDid?: string | null;
  createdAt?: string | null;
  /** Số cây. Vắng = chưa biết (xem chú thích trên) — hiện "—", đừng hiện 0. */
  treeCount?: number;
  /** Số quả. CHỈ đường cache tính được; `GET /api/farms` không trả. */
  fruitCount?: number;
  animalCount?: number;
  /** Ảnh bìa vườn, nếu bản máy chủ có. Hợp đồng hiện tại chưa hứa trường này. */
  imageUrl?: string | null;
}

// ── Build 49 § tree_metadata ──────────────────────────────────────────────────
export type TreeVariety = 'ri6' | 'monthong' | 'musang_king' | 'other';

export type TreeHealthStatus =
  | 'healthy'
  | 'flowering'
  | 'fruiting'
  | 'pest_damage'
  | 'nutrient_deficiency'
  | 'diseased'
  | 'dry'
  | 'dead'
  | 'unknown';

export interface TreeMetadata {
  variety?: TreeVariety;
  variety_other?: string;
  age_years?: number;
  health_status?: TreeHealthStatus;
  last_harvest_date?: string;          // ISO date YYYY-MM-DD
  notes?: string;                       // ≤ 500 chars
  voice_memo_path?: string;             // file:// local URI
  voice_memo_duration_s?: number;
  voice_memo_recorded_at?: string;      // ISO8601
  updated_at: string;                   // ISO8601
  schema_version: 'tree_metadata/1.0';
}

export interface Tree {
  id: string;
  farmId: string;
  code: string;
  images: string[];
  estimatedFruits: number;
  fruitCount: number;
  latitude?: number;
  longitude?: number;
  species?: string;
  plantedYear?: number;
  scanData?: {
    treeIds: string[];
    confidence?: number;
    images?: string[];
  };
  metadata?: TreeMetadata;
  // Build 52 § A7 — Tree name farmer-friendly.
  // Optional fields cho UI hiển thị tên thân thiện thay vì raw UUID.
  display_index?: number;                      // Per-farm sequential ("Cây #3")
  farmer_name?: string;                        // User-set custom name
  location?: { lat: number; lng: number };     // Alt to latitude/longitude (paired form)
}

export interface Fruit {
  id: string;
  treeId: string;
  code: string;
  images: string[];
  status: 'growing' | 'mature' | 'near_ripe' | 'ripe' | 'harvested' | 'sold' | 'processed';
  /** Stable fruit identifier from ReID/backend (distinct from the local row id). */
  fruitId?: string;
  /** ISO timestamps populated when synced from backend; optional for local rows. */
  createdAt?: string;
  updatedAt?: string;
}

export interface Activity {
  id: string;
  type: 'watering' | 'fertilizing' | 'pesticide' | 'harvesting';
  farmId: string;
  treeId?: string;
  fruitId?: string;
  images: string[];
  videos: string[];
  timestamp: Date;
  creditsUsed: number;
}
