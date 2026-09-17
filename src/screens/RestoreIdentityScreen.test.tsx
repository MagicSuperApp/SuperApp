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

// `dispatch` phải trả về thứ có `.unwrap()`, y như `createAsyncThunk` thật: đường
// đăng nhập gọi `.unwrap()` để một lần đăng nhập TRƯỢT rơi vào `catch`
// (`store/userSlice.ts`). Mock trả `undefined` thì `.unwrap()` ném `TypeError`, và
// cái ném đó rơi vào đúng khối `catch` đang được đo — bài kiểm sẽ đỏ dưới một cái
// tên nghe rất hợp lý, hoặc tệ hơn, xanh ở cả hai cực.
const mockUnwrap = jest.fn(async () => undefined);
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));

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
    // Cửa ký HEX — vòng dò khuôn chuỗi ký gọi nó ở lượt thứ hai. Thiếu nó thì màn
    // ném `signEd25519Hex is not a function` và mọi bài ở đây đỏ với một lý do
    // không dính gì tới thứ chúng đo — đúng cái bẫy "bản giả lỏng hơn hàng thật".
    // Trả một chữ ký KHÁC cửa chuỗi, để bài nào cần phân biệt hai lượt thì phân
    // biệt được.
    signEd25519Hex: jest.fn(async () => 'd'.repeat(128)),
    // Nguồn ngẫu nhiên cho chuỗi thử chống phát-lại. Thiếu nó thì `genNonce()` gọi
    // vào `undefined` và ném ngay ở dòng đầu vòng lặp gắn máy — bài kiểm sẽ đỏ với
    // một lý do không dính gì tới thứ nó đo, và đỏ ở chỗ trông y hệt "cổng đã chặn".
    generateSalt: jest.fn(),
    // Đường 24 từ: `deriveMasterKekFromMnemonic` gọi thẳng hàm này
    // (`services/masterKekStore.ts:71`). Thiếu nó thì KEK về `undefined`, màn ném
    // 'Master_KEK trả về không hợp lệ' và mọi bài đi đường 24 từ đỏ vì một lý do
    // không dính gì tới thứ chúng đo.
    mnemonicToMasterKek: jest.fn(),
    // `doRestore` ghi KEK vào kho khoá TRƯỚC khi gắn máy khi máy chưa có ví
    // (`RestoreIdentityScreen.tsx:513-515` → `masterKekStore.storeMasterKek`).
    // Thiếu hàm này thì lời gọi ném `TypeError`, và khối `catch` của `doRestore`
    // gói MỌI lỗi thành câu "Cụm từ không hợp lệ" — nên bài kiểm đỏ với một lý do
    // hoàn toàn không liên quan, lại còn đỏ dưới một cái tên nghe rất hợp lý.
    secureStore: jest.fn(async () => true),
  },
}));

jest.mock('../sdk/phoenixKey', () => ({
  enrollKeypair: jest.fn(),
  ownerPublicKey: jest.fn(),
  saveUserDid: jest.fn(),
  currentUserDid: jest.fn(async () => null),
  signRaw: jest.fn(async () => 'ff'.repeat(32)),
  // Cửa hỏi "chip có khoá nào chưa" — màn dùng nó để quyết có đi hỏi máy chủ theo
  // khoá hay không. Mặc định `false` để các bài cũ giữ nguyên hành vi.
  isKeypairEnrolled: jest.fn(async () => false),
}));

jest.mock('../services/phoenixKey-api', () => ({
  phoenixKeyApi: {
    identity: {
      resolveUsername: jest.fn(async () => ({
        userDid: 'did:phoenix:abcdefghijklm:' + 'a'.repeat(64),
      })),
      recoverDevice: jest.fn(async () => ({})),
      // Ba trạng thái của một mã định danh (issue #233). Mặc định "đang hoạt
      // động" để các bài cũ không đổi hành vi; bài riêng ở cuối tệp đặt lại.
      isActiveAt: jest.fn(async () => ({ active: true, revokedAt: null, neverExisted: false })),
    },
  },
  PhoenixKeyApiError: class extends Error {},
}));

jest.mock('../services/phoenixKeyAuthService', () => {
  // Phép PHÂN LOẠI LỖI và BẢNG CÂU lấy từ bản THẬT, không dựng lại ở đây. Dựng lại
  // là tự viết đề rồi tự chấm: bài kiểm sẽ xanh với một phép phân loại chỉ tồn tại
  // trong tệp kiểm, còn bản chạy thật gộp ba ca làm một mà không gì đỏ.
  const actual = jest.requireActual('../services/phoenixKeyAuthService');
  return {
    phoenixKeyAuth: {
      // Bước ĐĂNG NHẬP THẬT sau khi tra được mã định danh. Để `undefined` thì lời
      // gọi ném và cái ném đó rơi vào khối `catch` đang đo — xanh/đỏ vì một lý do
      // không liên quan.
      unlockExistingIdentity: jest.fn(),
    },
    // Nguồn DID thứ tư của màn — hỏi máy chủ theo chính khoá trong chip. Phải có
    // trong mock: để `undefined` thì lời gọi ném, và cái ném đó rơi vào đúng khối
    // `catch` nuốt lỗi của màn, nên bài kiểm sẽ XANH ở cả hai cực.
    lookupDidByDeviceKey: jest.fn(),
    classifyDeviceKeyLookupFailure: actual.classifyDeviceKeyLookupFailure,
    DEVICE_KEY_LOOKUP_MESSAGE: actual.DEVICE_KEY_LOOKUP_MESSAGE,
  };
});
jest.mock('../store/userSlice', () => ({ loginUser: jest.fn() }));

