/**
 * LoginNetworkScreen — máy KHÔNG có sinh trắc dùng được.
 *
 * ── Chỗ hỏng bài kiểm này ghim ──────────────────────────────────────────────
 * Bản trước mở `runBiometric` bằng `if (busy || noSensor) return;` — thoát IM
 * LẶNG. Nút dưới đáy vẫn sáng, vì `cta.disabled` chỉ đo trạng thái DANH TÍNH và
 * không biết gì về cảm biến; vòng tròn sinh trắc giữa màn cũng vẫn bấm được. Cả
 * hai lối dẫn tới đúng dòng `return` ấy, nên người dùng bấm — không gì xảy ra —
 * bấm lại — vẫn không gì xảy ra, và không một chữ nào trên màn giải thích.
 *
 * Đo trên máy ảo 19/09/2026 (CheckFarm, iPhone 17 Pro, Face ID chưa ghi): ba lần
 * bấm, không một phản hồi nào. Đây đúng ca `Forall §Cái vỏ im lặng` — app không
 * hiện SAI, nó KHÔNG hiện gì cho một trạng thái nó đã biết rõ.
 *
 * ── Vì sao ca này đáng một tệp riêng ────────────────────────────────────────
 * `noSensor` gộp HAI ca, và ca thứ hai mới là ca đông: máy có cảm biến nhưng
 * người dùng chưa ghi vân tay/khuôn mặt nào. `isSensorAvailable()` trả `false`
 * cho cả hai. Số công bố: ~81% máy có sinh trắc đang bật (Cisco Duo 2022), một
 * khảo sát 1.220 người đo ~34% không dùng sinh trắc nào. Tức đây không phải một
 * ca biên — nó là quãng 1/5 tới 1/3 số người mở app, và cao hơn ở người lớn
 * tuổi, đúng nhóm người dùng chính của app này.
 *
 * ── Cặp ca, không phải một ca ───────────────────────────────────────────────
 * Một ca đơn "không có cảm biến ⇒ có hộp thoại" XANH Ở CẢ HAI CỰC: nối đúng
 * điều kiện, hay gán cứng cho hộp thoại luôn hiện, đều làm nó xanh. Nên phải có
 * cả cực kia:
 *   1. `available: false` ⇒ CÓ hộp thoại, và hộp thoại có nút mở Cài đặt
 *   2. `available: true`  ⇒ KHÔNG hộp thoại nào của nhánh này, và luồng đi tiếp
 *      tới bước ký thử (`signRaw` được gọi)
 *
 * Ca 2 là vế bắt lỗi: thiếu nó thì một dòng `showError(...)` gán cứng ngay đầu
 * `runBiometric` cũng qua được bài.
 *
 * Harness lấy theo `LoginNetworkScreen.deadKeyExit.test.tsx` — cùng màn, cùng lý
 * do giữ `mockNav`/analytics ỔN ĐỊNH qua các lượt vẽ.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const React_ = require('react');
  return {
    useNavigation: () => mockNav,
    useFocusEffect: (cb: () => void | (() => void)) => React_.useEffect(cb, [cb]),
    useIsFocused: () => true,
  };
});

jest.mock('@react-three/fiber/native', () => ({
  Canvas: () => null,
  useFrame: () => undefined,
  useThree: () => ({ camera: {}, size: { width: 0, height: 0 }, gl: {} }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockTrackPress = jest.fn();
const mockAnalytics = {
  trackPress: mockTrackPress,
  trackAction: jest.fn(),
  trackTap: jest.fn(),
  trackInput: jest.fn(),
};
jest.mock('../services/analytics', () => ({ useAnalytics: () => mockAnalytics }));

const mockUnwrap = jest.fn(() => Promise.resolve());
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('../store/userSlice', () => ({
  loginUser: (u: unknown) => ({ type: 'user/login', payload: u }),
}));

/**
 * Cảm biến — đổi được GIỮA CÁC CA.
 *
 * Trả về từ một biến chứ không gán cứng: hai ca của bài này khác nhau ĐÚNG ở giá
 * trị `available`, và nếu bản giả gán cứng thì hai ca chạy trên cùng một đầu
 * vào, tức bài không phân biệt được hai cực nó định đo.
 */
let mockSensorAvailable = false;
jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class {
    isSensorAvailable() {
      return Promise.resolve({
        available: mockSensorAvailable,
        biometryType: mockSensorAvailable ? 'TouchID' : undefined,
      });
    }
  },
  BiometryTypes: { FaceID: 'FaceID', TouchID: 'TouchID', Biometrics: 'Biometrics' },
}));

const mockCurrentUserDid = jest.fn();
const mockIsKeypairEnrolled = jest.fn();
const mockSignRaw = jest.fn();
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: (...a: unknown[]) => mockCurrentUserDid(...a),
  isKeypairEnrolled: (...a: unknown[]) => mockIsKeypairEnrolled(...a),
  signRaw: (...a: unknown[]) => mockSignRaw(...a),
  wipeIdentity: jest.fn(),
}));

