/**
 * Cổng duyệt yêu cầu gộp mã phải chạy bài kiểm cho MỌI app, không riêng app mặc định.
 *
 * ── Ca hỏng bài này sinh ra để chặn ─────────────────────────────────────────
 * Tới 2026-09-10, `.github/workflows/verify-pr.yml` chạy `npx jest` đúng MỘT
 * lượt và cả tệp không có bước sinh tệp biến môi trường nào. `APP_INSTANCE`
 * rỗng ⟹ `resolveInstance` trả app mặc định (`instance.config.ts:524`) ⟹ toàn
 * bộ bộ bài, trên mọi lần duyệt, chỉ chứng minh được MỘT app.
 *
 * Đó không phải rủi ro lý thuyết: khi chạy tay dưới app thứ hai lần đầu, một
 * bài ĐỎ thật lộ ra ngay — nó ghim cứng thứ tự ô ở màn chính của app mặc định,
 * dưới một chú thích khẳng định môi trường thử LUÔN LUÔN là app đó.
 *
 * ── Vì sao ghim ở đây chứ không tin vào việc "nhớ thêm bước" ────────────────
 * Thêm app thứ ba là thêm một thư mục `instances/<mã>` — người làm việc đó
 * không có lý do gì để mở tệp workflow ra. Không có bài này thì app mới lặng lẽ
 * không được kiểm, và dấu xanh trên yêu cầu gộp mã vẫn y như cũ.
 */
import fs from 'fs';
import path from 'path';

import { INSTANCES } from './instance.config';

const WORKFLOW = path.resolve(__dirname, '../../.github/workflows/verify-pr.yml');
const YAML = fs.readFileSync(WORKFLOW, 'utf8');

/**
 * Bỏ dòng chú thích trước khi quét.
 *
 * Bản đầu quét toàn văn và tự bắt CHÍNH chú thích của mình: khối giải thích đặt
 * trên bước chạy có nhắc chữ `npx jest`, nên nó bị đếm thành một lượt chạy
 * không khai app, và ba mục dưới đỏ oan ngay lần chạy đầu. Cùng khuôn với
 * `instanceLogo.test.ts` — quét mã thì phải quét MÃ, chú thích là văn xuôi.
 *
 * Thay bằng khoảng trắng chứ không xoá hẳn, để số dòng không trôi.
 */
const CODE = YAML.replace(/^[ \t]*#.*$/gm, (m) => ' '.repeat(m.length));

/** Mọi lượt gọi `jest` trong tệp, kèm khối `env:` đứng ngay trên nó. */
function jestSteps(): { appInstance: string; expected: string; cacheDir: string }[] {
  const out: { appInstance: string; expected: string; cacheDir: string }[] = [];
  const blocks = CODE.split(/^\s*- name:/m);
  for (const block of blocks) {
    if (!/\bnpx jest\b/.test(block)) continue;
    out.push({
      appInstance: /APP_INSTANCE:\s*(\S+)/.exec(block)?.[1] ?? '',
      expected: /EXPECTED_APP_INSTANCE:\s*(\S+)/.exec(block)?.[1] ?? '',
      cacheDir: /--cacheDirectory\s+(\S+)/.exec(block)?.[1] ?? '',
    });
  }
  return out;
}

describe('cổng duyệt yêu cầu gộp mã kiểm mọi app', () => {
  it('mỗi app trong bảng có đúng một lượt chạy bài kiểm của riêng nó', () => {
    const covered = jestSteps().map((s) => s.appInstance);
    const missing = Object.keys(INSTANCES).filter((id) => !covered.includes(id));
    expect(missing).toEqual([]);
  });

  it('không lượt nào chạy `jest` mà không khai app — lượt trần rơi về app mặc định', () => {
    const bare = jestSteps().filter((s) => s.appInstance === '');
    expect(bare).toEqual([]);
  });

  it('mỗi lượt khai app nào thì đòi kiểm đúng app đó', () => {
    // Hai biến lệch nhau ở tệp workflow thì `instanceUnderTest.test.ts` đỏ lúc
    // chạy — nhưng đỏ ở đó đọc như "mã hỏng", còn gốc nằm ở tệp này. Bắt sớm.
    const mismatched = jestSteps()
      .filter((s) => s.appInstance !== s.expected)
      .map((s) => `${s.appInstance} ≠ ${s.expected}`);
    expect(mismatched).toEqual([]);
  });

  it('mỗi lượt có bộ đệm RIÊNG — dùng chung thì hai lượt cho ra cùng một app', () => {
    // `react-native-dotenv` nướng giá trị lúc biến đổi mã, và jest giữ bộ đệm
    // kết quả biến đổi. Dùng chung bộ đệm ⟹ lượt sau ăn lại mã của lượt trước,
    // hai lượt đều xanh, báo cáo vẫn in hai tên app khác nhau.
    const dirs = jestSteps().map((s) => s.cacheDir);
    expect(dirs.filter((d) => d === '')).toEqual([]);
    expect(new Set(dirs).size).toEqual(dirs.length);
  });

  it('ĐỐI CHỨNG — máy quét thật sự đọc được tệp workflow và thấy lượt chạy', () => {
    // Không có mục này, bốn mục trên xanh y hệt khi đường dẫn sai hoặc biểu thức
    // tìm thôi khớp sau một lần đổi định dạng tệp.
    expect(YAML.length).toBeGreaterThan(500);
    expect(jestSteps().length).toBeGreaterThanOrEqual(Object.keys(INSTANCES).length);
  });
});
