/**
 * Khoá lại cách nhận diện `fetch` của expo.
 *
 * Bài kiểm này canh MỘT chuyện: app phải nhận ra global nào là của expo và trả
 * `fetch` về bản React Native, vì bản expo (a) tham chiếu `ReadableStream` —
 * global Hermes không có — trước cả nhánh FormData, và (b) không đọc được tệp
 * kiểu `{uri}` của RN. Xem đầu `networkFetch.ts` cho đường đi đầy đủ.
 */
import { restoreRnFetch, shouldRestoreRnFetch } from './networkFetch';

/** Dấu expo đóng lên mọi global nó cài (`expo/src/winter/installGlobal.ts`). */
const EXPO_BUILTIN = Symbol.for('expo.builtin');

const markExpo = <T extends object>(fn: T): T => {
  Object.defineProperty(fn, EXPO_BUILTIN, { value: true, enumerable: false });
  return fn;
};

describe('shouldRestoreRnFetch', () => {
  it('nhận ra fetch của expo qua DẤU nó tự đóng, không đoán theo tên hàm', () => {
    expect(shouldRestoreRnFetch(markExpo(function expoFetch() { }))).toBe(true);
  });

  it('fetch nào không mang dấu thì ĐỂ YÊN — tệp này không giành quyền quản fetch', () => {
    // Bản RN, hoặc một bản ai đó cố ý cài (bộ giả lập test, công cụ ghi log…).
    expect(shouldRestoreRnFetch(function rnFetch() { })).toBe(false);
    // Tên trùng cũng không đủ: dấu mới là bằng chứng.
    expect(shouldRestoreRnFetch(function expoFetch() { })).toBe(false);
  });

  it('không có fetch / không phải hàm → không làm gì', () => {
    expect(shouldRestoreRnFetch(undefined)).toBe(false);
    expect(shouldRestoreRnFetch(null)).toBe(false);
    expect(shouldRestoreRnFetch({})).toBe(false);
    expect(shouldRestoreRnFetch('fetch')).toBe(false);
  });
});

describe('restoreRnFetch', () => {
  const saved = {
    fetch: globalThis.fetch,
    Headers: globalThis.Headers,
    Request: globalThis.Request,
    Response: globalThis.Response,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      Object.defineProperty(globalThis, k, {
        value: v, writable: true, configurable: true, enumerable: false,
      });
    }
  });

  it('đang là fetch expo → thay bằng bản whatwg của React Native', () => {
    const expoFetch = markExpo(function expoFetch() { });
    (globalThis as any).fetch = expoFetch;

    expect(restoreRnFetch()).toBe(true);
    expect(globalThis.fetch).not.toBe(expoFetch);
    expect(typeof globalThis.fetch).toBe('function');
    // Bản thay vào KHÔNG được mang dấu expo — nếu còn thì ta vừa cài lại chính nó.
    expect(shouldRestoreRnFetch(globalThis.fetch)).toBe(false);
  });

  it('thay CẢ BỐN global mạng, không trộn bản này với bản kia', () => {
    (globalThis as any).fetch = markExpo(function expoFetch() { });
    restoreRnFetch();
    // Cùng một nguồn `whatwg-fetch` → bốn thứ khớp nhau. Trộn hai bản là dựng bẫy
    // cho phép `instanceof Headers` bên trong thư viện.
    const wf = require('whatwg-fetch');
    expect(globalThis.fetch).toBe(wf.fetch);
    expect(globalThis.Headers).toBe(wf.Headers);
    expect(globalThis.Request).toBe(wf.Request);
    expect(globalThis.Response).toBe(wf.Response);
  });

  it('không phải fetch expo → KHÔNG đụng gì', () => {
    const mine = function myFetch() { };
    (globalThis as any).fetch = mine;
    expect(restoreRnFetch()).toBe(false);
    expect(globalThis.fetch).toBe(mine);
  });

  it('không ném dù đọc global cũng nổ — hỏng ở đây không được chặn app khởi động', () => {
    // Ca thật: `fetch` là một getter lười, và getter đó ném (mô-đun native thiếu,
    // bản signed lỗi…). Tệp này phải nuốt, không được kéo cả app xuống.
    Object.defineProperty(globalThis, 'fetch', {
      get() { throw new Error('lazy getter nổ'); },
      configurable: true,
    });
    expect(() => restoreRnFetch()).not.toThrow();
    expect(restoreRnFetch()).toBe(false);
  });
});
