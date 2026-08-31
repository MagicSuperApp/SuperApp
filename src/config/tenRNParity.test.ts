/**
 * Tên đăng ký ứng dụng React Native phải KHỚP ở cả bốn chỗ khai nó.
 *
 * 🔴 Vì sao bài kiểm này tồn tại: lệch tên ở đây KHÔNG gãy lúc dựng. `tsc` không
 * thấy, gradle không thấy, `xcodebuild` không thấy — cả hai bản vẫn ra tệp cài
 * được. Nó gãy lúc MỞ APP, bằng màn đỏ "Application <tên> has not been
 * registered". Tức phép đo duy nhất bắt được nó là cầm máy mở app lên, và trên
 * bản phát hành thì đó là người dùng.
 *
 * Bài kiểm này biến lỗi-lúc-chạy thành lỗi-lúc-kiểm. Nó là điều kiện để đổi tên
 * `aladin_mobile_fe` → `SuperApp` an toàn: tên cũ do một đơn vị ngoài đặt từ
 * v1.0, và nay nền mã này dựng nhiều app nên tên riêng của một app không còn
 * đúng cho cái khung chung.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const GOC = join(__dirname, '..', '..');
const doc = (p: string) => readFileSync(join(GOC, p), 'utf8').replace(/\r\n/g, '\n');

const APP_JSON = JSON.parse(doc('app.json')) as { name: string; displayName: string };
const TEN = APP_JSON.name;

it('phép đọc tự kiểm — hỏng thì mọi ca dưới xanh giả', () => {
  expect(TEN).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  expect(TEN.length).toBeGreaterThan(2);
});

it('bốn chỗ khai tên đăng ký RN nói cùng một chuỗi', () => {
  // `AppRegistry.registerComponent(name)` ở `index.js` lấy từ app.json; hai tầng
  // native dưới đây phải hỏi ĐÚNG chuỗi đó, nếu không app mở ra là màn đỏ.
  expect(JSON.parse(doc('package.json')).name).toBe(TEN);
  expect(doc('ios/SuperApp/AppDelegate.swift')).toContain(`withModuleName: "${TEN}"`);
  expect(doc('android/app/src/main/java/com/aladincontract/company/MainActivity.kt')).toContain(
    `getMainComponentName(): String = "${TEN}"`,
  );
});

it('dự án Xcode, workspace và scheme mang cùng tên đó', () => {
  // Thiếu một chỗ là `xcodebuild -scheme` không tìm ra scheme, hoặc CocoaPods
  // sinh `Pods-<tên khác>` rồi pbxproj trỏ vào tệp không tồn tại.
  expect(() => doc(`ios/${TEN}.xcodeproj/project.pbxproj`)).not.toThrow();
  expect(() => doc(`ios/${TEN}.xcodeproj/xcshareddata/xcschemes/${TEN}.xcscheme`)).not.toThrow();
  expect(() => doc(`ios/${TEN}.xcworkspace/contents.xcworkspacedata`)).not.toThrow();
  expect(doc('ios/Podfile')).toContain(`target '${TEN}' do`);
  expect(doc(`ios/${TEN}.xcodeproj/project.pbxproj`)).toContain(`PRODUCT_NAME = ${TEN};`);
  expect(doc(`ios/${TEN}.xcodeproj/project.pbxproj`)).toContain(`INFOPLIST_FILE = ${TEN}/Info.plist;`);
});

it('luồng dựng iOS gọi đúng scheme và workspace đó', () => {
  const cm = doc('codemagic.yaml');
  const khai = [...cm.matchAll(/^\s*XCODE_SCHEME:\s*(\S+)/gm)].map((m) => m[1]);
  expect(khai.length).toBeGreaterThan(0);
  expect([...new Set(khai)]).toEqual([TEN]);

  const ff = doc('ios/fastlane/Fastfile');
  for (const m of ff.matchAll(/workspace:\s*"([^"]+)"/g)) expect(m[1]).toBe(`${TEN}.xcworkspace`);
  for (const m of ff.matchAll(/scheme:\s*"([^"]+)"/g)) expect(m[1]).toBe(TEN);
});

it('không còn chỗ SỐNG nào trỏ vào tên cũ', () => {
  // Chỉ soi các tệp CÓ ĐƯỜNG DẪN THẬT. Tài liệu lịch sử được phép nhắc tên cũ —
  // đó là chỗ nhắc đúng, và xoá đi là xoá mất vết vì sao đổi.
  const song = [
    'app.json',
    'package.json',
    'ios/Podfile',
    'ios/fastlane/Fastfile',
    'codemagic.yaml',
    'ios/SuperApp/AppDelegate.swift',
    'android/app/src/main/java/com/aladincontract/company/MainActivity.kt',
    `ios/${TEN}.xcodeproj/project.pbxproj`,
    `ios/${TEN}.xcodeproj/xcshareddata/xcschemes/${TEN}.xcscheme`,
    `ios/${TEN}.xcworkspace/contents.xcworkspacedata`,
  ];
  expect(song.filter((p) => doc(p).includes('aladin_mobile_fe'))).toEqual([]);
});
