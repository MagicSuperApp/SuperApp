/**
 * Test cho `fmtToken` — canh đúng cái bẫy đã làm màn ví hiện LAMP gấp 1.000.000 lần.
 * Ca quan trọng nhất là ca TRÀN SỐ: tổng cung LAMP vượt Number.MAX_SAFE_INTEGER,
 * nên phép chia bằng Number sẽ sai âm thầm — test này chốt là ta không dùng Number.
 */

import { fmtToken, fmtLamp, fmtAda, hasAnyLamp, LAMP_DECIMALS } from './token';

describe('fmtToken', () => {
  it('đổi oildrop sang LAMP theo decimals 6', () => {
    // Bằng chứng LAMP agent lấy từ test Phoenix: lamp = 800 là 800 oildrop.
    expect(fmtLamp(800)).toBe('0.0008');
    expect(fmtLamp(1_000_000)).toBe('1');
    expect(fmtLamp(1_500_000)).toBe('1.5');
    expect(fmtLamp(0)).toBe('0');
  });

  it('KHÔNG hiện thô: 1 LAMP không được ra "1.000.000"', () => {
    expect(fmtLamp(1_000_000)).not.toBe('1,000,000');
  });

  it('giữ chính xác ở con số vượt Number.MAX_SAFE_INTEGER', () => {
    // Tổng cung 36 tỷ LAMP = 3,6e16 oildrop — vượt 9,007e15.
    const totalSupplyOildrop = '36000000000000000';
    expect(fmtToken(totalSupplyOildrop, LAMP_DECIMALS)).toBe('36,000,000,000');
    // Số lẻ 1 oildrop ngay cạnh trần: chia bằng Number sẽ mất chữ số cuối.
    expect(fmtToken('9007199254740993', 6)).toBe('9,007,199,254.740993');
  });

  it('nhận cả string và bigint (chuẩn bị cho lúc Phoenix trả chuỗi)', () => {
    expect(fmtLamp('2500000')).toBe('2.5');
    expect(fmtLamp(2_500_000n)).toBe('2.5');
  });

  it('null/undefined/rác → "—", không ném', () => {
    expect(fmtLamp(null)).toBe('—');
    expect(fmtLamp(undefined)).toBe('—');
    expect(fmtLamp('không phải số')).toBe('—');
    expect(fmtLamp(NaN)).toBe('—');
  });

  it('cắt đuôi số 0 nhưng không cắt chữ số có nghĩa', () => {
    expect(fmtLamp(1_200_000)).toBe('1.2');
    expect(fmtLamp(1_000_001)).toBe('1.000001');
  });

  it('decimals 0 thì in nguyên số thô (ca CARP chưa chốt)', () => {
    expect(fmtToken(12345, 0)).toBe('12,345');
  });

  it('số âm giữ dấu', () => {
    expect(fmtLamp(-1_500_000)).toBe('-1.5');
  });

  it('fmtAda đổi lovelace sang ADA', () => {
    expect(fmtAda(3_000_000)).toBe('3');
    expect(fmtAda(1_234_567)).toBe('1.234567');
  });
});

describe('hasAnyLamp', () => {
  it('so sánh ở đơn vị THÔ, không so với số đã chia', () => {
    // 800 oildrop là số dư có thật dù chưa tới 0,001 LAMP.
    expect(hasAnyLamp(800)).toBe(true);
    expect(hasAnyLamp(0)).toBe(false);
    expect(hasAnyLamp(null)).toBe(false);
    expect(hasAnyLamp('36000000000000000')).toBe(true);
  });
});
