/**
 * Cổng hai chiều: app KHÔNG được hứa sinh MAGIC khi chưa có mã sinh MAGIC.
 *
 * Tới 15/09/2026, thẻ LAMP ở màn Tài khoản in cho người dùng đọc "Sinh MAGIC mỗi
 * 5 ngày", dịch sẵn ra bốn thứ tiếng, trong khi quét cả `src/` lẫn `rust/` cho mọi
 * tên gọi của việc sinh MAGIC đều ra rỗng. Người dùng đọc rồi chờ một khoản không
 * bao giờ tới, và không có gì trong kho kêu lên.
 *
 * Cổng này đo CẢ HAI vế chứ không chỉ cấm chữ. Ngày nào cửa sinh MAGIC có mã thật
 * thì vế thứ hai bật lên và lời hứa được phép quay lại — không ai phải nhớ đi gỡ
 * một luật đã hết hiệu lực. Đó cũng là lý do nó không phải một dòng `.eslintrc`.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');

/** Mọi tệp mã dưới một thư mục, bỏ qua thứ không phải nguồn. */
function sourceFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'target' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(p, exts));
    else if (exts.some(e => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Dòng chú thích không phải chữ người dùng đọc — và chính chú thích giải thích
 *  vì sao lời hứa bị gỡ cũng nhắc lại nó. */
const isComment = (line: string): boolean => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

/** Lời hứa sinh MAGIC, ở cả bốn ngôn ngữ app đang phát hành. */
const PROMISE = /sinh MAGIC|generates? MAGIC|产出 MAGIC|MAGIC を生成/i;

/** Mọi tên gọi mà một cửa sinh MAGIC có thể mang. */
const GENERATION = /schedulegen|generateMagic|mintMagic|magicSchedule/i;

describe('lời hứa sinh MAGIC phải có mã đứng sau', () => {
  // ⛔ Tệp này phải tự loại mình ra khỏi CẢ HAI vế, không chỉ vế lời hứa.
  //
  // Hai biểu thức ở trên chứa nguyên văn mọi từ khoá mà chúng đi tìm. Bỏ sót chỗ
  // loại này ở vế "đã có mã sinh MAGIC" thì cổng tự thấy chính mình, kết luận cửa
  // sinh MAGIC đã có, rồi tự tắt — và nó tắt trong im lặng, với hai dòng xanh.
  // Đo được: dán lại lời hứa vào `AccountScreen` mà cổng vẫn 2/2 xanh.
  const self = (f: string) => f.endsWith('magicPromiseHasCode.test.ts');

  const srcFiles = sourceFiles(path.join(ROOT, 'src'), ['.ts', '.tsx']).filter(f => !self(f));
  const codeFiles = [
    ...srcFiles,
    ...sourceFiles(path.join(ROOT, 'rust'), ['.rs']),
  ];

  const generationSites = codeFiles.filter(f =>
    fs.readFileSync(f, 'utf8').split('\n').some(l => !isComment(l) && GENERATION.test(l)));

  const promiseSites: string[] = [];
  for (const f of srcFiles) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!isComment(line) && PROMISE.test(line)) {
        promiseSites.push(`${path.relative(ROOT, f)}:${i + 1}  ${line.trim()}`);
      }
    });
  }

  it('chưa có cửa sinh MAGIC thì không được hứa sinh MAGIC', () => {
    if (generationSites.length > 0) {
      // Vế thứ hai đã bật: cửa sinh MAGIC có mã, nên lời hứa hợp lệ. Ca này tự
      // ngừng chặn, và dòng dưới đây nói ra điều kiện đang có hiệu lực.
      expect(generationSites.length).toBeGreaterThan(0);
      return;
    }
    expect(promiseSites).toEqual([]);
  });

  it('nêu rõ phạm vi đã quét, để con số trên không bị đọc rộng hơn nó', () => {
    // Quét `src/**/*.ts(x)` và `rust/**/*.rs`. Nằm NGOÀI: `android/`, `ios/`,
    // `docs/`, và mọi chữ do máy chủ gửi về lúc chạy — cổng chạy trên kho, không
    // chạy trên phản hồi mạng.
    expect(srcFiles.length).toBeGreaterThan(100);
  });
});
