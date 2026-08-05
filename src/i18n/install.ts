// i18n/install.ts
//
// CÀI LỚP DỊCH — phải chạy TRƯỚC khi bất kỳ component nào vẽ lần đầu.
// Điểm gọi: `index.js` (ngay sau crashReporter, trước khi require('./App')).
//
// Kỹ thuật: `react-native/index.js` khai các component bằng GETTER trên
// module.exports (`get Text() { return require(...).default }`). Getter của
// object literal là configurable → ghi đè được bằng Object.defineProperty.
// Babel dịch `import { Text } from 'react-native'` thành `_reactNative.Text`
// TẠI CHỖ DÙNG (giữ live-binding của ESM) nên sau khi ghi đè, MỌI file trong app
// và trong node_modules đều nhận bản đã bọc — không phải sửa file nào.
//
// Nếu bản React Native tương lai đổi cách khai (getter non-configurable, hoặc
// đóng băng module.exports) thì defineProperty ném → bắt lại, cảnh báo ở DEV và
// app chạy tiếp bằng tiếng Việt (mất dịch tự động, KHÔNG sập). Khi đó cần chuyển
// sang bọc thủ công hoặc alias module trong metro.config.js.

import { makeAutoText, makeAutoTextInput } from './autoText';
import { hydrateLanguage } from './store';

// CỐ Ý dùng require, KHÔNG dùng `import * as RN`: Babel bọc namespace-import của
// module CommonJS qua `_interopRequireWildcard`, trả về một BẢN SAO — ghi đè lên
// bản sao đó thì mọi file khác vẫn nhận Text gốc. `require` trả đúng
// `module.exports` thật của react-native.
const RN: Record<string, unknown> = require('react-native');

let installed = false;

function patch(name: 'Text' | 'TextInput', make: (c: any) => any): boolean {
  const target = RN;
  try {
    // Đọc giá trị GỐC qua getter hiện tại (kích hoạt require lười của RN).
    const original = target[name];
    if (typeof original !== 'function' && typeof original !== 'object') return false;
    const wrapped = make(original);
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: true,
      get: () => wrapped,
    });
    return true;
  } catch (e) {
    if (__DEV__) {
      console.warn(`[i18n] Không bọc được ${name} — app chạy tiếng Việt:`, e);
    }
    return false;
  }
}

/** Cài lớp dịch + nạp ngôn ngữ đã lưu. An toàn khi gọi nhiều lần. */
export function installI18n(): void {
  if (installed) return;
  installed = true;
  patch('Text', makeAutoText);
  patch('TextInput', makeAutoTextInput);
  // Fire-and-forget: đọc xong sẽ notify → mọi Text tự vẽ lại đúng ngôn ngữ.
  // (Điều hướng gốc chờ đúng promise này qua `whenLanguageReady()`.)
  hydrateLanguage();
}