import taadEnclave from '../sdk/taadEnclave';
import {
  signRaw, ownerPublicKey, enrollKeypair, isKeypairEnrolled, currentUserDid, saveUserDid,
} from '../sdk/phoenixKey';
import { lookupDidByDeviceKey, phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { phoenixKeyApi, PhoenixKeyApiError } from '../services/phoenixKey-api';
import RestoreIdentityScreen from './RestoreIdentityScreen';
import { setLanguage, __resetLanguageForTest } from '../i18n/store';

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

  beforeEach(() => {
    jest.clearAllMocks();
    // KHOÁ TRONG CHIP CÒN — phần thứ hai của tiền đề "máy còn ví", và nó không
    // suy được từ phần thứ nhất. Thẻ lối tắt cần CẢ HAI: ví (KEK) để có gì mà
    // khôi phục, và khoá trong chip để `doRestoreSameDevice` chứng minh được
    // người đang cầm máy là chủ.
    //
    // Ngoài đời hai thứ này đi cùng nhau ở đúng ca thẻ này phục vụ — xoá app rồi
    // cài lại: kho khoá sống qua lần xoá, AsyncStorage thì không. Ca chúng RỜI
    // nhau (còn ví, mất khoá) có đường tới riêng và một khối chữ riêng trên màn;
    // bài canh nó nằm ở cuối tệp.
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(true);
  });

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

/**
 * LỐI TẮT PHẢI CHỊU ĐÚNG HAI RÀNG BUỘC MÀ ĐƯỜNG 24 TỪ ĐANG CHỊU.
 *
 * Bản đầu của lối tắt bỏ cả hai, và bỏ theo cách nghe rất hợp lý: "máy còn ví thì
 * đâu có phá gì". Cả hai vế đều sai:
 *
 * 1. SINH TRẮC — kho khoá mở ở mức `WhenUnlockedThisDeviceOnly` (chỉ cần màn hình
 *    máy đã mở), ký bằng ví cũng không hỏi sinh trắc, còn tên đăng nhập là lời gọi
 *    GET trần không ký. Ba thứ cộng lại: người mượn được máy lúc màn hình đang mở
 *    và biết tên đăng nhập là gắn được khoá CỦA HỌ vào danh tính chủ máy mà không
 *    lần nào đưa mặt ra. Đường 24 từ không có lỗ này chỉ vì 24 từ không nằm trên máy.
 * 2. CẢNH BÁO — hai lối gọi CÙNG một `identity.recoverDevice`, nên hậu quả thu hồi
 *    phiên trên mọi máy là như nhau.
 *
 * Bốn bài dưới đây đo bốn cực khác nhau, không phải bốn cách nói một điều: chưa xác
 * nhận thì chưa chạm gì · xác nhận rồi thì sinh trắc đi TRƯỚC · sinh trắc hỏng thì
 * dừng hẳn · ô tên trống thì không mở cửa. Bỏ bất kỳ chốt nào trong mã đều làm ít
 * nhất một bài đỏ.
 */
describe('RestoreIdentityScreen — lối tắt phải qua cửa xác nhận VÀ sinh trắc', () => {
  let warn: jest.SpyInstance;
  let tree!: ReactTestRenderer;

  const pressShortcut = async (t: ReactTestRenderer) => {
    const btn = t.root.find(n => n.props?.testID === 'restore-same-device-btn');
    await act(async () => { btn.props.onPress(); });
  };
  const typeUsername = async (t: ReactTestRenderer, name: string) => {
    const input = t.root.find(
      n => n.props?.testID === 'restore-username' && typeof n.props?.onChangeText === 'function',
    );
    await act(async () => { input.props.onChangeText(name); });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (taadEnclave.isAvailable as jest.Mock).mockReturnValue(true);
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue('a'.repeat(64));
    (taadEnclave.deriveTaadPubkey as jest.Mock).mockResolvedValue('b'.repeat(64));
    (taadEnclave.signEd25519 as jest.Mock).mockResolvedValue('c'.repeat(64));
    (taadEnclave.generateSalt as jest.Mock).mockResolvedValue('0123456789abcdef');
    (signRaw as jest.Mock).mockResolvedValue('ff'.repeat(32));
    // Khoá phần cứng ĐANG CÓ. Phải đặt: `attachThisDevice` cố ý thử khoá này TRƯỚC
    // rồi mới sinh khoá mới. Lý do KHÔNG phải "enrollKeypair xoá khoá cũ" — hai cầu
    // native TỪ CHỐI sinh đè và trả `E_KEY_EXISTS`; lý do là trên máy còn khoá,
    // gọi `enrollKeypair` trước sẽ NÉM và luồng chết với một mã lỗi native. Để mock
    // trả `undefined` là dựng một cái máy không có khoá nào — không phải ca đang đo.
    (ownerPublicKey as jest.Mock).mockResolvedValue('d'.repeat(64));
    // Thẻ lối tắt chỉ hiện khi CÒN khoá trong chip — xem khối lý do ở describe đầu
    // tệp. Không đặt dòng này thì thẻ không dựng và mọi bài dưới đây đỏ vì không
    // tìm thấy cái nút, chứ không phải vì thứ chúng định đo.
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(true);
    // Đặt LẠI ở đây chứ không chỉ ở nhà máy mock: cấu hình jest của kho này đặt lại
    // mock giữa các bài, nên phần thân hàm khai trong `jest.mock(...)` không sống
    // qua `beforeEach`. Thiếu hai dòng này thì `resolveUsername` trả `undefined`,
    // danh sách mã định danh ứng viên rỗng, và bài kiểm xanh/đỏ vì một lý do không
    // liên quan gì tới thứ nó định đo.
    (phoenixKeyApi.identity.resolveUsername as jest.Mock).mockResolvedValue({
      userDid: 'did:phoenix:abcdefghijklm:' + 'a'.repeat(64),
    });
    (phoenixKeyApi.identity.recoverDevice as jest.Mock).mockResolvedValue({});
    warn = jest.spyOn(appAlert, 'showWarning').mockImplementation(() => {});
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });
    await typeUsername(tree, 'nguoi-thu-dong');
  });

  afterEach(() => { warn.mockRestore(); });

  it('bấm lối tắt thì CHƯA chạm gì — chỉ mở cửa xác nhận nói rõ cái giá', async () => {
    await pressShortcut(tree);

    expect(signRaw).not.toHaveBeenCalled();
    expect(phoenixKeyApi.identity.recoverDevice).not.toHaveBeenCalled();

    expect(warn).toHaveBeenCalledTimes(1);
    const [title, message, options] = warn.mock.calls[0];
    expect(String(title)).toMatch(/đăng xuất/i);
    expect(String(message)).toMatch(/máy tính khác|điện thoại khác/i);
    expect(typeof options?.onConfirm).toBe('function');
  });

  it('xác nhận rồi thì hỏi sinh trắc TRƯỚC, gọi máy chủ SAU', async () => {
    await pressShortcut(tree);
    const onConfirm = warn.mock.calls[0][2]?.onConfirm as () => void;
    await act(async () => { onConfirm(); });

    expect(signRaw).toHaveBeenCalled();
    expect(phoenixKeyApi.identity.recoverDevice).toHaveBeenCalled();
    // THỨ TỰ mới là thứ đang đo. Gọi cả hai mà gọi ngược thì chữ ký của chip không
    // còn là điều kiện của lần gắn máy — nó thành một thủ tục chạy kèm.
    const signOrder = (signRaw as jest.Mock).mock.invocationCallOrder[0];
    const callOrder = (phoenixKeyApi.identity.recoverDevice as jest.Mock)
      .mock.invocationCallOrder[0];
    expect(signOrder).toBeLessThan(callOrder);
  });

  it('sinh trắc HỎNG → dừng hẳn, KHÔNG gọi máy chủ, và nói rõ vì sao', async () => {
    (signRaw as jest.Mock).mockRejectedValue(
      Object.assign(new Error('E_NO_KEY'), { code: 'NO_KEY' }),
    );

    await pressShortcut(tree);
    const onConfirm = warn.mock.calls[0][2]?.onConfirm as () => void;
    await act(async () => { onConfirm(); });

    expect(phoenixKeyApi.identity.recoverDevice).not.toHaveBeenCalled();
    const lastWarn = warn.mock.calls[warn.mock.calls.length - 1];
    expect(String(lastWarn[1])).toMatch(/24 từ/);
  });

  it('chưa gõ tên đăng nhập → không mở cửa xác nhận, không chạm máy chủ', async () => {
    await typeUsername(tree, '');
    await pressShortcut(tree);

    expect(signRaw).not.toHaveBeenCalled();
    expect(phoenixKeyApi.identity.recoverDevice).not.toHaveBeenCalled();
    const [, , options] = warn.mock.calls[0];
    // Cảnh báo "thiếu tên" KHÔNG được mang onConfirm — mang thì bấm tiếp một nhát
    // là chạy luồng khôi phục với một ô trống.
    expect(options?.onConfirm).toBeUndefined();
  });
});

