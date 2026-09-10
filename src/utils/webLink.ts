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

import { DEFAULT_INSTANCE } from '../config/instance.config';

/**
 * Trang chủ của APP ĐANG DỰNG — đích của mục "Tìm hiểu thêm". `null` = app này
 * chưa có trang web, và lúc đó mục ấy KHÔNG hiện (`OnboardingScreen`).
 *
 * Trước 2026-09-10 đây là hằng `ALADIN_WEB_URL = 'https://aladin.work/'`, dùng
 * chung cho mọi app. Nên trong app CheckFarm, "Tìm hiểu thêm" mở trang chủ của
 * một doanh nghiệp khác — và mở NGAY TRONG app, trong khung có cầu nối
 * JavaScript, vì `ALLOWED_HOSTS` cũng viết cứng đúng tên máy đó.
 *
 * Để `null` thay vì mượn tạm trang của app khác: cùng luật với `address: null`
 * ở `OperatorInfo` — chưa có thì khai là chưa có, bịa ra một cái còn tệ hơn để
 * trống.
 */
export const APP_WEB_URL: string | null = DEFAULT_INSTANCE.website?.url ?? null;

/**
 * Tên máy được phép mở TRONG app. Lấy từ lời khai instance — thêm ở
 * `instances/<mã>` chứ không thêm ở đây, và đừng nới lỏng phép kiểm.
 *
 * App chưa khai trang web thì bảng RỖNG, tức `isAllowedWebUrl` trượt mọi địa
 * chỉ và không gì mở được trong khung nhúng. Đó là chiều đúng để rơi.
 */
const ALLOWED_HOSTS: readonly string[] = DEFAULT_INSTANCE.website?.hosts ?? [];

/**
 * Cùng bảng trên, ở dạng `react-native-webview` đòi (`originWhitelist`).
 *
 * SINH ra từ `ALLOWED_HOSTS` chứ không gõ lại. Tới 2026-09-10 `WebPageScreen`
 * gõ cứng `['https://aladin.work', 'https://www.aladin.work']` ngay cạnh dòng
 * gọi `isAllowedWebUrl` — hai bảng cho cùng một sự thật, không bảng nào trỏ về
 * bảng nào. Chúng chưa lệch chỉ vì cả hai cùng viết cứng một tên máy.
 *
 * Ngày CheckFarm khai trang web, `isAllowedWebUrl` cho qua tên máy của họ còn
 * bảng gõ tay thì không ⟹ `react-native-webview` đẩy CHÍNH trang nhà họ sang
 * trình duyệt ngoài. Không lỗi, không đỏ, chỉ là app đối xử với nhà mình như
 * với người lạ.
 *
 * Rỗng khi app chưa khai trang web — `originWhitelist` rỗng nghĩa là khung
 * nhúng không nhận nguồn nào, đúng chiều đã chọn ở `InstanceConfig.website`.
 */
export const ALLOWED_WEB_ORIGINS: string[] = ALLOWED_HOSTS.map((h) => `https://${h}`);

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
