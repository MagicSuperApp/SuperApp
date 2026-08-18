/**
 * Bài kiểm cho phép lọc địa chỉ mở trong app.
 *
 * Thứ cần canh: các dạng địa chỉ TRÔNG NHƯ nhà mình. Khớp theo phần đuôi hay khớp
 * bằng `includes` đều cho `aladin.work.evil.com` đi lọt, và trang lạ đó chạy trong
 * khung WebView có cầu nối JavaScript của app.
 */

import { isAllowedWebUrl, ALADIN_WEB_URL } from './webLink';

describe('isAllowedWebUrl', () => {
  it('nhận đúng nhà mình', () => {
    expect(isAllowedWebUrl(ALADIN_WEB_URL)).toBe(true);
    expect(isAllowedWebUrl('https://aladin.work')).toBe(true);
    expect(isAllowedWebUrl('https://aladin.work/gioi-thieu?x=1#a')).toBe(true);
    expect(isAllowedWebUrl('https://www.aladin.work/')).toBe(true);
    expect(isAllowedWebUrl('HTTPS://ALADIN.WORK/')).toBe(true);
  });

  it('gạt tên máy chỉ TRÔNG GIỐNG — đây là cả lý do hàm này tồn tại', () => {
    expect(isAllowedWebUrl('https://aladin.work.evil.com/')).toBe(false);
    expect(isAllowedWebUrl('https://evil.com/aladin.work')).toBe(false);
    expect(isAllowedWebUrl('https://notaladin.work/')).toBe(false);
    expect(isAllowedWebUrl('https://aladin.works/')).toBe(false);
  });

  it('gạt địa chỉ giấu máy thật sau dấu @', () => {
    // Máy thật là evil.com; mắt người đọc thấy "aladin.work" đứng đầu.
    expect(isAllowedWebUrl('https://aladin.work@evil.com/')).toBe(false);
    expect(isAllowedWebUrl('https://a@aladin.work/')).toBe(false);
  });

  it('chỉ https — http và mọi giao thức khác đều trượt', () => {
    expect(isAllowedWebUrl('http://aladin.work/')).toBe(false);
    expect(isAllowedWebUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedWebUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedWebUrl('lamp://main')).toBe(false);
    expect(isAllowedWebUrl('data:text/html,<h1>x</h1>')).toBe(false);
  });

  it('chuỗi rỗng / rác → false, không ném', () => {
    expect(isAllowedWebUrl('')).toBe(false);
    expect(isAllowedWebUrl('aladin.work')).toBe(false); // thiếu giao thức
    expect(isAllowedWebUrl('https://')).toBe(false);
    expect(isAllowedWebUrl('   ')).toBe(false);
  });

  it('cổng và dấu chấm cuối không làm đổi kết luận', () => {
    expect(isAllowedWebUrl('https://aladin.work:443/')).toBe(true);
    expect(isAllowedWebUrl('https://aladin.work./')).toBe(true);
    expect(isAllowedWebUrl('https://evil.com:443/')).toBe(false);
  });
});
