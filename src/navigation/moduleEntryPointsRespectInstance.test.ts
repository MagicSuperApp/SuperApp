/**
 * Ghim MỘT điều: KHÔNG lối vào nào được mở một module mà app đang dựng không khai.
 *
 * Cơ chế chọn module (`InstanceConfig.modules`, 2026-09-10) chỉ có giá trị bằng lối
 * vào YẾU NHẤT của nó. Đo trên máy ảo 2026-09-14: CheckFarm tắt `chat` thì thanh tab
 * bỏ Chat, cổng xoè bỏ Chat, nhưng khu "Dịch vụ" ở **màn chính** vẫn hiện thẻ
 * "TRÒ CHUYỆN" và bấm vào vẫn mở được — vì `HomeScreen` dựng lưới thẳng từ
 * `src/modules/index.ts`, một danh mục của NỀN với `available: true` cố định, không
 * hỏi cấu hình lần nào.
 *
 * Ba lối vào, ba tệp, cùng một điều kiện chép tay — và đúng một chỗ quên. Đó là lý do
 * `routeIsReachable` nay là hàm dùng chung ở `moduleCatalog`, và là lý do bài này đếm
 * lối vào thay vì kiểm từng cái một.
 *
 * Hậu quả nếu để hở: với Apple guideline 1.2, tắt một module nội dung-do-người-dùng
 * mà lối vào lớn nhất vẫn mở thì việc tắt không có tác dụng nào.
 */
import fs from 'fs';
import path from 'path';
import { MODULE_IDS } from './moduleIds';
import { moduleOwningRoute, routeIsReachable } from './moduleCatalog';
import { MODULES } from '../modules';
import { INSTANCES, ENABLED_MODULES } from '../config/instance.config';
import { resolveGateItems } from './resolveGateItems';

describe('routeIsReachable — phép hỏi dùng chung, và nó phân biệt được hai cực', () => {
  it('route của module ĐÃ khai thì tới được; route của module KHÔNG khai thì không', () => {
    // Đầu vào phải phân biệt hai bên, nếu không bài này chẳng kiểm gì.
    expect(routeIsReachable('ChatHome', ['chat'])).toBe(true);
    expect(routeIsReachable('ChatHome', ['trace'])).toBe(false);
  });

  it('route của HOST không thuộc module nào ⟹ luôn tới được, kể cả khi tập rỗng', () => {
    for (const r of ['Home', 'Account', 'PhoenixWallet']) {
      expect(moduleOwningRoute(r)).toBeNull();
      expect(routeIsReachable(r, [])).toBe(true);
    }
  });
});

describe('MỌI lối vào của app đang dựng đều tôn trọng lời khai `modules`', () => {
  const tatCa = [...MODULE_IDS];
  const daKhai = [...ENABLED_MODULES];
  const khongKhai = tatCa.filter(m => !daKhai.includes(m));

  it('bài này chỉ có nghĩa khi app đang dựng CÓ tắt ít nhất một module', () => {
    // Ghi ra thay vì im lặng: nếu app đang dựng bật hết thì hai bài dưới xanh vì
    // không có gì để bắt, chứ không phải vì cổng chặt. Forall §Kỷ luật phát ngôn 6.
    if (khongKhai.length === 0) {
      console.warn('[moduleEntryPoints] app đang dựng bật MỌI module ⟹ hai bài dưới không phân biệt được hai cực');
    }
    expect(tatCa.length).toBeGreaterThan(0);
  });

  it('CỔNG XOÈ không nêu route của module không khai', () => {
    const items = resolveGateItems({ farms: 0, trees: 0, fruits: 0 });
    const routes = items.flatMap(i => [i.route, ...(i.subActions ?? []).map(a => a.route)]);
    for (const r of routes) {
      const owner = moduleOwningRoute(r);
      if (owner !== null) expect(daKhai).toContain(owner);
    }
  });

  it('LƯỚI "Dịch vụ" ở màn chính lọc theo cùng phép hỏi đó', () => {
    // `VISIBLE_MODULES` là hằng cấp module trong `HomeScreen.tsx`, không xuất ra —
    // dựng cả màn đó trong jest thì kéo theo máy ảnh, ví, bản đồ. Nên đo hai vế:
    //   (1) phép lọc CÓ MẶT trong tệp, và lưới dùng bản đã lọc;
    //   (2) tập đã lọc tính được ở đây ra đúng kết quả mong đợi.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.tsx'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    expect(src).toMatch(/MODULES\.filter\(\s*\n?\s*m => routeIsReachable\(m\.routeName, ENABLED_MODULES\)/);
    // Lưới PHẢI vẽ từ bản đã lọc, không vẽ từ danh mục của nền.
    expect(src).toMatch(/\{VISIBLE_MODULES\.map\(/);
    expect(src).not.toMatch(/\{MODULES\.map\(/);

    const loc = MODULES.filter(m => routeIsReachable(m.routeName, daKhai));
    for (const m of loc) {
      const owner = moduleOwningRoute(m.routeName);
      if (owner !== null) expect(daKhai).toContain(owner);
    }
    // Và mỗi module KHÔNG khai phải biến mất thật khỏi lưới — vế này là vế bắt lỗi.
    for (const m of khongKhai) {
      expect(loc.map(x => moduleOwningRoute(x.routeName))).not.toContain(m);
    }
  });
});

describe('mỗi instance khai `modules` đều lọc được lưới — không phụ thuộc app đang dựng', () => {
  it('với MỌI app trong bảng, lưới lọc ra đúng tập module nó khai', () => {
    for (const id of Object.keys(INSTANCES)) {
      const inst = INSTANCES[id];
      const khai = inst.modules === 'all' ? [...MODULE_IDS] : [...inst.modules];
      const loc = MODULES.filter(m => routeIsReachable(m.routeName, khai));
      const ownersConLai = loc.map(m => moduleOwningRoute(m.routeName)).filter(Boolean);
      for (const o of ownersConLai) expect(khai).toContain(o);
      // Không được lọc quá tay: mọi module đã khai phải còn một thẻ trong lưới.
      for (const m of khai) {
        expect(ownersConLai).toContain(m);
      }
    }
  });
});
