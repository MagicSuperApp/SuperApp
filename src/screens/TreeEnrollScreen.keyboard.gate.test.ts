/**
 * Cổng chặn tái phát: bàn phím che ô "Tên cây" ở màn đăng ký cây.
 *
 * Cùng một lỗi và cùng nếp vá ba chân với `ActivityScreen.keyboard.gate.test.ts`
 * — lý lẽ và số đo Yoga nằm ở đó và ở `utils/keyboardScroll.ts`, KHÔNG chép lại.
 * Màn này là màn anh em còn sót: ô "Tên cây" nằm trong vùng cuộn, còn khối nút
 * "Huỷ / Đăng ký" đứng NGOÀI vùng cuộn và không có bọc tránh bàn phím nào.
 *
 * ── Chỗ màn này KHÁC màn ghi hoạt động, và cổng phải đo theo cái khác đó ──────
 * Giữa vùng cuộn và thanh nút còn một dải "còn thiếu gì" (`styles.missingBar`)
 * hiện có điều kiện. Mép dưới thật của vùng cuộn là ĐỈNH của dải đó khi nó hiện,
 * và là đỉnh thanh nút khi nó không hiện. Đo bằng hai `measureInWindow` rồi chọn
 * số nhỏ hơn là dựng thêm một chỗ để sai; nên hai khối gộp vào MỘT bọc mang
 * `bottomBarRef`, và một lần đo luôn đúng ở cả hai ca.
 *
 * ⛔ KHÔNG canh ở đây: "bỏ khối đệm chiều cao cứng" (chân 2b của bài gốc) — màn
 * này chưa bao giờ có khối đệm chừa chỗ cho thanh nút phủ, nên không có gì để gỡ.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'TreeEnrollScreen.tsx'), 'utf8');

/** Khối khai kiểu dáng của một tên, cắt từ `StyleSheet.create`. */
const styleBlock = (name: string): string => {
  const m = SRC.match(new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`));
  if (!m) throw new Error(`Không tìm thấy khối kiểu dáng \`${name}\` trong TreeEnrollScreen.tsx`);
  return m[0];
};

