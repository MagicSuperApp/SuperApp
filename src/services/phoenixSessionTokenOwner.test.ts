// services/phoenixSessionTokenOwner.test.ts
//
// THẺ PHIÊN PHOENIXKEY PHẢI CHẾT THEO PHIÊN.
//
// ⛔ Cùng LỚP lỗi đã đo hai lần rồi — `auth_token` OriLife (28/08,
//    `orilifeTokenOwner.test.ts`) và token chat (`proofchatTokenOwner.test.ts`).
//    Khuôn giống nhau tới mức đọc cạnh nhau là thấy: một hàm dọn được viết sẵn,
//    đặt vào ĐÚNG MỘT đường, rồi đường đăng xuất không ai nối.
//
//    Lần này hàm dọn là `clearSessionToken()` (`phoenixKey-api.ts:329`) và đường
//    duy nhất gọi nó là `wipeIdentity()` (`sdk/phoenixKey.ts`) — đường XOÁ DANH
//    TÍNH HẲN. `logoutUser` không nối. Nên sau khi bấm đăng xuất,
//    `phoenixkey_session_token` vẫn nằm trong AsyncStorage.
//
// ── Vì sao nó NẶNG hơn ca `clearMerkleSession` (#286) ────────────────────────
//    `getMerkleSession` có `isFresh(cached, did)` nên người sau không dùng lại
//    được phiên người trước — mức thiệt hại dừng ở "vật liệu ở lại".
//    Thẻ phiên PhoenixKey KHÔNG có phép so nào tương đương. Không có
//    `phoenixkey_token_did`, và năm chỗ đọc nó đều gắn thẳng `Bearer ${token}`:
//
//      cardanoTxService.ts:189 · orgMint-api.ts:215 · orgMint-api.ts:367 (XHR,
//      NGOÀI interceptor) · phoenixKey-api.ts:252 · phoenixWallet-api.ts:108
//
//    Khép mạch nốt: `ensurePhoenixSession` trả thẳng thẻ đã lưu ra mà không hỏi
//    của ai (`phoenixSessionService.ts:125`), nên người sau KHÔNG có đường tự đúc
//    thẻ của mình chừng nào thẻ cũ còn nằm đó.
//
//    Ba cửa GET đọc ví phía máy chủ có ép `caller_did == path_did` (DID khác →
//    401), nên người sau không XEM được số dư người trước. Bề mặt phơi ra là
//    những đường KHÔNG có `{did}` trên đường dẫn — `/wallet/register`,
//    `/wallet/standard/register`, dựng-nộp giao dịch, đúc tổ chức: ở đó chủ thể
//    do THẺ quyết định. Ca mạo danh, trên đường ví.
//
// ── Nửa thứ hai của cùng một khoá: thẻ chết là ngõ cụt vĩnh viễn ─────────────
//    `getSessionToken()` là lệnh đọc kho trần — không kiểm hạn. Thẻ sống 24 giờ.
//    Hết hạn thì `connectProofChat` lấy đúng nó ra, ProofChat trả 401, và trước
//    bản này KHÔNG chỗ nào xoá. Người dùng thấy "Chưa đăng nhập được… kéo xuống
//    để thử lại", mà kéo xuống chỉ xoá thời gian nghỉ 60 giây rồi đọc lại đúng
//    thẻ chết đó. Lối ra duy nhất là xoá dữ liệu app.
//
// Bài kiểm giữ năm điều:
//   1. 401 → thẻ chết BIẾN MẤT khỏi kho, đúc thẻ mới, đăng nhập bằng thẻ MỚI;
//   2. 401 mà đúc lại trượt → vẫn phải sạch, không để thẻ chết ở lại;
//   3. lỗi KHÔNG phải 401/403 → không xoá, không đúc lại (đừng tiêu một hộp vân
//      tay cho lượt vẫn hỏng);
//   4. `logoutUser` thật sự gọi `clearSessionToken()`;
//   5. nhánh thoát ngõ cụt còn nguyên — canh bằng quét mã nguồn, vì bài kiểm hàm
//      thuần vẫn xanh sau khi ai đó gỡ lời gọi khỏi thunk.

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
  },
}));

