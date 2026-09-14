/**
 * Màn ĐĂNG NHẬP — lời chào và nút "Đổi tài khoản" phải nói về CÁI SẼ ĐƯỢC MỞ.
 *
 * ── Chỗ hỏng bài này canh ───────────────────────────────────────────────────
 * Trên máy này có HAI nguồn nói "ai đang hoạt động", và chúng không cùng hạng:
 *   · `@phoenixkey/active_username` — một cái NHÃN, chỉ để hiển thị;
 *   · `phoenixkey_user_did` (đọc qua `currentUserDid()`) — thứ mà
 *     `phoenixKeyAuth.unlockExistingIdentity()` thật sự mở khoá.
 *
 * Mã cũ để hai nguồn đó trôi khỏi nhau ở hai chỗ, và cả hai đều im lặng:
 *   1. Lời chào tra theo NHÃN rồi rơi về `users[users.length - 1]`. Sau một lần
 *      khôi phục, `attachThisDevice` ghi DID mới bằng `saveUserDid` mà KHÔNG đụng
 *      sổ `@phoenixkey/users` lẫn nhãn ⇒ màn chào tên tài khoản CŨ.
 *   2. Nút "Đổi tài khoản (N)" chỉ ghi lại cái NHÃN. Bấm xong màn chào "@B", quét
 *      vân tay, và phiên mở ra là của A. `farmService` lấy `owner_did` từ phiên,
 *      nên mọi thứ ghi tiếp đi vào tài khoản A dưới cái tên B.
 *
 * ── Vì sao dựng màn THẬT ────────────────────────────────────────────────────
 * Cả hai chốt đều là hành vi phụ thuộc trạng thái đọc từ kho, không phải câu chữ.
 * Bài này bấm đúng cái nút người dùng bấm và đọc lời gọi `saveUserDid` thật.
 * Harness mock theo tiền lệ `LoginScreen.entry.test.tsx`.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const React_ = require('react');
  return {
    useNavigation: () => mockNav,
    useFocusEffect: (cb: () => void | (() => void)) => React_.useEffect(cb, [cb]),
  };
});

const mockDispatch = jest.fn(() => Promise.resolve());
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));

jest.mock('../services/analytics', () => ({
  useAnalytics: () => ({ trackPress: jest.fn(), trackAction: jest.fn() }),
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
const mockSaveUserDid = jest.fn(async (_did: string) => {});
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: (...a: unknown[]) => mockCurrentUserDid(...a),
  isKeypairEnrolled: jest.fn(async () => true),
  saveUserDid: (did: string) => mockSaveUserDid(did),
  signRaw: jest.fn(async () => 'deadbeef'),
}));

jest.mock('../services/phoenixKeyAuthService', () => ({
  biometricKindFromType: () => 'fingerprint',
  phoenixKeyAuth: { unlockExistingIdentity: jest.fn(async () => null) },
}));

jest.mock('../services/phoenixKey-native', () => {
  const actual = jest.requireActual('../services/phoenixKey-native');
  return { ...actual, isAvailable: () => true };
});

jest.mock('../store/userSlice', () => ({
  loginUser: (u: unknown) => ({ type: 'user/login', payload: u }),
}));

const mockShowError = jest.fn();
jest.mock('../utils/alert', () => ({
  showError: (...a: unknown[]) => mockShowError(...a),
  showSuccess: jest.fn(), showInfo: jest.fn(), showWarning: jest.fn(),
}));

jest.mock('../components/LoginSuccessOverlay', () => 'LoginSuccessOverlay');
jest.mock('../components/LanguagePickerModal', () => 'LanguagePickerModal');

import LoginScreen from './LoginScreen';
import { __resetLanguageForTest, setLanguage } from '../i18n/store';

const PHOENIX_USERS_KEY = '@phoenixkey/users';
const ACTIVE_USERNAME_KEY = '@phoenixkey/active_username';

const DID_A = 'did:phoenix:mainnet:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DID_B = 'did:phoenix:mainnet:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const TWO_USERS = [
  { username: 'an', did: DID_A, createdAt: 1 },
  { username: 'binh', did: DID_B, createdAt: 2 },
];

function collectText(node: unknown): string {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (x === null || x === undefined || x === false) return;
    if (typeof x === 'string' || typeof x === 'number') { out.push(String(x)); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const el = x as { props?: { children?: unknown }; children?: unknown };
    if (el.props?.children !== undefined) walk(el.props.children);
    else if (el.children !== undefined) walk(el.children);
  };
  walk(node);
  return out.join(' ').replace(/\s+/g, ' ');
}

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LoginScreen />); });
  return tree;
}

beforeEach(async () => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
  await AsyncStorage.clear();
});

describe('lời chào tra theo DID, không theo nhãn', () => {
  it('nhãn trỏ tài khoản KHÁC với DID đang lưu ⇒ chào theo DID', async () => {
    // Đúng trạng thái mà `attachThisDevice` để lại: DID đã đổi sang B, nhãn còn
    // nằm ở A vì hàm đó không ghi nhãn.
    await AsyncStorage.setItem(PHOENIX_USERS_KEY, JSON.stringify(TWO_USERS));
    await AsyncStorage.setItem(ACTIVE_USERNAME_KEY, 'an');
    mockCurrentUserDid.mockResolvedValue(DID_B);

    const tree = await mount();
    const text = collectText(tree.toJSON());

    expect(text).toMatch(/Chào mừng @binh/);
    expect(text).not.toMatch(/Chào mừng @an/);
    await act(async () => { tree.unmount(); });
  });

  it('DID đang lưu KHÔNG có trong sổ ⇒ không bịa ra một cái tên', async () => {
    // Ca có thật: khôi phục bằng 24 từ trên máy này gắn vào một DID mà sổ
    // `@phoenixkey/users` chưa từng biết. Bản cũ rơi về `users[users.length - 1]`
    // và chào bằng tên của một danh tính khác hẳn.
    await AsyncStorage.setItem(PHOENIX_USERS_KEY, JSON.stringify(TWO_USERS));
    mockCurrentUserDid.mockResolvedValue('did:phoenix:mainnet:cccccccccccccccccccccccccccccccc');

    const tree = await mount();
    const text = collectText(tree.toJSON());

    expect(text).not.toMatch(/Chào mừng @/);
    expect(text).toMatch(/Chào mừng/);
    await act(async () => { tree.unmount(); });
  });

  it('nhãn khớp DID ⇒ vẫn chào đúng tên đó (ca đối xứng)', async () => {
    // Thiếu ca này thì hai ca trên không phân biệt "tra theo DID" với "không bao
    // giờ chào tên nào".
    await AsyncStorage.setItem(PHOENIX_USERS_KEY, JSON.stringify(TWO_USERS));
    await AsyncStorage.setItem(ACTIVE_USERNAME_KEY, 'an');
    mockCurrentUserDid.mockResolvedValue(DID_A);

    const tree = await mount();
    expect(collectText(tree.toJSON())).toMatch(/Chào mừng @an/);
    await act(async () => { tree.unmount(); });
  });
});

describe('nút "Đổi tài khoản" phải đổi thứ SẼ ĐƯỢC MỞ', () => {
  const mountWithTwoAccounts = async () => {
    await AsyncStorage.setItem(PHOENIX_USERS_KEY, JSON.stringify(TWO_USERS));
    await AsyncStorage.setItem(ACTIVE_USERNAME_KEY, 'an');
    mockCurrentUserDid.mockResolvedValue(DID_A);
    return mount();
  };

  it('ghi DID của tài khoản kia, không chỉ ghi cái nhãn', async () => {
    const tree = await mountWithTwoAccounts();
    const pill = tree.root.findByProps({ testID: 'login-switch-account' });
    await act(async () => { await pill.props.onPress(); });

    // Đây là chốt. `unlockExistingIdentity()` đọc đúng khoá mà `saveUserDid` ghi.
    expect(mockSaveUserDid).toHaveBeenCalledWith(DID_B);
    expect(await AsyncStorage.getItem(ACTIVE_USERNAME_KEY)).toBe('binh');
    await act(async () => { tree.unmount(); });
  });

  it('ghi DID HỎNG ⇒ KHÔNG đổi nhãn, và nói ra', async () => {
    // Nuốt lỗi rồi đổi nhãn suông chính là lỗi vừa gỡ, chỉ khác đường vào.
    mockSaveUserDid.mockRejectedValueOnce(new Error('DID sai định dạng'));
    const tree = await mountWithTwoAccounts();
    const pill = tree.root.findByProps({ testID: 'login-switch-account' });
    await act(async () => { await pill.props.onPress(); });

    expect(await AsyncStorage.getItem(ACTIVE_USERNAME_KEY)).toBe('an');
    expect(collectText(tree.toJSON())).toMatch(/Chào mừng @an/);
    expect(mockShowError).toHaveBeenCalledWith(
      'Chưa đổi được tài khoản',
      expect.stringMatching(/giữ nguyên tài khoản đang mở/),
    );
    await act(async () => { tree.unmount(); });
  });

  it('hai tên trên CÙNG một danh tính ⇒ không hiện nút đổi tài khoản', async () => {
    // "Đổi" giữa hai nhãn cùng trỏ một DID thì không đổi gì cả, mà con số trên nút
    // lại hứa có hai tài khoản mở được.
    await AsyncStorage.setItem(PHOENIX_USERS_KEY, JSON.stringify([
      { username: 'an', did: DID_A, createdAt: 1 },
      { username: 'an-cu', did: DID_A, createdAt: 2 },
    ]));
    await AsyncStorage.setItem(ACTIVE_USERNAME_KEY, 'an');
    mockCurrentUserDid.mockResolvedValue(DID_A);

    const tree = await mount();
    expect(tree.root.findAllByProps({ testID: 'login-switch-account' })).toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });

  it('hai danh tính khác nhau ⇒ CÓ nút, và số trên nút là 2 (ca đối xứng)', async () => {
    const tree = await mountWithTwoAccounts();
    expect(collectText(tree.toJSON())).toMatch(/Đổi tài khoản \(2\)/);
    await act(async () => { tree.unmount(); });
  });
});
