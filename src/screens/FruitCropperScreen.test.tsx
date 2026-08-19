/**
 * FruitCropperScreen — hai lỗi ĐÃ TỪNG XẢY RA, khoá lại bằng test.
 *
 * ── Vì sao phải render cả màn, không test hàm rời ───────────────────────────
 * Cả hai lỗi đều nằm ở CÁCH NỐI giữa các hook, không nằm trong phép tính nào:
 *
 *   1. `useRegion` thiếu `runAddView` trong danh sách phụ-thuộc ⇒ nó ôm mãi bản
 *      `runAddView` của lần render đầu, nên mặt quả gửi lên luôn là `'side'` dù
 *      người dùng đã chọn "Đít quả". Lỗi này chỉ nổ THEO THỨ TỰ THAO TÁC: chọn
 *      mặt rồi bấm ngay là sai; chọn mặt rồi kéo/phóng ảnh rồi mới bấm thì lại
 *      đúng, vì thao tác kéo làm `regionToOrig` đổi và kéo theo `useRegion` được
 *      dựng lại. Tách hàm ra test riêng là mất đúng cái nối đang hỏng.
 *
 *   2. Đọc `r.ok` thay vì `outcomeOf(r)` khi hỏi danh sách quả để đối chiếu ⇒
 *      mất mạng bị vẽ thành "cây chưa có quả nào — đặt tên để lưu quả mới", và
 *      nông dân tạo hồ sơ trùng cho một quả kho đã có. Không ai gộp lại được nữa.
 *
 * ⚠️ BẪY KHI VIẾT TEST NÀY: `useNavigation` giả PHẢI trả về CÙNG MỘT đối tượng
 * mỗi lần render, y như react-navigation thật. Trả đối tượng mới mỗi lượt thì
 * MỌI `useCallback` trong màn bị dựng lại sau mỗi lần đặt state — lỗi (1) tự
 * biến mất và test PASS giả. Xem `describe('bẫy của chính bộ test này')` cuối tệp.
 */

import React from 'react';

import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// ── Thay các lớp cầu ngoài, GIỮ NGUYÊN mọi logic của màn ────────────────────

/** Một đối tượng DUY NHẤT, dựng ở tầng module — xem cảnh báo ở đầu tệp. */
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: jest.fn(),
};

let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
}));

const mockSafeAreaInsets = { top: 44, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

// GIỮ nguyên phần THUẦN của module thật, chỉ thay đúng cửa mạng. Bản trước liệt
// kê tay hai hàm, nên mọi hàm thuần thêm sau đó (ví dụ `captureHint`) biến mất
// khỏi module trong test — màn gọi vào là `undefined is not a function`, mà lỗi
// đó nổ ở một suite chẳng liên quan gì tới cái vừa thêm. Bản mô phỏng LỎNG hơn
// bản thật là bẫy, kể cả khi nó đang xanh.
jest.mock('../services/capturePlanService', () => ({
  ...jest.requireActual('../services/capturePlanService'),
  // Không có kế hoạch ⇒ máy chủ KHÔNG gợi ý mặt nào, nên mặt gửi lên chỉ có thể
  // đến từ tay người dùng. Đó đúng là điều nhóm test đầu muốn đo.
  getCapturePlan: jest.fn(async () => ({ ok: false })),
  suggestedFace: jest.fn(() => null),
}));

jest.mock('../features/space3d/positionStore', () => ({
  saveFruitCoord: jest.fn(async () => undefined),
}));

// Màn này mượn `absUrl` của màn danh sách quả. Nạp cả màn kia vào chỉ để lấy một
// hàm thuần là kéo theo cả cây phụ thuộc của nó — thay bằng đúng hành vi của nó.
jest.mock('./FruitListScreen', () => ({
  absUrl: (p?: string | null) => (p ? `https://api.test${p}` : null),
}));

jest.mock('../services/fruitReIDService', () => ({
  ...jest.requireActual('../services/fruitReIDService'),
  detectFruit: jest.fn(),
  fruitCandidates: jest.fn(),
  addFruitView: jest.fn(),
  enrollFruit: jest.fn(),
}));

import { addFruitView, detectFruit, fruitCandidates } from '../services/fruitReIDService';
import { tk } from '../i18n/keys';
import FruitCropperScreen from './FruitCropperScreen';

const mockDetect = detectFruit as jest.MockedFunction<typeof detectFruit>;
const mockCandidates = fruitCandidates as jest.MockedFunction<typeof fruitCandidates>;
const mockAddView = addFruitView as jest.MockedFunction<typeof addFruitView>;

// ---------------------------------------------------------------------------
// Trợ giúp
// ---------------------------------------------------------------------------

/**
 * Mọi chuỗi chữ trong một nhánh cây, nối lại.
 *
 * Gom theo NÚT CHỮ chứ không theo kiểu component (`findAllByType(Text)`): tên
 * và danh tính của component nền thay đổi theo bản React Native, còn chuỗi hiện
 * ra thì không. Bám vào chuỗi là bám vào thứ người dùng thật sự nhìn thấy.
 */
function textIn(node: ReactTestInstance | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textIn).join('');
}

