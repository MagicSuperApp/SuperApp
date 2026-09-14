/**
 * nulByteScan — CANH BYTE ĐIỀU KHIỂN TRONG MÃ NGUỒN.
 *
 * ══ Lỗi đang vá ═══════════════════════════════════════════════════════════════
 * `FarmsMap.tsx` mang MỘT byte NUL nằm trong một chuỗi ký tự (đo 2026-09-10,
 * offset 20054, dòng 441). Byte đó không hiện ra trên màn hình, không làm `tsc`
 * đỏ, không làm jest đỏ, không làm app sai. Nó chỉ làm đúng một việc:
 *
 *     $ file src/modules/trace/components/FarmsMap.tsx
 *     src/modules/trace/components/FarmsMap.tsx: data        ← không phải "text"
 *
 * và từ đó `grep -rn` trên cây nguồn in `Binary file … matches` thay vì in dòng.
 * Tức **toàn bộ 819 dòng của tệp ấy biến mất khỏi mọi phép rà bằng grep** — kể
 * cả các bài kiểm quét mã nguồn, kể cả mọi lần soát tay từ trước tới nay. Không
 * phép đo nào kêu; cái xanh của chúng chỉ có nghĩa "tôi không nhìn thấy tệp đó".
 *
 * Đây đúng thứ Forall gọi là **KHÔNG ĐO ĐƯỢC đội lốt KHỚP**: trạng thái mù trả
 * về màu của trạng thái lành.
 *
 * ══ Byte đó vào bằng đường nào ════════════════════════════════════════════════
 * Đo được trong lúc vá (2026-09-10): gõ chuỗi thoát sáu ký tự cho NUL vào một
 * công cụ soạn thảo tệp thì công cụ **ghi ra BYTE THẬT**, không ghi ra sáu ký
 * tự. Nên "chỉ viết chuỗi thoát thôi" là một lời dặn KHÔNG tự cưỡng chế được —
 * phải có bài kiểm này đứng sau nó. Cách viết an toàn: `String.fromCharCode(0)`.
 *
 * ══ Bài này canh gì ═══════════════════════════════════════════════════════════
 * Mọi byte điều khiển C0 trừ tab · xuống dòng · về đầu dòng, cộng DEL (0x7F).
 * Không chỉ NUL: các byte C0 khác cũng đủ làm công cụ xếp tệp thành nhị phân.
 *
 * ══ Vì sao có mục ĐỐI CHỨNG ═══════════════════════════════════════════════════
 * Một bài "quét rồi khẳng định không thấy gì" xanh y hệt nhau ở hai ca: quét
 * đúng và **không quét gì cả** (sai đường dẫn, sai đuôi tệp, thư mục rỗng). Nên
 * bài này khẳng định luôn số tệp quét được — đó là phần chứng minh nó có mở mắt.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');

/** Thư mục gốc để quét. `Legacy/` cố ý ngoài danh sách — mã đã về hưu. */
const SCAN_ROOTS = ['src', 'instances', 'scripts', '.github'];

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md',
  '.yml', '.yaml', '.sh', '.html', '.css',
]);

/** Cây phụ / phụ thuộc / sản phẩm dựng — không phải mã của kho này. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.claude', 'build', 'Pods',
  'DerivedData', 'vendor', '.gradle', 'Legacy', 'coverage',
]);

/**
 * Byte điều khiển ĐƯỢC PHÉP: tab, xuống dòng, về đầu dòng. Mọi C0 khác và DEL
 * đều bị chặn.
 */
const isForbiddenControlByte = (b: number): boolean =>
  b === 0x7f || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d);

type Offender = {
  /** Đường dẫn tương đối gốc kho — đọc được, và không lộ đường máy ai. */
  relPath: string;
  offset: number;
  byte: number;
  line: number;
};

const listSourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (abs: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(abs, e.name));
      } else if (e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name))) {
        out.push(path.join(abs, e.name));
      }
    }
  };
  for (const r of SCAN_ROOTS) walk(path.join(REPO_ROOT, r));
  return out;
};

