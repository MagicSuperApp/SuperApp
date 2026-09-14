/**
 * BA trạng thái của một mã định danh phải ra BA câu khác nhau.
 *
 * Cửa `identity.isActiveAt` trả ba trường (`active · revokedAt · neverExisted`) và
 * app gộp chúng lại thì mất đúng phần người dùng cần: "gõ sai mã" sửa được trong
 * mười giây, còn "mã đã bị thu hồi" thì gõ lại bao nhiêu lần cũng không xong.
 *
 * Mỗi ca dưới đây phân biệt được hai cực — đảo thứ tự hai dòng trong `readDidState`
 * (xét `active` trước `neverExisted`) thì ca đầu tiên đỏ ngay, vì mã chưa từng tồn
 * tại cũng mang `active: false`.
 */

import { readDidState, didStateMessageKey, describeDidState } from './didState';

const mockIsActiveAt = jest.fn();
jest.mock('../../services/phoenixKey-api', () => ({
  phoenixKeyApi: { identity: { isActiveAt: (...a: unknown[]) => mockIsActiveAt(...a) } },
}));

import { setLanguage, __resetLanguageForTest } from '../../i18n/store';

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
});

describe('readDidState', () => {
  it('chưa từng tồn tại — xét TRƯỚC `active`, vì ca này cũng có active=false', () => {
    expect(readDidState({ active: false, revokedAt: null, neverExisted: true })).toBe('neverExisted');
  });

  it('đã thu hồi', () => {
    expect(readDidState({ active: false, revokedAt: '2026-08-01T00:00:00Z', neverExisted: false }))
      .toBe('revoked');
  });

  it('đang hoạt động', () => {
    expect(readDidState({ active: true, revokedAt: null, neverExisted: false })).toBe('active');
  });

  it('ba trạng thái ra BA khoá chuỗi khác nhau', () => {
    const keys = (['neverExisted', 'revoked', 'active'] as const).map(didStateMessageKey);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('describeDidState — câu trả về nói đúng ca', () => {
  it('chưa từng đăng ký ⟹ câu bảo kiểm lại từng ký tự', async () => {
    mockIsActiveAt.mockResolvedValue({ active: false, revokedAt: null, neverExisted: true });
    await expect(describeDidState('did:phoenix:x:y')).resolves.toMatch(/chưa từng được đăng ký/i);
  });

  it('đã thu hồi ⟹ nói rõ 24 từ trên máy này KHÔNG mở lại được', async () => {
    mockIsActiveAt.mockResolvedValue({ active: false, revokedAt: '2026-08-01', neverExisted: false });
    const s = await describeDidState('did:phoenix:x:y');
    expect(s).toMatch(/thu hồi/i);
    // Cực đối: nếu hàm trả CÙNG một câu cho mọi ca thì dòng dưới đỏ.
    expect(s).not.toMatch(/chưa từng được đăng ký/i);
  });

  it('còn sống ⟹ chỉ về phía cụm 24 từ, không đổ tội cho mã', async () => {
    mockIsActiveAt.mockResolvedValue({ active: true, revokedAt: null, neverExisted: false });
    const s = await describeDidState('did:phoenix:x:y');
    expect(s).toMatch(/đang hoạt động/i);
    expect(s).not.toMatch(/thu hồi/i);
  });

  it('máy chủ hỏng ⟹ `null`, KHÔNG bịa một trạng thái', async () => {
    // Đây là chỗ dễ dựng một cái vỏ im lặng nhất: trả về "chưa từng đăng ký" cho
    // lần gọi hỏng thì màn hình trông vẫn đầy đủ, mà câu đó có thể sai hoàn toàn.
    mockIsActiveAt.mockRejectedValue(new Error('mất sóng'));
    await expect(describeDidState('did:phoenix:x:y')).resolves.toBeNull();
  });

  it('phản hồi thiếu trường ⟹ `null`, không đọc `undefined` thành `false`', async () => {
    mockIsActiveAt.mockResolvedValue({ revokedAt: null });
    await expect(describeDidState('did:phoenix:x:y')).resolves.toBeNull();
  });
});
