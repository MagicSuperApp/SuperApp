/**
 * `debug-apk.yml` — luồng gỡ lỗi — phải sinh `.env` RIÊNG cho từng app nó dựng.
 *
 * ── Ca hỏng bài này sinh ra để chặn, đo 2026-09-10 ──────────────────────────
 * Luồng ấy gọi `rn-env` ĐÚNG MỘT LẦN, không truyền `app-instance`, rồi dựng CẢ
 * HAI flavor từ đúng tệp `.env` đó. Mà `.env` là đường DUY NHẤT `APP_INSTANCE`
 * tới được tầng JavaScript, và `rn-env/action.yml` điền mặc định `aladin`.
 *
 * Kết quả: gói `checkfarm-debug.apk` mang vỏ native CheckFarm — mã gói, tên,
 * biểu tượng — với toàn bộ JavaScript của Aladin. Logo Aladin bốn màn, tên app
 * "Aladin", khẩu hiệu Aladin, `{brand}` → "Aladin", bảng trang web trỏ
 * `aladin.work`, thứ tự ô ưu tiên việc-làm. Tức ĐÚNG toàn bộ tập lỗi mà
 * `InstanceConfig` được dựng ra để diệt, gói lại và giao qua một bản phát hành
 * công khai.
 *
 * Không bước nào đỏ: phép đối chiếu trong `rn-env` chỉ so TÊN biến, mà tên luôn
 * có mặt nhờ chính giá trị mặc định đó.
 *
 * ── Vì sao bài này tồn tại RIÊNG, không gộp vào bài canh luồng phát hành ────
 * Đội đã biết cái bẫy này và đã vá — nhưng chỉ cho tệp anh em. Bài canh
 * `android-aab.yml` ghim `app-instance: ${{ env.FLAVOR }}` và chỉ đọc đúng tệp
 * đó. Luồng debug thì bỏ sót, và nó mới là luồng DUY NHẤT người thử cầm được
 * bản CheckFarm (bản đó chưa có mục trên Google Play).
 *
 * Đây là ca mẫu của "đợt vá lấy phạm vi bằng phạm vi của TRIỆU CHỨNG": lỗ được
 * bịt ở tệp phát hiện ra nó, tệp anh em cùng thư mục không ai soát.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const WF = readFileSync(join(ROOT, '.github/workflows/debug-apk.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Dòng mã chạy, bỏ chú thích — chú thích có nhắc tên bước để giải thích ca hỏng. */
const CODE = WF.split('\n').filter((line) => !line.trim().startsWith('#'));

/** Các flavor mà luồng này thật sự dựng, đọc từ chính lời gọi gradle. */
function builtFlavors(): string[] {
  const out = new Set<string>();
  for (const line of CODE) {
    const m = /assemble([A-Z][a-zA-Z0-9]*)Debug/.exec(line);
    if (m) out.add(m[1].toLowerCase());
  }
  return [...out];
}

describe('debug-apk.yml — danh tính JS đi theo app', () => {
  it('ĐỐI CHỨNG — luồng này thật sự dựng từ HAI app trở lên', () => {
    // Ngày nó chỉ còn dựng một app, mọi bài dưới đây thành vô nghĩa nhưng vẫn
    // xanh. Mục này bắt lúc ấy phải đọc lại cả tệp, chứ không để một cổng rỗng.
    expect(builtFlavors().length).toBeGreaterThanOrEqual(2);
  });

  it('mỗi app được dựng có một lần khai `app-instance` cho chính nó', () => {
    const declared = CODE.filter((l) => /app-instance:/.test(l)).map((l) =>
      l.split('app-instance:')[1].trim(),
    );
    const missing = builtFlavors().filter((f) => !declared.includes(f));
    expect(missing).toEqual([]);
  });

  it('KHÔNG lời gọi `rn-env` nào bỏ trống `app-instance`', () => {
    // Bỏ trống = mượn mặc định `aladin` của action. Chính là ca hỏng ở đầu tệp,
    // và nó đọc như một lời gọi bình thường nên review bằng mắt không bắt được.
    const bare: string[] = [];
    const lines = WF.split('\n');
    lines.forEach((line, i) => {
      if (!/uses:\s*\.\/\.github\/actions\/rn-env/.test(line)) return;
      // `with:` của một bước kéo dài cho tới bước kế tiếp (`- name:` cùng mức).
      const rest = lines.slice(i + 1, i + 14).join('\n').split(/\n\s*- name:/)[0];
      if (!/app-instance:/.test(rest)) bare.push(`dòng ${i + 1}: ${line.trim()}`);
    });
    expect(bare).toEqual([]);
  });

  it('gói CheckFarm giao ra phải được ĐỌC LẠI, không chỉ được dựng', () => {
    // Hai bước vá (`rn-env` lần hai, gói lại) đều có thể im lặng không ăn —
    // Gradle không khai `.env` là đầu vào của tác vụ gói. Nên lời khẳng định
    // "gói này đúng app" chỉ đứng được khi có bước mở gói ra đo.
    expect(WF).toMatch(/index\.android\.bundle/);
    expect(WF).toMatch(/Một ứng dụng, bốn việc/);
  });
});
