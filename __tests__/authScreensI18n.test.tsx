// __tests__/authScreensI18n.test.tsx
//
// RÀ THẬT: vẽ màn Đăng nhập / Đăng ký bằng tiếng Nhật rồi soi CÂY ĐÃ VẼ xem còn
// sót chữ tiếng Việt (dấu thanh) hay chữ Hán-giản-thể-riêng-của-tiếng-Trung không.
//
// Vì sao soi cây đã vẽ chứ không đọc mã nguồn: chuỗi có thể tới màn qua nhiều
// đường (hằng module, ternary, prop truyền xuống). Chỉ đầu ra mới nói đúng thứ
// người dùng THẤY.
//
// Bỏ qua có chủ ý: tên riêng & thuật ngữ (Aladin, PhoenixKey, DID, MAGIC…) và dữ
// liệu người dùng — chúng cố ý không nằm trong từ điển.

import * as React from 'react';
import * as renderer from 'react-test-renderer';
import { act } from 'react';

import { installI18n } from '../src/i18n/install';
import { setLanguage } from '../src/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';

installI18n();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class {
    isSensorAvailable() {
      return Promise.resolve({ available: true, biometryType: 'Biometrics' });
    }
    simplePrompt() {
      return Promise.resolve({ success: true });
    }
  },
  BiometryTypes: { FaceID: 'FaceID', TouchID: 'TouchID', Biometrics: 'Biometrics' },
}));
jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (fn: any) => fn({ user: { currentUser: null }, chatbot: { enabled: false } }),
}));
jest.mock('../src/services/analytics', () => ({
  __esModule: true,
  default: { init: jest.fn(), startSession: jest.fn(), endSession: jest.fn(), stop: jest.fn() },
  useAnalytics: () => ({ trackPress: jest.fn(), trackAction: jest.fn() }),
}));

// Dấu thanh tiếng Việt — chỉ tiếng Việt mới có, đủ để bắt chuỗi chưa dịch.
const VI_DIACRITIC =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

// Chữ Hán KHÔNG dùng trong tiếng Nhật hiện đại (giản thể riêng của tiếng Trung).
// Bắt đúng lỗi "chọn tiếng Nhật mà hiện tiếng Trung".
const ZH_ONLY = /[识别认证语您复认设备账户扫码请输错误关闭这个来查询]/;

function collectText(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return out;
  }
  if (node.children) collectText(node.children, out);
  // placeholder của TextInput cũng là chữ người dùng đọc.
  if (typeof node.props?.placeholder === 'string') out.push(node.props.placeholder);
  return out;
}

// Bọc SafeAreaProvider đúng như App.tsx:67 làm ở thật. Không bọc thì
// `useSafeAreaInsets()` ném ngay khi vẽ — và bài kiểm sẽ đỏ vì lý do KHÔNG liên
// quan gì tới chuyện nó đang kiểm (chữ tiếng Nhật). `initialMetrics` cho inset
// tất định, khỏi phụ thuộc môi trường.
const TEST_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderInJa(Screen: React.ComponentType<any>): string[] {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    setLanguage('ja');
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <Screen />
      </SafeAreaProvider>,
    );
  });
  return collectText(tree!.toJSON());
}

afterEach(() => {
  act(() => {
    setLanguage('vi');
  });
});

describe('màn Đăng nhập ở tiếng Nhật', () => {
  const texts = () => renderInJa(require('../src/screens/LoginScreen').default);

  it('không còn chuỗi tiếng Việt nào lọt ra màn', () => {
    const sot = texts().filter((s) => VI_DIACRITIC.test(s));
    expect(sot).toEqual([]);
  });

  it('không hiện chữ Hán riêng của tiếng Trung', () => {
    const sot = texts().filter((s) => ZH_ONLY.test(s));
    expect(sot).toEqual([]);
  });
});

describe('màn Đăng ký (sinh trắc) ở tiếng Nhật', () => {
  const texts = () =>
    renderInJa(require('../src/features/auth/screens/SignUpBiometricScreen').default);

  it('không còn chuỗi tiếng Việt nào lọt ra màn', () => {
    const sot = texts().filter((s) => VI_DIACRITIC.test(s));
    expect(sot).toEqual([]);
  });

  it('không hiện chữ Hán riêng của tiếng Trung', () => {
    const sot = texts().filter((s) => ZH_ONLY.test(s));
    expect(sot).toEqual([]);
  });
});
