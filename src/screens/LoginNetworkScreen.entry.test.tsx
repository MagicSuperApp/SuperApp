/**
 * LoginNetworkScreen — CỬA VÀO THẬT: rẽ đúng ca, và KHÔNG chạy hai lượt.
 *
 * ── Vì sao tệp này tồn tại, trong khi đã có `LoginScreen.entry.test.tsx` ────
 * Tuyến `Login` trong `navigation/index.tsx` dựng `LoginNetworkScreen`, KHÔNG
 * dựng `LoginScreen`. Tệp kiểm cũ ghim một màn không ai tới được — nó xanh, tên
 * nó đúng, và nó không canh một dòng nào của màn đang chạy. Tức màn đăng nhập
 * thật có 0 bài kiểm ở tầng dựng, và một hồi quy đã lọt qua đúng khe đó.
 *
 * Bài kiểm này dựng màn THẬT rồi bấm đúng cái nút dưới đáy mà người dùng bấm
 * (`login-primary-cta`), chứ không đọc mã rồi so tên hàm.
 *
 * ── Bốn ca, và ca thứ tư là lý do chính ────────────────────────────────────
 * Ba ca đầu ghim BẢNG RẼ: máy trống trơn ⇒ tạo mới · khoá-không-DID ⇒ khôi
 * phục · DID-không-khoá ⇒ màn hỏi. Chúng đi thành một bộ, vì một `navigate`
 * đặt vô điều kiện cũng làm một ca bất kỳ trong ba xanh.
 *
 * Ca thứ tư ghim CHỐNG BẤM HAI LẦN. Hồi quy đã xảy ra thật: `theoCta` bị bọc
 * `useCallback`, nên nó chụp cứng một bản `runBiometric` có `busy === false`
 * vĩnh viễn, và chốt `if (busy || noSensor) return` đọc một biến đã đóng băng.
 * Chạm lần thứ hai trong lúc hộp sinh trắc của hệ điều hành đang mở chạy trọn
 * một lượt đăng nhập THỨ HAI chồng lên lượt đầu.
 *
 * ── Hai chỗ mock phải CHẶT bằng mã thật, không được lỏng hơn ────────────────
 *  1. `mockNav` là MỘT object qua mọi lượt dựng. Trả object mới mỗi lượt thì
 *     mọi `useCallback` phụ thuộc nó chạy lại, và một lỗi thiếu phụ thuộc TỰ
 *     LÀNH trong bài kiểm rồi bung ra ở máy thật.
 *  2. `trackPress`/`trackAction` cũng phải ỔN ĐỊNH. Mã thật bọc chúng bằng
 *     `useCallback([screen])` rồi `useMemo` (`services/analytics/useAnalytics.ts`),
 *     nên chúng KHÔNG đổi giữa hai lượt vẽ. Mock trả `jest.fn()` mới mỗi lượt là
 *     một mock LỎNG HƠN THẬT — nó làm `moDangKy` đổi mỗi lượt, kéo theo danh
 *     sách phụ thuộc của `theoCta` đổi theo, và ca 4 sẽ xanh cả khi mã đã hỏng.
 *
 * Dùng `react-test-renderer` theo đúng tiền lệ `LoginScreen.entry.test.tsx`
 * (`@testing-library/react-native` không có trong kho này).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

// ── Điều hướng ──────────────────────────────────────────────────────────────
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const React_ = require('react');
  return {
    useNavigation: () => mockNav,
    // Màn đọc trạng thái máy trong `useFocusEffect`. Bỏ qua hẳn thì màn dựng
    // được nhưng `identityPresence` đứng mãi ở `'unknown'`, nút tắt, và cả bốn
    // ca đều xanh rỗng. Chạy nó như một `useEffect` — đúng thứ tự mà điều hướng
    // thật cũng gọi.
    useFocusEffect: (cb: () => void | (() => void)) => React_.useEffect(cb, [cb]),
    useIsFocused: () => true,
  };
});

// ── Mặt vẽ OpenGL ───────────────────────────────────────────────────────────
// `<Canvas>` không dựng được trong node (không có ngữ cảnh GL). Thay bằng một
// thành phần rỗng: cảnh three.js (`Canh`) là số học + shader, đã có bài kiểm
// riêng ở `features/loginNetwork/mangLuoi`, và nó KHÔNG nằm trên đường mà bốn
// khẳng định dưới đây đi qua.
jest.mock('@react-three/fiber/native', () => ({
  Canvas: () => null,
  useFrame: () => undefined,
  useThree: () => ({ camera: {}, size: { width: 0, height: 0 }, gl: {} }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ── Analytics: hàm ỔN ĐỊNH, đúng như mã thật ────────────────────────────────
// Xem lý do 2 ở khối chú thích đầu tệp. Hai `jest.fn()` này dựng MỘT lần ở tầng
// module, nên danh tính của chúng sống qua mọi lượt vẽ.
const mockTrackPress = jest.fn();
const mockTrackAction = jest.fn();
const mockAnalytics = {
  trackPress: mockTrackPress,
  trackAction: mockTrackAction,
  trackTap: jest.fn(),
  trackInput: jest.fn(),
};
jest.mock('../services/analytics', () => ({
  useAnalytics: () => mockAnalytics,
}));

// ── Redux ───────────────────────────────────────────────────────────────────
// `dispatch(loginUser(...))` được gọi kèm `.unwrap()` ở màn — thiếu `unwrap`
// thì đường thành công ném, và ca 4 sẽ "xanh" vì một lý do sai.
const mockUnwrap = jest.fn(() => Promise.resolve());
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('../store/userSlice', () => ({
  loginUser: (u: unknown) => ({ type: 'user/login', payload: u }),
}));

// Cảm biến CÓ mặt: `noSensor` là vế thứ hai của chốt `if (busy || noSensor)`,
// nên cảm biến vắng mặt làm ca 4 xanh mà không đo được gì về `busy`.
jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class {
    isSensorAvailable() {
      return Promise.resolve({ available: true, biometryType: 'TouchID' });
    }
  },
  BiometryTypes: { FaceID: 'FaceID', TouchID: 'TouchID', Biometrics: 'Biometrics' },
}));

// ── Trạng thái máy: mock TẦNG DƯỚI `readIdentityPresence`, không mock chính nó ─
// `readIdentityPresence` đọc `currentUserDid()` + `isKeypairEnrolled()`. Mock
// thẳng hàm đó là cắt mất chính dây nối cần ghim: bảng bốn-trạng-thái trong
// `features/loginNetwork/identityPresence.ts` sẽ không còn được chạy.
const mockCurrentUserDid = jest.fn();
const mockIsKeypairEnrolled = jest.fn();
const mockSignRaw = jest.fn();
// `wipeIdentity` có ở đây dù bốn ca dưới không đi qua nó: màn `import` nó cho lối
// bỏ danh tính ở nhánh khoá-chết, và một bản giả thiếu khoá đó là bản giả LỎNG HƠN
// mã thật — nó cho ra `undefined` thay vì một hàm, và chỗ hỏng chỉ lộ ra ở bài kiểm
// khác. Lối đó được ghim ở `LoginNetworkScreen.deadKeyExit.test.tsx`.
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

const mockIsPhoenixKeyAvailable = jest.fn(() => true);
jest.mock('../services/phoenixKey-native', () => {
  // Giữ hằng mã lỗi THẬT. Gõ tay lại các mã đó là dựng một mock lỏng hơn mã
  // thật, và bài kiểm sẽ đi trên những mã không tồn tại.
  const actual = jest.requireActual('../services/phoenixKey-native');
  return { ...actual, isAvailable: () => mockIsPhoenixKeyAvailable() };
});

jest.mock('../utils/alert', () => ({
  showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn(), showWarning: jest.fn(),
}));

jest.mock('../components/LanguagePickerModal', () => 'LanguagePickerModal');

import LoginNetworkScreen from './LoginNetworkScreen';

// ── Dụng cụ ─────────────────────────────────────────────────────────────────

/**
 * Nút dưới đáy — đúng cái người dùng bấm.
 *
 * TÌM LẠI ở MỖI lượt bấm, không giữ một tham chiếu: người dùng bấm vào cái nút
 * đang được vẽ, và chính việc `onPress` của lượt vẽ MỚI có phải hàm mới hay
 * không là thứ ca 4 đo.
 */
