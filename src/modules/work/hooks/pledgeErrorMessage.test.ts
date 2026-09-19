/**
 * Bài kiểm cho câu chữ lỗi của luồng hợp đồng.
 *
 * Ca đáng giá nhất là ca 429: lượt bị chặn vì gọi quá dày KHÔNG mang mã nghiệp vụ,
 * nên nếu phép rẽ theo mã HTTP bị đặt SAU `switch (code)` thì nó không bao giờ
 * chạy tới — và bài kiểm cho các mã khác vẫn xanh hết. Ca dưới đây dựng đúng hình
 * dạng đó: mã nghiệp vụ rỗng, chỉ có mã HTTP.
 */
import { WorkApiError } from '../services/workApi';
import { pledgeErrorMessage } from './useContracts';

const loi = (httpStatus: number, code: string, message = 'thô từ máy chủ') =>
  new WorkApiError(httpStatus, code, message, 'server');

describe('pledgeErrorMessage', () => {
  it('🔴 CHỐT — 429 không mang mã nghiệp vụ nào, vẫn phải ra câu "đợi một lát"', () => {
    const cau = pledgeErrorMessage(loi(429, ''));
    expect(cau).toMatch(/quá nhanh/);
    expect(cau).toMatch(/giữ nguyên/); // phải trấn an rằng hợp đồng không mất gì
    expect(cau).not.toBe('thô từ máy chủ');
  });

  it('429 kèm cả mã nghiệp vụ thì mã HTTP vẫn thắng', () => {
    // Trần lượt gọi nằm trước cổng nghiệp vụ, nên đây là thứ tự đúng.
    expect(pledgeErrorMessage(loi(429, 'ESCROW_RULE'))).toMatch(/quá nhanh/);
  });

  it('NOT_QUALIFIED ra câu nói được việc phải làm, không in lại mã', () => {
    const cau = pledgeErrorMessage(loi(403, 'NOT_QUALIFIED'));
    expect(cau).not.toMatch(/NOT_QUALIFIED/);
    expect(cau).toMatch(/Chọn thợ khác/);
  });

  it('mã đã có từ trước không bị đổi nghĩa', () => {
    expect(pledgeErrorMessage(loi(400, 'NO_EVIDENCE'))).toMatch(/bằng chứng/);
    expect(pledgeErrorMessage(loi(403, 'FORBIDDEN'))).toMatch(/hai bên/);
    expect(pledgeErrorMessage(loi(400, 'NO_FUNDS'))).toMatch(/phí nền tảng/);
  });

  it('mã lạ thì dùng NGUYÊN VĂN câu máy chủ, không đắp câu chung chung lên', () => {
    expect(pledgeErrorMessage(loi(400, 'MOT_MA_CHUA_TUNG_GAP', 'Việc này đã đóng.')))
      .toBe('Việc này đã đóng.');
  });

  it('không phải lỗi của tầng API thì vẫn có câu để hiện', () => {
    expect(pledgeErrorMessage(new Error('đứt mạng'))).toBe('Thao tác thất bại, thử lại.');
  });
});
