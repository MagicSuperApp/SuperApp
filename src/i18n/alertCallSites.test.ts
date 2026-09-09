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
 * KHÔNG chỗ nào gọi `t()` thì với nó vẫn hoàn hảo.
 *
 * Nên cổng phải đặt ở phía CHỖ GỌI. Đây là chỗ không đi vòng qua được bằng cách
 * thêm một mục từ điển nữa.
 *
 * ── Bất biến MỚI: app không dùng `Alert` của hệ điều hành nữa ────────────────
 * Toàn bộ 37 chỗ gọi `Alert.alert` đã chuyển sang popup của app
 * (`utils/alert` → `components/AlertPopup`). Hai hộp thoại đó KHÔNG tương đương
 * nhau về hình thức: một cái do iOS/Android vẽ, một cái do app vẽ. Để lẫn cả hai
 * thì cùng một ứng dụng có hai kiểu hộp thoại, và người dùng gặp cái nào là tuỳ
 * màn hình họ đang đứng.
 *
 * Bất biến này thay cho bất biến cũ ("`Alert.alert` phải đi qua `t()`") vì nó
 * MẠNH HƠN: không còn `Alert.alert` nào thì cũng không còn chỗ nào để quên `t()`.
 * Và nó bịt luôn lỗ hổng của bản cũ — biểu thức cũ chỉ soi ĐÚNG MỘT DÒNG, nên
 * `Alert.alert(` xuống dòng rồi mới tới chuỗi trần thì lọt (đúng ca
 * `MyDevicesScreen` đã lọt suốt: `'Gỡ máy này?'` chưa bao giờ đi qua `t()`).
 *
 * PHẠM VI: chỉ `Alert.alert`. `showError`/`showWarning`… KHÔNG nằm trong phạm vi
 * canh chuỗi trần: chúng còn hàng chục chỗ gọi truyền chuỗi trần từ trước, bật
 * cổng cho chúng là đỏ cả kho mà chẳng sửa được gì trong một lượt. Đó là dòng
 * riêng, không phải lý do để hoãn cổng này.
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

/** Bất kỳ lượt gọi `Alert.alert(` nào — dù đối số đầu nằm ở dòng nào. */
const NATIVE_ALERT = /Alert\s*\.\s*alert\s*\(/;

/**
 * `utils/alert.ts` là NƠI ĐỊNH NGHĨA popup của app; nó nói về hộp thoại chứ
 * không gọi hộp thoại của hệ điều hành. Loại trừ theo đường dẫn, không theo nội
 * dung, để không ai "xin phép" bằng cách thêm một chú thích.
 */
const MIEN_TRU = ['utils\\alert.ts', 'utils/alert.ts'];

describe('hộp thoại trong app', () => {
  it('không màn nào gọi Alert của hệ điều hành — dùng popup của app', () => {
    const viPham: string[] = [];

    for (const file of walk(SRC)) {
      if (MIEN_TRU.some((m) => file.endsWith(m))) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (NATIVE_ALERT.test(line)) {
          viPham.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(viPham).toEqual([]);
  });
});
