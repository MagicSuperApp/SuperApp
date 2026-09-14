/**
 * Ca "máy đầy vạch sóng mà app báo mất mạng" — báo từ thực địa 11/09.
 *
 * iOS đọc tệp ảnh ở TẦNG MẠNG (FormData mang `{uri}`, NSURLSession tự mở tệp), nên
 * một tệp đã bị dọn làm hỏng cả lượt gọi và React Native dựng lại thành
 * `TypeError: Network request failed` — KHÔNG phân biệt được với mất sóng thật.
 *
 * Bộ bài này canh đúng chỗ phân biệt đó. Phép thử lúc VIẾT từng ca (Forall §Kỷ luật
 * phát ngôn #6): *"đầu vào của ca này có phân biệt được hai bên đột biến không?"* —
 * nên có cả ca ảnh CÒN ĐỦ (phải giữ nguyên nhãn cũ) lẫn ca ảnh MẤT, và một ca nhãn
 * khác `network_error` để cửa không được phép đổi bừa.
 */
import { identifyTree, enrollTree, fieldErrorMessage } from './treeReIDService';

jest.mock('./orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn().mockResolvedValue(true),
}));

jest.mock('./treeDraftStore', () => ({
  fileExists: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const { fileExists } = require('./treeDraftStore') as { fileExists: jest.Mock };

const ANH = ['file:///a/1.jpg', 'file:///a/2.jpg', 'file:///a/3.jpg'];

/** Lượt gửi NÉM đúng như iOS ném khi không đọc được tệp trong FormData. */
function fetchThrowsNetwork() {
  (global as any).fetch = jest.fn().mockRejectedValue(
    new TypeError('Network request failed'),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  fileExists.mockResolvedValue(true);
});

describe('quy trách nhiệm lượt gửi ảnh hỏng', () => {
  it('ảnh CÒN ĐỦ trên đĩa ⇒ giữ nguyên nhãn `network_error`', async () => {
    fetchThrowsNetwork();
    fileExists.mockResolvedValue(true);

    const res = await identifyTree('https://x.test', ANH);

    expect(res.ok).toBe(false);
    expect(res.error?.type).toBe('network_error');
    // Không được lén nối thêm số đo vào ca này — `detail` là thứ tra ngược trong nhật ký.
    expect(res.error?.detail).not.toContain('không còn trên đĩa');
  });

  it('một ảnh đã mất ⇒ đổi sang `missing_image`, KHÔNG còn là lỗi mạng', async () => {
    fetchThrowsNetwork();
    fileExists.mockImplementation(async (uri: string) => uri !== ANH[1]);

    const res = await identifyTree('https://x.test', ANH);

    expect(res.error?.type).toBe('missing_image');
    // Giữ nguyên chuỗi gốc VÀ nối số đo: mất chuỗi gốc thì hết tra ngược được,
    // mất số đo thì không ai biết vì sao nhãn bị đổi.
    expect(res.error?.detail).toContain('Network request failed');
    expect(res.error?.detail).toContain('1/3 ảnh không còn trên đĩa');
  });

  it('đường đăng ký cây cũng được canh, không riêng đường soi', async () => {
    fetchThrowsNetwork();
    fileExists.mockResolvedValue(false);

    const res = await enrollTree('https://x.test', 'Cây thử', ANH);

    expect(res.error?.type).toBe('missing_image');
    expect(res.error?.detail).toContain('3/3 ảnh không còn trên đĩa');
  });

  it('nhãn KHÁC `network_error` thì cửa không được đụng vào', async () => {
    // 500 ⇒ `server_error`. Ảnh có mất hay không cũng không liên quan tới lỗi này.
    (global as any).fetch = jest.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({ error: 'nổ' }),
      headers: { get: () => null },
    });
    fileExists.mockResolvedValue(false);

    const res = await identifyTree('https://x.test', ANH);

    expect(res.error?.type).toBe('server_error');
    expect(fileExists).not.toHaveBeenCalled();
  });

  it('lượt gửi THÀNH CÔNG không trả tiền cho phép kiểm nào', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ decision: 'NEW_TREE' }),
      headers: { get: () => null },
    });

    const res = await identifyTree('https://x.test', ANH);

    expect(res.ok).toBe(true);
    // Đây là lý do cửa chạy SAU chứ không chạy TRƯỚC: đường thường không tốn gì.
    expect(fileExists).not.toHaveBeenCalled();
  });

  it('không kiểm được tệp nào ⇒ fail-open, giữ nhãn cũ chứ không đoán', async () => {
    fetchThrowsNetwork();
    // `fileExists` fail-open sẵn ở nguồn (trả `true` khi thiếu module / URI không
    // phải file://). Ca này khoá lại hành vi đó ở tầng gọi: cơ chế này không chặn
    // thao tác nào nên hỏng thì phải im — bảng chiều hỏng ở Forall §Cổng gác.
    fileExists.mockResolvedValue(true);

    const res = await identifyTree('https://x.test', ANH);

    expect(res.error?.type).toBe('network_error');
  });
});

describe('câu hiện ra cho người dùng', () => {
  it('`missing_image` KHÔNG nhắc sóng hay Wi-Fi', () => {
    const msg = fieldErrorMessage({
      type: 'missing_image',
      detail: 'TypeError: Network request failed · 1/3 ảnh không còn trên đĩa',
      http_status: 0,
    });
    // Đây đúng là chỗ nhãn cũ đẩy người dùng đi kiểm tra một thứ không liên quan.
    expect(msg).not.toMatch(/sóng|Wi-Fi/i);
    expect(msg).toContain('chụp lại');
  });

  it('`network_error` vẫn giữ câu cũ kèm mã tham chiếu', () => {
    const msg = fieldErrorMessage({
      type: 'network_error',
      detail: 'TypeError: Network request failed',
      http_status: 0,
    });
    expect(msg).toContain('(mã: TypeError)');
  });
});
