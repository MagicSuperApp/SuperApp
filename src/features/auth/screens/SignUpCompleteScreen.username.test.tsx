/**
 * Màn hoàn tất đăng ký — TÊN ĐĂNG NHẬP phải nằm cạnh lời dặn lưu 24 từ.
 *
 * ── Chỗ hỏng bài này canh ───────────────────────────────────────────────────
 * Cụm 24 từ MỘT MÌNH không mở lại được tài khoản trên một máy mới.
 * `attachThisDevice` (`screens/RestoreIdentityScreen.tsx`) có bốn nguồn để biết
 * 24 từ thuộc danh tính nào, và ở đúng ca "máy mới" thì ba nguồn đầu đều câm:
 *   1. DID người dùng tự gõ        — app chưa bao giờ đưa chuỗi đó cho họ;
 *   2. DID trong AsyncStorage      — máy mới thì rỗng;
 *   3. sổ `@phoenixkey/users`      — máy mới thì rỗng;
 *   4. hỏi máy chủ bằng khoá trong chip — cần `isKeypairEnrolled()`, máy mới trả
 *      `false`.
 * Còn đúng MỘT nguồn chạy được: `resolveUsername(tên đăng nhập)`.
 *
 * Nhưng tên đăng nhập trước nay chỉ hiện ở lời chào của màn ĐĂNG NHẬP — tức chỉ
 * đọc được trên chính cái máy vừa mất. Người mất máy có đủ 24 từ vẫn là ngõ cụt,
 * và họ chỉ phát hiện vào đúng lúc không sửa được nữa.
 *
 * Nên chốt ở đây có HAI vế, và vế thứ hai mới là vế đắt: tên phải hiện ra, VÀ
 * phải hiện ở nơi người dùng đang được bảo đi ghi một thứ ra giấy. Một cái tên
 * hiện ở màn khác thì không cứu được ai.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
const mockRoute: { params: Record<string, unknown> } = {
  params: { username: 'nongdan', user: { did: 'did:phoenix:mainnet:abc' } },
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => mockRoute,
}));

const mockUnwrap = jest.fn(async () => ({}));
jest.mock('react-redux', () => ({
  useDispatch: () => (_action: unknown) => ({ unwrap: () => mockUnwrap() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../services/seedBackupReminder', () => ({
  markSeedBackupDeferred: (_now?: number) => Promise.resolve(),
  clearSeedBackupDeferred: () => Promise.resolve(),
}));

import SignUpCompleteScreen from './SignUpCompleteScreen';
import { IDENTITY_STRINGS } from '../../../i18n/keys';
import { setLanguage, __resetLanguageForTest } from '../../../i18n/store';

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
  return out.join(' ').replace(/\s+/g, ' ');
}

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
  mockRoute.params = { username: 'nongdan', user: { did: 'did:phoenix:mainnet:abc' } };
});

afterEach(() => { jest.useRealTimers(); });

describe('tên đăng nhập đi kèm cụm 24 từ', () => {
  it('hiện đúng tên đăng nhập của người vừa đăng ký', async () => {
    const tree = await mountDone();
    expect(collectText(tree.toJSON())).toMatch(/Tên đăng nhập của bạn: @nongdan/);
    await act(async () => { tree.unmount(); });
  });

  it('nói rõ thiếu tên thì riêng 24 từ chưa đủ — ghim TRỌN câu', async () => {
    // `toContain` một mẩu ngắn qua được gần như mọi lần viết lại, kể cả lần viết
    // lại làm mất đúng vế "chưa đủ". Ghim trọn câu.
    const tree = await mountDone();
    expect(collectText(tree.toJSON())).toMatch(
      /Ghi tên này ra giấy CÙNG cụm 24 từ\. Trên một máy mới, app phải hỏi máy chủ bằng tên đăng nhập mới biết 24 từ thuộc danh tính nào — thiếu tên thì riêng 24 từ chưa đủ để lấy lại tài khoản\./,
    );
    await act(async () => { tree.unmount(); });
  });

  it('nằm CÙNG chỗ với lời dặn lưu 24 từ, không ở một góc khác', async () => {
    // Vế đắt: một cái tên hiện ở đâu đó trên màn thì người đang cầm bút ghi 24 từ
    // không chắc nhìn thấy. Nó phải nằm trong cùng khối với nút "xem 24 từ".
    const tree = await mountDone();
    const bar = tree.root.findByProps({ testID: 'signup-username-note' }).parent!;
    // Cùng một khối cha với nút "xem 24 từ" — đo cấu trúc, không đo khoảng cách
    // trong ảnh chụp màn hình.
    expect(bar.findAllByProps({ testID: 'signup-backup-now' }).length).toBeGreaterThan(0);
    expect(collectText(tree.toJSON())).toContain(IDENTITY_STRINGS['identity.backup.now'].vi);
    await act(async () => { tree.unmount(); });
  });

  it('không có tên đăng nhập ⇒ không dựng một ô rỗng (ca đối xứng)', async () => {
    // Thiếu ca này thì ba ca trên không phân biệt "hiện tên thật" với "luôn dựng
    // một cái ô", và một ô ghi "@" trơ là thứ tệ hơn không có gì.
    mockRoute.params = { user: { did: 'did:phoenix:mainnet:abc' } };
    const tree = await mountDone();
    expect(tree.root.findAllByProps({ testID: 'signup-username-note' })).toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });

  it('câu này có đủ bốn thứ tiếng — người nước ngoài cũng phải đọc được', async () => {
    for (const key of ['identity.backup.usernameLabel', 'identity.backup.usernameWhy'] as const) {
      const entry = IDENTITY_STRINGS[key];
      expect(Object.keys(entry).sort()).toEqual(['en', 'ja', 'vi', 'zh']);
      for (const lang of ['vi', 'en', 'zh', 'ja'] as const) {
        expect(entry[lang].length).toBeGreaterThan(0);
      }
    }
    // Và khuôn `{name}` phải còn nguyên ở mọi bản dịch, không thì tên biến mất ở
    // đúng ngôn ngữ không ai trong đội đọc được.
    for (const lang of ['vi', 'en', 'zh', 'ja'] as const) {
      expect(IDENTITY_STRINGS['identity.backup.usernameLabel'][lang]).toContain('{name}');
    }
  });
});
