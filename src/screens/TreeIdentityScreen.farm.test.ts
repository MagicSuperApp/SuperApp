/**
 * KHOÁ LẠI: màn nhận diện cây KHÔNG được gửi `farm_id` rỗng lên máy chủ.
 *
 * ── Lỗi đã đo ───────────────────────────────────────────────────────────────
 * `TreeIdentityScreen` lấy vườn bằng đúng một dòng `route.params?.farmId`, không
 * có đường lùi. Bốn lối vào KHÔNG truyền tham số đó:
 *   · `TreeManagementScreen` — nút "+" ở đầu màn và nút "Đăng ký cây đầu tiên"
 *   · `navigation/resolveGateItems.ts` — hành động nhanh "Quét cây"
 *   · `config/quickActions.ts` — nút "Quét cây" ở màn chính
 * Đi bằng bốn đường đó thì `farmId === undefined`, và `verifyAddTree` vẫn gửi.
 * Máy chủ gán `farm_id = null`, cây rơi khỏi bộ lọc `/api/trees?farm_id=X`, nông
 * dân tưởng mất cây rồi đăng ký lại ⇒ hai bản ghi cho một gốc cây. Mà app thì
 * báo "Đã xác nhận". Chú thích ở `TreeIdentityScreen.tsx` đã ghi sẵn hậu quả này
 * cho ĐƯỜNG ĐĂNG KÝ, còn đường bổ sung góc nhìn thì vẫn hở.
 *
 * ── Vì sao chặn ở ĐƯỜNG GHI chứ không ở đầu màn ────────────────────────────
 * Màn này có một đường ĐỌC hợp lệ không cần vườn: chụp rồi soi xem đây là cây
 * nào. Chặn ở đầu màn là khoá luôn việc soi. Chỗ hỏng nằm ở đường GHI.
 */

import {
  resolveFarmContext,
  addViewsToTree,
  type FarmContext,
} from './TreeIdentityScreen';

jest.mock('../services/treeReIDService', () => {
  const actual = jest.requireActual('../services/treeReIDService');
  return { ...actual, verifyAddTree: jest.fn(async () => ({ ok: true, data: { ok: true, added: true } })) };
});

import { verifyAddTree } from '../services/treeReIDService';

const mockVerifyAdd = verifyAddTree as jest.MockedFunction<typeof verifyAddTree>;

const FARM_A = { id: 'farm-a', name: 'Vườn A' };
const FARM_B = { id: 'farm-b', name: 'Vườn B' };

beforeEach(() => { jest.clearAllMocks(); });

describe('resolveFarmContext — mẫu của TreeEnrollScreen, không đẻ mẫu thứ hai', () => {
  it('đúng MỘT vườn → tự chọn, KHÔNG bắt người dùng chọn', () => {
    expect(resolveFarmContext({ farms: [FARM_A], loading: false }))
      .toEqual({ status: 'ready', farmId: 'farm-a' });
  });

  it('nhiều vườn mà không có ngữ cảnh → phải HỎI, không đoán bừa một vườn', () => {
    expect(resolveFarmContext({ farms: [FARM_A, FARM_B], loading: false }))
      .toEqual({ status: 'needs-choice' });
  });

  it('có mã vườn từ lối vào và vườn đó còn thật → dùng luôn', () => {
    expect(resolveFarmContext({ routeFarmId: 'farm-b', farms: [FARM_A, FARM_B], loading: false }))
      .toEqual({ status: 'ready', farmId: 'farm-b' });
  });

  it('mã vườn trỏ vườn ĐÃ XOÁ → không dùng (id chết cũng làm cây mồ côi)', () => {
    expect(resolveFarmContext({ routeFarmId: 'farm-da-xoa', farms: [FARM_A, FARM_B], loading: false }))
      .toEqual({ status: 'needs-choice' });
  });

  it('mã vườn chết mà chỉ còn MỘT vườn → tự chọn vườn còn lại', () => {
    expect(resolveFarmContext({ routeFarmId: 'farm-da-xoa', farms: [FARM_A], loading: false }))
      .toEqual({ status: 'ready', farmId: 'farm-a' });
  });

  it('đang nạp danh sách vườn → `loading`, KHÔNG vội kêu "chưa có vườn"', () => {
    expect(resolveFarmContext({ farms: [], loading: true })).toEqual({ status: 'loading' });
    expect(resolveFarmContext({ routeFarmId: 'farm-a', farms: [], loading: true }))
      .toEqual({ status: 'loading' });
  });

  it('nạp xong mà chưa có vườn nào → `no-farms` (câu phải khác "chọn vườn đi")', () => {
    expect(resolveFarmContext({ farms: [], loading: false })).toEqual({ status: 'no-farms' });
  });

  // Đây là ca ĐÃ HỎNG THẬT: bốn lối vào không truyền gì cả.
  it('không tham số, không vườn nào nạp xong → KHÔNG BAO GIỜ trả ra một mã rỗng', () => {
    for (const ctx of [
      resolveFarmContext({ farms: [], loading: false }),
      resolveFarmContext({ farms: [], loading: true }),
      resolveFarmContext({ farms: [FARM_A, FARM_B], loading: false }),
      resolveFarmContext({ routeFarmId: '', farms: [FARM_A, FARM_B], loading: false }),
      resolveFarmContext({ routeFarmId: '   ', farms: [FARM_A, FARM_B], loading: false }),
    ]) {
      expect(ctx.status).not.toBe('ready');
      expect((ctx as { farmId?: string }).farmId).toBeUndefined();
    }
  });
});

describe('addViewsToTree — cổng ở đúng chỗ dữ liệu rời khỏi máy', () => {
  const IMGS = ['file:///a.jpg', 'file:///b.jpg'];
  const GPS = { lat: 10.5, lng: 106.5, accuracy: 8 };

  const call = (farm: FarmContext) =>
    addViewsToTree({ baseUrl: 'https://api.orilife.io', treeId: 'tree-1', imagePaths: IMGS, farm, gps: GPS });

  it('vườn CHƯA rõ → KHÔNG gọi máy chủ, trả về lý do chặn', async () => {
    for (const farm of [
      { status: 'needs-choice' },
      { status: 'no-farms' },
      { status: 'loading' },
    ] as FarmContext[]) {
      const r = await call(farm);
      expect(r.ok).toBe(false);
      expect(r.blocked).toBe('farm-required');
    }
    // Đây là dòng quan trọng nhất tệp này: không một byte nào ra khỏi máy.
    expect(mockVerifyAdd).not.toHaveBeenCalled();
  });

  it('vườn đã rõ → gửi, và `farmId` đi kèm ĐÚNG mã đó', async () => {
    const r = await call({ status: 'ready', farmId: 'farm-b' });
    expect(r.ok).toBe(true);
    expect(mockVerifyAdd).toHaveBeenCalledTimes(1);
    const opts = mockVerifyAdd.mock.calls[0][3];
    expect(opts?.farmId).toBe('farm-b');
    expect(opts?.lat).toBe(10.5);
    expect(opts?.lon).toBe(106.5);
  });

  it('KHÔNG có lối nào gửi `farmId` undefined/rỗng', async () => {
    await call({ status: 'ready', farmId: 'farm-b' });
    await call({ status: 'needs-choice' });
    for (const c of mockVerifyAdd.mock.calls) {
      const id = c[3]?.farmId;
      expect(typeof id).toBe('string');
      expect(String(id).trim().length).toBeGreaterThan(0);
    }
  });
});
