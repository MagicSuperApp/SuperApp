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
    // Nguồn ngẫu nhiên cho chuỗi thử chống phát-lại. Thiếu nó thì `genNonce()` gọi
    // vào `undefined` và ném ngay ở dòng đầu vòng lặp gắn máy — bài kiểm sẽ đỏ với
    // một lý do không dính gì tới thứ nó đo, và đỏ ở chỗ trông y hệt "cổng đã chặn".
    generateSalt: jest.fn(),
  },
}));

jest.mock('../sdk/phoenixKey', () => ({
  enrollKeypair: jest.fn(),
  ownerPublicKey: jest.fn(),
  saveUserDid: jest.fn(),
  currentUserDid: jest.fn(async () => null),
  signRaw: jest.fn(async () => 'ff'.repeat(32)),
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

jest.mock('../services/phoenixKeyAuthService', () => ({ phoenixKeyAuth: {} }));
jest.mock('../store/userSlice', () => ({ loginUser: jest.fn() }));

import taadEnclave from '../sdk/taadEnclave';
import { signRaw, ownerPublicKey, enrollKeypair } from '../sdk/phoenixKey';
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
    // rồi mới sinh khoá mới, vì `enrollKeypair` xoá khoá cũ khỏi chip và khoá đó
    // không có bản sao. Để mock trả `undefined` là dựng một cái máy không có khoá
    // nào — đúng ca mà bản vá này tránh, và không phải ca đang muốn đo.
    (ownerPublicKey as jest.Mock).mockResolvedValue('d'.repeat(64));
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
