/**
 * Bài kiểm KHOÁ LẠI: mở màn Dẫn đường TỪ danh sách cây phải mang theo MÃ VƯỜN.
 *
 * ── Vì sao đáng một bài kiểm riêng ──────────────────────────────────────────
 * Lỗi này đã xảy ra MỘT LẦN rồi. Trước khi gom về `features/wayfind/WayfindButton`
 * có bốn chỗ tự dựng đường vào màn Dẫn đường, và chúng lệch nhau đúng ở trường
 * này — docblock đầu `WayfindButton.tsx` ghi lại chuyện đó. Gom xong thì lỗi
 * TÁI PHÁT ở một nơi gọi mới: `TreeManagementScreen` gọi `forTree(item)` không
 * truyền mã vườn.
 *
 * Đường lùi trong `forTree` (`tree?.farmId ?? tree?.farm_id`) KHÔNG vớt được gì
 * ở đây: `TreeInfo` — thứ `GET /api/trees` trả về — không có trường nào trong
 * hai trường đó. Nên thiếu tham số là chắc chắn `farmId: undefined`, và ở đầu
 * đọc thì màn Dẫn đường mất ranh giới vườn rồi kéo cây của MỌI vườn về.
 *
 * Bài kiểm này khoá cả hai đầu: nơi gọi phải truyền, và hàm dựng phải giữ.
 *
 * ── Bẫy đã tránh ────────────────────────────────────────────────────────────
 * `useNavigation` giả phải trả về CÙNG MỘT object mỗi lượt render, như
 * react-navigation thật. Trả object mới mỗi lượt thì `useCallback` trong
 * `useOpenWayfind` dựng lại hàm liên tục, và một lớp lỗi thật sẽ biến mất khỏi
 * tầm bài kiểm — xanh giả.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

import { forTree } from '../features/wayfind/WayfindButton';
import type { TreeInfo } from '../services/treeReIDService';

/** MỘT object duy nhất cho mọi lượt render — xem "Bẫy đã tránh" ở đầu tệp. */
const mockNav = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn() };
let mockRouteParams: Record<string, unknown> | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('../services/treeReIDService', () => ({
  getTrees: jest.fn(),
  deleteTree: jest.fn(),
  renameTree: jest.fn(),
}));

import { getTrees } from '../services/treeReIDService';
import TreeManagementScreen from './TreeManagementScreen';

const mockGetTrees = getTrees as jest.MockedFunction<typeof getTrees>;

/** Cây có toạ độ → thẻ mới hiện nút dẫn đường. */
const TREE: TreeInfo = {
  tree_id: 'tree-001',
  name: 'Cây xoài đầu vườn',
  n_views: 4,
  has3d: false,
  anchor: null,
  gps: [10.762622, 106.660172],
};

async function mount(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  // `await act(async …)`: màn hỏi máy chủ trong effect rồi mới dựng danh sách.
  // Không xả microtask thì test chỉ thấy vòng quay "Đang tải…".
  await act(async () => { tree = renderer.create(<TreeManagementScreen />); });
  return tree;
}

/** Bấm đúng nút dẫn đường trên thẻ cây. */
function pressWayfind(tree: renderer.ReactTestRenderer): void {
  const btn = tree.root
    .findAllByType(TouchableOpacity)
    .find(n => String(n.props.accessibilityLabel ?? '').startsWith('Dẫn đường tới'));
  if (!btn) throw new Error('Không thấy nút dẫn đường trên thẻ cây');
  act(() => { btn.props.onPress(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = undefined;
  mockGetTrees.mockResolvedValue({ ok: true, trees: [TREE] });
});

describe('forTree — mã vườn không tự mọc ra từ TreeInfo', () => {
  it('KHÔNG truyền mã vườn thì đích đi với farmId undefined (chính là lỗi cũ)', () => {
    const target = forTree(TREE);
    expect(target).not.toBeNull();
    expect(target!.farmId).toBeUndefined();
  });

  it('truyền mã vườn thì đích giữ đúng mã đó', () => {
    expect(forTree(TREE, 'farm-9')!.farmId).toBe('farm-9');
  });

  it('mã vườn truyền tay THẮNG trường trong bản ghi cây', () => {
    const lai = { ...TREE, farm_id: 'farm-cu' } as any;
    expect(forTree(lai, 'farm-moi')!.farmId).toBe('farm-moi');
  });
});

describe('TreeManagementScreen — đường vào màn Dẫn đường', () => {
  it('mang MÃ VƯỜN của màn danh sách sang màn Dẫn đường', async () => {
    mockRouteParams = { farmId: 'farm-9' };
    const tree = await mount();

    pressWayfind(tree);

    expect(mockNav.navigate).toHaveBeenCalledWith(
      'Wayfind',
      expect.objectContaining({ kind: 'tree', treeId: 'tree-001', farmId: 'farm-9' }),
    );
  });

  it('lọc danh sách theo ĐÚNG vườn đó, để hai chỗ không đếm cây khác nhau', async () => {
    mockRouteParams = { farmId: 'farm-9' };
    await mount();

    expect(mockGetTrees).toHaveBeenCalledWith(expect.any(String), 'farm-9');
  });

  it('không có mã vườn thì vẫn mở được đường, chỉ là không thu hẹp được vườn', async () => {
    const tree = await mount();

    pressWayfind(tree);

    expect(mockGetTrees).toHaveBeenCalledWith(expect.any(String), undefined);
    expect(mockNav.navigate).toHaveBeenCalledWith(
      'Wayfind',
      expect.objectContaining({ treeId: 'tree-001' }),
    );
  });

  it('cây chưa có toạ độ thì KHÔNG hiện nút dẫn đường', async () => {
    mockGetTrees.mockResolvedValue({ ok: true, trees: [{ ...TREE, gps: null }] });
    const tree = await mount();

    const btn = tree.root
      .findAllByType(TouchableOpacity)
      .find(n => String(n.props.accessibilityLabel ?? '').startsWith('Dẫn đường tới'));
    expect(btn).toBeUndefined();
  });
});
