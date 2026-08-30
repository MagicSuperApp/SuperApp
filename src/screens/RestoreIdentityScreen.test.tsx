/**
 * RestoreIdentityScreen — cửa xác nhận phải chặn TRƯỚC, không phải cảnh báo SAU.
 *
 * Vì sao cần test: khôi phục bằng 24 từ không chỉ đổi khoá trên máy này. Máy chủ
 * tăng `users.token_epoch` mỗi lần khôi phục rồi bác MỌI phiên và MỌI token
 * thiết-bị-liên-kết mang epoch cũ (`PhoenixKey-Database`
 * V17__split_taad_keys_table.sql:15-19). Nên một cú bấm nhầm ở đây đá người dùng
 * ra khỏi app khác trên điện thoại khác và trên máy tính — thứ họ không hề thấy
 * từ màn hình này.
 *
 * Cổng chỉ có giá trị nếu nó CHẶN. Một hộp thoại hiện lên rồi vẫn chạy tiếp thì
 * trông y hệt cổng thật với người đọc mã. Nên test đo đúng một điều: sau khi bấm
 * "Khôi phục", việc khôi phục CHƯA chạy; nó chỉ chạy khi người dùng bấm xác nhận.
 *
 * ⚠️ `useNavigation` giả trả CÙNG MỘT đối tượng mỗi lần render, y như
 * react-navigation thật — mock trả object mới mỗi lượt sẽ tự lành những lỗi
 * thiếu dependency mà bản chạy thật vẫn hỏng.
 */

import React from 'react';
import { Text, TextInput } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import * as appAlert from '../utils/alert';

// ── Lớp cầu ngoài ───────────────────────────────────────────────────────────

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

const mockSafeAreaInsets = { top: 44, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));

// `isAvailable` là việc ĐẦU TIÊN `doRestore` làm. Nên nó là phép đo rẻ nhất cho
// câu hỏi "khôi phục đã bắt đầu chưa" — không cần giả lập cả luồng ký.
jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(() => false),
    deriveTaadPubkey: jest.fn(),
    signEd25519: jest.fn(),
  },
}));

jest.mock('../sdk/phoenixKey', () => ({
  enrollKeypair: jest.fn(),
  ownerPublicKey: jest.fn(),
  saveUserDid: jest.fn(),
  currentUserDid: jest.fn(async () => null),
}));

jest.mock('../services/phoenixKey-api', () => ({
  phoenixKeyApi: {},
  PhoenixKeyApiError: class extends Error {},
}));

jest.mock('../services/phoenixKeyAuthService', () => ({ phoenixKeyAuth: {} }));
jest.mock('../store/userSlice', () => ({ loginUser: jest.fn() }));

import taadEnclave from '../sdk/taadEnclave';
import RestoreIdentityScreen from './RestoreIdentityScreen';

// 24 từ BIP39 hợp lệ về SỐ LƯỢNG — màn chỉ đếm từ trước khi mở cửa xác nhận.
const PHRASE_24 = Array(24).fill('abandon').join(' ');

const pressRestore = async (tree: ReactTestRenderer) => {
  const btn = tree.root
    .findAll(n => typeof n.props?.onPress === 'function' && !n.props?.onLongPress)
    .find(n => n.findAllByType(Text).some(label => String(label.props.children).includes('Khôi phục')));
  if (!btn) throw new Error('không tìm thấy nút Khôi phục');
  await act(async () => { btn.props.onPress(); });
};

const typePhrase = async (tree: ReactTestRenderer, phrase: string) => {
  const input = tree.root.findAllByType(TextInput)[0];
  await act(async () => { input.props.onChangeText(phrase); });
};

describe('RestoreIdentityScreen — cửa xác nhận', () => {
  let warn: jest.SpyInstance;
  let tree: ReactTestRenderer;

  beforeEach(async () => {
    jest.clearAllMocks();
    warn = jest.spyOn(appAlert, 'showWarning').mockImplementation(() => {});
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });
  });

  afterEach(() => { warn.mockRestore(); });

  it('đủ 24 từ mà bấm Khôi phục thì CHƯA khôi phục — chỉ hiện cửa xác nhận', async () => {
    await typePhrase(tree, PHRASE_24);
    await pressRestore(tree);

    // Đây là phép đo chính: việc khôi phục chưa hề bắt đầu.
    expect(taadEnclave.isAvailable).not.toHaveBeenCalled();

    expect(warn).toHaveBeenCalledTimes(1);
    const [title, message, options] = warn.mock.calls[0];
    expect(String(title)).toMatch(/đăng xuất/i);
    // Phạm vi văng là MỌI máy, không riêng máy này — chữ phải nói đúng điều đó.
    expect(String(message)).toMatch(/máy tính khác|điện thoại khác/i);
    expect(typeof options?.onConfirm).toBe('function');
  });

  it('chỉ khi bấm xác nhận thì việc khôi phục mới chạy', async () => {
    await typePhrase(tree, PHRASE_24);
    await pressRestore(tree);

    const onConfirm = warn.mock.calls[0][2]?.onConfirm as () => void;
    await act(async () => { onConfirm(); });

    expect(taadEnclave.isAvailable).toHaveBeenCalled();
  });

  it('chưa đủ 24 từ thì báo thiếu và KHÔNG mở cửa xác nhận', async () => {
    await typePhrase(tree, 'abandon abandon abandon');
    await pressRestore(tree);

    expect(taadEnclave.isAvailable).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const [, , options] = warn.mock.calls[0];
    // Cảnh báo "thiếu từ" KHÔNG được mang onConfirm — mang thì người dùng bấm
    // tiếp một nhát là khôi phục với cụm từ chưa đủ.
    expect(options?.onConfirm).toBeUndefined();
  });
});
