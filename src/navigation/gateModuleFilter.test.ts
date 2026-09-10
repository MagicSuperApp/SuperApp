/**
 * Cổng xoè có THẬT SỰ bỏ mục của module đã tắt không.
 *
 * Bài này tồn tại vì một lý do hẹp và quan trọng: hai app hiện tại đều khai
 * `modules: 'all'`, nên phép lọc `routeIsReachable` trong `resolveGateItems`
 * **luôn trả true trên mọi bản dựng đang chạy**. Một phép canh chỉ chạy ở nhánh
 * "điều kiện đã đúng sẵn" thì không ai biết nó có canh được gì không — nó có
 * tên như một cái cổng và nhả hết.
 *
 * Nên ở đây tập module bị ép về một danh sách hẹp, tức dựng ra đúng ca mà app
 * doanh nghiệp đầu tiên sẽ rơi vào.
 */

import { MODULE_CATALOG } from './moduleCatalog';

const actualConfig = jest.requireActual('../config/instance.config');

// Chỉ thay MỘT hằng: tập module đang bật. `DEFAULT_INSTANCE` (thứ cấp
// `slotPriority` và tên tab) giữ nguyên bản thật — mock lỏng hơn thật thì bài
// kiểm đo một app không tồn tại.
const enabled = ['trace'];
jest.mock('../config/instance.config', () => ({
  ...jest.requireActual('../config/instance.config'),
  ENABLED_MODULES: ['trace'],
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveGateItems } = require('./resolveGateItems');

const NO_FARM = { farms: 0, trees: 0, fruits: 0 };

// Route → module sở hữu; null = route của host shell.
const ownerOf = (route: string): string | null => {
  const hit = Object.values(MODULE_CATALOG).find((e) => e.routes.includes(route));
  return hit ? hit.id : null;
};

describe('cổng xoè khi app chỉ bật một phần sổ module', () => {
  it('mọi mục trên cổng đều TỚI ĐƯỢC', () => {
    const items = resolveGateItems(NO_FARM);
    expect(items.length).toBeGreaterThan(0);
    items.forEach((it: { route: string }) => {
      const owner = ownerOf(it.route);
      if (owner === null) return; // route host
      expect(enabled).toContain(owner);
    });
  });

  it('mục của module ĐÃ TẮT biến mất — không chỉ đổi nhãn', () => {
    // `chat` là ca nặng nhất: route của nó (`ChatHome`) là ô NEO TRÁI, tức nó
    // vào cổng qua một đường KHÁC `slotPriority`. Lọc mà quên neo thì mục Chat
    // vẫn còn, và bấm vào là điều hướng tới route chưa đăng ký.
    const items = resolveGateItems(NO_FARM);
    const routes = items.map((i: { route: string }) => i.route);
    MODULE_CATALOG.chat.routes.forEach((r) => expect(routes).not.toContain(r));
    MODULE_CATALOG.work.routes.forEach((r) => expect(routes).not.toContain(r));
    MODULE_CATALOG.join.routes.forEach((r) => expect(routes).not.toContain(r));
  });

  it('module CÒN BẬT vẫn lên cổng — phép lọc không quét sạch', () => {
    // Đối chứng. Không có bài này thì một `routeIsReachable` luôn trả `false`
    // cũng làm hai bài trên xanh, và cổng rỗng cũng "đạt".
    const items = resolveGateItems(NO_FARM);
    const routes = items.map((i: { route: string }) => i.route);
    const traceRoutes = MODULE_CATALOG.trace.routes;
    expect(routes.some((r: string) => traceRoutes.includes(r))).toBe(true);
  });

  it('mục quét Trace đi qua cùng phép lọc — dù hôm nay nó là route HOST', () => {
    // ⚠ Bài này KHÔNG phân biệt được gì ở cấu hình hôm nay, và nói ra là cố ý.
    // `TraceScan` không nằm trong `routes` của manifest module trace — nó là màn
    // của host shell (quét tiêu dùng, dành cho người MUA chứ không phải người
    // làm vườn). Nên nó tới được kể cả khi module trace tắt, và bài này xanh cả
    // khi phép lọc bị gỡ.
    //
    // Giữ lại vì mục này đi vào cổng bằng đường RIÊNG (`TRACE_SCAN_ROUTE`),
    // không qua `slotPriority`: ngày nó chuyển về thuộc module trace, bài này là
    // thứ bắt được. Ghi rõ mức canh hiện tại để không ai đọc nó thành một phép
    // canh đang có tác dụng.
    const items = resolveGateItems(NO_FARM);
    const scan = items.find((i: { prominent?: boolean }) => i.prominent);
    if (scan) {
      const owner = ownerOf(scan.route);
      expect(owner === null || enabled.includes(owner)).toBe(true);
    }
  });

  it('hành động nhanh trong arc con cũng TỚI ĐƯỢC', () => {
    // `subActions` trỏ route ĐÍCH THẬT. Một mục cha còn sống mà hành động con
    // trỏ sang module đã tắt là hỏng câm ở tầng sâu hơn: người dùng kéo, thả
    // trúng, và không có gì xảy ra.
    //
    // ⚠ Cùng mức canh với bài trên: hôm nay mọi route đích trong `SUB_ACTIONS`
    // đều là route host (`TreeIdentity`, `AnimalIdentity`, `Notifications`…),
    // nên bài này cũng xanh khi gỡ phép lọc. Nó canh cho ngày `SUB_ACTIONS` trỏ
    // sang route của một module khác — chỗ đó không có phép canh nào khác.
    const items = resolveGateItems(NO_FARM);
    items.forEach((it: { subActions?: Array<{ route: string }> }) => {
      (it.subActions ?? []).forEach((sub) => {
        const owner = ownerOf(sub.route);
        if (owner === null) return;
        expect(enabled).toContain(owner);
      });
    });
  });
});
