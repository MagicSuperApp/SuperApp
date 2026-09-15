/**
 * Màn XUẤT DANH TÍNH — "chưa có ví" và "không đọc được ví" là HAI màn hình.
 *
 * ── Chỗ hỏng bài này canh ───────────────────────────────────────────────────
 * Ba lời gọi derive địa chỉ từng nằm trong `catch {}` RỖNG. Mọi lần hỏng đều để
 * `fixedAddr` ở `null`, và màn in "Chưa có ví — vào 'Xuất cụm 24 từ' để khởi tạo
 * gốc ví trước". Đó là một lời nói dối về trạng thái, và nó không dừng ở chỗ nói
 * sai: câu ấy đẩy người đang CÓ ví đi mở màn 24 từ để "khởi tạo" một cái gốc ví
 * đã tồn tại — đúng việc nguy hiểm nhất trong app.
 *
 * Danh sách rỗng và lần gọi hỏng phải ra hai màn hình KHÁC NHAU.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockDeriveTaadPubkey = jest.fn();
const mockDeriveWalletAddress = jest.fn();
jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    deriveTaadPubkey: (...a: unknown[]) => mockDeriveTaadPubkey(...a),
    deriveWalletAddress: (...a: unknown[]) => mockDeriveWalletAddress(...a),
  },
}));

const mockCurrentUserDid = jest.fn(async () => 'did:phoenix:mainnet:abc');
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: () => mockCurrentUserDid(),
  ownerPublicKey: jest.fn(async () => 'pub-hw'),
}));

const mockGetStoredMasterKek = jest.fn();
jest.mock('../services/masterKekStore', () => ({
  getStoredMasterKek: () => mockGetStoredMasterKek(),
  getActiveAccountIndex: jest.fn(async () => 1),
}));

jest.mock('../utils/alert', () => ({ showInfo: jest.fn() }));

import ExportIdentityScreen from './ExportIdentityScreen';
import { __resetLanguageForTest, setLanguage } from '../i18n/store';

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<ExportIdentityScreen />); });
  // Lượt nạp chạy trong `useEffect` bất đồng bộ — nhả một nhịp cho nó xong.
  await act(async () => { await Promise.resolve(); });
  return tree;
}

const has = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({ testID }).length > 0;

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
  mockCurrentUserDid.mockResolvedValue('did:phoenix:mainnet:abc');
});

describe('hai lý do trống, hai câu khác nhau', () => {
  it('KHÔNG có Master_KEK ⇒ nói "chưa có ví" và chỉ đường khởi tạo', async () => {
    mockGetStoredMasterKek.mockResolvedValue(null);

    const tree = await mount();

    expect(has(tree, 'export-identity-no-wallet')).toBe(true);
    expect(has(tree, 'export-identity-read-failed')).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('CÓ Master_KEK nhưng derive NÉM ⇒ KHÔNG được nói "chưa có ví"', async () => {
    // Đây là chốt. Trước bản vá, ca này ra y hệt ca trên.
    mockGetStoredMasterKek.mockResolvedValue('kek-hex');
    mockDeriveTaadPubkey.mockRejectedValue(new Error('lõi bảo mật im lặng'));
    mockDeriveWalletAddress.mockRejectedValue(new Error('lõi bảo mật im lặng'));

    const tree = await mount();

    expect(has(tree, 'export-identity-read-failed')).toBe(true);
    expect(has(tree, 'export-identity-no-wallet')).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('câu của ca hỏng phải CẤM khởi tạo lại gốc ví — ghim trọn câu', async () => {
    mockGetStoredMasterKek.mockResolvedValue('kek-hex');
    mockDeriveTaadPubkey.mockRejectedValue(new Error('x'));
    mockDeriveWalletAddress.mockRejectedValue(new Error('x'));

    const tree = await mount();
    const node = tree.root.findAllByProps({ testID: 'export-identity-read-failed' })[0];
    const text = String(node.props.children).replace(/\s+/g, ' ').trim();
    expect(text).toMatch(
      /^Máy này CÓ ví nhưng chưa đọc được địa chỉ\. Đừng khởi tạo lại gốc ví — ví của bạn vẫn còn\. Hãy đóng app rồi mở lại; còn lỗi thì gửi báo cáo\.$/,
    );
    await act(async () => { tree.unmount(); });
  });

  it('derive CHẠY ĐƯỢC ⇒ không câu nào trong hai câu trên hiện ra (ca đối xứng)', async () => {
    // Thiếu ca này thì hai ca trên không phân biệt "phân biệt đúng hai lý do" với
    // "luôn kêu một trong hai".
    mockGetStoredMasterKek.mockResolvedValue('kek-hex');
    mockDeriveTaadPubkey.mockResolvedValue('taad-pub');
    mockDeriveWalletAddress.mockResolvedValue('addr1_test');

    const tree = await mount();

    expect(has(tree, 'export-identity-no-wallet')).toBe(false);
    expect(has(tree, 'export-identity-read-failed')).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('một lượt derive hỏng KHÔNG giết hai lượt còn lại', async () => {
    // Mỗi ô hiện được là một ô người dùng dùng được; gộp ba lượt vào một `try`
    // chung sẽ đổi một lỗi nhỏ thành một màn trắng.
    mockGetStoredMasterKek.mockResolvedValue('kek-hex');
    mockDeriveTaadPubkey.mockRejectedValue(new Error('chỉ khoá TAAD hỏng'));
    mockDeriveWalletAddress.mockResolvedValue('addr1_test');

    const tree = await mount();

    expect(mockDeriveWalletAddress).toHaveBeenCalledTimes(2);
    // Có địa chỉ ví ⇒ không câu trống nào hiện, nhưng lượt hỏng vẫn được ghi nhận
    // (`addrReason === 'error'`) chứ không bị nuốt.
    expect(has(tree, 'export-identity-no-wallet')).toBe(false);
    await act(async () => { tree.unmount(); });
  });
});
