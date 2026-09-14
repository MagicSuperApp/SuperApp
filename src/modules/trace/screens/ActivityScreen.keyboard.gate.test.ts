/**
 * Cổng chặn tái phát: bàn phím che ô "Đã dùng gì".
 *
 * Lỗi gốc (báo từ thực địa 14/09): chọn "Bón phân" → quay clip → chạm ô nhập →
 * bàn phím lên và phủ kín ô đang gõ. Người dùng gõ mù.
 *
 * Lần vá ĐẦU chỉ bọc `KeyboardAvoidingView` quanh vùng cuộn và thanh nút, để
 * nguyên `styles.bottomBar` ở dạng `position: 'absolute', bottom: 0` — và nó
 * KHÔNG vá được gì cho thanh nút. `behavior="padding"` chỉ đặt `paddingBottom`
 * lên chính bọc đó, còn Yoga định vị con TUYỆT ĐỐI theo
 * `measuredDimension − border`, không trừ padding
 * (`node_modules/react-native/ReactCommon/yoga/yoga/algorithm/AbsoluteLayout.cpp:203-210`).
 * Đo bằng chính Yoga của kho này, cùng một cây bố cục, bàn phím cao 300 trên
 * khung 800:
 *
 *   thanh nút tuyệt đối → đáy y=800, đỉnh bàn phím y=500 → BỊ CHE
 *   thanh nút trong luồng → đáy y=500 → NHÌN THẤY
 *
 * Ba luật dưới đây là ba chân của bản vá. Thiếu một chân thì bàn phím vẫn che,
 * và không chân nào trong ba đọc được từ một lần dựng hình trong jsdom — cho nên
 * cổng này đối chiếu VĂN BẢN NGUỒN.
 *
 * Phép thử lúc viết từng ca (Forall §Kỷ luật phát ngôn #6): mỗi ca đều phân biệt
 * được hai bên đột biến — gỡ đúng chân nó canh thì nó đỏ, chứ không trượt xuống
 * chân kế tiếp.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'ActivityScreen.tsx'), 'utf8');

/** Khối khai kiểu dáng của một tên, cắt từ `StyleSheet.create`. */
const styleBlock = (name: string): string => {
  const m = SRC.match(new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`));
  if (!m) throw new Error(`Không tìm thấy khối kiểu dáng \`${name}\` trong ActivityScreen.tsx`);
  return m[0];
};

/**
 * Object NỘI TUYẾN hợp nhất lên `styles.<name>` tại chỗ dựng hình.
 *
 * ⛔ `styleBlock` một mình KHÔNG đủ để kết luận về kiểu dáng đang chạy. Kiểu dáng
 * sống của thanh nút là `[styles.bottomBar, { … }]`, và object nội tuyến đó đã
 * đang đè lên một thuộc tính (`paddingBottom`) — tức khối trong `StyleSheet.create`
 * tự nó không phải bản cuối. Đặt `position: 'absolute'` vào object nội tuyến thì
 * thanh nút chìm xuống dưới bàn phím y như cũ, mà cổng chỉ đọc `StyleSheet.create`
 * vẫn xanh.
 */
const inlineStyleAt = (name: string): string => {
  const m = SRC.match(new RegExp(`\\[\\s*styles\\.${name},\\s*\\{[\\s\\S]*?\\n\\s*\\},?\\s*\\n?\\s*\\]`));
  if (!m) throw new Error(`Không tìm thấy chỗ hợp nhất kiểu dáng nội tuyến cho \`${name}\``);
  return m[0];
};

