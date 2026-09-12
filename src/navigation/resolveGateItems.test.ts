// navigation/resolveGateItems.test.ts
//
// SG9 §4 (+ điều chỉnh menu arc) — CỔNG: service thuần, KHÔNG có Me, Trace-quét
// NỔI BẬT ở GIỮA; service có SubHome mang subApp (mở arc con tầng-2).

import { DEFAULT_INSTANCE, ENABLED_MODULES } from '../config/instance.config';

import { moduleOwningRoute } from './moduleCatalog';
import { resolveGateItems, TRACE_SCAN_ROUTE } from './resolveGateItems';

const NO_FARM = { farms: 0, trees: 0, fruits: 0 };
const routes = (items: ReturnType<typeof resolveGateItems>) => items.map((i) => i.route);

/**
 * Route có tới được trong app ĐANG DỰNG không.
 *
 * Route của host (`moduleOwningRoute` trả `null`) luôn tới được; route của một
 * module thì chỉ tới được khi module ấy bật. Đây là điều kiện về CẤU HÌNH, khác
 * với thứ bài này đo — HÌNH DẠNG cung — nên dùng nó để dựng kỳ vọng không biến
 * bài thành phép so một hàm với chính nó.
 */
const MODULE_ROUTE_REACHABLE = (route: string): boolean => {
  const owner = moduleOwningRoute(route);
  return owner === null || ENABLED_MODULES.includes(owner);
};

/**
 * Cung KỲ VỌNG, dựng từ chính lời khai của app đang dựng.
 *
 * Trước 2026-09-10 chỗ này là một mảng gõ tay mang thứ tự của Aladin, kèm chú
 * thích "App mặc định lúc chạy bộ kiểm là Aladin". Câu đó là một GIẢ ĐỊNH về
 * biến môi trường `APP_INSTANCE`, không phải một điều bài kiểm đo được — và nó
 * sai ngay lần đầu ai đó chạy bộ kiểm trên bản dựng CheckFarm: bài đỏ, mà mã
 * thì đúng. (Đo 12/09/2026: bộ kiểm đang chạy dưới `checkfarm`.)
 *
 * ── Sửa lần hai, 12/09/2026 ─────────────────────────────────────────────────
 * Bản trên vẫn còn HAI giả định gõ cứng, và cả hai chết khi một app bắt đầu
 * dùng quyền chọn module của luật v3:
 *   · `'ChatHome'` mở đầu cung — nó là neo của NỀN, và app tắt `chat` thì nó
 *     không tới được, nên `resolveGateItems` lọc nó ra.
 *   · đúng BA ô ưu tiên — app chọn lọc khai ít hơn.
 *
 * Nên cung kỳ vọng nay dựng từ hai thứ đo được: neo nào CÒN TỚI ĐƯỢC, và bảng
 * ưu tiên của chính app này. Trace-quét vẫn chèn vào chính giữa.
 *
 * Hàm này cố ý KHÔNG gọi lại `resolveGateItems` để suy ra kỳ vọng — làm thế là
 * so một hàm với chính nó, và mọi lỗi trong nó sẽ tự khớp.
 */
const expectedArc = (priority: string[]) => {
  const truoc = MODULE_ROUTE_REACHABLE('ChatHome') ? ['ChatHome'] : [];
  const oUuTien = priority.filter(MODULE_ROUTE_REACHABLE);
  const hang = [...truoc, ...oUuTien];
  const mid = Math.floor((hang.length + 1) / 2);
  return [...hang.slice(0, mid), TRACE_SCAN_ROUTE, ...hang.slice(mid)];
};

