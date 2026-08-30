import { pathOf, canResendAfterNetworkError } from './resendPolicy';

// Danh sách trắng THẬT của từng client — nhập TỪ CHÍNH TỆP ĐANG CHẠY, không chép
// tay. Chép tay là dựng một bản sao lỏng hơn bản thật: sửa danh sách trong service
// mà bài kiểm vẫn xanh, đúng lớp "test xanh trên đường không ai đi".
import { RESENDABLE_POST as FARM } from './farmService';
import { RESENDABLE_POST as TREE } from './treeReIDService';
import { RESENDABLE_POST as FRUIT } from './fruitReIDService';
import { RESENDABLE_POST as ANIMAL } from './animalReIDService';
import { RESENDABLE_POST as CARE } from './careService';

const B = 'https://api.orilife.io';

describe('pathOf — bóc đường dẫn, bỏ host và query', () => {
  it('bỏ host', () => expect(pathOf(`${B}/api/enroll`)).toBe('/api/enroll'));
  it('bỏ query', () => expect(pathOf(`${B}/api/trees?farm_id=x`)).toBe('/api/trees'));
  it('bỏ mảnh neo', () => expect(pathOf(`${B}/api/x#y`)).toBe('/api/x'));
  it('cắt gạch chéo cuối', () => expect(pathOf(`${B}/api/enroll/`)).toBe('/api/enroll'));
  it('URL không đọc được → rỗng', () => {
    expect(pathOf('api/enroll')).toBe('');
    expect(pathOf('')).toBe('');
  });
});

describe('canResendAfterNetworkError — CỬA TẠO tuyệt đối không gửi lại', () => {
  // Đây là phần đắt nhất của bản vá. Mỗi dòng dưới đây là một thực thể thừa
  // vĩnh viễn nếu luật đảo chiều.
  it.each([
    ['TẠO vườn', `${B}/api/farm`, FARM],
    ['TẠO cây', `${B}/api/enroll`, TREE],
    ['bổ-sung góc cây', `${B}/api/verify_add`, TREE],
    ['xoá góc theo CHỈ SỐ (chỉ số dịch sau lượt đầu)', `${B}/api/remove_views`, TREE],
    ['TẠO quả', `${B}/api/fruit/enroll`, FRUIT],
    ['bổ-sung góc quả', `${B}/api/fruit/add_view`, FRUIT],
    ['TẠO con vật', `${B}/api/animal/enroll`, ANIMAL],
    ['GHI một lần chăm sóc', `${B}/api/care/log`, CARE],
  ])('%s → KHÔNG gửi lại', (_ten, url, safe) => {
    expect(canResendAfterNetworkError(url, 'POST', safe)).toBe(false);
  });

  it.each([
    ['cập nhật vườn', `${B}/api/farm/abc123/update`, FARM],
    ['so khớp cây', `${B}/api/identify?x=1`, TREE],
    ['đổi tên cây', `${B}/api/rename`, TREE],
    ['kích dựng 3D (mã nằm trong đường dẫn)', `${B}/api/build3d/tree-1`, TREE],
    ['dò vùng quả', `${B}/api/fruit/detect`, FRUIT],
    ['nhận nhãn thuốc', `${B}/api/care/match`, CARE],
  ])('%s → gửi lại được', (_ten, url, safe) => {
    expect(canResendAfterNetworkError(url, 'POST', safe)).toBe(true);
  });

  it('GET và DELETE luôn gửi lại được, không cần khai', () => {
    expect(canResendAfterNetworkError(`${B}/api/trees`, 'GET', [])).toBe(true);
    expect(canResendAfterNetworkError(`${B}/api/farm/abc`, 'DELETE', [])).toBe(true);
    expect(canResendAfterNetworkError(`${B}/api/x`, 'get', [])).toBe(true);
  });

  it('POST KHÔNG có tên trong danh sách → mặc định KHÔNG gửi lại', () => {
    // Cửa mới thêm sau này rơi vào đây. Giá của việc quên khai là mất một lượt tự
    // thử; giá của mặc định ngược lại là một thực thể thừa. Không cùng hạng.
    expect(canResendAfterNetworkError(`${B}/api/cua/moi/tinh`, 'POST', TREE)).toBe(false);
  });

  it('tiền tố `/*` KHÔNG nuốt chính đường dẫn gốc', () => {
    // `/api/farm/*` cho phép `.../update` nhưng PHẢI chặn `POST /api/farm` (tạo).
    expect(canResendAfterNetworkError(`${B}/api/farm`, 'POST', FARM)).toBe(false);
    expect(canResendAfterNetworkError(`${B}/api/farm/`, 'POST', FARM)).toBe(false);
  });

  it('URL không đọc được đường dẫn → KHÔNG đoán, KHÔNG gửi lại', () => {
    expect(canResendAfterNetworkError('api/enroll', 'POST', TREE)).toBe(false);
  });
});