/** Toàn bộ chữ đang hiện trên màn. */
function screenText(tree: ReactTestRenderer): string {
  return textIn(tree.root);
}

/** Nút NHỎ NHẤT có `onPress` mà bên trong nó có nhãn chữ này. */
function buttonWithText(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const hits = tree.root
    .findAll(n => typeof n.props?.onPress === 'function' && !n.props?.disabled && textIn(n).includes(label))
    // Nút lồng trong nút: lấy cái ÍT chữ nhất, tức nút sát nhãn nhất.
    .sort((a, b) => textIn(a).length - textIn(b).length);
  if (!hits.length) throw new Error(`Không thấy nút bấm được mang nhãn “${label}”. Chữ đang có trên màn:\n${screenText(tree)}`);
  return hits[0];
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const button = buttonWithText(tree, label);
  await act(async () => { button.props.onPress(); });
}

/**
 * Dựng màn rồi BÁO KÍCH THƯỚC khung nhìn.
 *
 * Không có bước này thì `vw`/`vh` còn là 0, vòng khoanh có bán kính 0, và mọi
 * lượt bấm đều rơi vào nhánh "vùng quá nhỏ" — test sẽ xanh vì lý do sai.
 */
async function mountScreen(params: Record<string, unknown>): Promise<ReactTestRenderer> {
  mockRouteParams = params;
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(<FruitCropperScreen />); });
  const wrap = tree.root.findAll(n => typeof n.props?.onLayout === 'function')[0];
  await act(async () => {
    wrap.props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } });
  });
  return tree;
}

const BASE_PARAMS = {
  treeId: 'cay-01', treeName: 'Cây số 1',
  imageUri: 'file:///anh.jpg', imageW: 1200, imageH: 1600,
};

/**
 * Nhãn của bước KHOANH và của bộ chọn mặt còn viết cứng tiếng Việt trong màn
 * (chưa chuyển sang khoá i18n), nên ở đây phải dán đúng chuỗi đó. Chuyển chúng
 * sang khoá thì sửa luôn mấy hằng này.
 */
const PRIMARY_CROP = 'Dùng vùng này';
const PRIMARY_ADD_VIEW = 'Thêm góc cho quả này';
const FACE_BOTTOM = 'Đít quả';
const FACE_STEM = 'Cuống';

beforeEach(() => {
  jest.clearAllMocks();
  mockDetect.mockResolvedValue({ ok: false, error: { type: 'network_error', detail: 'x', http_status: 0 } });
  mockAddView.mockResolvedValue({ ok: true, data: { ok: true, fruit_id: 'qua-01' } });
});

// ---------------------------------------------------------------------------
// 1. Mặt quả người dùng chọn phải ĐI ĐƯỢC tới máy chủ
// ---------------------------------------------------------------------------

describe('mặt quả đã chọn phải theo được vào lượt bồi góc', () => {
  const ADD_VIEW_PARAMS = { ...BASE_PARAMS, fruitId: 'qua-01', fruitName: 'Quả 3' };

  it('chọn "Đít quả" rồi bấm NGAY — không chạm gì khác — vẫn gửi lên view_type="bottom"', async () => {
    const tree = await mountScreen(ADD_VIEW_PARAMS);

    await press(tree, FACE_BOTTOM);
    // Bấm THẲNG, không kéo/phóng ảnh. Đúng thứ tự thao tác từng làm lộ lỗi:
    // kéo ảnh sẽ dựng lại `useRegion` và che mất bản `runAddView` cũ.
    await press(tree, PRIMARY_ADD_VIEW);

    expect(mockAddView).toHaveBeenCalledTimes(1);
    expect(mockAddView.mock.calls[0][4]).toMatchObject({ viewType: 'bottom' });
  });

  it('không chạm bộ chọn mặt thì vẫn là "side" — giá trị đỗ tạm, không phải lỗi', async () => {
    const tree = await mountScreen(ADD_VIEW_PARAMS);

    await press(tree, PRIMARY_ADD_VIEW);

    expect(mockAddView.mock.calls[0][4]).toMatchObject({ viewType: 'side' });
  });

  it('đổi mặt hai lần thì lượt gửi mang mặt CHỌN SAU CÙNG', async () => {
    const tree = await mountScreen(ADD_VIEW_PARAMS);

    await press(tree, FACE_BOTTOM);
    await press(tree, FACE_STEM);
    await press(tree, PRIMARY_ADD_VIEW);

    expect(mockAddView.mock.calls[0][4]).toMatchObject({ viewType: 'stem' });
  });
});

