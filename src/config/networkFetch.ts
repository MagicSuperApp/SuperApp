/**
 * networkFetch — TRẢ `fetch` VỀ BẢN CỦA REACT NATIVE.
 *
 * Nạp ĐẦU TIÊN ở `index.js`, trước mọi thứ khác chạm tới mạng.
 *
 * ══ CHUYỆN GÌ ĐÃ XẢY RA ═══════════════════════════════════════════════════
 * Triệu chứng: chụp quả xong thì nổ
 *   `ReferenceError: Property 'ReadableStream' doesn't exist`
 *
 * Đường đi của lỗi, đo trên chính cây `node_modules` này:
 *
 * 1. `metro.config.js` dùng `expo/metro-config` (bắt buộc — `export:embed` cần
 *    serializer của expo). Cấu hình đó khai `getModulesRunBeforeMainModule`, và
 *    danh sách trả về gồm **`expo/src/winter/index.ts`** — tức mã của expo chạy
 *    TRƯỚC `index.js`, dù không tệp nào trong `src/` import `expo`.
 *
 * 2. `expo/src/winter/runtime.native.ts` **thay `globalThis.fetch`** bằng
 *    `expo/fetch`, trừ khi `process.env.EXPO_PUBLIC_USE_RN_FETCH === '1'`.
 *    Biến đó ở đây LUÔN `undefined`: nó chỉ được nội-suy lúc dịch bởi
 *    `babel-preset-expo`, mà `babel.config.js` của dự án cố ý giữ
 *    `@react-native/babel-preset` (bare RN). Nên nhánh thay fetch luôn chạy.
 *
 * 3. `expo/fetch` chuẩn hoá thân yêu cầu ở `winter/fetch/RequestUtils.ts`, và
 *    dòng 83 là `if (body instanceof ReadableStream)` — **tham chiếu trần** tới
 *    một global mà Hermes KHÔNG có. Chính expo ghi trong `runtime.native.ts`:
 *    "ReadableStream is injected by Metro as a global" — nhưng bộ polyfill thật
 *    sự nạp ở đây là `@react-native/js-polyfills`, và nó chỉ có `console` với
 *    `error-guard`. Không có `ReadableStream` ⇒ ReferenceError.
 *
 * 4. Nhánh đó nằm **TRƯỚC** nhánh `FormData`. Nên MỌI yêu cầu có thân FormData
 *    đều nổ trước khi kịp tới phần xử lý FormData — không riêng màn quét: đăng
 *    ký cây, đăng ký quả, tạo vườn, tải clip… đều đi cùng một cửa.
 *
 * ══ VÌ SAO KHÔNG POLYFILL `ReadableStream` CHO XONG ═══════════════════════
 * Vì vá được lỗi này thì lộ ra lỗi nặng hơn ngay sau đó. Chính tệp
 * `winter/fetch/convertFormData.ts` ghi ở đầu hàm:
 *
 *     "`uri` is not supported for React Native's FormData."
 *
 * Mà toàn bộ app đính tệp theo đúng kiểu RN — `{ uri, type, name }` (xem
 * `_appendImageRegion` ở `fruitReIDService`, `lookupFruit` ở
 * `fruitLookupService`, luồng clip ở `videoUploadQueue`…). Cho `expo/fetch`
 * dựng thân multipart nghĩa là nó ghi vào phần thân một OBJECT thay vì BYTE của
 * tấm ảnh: yêu cầu đi được, máy chủ nhận 200, và ảnh thì rỗng. Hỏng-mà-không-ai-
 * báo, tệ hơn hẳn một ReferenceError nổ thẳng vào mặt.
 *
 * `fetch` của React Native thì đẩy `FormData` xuống tầng mạng NATIVE, nơi
 * `{uri}` được đọc thành tệp thật. Đó là bản mà mọi service trong repo này được
 * viết dựa trên, và là bản đã chạy ngoài thực địa.
 *
 * ══ CÁI GIÁ ═══════════════════════════════════════════════════════════════
 * Bỏ `expo/fetch` là bỏ khả năng đọc thân trả về theo dòng (streaming). App này
 * không có chỗ nào đọc theo dòng — mọi cửa đều `resp.json()`. Đổi lại là các
 * lượt tải tệp lên chạy đúng. Ngày nào cần streaming thật thì gọi thẳng
 * `import { fetch } from 'expo/fetch'` ở đúng chỗ đó, đừng đổi global lại.
 */

/**
 * Dấu expo đóng lên mọi global nó cài (`installGlobal.ts:15`).
 *
 * Đọc DẤU chứ không đoán theo tên hàm: tên hàm đổi theo bản, dấu thì là hợp đồng
 * expo tự khai ("this can be used to detect if the global object abides by the
 * Expo team's documented built-in requirements").
 */
const EXPO_BUILTIN = Symbol.for('expo.builtin');

function isExpoFetch(fn: unknown): boolean {
  if (typeof fn !== 'function') return false;
  return (fn as unknown as Record<symbol, unknown>)[EXPO_BUILTIN] === true;
}

/**
 * Có cần trả `fetch` về bản RN không.
 *
 * Tách ra để test được: `true` khi global hiện tại là bản của expo. Bản RN (hoặc
 * một bản nào khác đã được ai đó cố ý cài) thì để yên — tệp này chỉ sửa đúng một
 * chuyện, không giành quyền quản `fetch`.
 */
export function shouldRestoreRnFetch(currentFetch: unknown): boolean {
  return isExpoFetch(currentFetch);
}

/**
 * Đặt lại bốn global mạng về bản `whatwg-fetch` mà React Native vẫn dùng
 * (`Libraries/Core/setUpXHR.js` cài đúng bốn cái này).
 *
 * Đặt cả bốn chứ không riêng `fetch`: bên trong `whatwg-fetch` có những phép
 * `instanceof Headers` / `instanceof Request`. Trộn `fetch` của bản này với
 * `Headers` của bản kia là dựng một cái bẫy cho người sửa lỗi sau.
 */
function install(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const rn = require('whatwg-fetch') as Record<string, unknown>;
  for (const name of ['fetch', 'Headers', 'Request', 'Response'] as const) {
    const value = rn[name];
    if (typeof value !== 'function') continue;
    try {
      Object.defineProperty(g, name, {
        value,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch {
      // Thuộc tính bị khoá (không `configurable`) → thử gán thẳng. Gán hỏng nốt
      // thì thôi: một `fetch` cũ vẫn hơn một app không khởi động được.
      try { g[name] = value; } catch { /* đành chịu */ }
    }
  }
}

/**
 * Chạy ngay lúc nạp module. KHÔNG ném — hỏng ở đây mà chặn app khởi động thì đắt
 * hơn nhiều so với chính lỗi đang vá.
 */
export function restoreRnFetch(): boolean {
  try {
    if (!shouldRestoreRnFetch((globalThis as { fetch?: unknown }).fetch)) return false;
    install();
    return true;
  } catch {
    return false;
  }
}

restoreRnFetch();
