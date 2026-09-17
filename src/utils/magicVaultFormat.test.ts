import {
  formatNanogicAsMagic,
  protocolEpochToPosixMs,
  expiresAtEpochToVnMoment,
  MAGIC_PROTOCOL_MS_PER_EPOCH_PREPROD,
} from './magicVaultFormat';

describe('formatNanogicAsMagic', () => {
  it('0 nanogic ⇒ "0", không phải "0."', () => {
    expect(formatNanogicAsMagic(0n)).toBe('0');
  });

  it('đúng 1 MAGIC (1e9 nanogic) ⇒ "1", không dư số 0', () => {
    expect(formatNanogicAsMagic(1_000_000_000n)).toBe('1');
  });

  it('phần thập phân giữa chừng ⇒ giữ đúng số lẻ, cắt số 0 thừa cuối', () => {
    expect(formatNanogicAsMagic(1_500_000_000n)).toBe('1.5');
  });

  it('số InstantGen thật đã đo trên chuỗi (333_333_333 nanogic ≈ 0,33 MAGIC)', () => {
    // Neo vào tx `720e1817…87f6` (thư MAGIC 2026-09-17) — cấp đúng 333_333_333 nanogic.
    expect(formatNanogicAsMagic(333_333_333n)).toBe('0.333333333');
  });

  it('KHÔNG làm tròn nổi (Number) — số vượt an toàn IEEE-754 vẫn đúng từng chữ số', () => {
    // 2^53 ≈ 9_007_199_254_740_992. Lấy một số vượt nó để lộ ngay nếu ai đổi cài đặt
    // sang `Number(nanogic) / 1e9`.
    const huge = 9_007_199_254_740_993n; // 2^53 + 1 nanogic
    expect(formatNanogicAsMagic(huge)).toBe('9007199.254740993');
  });

  it('âm (phòng hờ, không nên xảy ra với số dư thật) vẫn giữ dấu trừ đúng chỗ', () => {
    expect(formatNanogicAsMagic(-1_000_000_000n)).toBe('-1');
  });
});

describe('protocolEpochToPosixMs', () => {
  it('nhân đúng ms-mỗi-epoch, KHÔNG trừ genesis (khớp posixMsToEpoch phía máy chủ)', () => {
    expect(protocolEpochToPosixMs(20701)).toBe(20701 * MAGIC_PROTOCOL_MS_PER_EPOCH_PREPROD);
  });

  it('epoch 0 ⇒ posix 0 (mốc Unix epoch — không lùi theo genesis Cardano)', () => {
    expect(protocolEpochToPosixMs(0)).toBe(0);
  });
});

describe('expiresAtEpochToVnMoment — decay_window = 1, hết hạn 00:00 UTC = 07:00 sáng VN', () => {
  it('epoch 20701 (mẫu README VaultReadAPI) ⇒ 07:00 sáng 05/09/2026 giờ VN', () => {
    // Đối chứng bằng tay: posixMs = 20701*86_400_000 = 1789...  → UTC 2026-09-05T00:00:00Z
    // → +7h → 2026-09-05T07:00:00 giờ VN.
    expect(expiresAtEpochToVnMoment(20701)).toEqual({
      hhmm: '07:00',
      day: 5,
      month: 9,
      year: 2026,
    });
  });

  it('epoch KẾ TIẾP (20702) sang đúng NGÀY SAU — bắt lỗi lệch-một-epoch', () => {
    expect(expiresAtEpochToVnMoment(20702)).toEqual({
      hhmm: '07:00',
      day: 6,
      month: 9,
      year: 2026,
    });
  });

  it('giờ VN LUÔN là 07:00 cho một batch decay_window=1 (00:00 UTC cố định)', () => {
    // Epoch bất kỳ khác hẳn hai epoch trên — nếu công thức lỡ cộng thêm phút/giây từ
    // đâu đó, ca này bắt được còn hai ca trên (liền kề) có thể trùng may mắn.
    expect(expiresAtEpochToVnMoment(19000).hhmm).toBe('07:00');
  });
});
