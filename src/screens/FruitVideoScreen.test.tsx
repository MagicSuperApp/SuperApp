/**
 * FruitVideoScreen — hai lỗi ĐÃ TỪNG XẢY RA ở đường "quay clip → tạo một quả".
 *
 *   1. `return res.ok ? null : …` sau lượt `enroll`. `res.ok` là cờ tầng VẬN
 *      CHUYỂN: mọi HTTP 200 đều xanh, kể cả lượt máy chủ TỪ CHỐI bằng 200 kèm
 *      `{ok:false}`, và kể cả HTTP 409 (trùng quả) mà `_apiCall` cố ý đổi thành
 *      `{ok:true, data}` để caller đọc cờ. Hậu quả: màn hiện chip "Đã lưu thành
 *      quả «X»" trong khi kho không có bản ghi nào — người dùng không có cách nào
 *      biết, và đi tiếp sang cây khác.
 *
 *   2. Máy chủ không nhận ra quả nào trong ảnh thì bản cũ BỊA một ô vuông giữa
 *      khung (60% cạnh ngắn) rồi gửi lên như dữ liệu thật. Ảnh mẫu nhiễm lá và
 *      nền, hỏng âm thầm ngay ở tấm ảnh nhận dạng.
 *
 * Cả hai chỉ lộ ra khi chạy hết luồng gửi, nên phải render cả màn.
 *
 * ⚠️ `useNavigation` giả trả CÙNG MỘT đối tượng mỗi lần render, y như
 * react-navigation thật — xem chú thích cùng chỗ ở `FruitCropperScreen.test.tsx`.
 */

import React from 'react';
import { Alert } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// ── Lớp cầu ngoài ───────────────────────────────────────────────────────────

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
}));

const mockSafeAreaInsets = { top: 44, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

jest.mock('../store/hooks', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) => fn({ user: { currentUser: { did: 'did:test:1' } } }),
  useAppDispatch: () => jest.fn(),
}));

/** Bộ chọn ảnh/video: màn nạp MỀM bằng `require`, nên phải thay ở tầng module. */
const mockPickerAssets: { video?: unknown; photo?: unknown } = {};
jest.mock('react-native-image-picker', () => ({
  launchCamera: (opts: { mediaType?: string }, cb: (r: unknown) => void) => {
    const asset = opts?.mediaType === 'video' ? mockPickerAssets.video : mockPickerAssets.photo;
    cb(asset ? { assets: [asset] } : { didCancel: true });
  },
  launchImageLibrary: (_o: unknown, cb: (r: unknown) => void) => cb({ didCancel: true }),
}));

jest.mock('../services/mediaSavePermission', () => ({
  withPhotoSave: async (o: unknown) => o,
}));

jest.mock('../services/treeReIDService', () => ({
  getTrees: jest.fn(async () => ({ ok: true, trees: [{ tree_id: 'cay-01', name: 'Cây số 1' }] })),
}));

jest.mock('../services/videoProofStore', () => ({
  loadVideoProofs: jest.fn(async () => []),
}));

jest.mock('../services/videoUploadQueue', () => ({
  enqueueVideoUpload: jest.fn(async () => ({
    job: { id: 'job-1', clientEventId: 'evt-1' }, persisted: true, droppedOldest: 0,
  })),
  flushVideoUploadQueue: jest.fn(async () => undefined),
  retryVideoJobNow: jest.fn(async () => undefined),
  retryAllVideoJobsNow: jest.fn(async () => undefined),
  // Clip đã rời hàng đợi ⇒ đi đúng nhánh dựng màn KẾT QUẢ, nơi chip "đã lưu
  // thành quả" hiện ra. Đó là nhánh cần soi.
  isJobQueued: jest.fn(async () => false),
  getVideoQueueCount: jest.fn(async () => 0),
  getNeedsManualCount: jest.fn(async () => 0),
}));

jest.mock('../services/treeDraftStore', () => ({
  saveFruitVideoDraft: jest.fn(),
  clearFruitVideoDraft: jest.fn(),
  restoreFruitVideoDraft: jest.fn(async () => null),
}));

jest.mock('../services/captureMeta', () => ({
  buildCaptureMeta: jest.fn(async () => ({ image_w: 1600, image_h: 1200 })),
  serializeCaptureMeta: jest.fn(() => '{"image_w":1600,"image_h":1200}'),
}));