const mockUnlockExistingIdentity = jest.fn();
jest.mock('../services/phoenixKeyAuthService', () => ({
  biometricKindFromType: () => 'fingerprint',
  phoenixKeyAuth: {
    unlockExistingIdentity: (...a: unknown[]) => mockUnlockExistingIdentity(...a),
  },
}));

jest.mock('../services/phoenixKey-native', () => {
  const actual = jest.requireActual('../services/phoenixKey-native');
  return { ...actual, isAvailable: () => true };
});

const mockShowError = jest.fn();
jest.mock('../utils/alert', () => ({
  showError: (...a: unknown[]) => mockShowError(...a),
  showSuccess: jest.fn(),
  showInfo: jest.fn(),
  showWarning: jest.fn(),
}));

jest.mock('../components/LanguagePickerModal', () => 'LanguagePickerModal');

import { Linking } from 'react-native';
import LoginNetworkScreen from './LoginNetworkScreen';

/**
 * Bắt `openSettings` bằng `spyOn` trên CHÍNH đối tượng màn hình dùng.
 *
 * Bản đầu `jest.mock('react-native/Libraries/Linking/Linking', …)` — đường đó
 * KHÔNG phải đường mà `import { Linking } from 'react-native'` phân giải tới ở
 * preset này, nên bản giả không bao giờ được lắp và `Linking.openSettings` là
 * `undefined`. Lời gọi ném `TypeError`, và nếu ca này chỉ hỏi "hộp thoại có nút
 * không" thì nó vẫn XANH — một bản giả đặt sai chỗ trông y hệt một bản giả đúng.
 */
const mockOpenSettings = jest.fn(() => Promise.resolve());

// ── Dụng cụ ─────────────────────────────────────────────────────────────────

type AlertAction = { text: string; style?: string; onPress?: () => void };
type AlertOpts = { actions?: AlertAction[] };

function shownDialogs(): { title: string; body: string; opts?: AlertOpts }[] {
  return mockShowError.mock.calls.map((c) => ({
    title: String(c[0]),
    body: String(c[1] ?? ''),
    opts: c[2] as AlertOpts | undefined,
  }));
}

function nodeByTestID(tree: renderer.ReactTestRenderer, testID: string) {
  return tree.root
    .findAllByProps({ testID })
    .filter((n) => typeof n.props.onPress === 'function');
}

function ctaNode(tree: renderer.ReactTestRenderer) {
  const found = nodeByTestID(tree, 'login-primary-cta');
  if (found.length === 0) throw new Error('không tìm thấy nút `login-primary-cta`');
  return found[0];
}

/**
 * Lối vào đăng nhập của màn, theo đúng cái người dùng THẤY.
 *
 * Từ 2026-09-19 nút chữ `login-primary-cta` chỉ còn hiện trên máy KHÔNG có cảm
 * biến; máy có cảm biến thì lối vào duy nhất là vòng tròn sinh trắc. Hàm này
 * chọn đúng cái đang có mặt, nên các ca bên dưới đo HÀNH VI của lối vào chứ
 * không đo sự tồn tại của một nút cụ thể — và chúng không phải viết lại lần nữa
 * nếu bố cục đổi tiếp.
 */
function loiVao(tree: renderer.ReactTestRenderer) {
  const chu = nodeByTestID(tree, 'login-primary-cta');
  if (chu.length > 0) return chu[0];
  const vong = nodeByTestID(tree, 'login-biometric-button');
  if (vong.length === 0) throw new Error('màn không còn lối vào đăng nhập nào');
  return vong[0];
}

/** Máy CÓ khoá và CÓ DID — để nhãn nút là "Đăng nhập", tức hành động `unlock`. */
function deviceAlreadyHasIdentity() {
  mockCurrentUserDid.mockResolvedValue(
    'did:phoenix:abcdefghijklm:' + 'a'.repeat(64),
  );
  mockIsKeypairEnrolled.mockResolvedValue(true);
}

async function mountAndPress() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LoginNetworkScreen />); });
  await act(async () => { loiVao(tree).props.onPress(); });
  return tree;
}

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LoginNetworkScreen />); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Sau `clearAllMocks` nên phải lắp lại mỗi lượt, không lắp một lần ở ngoài.
  jest.spyOn(Linking, 'openSettings').mockImplementation(mockOpenSettings);
  deviceAlreadyHasIdentity();
  mockSignRaw.mockResolvedValue('00'.repeat(32));
  mockUnlockExistingIdentity.mockResolvedValue({ did: 'did:phoenix:x', username: 'a' });
});

// ── Ca 1: KHÔNG có sinh trắc ────────────────────────────────────────────────

