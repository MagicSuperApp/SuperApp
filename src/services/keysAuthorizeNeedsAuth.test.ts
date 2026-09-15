// services/keysAuthorizeNeedsAuth.test.ts
//
// GHIM: `POST /keys/authorize` phải MANG thẻ phiên, và lỗi 401 phải nói tiếng
// người.
//
// ── Ca thực địa sinh ra bộ kiểm này ─────────────────────────────────────────
// Một người dùng thực địa dùng hai app của hệ trên cùng một điện thoại, đi đúng
// lối "nhờ app đang đăng nhập duyệt cho máy này", bấm "Ký duyệt bằng khoá của
// tôi", và nhận về nguyên văn:
//
//     Chưa duyệt được
//     Unauthorized — Missing Bearer token
//
// Đo thẳng lên máy chủ thật 15/09/2026, không token:
//
//     POST https://api.phoenixkey.me/api/v1/keys/authorize   (thân `{}`)
//       → HTTP 401  {"code":1304,"message":"Unauthorized — Missing Bearer token"}
//     GET  .../identity/<did lạ>/op-seq
//       → HTTP 404  {"code":2002,"message":"User with this DID not found"}
//
// Lượt đối chứng thứ hai quan trọng ngang lượt đầu: nó chứng minh 401 kia KHÔNG
// phải một cổng chung chặn mọi cửa, mà là chính sách của riêng `/keys/authorize`.
//
// ── Vì sao app lại không gửi thẻ ────────────────────────────────────────────
// Hai khối chú thích trong kho khẳng định cửa này công khai. Lượt gọi tin theo
// và không khai `needsAuth`, nên bộ chặn yêu cầu không gắn `Authorization`, mà
// đường tự đúc lại phiếu cũng không chạy — nó chỉ chạy khi `needsAuth` bật.
// Hệ quả đúng mức: đường "một PhoenixKey dùng ở mọi app" CHƯA TỪNG chạy được
// với máy chủ hôm nay.
//
// ── Hai bài dưới đây KHÁC hạng nhau, nói rõ để không đọc nhầm ───────────────
//   · `describeAuthorizeFailure` là bài kiểm HÀNH VI — gọi hàm thật, so kết quả.
//   · Bài `needsAuth` là bài kiểm ĐỘ PHỦ trên văn bản nguồn, cùng lối với
//     `sessionRefreshCoverage.test.ts`. Nó ghim được rằng CỜ CÒN ĐÓ; nó KHÔNG
//     chứng minh bộ chặn gắn header đúng. Phép đo cho vế sau nằm ở máy chủ
//     thật, và nó đã được chạy ở trên — chép kết quả vào đây thay cho một lời
//     hứa suông.

import fs from 'fs';
import path from 'path';
import { describeAuthorizeFailure } from './keyAuthorizeService';
import { PhoenixKeyApiError } from './phoenixKey-api';

const doc = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('độ phủ: lượt gọi /keys/authorize khai needsAuth', () => {
  it('keys.authorize truyền needsAuth: true', () => {
    const src = doc('phoenixKey-api.ts');
    // Khoanh đúng thân của `authorize:` rồi mới tìm cờ — tìm trên cả tệp thì
    // một `needsAuth` của cửa khác cũng làm bài này xanh, tức bài đo sai chỗ.
    const start = src.indexOf('authorize: (body: KeyAuthorizeRequest)');
    expect(start).toBeGreaterThan(-1);
    const than = src.slice(start, start + 320);
    expect(than).toContain("client.post('/keys/authorize'");
    expect(than).toContain('needsAuth: true');
  });

  it('chú thích KHÔNG còn khẳng định cửa này công khai', () => {
    // Câu cũ: "Cửa này PUBLIC ở tầng Spring (không Bearer)". Nó là nguyên nhân
    // gốc — cờ thiếu chỉ là hệ quả. Ai gỡ cờ mà để lại câu ấy thì lần sau lặp
    // lại y hệt, nên ghim cả câu.
    for (const f of ['phoenixKey-api.ts', 'keyAuthorizeService.ts']) {
      const src = doc(f);
      expect(src).not.toMatch(/Cửa này PUBLIC ở tầng Spring \(không Bearer\)/);
      expect(src).not.toMatch(/PUBLIC ở tầng Spring — không Bearer, ai gọi cũng được/);
    }
  });
});

describe('describeAuthorizeFailure — 401 phải thành câu người đọc được', () => {
  // Thứ tự tham số THẬT là `(code, httpStatus, message)`. Viết ngược thì lỗi
  // dựng ra có `code` là mã HTTP, mọi nhánh `switch (code)` trượt hết, và hàm
  // rơi xuống `default` trả `e.message` — bài kiểm đỏ ở đúng dòng mang tên nó
  // trong khi mã hoàn toàn lành. Giữ lại chú thích này vì cái sai đó đọc rất
  // giống một lỗi thật.
  const loi = (httpStatus: number, code: number, message: string) =>
    new PhoenixKeyApiError(code, httpStatus, message);

  it('1304 (thiếu thẻ) KHÔNG rò chuỗi tiếng Anh của máy chủ ra màn hình', () => {
    const s = describeAuthorizeFailure(
      loi(401, 1304, 'Unauthorized — Missing Bearer token'),
    );
    expect(s).not.toContain('Unauthorized');
    expect(s).not.toContain('Bearer');
    expect(s).toContain('phiên');
  });

  it('1308 (phiếu cũ thiếu claim vai) đi cùng đường với 1304 — đều là "lập phiên lại"', () => {
    const a = describeAuthorizeFailure(loi(401, 1308, 'stale token'));
    const b = describeAuthorizeFailure(loi(401, 1304, 'missing token'));
    expect(a).toBe(b);
  });

  // 1306 và 1308 là HAI việc khác nhau: cái đầu "máy này không được phép", cái
  // sau "phiếu hết đời, đăng nhập lại". Gộp chúng là dẫn người dùng đi sai việc.
  it('1306 (vai không đủ) nói KHÁC 1308, và không rơi xuống nhánh 403 chung', () => {
    const roleForbidden = describeAuthorizeFailure(loi(403, 1306, 'KEY_ROLE_FORBIDDEN'));
    const staleToken = describeAuthorizeFailure(loi(401, 1308, 'stale token'));
    const chuKySai = describeAuthorizeFailure(loi(403, 0, 'bad signature'));
    expect(roleForbidden).not.toBe(staleToken);
    expect(roleForbidden).not.toBe(chuKySai);
    expect(roleForbidden).toContain('máy phụ');
  });

  // Bài canh hồi quy cho chính hàm này: bốn mã đã có câu riêng từ trước phải
  // giữ nguyên câu của chúng sau khi chèn nhánh 401 vào giữa.
  it('các mã cũ không bị nhánh 401 nuốt mất', () => {
    expect(describeAuthorizeFailure(loi(403, 1405, 'clock skew'))).not.toContain('phiên với máy chủ');
    expect(describeAuthorizeFailure(loi(409, 3009, 'replay'))).toContain('thao tác khác');
    expect(describeAuthorizeFailure(loi(400, 3007, 'bad key'))).toContain('quét lại');
    expect(describeAuthorizeFailure(loi(404, 0, 'no owner'))).toContain('khoá chủ');
  });
});
