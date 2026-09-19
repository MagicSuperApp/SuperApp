/**
 * LoginNetworkScreen — LỐI RA khi khoá trong chip đã CHẾT HẲN.
 *
 * ── Chỗ hỏng bài kiểm này ghim ──────────────────────────────────────────────
 * Người mà hệ điều hành vừa huỷ khoá (thêm một vân tay trong Cài đặt là đủ)
 * KHÔNG CÓ PHIÊN, nên mọi lối gỡ đã có trong kho đều ngoài tầm: `wipeIdentity()`
 * được ba nơi gọi và cả ba đòi một phiên. Vào cửa tạo mới thì nhãn khoá đã có
 * chủ (`E_KEY_EXISTS`); vào cửa khôi phục theo khoá thì cần một chữ ký từ chính
 * khoá đang chết. Trước bản này mã lỗi khoá-chết rơi vào nhánh cuối của `catch`
 * và người dùng đọc câu "Đăng nhập sinh trắc học thất bại" — câu chung nhất của
 * màn, cho đúng cái ca vĩnh viễn nhất.
 *
 * ── Vì sao phải là một BỘ ba ca, không phải một ca ─────────────────────────
 * Một ca đơn lẻ khẳng định "lối ra hiện khi khoá chết" XANH Ở CẢ HAI CỰC: nối
 * đúng điều kiện, hay gán cứng cho nó luôn hiện, đều làm ca đó xanh. Cặp ca —
 * một cho mỗi cực — thì mọi lối gán cứng đỏ ngay:
 *   1. chip trả `E_KEY_INVALIDATED`  ⇒ CÓ lối ra
 *   2. chip ký được bình thường       ⇒ KHÔNG có lối ra (và không hộp thoại nào)
 *   3. chip ném vì người dùng HUỶ     ⇒ KHÔNG có lối ra — "không đo được" không
 *      được phép rơi vào nhánh "chắc là chết"
 *
 * Ca 3 đứng riêng vì nó là trạng thái THỨ BA. Một phép đo chỉ có hai cực sẽ xếp
 * mọi lần ném vào cực "chết", và lúc đó một người bấm huỷ được mời xoá danh tính
 * của họ.
 *
 * Hai ca cuối ghim thứ mà ba ca trên không nói tới: THỨ TỰ hai lựa chọn (24 từ
 * trước, bỏ tài khoản sau), và việc chạm nút bỏ KHÔNG xoá gì ngay — nó chỉ mở cửa
 * xác nhận thứ hai.
 *
 * Harness lấy theo `LoginNetworkScreen.entry.test.tsx` — cùng màn, cùng lý do
 * giữ `mockNav`/analytics ỔN ĐỊNH qua các lượt vẽ.
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
const mockTrackAction = jest.fn();
const mockAnalytics = {
  trackPress: mockTrackPress,
  trackAction: mockTrackAction,
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

jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class {
    isSensorAvailable() {
      return Promise.resolve({ available: true, biometryType: 'TouchID' });
    }
  },
  BiometryTypes: { FaceID: 'FaceID', TouchID: 'TouchID', Biometrics: 'Biometrics' },
}));

const mockCurrentUserDid = jest.fn();
const mockIsKeypairEnrolled = jest.fn();
const mockSignRaw = jest.fn();
const mockWipeIdentity = jest.fn();
// `wipeIdentity` PHẢI có trong bản giả này. Thiếu nó thì `import` cho ra
// `undefined`, lời gọi ném `TypeError`, và ca đầu vẫn xanh vì nó chỉ hỏi hộp
// thoại có mở ra không — một bản giả LỎNG HƠN mã thật làm chính chỗ cần đo biến
// mất.
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: (...a: unknown[]) => mockCurrentUserDid(...a),
  isKeypairEnrolled: (...a: unknown[]) => mockIsKeypairEnrolled(...a),
  signRaw: (...a: unknown[]) => mockSignRaw(...a),
  wipeIdentity: (...a: unknown[]) => mockWipeIdentity(...a),
}));

const mockUnlockExistingIdentity = jest.fn();
jest.mock('../services/phoenixKeyAuthService', () => ({
  biometricKindFromType: () => 'fingerprint',
  phoenixKeyAuth: {
    unlockExistingIdentity: (...a: unknown[]) => mockUnlockExistingIdentity(...a),
  },
}));

const mockIsPhoenixKeyAvailable = jest.fn(() => true);
jest.mock('../services/phoenixKey-native', () => {
  // Hằng mã lỗi lấy từ mã THẬT. Gõ tay lại là đi trên những mã không tồn tại.
  const actual = jest.requireActual('../services/phoenixKey-native');
  return { ...actual, isAvailable: () => mockIsPhoenixKeyAvailable() };
});

const mockShowError = jest.fn();
jest.mock('../utils/alert', () => ({
  showError: (...a: unknown[]) => mockShowError(...a),
  showSuccess: jest.fn(),
  showInfo: jest.fn(),
  showWarning: jest.fn(),
}));

jest.mock('../components/LanguagePickerModal', () => 'LanguagePickerModal');

import LoginNetworkScreen from './LoginNetworkScreen';
import { PhoenixKeyNativeError } from '../services/phoenixKey-native';

// ── Dụng cụ ─────────────────────────────────────────────────────────────────

type AlertAction = { text: string; style?: string; onPress?: () => void };
type AlertOpts = {
  actions?: AlertAction[];
  confirmText?: string;
  onConfirm?: () => unknown;
};

/** Mọi lượt gọi `showError` trong lượt bấm vừa rồi, kèm tuỳ chọn của nó. */
function shownDialogs(): { title: string; body: string; opts?: AlertOpts }[] {
  return mockShowError.mock.calls.map((c) => ({
    title: String(c[0]),
    body: String(c[1] ?? ''),
    opts: c[2] as AlertOpts | undefined,
  }));
}