/**
 * BA TRẠNG THÁI CỦA MÃ ĐỊNH DANH — thay cho một câu gộp hai ca (issue #233).
 *
 * Câu cũ khi không gắn được máy: *"Mã định danh vừa nhập không khớp cụm 24 từ,
 * hoặc không có trên máy chủ."* Nó gộp hai ca và bỏ sót hẳn ca thứ ba — mã CÓ
 * THẬT nhưng mọi khoá đã bị thu hồi, tức ca mà gõ lại 80 ký tự bao nhiêu lần cũng
 * không xong. Cửa `identity.isActiveAt` phân biệt được cả ba, và nó đã nằm trong
 * `phoenixKey-api.ts` từ lâu mà KHÔNG nơi nào gọi.
 *
 * Mỗi ca dưới đây phân biệt hai cực: cùng một lượt bấm, chỉ đổi phản hồi của máy
 * chủ, và câu hiện ra phải KHÁC nhau. Gỡ lời gọi `describeDidState` khỏi màn thì
 * cả ba ca đầu đỏ.
 */
describe('RestoreIdentityScreen — mã định danh: chưa từng có · đã thu hồi · còn sống', () => {
  let warn: jest.SpyInstance;
  let tree!: ReactTestRenderer;

  const MA = 'did:phoenix:abcdefghijklm:' + 'a'.repeat(64);

  const typeDid = async (t: ReactTestRenderer, value: string) => {
    const o = t.root.findAll(
      n => n.props?.placeholder === 'did:phoenix:… (để trống nếu khôi phục trên máy cũ)'
        && typeof n.props?.onChangeText === 'function',
    )[0];
    await act(async () => { o.props.onChangeText(value); });
  };
  const pressShortcut = async (t: ReactTestRenderer) => {
    const btn = t.root.find(n => n.props?.testID === 'restore-same-device-btn');
    await act(async () => { btn.props.onPress(); });
  };
  const typeUsername = async (t: ReactTestRenderer, name: string) => {
    const input = t.root.find(
      n => n.props?.testID === 'restore-username' && typeof n.props?.onChangeText === 'function',
    );
    await act(async () => { input.props.onChangeText(name); });
  };

  /** Chạy hết luồng lối tắt tới lúc KHÔNG gắn được máy, trả câu cuối cùng hiện ra. */
  const chayVaLayCau = async (): Promise<string> => {
    await typeUsername(tree, 'nguoi-thu-dong');
    await typeDid(tree, MA);
    await pressShortcut(tree);
    const onConfirm = warn.mock.calls[0][2]?.onConfirm as () => void;
    await act(async () => { onConfirm(); });
    return String(warn.mock.calls[warn.mock.calls.length - 1][1]);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Ngôn ngữ mặc định của môi trường kiểm là TIẾNG ANH (`DEFAULT_LANG`). Chuỗi
    // theo khoá đi qua `tk()` nên không chốt về tiếng Việt thì bài đỏ vì một lý
    // do chẳng liên quan gì tới thứ nó canh.
    __resetLanguageForTest();
    setLanguage('vi');
    (taadEnclave.isAvailable as jest.Mock).mockReturnValue(true);
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue('a'.repeat(64));
    (taadEnclave.deriveTaadPubkey as jest.Mock).mockResolvedValue('b'.repeat(64));
    (taadEnclave.signEd25519 as jest.Mock).mockResolvedValue('c'.repeat(64));
    (taadEnclave.generateSalt as jest.Mock).mockResolvedValue('0123456789abcdef');
    (signRaw as jest.Mock).mockResolvedValue('ff'.repeat(32));
    (ownerPublicKey as jest.Mock).mockResolvedValue('d'.repeat(64));
    // Cùng lý do với hai describe trên: thẻ lối tắt cần khoá trong chip mới dựng.
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(true);
    // Khoá cũ bị từ chối ⟹ màn sinh khoá MỚI rồi thử lại. Mock phải trả đúng
    // hình dạng `{ publicKeyHex }`; trả `undefined` thì luồng chết ở dòng đó và
    // bài kiểm đo một thông báo lỗi không liên quan gì tới thứ nó canh.
    (enrollKeypair as jest.Mock).mockResolvedValue({ alias: 'a', publicKeyHex: 'e'.repeat(64) });
    (phoenixKeyApi.identity.resolveUsername as jest.Mock).mockResolvedValue({ userDid: MA });
    // MỌI lượt gắn máy bị từ chối ⟹ luồng đi tới đúng nhánh câu chữ cần đo.
    // Phải là một `PhoenixKeyApiError` THẬT (lớp của chính module đang dùng):
    // `tryAttachWith` chỉ "thử mã kế tiếp" cho 403/404 của lớp đó, còn lỗi lạ thì
    // nó NÉM ra ngoài — và lúc ấy bài kiểm đo một nhánh khác hẳn nhánh nó định đo.
    (phoenixKeyApi.identity.recoverDevice as jest.Mock).mockRejectedValue(
      // Mock của module này khai `PhoenixKeyApiError` là `class extends Error {}`
      // (một tham số), còn lớp thật nhận ba. `tsc` soi theo lớp THẬT, nên dựng
      // bằng `as unknown as` rồi gán trường — thứ `tryAttachWith` đọc chỉ là
      // `httpStatus`, và điều nó cần là lỗi ĐÚNG LỚP để không bị ném ra ngoài.
      Object.assign(
        new (PhoenixKeyApiError as unknown as new (m: string) => Error)('403'),
        { httpStatus: 403, code: 1403 },
      ),
    );
    warn = jest.spyOn(appAlert, 'showWarning').mockImplementation(() => {});
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });
  });

  afterEach(() => { warn.mockRestore(); });

  it('mã CHƯA TỪNG đăng ký ⟹ bảo kiểm lại từng ký tự', async () => {
    (phoenixKeyApi.identity.isActiveAt as jest.Mock).mockResolvedValue({
      active: false, revokedAt: null, neverExisted: true,
    });
    const cau = await chayVaLayCau();
    expect(phoenixKeyApi.identity.isActiveAt).toHaveBeenCalledWith(MA);
    expect(cau).toMatch(/chưa từng được đăng ký/i);
    expect(cau).not.toMatch(/thu hồi/i);
  });

  it('mã ĐÃ THU HỒI ⟹ nói thẳng 24 từ trên máy này không mở lại được', async () => {
    (phoenixKeyApi.identity.isActiveAt as jest.Mock).mockResolvedValue({
      active: false, revokedAt: '2026-08-01T00:00:00Z', neverExisted: false,
    });
    const cau = await chayVaLayCau();
    expect(cau).toMatch(/thu hồi/i);
    // Cực đối của ca trên: cùng `active: false`, hai câu phải khác nhau.
    expect(cau).not.toMatch(/chưa từng được đăng ký/i);
  });

  it('mã CÒN SỐNG ⟹ chỉ về phía cụm 24 từ, không đổ tội cho mã', async () => {
    (phoenixKeyApi.identity.isActiveAt as jest.Mock).mockResolvedValue({
      active: true, revokedAt: null, neverExisted: false,
    });
    const cau = await chayVaLayCau();
    expect(cau).toMatch(/đang hoạt động/i);
    expect(cau).not.toMatch(/thu hồi|chưa từng được đăng ký/i);
  });

  it('hỏi không được ⟹ GIỮ câu cũ, không bịa một trạng thái', async () => {
    // Chỗ duy nhất câu gộp còn hợp lệ: lúc app thật sự chưa biết.
    (phoenixKeyApi.identity.isActiveAt as jest.Mock).mockRejectedValue(new Error('mất sóng'));
    const cau = await chayVaLayCau();
    expect(cau).not.toMatch(/thu hồi|chưa từng được đăng ký|đang hoạt động/i);
    expect(cau).toMatch(/không ký được cho tài khoản vừa tra/i);
  });
});

