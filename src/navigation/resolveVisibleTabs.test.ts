// navigation/resolveVisibleTabs.test.ts
//
// SG9 §2 — kiểm chứng resolver thuần: NEO cố định + 2 slot thích ứng persona,
// ghim đè persona, và lọc theo route có mặt (instance suy biến).

import {
  resolvePersona,
  resolveVisibleTabs,
  NEO_LEFT,
  NEO_CENTER,
  NEO_RIGHT,
} from './resolveVisibleTabs';

const NO_FARM = { farms: 0, trees: 0, fruits: 0 };

describe('resolvePersona', () => {
  it('có vườn/cây/quả → farmer', () => {
    expect(resolvePersona({ farms: 1, trees: 0, fruits: 0 }, {})).toBe('farmer');
    expect(resolvePersona({ farms: 0, trees: 3, fruits: 0 }, {})).toBe('farmer');
    expect(resolvePersona({ farms: 0, trees: 0, fruits: 2 }, {})).toBe('farmer');
  });

  it('không farm + dùng Work → shipper', () => {
    expect(resolvePersona(NO_FARM, { WorkHome: 5 })).toBe('shipper');
    expect(resolvePersona(NO_FARM, { WorkHome: 5, Farms: 5 })).toBe('shipper');
  });

  it('không farm, quan tâm Farm hơn Work → new', () => {
    expect(resolvePersona(NO_FARM, { WorkHome: 1, Farms: 4 })).toBe('new');
  });

  it('không dữ liệu → new', () => {
    expect(resolvePersona(NO_FARM, {})).toBe('new');
  });
});

describe('resolveVisibleTabs', () => {
  it('user mới (∅): Chat · Farm · Home · Work · Me (Join vào cổng)', () => {
    expect(resolveVisibleTabs(NO_FARM, {}, null)).toEqual([
      NEO_LEFT, 'Farms', NEO_CENTER, 'WorkHome', NEO_RIGHT,
    ]);
  });

  it('nông dân: giống chuẩn — Farm nổi cạnh Home', () => {
    expect(resolveVisibleTabs({ farms: 2, trees: 10, fruits: 0 }, {}, null)).toEqual([
      NEO_LEFT, 'Farms', NEO_CENTER, 'WorkHome', NEO_RIGHT,
    ]);
  });

  it('shipper: Work + Join lên thanh, Farm lùi vào cổng', () => {
    expect(resolveVisibleTabs(NO_FARM, { WorkHome: 9 }, null)).toEqual([
      NEO_LEFT, 'WorkHome', NEO_CENTER, 'JoinHome', NEO_RIGHT,
    ]);
  });

  it('NEO luôn cố định ở đầu/giữa/cuối bất kể persona', () => {
    for (const tabs of [
      resolveVisibleTabs(NO_FARM, {}, null),
      resolveVisibleTabs(NO_FARM, { WorkHome: 9 }, null),
      resolveVisibleTabs({ farms: 1, trees: 0, fruits: 0 }, {}, null),
    ]) {
      expect(tabs[0]).toBe(NEO_LEFT);
      expect(tabs[2]).toBe(NEO_CENTER);
      expect(tabs[tabs.length - 1]).toBe(NEO_RIGHT);
    }
  });

  it('ghim đè persona (shipper vẫn thấy Farm nếu ghim Farm)', () => {
    expect(resolveVisibleTabs(NO_FARM, { WorkHome: 9 }, ['Farms', 'WorkHome'])).toEqual([
      NEO_LEFT, 'Farms', NEO_CENTER, 'WorkHome', NEO_RIGHT,
    ]);
  });

  it('ghim thiếu ô → bù bằng ưu tiên mặc định, không trùng NEO/lặp', () => {
    expect(resolveVisibleTabs(NO_FARM, {}, ['JoinHome'])).toEqual([
      NEO_LEFT, 'JoinHome', NEO_CENTER, 'Farms', NEO_RIGHT,
    ]);
  });

  it('ghim trùng NEO bị loại (Account/Home không thể là slot)', () => {
    expect(resolveVisibleTabs(NO_FARM, {}, ['Account', 'Home', 'WorkHome'])).toEqual([
      NEO_LEFT, 'WorkHome', NEO_CENTER, 'Farms', NEO_RIGHT,
    ]);
  });

  it('instance suy biến: slot chưa bật bị bỏ, thanh vẫn cân', () => {
    // Chỉ trace(Farm)+proofchat(Chat) bật — không work/join.
    const avail = (r: string) =>
      ['ProofChatHome', 'Farms', 'Home', 'Account'].includes(r);
    expect(resolveVisibleTabs(NO_FARM, {}, null, avail)).toEqual([
      NEO_LEFT, 'Farms', NEO_CENTER, NEO_RIGHT,
    ]);
  });
});
