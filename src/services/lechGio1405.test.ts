/**
 * 1405 (LỆCH GIỜ) PHẢI RA MỘT CÂU KHÁC 1403 (CHỮ KÝ BỊ BÁC) — issue #274.
 *
 * ── Vì sao một tệp kiểm riêng cho hai con số ──────────────────────────────
 * Máy chủ đã tách hai mã này; app thì chưa đọc mã mới (`grep -rn '1405' src/` ra
 * 0 kết quả trước bản này). Hệ quả không phải "app hiện sai màu": nó là một câu
 * nói đúng ngữ pháp dẫn người dùng đi sai đường. Ai bị lệch đồng hồ mà đọc "chữ
 * ký không hợp lệ" sẽ thử lại tới khi bỏ cuộc, vì thứ phải sửa nằm trong Cài đặt
 * của máy chứ không ở app — mà không ai nói cho họ biết điều đó.
 *
 * ── Mỗi ca PHẢI phân biệt được hai cực ────────────────────────────────────
 * Bài kiểm kiểu "1405 trả về một chuỗi không rỗng" sẽ XANH ngay cả khi 1405 rơi
 * vào nhánh `default`. Nên mỗi ca dưới đây so 1405 với 1403 và đòi chúng KHÁC
 * nhau, cộng một mỏ neo vào việc người dùng phải làm (đồng hồ / cài đặt) — gỡ
 * `case 1405` ở bất kỳ tệp nào trong ba tệp thì đúng ca của tệp đó đỏ.
 *
 * Ba nơi, vì cùng một mã lỗi đi qua ba lối khác nhau tới mặt người dùng:
 *   `phoenixKeyAuthService.friendlyRegisterError`  — lúc tạo/khôi phục danh tính
 *   `keyAuthorizeService.describeAuthorizeFailure` — lúc uỷ quyền máy thứ hai
 *   `WakemeScreen.explain`                         — lúc nhận LAMP
 */

import { PhoenixKeyApiError } from './phoenixKey-api';
import { friendlyRegisterError } from './phoenixKeyAuthService';
import { describeAuthorizeFailure } from './keyAuthorizeService';
import { explain } from '../screens/WakemeScreen';
import { setLanguage, __resetLanguageForTest } from '../i18n/store';

/** Câu nói được việc phải làm: đụng tới đồng hồ / giờ / cài đặt. */
const NOI_VE_DONG_HO = /đồng hồ|giờ|Ngày giờ|tự động/i;

beforeEach(() => {
  __resetLanguageForTest();
  setLanguage('vi');
});

const loi = (code: number, http = 403) => new PhoenixKeyApiError(code, http, 'server says no');

describe('đăng ký danh tính — friendlyRegisterError', () => {
  it('1405 KHÁC 1403, và nói về đồng hồ', () => {
    const a = friendlyRegisterError(loi(1403));
    const b = friendlyRegisterError(loi(1405));
    expect(b).not.toBe(a);
    expect(b).toMatch(NOI_VE_DONG_HO);
  });

  it('1403 KHÔNG bảo người dùng đi chỉnh đồng hồ — cực đối của ca trên', () => {
    // Thiếu ca này thì một hàm trả CÙNG một câu "chỉnh đồng hồ" cho cả hai mã
    // vẫn qua được ca đầu tiên ở trên.
    expect(friendlyRegisterError(loi(1403))).not.toMatch(NOI_VE_DONG_HO);
  });

  it('mã lạ vẫn về câu chung, 1405 không nuốt mất nhánh mặc định', () => {
    expect(friendlyRegisterError(loi(9998))).toBe('Tạo danh tính thất bại. Thử lại.');
  });
});

describe('uỷ quyền máy thứ hai — describeAuthorizeFailure', () => {
  it('1405 KHÁC câu của 403 chung, và nói về đồng hồ', () => {
    // Máy chủ trả 1405 KÈM http 403. Để nó rơi xuống nhánh `http === 403` là
    // người lệch giờ đọc "chữ ký không được chấp nhận" rồi đi kiểm tra khoá.
    const chung = describeAuthorizeFailure(new PhoenixKeyApiError(1403, 403, 'bad sig'));
    const lech = describeAuthorizeFailure(loi(1405));
    expect(lech).not.toBe(chung);
    expect(lech).toMatch(NOI_VE_DONG_HO);
    expect(chung).not.toMatch(NOI_VE_DONG_HO);
  });

  it('không đụng tới bốn mã đã có', () => {
    expect(describeAuthorizeFailure(loi(3009, 409))).toMatch(/thao tác khác/i);
    expect(describeAuthorizeFailure(loi(3007, 400))).toMatch(/định dạng/i);
  });
});

describe('nhận LAMP — WakemeScreen.explain', () => {
  it('1405 KHÁC 1403, và KHÔNG mời gọi hỗ trợ', () => {
    const a = explain(1403, 'raw');
    const b = explain(1405, 'raw');
    expect(b.title).not.toBe(a.title);
    expect(b.body).toMatch(NOI_VE_DONG_HO);
    // Câu của 1403 ở màn này là "Liên hệ hỗ trợ để mở lại" — đẩy người tự sửa
    // được trong 15 giây đi gọi điện. 1405 không được lặp lại chuyện đó.
    expect(a.body).toMatch(/hỗ trợ/i);
    expect(b.body).not.toMatch(/hỗ trợ/i);
  });
});
