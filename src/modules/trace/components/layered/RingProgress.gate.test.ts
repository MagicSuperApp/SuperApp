/**
 * Cổng nguồn cho `RingProgress` — vòng tiến độ PHẢI là viền của chính nút.
 *
 * ⛔ Bản đầu bị báo về từ thực địa là "nút tròn quá xấu". Đi đo thì lý do cụ
 *    thể, không phải chuyện gu: nút có HAI mép. Một mép của vòng SVG, một mép
 *    của `View` bo tròn lồng vào giữa. Hai mép không bao giờ khớp tuyệt đối —
 *    chúng lệch nhau nửa nét vẽ, và `View` bo tròn với `Circle` của SVG còn khử
 *    răng cưa khác nhau. Kết quả là một đường chỉ mờ chạy giữa vòng và lòng
 *    nút, nên cái vòng đọc ra "thứ đeo quanh nút" chứ không ra "viền của nút".
 *
 * Nay CHỈ MỘT `<Circle>` mang cả `fill` lẫn `stroke`: lòng và viền là hai thuộc
 * tính của cùng một hình, nên chúng đồng tâm và khít theo ĐỊNH NGHĨA, không
 * phải theo may mắn. Cung tiến độ vẽ đè lên đúng đường viền ấy — cùng tâm, cùng
 * bán kính, cùng bề dày. Nó không phải vòng thứ hai; nó là phần viền đã tô.
 *
 * ⚠ Đo MÃ NGUỒN. Bắt ca "ai đó tách lòng và viền ra làm hai hình", KHÔNG bắt ca
 * "một hình mà vẫn nhìn xấu". Phép đo cuối là mở màn thật.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'RingProgress.tsx'), 'utf8').replace(/\r\n/g, '\n');
const MA_CHAY = SRC.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((d) => {
    const t = d.trim();
    return !t.startsWith('//') && !t.startsWith('*');
  })
  .join('\n');

describe('lòng nút và viền là MỘT hình', () => {
  it('hình nền mang cả `fill` lẫn `stroke`', () => {
    const i = MA_CHAY.indexOf('<Circle');
    expect(i).toBeGreaterThan(-1);
    const hinhDau = MA_CHAY.slice(i, MA_CHAY.indexOf('/>', i));
    expect(hinhDau).toContain('fill={fill}');
    expect(hinhDau).toContain('stroke={TONE.border}');
  });

  it('cung tiến độ dùng ĐÚNG bán kính và bề dày của viền', () => {
    // Lệch một trong hai là cung trôi ra khỏi viền, và lại thành hai vòng.
    //
    // Neo vào `stroke={mau}` — lời gắn màu của CHÍNH cung. Trước đây neo vào
    // `TONE.primary`, và cái neo đó trượt ngay khi màu cung thành một tham số
    // (nhánh vật nuôi vẽ vòng màu nâu): lượt khớp đầu tiên rơi vào dòng khai
    // giá trị mặc định, cách chỗ vẽ cung vài chục dòng. Neo vào thuộc tính thì
    // nó chỉ trượt khi chỗ vẽ cung thật sự đổi.
    const i = MA_CHAY.indexOf('stroke={mau}');
    expect(i).toBeGreaterThan(-1);
    const cung = MA_CHAY.slice(Math.max(0, i - 200), i + 400);
    expect(cung).toContain('r={r}');
    expect(cung).toContain('strokeWidth={stroke}');
    expect(cung).toContain('fill="none"');
  });

  it('bán kính trừ NỬA nét, không trừ cả nét', () => {
    // `stroke` của SVG mọc đều hai bên đường tròn. Thiếu phép trừ này thì nửa
    // ngoài của viền bị khung cắt cụt — nút trông méo ở bốn phía.
    expect(MA_CHAY).toContain('const r = (size - stroke) / 2;');
  });

  it('cung vẽ bằng `strokeDasharray`, KHÔNG bằng mẹo xoay viền', () => {
    // Mẹo xoay viền đúng ở đúng bốn mốc 0·25·50·75% và sai ở mọi giá trị giữa:
    // viền hình bo tròn chia theo BỐN CẠNH, không theo góc quét.
    expect(MA_CHAY).toContain('strokeDasharray');
    expect(MA_CHAY).not.toContain('borderRightColor');
    expect(MA_CHAY).not.toContain('borderRadius');
  });

  it('cung bắt đầu từ ĐỈNH', () => {
    // Không xoay thì cung bắt đầu ở mép phải — đúng về toán, lạ về mắt.
    expect(MA_CHAY).toContain('rotate(-90 ');
  });

  it('phần trăm bị KẸP về 0..100', () => {
    // Dữ liệu hỏng cho `pct = 320` thì `strokeDasharray` quét hơn ba vòng và
    // hình ra một cái vòng đặc — trông như 100%, tức nói dối.
    expect(MA_CHAY).toContain('Math.max(0, Math.min(100,');
  });
});
