/**
 * BẤT BIẾN HAI APP — yêu cầu của chủ nhân viết thành mã.
 *
 * Nguyên văn yêu cầu (2026-08-26):
 *
 *   > SuperApp phải đảm bảo khi các module, platform đã được deploy thì trên
 *   > các app này cũng vẫn sẽ có được những tính năng mà nó đang tích hợp.
 *
 * Một câu như vậy sống trong tài liệu thì chỉ đúng tới lần đầu có người vội. Nên
 * nó phải là một phép đo chạy ở CI, và phép đo đó phải ĐỎ ĐƯỢC.
 *
 * ── Vì sao bài kiểm này cần thiết, cụ thể ────────────────────────────────────
 * Bản trước của `InstanceConfig` có trường `enabledModules`: mỗi app tự khai tập
 * module của mình. Trường đó hỏng CÂM — `collectModuleScreens` gặp module vắng
 * chỉ `console.warn` rồi bỏ qua (`navigation/registry.ts:170-174`). Ngày thêm
 * module thứ năm mà một app quên khai, app đó lặng lẽ thiếu tính năng: không đỏ,
 * không cảnh báo, không màn nào trống — chỉ là một nút không bao giờ xuất hiện.
 *
 * ── ĐÍNH CHÍNH 2026-09-14 — bài kiểm này từng ép một chính sách ĐÃ BỊ LẬT ─────
 * Bản trước của tệp này khẳng định `expect(ENABLED_MODULES).toEqual(ALL_MODULES)`
 * và `expect(routesOf(ENABLED_MODULES)).toEqual(full)` cho MỌI app — tức "mọi app
 * phải nạp đủ mọi module". Luật đã đổi sang v3: **app CHỌN module, nhưng phải KHAI
 * mình chọn kiểu gì** (`instances/LUAT-SUPERAPP.md §2`).
 *
 * Hai dòng đó xanh cho tới hôm nay chỉ vì cả hai app đang khai `modules: 'all'`.
 * Doanh nghiệp đầu tiên khai một tập con sẽ đỏ ngay — và đỏ ở một bài mang tên
 * *"bất biến: mọi app sinh từ nền này có CÙNG tập tính năng"*, nên người đọc sẽ
 * kết luận mình vi phạm một bất biến sản phẩm chứ không kết luận bài kiểm đã lỗi
 * thời. Đó là chỗ đắt: một bài kiểm lỗi thời nói dối MẠNH HƠN một bài kiểm thiếu.
 *
 * Và nó ĐỌC SAI một vế trong chính câu của chủ nhân trích ở trên: câu ấy nói app
 * không được mất *"những tính năng mà NÓ ĐANG TÍCH HỢP"* — không nói mọi app phải
 * tích hợp mọi thứ. Bản v2 nới câu đó rộng hơn nguyên văn rồi ép bản rộng.
 *
 * ── Bất biến còn lại sau khi lật, và nó vẫn chặn đúng lỗ cũ ───────────────────
 * Lỗ `enabledModules` hỏng câm KHÔNG được mở lại, và nó không mở lại: cái phân
 * biệt "cố ý không lấy module mới" với "quên khai module mới" là **lời khai**
 * `'all'`, không phải một mảng trần. Nên ba vế phải ép:
 *   1. mọi app PHẢI khai `modules` — vắng là đỏ, không rơi về mặc định;
 *   2. app khai `'all'` thì tập route phải ĐÚNG BẰNG toàn bộ registry (vế cũ, giữ
 *      nguyên — chỉ thu hẹp phạm vi áp dụng lại cho đúng);
 *   3. app khai một mảng thì tập route phải là TẬP CON thật sự của registry, và
 *      mọi id trong mảng phải có thật.
 *
 * Vế 3 hôm nay **không phân biệt được hai bên đột biến** vì chưa app nào khai mảng
 * — ghi ra đây thay vì đếm nó vào số bài xanh.
 *
 * ── Nó KHÔNG đo được gì — đọc trước khi tin nó ───────────────────────────────
 *  · **Màn có render nổi không.** Bài kiểm đọc TÊN route, không dựng cây React.
 *    Route tới được mà màn trắng thì vẫn xanh.
 *  · **Module có SỐNG không.** `runtimeGate` phụ thuộc mạng lúc chạy; một app
 *    dựng thiếu biến môi trường sẽ hiện dữ liệu giả với giao diện y hệt. Đó là
 *    lỗ lớn nhất còn lại và jest không bịt được — nó thuộc về bước đối chiếu
 *    biến ở `.github/actions/rn-env`.
 *  · **Chữ có đúng ngữ cảnh không.** "Quét cây" trong app việc làm là đúng
 *    route, sai người dùng.
 *  · **Tầng native**: tên app, biểu tượng, mã gói, scheme. Không mã JS nào đo được.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { INSTANCES, ALL_MODULES, resolveInstance, resolveModules } from './instance.config';
import { MODULE_IDS } from '../navigation/moduleIds';
import { resolveVisibleTabs } from '../navigation/resolveVisibleTabs';
import type { ModuleId } from '../navigation/moduleIds';

/**
 * Đọc manifest TỪ ĐĨA thay vì import `MODULE_REGISTRY`.
 *
 * Registry import tĩnh mọi màn ⇒ kéo theo module native ⇒ jest chết ở một
 * `import Clipboard` cách đó bốn tầng. Cùng lối `routeTargets.test.ts` đã chọn.
 * Đánh đổi phải nói rõ: bài kiểm này đo HỢP ĐỒNG (manifest khai gì) chứ không đo
 * BẢN CÀI (registry có component chưa) — phần sau do `tsc` canh, vì registry khai
 * `Record<ModuleId, RegistryEntry>` nên thiếu một entry là đỏ lúc biên dịch.
 */
