/**
 * Bài kiểm KHOÁ LẠI hai lỗi của màn Dẫn đường, cả hai đều ở khối
 * "Cây quanh chỗ bạn đứng".
 *
 *  1. DANH SÁCH KHÔNG CÓ TRẦN KHOẢNG CÁCH. `nearestFixes` chỉ lọc theo khoảng
 *     cách khi được truyền `maxMeters` (xem `wayfind.ts`); thiếu nó thì danh
 *     sách chỉ bị cắt theo SỐ LƯỢNG. Chủ hai vườn cách nhau 30 km sẽ thấy cây
 *     của vườn kia đứng trong mục này kèm số "30 km".
 *
 *  2. HỎI MÁY CHỦ HỎNG THÌ MÀN IM. Trước bản này khối chỉ hiện khi danh sách có
 *     phần tử, nên token hết hạn / 3G rớt vẽ ra đúng cái màn mà "vườn chưa có
 *     cây nào" vẽ ra. Nông dân kết luận vườn mình trống, trong khi màn chỉ chưa
 *     hỏi được. Đây là chức năng chính của chế độ này nên nó phải NÓI RA.
 *
 * ── Bẫy đã tránh ────────────────────────────────────────────────────────────
 * `useNavigation` giả trả về CÙNG MỘT object mỗi lượt render, như
 * react-navigation thật. Trả object mới mỗi lượt thì `useCallback` dựng lại hàm
 * liên tục và lỗi lọt qua — test xanh giả.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';

import { __resetLanguageForTest } from '../i18n/store';
import type { TreeInfo } from '../services/treeReIDService';

/** MỘT object duy nhất cho mọi lượt render — xem "Bẫy đã tránh" ở đầu tệp. */
const mockNav = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn() };
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('react-redux', () => ({
  // Màn chỉ đọc ranh giới vườn từ kho. Không có vườn trong kho là trường hợp
  // hợp lệ (mở từ liên kết ngoài) — mặt phẳng vẫn chạy, chỉ thiếu mảng nền.
  useSelector: (fn: (s: unknown) => unknown) => fn({ farm: { farms: [] } }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../services/treeReIDService', () => ({ getTrees: jest.fn() }));
jest.mock('../features/space3d/positionStore', () => ({
  loadTreePositions: jest.fn(() => Promise.resolve({})),
}));

import { getTrees } from '../services/treeReIDService';
import WayfindScreen from './WayfindScreen';

const mockGetTrees = getTrees as jest.MockedFunction<typeof getTrees>;

// ── Địa lý của bài kiểm ────────────────────────────────────────────────────
/** Đích: một vườn ở TP.HCM. */
const FARM = { lat: 10.762622, lon: 106.660172 };
/** Chỗ đứng: cách vườn ~150 m → chưa "tới nơi", nên màn ở CHẾ ĐỘ 1 (có khối cây). */
const HERE = { lat: 10.762622, lon: 106.658800 };

/** Cây cùng vườn, cách chỗ đứng vài chục mét. */
const NEAR: TreeInfo = {
  tree_id: 'tree-gan', name: 'Cây gần', n_views: 3, has3d: false, anchor: null,
  gps: [10.762900, 106.658900],
};
/** Cây của vườn KHÁC, cách chỗ đứng ~30 km. Đây là thứ không được lọt vào. */
const FAR: TreeInfo = {
  tree_id: 'tree-xa', name: 'Cây vườn kia', n_views: 3, has3d: false, anchor: null,
  gps: [11.030000, 106.660172],
};

/** Mọi câu chữ đang hiện trên màn, gộp lại để soi. */
function screenText(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text)
    .map(n => JSON.stringify(n.props.children))
    .join(' | ');
}

/** Dựng màn với một chỗ đứng cố định (GPS giả bắn đúng một lần). */
async function mount(): Promise<renderer.ReactTestRenderer> {
  (Geolocation.watchPosition as jest.Mock).mockImplementation((onOk: any) => {
    onOk({ coords: { latitude: HERE.lat, longitude: HERE.lon, accuracy: 5, heading: null, speed: 0 } });
    return 1;
  });
  let tree!: renderer.ReactTestRenderer;
  // Màn xin quyền (bất đồng bộ) TRƯỚC khi mở dòng GPS, và hỏi danh sách cây ở
  // một effect khác. Không xả microtask thì test chỉ thấy màn lúc chưa có gì.
  await act(async () => { tree = renderer.create(<WayfindScreen />); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  // App mở mặc định bằng TIẾNG ANH (`i18n/types.DEFAULT_LANG`). Bài kiểm này
  // soi câu chữ nên phải chốt ngôn ngữ, không thì nó đo cả cái mặc định đó.
  __resetLanguageForTest('vi');
  mockRouteParams = { ...FARM, kind: 'farm', label: 'Vườn Bà Rịa', farmId: 'farm-9' };
  mockGetTrees.mockResolvedValue({ ok: true, trees: [NEAR, FAR] });
});

describe('Cây quanh chỗ bạn đứng — trần khoảng cách', () => {
  it('bỏ cây của vườn khác cách 30 km, giữ cây trong tầm đi bộ', async () => {
    const tree = await mount();
    const txt = screenText(tree);

    expect(txt).toContain('Cây gần');
    // Đây là dòng khoá lỗi: thiếu `maxMeters` thì cây này lọt vào kèm số "30 km".
    expect(txt).not.toContain('Cây vườn kia');
  });

  it('không cây nào trong tầm thì NÓI ra, không để khối trống trơn', async () => {
    mockGetTrees.mockResolvedValue({ ok: true, trees: [FAR] });
    const tree = await mount();

    expect(screenText(tree)).toContain('bán kính');
  });

  it('vườn thật sự chưa có cây thì nói đúng câu đó, khác hẳn câu lỗi', async () => {
    mockGetTrees.mockResolvedValue({ ok: true, trees: [] });
    const txt = screenText(await mount());

    expect(txt).toContain('chưa có cây nào được đăng ký');
    expect(txt).not.toContain('Chưa hỏi được máy chủ');
  });
});

describe('Cây quanh chỗ bạn đứng — hỏi máy chủ hỏng', () => {
  it('nói ra là CHƯA HỎI ĐƯỢC, không im lặng thành "vườn trống"', async () => {
    mockGetTrees.mockResolvedValue({
      ok: false,
      error: { type: 'auth_error', detail: 'Phiên hết hạn', http_status: 401 },
    });
    const txt = screenText(await mount());

    // Câu của máy chủ được giữ nguyên — nó cụ thể hơn câu chung của app.
    expect(txt).toContain('Phiên hết hạn');
    expect(txt).toContain('Thử lại');
    // Và tuyệt đối KHÔNG được nói vườn trống khi chưa biết vườn có gì.
    expect(txt).not.toContain('chưa có cây nào được đăng ký');
  });

  it('máy chủ không kèm câu nào thì app tự có câu của mình', async () => {
    mockGetTrees.mockResolvedValue({ ok: false });
    const txt = screenText(await mount());

    expect(txt).toContain('Chưa hỏi được máy chủ');
  });

  it('nút Thử lại hỏi lại máy chủ, và hỏi được thì danh sách hiện ra', async () => {
    mockGetTrees.mockResolvedValue({ ok: false });
    const tree = await mount();
    expect(mockGetTrees).toHaveBeenCalledTimes(1);

    mockGetTrees.mockResolvedValue({ ok: true, trees: [NEAR] });
    const retry = tree.root
      .findAll(n => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function')
      .find(n => n.findAllByType(Text).some(t => String(t.props.children).includes('Thử lại')));
    if (!retry) throw new Error('Không thấy nút Thử lại');

    await act(async () => { retry.props.onPress(); });
    await act(async () => { await Promise.resolve(); });

    expect(mockGetTrees).toHaveBeenCalledTimes(2);
    const txt = screenText(tree);
    expect(txt).toContain('Cây gần');
    expect(txt).not.toContain('Chưa hỏi được máy chủ');
  });
});

// ---------------------------------------------------------------------------
// Mốc vườn — thứ CHỈ nằm trong máy này
// ---------------------------------------------------------------------------

/** Nút bấm được, tìm theo câu chữ đang hiện trên nó. */
function findButton(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAll(n => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function')
    .find(n => n.findAllByType(Text).some(t => String(t.props.children).includes(label)));
}

/** Bấm một nút theo chữ; không thấy nút thì ném lỗi rõ ràng, đừng lặng lẽ qua. */
async function press(tree: renderer.ReactTestRenderer, label: string) {
  const btn = findButton(tree, label);
  if (!btn) throw new Error(`Không thấy nút "${label}"`);
  await act(async () => { btn.props.onPress(); });
  await act(async () => { await Promise.resolve(); });
}

/** Đặt một mốc từ đầu tới cuối, đúng thao tác người dùng làm trên màn. */
async function datMoc(tree: renderer.ReactTestRenderer, name: string) {
  await press(tree, 'Đặt mốc ở đây');
  const input = tree.root.findByType(TextInput);
  await act(async () => { input.props.onChangeText(name); });
  await press(tree, 'Lưu mốc');
}

describe('Mốc vườn', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('có nút đặt mốc, và ngay cạnh nút NÓI RÕ mốc chỉ nằm trong máy này', async () => {
    const txt = screenText(await mount());

    expect(txt).toContain('Đặt mốc ở đây');
    // Máy chủ chưa có chỗ nhận toạ độ mốc — người dùng phải biết TRƯỚC khi đặt.
    expect(txt).toContain('chỉ nằm trong máy này');
    expect(txt).toContain('người khác trong nhà không thấy');
  });

  it('không có mã vườn thì KHÔNG mở lối đặt mốc (mốc phải thuộc về một vườn)', async () => {
    mockRouteParams = { ...FARM, kind: 'farm', label: 'Vườn Bà Rịa' };
    expect(screenText(await mount())).not.toContain('Đặt mốc ở đây');
  });

  it('đặt mốc xong, DỰNG LẠI màn thì mốc còn nguyên', async () => {
    const lan1 = await mount();
    expect(screenText(lan1)).toContain('Chưa có mốc nào');

    await datMoc(lan1, 'Cổng vườn');
    expect(screenText(lan1)).toContain('Cổng vườn');

    // Thoát rồi mở lại — bản duy nhất của mốc nằm trong máy, nên đây đúng là
    // phép đo "mất máy thì mất, còn máy thì còn".
    await act(async () => { lan1.unmount(); });
    const lan2 = await mount();
    expect(screenText(lan2)).toContain('Cổng vườn');
  });

  it('mốc mang khoảng cách + hướng, tính bằng đúng toán của cây', async () => {
    const tree = await mount();
    await datMoc(tree, 'Máy bơm');

    // Đặt tại chỗ đang đứng ⇒ khoảng cách 0 m, và hướng vẫn phải có một tên.
    const txt = screenText(tree);
    expect(txt).toContain('Máy bơm');
    expect(txt).toContain('0 m');
  });

  it('mốc không tên thì KHÔNG lưu — đặt tên là việc duy nhất người dùng phải làm', async () => {
    const tree = await mount();
    await press(tree, 'Đặt mốc ở đây');
    await press(tree, 'Lưu mốc');

    // Hộp còn mở (chưa lưu) và danh sách vẫn trống.
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(screenText(tree)).toContain('Chưa có mốc nào');
  });

  it('sai số GPS hiện thành SỐ ngay lúc đặt mốc', async () => {
    // Dưới tán cây sai số 22 m là thường. Không nói ra thì người dùng tưởng mốc
    // chính xác tới mét — hỏng đúng thứ mốc sinh ra để chữa.
    (Geolocation.watchPosition as jest.Mock).mockImplementation((onOk: any) => {
      onOk({ coords: { latitude: HERE.lat, longitude: HERE.lon, accuracy: 22, heading: null, speed: 0 } });
      return 1;
    });
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WayfindScreen />); });
    await act(async () => { await Promise.resolve(); });

    await press(tree, 'Đặt mốc ở đây');
    expect(screenText(tree)).toContain('±22 m');
  });

  it('chưa bắt được vị trí thì nói ra, và không lưu mốc rỗng toạ độ', async () => {
    (Geolocation.watchPosition as jest.Mock).mockImplementation(() => 1); // không bắn lượt nào
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WayfindScreen />); });
    await act(async () => { await Promise.resolve(); });

    await press(tree, 'Đặt mốc ở đây');
    const txt = screenText(tree);
    expect(txt).toContain('Chưa bắt được vị trí nên chưa đặt mốc được');
    // Nút Lưu bị khoá, không phải "bấm được rồi mới báo lỗi".
    expect(findButton(tree, 'Lưu mốc')?.props.disabled).toBe(true);
  });
});