/**
 * NGUỒN DID THỨ TƯ — hỏi máy chủ theo CHÍNH khoá trong chip.
 *
 * Ba nguồn cũ đều hỏi cái máy: DID gõ tay · `currentUserDid()` · sổ
 * `@phoenixkey/users` · tên đăng nhập. Ba nguồn giữa nằm trong AsyncStorage hoặc
 * trong trí nhớ người dùng, nên tồn tại đúng một ca mà cả ba cùng câm: cài lại app
 * trên chính máy cũ, và không nhớ tên đăng nhập. Kho khoá thì vẫn giữ khoá qua lần
 * gỡ app, và `POST /identity/lookup` đổi đúng khoá đó lấy DID.
 *
 * Ba bài dưới đây đo ba cực KHÁC NHAU, không phải ba cách nói một điều:
 *   không nhớ gì + chip CÓ khoá   → PHẢI hỏi, và DID hỏi được phải đem đi gắn máy
 *   không nhớ gì + chip KHÔNG khoá → KHÔNG hỏi (không có gì để hỏi)
 *   CÒN nhớ DID                    → KHÔNG hỏi (đừng bắt trả một hộp sinh trắc thừa)
 *
 * Cực thứ ba là cực dễ bỏ nhất và là cực ghim cái cổng `uniqueDids.length === 0`:
 * bỏ nó thì mọi lần khôi phục đều thêm một lần hỏi vân tay, mà một hộp sinh trắc
 * thừa đúng là thứ đã sinh ra `duong1_chua_xac_thuc`.
 */
