// services/orilifeLoginCooldown.test.ts
//
// MỘT PHIÊN HỎNG CHỈ ĐƯỢC HỎI SINH TRẮC MỘT LẦN.
//
// ⛔ Lỗi đo được trên bản 99, từ ba đoạn quay người dùng gửi 2026-09-12:
//   Mở màn trang trại khi phiên OriLife đã chết thì hộp Face ID của hệ điều hành
//   bật lại ở giây 19 · 23 · 26 · 30 · 38. Lần nào cũng nhận đúng mặt, lần nào
//   xong cũng lại có cái tiếp theo. Một đoạn quay bắt được hộp Face ID bật ĐÈ LÊN
//   máy ảnh đang quay video cây — lúc đó người dùng đang chĩa camera sau vào gốc
//   cây, nên hộp thoại ấy không thể nào thoả được. Người dùng báo "đơ như cây cơ"
//   và "không nhận được FaceID"; thật ra không luồng nào treo cả.
//
//   Nguyên nhân không nằm ở một chỗ gọi: 11 service cùng gọi `ensureOrilifeToken`
//   trước mỗi yêu cầu, rồi gọi LẠI với `force` khi máy chủ trả 401 — riêng màn
//   trang trại có ba luồng làm đúng thế. Mỗi lượt là một lần `signRaw`, tức một
//   hộp thoại.
//
// Bài kiểm canh hai lớp, chúng giải hai việc KHÁC nhau và hỏng độc lập nhau:
//   1. gộp-đang-bay — nhiều lời gọi CÙNG LÚC dùng chung một lần ký;
//   2. nghỉ-sau-khi-trượt — ba lời gọi NỐI ĐUÔI nhau vẫn chỉ một lần ký. Không có
//      lớp 2 thì lớp 1 vẫn xanh mà người dùng vẫn thấy ba hộp thoại.
//
// Và canh cả chiều NGƯỢC: van không được khoá chặt tới mức người vừa đổi danh
// tính phải ngồi chờ một phút.

import AsyncStorage from '@react-native-async-storage/async-storage';

const DID_A = 'did:phoenix:1:' + 'a'.repeat(64);

const mockSignRaw = jest.fn(async () => '3045');
// Tiền tố `mock` là bắt buộc: nhà máy của `jest.mock` không đọc được biến ngoài
// phạm vi, trừ tên bắt đầu bằng `mock`. Đây là biến đổi được giữa các bài, nên ca
// "máy chưa có danh tính" đặt nó về `null` thay vì vá lại mô-đun đã nạp.
let mockCurrentDid: string | null = DID_A;

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
} from './orilifeDidAuth';
import { authSyncMessage } from './orilifeAuthMessage';
import { resetOrilifeAuthHeaderCache } from './orilifeAuthHeader';
import { tk } from '../i18n/keys';
import { TRACE_STRINGS } from '../i18n/keys/trace';

const BASE = 'https://api.orilife.test';

/** Máy chủ NHẬN: cấp challenge rồi cấp token. */
const mayChuNhan = async (url: string) => {
  if (String(url).includes('/challenge')) {
    return { ok: true, json: async () => ({ ok: true, challenge: 'Y2g', ttl: 300 }) } as any;
  }
  return { ok: true, json: async () => ({ ok: true, token: 'tok', owner: 'acct:x' }) } as any;
};

/** Máy chủ TỪ CHỐI ở bước verify — đúng ca đang xảy ra ngoài đồng. */
const mayChuTuChoi = async (url: string) => {
  if (String(url).includes('/challenge')) {
    return { ok: true, json: async () => ({ ok: true, challenge: 'Y2g', ttl: 300 }) } as any;
  }
  return {
    ok: false,
    status: 401,
    json: async () => ({ ok: false, detail: 'did not enrolled' }),
  } as any;
};

const mockFetch = jest.fn(mayChuNhan);

beforeEach(async () => {
  await AsyncStorage.clear();
  resetOrilifeAuthHeaderCache();
  clearOrilifeLoginCooldown();
  mockCurrentDid = DID_A;
  mockSignRaw.mockClear();
  mockSignRaw.mockImplementation(async () => '3045');
  mockFetch.mockReset();
  mockFetch.mockImplementation(mayChuNhan);
  (global as any).fetch = mockFetch;
});

