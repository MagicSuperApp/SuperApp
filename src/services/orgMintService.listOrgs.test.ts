/**
 * Khoá hình dạng của `GET /identity/org`.
 *
 * Vì sao có tệp này. Máy chủ trả `result = { orgs: [...] }` (`API.md:283-299`),
 * còn app từng khai `unwrap<OrgSummary[]>` rồi chặn hậu quả bằng
 * `Array.isArray(rows) ? rows : []`. Hai cái đó cộng lại cho ra một danh sách
 * tổ chức LUÔN rỗng mà không một dòng lỗi nào — và người dùng tưởng chưa tạo
 * nên tạo lại, đúc thêm một OrgDID lên chuỗi.
 *
 * Nên bài kiểm ở đây phải dựng dữ liệu giả theo ĐÚNG envelope của máy chủ. Mock
 * lỏng hơn thật (một mảng trần) thì bài kiểm xanh trong khi mã hỏng.
 */
import { listOrgs } from './orgMintService';
import { orgMintApi } from './orgMint-api';

jest.mock('./orgMint-api', () => ({
  orgMintApi: { listOrgs: jest.fn() },
}));

const mockListOrgs = orgMintApi.listOrgs as jest.Mock;

// Đúng thứ tầng service NHẬN: interceptor đã đổi key sang camelCase trước đó.
const wire = {
  orgs: [
    {
      orgDid: 'did:phoenix:alpha',
      name: 'Alpha Trading TNHH',
      authorityModel: 'single',
      threshold: null,
      role: 'owner',
      createdAt: '2026-08-01T10:15:30Z',
    },
    {
      orgDid: 'did:phoenix:hoptacxa',
      name: 'Magic Lamp Hợp Tác Xã',
      authorityModel: 'threshold',
      threshold: 2,
      role: 'member',
      createdAt: '2026-07-20T08:00:00Z',
    },
  ],
};

beforeEach(() => mockListOrgs.mockReset());

it('bóc đúng `orgs` khỏi object bọc — không coi cả object là mảng', async () => {
  mockListOrgs.mockResolvedValue(wire);
  const rows = await listOrgs();
  expect(rows).toHaveLength(2);
  expect(rows[0].orgDid).toBe('did:phoenix:alpha');
});

it('đọc tên từ `name`, không phải `org_name`', async () => {
  mockListOrgs.mockResolvedValue(wire);
  const rows = await listOrgs();
  // Đây là lỗi thứ hai, và nó chỉ lộ ra SAU khi lỗi hình dạng được sửa: danh
  // sách rỗng thì không ai thấy tên nào để mà thấy sai.
  expect(rows[0].orgName).toBe('Alpha Trading TNHH');
  expect(rows[1].orgName).toBe('Magic Lamp Hợp Tác Xã');
});

it('`threshold: null` (single) thành `undefined`, không lọt `null` xuống UI', async () => {
  mockListOrgs.mockResolvedValue(wire);
  const rows = await listOrgs();
  expect(rows[0].threshold).toBeUndefined();
  expect(rows[1].threshold).toBe(2);
});

it('danh sách rỗng THẬT vẫn là danh sách rỗng, không phải lỗi', async () => {
  mockListOrgs.mockResolvedValue({ orgs: [] });
  await expect(listOrgs()).resolves.toEqual([]);
});

it('hình dạng lạ thì NÉM — không rơi sạch thành danh sách rỗng', async () => {
  // Đúng thứ mã cũ nuốt: một mảng trần, hoặc bất cứ gì không có `orgs`.
  mockListOrgs.mockResolvedValue([{ orgDid: 'did:phoenix:x', name: 'X' }]);
  await expect(listOrgs()).rejects.toThrow(/hình dạng lạ/);

  mockListOrgs.mockResolvedValue({ items: [] });
  await expect(listOrgs()).rejects.toThrow(/hình dạng lạ/);
});

it('lỗi từ tầng API đi thẳng lên, không bị đổi thành rỗng', async () => {
  mockListOrgs.mockRejectedValue(new Error('1304 UNAUTHORIZED'));
  await expect(listOrgs()).rejects.toThrow('1304 UNAUTHORIZED');
});
