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
 * Nay tập module là hằng dẫn xuất (`ALL_MODULES`). Bài kiểm này canh việc KHÔNG
 * ai lặng lẽ trả nó về thành một lựa chọn.
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

import { INSTANCES, ALL_MODULES, ENABLED_MODULES, resolveInstance } from './instance.config';
import { MODULE_IDS } from '../navigation/moduleIds';
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

describe('bất biến: mọi app sinh từ nền này có CÙNG tập tính năng', () => {
  // Chống-xanh-rỗng. Một bài kiểm duyệt qua mảng rỗng thì luôn xanh, và cái xanh
  // đó đọc y hệt cái xanh thật.
  it('bảng INSTANCES có ít nhất hai app, và registry có module', () => {
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ALL_MODULES.length).toBeGreaterThan(0);
  });

  it('`ALL_MODULES` dẫn xuất ĐÚNG từ registry — không phải danh sách viết tay', () => {
    expect([...ALL_MODULES].sort()).toEqual([...MODULE_IDS].sort());
    expect(ENABLED_MODULES).toEqual(ALL_MODULES);
  });

  // ĐÂY là bài kiểm chính. Mọi bài khác trong tệp chỉ đỡ cho nó.
  it('mọi app nạp CÙNG một tập route module, và tập đó phủ hết registry', () => {
    const full = routesOf(MODULE_IDS);
    expect(full.length).toBeGreaterThan(20);

    for (const id of ids) {
      const inst = INSTANCES[id];
      // Instance KHÔNG được có đường riêng để thu hẹp tập module. Nếu ai đó thêm
      // lại một trường như vậy, dòng dưới bắt được ngay.
      expect(inst).not.toHaveProperty('enabledModules');
      expect(routesOf(ENABLED_MODULES)).toEqual(full);
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

  // Thứ tự ô ĐƯỢC PHÉP khác nhau — nhưng TẬP ô thì không. Khác tập nghĩa là một
  // app có một điểm vào mà app kia không có, và đó lại là vi phạm yêu cầu cứng
  // dưới một cái tên khác.
  it('hai app có thể khác THỨ TỰ ô dịch vụ, nhưng phải cùng TẬP ô', () => {
    const setOf = (a: string[]) => [...a].sort().join(',');
    const base = setOf(INSTANCES[ids[0]].slotPriority.default);
    for (const id of ids) {
      const sp = INSTANCES[id].slotPriority;
      expect(setOf(sp.default)).toBe(base);
      expect(setOf(sp.shipper)).toBe(base);
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