describe('van chặn bão sinh trắc', () => {
  it('nhiều lời gọi CÙNG LÚC chỉ hỏi sinh trắc MỘT lần', async () => {
    mockFetch.mockImplementation(mayChuTuChoi);
    // Đúng hình dạng thật: màn trang trại bắn ba thunk gần như cùng nhịp.
    const ket = await Promise.all([
      ensureOrilifeToken(BASE),
      ensureOrilifeToken(BASE),
      ensureOrilifeToken(BASE),
    ]);
    expect(ket).toEqual([false, false, false]);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
  });

  it('ba lời gọi NỐI ĐUÔI trong thời gian nghỉ cũng chỉ một lần ký', async () => {
    mockFetch.mockImplementation(mayChuTuChoi);
    await ensureOrilifeToken(BASE);
    await ensureOrilifeToken(BASE);
    await ensureOrilifeToken(BASE);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
  });

  it('`force` KHÔNG vượt van — đó chính là đường thử-lại-sau-401 gây bão', async () => {
    mockFetch.mockImplementation(mayChuTuChoi);
    await ensureOrilifeToken(BASE);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
    await ensureOrilifeToken(BASE, { force: true });
    await ensureOrilifeToken(BASE, { force: true });
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
  });

  it('hết thời gian nghỉ thì ký lại — van là VAN, không phải khoá chết', async () => {
    mockFetch.mockImplementation(mayChuTuChoi);
    await ensureOrilifeToken(BASE);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);

    const that = Date.now;
    try {
      // 61 giây sau. Dùng `Date.now` giả chứ không `setTimeout` thật: bài kiểm
      // phải đo CHÍNH SÁCH nghỉ, không đo đồng hồ của máy chạy nó.
      Date.now = () => that() + 61_000;
      await ensureOrilifeToken(BASE);
    } finally {
      Date.now = that;
    }
    expect(mockSignRaw).toHaveBeenCalledTimes(2);
  });

  it('đăng nhập THÀNH CÔNG thì không để lại thời gian nghỉ nào', async () => {
    await expect(ensureOrilifeToken(BASE)).resolves.toBe(true);
    expect(orilifeLoginCooldownLeft()).toBe(0);
    expect(lastOrilifeLoginKind()).toBeNull();
  });

  it('`clearOrilifeLoginCooldown` mở van ngay — lối cho đổi danh tính/đăng xuất', async () => {
    mockFetch.mockImplementation(mayChuTuChoi);
    await ensureOrilifeToken(BASE);
    expect(orilifeLoginCooldownLeft()).toBeGreaterThan(0);

    clearOrilifeLoginCooldown();
    expect(orilifeLoginCooldownLeft()).toBe(0);
    await ensureOrilifeToken(BASE);
    expect(mockSignRaw).toHaveBeenCalledTimes(2);
  });
});

