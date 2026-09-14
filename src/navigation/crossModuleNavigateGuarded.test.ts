/**
 * Mọi `navigate('X')` tới route của MỘT MODULE KHÁC phải có cổng lọc trong cùng tệp.
 *
 * ── Vì sao bài này cần thiết, dù đã có `routeTargets.test.ts` ────────────────────
 * `routeTargets.test.ts` hỏi: *"route này có được khai ở ĐÂU ĐÓ trong hệ không?"* Nó
 * dựng tập route hợp lệ từ `routes` của MỌI `module.manifest.json`, không lọc theo
 * `modules` của app đang dựng. Nên khi CheckFarm khai `modules` không có `chat`, bài
 * đó vẫn XANH cho ba lời gọi `navigate('ChatRoom', …)` trong module `work` — vì
 * `chat/module.manifest.json` khai `ChatRoom` vô điều kiện.
 *
 * Hai câu hỏi khác nhau, và bài cũ trả lời câu KHÔNG phải câu đang cần:
 *   · "route có tồn tại trong hệ" — bài cũ đo được.
 *   · "route có tới được trong CÂY ĐANG CHẠY của app này" — không bài nào đo.
 *
 * Đo được 14/09/2026, năm chỗ cùng một lỗ và không cổng nào đỏ:
 *   `screens/HomeScreen.tsx` ô "Tin nhắn ProofChat" (lối vào chat THỨ HAI trên cùng
 *   màn, cách khối đã vá 780 dòng) · cùng màn, ô "Trang trại đang theo dõi" trỏ
 *   `Farms` của `trace` · ba nút chat trong `modules/work/screens/`, một trong đó gọi
 *   `openConversation` — một lệnh POST THẬT — trước khi điều hướng.
 *
 * ── Bài này ghim được gì, và KHÔNG ghim được gì ─────────────────────────────────
 * Nó đọc mã nguồn và đòi tệp gọi phải NHẮC tới `routeIsReachable`. Đó là cổng "đã
 * nghĩ tới chưa", không phải chứng minh cổng lọc bọc đúng lời gọi ấy — một tệp lọc
 * chỗ này mà quên chỗ kia thì bài vẫn xanh. Viết ra chỗ yếu này ngay đây, vì một
 * cổng tự nhận chặt hơn thực tế thì lần sau người ta dựa vào nó để khỏi phải xem.
 *
 * Điều nó ghim CHẮC: một lối vào chéo module MỚI, ở một tệp chưa từng lọc gì, thì
 * ĐỎ ngay — và đó đúng là hình dạng của cả năm chỗ vừa tìm ra.
 */

import fs from 'fs';
import path from 'path';

import { MODULE_IDS, type ModuleId } from './moduleIds';
import { moduleOwningRoute } from './moduleCatalog';
import { INSTANCES } from '../config/instance.config';

const SRC = path.join(__dirname, '..');

/**
 * Miễn trừ — và lý do miễn trừ TỰ CÓ CHUÔNG, xem bài kiểm cuối tệp.
 *
 * Ba màn dưới đây nằm ở NỀN nhưng thuộc **cụm truy xuất** (`hostRoutes.ts` ghi rõ
 * *"Quả · cây · vườn — cụm truy xuất nằm ở HOST, không ở module `trace`"*). Chúng điều
 * hướng sang `TreeDetail` / `FarmDetail` — hai route của module `trace` — và việc đó
 * đúng, vì màn gọi và màn đích là hai nửa của cùng một cụm: ghi danh một cây xong thì
 * phải mở được hồ sơ cây đó, không có nhánh nào khác có nghĩa.
 *
 * Miễn trừ này đứng được vì **mọi app đang dựng đều bật `trace`** — và đó là một phép
 * đo, không phải một giả định: bài `mọi app còn bật 'trace'` ở cuối tệp đọc
 * `INSTANCES` và ĐỎ ngay ngày điều đó thôi đúng, kèm danh sách chính ba tệp này. Nên
 * ngày Aladin tắt cụm truy xuất, chuông reo ở đúng chỗ phải sửa, không im.
 */
const MIEN_TRU_CUM_TRUY_XUAT: ReadonlySet<string> = new Set([
  'screens/TreeEnrollScreen.tsx',
  'screens/TreeIdentityScreen.tsx',
  'screens/TreeManagementScreen.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(p);
  }
  return out;
}

/** Tệp này thuộc module nào? `null` = mã của host shell. */
function moduleOwningFile(file: string): ModuleId | null {
  const rel = path.relative(SRC, file).split(path.sep);
  if (rel[0] !== 'modules') return null;
  const id = rel[1] as ModuleId;
  return MODULE_IDS.includes(id) ? id : null;
}

interface CrossCall {
  where: string;
  route: string;
  routeOwner: ModuleId;
  fileOwner: ModuleId | null;
}

