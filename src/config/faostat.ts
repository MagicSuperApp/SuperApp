/**
 * config/faostat — CHỖ CẮM tài khoản FAOSTAT.
 *
 * ── Vì sao token KHÔNG nằm trong tệp này ────────────────────────────────────
 * Token FAOSTAT là **access token của Cognito, sống đúng 60 phút** (đã đọc phần
 * `exp` của token thật: cấp 03:18, hết hạn 04:18 cùng ngày). Nhúng nó vào mã có
 * hai cái sai, và cái nào cũng đủ để không làm:
 *
 *   1. Một giờ sau là hỏng. Bản dựng phát hành ra người dùng sẽ mang theo một
 *      chuỗi đã chết, và mục giá thế giới im lặng trống trơn.
 *   2. Mã nguồn di động là mã CÔNG KHAI. Ai cũng giải nén được APK; token nhúng
 *      trong đó coi như đã đăng lên mạng.
 *
 * ── Vậy làm thế nào cho đúng ────────────────────────────────────────────────
 * Chọn một trong hai, và cả hai đều nằm NGOÀI app:
 *
 *   A. **Máy chủ trung gian** (nên chọn). Backend giữ tài khoản FAOSTAT, tự làm
 *      mới token mỗi giờ, và mở một đường cho app gọi. App không biết token nào
 *      cả. Đây cũng là cách duy nhất chịu được khi FAO đổi cách xác thực.
 *   B. **Luồng đăng nhập trong app** — app tự lấy token bằng tài khoản người
 *      dùng và tự làm mới. Nặng hơn nhiều, và vẫn phải giấu client secret.
 *
 * Trong lúc chờ, đặt token vào đây khi chạy thử ở máy mình — nhưng ĐỪNG commit.
 * `null` thì mục giá ngoài nước hiện "chưa nối nguồn", không gọi mạng lần nào.
 */

/**
 * Token FAOSTAT. `null` = chưa nối.
 *
 * KHÔNG commit token thật vào đây. Chạy thử tại máy thì gán tạm rồi hoàn nguyên
 * trước khi tạo commit.
 */
export const FAOSTAT_TOKEN: string | null = null;
