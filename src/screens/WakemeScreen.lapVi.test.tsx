/**
 * WakemeScreen — nhánh "chưa có ví" phải LẬP VÍ tại chỗ, không đẩy sang màn 24 từ.
 *
 * Vì sao cần một bài kiểm riêng cho đúng nhánh này: chỗ hỏng cũ KHÔNG phải một
 * lỗi, nó là một lối đi. Nút cũ chạy được, màn đích dựng được, ví cuối cùng vẫn
 * có — mọi bài kiểm hành vi đều xanh. Cái sai là người vào đây để nhận LAMP bị
 * dẫn qua màn bày cụm 24 từ, thứ họ không hỏi tới và không thu hồi được sau khi
 * đã lộ. Một lối đi sai thì chỉ bắt được bằng cách ghim lấy ĐÍCH của cú bấm.
 *
 * Nên ca số 1 dưới đây khẳng định CẢ HAI vế, và phải giữ cả hai: có gọi
 * `getOrCreateMasterKek`, và KHÔNG có lời `navigate` nào. Bỏ vế thứ hai thì bài
 * kiểm xanh cho cả bản cũ lẫn bản mới — tức nó không phân biệt được hai cực.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseCapabilityLive = jest.fn();
jest.mock('../config/useCapabilityLive', () => ({
  useCapabilityLive: (...a: unknown[]) => mockUseCapabilityLive(...a),
}));

const mockGetStoredMasterKek = jest.fn();
const mockGetOrCreateMasterKek = jest.fn();
jest.mock('../services/masterKekStore', () => ({
  getStoredMasterKek: (...a: unknown[]) => mockGetStoredMasterKek(...a),
  getOrCreateMasterKek: (...a: unknown[]) => mockGetOrCreateMasterKek(...a),
}));

// Giữ hằng mã lỗi THẬT thay vì gõ lại `9501`. Gõ tay thì đổi giá trị bên nguồn
// là bài kiểm đi trên một mã không tồn tại mà vẫn xanh — mock lỏng hơn mã thật.
const mockIsFeatureOpen = jest.fn();
jest.mock('../services/wakemeService', () => ({
  ...jest.requireActual('../services/wakemeService'),
  isFeatureOpen: (...a: unknown[]) => mockIsFeatureOpen(...a),
}));

const mockShowError = jest.fn();
jest.mock('../utils/alert', () => ({
  showError: (...a: unknown[]) => mockShowError(...a),
  showWarning: jest.fn(),
  showInfo: jest.fn(),
  showSuccess: jest.fn(),
}));

import WakemeScreen from './WakemeScreen';

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

/**
 * Nút mang đúng nhãn chữ này, lấy tầng NGOÀI CÙNG. `TouchableOpacity` dựng
 * nhiều tầng cùng mang `onPress` nên đếm thô ra 2 cho một nút người dùng thấy.
 */
function buttonsWithLabel(tree: renderer.ReactTestRenderer, label: string) {
  const raw = tree.root.findAll(n => {
    if (typeof n.props?.onPress !== 'function') return false;
    return collectText((n as { children?: unknown[] }).children).includes(label);
  });
  return raw.filter(n => !raw.some(k => k !== n && k.findAll(c => c === n).length > 0));
}

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<WakemeScreen />); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCapabilityLive.mockReturnValue(true);
  mockIsFeatureOpen.mockResolvedValue({ open: true, pot: { currentDlamp: 0 } });
});

describe('Nhận LAMP — nhánh chưa có ví', () => {
  it('KHÔNG có ví: hiện nút "Lập ví", và nút đó KHÔNG dẫn sang màn 24 từ', async () => {
    mockGetStoredMasterKek.mockResolvedValue(null);
    mockGetOrCreateMasterKek.mockResolvedValue('kek-moi');

    const tree = await mount();

    // Đối chứng: tìm đúng MỘT nút, không phải 0 (nhãn đã đổi) hay 2 (bắt nhầm tầng).
    const btn = buttonsWithLabel(tree, 'Lập ví');
    expect(btn.length).toBe(1);

    await act(async () => { await btn[0].props.onPress(); });

    expect(mockGetOrCreateMasterKek).toHaveBeenCalledTimes(1);
    // Vế quyết định. Bỏ dòng này thì bản cũ (`navigate('SeedExport')`) cũng xanh.
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('không màn nào trong nhánh này nhắc "24 từ" như điều kiện để nhận LAMP', async () => {
    mockGetStoredMasterKek.mockResolvedValue(null);
    const tree = await mount();
    expect(collectText(tree.toJSON())).not.toMatch(/24 từ/);
  });

  it('lập ví xong thì đọc lại trạng thái, không đứng im ở màn cũ', async () => {
    mockGetStoredMasterKek
      .mockResolvedValueOnce(null)       // lượt dựng: chưa có ví
      .mockResolvedValue('kek-moi');     // sau khi lập: đã có
    mockGetOrCreateMasterKek.mockResolvedValue('kek-moi');

    const tree = await mount();
    await act(async () => {
      await buttonsWithLabel(tree, 'Lập ví')[0].props.onPress();
    });

    // Đã rời nhánh `no_wallet`: không còn nút lập ví nào trên màn.
    expect(buttonsWithLabel(tree, 'Lập ví').length).toBe(0);
    expect(mockIsFeatureOpen).toHaveBeenCalled();
  });

  it('lập ví HỎNG thì nói ra và ở lại, không nuốt lỗi rồi trông như bấm hụt', async () => {
    mockGetStoredMasterKek.mockResolvedValue(null);
    mockGetOrCreateMasterKek.mockRejectedValue(new Error('chip từ chối'));

    const tree = await mount();
    await act(async () => {
      await buttonsWithLabel(tree, 'Lập ví')[0].props.onPress();
    });

    expect(mockShowError).toHaveBeenCalledTimes(1);
    expect(String(mockShowError.mock.calls[0][1])).toContain('chip từ chối');
    // Còn nguyên nhánh chưa có ví ⟹ người dùng thấy đường thử lại.
    expect(buttonsWithLabel(tree, 'Lập ví').length).toBe(1);
  });

  it('ĐÃ có ví: không dựng nhánh lập ví nữa', async () => {
    mockGetStoredMasterKek.mockResolvedValue('kek-cu');
    const tree = await mount();
    expect(buttonsWithLabel(tree, 'Lập ví').length).toBe(0);
    expect(mockGetOrCreateMasterKek).not.toHaveBeenCalled();
  });
});
