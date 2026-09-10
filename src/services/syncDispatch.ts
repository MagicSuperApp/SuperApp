// services/syncDispatch.ts
//
// Phân loại + map mỗi sync item (loại + payload) → lời gọi API THẬT tới
// backend OriLife (api.orilife.io). Tách riêng khỏi syncService để
// test thuần (không phụ thuộc store/database/SQLite).
//
// Contract backend (verify từ Tiger 2026-05-18). Bốn dòng dưới trước đây chỉ
// sang `implicitParent.ts` làm nguồn; tệp đó nay là `geohash.ts` và phần khai
// contract trong nó đã gỡ cùng mã chết, nên chép về ĐÂY — nơi thật sự đọc nó:
//   - POST /farms : tồn tại (aladinAPI.createFarm). region_code REQUIRED.
//   - POST /trees : tồn tại (aladinAPI.createTree). farm_id + geohash_7 REQUIRED.
//   - POST /fruits: KHÔNG tồn tại — fruits chỉ sinh qua /captures/3d + MeshGPU.
//   - activity    : POST /api/{entity_type}/{entity_id}/event — CÓ THẬT, đo lại
//     2026-08-15 trên `https://api.orilife.io/openapi.json`. Dòng cũ ở đây ghi
//     "CHƯA có endpoint nào trong codebase" và đúng theo nghĩa đen (mã app chưa
//     gọi), nhưng người đọc hiểu thành "máy chủ chưa có" và nhật ký chăm sóc
//     nằm chết trong hàng đợi. Từ nay: chưa thấy trong mã ⇒ HỎI openapi.json,
//     đừng kết luận từ mã app.
//
// Nguyên tắc: chỉ gọi API khi payload có ĐỦ field cho contract đã xác nhận.
// Thiếu field hoặc thiếu contract → trả 'unsupported' (item GIỮ trong queue,
// KHÔNG bịa payload, KHÔNG báo "đã sync"). Xem [CẦN XÁC NHẬN CONTRACT] dưới.

import aladinAPI from './aladin-api';
import { computeGeohash7 } from '../modules/trace/utils/geohash';
import { ALADIN_REGION_CODE } from '@env';
import { ORILIFE_BASE } from './orilifeBase';
import { addTimelineEvent, type TimelineKind } from './timelineService';

/**
 * Việc đồng áng (mã app) → `kind` timeline (mã máy chủ).
 *
 * Danh sách `kind` hợp lệ ở `timelineService.ts`; máy chủ ÉP mọi `kind` lạ về
 * `observe`, im lặng. Nên bảng này phải khớp, đừng gửi chữ tự nghĩ: gửi
 * `'watering'` thì việc tưới nằm lẫn vào đống "ghi nhận chung", không lọc ra
 * được nữa.
 */
