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

describe('bàn phím không được che ô nhập vật tư', () => {
  it('chân 1 — có `KeyboardAvoidingView` bọc, và trên iOS là `padding`', () => {
    expect(SRC).toContain('<KeyboardAvoidingView');
    expect(SRC).toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  });

  it('chân 2 — thanh nút nằm TRONG LUỒNG, không phải con tuyệt đối', () => {
    // Đây là chân mà lần vá đầu bỏ sót. Đặt lại `position: 'absolute'` ở đây thì
    // thanh nút đứng im dưới bàn phím dù bọc `KeyboardAvoidingView` vẫn còn.
    expect(styleBlock('bottomBar')).not.toContain("position: 'absolute'");
    expect(styleBlock('bottomBar')).not.toMatch(/\bbottom:\s*0\b/);
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
    const soONhap = (SRC.match(/<TextInput/g) ?? []).length;
    const soOnFocus = (SRC.match(/onFocus=\{scrollInputIntoView\}/g) ?? []).length;
    expect(soONhap).toBe(3); // tên · lượng · đơn vị
    expect(soOnFocus).toBe(soONhap);
    expect(SRC).toMatch(/ref=\{scrollRef\}/);
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
