/**
 * Ô NHẮC KHÔI PHỤC ở màn Tài khoản — không được mời một lối thoát chưa chạy.
 *
 * ── Chỗ hỏng bài này canh ───────────────────────────────────────────────────
 * Câu cũ trong ô này là *"Chọn một người thân tin cậy là xong."*, và nút CHÍNH
 * đưa thẳng sang màn `Guardian`. Nhưng đường khôi phục bằng người bảo hộ chưa
 * chạy tới cuối — `services/guardianService.ts` chỉ có ghi danh và gỡ tên, không
 * có một hàm khôi phục nào (vế 1 của `guardianKhongHuaKhoiPhuc.test.ts` đo đúng
 * điều đó, và nó vẫn là điều kiện để bài này có nghĩa).
 *
 * Hai chữ "là xong" đắt hơn cả chỗ sai: người dùng ghi danh người bảo hộ, tin là
 * đã an toàn, rồi KHÔNG bao giờ lưu 24 từ. Mất máy là mất cả danh tính lẫn ví, và
 * họ chỉ biết mình chọn sai vào đúng ngày không sửa được nữa.
 *
 * ── Vì sao đọc mã nguồn chứ không dựng màn ──────────────────────────────────
 * `AccountScreen.tsx` kéo theo redux store, coach-mark, cả chục dịch vụ; dựng nó
 * trong node đòi một bộ giả lớn hơn chính thứ đang đo, và bộ giả đó tự nó là một
 * nguồn sai. Cùng lối với `guardianKhongHuaKhoiPhuc.test.ts` — bài đang canh đúng
 * màn này bằng cách đọc mã. Cái được ghim ở đây là CÂU CHỮ và ĐÍCH ĐIỀU HƯỚNG,
 * hai thứ đọc thẳng ra được từ mã và trôi được mà không ai thấy.
 */

import fs from 'fs';
import path from 'path';

import { ACCOUNT } from '../i18n/phrases/account';

const SRC = path.join(__dirname, '..');
const readSrc = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

/** Khối JSX của ô nhắc — từ `{showGuardianNudge && (` tới dấu đóng của nó. */
function nudgeBlock(source: string): string {
  const start = source.indexOf('{showGuardianNudge && (');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('<MenuItem', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Gộp khoảng trắng để so được câu bị JSX bẻ dòng + thụt lề. */
const flat = (s: string) => s.replace(/\s+/g, ' ');

const BODY =
  'Nếu mất máy này, chỉ cụm 24 từ lấy lại được danh tính và ví của bạn — hôm nay đó là đường khôi phục duy nhất chạy được. Ghi danh người bảo hộ vẫn nên làm, nhưng đường khôi phục bằng người bảo hộ chưa chạy tới cuối nên nó chưa thay được cụm 24 từ.';

describe('ô nhắc khôi phục nói đúng thứ đang chạy được', () => {
  const block = () => nudgeBlock(readSrc('screens/AccountScreen.tsx'));

  it('câu cũ "Chọn một người thân tin cậy là xong" đã biến mất', () => {
    // Soi TRONG khối, không soi cả tệp: chữ "là xong" xuất hiện hợp lệ ở chỗ khác
    // trong `AccountScreen.tsx`, và một phép cấm trên cả tệp sẽ đỏ vì chuyện không
    // liên quan rồi bị ai đó nới ra cho xanh.
    const b = block();
    expect(b).not.toMatch(/là xong/);
    expect(b).not.toMatch(/Chưa có ai khôi phục hộ bạn/);
    expect(b).not.toMatch(/Chọn người khôi phục/);
  });

  it('nói 24 từ là đường khôi phục DUY NHẤT chạy được — ghim trọn câu', () => {
    // `toContain` một mẩu ngắn ("24 từ") qua được cả bản viết lại làm mất chữ
    // "duy nhất" lẫn bản bỏ mất câu rào về người bảo hộ. Ghim trọn câu.
    expect(flat(block())).toContain(BODY);
  });

  it('nút CHÍNH dẫn tới màn 24 từ, KHÔNG dẫn sang người bảo hộ', () => {
    const b = block();
    // Nút chính = nút mang `styles.nudgePrimary`. Đích của nó phải là `SeedExport`.
    const primary = b.slice(b.indexOf('testID="account-nudge-seed"'));
    expect(flat(primary.slice(0, 400))).toMatch(
      /testID="account-nudge-seed".*style=\{styles\.nudgePrimary\}.*navigation\.navigate\('SeedExport'\)/,
    );
  });

  it('người bảo hộ vẫn có lối vào, nhưng là lối PHỤ', () => {
    // Gỡ hẳn người bảo hộ khỏi ô này cũng sai: ghi danh trước vẫn có ích, và
    // `GuardianScreen` là nơi duy nhất nói được điều đó.
    const b = block();
    const guardian = b.slice(b.indexOf('testID="account-nudge-guardian"'));
    expect(flat(guardian.slice(0, 400))).toMatch(
      /testID="account-nudge-guardian".*style=\{styles\.nudgeGhost\}.*navigation\.navigate\('Guardian'\)/,
    );
    // Và nó KHÔNG được mang kiểu của nút chính.
    expect(flat(guardian.slice(0, 400))).not.toMatch(/styles\.nudgePrimary/);
  });

  it('"Để sau" vẫn còn — ô này nhắc, không ép', () => {
    expect(block()).toContain('testID="account-nudge-later"');
    expect(block()).toContain('snoozeRisk()');
  });

  it('câu rào có đủ bốn thứ tiếng', () => {
    // Một câu rào chỉ có bản tiếng Việt thì với người dùng nước ngoài nó không tồn
    // tại — đúng lớp lỗi mà `guardianKhongHuaKhoiPhuc.test.ts` đã canh ở chỗ khác.
    for (const key of [
      'Chưa có đường lấy lại danh tính',
      BODY,
      'Xem và cất giữ 24 từ',
      'Ghi danh người bảo hộ',
    ]) {
      const entry = ACCOUNT[key];
      // Khoá của `PhraseMap` CHÍNH LÀ bản tiếng Việt, nên mục chỉ mang ba ngôn ngữ
      // còn lại. Thiếu một là người dùng ngôn ngữ đó đọc câu rào bằng tiếng Việt.
      expect(`${key.slice(0, 40)}… → ${entry ? 'có' : 'THIẾU'}`).toMatch(/→ có$/);
      if (!entry) continue;
      expect(Object.keys(entry).sort()).toEqual(['en', 'ja', 'zh']);
      for (const lang of ['en', 'ja', 'zh'] as const) {
        expect(String(entry[lang]).length).toBeGreaterThan(0);
      }
    }
  });
});
