/**
 * Ghim MỘT điều: máy chủ từ chối ghi nhật ký thuốc ở HTTP 200 thì màn KHÔNG được
 * hiện dấu ✓ "Đã ghi nhật-ký".
 *
 * Lỗi đã có: `CareScanScreen.handleLog` chỉ hỏi `res.ok && res.data`. `res.ok` là kết
 * quả của tầng HTTP; máy chủ từ chối ở tầng nghiệp vụ bằng `200 {ok:false, error:"…"}`
 * — chính vì thế `CareLogResponse.ok` là trường BẮT BUỘC. Ở ca đó `res.ok === true`,
 * `res.error === undefined`, điều kiện cũ cho `true`, và màn đi thẳng vào `setLogged()`:
 * dấu ✓ xanh + nút "Xong". Câu của máy chủ không hiện ở đâu, lần xịt thuốc không vào
 * sổ — mà sổ đó chính là thứ tính ngày cách ly để chặn thu hoạch và chặn bán.
 *
 * Vì sao tệp này tồn tại: phép đột biến ngày 2026-09-14 (gỡ `res.data.ok !== false`
 * khỏi màn rồi chạy trọn `src/screens` + `src/services`) cho **1339/1339 xanh** — tức
 * chốt này KHÔNG có bài nào canh, trong khi chốt `.unwrap()` cùng đợt có 1 bài đỏ.
 * Đó là phép đo phân biệt "có bài đỏ ở chốt X" với "chốt X đã được ghim".
 */
import fs from 'fs';
import path from 'path';
import { logCare } from '../services/careService';

jest.mock('../services/orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn(async () => false),
}));

const BASE = 'https://api.orilife.io';
const REFUSAL = 'Cây này đang bị khoá ghi — chờ kiểm tra viên duyệt.';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe('tầng service — `200 {ok:false}` đi qua được cổng HTTP, nên màn PHẢI tự hỏi', () => {
  it('lượt bị từ chối vẫn mang `res.ok === true` và `res.error === undefined`', async () => {
    globalThis.fetch = jest.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ ok: false, error: REFUSAL }),
    })) as any;

    const res = await logCare(BASE, {
      targetType: 'tree', targetId: 'tree-1', productId: 'p1', recognitionMethod: 'manual',
    });

    // Đây là hình dạng đã dựng nên cái vỏ im lặng: không một trường nào ở tầng ngoài
    // khai rằng lượt này bị từ chối.
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    // Thứ duy nhất khai ra là `data.ok` — và câu cho người dùng ở `data.error`.
    expect(res.data?.ok).toBe(false);
    expect(res.data?.error).toBe(REFUSAL);
  });

  it('lượt ghi THẬT thành công thì `data.ok` là true — hai ca phân biệt được', async () => {
    globalThis.fetch = jest.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ ok: true, care_event_id: 'ev-1', withdrawal_until: '2026-09-30' }),
    })) as any;

    const res = await logCare(BASE, {
      targetType: 'tree', targetId: 'tree-1', productId: 'p1', recognitionMethod: 'manual',
    });
    expect(res.data?.ok).toBe(true);
    expect(res.data?.error).toBeUndefined();
  });
});

describe('MÀN nhãn thuốc — đo ở nguồn, vì bài trên không canh được chỗ này', () => {
  // Bỏ chú thích trước khi khớp: màn cố ý ghi lại nguyên văn điều kiện CŨ để người
  // sau biết vì sao nó bị đổi, nên khớp trên tệp thô sẽ báo đỏ đúng lúc mã đã đúng.
  const raw = fs.readFileSync(path.join(__dirname, 'CareScanScreen.tsx'), 'utf8');
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

  it('cổng vào nhánh THÀNH CÔNG có hỏi `data.ok`', () => {
    expect(src).toMatch(/res\.ok\s*&&\s*res\.data\s*&&\s*res\.data\.ok !== false/);
  });

  it('KHÔNG còn điều kiện cũ `res.ok && res.data` đứng một mình', () => {
    expect(src).not.toMatch(/if \(res\.ok && res\.data\) \{/);
  });

  it('nhánh từ chối hiện CÂU CỦA MÁY CHỦ, không thay bằng câu chung chung', () => {
    // `res.error` là `undefined` ở ca `200 {ok:false}`, nên phải đọc cả `res.data.error`
    // — thiếu nó thì người dùng nhận một câu không nói được việc phải làm.
    expect(src).toMatch(/res\.data\?\.error \?\? res\.error\?\.detail/);
  });

  it('lượt hỏi CÁCH LY cũng đọc `data.ok`, và giữ riêng lý do hỏng', () => {
    expect(src).toMatch(/w\.ok && w\.data && w\.data\.ok !== false/);
    // `wdErr` tách "máy chủ không tra được thuốc" khỏi "lời gọi chưa tới máy chủ":
    // gộp hai ca là đẩy người dùng đi tra nhãn thuốc trong khi hỏng ở phiên đăng nhập.
    expect(src).toMatch(/setWdErr\(/);
  });

  it('CỜ AN TOÀN `flags` của máy chủ có chỗ hiện — trước đây 0 nơi đọc', () => {
    // Cách ly hết hạn KHÔNG kéo theo lô đó bán được: thuốc có thể nằm trong danh mục
    // cấm ở thị trường xuất khẩu, hoặc dư lượng vượt ngưỡng. Bỏ cờ này là để nông dân
    // đọc khối xanh "An-toàn" rồi bán cả lô.
    expect(src).toMatch(/wd\?\.flags\?\.length/);
  });
});
