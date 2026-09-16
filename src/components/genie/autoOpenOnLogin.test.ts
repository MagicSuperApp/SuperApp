// components/genie/autoOpenOnLogin.test.ts
//
// Luật TỰ MỞ lớp trợ lý sau khi đăng nhập.
//
// Một lỗi ở đây không làm app đổ — nó chỉ làm lớp phủ bung ra trên màn 24 từ
// khôi phục, hoặc bung ra lần thứ hai, thứ ba. Cả hai đều là thứ người dùng gỡ
// app vì nó, và cả hai đều KHÔNG có ngoại lệ nào để bắt. Nên chỗ duy nhất bắt
// được chúng là ở đây.

import { AUTO_OPEN_MS, quyetDinh, type AutoOpenGate } from './autoOpenOnLogin';

const OK: AutoOpenGate = {
  loggedIn: true,
  enabled: true,
  routeOk: true,
  layerOpen: false,
  fired: false,
};

describe('cửa gác', () => {
  it('đủ điều kiện ⇒ MỞ', () => {
    expect(quyetDinh(OK)).toBe('open');
  });

  it('CHỈ MỘT LẦN cho mỗi lần đăng nhập', () => {
    expect(quyetDinh({ ...OK, fired: true })).toBe('wait');
  });

  it('chưa đăng nhập ⇒ quên lần đã dùng, để lần đăng nhập sau được tính lại', () => {
    // Đây là chỗ "một lần mỗi lần đăng nhập" khác với "một lần mỗi lần cài app".
    expect(quyetDinh({ ...OK, loggedIn: false })).toBe('reset');
    expect(quyetDinh({ ...OK, loggedIn: false, fired: true })).toBe('reset');
  });

  it('người dùng đã TẮT trợ lý ⇒ không tự bật lên', () => {
    // Một thứ đã tắt mà tự bật lên là một thứ hỏng.
    expect(quyetDinh({ ...OK, enabled: false })).toBe('wait');
  });

  it('đang ở màn CỬA VÀO ⇒ không mở', () => {
    // Màn đăng nhập, 24 từ khôi phục, ví… Lớp phủ che mất một dòng ở đó có thể
    // làm người ta chép sai khoá khôi phục của chính mình.
    expect(quyetDinh({ ...OK, routeOk: false })).toBe('wait');
  });

  it('lớp đang mở sẵn ⇒ không đụng vào', () => {
    expect(quyetDinh({ ...OK, layerOpen: true })).toBe('wait');
  });

  it('cửa gác nào đóng cũng đủ chặn — không cần cả ba', () => {
    const dong = [
      { enabled: false },
      { routeOk: false },
      { layerOpen: true },
      { fired: true },
    ];
    dong.forEach((d) => expect(quyetDinh({ ...OK, ...d })).toBe('wait'));
  });
});

describe('khoảng chờ', () => {
  it('đúng 2 giây như chủ sở hữu chốt', () => {
    expect(AUTO_OPEN_MS).toBe(2000);
  });

  it('không phải 0 — bung lên ngay khung hình đầu thì không ai biết cái gì vừa che màn', () => {
    expect(AUTO_OPEN_MS).toBeGreaterThanOrEqual(1000);
  });
});
