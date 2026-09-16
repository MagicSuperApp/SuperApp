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

import { primaryCta, readIdentityPresence } from './identityPresence';
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

  // Hai ca dưới là hai nửa của cùng một điều kiện, và chúng KHÁC nhau trên máy
  // thật: khoá còn trong chip mà DID đã mất là ca "xoá tài khoản rồi cài lại";
  // DID còn mà khoá mất là ca "gỡ app rồi cài lại" (kho khoá sống qua lần gỡ,
  // AsyncStorage thì không). Gộp hai ca thành một là bỏ mất một nửa.
  it('có khoá nhưng KHÔNG có DID ⟹ no', async () => {
    didMock.mockResolvedValue(null);
    keyMock.mockResolvedValue(true);
    await expect(readIdentityPresence()).resolves.toBe('no');
  });

  it('có DID nhưng KHÔNG có khoá trong chip ⟹ no', async () => {
    didMock.mockResolvedValue(DID);
    keyMock.mockResolvedValue(false);
    await expect(readIdentityPresence()).resolves.toBe('no');
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

  it('máy CHƯA có danh tính ⟹ mời ĐĂNG KÝ, và đích là màn HỎI', () => {
    const cta = primaryCta('no');
    expect(cta.labelKey).toBe('Đăng ký danh tính');
    expect(cta.disabled).toBe(false);
    // `openEntryChoice`, KHÔNG phải đi thẳng màn tạo mới: "đăng ký" ở đây gộp
    // ba luồng khác hẳn nhau và hai trong ba lần chọn hộ là chọn sai.
    expect(cta.action).toBe('openEntryChoice');
  });

  it('CHƯA BIẾT ⟹ nhãn riêng, KHÔNG mượn nhãn của hai ca kia', () => {
    const cta = primaryCta('unknown');
    expect(cta.labelKey).toBe('Đang kiểm tra máy này…');
    expect(cta.labelKey).not.toBe('Đăng ký danh tính');
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
  it('ba nhãn đôi một khác nhau', () => {
    const labels = (['yes', 'no', 'unknown'] as const).map(p => primaryCta(p).labelKey);
    expect(new Set(labels).size).toBe(3);
  });
});