describe('RestoreIdentityScreen — không nhớ mã nào thì hỏi máy chủ theo khoá trong chip', () => {
  const DID_FROM_KEY = 'did:phoenix:abcdefghijklm:' + 'e'.repeat(64);
  const DID_STORED = 'did:phoenix:abcdefghijklm:' + 'f'.repeat(64);
  const PHRASE = Array(24).fill('abandon').join(' ');

  let warn: jest.SpyInstance;
  let tree!: ReactTestRenderer;

  const chayDuong24Tu = async () => {
    const input = tree.root.findAllByType(TextInput)[0];
    await act(async () => { input.props.onChangeText(PHRASE); });
    const btn = tree.root
      .findAll(n => typeof n.props?.onPress === 'function' && !n.props?.onLongPress)
      .find(n => n.findAllByType(Text).some(l => String(l.props.children).includes('Khôi phục')));
    if (!btn) throw new Error('không tìm thấy nút Khôi phục');
    await act(async () => { btn.props.onPress(); });
    const onConfirm = warn.mock.calls[0][2]?.onConfirm as () => void;
    await act(async () => { onConfirm(); });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (taadEnclave.isAvailable as jest.Mock).mockReturnValue(true);
    // Máy KHÔNG còn ví — đó là ca thật của người vừa cài lại rồi đi đường 24 từ.
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue(null);
    (taadEnclave.mnemonicToMasterKek as jest.Mock).mockResolvedValue('a'.repeat(64));
    (taadEnclave.deriveTaadPubkey as jest.Mock).mockResolvedValue('b'.repeat(64));
    (taadEnclave.signEd25519 as jest.Mock).mockResolvedValue('c'.repeat(64));
    (taadEnclave.generateSalt as jest.Mock).mockResolvedValue('0123456789abcdef');
    (ownerPublicKey as jest.Mock).mockResolvedValue('d'.repeat(64));
    (phoenixKeyApi.identity.recoverDevice as jest.Mock).mockResolvedValue({});
    warn = jest.spyOn(appAlert, 'showWarning').mockImplementation(() => {});
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });
  });

  afterEach(() => { warn.mockRestore(); });

  it('chip CÓ khoá ⟹ hỏi máy chủ, và gắn máy vào đúng mã hỏi được', async () => {
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(true);
    (lookupDidByDeviceKey as jest.Mock).mockResolvedValue(DID_FROM_KEY);

    await chayDuong24Tu();

    expect(lookupDidByDeviceKey).toHaveBeenCalledTimes(1);
    // Hỏi được mà không dùng thì bằng không hỏi — đây mới là phép đo có nghĩa.
    expect(phoenixKeyApi.identity.recoverDevice).toHaveBeenCalledWith(
      expect.objectContaining({ userDid: DID_FROM_KEY }),
    );
    // Và KHÔNG được rơi vào hộp thoại ngõ cụt.
    const titles = warn.mock.calls.map(c => String(c[0]));
    expect(titles).not.toContain('Chưa biết đây là tài khoản nào');
  });

  it('chip KHÔNG có khoá ⟹ không hỏi, và nói thẳng là chưa biết tài khoản nào', async () => {
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(false);
    // `ownerPublicKey` cũng phải ném, nếu không mock vẽ ra một cái máy tự mâu thuẫn:
    // không có khoá nào mà vẫn xuất được khoá công khai.
    (ownerPublicKey as jest.Mock).mockRejectedValue(new Error('chưa có khoá'));

    await chayDuong24Tu();

    expect(lookupDidByDeviceKey).not.toHaveBeenCalled();
    const titles = warn.mock.calls.map(c => String(c[0]));
    expect(titles).toContain('Chưa biết đây là tài khoản nào');
  });

  it('máy CÒN nhớ mã định danh ⟹ KHÔNG hỏi thêm một lần sinh trắc nữa', async () => {
    (currentUserDid as jest.Mock).mockResolvedValue(DID_STORED);
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(true);
    (lookupDidByDeviceKey as jest.Mock).mockResolvedValue(DID_FROM_KEY);

    await chayDuong24Tu();

    expect(lookupDidByDeviceKey).not.toHaveBeenCalled();
    expect(phoenixKeyApi.identity.recoverDevice).toHaveBeenCalledWith(
      expect.objectContaining({ userDid: DID_STORED }),
    );
  });
});

