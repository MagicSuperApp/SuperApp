// screens/MyDevicesScreen.test.tsx
//
// Khoá ba ca mà hợp đồng máy chủ khiến DỄ làm sai ở màn "Thiết bị của tôi".
// Cả ba đều hỏng IM LẶNG: không ngoại lệ, không màu đỏ ở đâu — chỉ là một màn
// hình nói sai sự thật về khoá của người dùng.
//
// Dùng `react-test-renderer` theo tiền lệ `AnimalDetailScreen.test.tsx`
// (`@testing-library/react-native` không có trong kho này).

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() }; // ổn định qua mọi lượt dựng
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const mockList = jest.fn();
const mockRename = jest.fn();
const mockRevoke = jest.fn();

jest.mock('../services/phoenixKey-api', () => {
  // Giữ ĐÚNG chữ ký của lớp thật: (code, httpStatus, message). Mock rút gọn
  // hai tham số thành một thì `tsc` bắt được, nhưng chỉ ở tệp test — còn nơi
  // gọi thật vẫn dựng lỗi bằng ba tham số, nên mock lệch sẽ khiến bài test đi
  // trên một hình dạng lỗi không tồn tại.
  class PhoenixKeyApiError extends Error {
    // Gán trường TRONG THÂN hàm, không dùng tham số-thuộc-tính (`public code:`).
    // Babel biến tham số-thuộc-tính thành tham chiếu tới biến ngoài phạm vi, và
    // nhà máy `jest.mock` từ chối điều đó ("Invalid variable access: code").
    code: number;
    httpStatus: number;
    constructor(code: number, httpStatus: number, message: string) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
      this.name = 'PhoenixKeyApiError';
    }
  }
  return {
    PhoenixKeyApiError,
    phoenixKeyApi: {
      deviceLifecycle: {
        list: (...a: unknown[]) => mockList(...a),
        rename: (...a: unknown[]) => mockRename(...a),
        revoke: (...a: unknown[]) => mockRevoke(...a),
      },
    },
  };
});

const mockShowError = jest.fn();
// `showWarning` KHÔNG còn là hàm rỗng: hộp xác nhận "Gỡ máy này?" nay đi qua
// popup của app (`utils/alert`) thay vì `Alert.alert` của hệ điều hành, nên nút
// phá mà bài kiểm cần bấm nằm trong `options.actions` của lượt gọi này.
const mockShowWarning = jest.fn();
jest.mock('../utils/alert', () => ({
  showError: (...a: unknown[]) => mockShowError(...a),
  showSuccess: jest.fn(),
  showInfo: jest.fn(),
  showWarning: (...a: unknown[]) => mockShowWarning(...a),
}));

import MyDevicesScreen from './MyDevicesScreen';
import { PhoenixKeyApiError } from '../services/phoenixKey-api';

/** Nút trong hộp thoại popup của app — khớp `AlertAction`. */
type NutHopThoai = { text: string; onPress?: () => void; style?: string };

/** Gom mọi chuỗi Text trong cây dựng được. */
function texts(tree: renderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const n = node as { children?: unknown[] } | null;
    if (n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out;
}

const noiText = (t: renderer.ReactTestRenderer) => texts(t).join('\n');

const may = (over: Record<string, unknown> = {}) => ({
  keyId: 'k-1',
  deviceName: 'Máy cũ',
  keyRole: 'device',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  lastUsedAt: '2026-08-01T00:00:00Z',
  current: false,
  ...over,
});

async function moMan(devices: unknown[]) {
  mockList.mockResolvedValue({ devices });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<MyDevicesScreen />); });
  return tree;
}

/**
 * Tìm nút bấm bọc quanh một icon nhất định.
 *
 * `TouchableOpacity` dựng ra NHIỀU tầng cùng mang `onPress` (chính nó, rồi lớp
 * host bên trong). Đếm thô sẽ ra 2 cho một nút, nên bước cuối loại bỏ mọi nút là
 * CON CHÁU của một nút khác trong cùng tập — chỉ giữ tầng ngoài cùng, tức là
 * đúng một phần tử cho mỗi nút người dùng thấy.
 */
