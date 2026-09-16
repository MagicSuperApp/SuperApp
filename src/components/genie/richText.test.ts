// components/genie/richText.test.ts
//
// Bộ đọc `**đậm**` của câu trợ lý.
//
// Đây là chỗ sửa một lỗi NGƯỜI DÙNG THẤY: playbook viết tên nút bằng hai dấu
// sao, và trước bản vá thì bác nông dân đọc được nguyên văn
//
//     Bác chọn **Tự động ghi** thì cứ đi vòng quanh vườn…
//
// rồi đi tìm một cái nút tên là "**Tự động ghi**".

import { parseBold } from './RichText';

const noiLai = (s: string) => parseBold(s).map((x) => x.text).join('');

describe('parseBold', () => {
  it('tách đúng đoạn đậm, và bỏ dấu sao khỏi chữ hiện ra', () => {
    expect(parseBold('Bác chọn **Tự động ghi** nhé')).toEqual([
      { text: 'Bác chọn ', bold: false },
      { text: 'Tự động ghi', bold: true },
      { text: ' nhé', bold: false },
    ]);
  });

  it('nhiều đoạn đậm trong một câu — ca thường của playbook', () => {
    const s = 'Chọn **Tự động ghi** hoặc **Tự vẽ điểm** ạ';
    const segs = parseBold(s);
    expect(segs.filter((x) => x.bold).map((x) => x.text)).toEqual([
      'Tự động ghi',
      'Tự vẽ điểm',
    ]);
    expect(noiLai(s)).toBe('Chọn Tự động ghi hoặc Tự vẽ điểm ạ');
  });

  it('câu không có dấu sao thì đi qua nguyên vẹn, một đoạn', () => {
    const segs = parseBold('Em mở danh sách vườn của bác rồi ạ.');
    expect(segs).toHaveLength(1);
    expect(segs[0].bold).toBe(false);
  });

  it('dấu sao LẺ hiện nguyên văn, KHÔNG nuốt im', () => {
    // Nuốt im nghĩa là một câu hỏng hiện ra như một câu bình thường, và không ai
    // biết playbook đang thiếu một dấu sao đóng.
    expect(noiLai('giá 5 ** 2')).toBe('giá 5 ** 2');
    expect(parseBold('**chưa đóng').every((x) => !x.bold)).toBe(true);
  });

  it('cặp rỗng và dấu sao chồng không sinh đoạn đậm rỗng', () => {
    expect(parseBold('****').every((x) => !x.bold)).toBe(true);
    for (const s of ['***x***', 'a ** ** b', '*một sao*']) {
      expect(noiLai(s)).toBe(s);
    }
  });

  it('chuỗi rỗng / null không làm vỡ', () => {
    expect(parseBold('')).toEqual([]);
    expect(parseBold(undefined as unknown as string)).toEqual([]);
  });

  it('KHÔNG mất một ký tự nào — chữ hiện ra chỉ thiếu đúng các dấu sao đã ghép cặp', () => {
    const cases = [
      'Bác chọn **Tự động ghi** thì cứ đi vòng quanh vườn, máy tự chấm điểm.',
      'Em mở ví cho bác rồi ạ. Từ đây em dừng.',
      'Bấm **Nhận diện nhãn** rồi **Chụp lại** nếu mờ.',
    ];
    for (const s of cases) {
      expect(noiLai(s)).toBe(s.replace(/\*\*([^*]+)\*\*/g, '$1'));
    }
  });
});

describe('sổ playbook thật đều đọc được', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GENIE_PLAYBOOKS } = require('../../services/genie/playbooks.generated');

  it('mọi chuỗi đậm trong câu playbook đều ghép cặp đúng, và khớp một nhãn nút', () => {
    for (const pb of GENIE_PLAYBOOKS) {
      const segs = parseBold(pb.say);
      // Không còn dấu sao nào sót lại trong chữ hiện ra.
      expect(segs.map((s) => s.text).join('')).not.toMatch(/\*/);

      const nhan = new Set(pb.anchors.map((a: { label: string }) => a.label));
      for (const s of segs.filter((x) => x.bold)) {
        expect(nhan.has(s.text)).toBe(true);
      }
    }
  });
});