/**
 * CÒN VÍ MÀ MẤT KHOÁ — trạng thái thứ ba, và nó có một đường tới rất thẳng.
 *
 * Người dùng bấm tạo danh tính, máy chủ từ chối vì ví trên máy đã thuộc một DID
 * khác (`wallet_bound_to_other_did`, mã 3005), và `catch` của `registerIdentity`
 * xoá khoá vừa lập. Hộp thoại đưa họ một cái nút sang đúng màn này.
 *
 * Trước bản này thẻ lối tắt chỉ nhìn KEK, nên nó HIỆN RA và hứa "không cần 24 từ"
 * cho một lối đã khoá: `doRestoreSameDevice` mở đầu bằng `signRaw`, không còn khoá
 * thì ném, và câu báo ở đó nói về việc "vừa thêm hoặc xoá vân tay" — sai nguyên
 * nhân, cho đúng nhóm đang kẹt nhất.
 *
 * KHÔNG bỏ phép chứng minh có mặt ấy đi được: Master_KEK hiện đọc được mà không
 * cần sinh trắc, nên nó là thứ duy nhất chặn người mượn được máy cộng biết tên
 * đăng nhập. Chừng nào chốt chip cho khoá ví chưa có, lối tắt PHẢI đóng ở ca này.
 */
