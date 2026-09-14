/**
 * Cổng nguồn cho CHỖ CHỪA dưới thanh hành động nổi ở đáy màn chi tiết vườn.
 *
 * ⛔ Lỗi được báo từ thực địa, đây là bài kiểm dựng RA TỪ nó: thanh ba nút
 *    ("Xem sơ đồ 3D của vườn" · nút chỉ đường · "Cập nhật hoạt động") che mất
 *    đuôi danh sách cây và khối "Dòng thời gian".
 *
 * Gốc rễ là MỘT con số. Thanh đó `position: 'absolute'` nên nó không chiếm chỗ
 * trong dòng chảy; phần chừa chỗ cho nó là một ô rỗng ở cuối `ListFooterComponent`,
 * và ô đó từng gõ cứng `height: 86` kèm chú thích "(2 nút)". Thanh nay có HAI
 * HÀNG, cao ≈ 144 trên Android và ≈ 156 trên iOS:
 *
 *     12 (đệm trên) + 46 (hàng 1) + 10 (lề) + 52 (hàng 2) + 24|36 (đệm dưới)
 *
 * Thiếu 58-70 điểm, và đó đúng bằng phần bị che.
 *
 * ── Vì sao con số gõ tay ở chỗ này là một cái bẫy, không chỉ là một số sai ──
 * Nó hỏng theo kiểu KHÔNG có triệu chứng ở phía người sửa: thêm một nút vào
 * thanh là ô chừa sai thêm chừng ấy, mà không lệnh nào đỏ, không bài kiểm nào
 * kêu, ảnh chụp màn hình trong PR vẫn đẹp vì người chụp không cuộn xuống đáy.
 * Chỉ người dùng ngoài vườn thấy nội dung cụt. Nên bài này ghim CÁCH ĐO, không
 * ghim một con số đúng — ghim con số là dựng lại đúng cái bẫy vừa gỡ.
 *
 * ── Bài này đo GÌ, và KHÔNG đo gì ───────────────────────────────────────────
 * Đo MÃ NGUỒN, cùng khuôn với `FarmDetailScreen.rename.gate.test.ts` bên cạnh
 * và vì cùng lý do: dựng cả `FarmDetailScreen` (hơn 3.000 dòng, kéo theo bản
 * đồ + máy ảnh + native) trong jest là việc khác hẳn về giá.
 *
 * Nó bắt được ca "ai đó gỡ phép đo đi", KHÔNG bắt được ca "đo rồi mà vẫn che"
 * — ví dụ thanh bị bọc thêm một lớp có lề riêng nằm ngoài chỗ đang đo. Phép đo
 * cuối cho ca đó là mở màn hình thật và cuộn xuống đáy.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
// `core.autocrlf=true` (xem `.gitattributes`).
const SRC = readFileSync(join(__dirname, 'FarmDetailScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('chỗ chừa dưới thanh đáy phải theo chiều cao ĐO ĐƯỢC', () => {
  it('ô chừa chỗ đọc chiều cao đã đo, không gõ một con số', () => {
    expect(SRC).toContain('height: chieuCaoThanhDay || CHUA_DO_THANH_DAY');
    // Đúng cái dòng đã gây ra lỗi này. Có lại nó là quay về nguyên trạng.
    expect(SRC).not.toContain('<View style={{ height: 86 }} />');
  });

  it('thanh đáy thật sự được ĐO — `onLayout` còn nối vào state', () => {
    // Thiếu vế này thì `chieuCaoThanhDay` đứng yên ở 0, ô chừa rơi về cận trên
    // dự phòng và ở đó mãi mãi: không sai màn hình, nhưng phép đo đã chết mà
    // không ai biết.
    const bar = SRC.indexOf('{/* Bottom action bar */}');
    expect(bar).toBeGreaterThan(-1);
    const khoi = SRC.slice(bar, bar + 700);
    expect(khoi).toContain('style={styles.bottomBar}');
    expect(khoi).toContain('onLayout=');
    expect(khoi).toContain('setChieuCaoThanhDay(');
    expect(khoi).toContain('e.nativeEvent.layout.height');
  });

  it('cận trên dự phòng KHÔNG được thấp hơn chiều cao thật lớn nhất', () => {
    // Nó chỉ sống một khung hình, nên ai đó rất dễ "dọn cho gọn" xuống lại 86 —
    // và khung đầu tiên sẽ che nội dung y như cũ trên máy chậm. 156 là chiều
    // cao iOS tính ở khối chú thích đầu tệp; lấy dư là đúng, lấy thiếu là lỗi.
    const khop = SRC.match(/const CHUA_DO_THANH_DAY = (\d+);/);
    expect(khop).not.toBeNull();
    expect(Number(khop![1])).toBeGreaterThanOrEqual(156);
  });

  it('thanh vẫn NỔI — nếu hết nổi thì ô chừa thành khoảng trắng thừa', () => {
    // Hai thứ này buộc vào nhau: ô chừa chỉ đúng chừng nào thanh còn nằm ngoài
    // dòng chảy. Ai bỏ `absolute` mà quên bỏ ô chừa thì đáy dôi ra một khoảng
    // trắng bằng đúng chiều cao thanh — sai theo chiều ngược lại, cũng im lặng.
    const i = SRC.indexOf('bottomBar: {');
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 200)).toContain("position: 'absolute'");
  });
});
