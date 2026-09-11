// hooks/useBiometricSensor.test.ts
//
// GHIM CẢ HÀNH VI LẪN ĐỘ PHỦ.
//
// Hành vi: quay về tiền cảnh thì ĐO LẠI. Độ phủ: không màn nào được tự đo cảm
// biến ở một `useEffect` chạy một lần nữa — vì đó chính là hình dạng đã sinh ra
// lỗ này, và nó không tự kêu: mã chạy đúng như viết, kiểu đúng, bài kiểm cũ xanh.
//
// ── Lỗ được đo trên iPhone 17 giả lập, 2026-09-11 ─────────────────────────
// Ghi danh Face ID trên máy giả lập → đưa app về tiền cảnh: màn vẫn báo "chưa
// thiết lập sinh trắc học". Tắt hẳn app rồi mở lại: nút sinh trắc sống.
// Hai đường độc lập cho cùng kết luận — một đường nguồn (`useEffect(...,[])`,
// không `AppState`), một đường hành vi (ảnh chụp trước/sau).

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';
import { AppState } from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import { useBiometricSensor, type BiometricSensor } from './useBiometricSensor';

jest.mock('react-native-biometrics');

const SRC = path.join(__dirname, '..');
const readSrc = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

type Probe = jest.Mock<Promise<{ available: boolean; biometryType: string }>, []>;

// Kho này không có `@testing-library/react-native`, và thêm một gói chỉ để chạy
// một hook thì đắt hơn mười dòng dưới đây. Một thành phần chủ nhà chỉ làm đúng
// việc gọi hook và ghi kết quả ra ngoài.
type Host = { last: BiometricSensor; unmount: () => void };

function mountHook(onLog?: (m: string, e: unknown) => void): Host {
  const host = { last: { available: null, biometryType: '' } } as Host;
  const Probe1: React.FC = () => {
    host.last = useBiometricSensor(onLog);
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(React.createElement(Probe1)); });
  host.unmount = () => act(() => { tree.unmount(); });
  return host;
}

/** Nhả hàng đợi vi tác vụ để các `await` bên trong hook chạy xong. */
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

/** Bắt hàm nghe `AppState` mà hook vừa đăng ký, để bắn sự kiện vào nó. */
function grabListener(): (s: string) => void {
  const add = AppState.addEventListener as unknown as jest.Mock;
  const call = add.mock.calls.find(c => c[0] === 'change');
  if (!call) throw new Error('Hook KHÔNG đăng ký AppState — đường đo lại đã mất.');
  return call[1] as (s: string) => void;
}

