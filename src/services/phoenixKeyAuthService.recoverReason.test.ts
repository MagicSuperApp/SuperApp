/**
 * Ghim phép suy luận chọn LÝ DO khi mở lại danh tính trên máy đã có khoá.
 *
 * Vì sao đáng một tệp kiểm riêng: chỗ này đã sai một lần ngoài thực địa, và nó sai
 * theo kiểu KHÔNG ai thấy được. Người dùng cài lại app, nhận một câu bảo họ sửa
 * TÊN ĐĂNG NHẬP, trong khi thứ vừa hỏng là một hộp hỏng sinh trắc mà họ không biết
 * là có. Câu đó đúng ngữ pháp, đúng chính tả, và dẫn người ta đi sai đường.
 *
 * Mỗi ca dưới đây phải PHÂN BIỆT được hai cực — đổi một nhánh trong
 * `chonLyDoKhoiPhuc` thì phải có ít nhất một ca đỏ. Ca nào xanh ở cả hai cực thì
 * nó không ghim gì cả.
 */
import { chonLyDoKhoiPhuc } from './phoenixKeyAuthService';

const goi = (lookupSaidNotFound: boolean, duong1Loi: string, reason = 'can_ten_dang_nhap') =>
  chonLyDoKhoiPhuc({ reason, lookupSaidNotFound, duong1Loi });

describe('chonLyDoKhoiPhuc', () => {
  it('đường 1 nhận 404 ⟹ khoá đã bị thu hồi', () => {
    expect(goi(true, 'khong_ro')).toBe('khoa_bi_thu_hoi');
  });

  it('404 THẮNG mọi lý do khác của đường 1 — nó là bằng chứng chắc nhất', () => {
    // Ca này ghim THỨ TỰ, không ghim từng nhánh. Đảo hai dòng đầu trong hàm thì
    // đúng ca này đỏ, còn các ca khác vẫn xanh.
    expect(goi(true, 'chua_xac_thuc')).toBe('khoa_bi_thu_hoi');
    expect(goi(true, 'mat_mang')).toBe('khoa_bi_thu_hoi');
  });

  it('đường 1 hỏng vì chưa xác thực ⟹ nói về hộp sinh trắc thứ hai, KHÔNG nói về tên', () => {
    expect(goi(false, 'chua_xac_thuc')).toBe('duong1_chua_xac_thuc');
  });

  it('đường 1 hỏng vì mất mạng ⟹ nói về sóng', () => {
    expect(goi(false, 'mat_mang')).toBe('mat_mang');
  });

  it('đường 1 chưa từng ném lỗi ⟹ giữ nguyên câu về tên đăng nhập', () => {
    // Đây là cực ĐỐI của ba ca trên. Thiếu nó thì một hàm luôn trả
    // `duong1_chua_xac_thuc` cũng qua được phần lớn bộ kiểm.
    expect(goi(false, 'chua_chay')).toBe('can_ten_dang_nhap');
  });

  it('lý do lạ của đường 1 cũng giữ nguyên câu về tên — tên vẫn là việc làm được ngay', () => {
    expect(goi(false, 'khong_ro')).toBe('can_ten_dang_nhap');
    expect(goi(false, 'did_sai_dinh_dang')).toBe('can_ten_dang_nhap');
  });

  it('KHÔNG đụng vào kết luận nào khác của đường 3', () => {
    // Đường 3 nói `chua_xac_thuc` nghĩa là chính NÓ bị huỷ sinh trắc — chuyện khác
    // hẳn với đường 1 bị huỷ. Gộp hai thứ này là dựng lại đúng cái lỗi vừa vá.
    for (const r of ['chua_xac_thuc', 'mat_mang', 'did_sai_dinh_dang', 'khong_ro', 'ten_khong_khop_khoa']) {
      expect(goi(true, 'chua_xac_thuc', r)).toBe(r);
      expect(goi(false, 'mat_mang', r)).toBe(r);
    }
  });
});
