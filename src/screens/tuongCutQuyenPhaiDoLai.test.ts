// screens/tuongCutQuyenPhaiDoLai.test.ts
//
// MÀN NÀO DỰNG BỨC TƯỜNG "KHÔNG CÓ QUYỀN" THÌ PHẢI ĐO LẠI KHI APP VỀ TIỀN CẢNH.
//
// ── Ranh giới, và vì sao nó không phải "mọi chỗ gọi openSettings" ─────────
// Dẫn người dùng ra Cài đặt KHÔNG tự nó là lỗi. Cái quyết định là quyền được
// giữ ở đâu:
//
//   · Đo NGAY LÚC HÀNH ĐỘNG (trong thân hàm xử lý nút) — `TreeIdentityScreen`,
//     `FruitListScreen`. Bấm lại là đo lại, luôn tươi. KHÔNG cần đụng gì.
//   · Có nút "Thử lại" chạy lại chính hành động — `TreeEnrollScreen`. Cũng tươi.
//   · Giữ làm TRẠNG THÁI của màn đang mở, rồi vẽ một màn hình chặn dựa trên nó
//     — `TraceScanScreen`. Đây là ca hỏng: trạng thái ôi đi mà màn thì đứng yên.
//
// Ở ca thứ ba, màn bày nút "Mở Cài đặt", người dùng bật quyền rồi quay lại, và
// màn **vẫn đứng nguyên** ở câu "không có quyền". Hai lối ra duy nhất là bấm
// Đóng hoặc tắt hẳn app — không chỗ nào nói thế. Nút dẫn đi một nơi rồi không
// nhận người ta về: một bức tường cụt, không phải một lỗi hiển thị.
//
// Cùng nguyên nhân gốc với `hooks/useBiometricSensor.ts` (cảm biến sinh trắc),
// tách tệp vì quyền máy ảnh đi qua `PermissionsAndroid`, một API khác hẳn.

import fs from 'fs';
import path from 'path';

const SCREENS = __dirname;
const read = (name: string) => fs.readFileSync(path.join(SCREENS, name), 'utf8');

describe('bức tường quyền phải đo lại khi app về tiền cảnh', () => {
  // BẢN KHAI: màn giữ quyền làm TRẠNG THÁI rồi vẽ màn hình chặn dựa trên nó.
  const walls = ['TraceScanScreen.tsx'];

  it.each(walls)('%s nghe AppState và đo lại ở `active`', name => {
    const source = read(name);
    expect(`${name}: ${/AppState\.addEventListener/.test(source)}`).toBe(`${name}: true`);
    expect(`${name}: ${/=== 'active'/.test(source)}`).toBe(`${name}: true`);
    // Gỡ hàm nghe lúc tháo cây — không thì mỗi lần mở màn quét là thêm một listener.
    expect(`${name}: ${/sub\.remove\(\)/.test(source)}`).toBe(`${name}: true`);
  });

  it('TraceScanScreen chỉ XIN quyền một lần, lần sau chỉ KIỂM', () => {
    // `request` lại ở mỗi lượt về tiền cảnh sẽ bật hộp xin quyền liên tục, và ở
    // trạng thái "đừng hỏi lại" thì nó không hỏi được gì mà vẫn tốn một lượt gọi.
    const source = read('TraceScanScreen.tsx');
    expect(source).toMatch(/PermissionsAndroid\.check\(/);
    expect(source).toMatch(/if \(!asked\)/);
  });

  it('và nó chỉ NÂNG lên, không tự dập màn đang quét xuống tường', () => {
    // Một lượt `check` trả `false` giữa chừng không được phép cắt ngang phiên
    // quét. Quyền bị rút thật thì chính máy ảnh hỏng và báo theo đường của nó.
    const source = read('TraceScanScreen.tsx');
    expect(source).toMatch(/if \(!cancelled && ok\) setGranted\(true\);/);
  });

  // Ba màn dưới đây CỐ Ý không nằm trong `walls`. Ghi ra để lần sau không ai
  // "sửa" nhầm chúng, và để nếu chúng đổi sang giữ trạng thái thì bài này đỏ.
  const freshAtAction: Array<[string, RegExp]> = [
    ['TreeIdentityScreen.tsx', /const granted = await PermissionsAndroid\.request\(/],
    ['FruitListScreen.tsx', /const granted = await PermissionsAndroid\.request\(/],
  ];

  it.each(freshAtAction)('%s đo ngay lúc hành động — không giữ trạng thái quyền', (name, marker) => {
    const source = read(name);
    expect(source).toMatch(marker);
    // Không có state quyền nào để mà ôi.
    expect(`${name}: ${/useState[^\n]*[Pp]ermission|setGranted\(/.test(source)}`).toBe(`${name}: false`);
  });

  it('ca đối chứng — phép quét mở được tệp thật', () => {
    expect(read('TraceScanScreen.tsx').length).toBeGreaterThan(1000);
    expect(read('TraceScanScreen.tsx')).toContain('openSettings');
  });
});
