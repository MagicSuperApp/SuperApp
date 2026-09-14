/**
 * LoginScreen — CỬA VÀO rẽ đúng ca, và ca kia KHÔNG đổi.
 *
 * Bài kiểm này dựng màn THẬT rồi bấm đúng cái nút mà người dùng bấm, chứ không
 * đọc mã nguồn rồi so tên. Lý do cụ thể trong kho này: nhiều hàm xuất hiện cả
 * trong khối `export default` của chính tệp, nên phép so bằng tên trần vẫn xanh
 * khi lời gọi đã bị gỡ. Ở đây thứ được khoá là LỜI GỌI `navigation.navigate`
 * với đúng đích, sinh ra bởi đúng nhánh điều kiện.
 *
 * Ba ca đi thành một bộ, và bộ đó là điều kiện để bài kiểm có nghĩa:
 *   · máy CHƯA có danh tính        ⇒ đi tới màn HỎI (`IdentityEntryChoice`)
 *   · máy ĐÃ có danh tính, mở ĐƯỢC ⇒ đường cũ nguyên vẹn (mở khoá bằng chính khoá)
 *   · máy CÓ khoá nhưng mở KHÔNG ĐƯỢC ⇒ cũng về màn HỎI, KHÔNG sang màn tạo mới
 * Thiếu ca thứ hai thì ca thứ nhất không phân biệt được "rẽ đúng ca" với "rẽ
 * mọi ca" — một hàm `navigate('IdentityEntryChoice')` đặt vô điều kiện ở đầu
 * `runBiometric` cũng làm ca thứ nhất xanh.
 *
 * Ca thứ ba thêm sau, vì nó là nhánh không ai canh: hai ca đầu đều xanh trong
 * khi nhánh "mở không được" đẩy thẳng người dùng sang màn TẠO MỚI.
 *
 * Dùng `react-test-renderer` theo tiền lệ `MyDevicesScreen.test.tsx`
 * (`@testing-library/react-native` không có trong kho này).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

// Object ỔN ĐỊNH qua mọi lượt dựng. Trả object mới mỗi lượt thì các
// `useCallback`/`useEffect` phụ thuộc nó chạy lại, và một lỗi thiếu phụ thuộc sẽ
// TỰ LÀNH trong bài kiểm rồi bung ra ở máy thật.
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const React_ = require('react');
  return {
    useNavigation: () => mockNav,
    // Màn chạy phần nạp PhoenixUser trong `useFocusEffect`. Bỏ qua hẳn thì màn
    // dựng được nhưng KHÔNG chạy một nhánh nào của nó — nên chạy nó như một
    // `useEffect` bình thường, đúng thứ tự mà điều hướng thật cũng gọi.
    useFocusEffect: (cb: () => void | (() => void)) => React_.useEffect(cb, [cb]),
  };
});

const mockDispatch = jest.fn(() => Promise.resolve());
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));

jest.mock('../services/analytics', () => ({
  useAnalytics: () => ({ trackPress: jest.fn(), trackAction: jest.fn() }),
}));

// Cảm biến CÓ mặt: nút sinh trắc phải bấm được, không thì cả hai ca đều không
// chạy tới nhánh cần đo và bài kiểm xanh rỗng.
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
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: (...a: unknown[]) => mockCurrentUserDid(...a),
  isKeypairEnrolled: (...a: unknown[]) => mockIsKeypairEnrolled(...a),
  signRaw: (...a: unknown[]) => mockSignRaw(...a),
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
  // Giữ hằng mã lỗi THẬT. Gõ tay lại các mã đó là dựng một mock LỎNG hơn mã
  // thật, và bài kiểm sẽ đi trên những mã không tồn tại.
  const actual = jest.requireActual('../services/phoenixKey-native');
  return { ...actual, isAvailable: () => mockIsPhoenixKeyAvailable() };
});

jest.mock('../store/userSlice', () => ({ loginUser: (u: unknown) => ({ type: 'user/login', payload: u }) }));

jest.mock('../utils/alert', () => ({
  showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn(), showWarning: jest.fn(),
}));

jest.mock('../components/LoginSuccessOverlay', () => 'LoginSuccessOverlay');
jest.mock('../components/LanguagePickerModal', () => 'LanguagePickerModal');

import LoginScreen from './LoginScreen';

/** Nút sinh trắc thật — chính cái nút tròn giữa màn. */
function bioButton(tree: renderer.ReactTestRenderer) {
  return tree.root.findByProps({ testID: 'login-biometric-button' });
}