function nutTheoIcon(tree: renderer.ReactTestRenderer, iconName: string) {
  const tho = tree.root.findAll(n => {
    if (typeof n.props?.onPress !== 'function') return false;
    return n.findAll(c => c.props?.name === iconName, { deep: true }).length > 0;
  }, { deep: true });

  const laConChau = (n: (typeof tho)[number]) => {
    for (let p = n.parent; p; p = p.parent) if (tho.includes(p as never)) return true;
    return false;
  };
  return tho.filter(n => !laConChau(n));
}

beforeEach(() => { jest.clearAllMocks(); });

describe('đổi tên KHÔNG được làm mất nhãn "máy này"', () => {
  it('giữ `current` địa phương, chỉ nhận `deviceName` từ phản hồi', async () => {
    // Máy chủ gọi `toDeviceView(key, null)` trong `renameDevice` ⇒ `current`
    // trong phản hồi LUÔN false, kể cả khi vừa đổi tên đúng máy đang cầm. Ghi đè
    // cả bản ghi bằng phản hồi đó thì nhãn "máy này" biến mất ngay sau khi lưu —
    // mất đúng thông tin người dùng cần để biết ĐỪNG gỡ máy nào.
    const t = await moMan([may({ deviceName: 'Máy cũ', current: true })]);
    expect(noiText(t)).toContain('máy này');

    mockRename.mockResolvedValue({
      keyId: 'k-1', deviceName: 'Máy mới', keyRole: 'device',
      status: 'active', createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: null, current: false, // ← đúng như máy chủ trả về
    });

    const butChi = nutTheoIcon(t, 'pencil-outline');
    expect(butChi.length).toBe(1);
    await act(async () => { butChi[0].props.onPress(); });

    // `TextInput` cũng dựng nhiều tầng cùng props; tầng nào cũng gọi được nên
    // lấy tầng đầu, đừng chốt số lượng — số đó là chi tiết dựng cây, không phải
    // điều tệp này muốn khoá.
    const o = t.root.findAll(n => n.props?.placeholder === 'Ví dụ: iPhone của Thư')[0];
    await act(async () => { o.props.onChangeText('Máy mới'); });
    await act(async () => { o.props.onSubmitEditing(); });

    expect(mockRename).toHaveBeenCalledWith('k-1', 'Máy mới');
    const sau = noiText(t);
    expect(sau).toContain('Máy mới');
    // Tên đã đổi, mà nhãn VẪN CÒN — toàn bộ nội dung bài này nằm ở dòng dưới.
    expect(sau).toContain('máy này');
  });

  it('gửi tên ĐÃ CẮT, không gửi chuỗi thô', async () => {
    const t = await moMan([may()]);
    mockRename.mockResolvedValue({ ...may(), deviceName: 'Máy kho' });
    await act(async () => { nutTheoIcon(t, 'pencil-outline')[0].props.onPress(); });
    const o = t.root.findAll(n => n.props?.placeholder === 'Ví dụ: iPhone của Thư')[0];
    await act(async () => { o.props.onChangeText('   Máy kho   '); });
    await act(async () => { o.props.onSubmitEditing(); });
    expect(mockRename).toHaveBeenCalledWith('k-1', 'Máy kho');
  });

  it('tên chỉ có khoảng trắng bị chặn TẠI CHỖ, không gọi máy chủ', async () => {
    const t = await moMan([may()]);
    await act(async () => { nutTheoIcon(t, 'pencil-outline')[0].props.onPress(); });
    const o = t.root.findAll(n => n.props?.placeholder === 'Ví dụ: iPhone của Thư')[0];
    await act(async () => { o.props.onChangeText('    '); });
    await act(async () => { o.props.onSubmitEditing(); });
    expect(mockRename).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalled();
  });
});

