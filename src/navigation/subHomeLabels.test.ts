// navigation/subHomeLabels.test.ts
//
// SG9 §5 — kiểm chứng xếp hạng tab con: top-N mặc định theo thứ tự khai, usage
// re-rank, ghim đè, và khớp ví dụ spec (Chat/Farm).

import {
  rankSubTabs,
  subNational,
  subEn,
  SUBHOME_FRAME,
  type SubTab,
} from './subHomeLabels';

const CHAT = SUBHOME_FRAME.ChatHome;
const FARM = SUBHOME_FRAME.Farms;
const keys = (tabs: SubTab[]) => tabs.map((t) => t.key);

describe('rankSubTabs — mặc định (chưa có usage)', () => {
  it('Chat: hiện Chats·Calls·Pins + ⌄(Docs) — khớp ví dụ spec', () => {
    const { visible, overflow } = rankSubTabs(CHAT);
    expect(keys(visible)).toEqual(['chats', 'calls', 'pins']);
    expect(keys(overflow)).toEqual(['docs']);
  });

  it('Farm: hiện Garden·Trees·Care + ⌄(Carbon) — khớp ví dụ spec', () => {
    const { visible, overflow } = rankSubTabs(FARM);
    expect(keys(visible)).toEqual(['garden', 'trees', 'care']);
    expect(keys(overflow)).toEqual(['carbon']);
  });
});

describe('rankSubTabs — usage re-rank', () => {
  it('Docs dùng nhiều → lên khung, đẩy tab ít dùng nhất xuống', () => {
    const { visible, overflow } = rankSubTabs(CHAT, { docs: 10, pins: 0 });
    expect(keys(visible)).toContain('docs');
    expect(keys(overflow)).toEqual(['pins']);
  });

  it('usage bằng nhau → giữ thứ tự khai báo (ổn định)', () => {
    const { visible } = rankSubTabs(CHAT, { chats: 2, calls: 2, pins: 2, docs: 2 });
    expect(keys(visible)).toEqual(['chats', 'calls', 'pins']);
  });
});

describe('rankSubTabs — ghim đè', () => {
  it('ghim Carbon → luôn hiển thị dù usage thấp', () => {
    const { visible, overflow } = rankSubTabs(FARM, { garden: 9, trees: 9, care: 9 }, ['carbon']);
    expect(keys(visible)).toContain('carbon');
    expect(keys(visible)[0]).toBe('carbon'); // ghim đứng đầu
    expect(keys(overflow)).toHaveLength(1);
  });

  it('ghim nhiều → theo thứ tự ghim', () => {
    const { visible } = rankSubTabs(FARM, {}, ['carbon', 'care']);
    expect(keys(visible).slice(0, 2)).toEqual(['carbon', 'care']);
  });
});

describe('rankSubTabs — biên', () => {
  it('ít tab hơn visibleCount → overflow rỗng, không lỗi', () => {
    const two = CHAT.slice(0, 2);
    const { visible, overflow } = rankSubTabs(two);
    expect(keys(visible)).toEqual(['chats', 'calls']);
    expect(overflow).toEqual([]);
  });

  it('visibleCount tuỳ biến', () => {
    const { visible, overflow } = rankSubTabs(CHAT, {}, null, 2);
    expect(visible).toHaveLength(2);
    expect(overflow).toHaveLength(2);
  });
});

describe('nhãn song ngữ', () => {
  it('EN vẫn là nhãn CHUẨN', () => {
    expect(subEn(CHAT[0])).toBe('Chats');
  });
  // Tham số `lang` truyền TƯỜNG MINH: mặc định của subNational là ngôn ngữ app
  // đang đặt (i18n), nên bỏ trống sẽ khiến test phụ thuộc DEFAULT_LANG.
  it('quốc gia = tooltip (vi)', () => {
    expect(subNational(CHAT[0], 'vi')).toBe('Trò chuyện');
    // Nhãn Việt của tab Carbon là "Tín chỉ" — người trồng cây không đọc chữ "Carbon"
    // ra nghĩa gì; dòng chuẩn phía trên vẫn là "Carbon".
    expect(subNational(FARM[3], 'vi')).toBe('Tín chỉ');
  });

  it('quốc gia = tooltip (zh)', () => {
    expect(subNational(CHAT[0], 'zh')).toBe('聊天');
    expect(subNational(FARM[0], 'zh')).toBe('果园');
  });

  it('app đặt tiếng Anh → tooltip rơi về chính nhãn EN', () => {
    expect(subNational(CHAT[0], 'en')).toBe('Chats');
  });
});
