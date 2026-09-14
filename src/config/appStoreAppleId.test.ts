/**
 * Số Apple ID phải đi theo TỪNG ỨNG DỤNG — phép canh cho `APP_STORE_APPLE_ID`.
 *
 * ── Đường hỏng bài này canh ─────────────────────────────────────────────────
 * Bước "Bump build number (TestFlight latest + 1)" nằm trong khối `scripts` DÙNG
 * CHUNG (`&ios_release_scripts`), và nó đọc `$APP_STORE_APPLE_ID`. Ba luồng iOS
 * đều dùng lại khối ấy. Nhưng số Apple ID là của TỪNG ứng dụng, không phải của
 * đội — nên một biến toàn cục nghĩa là mọi luồng hỏi số build của cùng một app.
 *
 * Hỏng ở đây KHÔNG kêu, và đó là lý do phải có bài kiểm thay vì một dòng chú
 * thích:
 *
 *   - lệnh hỏi số bọc trong `2>/dev/null || echo ""` ⟹ hỏi sai app, hỏi hụt,
 *     khoá hỏng — cả ba đều ra chuỗi rỗng rồi rơi êm sang nhánh dự phòng;
 *   - Apple nhận MỌI số lớn hơn số đã tải ⟹ lấy nhầm số của app khác (lớn hơn)
 *     thì lượt tải vẫn xanh.
 *
 * Hậu quả chỉ lộ ra dưới dạng: số build của app này bỗng nhảy quãng theo lịch
 * phát hành của một app khác, và không ai đọc ra nguyên nhân từ con số.
 *
 * ── Vì sao KHÔNG canh cả ba luồng ───────────────────────────────────────────
 * Hai luồng Aladin (`ios-appstore`, `ios-production`) hôm nay VẪN dựa vào biến
 * toàn cục — số Apple ID của ứng dụng Aladin chưa ai đo được, và bịa ra một số
 * để bài kiểm xanh thì tệ hơn hẳn việc để nó hở.
 *
 * Nên bài này KHÔNG dựng danh sách miễn trừ. Danh sách miễn trừ làm cổng trông
 * như đã kín trong khi nó đang nhả hai phần ba. Chỗ hở ghi thẳng ở đây, dạng
 * chữ, để người đọc thấy đúng phạm vi:
 *
 *   ⚠ CÒN HỞ: `ios-appstore` và `ios-production` chưa khai `APP_STORE_APPLE_ID`.
 *     Đóng lại bằng đúng một dòng `vars:` cho mỗi luồng, khi ai đó đọc được số
 *     Apple ID của ứng dụng `vn.aladinapp` ở App Store Connect ▸ App Information.
 *     Lúc thêm đủ hai số, đổi bài 1 dưới đây thành vòng lặp trên cả ba luồng.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const CODEMAGIC = readFileSync(join(ROOT, 'codemagic.yaml'), 'utf8').replace(/\r\n/g, '\n');

/** Cắt đúng phần thân của một workflow, để không đọc nhầm sang workflow kế bên. */
function workflowBody(workflow: string): string {
  const start = CODEMAGIC.indexOf(`\n  ${workflow}:\n`);
  expect(start).toBeGreaterThan(-1);
  const rest = CODEMAGIC.slice(start + 1);
  // Workflow kế tiếp bắt đầu bằng đúng hai dấu cách rồi tên rồi dấu hai chấm.
  const next = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

const CHECKFARM_WORKFLOW = 'ios-appstore-checkfarm';
const CHECKFARM_APPLE_ID = '6808575982';

// ---------------------------------------------------------------------------
// 1. Luồng CheckFarm phải TỰ khai số của mình
// ---------------------------------------------------------------------------
describe(`${CHECKFARM_WORKFLOW} khai số Apple ID của chính nó`, () => {
  it('có dòng `APP_STORE_APPLE_ID:` trong `vars:` của luồng này', () => {
    expect(workflowBody(CHECKFARM_WORKFLOW)).toMatch(/^ {8}APP_STORE_APPLE_ID: \d+$/m);
  });

  it('khai đúng số của ứng dụng CheckFarm', () => {
    const declared = workflowBody(CHECKFARM_WORKFLOW).match(
      /^ {8}APP_STORE_APPLE_ID: (\d+)$/m,
    );
    expect(declared?.[1]).toBe(CHECKFARM_APPLE_ID);
  });
});

// ---------------------------------------------------------------------------
// 2. Không luồng nào khác được mang số của CheckFarm
// ---------------------------------------------------------------------------
describe('số của app này không lẫn sang app khác', () => {
  it('chuỗi số CheckFarm chỉ xuất hiện trong luồng CheckFarm', () => {
    // Chép số này sang một luồng Aladin là ca hỏng câm ngược chiều: app Aladin
    // sẽ hỏi số build của CheckFarm. Đếm trên cả tệp rẻ hơn nhiều so với đọc
    // từng luồng, và bắt được cả trường hợp chép vào chú thích rồi quên gỡ.
    const inWholeFile = CODEMAGIC.split(CHECKFARM_APPLE_ID).length - 1;
    const inCheckfarmWorkflow =
      workflowBody(CHECKFARM_WORKFLOW).split(CHECKFARM_APPLE_ID).length - 1;
    expect(inWholeFile).toBe(inCheckfarmWorkflow);
  });
});

// ---------------------------------------------------------------------------
// 3. Tên biến ở hai đầu phải KHỚP — đây là bài canh ca đổi tên một nửa
// ---------------------------------------------------------------------------
describe('lời khai và chỗ đọc gọi cùng một tên', () => {
  it('bước bump build number vẫn đọc đúng `$APP_STORE_APPLE_ID`', () => {
    // Đổi tên biến ở `vars:` mà quên đổi trong `scripts:` (hoặc ngược lại) thì
    // biến thành rỗng, rơi sang nhánh dự phòng, và KHÔNG có gì đỏ. Hai đầu ở
    // cách nhau hơn 200 dòng và thuộc hai khối YAML khác nhau.
    expect(CODEMAGIC).toMatch(
      /get-latest-testflight-build-number "\$APP_STORE_APPLE_ID"/,
    );
  });
});
