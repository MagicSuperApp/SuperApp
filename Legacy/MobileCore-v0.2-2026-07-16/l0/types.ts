/**
 * MobileCore — HỢP ĐỒNG DÙNG CHUNG (frozen).
 * Orchestrator sở hữu file này. Agent build IMPORT, KHÔNG sửa.
 * Mục đích: khoá chữ ký giữa các module chạy song song (council-gate lần 2, gap 1-3).
 */

/** Toạ độ chuẩn — mọi hàm địa lý dùng shape này. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Chữ ký ĐÓNG BĂNG — l0/geo HIỆN THỰC, l0/sync (treeDedupCache) IMPORT:
 *   export function haversineDistance(a: LatLng, b: LatLng): number  // trả về MÉT
 * Không đổi tên/đơn vị/shape.
 */

/** Kho khoá-giá-trị bất đồng bộ — INJECT vào net/sync (giữ L0 thuần, không import AsyncStorage). */
export interface KVStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  multiSet(pairs: Array<[string, string]>): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Cấp/làm-mới token — INJECT vào net. `refreshToken` là CƠ CHẾ (net sở hữu single-flight). */
export interface TokenProvider {
  getToken(): Promise<string | null>;
  /** Thực thi refresh (net bọc single-flight quanh nó). Trả token mới hoặc null nếu thất bại. */
  refreshToken(): Promise<string | null>;
}

/** Tuỳ chọn 1 request. `idempotencyKey` là chỗ B-sync gắn khoá dedup server (council gap 2). */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Kết quả 1 lần thử đồng bộ (sync ↔ net). */
export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
}
