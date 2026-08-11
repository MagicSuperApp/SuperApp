// services/orilifeBase.ts
//
// NGUỒN DUY NHẤT base URL cho MỌI dữ-liệu OriLife (field-reid: tree/fruit/animal/
// farm/care). Mọi màn & service PHẢI import từ đây — KHÔNG hardcode URL rải rác.
//
// Quy tắc (anh Aladin, 2026): mọi dữ-liệu OriLife đi qua DUY-NHẤT https://api.orilife.io.
// Các cổng cũ (test / staging / port phụ Tiger) đã/đang bị xoá — TUYỆT ĐỐI không
// fallback về đó (kể cả khi env không nạp được).
//
// Đọc env `ORILIFE_API_BASE_URL` nếu có; thiếu/rỗng → prod api.orilife.io (KHÔNG chết).
import { ORILIFE_API_BASE_URL } from '@env';

/** Base URL OriLife field-reid. Mặc định an-toàn = prod api.orilife.io.
 *
 * CẮT DẤU `/` CUỐI: mọi nơi ghép đường dẫn đều viết `${ORILIFE_BASE}${path}` với
 * `path` đã có `/` đầu (`/gimg/...`, `/api/tree_views`). Env lỡ ghi
 * `https://api.orilife.io/` là ra URL hai gạch `//gimg/...`, máy chủ trả 404 và
 * người ta đổ lỗi oan cho cổng ảnh. Cắt ở ĐÚNG MỘT chỗ này, không vá rải rác.
 */
export const ORILIFE_BASE: string = (
  (ORILIFE_API_BASE_URL as string | undefined)?.trim() || 'https://api.orilife.io'
).replace(/\/+$/, '');
