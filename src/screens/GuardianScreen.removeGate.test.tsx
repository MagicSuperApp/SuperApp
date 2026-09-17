/**
 * Cổng gỡ người bảo hộ — anchor on-chain đòi TỐI THIỂU 2 người (PhoenixKey chốt
 * 2026-09-17: `UpdateGuardians` chỉ chạy khi tập còn lại ≥ 2). Trước bản này màn
 * KHÔNG có cổng nào: bấm gỡ xuống dưới 2 vẫn được, và giao dịch chỉ chết SAU, ở
 * validator.
 *
 * ── Hai lớp bài, vì hai lý do khác nhau ─────────────────────────────────────
 * `canRemoveGuardian` được kiểm THẲNG (không qua render) để ghim đúng ngưỡng và
 * đúng chiều FAIL-OPEN — đây là chỗ một phép thay `count ?? 0` (tương đương
 * `?? []` rồi lấy `.length`) làm CHƯA BIẾT biến thành 0 và khoá nhầm người đang
 * có đủ 5 người bảo hộ. Bài render-level kiểm rằng màn THẬT SỰ dùng đúng hàm đó
 * — ghim đúng hàm mà quên nối vào JSX vẫn là chưa xong việc.
 *
 * ── Vì sao mỗi ca phân biệt được hai cực ────────────────────────────────────
 * 5 và 3 người phải RA nút bấm được, đúng 2 người phải RA nút mờ kèm câu giải
 * thích — bài "màn có nút" sẽ xanh ở cả hai cực nếu không xem `disabled`.
 *
 * ── Vì sao đếm theo `n.type === 'string'` ───────────────────────────────────
 * `findAll` khớp CẢ lớp composite (component React Native, `type` là hàm) LẪN
 * lớp host bên dưới cùng testID (`type` là chuỗi `'View'`) — đếm thẳng ra gấp
 * đôi trở lên cho một phần tử thật. Lớp host là lớp DUY NHẤT ứng với một node
 * trên màn, nên đếm đúng phải lọc theo nó.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { canRemoveGuardian } from './GuardianScreen';

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
import { setLanguage, __resetLanguageForTest } from '../i18n/store';

const DID = 'did:phoenix:aaaaaaahl4nn6:ccd1feb6';

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

/** Chỉ lấy node LỚP HOST (xem khối chú thích đầu tệp) — mỗi phần tử thật đúng một dòng. */
function hostNodes(
  tree: renderer.ReactTestRenderer,
  match: (testID: string) => boolean,
): renderer.ReactTestInstance[] {
  return tree.root.findAll(
    n => typeof n.type === 'string' && typeof n.props?.testID === 'string' && match(n.props.testID),
  );
}

/** `n` người bảo hộ, mỗi người một DID hợp lệ khác nhau. */
function guardiansOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    guardianDid: `did:phoenix:bbbbbbbhl4nn${i}:aaa1feb${i}`,
    status: 'active',
    createdAt: '2026-09-01T00:00:00Z',
  }));
}

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

describe('canRemoveGuardian — hàm thuần, kiểm thẳng không qua render', () => {
  it('5 và 3 người ⟹ gỡ được', () => {
    expect(canRemoveGuardian(5)).toBe(true);
    expect(canRemoveGuardian(3)).toBe(true);
  });

  it('đúng 2 người ⟹ KHOÁ (gỡ nữa là xuống 1, dưới tối thiểu anchor đòi)', () => {
    expect(canRemoveGuardian(2)).toBe(false);
  });

  it('dưới 2 (1 hoặc 0) ⟹ vẫn khoá — gỡ chỉ làm nó thiếu hơn', () => {
    expect(canRemoveGuardian(1)).toBe(false);
    expect(canRemoveGuardian(0)).toBe(false);
  });

  it('CHƯA BIẾT (`null`/`undefined`) ⟹ FAIL-OPEN, không khoá', () => {
    // Đây đúng ca `?? []` rồi lấy `.length`: đọc nhầm "chưa biết" thành 0 sẽ làm
    // bài "5 người ⟹ gỡ được" ở trên sai theo, vì hàm không còn phân biệt được
    // "chưa tải" với "tải xong, rỗng thật".
    expect(canRemoveGuardian(null)).toBe(true);
    expect(canRemoveGuardian(undefined)).toBe(true);
  });
});

