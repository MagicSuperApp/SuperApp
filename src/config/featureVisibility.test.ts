// Bài kiểm cho `featureVisibility.ts`.
//
// Bài này KHÔNG kiểm "hôm nay hai cờ có bằng false không" — một bài như thế sẽ đỏ
// đúng vào ngày hợp lệ nhất (ngày tính năng chạy được và được mở), nên nó dạy
// người ta sửa bài kiểm thay vì đọc nó.
//
// Nó kiểm hai thứ KHÔNG tự già:
//   1. Mọi lối vào hai màn đó đều nằm trong tệp có nạp cổng — bắt được lối vào
//      THỨ SÁU mà ai đó thêm sau này. Đây là đột biến thật sự xảy ra, và không
//      bài kiểm nào khác trong kho bắt được nó.
//   2. Cờ Wakeme vẫn là phép HỘI của cả ba chốt — bắt được lượt ai đó gõ đè
//      `true`, hoặc bỏ bớt một chốt khỏi biểu thức.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

function listSourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) { found.push(...listSourceFiles(path)); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

/** Màn bị ẩn → tên cổng phải có mặt trong cùng tệp với lối vào. */
const GATED_ROUTES = [
  { route: 'Wakeme', gate: 'WAKEME_VISIBLE' },
  { route: 'MagicVaultBalance', gate: 'magicVisible' },
] as const;

describe('cổng hiển thị tính năng chưa nối xong', () => {
  const files = listSourceFiles(SRC);

  // Đối chứng cho chính phép quét: nếu bộ duyệt thư mục hỏng và trả về danh sách
  // rỗng, mọi khẳng định bên dưới sẽ ĐẬU mà không đọc dòng nào. Chốt số lượng
  // trước, để một phép đo trả "không tìm thấy vi phạm" không đọc lẫn được với
  // "tôi không đo được gì".
  it('phép quét có thật sự đọc được mã nguồn', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some(f => f.endsWith('AccountScreen.tsx'))).toBe(true);
  });

  it.each(GATED_ROUTES)('mọi lối vào $route đều nằm trong tệp có nạp $gate', ({ route, gate }) => {
    const callPattern = new RegExp(`navigate\\(\\s*['"\`]${route}['"\`]`);

    const offenders = files.filter(f => {
      const body = readFileSync(f, 'utf8');
      if (!callPattern.test(body)) return false;
      return !body.includes(gate);
    });

    expect(offenders.map(f => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('cờ Wakeme là phép HỘI của cả BA chốt, không phải một giá trị gõ tay', () => {
    const body = readFileSync(join(__dirname, 'featureVisibility.ts'), 'utf8');
    const expression = body.match(/WAKEME_VISIBLE\s*:\s*boolean\s*=([\s\S]*?);/)?.[1] ?? '';

    for (const gate of ['WAKEME_CLAIM_READY', 'WAKEME_SIGNING_READY', 'WAKEME_TX_REVIEW_READY']) {
      expect(expression).toContain(gate);
    }
    // Không có `||`: một chốt đạt KHÔNG được đủ để mở lối vào.
    expect(expression).not.toContain('||');
  });
});