// ── Secure store giả (token ProofChat nằm ở Keychain/Keystore) ───────
const enclave: Record<string, string> = {};
jest.mock('../sdk/taadEnclave', () => ({
  secureStore: jest.fn(async (k: string, v: string) => {
    enclave[k] = v;
    return true;
  }),
  secureLoad: jest.fn(async (k: string) =>
    Object.prototype.hasOwnProperty.call(enclave, k) ? enclave[k] : null,
  ),
  secureDelete: jest.fn(async (k: string) => {
    delete enclave[k];
    return true;
  }),
}));

// ── axios giả ────────────────────────────────────────────────────────
const mockPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      post: (...a: any[]) => mockPost(...a),
      get: jest.fn(),
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    }),
  },
}));

// `@env` bị babel inline thành rỗng trong jest → cờ luôn false. Ghi đè để đo
// được logic cầu nối.
jest.mock('./proofchat-api', () => {
  const actual = jest.requireActual('./proofchat-api');
  return { ...actual, isProofChatBackendEnabled: jest.fn(() => true) };
});

// Tiền tố `mock` là bắt buộc: nhà máy của `jest.mock` được cẩu lên đầu tệp nên
// nó chỉ nhìn thấy biến mang tiền tố đó.
const mockDidHienTai = 'did:phoenix:1:' + 'a'.repeat(64);
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDidHienTai),
}));

// ⚠ CỐ Ý KHÔNG mock `./phoenixKey-api`: bài này đo chính `getSessionToken` /
// `clearSessionToken` THẬT chạy trên kho giả ở trên. Mock chúng đi là đo mock.
const mockEnsure = jest.fn<Promise<string | null>, [{ force?: boolean }?]>();
jest.mock('./phoenixSessionService', () => ({
  ensurePhoenixSession: (opts?: { force?: boolean }) => mockEnsure(opts),
}));

import { getAccessToken } from './proofchat-api';
import { connectProofChat, resetProofChatSessionBackoff } from './proofchatAuthBridge';

const SESSION_TOKEN_KEY = 'phoenixkey_session_token';

/**
 * Lỗi hình dạng AXIOS, không phải `ProofChatApiError` dựng sẵn.
 *
 * `phoenixKeyLogin` đi qua `unwrap`, và `unwrap` đọc `err.response.status` để dựng
 * ra `ProofChatApiError`. Ném thẳng một `ProofChatApiError(401)` vào mock thì
 * `unwrap` không thấy `.response` và biến nó thành `httpStatus: 0` — bài kiểm sẽ
 * đo một mã lỗi mà máy chủ thật không bao giờ tạo ra.
 */
const loiMayChu = (status: number, message: string) => ({
  response: { status, data: { message } },
  message,
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(enclave)) delete enclave[k];
  mockPost.mockReset();
  mockEnsure.mockReset();
  // Mốc "lần hỏng gần nhất" sống ở phạm vi module nên rỉ từ ca này sang ca sau:
  // ca trước hỏng ⇒ ca sau nhận lại kết quả cũ mà không gọi máy chủ.
  resetProofChatSessionBackoff();
});

