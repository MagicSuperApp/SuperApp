// screens/careManualPick.test.ts
//
// GHI THUỐC PHẢI CÓ MỘT ĐƯỜNG ĐI ĐƯỢC, KHÔNG CHỈ MỘT CÂU NÓI THẬT.
//
// ⛔ Ca đo được 2026-09-12 (bản 99, người dùng quay màn hình):
//   Bấm "Ghi thuốc" → chụp nhãn RidomilGold → máy chủ trả `reason:'ocr_unavailable'`
//   → màn hiện đúng câu thật: *"Máy chủ hiện chưa đọc được chữ trên nhãn. Chụp lại
//   cũng không giúp được."* Câu ấy đúng, và nó là chỗ dừng: lần phun vừa rồi không
//   ghi được vào đâu. Mà nhật ký thuốc chính là thứ chặn thu hoạch sớm.
//
//   Cả đường ghi tay đã nằm sẵn ở máy chủ và ở tầng service TỪ TRƯỚC —
//   `GET /api/care/products` và `recognition_method='manual'` của `POST /api/care/log`.
//   Thiếu đúng một thứ: không màn nào gọi tới. `getCareProducts` có 0 chỗ gọi, và
//   chú thích trong màn còn ghi rõ điều đó rồi lấy nó làm lý do đừng hứa "ghi tay".
//
// Đây là lớp lỗi "hàm có, đường không có" — mọi bài kiểm hàm thuần đều xanh trong
// suốt thời gian nó tồn tại, vì bản thân hàm chạy đúng. Nên bài dưới đây canh DÂY
// NỐI: có ai gọi không, và gọi xong có khai đúng nguồn không.

import { readFileSync } from 'fs';
import { join } from 'path';

const man = readFileSync(join(__dirname, 'CareScanScreen.tsx'), 'utf8');
const svc = readFileSync(join(__dirname, '../services/careService.ts'), 'utf8');

describe('đường chọn tay trong danh mục thuốc', () => {
  it('màn THẬT SỰ gọi kho sản-phẩm, không chỉ có hàm nằm đó', () => {
    expect(svc).toContain('export async function getCareProducts');
    expect(man).toMatch(/import \{[^}]*\bgetCareProducts\b/s);
    // Nhập thôi chưa đủ — phải có một chỗ GỌI. Đúng cái thiếu suốt thời gian qua.
    expect(man).toContain('await getCareProducts(BASE_URL)');
  });

  it('có một nút mở được đường đó', () => {
    expect(man).toContain('Chọn tay trong danh mục');
    expect(man).toContain('onPress={openManual}');
  });

  it('ghi tay khai ĐÚNG nguồn `manual`, không mượn nhãn `label_scan`', () => {
    // `recognition_method` đi theo hồ sơ truy xuất và người kiểm tra sẽ đọc nó.
    // Khai "quét nhãn" cho một lần người dùng tự chọn là ghi sai nguồn con số
    // cách ly. Hai điều kiện: chỗ ghi phải nhận nhãn qua tham số (không gõ cứng),
    // và dòng chọn trong danh mục phải truyền `'manual'`.
    expect(man).toContain('recognitionMethod: method');
    expect(man).not.toContain("recognitionMethod: 'label_scan'");
    expect(man).toContain("productRow(p, 'manual')");
    expect(man).toContain("productRow(p, 'label_scan')");
  });

  it('BA ca không được gộp: lượt hỏi hỏng · kho rỗng · lọc không ra', () => {
    // Cả ba đều cho ra một danh sách trống trên màn, và cả ba đòi người dùng làm
    // ba việc ngược nhau: thử lại · báo người quản lý kho · xoá bớt chữ. Gộp
    // chúng lại là dựng đúng cái vỏ im lặng mà chính màn này được viết để tránh.
    expect(man).toContain('productsErr');
    expect(man).toContain('Chưa lấy được danh mục');       // lượt hỏi hỏng
    expect(man).toContain('chưa có sản-phẩm nào');          // kho rỗng
    expect(man).toContain('Xoá bớt chữ để xem cả danh mục'); // lọc không ra
  });

  it('kho rỗng thì KHÔNG mời thử lại — thử lại ra kết quả cũ', () => {
    const i = man.indexOf('chưa có sản-phẩm nào');
    const j = man.indexOf('Xoá bớt chữ để xem cả danh mục');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(man.slice(i, j)).toContain('thử lại cũng ra kết quả cũ');
  });

  it('chú thích cũ "0 chỗ gọi" đã được sửa, không để nó già đi tại chỗ', () => {
    // Chú thích đó từng là căn cứ ĐÚNG để không hứa "ghi tay". Điều kiện đã đổi;
    // để nguyên câu cũ là để lại một dữ kiện sai ngay cạnh mã vừa bác bỏ nó.
    expect(man).not.toContain('`getCareProducts` có 0 chỗ gọi');
  });
});
