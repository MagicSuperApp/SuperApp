/**
 * Màn TẠO DANH TÍNH — khi chip từ chối sinh khoá đè (`E_KEY_EXISTS`).
 *
 * ── Vì sao chốt này cần một bài riêng ở TẦNG MÀN HÌNH ────────────────────────
 * `services/registerChipKeyExists.test.ts` ghim phần dịch vụ: mã native thành một
 * `reason` và một câu. Nó KHÔNG ghim được điều quan trọng còn lại — người dùng có
 * một cái NÚT để đi tiếp hay không. Cả ba nhánh ngõ-cụt trước đó ở màn này
 * (`khoa_bi_thu_hoi`, `can_ten_dang_nhap`, `wallet_bound_to_other_did`) đều học
 * cùng một bài từ thực địa: hiện chữ rồi đóng cửa lại thì người dùng đọc xong vẫn
 * đứng nguyên tại màn đăng ký, vì không có chỗ nào để bấm.
 *
 * ── Đo CÁI GÌ ────────────────────────────────────────────────────────────────
 * Đo HÀNH VI của hộp thoại: có `onConfirm` không, và `onConfirm` đưa đi ĐÂU. Không
 * đo câu chữ tiếng Việt của thân bài — câu đó thuộc tầng dịch vụ và đã có bài ghim
 * riêng; dò lại nó ở đây là dựng một bản sao sẽ chết im lặng khi câu đổi.
 */

import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import * as appAlert from '../../../utils/alert';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

const mockUnwrap = jest.fn(async () => undefined);
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));

// Hộp sinh trắc của hệ điều hành — bước này màn tự khai là BẮT BUỘC, nên nó phải
// trả `success: true` thì luồng mới chạy tới chỗ đang đo.
jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class {
    simplePrompt = jest.fn(async () => ({ success: true }));
  },
  BiometryTypes: { TouchID: 'TouchID', FaceID: 'FaceID', Biometrics: 'Biometrics' },
}));

jest.mock('../../../hooks/useBiometricSensor', () => ({
  useBiometricSensor: () => ({ available: true, biometryType: 'TouchID' }),
}));
jest.mock('../../../hooks/useBottomActionPadding', () => ({
  useBottomActionPadding: () => 24,
}));
jest.mock('../components/StepIndicator', () => 'StepIndicator');

const mockRegisterIdentity = jest.fn();
jest.mock('../../../services/phoenixKeyAuthService', () => ({
  biometricKindFromType: () => 'fingerprint',
  phoenixKeyAuth: {
    registerIdentity: (...args: unknown[]) => mockRegisterIdentity(...args),
  },
}));
jest.mock('../../../store/userSlice', () => ({ loginUser: jest.fn() }));

import SignUpBiometricScreen from './SignUpBiometricScreen';

/** Lỗi đúng hình dạng `registerIdentity` ném khi chip từ chối ghi đè. */
const chipKeyExistsError = () =>
  Object.assign(new Error('Máy này vẫn còn một khoá bảo mật từ lần cài trước…'), {
    reason: 'chip_key_exists',
  });

/** Gõ tên đăng nhập hợp lệ rồi bấm nút bắt đầu — đưa luồng tới chỗ đang đo. */
const startEnrollmentFlow = async (tree: ReactTestRenderer) => {
  const usernameField = tree.root.findAll(
    node => typeof node.props?.onChangeText === 'function' && typeof node.type === 'string',
  )[0];
  await act(async () => { usernameField.props.onChangeText('nguoimoi'); });

  // Chọn theo NHÃN ở trạng thái `idle`, không theo vị trí trong cây: màn có bốn nút
  // bấm được (quay lại · bắt đầu · quay lại ở thanh dưới · Điều khoản) và đếm thứ
  // tự thì trượt sang nút "quay lại" mà bài vẫn chạy được — xanh ở cả hai cực.
  const startButton = tree.root
    .findAll(node => typeof node.props?.onPress === 'function' && !node.props?.onLongPress)
    .find(node =>
      node
        .findAllByType(Text)
        .some(label => String(label.props.children).includes('Bắt đầu xác thực')),
    );
  if (!startButton) throw new Error('không tìm thấy nút bắt đầu');
  await act(async () => { startButton.props.onPress(); });
};

describe('SignUpBiometricScreen — chip còn khoá cũ thì phải có LỐI RA', () => {
  let warn: jest.SpyInstance;
  let tree!: ReactTestRenderer;

  beforeEach(async () => {
    jest.clearAllMocks();
    warn = jest.spyOn(appAlert, 'showWarning').mockImplementation(() => {});
    jest.spyOn(appAlert, 'showError').mockImplementation(() => {});
    await act(async () => { tree = renderer.create(<SignUpBiometricScreen />); });
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('`chip_key_exists` ⟹ hộp thoại có NÚT, và nút đó mở màn Khôi phục', async () => {
    mockRegisterIdentity.mockRejectedValue(chipKeyExistsError());

    await startEnrollmentFlow(tree);

    expect(mockRegisterIdentity).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    const options = warn.mock.calls[warn.mock.calls.length - 1][2];
    // Không có `onConfirm` = hiện chữ rồi đóng cửa lại, đúng ca thực địa 11/09.
    expect(typeof options?.onConfirm).toBe('function');

    await act(async () => { options.onConfirm(); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RestoreIdentity');
  });

  it('KHÔNG có nhánh nào xoá khoá cũ rồi tạo lại', async () => {
    // Khoá trong chip có thể là khoá owner của một danh tính đang sống, và xoá nó
    // là bất khả hồi. Phép đo: sau khi bấm nút của hộp thoại, màn KHÔNG được gọi
    // lại `registerIdentity` — nếu có, nghĩa là ai đó đã dựng một lối "thử lại"
    // ngầm, và lối đó chỉ đi tiếp được bằng cách phá khoá cũ.
    mockRegisterIdentity.mockRejectedValue(chipKeyExistsError());

    await startEnrollmentFlow(tree);
    const callsBefore = mockRegisterIdentity.mock.calls.length;
    const options = warn.mock.calls[warn.mock.calls.length - 1][2];
    await act(async () => { options.onConfirm(); });

    expect(mockRegisterIdentity).toHaveBeenCalledTimes(callsBefore);
  });

  it('ĐỐI CHỨNG — lỗi KHÁC thì KHÔNG mượn lối ra này', async () => {
    // Thiếu ca này, hai bài trên xanh y hệt khi ai đó đưa nút "Mở màn khôi phục"
    // cho MỌI lỗi đăng ký — kể cả lỗi mà màn Khôi phục không giúp được gì.
    mockRegisterIdentity.mockRejectedValue(new Error('máy chủ bận'));

    await startEnrollmentFlow(tree);

    const hasRecoveryButton = warn.mock.calls.some(
      call => typeof (call[2] as { onConfirm?: unknown })?.onConfirm === 'function',
    );
    expect(hasRecoveryButton).toBe(false);
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith('RestoreIdentity');
  });
});
