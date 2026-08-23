/**
 * Test cho `fmtToken` — canh đúng cái bẫy đã làm màn ví hiện LAMP gấp 1.000.000 lần.
 * Ca quan trọng nhất là ca TRÀN SỐ: tổng cung LAMP vượt Number.MAX_SAFE_INTEGER,
 * nên phép chia bằng Number sẽ sai âm thầm — test này chốt là ta không dùng Number.
 */

import { fmtToken, fmtLamp, fmtAda, fmtCarp, hasAnyLamp, LAMP_DECIMALS, CARP_DECIMALS, fmtAdaLabel, fmtLampWhole, lampWholeToOildrop } from './token';

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

describe('fmtAdaLabel — gộp bản sao từ StakingScreen', () => {
  it('2 chữ số thập phân + ký hiệu ₳', () => {
    expect(fmtAdaLabel(1_234_567)).toBe('1.23 ₳');
    expect(fmtAdaLabel(3_000_000)).toBe('3 ₳');
  });

  it('nhóm chữ số theo en-US, giống fmtLamp/fmtCarp', () => {
    expect(fmtAdaLabel(64_123_456_789_012)).toBe('64,123,456.78 ₳');
  });

  it('thiếu số trả dấu gạch, KHÔNG trả "0 ₳"', () => {
    // Bản cũ trong StakingScreen trả '0 ₳' — tức khẳng định số dư bằng 0 trong khi
    // thật ra chưa đo được. Xem `ContributingScreen.tsx:201` cho cùng luật.
    expect(fmtAdaLabel(undefined)).toBe('—');
    expect(fmtAdaLabel(null)).toBe('—');
  });

  it('số 0 thật vẫn là 0, không thành dấu gạch', () => {
    expect(fmtAdaLabel(0)).toBe('0 ₳');
  });
});

/**
 * Hai đơn vị LAMP — khoá lại vì lỗi ở đây KHÔNG ném, KHÔNG đỏ kiểu, và con số
 * sai đi đúng một triệu lần thì trông vẫn như một con số hợp lý.
 * Ca thật đã xảy ra: màn Tài khoản đưa `initialDlamp` (LAMP nguyên) qua
 * `fmtLamp` ⇒ 1001 LAMP hiện ra "0.001001".
 */
describe('lampWholeToOildrop', () => {
  it('1001 LAMP nguyên → 1_001_000_000 oildrop', () => {
    expect(lampWholeToOildrop(1001)).toBe(1_001_000_000n);
  });

  it('0 là 0 thật, KHÔNG phải "chưa biết"', () => {
    expect(lampWholeToOildrop(0)).toBe(0n);
  });

  it('null/undefined → null, để chỗ gọi không lỡ cộng 0 vào tổng', () => {
    expect(lampWholeToOildrop(null)).toBeNull();
    expect(lampWholeToOildrop(undefined)).toBeNull();
  });

  it('NaN → null chứ không ném, và không thành 0', () => {
    expect(lampWholeToOildrop(Number.NaN)).toBeNull();
  });

  it('cộng được với số dư ví (oildrop) mà không lệch đơn vị', () => {
    const walletOildrop = 2_500_000n;              // 2,5 LAMP trong ví
    const vested = lampWholeToOildrop(3)!;         // 3 LAMP đã mở khoá
    expect(fmtToken(walletOildrop + vested, 6)).toBe('5.5');
  });
});

describe('fmtLampWhole', () => {
  it('in THẲNG số LAMP nguyên, không chia 10⁶', () => {
    expect(fmtLampWhole(1001)).toBe('1,001');
  });

  it('KHÔNG lẫn với fmtLamp — cùng đầu vào phải ra hai kết quả khác nhau', () => {
    expect(fmtLampWhole(1001)).toBe('1,001');
    expect(fmtLamp(1001)).not.toBe('1,001');
  });

  it('thiếu số trả dấu gạch, KHÔNG trả 0', () => {
    expect(fmtLampWhole(null)).toBe('—');
    expect(fmtLampWhole(undefined)).toBe('—');
  });

  it('0 thật vẫn in 0', () => {
    expect(fmtLampWhole(0)).toBe('0');
  });
});
