/**
 * Cổng nguồn: màn KHÔNG có thanh tiêu đề của navigator phải TỰ chừa lề trên.
 *
 * ── Đo được trên máy, không phải suy ra ─────────────────────────────────────
 * Mở CheckFarm trên giả lập iPhone 17 (12/09/2026), vào Điều khoản & Chính sách:
 * nút Quay lại nằm LỌT trong vùng thanh trạng thái, đè lên đồng hồ. Và nó không
 * chỉ xấu — chạm vào đó bị hệ điều hành nuốt thành thao tác "cuộn lên đầu", nên
 * nút vẫn vẽ ra, vẫn trông bấm được, mà không lùi được. Lối ra duy nhất còn lại
 * là cử chỉ vuốt mép, thứ không có gì trên màn nói tới.
 *
 * Nguyên nhân: màn khai `headerShown: false`, tức không ai chừa lề hộ nó, mà
 * `scrollContent` thì chỉ có `paddingTop: 16` tính từ mép trên màn hình.
 *
 * ── Vì sao lấy số từ `useSafeAreaInsets` chứ không gõ một hằng ──────────────
 * Chiều cao vùng thanh trạng thái khác nhau theo máy (tai thỏ, viên thuốc, máy
 * không tai). Một hằng `44` đúng trên máy người viết và sai trên máy người dùng,
 * và sai theo chiều không ai thấy cho tới khi cầm đúng cái máy đó.
 *
 * ── Bài này KHÔNG đo gì ─────────────────────────────────────────────────────
 * Nó không chứng minh mọi màn khác đã chừa lề đúng. Quét thô cho thấy hơn ba
 * chục tệp màn không nhắc `useSafeAreaInsets` hay `SafeAreaView`, nhưng phần lớn
 * trong số đó dùng thanh tiêu đề dùng chung hoặc nằm trong một màn cha đã chừa —
 * nên danh sách ấy là danh sách CẦN MỞ TỪNG CÁI trên máy, không phải danh sách lỗi.
 * Khẳng định "màn X hỏng" chỉ hợp lệ sau khi mở màn X trên thiết bị.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
// `core.autocrlf=true` (xem `.gitattributes`).
const SRC = readFileSync(join(__dirname, 'TermsScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Điều khoản & Chính sách — lề trên', () => {
  it('lấy lề an toàn từ thiết bị', () => {
    expect(SRC).toContain("import { useSafeAreaInsets } from 'react-native-safe-area-context'");
    expect(SRC).toContain('const insets = useSafeAreaInsets();');
  });

  it('rót lề đó vào đúng chỗ đầu nội dung cuộn', () => {
    expect(SRC).toContain('paddingTop: insets.top + 16');
  });

  /**
   * Chốt này là chốt dễ mất nhất: ai đó dọn dẹp style, thấy hai chỗ cùng khai
   * `paddingTop`, bỏ chỗ động và giữ chỗ tĩnh — và lỗi quay lại y nguyên, im lặng.
   */
  it('không quay về một con số gõ cứng cho lề trên', () => {
    // `scrollContent` vẫn được phép có `paddingTop` làm giá trị nền, nhưng lời
    // gọi phải truyền mảng style để giá trị động đè lên.
    expect(SRC).toMatch(/contentContainerStyle=\{\[styles\.scrollContent,/);
  });
});
