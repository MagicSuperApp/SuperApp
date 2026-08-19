/**
 * Bài kiểm KHOÁ LẠI: nút Quick Action của việc CỐT LÕI phải hiện từ lượt dùng 0.
 *
 * ── Vì sao đáng một bài kiểm riêng ──────────────────────────────────────────
 * Luật cũ: nút chỉ vào khối Quick Action khi tính năng đã đạt
 * `QUICK_ACTION_MIN_USES = 3` lượt mở. Với tính năng phụ thì đúng. Với việc cốt
 * lõi thì nó khoá vòng: muốn đủ ba lượt phải mở tính năng bằng ĐƯỜNG KHÁC, mà
 * đường khác duy nhất là cử chỉ kéo hai chặng trên nút giữa
 * (`navigation/resolveGateItems.ts`). Người không kéo được không bao giờ đủ ba
 * lượt, nên không bao giờ thấy nút — và `HomeScreen` ẩn hẳn cả khối khi danh
 * sách rỗng, nên người mới cài mở app ra không thấy một nút có chữ nào.
 *
 * Bài này khoá cả hai chiều: cờ `alwaysShow` phải thắng ngưỡng, và tính năng
 * KHÔNG có cờ vẫn phải tuân ngưỡng (đừng vô tình mở toang cả bảng).
 */

import { QUICK_ACTIONS, QUICK_ACTION_MIN_USES } from '../config/quickActions';

jest.mock('./featureUsageDb', () => ({
  insertUsage: jest.fn(),
  getUsageCounts: jest.fn(),
  resetUsage: jest.fn(),
  usageBackend: 'memory',
}));

import { getUsageCounts } from './featureUsageDb';
import { getRankedQuickActions } from './featureUsageService';

const mockCounts = getUsageCounts as jest.MockedFunction<typeof getUsageCounts>;

describe('Quick Action — nút nền hiện từ lượt 0', () => {
  beforeEach(() => jest.clearAllMocks());

  it('máy chưa dùng gì: vẫn có nút, và đúng những nút đánh dấu alwaysShow', async () => {
    mockCounts.mockResolvedValue({});
    const shown = await getRankedQuickActions();

    expect(shown.length).toBeGreaterThan(0);
    const expected = QUICK_ACTIONS.filter(a => a.alwaysShow).map(a => a.route);
    expect(shown.map(a => a.route).sort()).toEqual(expected.sort());
  });

  it('"Quét cây" — việc cốt lõi — có mặt ngay lượt đầu', async () => {
    mockCounts.mockResolvedValue({});
    const shown = await getRankedQuickActions();
    expect(shown.some(a => a.route === 'TreeIdentity')).toBe(true);
  });

  it('tính năng KHÔNG có cờ vẫn phải đủ ngưỡng mới hiện', async () => {
    const plain = QUICK_ACTIONS.find(a => !a.alwaysShow);
    expect(plain).toBeDefined();

    mockCounts.mockResolvedValue({ [plain!.route]: QUICK_ACTION_MIN_USES - 1 });
    expect((await getRankedQuickActions()).some(a => a.route === plain!.route)).toBe(false);

    mockCounts.mockResolvedValue({ [plain!.route]: QUICK_ACTION_MIN_USES });
    expect((await getRankedQuickActions()).some(a => a.route === plain!.route)).toBe(true);
  });

  it('dùng nhiều thì lên trước, kể cả so với nút nền', async () => {
    const plain = QUICK_ACTIONS.find(a => !a.alwaysShow)!;
    mockCounts.mockResolvedValue({ [plain.route]: 99 });
    const shown = await getRankedQuickActions();
    expect(shown[0].route).toBe(plain.route);
  });
});
