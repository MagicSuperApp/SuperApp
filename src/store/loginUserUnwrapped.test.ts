/**
 * Mọi nơi `dispatch(loginUser(…))` phải `.unwrap()`.
 *
 * ── Vì sao cần một cổng đọc MÃ NGUỒN cho đúng việc này ──────────────────────────
 * `createAsyncThunk` bắt lỗi rồi *giải quyết* promise bằng một action `rejected`. Nên
 * `await dispatch(loginUser(u))` chạy tiếp bình thường kể cả khi lượt đăng nhập trượt.
 * Không một phép kiểm kiểu nào bắt được: cả hai cách viết đều hợp kiểu, cùng trả
 * `Promise`, và `await` cả hai đều xong êm. Không một phép kiểm hành vi nào ở tầng màn
 * bắt được nếu chính bài kiểm đó không dựng ca "mở cơ sở dữ liệu hỏng".
 *
 * Đo được 14/09/2026: SÁU nơi gọi, KHÔNG nơi nào `.unwrap()`, và câu lỗi thì được ghi
 * vào `state.user.error` — một ô mà `grep` ra **0 màn đọc**. Hai đường im lặng chồng
 * lên nhau. Hậu quả ở màn khôi phục danh tính: người vừa khôi phục đọc chữ "thành
 * công", vào một app rỗng, rồi bước dễ nhất trước mặt họ là lập một danh tính MỚI — tức
 * tự tay bỏ đúng cái vừa khôi phục được.
 *
 * ── Cổng này khác cổng "đã nghĩ tới chưa" ───────────────────────────────────────
 * Nó không hỏi tệp có NHẮC tới `.unwrap()` hay không; nó đọc đúng biểu thức
 * `dispatch(loginUser(` rồi đòi `.unwrap()` xuất hiện trong chính lời gọi đó. Sai thì
 * sai lộ ra ngay, không trượt sang chốt bên cạnh.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(p);
  }
  return out;
}

/**
 * Xoá chú thích, GIỮ NGUYÊN số dòng (thay bằng khoảng trắng, không xoá dòng).
 *
 * Cần bước này vì chính khối chú thích giải thích lỗi lại VIẾT RA đoạn mã sai làm ví dụ
 * — và cổng đọc nó thành một nơi gọi thiếu `.unwrap()`. Lần chạy đầu đỏ đúng hai dòng
 * văn xuôi trong `userSlice.ts`. Đường sai là miễn trừ hẳn tệp đó (mở một lỗ ở đúng tệp
 * định nghĩa `loginUser`); đường đúng là thôi coi văn xuôi là mã.
 */
function boChuThich(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * Cắt biểu thức bao quanh một lời gọi `loginUser`, tính ngoặc để lấy trọn cả phần
 * `.unwrap()` đứng sau — lời gọi trải qua nhiều dòng nên đọc theo dòng là trượt.
 */
function bieuThucQuanh(text: string, viTri: number): string {
  let i = viTri;
  let sau = 0;
  for (; i < text.length; i++) {
    if (text[i] === '(') sau++;
    else if (text[i] === ')') {
      sau--;
      if (sau === 0) break;
    }
  }
  // Lấy thêm 20 ký tự sau dấu đóng ngoặc ngoài cùng: `.unwrap()` nếu có thì nằm ở đó.
  return text.slice(viTri, Math.min(text.length, i + 21));
}

function noiGoiThieuUnwrap(): string[] {
  const thieu: string[] = [];
  for (const file of walk(SRC)) {
    const text = boChuThich(fs.readFileSync(file, 'utf8'));
    if (!text.includes('loginUser')) continue;

    const re = /dispatch\(\s*loginUser\(/g;
    for (const m of text.matchAll(re)) {
      const bieuThuc = bieuThucQuanh(text, m.index!);
      if (bieuThuc.includes('.unwrap()')) continue;
      const dong = text.slice(0, m.index!).split('\n').length;
      thieu.push(`${path.relative(SRC, file)}:${dong}`);
    }
  }
  return thieu;
}

describe('loginUser — lần đăng nhập trượt phải tới được nơi gọi', () => {
  it('mọi `dispatch(loginUser(…))` đều có `.unwrap()`', () => {
    const thieu = noiGoiThieuUnwrap();
    expect(
      thieu.length === 0
        ? ''
        : `Các nơi sau gọi \`loginUser\` mà KHÔNG \`.unwrap()\`:\n` +
          thieu.map(t => `  ${t}`).join('\n') +
          `\n\n\`createAsyncThunk\` KHÔNG ném khi thunk hỏng — nó giải quyết promise bằng ` +
          `một action \`rejected\`. Nên \`await dispatch(loginUser(u))\` đi tiếp êm, màn báo ` +
          `thành công, rồi \`reset\` vào \`Main\` với \`currentUser: null\`. Câu lỗi ghi vào ` +
          `\`state.user.error\` thì không màn nào đọc.\nBịt bằng: ` +
          `\`await (dispatch(loginUser(u) as any) as any).unwrap()\` trong một \`try/catch\` ` +
          `có câu cho người dùng, và KHÔNG điều hướng khi trượt.`,
    ).toBe('');
  });

  it('phép tìm thật sự bắt được — hai cách viết phải cho hai kết quả khác nhau', () => {
    // Không có ca này thì bài trên xanh cả khi mẫu tìm không khớp gì, hoặc khi hàm cắt
    // biểu thức trả về chuỗi luôn chứa `.unwrap()`. Xanh ở cả hai cực nghĩa là không kiểm.
    const coUnwrap = 'await (dispatch(loginUser(user as any) as any) as any).unwrap();';
    const khongCo = 'await dispatch(loginUser(user as any) as any);';

    const re = /dispatch\(\s*loginUser\(/;
    expect(re.test(coUnwrap)).toBe(true);
    expect(re.test(khongCo)).toBe(true);

    expect(bieuThucQuanh(coUnwrap, coUnwrap.search(re))).toContain('.unwrap()');
    expect(bieuThucQuanh(khongCo, khongCo.search(re))).not.toContain('.unwrap()');
  });

  it('văn xuôi trong chú thích KHÔNG bị đọc thành mã, và số dòng không xê dịch', () => {
    // Ca đối xứng cho `boChuThich`. Nếu nó xoá cả dòng thay vì thay bằng khoảng trắng
    // thì mọi `tệp:dòng` cổng in ra đều lệch — hỏng im lặng, dạng tệ nhất, vì con trỏ
    // vẫn trỏ vào một dòng CÓ THẬT.
    const src = [
      '// ví dụ SAI: await dispatch(loginUser(u));',
      'const x = 1;',
      'await (dispatch(loginUser(u) as any) as any).unwrap();',
    ].join('\n');
    const sach = boChuThich(src);
    expect(sach.split('\n').length).toBe(3);
    expect(sach).not.toContain('dispatch(loginUser(u));');
    expect(sach).toContain('.unwrap()');
  });

  it('cổng đọc được lời gọi trải NHIỀU dòng, không chỉ lời gọi một dòng', () => {
    // Ca này canh chính hàm `bieuThucQuanh`: đọc theo dòng thì một lời gọi xuống dòng
    // trước `.unwrap()` sẽ bị báo thiếu oan, và người sửa sẽ nới mẫu tìm cho hết đỏ.
    const nhieuDong = [
      'await (dispatch(loginUser({',
      '  ...user,',
      '  name: ten,',
      '} as any) as any) as any).unwrap();',
    ].join('\n');
    const re = /dispatch\(\s*loginUser\(/;
    expect(bieuThucQuanh(nhieuDong, nhieuDong.search(re))).toContain('.unwrap()');
  });
});
