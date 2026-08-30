/**
 * Khoá hai cờ `ok` của `POST /api/rename`.
 *
 * Máy chủ trả `200 {"ok": false}` khi tên sau vệ sinh còn rỗng, hoặc khi cây
 * không có trong kho (`server.py:5688-5698` — `return {"ok": ok}`, không có
 * nhánh nào đổi mã HTTP). Tầng `_apiCall` cũng có một cờ tên `ok`, nhưng cờ đó
 * chỉ nói "nối được và HTTP không lỗi".
 *
 * Bản cũ trả thẳng cờ vận chuyển, nên màn quản lý cây ghi tên mới vào danh sách
 * trên máy trong khi máy chủ giữ nguyên tên cũ. Mở lại màn là tên cũ quay về,
 * không một dòng nào báo. Đây là bài kiểm duy nhất bắt được ca đó — mọi thứ
 * khác đều xanh.
 */
import { renameTree } from './treeReIDService';

const okJson = (body: any) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as any);

beforeEach(() => {
  (global as any).fetch = jest.fn();
});
afterEach(() => {
  delete (global as any).fetch;
});

it('200 kèm `ok:false` là THẤT BẠI, không phải thành công', async () => {
  (global.fetch as jest.Mock).mockReturnValue(okJson({ ok: false }));
  const res = await renameTree('https://x', 'tree_1', '   ');
  expect(res.ok).toBe(false);
  expect(res.error?.http_status).toBe(200);
  expect(res.error?.detail).toMatch(/không đổi được tên/i);
});

it('200 kèm `ok:true` mới là thành công', async () => {
  (global.fetch as jest.Mock).mockReturnValue(okJson({ ok: true }));
  await expect(renameTree('https://x', 'tree_1', 'Cây đầu vườn')).resolves.toEqual({ ok: true });
});

it('thân thiếu hẳn trường `ok` → KHÔNG suy ra là thành công', async () => {
  // Một bản máy chủ cũ, hay một nhánh trả thiếu trường, không được mặc định
  // thành "đã đổi tên". Im lặng ≠ đã làm.
  (global.fetch as jest.Mock).mockReturnValue(okJson({}));
  const res = await renameTree('https://x', 'tree_1', 'Tên mới');
  expect(res.ok).toBe(false);
});

it('lỗi tầng vận chuyển vẫn giữ nguyên lỗi của tầng đó', async () => {
  (global.fetch as jest.Mock).mockReturnValue(
    Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as any),
  );
  const res = await renameTree('https://x', 'tree_1', 'Tên mới');
  expect(res.ok).toBe(false);
  expect(res.error?.http_status).toBe(403);
});
