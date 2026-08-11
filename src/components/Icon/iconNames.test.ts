/**
 * Canh TÊN ICON có thật trong registry.
 *
 * Vì sao cần: prop `name` của <Icon> khai là `IconName | (string & {})` — chuỗi lạ
 * vẫn qua được TypeScript (cố ý, để chỗ nào dựng tên động vẫn gọi được). Tên không
 * có trong registry thì <Icon> trả `null`: KHÔNG ném, không đỏ test, chỉ để lại một
 * Ô TRỐNG trên màn và một dòng console.warn ở DEV. Trên bản release thì im lặng
 * hoàn toàn — kiểu lỗi chỉ lộ ra khi có người mở đúng màn đó và tự hỏi sao mất icon.
 *
 * Bài này quét MÃ NGUỒN: file nào import <Icon> của app thì mọi tên icon dạng chuỗi
 * trong đó phải có trong `ICONS`. File còn dùng bộ icon khác (react-native-vector-icons)
 * được bỏ qua — tên của bộ đó không thuộc registry này.
 *
 * Thiếu tên nào thì tải về: `node scripts/icons.js <tên-fa6-solid>`
 * (danh sách: https://icon-sets.iconify.design/fa6-solid/).
 */

import fs from 'fs';
import path from 'path';
import { ICONS } from './icons.generated';

const SRC = path.resolve(__dirname, '..', '..');

/** Đường dẫn import trỏ tới CHÍNH component Icon của app (không phải thư viện khác). */
const IMPORTS_APP_ICON = /from\s+'[^']*components\/Icon'/;

/**
 * Tên icon dạng chuỗi: `name="x"`, `icon: 'x'`, và hai nhánh của toán tử ba ngôi
 * (`cond ? 'a' : 'b'`). Chỉ nhận chuỗi kiểu kebab-case để không quét nhầm câu chữ
 * tiếng Anh hay khoá dữ liệu.
 */
const ICON_LITERAL = /(?:name=|icon:\s*|\?\s*|:\s*)(['"])([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\1/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('tên icon dùng trong app', () => {
  const files = walk(SRC).filter(p => IMPORTS_APP_ICON.test(fs.readFileSync(p, 'utf8')));

  it('có file thật sự dùng <Icon> (chống việc bài test tự vô hiệu hoá)', () => {
    // Không có dòng này thì đổi đường dẫn import là bài trên lặng lẽ quét 0 file
    // và luôn xanh — tệ hơn là không có test.
    expect(files.length).toBeGreaterThan(5);
  });

  it('mọi tên icon đều có trong registry', () => {
    const known = new Set(Object.keys(ICONS));
    const thieu: string[] = [];

    for (const p of files) {
      const rel = path.relative(SRC, p).split(path.sep).join('/');
      fs.readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/icon/i.test(line)) return;
          for (const m of line.matchAll(ICON_LITERAL)) {
            if (!known.has(m[2])) thieu.push(`${m[2]}  (src/${rel}:${i + 1})`);
          }
        });
    }

    expect(thieu).toEqual([]);
  });
});
