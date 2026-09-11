/**
 * Bài kiểm cho phép lọc địa chỉ mở trong app.
 *
 * Thứ cần canh: các dạng địa chỉ TRÔNG NHƯ nhà mình. Khớp theo phần đuôi hay khớp
 * bằng `includes` đều cho `aladin.work.evil.com` đi lọt, và trang lạ đó chạy trong
 * khung WebView có cầu nối JavaScript của app.
 *
 * ── Vì sao các ca dựng TỪ LỜI KHAI, không gõ tên máy vào bài ────────────────
 * Tới 2026-09-10 bảng tên máy là hằng viết cứng `aladin.work`, và bài này cũng
 * gõ `aladin.work` vào từng dòng. Hai chỗ trùng nhau nên bài luôn xanh — kể cả
 * trong bản dựng CheckFarm, nơi cùng bảng ấy nghĩa là app của nhà này mở trang
 * chủ của nhà khác ngay trong khung nhúng.
 *
 * Bảng giờ lấy từ `InstanceConfig.website`. Bài dựng ca từ chính lời khai đó,
 * nên nó đo ĐÚNG app đang dựng thay vì đo một tên máy cố định — và nhánh
 * `website: null` (app chưa có trang) được canh riêng: lúc ấy KHÔNG địa chỉ nào
 * được mở trong app, kể cả địa chỉ của app anh em.
 */

import { DEFAULT_INSTANCE } from '../config/instance.config';

import { APP_WEB_URL, isAllowedWebUrl } from './webLink';

const site = DEFAULT_INSTANCE.website;
/** Tên máy chính của app đang dựng — `null` khi app chưa khai trang web. */
const HOST = site?.hosts[0] ?? null;

describe('isAllowedWebUrl', () => {
  it('mọi giao thức không phải https đều trượt — không phụ thuộc app nào', () => {
    expect(isAllowedWebUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedWebUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedWebUrl('lamp://main')).toBe(false);
    expect(isAllowedWebUrl('data:text/html,<h1>x</h1>')).toBe(false);
  });

  it('chuỗi rỗng / rác → false, không ném', () => {
    expect(isAllowedWebUrl('')).toBe(false);
    expect(isAllowedWebUrl('https://')).toBe(false);
    expect(isAllowedWebUrl('   ')).toBe(false);
  });

  it('tên máy KHÔNG được khai thì trượt, dù trông hợp lệ', () => {
    expect(isAllowedWebUrl('https://evil.com/')).toBe(false);
    expect(isAllowedWebUrl('https://evil.com:443/')).toBe(false);
  });

  // ── App CHƯA khai trang web (hôm nay: CheckFarm) ──────────────────────────
  const chuaCoTrang = site === null ? describe : describe.skip;
  chuaCoTrang('app chưa khai trang web', () => {
    it('không địa chỉ nào mở được trong app — kể cả trang của app anh em', () => {
      expect(APP_WEB_URL).toBeNull();
      expect(isAllowedWebUrl('https://aladin.work/')).toBe(false);
      expect(isAllowedWebUrl('https://www.aladin.work/')).toBe(false);
    });
  });

  // ── App CÓ khai trang web (hôm nay: Aladin) ───────────────────────────────
  const coTrang = site !== null ? describe : describe.skip;
  coTrang('app có khai trang web', () => {
    it('nhận đúng nhà mình', () => {
      expect(isAllowedWebUrl(APP_WEB_URL as string)).toBe(true);
      for (const h of site!.hosts) {
        expect(isAllowedWebUrl(`https://${h}`)).toBe(true);
        expect(isAllowedWebUrl(`https://${h}/gioi-thieu?x=1#a`)).toBe(true);
        expect(isAllowedWebUrl(`https://${h.toUpperCase()}/`)).toBe(true);
      }
    });

    it('gạt tên máy chỉ TRÔNG GIỐNG — đây là cả lý do hàm này tồn tại', () => {
      expect(isAllowedWebUrl(`https://${HOST}.evil.com/`)).toBe(false);
      expect(isAllowedWebUrl(`https://evil.com/${HOST}`)).toBe(false);
      expect(isAllowedWebUrl(`https://not${HOST}/`)).toBe(false);
      expect(isAllowedWebUrl(`https://${HOST}s/`)).toBe(false);
    });

    it('gạt địa chỉ giấu máy thật sau dấu @', () => {
      // Máy thật là evil.com; mắt người đọc thấy tên nhà mình đứng đầu.
      expect(isAllowedWebUrl(`https://${HOST}@evil.com/`)).toBe(false);
      expect(isAllowedWebUrl(`https://a@${HOST}/`)).toBe(false);
    });

    it('chỉ https — http trượt kể cả đúng tên máy', () => {
      expect(isAllowedWebUrl(`http://${HOST}/`)).toBe(false);
    });

    it('thiếu giao thức thì trượt', () => {
      expect(isAllowedWebUrl(HOST as string)).toBe(false);
    });

    it('cổng và dấu chấm cuối không làm đổi kết luận', () => {
      expect(isAllowedWebUrl(`https://${HOST}:443/`)).toBe(true);
      expect(isAllowedWebUrl(`https://${HOST}./`)).toBe(true);
    });
  });

  it('ĐỐI CHỨNG — đúng MỘT trong hai nhánh trên chạy, không phải cả hai cùng bỏ', () => {
    // Không có mục này, một lần sửa làm `site` thành `undefined` sẽ khiến CẢ HAI
    // `describe` bị bỏ qua và bộ bài vẫn xanh — một cổng rỗng trông như cổng đầy.
    expect(site === null || (site.hosts.length > 0 && typeof site.url === 'string')).toBe(true);
  });
});