/** Nút MANG HỆ QUẢ PHÁ HUỶ trong bất kỳ hộp thoại nào đã hiện. */
function abandonAction(): AlertAction | undefined {
  for (const dialog of shownDialogs()) {
    const found = dialog.opts?.actions?.find((a) => a.style === 'destructive');
    if (found) return found;
  }
  return undefined;
}

function ctaNode(tree: renderer.ReactTestRenderer) {
  const found = tree.root
    .findAllByProps({ testID: 'login-primary-cta' })
    .filter((n) => typeof n.props.onPress === 'function');
  if (found.length > 0) return found[0];
  // Từ 2026-09-19 nút chữ `login-primary-cta` chỉ hiện trên máy KHÔNG có cảm biến
  // sinh trắc; bộ kiểm này chạy ở cấu hình CÓ cảm biến, nên lối vào là vòng tròn.
  // Không phải một phép thay tương đương lỏng lẻo: nhánh `unlock` của `theoCta`
  // gọi thẳng `runBiometric()` — đúng thứ vòng tròn gọi — nên hai nút vốn đã chạy
  // cùng một đường cho hành động này.
  const vong = tree.root
    .findAllByProps({ testID: 'login-biometric-button' })
    .filter((n) => typeof n.props.onPress === 'function');
  if (vong.length === 0) throw new Error('màn không còn lối vào đăng nhập nào');
  return vong[0];
}

/** Máy CÓ khoá và CÓ DID — điều kiện duy nhất để màn đi tới bước ký thử. */
function deviceAlreadyHasIdentity() {
  mockCurrentUserDid.mockResolvedValue(
    'did:phoenix:abcdefghijklm:' + 'a'.repeat(64),
  );
  mockIsKeypairEnrolled.mockResolvedValue(true);
}

async function mountAndPress() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LoginNetworkScreen />); });
  await act(async () => { ctaNode(tree).props.onPress(); });
  return tree;
}

/** Ném đúng hình dạng lỗi mà cầu native ném: `Error` có thuộc tính `code`. */
function chipError(code: string): Error & { code: string } {
  return Object.assign(new Error(`native says ${code}`), { code });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPhoenixKeyAvailable.mockReturnValue(true);
  mockUnwrap.mockReturnValue(Promise.resolve());
  mockDispatch.mockImplementation(() => ({ unwrap: mockUnwrap }));
});

// ── Cực 1: khoá CHẾT CHẮC ───────────────────────────────────────────────────

