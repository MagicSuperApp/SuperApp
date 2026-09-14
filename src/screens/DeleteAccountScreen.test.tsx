/**
 * Màn XOÁ TÀI KHOẢN — nói ĐỦ hệ quả, và nói ĐÚNG việc máy chủ đã làm.
 *
 * ── Hai chỗ hỏng bài này canh ───────────────────────────────────────────────
 *
 * 1. HỆ QUẢ MẤT TIỀN KHÔNG ĐƯỢC NHẮC MỘT CHỮ. `wipeLocalIdentity()` gọi
 *    `clearMasterKek()` — Master_KEK là gốc sinh mọi ví Cardano của tài khoản.
 *    Xoá nó mà chưa cất 24 từ thì số dư vẫn nằm trên chuỗi và không ai tiêu được
 *    nữa. Ba dòng hệ quả cũ nói về khoá, dữ liệu máy chủ, dữ liệu trên chuỗi —
 *    không dòng nào nói tới TIỀN. Người đọc hết rồi gõ XOÁ là người vừa đồng ý
 *    một việc màn hình chưa hề nói ra.
 *
 * 2. CÂU BÁO THÀNH CÔNG PHÁT RA MÀ KHÔNG ĐỌC KẾT QUẢ. `requestRemoteDeletion`
 *    khai ba trạng thái và đang LUÔN trả `'pending'` (`REMOTE_DELETE_ENABLED =
 *    false` ⇒ chỉ ghi một dòng nhật ký, không gọi backend nào). Mã cũ vứt trả về
 *    đi rồi nói "đã được ghi nhận và sẽ được xử lý".
 *
 * ── Vì sao dựng màn THẬT chứ không đọc mã nguồn rồi so chuỗi ────────────────
 * Vế 2 là một nhánh rẽ theo giá trị trả về; đọc mã thì không phân biệt được
 * "có nhánh" với "nhánh chạy đúng ca". Ở đây bài kiểm bấm đúng cái nút người
 * dùng bấm rồi đọc câu THẬT SỰ được đưa cho `showSuccess`.
 *
 * Dùng `react-test-renderer` theo tiền lệ `LoginScreen.entry.test.tsx`
 * (`@testing-library/react-native` không có trong kho này).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockDispatch = jest.fn(() => Promise.resolve());
jest.mock('../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ user: { currentUser: { did: 'did:phoenix:mainnet:abc' } } }),
}));
jest.mock('../store/userSlice', () => ({ logoutUser: () => ({ type: 'user/logout' }) }));

// Chữ ký khớp ĐÚNG mã thật (`services/accountDeletionService.ts`), không nhận bừa
// `...unknown[]`: mock lỏng hơn nguồn thì bài kiểm đi trên một hình dạng lời gọi
// không tồn tại.
const mockRequestRemoteDeletion = jest.fn(async (_did: string | null | undefined) => 'pending');
const mockWipeLocalIdentity = jest.fn(async () => {});
jest.mock('../services/accountDeletionService', () => ({
  requestRemoteDeletion: (did: string | null | undefined) => mockRequestRemoteDeletion(did),
  wipeLocalIdentity: () => mockWipeLocalIdentity(),
}));

const mockShowSuccess = jest.fn();
const mockShowInfo = jest.fn();
jest.mock('../utils/alert', () => ({
  showSuccess: (...a: unknown[]) => mockShowSuccess(...a),
  showInfo: (...a: unknown[]) => mockShowInfo(...a),
}));

import DeleteAccountScreen from './DeleteAccountScreen';
import { __resetLanguageForTest, setLanguage } from '../i18n/store';

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
  // Chuỗi trong JSX bị xuống dòng + thụt lề, nên phải gộp khoảng trắng trước khi so.
  return out.join(' ').replace(/\s+/g, ' ');
}

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<DeleteAccountScreen />); });
  return tree;
}

/** Gõ từ xác nhận rồi bấm nút xoá — đúng hai thao tác của người dùng. */
async function confirmAndDelete(tree: renderer.ReactTestRenderer) {
  const input = tree.root.findByType(require('react-native').TextInput);
  await act(async () => { input.props.onChangeText('XOÁ'); });
  const deleteBtn = tree.root
    .findAllByType(require('react-native').TouchableOpacity)
    .find(n => collectText(n).includes('Xoá vĩnh viễn'))!;
  await act(async () => { await deleteBtn.props.onPress(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
  mockRequestRemoteDeletion.mockResolvedValue('pending');
});

describe('hệ quả phải nói ĐỦ trước khi người dùng gõ XOÁ', () => {
  it('nói rõ mất quyền vào ví và tài sản', async () => {
    const tree = await mount();
    const text = collectText(tree.toJSON());
    // Ghim TRỌN câu, không phải một mẩu: `toContain` với một mẩu ngắn qua được
    // gần như mọi lần viết lại câu, kể cả lần viết lại làm mất nghĩa cảnh báo.
    expect(text).toMatch(/Mất quyền vào ví và tài sản/);
    expect(text).toMatch(
      /Khoá gốc của ví bị xoá cùng danh tính\. ADA, LAMP và mọi tài sản trong ví của bạn vẫn còn trên chuỗi nhưng sẽ KHÔNG ai tiêu được nữa — trừ khi bạn đã cất giữ cụm 24 từ\. Không có 24 từ thì số tiền đó mất vĩnh viễn, và không ai cấp lại được\./,
    );
    await act(async () => { tree.unmount(); });
  });

  it('không tả một lần GỬI tới máy chủ, vì lần gửi đó không xảy ra', async () => {
    const tree = await mount();
    const text = collectText(tree.toJSON());
    expect(text).toMatch(/Ghi lại yêu cầu xoá phía máy chủ/);
    expect(text).toMatch(
      /Hiện chưa có cửa xoá tự động theo danh tính, nên app chỉ ghi lại yêu cầu để người trực xử lý tay\./,
    );
    // Câu cũ tả một hành động không có thật.
    expect(text).not.toMatch(/Gửi yêu cầu xoá tới máy chủ/);
    await act(async () => { tree.unmount(); });
  });
});

describe('câu báo cuối phải khớp trạng thái THẬT của lượt gọi', () => {
  it("'pending' ⇒ nói thẳng là máy chủ CHƯA xoá", async () => {
    mockRequestRemoteDeletion.mockResolvedValue('pending');
    const tree = await mount();
    await confirmAndDelete(tree);

    expect(mockShowSuccess).toHaveBeenCalled();
    const body = mockShowSuccess.mock.calls[0][1] as string;
    expect(body).toMatch(
      /^Dữ liệu trên máy này đã được xoá\. Phía máy chủ thì CHƯA xoá: yêu cầu mới chỉ được ghi lại để người trực xử lý tay, và app chưa nhận được xác nhận nào\.$/,
    );
    await act(async () => { tree.unmount(); });
  });

  it("'done' ⇒ mới được nói máy chủ đã xoá — ca đối xứng", async () => {
    // Thiếu ca này thì ca trên không phân biệt được "rẽ theo trạng thái" với
    // "luôn in một câu bi quan": một chuỗi hằng cũng làm ca trên xanh.
    mockRequestRemoteDeletion.mockResolvedValue('done');
    const tree = await mount();
    await confirmAndDelete(tree);

    const body = mockShowSuccess.mock.calls[0][1] as string;
    expect(body).toMatch(
      /^Dữ liệu trên máy này đã được xoá, và máy chủ đã xoá dữ liệu gắn với danh tính của bạn\.$/,
    );
    await act(async () => { tree.unmount(); });
  });

  it("'failed' ⇒ chỉ đường liên hệ hỗ trợ, không im lặng", async () => {
    mockRequestRemoteDeletion.mockResolvedValue('failed');
    const tree = await mount();
    await confirmAndDelete(tree);

    const body = mockShowSuccess.mock.calls[0][1] as string;
    expect(body).toMatch(/lần gửi yêu cầu vừa rồi hỏng/);
    expect(body).toMatch(/liên hệ hỗ trợ/);
    await act(async () => { tree.unmount(); });
  });

  it('dù trạng thái nào thì khoá trên máy vẫn bị xoá — xoá cục bộ là phần app làm THẬT', async () => {
    mockRequestRemoteDeletion.mockResolvedValue('pending');
    const tree = await mount();
    await confirmAndDelete(tree);
    expect(mockWipeLocalIdentity).toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
