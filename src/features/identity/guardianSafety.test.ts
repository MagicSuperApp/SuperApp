// features/identity/guardianSafety.test.ts
//
// CANH CÂU CHỮ, KHÔNG CANH CON SỐ.
//
// Chia mức theo số người bảo hộ là phần dễ và phần khó đánh rơi. Phần dễ rơi nằm ở
// hai chỗ khác, và cả hai đều rơi lặng lẽ trong một lượt sửa "cho gọn":
//
//   1. mức cao nhất bị thêm chữ "an toàn" / "đủ" / "yên tâm" — lúc đó phép đo SỐ
//      LƯỢNG đang trả lời hộ câu về CHẤT LƯỢNG, thứ app không đo được;
//   2. dòng "app chưa kiểm được" bị bỏ ở mức cao nhất vì trông không cần — mà đó
//      đúng là mức cần nó nhất, vì con số ở đó dễ bị đọc thành một lời bảo đảm.

import { describeGuardianSafety } from './guardianSafety';

describe('mức an toàn theo số người bảo hộ', () => {
  it('0 người ⟹ nói thẳng chưa ai khôi phục hộ được', () => {
    const s = describeGuardianSafety(0);
    expect(s.level).toBe('none');
    expect(s.headline).toMatch(/chưa ai/i);
  });

  it('1 người ⟹ nói rõ cả đường khôi phục dựa vào một người', () => {
    const s = describeGuardianSafety(1);
    expect(s.level).toBe('single-point');
    expect(s.body).toMatch(/thứ hai/i);
  });

  it('2 người ⟹ vẫn mỏng, và mời người thứ ba', () => {
    const s = describeGuardianSafety(2);
    expect(s.level).toBe('thin');
    expect(s.body).toMatch(/thứ ba/i);
  });

  it('3 người trở lên ⟹ cùng một mức, và nêu đúng con số', () => {
    expect(describeGuardianSafety(3).level).toBe('spread');
    expect(describeGuardianSafety(5).level).toBe('spread');
    expect(describeGuardianSafety(3).headline).toContain('3');
    expect(describeGuardianSafety(5).headline).toContain('5');
  });

  it('con số vô nghĩa KHÔNG được thành một mức yên tâm hơn thực tế', () => {
    for (const bad of [-1, -99, Number.NaN, 0.4]) {
      expect(describeGuardianSafety(bad).level).toBe('none');
    }
  });
});

describe('câu chữ — chỗ phép đo dễ nói quá điều nó biết', () => {
  it('KHÔNG mức nào được nói "an toàn" / "đủ" / "yên tâm"', () => {
    // App đếm được NGƯỜI, không đo được việc từng người có tự giữ nổi tài khoản của
    // họ. Nói "an toàn" là lấy phép đo của câu này trả lời cho câu kia.
    const cam = /an toàn|đã đủ|yên tâm|bảo đảm|chắc chắn/i;
    for (const n of [0, 1, 2, 3, 5, 9]) {
      const s = describeGuardianSafety(n);
      expect(s.headline).not.toMatch(cam);
      expect(s.body).not.toMatch(cam);
    }
  });

  it('dòng "app chưa kiểm được" có ở MỌI mức, kể cả mức cao nhất', () => {
    for (const n of [0, 1, 2, 3, 5, 9]) {
      const s = describeGuardianSafety(n);
      expect(s.unmeasured).toMatch(/chưa kiểm được/i);
      // Và nó phải nói ra HỆ QUẢ, không chỉ nói là chưa kiểm: người bảo hộ chưa lập
      // xác thực thì chính họ mất tài khoản, và lời nhờ mất theo.
      expect(s.unmeasured).toMatch(/mất theo|cũng có thể mất/i);
    }
  });

  it('dòng "chưa kiểm được" GIỐNG NHAU ở mọi mức — không có bản nhạt hơn', () => {
    // Viết lại câu đó ở từng mức là mở khe cho mức người dùng đọc nhiều nhất thành
    // mức nói nhẹ nhất.
    const all = [0, 1, 2, 3, 5, 9].map(n => describeGuardianSafety(n).unmeasured);
    expect(new Set(all).size).toBe(1);
  });

  it('mức cao nhất vẫn mời thêm người, không đóng lại câu chuyện', () => {
    expect(describeGuardianSafety(3).body).toMatch(/càng nhiều|nhiều nơi/i);
  });
});
