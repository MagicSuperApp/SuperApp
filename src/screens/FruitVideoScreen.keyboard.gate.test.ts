/**
 * Cổng chặn tái phát: bàn phím che ô nhập ở màn "Quay clip chùm quả".
 *
 * Cùng một lỗi, cùng một nếp vá ba chân với `ActivityScreen.keyboard.gate.test.ts`
 * — lý lẽ và số đo Yoga nằm ở đó và ở `utils/keyboardScroll.ts`, KHÔNG chép lại.
 * Màn này là màn anh em còn sót: ba ô nhập ("tên quả" · "tìm cây" · "ghi thêm")
 * nằm cuối vùng cuộn, còn thanh nút gửi thì đứng NGOÀI vùng cuộn và không có bọc
 * tránh bàn phím nào — tức là đủ cả ba chân đều thiếu.
 *
 * Không chân nào trong ba đọc được từ một lần dựng hình trong jsdom (không có bàn
 * phím thật, không có `measureInWindow` thật), nên cổng này đối chiếu VĂN BẢN
 * NGUỒN — y như bài gốc.
 *
 * ⛔ KHÔNG canh ở đây (nói ra để không ai tưởng đã canh):
 *   · "bỏ khối đệm chiều cao cứng" (chân 2b của bài gốc) — màn này chưa bao giờ
 *     có khối đệm chừa chỗ cho thanh nút phủ, nên không có gì để gỡ.
 *   · Hành vi cuộn thật. Công thức đã có bài riêng ở `utils/keyboardScroll.test.ts`;
 *     ở đây chỉ canh rằng màn GỌI đúng công thức đó với đúng cái mốc.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'FruitVideoScreen.tsx'), 'utf8');

/** Khối khai kiểu dáng của một tên, cắt từ `StyleSheet.create`. */
const styleBlock = (name: string): string => {
  const m = SRC.match(new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`));
  if (!m) throw new Error(`Không tìm thấy khối kiểu dáng \`${name}\` trong FruitVideoScreen.tsx`);
  return m[0];
};

/**
 * Object NỘI TUYẾN hợp nhất lên `styles.<name>` tại chỗ dựng hình.
 *
 * `styleBlock` một mình KHÔNG đủ: kiểu dáng sống của thanh nút là
 * `[styles.footer, { … }]`, và object nội tuyến đó đã đang đè `paddingBottom`.
 * Đặt `position: 'absolute'` vào đó thì thanh nút chìm xuống dưới bàn phím y như
 * cũ, mà cổng chỉ đọc `StyleSheet.create` vẫn xanh.
 */
const inlineStyleAt = (name: string): string => {
  const m = SRC.match(new RegExp(`\\[\\s*styles\\.${name},\\s*\\{[\\s\\S]*?\\},?\\s*\\]`));
  if (!m) throw new Error(`Không tìm thấy chỗ hợp nhất kiểu dáng nội tuyến cho \`${name}\``);
  return m[0];
};

/** Thân hàm `scrollInputIntoView` — để soi ĐÚNG chỗ tính mốc, không soi cả tệp. */
const scrollFnBody = (): string => {
  const start = SRC.indexOf('const scrollInputIntoView = useCallback(');
  if (start < 0) throw new Error('Không tìm thấy `scrollInputIntoView` trong FruitVideoScreen.tsx');
  const end = SRC.indexOf('\n  }, []);', start);
  if (end < 0) throw new Error('Không cắt được thân `scrollInputIntoView`');
  return SRC.slice(start, end);
};

