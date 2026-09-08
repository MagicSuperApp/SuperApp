/**
 * `updateFarm` — canh ĐÚNG MỘT thứ: đổi tên vườn KHÔNG được đụng tới ranh.
 *
 * ── Vì sao bài kiểm này đáng tồn tại ────────────────────────────────────────
 * Hợp đồng máy chủ (docstring của `updateFarm`): gửi `boundary_json` mà thiếu
 * `boundary_method` thì máy chủ ĐẶT LẠI nguồn-gốc ranh về `unknown` và xoá sai
 * số. Ranh mới không kế thừa nguồn-gốc ranh cũ.
 *
 * Nghĩa là một lần đổi tên vườn có thể xoá sạch lời khai đo đạc — im lặng, và
 * không lấy lại được. Hôm nay lời gọi ở `FarmDetailScreen.handleUpdateFarmName`
 * chỉ truyền `{ name }` nên an toàn; bài kiểm này canh việc ai đó về sau tiện
 * tay truyền thêm ranh vào mà không đọc docstring.
 *
 * Đo THÂN YÊU CẦU thật (`FormData` đã dựng), không đo mã nguồn — chuỗi đúng
 * không chứng minh được yêu cầu gửi đi đúng.
 */

import { updateFarm } from './farmService';

// Kho khoá: `_getAuthHeader` đọc token từ đây.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

/**
 * Đọc các khoá đã đính vào FormData, không phụ thuộc thứ tự.
 *
 * HAI hình dạng, và phải đọc được cả hai: trong jest `FormData` là bản chuẩn có
 * `entries()`; trên máy thật React Native dùng bản riêng giữ dữ liệu ở `_parts`.
 * Chỉ đọc một bên thì bài kiểm hoặc chết trong jest, hoặc đo một hình dạng
 * không phải hình dạng chạy thật.
 *
 * Chỗ bài kiểm này KHÔNG với tới, nói ra để không ai tin quá: nó đo `FormData`
 * mà `_buildFarmForm` dựng, không đo byte thật đi trên dây. Hai bản `FormData`
 * tuần tự hoá khác nhau thì phần đó nằm ngoài tầm jest.
 */
function fieldsOf(body: unknown): string[] {
  const form = body as any;
  if (typeof form?.entries === 'function') {
    return [...form.entries()].map(([k]: [string, unknown]) => k).sort();
  }
  const parts = form?._parts as [string, unknown][] | undefined;
  if (Array.isArray(parts)) return parts.map(([k]) => k).sort();
  throw new Error('Thân yêu cầu không phải FormData ở cả hai hình dạng đã biết');
}

describe('updateFarm — thân yêu cầu chỉ mang đúng thứ được truyền', () => {
  let sent: { url: string; init: RequestInit } | null = null;

  beforeEach(() => {
    sent = null;
    global.fetch = jest.fn(async (url: any, init: any) => {
      sent = { url: String(url), init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, farm: { farm_id: 'f1', name: 'Vườn mới', boundary: [] } }),
      } as any;
    }) as any;
  });

  it('đổi tên: gửi ĐÚNG `name`, KHÔNG kèm ranh và KHÔNG kèm nguồn-gốc ranh', async () => {
    await updateFarm('https://x.test', 'f1', { name: 'Vườn mới' });

    expect(sent).not.toBeNull();
    expect(sent!.url).toBe('https://x.test/api/farm/f1/update');

    const fields = fieldsOf(sent!.init.body);
    expect(fields).toEqual(['name']);
    // Nói thẳng ba tên bị cấm ở ca này, để khi bài đỏ thì đọc ra ngay vì sao.
    expect(fields).not.toContain('boundary_json');
    expect(fields).not.toContain('boundary_method');
    expect(fields).not.toContain('boundary_acc_m');
  });

  it('ĐỐI CHỨNG: truyền ranh thì ranh CÓ đi — bài trên không xanh vì hàm câm', async () => {
    // Không có ca này thì bài trên vẫn xanh kể cả khi `_buildFarmForm` hỏng và
    // không đính gì cả. Một phép đo luôn trả "không thấy" thì không đo được gì.
    await updateFarm('https://x.test', 'f1', {
      name: 'Vườn mới',
      boundary: [{ lat: 1, lng: 2 }],
      boundaryMethod: 'walk',
      boundaryAccM: 3.5,
    });

    expect(fieldsOf(sent!.init.body)).toEqual(
      ['boundary_acc_m', 'boundary_json', 'boundary_method', 'name'],
    );
  });

  it('ranh RỖNG không sinh `boundary_json` — mảng rỗng khác "có ranh"', async () => {
    await updateFarm('https://x.test', 'f1', { name: 'Vườn mới', boundary: [] });
    expect(fieldsOf(sent!.init.body)).toEqual(['name']);
  });

  it('sai số KHÔNG đo được thì không gửi — `null` không được thành 0', async () => {
    // Gửi 0 cho ca chưa đo là ghi vào máy chủ lời khai "ranh chính xác tuyệt
    // đối". Sai vĩnh viễn, và không ai kiểm lại được.
    await updateFarm('https://x.test', 'f1', {
      name: 'Vườn mới',
      boundary: [{ lat: 1, lng: 2 }],
      boundaryMethod: 'manual',
      boundaryAccM: null,
    });
    const fields = fieldsOf(sent!.init.body);
    expect(fields).toContain('boundary_method');
    expect(fields).not.toContain('boundary_acc_m');
  });
});
