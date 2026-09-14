/**
 * Ghim MỘT điều: `addr_test` KHÔNG được suy thành một mạng thử cụ thể.
 *
 * Preprod và Preview dùng CÙNG byte mạng trong địa chỉ, nên tiền tố `addr_test` nói
 * được "mạng thử" và không nói được **thử nào**. Bản trước trả `'preprod'` cho nó, lấy
 * lý do "preprod là mạng thử chuẩn của dự án" — một suy luận từ KẾ HOẠCH, không phải
 * một phép đọc từ dữ liệu. Đó là phép đo trả về giá trị hợp lệ đúng lúc nó không đo
 * được gì: nó không nói "preprod", nó nói "tôi không biết" bằng giọng của "preprod".
 *
 * Chỗ nó đắt: nhãn mạng và ĐƯỜNG TỚI EXPLORER dựng từ giá trị này. Một địa chỉ Preview
 * tra trên `preprod.cardanoscan.io` không thấy gì, và người dùng đọc đó là "ví trống"
 * chứ không đọc là "tra sai mạng". Thêm nữa: độ dài epoch Preview và Preprod chênh NĂM
 * LẦN (1 ngày / 5 ngày), nên cùng một con số thì hạn dùng khác hẳn.
 *
 * Vì sao là bài đọc-nguồn: `netFromAddress` là hàm riêng tư trong `AccountScreen.tsx`,
 * và dựng cả màn đó trong jest thì kéo theo bản đồ, ví, sinh trắc. Bài này đo đúng cái
 * cần đo — dòng nào trả về gì cho tiền tố nào — chứ không đo được nhiều hơn thế, và
 * nói rõ ranh giới đó ở đây.
 */
import fs from 'fs';
import path from 'path';

const raw = fs.readFileSync(path.join(__dirname, 'AccountScreen.tsx'), 'utf8');
// Bỏ chú thích: màn cố ý ghi lại hành vi CŨ để người sau biết vì sao nó bị đổi.
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

// Chỉ lấy thân hàm `netFromAddress` — các hàm khác trong tệp cũng nhắc tên mạng.
const body = (() => {
  const i = src.indexOf('function netFromAddress');
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n}', i));
})();

describe('netFromAddress — ba tiền tố, ba câu trả lời KHÁC nhau', () => {
  it('`addr_test` KHÔNG còn trả về một mạng thử cụ thể', () => {
    // Bất cứ nhánh nào gán `addr_test` cho `'preprod'` hay `'preview'` đều là đoán.
    expect(body).not.toMatch(/addr_test[\s\S]*?return 'preprod'/);
    expect(body).not.toMatch(/addr_test[\s\S]*?return 'preview'/);
  });

  it('`addr_test` trả `null` — tức "chưa biết", để nhãn nói thật và có việc để làm', () => {
    expect(body).toMatch(/addr_test[\s\S]*?stake_test[\s\S]*?return null/);
  });

  it('`addr1` VẪN suy được mainnet — byte mạng chỉ có hai giá trị, một trong hai là mainnet', () => {
    // Rào ngược: đừng siết thành "không suy gì cả". Mainnet suy được thật.
    expect(body).toMatch(/addr1[\s\S]*?return 'mainnet'/);
  });

  it('nhãn cho `null` nói ra được việc phải làm, không nói "đang dò" mãi', () => {
    expect(src).toMatch(/Chưa kiểm được — kéo xuống để thử lại/);
  });
});