describe('Mốc vườn — trên mặt phẳng tìm cây (đã tới vườn)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  /** Đứng ĐÚNG chỗ vườn → màn đổi sang mặt phẳng tìm cây. */
  async function mountTaiVuon(): Promise<renderer.ReactTestRenderer> {
    (Geolocation.watchPosition as jest.Mock).mockImplementation((onOk: any) => {
      onOk({ coords: { latitude: FARM.lat, longitude: FARM.lon, accuracy: 5, heading: null, speed: 0 } });
      return 1;
    });
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WayfindScreen />); });
    await act(async () => { await Promise.resolve(); });
    return tree;
  }

  it('mặt phẳng cũng có nút đặt mốc kèm câu "chỉ nằm trong máy này"', async () => {
    const tree = await mountTaiVuon();
    const txt = screenText(tree);

    expect(txt).toContain('Đã tới');            // đúng là đang ở chế độ mặt phẳng
    expect(txt).toContain('Đặt mốc ở đây');
    expect(txt).toContain('chỉ nằm trong máy này');
  });

  it('đặt mốc xong thì mốc hiện trên mặt phẳng, và chạm vào là kim chỉ tới nó', async () => {
    const tree = await mountTaiVuon();
    await datMoc(tree, 'Chỗ để máy bơm');

    expect(screenText(tree)).toContain('Chỗ để máy bơm');

    // Chạm vào mốc → đầu màn đổi sang câu của MỐC, không phải câu của cây: hai
    // loại đích khác nhau về bản chất (cây cả nhà thấy, mốc chỉ máy này thấy).
    const chip = tree.root
      .findAll(n => typeof n.props?.onPress === 'function' && typeof n.props?.onLongPress === 'function')
      .find(n => n.findAllByType(Text).some(t => String(t.props.children).includes('Chỗ để máy bơm')));
    if (!chip) throw new Error('Không thấy mốc trên mặt phẳng');

    await act(async () => { chip.props.onPress(); });
    const txt = screenText(tree);
    expect(txt).toMatch(/mốc Chỗ để máy bơm/);
    expect(txt).not.toContain('Đang tìm Chỗ để máy bơm'); // câu của CÂY
  });
});
