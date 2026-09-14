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
  // Bảng nền đổi 13/09/2026: `ChatHome` thôi làm NEO trái (ô đó nay là Ví) nên
  // nó vào bảng ưu tiên và tranh SLOT như mọi module. Ba bài dưới đo đúng hệ
  // quả đó — chúng đỏ khi chính sách đổi là ĐÚNG VIỆC của chúng, nên chỗ sửa
  // là kỳ vọng, không phải nới lỏng phép so.
  it('user mới (∅): Ví · Farm · Home · Chat · Me (Work/Join vào cổng)', () => {
    expect(resolveVisibleTabs(NO_FARM, {}, null)).toEqual([
      NEO_LEFT, 'Farms', NEO_CENTER, 'ChatHome', NEO_RIGHT,
    ]);
  });

  it('nông dân: giống chuẩn — Farm nổi cạnh Home', () => {
    expect(resolveVisibleTabs({ farms: 2, trees: 10, fruits: 0 }, {}, null)).toEqual([
      NEO_LEFT, 'Farms', NEO_CENTER, 'ChatHome', NEO_RIGHT,
    ]);
  });

  it('shipper: Work + Chat lên thanh, Farm/Join lùi vào cổng', () => {
    expect(resolveVisibleTabs(NO_FARM, { WorkHome: 9 }, null)).toEqual([
      NEO_LEFT, 'WorkHome', NEO_CENTER, 'ChatHome', NEO_RIGHT,
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
    // Chỉ trace(Farm) bật — không chat/work/join. Ví và Home/Me là màn HOST nên
    // chúng có mặt ở mọi instance, không cờ module nào tắt được.
    const avail = (r: string) =>
      [NEO_LEFT, 'Farms', 'Home', 'Account'].includes(r);
    expect(resolveVisibleTabs(NO_FARM, {}, null, avail)).toEqual([
      NEO_LEFT, 'Farms', NEO_CENTER, NEO_RIGHT,
    ]);
  });

  it('ô trái vắng (giả định module) thì thanh vẫn cân, không có ô rỗng', () => {
    // Ca đối xứng của bài trên. Nó đo đúng thứ CheckFarm đã sống suốt thời gian
    // chat bị tắt: NEO trái không dựng được thì hàng còn bốn ô, KHÔNG phải năm ô
    // với một chỗ trống. Giữ bài này để lần sau ai đó đặt một module vào NEO thì
    // hệ quả lộ ra ở đây chứ không lộ ở màn hình người dùng.
    const avail = (r: string) => ['Farms', 'Home', 'ChatHome', 'Account'].includes(r);
    const tabs = resolveVisibleTabs(NO_FARM, {}, null, avail);
    expect(tabs).toEqual(['Farms', NEO_CENTER, 'ChatHome', NEO_RIGHT]);
    expect(tabs).not.toContain(undefined);
  });
});
