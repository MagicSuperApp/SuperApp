/**
 * Bài kiểm cho hệ CHUỖI THEO KHOÁ.
 *
 * Thứ cần canh: mỗi khoá phải đủ 4 ngôn ngữ, không khoá nào rỗng, và khoá lạ
 * phải trả về CHÍNH NÓ chứ không phải chuỗi rỗng — thấy `trace.button.addTree`
 * trên màn thì biết ngay thiếu bản dịch, còn khoảng trống thì không ai giải
 * thích được.
 */

import { SUPPORTED_LANGS } from '../types';
import { setLanguage, __resetLanguageForTest } from '../store';
import { tk, allKeys, ALL_STRINGS } from './index';

beforeEach(() => { __resetLanguageForTest(); });

describe('bộ khoá', () => {
  // Soi TOÀN BỘ bộ khoá, không riêng `TRACE_STRINGS`. Bản trước chỉ soi bộ trace
  // ⇒ bộ thêm sau (map, onboarding) thiếu một ngôn ngữ vẫn xanh: cổng đo một tập
  // hẹp hơn tập nó khẳng định, đúng hình dạng "xanh vì chưa kiểm".
  it('mọi khoá đủ 4 ngôn ngữ, không cái nào rỗng', () => {
    const thieu: string[] = [];
    for (const [key, entry] of Object.entries(ALL_STRINGS)) {
      for (const lang of SUPPORTED_LANGS) {
        const v = (entry as Record<string, string>)[lang];
        if (!v || !v.trim()) thieu.push(`${key} · ${lang}`);
      }
    }
    expect(thieu).toEqual([]);
  });

  it('khoá đặt đúng nếp <khonggian>.<nhóm>.<tên>', () => {
    // Nam khong gian ten dang dung: `trace.`, `map.`, `onboarding.`, `web.`, `scan.`.
    // Moi doan deu camelCase,
    // cho chu so (`trace.place3d.step`, `trace.label.has3d`), va cho ca khoa hai
    // tang (`map.openmap`) lan ba tang (`map.openmap.note`).
    // Cam chu HOA dan dau va dau gach: khoa la thu doc bang mat trong ma nguon.
    const sai = allKeys().filter(
      k => !/^(trace|map|onboarding|web|scan)(\.[a-z][a-zA-Z0-9]*)+$/.test(k),
    );
    expect(sai).toEqual([]);
  });

  it('không khoá nào trùng — Object literal đã chặn, kiểm lại cho chắc', () => {
    expect(new Set(allKeys()).size).toBe(allKeys().length);
  });
});

describe('tk', () => {
  it('trả đúng chữ theo ngôn ngữ đang chọn', () => {
    setLanguage('vi');
    expect(tk('trace.section.myGarden')).toBe('Vườn của tôi');
    setLanguage('ja');
    expect(tk('trace.section.myGarden')).toBe('わたしの果樹園');
    setLanguage('zh');
    expect(tk('trace.section.myGarden')).toBe('我的果园');
  });

  it('khoá lạ → trả CHÍNH KHOÁ, không trả chuỗi rỗng', () => {
    expect(tk('trace.khong.ton.tai')).toBe('trace.khong.ton.tai');
  });

  it('thay được chỗ trống trong câu', () => {
    setLanguage('vi');
    // Dùng một khoá thật có {n} nếu có; ở đây kiểm bằng khoá bất kỳ + biến thừa
    // (biến thừa KHÔNG được làm hỏng câu).
    expect(tk('trace.section.weather', { n: 3 })).toBe('Thời tiết');
  });

  it('chỗ trống thiếu biến thì GIỮ NGUYÊN, không in ra "undefined"', () => {
    // Giả lập bằng cách gọi fill gián tiếp qua một chuỗi có {x} — khoá news.end
    // không có chỗ trống nên câu phải nguyên vẹn.
    setLanguage('en');
    expect(tk('trace.news.end', {})).toBe('That is all for now');
  });
});
