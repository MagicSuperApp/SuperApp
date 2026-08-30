/**
 * TÀI LIỆU TRỎ VÀO CHỖ CÓ THẬT.
 *
 * ⛔ Vì sao có bài này — đo được 2026-08-30, trong chính `README.md`:
 *
 *     "Thêm instance mới: tạo `src/config/instances/myapp.config.ts`"
 *
 * Đường đó **không tồn tại** và chưa từng tồn tại theo hình dạng ấy. Người mới
 * đọc README, làm theo, không thấy thư mục, rồi đoán. Một liên kết chết trong
 * tài liệu không làm bản dựng đỏ, không làm bài kiểm nào đỏ, và nó sống được
 * hàng tháng — đúng lớp lỗi câm mà kho này đã trả giá nhiều lần.
 *
 * Bài này quét MỌI tệp `.md` ở gốc kho (nơi người ngoài đọc trước tiên) cùng
 * `instances/`, và đòi mỗi liên kết tương đối trỏ tới một tệp có thật.
 *
 * ── Nó KHÔNG đo được gì ─────────────────────────────────────────────────────
 *  · Nội dung tài liệu có ĐÚNG không. Liên kết sống không có nghĩa câu văn đúng.
 *  · Liên kết ra ngoài mạng. Không có mạng trong jest, và một đường https chết
 *    thì phải người đọc phát hiện.
 *  · Đường dẫn nhắc trong câu văn thường (không phải liên kết markdown) — ví dụ
 *    một `file.ts` viết trong dấu nháy ngược. Bắt hết những chỗ đó sẽ báo nhầm
 *    quá nhiều để còn ai đọc kết quả.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, normalize } from 'path';

const GOC = join(__dirname, '..', '..');

const TEP_MD = [
  ...readdirSync(GOC)
    .filter((t) => t.endsWith('.md'))
    .map((t) => t),
  ...readdirSync(join(GOC, 'instances'))
    .filter((t) => t.endsWith('.md'))
    .map((t) => join('instances', t)),
];

/** `[chữ](đường)` — bỏ qua http(s), mailto, và neo trong trang (`#mục`). */
const NGOAI = /^(https?:|mailto:|#)/i;

const lienKet = (tep: string): Array<{ nhan: string; duong: string }> => {
  const noiDung = readFileSync(join(GOC, tep), 'utf8');
  const ra: Array<{ nhan: string; duong: string }> = [];
  for (const m of noiDung.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const duong = m[2];
    if (NGOAI.test(duong)) continue;
    ra.push({ nhan: m[1], duong });
  }
  return ra;
};

describe('phép đọc trước đã', () => {
  it('quét được tệp markdown ở gốc kho và instances/', () => {
    expect(TEP_MD).toContain('README.md');
    expect(TEP_MD).toContain(join('instances', 'LUAT-SUPERAPP.md'));
    expect(TEP_MD.length).toBeGreaterThanOrEqual(6);
  });
});

describe.each(TEP_MD)('%s — mọi liên kết tương đối trỏ vào chỗ có thật', (tep) => {
  const ds = lienKet(tep);

  it('có ít nhất một liên kết để bài này không xanh rỗng', () => {
    // Tệp không có liên kết nào thì bỏ qua — nhưng README thì phải có.
    if (tep === 'README.md') expect(ds.length).toBeGreaterThan(0);
  });

  it('không liên kết nào chết', () => {
    const chet = ds
      .map(({ nhan, duong }) => {
        const sach = duong.split('#')[0];
        if (!sach) return null;
        const day = normalize(join(GOC, dirname(tep), sach));
        return existsSync(day) ? null : `[${nhan}](${duong})`;
      })
      .filter(Boolean);
    expect(chet).toEqual([]);
  });
});