/** Byte điều khiển ĐẦU TIÊN của một tệp, hoặc null. Dừng ở byte đầu là đủ. */
const firstOffendingByte = (absPath: string): Offender | null => {
  const buf = fs.readFileSync(absPath);
  for (let i = 0; i < buf.length; i += 1) {
    if (!isForbiddenControlByte(buf[i])) continue;
    let line = 1;
    for (let j = 0; j < i; j += 1) if (buf[j] === 0x0a) line += 1;
    return {
      relPath: path.relative(REPO_ROOT, absPath),
      offset: i,
      byte: buf[i],
      line,
    };
  }
  return null;
};

/**
 * Tệp ĐÃ BIẾT còn byte điều khiển, kèm lý do chưa vá ở lượt này.
 *
 * ⚠ Đây KHÔNG phải danh sách miễn trừ vĩnh viễn. Bài `mọi mục trong danh sách
 * đã biết PHẢI còn là tệp lỗi` bên dưới bắt nó **tự chết**: ai vá xong tệp thì
 * bài đó đỏ và buộc phải gỡ dòng khai ra. Không có đường để một dòng ở đây nằm
 * lại sau khi hết lý do — đó là khác biệt giữa ngoại lệ có tên và cổng nhả câm.
 */
const KNOWN_OFFENDERS: Readonly<Record<string, string>> = {
  // RỖNG, và đã từng không rỗng — giữ lại lịch sử đó vì nó chứng minh cơ chế chạy.
  //
  // `src/features/devices/deviceName.test.ts` từng khai ở đây (byte 0x01 và 0x85
  // dán THẬT làm dữ liệu mẫu cho ca "ký tự điều khiển C0/C1"). Vá 2026-09-11 bằng
  // chuỗi thoát sáu ký tự. Bài "mọi mục trong danh sách đã biết PHẢI còn
  // là tệp lỗi" lập tức đỏ và buộc gỡ dòng khai này ra. Đó đúng là điều nó sinh ra
  // để làm.
};

describe('mã nguồn không mang byte điều khiển — thứ làm grep MÙ cả tệp', () => {
  const files = listSourceFiles();
  const offenders = files
    .map(firstOffendingByte)
    .filter((o): o is Offender => o !== null);

  it('ĐỐI CHỨNG: bài này thật sự nhìn thấy mã, không quét vào chỗ trống', () => {
    // Không có mục này thì một lần đổi tên thư mục làm phép quét ra 0 tệp, và
    // bài vẫn xanh — xanh vì mù, đúng ca nó sinh ra để chặn.
    expect(files.length).toBeGreaterThan(100);
    // Và phải thấy đúng tệp đã từng mang byte NUL, không phải "một trăm tệp nào đó".
    expect(files.map((f) => path.relative(REPO_ROOT, f))).toContain(
      path.join('src', 'modules', 'trace', 'components', 'FarmsMap.tsx'),
    );
  });

  it('không tệp nào MỚI mang byte điều khiển', () => {
    const newOffenders = offenders.filter((o) => !(o.relPath in KNOWN_OFFENDERS));
    const report = newOffenders.map(
      (o) =>
        `${o.relPath}:${o.line} (offset ${o.offset}, byte 0x${o.byte
          .toString(16)
          .padStart(2, '0')})`,
    );
    // Thông điệp phải chỉ ra ĐÚNG chỗ: người bị đỏ không grep ra được tệp của
    // chính họ — đó là toàn bộ vấn đề.
    expect(report).toEqual([]);
  });

  it('mọi mục trong danh sách đã biết PHẢI còn là tệp lỗi — vá xong thì gỡ khai báo', () => {
    const alreadyFixed = Object.keys(KNOWN_OFFENDERS).filter(
      (rel) => !offenders.some((o) => o.relPath === rel),
    );
    // Đỏ ở đây là TIN VUI: tệp đã sạch. Gỡ dòng của nó khỏi `KNOWN_OFFENDERS`.
    expect(alreadyFixed).toEqual([]);
  });

  it('FarmsMap.tsx sạch — ghim đúng chỗ vá 2026-09-10', () => {
    const abs = path.join(REPO_ROOT, 'src/modules/trace/components/FarmsMap.tsx');
    expect(firstOffendingByte(abs)).toBeNull();
  });
});
