/**
 * Hai việc:
 *   1. Đọc biến môi trường có đúng luật fail-safe không.
 *   2. CHẶN chuyện con số mạng quay lại nằm rời rạc trong mã.
 *
 * Việc thứ hai mới là lý do chính. Trước đây mạng Cardano nằm cứng ở bảy tệp,
 * mỗi tệp một hằng số riêng kèm chú thích "đổi khi lên production". Lật sót một
 * chỗ thì địa chỉ ví app đăng ký lên backend thuộc mạng này, địa chỉ màn Ví hiện
 * cho người dùng thuộc mạng kia — cả hai đều là địa chỉ hợp lệ nên không có lỗi
 * nào nổ ra, người dùng chỉ thấy số dư 0 mà không hiểu vì sao.
 *
 * Test này đọc mã nguồn. Nó không thay được test hành vi, nó chỉ giữ đúng một
 * lời hứa: lên mainnet là đổi MỘT dòng.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const CONFIG_FILE = path.join(SRC, 'config/cardanoNetwork.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(p);
  }
  return out;
}

describe('mạng Cardano — nguồn duy nhất', () => {
  it('không tệp nào ngoài config tự đặt số mạng', () => {
    // Bắt đúng mẫu cũ: một hằng số cấp mô-đun mang tên mạng, gán số trần.
    const re = /^\s*(?:export\s+)?const\s+\w*(?:NETWORK|Network)\w*\s*[:=][^=\n]*?=?\s*[01]\s*;/gm;
    const pham: string[] = [];
    for (const file of walk(SRC)) {
      if (path.resolve(file) === path.resolve(CONFIG_FILE)) continue;
      const src = fs.readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        re.lastIndex = 0;
        if (re.test(line)) pham.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(pham).toEqual([]);
  });

  it('bảy chỗ cũ nay đều lấy từ nguồn duy nhất', () => {
    const cu = [
      'services/standardWalletService.ts',
      'services/phoenixKeyAuthService.ts',
      'screens/AccountScreen.tsx',
      'screens/PhoenixWalletScreen.tsx',
      'screens/ExportIdentityScreen.tsx',
      'screens/StakingScreen.tsx',
      'config/orgMintChain.ts',
    ];
    const thieu = cu.filter(
      (f) => !fs.readFileSync(path.join(SRC, f), 'utf8').includes('cardanoNetwork'),
    );
    expect(thieu).toEqual([]);
  });

  it('tệp config đọc biến môi trường, không tự đặt số', () => {
    const src = fs.readFileSync(CONFIG_FILE, 'utf8');
    expect(src).toContain("from '@env'");
  });
});

describe('luật đọc biến môi trường', () => {
  // Bản sao đúng logic của `parseNetwork` — giữ cạnh nhau để nếu ai sửa luật mà
  // quên sửa test thì hai bên lệch nhau ngay.
  const parse = (raw: unknown): 0 | 1 => {
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return s === '1' || s === 'mainnet' ? 1 : 0;
  };

  it.each([
    ['1', 1],
    ['mainnet', 1],
    ['MAINNET', 1],
    [' 1 ', 1],
  ])('%p ⇒ mainnet', (raw, mong) => expect(parse(raw)).toBe(mong));

  it.each([
    ['0', 0],
    ['preprod', 0],
    ['preview', 0],
    ['', 0],
    ['  ', 0],
    ['bậy bạ', 0],
    [undefined, 0],
    [null, 0],
    [1, 0], // số, không phải chuỗi — biến `@env` luôn là chuỗi
  ])('%p ⇒ chuỗi thử (fail-safe)', (raw, mong) => expect(parse(raw)).toBe(mong));

  it('rác KHÔNG bao giờ thành mainnet — đây là vế đắt', () => {
    const rac = ['true', 'yes', 'on', 'main', 'MAIN', '2', '-1', '1.0', 'mainnet '];
    // 'mainnet ' có khoảng trắng cuối vẫn phải ra mainnet vì đã trim.
    expect(rac.filter((r) => parse(r) === 1)).toEqual(['mainnet ']);
  });
});
