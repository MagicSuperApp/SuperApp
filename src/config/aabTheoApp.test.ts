/**
 * `android-aab.yml` — luồng ra bản phát hành — phải dựng ĐƯỢC app thứ hai, và
 * danh sách app trong hộp chọn của nó không được lệch khỏi `instances/`.
 *
 * Vì sao cần bài kiểm riêng: `workflow_dispatch.inputs.<x>.options` KHÔNG nhận
 * giá trị động — GitHub đọc nó lúc dựng giao diện, trước khi có runner nào
 * chạy. Nên đó là chỗ DUY NHẤT còn phải gõ tay tên app; mọi chỗ khác đều đọc
 * `instances/`. Chỗ gõ tay ấy hỏng CÂM: thêm `instances/<mã>/` mà quên sửa nó
 * thì app mới không dựng được bản phát hành, và không có gì đỏ — chỉ là một mục
 * thiếu trong một hộp chọn không ai nhìn.
 *
 * Cùng lý do với biểu thức suy `TIEN_TO`: biểu thức GitHub không có hàm đổi
 * hoa-thường, nên tên app xuất hiện tay lần thứ hai ở đó.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const GOC = join(__dirname, '..', '..');
const WF = readFileSync(join(GOC, '.github/workflows/android-aab.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Đọc mã app từ chính thư mục mà gradle đọc. */
function maApp(): string[] {
  const goc = join(GOC, 'instances');
  return readdirSync(goc)
    .filter((t) => statSync(join(goc, t)).isDirectory())
    .filter((t) => {
      try {
        return !!JSON.parse(readFileSync(join(goc, t, 'instance.json'), 'utf8')).id;
      } catch {
        return false;
      }
    })
    .sort();
}

it('phép đọc tự kiểm — hỏng thì mọi bài dưới xanh giả', () => {
  expect(maApp().length).toBeGreaterThanOrEqual(2);
  expect(maApp()).toContain('aladin');
  expect(WF.length).toBeGreaterThan(1000);
});

it('hộp chọn app khai ĐÚNG các app có trong instances/', () => {
  const khoi = WF.match(/options:\n((?:\s+- \S+\n)+)/);
  expect(khoi).not.toBeNull();
  const khai = [...khoi![1].matchAll(/- (\S+)/g)].map((m) => m[1]).sort();
  expect(khai).toEqual(maApp());
});

it('biểu thức suy tiền tố khoá phủ MỌI app, không sót app nào', () => {
  const dong = WF.match(/^\s*TIEN_TO:.*$/m);
  expect(dong).not.toBeNull();
  // Mọi app KHÁC app rơi-về phải được gọi tên trong biểu thức, nếu không nó
  // lặng lẽ nhận tiền tố của app rơi-về và ký nhầm khoá.
  const roiVe = WF.match(/^\s*FLAVOR: \$\{\{ inputs\.flavor \|\| '(\w+)' \}\}$/m);
  expect(roiVe).not.toBeNull();
  for (const ma of maApp()) {
    if (ma === roiVe![1]) continue;
    expect(dong![0]).toContain(`'${ma}'`);
    expect(dong![0]).toContain(ma.toUpperCase());
  }
});

it('không còn chỗ nào gõ cứng khoá hay task của MỘT app trong mã chạy', () => {
  const maChay = WF.split('\n').filter((d) => !d.trim().startsWith('#'));
  const goCung = maChay.filter((d) => /ALADIN_UPLOAD|CHECKFARM_UPLOAD|bundleAladin|bundleCheckfarm|aladinRelease/.test(d));
  expect(goCung).toEqual([]);
});

it('danh tính JS đi theo app đang dựng, không rơi về app đầu tiên', () => {
  // `rn-env` mặc định `app-instance: aladin`. Không truyền thì bản dựng có vỏ
  // native đúng app này mà tên, màu, pháp nhân là của app kia — không bước nào đỏ.
  expect(WF).toMatch(/app-instance: \$\{\{ env\.FLAVOR \}\}/);
});

it('đường tìm tệp .aab đi theo app, không gõ cứng một thư mục', () => {
  expect(WF).toMatch(/bundle\/\$\{FLAVOR\}Release/);
});
