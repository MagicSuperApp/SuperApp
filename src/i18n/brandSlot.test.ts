/**
 * `{brand}` phải BIẾN MẤT trước khi chữ ra tới màn hình — ở CẢ HAI lối từ điển.
 *
 * ── Vì sao có bài này ───────────────────────────────────────────────────────
 * Kho có hai lối tra chữ sống song song (`i18n/keys/index.ts` giải thích lý do):
 * lối câu-làm-khoá đọc qua `t()`, và lối khoá đọc qua `tk()`. Chỗ thay tên app
 * được cài ở `t()` từ 2026-08-29 — nhưng `tk()` thì không, và không ai thấy cho
 * tới 2026-09-10, khi bản CheckFarm chạy trên máy ảo hiện đúng chữ
 *
 *     Hỏi {brand} về vườn của bạn…
 *
 * ở ô hỏi trợ lý màn Truy xuất. Bảy chuỗi mang khuôn đó (`keys/trace.ts`,
 * `keys/map.ts`), trong đó có câu XIN QUYỀN vị trí — tức người dùng bị từ chối
 * quyền sẽ đọc một câu hướng dẫn còn nguyên dấu ngoặc nhọn trong đó.
 *
 * ── Bài này canh cái gì ─────────────────────────────────────────────────────
 * Không canh "có gọi hàm thay không" (thứ đó viết lại là qua). Nó gọi THẬT mọi
 * khoá và mọi câu, ở MỌI ngôn ngữ, rồi soi kết quả — và đỏ kèm tên chính chuỗi
 * bị hỏng.
 *
 * Bài cuối canh chiều ngược: ngày từ điển hết sạch `{brand}`, hai bài trên vẫn
 * xanh mà chẳng chứng minh gì. Nó bắt lúc ấy phải xoá luôn cả bài, chứ không để
 * lại một cổng rỗng.
 */
import fs from 'fs';
import path from 'path';

import { DICTIONARY } from './dictionary';
import { ALL_STRINGS, allKeys, tk } from './keys';
import { setLanguage } from './store';
import { clearCache, t } from './translate';
import { SUPPORTED_LANGS } from './types';

const SLOT = '{brand}';

const hasSlot = (entry: Record<string, unknown>): boolean =>
  Object.values(entry).some((s) => typeof s === 'string' && s.includes(SLOT));

describe('chỗ thay tên app không được lọt ra màn hình', () => {
  afterAll(() => {
    setLanguage('vi', true);
    clearCache();
  });

  it.each(SUPPORTED_LANGS)('tk() — mọi khoá, tiếng %s', (lang) => {
    setLanguage(lang, true);
    const leaked = allKeys().filter((key) => tk(key).includes(SLOT));
    expect(leaked).toEqual([]);
  });

  it.each(SUPPORTED_LANGS)('t() — mọi câu, tiếng %s', (lang) => {
    setLanguage(lang, true);
    clearCache();
    const leaked = Object.keys(DICTIONARY).filter((src) => t(src).includes(SLOT));
    expect(leaked).toEqual([]);
  });

  /**
   * Lỗ hổng của CHÍNH hai bài trên, tìm ra 2026-09-10 khi soi lại:
   *
   * Chúng gọi `t()` / `tk()` THẲNG. Nhưng phần lớn chữ trong app không đi lối
   * đó — nó là chuỗi tiếng Việt viết thẳng trong JSX, và `i18n/autoText.tsx`
   * bọc `<Text>` để dịch ở cửa ra. Mà lớp bọc ấy có một đường tắt:
   *
   *     autoText.tsx:54   if (lang === SOURCE_LANG) return <Original {...props} />;
   *
   * Tiếng Việt là `SOURCE_LANG`. Nên với người dùng Việt — phần đông người dùng
   * — `<Text>` KHÔNG gọi `t()` lần nào, và một chuỗi mang `{brand}` viết thẳng
   * trong JSX sẽ hiện nguyên dấu ngoặc nhọn lên màn. Hai bài trên xanh suốt,
   * vì chúng đo một đường mà chỗ hỏng không đi qua.
   *
   * Hôm nay chưa vỡ: mọi chỗ dùng `{brand}` đều gọi `t()` tường minh. Bài này
   * khoá trạng thái ấy lại, để lần đầu có người viết `{brand}` thẳng vào JSX
   * thì đỏ ngay — chứ không phải đợi thấy trên máy người dùng như lần trước.
   */
  it('KHÔNG chuỗi `{brand}` nào viết thẳng trong JSX — đường autoText bỏ qua t() ở tiếng Việt', () => {
    const SRC = path.resolve(__dirname, '..');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
      });

    const files = walk(SRC).filter((f) => !f.includes(`${path.sep}i18n${path.sep}`));
    const raw: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((text, i) => {
          if (!text.includes(SLOT)) return;
          if (/^\s*(\/\/|\*|\/\*)/.test(text)) return; // dòng chú thích
          // Có `{brand}` mà KHÔNG nằm trong một lời gọi dịch nào ⇒ nó sẽ ra màn
          // đúng như đang viết.
          if (/\bt\s*\(|\btf\s*\(|\btk\s*\(/.test(text)) return;
          raw.push(`${path.relative(SRC, file)}:${i + 1}  ${text.trim()}`);
        });
    }
    expect(raw).toEqual([]);
    // ĐỐI CHỨNG cho chính mục này: máy quét có nhìn thấy tệp thật không.
    expect(files.length).toBeGreaterThan(100);
  });

  it('từ điển THÔ vẫn còn khuôn — nếu hết thì hai bài trên xanh vì rỗng', () => {
    const rawKeysWithSlot = Object.values(ALL_STRINGS).filter((entry) =>
      hasSlot(entry as Record<string, unknown>),
    );
    const rawPhrasesWithSlot = Object.values(DICTIONARY).filter((entry) =>
      hasSlot(entry as unknown as Record<string, unknown>),
    );
    expect(rawKeysWithSlot.length).toBeGreaterThan(0);
    expect(rawPhrasesWithSlot.length).toBeGreaterThan(0);
  });
});
