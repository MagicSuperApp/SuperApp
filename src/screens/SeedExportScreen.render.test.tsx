/**
 * SeedExportScreen — bài kiểm HÀNH VI (dựng màn thật).
 *
 * Tách khỏi `SeedExportScreen.gate.test.ts`, và tách CÓ CHỦ Ý. Tệp kia đọc mã
 * nguồn bằng `readFileSync` rồi so chuỗi; nó khoá được những tính chất mà bài
 * kiểm hiện diện không khoá nổi (thứ tự hai lời gọi, sự VẮNG MẶT của một API).
 * Nhưng nó không dựng màn hình lần nào, nên hai lỗi dưới đây đi lọt qua cả 11
 * phép so ở đó — cả hai đều do người xem PR chỉ ra, không do bài kiểm bắt:
 *
 *   1. `currentUserDid()` trả `null` ⇒ thẻ DID biến mất KHÔNG một lời nào.
 *      Màn hình quay về đúng trạng thái nó vừa được sửa để thoát ra, chỉ khác
 *      một điều: lần này người dùng tin là đã chép đủ.
 *   2. `setDid(await currentUserDid())` đặt TRƯỚC `setWords` ⇒ một lần đọc
 *      AsyncStorage ném là người dùng KHÔNG BAO GIỜ thấy 24 từ, dù chip đã xác
 *      nhận xong và cụm từ đã dẫn xuất xong trong bộ nhớ.
 *
 * Bài học chung, đáng giữ hơn hai lỗi: bài kiểm đọc-nguồn đo VĂN BẢN, và văn
 * bản đúng không chứng minh hành vi đúng. Hai loại bài kiểm này bổ nhau, không
 * thay nhau.
 *
 * Dùng `react-test-renderer` theo tiền lệ `MyDevicesScreen.test.tsx`
 * (`@testing-library/react-native` không có trong kho này).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

// Một object ỔN ĐỊNH qua mọi lượt dựng. Trả object MỚI mỗi lượt thì mọi
// `useCallback`/`useEffect` phụ thuộc nó chạy lại, và một lỗi thiếu phụ thuộc
// sẽ TỰ LÀNH trong bài kiểm rồi bung ra ở máy thật.
const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockGetOrCreateMasterKek = jest.fn();
jest.mock('../services/masterKekStore', () => ({
  getOrCreateMasterKek: (...a: unknown[]) => mockGetOrCreateMasterKek(...a),
}));

const mockSignRaw = jest.fn();
const mockCurrentUserDid = jest.fn();
jest.mock('../sdk/phoenixKey', () => ({
  signRaw: (...a: unknown[]) => mockSignRaw(...a),
  currentUserDid: (...a: unknown[]) => mockCurrentUserDid(...a),
}));

const mockMasterKekToMnemonic = jest.fn();
jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    isAvailable: () => true,
    masterKekToMnemonic: (...a: unknown[]) => mockMasterKekToMnemonic(...a),
  },
}));

// Giữ ĐÚNG bộ tên mà mã thật nhập. Mock thiếu một tên thì lời gọi tới nó là
// `undefined is not a function` — một lỗi nói về mock, không nói về màn hình.
const mockShowWarning = jest.fn();
const mockShowInfo = jest.fn();
jest.mock('../utils/alert', () => ({
  showWarning: (...a: unknown[]) => mockShowWarning(...a),
  showInfo: (...a: unknown[]) => mockShowInfo(...a),
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));

// Màn hình nhập `Clipboard` THẲNG từ `react-native`, nên `jest.mock` lên đường
// module nội bộ (`react-native/Libraries/Components/Clipboard/Clipboard`) không
// chạm được đối tượng mà màn hình đang cầm — bản đầu làm vậy và đỏ với
// "Cannot read properties of undefined". Đặt spy lên chính đối tượng được nhập
// thì không phải đoán đường module.
import { Clipboard } from 'react-native';
const mockSetString = jest.spyOn(Clipboard, 'setString').mockImplementation(() => {});

import SeedExportScreen from './SeedExportScreen';
// NHẬP hằng THẬT, không gõ lại chuỗi. Bản đầu của tệp này gõ tay `'USER_CANCELED'`
// trong khi giá trị thật là `'E_USER_CANCELED'` — mock LỎNG hơn mã thật, nên bài
// kiểm đi trên một mã lỗi không tồn tại và tưởng cổng đã nuốt lỗi. Nhập hằng thì
// đổi giá trị bên nguồn là bài kiểm đi theo, không trôi ra khỏi nhau.
import { PhoenixKeyNativeError } from '../services/phoenixKey-native';

const WORDS = Array.from({ length: 24 }, (_, i) => `tu${i + 1}`);
const REAL_DID = 'did:phoenix:mainnet:0123456789abcdef0123456789abcdef';

/** Gom mọi chuỗi Text trong một nhánh của cây dựng được. */
function collectText(node: unknown): string {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'string') { out.push(x); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const n = x as { children?: unknown[] } | null;
    if (n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(node);
  return out.join('\n');
}

const screenText = (t: renderer.ReactTestRenderer) => collectText(t.toJSON());

/**
 * Nút bấm mang đúng nhãn chữ này, lấy tầng NGOÀI CÙNG.
 * `TouchableOpacity` dựng nhiều tầng cùng mang `onPress`, nên đếm thô ra 2 cho
 * một nút người dùng thấy. Bước lọc bỏ mọi nút là con cháu của nút khác.
 */
function buttonsWithLabel(tree: renderer.ReactTestRenderer, label: string) {
  const raw = tree.root.findAll(n => {
    if (typeof n.props?.onPress !== 'function') return false;
    return collectText((n as { children?: unknown[] }).children).includes(label);
  });
  return raw.filter(n => !raw.some(k => k !== n && k.findAll(c => c === n).length > 0));
}

async function openAndReveal() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SeedExportScreen />); });
  const button = buttonsWithLabel(tree, 'Vẫn hiện cụm 24 từ');
  expect(button.length).toBe(1);   // đối chứng: tìm đúng MỘT nút, không phải 0 hay 2
  await act(async () => { await button[0].props.onPress(); });
  return tree;
}

