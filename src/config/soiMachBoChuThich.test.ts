/**
 * MỌI NGUỒN MÀ `soi-mach.js` ĐỌC PHẢI ĐI QUA `boChuThich` TRƯỚC KHI BẮT REGEX.
 *
 * Vì sao có bài này. `scripts/soi-mach.js` bắt tên hàm ở sáu nguồn bằng regex.
 * Một khai báo bị bọc trong chú thích khớp regex **y hệt** một khai báo sống, nên
 * đổi
 *
 *     private external fun nativeMasterKekToMnemonic(
 * thành
 *     // ĐÃ TẮT TẠM: private external fun nativeMasterKekToMnemonic(
 *
 * thì cổng vẫn in `✅ Mạch liền` và thoát 0 — trong khi lời gọi từ JS sẽ ném
 * `UnsatisfiedLinkError`. Đó đúng là hình dạng vụ 25/06 mà `soi-mach.js` sinh ra
 * để chặn: Rust có hàm, không ai gọi được, và không cổng nào đỏ.
 *
 * Điều đáng học không phải là thiếu một lần strip. Bản trước ĐÃ strip — cho đúng
 * MỘT nguồn (`swiftSrc`), kèm một chú thích tự nhận ra "cùng bẫy đã ghi hai lần".
 * Đợt vá đó lấy phạm vi bằng phạm vi của TRIỆU CHỨNG, nên bảy nguồn anh em nằm
 * ngay bên cạnh giữ nguyên lỗ. Bài này canh đúng chỗ đó: không canh một lần
 * strip, mà canh việc **mọi nguồn đều được strip**.
 *
 * ── Bài này KHÔNG đo gì ─────────────────────────────────────────────────────
 * Nó không chạy `soi-mach.js`. Một script gọi `boChuThich` đủ chỗ vẫn có thể sai
 * ở regex, ở cửa sổ ký tự, hay ở phép so tập. Lượt chạy thật trong CI vẫn là phép
 * đo cuối.
 *
 * Và nó không canh được nguồn nào đọc tệp bằng đường khác `doc(...)` — thêm một
 * `fs.readFileSync` thẳng là đi vòng qua bài này mà không dòng nào đỏ.
 */

import fs from 'fs';
import path from 'path';

const DUONG = path.join(__dirname, '..', '..', 'scripts', 'soi-mach.js');
const MA = fs.readFileSync(DUONG, 'utf8');

describe('soi-mach — chú thích không được tính là mã', () => {
  it('tệp đọc được và có nội dung — nếu không thì mọi câu dưới đây vô nghĩa', () => {
    // Ca đối chứng. Đường dẫn sai thì `fs.readFileSync` đã ném; nhưng một tệp
    // RỖNG lọt qua mọi `not.toMatch` bên dưới, và bài này sẽ xanh mà không đo gì.
    expect(MA.length).toBeGreaterThan(2000);
    expect(MA).toContain('const boChuThich =');
  });

  it('mọi lời gọi `doc(...)` đều nằm trong `boChuThich(...)`', () => {
    // Bắt đúng dạng "đọc tệp rồi dùng thẳng". `BASELINE` là ngoại lệ có lý do:
    // tệp nợ là `.txt` dùng `#` làm dấu chú thích, và nó đã có đường cắt riêng
    // (`replace(/#.*/, '')`) — cắt bằng `//` ở đó là cắt nhầm.
    const goiDoc = [...MA.matchAll(/(\w*\(?)doc\(([^)]*)\)/g)];
    expect(goiDoc.length).toBeGreaterThan(4);

    const chuaBoc = goiDoc
      .filter(m => !m[0].startsWith('boChuThich(doc('))
      .filter(m => !m[2].includes('BASELINE'))
      .map(m => m[0]);

    expect(chuaBoc).toEqual([]);
  });

  it('sáu nguồn regex đều lấy từ chuỗi ĐÃ bỏ chú thích', () => {
    // Neo theo TÊN BIẾN chứ không theo số dòng: số dòng trôi mỗi lần ai đó chèn
    // một dòng phía trên, và khi trôi thì nó vẫn trỏ vào một dòng CÓ THẬT.
    for (const bien of ['ktSrc', 'swiftSrc', 'tsSrc', 'jniSrc']) {
      const khai = new RegExp(`const ${bien}\\s*=\\s*boChuThich\\(`);
      expect(MA).toMatch(khai);
    }
    // Hai nguồn còn lại không có biến trung gian — bọc ngay tại chỗ gọi.
    expect(MA).toMatch(/const objc = bat\(boChuThich\(doc\(/);
    expect(MA).toMatch(/rustSrc \+= boChuThich\(doc\(/);
  });

  it('`boChuThich` cắt cả đuôi dòng, và chừa `://` của URL', () => {
    // Chạy chính hàm trong tệp, không chép lại thân nó sang đây — một bản chép
    // ở bài kiểm già đi lặng lẽ đúng vào ngày bản gốc đổi.
    const than = MA.match(/const boChuThich = ([\s\S]*?);\n/);
    expect(than).not.toBeNull();
    const boChuThich = new Function(`return ${than![1]}`)() as (s: string) => string;

    // Dòng mở đầu bằng `//` — ca đã tái hiện được trên tệp Kotlin thật.
    expect(boChuThich('  // external fun nativeX(')).not.toContain('nativeX');
    // Đuôi dòng. Chiều cắt chọn theo chiều HỎNG: cắt thiếu ⟹ cổng XANH oan và
    // không ai biết; cắt quá tay ⟹ cổng ĐỎ và người bị chặn BIẾT mình bị chặn.
    expect(boChuThich('fun that() // gọi taad_x(')).not.toContain('taad_x');
    expect(boChuThich('fun that() // gọi taad_x(')).toContain('that()');
    // Khối.
    expect(boChuThich('/* external fun nativeY( */')).not.toContain('nativeY');
    // URL trong chuỗi phải sống — không có `(^|[^:])` thì dòng này bị cụt và tên
    // hàm đứng sau URL biến mất, tức ĐỎ oan theo một đường không đọc ra được từ
    // thông điệp lỗi.
    expect(boChuThich('let u = "https://a.vn/x"; fun that(')).toContain('that(');
    // Mã thật không mang chú thích thì không được đụng tới.
    expect(boChuThich('private external fun nativeZ(')).toContain('nativeZ');
  });
});
