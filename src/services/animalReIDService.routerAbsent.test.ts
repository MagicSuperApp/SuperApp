/**
 * Bài kiểm khoá đúng MỘT chỗ: 404 ở nhánh vật nuôi phải mang câu RIÊNG của nó.
 *
 * Vì sao đáng một tệp riêng: bộ định tuyến `animal` bên OriLife được gắn trong
 * một khối `try/except` (OriLife agent xác nhận 13/09/2026). Module vật nuôi nạp
 * lỗi thì bộ định tuyến biến mất mà máy chủ vẫn lên bình thường — từ phía app,
 * trạng thái đó chỉ khác "đường sống" ở đúng một con số: 404 thay vì 200/422.
 *
 * Trước bản này 404 rơi vào rổ cuối `HTTP ${status}`, tức app nói một câu không
 * cho ai làm được gì. Người dùng đọc thành "mình chụp ảnh sai"; người trực máy
 * đọc thành "app gọi sai đường". Cả hai đi sai hướng, và không phép kiểm nào đỏ
 * vì một câu thông báo vô nghĩa vẫn là một câu thông báo.
 *
 * ĐỐI CHỨNG đi kèm: 422 phải KHÔNG mang câu đó. Thiếu ca đối chứng thì một bản
 * sửa gán nhầm câu này cho mọi mã lỗi vẫn qua được bài trên.
 */

import { listAnimals } from './animalReIDService';

const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => 'application/json' },
});

describe('404 ở nhánh vật nuôi = bộ định tuyến KHÔNG có mặt', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('404 → nói rõ là việc phía máy chủ, không đổ cho dữ liệu người dùng', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue(resp(404, { detail: 'Not Found' }) as never);
    const res = await listAnimals('https://x.test', 'farm-1');
    expect(res.ok).toBe(false);
    expect(res.error?.http_status).toBe(404);
    // Không khớp nguyên văn cả câu: câu chữ được phép sửa cho dễ đọc. Cái phải
    // giữ là nó KHÔNG còn là `HTTP 404` trơ, và nó nói ra chỗ hỏng.
    expect(res.error?.detail).not.toMatch(/^HTTP 404$/);
    expect(res.error?.detail).toMatch(/máy chủ/i);
  });

  it('ĐỐI CHỨNG — 422 giữ nguyên nhánh dữ liệu, không mượn câu của 404', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue(
      resp(422, { detail: 'farm_id không hợp lệ' }) as never,
    );
    const res = await listAnimals('https://x.test', 'farm-1');
    expect(res.ok).toBe(false);
    expect(res.error?.type).toBe('validation_error');
    expect(res.error?.http_status).toBe(422);
    expect(res.error?.detail).toBe('farm_id không hợp lệ');
  });
});
