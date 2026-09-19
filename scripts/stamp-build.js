/**
 * Ghi dấu mã nguồn đang được dựng vào `src/generated/buildStamp.ts`.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────────
 *
 * Dòng phiên bản ở đáy màn đăng nhập từng in `v1.0 (62)`. Con số 62 là
 * `CURRENT_PROJECT_VERSION` gõ cứng trong `ios/SuperApp.xcodeproj/project.pbxproj`,
 * và nó ĐỨNG YÊN — bước `-exportArchive` của CI mới là chỗ đặt số thật (luật
 * "cao nhất trên App Store Connect + 1"), nên các bản trên TestFlight mang 70/71
 * trong khi mọi bản dựng ở máy vẫn nói 62.
 *
 * Hệ quả là con số ấy **không đo được gì**: nó không nói bản dựng nào trên cửa
 * hàng, cũng không nói mã nào đang chạy. Người thử báo lỗi kèm "(62)" thì không
 * ai truy ngược ra được họ đang chạy commit nào — đúng cái lỗi mà chú thích ở
 * `LoginNetworkScreen.tsx` nói là đã gỡ một lần rồi.
 *
 * ── Cái khó, và cách xử ─────────────────────────────────────────────────────
 *
 * Tệp sinh ra PHẢI có mặt trong kho, vì trình đóng gói nạp nó lúc dựng và không
 * có nó thì dựng đỏ. Nhưng một tệp nằm trong kho thì nó sẽ CŨ ở mọi lượt chưa
 * chạy lại script này. Nên giá trị mặc định KHÔNG được là một mã commit thật —
 * một mã commit cũ trông y hệt một mã commit đúng, và đó lại là đúng cái bệnh
 * đang chữa. Mặc định là chuỗi tự khai `'chưa dán'`, và màn hình in nguyên chữ
 * đó. Xấu thì có xấu, nhưng nó nói thật, và nó KÊU — người nhìn thấy sẽ đi hỏi,
 * còn một con số sai thì không ai hỏi gì cả.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const thuMuc = path.join(__dirname, '..', 'src', 'generated');
const tep = path.join(thuMuc, 'buildStamp.ts');

function chay(lenh) {
  try {
    return execSync(lenh, { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return '';
  }
}

// Dựng từ bản tải về dạng nén (CI đôi khi làm thế) thì không có kho git. Đó là
// ca hợp lệ, không phải lỗi — nhưng nó phải ra chuỗi tự khai, không ra chuỗi rỗng.
const sha = chay('git rev-parse --short=7 HEAD') || 'khong-co-kho-git';
const ban = chay('git rev-parse --abbrev-ref HEAD') || '';
const ban_ = ban === 'HEAD' ? '' : ban;
// Cây làm việc bẩn thì mã commit KHÔNG mô tả đủ thứ đang chạy. Dấu `+` nói ra
// điều đó, thay vì để người đọc tưởng mình đang chạy đúng commit ấy.
const ban_do = chay('git status --porcelain') ? '+' : '';

const noiDung = `// TỆP SINH TỰ ĐỘNG — đừng sửa tay. Nguồn: scripts/stamp-build.js
// Chạy lại: npm run stamp
export const BUILD_STAMP = ${JSON.stringify(sha + ban_do)};
export const BUILD_BRANCH = ${JSON.stringify(ban_)};
export const BUILD_AT = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
`;

fs.mkdirSync(thuMuc, { recursive: true });
fs.writeFileSync(tep, noiDung);
console.log(`[stamp-build] ${sha}${ban_do}${ban_ ? ` (${ban_})` : ''}`);
