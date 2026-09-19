/**
 * Thứ tự hai dòng chữ trên thanh điều hướng.
 *
 * Chủ sở hữu chốt 19/09/2026: dòng ĐẬM ở trên là dòng viết bằng ngôn ngữ app
 * đang đặt, không phải luôn luôn tiếng Anh như bản trước.
 *
 * Bài này ghim đúng chỗ dễ trôi ngược: một lượt sửa nào đó đổi lại `primary` về
 * `navEn(route)` thì giao diện vẫn chạy, vẫn song ngữ, vẫn đủ chữ — chỉ khác ở
 * dòng nào đậm, mà đó là toàn bộ nội dung của quyết định.
 */
import { navLines, navEn, navNational, NAV_FRAME } from './navLabels';

/** Một route có nhãn quốc gia KHÁC hẳn nhãn chuẩn — dùng làm ca chính. */
const ROUTE = 'ChatHome';

describe('navLines — dòng trên là ngôn ngữ app đang đặt', () => {
  it('tiền đề của cả tệp: route mẫu có nhãn hai thứ tiếng khác nhau', () => {
    // Không có ca này thì mọi bài dưới xanh y hệt khi bảng nhãn rỗng hoặc khi
    // nhãn Việt vô tình trùng nhãn Anh — tức chúng không kiểm gì.
    expect(NAV_FRAME[ROUTE]).toBeDefined();
    expect(navNational(ROUTE, 'vi')).not.toBe(navEn(ROUTE));
  });

  it('🔴 CHỐT — app tiếng Việt: dòng trên là tiếng VIỆT, dòng dưới là tiếng Anh', () => {
    const { primary, secondary } = navLines(ROUTE, 'vi');
    expect(primary).toBe(navNational(ROUTE, 'vi'));
    expect(secondary).toBe(navEn(ROUTE));
    // Và nói thẳng điều bản cũ làm, để đột biến quay ngược bị bắt:
    expect(primary).not.toBe(navEn(ROUTE));
  });

  it('app tiếng Anh: chỉ MỘT dòng — không in trùng chữ', () => {
    const { primary, secondary } = navLines(ROUTE, 'en');
    expect(primary).toBe(navEn(ROUTE));
    expect(secondary).toBeNull();
  });

  it('mọi ngôn ngữ quốc gia đều xếp cùng một luật, không chỉ tiếng Việt', () => {
    for (const lang of ['vi', 'zh', 'ja'] as const) {
      for (const route of Object.keys(NAV_FRAME)) {
        const { primary, secondary } = navLines(route, lang);
        expect(primary).toBe(navNational(route, lang));
        expect(secondary).toBe(navEn(route) === primary ? null : navEn(route));
      }
    }
  });

  it('route lạ không làm vỡ ô nav — rơi về chính tên route, một dòng', () => {
    const { primary, secondary } = navLines('KhongCoTrongBang', 'vi');
    expect(primary).toBe('KhongCoTrongBang');
    expect(secondary).toBeNull();
  });
});
