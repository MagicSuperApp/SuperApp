/**
 * Chọn module theo app — phép canh cho trục `InstanceConfig.modules`.
 *
 * Trục này mở lại một thứ từng bị CẤM (`instances/LUAT-SUPERAPP.md §2` đời v1,
 * v2). Lệnh cấm cũ có lý do thật: trường `enabledModules` đời đầu hỏng CÂM —
 * app quên khai module mới thì lặng lẽ thiếu tính năng, không ai kêu.
 *
 * Nên tệp này tồn tại để trả lời đúng một câu: **cái làm lệnh cấm cũ cần thiết
 * đã được bịt chưa.** Mỗi bài dưới đây gắn với một đường hỏng cụ thể, và đường
 * nào không có bài canh thì đường đó mở.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { INSTANCES, ALL_MODULES, resolveModules } from './instance.config';
import { MODULE_IDS, type ModuleId } from '../navigation/moduleIds';
import { MODULE_CATALOG, MODULE_CATALOG_LIST, moduleOwningRoute } from '../navigation/moduleCatalog';

const ROOT = join(__dirname, '..', '..');
const readInstanceJson = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, 'instances', id, 'instance.json'), 'utf8'));

const ids = Object.keys(INSTANCES);

// ---------------------------------------------------------------------------
// 1. Lời khai phải HỢP LỆ
// ---------------------------------------------------------------------------
describe('lời khai `modules` của từng app', () => {
  it.each(ids)('%s: khai `all` hoặc một danh sách id CÓ THẬT', (id) => {
    const declared = INSTANCES[id].modules;
    if (declared === 'all') return;

    expect(Array.isArray(declared)).toBe(true);
    // Rỗng không phải "app tối giản" mà là app không có màn nào — nếu thật sự
    // muốn thế thì đó không phải một app, và để nó lọt là để một bản dựng trắng
    // đi tới tận cửa hàng.
    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(declared).size).toBe(declared.length);
    declared.forEach((m) => expect(ALL_MODULES).toContain(m));
  });

  it.each(ids)('%s: `instance.json` và bản TypeScript khai GIỐNG nhau', (id) => {
    // Hai nguồn cùng mô tả một app: JSON là thứ kho của doanh nghiệp giữ, TS là
    // thứ ứng dụng chạy. Trôi khỏi nhau thì bản dựng mang tập module của bên
    // này còn tài liệu và công cụ đọc bên kia — không bên nào sai rõ ràng.
    const fromJson = readInstanceJson(id).modules;
    expect(fromJson).toEqual(INSTANCES[id].modules);
  });
});

// ---------------------------------------------------------------------------
// 2. `'all'` phải THẬT SỰ là cả sổ — đây là bài canh ca "quên khai"
// ---------------------------------------------------------------------------
describe('`all` nghĩa là cả sổ, kể cả module thêm sau', () => {
  it('app khai `all` nhận đúng `ALL_MODULES`, không phải một ảnh chụp', () => {
    // Nếu ai đó "tối ưu" `resolveModules` thành một mảng viết cứng, bài này đỏ
    // ngay lần thêm module thứ năm. Đó chính là ca mà lệnh cấm đời v1 sinh ra
    // để chặn, và nay nó được chặn bằng phép đo thay vì bằng lệnh cấm.
    const allApps = ids.filter((id) => INSTANCES[id].modules === 'all');
    expect(allApps.length).toBeGreaterThan(0);
    allApps.forEach((id) => {
      expect(resolveModules(INSTANCES[id]).sort()).toEqual([...ALL_MODULES].sort());
    });
  });

  it('`resolveModules` trả BẢN SAO — sửa kết quả không sửa được sổ gốc', () => {
    const got = resolveModules(INSTANCES[ids[0]]);
    got.pop();
    expect(ALL_MODULES.length).toBe(MODULE_IDS.length);
  });
});

// ---------------------------------------------------------------------------
// 3. Không app nào được trỏ tới module CHÍNH NÓ đã tắt
// ---------------------------------------------------------------------------
describe('cấu hình điều hướng không trỏ vào module đã tắt', () => {
  it.each(ids)('%s: mọi tab kind=module nằm trong tập BẬT', (id) => {
    const on = resolveModules(INSTANCES[id]);
    INSTANCES[id].tabs.forEach((tab) => {
      if (tab.kind !== 'module') return;
      expect(on).toContain(tab.moduleId);
    });
  });

  it.each(ids)('%s: mọi route trong `slotPriority` TỚI ĐƯỢC', (id) => {
    // Đây là đường hỏng câm đắt nhất của cơ chế này, và nó KHÔNG đi qua bảng
    // `tabs`: `slotPriority` là bảng THỨ TỰ ROUTE, không biết gì về module. App
    // tắt `work` mà bảng còn liệt `WorkHome` thì cổng xoè vẫn vẽ đúng mục đó,
    // người dùng bấm, và điều hướng tới một route chưa đăng ký — không màn nào
    // hiện, không lỗi nào ném.
    //
    // `resolveGateItems` đã lọc lúc chạy. Bài này canh tầng CẤU HÌNH, vì một mục
    // biến mất lặng lẽ khỏi cổng cũng là hỏng — chỉ khác là hỏng ở phía người
    // khai chứ không phía người dùng.
    const on = resolveModules(INSTANCES[id]);
    const table = INSTANCES[id].slotPriority;
    [...table.default, ...table.shipper].forEach((route) => {
      const owner = moduleOwningRoute(route);
      if (owner === null) return; // route của host shell
      expect(on).toContain(owner);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Danh mục phải khớp thứ ứng dụng thật sự chạy
// ---------------------------------------------------------------------------
describe('danh mục module', () => {
  it('phủ ĐÚNG sổ module, không thiếu không dư', () => {
    expect(MODULE_CATALOG_LIST.map((e) => e.id)).toEqual([...MODULE_IDS]);
  });

  it.each([...MODULE_IDS])('%s: khớp nguyên văn `module.manifest.json`', (id) => {
    // Danh mục đọc manifest, nhưng nó ép kiểu ở biên. Ép sai trường (chép nhầm
    // `route` thành `entrypoint` chẳng hạn) thì màn chọn hiện một điểm vào khác
    // với điểm vào thật, và chỉ lộ khi có người bấm.
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'src', 'modules', id, 'module.manifest.json'), 'utf8'),
    );
    const e = MODULE_CATALOG[id as ModuleId];
    expect(e.qualifiedId).toBe(manifest.moduleId);
    expect(e.entrypoint).toBe(manifest.entrypoint);
    expect(e.navSlot).toBe(manifest.navSlot);
    expect(e.routes).toEqual(manifest.routes);
    expect(e.displayName).toEqual(manifest.displayName);
  });

  it.each([...MODULE_IDS])('%s: entrypoint nằm trong chính routes của nó', (id) => {
    const e = MODULE_CATALOG[id as ModuleId];
    expect(e.routes).toContain(e.entrypoint);
  });

  it('KHÔNG hai module nào cùng sở hữu một route', () => {
    // `moduleOwningRoute` trả module ĐẦU TIÊN khớp. Hai module cùng khai một
    // route thì hàm đó trả một cái tuỳ thứ tự trong sổ, và việc route còn tới
    // được hay không phụ thuộc app bật đúng cái nào — hỏng theo cách đọc mã
    // không thấy được.
    const owner = new Map<string, ModuleId>();
    const clash: string[] = [];
    MODULE_CATALOG_LIST.forEach((e) => {
      e.routes.forEach((r) => {
        if (owner.has(r)) clash.push(`${r}: ${owner.get(r)} & ${e.id}`);
        else owner.set(r, e.id);
      });
    });
    expect(clash).toEqual([]);
  });

  it('mọi module nêu rõ quyền nó cần — doanh nghiệp bấm chọn phải thấy trước', () => {
    // Bật một module là bật quyền của nó (máy ảnh, vị trí, đọc hồ sơ), và đó là
    // thứ người phát hành phải khai trên trang cửa hàng. Một dòng danh mục
    // không có phần này là một lựa chọn không nói hết cái giá của nó.
    MODULE_CATALOG_LIST.forEach((e) => {
      const total =
        (e.capabilities.data?.length ?? 0) +
        (e.capabilities.device?.length ?? 0) +
        (e.capabilities.network?.length ?? 0);
      expect(total).toBeGreaterThan(0);
    });
  });
});
