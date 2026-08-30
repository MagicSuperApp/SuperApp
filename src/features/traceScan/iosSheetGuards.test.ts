/**
 * Hai bất biến chỉ gãy trên iOS, và cả hai đều KHÔNG bắt được bằng bài kiểm thường:
 * chúng thuộc về cách iOS dựng `Modal`, mà bộ kiểm thì chạy trên Node, không dựng
 * cây view thật và không chạy trên iOS lần nào.
 *
 * Nên bài kiểm này đọc THẲNG MÃ NGUỒN. Đó là cách đo yếu hơn hẳn bài kiểm hành vi,
 * và nói rõ ở đây để không ai đọc nhầm nó thành bằng chứng "màn chạy đúng":
 *
 *   · Nó KHÔNG chứng minh sheet hiện ra đúng.
 *   · Nó CHỈ chặn đúng một cách viết đã từng làm hỏng thực địa.
 *
 * Ca thật (19/08): trên iOS bấm một quả trong danh sách thì KHÔNG ra gì — không lỗi,
 * không màn mới. Android thì mở bình thường.
 *
 * Nguyên nhân: `TraceScanScreen` vẽ ba `<Modal>` ANH EM, và khi Modal danh sách đang
 * hiện thì `CandidateDetailSheet` (Modal riêng) cũng bật `visible`. Trên iOS, Modal là
 * một view controller trình bày THẬT — không present được cái thứ hai khi cái thứ nhất
 * đang present từ cùng một VC, nên nó âm thầm không hiện. Trên Android, Modal chỉ là
 * View trong cây nên cả hai vẽ chồng lên nhau và chạy tốt.
 *
 * Cách sửa: `CandidateDetailSheet` thành LỚP PHỦ tuyệt đối, vẽ BÊN TRONG Modal danh
 * sách. Hai bài dưới đây khoá đúng hai nửa của cách sửa đó.
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const SHEET = read('features/traceScan/CandidateDetailSheet.tsx');
const SCREEN = read('screens/TraceScanScreen.tsx');

/** Bỏ chú thích để không bắt nhầm chính lời cảnh báo đang giải thích lỗi. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('CandidateDetailSheet KHÔNG được là Modal', () => {
  it('không import `Modal` từ react-native', () => {
    const code = stripComments(SHEET);
    const rnImport = /import\s*\{([^}]*)\}\s*from\s*'react-native'/.exec(code);
    expect(rnImport).not.toBeNull();
    expect(rnImport![1]).not.toMatch(/\bModal\b/);
  });

  it('không dựng thẻ `<Modal>` nào', () => {
    expect(stripComments(SHEET)).not.toMatch(/<Modal[\s>]/);
  });

  it('trả `null` khi không có ứng viên — lớp phủ phải BIẾN MẤT, không chỉ trong suốt', () => {
    // Modal có `visible={false}` thì tự ẩn. Lớp phủ thì không: để nguyên là nó phủ
    // kín màn và nuốt mọi cú chạm, mà nhìn thì chẳng thấy gì — đơ mà không có dấu vết.
    expect(stripComments(SHEET)).toMatch(/if\s*\(\s*c\s*===\s*null\s*\)\s*return\s+null/);
  });
});

describe('TraceScanScreen vẽ sheet chi tiết BÊN TRONG Modal danh sách', () => {
  const code = stripComments(SCREEN);

  it('chỉ còn ĐÚNG một chỗ vẽ `<CandidateDetailSheet`', () => {
    const uses = code.match(/<CandidateDetailSheet/g) ?? [];
    expect(uses).toHaveLength(1);
  });

  it('chỗ vẽ đó nằm SAU thẻ `<Modal` cuối cùng — tức ở trong nó, không phải anh em', () => {
    const sheetAt = code.indexOf('<CandidateDetailSheet');
    const lastModalAt = code.lastIndexOf('<Modal');
    expect(sheetAt).toBeGreaterThan(-1);
    expect(lastModalAt).toBeGreaterThan(-1);
    // Nằm sau thẻ mở `<Modal` cuối cùng ⟹ không thể là Modal anh em đứng trước nó.
    expect(sheetAt).toBeGreaterThan(lastModalAt);
  });
});

describe('camera phải THÁO khi sheet phủ kín', () => {
  const code = stripComments(SCREEN);

  it('có cờ `sheetCoversCamera` và nó gác chỗ dựng `<Camera`', () => {
    expect(code).toMatch(/const\s+sheetCoversCamera\s*=/);
    expect(code).toMatch(/sheetCoversCamera\s*\?/);
  });

  it('cờ chỉ bật ở hai trạng thái CHE KÍN, không bắt nhầm `message`/`pick_region`', () => {
    const line = /const\s+sheetCoversCamera\s*=([^;]+);/.exec(code)?.[1] ?? '';
    expect(line).toMatch(/'candidates'/);
    expect(line).toMatch(/'unknown_code'/);
    // `message` vẽ chữ THẲNG trên màn, `pick_region` thì người dùng đang chạm vào
    // chính khung xem — tháo camera ở hai ca đó là làm hỏng màn.
    expect(line).not.toMatch(/'message'/);
    expect(line).not.toMatch(/'pick_region'/);
  });
});
