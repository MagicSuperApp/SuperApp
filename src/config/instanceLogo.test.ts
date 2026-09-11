/**
 * Tài sản mang NHẬN DIỆN phải đi qua lời khai instance — không màn nào tự gọi.
 *
 * ── Ca hỏng bài này sinh ra để chặn ─────────────────────────────────────────
 * Tới 2026-09-10, bốn màn viết thẳng `require('../../assets/images/logo.png')`:
 * `AppHeader.tsx:183` · `LoginScreen.tsx:389` · `OnboardingScreen.tsx:107` ·
 * `LanguageSelectScreen.tsx:98`. Một tệp duy nhất, và nó là dấu của **Aladin**.
 * App CheckFarm — pháp nhân khác, hồ sơ cửa hàng khác — đeo dấu Aladin ở bốn
 * màn, ba trong số đó là màn người dùng gặp TRƯỚC khi đăng nhập.
 *
 * ── Vì sao bản ĐẦU của bài này chưa đủ, và đó mới là bài học ────────────────
 * Bản đầu khai một danh sách CẤM: hai biểu thức khớp `assets/images/logo.png`
 * và `instances/<mã>/brand/`. Nó chặt ở trục TỆP NGUỒN (quét cả cây), nhưng ở
 * trục TÀI SẢN nó chỉ là danh sách do người viết nhớ ra — đúng thứ bản đầu tự
 * dặn là đừng làm. Soi lại cùng ngày thấy nó bỏ lọt hai dấu Aladin ĐANG CHẠY:
 *
 *   · `features/treeQr/TreeQrCode.tsx` — `assets/images/QR_BG.png`, mặt cười
 *     Aladin làm nền TEM MÃ QR. Tem được IN RA và dán lên nông sản; sai ở đây
 *     không thu về được bằng một lần đẩy mã.
 *   · `components/BlinkLogo.tsx` + `TalkingBlinkLogo.tsx` —
 *     `assets/animations/blink_logo.json`, linh vật Aladin ở bong bóng trợ lý
 *     nổi trên MỌI màn.
 *
 * Nên bài này ĐẢO CHIỀU: không liệt kê cái bị cấm, mà liệt kê cái được phép
 * dùng chung. Tài sản mới không có trong bảng cho phép là ĐỎ theo mặc định —
 * người thêm nó phải nói rõ nó dùng chung được, thay vì im lặng đi lọt.
 *
 * ── Bảng cho phép: cái gì KHÔNG đổi theo app ───────────────────────────────
 * Ảnh biểu tượng module, ảnh nền màn Truy xuất, tệp khai báo module — giống
 * nhau ở mọi app, và bắt chúng đi qua một lớp khai báo là thêm một tầng gián
 * tiếp không trả lại gì. Gộp chúng với tài sản nhận diện sẽ đẻ ra một luật ai
 * cũng vi phạm, tức một luật chết.
 */
import fs from 'fs';
import path from 'path';

import { ALADIN_INSTANCE, CHECKFARM_INSTANCE, INSTANCES } from './instance.config';

const SRC = path.resolve(__dirname, '..');
const DECLARATION = path.join(SRC, 'config', 'instance.config.ts');

/**
 * Tài sản KHÔNG đổi theo app — được phép gọi thẳng ở bất cứ đâu.
 * Thêm dòng ở đây là một lời khai "cái này dùng chung được", không phải một
 * thao tác dọn cảnh báo.
 */
const SHARED_ASSETS = [
  /assets\/images\/modules\//, // biểu tượng module
  /assets\/images\/trace\//, // ảnh nền màn Truy xuất
  /modules\/[a-z]+\/module\.manifest\.json/, // lời khai module
];

/** Đuôi tệp tính là tài sản. `.json` có mặt vì linh vật Lottie là `.json`. */
const ASSET_REF =
  /(?:require\s*\(\s*|from\s+)['"]([^'"]*\.(?:png|jpg|jpeg|gif|webp|svg|json))['"]/g;

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Lời gọi tài sản KHÔNG nằm trong bảng dùng chung.
 *
 * Quét trên TOÀN VĂN chứ không theo từng dòng, và bắt cả `import x from '…'`.
 * Bản đầu lọc theo dòng và đòi chữ `require(` cùng dòng với đường dẫn, nên một
 * lời gọi bị Prettier ngắt xuống hai dòng đi lọt sạch — mà đó là thứ Prettier
 * TỰ SINH khi dòng vượt bề rộng, không cần ai cố ý.
 */
function brandAssetRefs(code: string): { line: number; asset: string }[] {
  // Bỏ chú thích khối và chú thích dòng: chú thích ở lời khai có trích lại lời
  // gọi cũ để giải thích ca hỏng, và đó không phải mã chạy.
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => ' '.repeat(m.length));
  const out: { line: number; asset: string }[] = [];
  for (const m of stripped.matchAll(ASSET_REF)) {
    const asset = m[1];
    if (SHARED_ASSETS.some((re) => re.test(asset))) continue;
    out.push({ line: stripped.slice(0, m.index).split('\n').length, asset });
  }
  return out;
}

describe('tài sản nhận diện chỉ khai một chỗ', () => {
  it('mỗi instance khai đủ `logo` và `qrBackdrop`', () => {
    const missing = Object.entries(INSTANCES)
      .filter(([, c]) => !c.logo || !c.qrBackdrop)
      .map(([id]) => id);
    expect(missing).toEqual([]);
  });

  it('KHÔNG hai app nào dùng chung một dấu — soát MỌI cặp, không riêng hai app hôm nay', () => {
    // Bản đầu so đúng cặp `ALADIN` / `CHECKFARM` gõ cứng, nên app thứ ba trùng
    // dấu với Aladin vẫn xanh.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, c] of Object.entries(INSTANCES)) {
      const key = JSON.stringify(c.logo);
      const prev = seen.get(key);
      if (prev) clashes.push(`${prev} ↔ ${id}`);
      else seen.set(key, id);
    }
    expect(clashes).toEqual([]);
    // Giữ phép so tường minh của hai app hôm nay: vòng lặp trên xanh khi bảng
    // chỉ còn MỘT app, và lúc ấy nó chẳng chứng minh gì.
    expect(ALADIN_INSTANCE.logo).not.toEqual(CHECKFARM_INSTANCE.logo);
  });

  it('không tệp nguồn nào ngoài lời khai tự gọi tài sản riêng-theo-app', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file === DECLARATION) continue;
      for (const { line, asset } of brandAssetRefs(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${path.relative(SRC, file)}:${line}  ${asset}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ĐỐI CHỨNG — máy quét nhìn thấy mã, và thấy đúng thứ nó đi tìm', () => {
    // Không có mục này, bài trên xanh y hệt khi `sourceFiles` trả mảng rỗng vì
    // sai đường dẫn, hoặc khi biểu thức tìm không khớp gì nữa sau một lần sửa.
    expect(sourceFiles(SRC).length).toBeGreaterThan(100);

    // Lời khai phải chứa ít nhất một lời gọi cho MỖI app — nếu bảng cho phép bị
    // nới quá tay, con số này tụt và mục trên thành cổng rỗng.
    const inDeclaration = brandAssetRefs(fs.readFileSync(DECLARATION, 'utf8'));
    expect(inDeclaration.length).toBeGreaterThanOrEqual(Object.keys(INSTANCES).length);
  });
});
