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
//
// ⚠️ TỪ 2026-09-11 phép đo này KHÔNG còn độc quyền cho `doRestore`: màn dựng xong
// là gọi `getStoredMasterKek()` để biết có hiện thẻ lối tắt "máy còn ví" không, mà
// hàm đó mở đầu bằng đúng `taad.isAvailable()`. Nên `beforeEach` phải XOÁ số đếm
// SAU khi dựng màn, và trước khi xoá thì khẳng định đúng số lần mount gọi — nếu
// sau này có thêm một chỗ gọi lúc mount, khẳng định đó đỏ và người sửa biết ngay,
// thay vì cứ thế bị xoá lẫn vào.
jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(() => false),
    secureLoad: jest.fn(async () => null),
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
    // Phép dò lúc mount (thẻ lối tắt) — khẳng định trước, xoá sau. Xem chú thích
    // ở khối `jest.mock('../sdk/taadEnclave')`.
    expect(taadEnclave.isAvailable).toHaveBeenCalledTimes(1);
    (taadEnclave.isAvailable as jest.Mock).mockClear();
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

/**
 * LỐI TẮT "máy này vẫn còn ví" — thứ quyết định màn này có phải ngõ cụt không.
 *
 * Kho khoá của iOS/Android giữ Master_KEK qua lần xoá-cài-lại app; AsyncStorage
 * thì không. Người cài lại app trên chính máy cũ vì thế còn nguyên ví mà mất sạch
 * mã định danh — và cả ba lối ở màn hỏi cửa vào đều đổ về màn này, vốn chỉ nhận 24
 * từ. Ai chưa từng tự mở `SeedExportScreen` thì không có 24 từ nào để nhập.
 *
 * Hai cực phải phân biệt được, nếu không thì bài kiểm này không kiểm gì:
 *   có ví trên máy   → thẻ lối tắt HIỆN
 *   không có ví      → thẻ lối tắt VẮNG (và màn quay về đúng hình dạng cũ)
 */
describe('RestoreIdentityScreen — lối tắt khi máy còn ví', () => {
  // Đếm PHẦN TỬ NỀN (`typeof n.type === 'string'`). `findAll` mặc định trả cả nút
  // hợp thành lẫn nút nền, nên một `<TextInput testID=…>` ra HAI kết quả — con số
  // đó không nói được gì về số ô thật sự trên màn.
  const countHostByTestId = (tree: ReactTestRenderer, id: string) =>
    tree.root.findAll(n => n.props?.testID === id && typeof n.type === 'string').length;

  beforeEach(() => { jest.clearAllMocks(); });

  it('máy CÒN ví → hiện thẻ lối tắt + ô tên đăng nhập, không đòi 24 từ', async () => {
    (taadEnclave.isAvailable as jest.Mock).mockReturnValue(true);
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue('a'.repeat(64));

    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });

    expect(countHostByTestId(tree, 'restore-shortcut-same-device')).toBe(1);
    expect(countHostByTestId(tree, 'restore-username')).toBe(1);
    expect(countHostByTestId(tree, 'restore-same-device-btn')).toBe(1);
  });

  it('máy KHÔNG còn ví → thẻ lối tắt vắng mặt', async () => {
    (taadEnclave.isAvailable as jest.Mock).mockReturnValue(false);
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue(null);

    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });

    expect(countHostByTestId(tree, 'restore-shortcut-same-device')).toBe(0);
    // Ô tên đăng nhập vẫn còn, nhưng ở chỗ khác (kèm đường 24 từ) — nó là nguồn
    // DID rẻ nhất cho máy mới, nên không được biến mất cùng thẻ lối tắt.
    expect(countHostByTestId(tree, 'restore-username')).toBe(1);
  });
});
