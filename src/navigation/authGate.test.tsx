/**
 * KHOÁ LẠI cổng sinh trắc ở gốc.
 *
 * Bài kiểm chia hai loại, cố ý:
 *
 *  A. Kiểm HÀM THUẦN + kiểm DỰNG — chứng minh cổng chặn đúng.
 *  B. Kiểm QUÉT MÃ NGUỒN của `navigation/index.tsx` — chứng minh cổng CÒN ĐƯỢC
 *     NỐI VÀO. Không có loại B thì ai đó gỡ `gateScreen(...)` khỏi navigator mà
 *     mọi bài kiểm loại A vẫn xanh nguyên: hàm còn đúng, chỉ là không ai gọi.
 *     Đây đúng lớp lỗi "test xanh trên đường không ai đi được".
 *
 * ── Bẫy đã tránh ────────────────────────────────────────────────────────────
 * `useNavigation` giả trả CÙNG MỘT object mỗi lượt render, như react-navigation
 * thật. Trả object mới mỗi lượt thì `useEffect` chạy lại vô hạn và một lỗi
 * thiếu phụ thuộc sẽ tự lành trong test.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

/** MỘT object duy nhất cho mọi lượt render — xem "Bẫy đã tránh". */
const mockNav = { reset: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };
let mockUser: unknown = null;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
}));

jest.mock('react-redux', () => ({
  useSelector: (fn: (s: any) => unknown) => fn({ user: { currentUser: mockUser } }),
}));

import {
  AuthGate,
  PUBLIC_ROUTES,
  NEVER_PUBLIC_ROUTES,
  gateScreen,
  isPublicRoute,
} from './authGate';

const NAV_SRC = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

/**
 * Tập TÊN ROUTE có thật, gộp từ HAI nguồn — vì bảng đường dẫn đến từ hai chỗ:
 * màn host khai thẳng trong `index.tsx`, màn module khai trong manifest. Đo một
 * nguồn thôi thì danh sách cấm nhìn như mục ruỗng ở đúng các màn module
 * (`ChatRoom`, `ContractDetail`, `Contracts`) — chỗ nguy hiểm nhất.
 */
const ROUTE_CO_THAT: ReadonlySet<string> = (() => {
  const ten = new Set<string>();
  for (const m of NAV_SRC.matchAll(/name: '([A-Za-z0-9_]+)'/g)) ten.add(m[1]);
  const goc = path.join(__dirname, '..', 'modules');
  for (const mod of fs.readdirSync(goc)) {
    const f = path.join(goc, mod, 'module.manifest.json');
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const r of d.routes || []) ten.add(r);
  }
  return ten;
})();

const Secret = () => <Text>24-tu-khoi-phuc</Text>;

beforeEach(() => {
  mockNav.reset.mockClear();
  mockUser = null;
});

describe('A — danh sách công khai', () => {
  it('không màn nào vừa công khai vừa nằm trong danh sách cấm', () => {
    const trung = PUBLIC_ROUTES.filter((r) => NEVER_PUBLIC_ROUTES.includes(r));
    expect(trung).toEqual([]);
  });

  it('mọi màn trong danh sách cấm đều CÓ THẬT trong navigator', () => {
    // Chặn danh sách cấm mục ruỗng: một tên đã bị đổi/xoá thì nó không còn
    // canh gì nữa mà bài kiểm vẫn xanh.
    const thieu = NEVER_PUBLIC_ROUTES.filter((r) => !ROUTE_CO_THAT.has(r));
    expect(thieu).toEqual([]);
  });

  it('mọi màn công khai đều CÓ THẬT trong navigator', () => {
    const thieu = PUBLIC_ROUTES.filter((r) => !ROUTE_CO_THAT.has(r));
    expect(thieu).toEqual([]);
  });

  it('SeedExport và ExportIdentity KHÔNG công khai', () => {
    expect(isPublicRoute('SeedExport')).toBe(false);
    expect(isPublicRoute('ExportIdentity')).toBe(false);
  });

  it('màn lạ chưa ai khai là màn ĐÓNG — mặc định đóng, không mặc định mở', () => {
    expect(isPublicRoute('ManMoiAiDoVuaThem')).toBe(false);
  });
});

describe('A — gateScreen', () => {
  it('màn công khai trả về ĐÚNG component cũ, không thêm lớp nào', () => {
    expect(gateScreen('Login', Secret)).toBe(Secret);
  });

  it('màn riêng tư trả về component KHÁC', () => {
    expect(gateScreen('SeedExport', Secret)).not.toBe(Secret);
  });

  it('gọi hai lần cho cùng một component trả về CÙNG tham chiếu', () => {
    // Sinh mới mỗi lượt là màn bị tháo/lắp lại sau mỗi render của navigator.
    const A = gateScreen('Guardian', Secret);
    const B = gateScreen('Guardian', Secret);
    expect(A).toBe(B);
  });
});

describe('A — AuthGate chặn thật', () => {
  it('CHƯA có phiên: KHÔNG dựng màn con lấy một khung hình', () => {
    mockUser = null;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AuthGate>
          <Secret />
        </AuthGate>,
      );
    });
    const chu = JSON.stringify(tree!.toJSON());
    expect(chu).not.toContain('24-tu-khoi-phuc');
  });

  it('CHƯA có phiên: đẩy về Login', () => {
    mockUser = null;
    act(() => {
      renderer.create(
        <AuthGate>
          <Secret />
        </AuthGate>,
      );
    });
    expect(mockNav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Login' }] });
  });

  it('CÓ phiên: dựng màn con bình thường, không đẩy đi đâu', () => {
    mockUser = { did: 'did:phoenix:abc' };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AuthGate>
          <Secret />
        </AuthGate>,
      );
    });
    expect(JSON.stringify(tree!.toJSON())).toContain('24-tu-khoi-phuc');
    expect(mockNav.reset).not.toHaveBeenCalled();
  });

  it('màn riêng tư qua gateScreen: chưa phiên thì nội dung KHÔNG lộ', () => {
    mockUser = null;
    const Gated = gateScreen('ChatRoom', Secret);
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Gated />);
    });
    expect(JSON.stringify(tree!.toJSON())).not.toContain('24-tu-khoi-phuc');
  });
});

describe('B — cổng CÒN ĐƯỢC NỐI vào navigator', () => {
  it('index.tsx nhập gateScreen', () => {
    expect(NAV_SRC).toContain("import { gateScreen } from './authGate';");
  });

  it('màn host đi qua cổng', () => {
    expect(NAV_SRC).toContain('component={gateScreen(s.name, s.component)}');
  });

  it('màn module đi qua cổng', () => {
    expect(NAV_SRC).toContain('component={gateScreen(route, component)}');
  });

  it('không còn chỗ nào đăng ký màn mà BỎ QUA cổng', () => {
    // Hai chuỗi này là hình dạng CŨ, trước khi có cổng. Chúng quay lại nghĩa là
    // cổng đã bị gỡ ở một trong hai vòng lặp.
    expect(NAV_SRC).not.toContain('component={s.component}');
    expect(NAV_SRC).not.toContain('component={component}');
  });
});
