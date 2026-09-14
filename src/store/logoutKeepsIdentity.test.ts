// store/logoutKeepsIdentity.test.ts
//
// NỬA CÒN THIẾU CỦA ISSUE #299.
//
// `phoenixSessionTokenOwner.test.ts` đã ghim nửa thứ nhất: sau đăng xuất thì
// THẺ PHIÊN không được ở lại. Nửa thứ hai chưa ai ghim, và nó là một RÀNG BUỘC
// CỨNG của chủ sản phẩm: **đăng xuất KHÔNG được chặn người cũ đăng nhập lại
// bằng DID cũ.**
//
// Vì sao phải có hàng rào riêng cho nửa này, chứ không tin vào ý tốt:
//   · #299 để ngỏ ba khoá — `phoenixkey_user_did`, `phoenix_device_key_seed`,
//     `biometric_did_map` — với ghi chú "cũng sống qua đăng xuất". Đọc lướt thì
//     ba dòng đó trông y hệt ba lỗ chưa vá, và cách "vá" hiển nhiên nhất là
//     thêm ba lời gọi xoá vào `logoutUser`.
//   · Làm thế là đổi đăng-xuất thành xoá-danh-tính. Người dùng bấm "Đăng xuất"
//     rồi mất luôn DID, và lối về duy nhất là 24 từ — thứ phần lớn người dùng
//     chưa cất giữ (`identity.backup.later` tồn tại chính vì thế).
//   · Hỏng theo chiều này KHÔNG kêu: app vẫn chạy, màn đăng nhập vẫn hiện, chỉ
//     là không ai vào lại được. Không test nào hôm nay đỏ.
//
// Hai phép đo dưới đây đứng ở hai cực khác nhau:
//   1. HÀNH VI — `clearSessionToken()` thật, trên kho giả: thẻ phiên biến mất,
//      bốn khoá danh tính còn nguyên. Một hàm dọn "xoá cho sạch" là đỏ ngay.
//   2. DÂY NỐI — thân thunk `logoutUser` không được chạm tới khoá danh tính nào.
//      Bài số 1 vẫn xanh nếu ai đó thêm `AsyncStorage.removeItem('phoenixkey_user_did')`
//      thẳng vào thunk, vì thunk không đi qua bài đó.

import { readFileSync } from 'fs';
import { join } from 'path';

// ── AsyncStorage in-memory ───────────────────────────────────────────
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
    multiRemove: jest.fn(async (ks: string[]) => {
      ks.forEach((k) => delete store[k]);
    }),
  },
}));

import { clearSessionToken } from '../services/phoenixKey-api';

/** Thẻ PHIÊN — phải chết theo phiên. */
const SESSION_TOKEN_KEY = 'phoenixkey_session_token';

/**
 * Khoá DANH TÍNH — phải sống qua đăng xuất, nếu không người cũ không vào lại
 * được. Mỗi khoá kèm nơi khai để đổi tên là thấy ngay chỗ phải sửa.
 */
const IDENTITY_KEYS = [
  'phoenixkey_user_did', // sdk/phoenixKey.ts  STORAGE_USER_DID
  'phoenix_device_key_seed', // services/deviceKeyService.ts  DEVICE_KEY_SEED_STORAGE
  'biometric_did_map', // services/phoenixKeyAuthService.ts  BIOMETRIC_DID_KEY
  'taad_active_account_v1', // services/masterKekStore.ts  ACTIVE_ACCOUNT_KEY
];

describe('thu hồi thẻ phiên KHÔNG được đụng tới danh tính', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    store[SESSION_TOKEN_KEY] = 'phx-cua-nguoi-truoc';
    IDENTITY_KEYS.forEach((k) => {
      store[k] = `gia-tri-cua-${k}`;
    });
  });

  it('sau khi thu hồi: thẻ phiên KHÔNG còn', async () => {
    await clearSessionToken();
    expect(store[SESSION_TOKEN_KEY]).toBeUndefined();
  });

  it('sau khi thu hồi: khoá danh tính và DID VẪN còn nguyên', async () => {
    await clearSessionToken();
    for (const k of IDENTITY_KEYS) {
      expect(store[k]).toBe(`gia-tri-cua-${k}`);
    }
  });

  it('thu hồi hai lần vẫn không đụng danh tính (đăng xuất lặp không phá gì)', async () => {
    await clearSessionToken();
    await clearSessionToken();
    expect(store[SESSION_TOKEN_KEY]).toBeUndefined();
    expect(store['phoenixkey_user_did']).toBe('gia-tri-cua-phoenixkey_user_did');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DÂY NỐI — hàng rào cho đường đăng xuất.
// ─────────────────────────────────────────────────────────────────────────────
describe('thân thunk logoutUser không chạm khoá danh tính', () => {
  // Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
  // `core.autocrlf=true` (xem `.gitattributes`).
  const doc = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');

  /**
   * Bỏ chú thích trước khi soi.
   *
   * Khối chú thích của `logoutUser` GIẢI THÍCH chính cái bẫy này và nhắc tên
   * `wipeIdentity()`. Soi cả chú thích thì bài đỏ vì một câu văn — tức nó phạt
   * đúng việc ghi lại lý do, và người sửa sẽ xoá câu văn chứ không xoá lỗi.
   */
  const codeOnly = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  /** Chỉ thân thunk `logoutUser`, không phải cả tệp, và chỉ phần MÃ. */
  const logoutThunkBody = (): string => {
    const src = doc('./userSlice.ts');
    const start = src.indexOf("'user/logoutUser'");
    const end = src.indexOf('export const loadWallet');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return codeOnly(src.slice(start, end));
  };

  it('vẫn thu hồi thẻ phiên (nửa thứ nhất của #299, giữ nguyên)', () => {
    expect(logoutThunkBody()).toContain('await clearSessionToken();');
  });

  it.each(IDENTITY_KEYS)('không xoá khoá danh tính `%s`', (key) => {
    const body = logoutThunkBody();
    expect(body).not.toContain(`removeItem('${key}')`);
    expect(body).not.toContain(`removeItem("${key}")`);
  });

  it('không gọi wipeIdentity — đó là đường XOÁ DANH TÍNH, không phải đăng xuất', () => {
    const body = logoutThunkBody();
    expect(body).not.toContain('wipeIdentity');
    expect(body).not.toContain('nativeDeleteKey');
  });

  it('userSlice.ts không import đường xoá danh tính', () => {
    // Chặn ở cửa import: không import được thì không gọi nhầm được, và lỗi
    // hiện ra lúc đọc mã chứ không lúc người dùng mất DID.
    const src = codeOnly(doc('./userSlice.ts'));
    expect(src).not.toContain('wipeIdentity');
  });
});
