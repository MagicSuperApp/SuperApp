/**
 * Cây làm việc phụ (`git worktree`) phải chạy được bộ kiểm của CHÍNH NÓ.
 *
 * Công cụ agent dựng cây phụ dưới `.claude/worktrees/<tên>`. Cấu hình jest loại
 * `.claude/` để cây CHÍNH không quét lặp các cây phụ — đúng, và phải giữ. Nhưng
 * mẫu cũ là `'/\\.claude/'`, khớp chuỗi đó ở BẤT KỲ đâu trong đường dẫn tuyệt
 * đối, nên khi chạy jest BÊN TRONG một cây phụ thì nó tự loại chính mình.
 *
 * Chỗ hỏng không nằm ở việc thiếu bài kiểm — nó nằm ở chỗ lượt chạy rỗng ĐỌC
 * GIỐNG HỆT một lượt chạy toàn xanh: in `No tests found` rồi THOÁT 0. Ai đọc mã
 * thoát sẽ thấy màu xanh cho một phép đo chưa hề xảy ra.
 *
 * Đo 2026-09-11, cùng một cây phụ, chỉ khác hai dòng cấu hình:
 *   mẫu cũ  `'/\\.claude/'`          → `npx jest --listTests` in RỖNG
 *   mẫu mới `'<rootDir>/\\.claude/'` → 194 bộ
 * Cây chính giữ nguyên 194 ở cả hai lần, tức vế "không quét lặp" không mất.
 *
 * Bài này ghim mẫu phải NEO vào `<rootDir>`. Gỡ `<rootDir>` khỏi một trong hai
 * khoá là bài đỏ.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jestConfig = require('../../jest.config.js') as {
  testPathIgnorePatterns: string[];
  modulePathIgnorePatterns: string[];
};

type IgnoreKey = 'testPathIgnorePatterns' | 'modulePathIgnorePatterns';

/** Mọi mẫu nhắc tới thư mục `.claude`, gom từ cả hai khoá. */
function collectClaudePatterns(): { key: IgnoreKey; pattern: string }[] {
  const found: { key: IgnoreKey; pattern: string }[] = [];
  for (const key of ['testPathIgnorePatterns', 'modulePathIgnorePatterns'] as const) {
    for (const pattern of jestConfig[key]) {
      if (pattern.includes('.claude')) {
        found.push({ key, pattern });
      }
    }
  }
  return found;
}

describe('cây làm việc phụ chạy được bộ kiểm của chính nó', () => {
  it('cả hai khoá đều có mẫu chặn `.claude` — thiếu thì cây chính quét lặp', () => {
    const keys = collectClaudePatterns().map(entry => entry.key);
    expect(keys).toContain('testPathIgnorePatterns');
    expect(keys).toContain('modulePathIgnorePatterns');
  });

  it('mọi mẫu `.claude` phải neo vào `<rootDir>`, không khớp trôi nổi', () => {
    for (const { key, pattern } of collectClaudePatterns()) {
      if (!pattern.startsWith('<rootDir>')) {
        throw new Error(
          `jest.config.js ▸ ${key} có mẫu '${pattern}' không neo <rootDir>. ` +
            'Chạy jest bên trong .claude/worktrees/<tên> sẽ in "No tests found" và thoát 0 — ' +
            'một lượt chạy 0 bài trông y hệt một lượt chạy toàn xanh.',
        );
      }
      expect(pattern.startsWith('<rootDir>')).toBe(true);
    }
  });

  it('mẫu neo loại cây phụ khi nhìn từ cây chính, và GIỮ khi nhìn từ chính nó', () => {
    const mainRoot = '/Users/x/Projects/SuperApp';
    const worktreeRoot = `${mainRoot}/.claude/worktrees/agent-1`;
    const fileInsideWorktree = `${worktreeRoot}/src/config/sample.test.ts`;

    for (const { pattern } of collectClaudePatterns()) {
      // Cây CHÍNH: `<rootDir>` = mainRoot ⟹ phải LOẠI tệp của cây phụ.
      const seenFromMain = new RegExp(pattern.replace('<rootDir>', mainRoot));
      expect(seenFromMain.test(fileInsideWorktree)).toBe(true);

      // Cây PHỤ: `<rootDir>` = worktreeRoot ⟹ phải GIỮ tệp của chính nó.
      const seenFromWorktree = new RegExp(pattern.replace('<rootDir>', worktreeRoot));
      expect(seenFromWorktree.test(fileInsideWorktree)).toBe(false);
    }
  });
});