function ctaNode(tree: renderer.ReactTestRenderer) {
  const found = tree.root
    .findAllByProps({ testID: 'login-primary-cta' })
    .filter((n) => typeof n.props.onPress === 'function');
  if (found.length === 0) throw new Error('không tìm thấy nút `login-primary-cta`');
  return found[0];
}

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LoginNetworkScreen />); });
  return tree;
}

async function bamCta(tree: renderer.ReactTestRenderer) {
  // Cố ý KHÔNG `await` lời gọi: hai cú chạm liên tiếp của người dùng cũng không
  // chờ nhau. `act` vẫn xả hết microtask và đẩy `setBusy` vào cây.
  await act(async () => { ctaNode(tree).props.onPress(); });
}

async function mountAndPress() {
  const tree = await mount();
  await bamCta(tree);
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPhoenixKeyAvailable.mockReturnValue(true);
  mockUnwrap.mockReturnValue(Promise.resolve());
  mockDispatch.mockImplementation(() => ({ unwrap: mockUnwrap }));
});

// ── 1. Máy trống trơn ───────────────────────────────────────────────────────

describe('máy TRỐNG TRƠN — không khoá, không DID', () => {
  it('bấm nút chính ⇒ đi THẲNG màn tạo mới', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    mockIsKeypairEnrolled.mockResolvedValue(false);

    const tree = await mountAndPress();

    expect(mockNav.navigate).toHaveBeenCalledWith('SignUpBiometric');
    // Hai đích SAI của ca này, ghim cả hai: màn hỏi thì bắt mọi người trả lời
    // một câu để phục vụ một nhóm, còn màn khôi phục thì không có khoá nào để
    // đổi lấy DID.
    expect(mockNav.navigate).not.toHaveBeenCalledWith('IdentityEntryChoice');
    expect(mockNav.navigate).not.toHaveBeenCalledWith('RestoreIdentity');
    await act(async () => { tree.unmount(); });
  });

  it('không hỏi sinh trắc — chưa có khoá nào để ký', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    mockIsKeypairEnrolled.mockResolvedValue(false);

    const tree = await mountAndPress();

    expect(mockSignRaw).not.toHaveBeenCalled();
    expect(mockUnlockExistingIdentity).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

// ── 2. Khoá còn trong chip, DID đã mất ──────────────────────────────────────

describe('máy CÒN KHOÁ nhưng app không biết khoá của ai', () => {
  // Ca CÀI LẠI APP TRÊN CHÍNH MÁY CŨ: kho khoá sống qua lần gỡ app, AsyncStorage
  // thì không. Máy chủ đổi được chính khoá ấy lấy DID, nên câu hỏi "bạn là người
  // mới à?" không được đặt ở đây — và lối "tôi là người mới" kết thúc ở
  // `KEY_ALREADY_REGISTERED`.
  it('bấm nút chính ⇒ đi màn KHÔI PHỤC, không hỏi và không tạo mới', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    mockIsKeypairEnrolled.mockResolvedValue(true);

    const tree = await mountAndPress();

    expect(mockNav.navigate).toHaveBeenCalledWith('RestoreIdentity');
    expect(mockNav.navigate).not.toHaveBeenCalledWith('SignUpBiometric');
    expect(mockNav.navigate).not.toHaveBeenCalledWith('IdentityEntryChoice');
    await act(async () => { tree.unmount(); });
  });
});

// ── 3. DID còn, khoá đã mất ─────────────────────────────────────────────────

describe('máy NHỚ một DID nhưng khoá trong chip đã mất', () => {
  // Ca DUY NHẤT còn đi qua màn hỏi, và nó phải CÒN: khoá mất có thể vì hệ điều
  // hành huỷ khoá (vừa thêm/xoá vân tay) hoặc vì đây là máy khác — không phép đo
  // nào trên máy tách được hai ca đó.
  it('bấm nút chính ⇒ VẪN dẫn về màn HỎI', async () => {
    mockCurrentUserDid.mockResolvedValue('did:phoenix:mainnet:abc');
    mockIsKeypairEnrolled.mockResolvedValue(false);

    const tree = await mountAndPress();

    expect(mockNav.navigate).toHaveBeenCalledWith('IdentityEntryChoice');
    expect(mockNav.navigate).not.toHaveBeenCalledWith('SignUpBiometric');
    expect(mockNav.navigate).not.toHaveBeenCalledWith('RestoreIdentity');
    await act(async () => { tree.unmount(); });
  });
});

// ── 4. Đủ DID + khoá: nút chính là "mở khoá" ────────────────────────────────

describe('máy ĐỦ DID + KHOÁ — nút chính mở khoá', () => {
  /**
   * Cổng chặn `signRaw`: mỗi lời gọi nhận một lời hứa RIÊNG, treo cho tới khi
   * bài kiểm mở. Nhờ vậy cú chạm thứ hai rơi đúng vào lúc hộp sinh trắc của hệ
   * điều hành đang mở — đúng cửa sổ mà hồi quy đi lọt.
   */
  let moCong: Array<() => void>;

  const mayDayDu = () => {
    moCong = [];
    mockCurrentUserDid.mockResolvedValue('did:phoenix:mainnet:abc');
    mockIsKeypairEnrolled.mockResolvedValue(true);
    mockSignRaw.mockImplementation(
      () => new Promise<string>((res) => { moCong.push(() => res('deadbeef')); }),
    );
    mockUnlockExistingIdentity.mockResolvedValue({ did: 'did:phoenix:mainnet:abc' });
  };

  it('một cú chạm ⇒ ký chuỗi thử rồi mở khoá danh tính, KHÔNG rẽ đi đâu', async () => {
    // Ca ĐỐI XỨNG của ca chống-bấm-hai-lần. Thiếu nó thì một `return` đặt vô
    // điều kiện ở đầu `runBiometric` cũng làm ca dưới xanh: không lượt nào chạy
    // thì tất nhiên không có lượt thứ hai.
    mayDayDu();

    const tree = await mountAndPress();
    await act(async () => { moCong.forEach((g) => g()); });

    expect(mockSignRaw).toHaveBeenCalledTimes(1);
    expect(mockUnlockExistingIdentity).toHaveBeenCalledTimes(1);
    expect(mockNav.navigate).not.toHaveBeenCalledWith('SignUpBiometric');
    expect(mockNav.navigate).not.toHaveBeenCalledWith('RestoreIdentity');
    expect(mockNav.navigate).not.toHaveBeenCalledWith('IdentityEntryChoice');
    await act(async () => { tree.unmount(); });
  });

  it('CHẠM HAI LẦN liên tiếp ⇒ đường sinh trắc chỉ chạy ĐÚNG MỘT lượt', async () => {
    // ⚠ Đây là ca mà tệp kiểm này sinh ra để giữ.
    //
    // Hai cú chạm rơi vào CÙNG một khung hình: React chưa kịp vẽ lại với
    // `busy === true`, nên `disabled` của nút chưa đóng. Thứ duy nhất chặn lượt
    // thứ hai là chốt `if (busy || noSensor) return` bên trong `runBiometric`,
    // và chốt đó chỉ đọc đúng giá trị khi `theoCta` KHÔNG bị memo hoá — mỗi lượt
    // vẽ phải sinh một `runBiometric` mới, đóng bao quanh `busy` của lượt ấy.
    //
    // Bọc `theoCta` bằng `useCallback` thì bản `runBiometric` bị chụp cứng ở lượt
    // vẽ cuối cùng mà danh sách phụ thuộc đổi, và `busy` trong bản chụp đó mãi
    // mãi là `false`. Lúc đó hai cú chạm thành hai lượt đăng nhập chồng lên nhau.
    mayDayDu();

    const tree = await mount();

    await bamCta(tree);
    // Lượt đầu đang treo trong hộp sinh trắc — đúng lúc người dùng sốt ruột chạm
    // lần nữa. `ctaNode` tìm lại nút từ cây VỪA vẽ, nên đây là cú chạm vào đúng
    // hàm mà người dùng thật sẽ gọi.
    await bamCta(tree);

    expect(mockSignRaw).toHaveBeenCalledTimes(1);

    // Mở cổng cho mọi lượt đã khởi, rồi đo lại sau khi mọi thứ lắng: một lượt
    // thứ hai khởi muộn cũng phải bị bắt.
    await act(async () => { moCong.forEach((g) => g()); });

    expect(mockSignRaw).toHaveBeenCalledTimes(1);
    expect(mockUnlockExistingIdentity).toHaveBeenCalledTimes(1);
    // Và phiên chỉ được dựng MỘT lần: hai lượt chồng nhau thì `loginUser` chạy
    // hai lượt, mà đó là chỗ cái sai thôi nằm trong màn đăng nhập và đi ra store.
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    await act(async () => { tree.unmount(); });
  });
});
