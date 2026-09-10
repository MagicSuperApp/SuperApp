/**
 * moduleCatalog — DANH MỤC module để một app BẤM CHỌN.
 *
 * ── Vì sao tệp này tồn tại ──────────────────────────────────────────────────
 * Trước bản này, tập module là hằng dẫn xuất: mọi app có mọi module, không ai
 * chọn được. Luật cũ (`instances/LUAT-SUPERAPP.md §2`) cấm hẳn việc bỏ bớt, và
 * lệnh cấm đó có lý do đo được — trường `enabledModules` đời đầu hỏng CÂM: app
 * quên khai thì lặng lẽ thiếu tính năng, không phép đo nào kêu.
 *
 * Chủ sở hữu bẻ lại hướng 2026-09-10: với hàng trăm module sắp có, bắt mỗi
 * doanh nghiệp ngồi khai danh sách BỎ là bắt họ bảo trì một danh sách âm — mỗi
 * module mới lại phải đi bỏ tay ở mọi app. Phải là danh mục để BẤM CHỌN VÀO.
 *
 * Nên hình dạng đúng là:
 *   - `'all'`      → app lõi. Module mới vào sổ là app này tự có.
 *   - `[...ids]`   → app chọn lọc. Module mới KHÔNG tự vào, và đó là ĐÚNG Ý,
 *                    không phải chỗ quên khai.
 *
 * Cái làm hỏng-câm biến mất không phải nhờ cấm, mà nhờ phân biệt được hai ca đó.
 *
 * ── Vì sao KHÔNG đọc danh mục từ `registry.ts` ──────────────────────────────
 * `registry.ts` import TĨNH mọi màn của mọi module (INV-SEC: không tải động,
 * offline-first). Chạm vào nó là kéo cả cây component và module native theo sau.
 * Tệp này chỉ nhập các `module.manifest.json` — dữ liệu thuần, không kéo gì —
 * nên bài kiểm và công cụ dựng đọc được danh mục mà không phải khởi React
 * Native. Cùng lý do `moduleIds.ts` tách khỏi `registry.ts`.
 *
 * ⚠ Danh mục KHÔNG làm gói nhẹ đi. `registry.ts` vẫn import tĩnh mọi màn, nên
 * mã của module tắt vẫn nằm trong gói — cái tắt là ĐƯỜNG TỚI nó (tab, cổng xoè,
 * đăng ký route). Muốn gói nhẹ theo cấu hình thì phải sinh `registry.ts` lúc
 * dựng; đó là việc khác và chưa làm. Ghi ở đây để không ai đọc nhầm "chọn lọc
 * tính năng" thành "gói nhỏ hơn".
 */

import type { ModuleId } from './moduleIds';
import { MODULE_IDS } from './moduleIds';

import traceManifest from '../modules/trace/module.manifest.json';
import chatManifest from '../modules/chat/module.manifest.json';
import workManifest from '../modules/work/module.manifest.json';
import joinManifest from '../modules/join/module.manifest.json';

/** Ô điều hướng module tự khai trong manifest của nó. */
export type NavSlot = 'tab' | 'hub' | 'primary' | 'secondary' | 'contextual';

/**
 * Một dòng trong danh mục — đủ để dựng màn hình chọn module mà KHÔNG phải mở mã
 * của module đó.
 */
export interface CatalogEntry {
  /** id ngắn, dùng trong `instance.json`. */
  id: ModuleId;
  /** id reverse-DNS trong manifest (`magiclamp.trace`) — KHÁC `id`. */
  qualifiedId: string;
  displayName: { vi?: string; en?: string };
  /** `silent` = không có mặt điều hướng riêng; `feature` = có màn của mình. */
  integrationKind: 'silent' | 'feature';
  /** Route mở ra khi bấm vào module từ tab/cổng. */
  entrypoint: string;
  navSlot: NavSlot;
  icon: { name: string; colorToken: string };
  /** Mọi route module đăng ký vào stack. */
  routes: string[];
  /**
   * Quyền module cần. Doanh nghiệp bấm chọn cần thấy trước cái này: bật một
   * module là bật luôn quyền của nó (máy ảnh, vị trí, đọc hồ sơ), và đó là thứ
   * họ phải khai trên trang cửa hàng.
   */
  capabilities: { data?: string[]; device?: string[]; network?: string[] };
}

// Manifest là JSON nên tới đây là `any`-ish; ép về đúng hình dạng một lần tại
// biên, thay vì để kiểu lỏng chảy vào mọi nơi đọc danh mục.
const entry = (id: ModuleId, m: Record<string, unknown>): CatalogEntry => ({
  id,
  qualifiedId: m.moduleId as string,
  displayName: m.displayName as CatalogEntry['displayName'],
  integrationKind: m.integrationKind as CatalogEntry['integrationKind'],
  entrypoint: m.entrypoint as string,
  navSlot: m.navSlot as NavSlot,
  icon: m.icon as CatalogEntry['icon'],
  routes: m.routes as string[],
  capabilities: (m.capabilities ?? {}) as CatalogEntry['capabilities'],
});

/**
 * `Record<ModuleId, …>` cố ý: thêm một id vào `MODULE_IDS` mà quên thêm dòng
 * danh mục là `tsc` ĐỎ. Danh mục thiếu một module thì màn chọn không hiện nó ra,
 * và doanh nghiệp không bấm được thứ họ không thấy — hỏng câm đúng kiểu bản này
 * sinh ra để chặn.
 */
export const MODULE_CATALOG: Record<ModuleId, CatalogEntry> = {
  trace: entry('trace', traceManifest as unknown as Record<string, unknown>),
  chat: entry('chat', chatManifest as unknown as Record<string, unknown>),
  work: entry('work', workManifest as unknown as Record<string, unknown>),
  join: entry('join', joinManifest as unknown as Record<string, unknown>),
};

/** Danh mục dạng mảng, thứ tự theo `MODULE_IDS` — cho màn chọn và cho công cụ. */
export const MODULE_CATALOG_LIST: CatalogEntry[] = MODULE_IDS.map((id) => MODULE_CATALOG[id]);

/** Module nào sở hữu route này? `null` = route của host shell. */
export function moduleOwningRoute(route: string): ModuleId | null {
  for (const id of MODULE_IDS) {
    if (MODULE_CATALOG[id].routes.includes(route)) return id;
  }
  return null;
}
