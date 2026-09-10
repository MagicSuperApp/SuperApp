/**
 * Cổng nguồn cho THẺ VƯỜN ở danh sách vườn.
 *
 * Thẻ vườn từng mở đầu bằng một ô biểu tượng cái cây — GIỐNG HỆT NHAU trên mọi
 * thẻ. Người có sáu vườn phải đọc TÊN mới biết đang nhìn vườn nào, vì phần duy
 * nhất khác nhau giữa các thẻ là chữ. Một biểu tượng lặp lại sáu lần không mang
 * tin gì; nó chỉ chiếm 46 điểm bề ngang ở chỗ mắt chạm đầu tiên.
 *
 * Nay ô đó vẽ CHÍNH mảnh đất của vườn đó (`FarmShape`, nhìn từ trên xuống, dựng
 * từ `coordinates` thật). Mỗi vườn một hình, nhận ra được trước cả khi đọc chữ.
 *
 * Vườn chưa đủ ba điểm ranh giới thì `FarmShape` trả `null` — không có mảnh đất
 * nào để vẽ. Lúc ấy rơi về biểu tượng cũ, và CHÍNH sự khác nhau đó thành tín
 * hiệu: thẻ nào còn hiện biểu tượng là thẻ chưa vẽ ranh giới.
 *
 * ── Bài này đo GÌ ───────────────────────────────────────────────────────────
 * Đo MÃ NGUỒN, cùng khuôn với các bài `.gate.test.ts` khác trong thư mục. Nó
 * bắt ca "ai đó gỡ hình vườn đi", KHÔNG bắt ca "hình vẽ ra sai". Phần sau đã có
 * `utils/farmShapeGeo.test.ts` đo bằng toán.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'FarmListScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
const MA_CHAY = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('thẻ vườn hiện CHÍNH mảnh đất của vườn đó', () => {
  it('thẻ dựng `FarmShape` nhìn từ trên xuống', () => {
    expect(MA_CHAY).toContain('<FarmShape');
    expect(MA_CHAY).toContain('mode="flat"');
  });

  it('vườn chưa có ranh giới vẫn còn đường lui, không để ô trống', () => {
    // `FarmShape` trả `null` dưới ba điểm. Thiếu nhánh lui thì ô rỗng hoác, và
    // một ô rỗng đọc ra "hỏng" chứ không đọc ra "chưa vẽ ranh giới".
    expect(MA_CHAY).toContain('coRanh(item)');
    expect(MA_CHAY).toContain('coRanh = (farm: any): boolean');
    expect(MA_CHAY).toContain('>= 3');
  });

  it('ô chứa hình phải cắt theo góc bo', () => {
    // Hình vườn là một lớp SVG trải kín ô. Thiếu `overflow: 'hidden'` thì nó
    // tràn qua góc bo và thẻ mất mép — hỏng nhẹ, thấy được, nhưng không ai gọi
    // tên ra được nên nó sống lâu.
    const i = MA_CHAY.indexOf('cardIcon: {');
    expect(i).toBeGreaterThan(-1);
    expect(MA_CHAY.slice(i, i + 320)).toContain("overflow: 'hidden'");
  });
});