// ---------------------------------------------------------------------------
// 2. "Chưa hỏi được máy chủ" KHÁC HẲN "cây chưa có quả nào"
// ---------------------------------------------------------------------------

describe('lượt đối chiếu hỏng thì KHÔNG được mời tạo quả mới', () => {
  // So bằng KHOÁ, không dán chuỗi: bộ test chạy ở ngôn ngữ mặc định (tiếng Anh),
  // và câu chữ còn được sửa nhiều lần nữa. Cái phải khoá là CÂU NÀO hiện ở CA
  // NÀO, không phải câu đó viết ra sao.
  const INVITE_NEW_FRUIT = tk('trace.crop.isNew');
  const NOTHING_TO_MATCH = tk('trace.crop.nothingToMatch');
  const MATCH_FAILED = tk('trace.crop.matchFailed');
  const RETRY = tk('trace.crop.matchRetry');

  it('mạng chết (r.ok = false) → hiện câu "chưa soi được" + nút thử lại', async () => {
    mockCandidates.mockResolvedValue({ ok: false, error: { type: 'network_error', detail: 'mất mạng', http_status: 0 } });
    const tree = await mountScreen(BASE_PARAMS);

    await press(tree, PRIMARY_CROP);

    const text = screenText(tree);
    expect(text).toContain(MATCH_FAILED);
    expect(text).toContain(RETRY);
    expect(text).not.toContain(NOTHING_TO_MATCH);
    expect(text).not.toContain(INVITE_NEW_FRUIT);
  });

  it('máy chủ từ chối bằng HTTP 200 kèm {ok:false} — cũng là CHƯA SOI ĐƯỢC', async () => {
    // `r.ok` xanh ở đây (tầng vận chuyển 200). Chỉ `outcomeOf` mới thấy máy chủ
    // đã nói không — đây đúng là ca `if (r.ok && r.data)` bỏ lọt.
    mockCandidates.mockResolvedValue({ ok: true, data: { ok: false, candidates: [] } as never });
    const tree = await mountScreen(BASE_PARAMS);

    await press(tree, PRIMARY_CROP);

    const text = screenText(tree);
    expect(text).toContain(MATCH_FAILED);
    expect(text).not.toContain(INVITE_NEW_FRUIT);
  });

  it('bấm "Thử lại" là hỏi lại máy chủ, KHÔNG bắt khoanh lại từ đầu', async () => {
    mockCandidates.mockResolvedValue({ ok: false, error: { type: 'server_error', detail: 'HTTP 500', http_status: 500 } });
    const tree = await mountScreen(BASE_PARAMS);

    await press(tree, PRIMARY_CROP);
    await press(tree, RETRY);

    expect(mockCandidates).toHaveBeenCalledTimes(2);
    // Cùng một vùng đã khoanh — người dùng không phải canh lại quả lần nữa.
    expect(mockCandidates.mock.calls[1][3]).toEqual(mockCandidates.mock.calls[0][3]);
  });

  it('máy chủ TRẢ LỜI và cây thật sự chưa có quả nào → mới được mời tạo quả mới', async () => {
    mockCandidates.mockResolvedValue({ ok: true, data: { ok: true, candidates: [] } as never });
    const tree = await mountScreen(BASE_PARAMS);

    await press(tree, PRIMARY_CROP);

    const text = screenText(tree);
    expect(text).toContain(NOTHING_TO_MATCH);   // ở ca NÀY thì câu đó đúng
    expect(text).toContain(INVITE_NEW_FRUIT);
    expect(text).not.toContain(MATCH_FAILED);
  });
});

// ---------------------------------------------------------------------------
// 3. Bộ test này tự nó có một chỗ dễ hỏng — khoá luôn
// ---------------------------------------------------------------------------

describe('bẫy của chính bộ test này', () => {
  it('useNavigation giả trả CÙNG MỘT đối tượng — khác đi là mọi test trên đều PASS giả', () => {
    const { useNavigation } = jest.requireMock('@react-navigation/native');
    expect(useNavigation()).toBe(useNavigation());
  });
});