/**
 * Object NỘI TUYẾN hợp nhất lên `styles.<name>` tại chỗ dựng hình.
 *
 * `styleBlock` một mình KHÔNG đủ: kiểu dáng sống của thanh nút là
 * `[styles.footer, { … }]` và object nội tuyến đó đã đang đè `paddingBottom`.
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
  if (start < 0) throw new Error('Không tìm thấy `scrollInputIntoView` trong TreeEnrollScreen.tsx');
  const end = SRC.indexOf('\n  }, []);', start);
  if (end < 0) throw new Error('Không cắt được thân `scrollInputIntoView`');
  return SRC.slice(start, end);
};

describe('bàn phím không được che ô "Tên cây"', () => {
  it('chân 1 — có bọc tránh bàn phím, và trên iOS là `padding`', () => {
    expect(SRC).toMatch(/<KeyboardAvoidingView\n/);
    expect(SRC).toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  });

  it('chân 2 — khối nút nằm TRONG LUỒNG, không phải con tuyệt đối', () => {
    // Bọc tránh bàn phím KHÔNG cứu được chân này: `behavior="padding"` chỉ đặt
    // `paddingBottom` lên chính bọc đó, còn Yoga định vị con tuyệt đối theo
    // `measuredDimension − border`, không trừ padding.
    for (const nguon of [styleBlock('footer'), styleBlock('missingBar'), inlineStyleAt('footer')]) {
      expect(nguon).not.toContain("position: 'absolute'");
      expect(nguon).not.toMatch(/\bbottom:\s*0\b/);
    }
  });

  it('chân 2c — khối nút là CON của bọc, và đứng SAU vùng cuộn', () => {
    // Chân 2 chỉ nói khối nút không tuyệt đối. Nó vẫn có thể nằm NGOÀI bọc —
    // đúng trạng thái trước khi vá — và lúc đó bọc không chạm tới nó.
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
    expect(trongBoc.indexOf('styles.footer')).toBeGreaterThan(trongBoc.indexOf('</ScrollView>'));
    // Dải "còn thiếu gì" phải nằm CÙNG bọc, và nằm TRONG khối mang `bottomBarRef`
    // — nếu không, mép đo được là đỉnh thanh nút chứ không phải mép thật của vùng
    // cuộn, và ô đang gõ chui xuống dưới dải đó.
    expect(trongBoc.indexOf('ref={bottomBarRef}')).toBeGreaterThan(trongBoc.indexOf('</ScrollView>'));
    expect(trongBoc.indexOf('styles.missingBar')).toBeGreaterThan(trongBoc.indexOf('ref={bottomBarRef}'));
    expect(trongBoc.indexOf('styles.footer')).toBeGreaterThan(trongBoc.indexOf('ref={bottomBarRef}'));
  });

  it('chân 2d — khối nút thu đệm đáy khi bàn phím ĐANG chiếm chỗ', () => {
    // `bottomPad` là đệm vùng an toàn. Giữ nguyên nó lúc bàn phím mở là ăn mất
    // chiều cao đúng lúc màn chật nhất, mà lúc đó không có vạch Home nào để tránh.
    expect(inlineStyleAt('footer')).toMatch(/paddingBottom: keyboardOpen \? 12 : bottomPad/);
  });

  it('chân 3 — MỌI ô nhập tự cuộn vào tầm nhìn khi được chạm', () => {
    // Ghim ĐẠI LƯỢNG "mọi ô nhập đều có `onFocus`", KHÔNG ghim SỐ ĐẾM: thêm một ô
    // mới làm đúng quy tắc mà ca này vẫn đỏ thì nó dạy người ta sửa bài kiểm.
    const soONhap = (SRC.match(/<TextInput/g) ?? []).length;
    const soOnFocus = (SRC.match(/onFocus=\{scrollInputIntoView\}/g) ?? []).length;
    expect(soONhap).toBeGreaterThan(0);
    expect(soOnFocus).toBe(soONhap);
    expect(SRC).toMatch(/ref=\{scrollRef\}/);
  });

  it('chân 3b — cuộn tới Ô ĐANG GÕ, KHÔNG cuộn tới cuối vùng cuộn', () => {
    // Ô "Tên cây" nằm gần ĐẦU trang: dưới nó còn lưới ảnh và khối kết quả đăng ký.
    // `scrollToEnd` ở đây đẩy chính ô vừa chạm ra khỏi mép TRÊN.
    expect(SRC).not.toMatch(/\.scrollToEnd\(/);
    expect(SRC).toContain('scrollOffsetToRevealInput');
    expect(SRC).toContain('TextInput.State.currentlyFocusedInput()');
    expect(SRC).toMatch(/onScroll=\{onScroll\}/);
  });

  it('chân 3d — mốc là ĐÁY KHUNG NHÌN của vùng cuộn, không phải đỉnh bàn phím', () => {
    // Khớp TRỌN biểu thức, KHÔNG khớp tiền tố: `toContain('visibleBottom: barTop')`
    // vẫn xanh với `visibleBottom: barTop + barHeight` — mà đó chính là cách viết
    // lấy lại ĐÁY khối nút, tức đỉnh bàn phím, tức đúng cái lỗi đang vá.
    expect(SRC).toMatch(/\n\s*visibleBottom: barTop,\n/);
    expect(SRC).toMatch(/bar\.measureInWindow\(/);
    expect(SRC).toMatch(/ref=\{bottomBarRef\}/);
    // Soi THÂN HÀM chứ không soi cả tệp: màn này dùng `Dimensions.get('window')`
    // hợp lệ ở hai chỗ khác (bề rộng ô lưới ảnh, chiều cao hộp xem ảnh). Cấm nó
    // trên toàn tệp thì cổng kêu đỏ ở ca hợp lệ rồi bị ai đó nới ra.
    expect(scrollFnBody()).not.toMatch(/Dimensions/);
  });

  it('số đo RỖNG không được đọc thành số đo thật', () => {
    // Nút đã rời khỏi cây (dải "còn thiếu gì" tắt đi trong lúc chờ) trả `0,0,0,0`.
    expect(scrollFnBody()).toMatch(/if \(h <= 0 \|\| barHeight <= 0\) return;/);
  });

  it('chân 3c — chờ theo thời lượng HỆ ĐIỀU HÀNH khai, không theo số gõ tay', () => {
    expect(SRC).toContain('kbDurationRef');
    expect(SRC).toMatch(/e\.duration/);
    expect(scrollFnBody()).toMatch(/\}, kbDurationRef\.current\);?$/);
  });

  it('lần chạm đầu vẫn cuộn, dù `onFocus` bắn TRƯỚC khi có bàn phím', () => {
    expect(SRC).toMatch(/if \(kbHeight > 0\) scrollInputIntoView\(\);/);
  });

  it('không thu đệm đáy khi bàn phím KHÔNG chiếm chỗ thật', () => {
    expect(SRC).toContain('screenY');
    expect(SRC).not.toMatch(/setKeyboardOpen\(/);
  });

  it('nghe sự kiện bàn phím theo ĐÚNG nền tảng', () => {
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillHide' : 'keyboardDidHide'/);
  });
});
