// features/loginNetwork/identityPresence.test.ts
//
// GHIM: nút dưới đáy màn đăng nhập phải nói đúng trạng thái THẬT của máy.
//
// ── Ca thực địa sinh ra bộ kiểm này ─────────────────────────────────────────
// Nút đó trước nay đọc một chuỗi CỐ ĐỊNH — "Đăng ký danh tính" — trên mọi máy,
// kể cả máy đã có danh tính. Người dùng thực địa đang đăng nhập bình thường vẫn
// được mời "đăng ký", và lối đó dẫn sang màn HỎI rồi rất dễ sang màn tạo mới.
// Kết cục là một DID THỨ HAI cho cùng một người: `farmService` lấy `owner_did`
// từ phiên nên danh sách vườn hiện RỖNG, mà rỗng thì trùng khớp với "tôi chưa
// ghi gì" — cái sai không kêu lên.
//
// Vòng tròn sinh trắc giữa màn thì vẫn kiểm đúng. Tức hai lối vào cùng một màn
// trả lời KHÁC NHAU về cùng một câu hỏi, và bài kiểm dưới đây ghim việc cả hai
// nay đọc chung một nguồn.
//
// ── Ca quan trọng nhất ở đây là ca CHƯA BIẾT ────────────────────────────────
// Phép đọc là bất đồng bộ, nên luôn có một quãng app chưa biết máy có gì. Nhãn
// phát ra trong quãng đó là một khẳng định phát đúng lúc chưa đo được gì. Ba ca
// `unknown` bên dưới là phần dễ bị gỡ nhất khi ai đó "đơn giản hoá" thành nhị
// phân có/không — nên chúng được viết tách, không gộp.

import { primaryCta, readIdentityPresence, routeForPresence } from './identityPresence';
import { currentUserDid, isKeypairEnrolled } from '../../sdk/phoenixKey';

jest.mock('../../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(),
  isKeypairEnrolled: jest.fn(),
}));

const didMock = currentUserDid as jest.MockedFunction<typeof currentUserDid>;
const keyMock = isKeypairEnrolled as jest.MockedFunction<typeof isKeypairEnrolled>;

const DID = 'did:phoenix:aaaaaaah3awpc:71a3e1fadae116247e380f745e5ec3821ae9b7a20';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('readIdentityPresence — ĐỦ CẢ HAI mới là có danh tính', () => {
  it('có DID và có khoá trong chip ⟹ yes', async () => {
    didMock.mockResolvedValue(DID);
    keyMock.mockResolvedValue(true);
    await expect(readIdentityPresence()).resolves.toBe('yes');
  });

  // ⛔ 2026-09-16 — HAI CA DƯỚI TRƯỚC ĐÂY CÙNG TRẢ `'no'`, VÀ ĐÓ LÀ CHỖ HỎNG.
  //
  // Bản cũ nén bốn tổ hợp của hai phép đo xuống hai chữ, nên ba tổ hợp khác hẳn
  // nhau cùng ra `'no'` và app mời cả ba đi "đăng ký". Chú thích ở đây khi ấy đã
  // ghi đúng rằng hai nửa "KHÁC nhau trên máy thật" — nhưng mã thì vẫn gộp, nên
  // câu đó tả một phân biệt không tồn tại trong mã.
  //
  // Ca `!did && hasKey` là ca CÀI LẠI APP TRÊN CHÍNH MÁY CŨ: kho khoá sống qua
  // lần gỡ, AsyncStorage thì không. Máy chủ trả lời được khoá ấy của ai
  // (`POST /identity/lookup`), nên không được hỏi người dùng.
  it('có khoá nhưng KHÔNG có DID ⟹ key-without-did, KHÔNG phải no', async () => {
    didMock.mockResolvedValue(null);
    keyMock.mockResolvedValue(true);
    await expect(readIdentityPresence()).resolves.toBe('key-without-did');
  });

  // Ca ngược lại thì app THẬT SỰ không biết: khoá có thể bị hệ điều hành huỷ
  // (vừa thêm/xoá vân tay), mà cũng có thể đây là máy khác. Không phép đo nào
  // trên máy tách được hai ca đó — nên đây là ca còn được phép hỏi.
  it('có DID nhưng KHÔNG có khoá trong chip ⟹ did-without-key', async () => {
    didMock.mockResolvedValue(DID);
    keyMock.mockResolvedValue(false);
    await expect(readIdentityPresence()).resolves.toBe('did-without-key');
  });

  // Ghim rằng bốn tổ hợp ra BỐN trạng thái. Bài này đỏ ngay khi ai đó nén lại về
  // nhị phân — thứ trông như dọn dẹp mà thực ra xoá đúng phần app đo được.
  it('bốn tổ hợp ⟹ bốn trạng thái đôi một khác nhau', async () => {
    const ra: string[] = [];
    for (const [did, key] of [[DID, true], [null, true], [DID, false], [null, false]] as const) {
      didMock.mockResolvedValue(did);
      keyMock.mockResolvedValue(key);
      ra.push(await readIdentityPresence());
    }
    expect(new Set(ra).size).toBe(4);
  });

  it('không có gì cả ⟹ no', async () => {
    didMock.mockResolvedValue(null);
    keyMock.mockResolvedValue(false);
    await expect(readIdentityPresence()).resolves.toBe('no');
  });

  // Đây là chốt chống "cái vỏ im lặng": đọc HỎNG không được biến thành một
  // khẳng định "máy chưa có danh tính". Hàm phải NÉM để nơi gọi còn phân biệt
  // được, vì đoán sai theo chiều đó đẩy người ĐÃ có tài khoản vào màn lập tài
  // khoản thứ hai.
  it('đọc hỏng thì NÉM, không nuốt thành "no"', async () => {
    didMock.mockRejectedValue(new Error('kho khoá không mở được'));
    keyMock.mockResolvedValue(true);
    await expect(readIdentityPresence()).rejects.toThrow('kho khoá không mở được');
  });
});