describe('RestoreIdentityScreen — còn ví mà mất khoá thì KHÔNG hứa lối tắt', () => {
  const countHostByTestId = (tree: ReactTestRenderer, id: string) =>
    tree.root.findAll(n => n.props?.testID === id && typeof n.type === 'string').length;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetLanguageForTest();
    setLanguage('vi');
    (taadEnclave.isAvailable as jest.Mock).mockReturnValue(true);
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue('a'.repeat(64));
  });

  it('ví CÒN, khoá MẤT ⟹ thẻ lối tắt KHÔNG dựng', async () => {
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(false);

    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });

    expect(countHostByTestId(tree, 'restore-shortcut-same-device')).toBe(0);
  });

  it('ví CÒN, khoá MẤT ⟹ nói THẲNG vì sao, không để màn hình im', async () => {
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(false);

    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });

    // Đo SỰ CÓ MẶT của khối, không đo câu chữ: câu sửa được mà không ai hỏng, còn
    // khối biến mất là người dùng thấy một màn chỉ đòi 24 từ, không có chữ nào nối
    // với câu họ vừa đọc ở màn trước — rồi tự suy ra rằng mình bấm nhầm nút.
    expect(countHostByTestId(tree, 'restore-wallet-without-key')).toBe(1);
  });

  it('ví CÒN, khoá CÒN ⟹ thẻ lối tắt dựng, và khối giải thích KHÔNG hiện', async () => {
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(true);

    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });

    // Ca đối xứng. Thiếu nó thì hai bài trên xanh cả khi ai đó ẩn thẻ lối tắt VĨNH
    // VIỄN — tức bài kiểm không phân biệt được hai cực và nó không canh gì.
    expect(countHostByTestId(tree, 'restore-shortcut-same-device')).toBe(1);
    expect(countHostByTestId(tree, 'restore-wallet-without-key')).toBe(0);
  });

  it('KHÔNG ví ⟹ không thẻ lối tắt, và cũng KHÔNG khối giải thích', async () => {
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue(null);
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(false);

    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<RestoreIdentityScreen />); });

    // Máy mới thì không có gì để giải thích. Khối kia mà hiện ở đây là nói với
    // người dùng rằng máy họ còn một cái ví không tồn tại.
    expect(countHostByTestId(tree, 'restore-shortcut-same-device')).toBe(0);
    expect(countHostByTestId(tree, 'restore-wallet-without-key')).toBe(0);
  });
});

/**
 * LỐI "TÌM LẠI DANH TÍNH BẰNG KHOÁ TRONG CHIP" — lối gỡ ngõ cụt `key-without-did`.
 *
 * ── Ngõ cụt có thật, và cả luồng này sinh ra để gỡ nó ────────────────────────
 * Cài lại app: kho khoá GIỮ khoá phần cứng, AsyncStorage mất sạch. Máy đo ra
 * `key-without-did` (`features/loginNetwork/identityPresence.ts`) và được đưa thẳng
 * sang màn này. Tới 2026-09-17, ở đây họ thấy đúng hai thứ: một ô 24 từ và một ô
 * tên đăng nhập — hai thứ đúng nhóm đó không có (`SeedExportScreen` tự nguyện và
 * nằm SAU lớp đăng nhập). Thẻ lối tắt "ví trên máy" cũng câm, vì nó đòi CẢ
 * Master_KEK (`shortcutUsable` = `Boolean(kekOnDevice) && hasChipKey`).
 *
 * Trong khi `POST /identity/lookup` đổi CHÍNH khoá ấy lấy DID — cửa đã có sẵn, đã
 * chạy ở hai nơi khác, và chưa có nút nào mở được nó từ màn này.
 *
 * ── Bốn cực phải phân biệt được, nếu không bài kiểm không kiểm gì ────────────
 *   chip CÓ khoá        → thẻ HIỆN
 *   chip KHÔNG khoá     → thẻ VẮNG (kể cả khi máy còn ví)
 *   CHƯA ĐO XONG        → thẻ VẮNG (hiện rồi rút lại là hứa một lối rồi lấy đi)
 *   ba ca hỏng          → BA câu khác nhau
 */
