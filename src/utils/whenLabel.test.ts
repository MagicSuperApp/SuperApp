/**
 * Bài kiểm cho nhãn ngày tương đối trong hộp "còn ảnh chụp dở".
 *
 * Hộp thoại đó canh một hành động BẤT KHẢ HỒI (bỏ nháp = mất cả vòng đi quanh
 * cây, chụp lại không lấy lại được). Người dùng chỉ quyết đúng khi biết bản nháp
 * cũ tới mức nào — nên nhãn này sai là hỏng đúng chỗ đắt nhất.
 *
 * Bẫy đã tránh: so theo hiệu số mili-giây thay vì theo ĐẦU NGÀY. 23h hôm qua tới
 * 1h hôm nay chỉ cách 2 tiếng — cách tính kia trả "hôm nay", trong khi với người
 * dùng đó là ảnh của HÔM QUA.
 */

import { setLanguage } from '../i18n/store';
import { whenLabel } from './whenLabel';

// Ngôn ngữ mặc định lúc chạy bài kiểm là tiếng Anh; bài này kiểm CÂU CHỮ nên phải
// ghim ngôn ngữ, không thì nó xanh/đỏ theo cấu hình chứ không theo mã.
beforeAll(() => { setLanguage('vi'); });

// Trưa 18/08/2026, giờ máy.
const NOW = new Date(2026, 7, 18, 12, 0, 0).getTime();
const at = (d: number, h: number) => new Date(2026, 7, d, h, 0, 0).getTime();

describe('whenLabel', () => {
  it('cùng ngày → "hôm nay"', () => {
    expect(whenLabel(at(18, 7), NOW)).toBe('hôm nay');
    expect(whenLabel(at(18, 23), NOW)).toBe('hôm nay');
  });

  it('ngày trước → "hôm qua", kể cả khi chỉ cách 2 tiếng', () => {
    expect(whenLabel(at(17, 8), NOW)).toBe('hôm qua');
    // 23h hôm qua → 1h hôm nay: 2 tiếng, nhưng vẫn là hôm qua.
    expect(whenLabel(at(17, 23), new Date(2026, 7, 18, 1, 0, 0).getTime())).toBe('hôm qua');
  });

  it('xa hơn → đếm ngày', () => {
    expect(whenLabel(at(15, 9), NOW)).toBe('3 ngày trước');
    expect(whenLabel(at(4, 9), NOW)).toBe('14 ngày trước');
  });

  it('không có mốc → "hôm nay", không bịa số', () => {
    expect(whenLabel(undefined, NOW)).toBe('hôm nay');
    expect(whenLabel(null, NOW)).toBe('hôm nay');
    expect(whenLabel(0, NOW)).toBe('hôm nay');
  });

  it('mốc TƯƠNG LAI (đồng hồ máy bị chỉnh) → "hôm nay", không ra số âm', () => {
    expect(whenLabel(at(25, 9), NOW)).toBe('hôm nay');
  });
});
