// components/genie/genieHistory.test.ts
//
// Đọc lại lịch sử từ máy.
//
// Bản ghi trên máy là thứ DUY NHẤT trong trợ lý mà phiên bản sau phải đọc của
// phiên bản trước. Một bản cũ, một bản dở dang vì máy hết pin giữa lúc ghi, một
// bản của bản dựng thử — cả ba đều sẽ gặp ngoài đời, và cả ba đều KHÔNG được
// phép làm đổ màn hình trợ lý. Nên luật ở đây là: rác thì BỎ, không ném.

import { parseSections, worthKeeping } from './genieHistory';
import { MAX_SECTIONS, SECTION_NEW_TITLE, type GenieSection } from './genieController';

const cuoc = (over: Partial<GenieSection> = {}): GenieSection => ({
  id: 'g1',
  title: 'thêm vườn',
  at: 1_700_000_000_000,
  touched: 1_700_000_000_500,
  messages: [{ id: 'g2', from: 'user', text: 'thêm vườn', at: 1_700_000_000_000 }],
  ...over,
});

describe('cuộc nào ĐÁNG ghi', () => {
  it('có câu thì giữ', () => {
    expect(worthKeeping(cuoc())).toBe(true);
  });

  it('cuộc TRỐNG thì không — nó chỉ là dấu vết của một lần mở lớp rồi đổi ý', () => {
    // Ghi nó xuống là để lần sau mở panel ra gặp một danh sách toàn dòng trống.
    expect(worthKeeping(cuoc({ messages: [] }))).toBe(false);
  });
});

describe('đọc lại bản ghi', () => {
  it('bản ghi đúng đọc ra nguyên vẹn', () => {
    const [s] = parseSections(JSON.stringify([cuoc()]));
    expect(s.id).toBe('g1');
    expect(s.title).toBe('thêm vườn');
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].from).toBe('user');
  });

  it('chưa có gì trên máy ⇒ danh sách rỗng, không ném', () => {
    expect(parseSections(null)).toEqual([]);
    expect(parseSections('')).toEqual([]);
  });

  it('bản ghi DỞ DANG (máy tắt giữa lúc ghi) ⇒ bỏ, không ném', () => {
    expect(parseSections('[{"id":"g1","messa')).toEqual([]);
  });

  it('bản ghi không phải danh sách ⇒ bỏ', () => {
    expect(parseSections('{"id":"g1"}')).toEqual([]);
    expect(parseSections('"xin chào"')).toEqual([]);
  });

  it('phần tử hỏng bị LOẠI, phần tử lành vẫn về', () => {
    // Bỏ cả danh sách chỉ vì một dòng hỏng là mất luôn những cuộc còn đọc được.
    const raw = JSON.stringify([null, { id: 5 }, { id: 'g9', messages: 'không phải mảng' }, cuoc()]);
    const out = parseSections(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('g1');
  });

  it('thiếu tên thì đặt tên mặc định, không để trống', () => {
    const [s] = parseSections(JSON.stringify([cuoc({ title: '   ' })]));
    expect(s.title).toBe(SECTION_NEW_TITLE);
  });

  it('`from` lạ đọc thành `agent` — không để lọt một vai thứ ba vào dòng tin', () => {
    const raw = JSON.stringify([
      cuoc({ messages: [{ id: 'g2', from: 'system' as never, text: 'x', at: 1 }] }),
    ]);
    expect(parseSections(raw)[0].messages[0].from).toBe('agent');
  });

  it('bản ghi phình to vẫn bị CẮT về trần', () => {
    // Đây là bộ nhớ trên máy người dùng, không phải một kho lưu.
    const nhieu = Array.from({ length: MAX_SECTIONS + 15 }, (_, i) => cuoc({ id: `g${i + 100}` }));
    expect(parseSections(JSON.stringify(nhieu))).toHaveLength(MAX_SECTIONS);
  });

  it('cuộc trống trong bản ghi cũ cũng bị loại lúc đọc', () => {
    expect(parseSections(JSON.stringify([cuoc({ messages: [] })]))).toEqual([]);
  });
});