const ACTIVITY_TO_TIMELINE_KIND: Record<string, TimelineKind> = {
  watering: 'care',
  fertilizing: 'care',
  pesticide: 'care',
  harvesting: 'harvest',
};

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
      // [CẦN XÁC NHẬN CONTRACT] Backend KHÔNG có POST /fruits (xác nhận Tiger
      // 2026-05-18, chép ở đầu tệp này). Fruit chỉ sinh qua /captures/3d + MeshGPU,
      // cần dữ liệu 3D capture thật mà payload caller (local Fruit object +
      // ảnh) KHÔNG chứa. Giữ item trong queue, KHÔNG bịa payload.
      return {
        kind: 'unsupported',
        reason:
          '[CẦN XÁC NHẬN CONTRACT] fruit_identification: không có POST /fruits; ' +
          'fruit sinh qua /captures/3d, payload hiện chưa đủ',
      };

    case 'activity':
    case 'activity_log': {
      // Endpoint ĐÃ CÓ. Chú thích cũ ("chưa tìm thấy endpoint activity nào")
      // đúng theo cách tìm hồi đó — tìm chữ "activity" trong mã nguồn — nhưng
      // sai về máy chủ: bản đang chạy tự mô tả ở
      // `https://api.orilife.io/openapi.json` (đo 2026-08-15, 139 đường) có
      //     POST /api/{entity_type}/{entity_id}/event   tag `timeline`
      // "Ghi 1 sự-kiện vào timeline". Nhật ký chăm sóc CHÍNH LÀ một sự kiện
      // timeline, không cần đường riêng.
      //
      // KHÔNG dùng `POST /api/care/log`: đường đó bắt buộc `product_id`, chỉ
      // hợp bón phân/thuốc. Tưới và thu hoạch không có `product_id` ⇒ dùng nó
      // sẽ phải bịa một mã sản phẩm.
      const act = data.activity ?? data;
      const farmId = act.farmId ?? act.farm_id;
      const treeId = act.treeId ?? act.tree_id;
      if (!act.type || !farmId) {
        return {
          kind: 'unsupported',
          reason: 'activity thiếu type/farmId — không đủ field cho POST /{entity}/{id}/event',
        };
      }
      // GHI VÀO VƯỜN — và đây là chỗ đã suýt sửa sai, ghi lại để đừng sửa lần nữa.
      //
      // Triệu chứng thật ngoài đồng: ghi việc tưới cho một cây, mở đúng cây đó ra
      // thì không thấy gì. Nhà này đọc ra "ghi nhầm thực thể" và đã đổi sang ghi
      // vào `tree`. SAI. Nhà OriLife đo lại và chỉ ra mô hình đúng của họ: một lần
      // phun cả vườn là MỘT sự việc, không phải N sự việc trên N cây. Ghi xuống
      // từng cây là nhân bản một sự việc có thật thành nhiều bản ghi không có thật.
      //
      // Chỗ hỏng nằm ở ĐẦU ĐỌC, không ở đầu ghi: app không có màn nào vẽ dòng thời
      // gian của vườn (nay đã thêm ở `FarmDetailScreen`), và dòng của CÂY chưa kế
      // thừa việc chăm sóc của vườn bao ngoài — bên OriLife đang sửa ở PR #379,
      // mỗi bản kế thừa mang `inherited_from` để app hiện đúng chữ "phun cả vườn".
      //
      // Vẫn gửi kèm `tree_id` trong payload: nó ghi lại NGƯỜI DÙNG ĐANG ĐỨNG TRƯỚC
      // CÂY NÀO lúc ghi việc — một dữ kiện có thật, không mất gì khi gửi, và bên
      // máy chủ dùng được nếu sau này cần quy trách nhiệm hẹp hơn.
      const entityType = 'farm';
      const entityId = String(farmId ?? '');
      if (!farmId) {
        return {
          kind: 'unsupported',
          reason: 'activity thiếu farmId — sự việc đồng áng ghi ở dòng thời gian VƯỜN',
        };
      }
      return {
        kind: 'api',
        run: async () => {
          const res = await addTimelineEvent(ORILIFE_BASE, entityType, entityId, {
            kind: ACTIVITY_TO_TIMELINE_KIND[act.type] ?? 'observe',
            ts: act.timestamp,
            payload: {
              activity_type: act.type,
              // Luôn kèm, kể cả khi sự kiện đã nằm trên dòng của cây — màn vườn
              // và máy chủ cần biết cây này thuộc vườn nào mà không phải tra thêm.
              farm_id: farmId ? String(farmId) : undefined,
              tree_id: treeId ? String(treeId) : undefined,
              // `credits` là số MAGIC màn hình ĐỊNH GIÁ cho việc này. Gửi kèm để
              // máy chủ tự trừ khi nào bên đó bật thu phí — app KHÔNG tự trừ.
              quoted_magic: act.creditsUsed,
              materials: act.materials ?? [],
            },
          });
          if (!res.ok) {
            // Ném để syncService chạy đúng nhánh phân loại lỗi/backoff sẵn có.
            throw Object.assign(new Error(res.error?.detail ?? 'Ghi sự kiện thất bại'), {
              response: { status: res.error?.http_status ?? 0 },
            });
          }
        },
      };
    }

    default:
      return {
        kind: 'unsupported',
        reason: `Loại sync chưa hỗ trợ: ${envelope.type}`,
      };
  }
}

