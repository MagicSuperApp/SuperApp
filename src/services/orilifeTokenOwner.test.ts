// services/orilifeTokenOwner.test.ts
//
// TOKEN ORILIFE PHẢI BIẾT NÓ LÀ CỦA AI.
//
// ⛔ Lỗi được đo ngày 2026-08-28, đây là bài kiểm dựng RA TỪ nó:
//   `logoutUser` (store/userSlice.ts) xoá phiên Work, ngắt ProofChat, xoá nháp, đóng
//   CSDL per-user — và bỏ sót `auth_token` của OriLife. Cùng lúc `ensureOrilifeToken`
//   chỉ hỏi "có token không". Trên một tablet dùng chung ngoài đồng, chuỗi việc sau
//   không có gì đỏ và không có gì báo:
//
//     A đăng nhập → A làm việc → A đăng xuất → B đăng nhập → B mở màn vườn
//       → ensureOrilifeToken thấy token (của A) → trả true, KHÔNG ký lại
//       → 17 chỗ đọc `auth_token` gửi yêu cầu MANG DANH A
//
//   Hỏng ở đây không phải "app lỗi" mà là "app ghi dữ liệu của B vào tài khoản A",
//   và nó im tới khi token hết hạn.
//
// Bài kiểm giữ bốn điều, mỗi điều là một nửa của cái bẫy:
//   1. khớp DID  → KHÔNG ký lại (nếu không, mỗi màn một lần hỏi sinh trắc);
//   2. lệch DID  → ký lại, và token cũ phải BIẾN MẤT khỏi kho, không chỉ bị bỏ qua;
//   3. token đời cũ (không rõ chủ) → coi như lệch. Mặc định ĐÓNG;
//   4. đăng xuất → `logoutUser` thật sự gọi xoá (canh bằng cách quét mã nguồn, vì
//      một bài kiểm hàm thuần vẫn xanh sau khi ai đó gỡ lời gọi khỏi thunk).

import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = 'auth_token';
const TOKEN_DID_KEY = 'orilife_token_did';
const OWNER_REF_KEY = 'orilife_owner_ref';

const DID_A = 'did:phoenix:1:' + 'a'.repeat(64);
const DID_B = 'did:phoenix:1:' + 'b'.repeat(64);

let mockCurrentDid: string | null = DID_A;

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockCurrentDid),
  ownerPublicKey: jest.fn(async () => '04' + '11'.repeat(64)),
  signRaw: jest.fn(async () => '3045'),
  isKeypairEnrolled: jest.fn(async () => true),
}));
jest.mock('./phoenixKey-native', () => ({ isAvailable: () => true }));
jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  ensureOrilifeToken,
  tokenMatchesCurrentDid,
  tokenOwnerDid,
  clearOrilifeToken,
} from './orilifeDidAuth';
import { orilifeAuthHeaderValue, resetOrilifeAuthHeaderCache } from './orilifeAuthHeader';

const BASE = 'https://api.orilife.test';

/** Máy chủ trả token mới mỗi lần ký — để phân biệt "ký lại" với "dùng token cũ". */
let servedToken = 'tok-moi';
const mayChuThat = async (url: string) => {
  if (String(url).includes('/challenge')) {
    return { ok: true, json: async () => ({ ok: true, challenge: 'Y2g', ttl: 300 }) } as any;
  }
  return {
    ok: true,
    json: async () => ({ ok: true, token: servedToken, owner: 'acct:x', username: 'x' }),
  } as any;
};
const mockFetch = jest.fn(mayChuThat);

beforeEach(async () => {
  await AsyncStorage.clear();
  resetOrilifeAuthHeaderCache();
  mockCurrentDid = DID_A;
  servedToken = 'tok-moi';
  // `mockClear` chỉ xoá lịch sử gọi, KHÔNG trả lại hiện thực. Bài "mất mạng" dưới
  // đây thay hiện thực bằng một hàm ném — thiếu dòng `mockImplementation` này thì
  // mọi bài SAU nó chạy trên một mạng hỏng và đỏ vì lý do không liên quan.
  mockFetch.mockReset();
  mockFetch.mockImplementation(mayChuThat);
  (global as any).fetch = mockFetch;
});

