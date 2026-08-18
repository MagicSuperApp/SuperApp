/**
 * Danh sách trang web app được phép mở TRONG app (WebView), và phép kiểm địa chỉ.
 *
 * Vì sao tách khỏi màn: `originWhitelist` của `react-native-webview` chỉ chặn lúc
 * TẢI, còn quyết định "địa chỉ này có phải nhà mình không" là logic thuần — tách ra
 * thì kiểm được bằng bài test, và chỗ nào cũng hỏi CÙNG một hàm.
 *
 * Quy tắc: KHÔNG so khớp theo phần đuôi. `aladin.work.evil.com` có đuôi trùng
 * `aladin.work` mà là máy chủ của kẻ khác; `https://aladin.work@evil.com/` có chữ
 * `aladin.work` nằm ở phần người dùng, máy thật là `evil.com`. Cả hai đều phải trượt.
 * Chỉ nhận đúng tên máy nằm trong bảng, đúng giao thức `https`.
 */

/** Trang chủ Aladin — đích mặc định của mục "Tìm hiểu thêm". */
export const ALADIN_WEB_URL = 'https://aladin.work/';

/** Tên máy được phép mở trong app. Thêm dòng ở đây, đừng nới lỏng phép kiểm. */
const ALLOWED_HOSTS: readonly string[] = ['aladin.work', 'www.aladin.work'];

/**
 * Tách giao thức + tên máy. Tự cắt thay vì dùng `URL`: bản `URL` của React Native
 * là bản vá thiếu, có phiên bản trả về tên máy sai — mà đây đúng là chỗ sai một
 * lần là mở trang lạ trong khung có cầu nối JavaScript.
 */
function parseSchemeHost(url: string): { scheme: string; host: string } | null {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/.exec(url.trim());
  if (!m) return null;
  const authority = m[2];
  // `user@host` — phần trước `@` KHÔNG phải máy chủ. Không cố đoán, gạt thẳng.
  if (authority.includes('@')) return null;
  // Bỏ cổng. IPv6 (`[::1]:80`) cũng rơi vào đây và không khớp bảng nên vẫn trượt.
  const host = authority.replace(/:\d*$/, '').toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  return { scheme: m[1].toLowerCase(), host };
}

/** Địa chỉ này có được mở TRONG app không. Mọi thứ khác mở bằng trình duyệt ngoài. */
export function isAllowedWebUrl(url: string): boolean {
  const p = parseSchemeHost(url);
  if (!p) return false;
  if (p.scheme !== 'https') return false;
  return ALLOWED_HOSTS.includes(p.host);
}
