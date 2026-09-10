/**
 * MỌI luồng CI chạy bộ kiểm đều phải chạy nó cho MỌI app — không riêng app mặc định.
 *
 * ── Ca hỏng bài này sinh ra để chặn ─────────────────────────────────────────
 * Kho này dựng nhiều app từ một nền mã (`instances/<mã>`). Tới 2026-09-10, mọi
 * luồng CI gọi `npx jest` trần: biến chọn app rỗng ⟹ `resolveInstance` trả app
 * mặc định (`instance.config.ts`) ⟹ toàn bộ bộ kiểm, trên mọi lần duyệt, chỉ
 * chứng minh được MỘT app. Chạy tay dưới app thứ hai lần đầu thì một bài ĐỎ thật
 * lộ ra ngay — nó ghim cứng thứ tự ô ở màn chính của app mặc định, dưới một chú
 * thích khẳng định môi trường thử LUÔN LUÔN là app đó.
 *
 * ── Vì sao bài này quét MỌI tệp workflow, không riêng một tệp ───────────────
 * Bản đầu chỉ canh `verify-pr.yml`. Vá xong tệp đó rồi đóng đợt, và `debug-apk.yml`
 * — luồng dựng APK cho CẢ HAI app — vẫn gọi `npx jest` trần. Nó đỏ ở lần chạy CI
 * kế tiếp, và đỏ vì đúng cái cổng này.
 *
 * Đó là bài học đắt hơn chính lỗi: **đợt vá lấy phạm vi bằng phạm vi của TRIỆU
 * CHỨNG là đợt vá để lại nguyên nguyên nhân.** Nên bài này lấy phạm vi bằng
 * phạm vi của LUẬT — mọi tệp trong `.github/workflows/`, kể cả tệp viết sau này.
 *
 * ── Vì sao thư mục đệm phải RIÊNG từng lượt ────────────────────────────────
 * `react-native-dotenv` là bộ chuyển mã của Babel: nó nướng giá trị vào lúc BIẾN
 * ĐỔI MÃ, không phải lúc chạy, và jest giữ bộ đệm kết quả biến đổi. Hai lượt dùng
 * chung bộ đệm ⟹ lượt sau ăn lại mã đã nướng giá trị của lượt trước ⟹ hai lượt
 * cho ra CÙNG một app. Cả hai vẫn xanh, báo cáo vẫn in hai tên app khác nhau, và
 * người đọc thấy đúng thứ mình muốn thấy.
 */
import fs from 'fs';
import path from 'path';

import { INSTANCES } from './instance.config';

const WORKFLOW_DIR = path.resolve(__dirname, '../../.github/workflows');

type JestStep = {
  workflow: string;
  appInstance: string;
  expected: string;
  cacheDir: string;
};

/**
 * Bỏ dòng chú thích trước khi quét.
 *
 * Bản đầu quét toàn văn và tự bắt CHÍNH chú thích của mình: khối giải thích đặt
 * trên bước chạy có nhắc chữ `npx jest`, nên nó bị đếm thành một lượt chạy không
 * khai app. Quét mã thì phải quét MÃ; chú thích là văn xuôi.
 *
 * Thay bằng khoảng trắng chứ không xoá hẳn, để số dòng không trôi.
 */
const stripComments = (yaml: string): string =>
  yaml.replace(/^[ \t]*#.*$/gm, (m) => ' '.repeat(m.length));

/** Mọi lượt gọi `jest` trong mọi tệp workflow, kèm khối `env:` của bước đó. */
function jestSteps(): JestStep[] {
  const out: JestStep[] = [];
  for (const name of fs.readdirSync(WORKFLOW_DIR)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const code = stripComments(fs.readFileSync(path.join(WORKFLOW_DIR, name), 'utf8'));
    for (const block of code.split(/^\s*- name:/m)) {
      if (!/\bnpx jest\b/.test(block)) continue;
      out.push({
        workflow: name,
        appInstance: /APP_INSTANCE:\s*(\S+)/.exec(block)?.[1] ?? '',
        expected: /EXPECTED_APP_INSTANCE:\s*(\S+)/.exec(block)?.[1] ?? '',
        cacheDir: /--cacheDirectory\s+(\S+)/.exec(block)?.[1] ?? '',
      });
    }
  }
  return out;
}

/** Các luồng có chạy bộ kiểm — nhóm theo tên tệp. */
function byWorkflow(): Map<string, JestStep[]> {
  const map = new Map<string, JestStep[]>();
  for (const step of jestSteps()) {
    const list = map.get(step.workflow) ?? [];
    list.push(step);
    map.set(step.workflow, list);
  }
  return map;
}

describe('mọi luồng CI kiểm mọi app', () => {
  it('không lượt `jest` nào chạy mà không khai app — lượt trần rơi về app mặc định', () => {
    const bare = jestSteps()
      .filter((s) => s.appInstance === '')
      .map((s) => s.workflow);
    expect(bare).toEqual([]);
  });

  it('mỗi luồng có chạy bộ kiểm thì chạy cho ĐỦ mọi app trong bảng', () => {
    const wanted = Object.keys(INSTANCES);
    const gaps: string[] = [];
    for (const [workflow, steps] of byWorkflow()) {
      const covered = steps.map((s) => s.appInstance);
      const missing = wanted.filter((id) => !covered.includes(id));
      if (missing.length) gaps.push(`${workflow}: thiếu ${missing.join(', ')}`);
    }
    expect(gaps).toEqual([]);
  });

  it('mỗi lượt khai app nào thì đòi kiểm đúng app đó', () => {
    // Hai biến lệch nhau ở tệp workflow thì `instanceUnderTest.test.ts` đỏ lúc
    // CHẠY — nhưng đỏ ở đó đọc như "mã hỏng", còn gốc nằm ở tệp workflow. Bắt sớm.
    const mismatched = jestSteps()
      .filter((s) => s.appInstance !== s.expected)
      .map((s) => `${s.workflow}: ${s.appInstance} ≠ ${s.expected || '(không khai)'}`);
    expect(mismatched).toEqual([]);
  });

  it('trong CÙNG một luồng, mỗi lượt có bộ đệm RIÊNG', () => {
    const clashes: string[] = [];
    for (const [workflow, steps] of byWorkflow()) {
      const dirs = steps.map((s) => s.cacheDir);
      if (dirs.some((d) => d === '')) clashes.push(`${workflow}: có lượt không đặt bộ đệm riêng`);
      else if (new Set(dirs).size !== dirs.length) clashes.push(`${workflow}: hai lượt dùng chung bộ đệm`);
    }
    expect(clashes).toEqual([]);
  });

  it('ĐỐI CHỨNG — máy quét đọc được thư mục workflow và thấy lượt chạy thật', () => {
    // Không có mục này, bốn mục trên xanh y hệt khi đường dẫn sai hoặc khi biểu
    // thức tìm thôi khớp sau một lần đổi định dạng tệp.
    expect(fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f)).length).toBeGreaterThan(2);
    expect(byWorkflow().size).toBeGreaterThanOrEqual(2);
    expect(jestSteps().length).toBeGreaterThanOrEqual(2 * Object.keys(INSTANCES).length);
  });
});