describe('thẻ phiên chết KHÔNG được ở lại kho', () => {
  it('401 → xoá thẻ chết, đúc thẻ mới bằng force, đăng nhập bằng thẻ MỚI', async () => {
    store[SESSION_TOKEN_KEY] = 'phx-het-han';
    mockEnsure.mockResolvedValue('phx-moi');
    mockPost
      .mockRejectedValueOnce(loiMayChu(401, 'Unauthorized'))
      .mockResolvedValueOnce({
        data: { data: { accessToken: 'chat-moi', refreshToken: 'RR' }, statusCode: 201 },
      });

    const r = await connectProofChat();

    expect(r).toEqual({ status: 'connected', alreadyHadSession: false });
    // `force: true` — không có nó thì `ensurePhoenixSession` trả lại đúng thẻ
    // chết vừa xoá... hoặc tệ hơn, trả lại thẻ nó đọc trước khi kho kịp sạch.
    expect(mockEnsure).toHaveBeenCalledWith({ force: true });
    // Lượt đăng nhập THỨ HAI phải mang thẻ MỚI, không phải thẻ chết.
    expect(mockPost).toHaveBeenNthCalledWith(2, '/auth/phoenixkey/login', {
      sessionToken: 'phx-moi',
    });
    expect(await getAccessToken()).toBe('chat-moi');
  });

  it('401 mà đúc lại trượt → thẻ chết vẫn phải SẠCH khỏi kho', async () => {
    // Ca xấu nhất: xoá xong thì đúc trượt (mất sóng). Thà không có thẻ còn hơn
    // giữ một thẻ chết để lượt sau lại đâm vào đúng bức tường đó.
    store[SESSION_TOKEN_KEY] = 'phx-het-han';
    mockEnsure.mockResolvedValue(null);
    mockPost.mockRejectedValue(loiMayChu(401, 'Unauthorized'));

    const r = await connectProofChat();

    expect(r.status).toBe('no-phoenix-session');
    expect(store[SESSION_TOKEN_KEY]).toBeUndefined();
  });

  it('lỗi KHÔNG phải 401/403 → KHÔNG xoá thẻ, KHÔNG đúc lại', async () => {
    // Máy chủ 500 hay mất mạng không có nghĩa thẻ sai. Đúc lại ở đây là tiêu một
    // hộp vân tay cho một lượt vẫn hỏng — đúng cái giá bản 2026-09-08 vừa gỡ.
    store[SESSION_TOKEN_KEY] = 'phx-con-song';
    mockPost.mockRejectedValue(loiMayChu(500, 'Server error'));

    const r = await connectProofChat();

    expect(r.status).toBe('error');
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(store[SESSION_TOKEN_KEY]).toBe('phx-con-song');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DÂY NỐI, không hàm thuần.
//
// Mọi bài trên vẫn XANH nếu ai đó gỡ `clearSessionToken()` khỏi `logoutUser` —
// thunk đó không có đường nào chạy qua bài kiểm ở trên. Hai phép dưới đọc thẳng
// mã nguồn, khớp LỜI GỌI chứ không khớp tên trần, nên gỡ dây là đỏ.
// ─────────────────────────────────────────────────────────────────────────────
describe('dây nối còn nguyên', () => {
  // Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
  // `core.autocrlf=true` (xem `.gitattributes`). Phép so nào có xuống dòng trong
  // khuôn mẫu mà không chuẩn hoá sẽ trượt sạch ở đó, và đỏ ở chỗ không nói gì về
  // thẻ phiên.
  const doc = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');

  it('logoutUser gọi clearSessionToken', () => {
    const src = doc('../store/userSlice.ts');
    expect(src).toContain('clearSessionToken');
    expect(src).toContain("from '../services/phoenixKey-api'");
    // Lời gọi phải nằm TRONG thunk đăng xuất, không phải một chỗ nào khác trong tệp.
    const thunk = src.slice(src.indexOf("'user/logoutUser'"), src.indexOf('export const loadWallet'));
    expect(thunk).toContain('await clearSessionToken();');
  });

  it('connectProofChat còn nhánh thoát ngõ cụt cho thẻ chết', () => {
    const src = doc('./proofchatAuthBridge.ts');
    const than = src.slice(src.indexOf('const connectProofChatInner'));
    expect(than).toContain('await clearSessionToken();');
    expect(than).toContain("ensurePhoenixSession({ force: true })");
    // Gỡ phép lọc mã lỗi là quay lại đúc thẻ cho MỌI lỗi, kể cả mất sóng.
    expect(than).toContain('httpStatus === 401 || httpStatus === 403');
  });
});
