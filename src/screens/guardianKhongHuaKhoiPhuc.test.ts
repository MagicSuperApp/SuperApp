// screens/guardianKhongHuaKhoiPhuc.test.ts
//
// KHÔNG HỨA KHÔI PHỤC BẰNG NGƯỜI BẢO HỘ CHỪNG NÀO CHƯA CÓ ĐƯỜNG KHÔI PHỤC.
//
// ── Trạng thái đo được ────────────────────────────────────────────────────
//   GHI DANH người bảo hộ: CHẠY THẬT. `GuardianScreen.tsx:52` → `guardianService`
//   → `POST /guardians/add`.
//   DÙNG người bảo hộ để KHÔI PHỤC trên máy mới: KHÔNG CÓ ĐƯỜNG NÀO. Cả
//   `guardianService` lẫn `src/features/auth/screens/` không có một hàm hay một
//   màn nào làm việc đó.
//
// Hai nửa đó không đối xứng, và đúng chỗ lệch ấy là chỗ câu chữ đi trước năng
// lực. Bốn màn từng mời người bảo hộ như một lối thoát ngang hàng với cụm 24 từ
// — nặng nhất là câu ở màn cảnh báo "khoá chủ duy nhất": mời một lối thoát không
// tồn tại đúng lúc người dùng sắp mất danh tính. Người chọn lối đó chỉ biết mình
// chọn sai vào ngày đã mất máy, tức lúc không sửa được nữa.
//
// ── Vì sao bài kiểm có HAI VẾ, không phải một danh sách chuỗi cấm ──────────
// Một bài chỉ cấm chữ sẽ sai cả hai chiều: cấm rộng thì giết luôn câu hợp lệ
// ("chưa chạy tới cuối"), cấm hẹp thì lọt biến thể. Nên vế thứ nhất đo NĂNG LỰC
// (có hàm khôi phục chưa) và chỉ khi CHƯA có thì vế thứ hai mới đòi câu chữ phải
// rào. Ngày ai đó nối đường khôi phục thật, vế thứ nhất đỏ trước — và người sửa
// được nhắc quay lại nới câu chữ, thay vì để lời hứa đúng nằm mãi dưới một cái
// rào không còn cần.

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const readSrc = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

/** Dấu cho thấy câu đã nói rõ đường này chưa chạy tới cuối. */
const HEDGE = /chưa chạy|chưa có|không hứa|duy nhất là cụm 24|does not run|not yet|尚未|まだ/i;

describe('người bảo hộ: câu chữ không được đi trước năng lực', () => {
  it('VẾ 1 — hôm nay KHÔNG có đường khôi phục bằng người bảo hộ', () => {
    const service = readSrc('services/guardianService.ts');
    // Chỉ có ghi danh và gỡ tên. Không hàm nào khôi phục.
    expect(service).toMatch(/export .*addGuardian/);
    expect(service).not.toMatch(/recover|startRecovery/i);

    // Và không màn nào ở luồng vào-danh-tính dùng tới người bảo hộ.
    const authDir = path.join(SRC, 'features/auth/screens');
    const screensUsingGuardian = fs
      .readdirSync(authDir)
      .filter(f => /\.tsx?$/.test(f) && !f.includes('.test.'))
      .filter(f => /guardian|người bảo hộ/i.test(fs.readFileSync(path.join(authDir, f), 'utf8')));
    expect(screensUsingGuardian).toEqual([]);
  });

  // VẾ 2 chỉ có nghĩa khi vế 1 còn đúng. Danh sách là BẢN KHAI: mỗi dòng là một
  // chỗ người dùng thật đọc được chữ "người bảo hộ" kèm chuyện khôi phục.
  const userFacing: Array<[string, RegExp]> = [
    ['screens/GuardianScreen.tsx', /Ghi danh người bạn tin tưởng/],
    ['screens/AccountScreen.tsx', /Ghi danh trước — đường khôi phục bằng người bảo hộ/],
    ['screens/SeedExportScreen.tsx', /người bảo hộ chưa chạy được tới cuối/],
  ];

  it.each(userFacing)('VẾ 2 — %s nói rõ đường đó chưa chạy', (file, marker) => {
    const source = readSrc(file);
    expect(source).toMatch(marker);
    const line = source.split('\n').find(l => marker.test(l))!;
    expect(line).toMatch(HEDGE);
  });

  it('VẾ 2 — màn thiết bị KHÔNG mời người bảo hộ làm lối chuyển máy', () => {
    const source = readSrc('screens/MyDevicesScreen.tsx');
    // Hai câu người dùng đọc khi sắp mất khoá chủ: chỉ được mời cụm 24 từ.
    expect(source).toMatch(/Hãy dùng cụm 24 từ để chuyển sang máy mới/);
    expect(source).toMatch(/Muốn đổi sang máy khác, dùng cụm 24 từ\./);
    expect(source).not.toMatch(/24 từ hoặc người bảo hộ/);
  });

  it('VẾ 2 — màn xong đăng ký không còn mời hai lối ngang nhau', () => {
    const source = readSrc('features/auth/screens/SignUpCompleteScreen.tsx');
    expect(source).not.toMatch(/thiết lập Người bảo hộ hoặc lưu Seed Phrase/);
    expect(source).toMatch(/hôm nay đó là\s*\n?\s*cách duy nhất khôi phục được/);
  });

  it('bốn thứ tiếng đi cùng nhau — câu rào không được chỉ có bản tiếng Việt', () => {
    const entries: Array<[string, string, string]> = [
      [
        'account.ts',
        readSrc('i18n/phrases/account.ts'),
        'Ghi danh trước — đường khôi phục bằng người bảo hộ chưa chạy tới cuối',
      ],
      [
        'screens.ts',
        readSrc('i18n/phrases/screens.ts'),
        'Ghi danh người bạn tin tưởng bằng mã định danh của họ.',
      ],
    ];
    for (const [file, source, key] of entries) {
      const at = source.indexOf(key);
      expect(`${file}: ${at}`).not.toBe(`${file}: -1`);
      const block = source.slice(at, at + 700);
      expect(block).toMatch(/en:/);
      expect(block).toMatch(/zh:/);
      expect(block).toMatch(/ja:/);
    }
  });
});