describe('primaryCta — ba trạng thái, ba cái nút khác nhau', () => {
  it('máy ĐÃ có danh tính ⟹ mời ĐĂNG NHẬP, và đích là mở khoá', () => {
    expect(primaryCta('yes')).toEqual({
      labelKey: 'Đăng nhập',
      icon: 'login-variant',
      disabled: false,
      action: 'unlock',
    });
  });

  // ⛔ 2026-09-16 — ba bài dưới thay bài cũ "máy CHƯA có danh tính ⟹ mời ĐĂNG KÝ,
  // và đích là màn HỎI". Bài cũ ghim đúng một hành vi, và hành vi ấy đã bị chủ
  // nhân bác: nó bắt MỌI người đi qua một câu hỏi để phục vụ một nhóm, kể cả
  // người đang có khoá nằm sẵn trong chip.
  it('máy còn khoá mà app không biết của ai ⟹ KHÔNG hỏi, đi thẳng màn Khôi phục', () => {
    const cta = primaryCta('key-without-did');
    expect(cta.action).toBe('restoreByDeviceKey');
    expect(routeForPresence('key-without-did')).toBe('RestoreIdentity');
  });

  it('máy trống trơn ⟹ lối chính là TẠO MỚI, không phải màn hỏi', () => {
    const cta = primaryCta('no');
    expect(cta.disabled).toBe(false);
    expect(cta.action).toBe('signUpNew');
    expect(routeForPresence('no')).toBe('SignUpBiometric');
  });

  // Ca duy nhất còn đi qua màn hỏi — và nó phải CÒN, không được "dọn" nốt: ở đây
  // app không phân biệt được "hệ điều hành vừa huỷ khoá" với "đây là máy khác".
  it('có DID mà mất khoá ⟹ VẪN hỏi', () => {
    expect(primaryCta('did-without-key').action).toBe('openEntryChoice');
    expect(routeForPresence('did-without-key')).toBe('IdentityEntryChoice');
  });

  // `null`, không phải một đích trông hợp lệ: hai trạng thái này không có đích.
  it('đã mở khoá được hoặc chưa đo xong ⟹ KHÔNG có đích điều hướng', () => {
    expect(routeForPresence('yes')).toBeNull();
    expect(routeForPresence('unknown')).toBeNull();
  });

  it('CHƯA BIẾT ⟹ nhãn riêng, KHÔNG mượn nhãn của hai ca kia', () => {
    const cta = primaryCta('unknown');
    expect(cta.labelKey).toBe('Đang kiểm tra máy này…');
    expect(cta.labelKey).not.toBe('Đăng nhập');
  });

  it('CHƯA BIẾT ⟹ KHÔNG bấm được', () => {
    expect(primaryCta('unknown').disabled).toBe(true);
    expect(primaryCta('unknown').action).toBe('none');
  });

  it('CHƯA BIẾT ⟹ không mũi tên: mũi tên hứa một đích mà ta chưa biết là đích nào', () => {
    expect(primaryCta('unknown').icon).toBeNull();
  });

  // Ba nhãn phải là BA chuỗi phân biệt được. Bài này đỏ nếu ai đó rút gọn hai
  // trong ba về cùng một câu — thứ trông như dọn dẹp mà thực ra xoá đúng phần
  // thông tin người dùng cần.
  it('năm nhãn đôi một khác nhau', () => {
    const labels = (
      ['yes', 'key-without-did', 'did-without-key', 'no', 'unknown'] as const
    ).map(p => primaryCta(p).labelKey);
    expect(new Set(labels).size).toBe(5);
  });
});