async function mountAndPress() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LoginScreen />); });
  await act(async () => { bioButton(tree).props.onPress(); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPhoenixKeyAvailable.mockReturnValue(true);
});

describe('máy CHƯA có danh tính', () => {
  it('bấm nút sinh trắc ⇒ đi tới màn HỎI, KHÔNG đi thẳng sang tạo mới', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    mockIsKeypairEnrolled.mockResolvedValue(false);

    const tree = await mountAndPress();

    expect(mockNav.navigate).toHaveBeenCalledWith('IdentityEntryChoice');
    // Đi thẳng sang màn tạo mới chính là hành vi đang bị bỏ: nút không có chữ
    // nào mà lại chọn hộ người dùng một trong ba luồng.
    expect(mockNav.navigate).not.toHaveBeenCalledWith('SignUpBiometric');
    await act(async () => { tree.unmount(); });
  });

  it('không mở khoá bằng khoá — chưa có khoá nào để mở', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    mockIsKeypairEnrolled.mockResolvedValue(false);

    const tree = await mountAndPress();

    // Hỏi sinh trắc trước là bắt người dùng xác thực cho một cái khoá không
    // tồn tại — nhánh này phải rẽ TRƯỚC mọi lời gọi tới chip.
    expect(mockSignRaw).not.toHaveBeenCalled();
    expect(mockUnlockExistingIdentity).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

describe('máy ĐÃ có danh tính — ca đối xứng, đường cũ không đổi', () => {
  it('bấm nút sinh trắc ⇒ ký chuỗi thử rồi mở khoá danh tính, KHÔNG rẽ sang màn hỏi', async () => {
    mockCurrentUserDid.mockResolvedValue('did:phoenix:mainnet:abc');
    mockIsKeypairEnrolled.mockResolvedValue(true);
    mockSignRaw.mockResolvedValue('deadbeef');
    mockUnlockExistingIdentity.mockResolvedValue({ did: 'did:phoenix:mainnet:abc' });

    const tree = await mountAndPress();

    expect(mockSignRaw).toHaveBeenCalled();
    expect(mockUnlockExistingIdentity).toHaveBeenCalled();
    expect(mockNav.navigate).not.toHaveBeenCalledWith('IdentityEntryChoice');
    await act(async () => { tree.unmount(); });
  });
});

describe('máy CÓ khoá nhưng KHÔNG dựng lại được danh tính', () => {
  // `unlockExistingIdentity` trả `null` ở đúng một chỗ khi máy có cả khoá lẫn
  // DID: DID đã lưu không thuộc dạng máy chủ hiểu, và cũng không cứu được bằng
  // `recoverLocalIdentityFromKey`. Người dùng trong ca này KHÔNG phải người mới
  // — họ có khoá trong chip.
  const keyPresentButUnlockFails = () => {
    mockCurrentUserDid.mockResolvedValue('did:phoenix:mainnet:abc');
    mockIsKeypairEnrolled.mockResolvedValue(true);
    mockSignRaw.mockResolvedValue('deadbeef');
    mockUnlockExistingIdentity.mockResolvedValue(null);
  };

  it('KHÔNG đẩy sang màn tạo mới — đó là đường sinh ra DID thứ hai', async () => {
    keyPresentButUnlockFails();

    const tree = await mountAndPress();

    // Đi thẳng sang `SignUpBiometric` là chọn hộ người dùng luồng "tôi là người
    // mới". Hậu quả không kêu: DID thứ hai, danh sách vườn hiện RỖNG, và rỗng
    // trùng khớp với "tôi chưa ghi gì".
    expect(mockNav.navigate).not.toHaveBeenCalledWith('SignUpBiometric');
    await act(async () => { tree.unmount(); });
  });

  it('dẫn về màn HỎI để chính người dùng rẽ', async () => {
    keyPresentButUnlockFails();

    const tree = await mountAndPress();

    expect(mockNav.navigate).toHaveBeenCalledWith('IdentityEntryChoice');
    await act(async () => { tree.unmount(); });
  });

  it('vẫn ký chuỗi thử trước — nhánh này nằm SAU phép xác thực, không thay nó', async () => {
    // Ràng buộc ngược chiều hai ca trên: nếu ai đó "sửa" bằng cách rẽ sớm hơn
    // lời gọi chip thì hai ca kia vẫn xanh, mà đăng nhập thì thôi đòi sinh trắc.
    keyPresentButUnlockFails();

    const tree = await mountAndPress();

    expect(mockSignRaw).toHaveBeenCalled();
    expect(mockUnlockExistingIdentity).toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
