// navigation/resolveGateItems.test.ts
//
// SG9 §4 (+ điều chỉnh menu arc) — CỔNG: service thuần, KHÔNG có Me, Trace-quét
// NỔI BẬT ở GIỮA; service có SubHome mang subApp (mở arc con tầng-2).

import { DEFAULT_INSTANCE } from '../config/instance.config';

import { resolveGateItems, TRACE_SCAN_ROUTE } from './resolveGateItems';

const NO_FARM = { farms: 0, trees: 0, fruits: 0 };
const routes = (items: ReturnType<typeof resolveGateItems>) => items.map((i) => i.route);

/**
 * Ba mệnh đề LUẬT của cung, kiểm rời nhau.
 *
 * ── Vì sao không còn so với một mảng dựng sẵn (đổi 13/09/2026) ──────────────
 * Bản cũ là `['ChatHome', p[0], TRACE, p[1], p[2]]` — nó gõ cứng hai thứ mà mã
 * không hứa: **ô đầu cung là Chat** (thật ra ô đầu là `NEO_LEFT`, và NEO trái
 * nay là Ví) và **bảng ưu tiên có đúng ba ô**. Cả hai đều đúng tại thời điểm
 * viết và cả hai đều là chi tiết triển khai, nên khi chính sách đổi thì bài đỏ
 * mà mã không sai.
 *
 * Cũng cố ý KHÔNG dựng kỳ vọng bằng cách chạy lại công thức chèn giữa của
 * `resolveGateItems`: bài kiểm chép thuật toán của thứ nó kiểm thì nó xanh với
 * mọi thuật toán, kể cả thuật toán sai.
 */
