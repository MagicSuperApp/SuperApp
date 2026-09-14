/**
 * "CHƯA CÓ AI" và "CHƯA HỎI ĐƯỢC" phải là HAI màn hình khác nhau.
 *
 * ── Chỗ hỏng bài này canh ─────────────────────────────────────────────────
 * Màn này từng đọc danh sách người bảo hộ từ `AsyncStorage` của MÁY, với một chú
 * thích nói rằng máy chủ chưa có cửa LIST. Cửa đó đã có
 * (`phoenixKeyApi.guardians.list`) và chỉ là không nơi nào gọi. Khi nối nó vào,
 * cạm bẫy đổi chỗ: một lần gọi hỏng mà hiện thành danh sách rỗng thì người dùng
 * đọc "bạn chưa ghi danh ai" và rất có thể đi ghi danh LẠI một người đã có — mỗi
 * lần là một chữ ký phần cứng cộng một mốc `opSeq` bị tiêu.
 *
 * ── Vì sao mỗi ca phân biệt được hai cực ──────────────────────────────────
 * Bài "màn rỗng thì có chữ" sẽ xanh ở cả hai cực. Nên mỗi ca dưới đây so HAI lượt
 * dựng với nhau và đòi chúng khác nhau ở đúng dấu hiệu người dùng nhìn thấy: khối
 * `guardian-empty` với khối `guardian-load-fail`, và sự có mặt của nút thử lại.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const mockList = jest.fn();
jest.mock('../services/phoenixKey-api', () => {
  class PhoenixKeyApiError extends Error {
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
    phoenixKeyApi: { guardians: { list: (...a: unknown[]) => mockList(...a) } },
  };
});

const mockCurrentUserDid = jest.fn();
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: (...a: unknown[]) => mockCurrentUserDid(...a),
}));

jest.mock('../services/guardianService', () => ({
  addGuardian: jest.fn(),
  removeGuardian: jest.fn(),
}));

jest.mock('../utils/alert', () => ({
  showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn(), showWarning: jest.fn(),
}));

import GuardianScreen from './GuardianScreen';
import { PhoenixKeyApiError } from '../services/phoenixKey-api';
import { setLanguage, __resetLanguageForTest } from '../i18n/store';

const DID = 'did:phoenix:aaaaaaahl4nn6:ccd1feb6';
const BAN = 'did:phoenix:bbbbbbbhl4nn6:aaa1feb6';

function texts(tree: renderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const n = node as { children?: unknown[] } | null;
    if (n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out.join('\n');
}

const coKhoi = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAll(n => n.props?.testID === testID, { deep: true }).length > 0;

async function moMan() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<GuardianScreen />); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
  mockCurrentUserDid.mockResolvedValue(DID);
});

describe('danh sách lấy từ MÁY CHỦ, không từ máy', () => {
  it('gọi đúng cửa LIST với DID của phiên', async () => {
    mockList.mockResolvedValue({ guardians: [], count: 0 });
    await moMan();
    expect(mockList).toHaveBeenCalledWith(DID);
  });

  it('hiện đúng người máy chủ trả về', async () => {
    mockList.mockResolvedValue({
      guardians: [{ guardianDid: BAN, status: 'active', createdAt: '2026-08-01T00:00:00Z' }],
      count: 1,
    });
    const t = await moMan();
    expect(coKhoi(t, 'guardian-list')).toBe(true);
    expect(texts(t)).toContain(BAN);
  });
});

describe('RỖNG và HỎNG là hai màn khác nhau', () => {
  it('rỗng ⟹ khối `guardian-empty`, KHÔNG có khối lỗi, KHÔNG có nút thử lại', async () => {
    mockList.mockResolvedValue({ guardians: [], count: 0 });
    const t = await moMan();
    expect(coKhoi(t, 'guardian-empty')).toBe(true);
    expect(coKhoi(t, 'guardian-load-fail')).toBe(false);
    expect(coKhoi(t, 'guardian-retry')).toBe(false);
  });

  it('gọi hỏng ⟹ khối lỗi + nút thử lại, và TUYỆT ĐỐI không phải khối rỗng', async () => {
    mockList.mockRejectedValue(new Error('mất sóng'));
    const t = await moMan();
    expect(coKhoi(t, 'guardian-load-fail')).toBe(true);
    expect(coKhoi(t, 'guardian-retry')).toBe(true);
    // Dòng dưới là toàn bộ nội dung của tệp này.
    expect(coKhoi(t, 'guardian-empty')).toBe(false);
    expect(texts(t)).not.toContain('Bạn chưa ghi danh người bảo hộ nào.');
  });

  it('hai ca ra hai chuỗi khác nhau trên màn — không chỉ khác testID', async () => {
    mockList.mockResolvedValue({ guardians: [], count: 0 });
    const rong = texts(await moMan());
    mockList.mockRejectedValue(new Error('mất sóng'));
    const hong = texts(await moMan());
    expect(hong).not.toBe(rong);
    expect(rong).toContain('chưa ghi danh');
    expect(hong).toMatch(/KHÔNG phải/);
  });

  it('nút thử lại gọi LẠI máy chủ và hiện được danh sách thật', async () => {
    mockList.mockRejectedValueOnce(new Error('mất sóng'));
    const t = await moMan();
    mockList.mockResolvedValue({
      guardians: [{ guardianDid: BAN, status: 'active', createdAt: null }],
      count: 1,
    });
    const nut = t.root.findAll(n => n.props?.testID === 'guardian-retry', { deep: true })[0];
    await act(async () => { nut.props.onPress(); });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(coKhoi(t, 'guardian-list')).toBe(true);
  });
});

describe('hai ca không gọi được cửa — vẫn không được đội lốt "rỗng"', () => {
  it('chưa có DID trên máy ⟹ nói phải đăng nhập, KHÔNG gọi cửa', async () => {
    mockCurrentUserDid.mockResolvedValue(null);
    const t = await moMan();
    expect(mockList).not.toHaveBeenCalled();
    expect(coKhoi(t, 'guardian-load-fail')).toBe(true);
    expect(coKhoi(t, 'guardian-empty')).toBe(false);
    // Không mời thử lại cho một việc thử lại không giải quyết được.
    expect(coKhoi(t, 'guardian-retry')).toBe(false);
  });

  it('401 ⟹ cũng là câu về phiên, không phải câu "thử lại"', async () => {
    mockList.mockRejectedValue(new PhoenixKeyApiError(1304, 401, 'no bearer'));
    const t = await moMan();
    expect(coKhoi(t, 'guardian-load-fail')).toBe(true);
    expect(coKhoi(t, 'guardian-retry')).toBe(false);
  });

  it('phản hồi thiếu trường `guardians` ⟹ khối lỗi, KHÔNG coi là rỗng', async () => {
    // `?? []` ở chỗ này là cái vỏ im lặng kinh điển: máy chủ đổi hợp đồng mà màn
    // hình vẫn nói một câu nghe rất bình thường.
    mockList.mockResolvedValue({ count: 0 });
    const t = await moMan();
    expect(coKhoi(t, 'guardian-load-fail')).toBe(true);
    expect(coKhoi(t, 'guardian-empty')).toBe(false);
  });
});
