/**
 * Cổng phí MAGIC không được chặn người mà chính nó không đo được.
 *
 * `balanceKnown = !!wallet` đo SAI ĐẠI LƯỢNG: nó đo "đã gọi được máy chủ", còn
 * câu cần hỏi là "có con số MAGIC không". Từ 17/09/2026 hai câu đó tách nhau —
 * máy chủ trả `magic.available = null` trong một lượt gọi thành công. Cộng thêm
 * `?? 0` ở dòng ngay dưới, cổng đọc "chưa biết" thành "không đủ tiền" và chặn
 * đúng những người mà chú thích ngay trên nó hứa là không chặn.
 *
 * Luật chặn đã dời sang `shouldBlockMagicSpend` (`services/phoenixKey-api.ts`) và
 * được kiểm bằng HÀNH VI ở `services/magicBalanceUnknown.test.ts`. Bài này canh
 * phần còn lại — phần nằm trong màn React nên không gọi thẳng được: số đưa vào
 * cổng có còn phân biệt được ba trạng thái không.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'ActivityScreen.tsx'), 'utf8');

describe('số dư đưa vào cổng phải giữ được "chưa biết"', () => {
  it('KHÔNG đệm `?? 0` khi đọc `magicBalance` ra khỏi ví', () => {
    // Đột biến đặt lại `wallet?.magicBalance ?? 0` làm dòng này đỏ.
    expect(SRC).toMatch(/wallet == null \|\| wallet\.magicBalance == null \? null : wallet\.magicBalance/);
    expect(SRC).not.toMatch(/magicBalance\s*=\s*wallet\?\.magicBalance\s*\?\?/);
  });

  it('`balanceKnown` đo CON SỐ, không đo sự tồn tại của ví', () => {
    expect(SRC).toMatch(/const balanceKnown = magicBalance != null;/);
    expect(SRC).not.toMatch(/const balanceKnown = !!wallet;/);
  });
});

describe('cổng chặn dùng luật chung, không viết lại tại chỗ', () => {
  it('gọi `shouldBlockMagicSpend`, không tự so sánh bằng `<`', () => {
    expect(SRC).toMatch(/shouldBlockMagicSpend\(magicBalance, selectedActivity\.credits\)/);
    // Phép so sánh viết tay là hình dạng cũ: nó im lặng ép `null` thành `0` rồi
    // trả về `true`. Có nó ở đây nghĩa là luật đã bị chép ra chỗ thứ hai.
    expect(SRC).not.toMatch(/magicBalance < selectedActivity\.credits/);
  });

  it('có nhập đúng hàm đó, không phải một bản chép cùng tên', () => {
    expect(SRC).toMatch(/import \{ shouldBlockMagicSpend \} from '\.\.\/\.\.\/\.\.\/services\/phoenixKey-api';/);
  });
});

describe('ô số MAGIC trên đầu màn', () => {
  it('chưa biết thì hiện "—", biết thì hiện số — kể cả khi số đó là 0', () => {
    // Cùng một `balanceKnown` đã sửa ở trên, nên ô này nay tách được `0` (hiện
    // "0") khỏi "chưa biết" (hiện "—"). Trước đây cả hai đều hiện "0".
    expect(SRC).toMatch(/\{balanceKnown \? magicBalance : '—'\}/);
  });
});