jest.mock('../services/treeReIDNativeBridge', () => ({
  TreeReIDBridge: { getCurrentHeading: jest.fn(async () => ({ heading: null, pitch: null })) },
}));

jest.mock('../modules/trace/components/layered/Organic', () => ({
  GroundBackdrop: () => null,
}));

jest.mock('../services/fruitReIDService', () => ({
  ...jest.requireActual('../services/fruitReIDService'),
  detectFruit: jest.fn(),
  enrollFruit: jest.fn(),
}));

import { detectFruit, enrollFruit } from '../services/fruitReIDService';
import { tk } from '../i18n/keys';
import FruitVideoScreen from './FruitVideoScreen';

const mockDetect = detectFruit as jest.MockedFunction<typeof detectFruit>;
const mockEnroll = enrollFruit as jest.MockedFunction<typeof enrollFruit>;

// ---------------------------------------------------------------------------
// Trợ giúp
// ---------------------------------------------------------------------------

function textIn(node: ReactTestInstance | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textIn).join('');
}

function screenText(tree: ReactTestRenderer): string {
  return textIn(tree.root);
}

/** Nút NHỎ NHẤT có `onPress` mà bên trong nó có nhãn chữ này. */
function pressable(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const hits = tree.root
    .findAll(n => typeof n.props?.onPress === 'function' && !n.props?.disabled && textIn(n).includes(label))
    .sort((a, b) => textIn(a).length - textIn(b).length);
  if (!hits.length) throw new Error(`Không thấy nút bấm được mang nhãn “${label}”. Chữ trên màn:\n${screenText(tree)}`);
  return hits[0];
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const target = pressable(tree, label);
  await act(async () => { await target.props.onPress(); });
}

/**
 * Dựng màn rồi đi hết ba chặng cho tới ngay TRƯỚC lúc bấm Gửi.
 *
 * Cây đã chọn sẵn qua route param (`treeId`) — màn hỗ trợ đường vào đó, và nó bỏ
 * bớt được một chặng bấm không liên quan tới điều đang đo.
 */
async function mountReadyToSend(): Promise<ReactTestRenderer> {
  mockRouteParams = { treeId: 'cay-01', treeName: 'Cây số 1', farmId: 'vuon-01' };
  mockPickerAssets.video = { uri: 'file:///clip.mp4', fileSize: 1024 };
  mockPickerAssets.photo = { uri: 'file:///qua.jpg', width: 1600, height: 1200 };

  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(<FruitVideoScreen />); });

  await press(tree, tk('trace.fruitVideo.tapToRecord'));
  // Nhãn `coverTitle` là tiêu đề mục, nằm NGOÀI ô bấm; chữ trong ô bấm là `coverHint`.
  await press(tree, tk('trace.fruitVideo.coverHint'));

  const nameInput = tree.root.findAll(
    n => typeof n.props?.onChangeText === 'function' && n.props?.placeholder === tk('trace.fruitVideo.nameHint'),
  )[0];
  await act(async () => { nameInput.props.onChangeText('Quả ngọn phía đông'); });

  return tree;
}

const SEND = tk('trace.fruitVideo.send');

/** Ô quả mà `detect` trả về ở ca "máy chủ nhận ra quả". */
const DETECTED_BOX: [number, number, number, number] = [100, 120, 300, 320];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDetect.mockResolvedValue({ ok: true, data: { ok: true, detections: [{ bbox: DETECTED_BOX }] } });
  mockEnroll.mockResolvedValue({ ok: true, data: { ok: true, fruit_id: 'qua-01' } });
});

afterEach(() => { jest.restoreAllMocks(); });

// ---------------------------------------------------------------------------
// 1. Máy chủ từ chối thì màn KHÔNG được nói đã lưu
// ---------------------------------------------------------------------------