function primeHappyPath() {
  mockGetOrCreateMasterKek.mockResolvedValue('kek-for-test');
  mockSignRaw.mockResolvedValue('signature-for-test');
  mockMasterKekToMnemonic.mockResolvedValue(WORDS.join(' '));
  mockCurrentUserDid.mockResolvedValue(REAL_DID);
}

beforeEach(() => {
  jest.clearAllMocks();
  primeHappyPath();
});

describe('đường bình thường — có DID', () => {
  it('hiện đủ 24 từ VÀ hiện DID', async () => {
    const text = screenText(await openAndReveal());
    expect(text).toContain('tu1');
    expect(text).toContain('tu24');
    expect(text).toContain(REAL_DID);
  });

  it('sao chép mang theo CẢ DID, không chỉ 24 từ', async () => {
    const tree = await openAndReveal();
    const button = buttonsWithLabel(tree, 'Sao chép');
    expect(button.length).toBe(1);
    await act(async () => { button[0].props.onPress(); });

    // Nút sao chép đi qua hộp xác nhận; nút "Vẫn sao chép" nằm trong lượt gọi đó.
    const opts = mockShowWarning.mock.calls.at(-1)?.[2] as { onConfirm?: () => void };
    expect(typeof opts?.onConfirm).toBe('function');
    await act(async () => { opts.onConfirm!(); });

    const copied = mockSetString.mock.calls.at(-1)?.[0] as string;
    expect(copied).toContain(REAL_DID);
    expect(copied).toContain('tu24');
  });
});

describe('KHÔNG có DID — phải nói ra, không được im', () => {
  it('currentUserDid trả null: vẫn hiện 24 từ, VÀ hiện cảnh báo', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    const text = screenText(await openAndReveal());

    // Việc chính vẫn xong.
    expect(text).toContain('tu1');
    expect(text).toContain('tu24');
    // Và màn hình NÓI RA rằng còn thiếu. Đây là phép so bắt được đúng lỗi mà
    // 11 bài kiểm đọc-nguồn không bắt được.
    expect(text).toContain('Không đọc được mã định danh');
    expect(text).toContain('chưa đủ');
    expect(text).not.toContain(REAL_DID);
  });

  it('currentUserDid NÉM: vẫn hiện 24 từ, không nuốt màn hình', async () => {
    mockCurrentUserDid.mockRejectedValue(new Error('AsyncStorage hỏng'));
    const text = screenText(await openAndReveal());

    expect(text).toContain('tu1');
    expect(text).toContain('tu24');
    expect(text).toContain('Không đọc được mã định danh');
    // Và KHÔNG được biến thành hộp "Lỗi": một lần đọc phụ trợ hỏng không phải
    // lý do để giấu thứ người dùng vừa qua sinh trắc để xem.
    const alertTitles = mockShowWarning.mock.calls.map(c => c[0]);
    expect(alertTitles).not.toContain('Lỗi');
  });

  it('sao chép khi thiếu DID: nói rõ là CHƯA đủ', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    const tree = await openAndReveal();
    const button = buttonsWithLabel(tree, 'Sao chép');
    await act(async () => { button[0].props.onPress(); });
    const opts = mockShowWarning.mock.calls.at(-1)?.[2] as { onConfirm?: () => void };
    await act(async () => { opts.onConfirm!(); });

    expect(mockShowInfo.mock.calls.at(-1)?.[1]).toContain('CHƯA có mã định danh');
  });
});

describe('cổng sinh trắc — hành vi, không phải văn bản', () => {
  it('signRaw ném USER_CANCELED: KHÔNG lộ từ nào, và im lặng', async () => {
    mockSignRaw.mockRejectedValue(
      Object.assign(new Error('huỷ'), { code: PhoenixKeyNativeError.USER_CANCELED }),
    );
    const tree = await openAndReveal();

    expect(screenText(tree)).not.toContain('tu1');
    expect(mockShowWarning).not.toHaveBeenCalled();
    // Ví VẪN được tạo — đó là toàn bộ lý do cổng đứng giữa chứ không đứng đầu.
    expect(mockGetOrCreateMasterKek).toHaveBeenCalledTimes(1);
  });

  it('không qua cổng thì KHÔNG dẫn xuất cụm từ', async () => {
    mockSignRaw.mockRejectedValue(
      Object.assign(new Error('x'), { code: PhoenixKeyNativeError.USER_CANCELED }),
    );
    await openAndReveal();
    expect(mockMasterKekToMnemonic).not.toHaveBeenCalled();

    // Đối chứng: ở đường bình thường thì nó CÓ được gọi. Không có phép so này
    // thì phép so trên có thể đúng vì mock hỏng, chứ không vì cổng chạy.
    jest.clearAllMocks();
    primeHappyPath();
    await openAndReveal();
    expect(mockMasterKekToMnemonic).toHaveBeenCalledTimes(1);
  });
});