describe('token OriLife buộc theo DID', () => {
  it('ký một lần rồi lưu CẢ token lẫn DID đã ký ra nó', async () => {
    await expect(ensureOrilifeToken(BASE)).resolves.toBe(true);
    await expect(AsyncStorage.getItem(AUTH_TOKEN_KEY)).resolves.toBe('tok-moi');
    await expect(tokenOwnerDid()).resolves.toBe(DID_A);
  });

  it('cùng DID → KHÔNG ký lại (nếu không, mỗi màn một lần hỏi sinh trắc)', async () => {
    await ensureOrilifeToken(BASE);
    // `mockClear` chỉ xoá lịch sử gọi, KHÔNG trả lại hiện thực. Bài "mất mạng" dưới
  // đây thay hiện thực bằng một hàm ném — thiếu dòng `mockImplementation` này thì
  // mọi bài SAU nó chạy trên một mạng hỏng và đỏ vì lý do không liên quan.
  mockFetch.mockReset();
  mockFetch.mockImplementation(mayChuThat);

    await expect(ensureOrilifeToken(BASE)).resolves.toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Đây chính là ca A→B trên máy dùng chung.
  it('đổi người dùng → ký lại, và token của người trước BIẾN MẤT khỏi kho', async () => {
    servedToken = 'tok-cua-A';
    await ensureOrilifeToken(BASE);
    expect(await AsyncStorage.getItem(AUTH_TOKEN_KEY)).toBe('tok-cua-A');

    mockCurrentDid = DID_B;
    servedToken = 'tok-cua-B';
    await expect(ensureOrilifeToken(BASE)).resolves.toBe(true);

    expect(await AsyncStorage.getItem(AUTH_TOKEN_KEY)).toBe('tok-cua-B');
    await expect(tokenOwnerDid()).resolves.toBe(DID_B);
  });

  // Nếu đường ký lại HỎNG (mất mạng), token người trước vẫn không được ở lại.
  it('lệch DID mà ký lại thất bại → trả false và kho SẠCH, không giữ token cũ', async () => {
    servedToken = 'tok-cua-A';
    await ensureOrilifeToken(BASE);

    mockCurrentDid = DID_B;
    mockFetch.mockImplementation(async () => { throw new Error('mất mạng'); });

    await expect(ensureOrilifeToken(BASE)).resolves.toBe(false);
    await expect(AsyncStorage.getItem(AUTH_TOKEN_KEY)).resolves.toBeNull();
    await expect(tokenOwnerDid()).resolves.toBeNull();
  });

  it('token đời cũ (không có dấu chủ) bị coi như của người lạ → ký lại', async () => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'tok-doi-cu');
    await expect(tokenMatchesCurrentDid()).resolves.toBe(false);

    await expect(ensureOrilifeToken(BASE)).resolves.toBe(true);
    expect(await AsyncStorage.getItem(AUTH_TOKEN_KEY)).toBe('tok-moi');
    await expect(tokenOwnerDid()).resolves.toBe(DID_A);
  });

  it('không có token → không khớp (không được coi "vắng mặt" là "hợp lệ")', async () => {
    await expect(tokenMatchesCurrentDid()).resolves.toBe(false);
  });

  it('có token + có dấu chủ nhưng máy chưa có danh tính → không khớp', async () => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'tok');
    await AsyncStorage.setItem(TOKEN_DID_KEY, DID_A);
    mockCurrentDid = null;
    await expect(tokenMatchesCurrentDid()).resolves.toBe(false);
  });

  it('force → ký lại kể cả khi đang khớp', async () => {
    await ensureOrilifeToken(BASE);
    // `mockClear` chỉ xoá lịch sử gọi, KHÔNG trả lại hiện thực. Bài "mất mạng" dưới
  // đây thay hiện thực bằng một hàm ném — thiếu dòng `mockImplementation` này thì
  // mọi bài SAU nó chạy trên một mạng hỏng và đỏ vì lý do không liên quan.
  mockFetch.mockReset();
  mockFetch.mockImplementation(mayChuThat);
    await ensureOrilifeToken(BASE, { force: true });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('clearOrilifeToken xoá cả ba khoá', async () => {
    await ensureOrilifeToken(BASE);
    await AsyncStorage.setItem(OWNER_REF_KEY, 'acct:x');

    await clearOrilifeToken();

    await expect(AsyncStorage.getItem(AUTH_TOKEN_KEY)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(TOKEN_DID_KEY)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(OWNER_REF_KEY)).resolves.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Đệm đầu đề ảnh — nó nằm trong BỘ NHỚ nên xoá kho không đụng tới nó.
// ─────────────────────────────────────────────────────────────────────────────
describe('đệm `Authorization` của ảnh', () => {
  it('xoá token cũng xoá đệm — nếu không, 30 giây kế ảnh vẫn mang token cũ', async () => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'tok-cua-A');
    await expect(orilifeAuthHeaderValue()).resolves.toBe('Bearer tok-cua-A');

    await clearOrilifeToken();

    // KHÔNG truyền force: đúng cái mà `RemoteImage` làm khi vẽ tấm ảnh kế tiếp.
    await expect(orilifeAuthHeaderValue()).resolves.toBeNull();
  });

  it('đổi người dùng → đệm trả token của người MỚI, không phải người cũ', async () => {
    servedToken = 'tok-cua-A';
    await ensureOrilifeToken(BASE);
    await expect(orilifeAuthHeaderValue()).resolves.toBe('Bearer tok-cua-A');

    mockCurrentDid = DID_B;
    servedToken = 'tok-cua-B';
    await ensureOrilifeToken(BASE);

    await expect(orilifeAuthHeaderValue()).resolves.toBe('Bearer tok-cua-B');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Canh DÂY NỐI, không canh hàm thuần.
//
// Mọi bài kiểm ở trên vẫn XANH nếu ai đó gỡ `clearOrilifeToken()` khỏi `logoutUser`
// hoặc trả `ensureOrilifeToken` về `hasOrilifeToken`. Bốn phép dưới đây đọc thẳng
// mã nguồn nên gỡ dây là đỏ.
// ─────────────────────────────────────────────────────────────────────────────
describe('dây nối còn nguyên', () => {
  const doc = (p: string) => readFileSync(join(__dirname, p), 'utf8');

  it('logoutUser gọi clearOrilifeToken', () => {
    const src = doc('../store/userSlice.ts');
    expect(src).toContain("import { clearOrilifeToken } from '../services/orilifeDidAuth';");
    const thunk = src.slice(src.indexOf("'user/logoutUser'"), src.indexOf('export const loadWallet'));
    expect(thunk).toContain('await clearOrilifeToken();');
  });

  it('ensureOrilifeToken KHÔNG quay lại hỏi mỗi "có token không"', () => {
    const src = doc('./orilifeDidAuth.ts');
    const fn = src.slice(src.indexOf('export async function ensureOrilifeToken'));
    expect(fn).toContain('tokenMatchesCurrentDid()');
    expect(fn).toContain('clearOrilifeToken()');
    expect(fn).not.toContain('hasOrilifeToken()');
  });

  it('token và dấu chủ ghi ĐÚNG THỨ TỰ: token trước, chủ sau', () => {
    const src = doc('./orilifeDidAuth.ts');
    const iRemove = src.indexOf(`await AsyncStorage.removeItem(TOKEN_DID_KEY).catch(() => {});`);
    const iToken = src.indexOf('await AsyncStorage.setItem(AUTH_TOKEN_KEY, vBody.token);');
    const iDid = src.indexOf('await AsyncStorage.setItem(TOKEN_DID_KEY, did);');
    expect(iRemove).toBeGreaterThan(-1);
    expect(iToken).toBeGreaterThan(iRemove);
    expect(iDid).toBeGreaterThan(iToken);
  });

  it('RemoteImage KHÔNG còn giữ bản đệm riêng', () => {
    const src = doc('../components/RemoteImage.tsx');
    expect(src).toContain("from '../services/orilifeAuthHeader'");
    expect(src).not.toContain('_headerCache');
    expect(src).not.toContain("AsyncStorage.getItem");
  });
});
