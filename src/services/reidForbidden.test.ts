/**
 * 403 KHÔNG được mang nhãn `auth_error`.
 *
 * ── Vì sao bài này tồn tại ──────────────────────────────────────────────────────
 * Một đợt vá trước đó tách 403 và 404 ra khỏi `server_error` — đúng, vì câu *"Máy chủ
 * đang bận. Thử lại sau ít phút."* khai một nguyên nhân TẠM THỜI mà hai ca đó không
 * có. Nhưng nó gán 403 vào `auth_error`, và nhãn ấy **không chỉ là một câu chữ**: ba
 * màn đọc nó như một LỆNH làm mới phiên —
 *   · `screens/TreeIdentityScreen.tsx` (nhánh sau `callIdentify`)
 *   · `modules/trace/screens/FarmDetailScreen.tsx` (tạo vườn, và đổi tên vườn)
 * — cả ba gọi `ensureOrilifeToken(base, { force: true })`, tức **xoá thẻ phiên đang
 * dùng tốt** và bật thêm một hộp Face ID. Chưa kể chính `_apiCall` cũng tự làm mới một
 * lần ở nhánh 401.
 *
 * Nên với 403, bản cũ cho ra: mất phiên đang dùng → một lượt quét mặt vô ích → vẫn
 * đúng con 403 ấy → câu *"Phiên đăng nhập hết hạn. Hãy đăng nhập lại."* trên màn không
 * có nút đăng nhập. Người dùng thật gặp nó khi mở một cây không thuộc mình: đường liên
 * kết được chia sẻ, hoặc cây vừa chuyển chủ.
 *
 * ── Bài này đo ĐẠI LƯỢNG nào ────────────────────────────────────────────────────
 * Đo **có làm mới phiên hay không**, chứ không đo câu chữ. Câu chữ đổi theo bản dịch
 * và theo màn; còn cái gây hại là lượt gọi `{ force: true }`. Một bản sau này gộp 403
 * về `auth_error` mà vẫn viết câu tử tế thì bài đo câu chữ sẽ XANH, bài này thì đỏ.
 */
import { fieldErrorMessage, getTrees, type APIError } from './treeReIDService';
import { ensureOrilifeToken } from './orilifeDidAuth';

// Chỉ thay ĐÚNG hàm đang đo. Thay cả module thì `lastOrilifeLoginKind` biến mất và
// `authSyncMessage` nổ — một lần hỏng của bộ giả, không phải của mã đang kiểm.
jest.mock('./orilifeDidAuth', () => ({
  ...jest.requireActual('./orilifeDidAuth'),
  ensureOrilifeToken: jest.fn(async () => true),
}));

const ensureMock = ensureOrilifeToken as jest.MockedFunction<typeof ensureOrilifeToken>;

function tuChoi(status: number, detail: string) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ detail }),
  } as unknown as Response;
}

describe('403 của máy chủ nhận diện', () => {
  beforeEach(() => {
    ensureMock.mockClear();
    ensureMock.mockImplementation(async () => true);
  });

  // ⚠ BÀI NÀY KHÔNG GHIM ĐƯỢC CÁI HẠI CHÍNH — đo đột biến rồi mới biết.
  //
  // Gỡ phép tách 403 (gán nó lại vào `auth_error`) thì bài này VẪN XANH. Vì đường tự
  // làm mới phiên bên trong `_apiCall` rẽ theo `resp.status === 401`, một phép so riêng,
  // không đọc cái nhãn vừa gán. Lượt `{ force: true }` gây hại nằm ở TẦNG MÀN
  // (`TreeIdentityScreen`, `FarmDetailScreen` ×2), và ba chỗ đó rẽ theo `error.type` —
  // nên thứ thật sự ghim chúng là hai bài "mang nhãn `forbidden`" và "giữ câu của máy
  // chủ" ở dưới, chứ không phải bài này.
  //
  // Giữ lại vì nó vẫn đo một điều thật và rẻ: `_apiCall` không được tự ý coi 403 là ca
  // phải ký lại. Nhưng đừng đọc nó thành "cái hại đã bị ghim".
  it('`_apiCall` không tự làm mới phiên cho 403 (KHÔNG ghim tầng màn — xem chú thích)', async () => {
    global.fetch = jest.fn(async () => tuChoi(403, 'Bạn không phải chủ cây này.')) as never;

    const res = await getTrees('https://x.test');

    expect(res.ok).toBe(false);
    const coForce = ensureMock.mock.calls.some(c => c[1]?.force === true);
    expect(coForce).toBe(false);
  });

  it('mang nhãn `forbidden`, KHÔNG phải `auth_error` và cũng không phải `server_error`', async () => {
    global.fetch = jest.fn(async () => tuChoi(403, 'Bạn không phải chủ cây này.')) as never;

    const res = await getTrees('https://x.test');

    expect(res.error?.type).toBe('forbidden');
    expect(res.error?.http_status).toBe(403);
  });

  it('giữ nguyên câu của máy chủ — chỉ nó nói được thứ này thuộc về ai', async () => {
    global.fetch = jest.fn(async () => tuChoi(403, 'Bạn không phải chủ cây này.')) as never;

    const res = await getTrees('https://x.test');

    expect(res.error?.detail).toBe('Bạn không phải chủ cây này.');
    expect(fieldErrorMessage(res.error)).toBe('Bạn không phải chủ cây này.');
  });

  it('401 thì VẪN làm mới phiên — bài trên không được vá bằng cách bỏ hẳn cơ chế', async () => {
    // Không có ca đối xứng này thì "403 không làm mới" xanh cả khi ai đó gỡ luôn
    // đường tự làm mới phiên, tức chữa một lỗi bằng cách tạo một lỗi nặng hơn.
    global.fetch = jest.fn(async () => tuChoi(401, 'expired')) as never;

    await getTrees('https://x.test');

    const coForce = ensureMock.mock.calls.some(c => c[1]?.force === true);
    expect(coForce).toBe(true);
  });

  it('câu cho `forbidden` KHÔNG mời đăng nhập lại và KHÔNG mời thử lại', () => {
    // Ca máy chủ không gửi câu nào: app phải tự nói, và phải nói đúng việc. Hai lời
    // khuyên bị cấm ở đây đều dẫn người dùng đi làm một việc chắc chắn vô ích.
    const err: APIError = { type: 'forbidden', detail: '', http_status: 403 };
    const cau = fieldErrorMessage(err);

    expect(cau).not.toMatch(/đăng nhập lại/i);
    expect(cau).not.toMatch(/thử lại/i);
    expect(cau.length).toBeGreaterThan(20);
  });

  it('`forbidden` và `auth_error` phải ra HAI câu khác nhau', () => {
    const a = fieldErrorMessage({ type: 'forbidden', detail: '', http_status: 403 });
    const b = fieldErrorMessage({ type: 'auth_error', detail: '', http_status: 401 });
    expect(a).not.toBe(b);
  });
});
