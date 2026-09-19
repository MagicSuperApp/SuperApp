/**
 * Ghim MỘT điều: KHÔNG lối vào nào được mở một module mà app đang dựng không khai.
 *
 * Cơ chế chọn module (`InstanceConfig.modules`, 2026-09-10) chỉ có giá trị bằng lối
 * vào YẾU NHẤT của nó. Đo trên máy ảo 2026-09-14: CheckFarm tắt `chat` thì thanh tab
 * bỏ Chat, cổng xoè bỏ Chat, nhưng khu "Dịch vụ" ở **màn chính** vẫn hiện thẻ
 * "TRÒ CHUYỆN" và bấm vào vẫn mở được — vì `HomeScreen` dựng lưới thẳng từ
 * `src/modules/index.ts`, một danh mục của NỀN với `available: true` cố định, không
 * hỏi cấu hình lần nào.
 *
 * Ba lối vào, ba tệp, cùng một điều kiện chép tay — và đúng một chỗ quên. Đó là lý do
 * `routeIsReachable` nay là hàm dùng chung ở `moduleCatalog`, và là lý do bài này đếm
 * lối vào thay vì kiểm từng cái một.
 *
 * Hậu quả nếu để hở: với Apple guideline 1.2, tắt một module nội dung-do-người-dùng
 * mà lối vào lớn nhất vẫn mở thì việc tắt không có tác dụng nào.
 */
import fs from 'fs';
import path from 'path';
import { MODULE_IDS } from './moduleIds';
import { moduleOwningRoute, routeIsReachable } from './moduleCatalog';
import { MODULES } from '../modules';
import { INSTANCES, ENABLED_MODULES } from '../config/instance.config';
import { resolveGateItems } from './resolveGateItems';
import { tk, allKeys, ONBOARDING_STRINGS } from '../i18n/keys';
import { dungBang, allBanners } from '../screens/homeBanners';

describe('routeIsReachable — phép hỏi dùng chung, và nó phân biệt được hai cực', () => {
  it('route của module ĐÃ khai thì tới được; route của module KHÔNG khai thì không', () => {
    // Đầu vào phải phân biệt hai bên, nếu không bài này chẳng kiểm gì.
    expect(routeIsReachable('ChatHome', ['chat'])).toBe(true);
    expect(routeIsReachable('ChatHome', ['trace'])).toBe(false);
  });

  it('route của HOST không thuộc module nào ⟹ luôn tới được, kể cả khi tập rỗng', () => {
    for (const r of ['Home', 'Account', 'PhoenixWallet']) {
      expect(moduleOwningRoute(r)).toBeNull();
      expect(routeIsReachable(r, [])).toBe(true);
    }
  });
});

