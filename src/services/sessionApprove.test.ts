// sessionApprove.test.ts
//
// Ghim CHUỖI KÝ của cửa duyệt phiên `POST /auth/session/{id}/approve`.
//
// ══ Vì sao có tệp này ════════════════════════════════════════════════════════
// Hai màn cùng gọi cửa đó — tự-ghép-cặp (`phoenixSessionService`) và quét QR
// (`WebLoginScanScreen`). Trước bản này cả hai nối chuỗi bằng `':'`, còn máy chủ
// dựng lại bằng khuôn đóng khung theo độ dài ⇒ mọi lượt duyệt rớt chữ ký.
//
// Nó không nổ suốt thời gian qua chỉ vì luồng ấy chưa từng chạy thành công một
// lần nào — một cửa ở bước trước chặn sớm hơn. Đó là dạng hỏng mà không phép kiểm
// kiểu nào bắt được: hai bên vẫn biên dịch, vẫn gửi đủ trường, chỉ khác nhau ở
// chuỗi byte đem đi ký.
//
// ══ Ca đối kháng, không chỉ ca xanh ══════════════════════════════════════════
// Mỗi vector dưới đây đi kèm một ca PHẢI KHÁC. Một bài kiểm chỉ khẳng định
// "khuôn mới ra chuỗi X" thì vẫn xanh cả khi ai đó đổi tiền tố; ca đối kháng mới
// là chỗ phân biệt được hai bên của một lần sửa.
import { buildCanonicalHex, utf8Bytes } from './canonicalMessage';
import { SESSION_APPROVE_PREFIX } from './phoenixSessionService';

const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join('');

describe('chuỗi ký cửa duyệt phiên', () => {
  it('tiền tố đúng từng ký tự, kể cả dấu hai chấm cuối', () => {
    // Dấu ':' cuối là MỘT PHẦN của tiền tố, không phải dấu phân tách. Bỏ nó đi
    // thì chuỗi ngắn hơn một byte và máy chủ từ chối — với đúng mã lỗi như khi
    // sai thứ tự trường, nên triệu chứng không chỉ ra được nguyên nhân.
    expect(SESSION_APPROVE_PREFIX).toBe('PHOENIXKEY_SESSION_APPROVE:');
  });

  it('tiền tố đi vào chuỗi ký dưới dạng byte THÔ, không đóng khung độ dài', () => {
    // Chỉ các trường mới đóng khung. Nếu ai đó "đổi cho đều" và đóng khung cả
    // tiền tố thì chuỗi dài thêm 4 byte và mọi chữ ký hỏng.
    const chiTienTo = buildCanonicalHex(SESSION_APPROVE_PREFIX);
    expect(chiTienTo).toBe(hex(Array.from(utf8Bytes(SESSION_APPROVE_PREFIX))));
    expect(chiTienTo).toBe('50484f454e49584b45595f53455353494f4e5f415050524f56453a');
  });

  it('vector cố định cho (challenge, domain, timestamp)', () => {
    expect(buildCanonicalHex(SESSION_APPROVE_PREFIX, 'ab', 'cd', '1')).toBe(
      '50484f454e49584b45595f53455353494f4e5f415050524f56453a'
      + '00000002' + '6162'
      + '00000002' + '6364'
      + '00000001' + '31',
    );
  });

  it('KHÁC hẳn khuôn cũ nối bằng dấu hai chấm', () => {
    // Đây là ca chứng minh bản sửa có tác dụng. Nó phải ĐỎ nếu ai quay lại
    // `${challenge}:${domain}:${timestamp}`.
    const cu = hex(Array.from(utf8Bytes(`${SESSION_APPROVE_PREFIX}ab:cd:1`)));
    expect(cu).toBe('50484f454e49584b45595f53455353494f4e5f415050524f56453a61623a63643a31');
    expect(buildCanonicalHex(SESSION_APPROVE_PREFIX, 'ab', 'cd', '1')).not.toBe(cu);
  });

  it('thứ tự trường là [challenge, domain, timestamp] — đảo là chuỗi khác', () => {
    // Đảo hai trường vẫn ra một chuỗi hợp lệ về hình dạng, nên máy chủ trả đúng
    // mã lỗi như khi sai khuôn. Không có triệu chứng nào phân biệt hai ca ở phía
    // máy khách; chỗ phân biệt được là đây.
    const dung = buildCanonicalHex(SESSION_APPROVE_PREFIX, 'ch', 'dom', '1757000000');
    const dao = buildCanonicalHex(SESSION_APPROVE_PREFIX, 'dom', 'ch', '1757000000');
    expect(dung).not.toBe(dao);
  });

  it('timestamp là GIÂY — mili-giây cho ra chuỗi khác, và không có triệu chứng riêng', () => {
    const giay = buildCanonicalHex(SESSION_APPROVE_PREFIX, 'ch', 'd', '1757000000');
    const mili = buildCanonicalHex(SESSION_APPROVE_PREFIX, 'ch', 'd', '1757000000000');
    expect(giay).toContain('0000000a' + '31373537303030303030');
    expect(mili).toContain('0000000d' + '31373537303030303030303030');
    expect(giay).not.toBe(mili);
  });

  it('độ dài đếm BYTE UTF-8, không đếm ký tự', () => {
    // Tên miền có dấu là chỗ hai con số đó tách nhau.
    const s = buildCanonicalHex(SESSION_APPROVE_PREFIX, 'ê');
    expect(s.endsWith('00000002' + 'c3aa')).toBe(true);
    expect(s.endsWith('00000001' + 'c3aa')).toBe(false);
  });
});
