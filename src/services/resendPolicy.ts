// services/resendPolicy.ts
//
// GỬI LẠI SAU LỖI MẠNG — CỬA NÀO ĐƯỢC, CỬA NÀO KHÔNG.
//
// ══ Lỗi đang vá ═══════════════════════════════════════════════════════════════
// Năm client OriLife (`farmService`, `treeReIDService`, `fruitReIDService`,
// `animalReIDService`, `careService`) đều có cùng một khối:
//
//     if (isConnErr && attempt === 0) return _apiCall(url, method, body, 1);
//
// Khối đó gửi lại MỌI cửa, kể cả cửa TẠO. Và nó gửi lại MÙ: không cửa tạo nào của
// OriLife nhận khoá chống-trùng do app cấp (`client_event_id` chỉ có ở một cửa
// video quả).
//
// Vì sao mù là hỏng: `fetch` của React Native ném `TypeError: Network request
// failed` cho CẢ hai ca — gói CHƯA đi tới máy chủ, và gói ĐÃ tới nhưng câu trả lời
// rơi giữa đường. App không phân biệt được. Đứng ngoài vườn sóng 3G bấm "Lưu vườn":
// máy chủ đã sinh xong một `uuid4` và ghi vườn, câu trả lời rơi, app gửi lại ⇒ HAI
// vườn cùng tên cùng ranh, không cửa nào khử. Với `/api/enroll` thì máy chủ có chốt
// trùng nên lượt hai trả 409, app bật hộp thoại "Trùng cây đã có" kèm nút "Tạo cây
// mới" — người dùng biết mình chỉ đăng ký MỘT cây nên bấm nút đó, và thành HAI hồ sơ
// cho một gốc cây. Ảnh chia đôi vào hai bản ghi ⇒ không bản nào đủ góc để dựng 3D.
//
// ══ Luật ══════════════════════════════════════════════════════════════════════
// GET và DELETE: gửi lại được (đọc, hoặc xoá cùng một thứ hai lần vẫn ra một kết
// quả). POST: **mặc định KHÔNG**, phải có tên trong danh sách trắng của client đó.
//
// Mặc định nghiêng về phía KHÔNG gửi lại là có chủ ý. Quên khai một cửa đọc thì
// mất một lượt tự thử — người dùng bấm lại là xong. Quên khai theo chiều ngược lại
// thì sinh một thực thể thừa vĩnh viễn. Hai cái giá đó không cùng hạng.
//
// ══ Cái này KHÔNG giải quyết ══════════════════════════════════════════════════
// Nó chỉ bỏ lượt gửi lại TỰ ĐỘNG. Người dùng bấm "Thử lại" sau một lượt tạo rơi
// giữa đường thì vẫn sinh trùng y như cũ. Đường sửa tận gốc là khoá chống-trùng do
// app cấp mà máy chủ tôn trọng ở cửa tạo — việc đó nằm ở phía OriLife, đã báo.

/** Đường dẫn của URL, bỏ host và query. `''` khi không đọc được. */
export function pathOf(url: string): string {
  const noHost = (url ?? '').trim().replace(/^https?:\/\/[^/]*/i, '');
  const cut = noHost.split(/[?#]/)[0];
  return cut.startsWith('/') ? cut.replace(/\/+$/, '') || '/' : '';
}

/**
 * Lượt gọi này có gửi lại được sau lỗi mạng không.
 *
 * `safePosts` nhận đường dẫn ĐÚNG NGUYÊN (`/api/rename`) hoặc tiền tố kết thúc
 * bằng `/*` (`/api/build3d/*`) cho cửa mang mã trong đường dẫn.
 */
export function canResendAfterNetworkError(
  url: string,
  method: string,
  safePosts: readonly string[],
): boolean {
  const m = (method ?? '').toUpperCase();
  if (m !== 'POST') return true;

  const path = pathOf(url);
  if (!path) return false;   // không đọc được đường dẫn ⇒ không đoán, không gửi lại

  return safePosts.some((rule) => {
    if (rule.endsWith('/*')) {
      const prefix = rule.slice(0, -1);         // giữ dấu `/` cuối
      return path.startsWith(prefix) && path.length > prefix.length;
    }
    return path === rule;
  });
}
