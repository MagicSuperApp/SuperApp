/**
 * Canh CHỖ GỌI, không canh từ điển.
 *
 * ── Vì sao bài kiểm này tồn tại ──────────────────────────────────────────────
 * Đợt dịch 196 hộp thoại (`1b4c928`) bọc `t()` quanh mọi `Alert.alert` đang có.
 * Ngay sau đó một nhánh khác thêm hai hộp thoại MỚI với chuỗi tiếng Việt trần —
 * và không có gì đỏ. Cả hai nhánh đều xanh, gộp xong vẫn xanh, người chọn tiếng
 * Anh thì thấy tiếng Việt ở đúng hộp thoại mới nhất.
 *
 * Bài kiểm từ điển hiện có (`phrases.test.ts`) không bắt được ca này: nó đo phía
 * TỪ ĐIỂN — mỗi chuỗi nguồn chỉ được có một bản dịch. Chuỗi nằm trong từ điển mà
 * KHÔNG chỗ nào gọi `t()` thì với nó vẫn hoàn hảo. Thật ra ba chuỗi của hộp thoại
 * Đổi tên ('Huỷ' · 'Lưu' · 'Nhập tên mới...') đã nằm sẵn trong từ điển với đủ
 * en/zh/ja từ lâu, chỉ là chưa ai gọi tới — dịch rồi mà chưa từng hiện ra.
 *
 * Nên cổng phải đặt ở phía CHỖ GỌI. Đây là chỗ không đi vòng qua được bằng cách
 * thêm một mục từ điển nữa.
 *
 * ── Phạm vi CỐ Ý hẹp ─────────────────────────────────────────────────────────
 * Chỉ canh `Alert.alert(` — hôm nay toàn kho có 0 vi phạm, nên bất biến này bật
 * lên được ngay. `showError`/`showWarning` KHÔNG nằm trong phạm vi: chúng còn
 * hàng chục chỗ gọi truyền chuỗi trần từ trước, bật cổng cho chúng là đỏ cả kho
 * mà chẳng sửa được gì trong một lượt. Đó là dòng riêng, không phải lý do để
 * hoãn cổng này.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** `Alert.alert(` mà đối số đầu mở ngay bằng một chuỗi trần (nháy đơn/kép/ngược). */
const BARE_FIRST_ARG = /Alert\s*\.\s*alert\(\s*['"`]/;

describe('chỗ gọi Alert.alert', () => {
  it('không chỗ nào truyền chuỗi trần làm tiêu đề — phải đi qua t()', () => {
    const viPham: string[] = [];

    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (BARE_FIRST_ARG.test(line)) {
          viPham.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(viPham).toEqual([]);
  });
});