/**
 * Hạng lỗi của MỘT lượt gửi. Bốn hạng, vì "có retry được không" là câu hỏi SAI.
 *
 * ⛔ Lỗi đã đo, và nó là mất dữ liệu đồng ruộng:
 *   Bản cũ chỉ có hai đáp án, nên mọi thứ không-retry-được rơi chung vào một rọ
 *   mà `syncService` gọi là "lỗi vĩnh viễn" → `status:'error'`. Vòng quét chỉ lấy
 *   `'pending' | 'sending'` (`syncService.processSyncQueue`), nên `'error'` là
 *   CHẾT THẬT, kể cả sau khi mở lại app. Hai thứ rơi nhầm vào đó:
 *     · 401 — phiên hết hạn. Token field-reid sống 12 giờ; hết buổi là mục nhật
 *       ký chăm sóc chết ngay lần gửi ĐẦU, trong khi người dùng vừa đọc "Đã lưu
 *       vào sổ — Sẽ gửi lên máy chủ khi có mạng".
 *     · `http_status: 0` — KHÔNG có phản hồi HTTP nào, tức MẤT MẠNG. Đường ném ở
 *       nhánh `activity` trên kia dựng `status: res.error?.http_status ?? 0`, mà
 *       `timelineService` trả `http_status: 0` cho lỗi mạng. Bản cũ đọc 0 thành
 *       "một 4xx lạ" ⇒ giết mục đúng lúc offline — chính lúc hàng đợi phải sống
 *       nhất, và chính lúc câu hứa với người dùng vừa được in ra.
 *
 * Nay tách theo CÁCH GỠ, vì mỗi hạng gỡ bằng một việc khác nhau:
 *   · `retryable` — tự khỏi khi mạng/máy chủ khá lên. Chờ rồi thử lại.
 *   · `auth`      — phiên hết hạn. Gỡ bằng KÝ LẠI (`ensureOrilifeToken` force).
 *   · `blocked`   — điều kiện phía máy chủ chưa thoả (thực thể chưa đăng ký; máy
 *     chủ chưa bật dòng thời gian). Ký lại KHÔNG gỡ được, thử dồn cũng vô ích —
 *     nhưng nó có thể thoả về sau, nên mục phải nằm chờ chứ không được chết.
 *   · `permanent` — payload sai. Hạng DUY NHẤT được phép đánh dấu chết.
 */
export type SyncFailureClass = 'retryable' | 'auth' | 'blocked' | 'permanent';

export function classifySyncFailure(err: any): SyncFailureClass {
  const status: number | undefined = err?.response?.status;
  // Không có `response`, hoặc có mà `status` = 0: cả hai đều nghĩa là KHÔNG nhận
  // được phản hồi HTTP nào. Đó là lỗi mạng, không phải một mã lỗi lạ.
  if (status == null || status === 0) return 'retryable';
  if (status === 401) return 'auth';
  if (status === 403 || status === 404) return 'blocked';
  if (status === 408 || status === 429) return 'retryable';
  if (status >= 500) return 'retryable';
  return 'permanent';
}

/**
 * @deprecated Giữ cho những nơi chỉ cần câu hỏi hai đáp án. Chỗ quyết định số
 * phận của một mục hàng đợi phải dùng `classifySyncFailure` — hỏi câu hai đáp án
 * ở đó chính là cách 401 bị xếp chung rọ với "payload sai".
 */
export function isRetryableError(err: any): boolean {
  return classifySyncFailure(err) === 'retryable';
}
