import {
  decideFrameSkip,
  decideThermalThrottle,
  decideWatchPause,
  REFRESH_FAIL_COOLDOWN_MS,
  shouldAttemptRefresh,
  WATCH_PAUSE_IDLE_MS,
} from '../index';

describe('shouldAttemptRefresh (harvest fieldReidAuth cooldown 30s)', () => {
  it('trong 30s sau lỗi server → false (chống bão re-auth)', () => {
    const lastFailAtMs = 1_000_000;
    const now = lastFailAtMs + REFRESH_FAIL_COOLDOWN_MS - 1;
    expect(
      shouldAttemptRefresh({ lastFailAtMs, now, lastFailReason: 'server' }),
    ).toBe(false);
  });

  it('đúng lúc hết cửa sổ 30s → true (biên trên bao gồm)', () => {
    const lastFailAtMs = 1_000_000;
    const now = lastFailAtMs + REFRESH_FAIL_COOLDOWN_MS;
    expect(
      shouldAttemptRefresh({ lastFailAtMs, now, lastFailReason: 'server' }),
    ).toBe(true);
  });

  it('sau 30s (quá cửa sổ) → true dù lỗi session', () => {
    const lastFailAtMs = 1_000_000;
    const now = lastFailAtMs + REFRESH_FAIL_COOLDOWN_MS + 5_000;
    expect(
      shouldAttemptRefresh({ lastFailAtMs, now, lastFailReason: 'session' }),
    ).toBe(true);
  });

  it('lỗi network trong cửa sổ → false (giống server/session)', () => {
    const lastFailAtMs = 1_000_000;
    const now = lastFailAtMs + 1_000;
    expect(
      shouldAttemptRefresh({ lastFailAtMs, now, lastFailReason: 'network' }),
    ).toBe(false);
  });

  it('user tự huỷ sinh trắc → true NGAY dù mới thất bại 1ms trước (không cooldown)', () => {
    const lastFailAtMs = 1_000_000;
    const now = lastFailAtMs + 1;
    expect(
      shouldAttemptRefresh({ lastFailAtMs, now, lastFailReason: 'user-cancel' }),
    ).toBe(true);
  });

  it('lastFailAtMs=null (chưa từng thất bại) → true', () => {
    expect(
      shouldAttemptRefresh({ lastFailAtMs: null, now: 1_000_000, lastFailReason: null }),
    ).toBe(true);
  });

  it('lastFailReason=null nhưng đã có lastFailAtMs (không rõ nguyên nhân) → áp cooldown an toàn', () => {
    const lastFailAtMs = 1_000_000;
    const now = lastFailAtMs + 1_000;
    expect(
      shouldAttemptRefresh({ lastFailAtMs, now, lastFailReason: null }),
    ).toBe(false);
  });
});

describe('decideWatchPause (năng lực fix nóng máy còn thiếu — Android trước đây không có nhánh nhiệt)', () => {
  it('idle lâu + nhiệt cao (serious) + không di chuyển → pause', () => {
    expect(
      decideWatchPause({ idleMs: WATCH_PAUSE_IDLE_MS + 1_000, thermalState: 'serious', moving: false }),
    ).toBe('pause');
  });

  it('moving=true ghi đè idle lâu → active (dù nhiệt serious)', () => {
    expect(
      decideWatchPause({ idleMs: WATCH_PAUSE_IDLE_MS + 1_000, thermalState: 'serious', moving: true }),
    ).toBe('active');
  });

  it("thermal='critical' ghi đè cả moving=true → pause", () => {
    expect(
      decideWatchPause({ idleMs: 0, thermalState: 'critical', moving: true }),
    ).toBe('pause');
  });

  it('nhiệt nominal + idle lâu + không di chuyển → active (không nóng thì không cần pause)', () => {
    expect(
      decideWatchPause({ idleMs: WATCH_PAUSE_IDLE_MS + 1_000, thermalState: 'nominal', moving: false }),
    ).toBe('active');
  });

  it('nhiệt serious nhưng idle chưa đủ ngưỡng → active', () => {
    expect(
      decideWatchPause({ idleMs: WATCH_PAUSE_IDLE_MS - 1, thermalState: 'serious', moving: false }),
    ).toBe('active');
  });
});

describe('decideThermalThrottle (hợp nhất chính sách nhiệt iOS DetectionCoordinator + Android thiếu nhánh nhiệt)', () => {
  it('nominal = 1 (không throttle)', () => {
    expect(decideThermalThrottle('nominal')).toBe(1);
  });

  it('đơn điệu tăng: critical > serious > fair > nominal', () => {
    const nominal = decideThermalThrottle('nominal');
    const fair = decideThermalThrottle('fair');
    const serious = decideThermalThrottle('serious');
    const critical = decideThermalThrottle('critical');
    expect(fair).toBeGreaterThan(nominal);
    expect(serious).toBeGreaterThan(fair);
    expect(critical).toBeGreaterThan(serious);
  });

  it('critical là hệ số lớn nhất trong 4 mức', () => {
    const values = (['nominal', 'fair', 'serious', 'critical'] as const).map(decideThermalThrottle);
    expect(decideThermalThrottle('critical')).toBe(Math.max(...values));
  });
});

describe('decideFrameSkip (bổ sung tuỳ chọn — policy skip khung theo nhiệt)', () => {
  it('nominal = 0 (không bỏ khung nào)', () => {
    expect(decideFrameSkip('nominal')).toBe(0);
  });

  it('đơn điệu không giảm khi nhiệt tăng, critical bỏ nhiều khung nhất', () => {
    const values = (['nominal', 'fair', 'serious', 'critical'] as const).map(decideFrameSkip);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    expect(decideFrameSkip('critical')).toBe(Math.max(...values));
  });
});