describe('nút gỡ không được bày ra khi chắc chắn hỏng', () => {
  it('khoá chủ đang hoạt động: KHÔNG có nút gỡ, có câu chỉ đường khác', async () => {
    // Chỉ số duy nhất V36 cho phép ≤1 owner-key active mỗi DID, và cửa này chỉ
    // vai owner gọi được ⇒ owner-key active LUÔN là cái cuối cùng ⇒ máy chủ luôn
    // trả 3008. Một nút chắc chắn hỏng còn tệ hơn không có nút.
    const t = await moMan([may({ keyRole: 'owner', current: true })]);
    expect(nutTheoIcon(t, 'link-off').length).toBe(0);
    expect(noiText(t)).toContain('24 từ hoặc người bảo hộ');
  });

  it('khoá vai khác: gỡ được', async () => {
    const t = await moMan([may({ keyRole: 'manager', deviceName: 'Máy kế toán' })]);
    expect(nutTheoIcon(t, 'link-off').length).toBe(1);
    expect(noiText(t)).not.toContain('24 từ hoặc người bảo hộ');
  });

  it('khoá đã thu hồi: không nút nào cả, kể cả đổi tên', async () => {
    const t = await moMan([may({ status: 'revoked' })]);
    expect(nutTheoIcon(t, 'link-off').length).toBe(0);
    expect(nutTheoIcon(t, 'pencil-outline').length).toBe(0);
  });
});

describe('khoá đã thu hồi vẫn phải HIỆN, không lặng lẽ biến mất', () => {
  it('máy chủ trả cả revoked (list không lọc status) → tách nhóm, không lọc bỏ', async () => {
    // `findByUserDidOrderByCreatedAtDesc` không lọc `status`. Đó là chủ ý: người
    // dùng cần thấy "máy này đã bị gỡ" để biết việc gỡ đã xong. Lọc bỏ ở máy
    // khách thì một lần gỡ THÀNH CÔNG trông y hệt một lần gỡ thất bại rồi trang
    // tự làm mới.
    const t = await moMan([
      may({ keyId: 'k-1', deviceName: 'Máy đang dùng', current: true, keyRole: 'owner' }),
      may({ keyId: 'k-2', deviceName: 'Máy đã mất', status: 'revoked' }),
    ]);
    const s = noiText(t);
    expect(s).toContain('Máy đã mất');
    expect(s).toContain('đã gỡ');
    expect(s).toContain('Đang hoạt động');
  });
});

describe('mã lỗi máy chủ được dịch thành câu người đọc được', () => {
  it('3008 nói ra đường đi tiếp, không chỉ nói "thất bại"', async () => {
    const t = await moMan([may({ keyRole: 'manager' })]);
    mockRevoke.mockRejectedValue(new PhoenixKeyApiError(3008, 409, 'last owner key'));

    await act(async () => { nutTheoIcon(t, 'link-off')[0].props.onPress(); });
    expect(mockShowWarning).toHaveBeenCalled();

    // Bấm đúng nút phá trong hộp xác nhận mà màn vừa dựng.
    const opts = (mockShowWarning.mock.calls[0] as unknown[])[2] as { actions?: NutHopThoai[] };
    const nut = opts.actions ?? [];
    const go = nut.find(b => b.text === 'Gỡ máy')!;
    await act(async () => { go.onPress?.(); });

    expect(mockShowError).toHaveBeenCalledWith(
      expect.stringContaining('24 từ hoặc người bảo hộ'),
    );
  });

  it('1306 (sai vai) nói rõ phải đăng nhập bằng máy nào', async () => {
    mockList.mockRejectedValue(new PhoenixKeyApiError(1306, 403, 'forbidden'));
    let t!: renderer.ReactTestRenderer;
    await act(async () => { t = renderer.create(<MyDevicesScreen />); });
    // Lỗi khi TẢI thì màn về trạng thái lỗi chung (có nút thử lại) — không nuốt.
    expect(mockList).toHaveBeenCalled();
    expect(t.toJSON()).toBeTruthy();
  });
});
