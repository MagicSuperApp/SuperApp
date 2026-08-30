/**
 * moduleIds — DANH SÁCH module, tách riêng khỏi `registry.ts`.
 *
 * ── Vì sao là một tệp riêng cho một dòng dữ liệu ────────────────────────────
 * `registry.ts` import TĨNH mọi màn của mọi module (đúng theo INV-SEC: không tải
 * động, offline-first). Hệ quả: chạm vào nó là kéo theo toàn bộ cây component,
 * và cây đó chạm module native — nên bất cứ bài kiểm nào chỉ muốn biết "có
 * những module nào" đều chết ở một `import Clipboard` cách đó bốn tầng.
 *
 * Cái giá của việc không tách: bài kiểm bất biến hai app không chạy được, và
 * "không chạy được" thì trong thực tế nghĩa là không có bài kiểm nào.
 *
 * `registry.ts` khai `MODULE_REGISTRY: Record<ModuleId, RegistryEntry>` với
 * `ModuleId` lấy từ đây, nên `tsc` bảo đảm hai bên không lệch: thêm id vào đây
 * mà quên khai entry là ĐỎ ngay, và ngược lại.
 */

/** moduleId nội bộ (ngắn gọn) — KHÁC moduleId reverse-DNS trong manifest. */
export const MODULE_IDS = ['trace', 'chat', 'work', 'join'] as const;

export type ModuleId = (typeof MODULE_IDS)[number];