// Bốn bài dưới đây so với `tk(<khoá>)` chứ KHÔNG so với câu tiếng Việt viết thẳng.
// Lý do đo được: bộ kiểm chạy ở ngôn ngữ mặc định là tiếng Anh, nên một bài so
// nguyên văn tiếng Việt vừa đỏ oan hôm nay, vừa — tệ hơn — sẽ đỏ vào ngày ai đó
// sửa một dấu phẩy trong bản dịch mà không có gì hỏng. Cái cần ghim là PHÉP ÁNH XẠ
// từ ô hỏng sang khoá, và có ghim đếm ngược hay không; câu chữ là việc của tệp khoá.
describe('câu nói với người dùng bám đúng ô hỏng', () => {
  it('máy chủ từ chối → KHÔNG nói "phiên hết hạn", và KHÔNG hứa chờ rồi thử lại', async () => {
    mockFetch.mockImplementation(mayChuTuChoi);
    await ensureOrilifeToken(BASE);
    expect(lastOrilifeLoginKind()).toBe('refused');

    const cau = authSyncMessage();
    // Câu cũ đoán sai nguyên nhân rồi ra một mệnh lệnh không có nút nào để làm.
    expect(cau).not.toBe(tk('trace.sync.authError'));
    // Chờ bao lâu cũng ra kết quả cũ → câu phải ĐỨNG MỘT MÌNH, không nối đếm ngược.
    expect(cau).toBe(tk('trace.sync.auth.refused'));
  });

  it('mất mạng → nói mất mạng, và CÓ đếm ngược vì thử lại đổi được kết quả', async () => {
    mockFetch.mockImplementation(async () => {
      throw new Error('Network request failed');
    });
    await ensureOrilifeToken(BASE);
    expect(lastOrilifeLoginKind()).toBe('network');

    const cau = authSyncMessage();
    expect(cau.startsWith(tk('trace.sync.auth.network'))).toBe(true);
    // Có phần đuôi, và phần đuôi đó mang một con số giây — không phải chuỗi rỗng.
    expect(cau.length).toBeGreaterThan(tk('trace.sync.auth.network').length);
    expect(cau).toMatch(/\d+/);
  });

  it('máy chưa có danh tính → chỉ đúng chỗ phải đi, không bảo chờ rồi thử lại', async () => {
    mockCurrentDid = null;
    await ensureOrilifeToken(BASE);
    expect(lastOrilifeLoginKind()).toBe('no-identity');
    expect(authSyncMessage()).toBe(tk('trace.sync.auth.noIdentity'));
  });

  it('ký hỏng → rơi vào ô `sign`, ô DUY NHẤT nhắc được chuyện đóng máy ảnh', async () => {
    // Đoạn quay IMG_0573 bắt được hộp Face ID bật đè lên màn quay video cây: máy
    // ảnh sau đang mở, người dùng chĩa vào gốc cây, nên không thể quay mặt về màn
    // hình. Gộp ô này vào ô nào khác là mất đúng câu nói được điều đó.
    mockSignRaw.mockImplementationOnce(async () => {
      throw new Error('Biometry is locked out');
    });
    await ensureOrilifeToken(BASE);
    expect(lastOrilifeLoginKind()).toBe('sign');
    expect(authSyncMessage().startsWith(tk('trace.sync.auth.sign'))).toBe(true);
    // Ghim nội dung ở TỆP KHOÁ, nơi câu chữ thật sự sống — cả bốn thứ tiếng.
    expect(TRACE_STRINGS['trace.sync.auth.sign'].vi).toContain('máy ảnh');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Canh DÂY NỐI, không canh hàm thuần.
//
// Mọi bài ở trên vẫn XANH nếu ai đó gỡ `clearOrilifeLoginCooldown()` khỏi
// `logoutUser` — và lúc đó người sau đăng nhập trên cùng máy phải ngồi chờ hết
// thời gian nghỉ của người trước, không màn nào giải thích vì sao.
// ─────────────────────────────────────────────────────────────────────────────
describe('dây nối còn nguyên', () => {
  const doc = (p: string) =>
    require('fs').readFileSync(require('path').join(__dirname, p), 'utf8');

  it('logoutUser mở van sau khi xoá token', () => {
    const src = doc('../store/userSlice.ts');
    const thunk = src.slice(
      src.indexOf("'user/logoutUser'"),
      src.indexOf('export const loadWallet'),
    );
    expect(thunk).toContain('await clearOrilifeToken();');
    expect(thunk).toContain('clearOrilifeLoginCooldown();');
  });

  it('lập lại danh tính mở van', () => {
    const src = doc('../screens/TreeIdentityScreen.tsx');
    expect(src).toContain('clearOrilifeLoginCooldown();');
  });

  it('`clearOrilifeToken` KHÔNG tự mở van — mở ở đó là vô hiệu hoá chính cái van', () => {
    // `ensureOrilifeToken` gọi `clearOrilifeToken()` trước mỗi lần ký khi thẻ lệch
    // chủ. Nhét lệnh mở van vào trong hàm xoá thì mọi lần gọi đều đặt lại đồng hồ
    // nghỉ, và cơn bão quay lại y nguyên — im lặng, với cả bộ bài trên vẫn xanh.
    const src = doc('./orilifeDidAuth.ts');
    const fn = src.slice(
      src.indexOf('export async function clearOrilifeToken'),
      src.indexOf('export async function currentOwnerRef'),
    );
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toContain('clearOrilifeLoginCooldown');
    expect(fn).not.toContain('loginCooldownUntil');
  });
});
