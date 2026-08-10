/**
 * Test cho `fmtToken` — canh đúng cái bẫy đã làm màn ví hiện LAMP gấp 1.000.000 lần.
 * Ca quan trọng nhất là ca TRÀN SỐ: tổng cung LAMP vượt Number.MAX_SAFE_INTEGER,
 * nên phép chia bằng Number sẽ sai âm thầm — test này chốt là ta không dùng Number.
 */

import { fmtToken, fmtLamp, fmtAda, fmtCarp, hasAnyLamp, LAMP_DECIMALS, CARP_DECIMALS } from './token';

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

  it('decimals 0 thì in nguyên số thô', () => {
    expect(fmtToken(12345, 0)).toBe('12,345');
  });

  it('fmtCarp đổi nanothread sang CARP — 1 CARP = 10^9 nanothread', () => {
    expect(fmtCarp(1_000_000_000)).toBe('1');
    expect(fmtCarp(2_500_000_000)).toBe('2.5');
    expect(fmtCarp(null)).toBe('—');
    // Cắt ở 4 chữ số lẻ ⟹ mọi số dư DƯỚI 10⁵ nanothread hiện thành '0'.
    // Ghi rõ ở đây vì đó là hành vi có chủ ý, không phải sót: 0,0001 CARP là
    // mức không đáng bày ra màn ví. Nhưng '0' KHÔNG có nghĩa là ví rỗng — chỗ
    // nào cần phân biệt "rỗng" với "quá nhỏ" thì phải so trên số THÔ.
    expect(fmtCarp(1)).toBe('0');
    expect(fmtCarp(99_999)).toBe('0');
    expect(fmtCarp(100_000)).toBe('0.0001');
  });

  it('CARP_DECIMALS = 9, khoá lại để không ai âm thầm đổi', () => {
    // Nguồn: CarpetMint `onchain/lib/examples/magiclamp.ak:33`
    // `sub_unit_scale = 1_000_000_000`. Đơn vị nhỏ nhất tên `nanothread`.
    expect(CARP_DECIMALS).toBe(9);
    // Bản cũ để 0 với lý do "in thô còn hơn in sai". Ở decimals 9 thì in thô
    // CHÍNH LÀ in sai — sai một tỷ lần, và sai theo hướng người dùng tưởng giàu.
    expect(fmtToken(1_000_000_000, 0)).toBe('1,000,000,000');
    expect(fmtCarp(1_000_000_000)).toBe('1');
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
