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

import {
  activateWallet, JoinApiError, getNodeStats, checkPersonDid, resolvePersonDid,
} from './joinService';

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


/**
 * CỔNG DANH TÍNH — chủ sở hữu hệ thống chốt 2026-08-27: `did:phoenix` là dạng DUY
 * NHẤT, `did:cardano` bị bãi bỏ ở mọi tầng. `resolvePersonDid` là điểm cô lập duy
 * nhất của nơi cấp danh tính trong luồng Góp máy, nên cổng đứng ở đó.
 */
describe('checkPersonDid — did:phoenix là dạng duy nhất', () => {
  const HEX64 = 'a'.repeat(64);
  const BASE32_13 = 'abcdefghijkmn';

  it('nhận khuôn did:phoenix hiện hành', () => {
    const did = `did:phoenix:${BASE32_13}:${HEX64}`;
    expect(checkPersonDid(did)).toEqual({ ok: true, did });
    expect(resolvePersonDid(did)).toBe(did);
  });

  // Nhà Join đề nghị chặn bằng `[a-z2-7]{13}:[0-9a-f]{64}`. Cổng CỐ Ý không dùng
  // khuôn đó — hai bài dưới đây là lý do, và chúng đứng ngay cạnh nhau để người sửa
  // sau không siết lại khuôn rồi làm hỏng một trong hai.
  it('nhận dạng TẠM `did:phoenix:tmp:<device_id>` — chính nhà Join yêu cầu nhận', () => {
    const did = 'did:phoenix:tmp:pixel-7a-2f9c';
    expect(checkPersonDid(did).ok).toBe(true);
  });

  it('nhận khuôn đoạn giữa THẬP PHÂN — bản khớp cổng mint on-chain, đã có mã', () => {
    expect(checkPersonDid(`did:phoenix:1734567890123:${HEX64}`).ok).toBe(true);
  });

  it('TỪ CHỐI did:cardano, và nói người dùng phải TẠO LẠI chứ không phải thử lại', () => {
    const r = checkPersonDid(`did:cardano:preprod:${HEX64}`);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('không tới đây');
    expect(r.reason).toBe('did-cardano');
    expect(r.message).toMatch(/tạo lại danh tính/i);
    // Không được rò chuỗi thô ra câu cho người đọc.
    expect(r.message).not.toContain('did:cardano');
    expect(resolvePersonDid(`did:cardano:preprod:${HEX64}`)).toBeNull();
  });

  it('TỪ CHỐI chuỗi ba đoạn mà máy chủ OriLife trả dưới tên `entity_did`', () => {
    const r = checkPersonDid('did:phoenix:pending:tree:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('khong-phai-phoenix');
  });

  it.each([
    ['peer id libp2p', '12D3KooWABCDEF'],
    ['did phương thức khác', `did:key:z6Mk${HEX64}`],
    ['chuỗi trần', 'nguoi-dung-123'],
  ])('TỪ CHỐI %s — không ánh xạ, không đoán', (_ten, bad) => {
    expect(checkPersonDid(bad).ok).toBe(false);
    expect(resolvePersonDid(bad)).toBeNull();
  });

  it.each([null, undefined, '', '   '])('rỗng (%p) → lý do "thiếu", câu bảo đi TẠO', (bad) => {
    const r = checkPersonDid(bad as string | null | undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('thieu');
      expect(r.message).toMatch(/chưa có danh tính/i);
    }
  });

  it('ba lý do cho ba câu KHÁC NHAU — gộp làm một là bảo người dùng làm sai việc', () => {
    const cauThieu = checkPersonDid('');
    const cauCu = checkPersonDid(`did:cardano:preprod:${HEX64}`);
    const cauLa = checkPersonDid('12D3KooW');
    const cau = [cauThieu, cauCu, cauLa].map((r) => (r.ok ? '' : r.message));
    expect(new Set(cau).size).toBe(3);
  });
});
