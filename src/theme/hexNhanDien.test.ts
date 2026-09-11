/**
 * Không màn nào được viết cứng một màu MANG NHẬN DIỆN.
 *
 * Vì sao chỉ canh nhóm này chứ không canh mọi hex: phần lớn hex trong mã là
 * trắng, xám, đen, hoặc màu minh hoạ một lần — chúng giống nhau ở mọi app nên
 * viết cứng không gây hại. Nhóm nguy hiểm là các giá trị **đổi theo app**: nền
 * nhấn, nền đậm, và bảng màu từng module. Viết cứng một giá trị trong nhóm đó
 * thì app thứ hai dựng ra vẫn mang màu app thứ nhất ở đúng chỗ đó, và không
 * phép đo nào kêu — chính là lỗi đã tìm thấy ở tầng alias theme, chỉ ở tầng
 * cao hơn.
 *
 * Đo 2026-08-31 trước khi có bài kiểm này: 26 lần / 13 tệp. Sau khi dọn: 9 lần
 * / 6 tệp, tất cả nằm trong danh sách miễn dưới đây kèm lý do.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { APP_TOKENS, BRAND_TOKENS } from './tokens';

const GOC = join(__dirname, '..', '..');

/** Giá trị đổi theo app — viết cứng cái nào trong đây là app thứ hai sai màu. */
const MANG_NHAN_DIEN = new Set<string>(
  [
    APP_TOKENS.accent,
    APP_TOKENS.accentDeep,
    APP_TOKENS.accentLight,
    ...Object.values(BRAND_TOKENS).flatMap((b) => [b.primary, b.primaryDeep, b.primaryLight, ...b.gradient]),
  ].map((h) => h.toUpperCase()),
);

/**
 * Miễn CÓ LÝ DO, không phải miễn cho qua. Mỗi tệp ở đây giữ một bảng màu
 * NGỮ NGHĨA — hạng A/B/C/D, nhóm ngành nghề, trạng thái hợp đồng — nơi một mã
 * màu tình cờ trùng giá trị token nhưng không mang nghĩa nhãn hiệu. Đổi chúng
 * theo app là đổi NGHĨA, không phải đổi hình thức.
 */
const MIEN: Record<string, string> = {
  'src/modules/work/screens/contractState.ts': 'bảng màu TRẠNG THÁI hợp đồng',
  'src/modules/work/screens/CapabilitiesScreen.tsx': 'thang hạng A/B/C/D',
  'src/modules/work/screens/MatchScreen.tsx': 'thang hạng A/B/C/D',
  'src/modules/work/data/categories.ts': 'màu nhận biết từng nhóm ngành nghề',
  'src/modules/work/data/mockData.ts': 'màu nhận biết từng nhóm ngành nghề',
  'src/navigation/index.tsx': 'hex chỉ nằm trong chú thích nêu giá trị của từng app',
};

const BO_QUA = ['src/theme', 'icons.generated.ts'];

function quetTep(thuMuc: string, ra: string[] = []): string[] {
  for (const ten of readdirSync(thuMuc)) {
    const p = join(thuMuc, ten);
    if (statSync(p).isDirectory()) quetTep(p, ra);
    else if (/\.tsx?$/.test(ten) && !ten.includes('.test.')) ra.push(p);
  }
  return ra;
}

/**
 * Bỏ chú thích: chú thích được phép nêu giá trị cũ để giải thích lịch sử.
 *
 * ── Vì sao theo dõi TRẠNG THÁI khối, không đoán bằng ký tự đầu dòng ─────────
 * Bản đầu lọc theo tiền tố: bỏ dòng bắt đầu bằng `//`, `*`, hoặc `/*`. Nó đúng
 * với chú thích viết theo lối JSDoc, nơi mọi dòng tiếp nối đều mở đầu bằng `*`.
 * Nó TRƯỢT với lối viết khối thụt lề không có `*` — dòng giữa một khối
 * `/* … *`+`/` trông y hệt một dòng mã, nên hex trong đó bị đếm thành gõ cứng.
 *
 * Đó là ca đã xảy ra: hai chú thích giải thích đúng cái lỗi "nửa trên xanh lá,
 * nửa dưới xanh dương" bị chính bài này bắt, vì chúng NÊU giá trị màu để nói
 * vì sao không được dùng nó. Bài kiểm bắt đúng thứ nó tự tuyên là được phép.
 *
 * Cái sai không nằm ở hai tệp kia — nằm ở đây: phép đo đọc HÌNH DẠNG dòng chứ
 * không đọc thứ nó cần biết là dòng ấy có phải mã chạy không.
 *
 * ── Vì sao `//` vẫn chỉ xử ở mức CẢ DÒNG ───────────────────────────────────
 * Cắt từ `//` tới hết dòng nghe gọn hơn, nhưng nó cắt nhầm bên trong chuỗi:
 * `'https://…'` có `//`, nên một hex đứng SAU một địa chỉ mạng trên cùng dòng
 * sẽ biến mất khỏi phép quét. Đó là lọt lưới — chiều hỏng đắt hơn. Chú thích
 * đuôi dòng thì không cần cắt: phần mã trên cùng dòng vẫn còn nguyên hex.
 */
