/**
 * Báo cáo chỉ được GỬI từ chỗ đọc được nó.
 *
 * ── Chỗ hỏng hai bài đầu canh ───────────────────────────────────────────────────
 * Bản đầu của tính năng này gắn nút "Gửi báo cáo" vào một hộp thoại ở màn Tài khoản, và
 * chú thích tại chỗ khẳng định người dùng *"THẤY toàn văn trước khi gửi"*. Khẳng định đó
 * sai: hộp thoại hiện phần đầu, còn đoạn báo cáo đi thẳng vào `Share.share`. Và
 * `components/AlertPopup.tsx` render thân bằng một `<Text>` trần, không vùng cuộn — nên
 * 40 dòng không thể nằm trong hộp thoại kể cả khi muốn.
 *
 * Vì sao đây không phải chuyện thẩm mỹ: báo cáo chở những câu app đã hiện, và nhiều câu
 * có nội suy tên người thứ ba (người bảo hộ, `@username`, tên cây, tên cá thể), trong khi
 * `telemetryGate.FORBIDDEN_SHAPES` **không có mẫu nào chặn tên người**. Mở khay chia sẻ là
 * gửi ra ngoài — bất khả hồi.
 *
 * Nên bất biến được ghim là: **`buildDiagnosticReport` chỉ được gọi ở nơi có hiện toàn
 * văn.** Đo bằng danh sách tệp nhập nó, không đo bằng câu chữ — một bản sau này dán lại
 * nút gửi vào một hộp thoại khác sẽ phải nhập hàm đó ở tệp mới, và bài dưới đây đỏ.
 */
import fs from 'fs';
import path from 'path';

import { PUBLIC_ROUTES } from '../navigation/authGate';
import { HOST_ROUTES } from '../navigation/hostRoutes';

const SRC = path.join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(p);
  }
  return out;
}

/** Tệp (không phải bài kiểm) nào nhập `buildDiagnosticReport`. */
function noiDungBaoCao(): string[] {
  return walk(SRC)
    .filter(f => /import\s*\{[^}]*buildDiagnosticReport/.test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(SRC, f));
}

describe('đường gửi báo cáo thử thực địa', () => {
  it('CHỈ màn xem trước được dựng báo cáo — không chỗ nào khác', () => {
    const noi = noiDungBaoCao();
    expect(
      noi.length === 1 && noi[0] === 'screens/DiagnosticReportScreen.tsx'
        ? ''
        : `\`buildDiagnosticReport\` đang được nhập ở: ${noi.join(', ') || '(không chỗ nào)'}.\n` +
          `Chỉ \`screens/DiagnosticReportScreen.tsx\` được phép — đó là nơi DUY NHẤT hiện ` +
          `toàn văn báo cáo trước khi có nút gửi.\nBáo cáo chở những câu app đã hiện, trong ` +
          `đó có tên người bảo hộ, \`@username\`, tên cây, tên cá thể; và bộ lọc ` +
          `\`telemetryGate.FORBIDDEN_SHAPES\` không có mẫu nào chặn tên người. Dựng báo cáo ở ` +
          `một chỗ không hiện nó ra là mở lại đúng đường đã vá: người dùng gửi ra ngoài ` +
          `một thứ chưa ai đọc, và việc đó bất khả hồi.\nCần một lối vào mới thì ĐIỀU HƯỚNG ` +
          `tới màn 'DiagnosticReport', đừng dựng báo cáo tại chỗ.`,
    ).toBe('');
  });

  it('phép tìm thật sự bắt được — mẫu khớp đúng câu nhập', () => {
    // Không có ca này thì bài trên xanh cả khi mẫu tìm không khớp gì (0 tệp cũng làm
    // `noi.length === 1` sai, nhưng một mẫu khớp SAI có thể trả về đúng một tệp khác).
    const re = /import\s*\{[^}]*buildDiagnosticReport/;
    expect(re.test("import { buildDiagnosticReport } from '../services/diagnosticReport';")).toBe(true);
    expect(re.test("import { resetDiag, buildDiagnosticReport } from './diagnosticReport';")).toBe(true);
    expect(re.test("// nói về buildDiagnosticReport trong một chú thích")).toBe(false);
  });

  it("route 'DiagnosticReport' mở được khi CHƯA đăng nhập", () => {
    // Lớp lỗi dày nhất của một buổi đi vườn kết thúc ở màn đăng nhập: khoá sinh trắc bị
    // hệ điều hành huỷ sau khi người dùng thêm một vân tay, danh tính chưa dùng được trên
    // máy này, sinh trắc tạm khoá. Đóng màn báo cáo sau cổng là làm cho đúng lớp lỗi cần
    // báo nhất thành lớp không báo được — và `AccountScreen` tự đẩy về `Login` khi `!user`.
    expect(PUBLIC_ROUTES).toContain('DiagnosticReport');
  });

  it("route 'DiagnosticReport' là route của NỀN, có ở mọi app", () => {
    // Không khai ở đây thì cổng chéo module coi nó là route của một module, và app nào
    // không khai module đó sẽ có một lối vào chết ở màn đăng nhập.
    expect(HOST_ROUTES).toContain('DiagnosticReport');
  });

  it('màn được ĐĂNG KÝ trong navigator — khai tên thôi thì bấm vào là ném', () => {
    // Ca đã xảy ra thật với route `Terms`: hai nút trỏ vào một tên chưa bao giờ đăng ký,
    // và không bài kiểm nào bắt được vì mọi bài đều giả `useNavigation`.
    const nav = fs.readFileSync(path.join(SRC, 'navigation/index.tsx'), 'utf8');
    expect(nav).toContain("name: 'DiagnosticReport'");
    expect(nav).toContain('DiagnosticReportScreen');
  });

  it('có ĐÚNG hai lối vào, và cả hai đều điều hướng chứ không tự dựng báo cáo', () => {
    const account = fs.readFileSync(path.join(SRC, 'screens/AccountScreen.tsx'), 'utf8');
    const login = fs.readFileSync(path.join(SRC, 'screens/LoginScreen.tsx'), 'utf8');
    expect(account).toContain("navigate('DiagnosticReport')");
    expect(login).toContain("navigate('DiagnosticReport'");
    // Và màn Tài khoản KHÔNG còn giữ đường gửi cũ. Đo bằng DÒNG NHẬP, không đo bằng chuỗi
    // `Share.share` xuất hiện ở đâu đó: khối chú thích đính chính ngay trong tệp đó có
    // viết ra tên ấy để giải thích lỗi cũ, nên phép đo theo chuỗi sẽ đỏ vì văn xuôi. Đây
    // đúng là ca đã gặp một lần ở cổng `.unwrap()`: cấm coi văn xuôi là mã.
    expect(account).not.toMatch(/^\s*Share,\s*$/m);
  });
});