const MODULE_DIR = join(__dirname, '..', 'modules');
function manifestOf(id: ModuleId): { entrypoint: string; routes: string[] } {
  return JSON.parse(
    readFileSync(join(MODULE_DIR, id, 'module.manifest.json'), 'utf8'),
  );
}
const routesOf = (ids: readonly ModuleId[]) =>
  ids.flatMap(id => manifestOf(id).routes).sort();

const ids = Object.keys(INSTANCES);

describe('bất biến: app KHÔNG được lặng lẽ mất module nó đã khai', () => {
  // Chống-xanh-rỗng. Một bài kiểm duyệt qua mảng rỗng thì luôn xanh, và cái xanh
  // đó đọc y hệt cái xanh thật.
  it('bảng INSTANCES có ít nhất hai app, và registry có module', () => {
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ALL_MODULES.length).toBeGreaterThan(0);
  });

  it('`ALL_MODULES` dẫn xuất ĐÚNG từ registry — không phải danh sách viết tay', () => {
    expect([...ALL_MODULES].sort()).toEqual([...MODULE_IDS].sort());
  });

  // ĐÂY là bài kiểm chính. Mọi bài khác trong tệp chỉ đỡ cho nó.
  it('mọi app KHAI tập module của mình, và lời khai khớp tập route nạp được', () => {
    const full = routesOf(MODULE_IDS);
    expect(full.length).toBeGreaterThan(20);

    for (const id of ids) {
      const inst = INSTANCES[id];

      // Trường CŨ `enabledModules` là mảng trần, không phân biệt được "cố ý không
      // lấy" với "quên khai" ⇒ hỏng câm. Nó KHÔNG được quay lại, kể cả khi luật
      // mới đã cho phép chọn module: cái được phép là lời KHAI, không phải mảng trần.
      expect(inst).not.toHaveProperty('enabledModules');

      // Vế 1 — phải KHAI. Vắng là đỏ, không rơi về mặc định.
      expect(inst.modules).toBeDefined();

      const taken = resolveModules(inst);
      const routes = routesOf(taken);

      if (inst.modules === 'all') {
        // Vế 2 — `'all'` nghĩa là đủ registry, kể cả module thêm sau. Đây là vế cũ,
        // giữ nguyên; chỉ thu phạm vi lại cho đúng những app thật sự khai `'all'`.
        expect(taken.length).toBe(MODULE_IDS.length);
        expect(routes).toEqual(full);
      } else {
        // Vế 3 — mảng thì phải là tập con THẬT, và mọi id phải có thật trong registry.
        // ⚠ Hôm nay KHÔNG app nào đi vào nhánh này (cả hai khai `'all'`), nên nhánh
        // này chưa phân biệt được hai bên đột biến. Ghi ra thay vì tính nó là đã ghim.
        for (const m of taken) expect(MODULE_IDS).toContain(m);
        expect(taken.length).toBeLessThanOrEqual(MODULE_IDS.length);
        for (const r of routes) expect(full).toContain(r);
      }
    }
  });

  // Chặn đúng chỗ nhóm rà soát chỉ ra là hỏng tinh vi nhất: một bước "chuẩn hoá"
  // nở `'all'` thành mảng tường minh trông vô hại và LẶNG LẼ biến lời khai dương
  // thành danh sách âm — từ lần đó module thứ năm không vào, và không ai khai gì.
  it("`'all'` phải Ở LẠI dạng `'all'` — không được nở thành mảng tường minh", () => {
    const declared = ids.map(id => INSTANCES[id].modules);
    expect(declared).toContain('all');
    for (const id of ids) {
      const raw = INSTANCES[id].modules;
      if (Array.isArray(raw)) continue;
      expect(raw).toBe('all');
      // Và lời khai phải là chuỗi ở CẢ tệp JSON, không chỉ ở hằng TS — nơi doanh
      // nghiệp sửa là tệp JSON.
      const khai = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'instances', id, 'instance.json'), 'utf8'),
      );
      expect(khai.modules).toBe('all');
    }
  });

  it('mỗi module khai entrypoint nằm trong chính danh sách route của nó', () => {
    for (const id of ALL_MODULES) {
      const m = manifestOf(id);
      expect(m.routes).toContain(m.entrypoint);
    }
  });

  it('mỗi app khai đủ danh tính riêng, và không app nào trùng id', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const inst = INSTANCES[id];
      expect(inst.instanceId).toBe(id);
      expect(inst.displayName.length).toBeGreaterThan(0);
      // Tên thương hiệu phải là tên APP, không phải tên nền tảng bên dưới.
      expect(inst.themeConfig.brandName).toBe(inst.displayName);
    }
  });

  it('`initialTabRoute` của mỗi app nằm trong chính thanh tab của app đó', () => {
    for (const id of ids) {
      const inst = INSTANCES[id];
      const onBar = inst.tabs.map(t =>
        t.kind === 'host' ? t.route : manifestOf(t.moduleId).entrypoint,
      );
      expect(onBar).toContain(inst.initialTabRoute);
    }
  });

  it('mọi tab module của mọi app trỏ tới module CÓ THẬT trong registry', () => {
    for (const id of ids) {
      for (const tab of INSTANCES[id].tabs) {
        if (tab.kind === 'module') {
          expect(ALL_MODULES).toContain(tab.moduleId);
        }
      }
    }
  });

  // ── ĐÍNH CHÍNH THỨ HAI, 2026-09-14 — bài này so SAI HAI THỨ với nhau ──────────
  //
  // Bản trước (viết sáng cùng ngày) đòi hai app có **cùng một tập ô**, và đo bằng
  // cách so tập của app A với tập của app B. Tiền đề của nó là "mọi app nạp mọi
  // module" — đúng ngày cả hai khai `modules: 'all'`, và **hết đúng** khi CheckFarm
  // tắt `chat` cho đợt nộp (Apple guideline 1.2; lý do ở `CHECKFARM_INSTANCE.modules`).
  //
  // Nó lặp lại y nguyên lỗi mà phần đầu tệp này đã tả: một bài kiểm nới câu của chủ
  // nhân rộng hơn nguyên văn rồi ép bản rộng. Câu ấy nói app không được mất *"những
  // tính năng mà NÓ ĐANG TÍCH HỢP"* — mốc so là **lời khai của chính app đó**, không
  // phải lời khai của app bên cạnh. So chéo hai app thì app nào chọn một tập con cũng
  // đỏ, và đỏ dưới cái tên "vi phạm bất biến sản phẩm".
  //
  // Nên mốc so đổi: mỗi app tự đối chiếu với `modules` của CHÍNH NÓ. Lỗ cũ —
  // `enabledModules` hỏng câm, quên khai một module thì không ai kêu — vẫn bị bịt,
  // và bịt CHẶT HƠN trước: bản cũ chỉ phát hiện được khi hai app lệch nhau, nên hai
  // app cùng quên một module thì nó xanh.
  it('mỗi app KHÔNG được mất ô của module CHÍNH NÓ đã khai — mốc so là lời khai của nó', () => {
    // Ô nào trên thanh thuộc về module nào. Ô `host` (Ví, Home, Tôi) không thuộc
    // module nào nên không tham gia phép đo này.
    const entryOf = (m: string) => manifestOf(m as any).entrypoint;

    for (const id of ids) {
      const inst = INSTANCES[id];
      const declared = inst.modules === 'all' ? [...ALL_MODULES] : [...inst.modules];
      for (const persona of ['default', 'shipper'] as const) {
        const loiVao = new Set([inst.anchorLeft, ...inst.slotPriority[persona]]);
        for (const m of declared) {
          const entry = entryOf(m);
          // Module đã khai mà điểm vào của nó KHÔNG có mặt ở bất cứ nguồn ô nào —
          // ô trái, bảng tranh slot, hay mảng `tabs` — là ca "lặng lẽ mất tính năng".
          const onTabs = inst.tabs.some(t => t.kind === 'module' && t.moduleId === m);
          expect(loiVao.has(entry) || onTabs).toBe(true);
        }
        // Và chiều ngược lại: bảng ưu tiên KHÔNG được nêu điểm vào của một module
        // app này KHÔNG khai. Đây là vế bắt được ca CheckFarm sáng nay: `ChatHome`
        // còn nằm trong `slotPriority` sau khi `chat` đã tắt.
        const notDeclared = ALL_MODULES.filter(m => !declared.includes(m));
        for (const m of notDeclared) {
          expect([...loiVao]).not.toContain(entryOf(m));
        }
      }
    }
  });

  // Mặt kia của cùng một đồng xu. Bài trên cấm hai app khác TẬP; bài này cấm hai
  // app giống nhau ĐẾN MỨC bị cửa hàng đọc là một bản sao (Apple 4.3 "Spam —
  // bản sao chỉ khác biệt nhỏ", Google Play "nội dung trùng lặp").
  //
  // Đo ở CHỖ NGƯỜI XÉT DUYỆT ĐỨNG: họ cài máy sạch, chưa có vườn, chưa có lịch
  // sử dùng ⟹ persona `'new'` ⟹ bảng `default`. Nên ngưỡng ở ca đó chặt hơn.
  it('hai app phải ra hai thanh khác nhau — và khác ở NHIỀU HƠN một ô', () => {
    const thanh = (id: string, persona: 'default' | 'shipper') => {
      const inst = INSTANCES[id];
      return resolveVisibleTabs(
        { farms: 0, trees: 0, fruits: 0 },
        persona === 'shipper' ? { WorkHome: 9 } : {},
        null, () => true, inst.slotPriority, inst.anchorLeft,
      );
    };
    const lechBaoNhieuO = (a: string[], b: string[]) => {
      expect(a.length).toBe(b.length); // cùng bố cục 5 ô
      return a.filter((r, i) => r !== b[i]).length;
    };

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        // Máy sạch — đây là thứ người xét duyệt nhìn thấy.
        expect(lechBaoNhieuO(thanh(ids[i], 'default'), thanh(ids[j], 'default')))
          .toBeGreaterThanOrEqual(3);
        // Người đã dùng một thời gian — nhẹ hơn, nhưng KHÔNG được bằng 0.
        expect(lechBaoNhieuO(thanh(ids[i], 'shipper'), thanh(ids[j], 'shipper')))
          .toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('chọn instance lúc dựng', () => {
  it('id rỗng → Aladin (máy lập trình viên chưa dựng lại tệp biến)', () => {
    expect(resolveInstance(undefined).instanceId).toBe('aladin');
    expect(resolveInstance('').instanceId).toBe('aladin');
  });

  // Rơi sạch ở đây nghĩa là dựng ra app này rồi nộp cửa hàng dưới tên app kia —
  // một lỗi không có triệu chứng nào cho tới khi người dùng mở app ra.
  it('id LẠ thì NÉM, không rơi về mặc định', () => {
    expect(() => resolveInstance('tonfarm')).toThrow(/không có trong bảng INSTANCES/);
    expect(() => resolveInstance('Aladin')).toThrow(); // phân biệt hoa thường
  });

  it('mỗi id trong bảng đều tra được', () => {
    for (const id of ids) expect(resolveInstance(id).instanceId).toBe(id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHÁP NHÂN VẬN HÀNH — mỗi app một chủ, và không app nào mượn chủ của app khác.
//
// Trước 2026-08-29, `legal/policyContent.ts` giữ một hằng `OPERATOR` ghi cứng
// `name: 'Aladin'` cùng địa chỉ nhà riêng và hòm thư cá nhân của chủ Aladin, và
// `policyFor()` dùng nó cho MỌI app. Trang "Điều khoản & Chính sách" TRONG app
// CheckFarm nói rằng Aladin vận hành nó.
//
// Vì sao đó không phải lỗi thẩm mỹ: người dùng CheckFarm muốn yêu cầu xoá dữ
// liệu của mình sẽ viết thư tới pháp nhân không phát hành app họ đang cầm; và
// trang cửa hàng lại ghi nhà phát hành là CheckFarm. Hai văn bản mâu thuẫn, mỗi
// văn bản ở một nơi người dùng chỉ đọc được một — nên mâu thuẫn không lộ ra cho
// tới lúc có tranh chấp thật.
// ─────────────────────────────────────────────────────────────────────────────
describe('pháp nhân vận hành — mỗi app một chủ', () => {
  it('mỗi app khai pháp nhân của chính nó, không app nào bỏ trống tên', () => {
    for (const id of ids) {
      expect(INSTANCES[id].operator.name.trim().length).toBeGreaterThan(0);
    }
  });

  // ── DÙNG CHUNG PHÁP NHÂN: được, nhưng phải KHAI ────────────────────────────
  //
  // Hai bài dưới đây từng cấm THẲNG việc hai app trùng pháp nhân. Lệnh cấm đó
  // đúng với thực tế lúc nó được viết (hai app, hai công ty), và sai từ
  // 2026-09-10, khi chủ sở hữu quyết cho CheckFarm phát hành dưới pháp nhân
  // Aladin rồi chuyển giao sau.
  //
  // Chỗ khó là hai ca có TRẠNG THÁI DỮ LIỆU GIỐNG HỆT NHAU:
  //   (a) mượn có chủ ý  — hai app cùng một pháp nhân, và đó là quyết định
  //   (b) chép nhầm      — ai đó chép khối `operator` của app cũ sang app mới
  // Nới bài kiểm thành "cho trùng" thì (b) đi lọt và không có triệu chứng nào.
  // Giữ nguyên "cấm trùng" thì (a) đỏ, và người sửa sẽ nới bài kiểm — đường nào
  // cũng về chỗ mất phép canh.
  //
  // Nên phép đo không hỏi "có trùng không" mà hỏi "trùng này có được KHAI
  // không": `sharedWith` trỏ tới app cho mượn. Bản chép nhầm không mang lời khai
  // đó, nên nó vẫn đỏ — và đỏ kèm đúng câu cần đọc.
  it('trùng pháp nhân thì phải KHAI `sharedWith`, không được trùng lặng lẽ', () => {
    for (const id of ids) {
      for (const khac of ids) {
        if (khac === id) continue;
        if (INSTANCES[id].operator.name !== INSTANCES[khac].operator.name) continue;
        const khai = INSTANCES[id].operator.sharedWith;
        const khaiNguoc = INSTANCES[khac].operator.sharedWith;
        expect(
          khai === khac || khaiNguoc === id
            ? `${id}↔${khac}: có khai`
            : `${id}↔${khac}: TRÙNG pháp nhân mà không app nào khai sharedWith`,
        ).toBe(`${id}↔${khac}: có khai`);
      }
    }
  });

  it('`sharedWith` trỏ tới app CÓ THẬT, và app đó phải tự đứng tên', () => {
    // Cấm bắc cầu: A mượn B mà B lại mượn C thì không app nào trong dây thật sự
    // đứng tên, và trang chính sách của cả ba trỏ vào chỗ không ai chịu trách
    // nhiệm. Một bậc, không hơn.
    for (const id of ids) {
      const cho = INSTANCES[id].operator.sharedWith;
      if (!cho) continue;
      expect(ids).toContain(cho);
      expect(INSTANCES[cho].operator.sharedWith).toBeUndefined();
    }
  });

  it('mượn pháp nhân thì phải ghi luôn nơi CHUYỂN GIAO — nợ nằm trong dữ liệu', () => {
    // Không có bài này thì `sharedWith` thành một đường hợp thức hoá vĩnh viễn:
    // khai một chữ là hết đỏ, và không gì nhắc rằng đây là trạng thái tạm.
    for (const id of ids) {
      const op = INSTANCES[id].operator;
      if (!op.sharedWith) continue;
      expect(op.transferTo?.name?.trim() || '').not.toBe('');
      expect(op.transferTo?.since || '').toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Chuyển giao cho chính pháp nhân đang cho mượn thì không phải chuyển giao.
      expect(op.transferTo!.name).not.toBe(op.name);
    }
  });

  it('KHÔNG app nào mang địa chỉ hoặc hòm thư của app khác — trừ khi đã khai', () => {
    for (const id of ids) {
      const cua_toi = INSTANCES[id].operator;
      for (const khac of ids) {
        if (khac === id) continue;
        const cua_no = INSTANCES[khac].operator;
        // Đã khai mượn thì trùng địa chỉ là HỆ QUẢ, không phải triệu chứng — và
        // phải xét CẢ HAI CHIỀU. Chỉ hỏi `cua_toi.sharedWith` thì cặp
        // (app cho mượn, app đi mượn) vẫn đỏ ở lượt lặp ngược, vì app cho mượn
        // không khai gì cả — nó có phải đi mượn đâu.
        if (cua_toi.sharedWith === khac || cua_no.sharedWith === id) continue;
        if (cua_no.address) expect(cua_toi.address).not.toBe(cua_no.address);
        if (cua_no.contact) expect(cua_toi.contact).not.toBe(cua_no.contact);
      }
    }
  });

  it('MỌI app đã đủ địa chỉ + hòm thư — thiếu là chưa nộp cửa hàng được', () => {
    // Bài này từng ghim danh sách `['checkfarm']`, vì `null` là trạng thái THẬT
    // của một pháp nhân đang thành lập và bịa địa chỉ cho bài kiểm xanh thì tệ
    // hơn nhiều. CheckFarm cấp đủ ba trường ngày 01/09/2026, nên danh sách rỗng.
    //
    // Ghim rỗng CHẶT hơn ghim tên: danh sách có tên thì thêm một app thiếu dữ
    // liệu vẫn có thể lọt bằng cách sửa đúng dòng ghim — còn rỗng thì mọi app
    // thiếu đều đỏ, kể cả app chưa tồn tại hôm nay.
    //
    // Trở lại `null` là chuyện được phép (pháp nhân đổi, địa chỉ hết hiệu lực).
    // Lúc đó bài này đỏ, và đỏ ĐÚNG: nó nói app đó chưa nộp cửa hàng được. Sửa
    // bằng cách điền dữ liệu thật, đừng sửa bằng cách nới bài kiểm.
    const chuaDu = ids.filter(
      (id) => !INSTANCES[id].operator.address || !INSTANCES[id].operator.contact,
    );
    expect(chuaDu).toEqual([]);
  });
});

describe('trang chính sách nói đúng pháp nhân của app đang chạy', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { policyFor } = require('../legal/policyContent');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DEFAULT_INSTANCE } = require('./instance.config');

  const chuTrongTrang = (lang: string) => {
    const doc = policyFor(lang);
    return doc.sections.flatMap((s: { body: string[] }) => s.body).join('\n');
  };

  it('nêu tên pháp nhân của CHÍNH app đang chạy', () => {
    expect(chuTrongTrang('vi')).toContain(DEFAULT_INSTANCE.operator.name);
  });

  it('KHÔNG nêu địa chỉ hay hòm thư của pháp nhân app khác', () => {
    // Đây là bài kiểm quan trọng nhất của nhóm. Nó bắt đúng lỗi đã sống: trang
    // chính sách in địa chỉ nhà riêng của chủ một pháp nhân khác.
    //
    // Bỏ qua app nào DÙNG CHUNG pháp nhân với app đang chạy. Không bỏ thì bài
    // này tự mâu thuẫn với bài ngay trên nó: bài trên đòi trang phải NÊU địa chỉ
    // của pháp nhân đang vận hành, bài này cấm nêu địa chỉ đó vì nó cũng là địa
    // chỉ của app kia — cùng một chuỗi, hai bài đòi hai điều ngược nhau, và
    // không cách nào viết một trang chính sách thoả cả hai.
    //
    // Phần bài này canh thì KHÔNG mất: địa chỉ của một pháp nhân KHÔNG dính dáng
    // vẫn đỏ như cũ, vì app đó không có `sharedWith` trỏ về đây.
    const vi = chuTrongTrang('vi');
    const en = chuTrongTrang('en');
    const dangChay = DEFAULT_INSTANCE.instanceId;
    const dungChung = (id: string) =>
      INSTANCES[id].operator.sharedWith === dangChay ||
      DEFAULT_INSTANCE.operator.sharedWith === id;
    for (const id of ids) {
      if (id === dangChay) continue;
      if (dungChung(id)) continue;
      const khac = INSTANCES[id].operator;
      for (const gt of [khac.address, khac.addressEn, khac.contact]) {
        if (!gt) continue;
        expect(vi).not.toContain(gt);
        expect(en).not.toContain(gt);
      }
    }
  });

  it('thiếu địa chỉ thì nói THẲNG là chưa công bố, không để trống', () => {
    const vi = chuTrongTrang('vi');
    if (DEFAULT_INSTANCE.operator.address === null) {
      expect(vi).toContain('chưa công bố');
    } else {
      expect(vi).toContain(DEFAULT_INSTANCE.operator.address);
    }
    // Dù có hay không, không được lòi ra chữ 'null' hay 'undefined'.
    expect(vi).not.toMatch(/\b(null|undefined)\b/);
  });
});

describe('app tự xưng tên MÌNH, không xưng tên app khác', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { t } = require('../i18n/translate');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DEFAULT_INSTANCE } = require('./instance.config');

  // Không so với chuỗi tiếng Việt cố định: bộ kiểm chạy ở ngôn ngữ `en`, nên
  // `t()` trả bản dịch. Điều cần đo là CHỖ THAY, không phải bản dịch nào.
  it('`{brand}` trong chuỗi hiển thị được thay bằng tên app đang chạy', () => {
    for (const chuoi of [
      '{brand} cần Camera để chụp ảnh cây.',
      '{brand} cần GPS để nhận diện cây gần bạn.',
      'Cấp quyền GPS trong Cài đặt → {brand}.',
    ]) {
      const ra = t(chuoi);
      expect(ra).toContain(DEFAULT_INSTANCE.displayName);
      expect(ra).not.toContain('{brand}');
    }
  });

  it('chỗ thay được thay ở MỌI ngôn ngữ, không chỉ tiếng Việt', () => {
    // Bản dịch cũng phải mang `{brand}`. Chỉ sửa khoá tiếng Việt mà quên ba bản
    // dịch là người dùng tiếng Anh vẫn thấy tên app khác — và bài kiểm chạy ở
    // `en` nên nó bắt được đúng ca đó.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TRACE } = require('../i18n/phrases/trace');
    const muc = TRACE['{brand} cần Camera để chụp ảnh cây.'];
    for (const ban of Object.values(muc as Record<string, string>)) {
      expect(ban).toContain('{brand}');
      expect(ban).not.toContain('Aladin');
    }
  });

  it('chuỗi KHÔNG có chỗ thay thì không bị đụng vào', () => {
    expect(t('Cho phép')).not.toContain('{');
    expect(t('Cho phép')).not.toContain(DEFAULT_INSTANCE.displayName);
  });

  it('không còn chuỗi hiển thị nào ghi cứng tên app trong câu tự-xưng', () => {
    // Quét NGUỒN chứ không quét hàm thuần: `t()` vẫn đúng kể cả khi từ điển ghi
    // cứng 'Aladin' — hàm chỉ thay thứ nó thấy. Cái hỏng nằm ở CHUỖI, nên phải
    // đo chuỗi.
    //
    // Chỉ bắt câu app tự gọi chính nó. `AladinWork` là TÊN MỘT NỀN TẢNG KHÁC và
    // đúng ở mọi app — không đụng vào. `@aladin/...` là tiền tố khoá lưu trữ,
    // đổi là mất dữ liệu người dùng đã có — cũng không đụng.
    const CAM = [
      // tiếng Việt
      /Aladin cần /,
      /Cài đặt → Aladin/,
      /sử dụng Aladin\b/,
      /Hỏi Aladin /,
      // tiếng Anh — chỉ sửa khoá tiếng Việt mà quên bản dịch là lỗi im lặng
      /Aladin needs /,
      /Settings → Aladin/,
      /using Aladin\b/,
      /Ask Aladin /,
    ];
    const thuMuc = [join(__dirname, '..', 'i18n'), join(__dirname, '..', 'screens')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readdirSync, statSync } = require('fs');
    const quet = (d: string): string[] =>
      readdirSync(d).flatMap((n: string) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? quet(p) : /\.tsx?$/.test(n) && !n.includes('.test.') ? [p] : [];
      });
    const pham: string[] = [];
    for (const thu of thuMuc) {
      for (const tep of quet(thu)) {
        // Chuẩn hoá dấu phân cách TRƯỚC khi so đuôi: `join` trả dấu chéo ngược
        // trên Windows, nên phép so nguyên bản không bao giờ khớp và tệp lẽ ra
        // được bỏ qua lại bị quét — bài đỏ chỉ trên máy Windows.
        if (tep.replace(/\\/g, '/').endsWith('i18n/translate.ts')) continue; // chú thích giải thích chính lỗi này
        const noi = readFileSync(tep, 'utf8');
        for (const c of CAM) if (c.test(noi)) pham.push(`${tep} ~ ${c}`);
      }
    }
    expect(pham).toEqual([]);
  });
});

describe('khẩu hiệu — mỗi app một câu, không app nào mượn câu của app khác', () => {
  const LANGS = ['vi', 'en', 'zh', 'ja'] as const;

  it('mọi app khai đủ bốn thứ tiếng, không chuỗi nào rỗng', () => {
    expect(ids.length).toBeGreaterThanOrEqual(2); // chống-xanh-rỗng
    for (const id of ids) {
      const kh = INSTANCES[id].tagline;
      for (const lang of LANGS) {
        expect(typeof kh[lang]).toBe('string');
        expect(kh[lang].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('KHÔNG hai app nào dùng chung một câu, ở bất kỳ thứ tiếng nào', () => {
    // Đây là phép đo thay cho cái đã hỏng CÂM: khẩu hiệu từng là khoá dùng
    // chung `onboarding.tagline`, nên hai app hiện y một câu mà không gì đỏ.
    for (const lang of LANGS) {
      const cau = ids.map(id => INSTANCES[id].tagline[lang]);
      expect(new Set(cau).size).toBe(cau.length);
    }
  });

  it('khoá `onboarding.tagline` KHÔNG được dựng lại ở bộ chuỗi dùng chung', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { allKeys } = require('../i18n/keys');
    expect(allKeys()).not.toContain('onboarding.tagline');
  });

  it('màn chào đọc khẩu hiệu TỪ instance, không từ khoá dùng chung', () => {
    const src = readFileSync(join(__dirname, '..', 'screens', 'OnboardingScreen.tsx'), 'utf8');
    expect(src).toContain('DEFAULT_INSTANCE.tagline[lang]');
    expect(src).not.toContain("tk('onboarding.tagline')");
  });
});

describe('mọi trường của InstanceConfig đều có nơi ĐỌC', () => {
  /**
   * Chiều hỏng ít ai canh: giao diện đọc một khoá mà cấu hình không có thì `tsc`
   * đỏ ngay; còn cấu hình khai một trường mà KHÔNG giao diện nào đọc thì im lặng
   * hoàn toàn — người đặt giá trị tưởng nó đã lên app.
   *
   * Đã xảy ra trong chính tệp này: `displayName` từng có 0 nơi đọc, trong khi
   * `brandName` mặc định là tên một nền tảng khác (xem chú thích của trường đó).
   * Không gì đỏ cho tới lúc có người nhìn màn hình.
   */
  const SRC_DIR = join(__dirname, '..');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readdirSync, statSync } = require('fs');
  const scan = (d: string): string[] =>
    readdirSync(d).flatMap((n: string) => {
      const p = join(d, n);
      return statSync(p).isDirectory()
        ? scan(p)
        : /\.tsx?$/.test(n) && !n.includes('.test.') ? [p] : [];
    });

  it('không trường nào nằm chờ mà không chỗ nào đọc', () => {
    const cfg = readFileSync(join(__dirname, 'instance.config.ts'), 'utf8');
    const than = cfg.slice(cfg.indexOf('export interface InstanceConfig'));
    const truong = [...than.matchAll(/^ {2}(\w+)\??:/gm)].map(m => m[1]);
    expect(truong).toContain('tagline'); // chống-xanh-rỗng: biểu thức còn khớp

    const files = scan(SRC_DIR).filter(
      p => !p.replace(/\\/g, '/').endsWith('config/instance.config.ts'),
    );
    const noi = files.map(p => readFileSync(p, 'utf8')).join('\n');

    const treo = truong.filter(t => !new RegExp(`\\.${t}\\b`).test(noi));
    expect(treo).toEqual([]);
  });
});