describe('máy chưa bật vân tay / khuôn mặt', () => {
  beforeEach(() => { mockSensorAvailable = false; });

  it('bấm nút chính KHÔNG còn im lặng — có hộp thoại nói rõ', async () => {
    await mountAndPress();
    expect(shownDialogs().length).toBeGreaterThan(0);
  });

  it('hộp thoại nói về vân tay/khuôn mặt, không phải một câu lỗi chung chung', async () => {
    await mountAndPress();
    const d = shownDialogs()[0];
    // Không so nguyên văn: câu chữ còn sửa, còn dịch. Đo THỨ nó nói tới.
    expect(`${d.title} ${d.body}`).toMatch(/vân tay|khuôn mặt/i);
    // Vế bắt lỗi: câu chung nhất của màn KHÔNG được dùng cho ca này.
    expect(d.title).not.toMatch(/Đăng nhập sinh trắc học thất bại/);
  });

  /**
   * Đo HÀNH VI của nút, không đo CHỮ trên nút.
   *
   * Bản đầu của ca này tìm nút bằng `/Cài đặt/i` và đỏ — không phải vì mã sai mà
   * vì `t()` ở môi trường kiểm trả TIẾNG ANH: nhãn thật là "Open Settings", còn
   * tiêu đề và thân hộp thoại thì vẫn ra tiếng Việt (hai câu dài đó chưa có bản
   * dịch nên `t()` trả lại chính khoá). Tức bài cũ ghim một thứ nó không định
   * ghim — ngôn ngữ — và nó sẽ đỏ thêm một lần nữa mỗi lần ai đó dịch một câu.
   *
   * Thứ đáng ghim là: TRONG các lựa chọn của hộp thoại, có một lựa chọn mà bấm
   * vào thì máy mở Cài đặt thật. Câu đó đúng ở mọi thứ tiếng.
   */
  it('và nó chở người dùng đi MỘT BƯỚC — có một lựa chọn mở Cài đặt thật', async () => {
    await mountAndPress();
    const actions = shownDialogs()[0].opts?.actions ?? [];
    expect(actions.length).toBeGreaterThan(0);

    for (const a of actions) {
      await act(async () => { a.onPress?.(); });
    }
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('và vẫn còn một lối "để sau" — hộp thoại không phải một cửa cụt', async () => {
    await mountAndPress();
    const actions = shownDialogs()[0].opts?.actions ?? [];
    expect(actions.some(a => a.style === 'cancel')).toBe(true);
  });

  it('KHÔNG đi tới bước ký thử — hỏi chip một câu nó không trả lời được', async () => {
    await mountAndPress();
    expect(mockSignRaw).not.toHaveBeenCalled();
  });
});

// ── Ca 2: CÓ sinh trắc — vế bắt lỗi ─────────────────────────────────────────
//
// Thiếu describe này thì một dòng `showError(...)` gán cứng ngay đầu
// `runBiometric` cũng qua được cả bốn ca trên.

describe('máy CÓ sinh trắc — nhánh trên không được chạm vào', () => {
  beforeEach(() => { mockSensorAvailable = true; });

  it('không hiện hộp thoại "chưa bật vân tay"', async () => {
    await mountAndPress();
    const coCanhBaoSinhTrac = shownDialogs()
      .some(d => /chưa bật vân tay|chưa bật khuôn mặt/i.test(`${d.title} ${d.body}`));
    expect(coCanhBaoSinhTrac).toBe(false);
  });

  it('đi tiếp tới bước ký thử', async () => {
    await mountAndPress();
    expect(mockSignRaw).toHaveBeenCalled();
  });

  it('và KHÔNG mở Cài đặt', async () => {
    await mountAndPress();
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });
});

// ── Ca 3: MỘT lối vào, không phải hai ───────────────────────────────────────
//
// Chủ sở hữu chốt 2026-09-19: hai nút cùng dẫn tới một hành động thì người mới
// bấm cái mang đúng cái tên họ đang tìm ("Đăng nhập"), bất kể cái kia được vẽ
// nổi hơn. Nên nút chữ chỉ còn là LỐI THAY THẾ cho máy không có cảm biến.
//
// Hai ca dưới là một cặp đối xứng, và cặp đó mới là phép đo: một ca đứng một
// mình thì xanh với cả bản gỡ hẳn nút lẫn bản không gỡ gì.

describe('lối vào đăng nhập — đúng một cái, tuỳ máy có cảm biến hay không', () => {
  it('🔴 CHỐT — máy CÓ cảm biến thì KHÔNG còn nút chữ "Đăng nhập"', async () => {
    mockSensorAvailable = true;
    const tree = await mount();
    expect(nodeByTestID(tree, 'login-primary-cta')).toHaveLength(0);
    // Và vẫn phải còn ĐÚNG lối kia, không thì đây là màn cụt.
    expect(nodeByTestID(tree, 'login-biometric-button').length).toBeGreaterThan(0);
  });

  it('🔴 CHỐT — máy KHÔNG có cảm biến thì nút chữ phải còn, không ai bị kẹt', async () => {
    mockSensorAvailable = false;
    const tree = await mount();
    expect(nodeByTestID(tree, 'login-primary-cta').length).toBeGreaterThan(0);
  });
});