describe('màn thật — cổng phải NỐI vào JSX, không chỉ đứng trong hàm thuần', () => {
  it('5 người ⟹ nút gỡ KHÔNG bị khoá, và KHÔNG có câu giải thích', async () => {
    mockList.mockResolvedValue({ guardians: guardiansOf(5), count: 5 });
    const t = await moMan();
    // `accessibilityState.disabled` là dấu hiệu duy nhất còn sống tới lớp host —
    // `disabled` (prop JSX) bị Touchable nuốt mất khi hạ xuống lớp này, đọc nó ở
    // đây luôn ra `undefined` bất kể khoá hay mở, tức đo sai đại lượng.
    const nuts = hostNodes(t, id => id.startsWith('guardian-remove-did:'));
    expect(nuts).toHaveLength(5);
    for (const nut of nuts) expect(nut.props.accessibilityState?.disabled).toBe(false);
    expect(hostNodes(t, id => id === 'guardian-remove-locked-note')).toHaveLength(0);
  });

  it('3 người ⟹ nút gỡ KHÔNG bị khoá', async () => {
    mockList.mockResolvedValue({ guardians: guardiansOf(3), count: 3 });
    const t = await moMan();
    const nuts = hostNodes(t, id => id.startsWith('guardian-remove-did:'));
    expect(nuts).toHaveLength(3);
    for (const nut of nuts) expect(nut.props.accessibilityState?.disabled).toBe(false);
  });

  it('đúng 2 người ⟹ MỌI nút gỡ bị khoá, kèm câu giải thích nói được việc cần làm tiếp', async () => {
    mockList.mockResolvedValue({ guardians: guardiansOf(2), count: 2 });
    const t = await moMan();
    const nuts = hostNodes(t, id => id.startsWith('guardian-remove-did:'));
    expect(nuts).toHaveLength(2);
    for (const nut of nuts) {
      expect(nut.props.accessibilityState?.disabled).toBe(true);
    }
    expect(hostNodes(t, id => id === 'guardian-remove-locked-note')).toHaveLength(1);
    const chu = texts(t);
    // Câu phải nói được VIỆC CẦN LÀM TIẾP (thêm người mới), không chỉ nói cấm.
    expect(chu).toMatch(/ít nhất 2 người bảo hộ/);
    expect(chu).toMatch(/[Tt]hêm người mới trước/);
  });

  it('danh sách CHƯA TẢI ĐƯỢC (đang tải) ⟹ không có nút gỡ nào để mà khoá nhầm', async () => {
    // fail-open đúng nghĩa: màn không vẽ ra một cổng khoá cho một con số nó chưa
    // biết — nó nói thẳng "đang tải" (đã ghim ở GuardianScreen.test.tsx), không
    // phải im lặng khoá.
    mockList.mockImplementation(() => new Promise(() => {})); // treo mãi, mô phỏng đang tải
    const t = await moMan();
    expect(hostNodes(t, id => id === 'guardian-loading')).toHaveLength(1);
    expect(hostNodes(t, id => id.startsWith('guardian-remove-'))).toHaveLength(0);
  });

  it('danh sách TẢI HỎNG ⟹ cũng không có nút gỡ nào, và KHÔNG lẫn với màn rỗng', async () => {
    mockList.mockRejectedValue(new Error('mất sóng'));
    const t = await moMan();
    expect(hostNodes(t, id => id === 'guardian-load-fail')).toHaveLength(1);
    expect(hostNodes(t, id => id.startsWith('guardian-remove-'))).toHaveLength(0);
  });

  it('danh sách RỖNG THẬT ⟹ khác màn với chưa-tải-được, và cũng không có nút gỡ', async () => {
    mockList.mockResolvedValue({ guardians: [], count: 0 });
    const t = await moMan();
    expect(hostNodes(t, id => id === 'guardian-empty')).toHaveLength(1);
    expect(hostNodes(t, id => id === 'guardian-loading')).toHaveLength(0);
    expect(hostNodes(t, id => id === 'guardian-load-fail')).toHaveLength(0);
    expect(hostNodes(t, id => id.startsWith('guardian-remove-'))).toHaveLength(0);
  });
});