describe('MỌI lối vào của app đang dựng đều tôn trọng lời khai `modules`', () => {
  const tatCa = [...MODULE_IDS];
  const daKhai = [...ENABLED_MODULES];
  const khongKhai = tatCa.filter(m => !daKhai.includes(m));

  it('bài này chỉ có nghĩa khi app đang dựng CÓ tắt ít nhất một module', () => {
    // Ghi ra thay vì im lặng: nếu app đang dựng bật hết thì hai bài dưới xanh vì
    // không có gì để bắt, chứ không phải vì cổng chặt. Forall §Kỷ luật phát ngôn 6.
    if (khongKhai.length === 0) {
      console.warn('[moduleEntryPoints] app đang dựng bật MỌI module ⟹ hai bài dưới không phân biệt được hai cực');
    }
    expect(tatCa.length).toBeGreaterThan(0);
  });

  it('CỔNG XOÈ không nêu route của module không khai', () => {
    const items = resolveGateItems({ farms: 0, trees: 0, fruits: 0 });
    const routes = items.flatMap(i => [i.route, ...(i.subActions ?? []).map(a => a.route)]);
    for (const r of routes) {
      const owner = moduleOwningRoute(r);
      if (owner !== null) expect(daKhai).toContain(owner);
    }
  });

  it('LƯỚI "Dịch vụ" ở màn chính lọc theo cùng phép hỏi đó', () => {
    // `VISIBLE_MODULES` là hằng cấp module trong `HomeScreen.tsx`, không xuất ra —
    // dựng cả màn đó trong jest thì kéo theo máy ảnh, ví, bản đồ. Nên đo hai vế:
    //   (1) phép lọc CÓ MẶT trong tệp, và lưới dùng bản đã lọc;
    //   (2) tập đã lọc tính được ở đây ra đúng kết quả mong đợi.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.tsx'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    expect(src).toMatch(/MODULES\.filter\(\s*\n?\s*m => routeIsReachable\(m\.routeName, ENABLED_MODULES\)/);
    // Lưới PHẢI vẽ từ bản đã lọc, không vẽ từ danh mục của nền.
    expect(src).toMatch(/\{VISIBLE_MODULES\.map\(/);
    expect(src).not.toMatch(/\{MODULES\.map\(/);

    const loc = MODULES.filter(m => routeIsReachable(m.routeName, daKhai));
    for (const m of loc) {
      const owner = moduleOwningRoute(m.routeName);
      if (owner !== null) expect(daKhai).toContain(owner);
    }
    // Và mỗi module KHÔNG khai phải biến mất thật khỏi lưới — vế này là vế bắt lỗi.
    for (const m of khongKhai) {
      expect(loc.map(x => moduleOwningRoute(x.routeName))).not.toContain(m);
    }
  });
});

describe('mỗi instance khai `modules` đều lọc được lưới — không phụ thuộc app đang dựng', () => {
  it('với MỌI app trong bảng, lưới lọc ra đúng tập module nó khai', () => {
    for (const id of Object.keys(INSTANCES)) {
      const inst = INSTANCES[id];
      const khai = inst.modules === 'all' ? [...MODULE_IDS] : [...inst.modules];
      const loc = MODULES.filter(m => routeIsReachable(m.routeName, khai));
      const ownersConLai = loc.map(m => moduleOwningRoute(m.routeName)).filter(Boolean);
      for (const o of ownersConLai) expect(khai).toContain(o);
      // Không được lọc quá tay: mọi module đã khai phải còn một thẻ trong lưới.
      for (const m of khai) {
        expect(ownersConLai).toContain(m);
      }
    }
  });
});

// ── Bề mặt THỨ TƯ: màn onboarding ────────────────────────────────────────────
//
// Ba bề mặt trên là LỐI VÀO — bấm được thì đi tới được. Màn onboarding không mở
// gì cả, nó chỉ HỨA. Nên nó lọt qua mọi bài đếm lối vào ở trên, và nó đã lọt
// thật: chủ nhân đi giả lập CheckFarm 18/09/2026 và thấy màn mở đầu giới thiệu
// "Trò chuyện" với "Việc làm" — hai module app đó không bật.
//
// Một lời hứa sai không sập app, nên không cổng nào kêu. Nó chỉ dạy người dùng
// ở đúng màn đầu tiên rằng app này nói không thật.
describe('màn onboarding hứa ĐÚNG những module app đang dựng có', () => {
  const KHOA_CO_THAT = allKeys();
  const nguon = fs.readFileSync(
    path.join(__dirname, '..', 'screens', 'OnboardingScreen.tsx'),
    'utf8',
  );

  it('khe được DẪN XUẤT từ ENABLED_MODULES, không kê tay', () => {
    expect(nguon).toMatch(/ENABLED_MODULES\.map\(/);
    // Vế bắt lỗi: bản cũ là một mảng `SLOTS` kê thẳng bốn phần tử. Cấm nó quay lại.
    expect(nguon).not.toMatch(/const SLOTS[^=]*=\s*\[/);
  });

  it('bảng khe phủ ĐỦ mọi ModuleId — thiếu một cái là `tsc` đỏ, bài này canh cùng chiều', () => {
    for (const m of MODULE_IDS) {
      expect(nguon).toMatch(new RegExp(`\\n\\s*${m}:\\s*\\{\\s*icon:`));
    }
  });

  it('mỗi module ĐÃ khai đều có khoá chuỗi để hiện, không ra khoá trần', () => {
    for (const m of ENABLED_MODULES) {
      expect(KHOA_CO_THAT).toContain(`onboarding.${m}.title`);
      expect(KHOA_CO_THAT).toContain(`onboarding.${m}.body`);
    }
  });
});

// ── Bề mặt THỨ NĂM: BĂNG TRƯỢT ở đầu màn chính ───────────────────────────────
//
// Đo trên máy ảo 19/09/2026, app CheckFarm (khai `['trace','join']`): băng trượt
// quảng cáo "Tính năng Trò chuyện sắp ra mắt" và "Tìm việc · Đặt thợ mọi lĩnh
// vực", hai module app đó KHÔNG bật — và bấm vào thì `moBang` gọi thẳng
// `navigate(tam.route)` không hỏi câu nào.
//
// Nó lọt qua cả bốn bài trên vì mỗi bài đếm một DANH MỤC đã biết (`MODULES`,
// `resolveGateItems`, `ENABLED_MODULES.map`), còn băng thì dựng từ một mảng viết
// thẳng trong `homeBanners.ts`. Đúng điều dòng đầu tệp này cảnh báo — "ba lối
// vào, ba tệp, cùng một điều kiện chép tay" — nay là năm.
//
// Và nó là bề mặt LỚN NHẤT: nó chiếm trọn bề ngang ngay dưới thanh trên, tự
// trượt, nên nó là thứ người dùng nhìn trước mọi thứ khác trên màn chính.
describe('BĂNG TRƯỢT màn chính chỉ mời module app đang dựng có khai', () => {
  const daKhai = [...ENABLED_MODULES];

  it('mọi tấm còn lại đều thuộc module đã khai', () => {
    for (const b of dungBang(null)) {
      expect(daKhai).toContain(b.moduleId);
    }
  });

  it('và mọi route của tấm còn lại đều tới được', () => {
    for (const b of dungBang(null)) {
      if (b.route) expect(routeIsReachable(b.route, daKhai)).toBe(true);
    }
  });

  // VẾ BẮT LỖI. Không có vế này thì hai bài trên xanh cả khi `dungBang` trả về
  // mảng rỗng, và xanh cả khi app đang dựng bật hết module — tức chúng xanh ở cả
  // hai cực của chính thứ chúng định đo.
  it('tập ĐẦY ĐỦ có tấm của module app đang dựng KHÔNG khai, và phép lọc bỏ đúng nó', () => {
    const tatCa = allBanners(null);
    const conLai = dungBang(null);
    const biBo = tatCa.filter(b => !conLai.some(c => c.id === b.id));

    const khongKhai = MODULE_IDS.filter(m => !daKhai.includes(m));
    for (const m of khongKhai) {
      // Module không khai mà tập đầy đủ CÓ tấm cho nó ⟹ tấm ấy phải nằm trong
      // phần bị bỏ, không được sót lại.
      if (tatCa.some(b => b.moduleId === m)) {
        expect(biBo.map(b => b.moduleId)).toContain(m);
      }
    }
    // Và không lọc quá tay: mọi tấm của module ĐÃ khai phải còn.
    for (const b of tatCa) {
      if (daKhai.includes(b.moduleId)) expect(conLai.map(x => x.id)).toContain(b.id);
    }
  });

  it('tấm tin — đi bằng `link` chứ không `route` — vẫn có khoá để lọc', () => {
    // Ca này là lý do `moduleId` được khai riêng thay vì suy từ `route`: khi có
    // tin thì tấm Truy xuất bỏ `route`, nên một phép lọc theo `route` sẽ để nó
    // qua BẤT KỂ app có khai `trace` hay không.
    const tinGia = {
      title: 'tin thử', link: 'https://vi-du.test/bai', source: 'Nguồn thử',
    } as never;
    const tam = allBanners(tinGia).find(b => b.id === 'b1')!;
    expect(tam.route).toBeUndefined();
    expect(tam.moduleId).toBe('trace');
  });
});

// ── Câu mời sang trang web phải mang HOST CỦA CHÍNH APP ĐANG DỰNG ────────────
//
// Nút này đã được vá một lần: ẩn đi khi app chưa khai `website`. Vá đó đúng và
// chưa đủ — nó chạm chỗ HIỆN, không chạm chỗ NÓI. Ngày CheckFarm được cấp trang
// web (18/09/2026) thì nút hiện ra, và nó mời người dùng CheckFarm sang
// `aladin.work`. Một nửa bản vá trông y hệt một bản vá đủ.
describe('câu onboarding.web lấy host từ cấu hình, không gõ tay', () => {
  it('bốn thứ tiếng đều mang chỗ thay {host}, không mang tên miền nào', () => {
    const entry = ONBOARDING_STRINGS['onboarding.web'];
    for (const lang of ['vi', 'en', 'zh', 'ja'] as const) {
      const s = entry[lang] as string;
      expect(s).toContain('{host}');
      // Vế bắt lỗi — đầu vào phân biệt được hai cực: bản cũ có chuỗi này, bản mới không.
      expect(s).not.toMatch(/aladin\.work|checkfarm\.com/);
    }
  });

  it('thay xong thì ra đúng host được truyền vào', () => {
    expect(tk('onboarding.web', { host: 'vi-du.test' })).toContain('vi-du.test');
    expect(tk('onboarding.web', { host: 'vi-du.test' })).not.toContain('{host}');
  });
});
