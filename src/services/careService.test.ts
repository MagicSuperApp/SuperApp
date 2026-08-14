/**
 * Cờ `safe` của `/api/care/withdrawal` có BA giá-trị (OriLife `care.py:443-451`).
 * `null` = CHƯA XÁC ĐỊNH, KHÔNG phải an-toàn. Đây là mục có hậu-quả ngoài phần-mềm:
 * nói "an-toàn" khi hệ không biết là bảo nông-dân cứ hái, nông-sản đó ra chợ.
 */
import { getWithdrawalStatus, safeStateOf } from './careService';

describe('safeStateOf — ba nhánh tường minh', () => {
  it('false → blocked (đang trong thời-gian cách-ly)', () => {
    expect(safeStateOf(false)).toBe('blocked');
  });

  it('true → safe', () => {
    expect(safeStateOf(true)).toBe('safe');
  });

  it('null → unknown, KHÔNG phải safe', () => {
    expect(safeStateOf(null)).toBe('unknown');
    expect(safeStateOf(null)).not.toBe('safe');
  });

  it('undefined (trường vắng mặt) → unknown, KHÔNG phải safe', () => {
    expect(safeStateOf(undefined)).toBe('unknown');
    expect(safeStateOf(undefined)).not.toBe('safe');
  });

  it('KHÔNG lặp lại hai lỗi đã biết: `safe ?? true` và `safe !== false`', () => {
    // Hai biểu-thức dưới đây là hai cách viết SAI đã gặp thật; giữ lại trong test
    // để chứng minh hàm này không đồng ý với chúng ở ca `null`.
    const sai1 = (s: boolean | null | undefined) => (s ?? true);          // null → true
    const sai2 = (s: boolean | null | undefined) => s !== false;          // null → true
    expect(sai1(null)).toBe(true);
    expect(sai2(null)).toBe(true);
    expect(safeStateOf(null)).toBe('unknown'); // hàm đúng thì không rơi vào 'safe'
  });
});

/**
 * Bộ kiểm trên đây đã đúng từ đầu — kể cả dòng đầu tệp cũng ghi đúng tên cửa
 * `/api/care/withdrawal`. Nhưng mã thì đọc `safe` ra từ thân của `POST /api/care/log`,
 * mà cửa đó KHÔNG trả trường ấy (`care_router.py:273-274` trả đúng ba khoá: `ok`,
 * `care_event_id`, `withdrawal_until`).
 *
 * Nên `safeStateOf` — một hàm ba nhánh viết rất cẩn thận, có bộ kiểm riêng — suốt
 * thời gian qua chỉ nhận `undefined`: nhánh `'blocked'`, tức nhánh CHẶN THU HOẠCH,
 * chưa từng chạy một lần nào ngoài thực địa.
 *
 * Bài học ghi lại ở đây vì nó rộng hơn ca này: **kiểm một hàm không kiểm được rằng
 * hàm đó có được cho ăn dữ liệu thật hay không.** Nên phần dưới nhắm vào ĐƯỜNG GỌI.
 */

const WD_BLOCKED = {
  ok: true, safe: false, blocked_until: '2026-08-20', days_left: 8,
  by_product: 'Tilt', flags: [], advice: [],
};

function mockFetchOnce(body: unknown, status = 200) {
  const spy = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  });
  (global as any).fetch = spy;
  return spy;
}

describe('getWithdrawalStatus — cửa DUY NHẤT có cờ an toàn', () => {
  afterEach(() => { jest.resetAllMocks(); });

  it('gọi đúng /api/care/withdrawal, không phải /api/care/log', async () => {
    const spy = mockFetchOnce(WD_BLOCKED);
    await getWithdrawalStatus('https://api.orilife.io', 'tree', 't-123');
    const url: string = spy.mock.calls[0][0];
    expect(url).toContain('/api/care/withdrawal');
    expect(url).not.toContain('/api/care/log');
    expect(url).toContain('target_type=tree');
    expect(url).toContain('target_id=t-123');
    expect(spy.mock.calls[0][1].method).toBe('GET');
  });

  it('mã đối tượng có ký tự lạ vẫn mã hoá đúng, không vỡ chuỗi truy vấn', async () => {
    const spy = mockFetchOnce(WD_BLOCKED);
    await getWithdrawalStatus('https://api.orilife.io', 'tree', 'cây/#1 &2');
    const url: string = spy.mock.calls[0][0];
    expect(url).toContain('target_id=c%C3%A2y%2F%231+%262');
    expect(url).not.toContain('#1');
  });

  it('đọc đủ các trường quyết định của ca ĐANG CÁCH LY', async () => {
    mockFetchOnce(WD_BLOCKED);
    const res = await getWithdrawalStatus('https://api.orilife.io', 'tree', 't-1');
    expect(safeStateOf(res.data?.safe)).toBe('blocked');
    expect(res.data?.days_left).toBe(8);
    expect(res.data?.by_product).toBe('Tilt');
  });

  // Trứng/sữa có mốc RIÊNG, và mốc thịt qua TRƯỚC. Máy chủ chỉ gửi khối `eggmilk`
  // khi còn hạn (`care_router.py:315-318`). App chỉ nhìn `safe` thì đúng khoảng
  // chênh đó nó báo AN TOÀN cho một quả trứng còn dư lượng thuốc.
  it('safe=true mà vẫn còn cấm trứng/sữa — hai điều đó KHÔNG loại trừ nhau', async () => {
    mockFetchOnce({
      ok: true, safe: true, blocked_until: null, days_left: 0, by_product: null,
      eggmilk: { safe: false, blocked_until: '2026-08-16', days_left: 4, by_product: 'Via-Levasol' },
      eggmilk_safe: false,
    });
    const res = await getWithdrawalStatus('https://api.orilife.io', 'animal', 'a-9');
    expect(safeStateOf(res.data?.safe)).toBe('safe');
    expect(res.data?.eggmilk).toBeDefined();
    expect(res.data?.eggmilk_safe).toBe(false);
  });
});