const expectArcShape = (got: string[], priority: string[]) => {
  // 1. Ô TRÁI CỦA APP ĐANG DỰNG mở đầu cung.
  //
  //    ĐỔI 2026-09-14: trước đây dòng này so với hằng `NEO_LEFT` của nền. Ô trái
  //    nay là thứ APP KHAI (`InstanceConfig.anchorLeft`), nên so với hằng nền là
  //    so với một giá trị chỉ TÌNH CỜ đúng cho app mặc định — và nó sẽ đỏ ở đúng
  //    app đầu tiên khai ô trái khác, tức đỏ ở chính ca nó phải xanh.
  expect(got[0]).toBe(DEFAULT_INSTANCE.anchorLeft);
  // 2. Trace-quét nằm CHÍNH GIỮA — hai bên lệch nhau nhiều nhất một ô.
  const iTrace = got.indexOf(TRACE_SCAN_ROUTE as string);
  expect(iTrace).toBeGreaterThan(-1);
  expect(Math.abs(iTrace - (got.length - 1 - iTrace))).toBeLessThanOrEqual(1);
  // 3. Bỏ ô trái và Trace ra thì phần còn lại là DÃY CON của bảng ưu tiên, giữ
  //    nguyên thứ tự app khai. Nói "dãy con" chứ không "bằng" vì cung lọc route
  //    của module app đang tắt — ràng buộc thật là THỨ TỰ, không phải độ dài.
  //
  //    ĐÍNH CHÍNH 2026-09-14: câu cũ ở đây ghi "CheckFarm tắt `chat` và `work`".
  //    Không còn đúng — `instance.config.ts` khai `modules: 'all'` cho CheckFarm,
  //    và cả hai module đó đang bật. Mệnh đề "dãy con" thì vẫn cần, vì nó đúng
  //    với app suy biến BẤT KỲ; chỉ ví dụ minh hoạ là đã chết.
  const con = got.filter(
    (r) => r !== DEFAULT_INSTANCE.anchorLeft && r !== TRACE_SCAN_ROUTE,
  );
  expect(con.length).toBeGreaterThan(0);
  const viTri = con.map((r) => priority.indexOf(r));
  expect(viTri).not.toContain(-1); // không mục lạ nào lọt vào cung
  expect(viTri).toEqual([...viTri].sort((a, b) => a - b));
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
  it('user mới: NEO trái · [Trace giữa] · các ô ưu tiên đúng thứ tự của app', () => {
    const p = DEFAULT_INSTANCE.slotPriority.default;
    expectArcShape(routes(resolveGateItems(NO_FARM)), p);
    expectArcShape(routes(resolveGateItems({ farms: 2, trees: 9, fruits: 0 })), p);
  });

  it('shipper (Work usage, không farm): đi theo bảng ưu tiên `shipper`; Trace vẫn giữa', () => {
    expectArcShape(
      routes(resolveGateItems(NO_FARM, { WorkHome: 8 })),
      DEFAULT_INSTANCE.slotPriority.shipper,
    );
  });

  it('ĐỐI CHỨNG — hai bảng ưu tiên không rỗng và không trùng mục', () => {
    // Bảng rỗng thì mệnh đề 3 của `expectArcShape` so `[]` với `[]` và xanh
    // trong khi cung chẳng có ô nào. Bảng trùng mục thì cung vẽ hai nút giống
    // hệt nhau mà không phép so mảng nào kêu.
    for (const table of [DEFAULT_INSTANCE.slotPriority.default, DEFAULT_INSTANCE.slotPriority.shipper]) {
      // Ngưỡng là SỐ SLOT của thanh (`resolveVisibleTabs.SLOT_COUNT` = 2), không
      // phải một con số tròn chọn cho đẹp. Bảng ngắn hơn số slot thì cung thiếu ô
      // và không phép so mảng nào kêu. Một app tắt bớt module hợp lệ vẫn phải qua
      // được bài này — nó canh "bảng có lấp đủ chỗ không", không canh "app có đủ
      // nhiều module không".
      expect(table.length).toBeGreaterThanOrEqual(2);
      expect(table.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
      expect(new Set(table).size).toBe(table.length);
    }
  });

  it('ĐỐI CHỨNG — ô trái của app KHÔNG nằm trong bảng ưu tiên CỦA CHÍNH NÓ', () => {
    // Nếu nó nằm cả hai nơi thì cung mở đầu bằng nó rồi lặp lại nó ở giữa, và
    // mệnh đề 3 ở trên vẫn xanh vì phép lọc bỏ sạch mọi lần xuất hiện.
    //
    // So với `anchorLeft` của CHÍNH app đang dựng, không với hằng nền: một app
    // ĐƯỢC PHÉP để ô trái của app KHÁC nằm trong bảng ưu tiên của mình — CheckFarm
    // đặt `PhoenixWallet` (ô trái của Aladin) vào bảng là hợp lệ và có chủ ý.
    for (const table of [DEFAULT_INSTANCE.slotPriority.default, DEFAULT_INSTANCE.slotPriority.shipper]) {
      expect(table).not.toContain(DEFAULT_INSTANCE.anchorLeft);
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

    // ── ĐÍNH CHÍNH 2026-09-14: chat có thể KHÔNG có mặt, và đó là trạng thái hợp lệ ──
    //
    // Bài cũ đọc thẳng `byRoute.ChatHome.subActions`, tức nó giả định MỌI app đều bật
    // `chat`. Giả định đó vừa hết đúng: CheckFarm tắt `chat` cho đợt nộp này (Apple
    // guideline 1.2 — xem khối chú thích ở `CHECKFARM_INSTANCE.modules`), nên bài nổ
    // `Cannot read properties of undefined`.
    //
    // Nhưng KHÔNG được sửa thành `byRoute.ChatHome?.subActions ?? []` rồi so với mảng
    // rỗng: viết thế là bài xanh ở CẢ HAI cực — chat có mà hỏng cũng xanh, chat không
    // có cũng xanh — tức nó thôi kiểm gì. Nên bài này rẽ theo LỜI KHAI của app đang
    // chạy, và mỗi nhánh vẫn khẳng định một điều.
    const chatDeclared = DEFAULT_INSTANCE.modules === 'all'
      || DEFAULT_INSTANCE.modules.includes('chat');
    if (chatDeclared) {
      const chat = byRoute.ChatHome.subActions ?? [];
      // KHÔNG có 'ProofChatWallet': chat không có ví (module.manifest.json của
      // proofchat, issue #110). Test này giữ lối vào đó khỏi quay lại.
      expect(chat.map((a) => a.route)).toEqual(['Notifications']);
      expect(chat.map((a) => a.route)).not.toContain('ProofChatWallet');
    } else {
      // App KHÔNG khai chat ⟹ cổng xoè không được có lối vào chat. Đây là vế quan
      // trọng: nếu một đường chat vẫn lọt lên cổng sau khi module đã tắt thì người
      // xét duyệt vẫn gặp nội dung do người dùng tạo, và việc tắt module thành vô nghĩa.
      expect(byRoute.ChatHome).toBeUndefined();
    }

    // Cùng luật với chat ngay trên: rẽ theo LỜI KHAI, và mỗi nhánh vẫn khẳng
    // định một điều. Viết `byRoute.WorkHome?.subActions` rồi so với `undefined`
    // là bài xanh ở cả hai cực — có mà hỏng cũng xanh, không có cũng xanh.
    const workDeclared = DEFAULT_INSTANCE.modules === 'all'
      || DEFAULT_INSTANCE.modules.includes('work');
    if (workDeclared) {
      expect(byRoute.WorkHome.subActions).toBeUndefined();
    } else {
      // App không khai việc làm ⟹ cổng xoè không được còn lối vào nó. Vế này
      // quan trọng ngang vế của chat: sàn việc làm cũng là nội dung do người
      // dùng tạo, nên một lối vào sót lại làm việc tắt module thành vô nghĩa.
      expect(byRoute.WorkHome).toBeUndefined();
    }
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
      // Mục NỔI BẬT (Trace-quét) là icon-only (label rỗng có chủ đích) → miễn kiểm nhãn.
      if (!it.prominent) expect(it.label).toBeTruthy();
      expect(it.tint).toMatch(/^#|rgb/);
      expect(it.route).toBeTruthy();
    }
  });
});
