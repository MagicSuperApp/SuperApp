/**
 * Neo hành vi ĐƯỜNG LỖI của joinService: máy chủ LampNet nói lý do bằng tiếng Việt,
 * app phải chuyển nguyên câu đó ra giao diện thay vì thay bằng câu chung.
 *
 * Câu trong bài thử này là câu ĐO THẬT ngày 15/08/2026:
 *   $ curl -X POST -d '{}' https://api.lampnet.cloud/v1/wallet/activate
 *   → HTTP 403, thân văn bản thuần:
 *     "Reputation 46.3 < threshold 50.0. Cần thêm uptime/shards."
 * Đối chiếu `GET /v1/node/stats` cùng lúc: reputation_score 46.307, threshold 50.0.
 */
jest.mock('@env', () => ({ LAMPNET_BASE_URL: 'https://api.lampnet.cloud' }), {
  virtual: true,
});

import { activateWallet, JoinApiError, getNodeStats } from './joinService';

const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

const reply = (status: number, body: string, ok = status < 400) => ({
  ok,
  status,
  text: async () => body,
});

beforeEach(() => {
  mockFetch.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

describe('403 kèm lý do — app KHÔNG được nuốt câu của máy chủ', () => {
  it('văn bản thuần → hiện nguyên câu, giữ kind=auth', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(403, 'Reputation 46.3 < threshold 50.0. Cần thêm uptime/shards.'),
    );
    await expect(activateWallet('addr_test1x')).rejects.toMatchObject({
      kind: 'auth',
      message: 'Reputation 46.3 < threshold 50.0. Cần thêm uptime/shards.',
    });
  });

  it('JSON { message } → lấy trường message', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(403, JSON.stringify({ message: 'Ví chưa liên kết danh tính.' })),
    );
    await expect(activateWallet('addr_test1x')).rejects.toMatchObject({
      message: 'Ví chưa liên kết danh tính.',
    });
  });

  it('thân rỗng → rơi về câu chung của app', async () => {
    mockFetch.mockResolvedValueOnce(reply(403, ''));
    await expect(activateWallet('addr_test1x')).rejects.toMatchObject({
      kind: 'auth',
      message: 'Chưa đủ quyền hoặc chưa đủ bậc tham gia.',
    });
  });

  it('thân là HTML/stack → KHÔNG đẩy ra giao diện', async () => {
    mockFetch.mockResolvedValueOnce(reply(502, '<html><body>Bad Gateway</body></html>'));
    await expect(activateWallet('addr_test1x')).rejects.toMatchObject({
      kind: 'server',
      message: 'Mạng LampNet chưa nhận yêu cầu này (mã 502).',
    });
  });

  it('thân dài quá trần (log/stack) → KHÔNG đẩy ra giao diện', async () => {
    mockFetch.mockResolvedValueOnce(reply(500, 'x'.repeat(300)));
    await expect(activateWallet('addr_test1x')).rejects.toMatchObject({
      kind: 'server',
      message: 'Mạng LampNet chưa nhận yêu cầu này (mã 500).',
    });
  });

  it('dấu nhỏ-hơn trong câu SO SÁNH SỐ vẫn qua — đây chính là câu thật', async () => {
    // Chốt hồi quy: bản đầu chặn mọi `<` nên giết đúng câu cần hiện.
    mockFetch.mockResolvedValueOnce(reply(403, 'Reputation 46.3 < threshold 50.0.'));
    await expect(activateWallet('addr_test1x')).rejects.toMatchObject({
      message: 'Reputation 46.3 < threshold 50.0.',
    });
  });

  it('đọc thân hỏng → vẫn ném JoinApiError, không vỡ đường lỗi', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => {
        throw new Error('stream đã đóng');
      },
    });
    await expect(activateWallet('addr_test1x')).rejects.toMatchObject({
      kind: 'auth',
      message: 'Chưa đủ quyền hoặc chưa đủ bậc tham gia.',
    });
  });
});

describe('đường thành công không đổi', () => {
  it('/v1/node/stats trả JSON → bóc nguyên hình snake_case của BE', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(200, JSON.stringify({ reputation_score: 46.3, reputation_threshold: 50 })),
    );
    await expect(getNodeStats()).resolves.toMatchObject({
      reputation_score: 46.3,
      reputation_threshold: 50,
    });
  });
});
