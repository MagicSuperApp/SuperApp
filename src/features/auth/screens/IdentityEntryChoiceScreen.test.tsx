/**
 * Màn HỎI ở cửa vào — ba lối rẽ, mỗi lối nói cái giá của nó TRƯỚC khi bấm.
 *
 * Bài kiểm dựng màn thật và bấm đúng những nút người dùng bấm. Nó khoá bốn thứ,
 * cả bốn đều hỏng-mà-không-kêu nếu ai đó gỡ:
 *
 *   1. Ba lối rẽ tồn tại và dẫn tới đích của mình (LỜI GỌI `navigate`, không
 *      phải sự có mặt của một chuỗi trong mã nguồn).
 *   2. Cái giá của lối B và lối C hiện SẴN trên màn, không đợi người dùng bấm
 *      rồi mới nói. Đây là chỗ dễ trôi nhất: đẩy câu cảnh báo vào một hộp thoại
 *      sau lượt bấm thì màn vẫn "có cảnh báo", mà người dùng đã chọn xong rồi.
 *   3. KHÔNG nút nào trên màn này thiếu chữ. Nút tròn chỉ-icon là thứ đang được
 *      sửa; dựng lại nó ở đây là quay về đúng chỗ hỏng.
 *   4. Có đường quay lại.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

import IdentityEntryChoiceScreen from './IdentityEntryChoiceScreen';
// NHẬP chuỗi THẬT, không gõ lại câu chữ trong bài kiểm. Gõ lại là dựng một bản
// sao sẽ chết im lặng khi chủ nhân sửa câu chữ ở tệp nguồn.
import { IDENTITY_STRINGS } from '../../../i18n/keys';
// Ngôn ngữ mặc định của môi trường kiểm là tiếng Anh (`DEFAULT_LANG`), nên phải
// chốt về tiếng Việt trước khi so — không thì bài kiểm đỏ vì lý do chẳng liên
// quan gì tới thứ nó canh.
import { setLanguage, __resetLanguageForTest } from '../../../i18n/store';

/** Gom mọi chuỗi `Text` trong một nhánh cây đã dựng. */
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

function mount() {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<IdentityEntryChoiceScreen />); });
  return tree;
}

const vi = (key: keyof typeof IDENTITY_STRINGS) => IDENTITY_STRINGS[key].vi;

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
});

describe('ba lối rẽ', () => {
  it('người mới → màn tạo danh tính', () => {
    const tree = mount();
    act(() => { tree.root.findByProps({ testID: 'entry-choice-new' }).props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('SignUpBiometric');
    act(() => { tree.unmount(); });
  });

  it('đổi điện thoại / cài lại CÙNG app → màn 24 từ', () => {
    const tree = mount();
    act(() => { tree.root.findByProps({ testID: 'entry-choice-same-app' }).props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('RestoreIdentity');
    act(() => { tree.unmount(); });
  });

  it('máy này đang có APP KHÁC của hệ → màn 24 từ (đích TẠM, màn nói rõ)', () => {
    const tree = mount();
    act(() => { tree.root.findByProps({ testID: 'entry-choice-other-app' }).props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('RestoreIdentity');
    // Đường "app cũ ký phê duyệt" chưa tồn tại. Màn phải nói ra, không để người
    // dùng tưởng lối C có đường riêng.
    expect(collectText(tree.toJSON())).toContain(vi('identity.gate.otherApp.temporary'));
    act(() => { tree.unmount(); });
  });

  it('có app đang đăng nhập trong tay → màn ghép máy, vai HIỆN MÃ (issue #233)', () => {
    // Lối thứ tư, mở bằng `POST /keys/authorize`. Nó KHÔNG thay lối C: lối C phục
    // vụ người không có máy kia trong tay. Vai phải là `show` — máy này chưa có
    // danh tính nên nó là bên đi XIN, không phải bên đi duyệt.
    const tree = mount();
    act(() => { tree.root.findByProps({ testID: 'entry-choice-pair' }).props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('DevicePair', { mode: 'show' });
    act(() => { tree.unmount(); });
  });

  it('lối D KHÔNG mang dòng "bạn sẽ mất gì" — nó không thu hồi khoá nào', () => {
    // Cực đối của ca `cost` ở lối B/C. `POST /keys/authorize` THÊM một khoá vào
    // DID; bịa một cái giá ở đây là nói sai theo chiều ngược lại, và nó đẩy người
    // dùng sang lối đắt hơn.
    const tree = mount();
    const cardD = tree.root.findByProps({ testID: 'entry-choice-pair' });
    const textD = collectText(cardD.props.children);
    expect(textD).not.toContain(vi('identity.gate.sameApp.cost'));
    expect(textD).not.toContain(vi('identity.gate.otherApp.cost'));
    act(() => { tree.unmount(); });
  });

  it('ba lối là BA lựa chọn tách bạch, không phải một lựa chọn hiện ba lần', () => {
    const tree = mount();
    const text = collectText(tree.toJSON());
    for (const key of [
      'identity.gate.new.title',
      'identity.gate.sameApp.title',
      'identity.gate.otherApp.title',
    ] as const) {
      expect(text).toContain(vi(key));
    }
    act(() => { tree.unmount(); });
  });
});

describe('cái giá hiện TRƯỚC lượt bấm', () => {
  it('lối B và lối C mang câu hệ quả của mình ngay trên màn, chưa bấm gì cả', () => {
    const tree = mount();
    const text = collectText(tree.toJSON());
    // Chưa một lượt bấm nào xảy ra ở ca này — nếu câu này chỉ hiện sau lượt
    // bấm thì phép so dưới đây đỏ, đúng điều cần canh.
    expect(mockNav.navigate).not.toHaveBeenCalled();
    expect(text).toContain(vi('identity.gate.sameApp.cost'));
    expect(text).toContain(vi('identity.gate.otherApp.cost'));
    act(() => { tree.unmount(); });
  });

  it('lối A KHÔNG bịa ra một cái giá — nó không thu hồi phiên của ai', () => {
    const tree = mount();
    const cardA = tree.root.findByProps({ testID: 'entry-choice-new' });
    const textA = collectText(cardA.props.children);
    expect(textA).not.toContain(vi('identity.gate.sameApp.cost'));
    expect(textA).not.toContain(vi('identity.gate.otherApp.cost'));
    act(() => { tree.unmount(); });
  });
});

describe('không nút nào thiếu chữ', () => {
  it('mọi nút bấm được đều có chữ đọc bằng mắt, không chỉ nhãn cho trình đọc màn hình', () => {
    const tree = mount();
    const pressables = tree.root.findAll(
      n => typeof n.props?.onPress === 'function' && n.props?.accessibilityRole === 'button',
      { deep: true },
    );
    expect(pressables.length).toBeGreaterThanOrEqual(4); // 3 lối rẽ + quay lại
    const khongChu = pressables
      .filter(n => collectText(n.props.children).trim().length === 0)
      .map(n => String(n.props.testID ?? n.props.accessibilityLabel ?? '?'));
    expect(khongChu).toEqual([]);
    act(() => { tree.unmount(); });
  });
});

describe('đường quay lại', () => {
  it('về được màn đăng nhập', () => {
    const tree = mount();
    act(() => { tree.root.findByProps({ testID: 'entry-choice-back' }).props.onPress(); });
    expect(mockNav.goBack).toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});
