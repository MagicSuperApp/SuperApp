/**
 * Bài kiểm khoá đúng MỘT chỗ: `listAnimals` phải trả `total` ra ngoài.
 *
 * Vì sao đáng một tệp riêng: `AnimalListResponse.total` đã được khai từ lâu
 * (`animalReIDService.ts:72`) nhưng chỗ trả về vứt nó đi, nên màn Quản lý vật nuôi
 * bày `animals.length` — số của MỘT TRANG, trần `PAGE_SIZE = 20` — ở huy hiệu đọc
 * như tổng đàn. Kiểu lỗi này không đỏ ở đâu cả: một con số nhỏ hơn sự thật trông
 * vẫn như một con số.
 */

import { listAnimals } from './animalReIDService';

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => 'application/json' },
});

describe('listAnimals — `total` phải đi ra tới chỗ gọi', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('máy chủ gửi `total` lớn hơn số của trang → trả đúng `total`', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue(
      okJson({ animals: new Array(20).fill({ animal_did: 'x' }), total: 137, offset: 0, limit: 20 }) as never,
    );
    const res = await listAnimals('https://x.test', 'farm-1');
    expect(res.ok).toBe(true);
    expect(res.animals).toHaveLength(20);
    expect(res.total).toBe(137);
  });

  it('máy chủ đời cũ KHÔNG gửi `total` → `undefined`, KHÔNG tự bịa thành số trang', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue(
      okJson({ animals: [{ animal_did: 'a' }, { animal_did: 'b' }] }) as never,
    );
    const res = await listAnimals('https://x.test', 'farm-1');
    expect(res.ok).toBe(true);
    expect(res.animals).toHaveLength(2);
    expect(res.total).toBeUndefined();
  });
});
