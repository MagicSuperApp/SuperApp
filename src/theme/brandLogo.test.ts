/**
 * Không app nào được dựng ra mang logo của app khác.
 *
 * Ca hỏng: bốn màn từng gõ cứng `require('assets/images/logo.png')`, nên bản
 * CheckFarm mang logo Aladin ở màn đăng nhập, màn chọn ngôn ngữ, màn giới thiệu
 * và thanh tiêu đề. Nó không đọc ra như "thiếu cấu hình" — nó đọc ra như dựng
 * nhầm app, và nó lọt mọi cổng vì bốn `require` ấy nạp một tệp CÓ THẬT.
 */
import fs from 'fs';
import path from 'path';

import { INSTANCES, DEFAULT_INSTANCE } from '../config/instance.config';
import { LOGO_THEO_APP, APP_LOGO } from './brandLogo';

const GOC = path.join(__dirname, '..', '..');

/**
 * Bỏ chú thích trước khi quét — quét MÃ thì phải quét mã.
 *
 * Không có bước này, phép cấm bên dưới bắt chính `brandLogo.ts`, vì tệp đó nêu
 * nguyên văn đường dẫn cũ để giải thích lỗi nó sinh ra để chặn. Đó là cùng một
 * cái bẫy đã cắn ở `hexNhanDien.test.ts`: một cổng đọc văn bản nguồn mà không
 * tách chú thích thì nó cấm luôn việc VIẾT VỀ thứ bị cấm.
 *
 * Thay bằng khoảng trắng chứ không xoá, để số dòng không trôi.
 */
const boChuThich = (ma: string): string =>
  ma
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => ' '.repeat(m.length));

/** Quét mọi tệp mã của app (bỏ bài kiểm) — dùng cho phép cấm ở dưới. */
function quetMa(thuMuc: string, ra: string[] = []): string[] {
  for (const ten of fs.readdirSync(thuMuc)) {
    const p = path.join(thuMuc, ten);
    if (fs.statSync(p).isDirectory()) quetMa(p, ra);
    else if (/\.tsx?$/.test(ten) && !ten.includes('.test.')) ra.push(p);
  }
  return ra;
}

describe('logo trong app đi theo app đang dựng', () => {
  it('bảng logo phủ ĐỦ mọi app trong INSTANCES', () => {
    const thieu = Object.keys(INSTANCES).filter((id) => !LOGO_THEO_APP[id]);
    expect(thieu).toEqual([]);
  });

  it('app đang dựng có logo, và nó KHÔNG rơi về app khác', () => {
    expect(APP_LOGO).toBeDefined();
    expect(APP_LOGO).toBe(LOGO_THEO_APP[DEFAULT_INSTANCE.instanceId]);
  });

  it('mỗi app một logo RIÊNG — hai app trỏ cùng một tệp là chưa tách xong', () => {
    // Không có ca này, một bảng khai đủ khoá nhưng cả hai dòng cùng trỏ vào
    // `instances/aladin/…` vẫn xanh ở hai ca trên, và lỗi thì nguyên vẹn.
    const nguon = Object.keys(INSTANCES).map((id) => LOGO_THEO_APP[id]);
    expect(new Set(nguon).size).toBe(nguon.length);
  });

  it('KHÔNG màn nào gõ cứng tệp logo dùng chung nữa', () => {
    // Đây là chốt thật: bảng ở trên đúng mà một màn vẫn `require` thẳng tệp cũ
    // thì màn đó vẫn hiện logo sai, và ba ca trên không thấy gì.
    const pham = quetMa(path.join(GOC, 'src'))
      .filter((p) => /require\([^)]*assets\/images\/logo\.png[^)]*\)/.test(boChuThich(fs.readFileSync(p, 'utf8'))))
      .map((p) => path.relative(GOC, p));
    expect(pham).toEqual([]);
  });

  it('ĐỐI CHỨNG — phép quét đọc được mã và biểu thức cấm còn khớp', () => {
    expect(quetMa(path.join(GOC, 'src')).length).toBeGreaterThan(200);
    const mau = "<Image source={require('../../assets/images/logo.png')} />";
    expect(/require\([^)]*assets\/images\/logo\.png[^)]*\)/.test(boChuThich(mau))).toBe(true);
    // và bộ bỏ chú thích phải THẬT SỰ bỏ — không thì ca cấm ở trên xanh vì phép
    // quét trả rỗng, chứ không vì mã đã sạch.
    expect(boChuThich("// require('../../assets/images/logo.png')").trim()).toBe('');
    expect(boChuThich("/*\n require('../../assets/images/logo.png')\n*/").trim()).toBe('');
  });
});