describe('bàn phím không được che ô nhập ở màn quay clip quả', () => {
  it('chân 1 — có bọc tránh bàn phím, và trên iOS là `padding`', () => {
    expect(SRC).toMatch(/<KeyboardAvoidingView\n/);
    expect(SRC).toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  });

  it('chân 2 — thanh nút gửi nằm TRONG LUỒNG, không phải con tuyệt đối', () => {
    // Đây là chân mà bọc tránh bàn phím KHÔNG cứu được: `behavior="padding"` chỉ
    // đặt `paddingBottom` lên chính bọc đó, còn Yoga định vị con tuyệt đối theo
    // `measuredDimension − border`, không trừ padding. Đọc CẢ HAI nguồn hợp thành
    // kiểu dáng sống — xem `inlineStyleAt`.
    for (const nguon of [styleBlock('footer'), inlineStyleAt('footer')]) {
      expect(nguon).not.toContain("position: 'absolute'");
      expect(nguon).not.toMatch(/\bbottom:\s*0\b/);
    }
  });

  it('chân 2c — thanh nút là CON của bọc, và đứng SAU vùng cuộn', () => {
    // Chân 2 chỉ nói thanh nút không tuyệt đối. Nó vẫn có thể nằm NGOÀI bọc —
    // đúng trạng thái trước khi vá — và lúc đó `behavior="padding"` không chạm
    // tới nó, bàn phím lại che, mà hai ca trên vẫn xanh.
    //
    // ⛔ Kiểm CẢ HAI mốc có thật TRƯỚC khi cắt. `String.indexOf` trả `-1` khi
    // không thấy, và `slice(moBoc, -1)` không báo hỏng — nó cắt tới gần cuối tệp
    // rồi so trên lát đó. Mất hẳn thẻ đóng thì phép đo vẫn trả một giá trị hợp lệ
    // và vẫn XANH: đúng trạng thái thứ ba (KHÔNG ĐO ĐƯỢC) đội lốt "khớp".
    const moBoc = SRC.indexOf('<KeyboardAvoidingView\n');
    const dongBoc = SRC.indexOf('</KeyboardAvoidingView>');
    expect(moBoc).toBeGreaterThanOrEqual(0);
    expect(dongBoc).toBeGreaterThan(moBoc);
    const trongBoc = SRC.slice(moBoc, dongBoc);
    // Cùng cái bẫy, một tầng sâu hơn: `indexOf('</ScrollView>')` trả `-1` khi
    // vùng cuộn bị đẩy ra ngoài bọc, và mọi phép `toBeGreaterThan(-1)` bên dưới
    // đúng một cách vô nghĩa. Khai sự tồn tại trước, so thứ tự sau.
    expect(trongBoc).toContain('</ScrollView>');
    expect(trongBoc).toContain('styles.footer');
    // …và SAU `</ScrollView>`, tức anh em thứ hai trong luồng chứ không phải một
    // khối lọt vào bên trong vùng cuộn (ở đó nó cuộn theo nội dung và biến mất).
    expect(trongBoc.indexOf('styles.footer')).toBeGreaterThan(trongBoc.indexOf('</ScrollView>'));
  });

  it('chân 2d — thanh nút thu đệm đáy khi bàn phím ĐANG chiếm chỗ', () => {
    // Giữ nguyên đệm vùng an toàn lúc bàn phím mở là ăn mất ~46 điểm chiều cao
    // đúng lúc màn chật nhất, mà vùng an toàn lúc đó không có gì để tránh.
    expect(inlineStyleAt('footer')).toMatch(/paddingBottom: keyboardOpen \? 12 :/);
  });

  it('chân 3 — MỌI ô nhập tự cuộn vào tầm nhìn khi được chạm', () => {
    // Co vùng chứa KHÔNG dời nội dung; iOS không tự cuộn tới ô đang gõ.
    // Ghim ĐẠI LƯỢNG "mọi ô nhập đều có `onFocus`", KHÔNG ghim SỐ ĐẾM ô nhập —
    // thêm một ô mới làm đúng quy tắc mà ca này vẫn đỏ thì nó dạy người ta sửa
    // bài kiểm, không dạy người ta làm đúng.
    const soONhap = (SRC.match(/<TextInput/g) ?? []).length;
    const soOnFocus = (SRC.match(/onFocus=\{scrollInputIntoView\}/g) ?? []).length;
    expect(soONhap).toBeGreaterThan(0);
    expect(soOnFocus).toBe(soONhap);
    expect(SRC).toMatch(/ref=\{scrollRef\}/);
  });

  it('chân 3b — cuộn tới Ô ĐANG GÕ, KHÔNG cuộn tới cuối vùng cuộn', () => {
    // `scrollToEnd` không có tham chiếu nào tới nút đang focus. Nó trùng kết quả
    // với phép đúng ở đúng một ca — ô đang gõ là thứ cuối cùng — và màn này không
    // ở ca đó: ô "tên quả" nằm giữa trang, dưới nó còn cả khối chọn cây.
    expect(SRC).not.toMatch(/\.scrollToEnd\(/);
    expect(SRC).toContain('scrollOffsetToRevealInput');
    expect(SRC).toContain('TextInput.State.currentlyFocusedInput()');
    // Vị trí cuộn phải là số ĐANG đúng — phép trên cộng dồn vào nó.
    expect(SRC).toMatch(/onScroll=\{onScroll\}/);
  });

  it('chân 3d — mốc là ĐÁY KHUNG NHÌN của vùng cuộn, không phải đỉnh bàn phím', () => {
    // Chân 2 vừa đặt thanh nút gửi vào GIỮA vùng cuộn và bàn phím, nên hai mốc
    // cách nhau đúng chiều cao thanh nút — hơn cả chiều cao một ô nhập. Nhắm vào
    // đỉnh bàn phím là nhắm vào giữa thanh nút: màn giật lên rồi ô VẪN bị che,
    // chỉ đổi thứ che.
    //
    // Khớp TRỌN biểu thức, KHÔNG khớp tiền tố: `toContain('visibleBottom: barTop')`
    // vẫn xanh với `visibleBottom: barTop + barHeight` — mà đó chính là cách viết
    // lấy lại ĐÁY thanh nút, tức đỉnh bàn phím, tức đúng cái lỗi đang vá.
    expect(SRC).toMatch(/\n\s*visibleBottom: barTop,\n/);
    expect(SRC).toMatch(/bar\.measureInWindow\(/);
    expect(SRC).toMatch(/ref=\{bottomBarRef\}/);
    // `Dimensions.get('window').height` là chiều cao TOÀN màn, còn `measureInWindow`
    // trả toạ độ so với cửa sổ nhìn thấy — hai hệ quy chiếu, lệch đúng chiều cao
    // thanh trạng thái trên Android và lệch hàng trăm điểm khi chia đôi màn.
    // Soi THÂN HÀM, không soi cả tệp: màn này dùng `Dimensions` hợp lệ ở chỗ khác.
    expect(scrollFnBody()).not.toMatch(/Dimensions/);
  });

  it('số đo RỖNG không được đọc thành số đo thật', () => {
    // Nút đã rời khỏi cây (khối chọn cây đóng lại trong lúc chờ) trả `0,0,0,0`.
    // Đọc nó như "ô đang ở mép trên" là cuộn theo số bịa.
    expect(scrollFnBody()).toMatch(/if \(h <= 0 \|\| barHeight <= 0\) return;/);
  });

  it('chân 3c — chờ theo thời lượng HỆ ĐIỀU HÀNH khai, không theo số gõ tay', () => {
    // iOS báo 250–350ms tuỳ đời máy và tuỳ trợ năng "Giảm chuyển động"; chờ thiếu
    // thì cuộn trước lúc bọc co xong, và đích bị kẹp theo tầm cuộn cũ.
    expect(SRC).toContain('kbDurationRef');
    expect(SRC).toMatch(/e\.duration/);
    expect(scrollFnBody()).toMatch(/\}, kbDurationRef\.current\);?$/);
  });

  it('lần chạm đầu vẫn cuộn, dù `onFocus` bắn TRƯỚC khi có bàn phím', () => {
    // `onFocus` → `keyboardWillShow` là thứ tự thật. Ở lượt `onFocus`, chiều cao
    // bàn phím còn 0 nên phép cuộn thoát ngay ở cổng. Không chạy lại sau khi bàn
    // phím hiện thì lần chạm ĐẦU TIÊN — ca thường gặp nhất — không cuộn gì cả.
    expect(SRC).toMatch(/if \(kbHeight > 0\) scrollInputIntoView\(\);/);
  });

  it('không thu đệm đáy khi bàn phím KHÔNG chiếm chỗ thật', () => {
    // Hai ca bàn phím "mở" mà không che gì — trợ năng cross-fade (iOS báo
    // `screenY === 0`) và bàn phím phần cứng chỉ có thanh phím tắt. Nuôi một biến
    // bật/tắt thì cả hai ca đều thu đệm, nút dính vạch Home mà không đổi lấy chỗ nào.
    expect(SRC).toContain('screenY');
    expect(SRC).not.toMatch(/setKeyboardOpen\(/);
  });

  it('nghe sự kiện bàn phím theo ĐÚNG nền tảng', () => {
    // iOS chỉ bắn `Will*`, Android chỉ bắn `Did*` (`Keyboard.js:113,144`).
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillHide' : 'keyboardDidHide'/);
  });
});