describe('useBiometricSensor — quay về tiền cảnh thì đo lại', () => {
  let probe: Probe;
  let remove: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    probe = jest.fn().mockResolvedValue({ available: false, biometryType: '' });
    (ReactNativeBiometrics as unknown as jest.Mock).mockImplementation(() => ({
      isSensorAvailable: probe,
    }));
    remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove } as never);
  });

  it('đo một lần lúc gắn cây, và `null` cho tới khi có kết quả', async () => {
    const host = mountHook();
    // Trước khi lời hứa giải quyết: CHƯA BIẾT, không phải "không có".
    expect(host.last.available).toBeNull();
    await settle();
    expect(host.last.available).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('🔴 CHỐT — bật sinh trắc rồi quay về `active`: trạng thái ĐỔI theo', async () => {
    const host = mountHook();
    await settle();
    expect(host.last.available).toBe(false);

    // Người dùng ra Cài đặt bật Face ID.
    probe.mockResolvedValue({ available: true, biometryType: 'FaceID' });

    await act(async () => { grabListener()('active'); });
    await settle();
    expect(host.last.available).toBe(true);
    expect(host.last.biometryType).toBe('FaceID');
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('chỉ `active` mới kích hoạt — `background`/`inactive` thì không đo', async () => {
    const host = mountHook();
    await settle();
    expect(host.last.available).toBe(false);

    await act(async () => {
      grabListener()('background');
      grabListener()('inactive');
    });
    await settle();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('một lần đo hỏng KHÔNG được tắt nút của cảm biến đang có thật', async () => {
    probe.mockResolvedValue({ available: true, biometryType: 'TouchID' });
    const host = mountHook();
    await settle();
    expect(host.last.available).toBe(true);

    // Lần sau ném. Giữ kết quả cũ — "đo hỏng" khác "máy không có cảm biến",
    // gộp hai thứ đó là dựng một cái vỏ im lặng.
    probe.mockRejectedValue(new Error('cầu native chết'));
    await act(async () => { grabListener()('active'); });
    await settle();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(host.last.available).toBe(true);
  });

  it('hỏng NGAY LẦN ĐẦU thì hạ về `false` — không treo ở `null` mãi', async () => {
    probe.mockRejectedValue(new Error('cầu native chết'));
    const log = jest.fn();
    const host = mountHook(log);
    await settle();
    expect(host.last.available).toBe(false);
    expect(log).toHaveBeenCalled();
  });

  it('tháo cây thì gỡ hàm nghe — không rò listener qua từng lần mở màn', async () => {
    const host = mountHook();
    await settle();
    host.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('độ phủ — không màn nào được tự đo cảm biến một lần rồi thôi', () => {
  // BẢN KHAI: mọi tệp trong `src/` nhắc `isSensorAvailable`, mỗi dòng kèm LÝ DO
  // nó được phép. Ranh giới không phải "ai gọi", mà là **kết quả có được giữ
  // làm trạng thái của một màn đang mở hay không** — chỉ trạng thái mới ôi đi
  // được. Đọc một lần ngay tại lúc hành động thì luôn tươi, và bắt nó đi qua
  // hook là làm phức tạp thêm mà không sửa gì.
  const allowed = [
    // Chỗ đo DUY NHẤT giữ trạng thái. Nghe `AppState` nên không ôi.
    'hooks/useBiometricSensor.ts',
    // Đọc một lần NGAY TRƯỚC khi ký, trong thân hàm xử lý — không giữ state.
    'screens/TreeIdentityScreen.tsx',
    // Chỉ nhắc tên trong chú thích giải thích `biometricKindFromType`. 0 lời gọi.
    'services/phoenixKeyAuthService.ts',
  ];

  it('chỉ những tệp đã khai mới nhắc `isSensorAvailable`', () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(name) || name.includes('.test.')) continue;
        if (fs.readFileSync(full, 'utf8').includes('isSensorAvailable')) {
          found.push(path.relative(SRC, full));
        }
      }
    };
    walk(SRC);
    expect(found.sort()).toEqual(allowed.sort());
  });

  // Ba màn GIỮ trạng thái cảm biến. Cả ba trước 2026-09-11 đều mang đúng một
  // hình dạng: `useEffect(..., [])` đo một lần. Cả ba phải đi qua hook.
  const stateful = [
    'screens/LoginScreen.tsx',
    'features/auth/screens/SignUpBiometricScreen.tsx',
    'screens/BiometricSettings.tsx',
  ];

  it.each(stateful)('%s đọc cảm biến QUA hook', file => {
    const source = readSrc(file);
    expect(`${file}: ${/useBiometricSensor\(/.test(source)}`).toBe(`${file}: true`);
    // Và không còn chỗ đặt trạng thái bằng tay — đó là dấu của bản sao cũ.
    expect(`${file}: ${/setSensorAvailable\(|setBiometricAvailable\(|setBiometryType\(/.test(source)}`)
      .toBe(`${file}: false`);
  });

  it('ca đối chứng — phép quét có thật sự mở được tệp', () => {
    // Không có dòng này thì một phép quét hỏng đường dẫn cũng ra danh sách rỗng
    // và bài trên vẫn xanh. Đây là chỗ phân biệt "không tìm thấy" với "không đo".
    expect(readSrc('hooks/useBiometricSensor.ts')).toContain('isSensorAvailable');
    expect(readSrc('screens/LoginScreen.tsx').length).toBeGreaterThan(1000);
  });
});
