/**
 * Màn hoàn tất đăng ký — BƯỚC SAO LƯU: không ép, nhưng không giấu.
 *
 * ── Chỗ hỏng bài kiểm này canh ──────────────────────────────────────────────
 * Trước bản này luồng đăng ký không đi qua `SeedExport` một lần nào
 * (`SignUpBiometricScreen` → `SignUpComplete` → `Main`). Cụm 24 từ là đường
 * khôi phục DUY NHẤT, nên phần lớn người dùng có một đường khôi phục mà không
 * có vé vào — và họ chỉ biết vào đúng lúc mất máy.
 *
 * Ba thứ được khoá, cả ba đều trôi được mà không ai thấy:
 *   1. CÓ một lối tới `SeedExport` từ màn này (LỜI GỌI `navigate`).
 *   2. "Nhắc tôi sau" vẫn VÀO ĐƯỢC app — nút này không được biến thành ngõ cụt.
 *   3. KHÔNG có ô đánh dấu "tôi đã ghi lại đủ 24 từ" chặn đường ra. Bản trước
 *      có đúng thứ đó và đã bị gỡ CÓ CHỦ Ý — xem chú thích đầu
 *      `screens/SeedExportScreen.tsx`. Bài kiểm này đứng canh để không ai dựng
 *      lại nó vì thấy "cho chắc".
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
const mockRoute = { params: { username: 'nongdan', user: { did: 'did:phoenix:mainnet:abc' } } };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => mockRoute,
}));

jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));

// `useBottomActionPadding` đọc vùng an toàn của máy; ngoài `SafeAreaProvider`
// thì nó ném. Bọc provider thật chỉ để lấy một con số đệm là kéo cả cây context
// vào bài kiểm mà không đo thêm được gì.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockMarkDeferred = jest.fn((_now?: number) => Promise.resolve());
const mockClearDeferred = jest.fn(() => Promise.resolve());
// Chữ ký khớp ĐÚNG mã thật (`markSeedBackupDeferred(now?: number)`), không nhận
// bừa `...unknown[]`: mock lỏng hơn nguồn thì bài kiểm đi trên một hình dạng lời
// gọi không tồn tại.
jest.mock('../../../services/seedBackupReminder', () => ({
  markSeedBackupDeferred: (now?: number) => mockMarkDeferred(now),
  clearSeedBackupDeferred: () => mockClearDeferred(),
}));

import SignUpCompleteScreen from './SignUpCompleteScreen';
import { IDENTITY_STRINGS } from '../../../i18n/keys';
import { setLanguage, __resetLanguageForTest } from '../../../i18n/store';

const vi = (key: keyof typeof IDENTITY_STRINGS) => IDENTITY_STRINGS[key].vi;

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
  return out.join(' ');
}

/**
 * Màn chạy một chuỗi bước bằng đồng hồ đếm (700 + 900 ms) trước khi `allDone`.
 * Đẩy đồng hồ giả tới hết thay vì chờ thật — chờ thật là bài kiểm chậm mà không
 * chắc chắn hơn một chút nào.
 */
async function mountDone() {
  jest.useFakeTimers();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SignUpCompleteScreen />); });
  for (let i = 0; i < 4; i++) {
    await act(async () => { jest.advanceTimersByTime(1000); });
  }
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
});

afterEach(() => { jest.useRealTimers(); });

describe('bước sao lưu', () => {
  it('có lối đi thẳng tới màn 24 từ', async () => {
    const tree = await mountDone();
    act(() => { tree.root.findByProps({ testID: 'signup-backup-now' }).props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('SeedExport');
    await act(async () => { tree.unmount(); });
  });

  it('nói rõ vì sao nên lưu, không chỉ đưa một cái nút', async () => {
    const tree = await mountDone();
    const text = collectText(tree.toJSON());
    expect(text).toContain(vi('identity.backup.title'));
    expect(text).toContain(vi('identity.backup.body'));
    await act(async () => { tree.unmount(); });
  });

  it('"Nhắc tôi sau" ghi mốc RỒI vào app — không phải ngõ cụt', async () => {
    const tree = await mountDone();
    act(() => { tree.root.findByProps({ testID: 'signup-backup-later' }).props.onPress(); });
    expect(mockMarkDeferred).toHaveBeenCalled();
    expect(mockNav.reset).toHaveBeenCalledWith(
      expect.objectContaining({ routes: [{ name: 'Main' }] }),
    );
    await act(async () => { tree.unmount(); });
  });

  it('KHÔNG ép: cả hai nút đều bấm được, không nút nào bị chặn sau một lời khai', async () => {
    const tree = await mountDone();
    const now = tree.root.findByProps({ testID: 'signup-backup-now' });
    const later = tree.root.findByProps({ testID: 'signup-backup-later' });
    // `disabled` phải là vắng mặt hoặc `false`. Một ô tick "tôi đã ghi lại đủ 24
    // từ" khoá nút Hoàn tất chính là hình dạng đã bị gỡ có chủ ý ở màn 24 từ.
    expect(now.props.disabled).toBeFalsy();
    expect(later.props.disabled).toBeFalsy();
    await act(async () => { tree.unmount(); });
  });
});
