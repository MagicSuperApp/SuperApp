/**
 * Phép canh cho tập màn HOST — bịt chỗ hở "im lặng" của danh mục module.
 *
 * Danh mục (`moduleCatalog.ts`) sinh từ `module.manifest.json`, nên nó chỉ nhìn
 * thấy thứ đã LÀ module. Mọi màn khai thẳng trong `HOST_STACK_SCREENS` nằm
 * ngoài tầm nhìn của nó — và trước tệp này, nằm ngoài mà **không dấu hiệu nào**.
 *
 * Mỗi bài dưới đây gắn với một đường hỏng cụ thể. Đường nào không có bài canh
 * thì đường đó mở — nên đọc phần "bài này KHÔNG canh gì" ở cuối tệp trước khi
 * tin rằng chỗ này đã kín.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { HOST_ROUTES } from './hostRoutes';
import { MODULE_CATALOG, moduleOwningRoute } from './moduleCatalog';
import { MODULE_IDS } from './moduleIds';

const NAV_SRC = join(__dirname, 'index.tsx');

/**
 * Đọc tên route thẳng từ MÃ, không import `index.tsx`.
 *
 * Vì sao không import: `index.tsx` kéo theo toàn bộ cây màn hình + module
 * native (camera, sinh trắc, three). Bài kiểm sẽ đo được đúng thứ nó muốn đo mà
 * phải khởi cả React Native — cùng lý do `moduleCatalog.ts` nhập manifest thay
 * vì nhập `registry.ts`.
 *
 * Cắt đúng mảng `HOST_STACK_SCREENS`, KHÔNG quét cả tệp: chuỗi `name: '…'` còn
 * xuất hiện ở `navigation.reset({ routes: [{ name: 'Login' }] })` và ở khối
 * tab. Quét cả tệp là đếm nhầm những chỗ đó thành màn host.
 */
function hostRoutesInSource(): string[] {
  const src = readFileSync(NAV_SRC, 'utf8');
  const start = src.indexOf('const HOST_STACK_SCREENS');
  expect(start).toBeGreaterThan(-1);

  // Kết thúc ở dòng `];` đầu tiên nằm ở cột 0 sau chỗ bắt đầu.
  const end = src.indexOf('\n];', start);
  expect(end).toBeGreaterThan(start);

  const block = src.slice(start, end);
  return [...block.matchAll(/name: '([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// 1. Tập host phải được KHAI — đây là bài canh ca "thêm màn, không ai biết"
// ---------------------------------------------------------------------------
describe('`HOST_ROUTES` khai đúng những gì host đang mang', () => {
  it('không màn host nào nằm ngoài lời khai', () => {
    const inSource = hostRoutesInSource();
    const chuaKhai = inSource.filter((r) => !(HOST_ROUTES as readonly string[]).includes(r));

    // Câu báo lỗi nói THẲNG việc phải làm. Chỗ hở này ra đời vì tập host lớn
    // dần mà không ai đếm; một dòng đỏ nói "thêm vào danh sách" thì người thêm
    // màn làm được ngay, còn một dòng đỏ nói "expected 55 to be 56" thì không.
    expect({ chuaKhai, canLam: 'thêm vào src/navigation/hostRoutes.ts' }).toEqual({
      chuaKhai: [],
      canLam: 'thêm vào src/navigation/hostRoutes.ts',
    });
  });

  it('không lời khai nào trỏ vào màn đã gỡ', () => {
    const inSource = new Set(hostRoutesInSource());
    const khaiThua = (HOST_ROUTES as readonly string[]).filter((r) => !inSource.has(r));

    // Chiều ngược lại cũng phải canh: gỡ một màn mà quên gỡ lời khai thì danh
    // sách này biến thành tài liệu chết, và lần sau người đọc nó tin một tập
    // không còn đúng.
    expect({ khaiThua, canLam: 'gỡ khỏi src/navigation/hostRoutes.ts' }).toEqual({
      khaiThua: [],
      canLam: 'gỡ khỏi src/navigation/hostRoutes.ts',
    });
  });

  it('không tên nào khai hai lần', () => {
    expect(new Set(HOST_ROUTES).size).toBe(HOST_ROUTES.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Host và module KHÔNG được giẫm lên nhau
// ---------------------------------------------------------------------------
describe('một route thuộc về host HOẶC một module, không thuộc cả hai', () => {
  it.each(HOST_ROUTES as unknown as string[])(
    '%s: không module nào trong danh mục nhận là của mình',
    (route) => {
      // Trùng ở đây là ca hỏng KHÔNG triệu chứng: tắt module thì route vẫn còn
      // vì host đăng ký nó, nên "tắt module" trông như đã tắt mà thật ra chưa.
      expect(moduleOwningRoute(route)).toBeNull();
    },
  );

  it('mọi route module đều KHÔNG nằm trong tập host', () => {
    const hostSet = new Set<string>(HOST_ROUTES as readonly string[]);
    const trung: string[] = [];
    for (const id of MODULE_IDS) {
      for (const r of MODULE_CATALOG[id].routes) {
        if (hostSet.has(r)) trung.push(`${id}:${r}`);
      }
    }
    expect(trung).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Câu hỏi "app này GỒM những gì" phải trả lời được
// ---------------------------------------------------------------------------
describe('mặt tiếp xúc của app đếm được', () => {
  it('tập host + tập module phủ hết, và tập host lớn hơn hẳn tập module', () => {
    const routeModule = MODULE_IDS.flatMap((id) => MODULE_CATALOG[id].routes);

    // KHÔNG ghim con số 55/22 vào đây: ghim thì mỗi lần thêm một màn lại đỏ hai
    // bài cùng lúc, và bài thứ hai không nói thêm gì. Bài 1 đã canh chuyện
    // thêm/bớt. Cái đáng canh ở đây là QUAN HỆ: chừng nào host còn mang nhiều
    // route hơn cả bốn module cộng lại, câu "app chọn được mặt tiếp xúc của
    // mình" vẫn chưa đúng, và tệp `hostRoutes.ts` vẫn phải còn lời cảnh báo đó.
    expect(HOST_ROUTES.length).toBeGreaterThan(routeModule.length);
  });
});

/**
 * ── Bài ở tệp này KHÔNG canh gì ─────────────────────────────────────────────
 *
 * 1. **Không canh chuyện màn host có TỚI ĐƯỢC không.** Một màn khai trong
 *    `HOST_STACK_SCREENS` mà không nút nào trỏ tới vẫn đi qua hết các bài trên.
 *    `TreeMap2D`/`FarmMap2D` đang đúng trạng thái đó (giữ đăng ký cho deep-link
 *    cũ). Muốn canh thì phải đo lối vào, việc khác.
 *
 * 2. **Không canh chuyện màn nào ĐÁNG LẼ phải là module.** Đó là quyết định sản
 *    phẩm. Tệp này chỉ làm cho tập ấy thôi vô hình.
 *
 * 3. **Không canh mã bị kéo vào gói.** `registry.ts` import tĩnh mọi màn, nên
 *    tắt module không làm gói nhẹ đi — cảnh báo đó đã có sẵn ở đầu
 *    `moduleCatalog.ts`, và tệp này không đổi được điều đó.
 */
