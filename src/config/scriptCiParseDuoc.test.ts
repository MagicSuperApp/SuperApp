/**
 * MỌI KHỐI `script:` TRONG `codemagic.yaml` PHẢI ĐỌC NỔI BẰNG SHELL.
 *
 * Vì sao có bài này. Ngày 2026-08-31, commit `4059404` tham số hoá bước ký theo
 * app. Nó để lại một dòng mở nháy kép mà không đóng:
 *
 *     TEN_KEY_PW="${TIEN_TO}_UPLOAD_KEY_PASSWORD
 *
 * Bash nuốt tiếp mọi dòng sau đó cho tới dấu nháy kế, nên cả bước
 * "Create Android config" không parse được. Luồng `android-appstore-aab` — luồng
 * DUY NHẤT sinh ra gói nộp cửa hàng — chết ngay ở đó, từ 31/08 tới 03/09.
 *
 * Điều đáng học không phải là thiếu một ký tự, mà là `kyTheoApp.test.ts` được
 * viết trong CHÍNH commit đó và vẫn xanh. Nó hỏi bốn câu — không gõ cứng tên app,
 * suy từ `ANDROID_FLAVOR`, mỗi bước tự suy lại tiền tố, bước đối chiếu cũng theo
 * app — và dòng hỏng TRẢ LỜI ĐÚNG cả bốn. Nó suy từ `$TIEN_TO` thật, nó không gõ
 * cứng tên app thật. Bài đó đọc script như đọc văn xuôi, nên chỗ vỡ nằm ngoài
 * tầm câu hỏi của nó. Header của chính nó đã tự khai: "Đây là phép đối chiếu văn
 * bản". Lỗ hổng nằm đúng chỗ nó tự khai là không với tới.
 *
 * Bài này bịt đúng nửa đó: không đọc chữ, đưa thẳng cho `bash -n`.
 *
 * ── Bài này KHÔNG đo gì ──────────────────────────────────────────────────────
 * `bash -n` chỉ soi CÚ PHÁP. Một script parse sạch vẫn có thể sai logic, gọi lệnh
 * không tồn tại, hay đọc biến rỗng. Lượt chạy thật trên Codemagic vẫn là phép đo
 * cuối. Bài này chỉ chặn đúng một loại hỏng — loại làm cả bước chết trước khi
 * chạy được dòng nào.
 *
 * Và hai giới hạn nữa, đo được chứ không phải phỏng đoán:
 *
 * 1. RUỘT HEREDOC KHÔNG PHẢI MÃ. Khối `ios-adhoc-ipa` mở `<<EOF` ở dòng 130 và
 *    đóng ở 221 — 90 dòng ở giữa là văn bản. Chèn `fi` lẻ vào giữa đó thì
 *    `bash -n` vẫn xanh, ĐÚNG như nó phải thế. Nhưng nghĩa là: một tệp sinh ra
 *    từ heredoc rồi được chạy sau đó nằm NGOÀI tầm bài này.
 *
 * 2. NHÁY MỞ RỒI TỰ ĐÓNG NHỜ DÒNG SAU KHÔNG PHẢI LỖI CÚ PHÁP. Thêm một `"` lẻ
 *    giữa khối mà phía dưới còn `"` khác thì chuỗi khép lại và bash nhận. Lỗi
 *    31/08 bị bắt vì nó nuốt luôn một `(` chứ không phải vì nó thiếu nháy. Tức
 *    bài này bắt đúng lớp hỏng "cả khối không đọc nổi", không hơn.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const GOC = join(__dirname, '..', '..');
const CODEMAGIC = readFileSync(join(GOC, 'codemagic.yaml'), 'utf8').split('\n');

type Khoi = { dong: number; than: string };

/**
 * Tách từng khối `script: |` theo mức thụt lề, không theo dấu hiệu nào khác.
 * Dòng trống KHÔNG kết thúc khối — YAML cho phép dòng trống giữa khối literal.
 */
function cacKhoi(): Khoi[] {
  const ra: Khoi[] = [];
  for (let i = 0; i < CODEMAGIC.length; i++) {
    const m = /^(\s*)script: \|\s*$/.exec(CODEMAGIC[i]);
    if (!m) continue;
    const thut = m[1].length + 2;
    const than: string[] = [];
    let j = i + 1;
    for (; j < CODEMAGIC.length; j++) {
      const d = CODEMAGIC[j];
      if (d.trim() === '') {
        than.push('');
        continue;
      }
      if (d.length - d.trimStart().length < thut) break;
      than.push(d.slice(thut));
    }
    ra.push({ dong: i + 2, than: than.join('\n') });
    i = j - 1;
  }
  return ra;
}

/** Trả về '' nếu parse sạch, hoặc dòng lỗi đầu tiên của bash. */
function loiCuPhap(than: string): string {
  const thu = mkdtempSync(join(tmpdir(), 'ci-parse-'));
  const tep = join(thu, 'khoi.sh');
  try {
    writeFileSync(tep, than, 'utf8');
    execFileSync('bash', ['-n', tep], { stdio: 'pipe' });
    return '';
  } catch (e) {
    const err = e as { stderr?: Buffer };
    return (err.stderr?.toString() ?? 'bash -n thất bại, không có stderr')
      .trim()
      .split('\n')[0];
  } finally {
    rmSync(thu, { recursive: true, force: true });
  }
}

describe('phép đọc trước đã — hỏng ở đây thì bài dưới xanh giả', () => {
  it('tách được một số lượng khối script hợp lý', () => {
    // Không gõ cứng con số thật: tệp còn được sửa. Chỉ chặn hai kiểu xanh giả —
    // regex chết (0 khối) và regex nuốt cả tệp (1 khối khổng lồ).
    const ds = cacKhoi();
    expect(ds.length).toBeGreaterThan(20);
    expect(ds.every((k) => k.than.length > 0)).toBe(true);
  });

  it('bash -n THẬT SỰ bắt được lỗi — không phải lúc nào cũng trả rỗng', () => {
    expect(loiCuPhap('X="chua dong nhay\necho xong')).not.toBe('');
    expect(loiCuPhap('echo lanh manh')).toBe('');
  });
});

describe('codemagic.yaml — mọi khối script phải parse được', () => {
  it('không khối nào làm bash -n đỏ', () => {
    const vo = cacKhoi()
      .map((k) => ({ ...k, loi: loiCuPhap(k.than) }))
      .filter((k) => k.loi !== '');

    expect(
      vo.map((k) => `codemagic.yaml:${k.dong} — ${k.loi}`).join('\n'),
    ).toBe('');
  });
});
