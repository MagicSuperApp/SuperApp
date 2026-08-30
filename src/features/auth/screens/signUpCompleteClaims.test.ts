/**
 * KHOÁ LẠI: màn kết thúc đăng ký chỉ được nói việc CÓ THẬT.
 *
 * Màn này từng hiện bốn bước, trong đó hai bước — "Mã hoá dữ liệu khôi phục" và
 * "Chia nhỏ & lưu trên nhiều thiết bị (ít nhất 12 thiết bị)" — là hoạt hình chạy
 * bằng đồng hồ đếm. Trong tệp không có một lệnh mã hoá nào và không có một lời
 * gọi mạng nào. Cơ chế "12 node" không tồn tại ở đâu trong `src/`.
 *
 * Và chân trang nói "Dữ liệu khôi phục được phân tán an toàn trên mạng" trong
 * khi cách đó mười hai dòng có ô cảnh báo "Bạn chưa liên kết khôi phục". Người
 * dùng đọc câu dưới rồi rời màn hình tin rằng đã có đường khôi phục. Họ chưa có,
 * và họ chỉ biết vào đúng lúc mất máy.
 *
 * Bài kiểm này là phép QUÉT MÃ NGUỒN, cố ý: lỗi ở đây là lỗi CÂU CHỮ, không phải
 * lỗi hành vi. Không có hàm nào để gọi, không có trạng thái nào để dựng — thứ
 * duy nhất đo được là chữ đang nằm trong tệp.
 *
 * ⛔ Bài kiểm này KHÔNG cấm việc làm thật. Ngày nào có mã phân tán khoá khôi phục
 *    thật thì sửa danh sách dưới đây kèm `file:line` trỏ tới đoạn mã đó.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MAN = readFileSync(join(__dirname, 'SignUpCompleteScreen.tsx'), 'utf8');

/** Bỏ chú thích để chỉ soi phần chữ ĐẾN TAY NGƯỜI DÙNG — phần giải thích vì sao
 *  đã gỡ thì được phép nhắc lại nguyên văn câu sai. */
const CHU_HIEN = MAN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('màn kết thúc không khẳng định việc không xảy ra', () => {
  it('không nói có phân tán / phân mảnh dữ liệu khôi phục', () => {
    expect(CHU_HIEN).not.toMatch(/phân tán|phân mảnh|chia nhỏ/i);
  });

  it('không nêu con số thiết bị/node nào', () => {
    expect(CHU_HIEN).not.toMatch(/\d+\s*(thiết bị|node)/i);
  });

  it('không nói có mã hoá, vì tệp không mã hoá gì', () => {
    expect(CHU_HIEN).not.toMatch(/mã hoá|mã hóa/i);
  });

  it('và thật sự không có mã hoá hay gọi mạng trong tệp', () => {
    // Vế còn lại của bài trên. Thiếu vế này thì ngày ai đó THÊM mã mã hoá thật,
    // bài trên vẫn cấm nói ra — cấm nhầm chiều.
    expect(CHU_HIEN).not.toMatch(/\b(encrypt|Encrypt|fetch\(|axios|shamir|Shamir)\b/);
  });

  it('vẫn giữ ô cảnh báo chưa có đường khôi phục', () => {
    expect(MAN).toContain('Bạn chưa liên kết khôi phục');
  });

  it('chân trang nói rõ KHÔNG ai khôi phục hộ được', () => {
    expect(CHU_HIEN).toContain('không có máy chủ nào khôi phục hộ bạn được');
  });
});

describe('từ điển không còn giữ bản dịch của câu sai', () => {
  const TU_DIEN = ['navigation', 'screens']
    .map((f) => readFileSync(join(__dirname, '..', '..', '..', 'i18n', 'phrases', `${f}.ts`), 'utf8'))
    .join('\n')
    .replace(/^\s*\/\/.*$/gm, '');

  it('không còn khoá "12 thiết bị"', () => {
    expect(TU_DIEN).not.toContain('Lưu trên ít nhất 12 thiết bị');
  });

  it('không còn khoá "phân tán an toàn trên mạng"', () => {
    // Dịch một câu sai sang ba thứ tiếng là nhân cái sai lên ba lần.
    expect(TU_DIEN).not.toContain('Dữ liệu khôi phục được phân tán an toàn trên mạng');
  });
});
