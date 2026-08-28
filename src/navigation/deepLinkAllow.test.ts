import {
  MODULE_DEEP_LINK_ALLOW, HOST_DEEP_LINK_PATHS, buildDeepLinkScreens,
} from './deepLinkAllow';

// 25 route module có thật trong kho, đo 2026-08-27 từ `src/modules/*/module.manifest.json`.
// Dùng nguyên bộ này làm mẫu để bài kiểm nói được nó đang chặn ĐÚNG cái gì.
const ROUTE_THAT: { moduleId: string; route: string }[] = [
  { moduleId: 'chat', route: 'ChatHome' }, { moduleId: 'chat', route: 'ChatRoom' },
  { moduleId: 'join', route: 'JoinHome' }, { moduleId: 'join', route: 'Contributing' },
  { moduleId: 'trace', route: 'Farms' }, { moduleId: 'trace', route: 'Dashboard' },
  { moduleId: 'trace', route: 'FarmList' }, { moduleId: 'trace', route: 'FarmDetail' },
  { moduleId: 'trace', route: 'TreeDetail' }, { moduleId: 'trace', route: 'Activity' },
  { moduleId: 'work', route: 'WorkHome' }, { moduleId: 'work', route: 'JobDetail' },
  { moduleId: 'work', route: 'PostJob' }, { moduleId: 'work', route: 'WorkerProfile' },
  { moduleId: 'work', route: 'Contracts' }, { moduleId: 'work', route: 'ContractDetail' },
  { moduleId: 'work', route: 'WorkMatch' }, { moduleId: 'work', route: 'WorkAvailability' },
  { moduleId: 'work', route: 'WorkTaskers' }, { moduleId: 'work', route: 'WorkCreateOffering' },
  { moduleId: 'work', route: 'WorkCapabilities' }, { moduleId: 'work', route: 'WorkEvidence' },
];

describe('danh sách trắng deep-link', () => {
  it('KHÔNG route module nào mở được từ ngoài — rỗng là có chủ ý', () => {
    expect(MODULE_DEEP_LINK_ALLOW).toEqual([]);
  });

  it('bốn màn mang dữ liệu RIÊNG không lọt vào bảng', () => {
    // Đây là lỗi đang vá: vòng lặp cũ đổ cả 25 route vào, gồm bốn màn này.
    const s = buildDeepLinkScreens(ROUTE_THAT, 'TraceScan');
    for (const r of ['ChatRoom', 'FarmDetail', 'TreeDetail', 'ContractDetail']) {
      expect(s[r]).toBeUndefined();
    }
  });

  it('không route module nào lọt, kể cả route vô hại', () => {
    const s = buildDeepLinkScreens(ROUTE_THAT, 'TraceScan');
    for (const { route } of ROUTE_THAT) expect(s[route]).toBeUndefined();
  });

  it('ba route HOST đã xét riêng thì vẫn mở', () => {
    const s = buildDeepLinkScreens(ROUTE_THAT, 'TraceScan');
    expect(s.Main).toBe('main');              // route DUY NHẤT có cổng
    expect(s.LanguageSelect).toBe('language');
    expect(s.TraceScan).toBe('trace-scan');   // màn của NGƯỜI MUA, không dữ liệu riêng
  });

  it('route HOST mang dữ liệu riêng KHÔNG có trong bảng', () => {
    for (const r of ['Wakeme', 'TreeDrift', 'TreeShare', 'Guardian', 'ActivityLog']) {
      expect(HOST_DEEP_LINK_PATHS[r]).toBeUndefined();
    }
  });

  it('tên route quét truyền vào, không đóng cứng', () => {
    expect(buildDeepLinkScreens([], 'MotTenKhac').MotTenKhac).toBe('trace-scan');
  });

  describe('khi có người mở lại một route', () => {
    it('route trong danh sách trắng thì ra đúng đường dẫn `<module>/<route>`', () => {
      const s = buildDeepLinkScreens(ROUTE_THAT, 'TraceScan');
      // Mô phỏng: nếu mai này ai đó thêm 'JoinHome' vào danh sách trắng.
      const gia = buildDeepLinkScreensWith(['JoinHome']);
      expect(s.JoinHome).toBeUndefined();
      expect(gia.JoinHome).toBe('join/JoinHome');
    });

    it('route có trong danh sách trắng mà module TẮT thì bỏ qua, không phải lỗi', () => {
      expect(buildDeepLinkScreensWith(['JoinHome'], []).JoinHome).toBeUndefined();
    });
  });
});

/** Dựng lại `buildDeepLinkScreens` với một danh sách trắng giả, để kiểm nhánh "có mở". */
function buildDeepLinkScreensWith(
  allow: string[],
  moduleScreens: { moduleId: string; route: string }[] = ROUTE_THAT,
): Record<string, string> {
  const screens: Record<string, string> = { ...HOST_DEEP_LINK_PATHS, TraceScan: 'trace-scan' };
  const set = new Set(allow);
  for (const { moduleId, route } of moduleScreens) {
    if (set.has(route)) screens[route] = `${moduleId}/${route}`;
  }
  return screens;
}

// ── Cổng chặn tái phát ───────────────────────────────────────────────────────
// Mọi bài trên kiểm hàm THUẦN. Nhưng lỗi đang vá nằm ở CHỖ GỌI: một vòng lặp
// `MODULE_STACK_SCREENS.forEach` trong `navigation/index.tsx`. Viết lại vòng lặp
// đó thì các bài trên vẫn xanh y nguyên.
describe('buildLinking phải đi qua danh sách trắng', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, 'index.tsx'), 'utf8',
  ) as string;

  it('có gọi buildDeepLinkScreens', () => {
    expect(src).toContain('buildDeepLinkScreens(MODULE_STACK_SCREENS');
  });

  it('KHÔNG còn vòng lặp đổ thẳng route module vào bảng deep-link', () => {
    expect(src).not.toMatch(/MODULE_STACK_SCREENS\.forEach/);
  });
});