describe('chip trả `E_KEY_INVALIDATED` — khoá chết hẳn', () => {
  it('mở lối bỏ tài khoản, và KHÔNG dùng câu chung của màn', async () => {
    deviceAlreadyHasIdentity();
    mockSignRaw.mockRejectedValue(chipError(PhoenixKeyNativeError.KEY_INVALIDATED));

    const tree = await mountAndPress();

    expect(abandonAction()).toBeDefined();
    // Câu chung nhất của màn là nơi ca này TỪNG rơi vào. Ghim nó để một lần gộp
    // nhánh về sau đỏ ngay, chứ không lặng lẽ quay về hành vi cũ.
    expect(shownDialogs().map((d) => d.title)).not.toContain(
      'Đăng nhập sinh trắc học thất bại',
    );
    await act(async () => { tree.unmount(); });
  });

  it('đường 24 từ đứng TRƯỚC đường bỏ tài khoản', async () => {
    deviceAlreadyHasIdentity();
    mockSignRaw.mockRejectedValue(chipError(PhoenixKeyNativeError.KEY_INVALIDATED));

    const tree = await mountAndPress();

    const actions = shownDialogs()[0].opts?.actions ?? [];
    const recoverIndex = actions.findIndex(
      (a) => a.style !== 'destructive' && a.style !== 'cancel',
    );
    const abandonIndex = actions.findIndex((a) => a.style === 'destructive');
    expect(recoverIndex).toBeGreaterThanOrEqual(0);
    expect(abandonIndex).toBeGreaterThanOrEqual(0);
    // Lấy lại thì GIỮ được tài khoản, bỏ đi thì mất hẳn. Đảo thứ tự là mời người
    // đọc lướt chọn cái không hoàn tác được.
    expect(recoverIndex).toBeLessThan(abandonIndex);
    await act(async () => { tree.unmount(); });
  });

  it('chạm nút bỏ KHÔNG xoá ngay — phải qua cửa xác nhận thứ hai', async () => {
    deviceAlreadyHasIdentity();
    mockSignRaw.mockRejectedValue(chipError(PhoenixKeyNativeError.KEY_INVALIDATED));

    const tree = await mountAndPress();
    await act(async () => { abandonAction()!.onPress?.(); });

    // Cửa thứ nhất là hộp thoại ba nút, đọc bởi người vừa không đăng nhập được.
    // Một lần chạm nhầm ở đó không được phép là một danh tính mất hẳn.
    expect(mockWipeIdentity).not.toHaveBeenCalled();

    const secondGate = shownDialogs().find(
      (d) => typeof d.opts?.onConfirm === 'function',
    );
    expect(secondGate).toBeDefined();
    // Cửa xác nhận phải nói MẤT GÌ bằng lời người dùng đọc được, không nói "xoá
    // khoá" — người ở đây cần biết chuyện gì xảy ra với vườn của họ.
    //
    // Khớp CẢ HAI bản ngữ cố ý: lớp `t()` dịch theo ngôn ngữ đang chạy, và môi
    // trường kiểm hiện trả bản tiếng Anh. Ghim một bản ngữ ở đây thì bài kiểm đỏ
    // vào ngày ai đó đổi ngôn ngữ mặc định của môi trường kiểm — đỏ vì một lý do
    // không liên quan gì tới thứ đang được đo.
    expect(secondGate!.body).toMatch(/KHÔNG đi theo|NOT come across/);
    expect(secondGate!.body).toMatch(/24 từ|24 words/);

    await act(async () => { await secondGate!.opts!.onConfirm!(); });
    expect(mockWipeIdentity).toHaveBeenCalledTimes(1);
    // Về màn HỎI, không đi thẳng màn tạo mới: người vừa nói "không có 24 từ" có
    // thể tìm ra chúng ở bước sau.
    expect(mockNav.navigate).toHaveBeenCalledWith('IdentityEntryChoice');
    await act(async () => { tree.unmount(); });
  });
});

// ── Cực 2: khoá CÒN SỐNG ────────────────────────────────────────────────────

describe('chip ký được bình thường — khoá còn sống', () => {
  it('KHÔNG mở lối bỏ tài khoản, và không xoá gì', async () => {
    deviceAlreadyHasIdentity();
    mockSignRaw.mockResolvedValue('a'.repeat(128));
    mockUnlockExistingIdentity.mockResolvedValue({ id: 'u1', did: 'did:phoenix:x' });

    const tree = await mountAndPress();

    // Đây là cực đối của ca đầu. Thiếu ca này thì một lối ra gán cứng "luôn hiện"
    // vẫn làm ca đầu xanh, và app mời người đang dùng tốt xoá danh tính của họ.
    expect(abandonAction()).toBeUndefined();
    expect(mockWipeIdentity).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

// ── Trạng thái 3: KHÔNG ĐO ĐƯỢC ─────────────────────────────────────────────

describe('phép thử ký ném vì lý do KHÁC — chưa đo được khoá sống hay chết', () => {
  it('người dùng HUỶ ⇒ không lối ra, không hộp thoại nào', async () => {
    deviceAlreadyHasIdentity();
    mockSignRaw.mockRejectedValue(chipError(PhoenixKeyNativeError.USER_CANCELED));

    const tree = await mountAndPress();

    expect(abandonAction()).toBeUndefined();
    expect(mockWipeIdentity).not.toHaveBeenCalled();
    // Tự huỷ thì im lặng quay lại — không dựng cả một hộp thoại cho một thao tác
    // mà chính người dùng vừa chủ động làm.
    expect(mockShowError).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('sinh trắc TẠM KHOÁ ⇒ không lối ra', async () => {
    deviceAlreadyHasIdentity();
    mockSignRaw.mockRejectedValue(chipError(PhoenixKeyNativeError.BIOMETRIC_LOCKOUT));

    const tree = await mountAndPress();

    expect(abandonAction()).toBeUndefined();
    expect(mockWipeIdentity).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('`E_SIGN_INIT` ⇒ không lối ra — khoá có thể vẫn cứu được', async () => {
    deviceAlreadyHasIdentity();
    mockSignRaw.mockRejectedValue(chipError(PhoenixKeyNativeError.SIGN_INIT));

    const tree = await mountAndPress();

    // Nhánh này gộp nhiều nguyên nhân khởi tạo, trong đó có những nguyên nhân
    // KHÔNG phải khoá chết. Mở lối xoá ở đây là xoá theo một phép đo mù.
    expect(abandonAction()).toBeUndefined();
    expect(mockWipeIdentity).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