describe('chip "đã lưu thành quả" chỉ được hiện khi kho THẬT SỰ có bản ghi', () => {
  const savedChip = (name: string) => tk('trace.fruitVideo.savedFruit', { name });

  it('lượt enroll xong thật → chip hiện, đúng tên quả', async () => {
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(screenText(tree)).toContain(savedChip('Quả ngọn phía đông'));
  });

  it('máy chủ từ chối bằng HTTP 200 kèm {ok:false} → KHÔNG chip, và báo cho người dùng', async () => {
    // Đây đúng là ca `res.ok ? null : …` bỏ lọt: tầng vận chuyển xanh, máy chủ đã nói không.
    mockEnroll.mockResolvedValue({
      ok: true,
      data: { ok: false, message: 'Ảnh này giống quả «Quả 2» hơn.' },
    });
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(screenText(tree)).not.toContain(savedChip('Quả ngọn phía đông'));
    expect(Alert.alert).toHaveBeenCalledWith(
      tk('trace.fruitVideo.fruitFailTitle'),
      expect.stringContaining('Ảnh này giống quả «Quả 2» hơn.'),
    );
  });

  it('HTTP 409 trùng quả (được đổi thành {ok:true, duplicate}) cũng không phải "đã lưu"', async () => {
    // `_apiCall` cố ý trả `{ok:true, data}` cho 409 để caller đọc cờ — caller cũ
    // không đọc, nên quả trùng bị báo là đã lưu.
    mockEnroll.mockResolvedValue({
      ok: true,
      data: { ok: false, duplicate: true, message: 'Quả này đã có trong cây.' },
    });
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(screenText(tree)).not.toContain(savedChip('Quả ngọn phía đông'));
  });

  it('hỏng tầng vận chuyển (mất mạng) → cũng KHÔNG chip', async () => {
    mockEnroll.mockResolvedValue({ ok: false, error: { type: 'network_error', detail: 'mất mạng', http_status: 0 } });
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(screenText(tree)).not.toContain(savedChip('Quả ngọn phía đông'));
  });
});

// ---------------------------------------------------------------------------
// 2. Không nhận ra quả thì KHÔNG được bịa ô
// ---------------------------------------------------------------------------

describe('máy chủ không thấy quả nào thì không được gửi ô bịa', () => {
  it('detect có kết quả → gửi đúng ô máy chủ trả, không phải ô giữa khung', async () => {
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(mockEnroll).toHaveBeenCalledTimes(1);
    expect(mockEnroll.mock.calls[0][4]).toEqual({ bbox: DETECTED_BOX });
  });

  it('lượt gửi mang theo mặt quả và khối `capture` — thiếu hai thứ đó là ảnh không đo được', async () => {
    // `viewType: 'side'` ở màn này là khai CÓ Ý THỨC (màn không hỏi mặt nào), còn
    // `capture` dựng lúc bấm máy. Bỏ trống `capture` là mất vĩnh viễn khả năng đo
    // kích thước quả từ tấm ảnh đó — không đợt nào vá lại được.
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(mockEnroll.mock.calls[0][5]).toMatchObject({
      allowDup: true,
      viewType: 'side',
      capture: expect.any(String),
    });
  });

  it('detect KHÔNG thấy quả nào → không gọi enroll, và nói thật là chưa tạo được quả', async () => {
    mockDetect.mockResolvedValue({ ok: true, data: { ok: true, detections: [] } });
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(mockEnroll).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      tk('trace.fruitVideo.fruitFailTitle'),
      expect.stringContaining('chưa nhận ra quả'),
    );
  });

  it('detect hỏng hẳn (mạng chết) → cũng không gọi enroll', async () => {
    mockDetect.mockRejectedValue(new Error('mất mạng'));
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    expect(mockEnroll).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Không biết số khung thì đừng trách người quay
// ---------------------------------------------------------------------------

describe('câu dưới màn kết quả phải nói đúng cái mình biết', () => {
  it('sổ bằng chứng chưa có bản ghi (n_frames undefined) → nói "chưa cho biết", KHÔNG bảo quay chậm hơn', async () => {
    const tree = await mountReadyToSend();

    await press(tree, SEND);

    const text = screenText(tree);
    expect(text).toContain(tk('trace.fruitVideo.doneFramesUnknown'));
    expect(text).not.toContain(tk('trace.fruitVideo.doneSlower'));
  });
});

// ---------------------------------------------------------------------------
// 4. Bẫy của chính bộ test này
// ---------------------------------------------------------------------------

describe('bẫy của chính bộ test này', () => {
  it('useNavigation giả trả CÙNG MỘT đối tượng — khác đi là mọi useCallback bị dựng lại', () => {
    const { useNavigation } = jest.requireMock('@react-navigation/native');
    expect(useNavigation()).toBe(useNavigation());
  });
});
