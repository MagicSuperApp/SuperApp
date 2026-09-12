// services/cooldownIdentitySwitch.test.ts
//
// ĐỔI DANH TÍNH GIỮA LÚC MỘT LƯỢT ĐANG BAY.
//
// Hai van chặn bão sinh trắc — van đăng nhập OriLife (`orilifeDidAuth.ts`) và van
// đúc thẻ PhoenixKey (`phoenixKey-api.ts`) — đều là biến cấp module. Mở van bằng
// cách gán lại biến thì xoá được TRẠNG THÁI, nhưng không dừng được một lượt ĐANG
// CHẠY: lượt đó vẫn đi tới cùng, và khi máy chủ trả lời thì nó ghi đè lên đúng
// những biến vừa được dọn.
//
// Chuỗi hỏng, mọi bước đều là đường người dùng đi hằng ngày:
//   1. phiên của DID cũ chết → một màn mở lượt đăng nhập, đang chờ máy chủ;
//   2. người dùng đăng xuất, hoặc lập lại danh tính → van mở, trạng thái sạch;
//   3. máy chủ từ chối lượt của DID CŨ → nó đặt nghỉ-60-giây;
//   4. DID MỚI bị khoá sinh trắc một phút, và màn hình trình câu từ chối của DID
//      cũ như thể máy chủ vừa nói về danh tính mới.
//
// Bước 4 là chỗ đắt nhất: câu hiện ra vừa SAI (nói về danh tính đã bỏ) vừa không
// hành động được gì. Đúng cái van này sinh ra để chấm dứt.
//
// Bộ bài chia hai phần, và phần hai KHÔNG thay được bằng phần một:
//   · HÀNH VI — lượt mồ côi trả kết quả cho người đã gọi nó, nhưng không được
//     ghi lên trạng thái dùng chung;
//   · DÂY NỐI — `clearSessionMintCooldown` có người gọi. Hàm này từng được viết
//     ra rồi KHÔNG nơi nào gọi, và mọi bài kiểm hàm thuần vẫn xanh suốt lúc đó.

import { readFileSync } from 'fs';
import { join } from 'path';

import AsyncStorage from '@react-native-async-storage/async-storage';

const DID_OLD = 'did:phoenix:1:' + 'a'.repeat(64);

// Tiền tố `mock` là bắt buộc — nhà máy của `jest.mock` không đọc được biến ngoài
// phạm vi trừ tên bắt đầu bằng `mock`.
let mockCurrentDid: string | null = DID_OLD;
const mockSignRaw = jest.fn(async () => '3045');

// Bộ mặt của `sdk/phoenixKey` phải khớp ĐÚNG tên hàm mà mã sản xuất gọi. Khai
// thiếu một tên thì lời gọi ném, và `loginOrilifeWithDid` gói mọi ngoại lệ vào
// ô `unknown` — bài kiểm vẫn "đỏ đúng chỗ" nhưng vì một lý do khác hẳn lý do
// đang đo. Đây là ca `mock lỏng hơn thật` đã cắn một lần rồi.
jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockCurrentDid),
  ownerPublicKey: jest.fn(async () => '04' + '11'.repeat(64)),
  signRaw: (...a: unknown[]) => mockSignRaw(...(a as [])),
  isKeypairEnrolled: jest.fn(async () => true),
}));
jest.mock('./phoenixKey-native', () => ({ isAvailable: () => true }));
jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  ensureOrilifeToken,
  clearOrilifeLoginCooldown,
  orilifeLoginCooldownLeft,
  lastOrilifeLoginKind,
  lastOrilifeLoginError,
} from './orilifeDidAuth';
import { resetOrilifeAuthHeaderCache } from './orilifeAuthHeader';
import {
  registerSessionRefresher,
  remintSessionOnce,
  clearSessionMintCooldown,
  sessionMintCooldownLeft,
} from './phoenixKey-api';

const BASE = 'https://api.orilife.test';

/** Một lời hứa mở — bài tự quyết lúc nào máy chủ trả lời. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Nhường vòng lặp sự kiện cho tới khi lượt đang bay đứng ở chỗ chờ máy chủ. */
const settle = () => new Promise((r) => setImmediate(r));

const challengeOk = { ok: true, json: async () => ({ ok: true, challenge: 'Y2g', ttl: 300 }) };

const mockFetch = jest.fn();

beforeEach(async () => {
  await AsyncStorage.clear();
  resetOrilifeAuthHeaderCache();
  clearOrilifeLoginCooldown();
  clearSessionMintCooldown();
  mockCurrentDid = DID_OLD;
  mockSignRaw.mockClear();
  mockSignRaw.mockImplementation(async () => '3045');
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
});

