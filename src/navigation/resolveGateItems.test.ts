// navigation/resolveGateItems.test.ts
//
// SG9 §4 (+ điều chỉnh menu arc) — CỔNG: service thuần, KHÔNG có Me, Trace-quét
// NỔI BẬT ở GIỮA; service có SubHome mang subApp (mở arc con tầng-2).

import { resolveGateItems, TRACE_SCAN_ROUTE } from './resolveGateItems';

const NO_FARM = { farms: 0, trees: 0, fruits: 0 };
const routes = (items: ReturnType<typeof resolveGateItems>) => items.map((i) => i.route);

describe('resolveGateItems', () => {
  // Điều chỉnh menu arc (Aladin chốt, #53): BỎ 'Home' khỏi cung (nhấn nút giữa đã về
  // Home → mục Home thừa). Cung = Chat · [slot persona], Trace-quét chèn CHÍNH GIỮA.
  it('user mới / nông dân: Chat · Farm · [Trace giữa] · Work · Join', () => {
    const expected = ['ProofChatHome', 'Farms', 'TraceScan', 'WorkHome', 'JoinHome'];
    expect(routes(resolveGateItems(NO_FARM))).toEqual(expected);
    expect(routes(resolveGateItems({ farms: 2, trees: 9, fruits: 0 }))).toEqual(expected);
  });

  it('shipper (Work usage, không farm): Work/Join lên trước, Farm lùi; Trace vẫn giữa', () => {
    expect(routes(resolveGateItems(NO_FARM, { WorkHome: 8 }))).toEqual([
      'ProofChatHome', 'WorkHome', 'TraceScan', 'JoinHome', 'Farms',
    ]);
  });

  it('KHÔNG có Me/Account trong cung', () => {
    expect(routes(resolveGateItems(NO_FARM))).not.toContain('Account');
  });

  it('Trace-quét = mục NỔI BẬT, nằm CHÍNH GIỮA cung', () => {
    expect(TRACE_SCAN_ROUTE).toBe('TraceScan');
    const items = resolveGateItems(NO_FARM);
    const mid = Math.floor(items.length / 2);
    expect(items[mid].route).toBe('TraceScan');
    expect(items[mid].prominent).toBe(true);
    expect(items[mid].subActions).toBeUndefined(); // Trace = hành động trực tiếp
  });

  it('Farm/Chat mang hành-động-nhanh (arc con tầng-2), route ĐÍCH thật', () => {
    const byRoute = Object.fromEntries(resolveGateItems(NO_FARM).map((i) => [i.route, i]));
    const farm = byRoute.Farms.subActions ?? [];
    expect(farm.map((a) => a.route)).toEqual([
      'TreeIdentity', 'AnimalManagement', 'CareScan', 'FarmDetail',
    ]);
    // Route đích KHÁC route module (không mở lại màn module).
    for (const a of farm) expect(a.route).not.toBe('Farms');

    const chat = byRoute.ProofChatHome.subActions ?? [];
    expect(chat.map((a) => a.route)).toEqual(['ProofChatWallet', 'Notifications']);

    expect(byRoute.WorkHome.subActions).toBeUndefined();
    expect(byRoute.JoinHome.subActions).toBeUndefined();
  });

  it('mỗi hành-động-nhanh có key/icon/label/route', () => {
    for (const it of resolveGateItems(NO_FARM)) {
      for (const a of it.subActions ?? []) {
        expect(a.key).toBeTruthy();
        expect(a.icon).toBeTruthy();
        expect(a.label).toBeTruthy();
        expect(a.route).toBeTruthy();
      }
    }
  });

  it('CỔNG chứa đủ service off-bar (Join luôn tới được)', () => {
    expect(routes(resolveGateItems(NO_FARM))).toContain('JoinHome');
  });

  it('mỗi mục có key/icon/label/tint/route hợp lệ', () => {
    for (const it of resolveGateItems(NO_FARM)) {
      expect(it.key).toMatch(/^svc-/);
      expect(it.icon).toBeTruthy();
      expect(it.label).toBeTruthy();
      expect(it.tint).toMatch(/^#|rgb/);
      expect(it.route).toBeTruthy();
    }
  });
});
