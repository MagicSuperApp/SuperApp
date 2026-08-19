/**
 * Bài kiểm KHOÁ LẠI: KHÔNG mục nào trên cổng xoè được để tên rỗng.
 *
 * Mục "quét" là mục NỔI BẬT (`prominent`), to nhất, nằm chính giữa cung — và nó
 * là mục duy nhất từng có `label: ''`. Tức thứ dễ thấy nhất trên cổng lại là thứ
 * duy nhất không có tên. Lỗi này không bao giờ làm gãy `tsc` (chuỗi rỗng vẫn là
 * `string`) và không màn nào ném lỗi, nên chỉ có bài kiểm mới bắt được.
 *
 * Kiểm cả mục CON: đó là nơi "Quét cây" sống, và nếu nó mất tên thì tính năng cốt
 * lõi của sản phẩm thành một ô trống trên vòng cung.
 */

import { resolveGateItems } from './resolveGateItems';

const FARM_SIGNALS = [
  { farms: 0, trees: 0, fruits: 0 },
  { farms: 2, trees: 37, fruits: 140 },
];

describe('cổng xoè — mọi mục phải có tên', () => {
  it.each(FARM_SIGNALS)('persona theo tín hiệu %j', (signal) => {
    const items = resolveGateItems(signal, {});
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.label.trim()).not.toBe('');
      for (const sub of it.subActions ?? []) {
        expect(sub.label.trim()).not.toBe('');
      }
    }
  });
});