/** Mọi lời gọi điều hướng tới route của module khác, kèm `tệp:dòng`. */
function crossModuleCalls(): CrossCall[] {
  // Cùng mẫu với `routeTargets.test.ts`: buộc đứng sau một tên biến chứa `nav`, để
  // `arr.push('x')` và `.replace('a','b')` trên chuỗi không lọt vào thành đỏ giả.
  const re = /(?:navigation|nav)[^\n]{0,40}\.(?:navigate|replace)\(\s*'([A-Za-z0-9_]+)'/g;
  const out: CrossCall[] = [];

  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file);
    if (MIEN_TRU_CUM_TRUY_XUAT.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const fileOwner = moduleOwningFile(file);
    // Tệp có nhắc phép hỏi ⟹ coi như đã nghĩ tới. Xem chỗ yếu ở đầu tệp.
    const daLoc = text.includes('routeIsReachable');

    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        const route = m[1];
        const routeOwner = moduleOwningRoute(route);
        if (routeOwner === null) continue; // route của host — luôn có mặt
        if (routeOwner === fileOwner) continue; // gọi trong chính module mình
        if (daLoc) continue;
        out.push({
          where: `${path.relative(SRC, file)}:${i + 1}`,
          route,
          routeOwner,
          fileOwner,
        });
      }
    });
  }
  return out;
}

describe('lối vào chéo module', () => {
  it('KHÔNG tệp nào điều hướng sang route của module khác mà không có cổng lọc', () => {
    const ho = crossModuleCalls();
    const bang = ho
      .map(c => `  ${c.where} → '${c.route}' (của module '${c.routeOwner}')`)
      .join('\n');

    expect(
      ho.length === 0
        ? ''
        : `Các lối vào sau tới route của module KHÁC mà tệp không hề gọi ` +
          `\`routeIsReachable\`.\nApp nào không khai module đó thì đây là nút chết — ` +
          `hoặc tệ hơn, một lượt gọi mạng cho tính năng app đã khai là không có:\n${bang}\n\n` +
          `Bịt bằng: bọc lối vào trong \`routeIsReachable('<route>', ENABLED_MODULES)\`. ` +
          `Lối vào nào CỐ Ý không lọc thì nói lý do ở commit và thêm tệp vào danh sách ` +
          `miễn trừ trong bài kiểm này — đừng nới mẫu tìm.`,
    ).toBe('');
  });

  it('phép tìm thật sự bắt được — dựng một lời gọi chéo giả thì nó phải thấy', () => {
    // Không có bài này thì bài trên xanh cả khi `moduleOwningRoute` trả `null` cho
    // mọi thứ, hoặc khi mẫu tìm không khớp gì. Xanh ở cả hai cực nghĩa là không kiểm.
    const routeChat = 'ChatRoom';
    expect(moduleOwningRoute(routeChat)).toBe('chat');

    const re = /(?:navigation|nav)[^\n]{0,40}\.(?:navigate|replace)\(\s*'([A-Za-z0-9_]+)'/;
    const dong = "          onPress={() => navigation.navigate('ChatRoom', { roomId: x })}";
    expect(re.exec(dong)?.[1]).toBe('ChatRoom');
  });

  // ── CHUÔNG HẾT HẠN CHO DANH SÁCH MIỄN TRỪ ────────────────────────────────────
  // Miễn trừ ở đầu tệp đứng được nhờ MỘT tiền đề: mọi app đang dựng đều bật `trace`,
  // nên `TreeDetail`/`FarmDetail` có mặt ở mọi cây điều hướng. Tiền đề đó nằm ở tệp
  // KHÁC (`instance.config.ts`) và có thể đổi vì một lý do chẳng liên quan gì tới điều
  // hướng — ví dụ tắt cụm truy xuất ở một app để nộp cửa hàng. Không có bài này thì
  // ngày đó ba tệp kia thành ba nút chết mà không cổng nào kêu, và danh sách miễn trừ
  // vẫn nằm im trông như một quyết định còn đúng.
  it('mọi app còn bật `trace` — tiền đề của danh sách miễn trừ', () => {
    const thieu = Object.entries(INSTANCES)
      .filter(([, cfg]) => cfg.modules !== 'all' && !cfg.modules.includes('trace'))
      .map(([id]) => id);

    expect(
      thieu.length === 0
        ? ''
        : `App sau KHÔNG còn bật module 'trace': ${thieu.join(', ')}.\n` +
          `Danh sách miễn trừ ở đầu tệp này (${[...MIEN_TRU_CUM_TRUY_XUAT].join(', ')}) ` +
          `dựa vào việc mọi app đều bật 'trace', nên nó VỪA HẾT HIỆU LỰC: các màn đó ` +
          `điều hướng sang 'TreeDetail'/'FarmDetail' — hai route của 'trace' — và ở app ` +
          `trên chúng là nút chết.\nHai đường xử: (1) tắt luôn cụm truy xuất ở app đó ` +
          `(bỏ đăng ký các màn này khỏi cây điều hướng), hoặc (2) bọc từng lối vào bằng ` +
          `\`routeIsReachable\` rồi gỡ tệp khỏi danh sách miễn trừ.`,
    ).toBe('');
  });

  it('route của host KHÔNG bị bài trên đòi cổng — nếu bị thì nó đỏ khắp nơi', () => {
    // `Home`, `Account`, `PhoenixWallet` thuộc nền, có ở mọi app kể cả `modules: []`.
    for (const r of ['Home', 'Account', 'PhoenixWallet']) {
      expect(moduleOwningRoute(r)).toBeNull();
    }
  });
});
