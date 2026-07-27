// modules/work/services/config.ts
//
// Cấu hình host + feature-flag cho lớp gọi API AladinWork.
//
// NGUYÊN TẮC (thực dụng):
//   - Chưa có host + credentials AladinWork dev → flag MẶC ĐỊNH OFF. Khi OFF,
//     các hook trong module trả về MOCK (UI không vỡ). Khi có host thật + bật
//     WORK_BACKEND_ENABLED=true trong .env → gọi API thật.
//   - KHÔNG bịa host. baseURL đọc từ .env qua @env; nếu trống thì fallback
//     localhost (chỉ có ý nghĩa khi dev tự chạy backend cục bộ).
//
// Vì src/types/env.d.ts (khai type @env toàn cục) NẰM NGOÀI ranh giới sửa của
// module này, ta khai một shim @env CỤC BỘ (env.d.ts cùng thư mục) chỉ cho các
// biến WORK_*. Khi tích hợp chính thức, có thể gộp 2 biến này lên env.d.ts gốc.
//
// Biến .env cần thêm (BLOCKER — chờ host + credentials AladinWork dev):
//   WORK_API_URL=https://<host-aladinwork-dev>/api/v1
//   WORK_BACKEND_ENABLED=false   # bật true khi host sống + đã đối chiếu shape

import { WORK_API_URL, WORK_BACKEND_ENABLED } from '@env';
import { isCapabilityLive } from '../../../config/runtimeGate';

/** Base URL AladinWork (đã gồm hậu tố /api/v1). Trống → chưa cấu hình host. */
export const WORK_BASE_URL: string =
  (WORK_API_URL as string | undefined)?.trim() || '';

/**
 * Cờ bật backend thật — nay do CỔNG RUNTIME quyết (config/runtimeGate.ts):
 *   - CÓ host (WORK_API_URL), VÀ
 *   - cổng runtime probe /health trả 2xx → tự bật khi backend sống, KHỎI build lại.
 * Kill-switch thủ công: đặt WORK_BACKEND_ENABLED='off' trong .env để CƯỠNG BỨC mock
 * (vd giữ 1 bản release luôn mock). Mọi giá trị khác → health quyết.
 * (Trước đây cần WORK_BACKEND_ENABLED==='true' build-time → backend sống vẫn phải
 * build lại; anh Aladin chốt 2026-07-22 chuyển sang tự động.)
 */
export const isWorkBackendEnabled = (): boolean =>
  WORK_BASE_URL.length > 0 &&
  String(WORK_BACKEND_ENABLED).toLowerCase() !== 'off' &&
  isCapabilityLive('work');

/** baseURL thực dùng cho axios; fallback localhost khi dev tự chạy backend. */
export const resolveBaseURL = (): string =>
  WORK_BASE_URL || 'http://localhost:8080/api/v1';

/** Timeout mạng (ms). Backend AladinWork có gọi chuỗi tích hợp (Stamp/VeData) → nới rộng. */
export const WORK_HTTP_TIMEOUT_MS = 25_000;