function hexTrongMaChay(noiDung: string): string[] {
  const maChay: string[] = [];
  let trongKhoi = false;

  for (const dong of noiDung.split('\n')) {
    let conLai = dong;
    let sach = '';

    while (conLai.length) {
      if (trongKhoi) {
        const dong_ = conLai.indexOf('*/');
        if (dong_ === -1) break;
        conLai = conLai.slice(dong_ + 2);
        trongKhoi = false;
        continue;
      }
      const mo = conLai.indexOf('/*');
      if (mo === -1) {
        sach += conLai;
        break;
      }
      sach += conLai.slice(0, mo);
      conLai = conLai.slice(mo + 2);
      trongKhoi = true;
    }

    if (!sach.trim().startsWith('//')) maChay.push(sach);
  }

  return maChay
    .flatMap((d) => d.match(/#[0-9A-Fa-f]{6}\b/g) ?? [])
    .map((h) => h.toUpperCase());
}

it('phép quét tự kiểm — hỏng phép quét thì bài dưới xanh giả', () => {
  const tep = quetTep(join(GOC, 'src'));
  expect(tep.length).toBeGreaterThan(200);
  // và nó phải THẤY được hex trong mã chạy, nếu không thì nó chỉ đang trả rỗng.
  expect(hexTrongMaChay("const a = '#3B6EA8';")).toEqual(['#3B6EA8']);
  expect(hexTrongMaChay("// nền cũ là #3B6EA8")).toEqual([]);

  // Chú thích KHỐI nhiều dòng, lối thụt lề không có `*` ở đầu dòng tiếp nối.
  // Bản trước của phép quét trượt đúng cực này — nó lọc theo ký tự đầu dòng,
  // nên dòng giữa khối trông y hệt mã chạy. Thiếu ca này thì bài tự kiểm xanh
  // ở CẢ HAI cực, và cái nó tự nhận là canh thì nó không canh.
  const khoi = ['/*', '  nền cũ ở lớp token là', '  XANH DƯƠNG #3B6EA8 nên bỏ.', '*/'].join('\n');
  expect(hexTrongMaChay(khoi)).toEqual([]);

  // Mở và đóng khối trên CÙNG một dòng thì phần mã hai bên vẫn phải thấy được.
  expect(hexTrongMaChay("const a = /* cũ #FFFFFF */ '#3B6EA8';")).toEqual(['#3B6EA8']);

  // Chú thích ĐUÔI dòng cố ý KHÔNG cắt: cắt từ `//` sẽ cắt nhầm trong `https://`.
  expect(hexTrongMaChay("const a = '#3B6EA8'; // nền")).toEqual(['#3B6EA8']);
});

it('màu mang nhận diện không được viết cứng ngoài src/theme/', () => {
  const viPham: string[] = [];
  for (const p of quetTep(join(GOC, 'src'))) {
    const duong = relative(GOC, p).split('\\').join('/');
    if (BO_QUA.some((b) => duong.includes(b)) || MIEN[duong]) continue;
    const trung = hexTrongMaChay(readFileSync(p, 'utf8')).filter((h) => MANG_NHAN_DIEN.has(h));
    if (trung.length) viPham.push(`${duong}: ${[...new Set(trung)].join(', ')}`);
  }
  expect(viPham).toEqual([]);
});

it('danh sách miễn không phình ra âm thầm', () => {
  // Miễn thêm một tệp là một quyết định, không phải một dòng thêm vào cho xanh.
  expect(Object.keys(MIEN)).toHaveLength(6);
});
