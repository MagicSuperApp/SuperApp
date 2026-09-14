/**
 * Canh SỢI NỐI giữa hộp thoại và báo cáo thực địa.
 *
 * Bài kiểm của `diagnosticReport` chứng minh cái sổ ghi đúng khi CÓ người gọi nó.
 * Nó không chứng minh có ai gọi. Sợi nối là một dòng duy nhất trong `showAlert`,
 * và nó là thứ biến mất êm nhất trong một lượt dọn mã: gỡ nó đi thì không bài
 * nào ở trên đỏ, app vẫn chạy, hộp thoại vẫn hiện — chỉ báo cáo về sau là trống,
 * và lúc đó không ai truy được vì sao.
 */

import { showError, showInfo, showSuccess, showWarning } from './alert';
import { diagEntries, resetDiag } from '../services/diagnosticReport';

beforeEach(() => resetDiag());

describe('mọi hộp thoại hiện ra đều phải để lại một dòng trong báo cáo', () => {
  it('`showError` để lại đúng một dòng, mang cả tiêu đề và thân', () => {
    showError('Không lưu được', 'Máy chủ từ chối: thiếu mã vườn.');
    const ds = diagEntries();
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({
      kind: 'error',
      title: 'Không lưu được',
      body: 'Máy chủ từ chối: thiếu mã vườn.',
    });
  });

  it('`showSuccess` CŨNG để lại dòng — đây là vế bắt được ca "báo thành công sai"', () => {
    showSuccess('Đã lưu');
    const ds = diagEntries();
    expect(ds).toHaveLength(1);
    expect(ds[0].kind).toBe('success');
  });

  it('bốn hàm tiện lợi ra bốn loại ĐÔI MỘT khác nhau — nếu không bài trên chẳng phân biệt gì', () => {
    showError('a');
    showWarning('b');
    showSuccess('c');
    showInfo('d');
    const loai = diagEntries().map(d => d.kind);
    expect(loai).toEqual(['error', 'warning', 'success', 'info']);
  });

  it('thân để trống thì lấy câu mặc định của `alert.ts`, KHÔNG để chuỗi rỗng', () => {
    // Người đọc báo cáo thấy một dòng không có thân thì không biết là máy im hay
    // là sổ ghi hụt. Câu mặc định phân biệt được hai ca đó.
    showError('Chỉ có tiêu đề');
    expect(diagEntries()[0].body).toBeTruthy();
  });
});