describe('van đăng nhập OriLife — lượt mồ côi không ghi lên danh tính mới', () => {
  it('mở van giữa chừng ⟹ lượt cũ trượt KHÔNG đặt nghỉ cho danh tính mới', async () => {
    const gate = deferred<any>();
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes('/challenge') ? challengeOk : gate.promise,
    );

    const inFlight = ensureOrilifeToken(BASE);
    await settle();

    // Người dùng đăng xuất / lập lại danh tính NGAY lúc này.
    clearOrilifeLoginCooldown();
    expect(orilifeLoginCooldownLeft()).toBe(0);

    // Bây giờ máy chủ mới từ chối — và nó đang nói về DID CŨ.
    gate.resolve({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, detail: 'did not enrolled' }),
    });
    await expect(inFlight).resolves.toBe(false);

    // Trạng thái của danh tính MỚI phải còn sạch nguyên.
    expect(orilifeLoginCooldownLeft()).toBe(0);
    expect(lastOrilifeLoginKind()).toBeNull();
    expect(lastOrilifeLoginError()).toBeNull();
  });

  it('KHÔNG mở van thì lượt trượt VẪN đặt nghỉ — van là van, không phải khoá chết', async () => {
    // Ca đối xứng. Thiếu bài này thì một `loginOnce` hỏng tới mức không bao giờ
    // ghi trạng thái nữa cũng làm bài trên xanh, và cơn bão sinh trắc quay lại
    // nguyên vẹn.
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes('/challenge')
        ? challengeOk
        : { ok: false, status: 401, json: async () => ({ ok: false, detail: 'did not enrolled' }) },
    );

    await expect(ensureOrilifeToken(BASE)).resolves.toBe(false);
    expect(orilifeLoginCooldownLeft()).toBeGreaterThan(0);
    expect(lastOrilifeLoginKind()).toBe('refused');
  });

  it('lượt mồ côi vẫn TRẢ kết quả cho người đã gọi — không nuốt lỗi', async () => {
    // Bỏ ghi trạng thái dùng chung là đúng; bỏ trả lời cho chỗ đã gọi thì lại là
    // dựng một cái vỏ im lặng ở tầng dưới. Hai việc khác nhau.
    const gate = deferred<any>();
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes('/challenge') ? challengeOk : gate.promise,
    );

    const inFlight = ensureOrilifeToken(BASE);
    await settle();
    clearOrilifeLoginCooldown();
    gate.resolve({ ok: false, status: 401, json: async () => ({ ok: false }) });

    // Trả về một câu trả lời DỨT KHOÁT, không treo mãi.
    await expect(inFlight).resolves.toBe(false);
  });
});

describe('van đúc thẻ PhoenixKey — cùng lỗ, cùng cách bịt', () => {
  it('mở van giữa chừng ⟹ lượt đúc cũ trượt KHÔNG đặt nghỉ cho danh tính mới', async () => {
    const gate = deferred<string | null>();
    registerSessionRefresher(() => gate.promise);

    const inFlight = remintSessionOnce();
    await settle();

    clearSessionMintCooldown();
    gate.resolve(null); // đúc trượt
    await expect(inFlight).resolves.toBeNull();

    expect(sessionMintCooldownLeft()).toBe(0);
  });

  it('KHÔNG mở van thì lượt đúc trượt VẪN đặt nghỉ', async () => {
    registerSessionRefresher(async () => null);
    await expect(remintSessionOnce()).resolves.toBeNull();
    expect(sessionMintCooldownLeft()).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Canh DÂY NỐI. Mọi bài ở trên vẫn xanh nếu không ai gọi `clearSessionMintCooldown`
// — đó đúng là trạng thái của mã trước bản này: hàm có, đường không có.
// ─────────────────────────────────────────────────────────────────────────────
describe('dây nối của van đúc thẻ', () => {
  const readSrc = (p: string) => readFileSync(join(__dirname, p), 'utf8');

  it('logoutUser mở van đúc thẻ, ngay sau khi xoá thẻ phiên', () => {
    const src = readSrc('../store/userSlice.ts');
    const thunk = src.slice(
      src.indexOf("'user/logoutUser'"),
      src.indexOf('export const loadWallet'),
    );
    expect(thunk).toContain('await clearSessionToken();');
    expect(thunk).toContain('clearSessionMintCooldown();');
    // Xoá thẻ mà không mở van thì người sau vừa không có thẻ vừa không được đúc
    // thẻ — tệ hơn cả trước khi xoá. Nên thứ tự này là một phần của phép vá.
    expect(thunk.indexOf('await clearSessionToken();')).toBeLessThan(
      thunk.indexOf('clearSessionMintCooldown();'),
    );
  });

  it('lập lại danh tính mở CẢ HAI van', () => {
    const src = readSrc('../screens/TreeIdentityScreen.tsx');
    expect(src).toContain('clearOrilifeLoginCooldown();');
    expect(src).toContain('clearSessionMintCooldown();');
  });

  it('cả hai van đều chốt số hiệu thế TRƯỚC `await` đầu tiên', () => {
    // Chốt sau một `await` là chốt nhầm thế: van có thể đã mở ở đúng khoảng giữa,
    // và lượt mồ côi lại tự nhận mình là lượt hiện hành. Bài hành vi ở trên không
    // phân biệt được hai cách viết vì chúng chỉ khác nhau ở ca hẹp hơn.
    const login = readSrc('./orilifeDidAuth.ts');
    expect(login).toContain(
      'const generationAtStart = loginGeneration;\n  const run = (async () => {',
    );
    expect(login).toContain('if (generationAtStart !== loginGeneration) return res;');

    const mint = readSrc('./phoenixKey-api.ts');
    expect(mint).toContain(
      'const generationAtStart = mintGeneration;\n  const run = (async () => {',
    );
    expect(mint).toContain('if (generationAtStart === mintGeneration) {');
  });
});