describe('RestoreIdentityScreen — lối tìm lại danh tính bằng khoá trong chip', () => {
  const DID_FROM_KEY = 'did:phoenix:abcdefghijklm:' + 'e'.repeat(64);

  const countHostByTestId = (t: ReactTestRenderer, id: string) =>
    t.root.findAll(n => n.props?.testID === id && typeof n.type === 'string').length;

  const pressLane = async (t: ReactTestRenderer) => {
    const btn = t.root.find(n => n.props?.testID === 'restore-device-key-btn');
    await act(async () => { btn.props.onPress(); });
  };

  let warn: jest.SpyInstance;
  let ok: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetLanguageForTest();
    setLanguage('vi');
    (taadEnclave.isAvailable as jest.Mock).mockReturnValue(true);
    // Máy KHÔNG còn ví — đúng ca `key-without-did`, và cũng là cách tách hẳn lối
    // này khỏi thẻ lối tắt: thẻ kia không dựng nổi ở đây.
    (taadEnclave.secureLoad as jest.Mock).mockResolvedValue(null);
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(true);
    (lookupDidByDeviceKey as jest.Mock).mockResolvedValue(DID_FROM_KEY);
    (phoenixKeyAuth.unlockExistingIdentity as jest.Mock).mockResolvedValue({
      id: DID_FROM_KEY, did: DID_FROM_KEY,
    });
    warn = jest.spyOn(appAlert, 'showWarning').mockImplementation(() => {});
    ok = jest.spyOn(appAlert, 'showSuccess').mockImplementation(() => {});
  });

  afterEach(() => { warn.mockRestore(); ok.mockRestore(); });

  const renderScreen = async (): Promise<ReactTestRenderer> => {
    let t!: ReactTestRenderer;
    await act(async () => { t = renderer.create(<RestoreIdentityScreen />); });
    return t;
  };

  it('chip CÓ khoá ⟹ thẻ dựng, kể cả khi máy KHÔNG còn ví', async () => {
    const tree = await renderScreen();
    expect(countHostByTestId(tree, 'restore-device-key-lane')).toBe(1);
    expect(countHostByTestId(tree, 'restore-device-key-btn')).toBe(1);
    // Cực đối trong cùng một lượt dựng: thẻ "ví trên máy" KHÔNG được hạ điều kiện
    // theo. Nó nói về VÍ và nó cần Master_KEK thật.
    expect(countHostByTestId(tree, 'restore-shortcut-same-device')).toBe(0);
  });

  it('chip KHÔNG khoá ⟹ thẻ vắng', async () => {
    (isKeypairEnrolled as jest.Mock).mockResolvedValue(false);
    const tree = await renderScreen();
    expect(countHostByTestId(tree, 'restore-device-key-lane')).toBe(0);
  });

  it('CHƯA ĐO XONG ⟹ thẻ vắng — không hứa một lối rồi lấy đi', async () => {
    // Cực ghim `hasChipKey === true`. Đổi thành `!== false` thì đúng bài này đỏ:
    // thẻ sẽ nháy lên ở lần dựng đầu rồi biến mất khi phép đo trả `false` — mất ở
    // đúng khung hình người dùng vừa nhìn thấy nó.
    (isKeypairEnrolled as jest.Mock).mockReturnValue(new Promise(() => {}));
    const tree = await renderScreen();
    expect(countHostByTestId(tree, 'restore-device-key-lane')).toBe(0);
  });

  it('bấm ⟹ hỏi máy chủ theo khoá, lưu mã tra được, rồi đăng nhập thật', async () => {
    const tree = await renderScreen();
    await pressLane(tree);

    expect(lookupDidByDeviceKey).toHaveBeenCalledTimes(1);
    // Hỏi được mà không dùng thì bằng không hỏi.
    expect(saveUserDid).toHaveBeenCalledWith(DID_FROM_KEY);
    expect(phoenixKeyAuth.unlockExistingIdentity).toHaveBeenCalledTimes(1);
    expect(mockUnwrap).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('lối này CHỈ ĐỌC — không gắn máy, không thu hồi phiên ở đâu cả', async () => {
    // Chốt đắt nhất của thẻ này, và là lý do nó KHÔNG có cửa xác nhận: hai lối kia
    // gọi `identity.recoverDevice`, máy chủ tăng `users.token_epoch` rồi bác MỌI
    // phiên trên MỌI máy. Lối này không được chạm vào cửa đó. Ngày nào nó chạm mà
    // cửa xác nhận vẫn vắng thì người dùng bị đá khỏi mọi máy khác không một lời
    // báo trước — và không có gì khác trên màn hình đổi màu.
    const tree = await renderScreen();
    await pressLane(tree);

    expect(phoenixKeyApi.identity.recoverDevice).not.toHaveBeenCalled();
    expect(enrollKeypair).not.toHaveBeenCalled();
  });

  it('BA ca hỏng ⟹ BA câu khác nhau, không gộp thành "có lỗi xảy ra"', async () => {
    const messageFor = async (failure: unknown): Promise<string> => {
      warn.mockClear();
      (lookupDidByDeviceKey as jest.Mock).mockRejectedValue(failure);
      const tree = await renderScreen();
      await pressLane(tree);
      const lastCall = warn.mock.calls[warn.mock.calls.length - 1];
      return String(lastCall[0]) + ' || ' + String(lastCall[1]);
    };

    const cancelled = await messageFor(
      Object.assign(new Error('user cancelled'), { code: 'E_USER_CANCELED' }),
    );
    const notLinked = await messageFor(
      Object.assign(
        new (PhoenixKeyApiError as unknown as new (m: string) => Error)('404'),
        { httpStatus: 404, code: 2002 },
      ),
    );
    const offline = await messageFor(
      Object.assign(
        new (PhoenixKeyApiError as unknown as new (m: string) => Error)('0'),
        { httpStatus: 0, code: -1 },
      ),
    );

    // Ba chuỗi đôi một khác nhau — đây là phép đo, không phải ba lần đọc một điều.
    expect(new Set([cancelled, notLinked, offline]).size).toBe(3);
    // Và mỗi câu phải nói đúng việc người dùng làm tiếp, ba việc trái ngược nhau.
    expect(cancelled).toMatch(/vân tay|khuôn mặt/i);
    expect(notLinked).toMatch(/24 từ/);
    expect(offline).toMatch(/sóng/i);
    // Ca "khoá chưa thuộc tài khoản nào" là ca bấm lại KHÔNG bao giờ khác — câu của
    // nó không được mời bấm lại, còn hai ca kia thì phải mời.
    expect(notLinked).toMatch(/cũng ra đúng kết quả này/i);
    expect(cancelled).toMatch(/bấm lại|thử lại/i);
    expect(offline).toMatch(/bấm lại|thử lại/i);
  });

  it('hỏng thì KHÔNG báo thành công, và KHÔNG lưu mã nào', async () => {
    (lookupDidByDeviceKey as jest.Mock).mockRejectedValue(new Error('Network Error'));
    const tree = await renderScreen();
    await pressLane(tree);

    expect(ok).not.toHaveBeenCalled();
    expect(saveUserDid).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
