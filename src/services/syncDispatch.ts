// services/syncDispatch.ts
//
// Phân loại + map mỗi sync item (loại + payload) → lời gọi API THẬT tới
// backend OriLife (staging-api.orilife.io). Tách riêng khỏi syncService để
// test thuần (không phụ thuộc store/database/SQLite).
//
// Contract backend (verify từ Tiger 2026-05-18, nguồn:
// src/modules/trace/utils/implicitParent.ts):
//   - POST /farms : tồn tại (aladinAPI.createFarm). region_code REQUIRED.
//   - POST /trees : tồn tại (aladinAPI.createTree). farm_id + geohash_7 REQUIRED.
//   - POST /fruits: KHÔNG tồn tại — fruits chỉ sinh qua /captures/3d + MeshGPU.
//   - activity    : CHƯA có endpoint nào trong codebase.
//
// Nguyên tắc: chỉ gọi API khi payload có ĐỦ field cho contract đã xác nhận.
// Thiếu field hoặc thiếu contract → trả 'unsupported' (item GIỮ trong queue,
// KHÔNG bịa payload, KHÔNG báo "đã sync"). Xem [CẦN XÁC NHẬN CONTRACT] dưới.

import aladinAPI from './aladin-api';
import { computeGeohash7 } from '../modules/trace/utils/implicitParent';
import { ALADIN_REGION_CODE } from '@env';

/** Phân loại lỗi để syncService quyết định retry hay đánh dấu chết. */
export type DispatchClass =
  | { kind: 'api'; run: () => Promise<void> }   // có lời gọi API thật
  | { kind: 'unsupported'; reason: string };    // chưa có contract → giữ queue

/** Shape mà syncService.addSyncItem bọc: { type, data, timestamp }. */
interface SyncEnvelope {
  type: string;
  data: any;
  timestamp?: string;
}

const REGION_FALLBACK = 'auto';

function regionCode(): string {
  const r = (ALADIN_REGION_CODE || '').trim();
  return r.length > 0 ? r : REGION_FALLBACK;
}

/**
 * Map một envelope đã parse → DispatchClass.
 *
 * Loại item gặp thực tế trong codebase:
 *   - 'farm_update'         → POST /farms  (nếu đủ field)
 *   - 'tree_identification' → POST /trees  (nếu đủ field)
 *   - 'fruit_identification'→ [CẦN XÁC NHẬN CONTRACT] không có POST /fruits
 *   - 'activity'/'activity_log' → [CẦN XÁC NHẬN CONTRACT] chưa có endpoint
 */
export function classifySyncItem(envelope: SyncEnvelope): DispatchClass {
  const data = envelope?.data ?? {};

  switch (envelope.type) {
    case 'farm_update': {
      const farm = data.farm ?? data;
      const ownerDid = farm.userId ?? farm.owner_did;
      const coords = farm.coordinates as { lat: number; lng: number }[] | undefined;
      if (!farm.id || !ownerDid || !coords || coords.length < 3) {
        return {
          kind: 'unsupported',
          reason:
            'farm_update thiếu id/owner_did/boundary — không đủ field cho POST /farms',
        };
      }
      // GeoJSON Polygon: [lng, lat], ring đóng (first === last).
      const ring = coords.map((c) => [c.lng, c.lat]);
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
      return {
        kind: 'api',
        run: async () => {
          await aladinAPI.createFarm({
            farm_id: farm.id,
            owner_did: ownerDid,
            region_code: regionCode(),
            farm_name: farm.name,
            boundary: { type: 'Polygon', coordinates: [ring] },
          });
        },
      };
    }

    case 'tree_identification': {
      const tree = data.tree ?? data;
      const lat = tree.latitude ?? tree.location?.lat;
      const lng = tree.longitude ?? tree.location?.lng;
      if (!tree.id || !tree.farmId || lat == null || lng == null) {
        return {
          kind: 'unsupported',
          reason:
            'tree_identification thiếu id/farmId/GPS — không đủ field cho POST /trees',
        };
      }
      return {
        kind: 'api',
        run: async () => {
          await aladinAPI.createTree({
            id: tree.id,
            region_code: regionCode(),
            farm_id: tree.farmId,
            geohash_7: computeGeohash7(lat, lng),
            latitude: lat,
            longitude: lng,
            metadata: tree.species ? { species: tree.species } : undefined,
          });
        },
      };
    }

    case 'fruit_identification':
      // [CẦN XÁC NHẬN CONTRACT] Backend KHÔNG có POST /fruits (xác nhận
      // implicitParent.ts:9). Fruit chỉ sinh qua POST /captures/3d + MeshGPU,
      // cần dữ liệu 3D capture thật mà payload caller (local Fruit object +
      // ảnh) KHÔNG chứa. Giữ item trong queue, KHÔNG bịa payload.
      return {
        kind: 'unsupported',
        reason:
          '[CẦN XÁC NHẬN CONTRACT] fruit_identification: không có POST /fruits; ' +
          'fruit sinh qua /captures/3d, payload hiện chưa đủ',
      };

    case 'activity':
    case 'activity_log':
      // [CẦN XÁC NHẬN CONTRACT] Chưa tìm thấy endpoint activity nào trong
      // codebase. Giữ trong queue chờ contract.
      return {
        kind: 'unsupported',
        reason:
          '[CẦN XÁC NHẬN CONTRACT] activity: chưa có endpoint backend xác nhận',
      };

    default:
      return {
        kind: 'unsupported',
        reason: `Loại sync chưa hỗ trợ: ${envelope.type}`,
      };
  }
}

/**
 * Phân loại lỗi HTTP → có nên retry không.
 * - 4xx (trừ 408/429): lỗi client, payload sai → KHÔNG retry (đánh dấu chết).
 * - 408/429/5xx/network/timeout: tạm thời → retry.
 */
export function isRetryableError(err: any): boolean {
  // axios lỗi mạng/timeout: không có response.
  const status: number | undefined = err?.response?.status;
  if (status == null) return true; // network error / timeout → retry
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  return false; // 4xx khác → không retry
}