describe('bàn phím không được che ô nhập vật tư', () => {
  it('chân 1 — có `KeyboardAvoidingView` bọc, và trên iOS là `padding`', () => {
    expect(SRC).toContain('<KeyboardAvoidingView');
    expect(SRC).toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  });

  it('chân 2 — thanh nút nằm TRONG LUỒNG, không phải con tuyệt đối', () => {
    // Đây là chân mà lần vá đầu bỏ sót. Đặt lại `position: 'absolute'` ở đây thì
    // thanh nút đứng im dưới bàn phím dù bọc `KeyboardAvoidingView` vẫn còn.
    // Đọc CẢ HAI nguồn hợp thành kiểu dáng sống — xem `inlineStyleAt`.
    for (const nguon of [styleBlock('bottomBar'), inlineStyleAt('bottomBar')]) {
      expect(nguon).not.toContain("position: 'absolute'");
      expect(nguon).not.toMatch(/\bbottom:\s*0\b/);
    }
  });

  it('chân 2c — thanh nút là CON của `KeyboardAvoidingView`, không đứng ngoài', () => {
    // Chân 2 chỉ nói thanh nút không tuyệt đối. Nó vẫn có thể nằm ngoài bọc, và
    // lúc đó `behavior="padding"` không chạm tới nó — bàn phím lại che, mà cả hai
    // ca kiểm trên vẫn xanh. Phép đo: thanh nút phải xuất hiện GIỮA
    // `<KeyboardAvoidingView` và `</KeyboardAvoidingView>`.
    const trongBoc = SRC.slice(
      SRC.indexOf('<KeyboardAvoidingView'),
      SRC.indexOf('</KeyboardAvoidingView>'),
    );
    expect(trongBoc).toContain('styles.bottomBar');
    // …và SAU `</ScrollView>`, tức là anh em thứ hai trong luồng chứ không phải
    // một khối lọt vào bên trong vùng cuộn (ở đó nó cuộn theo nội dung và biến mất).
    expect(trongBoc.indexOf('styles.bottomBar')).toBeGreaterThan(trongBoc.indexOf('</ScrollView>'));
  });

  it('chân 2b — không còn khối đệm chừa chỗ cho thanh nút phủ', () => {
    // `<View style={{ height: 120 }} />` cuối vùng cuộn chỉ tồn tại để chừa chỗ
    // cho một thanh nút PHỦ LÊN. Thanh nút vào luồng rồi mà còn giữ nó thì nó
    // thành khoảng trống chết ngay trên đỉnh bàn phím, đúng lúc màn chật nhất.
    expect(SRC).not.toMatch(/height:\s*120\s*\}\}\s*\/>/);
  });

  it('chân 3 — cả ba ô vật tư tự cuộn vào tầm nhìn khi được chạm', () => {
    // Co vùng chứa KHÔNG dời nội dung. iOS không tự cuộn tới ô đang gõ:
    // `automaticallyAdjustKeyboardInsets` mặc định TẮT
    // (`RCTScrollViewComponentView.mm:149`) và bốn handler bàn phím ở lớp JS
    // chỉ ghi số đo chứ không dời `contentOffset`.
    // Ghim ĐẠI LƯỢNG "mọi ô nhập đều có `onFocus`", KHÔNG ghim SỐ ĐẾM ô nhập.
    // Số ô là một tập đang lớn dần: thêm một ô ghi chú làm đúng quy tắc mà ca này
    // vẫn đỏ thì nó dạy người ta sửa ca kiểm, không dạy người ta làm đúng.
    const soONhap = (SRC.match(/<TextInput/g) ?? []).length;
    const soOnFocus = (SRC.match(/onFocus=\{scrollInputIntoView\}/g) ?? []).length;
    expect(soONhap).toBeGreaterThan(0);
    expect(soOnFocus).toBe(soONhap);
    expect(SRC).toMatch(/ref=\{scrollRef\}/);
  });

  it('chân 3d — mốc là ĐÁY KHUNG NHÌN của vùng cuộn, không phải đỉnh bàn phím', () => {
    // Chân 2 vừa đặt thanh nút "Lưu" vào GIỮA vùng cuộn và bàn phím, nên hai mốc
    // đó cách nhau đúng chiều cao thanh nút (~117 điểm) — hơn cả chiều cao một ô
    // nhập. Nhắm vào đỉnh bàn phím tức nhắm vào giữa thanh nút: màn giật lên rồi
    // ô vẫn bị che, chỉ đổi thứ che. Lấy `Dimensions` làm mốc còn hỏng thêm một
    // kiểu nữa trên Android, nơi nó không cùng hệ quy chiếu với `measureInWindow`.
    // Khớp TRỌN biểu thức, không khớp tiền tố. `toContain('visibleBottom: barTop')`
    // vẫn xanh với `visibleBottom: barTop + barHeight` — mà đó chính là cách viết
    // lấy lại ĐÁY thanh nút, tức đỉnh bàn phím, tức đúng cái lỗi đang vá. Đo được:
    // ca này từng để đột biến ấy đi qua với 171/171 xanh.
    expect(SRC).toMatch(/\n\s*visibleBottom: barTop,\n/);
    expect(SRC).toMatch(/bar\.measureInWindow\(/);
    expect(SRC).toMatch(/ref=\{bottomBarRef\}/);
    expect(SRC).not.toMatch(/Dimensions\.get\('window'\)/);
  });

  it('số đo RỖNG không được đọc thành số đo thật', () => {
    // Nút đã rời khỏi cây (dòng vật tư bị xoá trong lúc chờ) trả `0,0,0,0`. Đọc
    // nó như "ô đang ở mép trên" là dựng một cái vỏ im lặng: cuộn theo số bịa.
    expect(SRC).toMatch(/if \(h <= 0 \|\| barHeight <= 0\) return;/);
  });

  it('chân 3b — cuộn tới Ô ĐANG GÕ, KHÔNG cuộn tới cuối vùng cuộn', () => {
    // `scrollToEnd` không có tham chiếu nào tới nút đang focus. Nó trùng kết quả
    // với phép đúng ở đúng một ca — ô đang gõ là thứ cuối cùng — và màn này không
    // ở ca đó: `materialRows` là MẢNG, có nút thêm dòng. Từ dòng thứ hai trở đi,
    // chạm ô của dòng ĐẦU thì `scrollToEnd` đẩy chính ô đó ra khỏi mép trên.
    // Công thức và các cực đã kiểm: `src/utils/keyboardScroll.test.ts`.
    // Khớp LỜI GỌI, không khớp cái tên: chú thích trong màn có nhắc tên hàm này
    // để nói vì sao không dùng nó, và đó là thứ phải giữ lại chứ không phải xoá đi.
    expect(SRC).not.toMatch(/\.scrollToEnd\(/);
    expect(SRC).toContain('scrollOffsetToRevealInput');
    expect(SRC).toContain('TextInput.State.currentlyFocusedInput()');
    // Vị trí cuộn phải là số ĐANG đúng — phép trên cộng dồn vào nó.
    expect(SRC).toMatch(/onScroll=\{onScroll\}/);
  });

  it('chân 3c — chờ theo thời lượng HỆ ĐIỀU HÀNH khai, không theo số gõ tay', () => {
    // Bản trước chờ 120ms cố định. iOS báo 250–350ms tuỳ đời máy và tuỳ trợ năng
    // "Giảm chuyển động"; chờ thiếu thì cuộn trước lúc `KeyboardAvoidingView` co
    // xong, và đích bị kẹp theo tầm cuộn cũ.
    expect(SRC).toContain('kbDurationRef');
    expect(SRC).toMatch(/e\.duration/);
    expect(SRC).not.toMatch(/setTimeout\([^,]*,\s*120\s*\)/);
  });

  it('lần chạm đầu vẫn cuộn, dù `onFocus` bắn TRƯỚC khi có bàn phím', () => {
    // `onFocus` → `keyboardWillShow` là thứ tự thật. Ở lượt `onFocus`, chiều cao
    // bàn phím còn 0 nên phép cuộn thoát ngay ở cổng. Không chạy lại sau khi bàn
    // phím hiện thì lần chạm ĐẦU TIÊN — ca thường gặp nhất — không cuộn gì cả.
    expect(SRC).toMatch(/if \(kbHeight > 0\) scrollInputIntoView\(\);/);
  });

  it('không thu đệm đáy khi bàn phím KHÔNG chiếm chỗ thật', () => {
    // Hai ca bàn phím "mở" mà không che gì — trợ năng "Prefer Cross-Fade
    // Transitions" (iOS báo `screenY === 0`, chính `KeyboardAvoidingView` cũng
    // có cổng này) và bàn phím phần cứng chỉ có thanh phím tắt. Nuôi một biến
    // bật/tắt thì cả hai ca đều thu đệm, nút dính vạch Home mà không đổi lấy
    // chỗ nào.
    expect(SRC).toContain('screenY');
    expect(SRC).not.toMatch(/setKeyboardOpen\(true\)/);
  });

  it('nghe sự kiện bàn phím theo ĐÚNG nền tảng', () => {
    // iOS chỉ bắn `Will*`, Android chỉ bắn `Did*` (`Keyboard.js:113,144`) —
    // `KeyboardAvoidingView` của chính React Native cũng đăng ký theo nền tảng
    // (`KeyboardAvoidingView.js:198-214`). Đăng ký cả bốn không thêm độ phủ nào.
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
    expect(SRC).toMatch(/Platform\.OS === 'ios' \? 'keyboardWillHide' : 'keyboardDidHide'/);
  });
});
