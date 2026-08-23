/**
 * Khoá hai cờ `ok` của `POST /api/animal/rename`.
 *
 * Cửa này trả `200` kèm `ok:false` khi tên sau vệ sinh còn rỗng
 * (`animal_server_ext.py:929-932`) — cùng khuôn với `POST /api/rename` của cây.
 * Cờ `ok` mà `_apiCall` đặt là cờ VẬN CHUYỂN, không phải câu trả lời.
 *
 * Bài kiểm này còn giữ một dữ kiện khác: nút "Đổi tên" ở màn vật nuôi từng bị gỡ
 * kèm lý do "máy chủ KHÔNG có cửa đổi tên". Cửa có thật. Nếu ai đó lại gỡ hàm
 * này vì tin câu cũ, tệp này đỏ.
 */
import { renameAnimal } from './animalReIDService';

const jsonRes = (status: number, body: any) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as any);

beforeEach(() => {
  (global as any).fetch = jest.fn();
});
afterEach(() => {
  delete (global as any).fetch;
});

it('200 kèm `ok:false` là THẤT BẠI, và hiện NGUYÊN VĂN câu của máy chủ', async () => {
  (global.fetch as jest.Mock).mockReturnValue(
    jsonRes(200, { ok: false, animal_did: 'did:a1', name: 'Bò lang', error: 'Tên không được để trống.' }),
  );
  const res = await renameAnimal('https://x', 'did:a1', '   ');
  expect(res.ok).toBe(false);
  expect(res.error?.detail).toBe('Tên không được để trống.');
  expect(res.error?.http_status).toBe(200);
});

it('thành công thì trả tên MÁY CHỦ đã ghi, không phải chuỗi vừa gõ', async () => {
  // Máy chủ vệ sinh tên trước khi lưu; hai chuỗi có thể khác nhau, và bày chuỗi
  // của mình là bày một thứ chưa từng được lưu.
  (global.fetch as jest.Mock).mockReturnValue(
    jsonRes(200, { ok: true, animal_did: 'did:a1', name: 'Bò lang' }),
  );
  await expect(renameAnimal('https://x', 'did:a1', '  Bò lang  ')).resolves.toEqual({
    ok: true,
    name: 'Bò lang',
  });
});

it('thân thiếu hẳn `ok` → KHÔNG suy ra là thành công', async () => {
  (global.fetch as jest.Mock).mockReturnValue(jsonRes(200, {}));
  await expect(renameAnimal('https://x', 'did:a1', 'Bò')).resolves.toMatchObject({ ok: false });
});

it('404 (không phải chủ / không thấy bản ghi) giữ nguyên mã HTTP', async () => {
  (global.fetch as jest.Mock).mockReturnValue(jsonRes(404, { detail: 'Không tìm thấy bản ghi.' }));
  const res = await renameAnimal('https://x', 'did:khong-co', 'Bò');
  expect(res.ok).toBe(false);
  expect(res.error?.http_status).toBe(404);
});

it('gửi đúng tên trường máy chủ khai: `animal_did` + `name`', async () => {
  const appended: Array<[string, any]> = [];
  const OriginalFormData = (global as any).FormData;
  (global as any).FormData = class {
    append(k: string, v: any) { appended.push([k, v]); }
  };
  (global.fetch as jest.Mock).mockReturnValue(jsonRes(200, { ok: true, name: 'Bò' }));
  await renameAnimal('https://x', 'did:a1', 'Bò');
  (global as any).FormData = OriginalFormData;
  expect(appended.map(e => e[0])).toEqual(['animal_did', 'name']);
});
