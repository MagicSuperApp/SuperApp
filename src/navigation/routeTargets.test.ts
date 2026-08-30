/**
 * Mọi đích `navigation.navigate('X')` phải có route `X` thật.
 *
 * Vì sao cần test này, và vì sao nó đọc MÃ NGUỒN chứ không render:
 *
 * Màn Điều khoản (`TermsScreen`) tồn tại, có nội dung thật, và HAI nút bấm thật đã
 * trỏ vào nó — `AccountScreen.tsx` và `SignUpBiometricScreen.tsx` — nhưng route
 * `'Terms'` chưa bao giờ được đăng ký. Bấm là ném "NAVIGATE ... was not handled by
 * any navigator". Chỗ đó sống sót qua 107 bộ test và 1.615 phép kiểm, vì:
 *   - mọi test đều `jest.mock('@react-navigation/native')` với `navigate: jest.fn()`,
 *     nên không lần nào có navigator thật để mà từ chối;
 *   - hai màn đó không có test render nào.
 * Tức là không có phép kiểm nào đứng ở chỗ này được, trừ phép kiểm đọc mã nguồn.
 *
 * Test này không thay được test render. Nó chỉ đóng đúng một lớp: đích điều hướng
 * treo lơ lửng.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(p);
  }
  return out;
}

/** Route khai trong navigator gốc + `routes` của từng manifest module liên bang. */
function declaredRoutes(): Set<string> {
  const names = new Set<string>();
  const nav = fs.readFileSync(path.join(SRC, 'navigation/index.tsx'), 'utf8');
  for (const m of nav.matchAll(/name:\s*'([A-Za-z0-9_]+)'/g)) names.add(m[1]);

  const modulesDir = path.join(SRC, 'modules');
  for (const mod of fs.readdirSync(modulesDir)) {
    const manifest = path.join(modulesDir, mod, 'module.manifest.json');
    if (!fs.existsSync(manifest)) continue;
    const routes = JSON.parse(fs.readFileSync(manifest, 'utf8')).routes ?? [];
    for (const r of routes) names.add(r);
  }
  return names;
}

/** Mọi `navigation.navigate('X')` / `.replace('X')` trong `src/`, kèm file:line. */
function navigationTargets(): Map<string, string[]> {
  const targets = new Map<string, string[]>();
  // Buộc phải đứng sau một tên biến chứa `nav` — nếu không, `arr.push('x')` và
  // `.replace('a','b')` trên chuỗi cũng lọt vào và test đỏ giả.
  const re = /(?:navigation|nav)[^\n]{0,40}\.(?:navigate|replace)\(\s*'([A-Za-z0-9_]+)'/g;
  for (const file of walk(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        const where = `${path.relative(SRC, file)}:${i + 1}`;
        targets.set(m[1], [...(targets.get(m[1]) ?? []), where]);
      }
    });
  }
  return targets;
}

describe('đích điều hướng', () => {
  const declared = declaredRoutes();
  const used = navigationTargets();

  it('quét được cả hai phía (đề phòng regex hỏng ⇒ test xanh rỗng)', () => {
    expect(declared.size).toBeGreaterThan(40);
    expect(used.size).toBeGreaterThan(30);
  });

  it('route Terms có thật — hai nút đang trỏ vào nó', () => {
    expect(declared.has('Terms')).toBe(true);
  });

  it('không đích nào trỏ vào route không tồn tại', () => {
    const treo = [...used.entries()]
      .filter(([name]) => !declared.has(name))
      .map(([name, at]) => `${name}  ←  ${at.join(', ')}`);
    expect(treo).toEqual([]);
  });
});
