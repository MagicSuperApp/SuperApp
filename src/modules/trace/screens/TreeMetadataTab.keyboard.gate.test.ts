/**
 * Cổng chặn tái phát: bàn phím che ô "Ghi chú" và nút "Lưu thông tin".
 *
 * Lỗi gốc: `TreeMetadataTab.tsx` thiếu CẢ BA chân của nếp vá bàn phím đã chốt ở
 * `ActivityScreen.tsx` — không có `KeyboardAvoidingView`, `styles.bottomBar` là
 * `position:'absolute', bottom:0`, và không một ô nào trong sáu ô `<TextInput>`
 * có `onFocus`. Gõ ô "Ghi chú" thì bàn phím phủ kín cả ô lẫn nút Lưu.
 *
 * Ba chân đó không đọc được từ một lần dựng hình trong jsdom (Yoga không chạy,
 * bàn phím không tồn tại), nên cổng này đối chiếu VĂN BẢN NGUỒN — cùng cách với
 * `ActivityScreen.keyboard.gate.test.ts`.
 *
 * Phép thử lúc viết từng ca: mỗi ca phân biệt được hai bên đột biến — gỡ đúng
 * chân nó canh thì nó đỏ, không trượt xuống chân kế tiếp.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'TreeMetadataTab.tsx'), 'utf8');

/** Khối khai kiểu dáng của một tên, cắt từ `StyleSheet.create`. */
const styleBlock = (name: string): string => {
  const m = SRC.match(new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`));
  if (!m) throw new Error(`Không tìm thấy khối kiểu dáng \`${name}\` trong TreeMetadataTab.tsx`);
  return m[0];
};

/**
 * Object NỘI TUYẾN hợp nhất lên `styles.<name>` tại chỗ dựng hình.
 *
 * `styleBlock` một mình KHÔNG đủ: kiểu dáng sống của thanh nút là
 * `[styles.bottomBar, { … }]`, và object nội tuyến đó đã đang đè `paddingBottom`.
 * Đặt `position: 'absolute'` vào đó thì thanh nút chìm xuống dưới bàn phím y như
 * cũ, mà một cổng chỉ đọc `StyleSheet.create` vẫn xanh.
 */
const inlineStyleAt = (name: string): string => {
  const m = SRC.match(new RegExp(`\\[\\s*styles\\.${name},\\s*\\{[\\s\\S]*?\\n?\\s*\\},?\\s*\\n?\\s*\\]`));
  if (!m) throw new Error(`Không tìm thấy chỗ hợp nhất kiểu dáng nội tuyến cho \`${name}\``);
  return m[0];
};