describe('resolveGateItems', () => {
  // Điều chỉnh menu arc (Aladin chốt, #53): BỎ 'Home' khỏi cung (nhấn nút giữa đã về
  // Home → mục Home thừa). Cung = Chat · [slot persona], Trace-quét chèn CHÍNH GIỮA.
  // ĐỔI 2026-08-30: thứ tự ô nay đi theo `InstanceConfig.slotPriority` của app đang
  // dựng, không còn theo hằng của nền dùng chung. Trước đó trường đó có 0 người đọc
  // nên mọi app ra cùng một cung — xem `slotPriorityWiring.test.ts`.
  //
  // Aladin CỐ Ý đặt Việc làm trước (`instance.config.ts`: "Người mở Aladin đến vì
  // việc, không đến vì vườn"); CheckFarm đặt Trang trại trước. Cả hai đều ĐÚNG —
  // nên bài đo hình dạng cung, và lấy thứ tự ô từ lời khai của app đang dựng.
  it('user mới: Chat · [ô ưu tiên 1] · [Trace giữa] · hai ô còn lại', () => {
    const expected = expectedArc(DEFAULT_INSTANCE.slotPriority.default);
    expect(routes(resolveGateItems(NO_FARM))).toEqual(expected);
    expect(routes(resolveGateItems({ farms: 2, trees: 9, fruits: 0 }))).toEqual(expected);
  });

  it('shipper (Work usage, không farm): đi theo bảng ưu tiên `shipper`; Trace vẫn giữa', () => {
    expect(routes(resolveGateItems(NO_FARM, { WorkHome: 8 }))).toEqual(
      expectedArc(DEFAULT_INSTANCE.slotPriority.shipper),
    );
  });

  it('ĐỐI CHỨNG — kỳ vọng không được rỗng và không được mang `undefined`', () => {
    // Bản trước ghim `toHaveLength(3)`, vì `expectedArc` khi ấy đọc thẳng
    // `priority[0..2]`: bảng thiếu ô thì kỳ vọng mang `undefined`, và một cung
    // cũng thiếu ô sẽ khớp với nó — hai cái sai bằng nhau thành xanh.
    //
    // `expectedArc` nay LỌC nên không đẻ ra `undefined` nữa, và con số 3 thì
    // chết cùng luật v3 (app chọn lọc khai ít ô hơn). Nhưng đường-xanh-rỗng thì
    // KHÔNG chết: bảng rỗng cho ra cung chỉ có Trace, và một `resolveGateItems`
    // hỏng trả về đúng thế cũng khớp. Nên ghim lại vào thứ còn đúng ở mọi app.
    for (const table of [DEFAULT_INSTANCE.slotPriority.default, DEFAULT_INSTANCE.slotPriority.shipper]) {
      expect(table.length).toBeGreaterThan(0);
      expect(table.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
      const arc = expectedArc(table);
      expect(arc).not.toContain(undefined);
      // Trace CỘNG ít nhất một ô dịch vụ — cung chỉ có mỗi Trace là cung hỏng.
      expect(arc.length).toBeGreaterThan(1);
    }
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
    // 'AnimalIdentity' (màn CÓ máy ảnh) đứng trước 'AnimalManagement' (sổ danh sách):
    // trước đây "Quét con vật" trỏ thẳng sổ, nên cả nhánh đăng ký vật nuôi không có
    // lối vào nào — `AnimalIdentity` nằm trong navigator mà 0 lời gọi `navigate`.
    expect(farm.map((a) => a.route)).toEqual([
      'TreeIdentity', 'AnimalIdentity', 'AnimalManagement', 'CareScan', 'FarmDetail',
    ]);
    // Không mục nào được mang mã BỊA. `'default'` từng lọt qua cổng chặn của màn quét
    // nhãn thuốc và ghi rác lên máy chủ; test này giữ nó khỏi quay lại.
    for (const a of farm) {
      const p = (a.params ?? {}) as Record<string, unknown>;
      expect(Object.values(p)).not.toContain('default');
    }
    // Route đích KHÁC route module (không mở lại màn module).
    for (const a of farm) expect(a.route).not.toBe('Farms');

    // Ba mục dưới đây chỉ có mặt khi module của chúng BẬT. App chọn lọc tắt
    // `chat`/`work` thì `byRoute.ChatHome` là `undefined`, và đọc `.subActions`
    // trên đó ném `TypeError` — bài đỏ vì bài sai, không vì mã sai.
    //
    // Bọc bằng `if` chứ KHÔNG bằng `?.`: `?.` biến ca "mục biến mất khỏi cung
    // của một app lẽ ra phải có nó" thành xanh im lặng, tức mất đúng thứ bài
    // này canh. `if` trên lời khai thì nói rõ vì sao bỏ qua.
    if (MODULE_ROUTE_REACHABLE('ChatHome')) {
      const chat = byRoute.ChatHome.subActions ?? [];
      // KHÔNG có 'ProofChatWallet': chat không có ví (module.manifest.json của
      // proofchat, issue #110). Test này giữ lối vào đó khỏi quay lại.
      expect(chat.map((a) => a.route)).toEqual(['Notifications']);
      expect(chat.map((a) => a.route)).not.toContain('ProofChatWallet');
    }
    if (MODULE_ROUTE_REACHABLE('WorkHome')) {
      expect(byRoute.WorkHome.subActions).toBeUndefined();
    }
    if (MODULE_ROUTE_REACHABLE('JoinHome')) {
      expect(byRoute.JoinHome.subActions).toBeUndefined();
    }
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
      // Mục NỔI BẬT (Trace-quét) là icon-only (label rỗng có chủ đích) → miễn kiểm nhãn.
      if (!it.prominent) expect(it.label).toBeTruthy();
      expect(it.tint).toMatch(/^#|rgb/);
      expect(it.route).toBeTruthy();
    }
  });
});
