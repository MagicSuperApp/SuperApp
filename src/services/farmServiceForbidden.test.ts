/**
 * `farmService` — 403 và 404 phải có nhãn riêng, không gộp vào `server_error`.
 *
 * ── Vì sao tệp này, sau khi hai tệp bên cạnh đã vá ──────────────────────────────
 * `treeReIDService` và `fruitReIDService` đã tách hai mã này ra khỏi `server_error`, vì
 * `fieldErrorMessage` dịch nhãn đó thành *"Máy chủ đang bận. Thử lại sau ít phút."* — một
 * nguyên nhân TẠM THỜI. Vườn bị rút quyền hay vườn đã xoá thì thử lại vô ích mãi mãi.
 *
 * `farmService` bị bỏ sót, và nó là cửa ĐÔNG NHẤT — mọi lượt đọc, tạo, đổi tên, xoá
 * vườn đều đi qua `_apiCall` của tệp này. Đó đúng là nếp sai mà rule gọi tên: **đợt vá
 * lấy phạm vi bằng phạm vi của triệu chứng thì để lại nguyên nguyên nhân**.
 *
 * Và 403 KHÔNG được mang nhãn `auth_error`: ba màn đọc nhãn đó như lệnh làm mới phiên
 * (`ensureOrilifeToken(base, { force: true })` — xoá thẻ đang dùng tốt, bật thêm một hộp
 * Face ID). Ca đối xứng cho việc đó ở `reidForbidden.test.ts`.
 */
import { listFarms, getFarm } from './farmService';
import { fieldErrorMessage } from './treeReIDService';

jest.mock('./orilifeDidAuth', () => ({
  ...jest.requireActual('./orilifeDidAuth'),
  ensureOrilifeToken: jest.fn(async () => true),
}));

function tuChoi(status: number, detail?: string) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => (detail === undefined ? {} : { detail }),
  } as unknown as Response;
}

describe('farmService — ba ca 4xx, ba nhãn', () => {
  it('403 → `forbidden`, giữ câu của máy chủ', async () => {
    global.fetch = jest.fn(async () => tuChoi(403, 'Vườn này thuộc tài khoản khác.')) as never;

    const res = await getFarm('https://x.test', 'farm-1');

    expect(res.error?.type).toBe('forbidden');
    expect(res.error?.detail).toBe('Vườn này thuộc tài khoản khác.');
    expect(fieldErrorMessage(res.error)).toBe('Vườn này thuộc tài khoản khác.');
  });

  it('403 KHÔNG phải `auth_error` — nhãn đó kéo theo một lượt làm mới phiên', async () => {
    global.fetch = jest.fn(async () => tuChoi(403)) as never;

    const res = await getFarm('https://x.test', 'farm-1');

    expect(res.error?.type).not.toBe('auth_error');
  });

  it('404 → `not_found`, và câu KHÔNG mời thử lại', async () => {
    global.fetch = jest.fn(async () => tuChoi(404, 'Không có vườn đó.')) as never;

    const res = await getFarm('https://x.test', 'farm-1');

    expect(res.error?.type).toBe('not_found');
    expect(fieldErrorMessage(res.error)).not.toMatch(/thử lại sau ít phút/i);
  });

  it('câu cho 403/404 KHÔNG còn là "Máy chủ đang bận" — đây là chính lỗi đang vá', async () => {
    // Ca này viết theo hướng NGƯỢC: nó nêu đúng câu sai của bản cũ. Bản cũ gán
    // `server_error` cho cả hai mã, và `fieldErrorMessage('server_error')` trả đúng câu
    // dưới đây. Nên ca này đỏ ngay nếu ai gộp chúng lại.
    for (const ma of [403, 404]) {
      global.fetch = jest.fn(async () => tuChoi(ma)) as never;
      const res = await listFarms('https://x.test');
      expect(fieldErrorMessage(res.error)).not.toBe('Máy chủ đang bận. Thử lại sau ít phút.');
    }
  });

  it('5xx VẪN là `server_error` — bản vá không được nới sang ca thử lại CÓ ích', async () => {
    // Không có ca đối xứng này thì "403/404 không phải server_error" xanh cả khi ai đó
    // bỏ hẳn nhãn `server_error`, tức mất luôn ca duy nhất mà lời mời thử lại là đúng.
    global.fetch = jest.fn(async () => tuChoi(503)) as never;

    const res = await listFarms('https://x.test');

    expect(res.error?.type).toBe('server_error');
  });
});