describe('bàn phím không được che ô "Ghi chú" và nút "Lưu thông tin"', () => {
  it('chân 1 — có `KeyboardAvoidingView` bọc, và trên iOS là `padding`', () => {
    expect(SRC).toContain('<KeyboardAvoidingView');
    expect(SRC).toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  });

  it('chân 2 — thanh nút nằm TRONG LUỒNG, không phải con tuyệt đối', () => {
    // Đọc CẢ HAI nguồn hợp thành kiểu dáng sống — xem `inlineStyleAt`.
    for (const nguon of [styleBlock('bottomBar'), inlineStyleAt('bottomBar')]) {
      expect(nguon).not.toContain("position: 'absolute'");
      expect(nguon).not.toMatch(/\bbottom:\s*0\b/);
    }
  });

  it('chân 2b — thanh nút là CON của `KeyboardAvoidingView`, và SAU `</ScrollView>`', () => {
    // Chân 2 chỉ nói thanh nút không tuyệt đối. Nó vẫn có thể nằm NGOÀI bọc, và
    // lúc đó `behavior="padding"` không chạm tới nó — bàn phím lại che, mà cả hai
    // ca kiểm trên vẫn xanh.
    // ⛔ Kiểm hai mốc CÓ THẬT trước khi cắt. `String.indexOf` trả `-1` khi không
    // thấy, và `slice(i, -1)` thì cắt tới GẦN CUỐI TỆP thay vì báo hỏng — tức
    // mất hẳn thẻ đóng, phép đo vẫn trả một giá trị hợp lệ và vẫn xanh. Đó là
    // trạng thái thứ ba (KHÔNG ĐO ĐƯỢC) đội lốt trạng thái "khớp".
    const moBoc = SRC.indexOf('<KeyboardAvoidingView');
    const dongBoc = SRC.indexOf('</KeyboardAvoidingView>');
    expect(moBoc).toBeGreaterThanOrEqual(0);
    expect(dongBoc).toBeGreaterThan(moBoc);

    const trongBoc = SRC.slice(moBoc, dongBoc);
    expect(trongBoc).toContain('styles.bottomBar');
    // Cùng cái bẫy, một tầng sâu hơn: vùng cuộn bị đẩy RA NGOÀI bọc thì
    // `indexOf('</ScrollView>')` trả `-1`, và mọi phép `toBeGreaterThan(-1)` bên
    // dưới đúng một cách vô nghĩa. Khai sự tồn tại TRƯỚC, so thứ tự SAU.
    expect(trongBoc).toContain('</ScrollView>');
    expect(trongBoc.indexOf('styles.bottomBar')).toBeGreaterThan(trongBoc.indexOf('</ScrollView>'));
  });

  it('chân 2c — không còn khối đệm chừa chỗ cho thanh nút phủ', () => {
    // `<View style={{ height: 100 }} />` cuối vùng cuộn chỉ tồn tại để chừa chỗ
    // cho một thanh nút PHỦ LÊN. Thanh nút vào luồng rồi mà còn giữ nó thì nó
    // thành khoảng trống chết ngay trên đỉnh bàn phím, đúng lúc màn chật nhất.
    expect(SRC).not.toMatch(/height:\s*100\s*\}\}\s*\/>/);
  });

  it('chân 3 — MỌI ô nhập tự cuộn vào tầm nhìn khi được chạm', () => {
    // Ghim ĐẠI LƯỢNG "mọi ô nhập đều có `onFocus`", KHÔNG ghim SỐ ĐẾM ô nhập:
    // thêm một ô mới làm đúng quy tắc mà ca này vẫn đỏ thì nó dạy người ta sửa
    // ca kiểm, không dạy người ta làm đúng.
    const soONhap = (SRC.match(/<TextInput/g) ?? []).length;
    const soOnFocus = (SRC.match(/onFocus=\{scrollInputIntoView\}/g) ?? []).length;
    expect(soONhap).toBeGreaterThan(0);
    expect(soOnFocus).toBe(soONhap);
    expect(SRC).toMatch(/ref=\{scrollRef\}/);
  });

  it('chân 3b — mốc là ĐÁY KHUNG NHÌN của vùng cuộn, không phải đỉnh bàn phím', () => {
    // Thanh nút "Lưu" đứng GIỮA vùng cuộn và bàn phím, nên hai mốc cách nhau
    // đúng chiều cao thanh nút. Khớp TRỌN biểu thức, không khớp tiền tố:
    // `toContain('visibleBottom: barTop')` vẫn xanh với `visibleBottom: barTop +
    // barHeight` — mà đó chính là cách viết lấy lại ĐÁY thanh nút, tức đỉnh bàn
    // phím, tức đúng cái lỗi đang vá.
    expect(SRC).toMatch(/\n\s*visibleBottom: barTop,\n/);
    expect(SRC).toMatch(/bar\.measureInWindow\(/);
    expect(SRC).toMatch(/ref=\{bottomBarRef\}/);
    expect(SRC).not.toMatch(/Dimensions\.get\('window'\)/);
  });

  it('chân 3c — cuộn tới Ô ĐANG GÕ, không cuộn tới cuối vùng cuộn', () => {
    expect(SRC).not.toMatch(/\.scrollToEnd\(/);
    expect(SRC).toContain('scrollOffsetToRevealInput');
    expect(SRC).toContain('TextInput.State.currentlyFocusedInput()');
    // Vị trí cuộn phải là số ĐANG đúng — phép trên cộng dồn vào nó.
    expect(SRC).toMatch(/onScroll=\{onScroll\}/);
  });

  it('số đo RỖNG không được đọc thành số đo thật', () => {
    // Nút đã rời khỏi cây trả `0,0,0,0`. Đọc nó như "ô đang ở mép trên" là cuộn
    // theo số bịa.
    expect(SRC).toMatch(/if \(h <= 0 \|\| barHeight <= 0\) return;/);
  });

  it('lần chạm đầu vẫn cuộn, dù `onFocus` bắn TRƯỚC khi có bàn phím', () => {
    expect(SRC).toMatch(/if \(kbHeight > 0\) scrollInputIntoView\(\);/);
  });

  it('chờ theo thời lượng HỆ ĐIỀU HÀNH khai, không theo số gõ tay', () => {
    expect(SRC).toContain('kbDurationRef');
    expect(SRC).toMatch(/e\.duration/);
  });

  it('không thu đệm đáy khi bàn phím KHÔNG chiếm chỗ thật', () => {
    // `screenY === 0` (trợ năng "Prefer Cross-Fade Transitions") và bàn phím
    // phần cứng đều "mở" mà không che gì.
    expect(SRC).toContain('screenY');
  });

  it('nghe sự kiện bàn phím theo ĐÚNG nền tảng', () => {
    // iOS chỉ bắn `Will*`, Android chỉ bắn `Did*` (`Keyboard.js:113,144`).
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillHide' : 'keyboardDidHide'/);
  });
});
